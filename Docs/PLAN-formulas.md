# Plan — the Tootega formula engine (`stem`, `latexmath`, `asciimath`)

> Status: **approved by the owner on 2026-10-31** ("Aprovar e começar por M0 → M1"), including DF-4 (font asset in
> the extension). **M0–M5 delivered the same day**; what each phase shipped and how it was verified is in
> `Docs/STATUS.md`, the fidelity record in [`fidelidade-formulas.md`](fidelidade-formulas.md).
> Correction to DF-4: Latin Modern Math is under the **GUST Font License** (LPPL-based), not SIL OFL — the licence
> text ships with the font in `media/fonts/`.
> Decision of the owner (2026-10-31): *"Vamos fazer nosso motor: leia o KaTeX, veja o que pode ser usado/aprendido e
> faça tudo que ele tem. Não vamos acrescentar dependência ao projeto."* Same posture as DAD-1 of the AsciiDocConverter:
> the reference implementation is an **object of study and a test oracle**, never a dependency.

## 1. Facts (read on 2026-10-31)

**KaTeX** (`github.com/KaTeX/KaTeX`, MIT, Khan Academy and contributors):
- Pipeline `Lexer → MacroExpander → Parser (recursive descent, one-token lookahead, function/environment registries,
  argument types math/text/size/color/url/raw/hbox/primitive) → parse tree → buildHTML | buildMathML`.
- `symbols.ts`: `defineSymbol(mode, font, group, replace, name, acceptUnicodeChar)`; ≈500 explicit entries +
  ≈1,300 generated (styled letters, digits) ⇒ ≈1,000 unique math names, ≈650 text names. Atom groups: `rel`, `bin`,
  `open`, `close`, `punct`, `inner`, `op`, `mathord`, `textord`, `accent`, `spacing`.
- `functions/`: 46 modules (accent, accentunder, arrow, char, color, cr, def, delimsizing, enclose, environment,
  font, genfrac, hbox, horizBrace, href, html, includegraphics, kern, lap, math, mathchoice, mclass, op,
  operatorname, ordgroup, overline, phantom, pmb, raisebox, reflectbox, relax, rule, sizing, smash, sqrt, styling,
  supsub, symbolsOp, symbolsOrd, symbolsSpacing, tag, text, underline, vcenter, verb). `environments/`: array (matrix
  family, array, cases, align family, gather, equation, split, subarray) and cd.
- `buildMathML.ts` emits `math > semantics > mrow | mtable + annotation[encoding=application/x-tex]`, maps fonts to
  `mathvariant`, merges adjacent `mtext`/`mn`, absorbs numbers into script bases, overlays `\not` with U+0338, and
  **does not** convert letters to Unicode math alphanumerics (relies on `mathvariant`, which MathML Core ignores).
- Supported surface (docs/supported.md): accents, delimiters and sizing, environments, HTML extensions (trust),
  letters/Unicode, layout/annotation (cancel, boxed, phantom, lap, smash, raisebox, tag), spacing and units, logic,
  macros (`\def`…`\newcommand`, `#1..#9`, `\@ifstar`…), operators (big ops, fractions, named functions, roots),
  relations and arrows (incl. extensible), style/color/size/font, symbols. Not supported by KaTeX itself: `\cline`,
  `\multicolumn`, `\par`.
- Fonts: KaTeX ships its own fonts; the repository's LICENSE and README state only the MIT licence for the code. We
  do **not** use them (no dependency, and font provenance is not settled by what we read).

**MathML Core** (W3C CR, 2025-06-24; Chromium ≥ 109 ships it, so the VS Code webview and current browsers render it
natively): elements `math mrow mi mn mo mtext ms mspace mfrac msqrt mroot msub msup msubsup munder mover munderover
mmultiscripts mprescripts mtable mtr mtd mstyle mpadded mphantom merror maction semantics annotation(-xml)`.
`mo` keeps `stretchy symmetric largeop movablelimits lspace rspace minsize maxsize form`; `mfrac linethickness`;
`mspace width/height/depth`; global `displaystyle scriptlevel mathsize mathcolor mathbackground`. **Not in Core**:
`menclose`, `mfenced`, `mlabeledtr`; `mathvariant` only accepts `normal`.

**AsciiMath** (asciimath.org): tokens (letters, Greek names, numbers, constants, unary `sqrt text hat vec bb…`,
binary `frac root stackrel`, brackets incl. `(: :)` and invisible `{: :}`), grammar `v | lEr | uS | bSS` → `S`,
`S_S | S^S | S_S^S` → `I`, `IE | I/I` → `E`; matrices as nested brackets, `|` for augmented columns, `"text"`.

**Our side**: the editor engine (TootegaWebUI) does not recognise `stem:[]`, `latexmath:[]`, `asciimath:[]` nor the
`[stem]`/`[latexmath]`/`[asciimath]` blocks — they come out as raw text. The AsciiDocConverter (C) outputs them as
text (`\$…\$`) and warns that MathJax is not injected.

## 2. Decisions proposed (the owner confirms or changes)

| # | Decision | Why |
|---|----------|-----|
| DF-1 | **Own engine, zero dependency** (owner). TypeScript, pure (no React, no DOM), in the editor engine repository: `TootegaWebUI/src/lib/formula/` — generic, reusable by the AsciiDoc components, the VS Code extension host (tests, export pre-pass) and any SaaS. | Owner's decision; same posture as the C converter. Generic code lives in the Core (engine rule). |
| DF-2 | **Output = MathML Core**, laid out natively by the browser. No TeX box layout, no font metrics of our own. | It is the one output that needs no fonts, no CSS framework and no metrics table; Chromium (VS Code) and current Firefox/Safari render it; DocBook and HTML exports can carry it. KaTeX's HTML path exists only because browsers lacked MathML for a decade. |
| DF-3 | **Core gaps are covered by us**, not skipped: letters → Unicode Mathematical Alphanumeric Symbols (bold, italic, script, fraktur, double-struck, sans, monospace), `menclose` → `mpadded` + CSS (box, cancel strokes as background gradients, sout), `\tag` → 3-column `mtable`, colour/size → `mathcolor`/`mathsize`, `\phantom`/`\smash`/`\raisebox`/lap → `mphantom`/`mpadded`, extensible arrows → `munderover` + stretchy `mo`, `\href` → `a` is **not** emitted (stays text; the editor has its own links). | "Faça tudo que ele tem" on the surface the user writes; what the browser cannot draw we draw with the primitives it has. |
| DF-4 | **Font**: `font-family: "Latin Modern Math", "STIX Two Math", "Cambria Math", math` on `<math>`; the **extension** ships Latin Modern Math (GUST Font License, v1.959) as an asset so Linux without a math font renders the same. The engine ships no font. | A font file is an asset, like Liberation in the converter — not a code dependency. Windows has Cambria Math; Linux often has nothing. |
| DF-5 | **Oracle = KaTeX's own MathML output** and its test corpus (`test/katex-spec.js`, `test/screenshotter/ss_data.yaml`), run by a script that fetches KaTeX into a temporary folder — never into `package.json`. Comparison is structural (normalised MathML tree) plus an allow-list of known, deliberate divergences (`docs/fidelidade-formulas.md`). | Same method as the golden/oráculo of the C converter. |
| DF-6 | **AsciiMath has its own parser** to the same AST (KaTeX does not do AsciiMath). Default notation follows Asciidoctor: `:stem:` alone = asciimath, `:stem: latexmath` = TeX; `latexmath:[]`/`asciimath:[]` force. | Asciidoctor semantics; users expect it. |
| DF-7 | **Export**: HTML and DocBook receive the MathML generated by the TS engine through a pre-pass in the extension (stem → `pass:[<math>…</math>]` before calling the converter); PDF and Markdown keep the source notation (PDF: typeset later, when the C side gets a math layout — out of this plan). | Keeps the C library untouched (AD-9) and gives correct HTML/DocBook now. |

## 3. Architecture

```
src/lib/formula/
├── ast.ts            the math tree (ord, op, bin, rel, open, close, punct, inner, accent, frac, sqrt, supsub,
│                      leftright, text, styling, sizing, color, phantom, enclose, array, tag, spacing, kern…)
├── tex/
│   ├── lexer.ts      control sequences, groups, ^ _ ' & \\, comments, Unicode input, verbatim for \verb/\text
│   ├── macros.ts     \def \gdef \edef \xdef \let \futurelet \newcommand \renewcommand \providecommand, #1..#9,
│   │                  \@ifstar \@ifnextchar \expandafter \noexpand \mathchoice, the built-in macro table
│   ├── symbols.ts    the symbol table (name → char, atom group, Unicode acceptance) — written by us from the Unicode
│   │                  tables, checked against KaTeX's list as oracle
│   ├── functions/    one module per family, same cut as KaTeX for traceability (accent, arrow, color, delimsizing,
│   │                  enclose, font, genfrac, kern, lap, op, operatorname, phantom, raisebox, sizing, smash, sqrt,
│   │                  styling, supsub, text, tag, cr, def, mclass, rule, verb, environment…)
│   ├── environments/ array/matrix family, cases, align family, gather, equation, split, subarray, CD
│   └── parser.ts     recursive descent over the macro expander; implicit groups; \left…\right; infix \over/\choose
├── asciimath/
│   ├── tokens.ts     symbol tables of asciimath.org
│   └── parser.ts     v | lEr | uS | bSS → S → I → E, matrices, text
├── mathml/
│   ├── builder.ts    AST → MathML Core tree (mi/mn/mo classes and spacing, variants → Unicode alphanumerics,
│   │                  stretchy delimiters, tables with column specs and borders, tags, enclose via mpadded+CSS)
│   └── serializar.ts tree → string (XML, namespaced) and tree → DOM
├── css/formula.css   the few rules MathML Core needs from us (enclose strokes, box, colours, font-family)
└── index.ts          `renderizarFormula(fonte, { notacao: 'latexmath' | 'asciimath', bloco: boolean })`
                      → { mathml: string; avisos: Aviso[] }  — never throws; unknown command → merror with the name
```

Errors are never silent: an unknown control sequence renders as `merror` carrying the command name, and the warning
list says what and where (line/column of the formula source).

## 4. Phases

| Phase | Content | Proof |
|-------|---------|-------|
| **M0** (small, can start on approval of this line alone) | AsciiDoc model: `formula` atom (inline `stem:[]`, `latexmath:[]`, `asciimath:[]`, `\$…\$` when `:stem:` is set) and `formula` block (`[stem]`/`[latexmath]`/`[asciimath]` + `++++`); parser + serializer round-trip; WYSIWYG renders a formula island with the notation (until M2 lands, no typesetting); toolbar "Fórmula" + dialog (notation, source, inline/block); code-mode highlighting of the formula body; cheat sheet and showcase entries. | engine typecheck; round-trip test over the showcase |
| **M1** | TeX core: lexer, macro expander, parser, symbol table, functions and environments listed in §3 — the full KaTeX surface of docs/supported.md. | unit tests per module; parse the KaTeX corpus without errors |
| **M2** | MathML Core builder + serializer + `formula.css`; integration into the WYSIWYG (inline and display, editable through the dialog with live preview), the side preview and the cheat sheet. | oracle run (DF-5): structural equality on the corpus minus the allow-list; visual check of the showcase in the extension |
| **M3** | AsciiMath parser to the same AST; `:stem:` default handling. | asciimath.org examples as corpus |
| **M4** | Export pre-pass (DF-7) for HTML and DocBook; Markdown/PDF keep the notation. | `test/wasmConverter.test.ts` extended with a formula document |
| **M5** | Fidelity document `docs/fidelidade-formulas.md` (deliberate divergences, Core limits), DF-4 font asset in the extension, docs/CHANGELOG. | — |

Estimate (focused work): M0 ≈ ½ day; M1 ≈ 1–1½ weeks; M2 ≈ 1 week; M3 ≈ 2–3 days; M4–M5 ≈ 2 days. The order is
M0 → M1 → M2 → M3 → M4 → M5; M0 alone already removes the "raw macro text" the owner saw.

## 5. Out of scope (recorded)

- TeX-exact box layout and KaTeX's HTML output path (DF-2).
- PDF typesetting of formulas in the C converter (needs a math layout in C; separate plan).
- `\href`, `\url`, `\includegraphics`, `\html*` (trust features): rendered as text with a warning.
- Persian/Arabic numerals plugin, CJK fonts — depend on the browser's fonts.
