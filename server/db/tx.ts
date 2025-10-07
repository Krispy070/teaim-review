import { db } from "./client";

export async function withTx<T>(fn: (tx: typeof db) => Promise<T>): Promise<T> {
  return await db.transaction(async (tx) => {
    return await fn(tx);
  });
}
