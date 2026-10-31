# Formula engine — fidelity and known divergences

> Companion of [`PLAN-formulas.md`](PLAN-formulas.md) (DF-5). The engine lives in
> `TootegaWebUI/src/lib/formula/`; the oracle is `scripts/formula-oracle.mjs` (fetches KaTeX with `npm pack` into a
> temporary folder — never a dependency) over `scripts/formula-corpus.json`, with the deliberate divergences listed in
> `scripts/formula-oracle-allow.json`. Run: `node scripts/formula-oracle.mjs [--verbose]`.

## What the oracle compares

The MathML of both engines is reduced to a **skeleton**: element names and text, no attributes, no
`semantics`/`annotation`, single-child `mrow`/`mstyle`/`mpadded` collapsed, adjacent `mn`/`mtext` merged, leaf
kinds (`mi`/`mo`/`mn`/`mtext`) unified. Text is NFKC-normalised so a bold `𝐱` (ours) equals `x` with
`mathvariant="bold"` (KaTeX) — see "Core gaps" below.

Result on 2026-10-31 (KaTeX 0.19.1, 328 formulas in `scripts/formula-corpus.json`): **289 identical, 39 allowed
divergences, 0 unexplained**.

## Deliberate divergences (allow-list)

| Source | KaTeX | Ours | Why |
|--------|-------|------|-----|
| `x''` | two `<mo>′</mo>` | one `<mo>″</mo>` | The Unicode double/triple prime renders as one glyph; the TeX look. |
| `\vdots` | `<mi>⋮</mi><mspace>` | `<mi>⋮</mi>` | KaTeX adds a kern for its own font metrics. |
| `\bmod`, `\pmod` | extra `mspace` | fewer spaces | KaTeX's `\pod` macro emits a break opportunity plus two kerns; ours one kern. |
| `\TeX`, `\LaTeX`, `\KaTeX` | `<mtext>TeX</mtext>` | kerned letters | KaTeX collapses the logo to plain text in MathML; ours keeps the kerned construction. |
| `\stackrel` | `<mo>` wrapper | `mrow` + `mspace` | `\mathrel{}` of a composite is spaced with `mspace` (Core has no `mo` wrapper for non-text). |
| `\coloneq`, `\Coloneqq`, `\colonapprox`… | precomposed via `\html@mathml` | `≔`, `∷`, `≕` as symbols; the rest assembled with kerns | Unicode has only three of them. |
| `\dddot`, `\ddddot` | `...` text | U+20DB / U+20DC | Real combining triple/quadruple dots. |
| `\overlinesegment`, `\underlinesegment` | `undefined` (KaTeX bug in MathML) | ⎴ / ⎵ | — |
| text accents (`\'e`), `é`, `\text{café}` | `mover` per letter | composed character in one `mtext` | Correct typography; Unicode NFC. |
| `\mbox`, `\textbackslash`, `\iiiint`, `\lq…\rq` | error / `'` as prime | rendered | We accept what LaTeX accepts. |
| `\varlimsup`, `\mathop{\rm lim}` | letters as separate `mi` | one `mi` | Same text, merged. |
| `\newcommand` with digit, `\edef`, `\renewcommand`, optional-arg `\newcommand`, `\noexpand`, `\expandafter` | unsupported / error | implemented | TeX semantics. |
| numbered environments (`equation`, `align`, `gather`), `\tag` | 4-column layout, no numbers in MathML | label column with `(n)` or the tag | Core has no `mlabeledtr`; we show the number. |
| top-level `\\` | `<mspace linebreak>` | one `mtr` per line | Core has no line breaks. |
| `\left<`, `\colon` | `<`, kerned `:` | `⟨`, plain `:` | Readability. |
| `CD` | 3-column grid with empty rows | compact grid | Equivalent cells, no trailing empty row. |

## MathML Core gaps and how we cover them

| Gap in MathML Core | KaTeX (MathML3) | Ours |
|--------------------|-----------------|------|
| `mathvariant` only accepts `normal` | `mathvariant="bold"` etc. | Mathematical Alphanumeric Symbols (`\mathbf{x}` → 𝐱), `tex/unicode.ts`, incl. BMP exceptions (ℝ, ℋ, ℎ…). |
| No `menclose` | `<menclose notation="box">` | `<mrow class="adc-f-cerc-…">` + CSS (box, cancel strokes as gradients, sout, angl, phase). |
| No `mlabeledtr` | — (KaTeX also lacks tags in MathML) | extra `mtd.adc-f-etiqueta` per row, `mtable` at 100 % width. |
| `mpadded` has no percentages, `lspace` ≥ 0 | `lspace="-1width"` for `\llap` | `transform: translateX(-100%)` on `mpadded width="0"`. |
| No `linebreak` on `mspace` | `<mspace linebreak="newline">` | top-level `\\` → one `mtr` per line. |
| No `columnalign`/`columnlines`/`rowlines` | attributes | classes on `mtd` + CSS borders and `text-align`. |
| No `href` on elements | `href` attribute | `\href`/`\url` render as text with a warning (out of scope). |

## Surface coverage (KaTeX "supported functions", docs/supported.md)

Implemented: accents (math and text), delimiters (`\left/\right/\middle`, `\big…\Bigg[lr m]`), environments (matrix
family incl. `*[align]`, `smallmatrix`, `array`/`darray`, `subarray`, `cases`/`dcases`/`rcases`/`drcases`, `aligned`,
`alignedat`, `gathered`, `align[*]`, `alignat[*]`, `gather[*]`, `equation[*]`, `split`, `CD`), letters and Unicode
input, layout (`\cancel` family, `\boxed`, `\fbox`, `\colorbox`, `\fcolorbox`, `\phantom`/`\hphantom`/`\vphantom`,
`\smash`, `\mathllap`/`\mathrlap`/`\mathclap`, `\raisebox`, `\rule`, `\tag`/`\tag*`/`\notag`, `\\[dim]`), logic and set
symbols, macros (`\def`, `\gdef`, `\edef`, `\xdef`, `\let`, `\futurelet`, `\newcommand`, `\renewcommand`,
`\providecommand`, `#1…#9` incl. delimited parameters, `\@ifstar`, `\@ifnextchar`, `\@firstoftwo`, `\@secondoftwo`,
`\TextOrMath`, `\expandafter`, `\noexpand`, `\relax`, `\char`), operators (big operators, named functions,
`\operatorname[*]`, `\mathop`, `\limits`/`\nolimits`), fractions and binomials (`\frac` family, `\genfrac`, `\over`,
`\choose`, `\atop`, `\brace`, `\brack`, `\above`), roots, relations/arrows incl. extensible `\x…arrow`, style/colour/
size/font (`\displaystyle`…, `\textcolor`/`\color`, `\tiny`…`\Huge`, `\mathbf`… and the old `\rm`… forms, `\text`
family), symbols (≈1 000 math names, ≈650 text names), `\verb`, `\not`, `\mathchoice`, `\pmb`, `\vcenter`,
`\reflectbox`, `\mathord`…`\mathinner`.

Rendered as text with a warning (trust features, out of scope by plan): `\href`, `\url`, `\includegraphics`, `\html*`.

AsciiMath (asciimath.org grammar): full token table of the site, `S ::= c | lEr | uS | bSS | "text"`, scripts with
parenthesis stripping, `/` fractions, matrices `[[a,b],[c,d]]`, `|x|`, `abs/floor/ceil/norm`, fonts, accents,
`ubrace/obrace`, `cancel`, `color`, named functions with limits (`lim`, `max`…).

## Not covered (recorded)

- TeX-exact box layout and KaTeX's HTML output path (DF-2): the browser lays out the MathML.
- PDF typesetting of formulas in the C converter (separate plan); PDF and Markdown exports keep the source notation.
- `\cline`, `\multicolumn`, `\par` — also unsupported by KaTeX.
