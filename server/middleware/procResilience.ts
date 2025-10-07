const LOG_JSON = process.env.LOG_JSON === "1";

function log(level: string, msg: string, extra?: Record<string, any>) {
  if (LOG_JSON) {
    console.log(JSON.stringify({ level, msg, ...extra }));
  } else {
    console.log(`[${level}] ${msg}`, extra || "");
  }
}

export function wireProcessTraps(server: import("http").Server) {
  process.on("unhandledRejection", (reason: any) => {
    log("error", "unhandledRejection", { reason: String(reason?.message || reason) });
    setTimeout(() => server.close(() => process.exit(1)), 250);
  });

  process.on("uncaughtException", (err: any) => {
    log("error", "uncaughtException", { err: String(err?.message || err) });
    setTimeout(() => server.close(() => process.exit(1)), 250);
  });

  process.on("warning", (w) => {
    log("warn", "process_warning", { name: w.name, message: w.message });
  });
}
