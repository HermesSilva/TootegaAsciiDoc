// Formula pre-pass for export (plan M4, DF-7): before the C converter sees the document, every `stem:[]`,
// `latexmath:[]`, `asciimath:[]` inline macro and every `[stem]`/`[latexmath]`/`[asciimath]` block is replaced by a
// passthrough carrying the MathML produced by the engine's own formula renderer. The native library stays untouched
// (AD-9) and HTML/DocBook get real math. PDF and Markdown keep the source notation (the pre-pass is not applied).
import { notacaoEfetiva } from '@core/components/asciidoc/modelo/documento';
import type { NotacaoDeFormula } from '@core/components/asciidoc/modelo/tipos';
import { renderizarFormula } from '@core/lib/formula';

export type FormulaTarget = 'html' | 'docbook';

export interface FormulaPrePassResult {
  text: string;
  /** Formulas replaced. */
  count: number;
  /** Renderer warnings, with the 1-based source line of the formula. */
  warnings: { line: number; text: string }[];
}

const NOTATIONS = new Set(['stem', 'latexmath', 'asciimath']);
const DELIMITED = /^(-{4,}|\.{4,}|\+{4,}|\/{4,}|={4,}|\*{4,}|_{4,}|`{3,})\s*$/;
// A fenced block may open with a language (```python) and closes with the bare fence.
const VERBATIM_DELIMITED = /^(-{4,}|\.{4,}|\+{4,}|\/{4,}|`{3,}[\w+#-]*)\s*$/;
const ATTRIBUTE_LINE = /^\[([^\]]*)\]\s*$/;
const INLINE = /(^|[^\\\p{L}\p{N}_])(stem|latexmath|asciimath):\[/gu;

function firstPositional(attrs: string): string {
  const first = attrs.split(',')[0].trim();
  // `[stem#id.role]` → `stem`.
  return first.split(/[#.%]/)[0].trim();
}

/** `]` that closes the bracket opened at `open`, honouring `\]` and nesting; -1 when unclosed. */
function closingBracket(text: string, open: number): number {
  let level = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') {
      i += 1;
      continue;
    }
    if (c === '[') level += 1;
    else if (c === ']') {
      level -= 1;
      if (level === 0) return i;
    } else if (c === '\n') return -1;
  }
  return -1;
}

function escapeForPass(mathml: string): string {
  // Inside `pass:[…]` a literal `]` would close the macro: encode it (and `{` so attribute references stay inert).
  return mathml.replace(/\]/g, '&#93;').replace(/\{/g, '&#123;');
}

function wrap(mathml: string, target: FormulaTarget, block: boolean): string {
  if (target === 'docbook') return block ? `<informalequation>${mathml}</informalequation>` : `<inlineequation>${mathml}</inlineequation>`;
  return block ? `<div class="stemblock"><div class="content">${mathml}</div></div>` : mathml;
}

export function replaceFormulas(text: string, target: FormulaTarget): FormulaPrePassResult {
  const stemAttr = /^:stem:\s*(.*)$/m.exec(text)?.[1]?.trim();
  const lines = text.split('\n');
  const out: string[] = [];
  const warnings: { line: number; text: string }[] = [];
  let count = 0;

  const render = (source: string, notation: NotacaoDeFormula, block: boolean, line: number): string => {
    const effective = notacaoEfetiva(notation, stemAttr);
    const r = renderizarFormula(source, { notacao: effective, bloco: block });
    for (const w of r.avisos) warnings.push({ line, text: w.texto });
    count += 1;
    return wrap(r.mathml, target, block);
  };

  const replaceInline = (line: string, lineNo: number): string => {
    let result = '';
    let pos = 0;
    INLINE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = INLINE.exec(line)) !== null) {
      const open = m.index + m[0].length - 1;
      const close = closingBracket(line, open);
      if (close === -1) continue;
      result += line.slice(pos, m.index) + m[1] + `pass:[${escapeForPass(render(line.slice(open + 1, close), m[2] as NotacaoDeFormula, false, lineNo))}]`;
      pos = close + 1;
      INLINE.lastIndex = pos;
    }
    return result + line.slice(pos);
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Verbatim blocks pass untouched (code, literal, passthrough, comment, fenced).
    const fence = VERBATIM_DELIMITED.exec(line);
    if (fence) {
      const close = fence[1].startsWith('`') ? '```' : fence[1];
      out.push(line);
      i += 1;
      while (i < lines.length && lines[i].trim() !== close) out.push(lines[i++]);
      if (i < lines.length) out.push(lines[i++]);
      continue;
    }
    if (/^\/\//.test(line) || /^:stem:/.test(line)) {
      // Line comment copied; `:stem:` dropped — the converter would otherwise warn that MathJax is not injected.
      if (!/^:stem:/.test(line)) out.push(line);
      i += 1;
      continue;
    }
    const attr = ATTRIBUTE_LINE.exec(line);
    if (attr && NOTATIONS.has(firstPositional(attr[1]))) {
      const notation = firstPositional(attr[1]) as NotacaoDeFormula;
      // Title/anchor lines between the style and the block are kept.
      const kept: string[] = [];
      let j = i + 1;
      while (j < lines.length && (/^\.[^\s.]/.test(lines[j]) || /^\[\[[^\]]+\]\]\s*$/.test(lines[j]) || ATTRIBUTE_LINE.test(lines[j]))) kept.push(lines[j++]);
      if (j >= lines.length || lines[j].trim() === '') {
        out.push(line, ...kept);
        i = j;
        continue;
      }
      const delimiter = DELIMITED.exec(lines[j]);
      const body: string[] = [];
      if (delimiter && /^[-.+]/.test(delimiter[1])) {
        const close = delimiter[1];
        j += 1;
        while (j < lines.length && lines[j] !== close) body.push(lines[j++]);
        if (j < lines.length) j += 1;
      } else {
        while (j < lines.length && lines[j].trim() !== '') body.push(lines[j++]);
      }
      out.push(...kept, '++++', render(body.join('\n'), notation, true, i + 1), '++++');
      i = j;
      continue;
    }
    out.push(replaceInline(line, i + 1));
    i += 1;
  }
  return { text: out.join('\n'), count, warnings };
}
