import { Pool } from 'pg';

const globalForDb = globalThis as unknown as { pool?: Pool };
const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/pti_telegram';
export const db = globalForDb.pool ?? new Pool({ connectionString });
if (process.env.NODE_ENV !== 'production') globalForDb.pool = db;
