import type { Request, Response, NextFunction } from "express";

type KeyFn = (req: Request) => string;

export function rateLimit(opts?: {
  windowMs?: number; max?: number; keyFn?: KeyFn; methods?: string[];
}) {
  const windowMs = opts?.windowMs ?? 60_000;
  const max      = opts?.max ?? 120; // 120 writes/min/IP
  const methods  = (opts?.methods ?? ["POST","PUT","PATCH","DELETE"]).map(m=>m.toUpperCase());
  const keyFn: KeyFn = opts?.keyFn ?? ((req) => {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "ip?";
    const route = req.path.replace(/\d+/g,"{id}");
    return `${ip}:${route}`;
  });

  const buckets = new Map<string, { count: number; ts: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    if (!methods.includes(req.method.toUpperCase())) return next();

    const now = Date.now();
    const key = keyFn(req);
    const b = buckets.get(key) || { count: 0, ts: now };
    if (now - b.ts > windowMs) { b.count = 0; b.ts = now; }  // reset window
    b.count++; buckets.set(key, b);

    if (b.count > max) {
      const retry = Math.ceil((b.ts + windowMs - now) / 1000);
      res.setHeader("Retry-After", String(retry));
      return res.status(429).json({ error: "rate_limited", retryAfter: retry });
    }
    next();
  };
}
