// Formula oracle (Docs/PLAN-formulas.md, DF-5): compares the house engine's MathML with KaTeX's MathML output over a
// corpus of TeX formulas. KaTeX is fetched with `npm pack` into a temporary folder and is NEVER a dependency of this
// repository. Differences are reported structurally (element names and text, attributes ignored), with an allow-list
// of deliberate divergences documented in Docs/fidelidade-formulas.md.
//
//   node scripts/formula-oracle.mjs [corpus.json] [--verbose]
//
// The corpus is a JSON array of TeX strings (default: scripts/formula-corpus.json). Exit code 1 when a formula that
// is not in the allow-list differs.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const root = path.resolve(here, '..');
const corpusPath = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(here, 'formula-corpus.json');
const verbose = process.argv.includes('--verbose');
const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));

// 1. KaTeX into a temp folder (cached between runs by version).
const tmp = path.join(os.tmpdir(), 'tootega-formula-oracle');
fs.mkdirSync(tmp, { recursive: true });
let katexDir = fs.existsSync(path.join(tmp, 'package', 'dist', 'katex.js')) ? path.join(tmp, 'package') : null;
if (!katexDir) {
  console.log('[oracle] fetching KaTeX with npm pack into', tmp);
  const tgz = execSync('npm pack katex --pack-destination "' + tmp + '"', { encoding: 'utf8' }).trim().split('\n').pop();
  execSync(`tar -xzf "${path.join(tmp, tgz)}" -C "${tmp}"`);
  katexDir = path.join(tmp, 'package');
}
const katexModule = await import(pathToFileURL(path.join(katexDir, 'dist', 'katex.mjs')).href);
const katex = katexModule.default ?? katexModule;
const katexVersion = JSON.parse(fs.readFileSync(path.join(katexDir, 'package.json'), 'utf8')).version;

// 2. Our engine, bundled on the fly.
const bundle = path.join(tmp, 'engine.mjs');
await esbuild.build({ entryPoints: [path.join(root, 'TootegaWebUI/src/lib/formula/index.ts')], bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'error' });
const engine = await import(pathToFileURL(bundle).href + '?t=' + Date.now());

// 3. Normalisation: parse the XML into a tree, drop attributes, semantics/annotation and every mrow that has a single
//    child (or is empty), merge adjacent mtext/mn, decode entities — then print the skeleton.
function parse(xml) {
  const root = { name: 'root', children: [] };
  const stack = [root];
  const re = /<(\/?)([\w:-]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    if (m[5] !== undefined) {
      const text = decode(m[5]).replace(/\s+/g, '');
      if (text) stack[stack.length - 1].children.push(text);
      continue;
    }
    if (m[1] === '/') { stack.pop(); continue; }
    const node = { name: m[2], children: [] };
    stack[stack.length - 1].children.push(node);
    if (m[4] !== '/') stack.push(node);
  }
  return root;
}
// Deliberate, documented divergences are folded here (Docs/fidelidade-formulas.md): math alphanumerics vs
// mathvariant (NFKC), `|` vs U+2223, prime ligatures, spacing-accent code points, mtext-vs-mspace for thin spaces.
function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/\u00a0/g, ' ')
    .replace(/\u2061|\u2062|\u2063|\u0338/g, '')
    .replace(/\u2223/g, '|').replace(/\u2225/g, '‖')
    .replace(/\u2033/g, '′′').replace(/\u2034/g, '′′′').replace(/\u2057/g, '′′′′')
    .replace(/\u02c9/g, '¯').replace(/\u02dc/g, '~').replace(/\u02c6/g, '^')
    .replace(/\u2212/g, '-')
    .normalize('NFKC');
}
const SPACE_LIKE = new Set(['mspace', 'mtext']);
function normalize(node) {
  if (typeof node === 'string') return [node];
  if (node.name === 'annotation') return [];
  if (node.name === 'menclose') node = { name: 'mrow', children: node.children };
  if (SPACE_LIKE.has(node.name) && node.children.every((c) => typeof c === 'string' && c.trim() === '')) return [{ name: 'mspace', children: [] }];
  let children = node.children.flatMap(normalize);
  // merge adjacent text-bearing leaves of the same kind
  const merged = [];
  for (const c of children) {
    const prev = merged[merged.length - 1];
    if (prev && typeof prev !== 'string' && typeof c !== 'string' && prev.name === c.name && (c.name === 'mtext' || c.name === 'mn') && prev.children.every((x) => typeof x === 'string') && c.children.every((x) => typeof x === 'string')) {
      prev.children = [prev.children.join('') + c.children.join('')];
      continue;
    }
    merged.push(c);
  }
  children = merged;
  if (node.name === 'mrow' || node.name === 'semantics' || node.name === 'mstyle' || node.name === 'mpadded') {
    if (children.length === 0) return [];
    if (children.length === 1) return children;
    if (node.name !== 'mrow') return [{ name: 'mrow', children }];
  }
  // Leaf kind (mi/mo/mn/mtext) is a rendering choice, not structure: KaTeX wraps `\mathop{x}` in <mo><mi>…</mi></mo>,
  // we emit <mo>x</mo>; both are leaves with the same text.
  if (node.name === 'mi' || node.name === 'mo' || node.name === 'mn' || node.name === 'mtext') {
    if (children.every((c) => typeof c === 'string')) return [{ name: 'leaf', children }];
    return children;
  }
  return [{ name: node.name, children }];
}
function print(nodes) {
  return nodes.map((n) => (typeof n === 'string' ? n : `<${n.name}>${print(n.children)}</${n.name}>`)).join('');
}
function findMath(node) {
  if (typeof node === 'string') return null;
  if (node.name === 'math') return node;
  for (const c of node.children) {
    const found = findMath(c);
    if (found) return found;
  }
  return null;
}
function skeleton(xml) {
  const root = parse(xml);
  const math = findMath(root) ?? root;
  return print(math.children.flatMap(normalize));
}

const allow = fs.existsSync(path.join(here, 'formula-oracle-allow.json')) ? JSON.parse(fs.readFileSync(path.join(here, 'formula-oracle-allow.json'), 'utf8')) : [];
let same = 0;
let differ = 0;
let allowed = 0;
const diffs = [];
for (const source of corpus) {
  let reference;
  try {
    reference = katex.renderToString(source, { output: 'mathml', displayMode: true, throwOnError: false, trust: true, strict: false });
  } catch (e) {
    reference = `<math>ERROR ${e.message}</math>`;
  }
  const ours = engine.renderizarFormula(source, { notacao: 'latexmath', bloco: true, anotar: false }).mathml;
  const a = skeleton(reference);
  const b = skeleton(ours);
  if (a === b) same += 1;
  else if (allow.includes(source)) allowed += 1;
  else {
    differ += 1;
    diffs.push({ source, katex: a, ours: b });
  }
}
console.log(`[oracle] KaTeX ${katexVersion}: ${corpus.length} formulas — ${same} identical, ${allowed} allowed divergences, ${differ} differ`);
const report = path.join(tmp, 'report.txt');
fs.writeFileSync(report, diffs.map((d) => `--- ${d.source}\n  katex: ${d.katex}\n  ours:  ${d.ours}\n`).join('\n'), 'utf8');
console.log(`[oracle] report: ${report}`);
for (const d of diffs) {
  console.log(`\n--- ${d.source}`);
  if (verbose || diffs.length <= 40) {
    console.log('  katex:', d.katex);
    console.log('  ours: ', d.ours);
  }
}
process.exit(differ > 0 ? 1 : 0);
