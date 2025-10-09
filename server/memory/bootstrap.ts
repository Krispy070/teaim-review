import { pool } from "../db/client";

let extensionEnsured = false;
let vectorReady = false;
let warnedMissing = false;

function vectorUnavailableError(cause?: unknown): Error {
  const err = new Error("pgvector extension unavailable");
  (err as any).status = 503;
  if (cause !== undefined) {
    (err as any).cause = cause;
  }
  return err;
}

export function isVectorAvailable(): boolean {
  return vectorReady;
}

export async function ensureMemoryExtension(): Promise<void> {
  if (extensionEnsured) {
    return;
  }

  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
    vectorReady = true;
    extensionEnsured = true;
  } catch (error) {
    vectorReady = false;
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn(
        "[memory] pgvector extension unavailable; memory endpoints will return 503 until installed.",
        error
      );
    }
    throw vectorUnavailableError(error);
  }
}

export async function bootstrapMemory(): Promise<void> {
  await ensureMemoryExtension();
}
