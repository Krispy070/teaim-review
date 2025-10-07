import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { createProxyMiddleware } from "http-proxy-middleware";
import multer from "multer";
import FormData from "form-data";
import fetch from "node-fetch";
import archiver from "archiver";
import fs from "fs";
import { SignJWT, jwtVerify } from "jose";
import { testAdminRouter } from "./admin/test";
import testsRoutes from "./tests.routes";
import kapmemRoutes from "./kapmem.routes";
import { testStubsRouter } from "./test-stubs.routes";
import { notif } from "./routes/notifications";
import { releases } from "./routes/releases";
import { rbulk } from "./routes/releases_tests_bulk";
import { dev } from "./routes/dev";
import { insights } from "./routes/insights";
import { kap } from "./routes/kap";
import { projectMembersRouter } from "./routes/projectMembers";
import { actionsApi } from "./routes/actions";
import { docsApi } from "./routes/docs";
import { projects } from "./routes/projects";
import { dashboard } from "./routes/dashboard";
import { exportsApi } from "./routes/exports";
import { docsPreview } from "./routes/docs_preview";
import { mywork } from "./routes/mywork";
import { etl } from "./routes/health_etl";
import { psettings } from "./routes/project_settings";
import { inbound } from "./routes/inbound_email";
import { retention } from "./routes/retention";
import { seed } from "./routes/project_seed";
import { ma } from "./routes/ma";
import { maGrid } from "./routes/ma_integrations_grid";
import { cadApi } from "./routes/ma_cadences";
import { inboundVerify } from "./routes/inbound_verify";
import { riskExports } from "./routes/ma_risk_exports";
import { training } from "./routes/training";
import { trainingBulk } from "./routes/training_bulk";
import { wizard } from "./routes/project_wizard";
import { pexport } from "./routes/project_export";
import { audit } from "./routes/audit";
import { ops } from "./routes/ops";
import { opsLogs } from "./routes/ops_logs";
import { sso } from "./routes/sso";
import { keys } from "./routes/api_keys";
import { pub } from "./routes/public";
import { projManage } from "./routes/projects_manage";
import { pexportJson } from "./routes/project_export_json";
import { pimportJson } from "./routes/project_import_json";
import { pexportFull } from "./routes/project_export_full";
import { prestoreFull } from "./routes/project_restore_full";
import { tnt } from "./routes/tenants";
import { issues } from "./routes/integration_issues";
import { tdiff } from "./routes/tenants_diff";
import { tsnap } from "./routes/tenants_snapshots";
import { alerts } from "./routes/alerts";
import { ausers } from "./routes/alert_users";
import { specs } from "./routes/integration_specs";
import { runs } from "./routes/integration_runs";
import { vault } from "./routes/secrets";
import { wh } from "./routes/webhooks";
import { runArt } from "./routes/integration_run_artifacts";
import { gsearch } from "./routes/search_global";
import quickSearch from "./routes/search_quick";
import briefs from "./routes/briefs";
import cal from "./routes/calendar";
import { tix } from "./routes/tickets";
import { snow } from "./routes/servicenow";
import { mins } from "./routes/meeting_insights";
import { tmb } from "./routes/ticket_mailbox";
import { trep } from "./routes/ticket_reply";
import { tsla } from "./routes/ticket_sla";
import { tthread } from "./routes/ticket_thread";
import { tatt } from "./routes/ticket_attachments";
import { slack } from "./routes/slack";
import { teams } from "./routes/teams";
import { clip } from "./routes/clip";
import conv from "./routes/conversations";
import { convBulk } from "./routes/conversations_bulk";
import { convSettings } from "./routes/conversations_settings";
import { toauth } from "./routes/teams_oauth";
import { tgraph } from "./routes/teams_graph_clip";
import origin from "./routes/insight_origin";
import docx from "./routes/docs_insights";
import tl from "./routes/timeline_insights";
import lineageAdmin from "./routes/admin_lineage";
import rx from "./routes/risks_insights";
import dc from "./routes/decisions_insights";
import roadmap from "./routes/roadmap";
import rimp from "./routes/roadmap_import";
import plan from "./routes/plan";
import ps from "./routes/plan_schedule";
import psync from "./routes/plan_sync";
import onb from "./routes/onboarding";
import od from "./routes/onboarding_digest";
import odpost from "./routes/onboarding_digest_post";
import op from "./routes/onboarding_push";
import opl from "./routes/onboarding_push_list";
import relMgr from "./routes/releaseManager";
import msg from "./routes/messaging";
import maCohorts from "./routes/ma_cohorts";
import tlib from "./routes/templates";
import announcements from "./routes/announcements";
import sdetail from "./routes/ma_separation_detail";
import mpost from "./routes/ma_checklist_post";
import off from "./routes/ma_offboarding";
import pp from "./routes/plan_prefs";
import pcounts from "./routes/plan_counts";
import pbf from "./routes/plan_bulk_filter";
import pexp from "./routes/plan_export_view";
import emailAdmin from "./routes/email_admin";
import mailgunWH from "./routes/email_webhooks";
import et from "./routes/email_trend";
import etc from "./routes/email_trend_category";
import esmtp from "./routes/email_smtp_health";
import eas from "./routes/email_app_settings";
import etest from "./routes/email_test_send";
import me from "./routes/me";
import pbump from "./routes/plan_bump";
import workersHealth from "./routes/workers_health";
import risksList from "./routes/risks_list";
import decisionsList from "./routes/decisions_list";
import { requireRole } from "./auth/supabaseAuth";
import { requireProject } from "./auth/projectAccess";
import { db } from "./db/client";
import { docs, docChunks, notifications, embedJobs, parseJobs } from "../shared/schema";
import { eq, sql, or, isNull, inArray } from "drizzle-orm";
import { chunkText, generateEmbeddings } from "./lib/embed";
import { extractKeywords, summarize } from "./lib/text";

export async function registerRoutes(app: Express): Promise<Server> {
  // Secret for signing file access tokens (in production, use secure env var)
  const FILE_TOKEN_SECRET = new TextEncoder().encode(
    process.env.FILE_TOKEN_SECRET || 'dev-file-token-secret-change-in-production'
  );

  // Helper to generate file access token
  const generateFileToken = async (fileId: string, projectId: string): Promise<string> => {
    return await new SignJWT({ fileId, projectId })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .setIssuedAt()
      .sign(FILE_TOKEN_SECRET);
  };

  // Helper to verify file access token
  const verifyFileToken = async (token: string): Promise<{ fileId: string; projectId: string } | null> => {
    try {
      const { payload } = await jwtVerify(token, FILE_TOKEN_SECRET);
      if (payload.fileId && payload.projectId) {
        return { fileId: payload.fileId as string, projectId: payload.projectId as string };
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  // Parse JSON bodies with 10MB limit
  app.use(express.json({ limit: '10mb' }));
  
  // Mount test admin router (admin only)
  app.use("/admin/test", requireRole("admin"), testAdminRouter);
  
  // Mount test and kapmem routes (before catch-all /api/*)
  app.use("/", pub);
  app.use("/api/projects", projManage);
  app.use("/api/tests", requireRole("admin"), testsRoutes);
  app.use("/api/kapmem", kapmemRoutes);
  app.use("/api/notifications", requireProject("member"), notif);
  app.use("/api/releases", requireProject("member"), releases);
  app.use("/api/releases", requireProject("member"), rbulk);
  app.use("/api/me", requireRole("member"), me);
  app.use("/api/dev", dev);
  app.use("/api/insights", requireProject("member"), insights);
  app.use("/api/kap", requireProject("member"), kap);
  app.use("/api/project-members", projectMembersRouter);
  app.use("/api/projects", projects);
  app.use("/api/actions", actionsApi);
  app.use("/api/docs", docsApi);
  app.use("/api/docs", docsPreview);
  app.use("/api/exports", exportsApi);
  app.use("/api/mywork", mywork);
  app.use("/api/dashboard", requireProject("member"), dashboard);
  app.use("/api/health", etl);
  app.use("/api/project-settings", psettings);
  app.use("/api/inbound", inbound);
  app.use("/api/inbound", inboundVerify);
  app.use("/api/retention", retention);
  app.use("/api/projects/seed", seed);
  app.use("/api/ma", ma);
  app.use("/api/ma/integrations", maGrid);
  app.use("/api/ma/cadences", cadApi);
  app.use("/api/training", training);
  app.use("/api/training", trainingBulk);
  app.use("/api/ma/risks", riskExports);
  app.use("/api/projects/wizard", wizard);
  app.use("/api/projects", pexport);
  app.use("/api/projects", pexportJson);
  app.use("/api/projects", pimportJson);
  app.use("/api/projects", pexportFull);
  app.use("/api/projects", prestoreFull);
  app.use("/api/audit", audit);
  app.use("/api/ops", ops);
  app.use("/api/ops", opsLogs);
  app.use("/api/workers", workersHealth);
  app.use("/api/org/sso", sso);
  app.use("/api/keys", keys);
  app.use("/api/tenants", tnt);
  app.use("/api/ma/issues", issues);
  app.use("/api/tenants/diff", tdiff);
  app.use("/api/tenants/snapshots", tsnap);
  app.use("/api/alerts", alerts);
  app.use("/api/alert-users", ausers);
  app.use("/api/ma/integrations/specs", specs);
  app.use("/api/ma/runs", runs);
  app.use("/api/secrets", vault);
  app.use("/api/webhooks", wh);
  app.use("/api/ma/runs/artifacts", runArt);
  app.use("/api/search/global", gsearch);
  app.use("/api/search", quickSearch);
  app.use("/api/briefs", briefs);
  app.use("/api/calendar", cal);
  app.use("/api/tickets", tix);
  app.use("/api/tickets/mailbox", tmb);
  app.use("/api/tickets/reply", trep);
  app.use("/api/tickets/sla", tsla);
  app.use("/api/tickets", tthread);
  app.use("/api/tickets/attachments", tatt);
  app.use("/api/slack", slack);
  app.use("/api/teams/oauth", toauth);
  app.use("/api/teams/clip", tgraph);
  app.use("/api/teams", teams);
  app.use("/api/clip", clip);
  app.use("/api/conversations", conv);
  app.use("/api/conversations", convBulk);
  app.use("/api/conversations", convSettings);
  app.use("/api/servicenow", snow);
  app.use("/api/meetings/insights", mins);
  app.use("/api/origin", origin);
  app.use("/api/docs", docx);
  app.use("/api/insights/timeline", tl);
  app.use("/api/insights/risks", rx);
  app.use("/api/insights/decisions", dc);
  app.use("/api/risks", risksList);
  app.use("/api/decisions", decisionsList);
  app.use("/api/roadmap", roadmap);
  app.use("/api/roadmap", rimp);
  app.use("/api/plan", plan);
  app.use("/api/plan", ps);
  app.use("/api/plan/sync", psync);
  app.use("/api/plan/prefs", pp);
  app.use("/api/plan", pcounts);
  app.use("/api/plan", pbf);
  app.use("/api/plan", pexp);
  app.use("/api/plan", pbump);
  app.use("/api/onboarding", onb);
  app.use("/api/onboarding/digest", od);
  app.use("/api/onboarding/digest", odpost);
  app.use("/api/onboarding", op);
  app.use("/api/onboarding", opl);
  app.use("/api/release-manager", relMgr);
  app.use("/api/messaging", msg);
  app.use("/api/ma", maCohorts);
  app.use("/api/ma/separations", sdetail);
  app.use("/api/ma", mpost);
  app.use("/api/ma", off);
  app.use("/api/templates", tlib);
  app.use("/api/announcements", announcements);
  app.use("/api/email", emailAdmin);
  app.use("/api/email/webhooks", mailgunWH);
  app.use("/api/email", et);
  app.use("/api/email", etc);
  app.use("/api/email/smtp-health", esmtp);
  app.use("/api/email", eas);
  app.use("/api/email", etest);
  app.use("/api/admin/lineage", lineageAdmin);
  
  // Mount test stub endpoints (admin-gated within the router, not here)
  // These are specific endpoints for test runner, mounted early to intercept before proxy
  app.use("/api", testStubsRouter);
  
  // Shared utility: normalize filename by stripping leading emojis and invisible characters
  const normalizeFilename = (name: string, forComparison = false) => {
    let normalized = name
      // Strip leading emojis and pictographs (broader Unicode ranges)
      .replace(/^[\uD800-\uDFFF\u2600-\u27BF]+\s*/g, '')
      // Strip zero-width and invisible characters
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim();
    
    // If normalization results in empty string, use placeholder
    if (!normalized) {
      normalized = '(untitled)';
    }
    
    return forComparison ? normalized.toLowerCase() : normalized;
  }
  
  // Documents Router - queries local Drizzle database (NOT Supabase)
  // MUST be mounted BEFORE the catch-all proxy to intercept /api/documents/* requests
  const documentsRouter = express.Router();
  
  documentsRouter.get("/list", requireProject("member"), async (req, res) => {
    try {
      const projectId = req.query.project_id as string;
      if (!projectId) {
        console.error("❌ Missing project_id");
        return res.status(400).json({ error: "project_id required" });
      }

      // Query docs with chunk counts using raw SQL for reliability
      const result = await db.execute(sql`
        SELECT 
          d.id,
          d.name as title,
          d.mime as mime_type,
          d.storage_path,
          d.created_at,
          COALESCE(COUNT(dc.id), 0) as chunk_count
        FROM docs d
        LEFT JOIN doc_chunks dc ON dc.doc_id = d.id
        WHERE d.project_id = ${projectId}
        GROUP BY d.id, d.name, d.mime, d.storage_path, d.created_at
        ORDER BY d.created_at DESC
        LIMIT 500
      `);
      
      const rows = (result as any).rows || result;
      const docRecords = rows.map((row: any) => ({
        id: row.id,
        title: row.title,
        mime_type: row.mime_type,
        storage_path: row.storage_path,
        created_at: row.created_at,
        chunk_count: Number(row.chunk_count) || 0
      }));

      // Generate signed URLs using Supabase storage client
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        console.error("Missing Supabase credentials");
        return res.json({ 
          items: docRecords.map((doc: any) => ({
            id: doc.id,
            title: doc.title,
            mime_type: doc.mime_type,
            chunk_count: doc.chunk_count || 0,
            created_at: doc.created_at,
            source: 'document_upload',
            signed_url: null
          }))
        });
      }

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Generate signed URLs for each document
      const itemsWithUrls = await Promise.all(
        docRecords.map(async (doc: any) => {
          let signedUrl = null;
          try {
            const { data, error } = await supabase.storage
              .from('project-artifacts')
              .createSignedUrl(doc.storage_path, 3600); // 1 hour expiry
            
            if (data?.signedUrl) {
              signedUrl = data.signedUrl;
            }
          } catch (err) {
            console.error(`Failed to generate signed URL for ${doc.id}:`, err);
          }

          const cleanTitle = normalizeFilename(doc.title);

          return {
            id: doc.id,
            title: cleanTitle || doc.title,
            mime_type: doc.mime_type,
            chunk_count: doc.chunk_count || 0,
            created_at: doc.created_at,
            source: 'document_upload',
            signed_url: signedUrl
          };
        })
      );

      return res.json({ items: itemsWithUrls });
    } catch (e: any) {
      console.error("Error listing docs:", e);
      return res.status(500).json({ error: "Failed to list documents" });
    }
  });
  
  documentsRouter.delete("/:docId", async (req, res) => {
    try {
      const { docId } = req.params;
      
      const [doc] = await db.select({ storagePath: docs.storagePath, projectId: docs.projectId }).from(docs).where(eq(docs.id, docId)).limit(1);
      
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      // Check project access before allowing delete
      const { assertProjectAccess } = await import("./auth/projectAccess");
      await assertProjectAccess(req, doc.projectId, "admin");
      
      const chunksDeleted = await db.delete(docChunks).where(eq(docChunks.docId, docId));
      await db.delete(docs).where(eq(docs.id, docId));
      
      let storageDeleted = false;
      if (doc?.storagePath) {
        try {
          const storagePath = doc.storagePath.replace('/tmp/ingest/', '');
          console.log(`Attempting to delete Supabase storage file: ${storagePath}`);
        } catch (storageErr) {
          console.warn("Failed to delete storage object:", storageErr);
        }
      }
      
      res.json({ 
        ok: true, 
        message: "Document deleted successfully",
        chunksDeleted: chunksDeleted ? 1 : 0,
        storageDeleted
      });
    } catch (e: any) {
      console.error("Error deleting document:", e);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });
  
  app.use("/api/documents", documentsRouter);

  // Document Ingestion Routes (Drizzle-based)
  const upload = multer(); // memory storage
  
  // Check if filename already exists in project (excluding soft-deleted documents)
  app.get("/api/ingest/check-filename", requireProject("member"), async (req, res) => {
    try {
      const { project_id, filename } = req.query as { project_id?: string; filename?: string };
      if (!project_id || !filename) {
        return res.status(400).json({ error: "project_id and filename required" });
      }

      // Query only non-deleted documents (where deletedAt IS NULL)
      const existing = await db.select({ id: docs.id, name: docs.name })
        .from(docs)
        .where(sql`${docs.projectId} = ${project_id} AND ${docs.deletedAt} IS NULL`)
        .execute();

      const cleanFilename = normalizeFilename(filename, true);
      const isDuplicate = existing.some(doc => {
        const cleanDocName = normalizeFilename(doc.name, true);
        return cleanDocName === cleanFilename;
      });

      res.json({ exists: isDuplicate });
    } catch (e: any) {
      console.error("Error checking filename:", e);
      res.status(500).json({ error: "Failed to check filename" });
    }
  });
  
  // Export all documents in a project as a ZIP file
  app.get("/api/ingest/export.zip", requireProject("member"), async (req, res, next) => {
    try {
      const projectId = req.query.projectId as string;
      if (!projectId) {
        return res.status(400).json({ error: "projectId required" });
      }

      // Query all non-deleted documents for this project
      const documents = await db.select()
        .from(docs)
        .where(sql`${docs.projectId} = ${projectId} AND ${docs.deletedAt} IS NULL`)
        .execute();

      if (documents.length === 0) {
        return res.status(404).json({ error: "No documents found in this project" });
      }

      // Set response headers for ZIP download
      const timestamp = new Date().toISOString().split('T')[0];
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="documents-${timestamp}.zip"`);

      // Create ZIP archive
      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.on("error", (err: Error) => {
        console.error("Archive error:", err);
        next(err);
      });
      archive.pipe(res);

      // Add each document file to the archive
      const allowedPath = "/tmp/ingest/";
      for (const doc of documents) {
        if (doc.storagePath && doc.storagePath.startsWith(allowedPath) && fs.existsSync(doc.storagePath)) {
          const normalizedName = normalizeFilename(doc.name);
          archive.file(doc.storagePath, { name: normalizedName });
        } else {
          console.warn(`File not found or invalid path: ${doc.storagePath} for doc ${doc.id}`);
        }
      }

      await archive.finalize();
    } catch (e: any) {
      console.error("Error exporting documents:", e);
      res.status(500).json({ error: "Failed to export documents" });
    }
  });
  
  app.post("/api/ingest/doc", requireProject("member"), upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "file missing" });
      const { orgId, projectId } = req.body;
      if (!orgId || !projectId) return res.status(400).json({ error: "orgId & projectId required" });

      // Send to FastAPI for text extraction
      const fd = new FormData();
      fd.append("file", req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });
      fd.append("orgId", orgId);
      fd.append("projectId", projectId);

      const r = await fetch(`http://127.0.0.1:8000/ingest/doc`, {
        method: "POST",
        body: fd as any,
        headers: (fd as any).getHeaders()
      });
      if (!r.ok) {
        const t = await r.text();
        return res.status(502).json({ error: "fastapi upstream failed", detail: t });
      }
      const out: any = await r.json();

      // Fix encoding: Python returns UTF-8 bytes as Latin-1 chars, re-encode properly
      const filenameBuffer = Buffer.from(out.filename, 'latin1');
      const properFilename = filenameBuffer.toString('utf8');
      
      // Normalize filename by stripping leading emojis and invisible characters
      const cleanFilename = normalizeFilename(properFilename);

      // Extract keywords and summary
      const keywords = extractKeywords(out.extractedText || "");
      const summary = summarize(out.extractedText || "");

      // Persist row to Postgres using Drizzle with extracted text
      const [row] = await db.insert(docs).values({
        id: out.docId,
        orgId,
        projectId,
        name: cleanFilename,
        mime: out.mime,
        sizeBytes: out.sizeBytes,
        storagePath: out.storagePath,
        fullText: out.extractedText || null,
        summary,
        keywords,
        meta: out.meta || (out.extractionError ? { extractionError: out.extractionError } : {})
      }).returning();

      // Enqueue background embedding job instead of processing synchronously
      let jobId: string | null = null;
      if (out.extractedText && out.extractedText.length > 0) {
        const [job] = await db.insert(embedJobs).values({
          docId: out.docId,
          projectId,
          status: "pending"
        }).returning();
        jobId = job.id;

        // Also enqueue parse job for insights extraction
        await db.insert(parseJobs).values({
          docId: out.docId,
          projectId,
          status: "pending"
        });
      }

      // Create notification
      await db.insert(notifications).values({
        orgId: orgId,
        projectId: projectId,
        kind: "doc_ingested",
        title: `Document uploaded: ${cleanFilename}`,
        payload: { docId: out.docId, name: cleanFilename }
      });

      res.status(202).json({ ok: true, doc: row, jobId, queued: !!jobId, keywords });
    } catch (e: any) {
      next(e);
    }
  });

  app.get("/api/ingest/list", requireProject("member"), async (req, res, next) => {
    try {
      const { projectId } = req.query as { projectId?: string };
      if (!projectId) return res.status(400).json({ error: "projectId required" });
      
      const rows = await db.select({
        id: docs.id,
        name: docs.name,
        mime: docs.mime,
        sizeBytes: docs.sizeBytes,
        summary: docs.summary,
        keywords: docs.keywords,
        createdAt: docs.createdAt
      }).from(docs)
        .where(sql`${docs.projectId} = ${projectId} AND ${docs.deletedAt} IS NULL`)
        .orderBy(sql`${docs.createdAt} DESC`);
      
      res.json({ ok: true, docs: rows });
    } catch (e: any) {
      next(e);
    }
  });

  // Get document detail
  app.get("/api/ingest/detail/:id", async (req, res, next) => {
    try {
      const id = req.params.id;
      const [row] = await db.select({
        id: docs.id,
        name: docs.name,
        mime: docs.mime,
        sizeBytes: docs.sizeBytes,
        fullText: docs.fullText,
        summary: docs.summary,
        keywords: docs.keywords,
        meta: docs.meta,
        projectId: docs.projectId,
        storagePath: docs.storagePath,
        createdAt: docs.createdAt
      }).from(docs)
        .where(sql`${docs.id} = ${id} AND ${docs.deletedAt} IS NULL`)
        .limit(1);
      
      if (!row) return res.status(404).json({ error: "not found" });
      
      // Check project access
      const { assertProjectAccess } = await import("./auth/projectAccess");
      await assertProjectAccess(req, row.projectId, "member");
      
      // Generate signed URL if document has storage path
      let signedUrl = null;
      if (row.storagePath) {
        // Check if it's a local file path or Supabase storage path
        if (row.storagePath.startsWith('/tmp/ingest/')) {
          // For local files, generate a signed token and append it to the URL
          const token = await generateFileToken(row.id, row.projectId);
          signedUrl = `/api/ingest/file/${row.id}?token=${token}`;
        } else {
          // For Supabase storage, generate signed URL
          try {
            const supabaseUrl = process.env.SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            
            if (supabaseUrl && supabaseKey) {
              const { createClient } = await import('@supabase/supabase-js');
              const supabase = createClient(supabaseUrl, supabaseKey);
              const BUCKET = process.env.BUCKET || "project-artifacts";
              
              const { data, error } = await supabase.storage
                .from(BUCKET)
                .createSignedUrl(row.storagePath, 3600);
              
              if (!error && data?.signedUrl) {
                signedUrl = data.signedUrl;
              }
            }
          } catch (e) {
            console.error("Error generating signed URL:", e);
          }
        }
      }
      
      res.json({ ok: true, doc: { ...row, signedUrl } });
    } catch (e: any) {
      next(e);
    }
  });

  // Serve local document files with token-based authentication
  app.get("/api/ingest/file/:id", async (req, res, next) => {
    try {
      const id = req.params.id;
      const token = req.query.token as string;
      
      // Validate token
      if (!token) {
        return res.status(401).json({ error: "Token required" });
      }
      
      const tokenData = await verifyFileToken(token);
      if (!tokenData || tokenData.fileId !== id) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }
      
      // Fetch file metadata
      const [row] = await db.select({
        storagePath: docs.storagePath,
        projectId: docs.projectId,
        mime: docs.mime,
        name: docs.name
      }).from(docs)
        .where(sql`${docs.id} = ${id} AND ${docs.deletedAt} IS NULL`)
        .limit(1);
      
      if (!row) return res.status(404).json({ error: "not found" });
      
      // Verify project ID from token matches the document
      if (row.projectId !== tokenData.projectId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Only serve local files
      if (!row.storagePath || !row.storagePath.startsWith('/tmp/ingest/')) {
        return res.status(400).json({ error: "Not a local file" });
      }
      
      // Check if file exists
      const fs = await import('fs');
      if (!fs.existsSync(row.storagePath)) {
        return res.status(404).json({ error: "File not found on disk" });
      }
      
      // Set content type and send file
      res.setHeader('Content-Type', row.mime || 'application/octet-stream');
      
      // Sanitize filename for Content-Disposition header (ASCII only)
      const safeName = row.name.replace(/[^\x20-\x7E]/g, '_');
      res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
      
      res.sendFile(row.storagePath);
    } catch (e: any) {
      next(e);
    }
  });

  // Soft delete document
  app.post("/api/ingest/delete/:id", async (req, res, next) => {
    try {
      const id = req.params.id;
      
      // Fetch document to get project_id and check access
      const [doc] = await db.select({ projectId: docs.projectId }).from(docs).where(eq(docs.id, id)).limit(1);
      if (!doc) return res.status(404).json({ error: "not found" });
      
      // Check project access before allowing delete
      const { assertProjectAccess } = await import("./auth/projectAccess");
      await assertProjectAccess(req, doc.projectId, "admin");
      
      await db.update(docs)
        .set({ deletedAt: new Date() })
        .where(eq(docs.id, id));
      res.json({ ok: true });
    } catch (e: any) {
      next(e);
    }
  });

  // Re-embed a document (enqueue job)
  app.post("/api/ingest/reembed/:id", async (req, res, next) => {
    try {
      const docId = req.params.id;
      
      // Verify document exists
      const docResults = await db.select({
        id: docs.id,
        projectId: docs.projectId
      })
        .from(docs)
        .where(eq(docs.id, docId))
        .limit(1);
      
      if (docResults.length === 0) {
        return res.status(404).json({ error: "doc not found" });
      }
      
      // Check project access before allowing re-embed
      const { assertProjectAccess } = await import("./auth/projectAccess");
      await assertProjectAccess(req, docResults[0].projectId, "admin");

      // First, delete existing chunks for this document
      await db.execute(sql`
        DELETE FROM doc_chunks WHERE doc_id = ${docId}
      `);

      // Enqueue new embedding job
      const [job] = await db.insert(embedJobs).values({
        docId,
        projectId: docResults[0].projectId,
        status: "pending"
      }).returning();

      // Also enqueue parse job for insights extraction
      await db.insert(parseJobs).values({
        docId,
        projectId: docResults[0].projectId,
        status: "pending"
      });

      res.json({ ok: true, jobId: job.id });
    } catch (e: any) {
      next(e);
    }
  });

  // Get job status
  app.get("/api/ingest/job/:id", async (req, res, next) => {
    try {
      const jobId = req.params.id;
      
      const jobResults = await db.select({
        id: embedJobs.id,
        docId: embedJobs.docId,
        projectId: embedJobs.projectId,
        status: embedJobs.status,
        attempts: embedJobs.attempts,
        lastError: embedJobs.lastError,
        createdAt: embedJobs.createdAt,
        updatedAt: embedJobs.updatedAt
      })
        .from(embedJobs)
        .where(eq(embedJobs.id, jobId))
        .limit(1);
      
      if (jobResults.length === 0) {
        return res.status(404).json({ error: "job not found" });
      }
      
      // Check project access before returning job details
      const { assertProjectAccess } = await import("./auth/projectAccess");
      await assertProjectAccess(req, jobResults[0].projectId, "member");
      
      res.json({ ok: true, job: jobResults[0] });
    } catch (e: any) {
      next(e);
    }
  });

  // Semantic search endpoint with pgvector ANN
  app.post("/api/search/docs", requireProject("member"), async (req, res, next) => {
    try {
      const { 
        query, 
        projectId, 
        limit = 10, 
        offset = 0,
        exactMatch = false,
        dateFrom,
        dateTo,
        mime
      } = req.body;
      
      if (!query || !projectId) {
        return res.status(400).json({ error: "query and projectId required" });
      }

      // Generate embedding for the search query
      const { generateEmbedding } = await import("./lib/embed");
      const queryEmbedding = await generateEmbedding(query);
      const vecLiteral = `[${queryEmbedding.join(',')}]`;

      // Build query with safe parameterized WHERE conditions
      let baseQuery = sql`
        SELECT 
          dc.id,
          dc.doc_id as "docId",
          dc.project_id as "projectId",
          dc.chunk,
          d.name as "docName",
          d.mime,
          d.created_at as "createdAt",
          (1 - (dc.embedding_vec <=> ${vecLiteral}::vector)) as similarity
        FROM doc_chunks dc
        JOIN docs d ON d.id = dc.doc_id
        WHERE dc.project_id = ${projectId}
          AND dc.embedding_vec IS NOT NULL
      `;

      // Add date filters with parameterized bindings
      if (dateFrom) {
        baseQuery = sql`${baseQuery} AND d.created_at >= ${dateFrom}::date`;
      }
      if (dateTo) {
        baseQuery = sql`${baseQuery} AND d.created_at < (${dateTo}::date + interval '1 day')`;
      }

      // Add mime type filter with safe ILIKE
      if (mime && mime !== "any") {
        if (mime === "pdf") {
          baseQuery = sql`${baseQuery} AND d.mime ILIKE '%pdf%'`;
        } else if (mime === "docx") {
          baseQuery = sql`${baseQuery} AND (d.mime ILIKE '%word%' OR d.name ILIKE '%.docx')`;
        } else if (mime === "txt") {
          baseQuery = sql`${baseQuery} AND (d.mime ILIKE '%text%' OR d.name ILIKE '%.txt')`;
        } else {
          baseQuery = sql`${baseQuery} AND d.mime ILIKE ${`%${mime}%`}`;
        }
      }

      // Add text filter for exact match with parameterized LIKE
      if (exactMatch) {
        const queryLower = query.toLowerCase();
        baseQuery = sql`${baseQuery} AND LOWER(dc.chunk) LIKE ${`%${queryLower}%`}`;
      }

      // Execute search with ordering and pagination
      const searchResults = await db.execute(sql`
        ${baseQuery}
        ORDER BY dc.embedding_vec <=> ${vecLiteral}::vector
        LIMIT ${limit}
        OFFSET ${offset}
      `);

      const rows = (searchResults as any).rows || searchResults;
      
      // Early return if no results
      if (rows.length === 0) {
        return res.json({ ok: true, results: [] });
      }

      // Format results with all metadata from joined query
      const results = rows.map((r: any) => ({
        id: r.id,
        docId: r.docId,
        docName: r.docName || "Unknown",
        chunk: r.chunk,
        similarity: r.similarity,
        mime: r.mime,
        createdAt: r.createdAt
      }));

      res.json({ ok: true, results });
    } catch (e: any) {
      console.error("Search error:", e);
      next(e);
    }
  });
  
  // Direct endpoints for problematic routes that need body forwarding
  app.post('/api/onboarding/start', async (req, res) => {
    try {
      console.log('[Direct] POST /onboarding/start');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (req.headers['authorization']) headers['Authorization'] = String(req.headers['authorization']);
      if (process.env.DEV_AUTH === '1') {
        if (req.headers['x-dev-user']) headers['X-Dev-User'] = String(req.headers['x-dev-user']);
        if (req.headers['x-dev-org']) headers['X-Dev-Org'] = String(req.headers['x-dev-org']);
        if (req.headers['x-dev-role']) headers['X-Dev-Role'] = String(req.headers['x-dev-role']);
      }
      const response = await fetch('http://127.0.0.1:8000/onboarding/start', {
        method: 'POST',
        headers,
        body: JSON.stringify(req.body)
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error: any) {
      console.error('[Direct] onboarding/start error:', error.message);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  app.post('/api/onboarding/respond', async (req, res) => {
    try {
      console.log('[Direct] POST /onboarding/respond');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (req.headers['authorization']) headers['Authorization'] = String(req.headers['authorization']);
      if (process.env.DEV_AUTH === '1') {
        if (req.headers['x-dev-user']) headers['X-Dev-User'] = String(req.headers['x-dev-user']);
        if (req.headers['x-dev-org']) headers['X-Dev-Org'] = String(req.headers['x-dev-org']);
        if (req.headers['x-dev-role']) headers['X-Dev-Role'] = String(req.headers['x-dev-role']);
      }
      const response = await fetch('http://127.0.0.1:8000/onboarding/respond', {
        method: 'POST',
        headers,
        body: JSON.stringify(req.body)
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error: any) {
      console.error('[Direct] onboarding/respond error:', error.message);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  app.post('/api/email/inbound-dev', async (req, res) => {
    try {
      console.log('[Direct] POST /email/inbound-dev');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (req.headers['authorization']) headers['Authorization'] = String(req.headers['authorization']);
      if (process.env.DEV_AUTH === '1') {
        if (req.headers['x-dev-user']) headers['X-Dev-User'] = String(req.headers['x-dev-user']);
        if (req.headers['x-dev-org']) headers['X-Dev-Org'] = String(req.headers['x-dev-org']);
        if (req.headers['x-dev-role']) headers['X-Dev-Role'] = String(req.headers['x-dev-role']);
      }
      const response = await fetch('http://127.0.0.1:8000/email/inbound-dev', {
        method: 'POST',
        headers,
        body: JSON.stringify(req.body)
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error: any) {
      console.error('[Direct] email/inbound-dev error:', error.message);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/api/onboarding/send', async (req, res) => {
    try {
      console.log('[Direct] POST /onboarding/send');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (req.headers['authorization']) headers['Authorization'] = String(req.headers['authorization']);
      if (process.env.DEV_AUTH === '1') {
        if (req.headers['x-dev-user']) headers['X-Dev-User'] = String(req.headers['x-dev-user']);
        if (req.headers['x-dev-org']) headers['X-Dev-Org'] = String(req.headers['x-dev-org']);
        if (req.headers['x-dev-role']) headers['X-Dev-Role'] = String(req.headers['x-dev-role']);
      }
      const response = await fetch('http://127.0.0.1:8000/onboarding/send', {
        method: 'POST',
        headers,
        body: JSON.stringify(req.body)
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error: any) {
      console.error('[Direct] onboarding/send error:', error.message);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Mailgun webhook endpoint - use direct forward instead of broken proxy
  app.post('/api/email/mailgun', express.raw({type: '*/*', limit: '10mb'}), async (req, res) => {
    try {
      console.log('[Mailgun Direct] Forwarding webhook');
      const response = await fetch('http://127.0.0.1:8000/email/mailgun', {
        method: 'POST',
        headers: {
          'Content-Type': req.headers['content-type'] || 'application/x-www-form-urlencoded',
        },
        body: req.body
      });
      
      if (response.headers.get('content-type')?.includes('application/json')) {
        const data = await response.json();
        res.status(response.status).json(data);
      } else {
        const text = await response.text();
        res.status(response.status).send(text);
      }
    } catch (error: any) {
      console.error('[Mailgun Direct] Error:', error.message);
      res.status(500).json({ error: "Mailgun forward error", details: error.message });
    }
  });
  
  // Special handling for file upload endpoints (before general API forwarder)
  app.post('/api/branding/upload_*', express.raw({type: 'multipart/form-data', limit: '10mb'}), async (req, res) => {
    try {
      const path = req.path.replace('/api', ''); // /api/branding/upload_customer -> /branding/upload_customer
      const queryString = Object.keys(req.query).length > 0 ? '?' + new URLSearchParams(req.query as any).toString() : '';
      const url = `http://127.0.0.1:8000${path}${queryString}`;
      
      console.log(`[API Forward] ${req.method} ${req.path}${queryString} (multipart) -> ${path}${queryString}`);
      
      const response = await fetch(url, {
        method: req.method,
        headers: {
          // Preserve original Content-Type for multipart data
          'Content-Type': req.headers['content-type'],
          'User-Agent': req.headers['user-agent'] || 'Express-Forwarder',
          'Authorization': req.headers['authorization'],
          // Only forward dev headers when DEV_AUTH enabled
          ...(process.env.DEV_AUTH === '1' ? {
            'X-Dev-User': req.headers['x-dev-user'],
            'X-Dev-Org': req.headers['x-dev-org'],
            'X-Dev-Role': req.headers['x-dev-role'],
          } : {}),
        } as any,
        body: req.body // Forward raw body for multipart data
      });
      
      if (response.headers.get('content-type')?.includes('application/json')) {
        const data = await response.json();
        console.log(`[API Forward] Response ${response.status} for ${req.method} ${req.path}`);
        res.status(response.status).json(data);
      } else {
        const text = await response.text();
        console.log(`[API Forward] Response ${response.status} for ${req.method} ${req.path}`);
        res.status(response.status).send(text);
      }
    } catch (error: any) {
      console.error(`[API Forward] Error for ${req.method} ${req.path}:`, error.message);
      res.status(500).json({ error: "API forward error", details: error.message });
    }
  });

  // Direct forwarder for all API calls (replacing broken proxy)
  // Skip paths handled by Node.js routers (documents, tests, kapmem, ingest, etc.)
  app.all('/api/*', express.json({limit: '10mb'}), async (req, res, next) => {
    // Skip /api/documents/* and /api/ingest/* - handled by Express routers above
    if (req.path.startsWith('/api/documents') || req.path.startsWith('/api/ingest')) {
      return next();
    }
    
    try {
      const path = req.path.replace('/api', ''); // /api/ask -> /ask
      const queryString = Object.keys(req.query).length > 0 ? '?' + new URLSearchParams(req.query as any).toString() : '';
      const url = `http://127.0.0.1:8000${path}${queryString}`;
      
      console.log(`[API Forward] ${req.method} ${req.path}${queryString} -> ${path}${queryString}`);
      
      const response = await fetch(url, {
        method: req.method,
        headers: {
          // Only forward specific headers for security
          'Content-Type': req.headers['content-type'] || 'application/json',
          'User-Agent': req.headers['user-agent'] || 'Express-Forwarder',
          'Authorization': req.headers['authorization'],
          // Only forward dev headers when DEV_AUTH enabled
          ...(process.env.DEV_AUTH === '1' ? {
            'X-Dev-User': req.headers['x-dev-user'],
            'X-Dev-Org': req.headers['x-dev-org'],
            'X-Dev-Role': req.headers['x-dev-role'],
          } : {}),
        } as any,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body)
      });
      
      if (response.headers.get('content-type')?.includes('application/json')) {
        const data = await response.json();
        console.log(`[API Forward] Response ${response.status} for ${req.method} ${req.path}`);
        res.status(response.status).json(data);
      } else {
        const text = await response.text();
        console.log(`[API Forward] Response ${response.status} for ${req.method} ${req.path}`);
        res.status(response.status).send(text);
      }
    } catch (error: any) {
      console.error(`[API Forward] Error for ${req.method} ${req.path}:`, error.message);
      res.status(500).json({ error: "API forward error", details: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}