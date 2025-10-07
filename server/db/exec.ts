import { db } from "./client";

export async function exec<T = any>(
  sql: string,
  params: any[] = [],
  timeoutMs = 12_000,
  label = "sql"
): Promise<{ rows: T[]; rowCount?: number }> {
  const started = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await db.execute(sql as any, params as any);
    const ms = Date.now() - started;
    if (ms > 500) console.warn(`[slow] ${label} • ${ms}ms`);
    return { rows: r.rows || [], rowCount: r.rowCount };
  } catch (e: any) {
    const ms = Date.now() - started;
    console.error(`[db] ${label} • ${ms}ms • ${e?.message || e}`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}
