import { Router } from "express";
import multer from "multer";

export const mock = Router();
const upload = multer();

function statusFromQuery(q: any) {
  const mode = String(q.mode || "ok").toLowerCase();
  if (mode === "bad") return 400;
  if (mode === "unauth") return 401;
  if (mode === "forbid") return 403;
  if (mode === "throttle" || mode === "429") return 429;
  return 200;
}

mock.all("/receiver", upload.any(), async (req: any, res) => {
  if (process.env.ADAPTER_SANDBOX !== "on")
    return res.status(403).json({ error: "sandbox disabled" });

  const code = statusFromQuery(req.query);
  const isMultipart = !!req.files?.length;
  const bodyText =
    typeof req.body === "string"
      ? req.body
      : req.headers["content-type"]?.includes("application/json")
      ? JSON.stringify(req.body)
      : isMultipart
      ? "(multipart)"
      : String(req.body || "");

  const files =
    (req.files as Express.Multer.File[])?.map((f) => ({
      field: f.fieldname,
      filename: f.originalname,
      size: f.size,
      contentType: f.mimetype,
    })) || [];

  res.status(code).json({
    ok: code === 200,
    method: req.method,
    query: req.query,
    headers: {
      "content-type": req.headers["content-type"],
      "authorization": req.headers["authorization"],
      "user-agent": req.headers["user-agent"],
    },
    bodyLength: bodyText?.length || 0,
    files,
  });
});
