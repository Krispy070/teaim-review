import express, { type Request, Response, NextFunction } from "express";
import { spawn, type ChildProcess } from "child_process";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { authenticate } from "./auth/supabaseAuth";
import { apiKeyAuth } from "./auth/apiKey";
import { securityHeaders } from "./security";
import { requestTimer } from "./middleware/metrics";
import { traceIdMiddleware } from "./middleware/traceId";
import { db } from "./db/client";
import { sql } from "drizzle-orm";
import { startEmbedWorker } from "./workers/embedWorker";
import { startParseWorker } from "./workers/parseWorker";
import { startRetentionWorker } from "./workers/retentionWorker";
import { startCadenceNotifyWorker } from "./workers/cadenceNotifyWorker";
import { startTrainingReminderWorker } from "./workers/trainingReminderWorker";
import { startAlertWorkers } from "./workers/alertWorkers";
import { startHourlyDigestWorker } from "./workers/hourlyDigestWorker";
import { startIntegrationSchedulerWorker } from "./workers/integrationSchedulerWorker";
import { startIntegrationRunnerWorker } from "./workers/integrationRunnerWorker";
import { startDailyBriefWorker } from "./workers/dailyBriefWorker";
import { startTicketSlaWorker } from "./workers/ticketSlaWorker";
import { startArtifactRetentionWorker } from "./workers/artifactRetentionWorker";
import { startConversationSweepWorker } from "./workers/conversationSweepWorker";
import { startPlanReminderWorker } from "./workers/planReminderWorker";
import { startMindsetWorker } from "./workers/mindsetWorker";
import { startPlanTicketSyncWorker } from "./workers/planTicketSyncWorker";
import { startWeeklyOnboardingDigestWorker } from "./workers/weeklyOnboardingDigestWorker";
import { startOffboardingWeeklyWorker } from "./workers/offboardingWeeklyWorker";
import { startBounceAlertWorker } from "./workers/bounceAlertWorker";

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

// Production safety: Refuse to start with DEV_AUTH enabled in production
if (process.env.NODE_ENV === 'production' && process.env.DEV_AUTH === '1') {
  console.error('SECURITY ERROR: DEV_AUTH cannot be enabled in production environment');
  process.exit(1);
}

const app = express();
app.use(express.json({
  limit: "10mb",
  verify: (req: any, _res, buf) => { req.rawBody = buf; }
}));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Apply security headers early
app.use(securityHeaders);

// Apply request timing middleware (Fix Pack v32)
app.use(requestTimer);

// Apply trace-id middleware (Fix Pack v117)
app.use(traceIdMiddleware);

// Apply authentication middleware early
app.use(authenticate);

// Apply API key authentication (Fix Pack v34)
app.use(apiKeyAuth);

// Development-only: Force no-cache for HTML to prevent stale UI issues
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    if (req.accepts('html') && !req.path.startsWith('/api')) {
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
      });
    }
    next();
  });
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Python FastAPI server management
let pythonProcess: ChildProcess | null = null;

async function startPythonServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    log("Starting Python FastAPI server...");
    
    const pyCmd = process.env.PY_CMD || "python3";
    
    // Spawn Python server
    pythonProcess = spawn(pyCmd, [
      "-m", "uvicorn", 
      "server.main:app",
      "--host", "127.0.0.1",
      "--port", "8000",
      "--log-level", "info"
    ], {
      cwd: process.cwd(),
      env: { 
        ...process.env, 
        PYTHONUNBUFFERED: "1" 
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    // Handle Python server output
    pythonProcess.stdout?.on("data", (data) => {
      const output = data.toString().trim();
      if (output) {
        log(`[Python] ${output}`);
      }
    });

    pythonProcess.stderr?.on("data", (data) => {
      const output = data.toString().trim();
      if (output && !output.includes("WARNING")) {
        log(`[Python Error] ${output}`);
      }
    });

    pythonProcess.on("error", (error) => {
      log(`[Python] Process error: ${error.message}`);
      reject(error);
    });

    pythonProcess.on("close", (code) => {
      log(`[Python] Process exited with code ${code}`);
      pythonProcess = null;
    });

    // Wait for Python server to be ready
    checkPythonHealth(resolve, reject, 30); // 30 attempts
  });
}

async function checkPythonHealth(resolve: () => void, reject: (error: Error) => void, attemptsLeft: number) {
  if (attemptsLeft <= 0) {
    reject(new Error("Python server failed to start after 30 attempts"));
    return;
  }

  try {
    const response = await fetch("http://127.0.0.1:8000/", { 
      method: "GET",
      signal: AbortSignal.timeout(1000)
    });
    
    if (response.ok) {
      log("Python API server is ready");
      resolve();
      return;
    }
  } catch (error) {
    // Server not ready yet, continue polling
  }

  // Wait 500ms before next attempt
  setTimeout(() => {
    checkPythonHealth(resolve, reject, attemptsLeft - 1);
  }, 500);
}

function stopPythonServer() {
  if (pythonProcess) {
    log("Stopping Python FastAPI server...");
    pythonProcess.kill("SIGTERM");
    pythonProcess = null;
  }
}

// Handle graceful shutdown
process.on("SIGTERM", stopPythonServer);
process.on("SIGINT", stopPythonServer);
process.on("exit", stopPythonServer);

(async () => {
  // Start Python server first (unless explicitly disabled for CI)
  if (process.env.DISABLE_FASTAPI !== "1") {
    try {
      await startPythonServer();
    } catch (error) {
      log(`Failed to start Python server: ${error}`);
      // Continue anyway - the proxy will handle connection errors gracefully
    }
  } else {
    log("Python FastAPI server disabled (DISABLE_FASTAPI=1)");
  }

  // Start background embedding worker
  try {
    await startEmbedWorker();
  } catch (error) {
    log(`Failed to start embed worker: ${error}`);
  }

  // Start background parse worker for insights extraction
  try {
    startParseWorker();
  } catch (error) {
    log(`Failed to start parse worker: ${error}`);
  }

  // Start retention worker for automatic cleanup
  try {
    startRetentionWorker();
  } catch (error) {
    log(`Failed to start retention worker: ${error}`);
  }

  // Start cadence notify worker for governance reminders
  try {
    startCadenceNotifyWorker();
  } catch (error) {
    log(`Failed to start cadence notify worker: ${error}`);
  }

  // Start training reminder worker for training session notifications
  try {
    startTrainingReminderWorker();
  } catch (error) {
    log(`Failed to start training reminder worker: ${error}`);
  }

  // Start alert workers for error spike and queue stuck notifications (Fix Pack v46)
  try {
    startAlertWorkers();
  } catch (error) {
    log(`Failed to start alert workers: ${error}`);
  }

  // Start hourly digest worker for digest notifications (Fix Pack v84)
  try {
    startHourlyDigestWorker();
  } catch (error) {
    log(`Failed to start hourly digest worker: ${error}`);
  }

  // Start integration scheduler worker for cron-based run planning (Fix Pack v48)
  try {
    startIntegrationSchedulerWorker();
  } catch (error) {
    log(`Failed to start integration scheduler worker: ${error}`);
  }

  // Start integration runner worker for executing adapters (Fix Pack v50)
  try {
    startIntegrationRunnerWorker();
  } catch (error) {
    log(`Failed to start integration runner worker: ${error}`);
  }

  // Start daily brief worker for KAP Co-Pilot PM (Fix Pack v54)
  try {
    startDailyBriefWorker();
  } catch (error) {
    log(`Failed to start daily brief worker: ${error}`);
  }

  try {
    startTicketSlaWorker();
  } catch (error) {
    log(`Failed to start ticket SLA worker: ${error}`);
  }

  try {
    startArtifactRetentionWorker();
  } catch (error) {
    log(`Failed to start artifact retention worker: ${error}`);
  }

  try {
    startConversationSweepWorker();
  } catch (error) {
    log(`Failed to start conversation sweep worker: ${error}`);
  }

  try {
    startPlanReminderWorker();
  } catch (error) {
    log(`Failed to start plan reminder worker: ${error}`);
  }

  try {
    startMindsetWorker();
  } catch (error) {
    log(`Failed to start mindset worker: ${error}`);
  }

  try {
    startPlanTicketSyncWorker();
  } catch (error) {
    log(`Failed to start plan ticket sync worker: ${error}`);
  }

  try {
    startWeeklyOnboardingDigestWorker();
  } catch (error) {
    log(`Failed to start weekly onboarding digest worker: ${error}`);
  }

  try {
    startOffboardingWeeklyWorker();
  } catch (error) {
    log(`Failed to start offboarding weekly worker: ${error}`);
  }

  try {
    startBounceAlertWorker();
  } catch (error) {
    log(`Failed to start bounce alert worker: ${error}`);
  }

  // Health check endpoint (before routes)
  app.get("/health", (_req, res) => res.json({ ok: true }));

  // Mock routes for adapters sandbox
  import("./routes/mock_receiver").then(m => app.use("/mock", m.mock));
  import("./routes/mock_sftp").then(m => app.use("/mock", m.sftpmock));

  // Import and mount M&A offboarding summary post routes
  import("./routes/ma_offboarding_summary_post").then(m => app.use("/api/ma", m.default));
  import("./routes/ma_offboarding_checklist").then(m => app.use("/api/ma", m.default));
  
  // Import and mount plan bulk routes
  import("./routes/plan_bulk").then(m => app.use("/api/plan", m.default));

  // IMPORTANT: mount routes BEFORE vite/static catch-all
  const server = await registerRoutes(app);

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Persist error to database (Fix Pack v32)
    try {
      const projectId = (req.query?.projectId as string) || (req.body?.projectId as string) || null;
      const userEmail = (req as any).user?.email || null;
      db.execute(
        sql`insert into error_log (project_id, level, message, route, method, status, user_email, detail)
         values (${projectId}, ${status>=500?"error":"warn"}, ${String(message).slice(0,8000)}, ${req.path.slice(0,250)},
         ${req.method}, ${status}, ${userEmail}, ${JSON.stringify({ stack: err?.stack, detail: err?.detail })})`
      ).catch(()=>{});
    } catch {
      // noop
    }

    res.status(status).json({ message });
    console.error('Express error:', err);
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
