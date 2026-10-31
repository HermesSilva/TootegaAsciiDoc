// Exercises the AsciiDocConverter WebAssembly module through the same code the export worker runs: HTML, PDF,
// Markdown and DocBook, nested includes resolved through the origin, denied resources, English/Portuguese messages,
// data-uri images and a custom stylesheet. Skipped (with a reason) when the .wasm is not built yet.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ExportFormat, WASM_FILE, type ConversionRequest } from '../src/export/abi';
import { WasmConverter } from '../src/export/wasmConverter';

const candidates = [
  process.env.ASCIIDOCCONVERTER_ROOT && path.join(process.env.ASCIIDOCCONVERTER_ROOT, 'Dist'),
  path.resolve(__dirname, '..', 'dist'),
  path.resolve(__dirname, '..', '..', 'AsciiDocConverter', 'Dist'),
].filter((p): p is string => Boolean(p));
const wasmDir = candidates.find((dir) => fs.existsSync(path.join(dir, WASM_FILE)));

const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

describe.skipIf(!wasmDir)('AsciiDocConverter.wasm', () => {
  let dir: string;
  let converter: WasmConverter;
  const logs: string[] = [];

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tootega-adoc-'));
    fs.mkdirSync(path.join(dir, 'parts', 'deep'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'images'));
    fs.writeFileSync(path.join(dir, 'main.adoc'), '= Title\nAuthor Name\n:imagesdir: images\n\n== Section\n\nHello *world*.\n\ninclude::parts/a.adoc[]\n\nimage::dot.png[A dot]\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'parts', 'a.adoc'), 'From a.\n\ninclude::deep/b.adoc[]\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'parts', 'deep', 'b.adoc'), 'From b, nested.\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'images', 'dot.png'), PNG_1X1);
    fs.writeFileSync(path.join(dir, 'style.css'), 'body { color: red; }\n', 'utf8');
    fs.writeFileSync(path.join(os.tmpdir(), 'tootega-adoc-outside.adoc'), 'OUTSIDE\n', 'utf8');
    converter = new WasmConverter({ wasmDir: wasmDir as string, log: (m) => logs.push(m) });
    await converter.load();
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(path.join(os.tmpdir(), 'tootega-adoc-outside.adoc'), { force: true });
  });

  const request = (overrides: Partial<ConversionRequest>): ConversionRequest => ({
    id: 1,
    text: fs.readFileSync(path.join(dir, 'main.adoc'), 'utf8'),
    format: ExportFormat.HTML5,
    options: { autonomo: false, idioma: 'en' },
    documentPath: path.join(dir, 'main.adoc'),
    workspaceFolders: [dir],
    allowOutsideWorkspace: false,
    imagesDir: path.join(dir, 'images'),
    ...overrides,
  });

  it('loads and reports its version', () => {
    expect(converter.error).toBeNull();
  });

  it('converts to HTML with nested includes resolved through the origin file', async () => {
    const r = await converter.convert(request({}));
    expect(r.ok, r.error ?? JSON.stringify(r.messages)).toBe(true);
    const html = Buffer.from(r.output as Uint8Array).toString('utf8');
    expect(html).toContain('<strong>world</strong>');
    expect(html).toContain('From a.');
    expect(html).toContain('From b, nested.');
    expect(html).toContain('src="images/dot.png"');
    expect(r.messages.filter((m) => m.nivel === 'erro')).toEqual([]);
    expect(r.version).toMatch(/AsciiDocConverter/);
  });

  it('embeds images as data URIs when asked', async () => {
    const r = await converter.convert(request({ options: { autonomo: true, dataUri: true, idioma: 'en', folhaDeEstilo: 'style.css' } }));
    expect(r.ok, r.error).toBe(true);
    const html = Buffer.from(r.output as Uint8Array).toString('utf8');
    expect(html).toContain('src="data:image/png;base64,iVBORw0KGgo');
    expect(html).toContain('body { color: red; }');
    expect(html).not.toContain('Asciidoctor default stylesheet');
  });

  it('writes messages in English by default and in Portuguese on request, with the file of origin', async () => {
    const text = '= T\n\ninclude::missing.adoc[]\n';
    const en = await converter.convert(request({ text, options: {} }));
    expect(en.messages.some((m) => m.texto.includes('not found or denied'))).toBe(true);
    const pt = await converter.convert(request({ text, options: { idioma: 'pt-BR' } }));
    expect(pt.messages.some((m) => m.texto.includes('não encontrado ou negado'))).toBe(true);
    expect(pt.messages[0]).toHaveProperty('arquivo');
  });

  it('denies resources outside the workspace and reports them', async () => {
    const outside = path.join(os.tmpdir(), 'tootega-adoc-outside.adoc').replace(/\\/g, '/');
    const r = await converter.convert(request({ text: `= T\n\ninclude::${outside}[]\n` }));
    expect(r.ok).toBe(true);
    expect(r.denied.length).toBe(1);
    expect(Buffer.from(r.output as Uint8Array).toString('utf8')).not.toContain('OUTSIDE');
    const allowed = await converter.convert(request({ text: `= T\n\ninclude::${outside}[]\n`, allowOutsideWorkspace: true }));
    expect(Buffer.from(allowed.output as Uint8Array).toString('utf8')).toContain('OUTSIDE');
  });

  it('converts to Markdown and DocBook 5', async () => {
    const md = await converter.convert(request({ format: ExportFormat.Markdown }));
    expect(md.ok, md.error).toBe(true);
    expect(Buffer.from(md.output as Uint8Array).toString('utf8')).toContain('**world**');
    const db = await converter.convert(request({ format: ExportFormat.DocBook5 }));
    expect(db.ok, db.error).toBe(true);
    const xml = Buffer.from(db.output as Uint8Array).toString('utf8');
    expect(xml).toContain('<article xmlns="http://docbook.org/ns/docbook"');
    expect(xml).toContain('<emphasis role="strong">world</emphasis>');
    expect(xml).toContain('<imagedata fileref="images/dot.png"');
    expect(xml).toContain('<section xml:id="_section">');
  });

  it('writes a PDF with a fixed creation date', async () => {
    const r = await converter.convert(request({ format: ExportFormat.PDF, options: { idioma: 'en', pdf: { pagina: 'A4', dataDeCriacao: 'D:20260101000000Z' } } }));
    expect(r.ok, r.error ?? JSON.stringify(r.messages)).toBe(true);
    const pdf = Buffer.from(r.output as Uint8Array);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.toString('latin1')).toContain('/CreationDate (D:20260101000000Z)');
  });

  it('reports an invalid format and keeps working afterwards', async () => {
    const bad = await converter.convert(request({ format: 99 as ExportFormat }));
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('ADC_ERRO_PARAMETRO');
    const good = await converter.convert(request({}));
    expect(good.ok).toBe(true);
  });
});
