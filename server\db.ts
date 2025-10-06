// C:\Dev\TEAIM\server\db.ts
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../shared/schema';

// Type-safe-ish placeholder (we only need `.query`/`.none` fallbacks in no-DB mode)
type FakeDB = {
  query: (...args: any[]) => Promise<never>;
  none: (...args: any[]) => Promise<never>;
};

let db: any;

const url = process.env.DATABASE_URL;

if (!url) {
  console.warn('⚠️  DATABASE_URL not set. Running in NO-DB mode.');
  const fake: FakeDB = {
    query: async () => { throw new Error('DB disabled in local dev'); },
    none:  async () => { throw new Error('DB disabled in local dev'); }
  };
  db = fake;
} else {
  // Create the connection and drizzle client
  const client = postgres(url, { idle_timeout: 5, max: 1 });
  db = drizzle(client, { schema });
}

export { db };
export default db;

