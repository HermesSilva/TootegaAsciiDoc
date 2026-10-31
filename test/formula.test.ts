// Formula recognition (plan M0, Docs/PLAN-formulas.md): stem/latexmath/asciimath inline and block, round-trip.
import { describe, expect, it } from 'vitest';
import { analisarAsciiDoc, serializarDocumento, type Atomo, type Bloco } from '@core/components/asciidoc';
import { notacaoEfetiva } from '@core/components/asciidoc/modelo/documento';

function roundTrip(text: string): string {
  return serializarDocumento(analisarAsciiDoc(text).documento);
}

describe('formula model (M0)', () => {
  it('reads the three inline macros as formula atoms with the source untouched', () => {
    const { documento } = analisarAsciiDoc('See stem:[sqrt(4) = 2], latexmath:[\\frac{a}{b} \\left[x\\right]] and asciimath:[x^2 + y^2].');
    const paragraph = documento.blocos[0] as Bloco & { tipo: 'paragrafo' };
    const atoms = paragraph.conteudo.filter((p): p is Atomo => p.tipo === 'atomo' && p.especie === 'formula');
    expect(atoms.map((a) => a.dados.notacao)).toEqual(['stem', 'latexmath', 'asciimath']);
    expect(atoms[1].dados.texto).toBe('\\frac{a}{b} \\left[x\\right]');
  });

  it('reads [stem], [latexmath] and [asciimath] over passthrough, listing and literal delimiters as formula blocks', () => {
    const text = '[stem]\n++++\nsum_(i=1)^n i\n++++\n\n[latexmath]\n----\nE = mc^2\n----\n\n[asciimath]\n....\na/b\n....';
    const { documento, avisos } = analisarAsciiDoc(text);
    expect(avisos).toEqual([]);
    const blocks = documento.blocos as (Bloco & { tipo: 'formula' })[];
    expect(blocks.map((b) => [b.tipo, b.notacao, b.texto])).toEqual([
      ['formula', 'stem', 'sum_(i=1)^n i'],
      ['formula', 'latexmath', 'E = mc^2'],
      ['formula', 'asciimath', 'a/b'],
    ]);
  });

  it('reads a [stem] paragraph as a formula block and keeps the block title', () => {
    const { documento } = analisarAsciiDoc('.Pythagoras\n[stem]\na^2 + b^2 = c^2');
    const block = documento.blocos[0] as Bloco & { tipo: 'formula' };
    expect(block.tipo).toBe('formula');
    expect(block.titulo).toBe('Pythagoras');
    expect(block.texto).toBe('a^2 + b^2 = c^2');
  });

  it('round-trips inline and block formulas exactly', () => {
    const text = ':stem: latexmath\n\nInline stem:[x^2] and latexmath:[\\sqrt{2}].\n\n[stem]\n.Sum\n++++\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n++++\n\n[asciimath]\n++++\nsqrt(4) = 2\n++++';
    const once = roundTrip(text);
    expect(once).toBe(text);
    expect(roundTrip(once)).toBe(once);
  });

  it('escapes a literal macro-looking text so it does not become a formula', () => {
    const once = roundTrip('Type \\stem:[x] to write a formula.');
    expect(once).toBe('Type \\stem:[x] to write a formula.');
  });

  it('resolves the effective notation from the :stem: attribute as Asciidoctor does', () => {
    expect(notacaoEfetiva('stem', undefined)).toBe('asciimath');
    expect(notacaoEfetiva('stem', '')).toBe('asciimath');
    expect(notacaoEfetiva('stem', 'latexmath')).toBe('latexmath');
    expect(notacaoEfetiva('stem', 'tex')).toBe('latexmath');
    expect(notacaoEfetiva('latexmath', '')).toBe('latexmath');
    expect(notacaoEfetiva('asciimath', 'latexmath')).toBe('asciimath');
  });
});
