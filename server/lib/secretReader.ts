import { db } from "../db/client";
import { sql } from "drizzle-orm";

export async function readSecret(projectId:string, scope:"project"|"vendor"|"integration", refId:string|null, keyName:string): Promise<string|null> {
  const { rows } = await db.execute(
    sql.raw(`select ciphertext from secrets where project_id=$1 and scope=$2 and coalesce(ref_id::text,'')=coalesce($3,'') and key_name=$4 limit 1`),
    [projectId, scope, refId, keyName] as any
  );
  if (!rows?.length) return null;
  const { decryptSecret } = await import("./crypto");
  return decryptSecret(rows[0].ciphertext);
}
