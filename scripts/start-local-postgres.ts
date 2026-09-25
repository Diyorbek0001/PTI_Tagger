import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

async function main() {
const projectRoot = process.cwd();
const databaseDir = path.join(projectRoot, '.local-postgres');
const postgres = new EmbeddedPostgres({
  databaseDir,
  user: 'postgres',
  password: 'postgres',
  port: 5432,
  persistent: true,
  onLog: () => undefined,
});

if (!existsSync(path.join(databaseDir, 'PG_VERSION'))) await postgres.initialise();
await postgres.start();

try {
  await postgres.createDatabase('pti_telegram');
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes('already exists')) throw error;
}

const client = postgres.getPgClient('pti_telegram');
await client.connect();
await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');

const migrationDir = path.join(projectRoot, 'database', 'migrations');
for (const name of readdirSync(migrationDir).filter(file => file.endsWith('.sql')).sort()) {
  const applied = await client.query('select 1 from schema_migrations where name = $1', [name]);
  if (applied.rowCount) continue;
  await client.query('begin');
  try {
    await client.query(readFileSync(path.join(migrationDir, name), 'utf8'));
    await client.query('insert into schema_migrations (name) values ($1)', [name]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

await client.query(readFileSync(path.join(projectRoot, 'database', 'seed', 'units.sql'), 'utf8'));
await client.end();
console.info('Local PostgreSQL is ready at postgresql://postgres:postgres@localhost:5432/pti_telegram');

const stop = async () => { await postgres.stop(); process.exit(0); };
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
await new Promise(() => undefined);
}

main().catch(error => { console.error(error); process.exit(1); });
