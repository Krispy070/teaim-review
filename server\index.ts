import express, { type Request, Response, NextFunction } from "express";
import { spawn, type ChildProcess } from "child_process";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

// Production safety: Refuse to start with DEV_AUTH enabled in production
if (process.env.NODE_ENV === 'production' && process.env.DEV_AUTH === '1') {
  console.error('SECURITY ERROR: DEV_AUTH cannot be enabled in production environment');
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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
    
    // Spawn Python server
    pythonProcess = spawn("python3", [
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
  // Start Python server first
  try {
    await startPythonServer();
  } catch (error) {
    log(`Failed to start Python server: ${error}`);
    // Continue anyway - the proxy will handle connection errors gracefully
  }

  // Health check endpoint (before routes)
  app.get("/health", (_req, res) => res.json({ ok: true }));

  // IMPORTANT: mount routes BEFORE vite/static catch-all
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

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
