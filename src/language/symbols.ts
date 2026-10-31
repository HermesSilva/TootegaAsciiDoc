// Outline (document symbols) and workspace symbols from the section structure.
import * as vscode from 'vscode';
import { scanStructure, type Heading } from './structure';

export class AsciiDocDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
    const { headings } = scanStructure(document.getText());
    return buildTree(headings, document);
  }
}

function buildTree(headings: Heading[], document: vscode.TextDocument): vscode.DocumentSymbol[] {
  const roots: vscode.DocumentSymbol[] = [];
  const stack: { level: number; symbol: vscode.DocumentSymbol }[] = [];
  headings.forEach((h, index) => {
    const endLine = (headings.slice(index + 1).find((n) => n.level <= h.level)?.line ?? document.lineCount) - 1;
    const range = new vscode.Range(h.line, 0, Math.max(h.line, endLine), document.lineAt(Math.max(h.line, Math.min(endLine, document.lineCount - 1))).text.length);
    const selection = new vscode.Range(h.line, 0, h.line, document.lineAt(h.line).text.length);
    const symbol = new vscode.DocumentSymbol(h.text, h.explicitId ? `#${h.explicitId}` : '', h.level === 0 ? vscode.SymbolKind.File : vscode.SymbolKind.String, range, selection);
    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) stack.pop();
    if (stack.length === 0) roots.push(symbol);
    else stack[stack.length - 1].symbol.children.push(symbol);
    stack.push({ level: h.level, symbol });
  });
  return roots;
}

/** Workspace symbols: section titles of every AsciiDoc file in the workspace (scanned on demand, cached briefly). */
export class AsciiDocWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  private cache: { at: number; symbols: vscode.SymbolInformation[] } | null = null;

  async provideWorkspaceSymbols(query: string, token: vscode.CancellationToken): Promise<vscode.SymbolInformation[]> {
    const symbols = await this.all(token);
    const q = query.toLowerCase();
    return q ? symbols.filter((s) => s.name.toLowerCase().includes(q)) : symbols;
  }

  private async all(token: vscode.CancellationToken): Promise<vscode.SymbolInformation[]> {
    if (this.cache && Date.now() - this.cache.at < 10_000) return this.cache.symbols;
    const files = await vscode.workspace.findFiles('**/*.{adoc,asciidoc,asc,ad}', '**/node_modules/**', 2000, token);
    const symbols: vscode.SymbolInformation[] = [];
    for (const uri of files) {
      if (token.isCancellationRequested) break;
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        const text = Buffer.from(bytes).toString('utf8');
        const { headings } = scanStructure(text);
        for (const h of headings) symbols.push(new vscode.SymbolInformation(h.text, h.level === 0 ? vscode.SymbolKind.File : vscode.SymbolKind.String, '', new vscode.Location(uri, new vscode.Position(h.line, 0))));
      } catch {
        /* unreadable file: skipped — it is not a symbol source */
      }
    }
    this.cache = { at: Date.now(), symbols };
    return symbols;
  }
}
