import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { developmentEnvironment } from './dev.mjs';
import { PROJECT_ROOT } from './build.mjs';

// Always keyless. Compile Functions separately from the static output directory.
const result = spawnSync(process.execPath, [resolve(PROJECT_ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'pages', 'functions', 'build', 'functions', '--outdir', '.check-output'], {
  cwd: PROJECT_ROOT, env: developmentEnvironment(process.env, true), stdio: 'ignore', windowsHide: true,
});
if (result.status !== 0) { console.error('Function compilation failed. Check Functions imports and Wrangler compatibility.'); process.exitCode = 1; }
else console.log('Pages Functions compiled successfully (keyless).');
