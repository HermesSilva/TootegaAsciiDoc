// The production webview bundle in a real headless Chrome, typed into with trusted key events over the DevTools
// protocol. It sees what jsdom cannot: the browser's DOM, style, layout and paint. No dependency: an installed Chrome
// (or CHROME_PATH), Node's WebSocket and the dist/ that `node esbuild.mjs --production` writes.
//
//   node esbuild.mjs --production
//   node test/perf/browser.mjs baseline            (writes test/perf/results/browser-baseline.md and .json)
//   node test/perf/browser.mjs after baseline      (also compares with a previous label)
//
// Environment: PERF_COPIES=50 limits the sizes; PERF_PROFILE=1 prints a CPU profile of the typing (function names need
// an unminified bundle, which PERF_BUNDLE_DIR points at, instead of dist/webview); PERF_ONLY=regex limits the scenarios;
// PERF_CSS adds a stylesheet rule to try an idea without building.
//
// One run is noisy on a busy machine: to compare two builds, alternate them a few times and read the medians.
//
// Measures only: it fails when a key does not reach the document, never on a time.
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const resultsDir = path.join(root, 'test', 'perf', 'results');
const label = process.argv[2] ?? 'run';
const compareWith = process.argv[3];

const COPIES = process.env.PERF_COPIES ? process.env.PERF_COPIES.split(',').map(Number) : [1, 10, 50];
const PROFILE = Boolean(process.env.PERF_PROFILE);
const BUNDLE_DIR = process.env.PERF_BUNDLE_DIR ?? path.join(root, 'dist', 'webview');
const ONLY = process.env.PERF_ONLY ? new RegExp(process.env.PERF_ONLY) : null;
const BURST_KEYS = 25;
const ROUNDS = 4; // The first round warms the JIT and leaves no samples.
const KEY_GAP_MS = 30;
const PAUSE_MS = 600;
const TYPED = 'a rapida raposa marrom pula sobre o cao preguicoso e depois volta para casa com calma ate a noite no campo verde do sul sem pressa alguma';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error(`No Chrome found. Set CHROME_PATH. Tried: ${candidates.join(', ')}`);
  return found;
}

function sizedDocument(copies) {
  const source = fs.readFileSync(path.join(root, 'media', 'showcase', 'pt-BR', 'exemplo-completo.adoc'), 'utf8').replace(/\r\n/g, '\n');
  const split = source.indexOf('\n\n');
  const text = source.slice(0, split) + source.slice(split).repeat(copies);
  const kb = Buffer.byteLength(text, 'utf8') / 1024;
  return { label: `${kb.toFixed(0)} KB, ${text.split('\n').length} lines`, text };
}

function statsOf(values) {
  if (values.length === 0) throw new Error('statsOf: no samples were taken');
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
  return { samples: sorted.length, median: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] };
}

class Page {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.waiters = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        const { resolve, reject, method } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${method}: ${message.error.message}`));
        else resolve(message.result);
      } else if (this.waiters.has(message.method)) {
        this.waiters.get(message.method)();
        this.waiters.delete(message.method);
      }
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method) {
    return new Promise((resolve) => this.waiters.set(method, resolve));
  }

  async evaluate(expression) {
    const { result, exceptionDetails } = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(`In the page: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
    return result.value;
  }

  async metrics() {
    const { metrics } = await this.send('Performance.getMetrics');
    const value = (name) => (metrics.find((metric) => metric.name === name)?.value ?? 0) * 1000;
    return { task: value('TaskDuration'), script: value('ScriptDuration'), layout: value('LayoutDuration'), style: value('RecalcStyleDuration') };
  }

  async key(character) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key: character, text: character, unmodifiedText: character });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: character });
  }
}

/** Installed before the bundle: the VS Code API stub, and a latency probe from keydown to just after the next paint. */
const PRELUDE = `
window.__posted = [];
window.__latency = [];
let __state;
window.acquireVsCodeApi = () => ({ postMessage: (m) => window.__posted.push(m), getState: () => __state, setState: (s) => { __state = s; } });
window.__TOOTEGA_BOOT__ = { view: 'editor', locale: 'pt-BR' };
window.__afterPaint = () => new Promise((resolve) => requestAnimationFrame(() => { const c = new MessageChannel(); c.port1.onmessage = () => resolve(); c.port2.postMessage(0); }));
document.addEventListener('keydown', () => { const t0 = performance.now(); window.__afterPaint().then(() => window.__latency.push(performance.now() - t0)); }, true);
window.__lastEdit = () => { for (let i = window.__posted.length - 1; i >= 0; i--) if (window.__posted[i].type === 'edit') return window.__posted[i].text; return null; };
`;

function writeShell(dir, doc, copies) {
  const docFile = path.join(dir, `doc-${copies}.js`);
  const preludeFile = path.join(dir, 'prelude.js');
  fs.writeFileSync(preludeFile, PRELUDE, 'utf8');
  fs.writeFileSync(docFile, `window.__DOC = ${JSON.stringify(doc.text)};`, 'utf8');
  const href = (file) => pathToFileURL(file).href;
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><link href="${href(path.join(root, 'dist', 'webview', 'main.css'))}" rel="stylesheet"><style>${process.env.PERF_CSS ?? ''}</style></head>
<body><div id="root"></div><script src="${href(preludeFile)}"></script><script src="${href(docFile)}"></script><script src="${href(path.join(BUNDLE_DIR, 'main.js'))}"></script></body></html>`;
  const shell = path.join(dir, `shell-${copies}.html`);
  fs.writeFileSync(shell, html, 'utf8');
  return pathToFileURL(shell).href;
}

/** Waits until the main thread has been idle for a while: a fixed sleep would let work leak into the next measure. */
async function untilQuiet(page) {
  let last = (await page.metrics()).task;
  for (let quiet = 0, tries = 0; quiet < 3 && tries < 300; tries++) {
    await sleep(100);
    const now = (await page.metrics()).task;
    quiet = now - last < 3 ? quiet + 1 : 0;
    last = now;
  }
}

async function open(page, url, mode) {
  const loaded = page.once('Page.loadEventFired');
  await page.send('Page.navigate', { url });
  await loaded;
  const dir = pathToFileURL(path.join(root, 'media', 'showcase', 'pt-BR')).href + '/';
  const before = await page.metrics();
  const elapsed = await page.evaluate(`(async () => {
    const t0 = performance.now();
    window.postMessage({ type: 'init', view: 'editor', text: window.__DOC, version: 1, uri: 'file:///perf.adoc', fileName: 'perf.adoc', documentDirUri: ${JSON.stringify(dir)}, locale: 'pt-BR', mode: ${JSON.stringify(mode)}, readOnly: false, structureOpen: false, allowRemoteImages: false }, '*');
    const on = ${JSON.stringify(mode)} === 'code' ? 'textarea.adc-codigo-textarea' : 'p[data-folha]';
    while (!document.querySelector(on)) await new Promise((r) => setTimeout(r, 1));
    await window.__afterPaint();
    return performance.now() - t0;
  })()`);
  await untilQuiet(page);
  const after = await page.metrics();
  return { elapsed, task: after.task - before.task };
}

const placeInVisual = (which) => `(async () => {
  const all = [...document.querySelectorAll('p[data-folha]')].filter((e) => e.textContent.length > 20);
  const leaf = ${which === 'first' ? 'all[0]' : 'all[all.length - 1]'};
  leaf.scrollIntoView({ block: 'center' });
  leaf.closest('[contenteditable="true"]').focus();
  const walker = document.createTreeWalker(leaf, NodeFilter.SHOW_TEXT);
  let last = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) last = n;
  window.getSelection().collapse(last, last.length);
  await window.__afterPaint();
  return true;
})()`;

const placeInCode = (where) => `(async () => {
  const area = document.querySelector('textarea.adc-codigo-textarea');
  const text = area.value;
  const prose = /^[A-Z][^|\\n]{20,}\\.$/gm;
  let offset = -1;
  for (let m = prose.exec(text); m; m = prose.exec(text)) { offset = m.index + m[0].length; if (${where === 'start'}) break; }
  area.focus();
  area.setSelectionRange(offset, offset);
  const scroller = document.querySelector('.adc-codigo-rolagem');
  scroller.scrollTop = Math.max(0, text.slice(0, offset).split('\\n').length * 22 - 400);
  await new Promise((r) => setTimeout(r, 50));
  area.dispatchEvent(new Event('select', { bubbles: true }));
  await window.__afterPaint();
  return true;
})()`;

/** Types the bursts; proves each one reached the host message; returns latency and where the time went. */
function printProfile(profile) {
  const self = new Map();
  const interval = profile.timeDeltas.reduce((a, b) => a + b, 0) / profile.samples.length / 1000;
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  for (const id of profile.samples) {
    const { functionName, url, lineNumber } = byId.get(id).callFrame;
    const key = `${functionName || '(anonymous)'} ${url ? `${url.split('/').pop()}:${lineNumber + 1}` : ''}`.trim();
    self.set(key, (self.get(key) ?? 0) + interval);
  }
  const total = [...self.entries()].filter(([name]) => !name.startsWith('(idle') && !name.startsWith('(program')).reduce((sum, [, ms]) => sum + ms, 0);
  process.stdout.write(`  profile, ${total.toFixed(0)} ms of script:\n`);
  for (const [name, ms] of [...self.entries()].filter(([key]) => !key.startsWith('(idle')).sort((a, b) => b[1] - a[1]).slice(0, 16))
    process.stdout.write(`    ${ms.toFixed(0).padStart(7)} ms  ${name}\n`);
}

async function typeBursts(page) {
  let keys = 0;
  const sum = { task: 0, script: 0, layoutStyle: 0, pause: 0 };
  let cursor = 0;
  await page.evaluate('window.__latency.length = 0');
  let latency = [];
  for (let round = 0; round < ROUNDS; round++) {
    const burst = TYPED.slice(cursor, cursor + BURST_KEYS);
    cursor += BURST_KEYS;
    if (PROFILE && round === 1) {
      await page.send('Profiler.enable');
      await page.send('Profiler.setSamplingInterval', { interval: 200 });
      await page.send('Profiler.start');
    }
    const before = await page.metrics();
    for (const character of burst) {
      await page.key(character);
      await sleep(KEY_GAP_MS);
    }
    const typed = await page.metrics();
    await sleep(PAUSE_MS);
    const paused = await page.metrics();
    const lastEdit = await page.evaluate('window.__lastEdit()');
    if (lastEdit === null || !lastEdit.includes(burst)) throw new Error(`The burst "${burst}" did not reach the document.`);
    const collected = await page.evaluate('window.__latency.splice(0)');
    if (round > 0) {
      latency = latency.concat(collected);
      keys += burst.length;
      sum.task += typed.task - before.task;
      sum.script += typed.script - before.script;
      sum.layoutStyle += typed.layout + typed.style - before.layout - before.style;
      sum.pause += paused.task - typed.task;
    }
  }
  if (PROFILE) printProfile((await page.send('Profiler.stop')).profile);
  const rounds = ROUNDS - 1;
  return {
    latency: statsOf(latency),
    taskPerKey: sum.task / keys,
    scriptPerKey: sum.script / keys,
    layoutStylePerKey: sum.layoutStyle / keys,
    pauseTask: sum.pause / rounds,
  };
}

async function hostMessage(page, message) {
  const before = await page.metrics();
  await page.evaluate(`(async () => { window.postMessage(${message}, '*'); await new Promise((r) => setTimeout(r, 0)); await window.__afterPaint(); })()`);
  await untilQuiet(page);
  return (await page.metrics()).task - before.task;
}

async function main() {
  fs.mkdirSync(resultsDir, { recursive: true });
  if (!fs.existsSync(path.join(BUNDLE_DIR, 'main.js'))) throw new Error(`${path.join(BUNDLE_DIR, 'main.js')} is missing: run node esbuild.mjs --production first.`);
  const bundle = fs.readFileSync(path.join(BUNDLE_DIR, 'main.js'), 'utf8');
  if (bundle.includes('react.development') || /Warning: Each child in a list/.test(bundle)) throw new Error('dist/webview/main.js is a development build: run node esbuild.mjs --production first.');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tootega-browser-perf-'));
  const chrome = spawn(findChrome(), [
    '--headless=new', `--user-data-dir=${path.join(tmp, 'profile')}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--window-size=1400,1000',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--allow-file-access-from-files', 'about:blank',
  ], { stdio: 'ignore' });
  const results = [];
  try {
    const portFile = path.join(tmp, 'profile', 'DevToolsActivePort');
    for (let i = 0; i < 200 && !fs.existsSync(portFile); i++) await sleep(50);
    if (!fs.existsSync(portFile)) throw new Error('Chrome did not open its debugging port.');
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve);
      socket.addEventListener('error', () => reject(new Error('Could not reach Chrome over the DevTools protocol.')));
    });
    const page = new Page(socket);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Performance.enable');
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    const version = await page.evaluate('navigator.userAgent');

    for (const copies of COPIES) {
      const doc = sizedDocument(copies);
      const url = writeShell(tmp, doc, copies);
      const scenarios = [
        ['Visual, first paragraph', 'visual', placeInVisual('first')],
        ['Visual, last paragraph', 'visual', placeInVisual('last')],
        ['Code, cursor at the start', 'code', placeInCode('start')],
        ['Code, cursor at the end', 'code', placeInCode('end')],
        ['Split, typing in the code', 'split', placeInCode('start')],
        ['Split, typing in the visual', 'split', placeInVisual('first')],
      ];
      for (const [name, mode, place] of scenarios) {
        if (ONLY && !ONLY.test(name)) continue;
        const opened = await open(page, url, mode);
        await page.evaluate(place);
        const typed = await typeBursts(page);
        results.push({ document: doc.label, scenario: name, openedMs: opened.elapsed, ...typed });
        process.stdout.write(`${doc.label} | ${name} | key ${typed.latency.median.toFixed(1)} ms, task/key ${typed.taskPerKey.toFixed(1)} ms, after pause ${typed.pauseTask.toFixed(1)} ms\n`);
      }
      if (ONLY) continue;
      await open(page, url, 'visual');
      const update = await hostMessage(page, `{ type: 'update', text: window.__DOC + '\\n\\nAlteracao externa.\\n', version: 2 }`);
      const toCode = await hostMessage(page, `{ type: 'setMode', mode: 'code' }`);
      const toVisual = await hostMessage(page, `{ type: 'setMode', mode: 'visual' }`);
      results.push({ document: doc.label, scenario: 'Host messages', updateTask: update, toCodeTask: toCode, toVisualTask: toVisual });
      process.stdout.write(`${doc.label} | update ${update.toFixed(0)} ms, to code ${toCode.toFixed(0)} ms, to visual ${toVisual.toFixed(0)} ms\n`);
    }
    socket.close();

    const output = { label, date: new Date().toISOString(), userAgent: version, results };
    fs.writeFileSync(path.join(resultsDir, `browser-${label}.json`), JSON.stringify(output, null, 2), 'utf8');
    const baseline = compareWith ? JSON.parse(fs.readFileSync(path.join(resultsDir, `browser-${compareWith}.json`), 'utf8')) : null;
    fs.writeFileSync(path.join(resultsDir, `browser-${label}.md`), render(output, baseline), 'utf8');
    process.stdout.write(`\nReport: ${path.join(resultsDir, `browser-${label}.md`)}\n`);
  } finally {
    chrome.kill();
    await sleep(500);
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

function render(output, baseline) {
  const f = (value) => (value >= 100 ? value.toFixed(0) : value.toFixed(1));
  const before = (result, field) => {
    const old = baseline?.results.find((candidate) => candidate.document === result.document && candidate.scenario === result.scenario);
    if (!old) return '';
    const value = field.split('.').reduce((object, key) => object?.[key], old);
    return value === undefined ? '' : ` (was ${f(value)})`;
  };
  const lines = [`# Real browser: ${output.label}`, '', output.date, output.userAgent, '', 'Latency: from keydown to just after the next paint, so it is never below the frame wait. Task, script, layout and style are per key, while typing. After pause: main-thread task time of the debounced work, per burst.', ''];
  lines.push('| Document | Scenario | Open ms | Latency median | Latency p95 | Task/key | Script/key | Layout+style/key | After pause |', '|---|---|--:|--:|--:|--:|--:|--:|--:|');
  for (const r of output.results.filter((result) => result.latency))
    lines.push(`| ${r.document} | ${r.scenario} | ${f(r.openedMs)}${before(r, 'openedMs')} | ${f(r.latency.median)}${before(r, 'latency.median')} | ${f(r.latency.p95)}${before(r, 'latency.p95')} | ${f(r.taskPerKey)}${before(r, 'taskPerKey')} | ${f(r.scriptPerKey)}${before(r, 'scriptPerKey')} | ${f(r.layoutStylePerKey)}${before(r, 'layoutStylePerKey')} | ${f(r.pauseTask)}${before(r, 'pauseTask')} |`);
  lines.push('', '| Document | External update | Visual to Code | Code to Visual |', '|---|--:|--:|--:|');
  for (const r of output.results.filter((result) => result.scenario === 'Host messages'))
    lines.push(`| ${r.document} | ${f(r.updateTask)}${before(r, 'updateTask')} | ${f(r.toCodeTask)}${before(r, 'toCodeTask')} | ${f(r.toVisualTask)}${before(r, 'toVisualTask')} |`);
  return `${lines.join('\n')}\n`;
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
