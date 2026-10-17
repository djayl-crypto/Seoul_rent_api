import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PROJECT_ROOT } from './build.mjs';
import { DISTRICTS, isDistrict } from '../src/config.js';
import { analysisPeriod } from '../src/analysis.js';

// This driver never reads .env or SEOUL_API_KEY. Only the Function calls the source API.
const args = process.argv.slice(2);
const base = process.env.SYNC_BASE_URL ?? 'http://127.0.0.1:8788';
const safeCodes = new Set(['SOURCE_NOT_CONFIGURED', 'SOURCE_AUTH_FAILED', 'SOURCE_LIMITED', 'SOURCE_INVALID_RESPONSE', 'SOURCE_UNAVAILABLE', 'SOURCE_CHANGED', 'INVALID_ARCHIVE', 'SYNC_CONFLICT', 'STORAGE_UNAVAILABLE', 'ADMIN_DISABLED', 'UNAUTHORIZED']);
try {
  const url = new URL(base);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('INVALID_BASE');
  let district, restart = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--gu' && !district) district = args[++i];
    else if (args[i] === '--restart' && !restart) restart = true;
    else throw new Error('INVALID_ARGUMENTS');
  }
  if (district && !isDistrict(district)) throw new Error('INVALID_ARGUMENTS');
  const directory = resolve(PROJECT_ROOT, '.generated', 'archives');
  const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
  if (!/^[a-f0-9-]{36}$/.test(manifest.runId) || manifest.period?.end !== analysisPeriod().end) throw new Error('PREPARE_DATA_FIRST');
  const headers = { 'Content-Type': 'application/json' };
  // Optional separate admin credential for remote operation, never a Seoul API key.
  if (process.env.SYNC_ADMIN_TOKEN) headers.Authorization = `Bearer ${process.env.SYNC_ADMIN_TOKEN}`;
  const request = async input => {
    let response;
    try { response = await fetch(new URL('/api/admin/sync', url), { method: 'POST', headers, body: JSON.stringify(input), signal: AbortSignal.timeout(90000), redirect: 'error' }); }
    catch { throw new Error('SYNC_CONNECTION_FAILED'); }
    let result;
    try { result = await response.json(); } catch { throw new Error('SYNC_CONNECTION_FAILED'); }
    if (!response.ok) throw new Error(safeCodes.has(result.error?.code) ? result.error.code : 'SYNC_REQUEST_FAILED');
    return result;
  };
  for (const code of district ? [district] : DISTRICTS.map(item => item.code)) {
    const archive = JSON.parse(await readFile(resolve(directory, manifest.runId, `${code}.json`), 'utf8'));
    let progress = await request({ action: 'start', district: code, archive, restart });
    for (let step = 0; progress.status !== 'complete'; step++) {
      if (step >= 20000 || progress.status === 'failed') throw new Error('SYNC_RUN_STOPPED');
      await new Promise(resolve => setTimeout(resolve, 550));
      try { progress = await request({ action: 'step', district: code, jobId: progress.jobId }); }
      catch (error) {
        if (error.message !== 'SYNC_CONFLICT') throw error;
        progress = await request({ action: 'status', district: code });
      }
      if (step % 10 === 0 || progress.status === 'complete') console.log(JSON.stringify({ district: code, phase: progress.phase, apiRows: progress.sourceRows, apiCalls: progress.sourceCalls }));
    }
    console.log(`Completed district ${code}.`);
  }
} catch (error) {
  const code = [...safeCodes, 'INVALID_BASE', 'INVALID_ARGUMENTS', 'PREPARE_DATA_FIRST', 'SYNC_CONNECTION_FAILED', 'SYNC_REQUEST_FAILED', 'SYNC_RUN_STOPPED'].includes(error.message) ? error.message : 'SYNC_SETUP_FAILED';
  console.error(`Collection stopped: ${code}. Fix the setup and rerun to resume; --restart discards the active run.`);
  process.exitCode = 1;
}
