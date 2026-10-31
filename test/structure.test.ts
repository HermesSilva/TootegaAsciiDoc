import { describe, expect, it } from 'vitest';
import { attributeReferences, autoId, scanStructure, splitFragment } from '../src/language/structure';
import { relativePath } from '../shared/attributes';

const DOC = `= Title
:toc:
:imagesdir: img

== First section

Text with {toc} and xref:other.adoc#sec[link] and <<_second_section>>.

[[custom]]
== Second section

image::pic.png[Alt]

----
== not a heading
----

include::parts/a.adoc[leveloffset=+1]

== First section
`;

describe('scanStructure', () => {
  const s = scanStructure(DOC);

  it('reads headings with generated and explicit ids, deduplicating repeats', () => {
    expect(s.headings.map((h) => [h.level, h.text, h.id])).toEqual([
      [0, 'Title', '_title'],
      [1, 'First section', '_first_section'],
      [1, 'Second section', 'custom'],
      [1, 'First section', '_first_section_2'],
    ]);
    expect(s.headings[2].explicitId).toBe('custom');
  });

  it('skips headings inside verbatim blocks', () => {
    expect(s.headings.some((h) => h.text === 'not a heading')).toBe(false);
    expect(s.verbatimLines.has(14)).toBe(true);
  });

  it('reads attributes', () => {
    expect(s.attributes.map((a) => [a.name, a.value])).toEqual([
      ['toc', ''],
      ['imagesdir', 'img'],
    ]);
  });

  it('reads references of every kind', () => {
    const kinds = s.references.map((r) => `${r.kind}:${r.target}${r.fragment ? `#${r.fragment}` : ''}`);
    expect(kinds).toContain('xref:other.adoc#sec');
    expect(kinds).toContain('xref:#_second_section');
    expect(kinds).toContain('image:pic.png');
    expect(kinds).toContain('include:parts/a.adoc');
  });

  it('reads delimited blocks', () => {
    expect(s.blocks).toEqual([{ delimiter: '----', startLine: 13, endLine: 15 }]);
  });
});

describe('helpers', () => {
  it('autoId follows Asciidoctor', () => {
    expect(autoId('Seção com Acentos & símbolos!')).toBe('_secao_com_acentos_simbolos');
  });
  it('splitFragment', () => {
    expect(splitFragment('a.adoc#x')).toEqual(['a.adoc', 'x']);
    expect(splitFragment('x')).toEqual(['', 'x']);
    expect(splitFragment('a.adoc')).toEqual(['a.adoc', undefined]);
  });
  it('attributeReferences', () => {
    expect(attributeReferences('see {foo} and {bar-2}')).toEqual([
      { name: 'foo', character: 4, length: 5 },
      { name: 'bar-2', character: 14, length: 7 },
    ]);
  });
  it('relativePath', () => {
    expect(relativePath('/d/docs/img', '/d/docs/img/a.png')).toBe('a.png');
    expect(relativePath('/d/docs/img', '/d/docs/other/b.png')).toBe('../other/b.png');
  });
});
