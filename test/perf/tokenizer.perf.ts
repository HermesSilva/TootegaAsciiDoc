// Syntax highlighting: the line tokenizers per language and the incremental cache the code editor relies on.
import { afterAll, describe, expect, it } from 'vitest';
import { CacheDeTokens } from '@core/components/asciidoc/codigo/cache';
import { LINGUAGENS, linguagemPorNome } from '@core/components/asciidoc/codigo/linguagens';
import { PURE_COPIES, showcase, sizedDocument } from './lib/corpus';
import { Suite } from './lib/report';

const suite = new Suite('tokenizer', 'Syntax highlighting');
afterAll(() => suite.flush());

const asciidoc = linguagemPorNome('asciidoc');

function tokenizeAll(lines: string[]): CacheDeTokens {
  const cache = new CacheDeTokens(asciidoc);
  cache.definirLinhas(lines);
  cache.garantirAte(lines.length - 1);
  return cache;
}

describe('AsciiDoc, by document size', () => {
  for (const copies of PURE_COPIES) {
    const doc = sizedDocument(copies);
    it(doc.label, () => {
      const lines = doc.text.split('\n');
      const bytes = Buffer.byteLength(doc.text, 'utf8');
      expect(tokenizeAll(lines).tokensDaLinha(lines.length - 1)).toBeDefined();

      suite.time('Cold: the whole document (jump to the last line)', doc.label, () => tokenizeAll(lines), { budgetMs: 800 }, (stats) => ({ 'MB/s': (bytes / (1024 * 1024) / (stats.median / 1000)).toFixed(1) }));

      // Each sample edits a different line content, so nothing is served from a previous sample.
      const target = Math.floor(lines.length / 2);
      const cache = tokenizeAll(lines);
      let round = 0;
      suite.time('Incremental: one character on the middle line, then tokens of that line', doc.label, (next: string[]) => {
        cache.definirLinhas(next);
        return cache.tokensDaLinha(target);
      }, {
        prepare: () => {
          const next = [...lines];
          next[target] = `${lines[target]}${round++}`;
          return next;
        },
        budgetMs: 500,
      });

      // Opening a delimited block on the first line changes the state of every line after it: the cost of no
      // convergence, paid when the user looks at the end of the file.
      const opened = ['----', ...lines.slice(1)];
      suite.time('State change: "----" on line 1, then tokens of the last line', doc.label, (fresh: CacheDeTokens) => {
        fresh.definirLinhas(opened);
        return fresh.tokensDaLinha(opened.length - 1);
      }, { prepare: () => tokenizeAll(lines), budgetMs: 800, minSamples: 5 });
    });
  }
});

describe('line tokenizers, by language', () => {
  // The showcase lines, reused for every language: the point is the tokenizer's cost per line, and a tokenizer
  // never rejects text it does not recognize.
  const sample = showcase().split('\n').filter((line) => line.trim().length > 0);
  const bytes = sample.reduce((sum, line) => sum + Buffer.byteLength(line, 'utf8'), 0);
  for (const language of LINGUAGENS)
    it(language.nome, () => {
      suite.time('One pass over the 12 KB sample, line by line', language.nome, () => {
        let state = '';
        for (const line of sample) state = language.tokenizarLinha(line, state).estadoFinal;
        return state;
      }, { warmup: 20, budgetMs: 300 }, (stats) => ({ 'MB/s': (bytes / (1024 * 1024) / (stats.median / 1000)).toFixed(1) }));
    });
});
