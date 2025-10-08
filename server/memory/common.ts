import { db } from "../db/client";
import { sql } from "drizzle-orm";

export class MemoryError extends Error {
  status: number;
  detail?: unknown;

  constructor(message: string, status = 500, detail?: unknown) {
    super(message);
    this.name = "MemoryError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Check whether a table exists before attempting to query it. Prevents crashes
 * when the optional memory schema has not been deployed yet.
 */
export async function tableExists(table: string): Promise<boolean> {
  try {
    const { rows } = await db.execute(
      sql`select to_regclass(${`public.${table}`}) as exists`
    );
    const reg = rows?.[0]?.exists as string | null | undefined;
    return Boolean(reg);
  } catch {
    return false;
  }
}

export async function tableColumns(table: string): Promise<Set<string>> {
  try {
    const { rows } = await db.execute(
      sql`select column_name from information_schema.columns where table_schema='public' and table_name=${table}`
    );
    return new Set((rows || []).map((r: any) => String(r.column_name)));
  } catch {
    return new Set();
  }
}

export async function ensureTable(table: string, errorMessage: string): Promise<void> {
  const ok = await tableExists(table);
  if (!ok) {
    throw new MemoryError(errorMessage, 503);
  }
}

export function parseJsonField<T = any>(value: any): T | undefined {
  if (!value) return undefined;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return undefined;
  }
}

export function clampText(value: string | undefined | null, max = 120): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}
