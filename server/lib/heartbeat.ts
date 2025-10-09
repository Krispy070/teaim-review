import { db } from "../db/client";
import { sql } from "drizzle-orm";

const SCHEMA_ERROR_CODES = new Set(["42P01", "42P10"]);
let loggedSchemaError = false;

function getPgErrorCode(error: any): string | undefined {
  return error?.code ?? error?.original?.code ?? error?.cause?.code;
}

function handleSchemaError(error: any): boolean {
  const code = getPgErrorCode(error);
  if (code && SCHEMA_ERROR_CODES.has(code)) {
    if (!loggedSchemaError) {
      console.warn(`[heartbeat] database not ready (${code}): ${error?.message ?? error}`);
      loggedSchemaError = true;
    }
    return true;
  }
  return false;
}

export async function beat(name: string, ok = true, note = "") {
  if (process.env.WORKERS_ENABLED === "0") {
    return;
  }
  try {
    await db.execute(
      sql`insert into worker_heartbeats (name, last_run_at, ok, note)
       values (${name}, now(), ${ok}, ${note})
       on conflict (name) do update set last_run_at=now(), ok=${ok}, note=${note}`
    );
    loggedSchemaError = false;
  } catch (error) {
    if (!handleSchemaError(error)) {
      throw error;
    }
  }
}
