import type { Request, Response, NextFunction } from "express";
import multer from "multer";

export function badJsonHandler(err: any, _req: Request, res: Response, next: NextFunction) {
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "invalid_json" });
  }
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ error: "payload_too_large" });
  }
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "file_too_large" });
    return res.status(400).json({ error: `upload_error:${err.code}` });
  }
  next(err);
}
