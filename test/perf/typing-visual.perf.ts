// One keystroke in Visual mode (and in the visual side of Split): the model transactions, stage by stage, and what
// runs after the pause. The DOM and React work on top of this is in webview.perf.ts.
import { afterAll, describe, expect, it } from 'vitest';
import { Historico } from '@core/components/asciidoc/editor/historico';
import { gravarLinhasDoSerializador } from '@core/components/asciidoc/editor/linhas';
import { ajustarSelecao, selecaoColapsada, type Selecao } from '@core/components/asciidoc/editor/selecao';
import { alternarMarca, apagarParaTras, dividirBloco, inserirTexto } from '@core/components/asciidoc/editor/transacoes';
import { comprimentoInline, folhaPorID, folhasDoDocumento, marcasNaPosicao } from '@core/components/asciidoc/modelo/documento';
import type { Documento } from '@core/components/asciidoc/modelo/tipos';
import { analisarAsciiDoc } from '@core/components/asciidoc/parser/blocos';
import { serializarDocumento, serializarDocumentoComLinhas } from '@core/components/asciidoc/serializador/serializar';
import { imagesDirOf } from '../../shared/attributes';
import { minimalEdit } from '../../src/editor/textDiff';
import { PURE_COPIES, sizedDocument, TYPED_TEXT } from './lib/corpus';
import { consume, Stages } from './lib/measure';
import { Suite } from './lib/report';

const suite = new Suite('typing-visual', 'Typing in Visual mode, without React');
suite.note('The "Per key" groups run synchronously on each key. Each new document is a new object, so the leaf list the engine memoizes per document is rebuilt per key, as in the editor.');
afterAll(() => suite.flush());

const WARMUP_KEYS = 30;

function paragraphLeaf(document: Documento, fraction: number): { id: string; length: number } {
  const leaves = folhasDoDocumento(document).filter((leaf) => leaf.especie === 'paragrafo');
  const leaf = leaves[Math.min(leaves.length - 1, Math.floor(leaves.length * fraction))];
  return { id: leaf.folha.id, length: comprimentoInline(leaf.folha.conteudo) };
}

describe('one keystroke, by size and paragraph position', () => {
  for (const copies of PURE_COPIES) {
    const doc = sizedDocument(copies);
    for (const [where, fraction] of [['first', 0], ['middle', 0.5], ['last', 1]] as const)
      it(`${doc.label}, ${where} paragraph`, () => {
        const start = analisarAsciiDoc(doc.text).documento;
        const leaf = paragraphLeaf(start, fraction);
        const history = new Historico();
        const stages = new Stages();
        let document = start;
        let selection: Selecao | null = selecaoColapsada(leaf.id, leaf.length);
        const keys = (TYPED_TEXT.slice(0, WARMUP_KEYS) + TYPED_TEXT).split('');
        keys.forEach((key, index) => {
          stages.setRecording(index >= WARMUP_KEYS);
          const before = document;
          const beforeSelection = selection;
          const result = stages.time('inserirTexto', () => inserirTexto(before, beforeSelection as Selecao, key));
          stages.time('Historico.registrar', () => history.registrar({ documento: before, selecao: beforeSelection }, 'digitar'));
          document = result.documento;
          selection = stages.time('ajustarSelecao', () => ajustarSelecao(document, result.selecao ?? null));
          stages.time('toolbar state: folhaPorID + marcasNaPosicao', () => {
            const current = folhaPorID(document, (selection as Selecao).foco.folha);
            consume(current && marcasNaPosicao(current.folha.conteudo, (selection as Selecao).foco.deslocamento));
          });
          stages.endRound();
        });
        const edited = folhaPorID(document, leaf.id);
        expect(edited && comprimentoInline(edited.folha.conteudo)).toBe(leaf.length + keys.length);
        for (const [stage, stats] of stages.results()) suite.record(`Per key: ${doc.label}, ${where} paragraph`, stage, stats);
      });
  }
});

describe('other keys and commands', () => {
  for (const copies of PURE_COPIES) {
    const doc = sizedDocument(copies);
    it(doc.label, () => {
      const start = analisarAsciiDoc(doc.text).documento;
      const leaf = paragraphLeaf(start, 0.5);
      // A shallow copy is a new document to the engine's per-document memo, as the result of the previous key is.
      const fresh = (): Documento => ({ ...start });
      expect(dividirBloco(fresh(), selecaoColapsada(leaf.id, Math.floor(leaf.length / 2))).documento).not.toBe(start);
      suite.time('Enter: dividirBloco, middle paragraph', doc.label, (document: Documento) => dividirBloco(document, selecaoColapsada(leaf.id, Math.floor(leaf.length / 2))), { prepare: fresh, budgetMs: 400 });
      suite.time('Backspace joining paragraphs: apagarParaTras, middle paragraph', doc.label, (document: Documento) => apagarParaTras(document, selecaoColapsada(leaf.id, 0)), { prepare: fresh, budgetMs: 400 });
      const whole: Selecao = { ancora: { folha: leaf.id, deslocamento: 0 }, foco: { folha: leaf.id, deslocamento: leaf.length } };
      suite.time('Ctrl+B: alternarMarca over a paragraph', doc.label, (document: Documento) => alternarMarca(document, whole, { tipo: 'negrito' }), { prepare: fresh, budgetMs: 400 });
    });
  }
});

describe('after the pause', () => {
  for (const copies of PURE_COPIES) {
    const doc = sizedDocument(copies);
    it(doc.label, () => {
      const start = analisarAsciiDoc(doc.text).documento;
      const leaf = paragraphLeaf(start, 0.5);
      const edited = inserirTexto(start, selecaoColapsada(leaf.id, leaf.length), TYPED_TEXT).documento;
      const before = serializarDocumento(start);
      const after = serializarDocumento(edited);
      expect(after.length).toBeGreaterThan(before.length);

      // The editor's delayed emission, in a typing session: only the edited block misses the serializer's per-block memo.
      let typed = edited;
      const nextEdit = (): Documento => {
        typed = inserirTexto(typed, selecaoColapsada(leaf.id, leaf.length), 'x').documento;
        return typed;
      };
      suite.time('After the pause, 150 ms: emission (serialize with lines + write lines + imagesDirOf)', doc.label, (document: Documento) => {
        const { texto, linhas } = serializarDocumentoComLinhas(document);
        gravarLinhasDoSerializador(document, linhas);
        return imagesDirOf(texto);
      }, { prepare: nextEdit, budgetMs: 800 });
      // The first time nothing is memoized yet: what a freshly opened document pays once.
      suite.time('After the pause, 150 ms: serializarDocumento, nothing memoized', doc.label, () => serializarDocumento(analisarAsciiDoc(doc.text).documento), { budgetMs: 800 });
      suite.time('After the pause, 270 ms: minimalEdit on the host', doc.label, () => minimalEdit(before, after), { budgetMs: 400 });
    });
  }
});
