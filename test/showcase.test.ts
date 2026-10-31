// The showcase documents that ship with the extension (media/showcase) must parse in the editor engine without
// warnings, survive a visual edit (parse → serialize → parse is stable and keeps the constructs the model does not
// represent) and convert through the AsciiDocConverter .wasm without errors — in both languages.
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { analisarAsciiDoc } from '@core/components/asciidoc/parser/blocos';
import { serializarDocumento } from '@core/components/asciidoc/serializador/serializar';
import { ExportFormat, WASM_FILE } from '../src/export/abi';
import { WasmConverter } from '../src/export/wasmConverter';

const root = path.resolve(__dirname, '..');
const docs = [path.join(root, 'media', 'showcase', 'pt-BR', 'exemplo-completo.adoc'), path.join(root, 'media', 'showcase', 'en', 'showcase.adoc')];
const wasmDir = [path.join(root, 'dist'), path.resolve(root, '..', 'AsciiDocConverter', 'Dist')].find((d) => fs.existsSync(path.join(d, WASM_FILE)));

/** Lines the editor model does not represent and must therefore carry through a visual edit untouched. */
// Tables: header/footer live in the model and come back as `%header%footer`; a CSV/DSV table comes back as a `|`
// table with the same cells (the separator is a notation, not content).
const MUST_SURVIVE = ['[square]', '[start=4]', '[%reversed]', '[loweralpha]', '[upperroman]', '[horizontal]', '[qanda]', '[%hardbreaks]', '[%collapsible]', '[%collapsible%open]', '[discrete]', '[appendix]', '[bibliography]', '[glossary]', '[colophon]', '[abstract]', 'tag=', 'leveloffset=+1', 'lines=3..4', '%header%footer', '%autowidth', 'frame=ends', 'grid=rows', 'stripes=even', 'width=80%', '[stem]\n++++\nsqrt(4) = 2\n++++', 'latexmath:[E = mc^2]', 'asciimath:[x^2 + y^2 = z^2]'];

describe('showcase documents', () => {
  for (const file of docs) {
    const name = path.basename(file);
    const text = fs.readFileSync(file, 'utf8');

    it(`${name}: the engine parses it without warnings`, () => {
      const { documento, avisos } = analisarAsciiDoc(text);
      expect(avisos, avisos.map((a) => `line ${a.linha}: ${a.texto}`).join('\n')).toEqual([]);
      expect(documento.blocos.length).toBeGreaterThan(40);
    });

    it(`${name}: a visual edit keeps what the model does not represent, and the serializer is stable`, () => {
      const once = serializarDocumento(analisarAsciiDoc(text).documento);
      for (const needle of MUST_SURVIVE) expect(once, `lost after one round trip: ${needle}`).toContain(needle);
      const twice = serializarDocumento(analisarAsciiDoc(once).documento);
      expect(twice).toBe(once);
    });

    it.skipIf(!wasmDir)(`${name}: the converter exports it to HTML, PDF, Markdown and DocBook without errors`, async () => {
      const converter = new WasmConverter({ wasmDir: wasmDir as string });
      for (const format of [ExportFormat.HTML5, ExportFormat.PDF, ExportFormat.Markdown, ExportFormat.DocBook5]) {
        const r = await converter.convert({
          id: format,
          text,
          format,
          options: { autonomo: true, idioma: 'en' },
          documentPath: file,
          workspaceFolders: [path.dirname(path.dirname(file))],
          allowOutsideWorkspace: false,
          imagesDir: path.join(path.dirname(path.dirname(file)), 'images'),
        });
        expect(r.ok, `${ExportFormat[format]}: ${r.error ?? ''}`).toBe(true);
        const errors = r.messages.filter((m) => m.nivel === 'erro');
        expect(errors, errors.map((m) => `${m.arquivo ?? ''}:${m.linha}: ${m.texto}`).join('\n')).toEqual([]);
        expect(r.denied).toEqual([]);
        expect((r.output as Uint8Array).length).toBeGreaterThan(1000);
      }
    });
  }

  // Known losses of the visual editor's model (not of the parser): the link target `^`, `role=` on a link and the
  // `q` of `pass:q[]` are not represented by the inline mark and vanish when a document is edited in Visual mode.
  it.todo('inline link options (^, role=) and pass:q substitutions survive a visual edit — engine model gap');
});
