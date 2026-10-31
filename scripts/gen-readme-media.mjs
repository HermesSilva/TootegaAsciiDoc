// Generates the Marketplace README media (media/readme/*.png): stylised illustrations of the editor drawn as SVG and
// rasterised with @resvg/resvg-js (already a devDependency, used by gen-icon.mjs), plus an animated PNG (APNG) of the
// Split mode typing. No screenshot tool, no extra dependency: the APNG is assembled chunk by chunk from the frames.
// Usage: node scripts/gen-readme-media.mjs
import { Resvg } from '@resvg/resvg-js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'media', 'readme');
fs.mkdirSync(out, { recursive: true });

// ----------------------------------------------------------------------------- palette (VS Code Dark Modern)
const C = {
  bg: '#1f1f1f', panel: '#181818', border: '#2b2b2b', bar: '#181818', text: '#cccccc', dim: '#8b8b8b', accent: '#0078d4',
  accent2: '#2ea043', kw: '#569cd6', str: '#ce9178', macro: '#dcdcaa', attr: '#9cdcfe', title: '#4ec9b0', sel: '#264f78',
  white: '#ffffff', paper: '#ffffff', ink: '#1e1e1e', inkDim: '#6b6b6b', brand: '#0e7490', brandLight: '#cffafe',
};
const UI = 'Segoe UI, Arial, sans-serif';
const MONO = 'Consolas, Cascadia Mono, monospace';
const MATH = 'Cambria Math, Latin Modern Math, serif';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ----------------------------------------------------------------------------- pieces
function window(w, h, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b3d5c"/><stop offset="1" stop-color="#0e7490"/></linearGradient>
    <filter id="sh" x="-5%" y="-5%" width="110%" height="115%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000" flood-opacity="0.45"/></filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <g filter="url(#sh)">
    <rect x="40" y="40" width="${w - 80}" height="${h - 80}" rx="10" fill="${C.bg}" stroke="${C.border}"/>
    <rect x="40" y="40" width="${w - 80}" height="36" rx="10" fill="${C.bar}"/>
    <rect x="40" y="66" width="${w - 80}" height="10" fill="${C.bar}"/>
    <circle cx="62" cy="58" r="6" fill="#ff5f57"/><circle cx="82" cy="58" r="6" fill="#febc2e"/><circle cx="102" cy="58" r="6" fill="#28c840"/>
    <text x="${w / 2}" y="63" text-anchor="middle" font-family="${UI}" font-size="13" fill="${C.dim}">${esc(title)}</text>
    ${body}
  </g>
</svg>`;
}

/** The editor toolbar: groups of small glyph buttons plus the mode switch. */
function toolbar(x, y, w, mode) {
  const btn = (bx, label, on = false, mono = false) =>
    `<rect x="${bx}" y="${y + 6}" width="26" height="26" rx="5" fill="${on ? C.accent : 'none'}"/><text x="${bx + 13}" y="${y + 24}" text-anchor="middle" font-family="${mono ? MONO : UI}" font-size="${mono ? 13 : 14}" font-weight="${label === 'B' ? 700 : 400}" fill="${on ? C.white : C.text}">${esc(label)}</text>`;
  const groups = [['B', 'I', 'M', 'H'], ['•', '1.', '☑', '≡'], ['🔗', '🖼', '▦', '{ }', '∑'], ['⋯']];
  let bx = x + 10;
  let s = `<rect x="${x}" y="${y}" width="${w}" height="38" fill="${C.panel}" stroke="${C.border}"/>`;
  s += `<rect x="${bx}" y="${y + 6}" width="110" height="26" rx="5" fill="#2a2a2a" stroke="${C.border}"/><text x="${bx + 10}" y="${y + 24}" font-family="${UI}" font-size="13" fill="${C.text}">Paragraph ▾</text>`;
  bx += 122;
  for (const g of groups) {
    for (const l of g) {
      s += btn(bx, l, false, l === 'M' || l === '{ }');
      bx += 30;
    }
    s += `<line x1="${bx + 2}" y1="${y + 10}" x2="${bx + 2}" y2="${y + 28}" stroke="${C.border}"/>`;
    bx += 10;
  }
  const modes = ['Visual', 'Code', 'Split'];
  let mx = x + w - 10 - modes.length * 64;
  for (const m of modes) {
    const on = m === mode;
    s += `<rect x="${mx}" y="${y + 6}" width="60" height="26" rx="5" fill="${on ? C.accent : '#2a2a2a'}"/><text x="${mx + 30}" y="${y + 24}" text-anchor="middle" font-family="${UI}" font-size="13" fill="${on ? C.white : C.text}">${m}</text>`;
    mx += 64;
  }
  return s;
}

/** Highlighted AsciiDoc code lines (array of arrays of [text, color]). */
function codePane(x, y, w, h, lines, cursorLine = -1, cursorCol = 0) {
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.bg}"/>`;
  const lh = 24;
  lines.forEach((line, i) => {
    const ly = y + 16 + i * lh;
    if (i === cursorLine)
      s += `<rect x="${x}" y="${ly - 2}" width="${w}" height="${lh}" fill="#ffffff0d"/>`;
    s += `<text x="${x + 14}" y="${ly + 14}" text-anchor="end" font-family="${MONO}" font-size="13" fill="#5a5a5a">${i + 1}</text>`;
    let cx = x + 30;
    let text = `<text x="${cx}" y="${ly + 14}" font-family="${MONO}" font-size="14" xml:space="preserve">`;
    for (const [t, col] of line)
      text += `<tspan fill="${col ?? C.text}">${esc(t)}</tspan>`;
    text += '</text>';
    s += text;
    if (i === cursorLine)
      s += `<rect x="${cx + cursorCol * 7.7}" y="${ly}" width="2" height="18" fill="${C.white}"/>`;
  });
  return s;
}

/** Rendered document pane (light "paper"). */
function viewPane(x, y, w, h, blocks, ghost = null) {
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.paper}"/>`;
  let cy = y + 28;
  for (const b of blocks) {
    if (b.type === 'h1') {
      s += `<text x="${x + 36}" y="${cy + 18}" font-family="${UI}" font-size="26" font-weight="600" fill="${C.ink}">${esc(b.text)}</text>`;
      cy += 44;
      s += `<line x1="${x + 36}" y1="${cy - 8}" x2="${x + w - 36}" y2="${cy - 8}" stroke="#e5e5e5"/>`;
    } else if (b.type === 'h2') {
      s += `<text x="${x + 36}" y="${cy + 14}" font-family="${UI}" font-size="19" font-weight="600" fill="${C.ink}">${esc(b.text)}</text>`;
      cy += 36;
    } else if (b.type === 'p') {
      const parts = b.runs ?? [[b.text, {}]];
      let t = `<text x="${x + 36}" y="${cy + 12}" font-family="${UI}" font-size="15" fill="${C.ink}" xml:space="preserve">`;
      for (const [txt, st] of parts)
        t += `<tspan font-weight="${st.b ? 700 : 400}" font-style="${st.i ? 'italic' : 'normal'}" font-family="${st.m ? MONO : UI}" fill="${st.link ? '#0969da' : st.m ? '#8250df' : C.ink}" text-decoration="${st.link ? 'underline' : 'none'}">${esc(txt)}</tspan>`;
      t += '</text>';
      s += t;
      cy += 28;
    } else if (b.type === 'li') {
      s += `<circle cx="${x + 44}" cy="${cy + 7}" r="3" fill="${C.ink}"/><text x="${x + 56}" y="${cy + 12}" font-family="${UI}" font-size="15" fill="${C.ink}">${esc(b.text)}</text>`;
      cy += 26;
    } else if (b.type === 'note') {
      s += `<rect x="${x + 36}" y="${cy - 4}" width="${w - 72}" height="44" rx="4" fill="#eef6ff" stroke="#b6d4fe"/><text x="${x + 50}" y="${cy + 22}" font-family="${UI}" font-size="14" fill="#0b5cad" font-weight="600">NOTE</text><text x="${x + 110}" y="${cy + 22}" font-family="${UI}" font-size="14" fill="${C.ink}">${esc(b.text)}</text>`;
      cy += 56;
    } else if (b.type === 'code') {
      const hh = 20 + b.lines.length * 20;
      s += `<rect x="${x + 36}" y="${cy - 4}" width="${w - 72}" height="${hh}" rx="4" fill="#f6f8fa" stroke="#e1e4e8"/>`;
      b.lines.forEach((l, i) => {
        s += `<text x="${x + 50}" y="${cy + 14 + i * 20}" font-family="${MONO}" font-size="13" fill="#24292f" xml:space="preserve">${esc(l)}</text>`;
      });
      cy += hh + 12;
    } else if (b.type === 'math') {
      s += `<text x="${x + w / 2}" y="${cy + 24}" text-anchor="middle" font-family="${MATH}" font-size="${b.size ?? 26}" fill="${C.ink}" xml:space="preserve">${b.svg}</text>`;
      cy += (b.h ?? 56);
    } else if (b.type === 'table') {
      const cw = (w - 72) / b.rows[0].length;
      b.rows.forEach((r, ri) => {
        r.forEach((cell, ci) => {
          s += `<rect x="${x + 36 + ci * cw}" y="${cy}" width="${cw}" height="26" fill="${ri === 0 ? '#f0f0f0' : 'none'}" stroke="#d0d7de"/><text x="${x + 44 + ci * cw}" y="${cy + 18}" font-family="${UI}" font-size="13" font-weight="${ri === 0 ? 600 : 400}" fill="${C.ink}">${esc(cell)}</text>`;
        });
        cy += 26;
      });
      cy += 14;
    } else if (b.type === 'gap')
      cy += b.h;
    if (ghost && ghost.after === b.id) {
      s += `<rect x="${x + 36 + (ghost.x ?? 0)}" y="${cy - 26}" width="2" height="20" fill="${C.brand}"/><rect x="${x + 24}" y="${cy - 30}" width="3" height="28" rx="1" fill="${C.brand}" opacity="0.55"/>`;
    }
  }
  return s;
}

function statusBar(x, y, w, text) {
  return `<rect x="${x}" y="${y}" width="${w}" height="24" fill="${C.accent}"/><text x="${x + 12}" y="${y + 16}" font-family="${UI}" font-size="12" fill="${C.white}">${esc(text)}</text>`;
}

// ----------------------------------------------------------------------------- the sample document
const CODE_LINES = [
  [['= ', C.kw], ['Quarterly report', C.title]],
  [['Ana Souza', C.text]],
  [[':toc:', C.attr]],
  [],
  [['== ', C.kw], ['Highlights', C.title]],
  [],
  [['Revenue grew ', C.text], ['*12 %*', C.kw], [' and churn fell to ', C.text], ['_1.8 %_', C.str], ['.', C.text]],
  [],
  [['NOTE: ', C.macro], ['Figures audited by ', C.text], ['link:audit.pdf[KPMG]', C.macro], ['.', C.text]],
  [],
  [['* ', C.kw], ['New customers: 1 240', C.text]],
  [['* ', C.kw], ['Formula engine: ', C.text], ['stem:[sum_(i=1)^n i = (n(n+1))/2]', C.macro]],
  [],
  [['[source,java]', C.attr]],
  [['----', C.dim]],
  [['int total = add(2, 3);', C.str]],
  [['----', C.dim]],
];
const SUM = '<tspan>∑</tspan><tspan font-size="14" dy="-14">n</tspan><tspan font-size="14" dy="26" dx="-8">i=1</tspan><tspan dy="-12" dx="4"> i = </tspan><tspan dy="-10">n(n+1)</tspan><tspan dx="-74" dy="24">2</tspan>';
const VIEW_BLOCKS = [
  { id: 't', type: 'h1', text: 'Quarterly report' },
  { type: 'p', runs: [['Ana Souza', { i: true }]] },
  { id: 'h', type: 'h2', text: 'Highlights' },
  { id: 'p1', type: 'p', runs: [['Revenue grew ', {}], ['12 %', { b: true }], [' and churn fell to ', {}], ['1.8 %', { i: true }], ['.', {}]] },
  { type: 'note', text: 'Figures audited by KPMG.' },
  { type: 'li', text: 'New customers: 1 240' },
  { type: 'li', text: 'Formula engine:  ∑ᵢ₌₁ⁿ i = n(n+1)/2' },
  { type: 'gap', h: 8 },
  { type: 'code', lines: ['int total = add(2, 3);'] },
];

// ----------------------------------------------------------------------------- 1. hero: split mode
function heroSVG() {
  const W = 1280;
  const H = 720;
  const x = 40;
  const y = 76;
  const w = W - 80;
  const half = Math.floor(w / 2);
  const body =
    toolbar(x, y, w, 'Split') +
    codePane(x, y + 38, half, H - 40 - y - 38 - 24, CODE_LINES, 6, 38) +
    `<rect x="${x + half}" y="${y + 38}" width="2" height="${H - 40 - y - 38 - 24}" fill="${C.border}"/>` +
    viewPane(x + half + 2, y + 38, w - half - 2, H - 40 - y - 38 - 24, VIEW_BLOCKS, { after: 'p1', x: 300 }) +
    statusBar(x, H - 40 - 24, w, 'Split  ·  Ln 7, Col 39  ·  168 words  ·  Model: complete');
  return window(W, H, 'report.adoc — Tootega AsciiDoc', body);
}

// ----------------------------------------------------------------------------- 2. formulas
function formulasSVG() {
  const W = 1280;
  const H = 640;
  const x = 40;
  const y = 76;
  const w = W - 80;
  const half = Math.floor(w / 2);
  const lines = [
    [['[latexmath]', C.attr]],
    [['++++', C.dim]],
    [['\\int_0^1 x^2\\,dx = \\tfrac{1}{3}', C.str]],
    [['++++', C.dim]],
    [],
    [['[stem]', C.attr]],
    [['++++', C.dim]],
    [['x = (-b +- sqrt(b^2-4ac))/(2a)', C.str]],
    [['++++', C.dim]],
    [],
    [['\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', C.str]],
    [],
    [['f(x) = \\begin{cases} 1 & x > 0 \\\\ 0 & \\text{else} \\end{cases}', C.str]],
  ];
  // The typeset side, drawn by hand (fraction bars as lines, scripts as shifted tspans).
  const vx = x + half + 2;
  const vw = w - half - 2;
  const cx = vx + vw / 2;
  const t = (tx, ty, s, size = 28, anchor = 'middle', fam = MATH) => `<text x="${tx}" y="${ty}" text-anchor="${anchor}" font-family="${fam}" font-size="${size}" fill="${C.ink}" xml:space="preserve">${s}</text>`;
  const bar = (bx, by, bw) => `<line x1="${bx}" y1="${by}" x2="${bx + bw}" y2="${by}" stroke="${C.ink}" stroke-width="1.6"/>`;
  let math = `<rect x="${vx}" y="${y + 38}" width="${vw}" height="${H - 40 - y - 38 - 24}" fill="${C.paper}"/>`;
  // ∫₀¹ x² dx = 1/3
  let fy = y + 180;
  math += t(cx - 150, fy, '∫', 44, 'start') + t(cx - 128, fy - 26, '1', 14, 'start') + t(cx - 132, fy + 14, '0', 14, 'start') + t(cx - 108, fy, 'x', 28, 'start') + t(cx - 92, fy - 14, '2', 15, 'start') + t(cx - 80, fy, 'dx = ', 28, 'start') + t(cx - 2, fy - 16, '1', 24) + bar(cx - 12, fy - 9, 20) + t(cx - 2, fy + 14, '3', 24);
  // quadratic formula
  fy = y + 272;
  math += t(cx - 150, fy, 'x = ', 28, 'start') + t(cx + 8, fy - 16, '−b ± √(b² − 4ac)', 26) + bar(cx - 92, fy - 8, 200) + t(cx + 8, fy + 18, '2a', 26);
  // matrix
  fy = y + 368;
  math += t(cx - 44, fy + 10, '(', 56, 'start') + t(cx - 10, fy - 6, 'a', 24) + t(cx + 22, fy - 6, 'b', 24) + t(cx - 10, fy + 22, 'c', 24) + t(cx + 22, fy + 22, 'd', 24) + t(cx + 34, fy + 10, ')', 56, 'start');
  // cases
  fy = y + 462;
  math += t(cx - 150, fy, 'f(x) = ', 28, 'start') + t(cx - 48, fy + 12, '{', 60, 'start') + t(cx - 14, fy - 8, '1', 22, 'start') + t(cx + 22, fy - 8, 'x > 0', 22, 'start') + t(cx - 14, fy + 20, '0', 22, 'start') + t(cx + 22, fy + 20, 'else', 22, 'start', UI);
  const body =
    toolbar(x, y, w, 'Split') +
    codePane(x, y + 38, half, H - 40 - y - 38 - 24, lines) +
    `<rect x="${x + half}" y="${y + 38}" width="2" height="${H - 40 - y - 38 - 24}" fill="${C.border}"/>` +
    math +
    `<rect x="${x + half + 24}" y="${y + 56}" width="${w - half - 48}" height="30" rx="15" fill="${C.brandLight}"/><text x="${x + half + (w - half) / 2}" y="${y + 76}" text-anchor="middle" font-family="${UI}" font-size="12.5" fill="${C.brand}" font-weight="600">TeX and AsciiMath typeset by the editor's own engine — no MathJax, no KaTeX, no network</text>` +
    statusBar(x, H - 40 - 24, w, 'Split  ·  4 formulas  ·  0 warnings');
  return window(W, H, 'formulas.adoc — Tootega AsciiDoc', body);
}

// ----------------------------------------------------------------------------- 3. export
function exportSVG() {
  const W = 1280;
  const H = 420;
  const x = 40;
  const y = 76;
  const w = W - 80;
  const formats = [
    ['HTML 5', 'standalone, images embedded,\nAsciidoctor stylesheet', '#e34c26'],
    ['PDF', 'written by the converter,\nnothing to install', '#b30b00'],
    ['Markdown', 'GitHub-flavoured,\nround-trip friendly', '#083fa1'],
    ['DocBook 5', 'with MathML for formulas', '#5c2d91'],
  ];
  let body = `<rect x="${x}" y="${y}" width="${w}" height="${H - 40 - y}" fill="${C.bg}"/>`;
  body += `<text x="${x + 40}" y="${y + 48}" font-family="${UI}" font-size="22" fill="${C.text}" font-weight="600">Export, right from the editor</text>`;
  body += `<text x="${x + 40}" y="${y + 76}" font-family="${UI}" font-size="14" fill="${C.dim}">The AsciiDocConverter C11 library runs as WebAssembly in a worker thread. No Ruby, no Java, no Asciidoctor install, no network.</text>`;
  const cw = (w - 80 - 3 * 20) / 4;
  formats.forEach(([name, desc, col], i) => {
    const cx = x + 40 + i * (cw + 20);
    const cy = y + 110;
    body += `<rect x="${cx}" y="${cy}" width="${cw}" height="150" rx="10" fill="#252526" stroke="${C.border}"/>`;
    body += `<rect x="${cx}" y="${cy}" width="${cw}" height="6" rx="3" fill="${col}"/>`;
    body += `<text x="${cx + 20}" y="${cy + 46}" font-family="${UI}" font-size="20" font-weight="600" fill="${C.white}">${esc(name)}</text>`;
    desc.split('\n').forEach((d, k) => {
      body += `<text x="${cx + 20}" y="${cy + 78 + k * 22}" font-family="${UI}" font-size="14" fill="${C.text}">${esc(d)}</text>`;
    });
    body += `<text x="${cx + 20}" y="${cy + 134}" font-family="${MONO}" font-size="12" fill="${C.dim}">report.${name === 'HTML 5' ? 'html' : name === 'DocBook 5' ? 'xml' : name === 'Markdown' ? 'md' : 'pdf'}</text>`;
  });
  body += `<text x="${x + 40}" y="${H - 40 - 30}" font-family="${UI}" font-size="13" fill="${C.dim}">Converter messages land in the Problems panel with file and line. Ctrl+Alt+S exports HTML in one keystroke.</text>`;
  return window(W, H, 'Export — Tootega AsciiDoc', body);
}

// ----------------------------------------------------------------------------- 4. animation (APNG): typing in Split mode
function frameSVG(step) {
  const W = 1000;
  const H = 520;
  const x = 40;
  const y = 76;
  const w = W - 80;
  const half = Math.floor(w / 2);
  const typed = 'Revenue grew *12 %* and churn fell to _1.8 %_.';
  const shown = typed.slice(0, step);
  const lines = [
    [['== ', C.kw], ['Highlights', C.title]],
    [],
    [[shown, C.text]],
    [],
    [['NOTE: ', C.macro], ['Figures audited.', C.text]],
  ];
  // The view interprets the marks as soon as they close.
  const runs = [];
  const re = /\*([^*]+)\*|_([^_]+)_|([^*_]+)|([*_])/g;
  let m;
  while ((m = re.exec(shown)) !== null) {
    if (m[1] !== undefined) runs.push([m[1], { b: true }]);
    else if (m[2] !== undefined) runs.push([m[2], { i: true }]);
    else if (m[3] !== undefined) runs.push([m[3], {}]);
    else runs.push([m[4], {}]);
  }
  const blocks = [
    { type: 'h2', text: 'Highlights' },
    { id: 'p', type: 'p', runs: runs.length > 0 ? runs : [[' ', {}]] },
    { type: 'note', text: 'Figures audited.' },
  ];
  const body =
    toolbar(x, y, w, 'Split') +
    codePane(x, y + 38, half, H - 40 - y - 38 - 24, lines, 2, shown.length) +
    `<rect x="${x + half}" y="${y + 38}" width="2" height="${H - 40 - y - 38 - 24}" fill="${C.border}"/>` +
    viewPane(x + half + 2, y + 38, w - half - 2, H - 40 - y - 38 - 24, blocks, { after: 'p', x: Math.min(380, 7.2 * shown.replace(/[*_]/g, '').length) }) +
    statusBar(x, H - 40 - 24, w, `Split  ·  Ln 3, Col ${shown.length + 1}  ·  live view, same document`);
  return window(W, H, 'report.adoc — Tootega AsciiDoc', body);
}

// ----------------------------------------------------------------------------- PNG / APNG helpers
function renderPNG(svg, width) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' } }).render().asPng();
}

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function chunksOf(png) {
  const list = [];
  let p = 8;
  while (p < png.length) {
    const len = png.readUInt32BE(p);
    const type = png.toString('latin1', p + 4, p + 8);
    list.push({ type, data: png.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
  }
  return list;
}
/** Assembles an APNG from full-size PNG frames (same dimensions); `delays` in 1/100 s. */
function apng(frames, delays) {
  const first = chunksOf(frames[0]);
  const ihdr = first.find((c) => c.type === 'IHDR');
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr.data)];
  const actl = Buffer.alloc(8);
  actl.writeUInt32BE(frames.length, 0);
  actl.writeUInt32BE(0, 4);   // loop forever
  parts.push(chunk('acTL', actl));
  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  let seq = 0;
  frames.forEach((png, i) => {
    const cs = chunksOf(png);
    const idat = Buffer.concat(cs.filter((c) => c.type === 'IDAT').map((c) => c.data));
    const fctl = Buffer.alloc(26);
    fctl.writeUInt32BE(seq++, 0);
    fctl.writeUInt32BE(width, 4);
    fctl.writeUInt32BE(height, 8);
    fctl.writeUInt32BE(0, 12);
    fctl.writeUInt32BE(0, 16);
    fctl.writeUInt16BE(delays[i] ?? delays[delays.length - 1], 20);
    fctl.writeUInt16BE(100, 22);
    fctl[24] = 0;   // dispose: none
    fctl[25] = 0;   // blend: source
    parts.push(chunk('fcTL', fctl));
    if (i === 0) parts.push(chunk('IDAT', idat));
    else {
      const s = Buffer.alloc(4);
      s.writeUInt32BE(seq++);
      parts.push(chunk('fdAT', Buffer.concat([s, idat])));
    }
  });
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

// ----------------------------------------------------------------------------- go
function write(name, buf) {
  fs.writeFileSync(path.join(out, name), buf);
  console.log(`${name} (${(buf.length / 1024).toFixed(0)} KB)`);
}
write('hero.png', renderPNG(heroSVG(), 1280));
write('formulas.png', renderPNG(formulasSVG(), 1280));
write('export.png', renderPNG(exportSVG(), 1280));

const typed = 'Revenue grew *12 %* and churn fell to _1.8 %_.';
const frames = [];
const delays = [];
// Two characters per frame keeps the file small enough for a README (the pause at the end lets the eye rest).
for (let step = 0; step <= typed.length; step += 2) {
  const s = Math.min(step, typed.length);
  frames.push(renderPNG(frameSVG(s), 800));
  delays.push(s === typed.length ? 240 : /[*_]/.test(typed[s - 1] ?? '') ? 22 : 11);
}
if (frames.length === 0 || (typed.length % 2) === 1) {
  frames.push(renderPNG(frameSVG(typed.length), 800));
  delays.push(240);
}
write('typing.png', apng(frames, delays));
// A still fallback of the last frame for viewers without APNG.
write('typing-still.png', frames[frames.length - 1]);
void zlib;
