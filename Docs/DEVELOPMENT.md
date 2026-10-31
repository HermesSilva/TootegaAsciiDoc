# Development

> The Marketplace-facing description is [`../README.md`](../README.md). This file is for people building the extension.

## Architecture

```
TootegaAsciiDoc/
├── src/            extension host (TypeScript, VS Code API)
│   ├── editor/     CustomTextEditorProvider, minimal-diff sync, webview HTML
│   ├── preview/    side preview with scroll sync
│   ├── language/   symbols, folding, links, hover, completion, diagnostics, image paste, formatting
│   ├── export/     worker_thread + WebAssembly converter, formula pre-pass (MathML into HTML/DocBook)
│   └── cheatsheet/
├── webview/        React 19 webview: App, PreviewView, theme bridge, i18n
├── shared/         protocol and pure helpers shared by host and webview
├── TootegaWebUI/   the editor engine — separate repository, checked out here (ignored by git)
│   └── src/lib/formula/   the TeX + AsciiMath → MathML Core engine (no dependencies)
├── scripts/        gen-icon, gen-readme-media (README illustrations + APNG), formula-oracle (KaTeX comparison)
├── syntaxes/ snippets/ l10n/ media/
└── Docs/           PLAN.md, PLAN-formulas.md (decisions, phases), STATUS.md (ledger), fidelidade-formulas.md, samples/
```

The editor engine is `@Tootega/core` ([TootegaWebUI](https://github.com/HermesSilva/TootegaWebUI)),
`src/components/asciidoc`. It is reached through the `@core` alias (esbuild and tsconfig), **not** through npm,
because the engine ships its own `node_modules` and a second React copy would break the hooks. The webview
stylesheet is built by the Tailwind v4 CLI from the engine's design system; a theme bridge converts the
`--vscode-*` colours into the engine's HSL tokens, so the editor follows every VS Code theme.

## Building

Prerequisites: Node 20+, the engine checkout and (for export) the converter's `.wasm`.

```powershell
git clone https://github.com/HermesSilva/TootegaAsciiDoc.git
cd TootegaAsciiDoc
git clone https://github.com/HermesSilva/TootegaWebUI.git         # at the root, folder TootegaWebUI
git clone https://github.com/HermesSilva/AsciiDocConverter.git ..\AsciiDocConverter   # sibling; Dist/ has the .wasm
npm install
npm run build          # dist/extension.js, dist/export-worker.js, dist/webview/*, dist/AsciiDocConverter.wasm
npm run typecheck      # host + webview
npm test               # host unit tests (vitest)
.\run-dev.ps1          # opens VS Code with the extension loaded on Docs/samples (also run-dev.sh / run-dev.cmd)
.\package-vsix.ps1     # builds the .vsix — THE only way to package (see below)
node scripts/formula-oracle.mjs   # compares the formula engine with KaTeX (fetched into a temp folder)
node scripts/gen-readme-media.mjs # regenerates media/readme/*.png (illustrations and the typing animation)
```

**Build number.** The Marketplace only accepts `major.minor.patch`, so the **patch is the build number**: every run of
`package-vsix.ps1` / `.sh` / `.cmd` (or `npm run vsix`) bumps it (`npm version patch`), writes `tootega-asciidoc-<version>.vsix`
and the extension logs its version on activation (output channel "Tootega AsciiDoc"). Never call `vsce package`
directly — that produces a package without a new build number. Commit the bumped `package.json`/`package-lock.json`
with the build. `major.minor` change by hand when a release deserves it.

**README images.** The Marketplace only shows images from HTTPS URLs, so the package must not depend on a pull request
being merged: `package-vsix.*` runs `scripts/publish-readme-media.mjs`, which pushes `media/readme/*` and `media/icon.png`
to the `assets` branch (git plumbing, no checkout; the branch is never deleted and is not `master`) and passes
`--baseImagesUrl https://raw.githubusercontent.com/HermesSilva/TootegaAsciiDoc/assets` to `vsce`. Packaging therefore
needs network access to GitHub; without it the script stops instead of shipping broken images.

`ASCIIDOCCONVERTER_ROOT` points the build at another checkout of the converter; without the `.wasm`, everything
but export works and the export command says exactly what is missing.

## Workflow

Every change goes on a branch, then a pull request into `master`; the repository deletes the branch when the PR is
merged. Commits are plain (no tool signatures), one per repository per request. Changes that cross repositories
(converter, core, engine, extension) are one PR each, merged in the order converter → core → engine → extension.

## Settings

All under `tootegaAsciidoc.*`: interface language, default mode, structure panel, preview scroll sync and refresh
interval, remote images, paste directory and copy policy, diagnostics, export output folder / ask location / open
after export / attributes / HTML standalone / embed images / stylesheet / PDF page size / allow resources outside
the workspace, debug log. Descriptions appear in the Settings UI in your language.
