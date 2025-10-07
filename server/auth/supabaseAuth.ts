import type { Request, Response, NextFunction } from "express";
import { env } from "../env";
import { jwtVerify } from "jose";
import * as cookie from "cookie";

export type SupaUser = {
  sub: string;
  email?: string;
  role?: string; // "authenticated" | "anon"
  // Your custom claim (optional): app_metadata.user_role
  app_metadata?: Record<string, any>;
  [k: string]: any;
};

function getBearer(req: Request): string | null {
  const h = req.headers["authorization"];
  if (typeof h === "string" && h.startsWith("Bearer ")) return h.slice(7);
  // Fallback: cookie set by supabase-js (if you decide to do that)
  const raw = req.headers.cookie;
  if (raw) {
    const jar = cookie.parse(raw);
    if (jar["sb-access-token"]) return jar["sb-access-token"];
    if (jar["access_token"]) return jar["access_token"];
  }
  return null;
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const open = [
    /^\/api\/health$/,
    /^\/api\/healthz$/,
    /^\/api\/readyz$/,
    /^\/api\/health\/python$/,
    /^\/api\/dev\//,
    /^\/assets\//,
    /^\/@vite/,
    /^\/$/,
    /^\/login/,
    /^\/signup/,
  ];
  const path = req.path;
  if (open.some(rx => rx.test(path))) return next();

  // In development mode with DEV_AUTH, bypass JWT verification
  if (process.env.DEV_AUTH === '1' && env.NODE_ENV === 'development') {
    const devUser: SupaUser = {
      sub: req.headers['x-dev-user'] as string || '12345678-1234-1234-1234-123456789abc',
      email: 'dev@example.com',
      role: 'authenticated',
      app_metadata: {
        user_role: req.headers['x-dev-role'] as string || 'admin'
      }
    };
    (req as any).user = devUser;
    return next();
  }

  const token = getBearer(req);
  if (!token) {
    // Not logged in; mark as guest for public pages
    (req as any).user = null;
    return next();
  }

  // Skip JWT verification if SUPABASE_JWT_SECRET is not configured
  if (!env.SUPABASE_JWT_SECRET) {
    console.warn("⚠️  JWT verification skipped - SUPABASE_JWT_SECRET not configured");
    (req as any).user = null;
    return next();
  }

  try {
    const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    (req as any).user = payload as SupaUser;
  } catch (e) {
    // Invalid token → treat as unauthenticated
    (req as any).user = null;
  }
  next();
}

export function requireRole(required: "admin" | "member" | "viewer" | "any" = "any") {
  return (req: Request, res: Response, next: NextFunction) => {
    // In development mode with DEV_AUTH, use dev headers
    if (process.env.DEV_AUTH === '1' && env.NODE_ENV === 'development') {
      const devRole = req.headers['x-dev-role'] as string || 'admin';
      if (required === "any") return next();
      
      const rank = { viewer: 1, member: 2, admin: 3 } as const;
      const have = rank[(devRole as keyof typeof rank) || "member"] || 2;
      const need = rank[required];
      
      if (have < need) {
        return res.status(403).json({ error: "forbidden", have: devRole, need: required });
      }
      return next();
    }

    const user = (req as any).user as SupaUser | null;
    if (!user) return res.status(401).json({ error: "unauthorized" });

    // Pull your app role from a custom claim; adjust to your schema.
    // Example: app_metadata.user_role is set when user is provisioned.
    const appRole =
      (user.app_metadata?.user_role as string | undefined) ||
      (user as any)["user_role"] ||
      "member";

    if (required === "any") return next();
    const rank = { viewer: 1, member: 2, admin: 3 } as const;
    const have = rank[(appRole as keyof typeof rank) || "member"] || 2;
    const need = rank[required];

    if (have < need) {
      return res.status(403).json({ error: "forbidden", have: appRole, need: required });
    }
    next();
  };
}
