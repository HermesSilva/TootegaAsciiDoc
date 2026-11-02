// The formula engine (TeX and AsciiMath to MathML) over the same corpus the fidelity oracle uses.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { analisarAsciiMath, analisarTeX, construirMathML, paraXML, renderizarFormula } from '@core/lib/formula';
import { replaceFormulas } from '../../src/export/formulaPrePass';
import { measure, statsOf } from './lib/measure';
import { Suite } from './lib/report';

const suite = new Suite('formula', 'Formula engine');
suite.note('renderizarFormula runs in the render of each formula block and inline formula (XFormula is memoized by source), and for every formula on export.');
afterAll(() => suite.flush());

const corpus = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'scripts', 'formula-corpus.json'), 'utf8')) as string[];

const LONG_TEX = '\\begin{aligned} f(x) &= \\sum_{i=1}^{n} \\frac{a_i^2 + \\sqrt{b_i}}{\\int_0^1 g(t)\\,dt} \\\\ g(x) &= \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} \\cdot \\left( \\frac{1}{1+\\frac{1}{x}} \\right) \\end{aligned}';
const ASCIIMATH = ['x^2 + y^2 = z^2', 'sum_(i=1)^n i^3=((n(n+1))/2)^2', 'int_0^1 f(x) dx', '[[a,b],[c,d]]', 'sqrt(x+1)/(x-1)', 'lim_(x->oo) (1+1/x)^x'];

describe('corpus', () => {
  it('TeX, one pass, each formula once per sample', () => {
    const results = corpus.map((source) => renderizarFormula(source, { notacao: 'latexmath', bloco: true }));
    expect(results.every((result) => result.mathml.startsWith('<math'))).toBe(true);
    suite.time('Whole corpus', `TeX, ${corpus.length} formulas: renderizarFormula`, () => {
      for (const source of corpus) renderizarFormula(source, { notacao: 'latexmath', bloco: true });
    }, { warmup: 10, budgetMs: 1000 });
  });

  it('per formula distribution', () => {
    const values = corpus.map((source) => measure(() => renderizarFormula(source, { notacao: 'latexmath', bloco: true }), { warmup: 20, minSamples: 20, maxSamples: 50, budgetMs: 5 }).median);
    suite.record('Distribution: median of each corpus formula', `TeX, ${corpus.length} formulas`, statsOf(values));
  });
});

describe('stages of one formula', () => {
  it('long TeX', () => {
    const { nos } = analisarTeX(LONG_TEX, { display: true });
    expect(nos.length).toBeGreaterThan(0);
    const tree = construirMathML(nos, { display: true, fonte: LONG_TEX, codificacao: 'application/x-tex' });
    suite.time('Long TeX formula', 'analisarTeX', () => analisarTeX(LONG_TEX, { display: true }), { warmup: 200, budgetMs: 300 });
    suite.time('Long TeX formula', 'construirMathML', () => construirMathML(nos, { display: true, fonte: LONG_TEX, codificacao: 'application/x-tex' }), { warmup: 200, budgetMs: 300 });
    suite.time('Long TeX formula', 'paraXML', () => paraXML(tree), { warmup: 200, budgetMs: 300 });
    suite.time('Long TeX formula', 'renderizarFormula, total', () => renderizarFormula(LONG_TEX, { notacao: 'latexmath', bloco: true }), { warmup: 200, budgetMs: 300 });
  });

  for (const source of ASCIIMATH)
    it(`AsciiMath ${source}`, () => {
      expect(analisarAsciiMath(source).nos.length).toBeGreaterThan(0);
      suite.time('AsciiMath formula: renderizarFormula', source.replace(/\|/g, '\\|'), () => renderizarFormula(source, { notacao: 'asciimath', bloco: false }), { warmup: 200, budgetMs: 150 });
    });
});

describe('export pre-pass', () => {
  for (const count of [10, 100, 1000])
    it(`${count} formulas`, () => {
      const text = Array.from({ length: count }, (_, i) => `Valor latexmath:[x_{${i}}^2 + \\frac{a}{b}] no texto.\n\n[stem]\n++++\n\\sum_{k=1}^{${i + 1}} k\n++++\n`).join('\n');
      expect(replaceFormulas(text, 'html').text.length).toBeGreaterThan(text.length);
      suite.time('replaceFormulas, target HTML', `${count} inline + ${count} block`, () => replaceFormulas(text, 'html'), { budgetMs: 500 });
    });
});
