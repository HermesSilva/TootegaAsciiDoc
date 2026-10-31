// A light, line-based scan of an AsciiDoc text for the language features (outline, folding, links, completion,
// hover). It is NOT the parser: it only recognises the lines these features need, and it never fails.
// Pure and unit-tested.

export interface Heading {
  level: number; // 0 = document title (`=`), 1 = `==` …
  text: string;
  line: number; // 0-based
  /** Auto-generated id (Asciidoctor's idprefix `_` + lowercase, non-word → `_`), or the explicit anchor. */
  id: string;
  explicitId?: string;
}

export interface AttributeDefinition {
  name: string;
  value: string;
  line: number;
  unset: boolean;
}

export interface Anchor {
  id: string;
  line: number;
  character: number;
  length: number;
}

export type ReferenceKind = 'include' | 'image' | 'link' | 'xref' | 'url' | 'video' | 'audio';

export interface Reference {
  kind: ReferenceKind;
  target: string;
  line: number;
  character: number;
  length: number;
  /** For xref: the anchor part after `#`. */
  fragment?: string;
}

export interface DelimitedBlock {
  delimiter: string;
  startLine: number;
  endLine: number;
}

export interface Structure {
  headings: Heading[];
  attributes: AttributeDefinition[];
  anchors: Anchor[];
  references: Reference[];
  blocks: DelimitedBlock[];
  /** Lines that are inside delimited blocks whose content is verbatim (listing, literal, passthrough, comment). */
  verbatimLines: Set<number>;
}

const SECTION = /^(={1,6})\s+(\S.*?)(?:\s+=+)?\s*$/;
const ATTRIBUTE = /^:([A-Za-z0-9_][A-Za-z0-9_-]*)(!?):(?:\s+(.*))?$/;
const BLOCK_ANCHOR = /^\[\[([^\]\s,]+)(?:,[^\]]*)?\]\]\s*$/;
const ATTR_LIST_ID = /^\[#([^\]\s,.%]+)[^\]]*\]\s*$/;
const DELIMITER = /^(-{4,}|={4,}|\*{4,}|_{4,}|\.{4,}|\+{4,}|\/{4,}|--|\|===|,===|:===|!===)\s*$/;
const FENCE = /^```/;
const VERBATIM = new Set(['-', '.', '+', '/', '`']);

const INLINE_ANCHOR = /\[\[([^\]\s,]+)(?:,[^\]]*)?\]\]|anchor:([^\[\s]+)\[/g;
const BLOCK_MACRO = /^(include|image|video|audio)::([^\[\s]+)\[([^\]]*)\]\s*$/;
const INLINE_MACRO = /\b(image|link|xref):([^\[\s]+)\[/g;
const ANGLE_XREF = /<<([^>,]+)(?:,[^>]*)?>>/g;
const BARE_URL = /(?<![\w"'`(\[])((?:https?|ftp|irc):\/\/[^\s\[\]<>"']+)/g;

export function scanStructure(text: string): Structure {
  const lines = text.split(/\r?\n/);
  const headings: Heading[] = [];
  const attributes: AttributeDefinition[] = [];
  const anchors: Anchor[] = [];
  const references: Reference[] = [];
  const blocks: DelimitedBlock[] = [];
  const verbatimLines = new Set<number>();

  const open: { delimiter: string; startLine: number }[] = [];
  let pendingAnchor: string | undefined;
  const usedIds = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Delimited blocks (including fences and tables) drive folding and verbatim detection.
    const delimiter = DELIMITER.exec(line)?.[1] ?? (FENCE.test(line) ? '```' : undefined);
    if (delimiter !== undefined) {
      const top = open[open.length - 1];
      if (top && (top.delimiter === delimiter || (top.delimiter === '```' && delimiter === '```'))) {
        open.pop();
        blocks.push({ delimiter, startLine: top.startLine, endLine: i });
      } else open.push({ delimiter, startLine: i });
      continue;
    }
    const inVerbatim = open.some((b) => VERBATIM.has(b.delimiter[0]));
    if (inVerbatim) {
      verbatimLines.add(i);
      continue;
    }

    const blockAnchor = BLOCK_ANCHOR.exec(line) ?? ATTR_LIST_ID.exec(line);
    if (blockAnchor) {
      pendingAnchor = blockAnchor[1];
      anchors.push({ id: blockAnchor[1], line: i, character: line.indexOf(blockAnchor[1]), length: blockAnchor[1].length });
      continue;
    }

    const section = SECTION.exec(line);
    if (section) {
      const level = section[1].length - 1;
      const textOfHeading = section[2].trim();
      const explicitId = pendingAnchor;
      let id = explicitId ?? autoId(textOfHeading);
      if (!explicitId) {
        const seen = usedIds.get(id) ?? 0;
        usedIds.set(id, seen + 1);
        if (seen > 0) id = `${id}_${seen + 1}`;
      }
      headings.push({ level, text: textOfHeading, line: i, id, explicitId });
      pendingAnchor = undefined;
      continue;
    }

    const attribute = ATTRIBUTE.exec(line);
    if (attribute) {
      attributes.push({ name: attribute[1], value: (attribute[3] ?? '').trim(), line: i, unset: attribute[2] === '!' });
      continue;
    }

    if (line.startsWith('//')) continue;

    const macro = BLOCK_MACRO.exec(line);
    if (macro) {
      const kind = macro[1] as ReferenceKind;
      references.push({ kind, target: macro[2], line: i, character: line.indexOf(macro[2]), length: macro[2].length });
      pendingAnchor = undefined;
      continue;
    }

    if (line.trim() !== '') pendingAnchor = undefined;

    for (const m of line.matchAll(INLINE_ANCHOR)) {
      const id = m[1] ?? m[2];
      anchors.push({ id, line: i, character: m.index + m[0].indexOf(id), length: id.length });
    }
    for (const m of line.matchAll(INLINE_MACRO)) {
      const kind = m[1] as ReferenceKind;
      const target = m[2];
      const [path, fragment] = kind === 'xref' ? splitFragment(target) : [target, undefined];
      references.push({ kind, target: path, fragment, line: i, character: m.index + m[1].length + 1, length: target.length });
    }
    for (const m of line.matchAll(ANGLE_XREF)) {
      const target = m[1].trim();
      const [path, fragment] = splitFragment(target);
      references.push({ kind: 'xref', target: path, fragment, line: i, character: m.index + 2, length: m[1].length });
    }
    for (const m of line.matchAll(BARE_URL)) {
      references.push({ kind: 'url', target: m[1], line: i, character: m.index, length: m[1].length });
    }
  }

  for (const b of open) blocks.push({ delimiter: b.delimiter, startLine: b.startLine, endLine: lines.length - 1 });
  return { headings, attributes, anchors, references, blocks, verbatimLines };
}

/** `file.adoc#anchor` → ['file.adoc', 'anchor']; `anchor` → ['', 'anchor']. */
export function splitFragment(target: string): [string, string | undefined] {
  const hash = target.indexOf('#');
  if (hash < 0) return /\.(adoc|asciidoc|asc|ad)$/i.test(target) ? [target, undefined] : ['', target];
  return [target.slice(0, hash), target.slice(hash + 1) || undefined];
}

/** Asciidoctor-style automatic section id: `_` prefix, lowercase, non-alphanumerics collapsed to `_`. */
export function autoId(text: string): string {
  const plain = text
    .replace(/\{[^}]+\}/g, '')
    .replace(/<<[^>]*>>|\[\[[^\]]*\]\]|[a-z]+:[^\[\s]*\[[^\]]*\]/g, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `_${plain}`;
}

/** Attribute references `{name}` in a line, with their positions. */
export function attributeReferences(line: string): { name: string; character: number; length: number }[] {
  const out: { name: string; character: number; length: number }[] = [];
  for (const m of line.matchAll(/\{([A-Za-z0-9_][A-Za-z0-9_-]*)\}/g)) out.push({ name: m[1], character: m.index, length: m[0].length });
  return out;
}

/** Asciidoctor intrinsic attributes with a fixed or well-known value (for hover and completion). */
export const INTRINSIC_ATTRIBUTES: Record<string, string> = {
  nbsp: '  (non-breaking space)',
  zwsp: '​ (zero-width space)',
  wj: '⁠ (word joiner)',
  apos: "'",
  quot: '"',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  deg: '°',
  plus: '+',
  brvbar: '¦',
  vbar: '|',
  amp: '&',
  lt: '<',
  gt: '>',
  startsb: '[',
  endsb: ']',
  caret: '^',
  asterisk: '*',
  tilde: '~',
  backslash: '\\',
  backtick: '`',
  'two-colons': '::',
  'two-semicolons': ';;',
  cpp: 'C++',
  pp: '++',
  empty: '(empty)',
  sp: ' (space)',
  blank: '(blank)',
  docdir: 'directory of the document',
  docfile: 'path of the document',
  docname: 'name of the document without extension',
  doctitle: 'title of the document',
  docdate: 'date of the document',
  doctime: 'time of the document',
  localdate: 'local date at conversion',
  localtime: 'local time at conversion',
  imagesdir: 'base directory of images (default: document directory)',
  toc: 'enables the table of contents',
  'toc-title': 'title of the table of contents (default: Table of Contents)',
  toclevels: 'depth of the table of contents (default: 2)',
  sectnums: 'numbers the sections',
  sectanchors: 'adds an anchor icon to section titles',
  sectlinks: 'makes section titles links',
  'source-highlighter': 'code highlighter (not applied by this extension)',
  icons: 'font | image — admonition and inline icons',
  experimental: 'enables kbd:, btn: and menu: macros',
  hardbreaks: 'every line break is a hard break (alias of hardbreaks-option)',
  idprefix: 'prefix of generated ids (default: _)',
  idseparator: 'separator of generated ids (default: _)',
  leveloffset: 'shifts section levels of included content',
  nofooter: 'suppresses the footer',
  'last-update-label': 'label before the last-update date',
  author: 'author of the document',
  email: 'author email',
  revnumber: 'revision number',
  revdate: 'revision date',
  revremark: 'revision remark',
  description: 'document description (meta)',
  keywords: 'document keywords (meta)',
  lang: 'language of the document (default: en)',
  encoding: 'character encoding (default: UTF-8)',
  stylesheet: 'custom stylesheet for the HTML output',
  stylesdir: 'directory of the stylesheet',
  linkcss: 'links the stylesheet instead of embedding it',
  'allow-uri-read': 'lets include:: fetch URIs (not supported here)',
  'data-uri': 'embeds images as data URIs in the HTML output',
};
