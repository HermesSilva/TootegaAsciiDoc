# Tootega AsciiDoc for VS Code

A complete AsciiDoc editor for Visual Studio Code: **WYSIWYG**, **code with highlighting** and **real-time preview**,
plus export to **HTML, PDF, Markdown and DocBook 5** — all native, with no external tool to install. Interface in
Brazilian Portuguese and international English.

Benchmark: the official Asciidoctor extension (4.2) — at its level or better (parity matrix in
[`Docs/PLAN.md`](Docs/PLAN.md) §4).

## What you get

- **Tootega editor** as the default for `.adoc`, `.asciidoc`, `.asc` and `.ad`: three modes — *Visual* (WYSIWYG),
  *Code* (AsciiDoc with highlighting, find/replace, go to line) and *Split* (code on the left, live view on the
  right) — a structure panel, undo/redo, and dialogs for links, images, tables, cross references, footnotes,
  attributes, keyboard/button/menu macros and anchors. *Show source* returns to the native text editor.
- **The VS Code text document stays the source of truth**: save, dirty state, hot exit, Git and diff work as for
  any file; external changes flow back into the editor.
- **Preview to the side** of the native text editor (`Ctrl+K V`), with scroll sync both ways, lock and refresh.
- **Native editor support**: TextMate grammar, snippets, outline and workspace symbols, folding, document links
  (includes, images, xrefs, URLs), attribute hover, completion (attributes, anchors, paths), paste/drop images
  (saved into `:imagesdir:`), parser diagnostics in the Problems panel, `Ctrl+B` / `Ctrl+I` / `Ctrl+M`.
- **Export** (title-bar menu, context menus, `Ctrl+Alt+S` for HTML): HTML (standalone, Asciidoctor stylesheet,
  images embedded), PDF (written by the converter — nothing to install), Markdown (GFM) and DocBook 5, through the
  [AsciiDocConverter](https://github.com/HermesSilva/AsciiDocConverter) library compiled to WebAssembly. Converter
  messages appear in the Problems panel.
- **Cheat sheet** command with the syntax in the interface language.
- **Formulas** (`stem`, `latexmath`, `asciimath`) typeset by the editor's own TeX/AsciiMath → MathML engine, in the
  views and in HTML/DocBook exports — no third-party math library; Latin Modern Math ships with the extension.

## Architecture

```
TootegaAsciiDoc/
├── src/            extension host (TypeScript, VS Code API)
│   ├── editor/     CustomTextEditorProvider, minimal-diff sync, webview HTML
│   ├── preview/    side preview with scroll sync
│   ├── language/   symbols, folding, links, hover, completion, diagnostics, image paste, formatting
│   ├── export/     worker_thread + WebAssembly converter
│   └── cheatsheet/
├── webview/        React 19 webview: App, PreviewView, theme bridge, i18n
├── shared/         protocol and pure helpers shared by host and webview
├── TootegaWebUI/   the editor engine — separate repository, checked out here (ignored by git)
├── syntaxes/ snippets/ l10n/ media/
└── Docs/           PLAN.md (decisions, phases) and samples/
```

The editor engine is `@Tootega/core` ([TootegaWebUI](https://github.com/Tootega/TootegaWebUI)),
`src/components/asciidoc`. It is reached through the `@core` alias (esbuild and tsconfig), **not** through npm,
because the engine ships its own `node_modules` and a second React copy would break the hooks. The webview
stylesheet is built by the Tailwind v4 CLI from the engine's design system; a theme bridge converts the
`--vscode-*` colours into the engine's HSL tokens, so the editor follows every VS Code theme.

## Building

Prerequisites: Node 20+, the engine checkout and (for export) the converter's `.wasm`.

```powershell
git clone https://github.com/HermesSilva/TootegaAsciiDoc.git
cd TootegaAsciiDoc
git clone https://github.com/Tootega/TootegaWebUI.git           # at the root, folder TootegaWebUI
git clone https://github.com/HermesSilva/AsciiDocConverter.git ..\AsciiDocConverter   # sibling; Dist/ has the .wasm
npm install
npm run build          # dist/extension.js, dist/export-worker.js, dist/webview/*, dist/AsciiDocConverter.wasm
npm run typecheck      # host + webview
npm test               # host unit tests (vitest)
.\run-dev.ps1          # opens VS Code with the extension loaded on Docs/samples (also run-dev.sh / run-dev.cmd)
.\package-vsix.ps1     # builds the .vsix — THE only way to package (see below)
```

**Build number.** The Marketplace only accepts `major.minor.patch`, so the **patch is the build number**: every run of
`package-vsix.ps1` / `.sh` / `.cmd` (or `npm run vsix`) bumps it (`npm version patch`), writes `tootega-asciidoc-<version>.vsix`
and the extension logs its version on activation (output channel "Tootega AsciiDoc"). Never call `vsce package`
directly — that produces a package without a new build number. Commit the bumped `package.json`/`package-lock.json`
with the build. `major.minor` change by hand when a release deserves it.

`ASCIIDOCCONVERTER_ROOT` points the build at another checkout of the converter; without the `.wasm`, everything
but export works and the export command says exactly what is missing.

## Settings

All under `tootegaAsciidoc.*`: interface language, default mode, structure panel, preview scroll sync and refresh
interval, remote images, paste directory and copy policy, diagnostics, export output folder / ask location / open
after export / attributes / HTML standalone / embed images / stylesheet / PDF page size / allow resources outside
the workspace, spell check, debug log. Descriptions appear in the Settings UI in your language.

## License

MIT — Tootega Pesquisa e Inovação.
