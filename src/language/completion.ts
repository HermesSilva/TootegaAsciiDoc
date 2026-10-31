// Completion in the native text editor:
//   {        → attribute names (defined in the document + intrinsic)
//   <<  xref:→ anchors and section ids of the document (and of the referenced file, when `file.adoc#`)
//   include::/image::/image:/video::/audio:: → file paths relative to the document (images honour :imagesdir:)
//   :        at line start → common attribute names
//   NAME:    at line start → admonition labels
import * as vscode from 'vscode';
import { imagesDir, resolveDocumentPath } from './paths';
import { INTRINSIC_ATTRIBUTES, scanStructure } from './structure';

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i;
const ADOC_EXTENSIONS = /\.(adoc|asciidoc|asc|ad)$/i;

export class AsciiDocCompletionItemProvider implements vscode.CompletionItemProvider {
  async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.CompletionItem[] | undefined> {
    const line = document.lineAt(position.line).text;
    const before = line.slice(0, position.character);

    const attr = /\{([A-Za-z0-9_-]*)$/.exec(before);
    if (attr) return this.attributes(document, attr[1].length);

    const xref = /(?:<<|xref:)([^\s>\[,]*)$/.exec(before);
    if (xref) return this.anchors(document, xref[1], token);

    const macro = /(include|image|video|audio)::?([^\[\s]*)$/.exec(before);
    if (macro && (macro[1] !== 'image' || /image::?/.test(before))) return this.paths(document, macro[1], macro[2], token);

    if (/^:[A-Za-z0-9_-]*$/.test(before)) return this.attributeNames(before.length - 1);

    if (/^[A-Z]{1,9}$/.test(before)) return ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'].map((name) => {
      const item = new vscode.CompletionItem(`${name}: `, vscode.CompletionItemKind.Keyword);
      item.insertText = `${name}: `;
      item.range = new vscode.Range(position.line, 0, position.line, position.character);
      return item;
    });

    return undefined;
  }

  private attributes(document: vscode.TextDocument, typed: number): vscode.CompletionItem[] {
    const defined = scanStructure(document.getText()).attributes;
    const seen = new Set<string>();
    const items: vscode.CompletionItem[] = [];
    for (const a of defined) {
      if (a.unset || seen.has(a.name)) continue;
      seen.add(a.name);
      const item = new vscode.CompletionItem(a.name, vscode.CompletionItemKind.Variable);
      item.detail = a.value;
      item.insertText = `${a.name}}`;
      item.sortText = `0${a.name}`;
      items.push(item);
    }
    for (const [name, meaning] of Object.entries(INTRINSIC_ATTRIBUTES)) {
      if (seen.has(name)) continue;
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Constant);
      item.detail = meaning;
      item.insertText = `${name}}`;
      item.sortText = `1${name}`;
      items.push(item);
    }
    void typed;
    return items;
  }

  private attributeNames(typed: number): vscode.CompletionItem[] {
    void typed;
    return Object.entries(INTRINSIC_ATTRIBUTES)
      .filter(([name]) => !['nbsp', 'zwsp', 'wj', 'apos', 'quot', 'lsquo', 'rsquo', 'ldquo', 'rdquo', 'deg', 'plus', 'brvbar', 'vbar', 'amp', 'lt', 'gt', 'startsb', 'endsb', 'caret', 'asterisk', 'tilde', 'backslash', 'backtick', 'two-colons', 'two-semicolons', 'cpp', 'pp', 'empty', 'sp', 'blank', 'docdir', 'docfile', 'docname', 'doctitle', 'docdate', 'doctime', 'localdate', 'localtime'].includes(name))
      .map(([name, meaning]) => {
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Property);
        item.detail = meaning;
        item.insertText = `${name}: `;
        return item;
      });
  }

  private async anchors(document: vscode.TextDocument, typed: string, token: vscode.CancellationToken): Promise<vscode.CompletionItem[]> {
    const hash = typed.indexOf('#');
    let text = document.getText();
    let prefix = '';
    if (hash >= 0 && typed.slice(0, hash)) {
      prefix = typed.slice(0, hash + 1);
      try {
        const bytes = await vscode.workspace.fs.readFile(resolveDocumentPath(document, typed.slice(0, hash), 'text'));
        text = Buffer.from(bytes).toString('utf8');
      } catch {
        return [];
      }
    }
    if (token.isCancellationRequested) return [];
    const { headings, anchors } = scanStructure(text);
    const items: vscode.CompletionItem[] = [];
    for (const h of headings) {
      const item = new vscode.CompletionItem(h.id, vscode.CompletionItemKind.Reference);
      item.detail = h.text;
      item.insertText = `${prefix}${h.id}`;
      item.filterText = `${prefix}${h.id} ${h.text}`;
      items.push(item);
    }
    for (const a of anchors) {
      if (headings.some((h) => h.id === a.id)) continue;
      const item = new vscode.CompletionItem(a.id, vscode.CompletionItemKind.Reference);
      item.detail = vscode.l10n.t('anchor on line {0}', a.line + 1);
      item.insertText = `${prefix}${a.id}`;
      items.push(item);
    }
    return items;
  }

  private async paths(document: vscode.TextDocument, macro: string, typed: string, token: vscode.CancellationToken): Promise<vscode.CompletionItem[]> {
    const isImage = macro === 'image' || macro === 'video' || macro === 'audio';
    const base = vscode.Uri.joinPath(document.uri, '..', isImage ? imagesDir(document) : '.');
    const slash = typed.lastIndexOf('/');
    const dirPart = slash >= 0 ? typed.slice(0, slash + 1) : '';
    const dir = dirPart ? vscode.Uri.joinPath(base, dirPart) : base;
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(dir);
    } catch {
      return [];
    }
    if (token.isCancellationRequested) return [];
    const items: vscode.CompletionItem[] = [];
    for (const [name, type] of entries) {
      if (name.startsWith('.')) continue;
      const isDir = (type & vscode.FileType.Directory) !== 0;
      if (!isDir) {
        if (macro === 'include' && !ADOC_EXTENSIONS.test(name) && !/\.(txt|csv|json|ya?ml|xml|java|cs|ts|js|py|c|cpp|h|sql|sh|ps1)$/i.test(name)) continue;
        if (macro === 'image' && !IMAGE_EXTENSIONS.test(name)) continue;
      }
      const item = new vscode.CompletionItem(isDir ? `${name}/` : name, isDir ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File);
      item.insertText = isDir ? `${name}/` : `${name}[]`;
      item.command = isDir ? { command: 'editor.action.triggerSuggest', title: '' } : undefined;
      item.sortText = `${isDir ? 0 : 1}${name}`;
      items.push(item);
    }
    return items;
  }
}
