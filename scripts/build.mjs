import { lstat, readdir, mkdir, copyFile, rm, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

export const STATIC_FILES = ['index.html', 'app.js', 'client.js', 'chart-model.js', 'region-model.js', 'charts.js', 'styles.css', 'analysis.css', 'regions.css', 'map.js', 'map-model.js', 'map.css', 'seoul-districts.geojson', 'PretendardVariable.woff2', 'Pretendard-LICENSE.txt', '_headers', '_routes.json', '404.html'];
const LEAFLET_IMAGES = ['layers.png','layers-2x.png','marker-icon.png','marker-icon-2x.png','marker-shadow.png'];
export const PUBLIC_FILES = [...STATIC_FILES, 'plotly.min.js', 'plotly.css', 'plotly-LICENSE.txt', 'leaflet.js', 'leaflet.css', 'leaflet-LICENSE.txt', ...LEAFLET_IMAGES.map(name=>`leaflet-${name}`)];
export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function build(root = PROJECT_ROOT) {
  const source = resolve(root, 'public');
  const target = resolve(root, 'dist');
  if ((await lstat(source)).isSymbolicLink()) throw new Error('Public directory cannot be a link');
  const names = await readdir(source);
  if (names.length !== STATIC_FILES.length || names.some(name => !STATIC_FILES.includes(name))) throw new Error('Unexpected public asset');
  for (const file of STATIC_FILES) {
    const entry = await lstat(resolve(source, file));
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('Public assets must be regular files');
  }
  // A fixed child of the supplied project root: never delete an interpolated arbitrary path.
  if (target !== resolve(root, 'dist')) throw new Error('Invalid output directory');
  try {
    if ((await lstat(target)).isSymbolicLink()) throw new Error('Output directory cannot be a link');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await rm(target, { recursive: true, force: true });
  await mkdir(target);
  for (const file of STATIC_FILES) await copyFile(resolve(source, file), resolve(target, file));
  // Fixed local dependency paths only. Do not read dotenv or inject build environment values.
  const vendor = resolve(PROJECT_ROOT, 'node_modules/plotly.js-basic-dist-min');
  const bundle = await readFile(resolve(vendor, 'plotly-basic.min.js'), 'utf8');
  const version = JSON.parse(await readFile(resolve(vendor, 'package.json'), 'utf8')).version;
  if (version !== '4.1.2') throw new Error('Unexpected Plotly version');
  // Plotly supports a no-inline-styles link. Read its pinned CSS object in a bounded,
  // isolated build context (no process/fs/network). No browser eval or inline styles.
  const start = bundle.indexOf('{"X,X div":'), end = bundle.indexOf('};for(', start) + 1;
  if (start < 0 || end <= start) throw new Error('Plotly CSS data unavailable');
  const rules = runInNewContext(`(${bundle.slice(start, end)})`, Object.create(null), { timeout: 1000, contextCodeGeneration: { strings: false, wasm: false } });
  const css = Object.entries(rules).map(([selector, style]) => `${selector.replace(/^,/, ' ,').replace(/X/g, '.js-plotly-plot .plotly').replace(/Y/g, '.plotly-notifier')}{${style}}`).join('\n');
  await copyFile(resolve(vendor, 'plotly-basic.min.js'), resolve(target, 'plotly.min.js'));
  await copyFile(resolve(vendor, 'LICENSE'), resolve(target, 'plotly-LICENSE.txt'));
  await writeFile(resolve(target, 'plotly.css'), `/* Plotly.js 4.1.2 — MIT, see plotly-LICENSE.txt */\n${css}\n`);
  const leaflet = resolve(PROJECT_ROOT, 'node_modules/leaflet');
  if (JSON.parse(await readFile(resolve(leaflet, 'package.json'), 'utf8')).version !== '1.9.4') throw new Error('Unexpected Leaflet version');
  await copyFile(resolve(leaflet, 'dist/leaflet.js'), resolve(target, 'leaflet.js'));
  await copyFile(resolve(leaflet, 'LICENSE'), resolve(target, 'leaflet-LICENSE.txt'));
  const leafletCss = await readFile(resolve(leaflet, 'dist/leaflet.css'), 'utf8');
  await writeFile(resolve(target, 'leaflet.css'), leafletCss.replaceAll('images/', 'leaflet-'));
  for (const name of LEAFLET_IMAGES) await copyFile(resolve(leaflet, 'dist/images', name), resolve(target, `leaflet-${name}`));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await build(); console.log(`Static build complete: ${PUBLIC_FILES.length} public assets.`); }
  catch { console.error('Static build failed. Check the public asset allowlist.'); process.exitCode = 1; }
}
