import "dotenv/config";
import express from "express";
import path from "node:path";
import adminRoutes from "./admin.routes";
import cors from "cors";

const PORT = Number(process.env.PORT || process.env.API_PORT || 5173);
const app = express();

app.use(cors());
app.use(express.json());

// API
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, api: "TEAIM API (prod)", env: process.env.VITE_APP_ENV || "unknown" });
});
app.use("/api/admin", adminRoutes);

// Static UI (dist)
const distDir = path.resolve(process.cwd(), "dist");
app.use(express.static(distDir));
// SPA fallback to index.html
app.get("*", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`[prod] serving UI + API on http://localhost:${PORT}`);
});
