import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build, PUBLIC_FILES, STATIC_FILES } from '../scripts/build.mjs';
import { developmentEnvironment } from '../scripts/dev.mjs';

test('static build only publishes allowlisted files, ignoring root secrets and inherited variables', async () => {
  const fixture = await mkdtemp(resolve('.test-build-'));
  try {
    await mkdir(resolve(fixture, 'public'));
    for (const file of STATIC_FILES) await writeFile(resolve(fixture, 'public', file), file === 'app.js' ? 'export const ready = true;' : 'public fixture');
    await writeFile(resolve(fixture, '.env'), 'SEOUL_API_KEY=synthetic-build-sentinel');
    await build(fixture);
    assert.deepEqual((await readdir(resolve(fixture, 'dist'))).sort(), [...PUBLIC_FILES].sort());
    const output = await readFile(resolve(fixture, 'dist/app.js'), 'utf8');
    assert.ok(!output.includes('synthetic-build-sentinel'));
    assert.ok((await readFile(resolve(fixture, 'dist/plotly.min.js'), 'utf8')).includes('Plotly'));
    assert.ok((await readFile(resolve(fixture, 'dist/plotly.css'), 'utf8')).includes('.js-plotly-plot .plotly'));
    assert.ok((await readFile(resolve(fixture, 'dist/leaflet.js'), 'utf8')).includes('1.9.4'));
    assert.ok((await readFile(resolve(fixture, 'dist/leaflet.css'), 'utf8')).includes('leaflet-layers.png'));
    assert.ok((await readFile(resolve(fixture, 'dist/leaflet-marker-icon.png'))).length > 100);
    await writeFile(resolve(fixture, 'public/.env'), 'synthetic-private-file');
    await assert.rejects(build(fixture), /Unexpected public asset/);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});

test('keyless development disables dotenv and drops inherited secrets; normal development also drops inherited keys', () => {
  const inherited = { PATH: 'safe-path', SEOUL_API_KEY: 'synthetic', ADMIN_TOKEN: 'synthetic', WRANGLER_LOG: 'debug', CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true', NODE_OPTIONS: '--require=unsafe-module' };
  const keyless = developmentEnvironment(inherited, true);
  assert.equal(keyless.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV, 'false');
  assert.equal(keyless.CLOUDFLARE_INCLUDE_PROCESS_ENV, 'false');
  assert.equal(keyless.SEOUL_API_KEY, undefined);
  assert.equal(keyless.ADMIN_TOKEN, undefined);
  assert.equal(keyless.NODE_OPTIONS, undefined);
  assert.equal(keyless.WRANGLER_LOG, 'none');
  assert.equal(keyless.WRANGLER_WRITE_LOGS, 'false');
  assert.equal(developmentEnvironment(inherited, false).CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV, 'true');
});
