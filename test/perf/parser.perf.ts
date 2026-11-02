// The AsciiDoc parser and the text <-> model round trip, by document size and on adversarial input.
import { afterAll, describe, expect, it } from 'vitest';
import { analisarAsciiDoc } from '@core/components/asciidoc/parser/blocos';
import { analisarInline } from '@core/components/asciidoc/parser/inline';
import { serializarDocumento, serializarInline } from '@core/components/asciidoc/serializador/serializar';
import { carimbarLinhas } from '@core/components/asciidoc/editor/linhas';
import { reaproveitarBlocos } from '@core/components/asciidoc/editor/reaproveitarBlocos';
import { ADVERSARIAL, PURE_COPIES, proseOffset, sizedDocument } from './lib/corpus';
import { growthExponent, measure, retainedHeapMB, type Stats } from './lib/measure';
import { Suite } from './lib/report';

const suite = new Suite('parser', 'Parser and serializer');
suite.note('analisarAsciiDoc runs on opening, 200 ms after typing stops (code and split modes) and 400 ms after any change on the host (diagnostics). The visual mode no longer reparses after a pause: the serializer gives the lines.');
afterAll(() => suite.flush());

const throughput = (bytes: number) => (stats: Stats) => ({ 'MB/s': (bytes / (1024 * 1024) / (stats.median / 1000)).toFixed(1) });

describe('by document size', () => {
  for (const copies of PURE_COPIES) {
    const doc = sizedDocument(copies);
    const bytes = Buffer.byteLength(doc.text, 'utf8');

    it(doc.label, () => {
      const parsed = analisarAsciiDoc(doc.text);
      expect(parsed.documento.blocos.length).toBeGreaterThan(copies);
      const heap = retainedHeapMB(() => analisarAsciiDoc(doc.text));

      suite.time('Parse: analisarAsciiDoc', doc.label, () => analisarAsciiDoc(doc.text), {}, (stats) => ({ ...throughput(bytes)(stats), 'Retained MB': heap === null ? 'n/a' : heap.toFixed(1) }));
      suite.time('Serialize: serializarDocumento', doc.label, () => serializarDocumento(parsed.documento), {}, throughput(bytes));
      const serialized = serializarDocumento(parsed.documento);
      expect(serialized.length).toBeGreaterThan(0);
      suite.time('Stamp lines by reparsing: carimbarLinhas (no longer on the typing path)', doc.label, () => carimbarLinhas(parsed.documento, serialized), {}, throughput(bytes));

      // The split mode's reparse: one character changed in the middle, then the blocks are aligned with the previous ones.
      const middle = proseOffset(doc.text, 0.5);
      const changed = analisarAsciiDoc(`${doc.text.slice(0, middle)}x${doc.text.slice(middle)}`).documento;
      // A fresh parse: carimbarLinhas above rewrote the lines of `parsed` to those of the serialized text.
      const before = analisarAsciiDoc(doc.text).documento;
      const reused = reaproveitarBlocos(before.blocos, changed.blocos);
      const previous = new Set(before.blocos);
      expect(reused.filter((block) => previous.has(block)).length).toBeGreaterThanOrEqual(reused.length - 2);
      suite.time('Reuse after a reparse: reaproveitarBlocos, one character changed', doc.label, () => reaproveitarBlocos(before.blocos, changed.blocos), {});
    });
  }
});

describe('inline parser', () => {
  const lines: [string, string][] = [
    ['plain sentence', 'Um parágrafo comum, sem nenhuma marcação, com umas dez ou doze palavras nele.'],
    ['marks', 'Texto com *negrito*, _itálico_, `mono`, #realce#, ^sup^ e ~sub~ na mesma frase.'],
    ['macros', 'Veja link:https://exemplo.com[o site], xref:outro.adoc#sec[outro], <<ancora,aqui>>, image:a.png[A] e {atributo}.'],
    ['formula', 'A fórmula latexmath:[\\frac{a}{b}] e asciimath:[sqrt(x)] no meio do texto.'],
  ];
  for (const [name, line] of lines)
    it(name, () => {
      const parsed = analisarInline(line);
      expect(parsed.length).toBeGreaterThan(0);
      suite.time('Inline: analisarInline, one line', name, () => analisarInline(line), { warmup: 200, budgetMs: 300 });
      suite.time('Inline: serializarInline, one line', name, () => serializarInline(parsed), { warmup: 200, budgetMs: 300 });
    });
});

describe('adversarial input', () => {
  // A case stops growing once it costs this much per run: the remaining sizes would only burn time.
  const STOP_AT_MS = 4000;
  for (const adversarial of ADVERSARIAL)
    it(adversarial.name, () => {
      const points: { size: number; ms: number }[] = [];
      let lastSize = 0;
      let lastStats: Stats | undefined;
      for (const size of adversarial.sizes) {
        const text = adversarial.build(size);
        const stats = measure(() => analisarAsciiDoc(text), { warmup: 1, minSamples: 5, budgetMs: 800 });
        points.push({ size: text.length, ms: stats.median });
        lastSize = size;
        lastStats = stats;
        if (stats.median > STOP_AT_MS) break;
      }
      const exponent = growthExponent(points);
      suite.record('Adversarial: analisarAsciiDoc at the largest size reached', `${adversarial.name}, n=${lastSize}`, lastStats as Stats, {
        KB: (adversarial.build(lastSize).length / 1024).toFixed(0),
        'Growth exponent': exponent === null ? 'n/a' : exponent.toFixed(2),
      });
    });
});
