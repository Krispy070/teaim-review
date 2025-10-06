import { db } from "../db/client";
import { sql } from "drizzle-orm";

export async function beat(name: string, ok = true, note = "") {
  await db.execute(
    sql`insert into worker_heartbeats (name, last_run_at, ok, note)
     values (${name}, now(), ${ok}, ${note})
     on conflict (name) do update set last_run_at=now(), ok=${ok}, note=${note}`
  );
}
