import { db } from "../db";
import { embedJobs, docs, docChunks } from "../../shared/schema";
import { eq, sql } from "drizzle-orm";
import { chunkText, generateEmbeddings } from "../lib/embed";
import { handleWorkerError, workersDisabled } from "./utils";

const POLL_MS = Number(process.env.EMBED_POLL_MS || 5000);
const MAX_ATTEMPTS = 3;

async function beat(name: string, info: any = {}) {
  if (workersDisabled()) {
    return;
  }
  try {
    const infoJson = JSON.stringify(info);
    await db.execute(sql`
      INSERT INTO worker_heartbeat (worker, info, updated_at)
      VALUES (${name}, ${infoJson}::jsonb, now())
      ON CONFLICT (worker) DO UPDATE SET info=${infoJson}::jsonb, updated_at=now()
    `);
  } catch (error) {
    handleWorkerError("embedWorker", error);
  }
}

interface Job {
  id: string;
  docId: string;
  projectId: string;
}

async function nextJob(): Promise<Job | null> {
  try {
    // Use SELECT FOR UPDATE SKIP LOCKED to grab a job atomically
    const result = await db.execute(sql`
      WITH next_job AS (
        SELECT id, doc_id, project_id
        FROM embed_jobs
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE embed_jobs
      SET status = 'running', attempts = attempts + 1, updated_at = NOW()
      FROM next_job
      WHERE embed_jobs.id = next_job.id
      RETURNING embed_jobs.id, embed_jobs.doc_id as "docId", embed_jobs.project_id as "projectId"
    `);
    
    const rows = (result as any).rows || result;
    return rows.length > 0 ? rows[0] : null;
  } catch (err: any) {
    handleWorkerError("embedWorker", err);
    return null;
  }
}

async function processJob(job: Job) {
  // Load doc text
  const docResults = await db.select({
    id: docs.id,
    projectId: docs.projectId,
    fullText: docs.fullText
  })
    .from(docs)
    .where(eq(docs.id, job.docId))
    .limit(1);

  if (docResults.length === 0) {
    throw new Error("doc not found");
  }

  const doc = docResults[0];
  const text = doc.fullText || "";
  
  if (!text || text.trim().length === 0) {
    // No text to embed, mark as done
    await db.update(embedJobs)
      .set({ status: "done", updatedAt: new Date() })
      .where(eq(embedJobs.id, job.id));
    return;
  }

  const { chunks } = chunkText(text, 1000, 200);
  
  if (chunks.length === 0) {
    await db.update(embedJobs)
      .set({ status: "done", updatedAt: new Date() })
      .where(eq(embedJobs.id, job.id));
    return;
  }

  // Generate embeddings
  const vecs = await generateEmbeddings(chunks);

  // Insert chunks with pgvector embeddings
  for (let i = 0; i < chunks.length; i++) {
    const vec = vecs[i];
    const vecLiteral = `[${vec.join(',')}]`;
    
    await db.execute(sql`
      INSERT INTO doc_chunks (doc_id, project_id, chunk_index, chunk, embedding_vec)
      VALUES (${job.docId}, ${job.projectId}, ${i}, ${chunks[i]}, ${vecLiteral}::vector)
    `);
  }

  // Mark job as done
  await db.update(embedJobs)
    .set({ status: "done", updatedAt: new Date() })
    .where(eq(embedJobs.id, job.id));

  // Mark document as indexed
  await db.execute(sql`
    UPDATE docs SET indexed_at = NOW() WHERE id = ${job.docId}
  `);

  console.log(`[embedWorker] Processed job ${job.id}: ${chunks.length} chunks embedded`);
}

export async function startEmbedWorker() {
  if (workersDisabled()) {
    console.log("[embedWorker] disabled (WORKERS_ENABLED=0)");
    return;
  }
  if (process.env.EMBED_WORKER === "0") {
    console.log("[embedWorker] disabled (EMBED_WORKER=0)");
    return;
  }

  console.log(`[embedWorker] starting with ${POLL_MS}ms poll interval`);

  async function tick() {
    if (workersDisabled()) {
      return;
    }
    try {
      const job = await nextJob();
      if (!job) {
        const countResult: any = await db.execute(sql`select count(*)::int as n from embed_jobs where status='pending'`);
        const pending = (countResult.rows || countResult)?.[0]?.n || 0;
        await beat("embed", { pending });
        return;
      }

      console.log(`[embedWorker] Processing job ${job.id} for doc ${job.docId}`);

      try {
        await processJob(job);
      } catch (err: any) {
        if (handleWorkerError("embedWorker", err)) {
          return;
        }

        // Update job with error, mark as failed if max attempts reached
        const updateResult = await db.execute(sql`
          UPDATE embed_jobs
          SET
            status = CASE WHEN attempts >= ${MAX_ATTEMPTS} THEN 'failed' ELSE 'pending' END,
            last_error = ${String(err?.message || err)},
            updated_at = NOW()
          WHERE id = ${job.id}
        `);
        
        console.log(`[embedWorker] Job ${job.id} status updated after failure`);
      }

      const countResult: any = await db.execute(sql`select count(*)::int as n from embed_jobs where status='pending'`);
      const pending = (countResult.rows || countResult)?.[0]?.n || 0;
      await beat("embed", { pending });
    } catch (err: any) {
      if (handleWorkerError("embedWorker", err)) {
        return;
      }
    }
  }

  // Run first tick immediately
  void tick();
  
  // Then poll at intervals
  setInterval(tick, POLL_MS);
}
