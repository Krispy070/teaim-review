import type { Request, Response, NextFunction } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

export async function requestTimer(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on("finish", async () => {
    try {
      if (!req.path.startsWith("/api")) return;
      const dur = Date.now() - start;
      await db.execute(
        sql`insert into request_metrics (route, method, status, dur_ms) values (${req.path.slice(0,240)}, ${req.method}, ${res.statusCode}, ${dur})`
      );
    } catch {
      // swallow
    }
  });
  next();
}
