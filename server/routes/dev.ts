import { Router } from "express";
import { SignJWT } from "jose";
import { env } from "../env";

export const dev = Router();

// DEV ONLY: mint a short-lived admin token for e2e
dev.get("/token", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "disabled in production" });
  }

  const email = (req.query.email as string) || "e2e@local.test";
  const role = (req.query.role as string) || "admin";
  const userId = (req.query.userId as string) || "e2e-user-id";

  // If SUPABASE_JWT_SECRET is not configured, use DEV_AUTH mode
  if (!env.SUPABASE_JWT_SECRET) {
    return res.json({ 
      mode: "dev_auth",
      userId,
      email,
      role,
      headers: {
        "X-Dev-User": userId,
        "X-Dev-Role": role
      },
      note: "Set DEV_AUTH=1 and use these headers for authentication"
    });
  }

  // Mint a proper JWT if secret is available
  try {
    const token = await new SignJWT({
      sub: userId,
      email,
      role: "authenticated",
      app_metadata: { user_role: role }
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode(env.SUPABASE_JWT_SECRET));

    res.json({ 
      mode: "jwt", 
      token, 
      email, 
      role,
      userId
    });
  } catch (error) {
    res.status(500).json({ 
      error: "Failed to generate token", 
      message: error instanceof Error ? error.message : String(error)
    });
  }
});
