import { customType } from "drizzle-orm/pg-core";

/**
 * pgvector column helper for Drizzle schema typing.
 * Keeps DDL correct (vector(N)). We don't serialize values here.
 *
 * Usage in schema:
 *   embedding: vector("embedding", 3072),
 */
export const vector = (name: string, dimensions: number) =>
  customType<{ data: unknown; driverData: unknown }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    // Intentionally no toDriver() — we only need the DDL type.
  })(name);
