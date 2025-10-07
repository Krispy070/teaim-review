import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";

/** Content Security Policy (helmet-lite) */
export function contentSecurityPolicy(appOrigins: string[] = []) {
  const self = "'self'";
  const origins = Array.from(new Set([self, ...appOrigins]));
  const csp =
    `default-src ${origins.join(" ")}; ` +
    `script-src ${origins.join(" ")} 'unsafe-inline'; ` +
    `style-src ${origins.join(" ")} 'unsafe-inline'; ` +
    `img-src ${origins.join(" ")} data: blob:; ` +
    `font-src ${origins.join(" ")} data:; ` +
    `connect-src ${origins.join(" ")}; ` +
    `frame-ancestors 'self'; ` +
    `base-uri 'self'; form-action 'self';`;

  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Content-Security-Policy", csp);
    next();
  };
}

/** Refined CORS: exact allow-list, sensible defaults */
export function allowCors(origins: string[] = []) {
  const allow = new Set(origins.map(o => o.toLowerCase()));
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = String(req.headers.origin || "").toLowerCase();
    if (!allow.size || allow.has(origin)) {
      res.header("Access-Control-Allow-Origin", origin || "*");
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-request-id");
      res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    }
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
  };
}

/** Basic security headers (subset of helmet without deps) */
export function basicSecurityHeaders() {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "no-referrer-when-downgrade");
    res.setHeader("X-XSS-Protection", "0");
    next();
  };
}

/** x-request-id middleware (uses crypto.randomUUID) */
export function requestId() {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    (req as any).requestId = id;
    res.setHeader("x-request-id", id);
    next();
  };
}
