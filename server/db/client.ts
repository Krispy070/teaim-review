import { drizzle } from "drizzle-orm/node-postgres";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL!;

export const pool = new Pool({
  connectionString,
  ssl: /localhost|127\.0\.0\.1/i.test(connectionString)
    ? false
    : { rejectUnauthorized: false },
});

export const db = drizzle(pool);
