// The toolbar as text edits (Code mode): pure functions of the engine's codigo/edicaoDeTexto.
import { describe, expect, it } from 'vitest';
import { alternarLista, alternarMarca, definirTitulo, envolverLinhas, estadoDaBarraDoCodigo, inserirBloco, limparMarcas, recuarItem, type Edicao } from '@core/components/asciidoc/codigo/edicaoDeTexto';

function apply(text: string, e: Edicao): { text: string; sel: string } {
  const out = text.slice(0, e.ini) + e.texto + text.slice(e.fim);
  return { text: out, sel: out.slice(e.selecao.ini, e.selecao.fim) };
}

describe('alternarMarca', () => {
  it('wraps the selection and unwraps it again', () => {
    const t = 'say hello world';
    const once = apply(t, alternarMarca(t, { ini: 4, fim: 9 }, '*'));
    expect(once.text).toBe('say *hello* world');
    expect(once.sel).toBe('hello');
    const twice = apply(once.text, alternarMarca(once.text, { ini: 5, fim: 10 }, '*'));
    expect(twice.text).toBe(t);
  });
  it('uses the word under a collapsed cursor', () => {
    const t = 'say hello world';
    expect(apply(t, alternarMarca(t, { ini: 6, fim: 6 }, '_')).text).toBe('say _hello_ world');
  });
  it('inserts the pair with the caret between when there is no word', () => {
    const t = 'a  b';
    const r = alternarMarca(t, { ini: 2, fim: 2 }, '`');
    expect(apply(t, r).text).toBe('a `` b');
    expect(r.selecao).toEqual({ ini: 3, fim: 3 });
  });
  it('handles asymmetric marks (roles)', () => {
    const t = 'x word y';
    const r = apply(t, alternarMarca(t, { ini: 2, fim: 6 }, '[.underline]#', '#'));
    expect(r.text).toBe('x [.underline]#word# y');
  });
});

describe('headings, lists, blocks', () => {
  it('sets and clears a heading level on the current line', () => {
    const t = 'intro\nTitle here\nmore';
    const h2 = apply(t, definirTitulo(t, { ini: 8, fim: 8 }, 2));
    expect(h2.text).toBe('intro\n=== Title here\nmore');
    const p = apply(h2.text, definirTitulo(h2.text, { ini: 10, fim: 10 }, 0));
    expect(p.text).toBe(t);
  });
  it('toggles list markers over the selected lines', () => {
    const t = 'one\ntwo\nthree';
    const ul = apply(t, alternarLista(t, { ini: 0, fim: t.length }, 'marcadores'));
    expect(ul.text).toBe('* one\n* two\n* three');
    const ol = apply(ul.text, alternarLista(ul.text, { ini: 0, fim: ul.text.length }, 'numerada'));
    expect(ol.text).toBe('. one\n. two\n. three');
    const off = apply(ol.text, alternarLista(ol.text, { ini: 0, fim: ol.text.length }, 'numerada'));
    expect(off.text).toBe(t);
    const tasks = apply(t, alternarLista(t, { ini: 0, fim: 3 }, 'tarefas'));
    expect(tasks.text.split('\n')[0]).toBe('* [ ] one');
    const dl = apply(t, alternarLista(t, { ini: 0, fim: 3 }, 'descricao'));
    expect(dl.text.split('\n')[0]).toBe('one:: ');
  });
  it('indents and outdents items', () => {
    const t = '* a\n** b\n. c';
    expect(apply(t, recuarItem(t, { ini: 0, fim: t.length }, 1)).text).toBe('** a\n*** b\n.. c');
    expect(apply(t, recuarItem(t, { ini: 0, fim: t.length }, -1)).text).toBe('* a\n* b\n. c');
  });
  it('wraps lines in a delimited block with blank lines around', () => {
    const t = 'before\nquoted\nafter';
    const r = apply(t, envolverLinhas(t, { ini: 7, fim: 9 }, ['[quote]', '____'], ['____']));
    expect(r.text).toBe('before\n\n[quote]\n____\nquoted\n____\n\nafter');
    expect(r.sel).toBe('quoted');
  });
  it('inserts a block after the current line, or in an empty line', () => {
    const t = 'para\n\nnext';
    expect(apply(t, inserirBloco(t, { ini: 2, fim: 2 }, "'''")).text).toBe("para\n\n'''\n\nnext");
    expect(apply(t, inserirBloco(t, { ini: 5, fim: 5 }, '<<<')).text).toBe('para\n<<<\n\nnext');
  });
  it('clears marks in a selection', () => {
    const t = 'a *b* _c_ `d`';
    expect(apply(t, limparMarcas(t, { ini: 2, fim: t.length })).text).toBe('a b c d');
  });
});

describe('estadoDaBarraDoCodigo', () => {
  it('reads marks around the selection and the line kind', () => {
    const t = '=== Title\n* *bold* item';
    const h = estadoDaBarraDoCodigo(t, { ini: 4, fim: 4 });
    expect(h.tipoDeBloco).toBe('titulo2');
    const li = estadoDaBarraDoCodigo(t, { ini: 13, fim: 17 });
    expect(li.lista).toBe('marcadores');
    expect(li.marcas.has('negrito')).toBe(true);
    expect(li.emTabela).toBe(false);
  });
});
