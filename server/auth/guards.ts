import type { Request, Response, NextFunction } from "express";

export function pickupProjectId(req: Request): string | null {
  const q = (req.query.projectId as string) || "";
  const b = (req.body && (req.body.projectId as string)) || "";
  const p = (req.params && (req.params.projectId as string)) || "";
  const id = q || b || p || "";
  return id ? String(id) : null;
}

export function requireProjectId() {
  return (req: Request, res: Response, next: NextFunction) => {
    const pid = pickupProjectId(req);
    if (!pid) return res.status(400).json({ error: "projectId required" });
    (req.query as any).projectId = pid;
    next();
  };
}

export function validateEnum<T extends string>(val: any, allowed: readonly T[], field = "value") {
  const ok = typeof val === "string" && (allowed as readonly string[]).includes(val);
  return ok ? null : `${field} must be one of: ${allowed.join(", ")}`;
}

export function ensureUUIDParam(paramName: string) {
  const rx = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return (req: any, res: any, next: any) => {
    const v = String((req.params && req.params[paramName]) || "");
    if (!rx.test(v)) return res.status(400).json({ error: `${paramName} must be UUID` });
    next();
  };
}
