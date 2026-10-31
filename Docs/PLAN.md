# Tootega AsciiDoc for VS Code — execution plan

> Status: **approved by the owner on 2026-10-31** ("Aprovado. Faça todos" — all phases) and **executed the same day**.
> The ledger of what was delivered, verified and left open is [`STATUS.md`](STATUS.md); this file keeps the decisions.
> Maintainer: Tootega Pesquisa e Inovação. Patterns: **Tootega Cockpit** (`D:\Tootega\Source\Cockpit\Cockpit`).
> Editor engine: **TootegaWebUI** (`@Tootega/core`, `src/components/asciidoc`), checked out at the root of this
> repository in `TootegaWebUI/` (separate repository, `github.com/Tootega/TootegaWebUI`).

## 1. Goal

A native VS Code extension that edits AsciiDoc documents with a complete editor — **WYSIWYG**, **code** (with
highlighting) and **real-time preview** — at least at the level of the official Asciidoctor extension
(`asciidoctor.asciidoctor-vscode` 4.2), and beyond it where the WYSIWYG engine allows.

## 2. Decisions (owner, 2026-10-31)

| # | Decision | Consequence |
|---|----------|-------------|
| AD-1 | **Bilingual UI, like the Cockpit**: pt-BR + international English; follows `vscode.env.language`, manual override, runtime switch. Repository source and docs **in English**. | The TootegaWebUI AsciiDoc editor gains an optional, typed **`textos`** prop (every label, tooltip and message). Its default stays the current pt-BR text, so the ERP does not change and the engine still has **no translation keys** — the extension *injects* the English catalogue. Cross-repo change = two commits, two repositories. |
| AD-2 | The **Tootega editor is the default** for `.adoc`, `.asciidoc`, `.asc`, `.ad`. | `customEditors` with `priority: "default"`; "Reopen with… / Show source" returns to the native text editor. |
| AD-3 | The preview is the **engine's own view** (no second parser on screen). | Split mode inside the custom editor, plus a "Preview to the side" panel next to the native text editor, rendered by the same engine view. |
| AD-4 | **Images resolved, include linkable.** | The engine gains an optional **resource resolver** (relative to the document, honouring `:imagesdir:`); `https` images allowed by the CSP. `include::` stays a block with an "Open included file" action (no inline expansion). |
| AD-5 | ~~Export by the engine itself, from its AST.~~ **Superseded the same day by AD-7.** | The engine gains no HTML/DocBook renderer. |
| AD-6 | **Benchmark = official Asciidoctor extension**, "at its level or better". | §4 parity matrix is the acceptance list. |
| AD-7 | **Export through the house C library `AsciiDocConverter`** (`D:\Tootega\Source\AsciiDocConverter`, `github.com/HermesSilva/AsciiDocConverter`), which already converts AsciiDoc → HTML5 (byte-for-byte with Asciidoctor on its golden corpus), PDF (own writer, embedded Liberation fonts), Markdown (GFM) and ASG JSON. | HTML, PDF and Markdown export come from the library, not from the engine. Kroki deferred. |
| AD-8 | **Binding = WebAssembly.** The same C sources compiled to one `.wasm`, loaded by the extension host — runs on Windows and Linux (x64/arm64), and on macOS/vscode.dev at no extra cost. | No per-OS binary, no per-platform VSIX, no Electron ABI. Conversion runs in a `worker_thread`. |
| AD-9 | **The native `.dll`/`.so` ABI and output are frozen** (used by other projects — the Tootega Core `XAsciiDocConverter`). `src/` may change, but `ADC_Converter`, `ADC_Liberar`, `ADC_Versao`, the resolver callback and the messages JSON stay identical for native callers; every new capability is reachable **only** through an entry point in a new `wasm/` folder, which the native builds do not compile. | Proof on every change: golden 23/23 byte-for-byte, TCK 13/13, and the C# tests ADOC100..150 green. The native binary may change bytes, never behaviour. **Amended by AD-10** (message language). |
| AD-10 | **Library messages are bilingual through the `idioma` option** (`"idioma": "en" \| "pt-BR"` in `pOpcoesJSON`), in the native `.dll`/`.so` and in the `.wasm` alike. **Without the option (or without JSON), messages are in English.** The C# helper `XAsciiDocConverter` (Tootega Core) always merges `"idioma": "pt-BR"` into the JSON it sends, so the ERP and the ANVIL see no change. | Exception to AD-9, the only one: the ABI stays frozen, the default message language changes. Cross-repo: one commit in AsciiDocConverter + one in TootegaCore, shipped together (otherwise the ERP shows English and `TestesXAsciiDocConverter.cs:56`, which asserts pt-BR text, goes red). Both catalogues live in C; every new message is written in both languages. |

## 3. Architecture (Cockpit pattern)

```
┌──────────────────────────── Extension host (TS, Node) ────────────────────────────┐
│ extension.ts → AsciiDocEditorProvider (CustomTextEditorProvider)                   │
│               PreviewPanel (preview to the side)                                   │
│               language features: symbols, folding, links, hover, completion,       │
│               paste/drop image, diagnostics, export                                │
│  source of truth = vscode.TextDocument  (save, dirty, hot exit, Git, diff native)  │
└───────────────▲──────────────────────── postMessage (shared/protocol.ts) ──────────┘
                │
┌───────────────┴──────────────── Webview (React 19, iife) ─────────────────────────┐
│ main.tsx → App → XEditorAsciiDoc (@Tootega/core/components/asciidoc)              │
│ themeBridge: --vscode-* colours → HSL token triples the engine expects            │
│ i18n: en / pt-BR catalogues → `textos` prop                                       │
└────────────────────────────────────────────────────────────────────────────────────┘
```

- **Build:** `esbuild.mjs` with two contexts — host (`cjs`, `vscode` external) and webview (`iife`, `jsx:
  automatic`, CSS loader). React **19** (engine peer; the Cockpit is on 18).
- **Engine import:** only the subpath `@Tootega/core/components/asciidoc`, so the bundle does not pull SignalR or
  React Query. Dependency `"@Tootega/core": "file:./TootegaWebUI"`; `/TootegaWebUI/` in `.gitignore`.
- **Webview security:** CSP with nonce, `asWebviewUri`, `localResourceRoots` = extension `dist` + document folder +
  workspace folders; `img-src` adds `https:`.
- **Document sync:** webview edits arrive as full text → host computes the minimal changed range and applies one
  `WorkspaceEdit`; external changes (Git, other editor, VS Code undo) go back to the webview, which re-parses
  (the engine already ignores its own echo). An echo guard by document version avoids loops.
- **Theme:** `themeBridge` reads the computed `--vscode-*` colours, converts them to the `H S% L%` triples of the
  design system (`--brand-surface`, `--text-primary`, `--border-color`, …) and recomputes on theme change
  (observer on `body` class). The engine CSS stays untouched.
- **State:** mode, split ratio and structure panel per document via `vscode.getState/setState` (the engine's
  `localStorage` use becomes an injectable store).

## 4. Parity matrix (acceptance list)

Legend — **Off**: the official extension has it · **Us**: phase that delivers it.

| Feature | Off | Us |
|---------|-----|----|
| WYSIWYG editing | — | F1 |
| Code mode with highlighting, find/replace | (native editor) | F1 |
| Split mode: code + live view | preview panel | F1 |
| Preview to the side of the native editor; locked preview; refresh | ✔ | F3 |
| Scroll sync editor ↔ preview, selection mark, double-click to source | ✔ | F3 |
| TextMate grammar + language configuration (comments, brackets, folding) | ✔ | F3 |
| Snippets | ✔ | F3 |
| Outline (document symbols) and workspace symbols | ✔ | F3 |
| Folding ranges | ✔ | F3 |
| Document links (include, xref, image, link) | ✔ | F3 |
| Hover on attribute references | ✔ | F3 |
| Completion: attributes, xref anchors, include/image paths | ✔ | F3 (native) / F5 (code mode) |
| Paste / drop image, copy into workspace (`imagesdir`) | ✔ | F3 |
| Toggle bold / italic / monospace keybindings | ✔ | F1 (custom) + F3 (native) |
| Diagnostics from the parser | ✔ | F3 |
| `:imagesdir:` and relative images | ✔ | F2 |
| Export HTML (standalone, Asciidoctor stylesheet) | ✔ | F4 (AsciiDocConverter) |
| Export PDF — no external tool needed | ✔ (needs asciidoctor-pdf / wkhtmltopdf installed) | F4 (AsciiDocConverter) |
| Export Markdown (GFM) | — | F4 (AsciiDocConverter) |
| Export DocBook | ✔ | F4 — needs a DocBook 5 renderer in the library (L-4) |
| Export styles (custom CSS, docinfo) | ✔ | F4 (L-6) |
| Source highlighting in exported HTML/PDF | ✔ (via Asciidoctor) | gap of the library 0.1.0 — deferred |
| Cheat sheet | ✔ | F5 |
| Kroki diagrams | ✔ (opt-in) | deferred |
| Antora support | ✔ | deferred |
| Asciidoctor extensions / templates trust | ✔ | not applicable (no Asciidoctor.js) |
| Web extension (vscode.dev) | ✔ | deferred |
| Structure panel, document templates (`ModeloDeDocumento`) | — | F5 |

## 5. Phases

### F0 — Skeleton (this repository)
`package.json`, `package.nls.json` + `package.nls.pt-br.json`, `l10n/`, `esbuild.mjs`, `tsconfig.json` (host) and
`webview/tsconfig.json`, `.vscodeignore`, `.gitignore`, `.vscode/launch.json` + `tasks.json`, `run-dev.ps1/.cmd/.sh`,
`package-vsix.ps1/.cmd/.sh`, `vitest.config.ts` + `test/vscode-stub.ts`, `CLAUDE.md`, `README.md`, `LICENSE`
(MIT, as the Cockpit — **to confirm**), `CHANGELOG.md`, icon.

### F1 — Custom editor
`AsciiDocEditorProvider`, `shared/protocol.ts`, minimal-diff `WorkspaceEdit`, echo guard, webview `App`, `themeBridge`,
i18n layer (host `vscode.l10n` + webview catalogues), commands (open with Tootega, show source, switch mode),
keybindings scoped to the custom editor, webview restore.

### F2 — Engine changes (TootegaWebUI repository)
1. `textos` prop: typed catalogue `TextosDoEditorAsciiDoc`, pt-BR default (current text), threaded to bar, dialogs,
   status bar, structure panel, code editor search box.
2. `resolverRecurso?: (alvo, tipo) => string` for images/video/audio, honouring `:imagesdir:`.
3. `aoAcionarReferencia?: (alvo, tipo) => void` for include/xref/link actions.
4. Injectable `armazenamento` (replaces direct `localStorage`).
5. `aoMudarModo` / controlled mode, so the host can persist and drive it.
Pure tests in the engine repository; component tests in the ERP App suite (current rule of the engine).
ERP App type-check (`npx tsc -b` in `Front/App`) must stay green.

### F2-bis — AsciiDocConverter as WebAssembly (AsciiDocConverter repository)

Facts read on 2026-10-31 (library 0.1.0, commit `f7e2730`): C11, no runtime dependency, no global state, never
reads disk (include and images arrive through the `ADC_ResolverRecurso` callback), only platform touch is `time()`
for the PDF `CreationDate`. Native builds (`AsciiDocConverter.vcxproj`, `build-linux.sh`, `compilar-dev.sh`)
compile `src/**/*.c` **by wildcard** — hence wasm-only code lives in a new top-level `wasm/` folder (AD-9).
Toolchain: LLVM on this machine has the `wasm32` target but no WASI sysroot ⇒ build inside the official
`wasi-sdk` container through Docker (same pattern as the Linux build). `Dist/` today has only `win-x64.dll` and
`linux-x64.so` (`linux-arm64.so` is built by the script but not committed).

Changes (each one behind the `wasm/` entry point, native ABI and output untouched — AD-9 — except L-3-bis and L-8,
which follow AD-10):

| # | Change | Why |
|---|--------|-----|
| L-1 | `wasm/adc_wasm.c` + `build-wasm.sh` (+ step in `Build-AsciiDocConverter.ps1`) → `Dist/AsciiDocConverter.wasm`; exports `ADC_*` plus an allocator for the input buffer; resolver as an **imported** function; minimal WASI imports supplied by the extension (no `node:wasi`). | The binding itself (AD-8). |
| L-2 | Resolver v2 (wasm entry only): receives the **path of the file that holds the directive** and returns the **resolved path**, which the reader registers. | Today the callback gets the target as written; relative includes inside includes break (README admits it). |
| L-3 | Messages v2 (wasm entry only): each message gains `arquivo` (the file the line belongs to). | Diagnostics on the right file (included files). |
| L-3-bis | `idioma` option (AD-10), native and wasm: English catalogue for the 58 call sites of `adc_msgs_adicionar`, pt-BR kept verbatim; default English. | Bilingual UI (AD-1) without translating in the extension. |
| L-8 | TootegaCore: `XAsciiDocConverter` merges `"idioma": "pt-BR"` into every call (also when it passes `null` today). | Keeps the ERP/ANVIL pt-BR and the ADOC tests green (AD-10). |
| L-4 | DocBook 5 renderer `src/render/adc_render_docbook5.c` (`ADC_DOCBOOK5` returns `ADC_ERRO_FORMATO` today), reachable only through the `wasm/` entry (AD-9: native keeps returning `ADC_ERRO_FORMATO`). Checked against Asciidoctor.js `docbook5` backend, golden-style. **Decided (owner, 2026-10-31): implement.** | Parity with the official extension. |
| L-5 | `:data-uri:` — embed images in the standalone HTML through the resolver. | Exported HTML saved elsewhere keeps its images. |
| L-6 | Resolver type 3 = stylesheet/docinfo. | Custom export CSS and `docinfo` (today they become warnings because they would need disk). |
| L-7 | Option to fix the PDF creation date. | Reproducible output. |

Native proof after each change: golden 23/23 byte-for-byte (`bash test/comparar-golden.sh`), TCK 13/13, and the C#
tests ADOC100..150 in `TootegaCore/Back/Core/Tootega.Core.Test.Unit` — run only with the owner's go-ahead.
Decisions of the library are recorded in its own `PLANEJAMENTO.md` (next free DAD-#) when execution starts.

### F3 — Language features and preview to the side
Grammar, language configuration, snippets, symbol/folding/link/hover/completion providers, paste/drop image,
diagnostics, `PreviewPanel` with scroll sync. Providers reuse the engine parser (no second parser).

### F4 — Export
Host commands "Export HTML / PDF / Markdown / DocBook" (editor title and webview context menus) calling the
AsciiDocConverter `.wasm` in a `worker_thread`; resolver backed by the workspace file system (honours `imagesdir`,
denies paths outside the workspace unless trusted); messages → `DiagnosticCollection`.

### F5 — Beyond parity
Completion inside the code mode (host-backed), cheat sheet, structure panel and document templates surfaced as
commands, spell check (Cockpit's Hunspell).

## 6. Validation

Assistant validation = `npm run typecheck` + `node esbuild.mjs` here, and `npm run typecheck` in TootegaWebUI.
Unit tests (Vitest) are written with each phase and run only on request. The extension is launched by the owner
(`run-dev.ps1`), never by the assistant.

## 7. Open items

| # | Item | Phase |
|---|------|-------|
| O-1 | License (MIT like the Cockpit?) and publisher id (`HermesSilva`?) | F0 |
| ~~O-2~~ | ~~PDF engine~~ — resolved by AD-7: the library writes PDF itself | — |
| O-3 | Coexistence with the official extension installed (both register language `asciidoc`) | F3 |
| ~~O-4~~ | ~~DocBook 5~~ — resolved (owner, 2026-10-31): implement L-4 in the library | — |
| ~~O-5~~ | ~~Message translation~~ — resolved (owner, 2026-10-31): `idioma` option in the library, English by default, C# helper asks pt-BR (AD-10, L-3-bis, L-8) | — |
| ~~O-6~~ | ~~Plan approval~~ — **approved (owner, 2026-10-31), all phases** | — |
