// One keystroke in Code mode (and in the code side of Split), stage by stage, with the engine's real functions in
// the order the editor's render runs them. The React work on top of this is in webview.perf.ts.
import { afterAll, describe, expect, it } from 'vitest';
import { CacheDeTokens } from '@core/components/asciidoc/codigo/cache';
import { estadoDaBarraDoCodigo } from '@core/components/asciidoc/codigo/edicaoDeTexto';
import { linguagemPorNome } from '@core/components/asciidoc/codigo/linguagens';
import * as codeEditorModule from '@core/components/asciidoc/codigo/XEditorDeCodigo';
import { analisarAsciiDoc } from '@core/components/asciidoc/parser/blocos';
import { imagesDirOf } from '../../shared/attributes';
import { minimalEdit } from '../../src/editor/textDiff';
import { PURE_COPIES, proseOffset, sizedDocument, TYPED_TEXT } from './lib/corpus';
import { consume, Stages } from './lib/measure';
import { Suite } from './lib/report';

// Exported at transform time by vitest.perf.config.mts; private in the source.
const { larguraVisual, linhaDaPosicao, parBalanceado } = codeEditorModule as unknown as {
  larguraVisual: (line: string, tab: number) => number;
  linhaDaPosicao: (text: string, offset: number) => number;
  parBalanceado: (text: string, offset: number) => { abre: number; fecha: number } | null;
};

const suite = new Suite('typing-code', 'Typing in Code mode, without React');
suite.note('Every stage below runs synchronously on each key, before the browser can paint, except in the groups named "After the pause". A 60 Hz frame is 16.7 ms.');
afterAll(() => suite.flush());

// What the editor renders around the cursor: a 44-line viewport (about 970 px) plus SOBRA_DE_LINHAS on each side.
const VIEWPORT_LINES = 44;
const OVERSCAN = 12;
const WARMUP_KEYS = 30;

function typeKeys(offset: number, text: string, stages: Stages): string {
  const cache = new CacheDeTokens(linguagemPorNome('asciidoc'));
  cache.definirLinhas(text.split('\n'));
  let current = text;
  let cursor = offset;
  const keys = (TYPED_TEXT.slice(0, WARMUP_KEYS) + TYPED_TEXT).split('');
  keys.forEach((key, index) => {
    stages.setRecording(index >= WARMUP_KEYS);
    // The browser's own edit of the textarea value: not TypeScript, so it stays out of the timing.
    current = current.slice(0, cursor) + key + current.slice(cursor);
    cursor += key.length;
    const lines = stages.time('valor.split', () => current.split('\n'));
    stages.time('CacheDeTokens.definirLinhas', () => cache.definirLinhas(lines));
    const line = stages.time('linhaDaPosicao', () => linhaDaPosicao(current, cursor));
    stages.time('larguraMaxima', () => {
      let widest = 0;
      for (const candidate of lines) {
        const width = candidate.includes('\t') ? larguraVisual(candidate, 4) : candidate.length;
        if (width > widest) widest = width;
      }
      consume(widest);
    });
    stages.time('tokens of the visible lines', () => {
      const first = Math.max(0, line - Math.floor(VIEWPORT_LINES / 2) - OVERSCAN);
      const last = Math.min(lines.length - 1, line + Math.ceil(VIEWPORT_LINES / 2) + OVERSCAN);
      for (let i = first; i <= last; i++) consume(cache.tokensDaLinha(i));
    });
    stages.time('parBalanceado', () => consume(parBalanceado(current, cursor)));
    stages.time('estadoDaBarraDoCodigo', () => consume(estadoDaBarraDoCodigo(current, { ini: cursor, fim: cursor })));
    stages.time('imagesDirOf (webview App)', () => consume(imagesDirOf(current)));
    stages.endRound();
  });
  return current;
}

describe('one keystroke, by size and cursor position', () => {
  for (const copies of PURE_COPIES) {
    const doc = sizedDocument(copies);
    for (const [where, fraction] of [['start', 0], ['middle', 0.5], ['end', 1]] as const)
      it(`${doc.label}, cursor at the ${where}`, () => {
        const offset = proseOffset(doc.text, fraction);
        const stages = new Stages();
        const typed = typeKeys(offset, doc.text, stages);
        expect(typed.length).toBe(doc.text.length + WARMUP_KEYS + TYPED_TEXT.length);
        for (const [stage, stats] of stages.results()) suite.record(`Per key: ${doc.label}, cursor at the ${where}`, stage, stats);
      });
  }
});

describe('worst case of bracket matching', () => {
  for (const copies of PURE_COPIES) {
    const doc = sizedDocument(copies);
    it(doc.label, () => {
      // An opening bracket with no partner scans forward up to the function's 200,000-character limit.
      const text = `(${doc.text.replace(/\)/g, ' ')}`;
      expect(parBalanceado(text, 1)).toBeNull();
      suite.time('Per key: parBalanceado with the cursor after an unmatched "("', doc.label, () => parBalanceado(text, 1), { budgetMs: 400 });
    });
  }
});

describe('after the pause', () => {
  for (const copies of PURE_COPIES) {
    const doc = sizedDocument(copies);
    it(doc.label, () => {
      const offset = proseOffset(doc.text, 0.5);
      const typed = `${doc.text.slice(0, offset)}${TYPED_TEXT}${doc.text.slice(offset)}`;
      const edit = minimalEdit(doc.text, typed);
      expect(edit?.text).toBe(TYPED_TEXT);
      suite.time('After the pause, 120 ms: minimalEdit on the host', doc.label, () => minimalEdit(doc.text, typed), { budgetMs: 500 });
      suite.time('After the pause, 200 ms: analisarAsciiDoc for the structure panel', doc.label, () => analisarAsciiDoc(typed), { budgetMs: 800 });
    });
  }
});
