// The house formula engine (Docs/PLAN-formulas.md, M1–M4): TeX and AsciiMath → MathML Core, zero dependencies.
import { describe, expect, it } from 'vitest';
import { renderizarFormula } from '@core/lib/formula';
import { replaceFormulas } from '../src/export/formulaPrePass';

function tex(source: string, block = false): string {
  return renderizarFormula(source, { notacao: 'latexmath', bloco: block, anotar: false }).mathml.replace(/^<math[^>]*>/, '').replace(/<\/math>$/, '');
}

function am(source: string, block = false): string {
  return renderizarFormula(source, { notacao: 'asciimath', bloco: block, anotar: false }).mathml.replace(/^<math[^>]*>/, '').replace(/<\/math>$/, '');
}

describe('TeX → MathML', () => {
  it('renders scripts, fractions, roots and merges digits', () => {
    expect(tex('x^2_i')).toBe('<msubsup><mi>x</mi><mi>i</mi><mn>2</mn></msubsup>');
    expect(tex('\\frac{1}{2}')).toBe('<mfrac><mn>1</mn><mn>2</mn></mfrac>');
    expect(tex('\\sqrt[3]{x}')).toBe('<mroot><mi>x</mi><mn>3</mn></mroot>');
    expect(tex('3.14')).toBe('<mn>3.14</mn>');
    expect(tex("f'(x)")).toContain('<msup><mi>f</mi><mo lspace="0" rspace="0" stretchy="false">′</mo></msup>');
  });

  it('puts limits over big operators in display mode and beside them inline', () => {
    expect(tex('\\sum_{i=1}^n', true)).toMatch(/^<munderover>/);
    expect(tex('\\sum_{i=1}^n', false)).toMatch(/^<msubsup>/);
    expect(tex('\\int_0^1', true)).toMatch(/^<msubsup>/);
    expect(tex('\\lim_{x\\to 0}', true)).toMatch(/^<munder>/);
    expect(tex('\\sin x')).toBe('<mrow><mi>sin</mi><mo>\u2061</mo><mi>x</mi></mrow>');
  });

  it('maps fonts to Unicode math alphanumerics (MathML Core ignores mathvariant other than normal)', () => {
    expect(tex('\\mathbf{v}')).toBe('<mi>𝐯</mi>');
    expect(tex('\\mathbb{R}')).toBe('<mi>ℝ</mi>');
    expect(tex('\\mathcal{L}')).toBe('<mi>ℒ</mi>');
    expect(tex('\\mathrm{d}')).toBe('<mi mathvariant="normal">d</mi>');
    expect(tex('\\mathit{abc}')).toBe('<mrow><mi>𝑎</mi><mi>𝑏</mi><mi>𝑐</mi></mrow>');
  });

  it('stretches \\left…\\right but not plain parentheses', () => {
    expect(tex('(x)')).toContain('<mo stretchy="false" form="prefix">(</mo>');
    expect(tex('\\left(x\\right)')).toContain('<mo stretchy="true" symmetric="true" form="prefix" fence="true">(</mo>');
    expect(tex('\\big(')).toContain('minsize="1.2em"');
  });

  it('renders environments as mtable with delimiters and alignment classes', () => {
    const m = tex('\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', true);
    expect(m).toContain('<mtable class="adc-f-arranjo adc-f-pmatrix">');
    expect(m.match(/<mtr>/g)?.length).toBe(2);
    expect(tex('\\begin{cases} 1 & x \\end{cases}', true)).toContain('adc-f-cases');
    expect(tex('\\begin{array}{c|r} 1 & 2 \\\\ \\hline 3 & 4 \\end{array}', true)).toContain('adc-f-borda-esq');
    expect(tex('\\begin{align} a &= b \\\\ c &= d \\end{align}', true)).toContain('<mtd class="adc-f-etiqueta"><mtext>(2)</mtext></mtd>');
  });

  it('expands user macros and the built-in ones', () => {
    expect(tex('\\def\\f#1{F(#1)}\\f{x}')).toContain('<mi>F</mi>');
    expect(tex('\\newcommand{\\R}{\\mathbb{R}}\\R')).toBe('<mi>ℝ</mi>');
    expect(tex('a \\coloneqq b')).toContain('<mo>≔</mo>');
    expect(tex('a \\Coloneqq b')).toContain('<mo>∷</mo>');
    expect(tex('\\operatorname*{arg\\,max}_x', true)).toMatch(/^<munder>/);
  });

  it('accents, text, colour, spacing, enclosures, arrows', () => {
    expect(tex('\\hat{x}')).toBe('<mover accent="true"><mi>x</mi><mo stretchy="false">^</mo></mover>');
    expect(tex('\\text{if } x')).toContain('<mtext>if\u00a0</mtext>');
    expect(tex('\\color{red}{x}')).toBe('<mstyle mathcolor="red"><mi>x</mi></mstyle>');
    expect(tex('a\\,b')).toContain('<mspace width="0.1667em"/>');
    expect(tex('\\boxed{x}')).toContain('adc-f-cerc-boxed');
    expect(tex('\\xrightarrow[u]{o}')).toMatch(/^<munderover><mo stretchy="true"/);
    expect(tex('\\not=')).toBe('<mo>=\u0338</mo>');
  });

  it('never throws: unknown commands and missing arguments become merror plus warnings', () => {
    const r = renderizarFormula('\\nope{x} + \\frac{1}', { notacao: 'latexmath', bloco: false });
    expect(r.mathml).toContain('<merror class="adc-f-erro"><mtext>\\nope</mtext></merror>');
    expect(r.avisos.map((a) => a.texto)).toEqual(['Comando desconhecido: `\\nope`.', 'Faltou argumento no fim da fórmula.']);
    expect(renderizarFormula('x^', { notacao: 'latexmath', bloco: false }).avisos.length).toBe(1);
    expect(renderizarFormula('\\left( x', { notacao: 'latexmath', bloco: false }).avisos[0].texto).toBe('`\\left` sem `\\right`.');
  });

  it('carries the source in an annotation', () => {
    expect(renderizarFormula('x', { notacao: 'latexmath', bloco: false }).mathml).toContain('<annotation encoding="application/x-tex">x</annotation>');
  });
});

describe('AsciiMath → MathML', () => {
  it('reads the asciimath.org grammar: fractions strip parentheses, scripts, matrices, text, functions', () => {
    expect(am('sqrt(4) = 2')).toBe('<mrow><msqrt><mn>4</mn></msqrt><mo>=</mo><mn>2</mn></mrow>');
    expect(am('(a+b)/(c)')).toBe('<mfrac><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mi>c</mi></mfrac>');
    expect(am('x_(i+1)^2')).toBe('<msubsup><mi>x</mi><mrow><mi>i</mi><mo>+</mo><mn>1</mn></mrow><mn>2</mn></msubsup>');
    expect(am('[[a,b],[c,d]]')).toContain('<mtable class="adc-f-arranjo adc-f-matrix">');
    expect(am('"hello" text(and) bb(R)')).toContain('<mtext>hello\u00a0and\u00a0</mtext>');
    expect(am('bb(R)')).toBe('<mi>𝐑</mi>');
    expect(am('lim_(x->0)', true)).toMatch(/^<munder>/);
    expect(am('|x| != oo')).toContain('<mo>≠</mo><mi mathvariant="normal">∞</mi>');
  });
});

describe('export pre-pass (DF-7)', () => {
  const doc = ':stem: latexmath\n\nInline stem:[x^2] and asciimath:[sqrt(x)] here.\n\n.Sum\n[stem]\n++++\n\\sum_{i=1}^n i\n++++\n\n[asciimath]\nx/2\n\n----\nstem:[kept as code]\n----\n';

  it('replaces inline and block formulas with passthrough MathML for HTML and drops :stem:', () => {
    const r = replaceFormulas(doc, 'html');
    expect(r.count).toBe(4);
    expect(r.text).not.toContain(':stem:');
    expect(r.text).toContain('Inline pass:[<math xmlns="http://www.w3.org/1998/Math/MathML" class="adc-formula"><semantics><msup><mi>x</mi><mn>2</mn></msup>');
    expect(r.text).toContain('.Sum\n++++\n<div class="stemblock"><div class="content"><math');
    expect(r.text).toContain('++++\n<div class="stemblock"><div class="content"><math xmlns="http://www.w3.org/1998/Math/MathML" class="adc-formula" display="block"><semantics><mfrac>');
    expect(r.text).toContain('----\nstem:[kept as code]\n----');
    expect(r.warnings).toEqual([]);
  });

  it('wraps DocBook output in inlineequation/informalequation and encodes ] inside pass:[]', () => {
    const r = replaceFormulas('a stem:[f(x) = [x]] b', 'docbook');
    expect(r.text).toMatch(/^a pass:\[<inlineequation><math .*<\/inlineequation>\] b$/);
    expect(r.text).not.toMatch(/<mo[^>]*>\]<\/mo>/);
    expect(r.text).toContain('&#93;');
  });

  it('does not treat a fenced block opened with a language as swallowing the rest of the document', () => {
    const r = replaceFormulas('```python\nstem:[code]\n```\n\nstem:[x]\n', 'html');
    expect(r.count).toBe(1);
    expect(r.text).toContain('```python\nstem:[code]\n```');
  });

  it('reports renderer warnings with the source line', () => {
    const r = replaceFormulas('line one\n\nlatexmath:[\\nope]\n', 'html');
    expect(r.warnings).toEqual([{ line: 3, text: 'Comando desconhecido: `\\nope`.' }]);
  });
});
