// Line stamping after a visual edit (split mode): the virtual cursor in both directions depends on `linha`.
import { describe, expect, it } from 'vitest';
import { analisarAsciiDoc, serializarDocumento, type Bloco } from '@core/components/asciidoc';
import { carimbarLinhas } from '@core/components/asciidoc/editor/linhas';
import { novoID } from '@core/components/asciidoc/modelo/documento';

describe('carimbarLinhas', () => {
  it('re-stamps every block (including nested ones) after the model changed and keeps the objects', () => {
    const { documento } = analisarAsciiDoc('== Title\n\nfirst\n\n* a\n* b\n\n====\ninner\n====');
    const inserted: Bloco = { id: novoID(), tipo: 'paragrafo', conteudo: [{ tipo: 'texto', texto: 'new paragraph', marcas: [] }] };
    const doc = { ...documento, blocos: [documento.blocos[0], inserted, ...documento.blocos.slice(1)] };
    const text = serializarDocumento(doc);
    const antes = doc.blocos.map((b) => b.id);
    expect(carimbarLinhas(doc, text)).toBe(true);
    expect(doc.blocos.map((b) => b.id)).toEqual(antes);
    expect(doc.blocos.map((b) => b.linha)).toEqual([1, 3, 5, 7, 10]);
    const container = doc.blocos[4] as Bloco & { tipo: 'container' };
    expect(container.filhos[0].linha).toBe(11);
  });

  it('refuses to stamp when the structure does not match and leaves the lines alone', () => {
    const { documento } = analisarAsciiDoc('one\n\ntwo');
    expect(carimbarLinhas(documento, 'only one paragraph')).toBe(false);
    expect(documento.blocos.map((b) => b.linha)).toEqual([1, 3]);
  });
});
