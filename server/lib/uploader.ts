import multer from "multer";
import { config } from "../config";

const ALLOWED = [
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
];

export function makeUploader(maxMB = config.uploadLimitMB, allowed = ALLOWED) {
  const storage = multer.memoryStorage();
  const limits = { fileSize: maxMB * 1024 * 1024, files: 1 };
  const fileFilter: multer.FileFilterCallback = (req: any, file: any, cb: any) => {
    const ok = allowed.includes(file.mimetype) || /\.(csv|xls|xlsx)$/i.test(file.originalname || "");
    if (!ok) return cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "file"));
    cb(null, true);
  };
  return multer({ storage, limits, fileFilter });
}
