// Folding: sections (to the line before the next section of the same or higher level), delimited blocks, and
// runs of comment lines.
import * as vscode from 'vscode';
import { scanStructure } from './structure';

export class AsciiDocFoldingRangeProvider implements vscode.FoldingRangeProvider {
  provideFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
    const text = document.getText();
    const { headings, blocks } = scanStructure(text);
    const ranges: vscode.FoldingRange[] = [];

    headings.forEach((h, index) => {
      const next = headings.slice(index + 1).find((n) => n.level <= h.level);
      const end = (next ? next.line : document.lineCount) - 1;
      if (end > h.line) ranges.push(new vscode.FoldingRange(h.line, trimBlank(document, end), vscode.FoldingRangeKind.Region));
    });

    for (const b of blocks) {
      if (b.endLine > b.startLine) {
        const kind = b.delimiter.startsWith('//') ? vscode.FoldingRangeKind.Comment : undefined;
        ranges.push(new vscode.FoldingRange(b.startLine, b.endLine, kind));
      }
    }

    // Runs of `//` line comments.
    const lines = text.split(/\r?\n/);
    let start = -1;
    for (let i = 0; i <= lines.length; i++) {
      const isComment = i < lines.length && /^\/\/(?!\/)/.test(lines[i]);
      if (isComment && start < 0) start = i;
      if (!isComment && start >= 0) {
        if (i - 1 > start) ranges.push(new vscode.FoldingRange(start, i - 1, vscode.FoldingRangeKind.Comment));
        start = -1;
      }
    }
    return ranges;
  }
}

function trimBlank(document: vscode.TextDocument, line: number): number {
  let l = Math.min(line, document.lineCount - 1);
  while (l > 0 && document.lineAt(l).text.trim() === '') l--;
  return l;
}
