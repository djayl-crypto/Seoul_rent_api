import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';
import { build, PROJECT_ROOT } from './build.mjs';

export function developmentEnvironment(inherited, keyless) {
  const env = { ...inherited };
  delete env.SEOUL_API_KEY;
  delete env.ADMIN_TOKEN;
  delete env.NODE_OPTIONS;
  delete env.CLOUDFLARE_ENV;
  return {
    ...env,
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: keyless ? 'false' : 'true',
    CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false',
    WRANGLER_LOG: 'none', WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_SANITIZE: 'true',
    WRANGLER_SEND_METRICS: 'false', BROWSER: 'none', CI: 'true',
  };
}

export async function startDevelopment({ keyless = false, port = 8788 } = {}) {
  await build();
  // Inspect names only. Prevent Wrangler's precedence rules from choosing another secret file.
  const names = await readdir(PROJECT_ROOT);
  if (names.some(name => name === '.dev.vars' || name.startsWith('.dev.vars.') || (name.startsWith('.env.') && name !== '.env.example'))) throw new Error('Conflicting local environment file');
  const child = spawn(process.execPath, [resolve(PROJECT_ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'pages', 'dev', 'dist', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', '0', '--log-level', 'none', '--binding', 'LOCAL_ADMIN=1'], {
    cwd: PROJECT_ROOT, env: developmentEnvironment(process.env, keyless), stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true,
  });
  // Child diagnostics are deliberately discarded: never display bindings, raw fetch errors or env values.
  console.log(`Local development starting: http://127.0.0.1:${port}${keyless ? ' (keyless)' : ''}`);
  child.on('error', () => { console.error('Local runtime could not start. Check Node and installed dependencies.'); process.exitCode = 1; });
  child.on('exit', code => { if (code && code !== 0) console.error('Local runtime stopped. Run npm.cmd test and npm.cmd run check:functions.'); process.exitCode = code ?? 0; });
  const stop = () => child.kill();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return child;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await startDevelopment({ keyless: process.argv.includes('--keyless') }); }
  catch { console.error('Development setup failed. Check dependencies and conflicting environment filenames; no secrets were displayed.'); process.exitCode = 1; }
}
