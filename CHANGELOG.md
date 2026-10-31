# Changelog

All notable changes to the Tootega AsciiDoc extension are recorded here.

## 0.1.0 — 2026-10-31

First version. Built against the official Asciidoctor extension (4.2) as the parity benchmark.

- **Edit full elements sample** command: opens an editable copy of a complete example (every element and variation, in
  the interface language) that ships with the extension — includes, tagged code snippet and images included.
- **New AsciiDoc document** command (palette, File › New File…, Explorer folder menu): creates the file with a
  skeleton and opens it in the Tootega editor.
- Custom editor for `.adoc`, `.asciidoc`, `.asc` and `.ad`, default on open: **Visual** (WYSIWYG), **Code** (with
  highlighting, find/replace, go to line) and **Split** (code on the left, live view on the right), structure
  panel, undo/redo, contained dialogs (link, image, table, cross-reference, footnote, attribute, keyboard/button/menu,
  anchor). The editor engine is `@Tootega/core` (TootegaWebUI).
- The VS Code text document stays the source of truth: save, dirty state, hot exit, Git and diff work as for any
  file; external changes flow back into the editor.
- Preview to the side of the native text editor, with scroll sync and lock.
- Language support in the native editor: TextMate grammar, language configuration, snippets, outline (document
  symbols), workspace symbols, folding, document links, attribute hover, completion (attributes, anchors, paths),
  paste/drop image, parser diagnostics.
- Export to HTML (standalone, Asciidoctor stylesheet, embedded images), PDF (no external tool), Markdown (GFM) and
  DocBook 5 through the AsciiDocConverter library compiled to WebAssembly.
- Bilingual interface: Brazilian Portuguese and international English, following the VS Code display language.
- Formulas (STEM): `stem:[]`, `latexmath:[]` and `asciimath:[]` inline and the `[stem]`/`[latexmath]`/`[asciimath]`
  blocks are typeset by the editor's **own formula engine** (TeX and AsciiMath → MathML Core, no third-party code),
  live in the Visual and Split views, in the block island (with the source editable below) and in the insert dialog;
  toolbar entry and dialog in Visual and Code modes, highlighting, snippets, cheat sheet section. HTML and DocBook
  exports carry the MathML; PDF and Markdown keep the notation. Latin Modern Math ships with the extension (GUST Font
  License) so formulas look the same on Windows and Linux. Unknown commands render as marked errors with a warning
  list — never silently.
