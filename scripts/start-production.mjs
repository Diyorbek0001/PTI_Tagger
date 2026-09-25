import { spawn } from 'node:child_process';
import path from 'node:path';

const projectRoot = process.cwd();
const environment = { ...process.env, NODE_ENV: 'production', NEXT_DIST_DIR: '.next-build' };
const port = process.env.PORT ?? '3000';
const railwayDelay = process.env.RAILWAY_ENVIRONMENT ? 15_000 : 0;
const botStartDelay = Number(process.env.BOT_START_DELAY_MS ?? railwayDelay);
let stopping = false;
let botProcess;

const webProcess = spawn(process.execPath, [path.join(projectRoot, 'node_modules/next/dist/bin/next'), 'start', '-p', port], {
  cwd: projectRoot,
  env: environment,
  stdio: 'inherit',
});

const botTimer = setTimeout(() => {
  if (stopping) return;
  botProcess = spawn(process.execPath, ['--import', 'tsx', path.join(projectRoot, 'scripts/start-telegram-bot.ts')], {
    cwd: projectRoot,
    env: environment,
    stdio: 'inherit',
  });
  botProcess.on('exit', code => shutdown(code ?? 1));
}, botStartDelay);

webProcess.on('exit', code => shutdown(code ?? 1));

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(botTimer);
  if (webProcess.exitCode === null) webProcess.kill('SIGTERM');
  if (botProcess?.exitCode === null) botProcess.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500).unref();
}

process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));
