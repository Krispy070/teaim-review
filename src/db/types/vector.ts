import { customType } from "drizzle-orm/pg-core";

/**
 * pgvector column helper for Drizzle schema typing.
 * Keeps DDL correct (vector(N)). We don't serialize values here.
 *
 * Usage:
 *   embedding: vector("embedding", 3072),
 */
export const vector = (name: string, dimensions: number) =>
  customType<{ data: unknown; driverData: unknown }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    // No toDriver(): we only need the DDL type in schema.
  })(name);
