import { build } from 'esbuild';
import fs from 'node:fs';
const ext = 'dist/extension', site = 'dist/site';
fs.rmSync('dist', { recursive: true, force: true });
fs.mkdirSync(`${ext}/vendor`, { recursive: true }); fs.mkdirSync(site, { recursive: true });
const common = { bundle: true, format: 'esm', target: 'chrome116', minify: true, legalComments: 'none' };
await build({ ...common, minify: false, entryPoints: { background: 'src/ext/background.js', popup: 'src/ext/popup.js', offscreen: 'src/ext/offscreen.js', app: 'src/site/app.js' }, outdir: ext });
for (const f of ['manifest.json', 'popup.html', 'popup.css', 'offscreen.html']) fs.copyFileSync(`src/ext/${f}`, `${ext}/${f}`);
fs.copyFileSync('src/site/index.html', `${ext}/dashboard.html`);
fs.copyFileSync('src/site/app.css', `${ext}/app.css`);
fs.cpSync('src/ext/icons', `${ext}/icons`, { recursive: true });
for (const f of ['ort-wasm-simd-threaded.asyncify.wasm', 'ort-wasm-simd-threaded.asyncify.mjs']) fs.copyFileSync(`node_modules/onnxruntime-web/dist/${f}`, `${ext}/vendor/${f}`);
// standalone single-file website
const r = await build({ ...common, entryPoints: ['src/site/app.js'], write: false });
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
let html = fs.readFileSync('src/site/index.html', 'utf8');
html = html.replace('<link rel="stylesheet" href="app.css">', `<style>${fs.readFileSync('src/site/app.css', 'utf8')}</style>`)
  .replace('<script type="module" src="app.js"></script>', () => `<script type="module">${js}</script>`);
fs.writeFileSync(`${site}/index.html`, html);
console.log('built');
