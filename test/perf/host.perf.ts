// What the extension host runs on the text: the edit diff and the structure scan behind symbols, links, folding,
// hover and completion.
import { afterAll, describe, expect, it } from 'vitest';
import { attributeReferences, scanStructure } from '../../src/language/structure';
import { minimalEdit } from '../../src/editor/textDiff';
import { documentAttribute, imagesDirOf } from '../../shared/attributes';
import { PURE_COPIES, sizedDocument } from './lib/corpus';
import { Suite } from './lib/report';

const suite = new Suite('host', 'Extension host');
afterAll(() => suite.flush());

describe('minimalEdit', () => {
  for (const copies of PURE_COPIES) {
    const doc = sizedDocument(copies);
    const { text } = doc;
    const middle = Math.floor(text.length / 2);
    const cases: [string, string][] = [
      ['one character at the start', `x${text}`],
      ['one character in the middle', `${text.slice(0, middle)}x${text.slice(middle)}`],
      ['one character at the end', `${text}x`],
      ['nothing changed, equal but distinct strings', `${text} `.slice(0, -1)],
      ['everything changed', text.toUpperCase()],
    ];
    for (const [name, next] of cases)
      it(`${doc.label}, ${name}`, () => {
        const edit = minimalEdit(text, next);
        if (edit) expect(text.slice(0, edit.start) + edit.text + text.slice(edit.end)).toBe(next);
        suite.time(`minimalEdit: ${name}`, doc.label, () => minimalEdit(text, next), { budgetMs: 200 });
      });
  }
});

describe('structure scan and attributes', () => {
  for (const copies of PURE_COPIES) {
    const doc = sizedDocument(copies);
    it(doc.label, () => {
      expect(scanStructure(doc.text).headings.length).toBeGreaterThan(0);
      suite.time('scanStructure', doc.label, () => scanStructure(doc.text), { budgetMs: 600 });
      suite.time('imagesDirOf, attribute present', doc.label, () => imagesDirOf(doc.text), { budgetMs: 150 });
      suite.time('documentAttribute, attribute absent', doc.label, () => documentAttribute(doc.text, 'nao-existe'), { budgetMs: 150 });
    });
  }

  it('attributeReferences, one line', () => {
    const line = 'Texto com {produto} e {versao-minima} e mais um {atributo} no fim da linha.';
    expect(attributeReferences(line).length).toBe(3);
    suite.time('attributeReferences', 'one line, 3 references', () => attributeReferences(line), { warmup: 200, budgetMs: 150 });
  });
});
