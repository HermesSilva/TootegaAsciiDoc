// The documents measured. Sizes come from repeating the real showcase (it exercises every element the editor
// knows), so a large document has the same mix as a real one. The adversarial generators target what makes parsers
// slow: unclosed marks, long lines, deep nesting. All deterministic.
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = path.resolve(__dirname, '..', '..', '..');

export function showcase(): string {
  return fs.readFileSync(path.join(root, 'media', 'showcase', 'pt-BR', 'exemplo-completo.adoc'), 'utf8').replace(/\r\n/g, '\n');
}

export interface SizedDocument {
  label: string;
  text: string;
  lines: number;
}

function describeSize(text: string): string {
  const kb = Buffer.byteLength(text, 'utf8') / 1024;
  const lines = text.split('\n').length;
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB, ${lines} lines` : `${kb.toFixed(0)} KB, ${lines} lines`;
}

export function sizedDocument(copies: number): SizedDocument {
  const source = showcase();
  const split = source.indexOf('\n\n');
  const header = source.slice(0, split);
  const body = source.slice(split);
  const text = `${header}${body.repeat(copies)}`;
  return { label: describeSize(text), text, lines: text.split('\n').length };
}

/** Sizes for the pure suites: the real document, then a long manual, a book, an absurd file. */
export const PURE_COPIES = [1, 10, 50, 200];
/** Sizes for the React suite: rendering is far more expensive per line. */
export const RENDER_COPIES = [1, 10, 50];

/** Ordinary prose with accents, typed one character at a time. */
export const TYPED_TEXT = 'A rápida raposa marrom pula sobre o cão preguiçoso, e depois volta para casa com calma. Ação, coração, útil, à noite, pôr.';

/** Where a user types: the end of a plain prose line near the given fraction of the document. */
export function proseOffset(text: string, fraction: number): number {
  const from = Math.floor(text.length * fraction);
  const prose = /^[A-ZÀ-Ú][^|\n]{20,}\.$/gm;
  prose.lastIndex = from;
  const after = prose.exec(text);
  if (after) return after.index + after[0].length;
  prose.lastIndex = 0;
  let last = -1;
  for (let match = prose.exec(text); match; match = prose.exec(text)) last = match.index + match[0].length;
  if (last < 0) throw new Error('proseOffset: the document has no prose line');
  return last;
}

export interface Adversarial {
  name: string;
  /** Sizes (in generator units), doubling, so the growth exponent can be read. */
  sizes: number[];
  build: (size: number) => string;
}

const words = (n: number): string => Array.from({ length: n }, (_, i) => `palavra${i % 97}`).join(' ');

export const ADVERSARIAL: Adversarial[] = [
  { name: 'long paragraph, one line (n words)', sizes: [2000, 4000, 8000, 16000], build: words },
  { name: 'unclosed marks on one line (n groups)', sizes: [500, 1000, 2000, 4000], build: (n) => Array.from({ length: n }, (_, i) => `*a${i} _b \`c #d`).join(' ') },
  { name: 'closed marks on one line (n groups)', sizes: [500, 1000, 2000, 4000], build: (n) => Array.from({ length: n }, (_, i) => `*a${i}* _b_ \`c\` #d#`).join(' ') },
  { name: 'unclosed macros on one line (n groups)', sizes: [500, 1000, 2000, 4000], build: (n) => Array.from({ length: n }, (_, i) => `link:x${i}[ <<y image:z[ {a`).join(' ') },
  { name: 'closed macros on one line (n groups)', sizes: [500, 1000, 2000, 4000], build: (n) => Array.from({ length: n }, (_, i) => `link:x${i}[t] <<y${i}>> https://a.b/c${i}[d] {a${i}}`).join(' ') },
  { name: 'flat bullet list (n items)', sizes: [2000, 4000, 8000, 16000], build: (n) => Array.from({ length: n }, (_, i) => `* item ${i} com *negrito*`).join('\n') },
  { name: 'nested lists (n groups of 5 levels)', sizes: [500, 1000, 2000, 4000], build: (n) => Array.from({ length: n }, (_, i) => `* a${i}\n** b\n*** c\n**** d\n***** e`).join('\n') },
  { name: 'table (n rows, 5 columns)', sizes: [1000, 2000, 4000, 8000], build: (n) => `|===\n${Array.from({ length: n }, (_, i) => `|a${i} |b |c |*d* |e`).join('\n')}\n|===` },
  { name: 'closed code block (n lines)', sizes: [5000, 10000, 20000, 40000], build: (n) => `----\n${Array.from({ length: n }, (_, i) => `const x${i} = ${i};`).join('\n')}\n----` },
  { name: 'unclosed code block (n lines)', sizes: [5000, 10000, 20000, 40000], build: (n) => `----\n${Array.from({ length: n }, (_, i) => `const x${i} = ${i};`).join('\n')}` },
  { name: 'many unclosed delimiters (n blocks)', sizes: [250, 500, 1000, 2000], build: (n) => Array.from({ length: n }, (_, i) => `${'='.repeat(4 + (i % 40))}\ntexto ${i}\n`).join('\n') },
  { name: 'nested containers (n pairs)', sizes: [25, 50, 100, 200], build: (n) => { const open = Array.from({ length: n }, (_, i) => '='.repeat(4 + i)); return `${open.join('\n')}\nmeio\n${[...open].reverse().join('\n')}`; } },
  { name: 'attributes and references (n pairs)', sizes: [1000, 2000, 4000, 8000], build: (n) => Array.from({ length: n }, (_, i) => `:a${i}: valor ${i}\n\nTexto com {a${i}} aqui.\n`).join('\n') },
  { name: 'headings (n sections)', sizes: [2000, 4000, 8000, 16000], build: (n) => Array.from({ length: n }, (_, i) => `== Seção ${i}\n\nParágrafo ${i}.\n`).join('\n') },
  { name: 'lone plus signs (n lines)', sizes: [2000, 4000, 8000, 16000], build: (n) => Array.from({ length: n }, () => '+').join('\n\n') },
  { name: 'inline formulas (n paragraphs)', sizes: [1000, 2000, 4000, 8000], build: (n) => Array.from({ length: n }, (_, i) => `Valor latexmath:[x_{${i}}^2 + \\frac{a}{b}] e asciimath:[sqrt(${i})].`).join('\n\n') },
];
