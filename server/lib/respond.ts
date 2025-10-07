import type { Response } from "express";

export function ok<T extends object>(res: Response, body: T) {
  res.status(200).json({ ok: true, ...body });
}

export function badRequest(res: Response, message = "bad_request") {
  res.status(400).json({ error: message });
}

export function forbidden(res: Response, message = "forbidden") {
  res.status(403).json({ error: message });
}

export function notFoundRes(res: Response, message = "not_found") {
  res.status(404).json({ error: message });
}
