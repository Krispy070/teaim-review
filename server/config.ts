// Central, read-once configuration (no deps)
type AppConfig = {
  env: "development" | "test" | "production";
  port: number;
  bodyLimit: string;          // e.g. "2mb"
  uploadLimitMB: number;      // caps multer endpoints
  corsAllowed: string[];      // exact origins allowed
  mail: {
    domain: string;
    from: string;
  };
};

function n(v: any, def: number) {
  const x = Number(v); return Number.isFinite(x) ? x : def;
}
function csv(v?: string) {
  return (v || "").split(",").map(s => s.trim()).filter(Boolean);
}

export const config: AppConfig = {
  env: (process.env.NODE_ENV as any) || "development",
  port: n(process.env.PORT, 5000),
  bodyLimit: process.env.BODY_LIMIT || "2mb",
  uploadLimitMB: n(process.env.UPLOAD_LIMIT_MB, 10),        // 10 MB per file
  corsAllowed: csv(process.env.CORS_ALLOWED_ORIGINS),       // e.g. "https://teaim.app,http://localhost:5173"
  mail: {
    domain: process.env.MAILGUN_DOMAIN || "",
    from: process.env.MAILGUN_FROM || "TEAIM <alerts@localhost>"
  }
};
