import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().default("5000"),
  PY_CMD: z.string().default("python3"),
  FASTAPI_PORT: z.string().default("8000"),
  MEMORY_ENABLED: z.enum(["0", "1"]).default("1"),
  MEMORY_EMBED_MODEL: z.string().default("text-embedding-3-large"),

  // Supabase JWT secret for verifying access tokens
  // In development, this is optional (will fall back to DEV_AUTH if not set)
  SUPABASE_JWT_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

// Parse with fallback handling for development
export const env: Env = (() => {
  try {
    return EnvSchema.parse(process.env);
  } catch (error) {
    // In development without Supabase, allow graceful degradation
    if (process.env.NODE_ENV === "development" && !process.env.SUPABASE_JWT_SECRET) {
      console.warn("⚠️  SUPABASE_JWT_SECRET not set - using DEV_AUTH mode");
      return {
        NODE_ENV: "development",
        PORT: process.env.PORT || "5000",
        PY_CMD: process.env.PY_CMD || "python3",
        FASTAPI_PORT: process.env.FASTAPI_PORT || "8000",
        MEMORY_ENABLED: process.env.MEMORY_ENABLED === "0" ? "0" : "1",
        MEMORY_EMBED_MODEL: process.env.MEMORY_EMBED_MODEL || "text-embedding-3-large",
      } as Env;
    }
    throw error;
  }
})();
