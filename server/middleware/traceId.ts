import { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";

export function traceIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const traceId = crypto.randomBytes(8).toString("hex");
  (req as any).traceId = traceId;
  res.setHeader("x-trace-id", traceId);
  next();
}
