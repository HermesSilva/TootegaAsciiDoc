# CLAUDE.md — Tootega AsciiDoc for VS Code

> Directives read by Claude Code in this repository. The **execution plan, decisions (AD-#) and the change list
> for the C library (L-#) live in [`Docs/PLAN.md`](Docs/PLAN.md)** — read it before any work. The formula engine
> (`stem`/`latexmath`/`asciimath`, own TeX + AsciiMath → MathML Core, zero dependencies) has its own approved plan in
> [`Docs/PLAN-formulas.md`](Docs/PLAN-formulas.md) (DF-1..DF-7, phases M0..M5).

## 1. What this is

A native **VS Code extension** that edits AsciiDoc documents with a complete editor — **WYSIWYG**, **code** with
highlighting, and **real-time preview** — benchmarked against the official Asciidoctor extension
(`asciidoctor.asciidoctor-vscode` 4.2), "at its level or better".

| Piece | Where | Role |
|-------|-------|------|
| This extension | `D:\Tootega\Source\TootegaAsciiDoc` (`github.com/HermesSilva/TootegaAsciiDoc`, no commit yet) | host + webview |
| Editor engine | `TootegaWebUI/` at the root (separate repo `github.com/Tootega/TootegaWebUI`, ignored here) | `@Tootega/core/components/asciidoc` — `XEditorAsciiDoc` (Visual / Código / Dividido) |
| Export | `D:\Tootega\Source\AsciiDocConverter` (separate repo `github.com/HermesSilva/AsciiDocConverter`) | C11 library → HTML5 / PDF / Markdown / ASG, used here **as WebAssembly** |
| Pattern reference | `D:\Tootega\Source\Cockpit\Cockpit` | structure, build, webview, i18n, scripts |

Maintainer: **Tootega Pesquisa e Inovação**.

## 2. Binding decisions (summary — full text in `Docs/PLAN.md` §2)

- **AD-1** Bilingual UI (pt-BR + international English), like the Cockpit; **repository source and docs in English**.
  The engine receives an injected, typed `textos` catalogue (pt-BR default) — never translation keys.
- **AD-2** The Tootega editor is the **default** for `.adoc`, `.asciidoc`, `.asc`, `.ad`.
- **AD-3** The preview is the **engine's own view** — no second parser on screen.
- **AD-4** Images resolved by a resolver in the engine (`:imagesdir:`); `include::` stays a block with "open file".
- **AD-7** Export through **AsciiDocConverter** (AD-5, "engine renders HTML", is superseded).
- **AD-8** Binding = **WebAssembly** (one `.wasm`, Windows and Linux), run in a `worker_thread`.
- **AD-9** **The native `.dll`/`.so` ABI and output are frozen** — other projects (Tootega Core `XAsciiDocConverter`)
  use them. `src/` may change, but every new capability is reachable only through a new `wasm/` folder, which the
  native builds (wildcard `src/**/*.c`) never compile. Proof: golden 23/23, TCK 13/13, C# ADOC100..150.
- **AD-10** (the only exception to AD-9) Library messages are bilingual through the `idioma` option, native and wasm;
  **without it, English**. The C# helper `XAsciiDocConverter` always sends `"idioma": "pt-BR"`, so ERP/ANVIL do not
  change — one commit in AsciiDocConverter + one in TootegaCore, shipped together.
- DocBook 5 is implemented in the library (L-4), reachable only through `wasm/`.

## 3. Stack (Cockpit pattern)

TypeScript host (VS Code API, `CustomTextEditorProvider`) + React **19** webview (engine peer; the Cockpit is on 18),
`esbuild.mjs` with two contexts (host `cjs`, webview `iife`), `shared/protocol.ts` for typed messages, CSP with
nonce, theme bridge `--vscode-*` → the engine's HSL tokens, `l10n/` + `package.nls*.json`, Vitest for the host,
`vsce` packaging.

## 4. How the assistant operates

- **Plan before code.** `Docs/PLAN.md` is a **draft awaiting the owner's approval (O-6)** — no code before it.
  Questions to the owner go through `AskUserQuestion`, one pending item at a time, recommendation first.
- **Answer the owner in Portuguese** (pt-BR, correct orthography), even though the repository is in English.
- **Validate with facts** before asserting or acting; "I don't know" and investigate instead of guessing.
- **Everything is UTF-8** (no BOM). Scripts keep ASCII and use explicit UTF-8 I/O.
- **Validation = typecheck + build** (`npm run typecheck`, `node esbuild.mjs`; `npm run typecheck` in TootegaWebUI;
  `npx tsc -b` in the ERP `Front/App` when the engine's public API changes). Tests only when the owner asks or the
  task is a test task; then only the related ones.
- **Never launch the extension** (`run-dev.ps1`, Extension Development Host) — the owner does it.
- **Packaging only through `package-vsix.ps1`/`.sh`/`.cmd`** (owner, 2026-10-31): the patch number is the build number
  and every package bumps it; a bare `vsce package` is forbidden because it ships a repeated build number.
- **Never commit or push** without the owner's explicit request. One request, one commit; no AI signature in commit
  messages. A change that crosses repositories = one commit per repository.
- **Workflow (owner, 2026-10-31): every change goes on its own branch, then a pull request into `master`, and the PR
  deletes the branch on merge** (repository setting `delete_branch_on_merge`, plus `--delete-branch` when merging
  with `gh`). No direct pushes to `master`. Branch names in kebab-case describing the change.
- **Shells:** PowerShell 7 is the default (`D:\Tootega\Source\TootegaAsciiDoc`, temp `$env:TEMP`, no heredoc);
  Git Bash only for POSIX (`/d/Tootega/Source/TootegaAsciiDoc`); WSL for real Linux
  (`/mnt/d/Tootega/Source/TootegaAsciiDoc`). Never mix one shell's syntax with another's paths.
- **Engine repository rules** (`TootegaWebUI/CLAUDE.md`): the engine knows no SaaS, modal containment, WCAG 2.2 AA,
  silent error is a defect, one type per file, uppercase acronyms. Its component tests live in the ERP App suite.

## 5. Where the session stopped (2026-10-31)

The plan was approved ("Aprovado. Faça todos") and executed in the same day. **`Docs/STATUS.md` is the ledger**:
what each phase delivered, how it was verified, what is still open, the deviations and the four repositories
touched — **nothing committed anywhere**. Key facts for the next session:

1. Build and validation that are green: `npm run typecheck`, `node esbuild.mjs`, `npm test` (24 tests, 8 of them
   over the real `.wasm`); engine `npm run typecheck`; ERP `Front/App` `npx tsc -b`; library MSVC `/W4 /WX` and
   golden 23/23; `.wasm` built with wasi-sdk 25 in WSL (`~/wasi-sdk`).
2. The engine is reached by the `@core` alias (not `file:`) and the stylesheet comes from the Tailwind v4 CLI —
   see STATUS.md "Deviations".
3. The library's native ABI is frozen (AD-9); the only behaviour change is the message language default (AD-10,
   `XAsciiDocConverter.ComIdioma` in TootegaCore compensates). Everything new is behind `wasm/adc_wasm.c`.
4. Open: TCK not re-run (harness absent), C# ADOC tests (see STATUS.md), DocBook oracle, linux-arm64 `.so`,
   F5 leftovers (code-mode completion, templates, spell check), O-3. **Formulas M0–M5 are done** (own TeX +
   AsciiMath → MathML Core engine in `TootegaWebUI/src/lib/formula/`, oracle `scripts/formula-oracle.mjs`, record in
   `Docs/fidelidade-formulas.md`); the owner's standing rule: **no new dependency** — KaTeX is study material and
   test oracle only (fetched into a temp folder by the script, never into `package.json`).
5. The owner launches the extension (`run-dev.ps1`); the assistant never does.
