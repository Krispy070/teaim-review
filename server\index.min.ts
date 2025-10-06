import "dotenv/config";
import express from "express";
import cors from "cors";
import adminRoutes from "./admin.routes";

const PORT = Number(process.env.API_PORT || 8080);
const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, api: "TEAIM API (minimal)", env: process.env.VITE_APP_ENV || "unknown" });
});

app.use("/api/admin", adminRoutes);  

app.listen(PORT, () => console.log(`[api:min] http://localhost:${PORT}`));
