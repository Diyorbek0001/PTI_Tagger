import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const migrationDir = path.join(process.cwd(), 'database', 'migrations');
const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/pti_telegram';
const client = new pg.Client({ connectionString });

if (!existsSync(migrationDir)) throw new Error(`Migration directory not found: ${migrationDir}`);

await client.connect();
try {
  await client.query("select pg_advisory_lock(hashtext('pti_database_migrations'))");
  await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  for (const name of readdirSync(migrationDir).filter(file => file.endsWith('.sql')).sort()) {
    const applied = await client.query('select 1 from schema_migrations where name=$1', [name]);
    if (applied.rowCount) continue;
    await client.query('begin');
    try {
      await client.query(readFileSync(path.join(migrationDir, name), 'utf8'));
      await client.query('insert into schema_migrations(name) values($1)', [name]);
      await client.query('commit');
      console.info(`Applied migration: ${name}`);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  }
  console.info('Database migrations are up to date.');
} finally {
  await client.query("select pg_advisory_unlock(hashtext('pti_database_migrations'))").catch(() => undefined);
  await client.end();
}
