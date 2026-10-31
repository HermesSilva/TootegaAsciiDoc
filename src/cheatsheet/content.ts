// Cheat sheet content, both languages. Each row: [syntax, meaning].
export interface CheatSheet {
  title: string;
  lead: string;
  sections: { title: string; rows: [string, string][] }[];
}

const SYNTAX = {
  header: ['= Document title\nAuthor Name <author@example.org>\nv1.0, 2026-01-31\n:toc:\n:imagesdir: images', '== Section\n=== Subsection (up to ======)', '.Block title\n[#custom-id.role]\nparagraph or block', '[[anchor]] or [#anchor]\n<<anchor>> or <<anchor,Text>>\nxref:other.adoc#anchor[Text]'],
  inline: ['*bold*  _italic_  `monospace`  #highlight#', '^superscript^  ~subscript~', '[.underline]#text#  [.line-through]#text#', 'https://example.org[Link text]\nlink:file.pdf[Open]\nmailto:a@b.c[Mail]', 'image:icon.png[alt,16]', 'footnote:[Footnote text]', 'kbd:[Ctrl+S]  btn:[OK]  menu:File[Save as > PDF]', '{attribute-name}  +\nline break with trailing plus', '{nbsp} {zwsp} {empty} {plus} {amp} {lt} {gt}'],
  blocks: ['* item\n** nested\n- item', '. numbered\n.. nested', '* [ ] task\n* [x] done', 'Term:: definition\nTerm2::\n  definition', '[source,java]\n----\ncode\n----', '```python\ncode\n```', '....\nliteral\n....', '====\nexample\n====', '****\nsidebar\n****', '[quote, Author, Source]\n____\nquote\n____', '--\nopen block\n--', '++++\npassthrough\n++++', '////\ncomment block\n////', '// line comment'],
  admonitions: ['NOTE: text\nTIP: text\nIMPORTANT: text\nWARNING: text\nCAUTION: text', '[NOTE]\n====\nmulti-paragraph admonition\n===='],
  media: ['image::figure.png[Alt text,300,200]', 'image::figure.png[Alt,title="Caption",align=center]', 'video::clip.mp4[]\nvideo::ID[youtube]', 'include::other.adoc[]\ninclude::file.java[tag=snippet]\ninclude::file.adoc[leveloffset=+1,lines=1..10]'],
  tables: ['|===\n|Header 1 |Header 2\n\n|Cell |Cell\n|===', '[cols="1,3",options="header"]\n|===\n|Key |Value\n|a |b\n|===', '2+|spans two columns\n.2+|spans two rows\n^|centred  >|right  a|AsciiDoc cell', ',===\nCSV,table\n,===   :===  (DSV)'],
  stem: ['stem:[sqrt(4) = 2]  latexmath:[E = mc^2]  asciimath:[x^2]', '[stem]\n++++\nsum_(i=1)^n i = (n(n+1))/2\n++++', ':stem: latexmath'],
  misc: ["'''  thematic break", '<<<  page break', 'toc::[]  (with :toc: macro)', '<1> callout after a code block\n----\nline // <1>\n----\n<1> Explanation', 'ifdef::attr[]\nconditional\nendif::[]', ':attribute!:  unsets an attribute'],
};

export const CHEAT_SHEET: Record<'en' | 'pt-BR', CheatSheet> = {
  en: {
    title: 'AsciiDoc cheat sheet',
    lead: 'The syntax that the Tootega editor reads and writes. In Visual mode most of it comes from the toolbar; in Code mode you type it.',
    sections: [
      { title: 'Document and sections', rows: [[SYNTAX.header[0], 'Header: title, author line, revision line, attributes (no blank line in between).'], [SYNTAX.header[1], 'Sections: `==` is level 1 (the document title is `=`).'], [SYNTAX.header[2], 'Block title and block attributes on the lines above the block.'], [SYNTAX.header[3], 'Anchors and cross references, inside and across documents.']] },
      { title: 'Inline formatting', rows: [[SYNTAX.inline[0], 'Bold, italic, monospace, highlight.'], [SYNTAX.inline[1], 'Superscript and subscript.'], [SYNTAX.inline[2], 'Roles (styles) on a span.'], [SYNTAX.inline[3], 'Links: URL, file, e-mail.'], [SYNTAX.inline[4], 'Inline image.'], [SYNTAX.inline[5], 'Footnote.'], [SYNTAX.inline[6], 'Keyboard, button and menu (needs `:experimental:`).'], [SYNTAX.inline[7], 'Attribute reference; hard line break.'], [SYNTAX.inline[8], 'Character replacements.']] },
      { title: 'Lists and blocks', rows: [[SYNTAX.blocks[0], 'Bulleted lists (nest with more `*`).'], [SYNTAX.blocks[1], 'Numbered lists.'], [SYNTAX.blocks[2], 'Task list.'], [SYNTAX.blocks[3], 'Description list.'], [SYNTAX.blocks[4], 'Source block with language.'], [SYNTAX.blocks[5], 'Fenced source block (Markdown style).'], [SYNTAX.blocks[6], 'Literal block.'], [SYNTAX.blocks[7], 'Example block.'], [SYNTAX.blocks[8], 'Sidebar.'], [SYNTAX.blocks[9], 'Quote with attribution.'], [SYNTAX.blocks[10], 'Open block (generic container).'], [SYNTAX.blocks[11], 'Passthrough (output as is).'], [SYNTAX.blocks[12], 'Comment block.'], [SYNTAX.blocks[13], 'Line comment.']] },
      { title: 'Admonitions', rows: [[SYNTAX.admonitions[0], 'Single-paragraph admonitions.'], [SYNTAX.admonitions[1], 'Admonition with several blocks.']] },
      { title: 'Images, media and includes', rows: [[SYNTAX.media[0], 'Block image with alt, width and height.'], [SYNTAX.media[1], 'Image with caption and alignment.'], [SYNTAX.media[2], 'Video (local file or YouTube id).'], [SYNTAX.media[3], 'Include another file, a tagged region, a line range; shift its heading levels.']] },
      { title: 'Tables', rows: [[SYNTAX.tables[0], 'Table; the first row is a header when a blank line follows it.'], [SYNTAX.tables[1], 'Column widths and options.'], [SYNTAX.tables[2], 'Spans, alignment and cell styles.'], [SYNTAX.tables[3], 'CSV and DSV tables.']] },
      { title: 'Miscellaneous', rows: [[SYNTAX.misc[0], 'Thematic break (horizontal rule).'], [SYNTAX.misc[1], 'Page break.'], [SYNTAX.misc[2], 'Table of contents where the macro sits.'], [SYNTAX.misc[3], 'Callouts in code.'], [SYNTAX.misc[4], 'Conditional content.'], [SYNTAX.misc[5], 'Unset an attribute.']] },
      { title: 'Formulas (STEM)', rows: [[SYNTAX.stem[0], 'Inline formula: `stem:[]` follows the document `:stem:` attribute; `latexmath:[]` and `asciimath:[]` force the notation.'], [SYNTAX.stem[1], 'Formula block (also `[latexmath]` or `[asciimath]`).'], [SYNTAX.stem[2], 'Default notation of `stem` (empty or absent = AsciiMath).']] },
    ],
  },
  'pt-BR': {
    title: 'Folha de referência do AsciiDoc',
    lead: 'A sintaxe que o editor Tootega lê e escreve. No modo Visual quase tudo sai da barra de ferramentas; no modo Código você a digita.',
    sections: [
      { title: 'Documento e seções', rows: [[SYNTAX.header[0], 'Cabeçalho: título, linha de autor, linha de revisão, atributos (sem linha em branco entre eles).'], [SYNTAX.header[1], 'Seções: `==` é o nível 1 (o título do documento é `=`).'], [SYNTAX.header[2], 'Título do bloco e atributos do bloco nas linhas acima dele.'], [SYNTAX.header[3], 'Âncoras e referências cruzadas, no documento e entre documentos.']] },
      { title: 'Formatação inline', rows: [[SYNTAX.inline[0], 'Negrito, itálico, monoespaçado, realce.'], [SYNTAX.inline[1], 'Sobrescrito e subscrito.'], [SYNTAX.inline[2], 'Papéis (estilos) num trecho.'], [SYNTAX.inline[3], 'Links: URL, arquivo, e-mail.'], [SYNTAX.inline[4], 'Imagem inline.'], [SYNTAX.inline[5], 'Nota de rodapé.'], [SYNTAX.inline[6], 'Tecla, botão e menu (exige `:experimental:`).'], [SYNTAX.inline[7], 'Referência a atributo; quebra de linha forçada.'], [SYNTAX.inline[8], 'Substituições de caracteres.']] },
      { title: 'Listas e blocos', rows: [[SYNTAX.blocks[0], 'Listas com marcadores (aninhe com mais `*`).'], [SYNTAX.blocks[1], 'Listas numeradas.'], [SYNTAX.blocks[2], 'Lista de tarefas.'], [SYNTAX.blocks[3], 'Lista de descrição.'], [SYNTAX.blocks[4], 'Bloco de código com linguagem.'], [SYNTAX.blocks[5], 'Bloco de código cercado (estilo Markdown).'], [SYNTAX.blocks[6], 'Bloco literal.'], [SYNTAX.blocks[7], 'Bloco de exemplo.'], [SYNTAX.blocks[8], 'Barra lateral.'], [SYNTAX.blocks[9], 'Citação com atribuição.'], [SYNTAX.blocks[10], 'Bloco aberto (contêiner genérico).'], [SYNTAX.blocks[11], 'Passagem (sai como está).'], [SYNTAX.blocks[12], 'Bloco de comentário.'], [SYNTAX.blocks[13], 'Comentário de linha.']] },
      { title: 'Admonições', rows: [[SYNTAX.admonitions[0], 'Admonições de um parágrafo.'], [SYNTAX.admonitions[1], 'Admonição com vários blocos.']] },
      { title: 'Imagens, mídia e includes', rows: [[SYNTAX.media[0], 'Imagem de bloco com texto alternativo, largura e altura.'], [SYNTAX.media[1], 'Imagem com legenda e alinhamento.'], [SYNTAX.media[2], 'Vídeo (arquivo local ou id do YouTube).'], [SYNTAX.media[3], 'Incluir outro arquivo, uma região marcada, um intervalo de linhas; deslocar os níveis de título.']] },
      { title: 'Tabelas', rows: [[SYNTAX.tables[0], 'Tabela; a primeira linha é cabeçalho quando uma linha em branco a segue.'], [SYNTAX.tables[1], 'Larguras das colunas e opções.'], [SYNTAX.tables[2], 'Mesclagens, alinhamento e estilos de célula.'], [SYNTAX.tables[3], 'Tabelas CSV e DSV.']] },
      { title: 'Diversos', rows: [[SYNTAX.misc[0], 'Quebra temática (linha horizontal).'], [SYNTAX.misc[1], 'Quebra de página.'], [SYNTAX.misc[2], 'Sumário no lugar do macro.'], [SYNTAX.misc[3], 'Chamadas no código.'], [SYNTAX.misc[4], 'Conteúdo condicional.'], [SYNTAX.misc[5], 'Remover um atributo.']] },
      { title: 'Fórmulas (STEM)', rows: [[SYNTAX.stem[0], 'Fórmula inline: `stem:[]` segue o atributo `:stem:` do documento; `latexmath:[]` e `asciimath:[]` fixam a notação.'], [SYNTAX.stem[1], 'Bloco de fórmula (também `[latexmath]` ou `[asciimath]`).'], [SYNTAX.stem[2], 'Notação padrão de `stem` (vazio ou ausente = AsciiMath).']] },
    ],
  },
};
