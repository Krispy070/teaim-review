import { Router } from "express";

const admin = Router();

// In-memory mock store (restart resets). Replace with DB later.
type User = { id: string; email: string; role: string; active: boolean };
const users: Record<string, User> = {};

// helpers
const id = () => Math.random().toString(36).slice(2,10);

// Invite user
admin.post("/invite", (req, res) => {
  const { email, role = "worker" } = req.body || {};
  if (!email) return res.status(400).json({ error: "email required" });
  const uid = id();
  users[uid] = { id: uid, email, role, active: true };
  // mock invite link
  const link = `https://teaim.local/invite/${uid}`;
  return res.json({ ok: true, user: users[uid], link });
});

// Reset password (mock)
admin.post("/reset", (req, res) => {
  const { id: uid } = req.body || {};
  if (!uid || !users[uid]) return res.status(404).json({ error: "user not found" });
  // mock token
  const token = id() + id();
  return res.json({ ok: true, id: uid, token });
});

// Deactivate
admin.post("/deactivate", (req, res) => {
  const { id: uid } = req.body || {};
  if (!uid || !users[uid]) return res.status(404).json({ error: "user not found" });
  users[uid].active = false;
  return res.json({ ok: true, id: uid });
});

// List
admin.get("/users", (_req, res) => {
  return res.json({ users: Object.values(users) });
});

export default admin;
