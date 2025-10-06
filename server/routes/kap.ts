import { Router } from "express";
import { requireRole } from "../auth/supabaseAuth";
import { assertProjectAccess } from "../auth/projectAccess";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { generateEmbeddings } from "../lib/embed";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export const kap = Router();

kap.post("/chat", requireRole("member"), async (req, res, next) => {
  try {
    const { projectId, message, history } = req.body || {};
    if (!projectId || !message) return res.status(400).json({ error: "projectId and message required" });
    
    console.log(`[KAP] Query: "${message}" for project: ${projectId}`);
    
    // Verify user has access to this project
    await assertProjectAccess(req, projectId, "member");

    // 1) embed query + retrieve chunks (pgvector)
    const [qvec] = await generateEmbeddings([message]);
    const vecLiteral = "[" + qvec.join(",") + "]";
    const result: any = await db.execute(sql`
      SELECT dc.id as "chunkId", dc.chunk_index as "chunkIndex",
             dc.doc_id as "docId", d.name as "docName", dc.chunk,
             (1 - (embedding_vec <=> ${vecLiteral}::vector)) as score
      FROM doc_chunks dc
      JOIN docs d ON d.id = dc.doc_id
      WHERE dc.project_id = ${projectId} AND dc.embedding_vec IS NOT NULL
      ORDER BY dc.embedding_vec <=> ${vecLiteral}::vector
      LIMIT 8
    `);

    const hits = result.rows || result;
    console.log(`[KAP] Found ${hits.length} chunks, top scores:`, hits.slice(0, 3).map((h: any) => ({ doc: h.docName, score: h.score.toFixed(3) })));
    const context = hits.map((h: any, i: number) =>
      `# Source ${i+1} | doc:${h.docName} (${h.docId})
Score:${h.score.toFixed(3)}
${h.chunk}`
    ).join("\n\n");

    const sys = `You are Kap, a sharp project copilot. Answer using the provided sources only. 
Cite as [docId:#] for each claim. If unknown, say you lack evidence. Be concise.`;

    const msgs = [
      { role: "system" as const, content: sys },
      ...(Array.isArray(history) ? history.slice(-6) : []),
      { role: "user" as const, content: `User question:\n${message}\n\n---\nContext:\n${context}` }
    ];

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: msgs
    });

    const reply = resp.choices[0]?.message?.content || "…";
    res.json({ 
      ok: true, 
      answer: reply, 
      sources: hits.map((h:any)=>({
        docId: h.docId, 
        docName: h.docName, 
        score: h.score, 
        chunkId: h.chunkId, 
        chunkIndex: h.chunkIndex
      })) 
    });
  } catch (e) { next(e); }
});
