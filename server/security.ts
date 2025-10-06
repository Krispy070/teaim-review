import type { Request, Response, NextFunction } from "express";
import { env } from "./env";

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  const isPreview = req.path.startsWith("/api/docs/preview");
  
  res.setHeader("X-Frame-Options", isPreview ? "SAMEORIGIN" : "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src 'self' http://127.0.0.1:${env.FASTAPI_PORT} ws://localhost:5173 ws://0.0.0.0:5173 ${supabaseUrl}`,
    "font-src 'self' data:",
    `frame-ancestors ${isPreview ? "'self'" : "'none'"}`
  ].join("; ");
  
  res.setHeader("Content-Security-Policy", csp);
  next();
}
