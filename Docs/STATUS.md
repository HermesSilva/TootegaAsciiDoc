# Execution status — 2026-10-31

What was built on the day the plan was approved ("Aprovado. Faça todos"), what was verified, and what is still open.
Companion of [`PLAN.md`](PLAN.md): the plan says *what and why*; this file says *how far*.

## Done

| Phase | Delivered | Verified by |
|-------|-----------|-------------|
| F0 | Skeleton: manifest (bilingual `package.nls*`), esbuild (host cjs + webview iife + Tailwind v4 CLI), tsconfigs, `.vscodeignore`, scripts (`run-dev`, `package-vsix`), launch/tasks, LICENSE (MIT), CHANGELOG, README, icons, samples (`Docs/samples`). | `npm run typecheck`, `node esbuild.mjs` |
| F1 | `AsciiDocEditorProvider` (custom editor, default for `.adoc`), minimal-diff `WorkspaceEdit` with echo guard, webview `App` over `XEditorAsciiDoc`, theme bridge `--vscode-*` → engine HSL tokens, i18n (host `vscode.l10n`, webview catalogues, English `textos` injected into the engine), commands (open with Tootega, show source, modes, structure, language), keybindings scoped to the custom editor, per-document state. | typecheck, build, `test/textDiff.test.ts` |
| F2 | Engine (TootegaWebUI, uncommitted): `textos` catalogue + context (`textos.ts`, all strings of bar, dialogs, code editor, WYSIWYG, status bar), controlled `modo`/`aoMudarModo`, `aoMudarEstrutura`, `resolverRecurso`, `aoAcionarReferencia`, `armazenamento`, `ref` handle (`XEditorAsciiDocHandle`), `linha` on blocks (parser → `data-linha`), new `inclusao` block (include:: as an island with "open file"), image placeholder on load failure, Ctrl+click on links/xrefs, `XVistaWYSIWYG` exported. | `npm run typecheck` (engine), `npx tsc -b` in ERP `Front/App` (green) |
| F2-bis | Library (AsciiDocConverter, uncommitted): L-1 wasm entry + `build-wasm.sh` (+ `-Alvo Wasm`); L-2 resolver v2 with origin (nested includes); L-3 `arquivo` in messages (wasm only); L-3-bis `idioma` option, English default, EN table for every message and sub-phrase; L-4 DocBook 5 renderer (wasm only); L-5 `dataUri`; L-6 `folhaDeEstilo` (resolver type 3); L-7 `pdf.dataDeCriacao`; L-8 `XAsciiDocConverter` merges `idioma: pt-BR` (TootegaCore, uncommitted). `Dist/` rebuilt: win-x64.dll, linux-x64.so, AsciiDocConverter.wasm. Version 0.2.0. | MSVC `/W4 /WX` (Compilar-Dev), golden **23/23**, wasm built with wasi-sdk 25 (clang 19) with `-Werror`, `test/wasmConverter.test.ts` (8 tests) |
| F3 | TextMate grammar, language configuration, snippets, document/workspace symbols, folding, document links, attribute hover, completion (attributes, anchors incl. cross-file, paths, admonitions), paste/drop image (saved into `:imagesdir:`), parser diagnostics (engine parser on the host), side preview with scroll sync both ways / lock / refresh / double-click to source, Ctrl+B/I/M in the text editor. | typecheck, build, `test/structure.test.ts` |
| F4 | Export HTML / PDF / Markdown / DocBook through the `.wasm` in a `worker_thread` (`WasmConverter`), resolver over the file system honouring `imagesdir` and denying paths outside the workspace unless allowed, messages → Problems panel, save dialog / output folder, open after export. | `test/wasmConverter.test.ts` |
| F5 | Cheat sheet (bilingual webview). | — |
| Owner feedback (same day) | **Virtual cursor in Split mode** (engine): while the code pane has focus, the WYSIWYG pane marks the block the code cursor is in (left bar) and draws a ghost caret at the approximate position inside the leaf (paragraph, heading, list item, term, callout), scrolling it into view; the real selection stays in the code. Position inside a leaf is approximate (markup stripped from the source slice), by design. | engine typecheck, build |
| Owner feedback (same day) | **Split = Code + editable WYSIWYG** over the same document (engine); **compact toolbar** (28 px buttons); **Edit full elements sample** command (`tootegaAsciidoc.openShowcase`): `media/showcase/{pt-BR,en}` — every element and variation, with includes (nested, tagged, line ranges), a Java snippet and images — copied to the global storage and opened in the Tootega editor; `test/showcase.test.ts` proves both documents parse in the engine without warnings, round-trip through the serializer and export to the four formats without errors. | typecheck, build, tests |
| Owner feedback (same day) | **New AsciiDoc document** command (`tootegaAsciidoc.newDocument`): save dialog → skeleton (title, author line, date, `:toc:`, `:experimental:`, a first section, text in the interface language) → opens in the Tootega editor. In the palette, in **File › New File…** (`file/newFile`) and in the Explorer folder context menu. The plan had missed it: VS Code cannot show an untitled document in a custom editor, so the file must exist first. | typecheck, build |

## Engine defect found by the showcase and fixed (2026-10-31)

Editing a document in Visual mode re-serializes the whole document, and the parser used to **drop block attribute
lines the model does not represent**: list styles and options (`[square]`, `[loweralpha]`, `[start=4]`,
`[%reversed]`, `[horizontal]`, `[qanda]`), container options (`[%collapsible]`, `[%collapsible%open]`, `[abstract]`
on an open block), section styles (`[appendix]`, `[bibliography]`, `[glossary]`, `[colophon]`) and table options other
than header/footer (`%autowidth`). They now stay in `atributosBrutos` and come back out unchanged;
`test/showcase.test.ts` guards the list. Normalisations that remain (same meaning, other notation): `-` → `*`,
`[*]` → `[x]`, `xref:a[b]` → `<<a,b>>`, `anchor:id[t]` → `[[id,t]]`, `options="header,footer"` → `%header%footer`,
CSV/DSV tables → `|` tables with the same cells, a description on its own line joins the term's line. **Still lost on a visual
edit** (model gap, `it.todo` in the same test): the `^` target and `role=` of a link, and the `q` of `pass:q[]`.
| Owner feedback (same day) | **Toolbar without seams** (engine): in Code mode every toolbar command is a text edit (`codigo/edicaoDeTexto.ts`: marks, headings, lists, indent, blocks, inserts) and the dialogs (link, image, table, reference, footnote, attribute, key, anchor) emit AsciiDoc syntax (`textoDoPedido`) into the code; the bar state (marks, block kind, list, table) is read from the text around the caret. **Reverse cursor sync**: clicking or moving the caret in the WYSIWYG pane in Split mode positions the code caret synchronously (leaf → line/column through the serialized block). | engine typecheck, ERP tsc, extension typecheck, build, `test/edicaoDeTexto.test.ts` |
| Formulas — M0 (same day, plan `PLAN-formulas.md`, approved) | **Formula model** in the engine: inline atom `formula` for `stem:[]`, `latexmath:[]`, `asciimath:[]` (source kept verbatim) and block `formula` for `[stem]`/`[latexmath]`/`[asciimath]` over `++++`, `----`, `....` or a paragraph; serializer writes `[notação]` + `++++`; `notacaoEfetiva()` follows Asciidoctor's `:stem:` rule. WYSIWYG: inline island with tooltip, block island with notation selector and source editor (title shows the effective notation); toolbar "Fórmula (STEM)" in *More* and a dialog (notation, source, inline/block) in both Visual and Code modes; Code-mode highlighter, cheat sheet section, snippets, English catalogue. No typesetting yet — that is M1/M2. | engine typecheck, ERP tsc, extension typecheck, build, `test/formula.test.ts` (6) + `test/showcase.test.ts` (stem lines in MUST_SURVIVE) |
| Formulas — M1..M5 (same day) | **Own formula engine, zero dependencies**, in `TootegaWebUI/src/lib/formula/` (TypeScript, pure): TeX lexer, macro expander (`\def`/`\newcommand`/`\let`/`\edef`…, delimited parameters, `\@ifstar`, `\expandafter`, `\char`, built-in macro table), recursive-descent parser (groups, scripts, primes, `\limits`, infix `\over`/`\choose`/`\above`, `\left…\middle…\right`, functions with typed arguments, environments), symbol table (≈1 000 math + ≈650 text names, Unicode input), function registry (fonts, text, style, size, colour, fractions, roots, sized delimiters, accents, operators, spacing, phantoms, enclosures, lines, braces, extensible arrows, classes, `\not`, `\mathchoice`, `\verb`, tags), environments (matrix family, array, cases, aligned/align/alignat, gathered/gather, equation, split, subarray, smallmatrix, CD); **MathML Core builder** (Unicode math alphanumerics instead of `mathvariant`, CSS enclosures instead of `menclose`, label column instead of `mlabeledtr`, `transform` for laps, stretchy fences only for `\left/\right`, limits by display/inline rule) + `formula.css`; **AsciiMath parser** (asciimath.org grammar) to the same tree; `XFormula` React component (inline atom, block island with live preview, dialog preview); **export pre-pass** `src/export/formulaPrePass.ts` (HTML/DocBook get MathML via passthrough; PDF/Markdown keep notation); **Latin Modern Math** shipped in `media/fonts/` (GUST Font License) with `@font-face`; oracle `scripts/formula-oracle.mjs` + corpus + allow-list; `Docs/fidelidade-formulas.md`. | engine typecheck, ERP tsc, extension typecheck, build; `test/formulaEngine.test.ts` (13) + `test/formula.test.ts` (6) + showcase; **oracle vs KaTeX 0.19.1 (`node scripts/formula-oracle.mjs`, 328 formulas): 289 structurally identical, 39 deliberate divergences listed in `scripts/formula-oracle-allow.json` and explained in `Docs/fidelidade-formulas.md`, 0 unexplained** |
| Owner feedback (same day) | **Virtual cursor in both directions** (engine). Root cause of "not working": the blocks' source lines (`linha`) came only from the parser, so after any visual edit the serialized text no longer matched them and both mappings failed. Fix: `editor/linhas.ts` re-stamps the lines from a re-parse of the emitted text on every emission (same objects, ids kept). The side that was last used (`ladoAtivo`, set on code focus or on a view selection; not cleared by blur) decides the direction: code active → ghost caret and block mark in the view (as before); view active → ghost caret and line mark in the code editor (`XEditorDeCodigo.cursorVirtual`), scrolled into view, with the real code selection parked there so the next click or Tab lands right. The toolbar follows the same `ladoAtivo`. | engine typecheck, ERP tsc, extension typecheck, build, `test/linhas.test.ts` |
| Owner feedback (same day) | **Export failed with "#<Object> could not be cloned"**: VS Code configuration values (`cfg.get`) are proxies that `worker.postMessage` cannot structured-clone; the request is now rebuilt through JSON before crossing to the worker (`src/export/converter.ts`). **Formula pre-pass swallowed the document after a fenced block with a language** (```` ```python ```` did not count as an opening fence, so the closing fence opened a verbatim region that never ended): the fence regex now accepts the language suffix; the showcase exports 5 formulas per language with 0 warnings. | extension typecheck, build, `npm test` (63 passed) |

## Not done (honest list)

- **Formulas**: the browser lays out the MathML (no TeX box metrics); PDF export keeps the formula source (a math layout in the C converter is a separate plan); `\href`/`\url`/`\includegraphics`/`\html*` render as text with a warning; visual check of the showcase in the Extension Development Host is the owner's (the assistant never launches it).

- **TCK 13/13** was not re-run: the Eclipse `asciidoc-tck` harness is not checked out on this machine. Golden 23/23 ran.
- ~~C# tests ADOC100..150~~ — **ran: 7/7 green** (`dotnet test --filter FullyQualifiedName~TestesXAsciiDocConverter`),
  with the rebuilt win-x64 `.dll` copied into `TootegaCore/Back/Core/Tootega.Core/lib/` (plus the linux-x64 `.so`) and a
  new ADOC160 covering AD-10 (English by default in the native, pt-BR asked by the helper, `idioma: en` honoured).
- **DocBook has no oracle yet** (`asciidoctor -b docbook5` over the corpus) — structure follows the Asciidoctor converter; the extension test covers includes, image, table, section ids.
- **Linux arm64 `.so`** was not rebuilt (needs the cross-compiler; Docker daemon was off). win-x64 and linux-x64 were.
- **F5 leftovers**: completion inside the webview's Code mode, document templates as commands, spell check (the `spellCheck` setting was removed rather than shipped unimplemented).
- **Deferred by plan**: Kroki, Antora, web extension (vscode.dev), source highlighting in exported HTML/PDF.
- **O-3** (coexistence with the official extension — both contribute language `asciidoc`): not exercised; VS Code merges grammars by precedence, and both custom editors show in "Reopen with…". To be checked by the owner in a real install.

## Deviations from the plan (recorded)

- **Engine reached by alias, not by `file:`** (`@core` → `TootegaWebUI/src` in esbuild + tsconfig; `react`, `react-dom`, `lucide-react` pinned to this package's copies). Reason: `TootegaWebUI/node_modules` exists and esbuild would bundle a second React, which breaks hooks.
- **Stylesheet built by the Tailwind v4 CLI** (not esbuild): the engine's UI pieces use Tailwind utilities; the CLI processes the engine's `index.css` (`@import "tailwindcss"` + `@config`) with `@source` pointing at the engine components.
- **wasm toolchain**: wasi-sdk 25 downloaded into WSL (`~/wasi-sdk`), not a Docker image (daemon was down). `build-wasm.sh` looks in `WASI_SDK_PATH`, `~/wasi-sdk`, `/opt/wasi-sdk`.
- **Message translation inside the library is by exact pt-BR text** (table in `adc_mensagens_en.c`), not by message ids — zero changes at the 58 call sites; a new message must be added to the table in the same commit.

## Repositories touched — published on 2026-10-31 ("pode publicar")

| Repository | What happened |
|------------|---------------|
| `HermesSilva/TootegaAsciiDoc` | first commit `a388215` pushed to `master`; `tootega-asciidoc-0.1.0.vsix` built (3.34 MB, 34 files) — not in the Marketplace yet: `vsce publish` needs the publisher's personal access token, which is not on this machine |
| `Tootega/TootegaCore` | commit `9d89ec2` pushed to `master` |
| `HermesSilva/AsciiDocConverter` | `master` only accepts pull requests: branch `versao-0.2.0` pushed, PR #1 open |
| `HermesSilva/TootegaWebUI` (moved from `Tootega/`) | `master` requires a PR and the "Typecheck + testes puros" check: branch `editor-asciidoc-formulas` pushed (rebased on upstream, two upstream pure tests adjusted for the `inclusao` block), PR #1 open; 145 tests pass locally |

## Repositories touched (state before publication)

| Repository | Branch | Change |
|------------|--------|--------|
| `HermesSilva/TootegaAsciiDoc` (this) | `master`, no commits yet | everything |
| `Tootega/TootegaWebUI` (`TootegaWebUI/`) | as checked out | `src/components/asciidoc/*` (F2) |
| `HermesSilva/AsciiDocConverter` (`..\AsciiDocConverter`) | as checked out | `src/*`, `wasm/*`, `Dist/*`, docs (F2-bis) |
| `Tootega/TootegaCore` (`..\TootegaERP\TootegaCore`) | as checked out | `Back/Core/Tootega.Core/XAsciiDocConverter.cs` (L-8), `lib/AsciiDocConverter.{win-x64.dll,linux-x64.so}` (0.2.0), `Tootega.Core.Test.Unit/TestesXAsciiDocConverter.cs` (ADOC160) |

Suggested commit order (each repository its own commit; the owner decides): AsciiDocConverter → TootegaCore (the helper
must ship with the 0.2.0 binaries, or the ERP shows English messages) → TootegaWebUI → TootegaAsciiDoc.
