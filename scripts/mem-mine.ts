/**
 * Memory Miner Script
 * ---------------------------------------------
 * Extracts signals and lessons from memory_items nightly.
 * Can be invoked manually or via GitHub Action.
 *
 * Usage:
 *   pnpm mem:mine
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";
import dotenv from "dotenv";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not set. Exiting.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
const db = drizzle(client);

(async () => {
  try {
    await client.connect();
    console.log("🧠 Memory Miner started...");

    // 1️⃣ Identify recent memory_items
    const { rows: recent } = await client.query(sql`
      SELECT id, project_id, content, created_at
      FROM memory_items
      WHERE created_at > NOW() - interval '2 days'
      ORDER BY created_at DESC
      LIMIT 250
    ` as any);

    if (recent.length === 0) {
      console.log("No recent memory items to mine.");
      process.exit(0);
    }

    console.log(`Mining ${recent.length} recent items...`);

    // 2️⃣ Perform lightweight text analysis (categorization)
    for (const item of recent) {
      const text = item.content.toLowerCase();

      let signal = "neutral";
      if (text.includes("risk") || text.includes("blocker")) signal = "risk";
      else if (text.includes("win") || text.includes("delivered")) signal = "success";
      else if (text.includes("bug") || text.includes("error")) signal = "issue";

      await client.query(sql`
        INSERT INTO memory_signals (memory_id, project_id, kind, details)
        VALUES (${item.id}, ${item.project_id}, ${signal}, ${item.content})
        ON CONFLICT (memory_id) DO NOTHING;
      ` as any);
    }

    console.log("✅ Memory signals mined successfully.");

    // 3️⃣ Aggregate lessons learned (example heuristic)
    const { rows: lessons } = await client.query(sql`
      INSERT INTO lessons_learned (title, summary, created_at)
      SELECT
        'Weekly Summary',
        CONCAT('Analyzed ', COUNT(*), ' memory items this run.'),
        NOW()
      FROM memory_items
      WHERE created_at > NOW() - interval '2 days'
      RETURNING *;
    ` as any);

    console.log(`📘 Lessons updated (${lessons.length} entries).`);
  } catch (err: any) {
    console.error("❌ Miner failed:", err.message);
  } finally {
    await client.end();
    console.log("⏹ Miner complete.");
  }
})();
