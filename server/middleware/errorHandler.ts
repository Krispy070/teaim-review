import type { Request, Response, NextFunction } from "express";

export function asyncHandler<T extends (...args: any[]) => Promise<any>>(fn: T) {
  return function (req: Request, res: Response, next: NextFunction) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "not_found" });
}

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const code = typeof err?.status === "number" ? err.status : 500;
  const rid = (req as any).requestId || "";
  const message = typeof err?.message === "string" ? err.message : "internal_error";
  // be conservative about logging payloads
  console.error("[err]", { code, rid, message, path: req.path });
  res.status(code).json({ error: message, requestId: rid });
}
