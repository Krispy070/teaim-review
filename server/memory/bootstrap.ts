import { pool } from "../db/client";

let extensionEnsured = false;

export async function ensureMemoryExtension(): Promise<void> {
  if (extensionEnsured) {
    return;
  }

  await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
  extensionEnsured = true;
}

export async function bootstrapMemory(): Promise<void> {
  await ensureMemoryExtension();
}
