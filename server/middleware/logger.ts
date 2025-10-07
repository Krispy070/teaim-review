import type { Request, Response, NextFunction } from "express";

export function requestLogger(opts?: { sample?: number; skipPaths?: RegExp[] }) {
  const sample = Math.max(0, Math.min(1, opts?.sample ?? 1)); // 1 = log all
  const skipPaths = opts?.skipPaths ?? [/^\/api\/healthz$/, /^\/api\/readyz$/];

  return (req: Request, res: Response, next: NextFunction) => {
    if (skipPaths.some(rx => rx.test(req.path))) return next();

    const s = Math.random() <= sample;
    if (!s) return next();

    const start = Date.now();
    const rid = (req as any).requestId || "";
    const { method, path } = req;

    res.on("finish", () => {
      const ms = Date.now() - start;
      const status = res.statusCode;
      // keep it small and safe; don't dump bodies
      console.log(`[req] ${status} ${method} ${path} • ${ms}ms${rid ? " • " + rid : ""}`);
    });

    next();
  };
}
