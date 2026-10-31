// Document links: include::, image::/image:, video::/audio::, link:, xref:/<<file#id>> and bare URLs become
// clickable. Relative paths resolve against the document (images honour :imagesdir:).
import * as vscode from 'vscode';
import { isRemote, resolveDocumentPath } from './paths';
import { scanStructure } from './structure';

export class AsciiDocDocumentLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    const { references, headings, anchors } = scanStructure(document.getText());
    const links: vscode.DocumentLink[] = [];
    for (const ref of references) {
      const range = new vscode.Range(ref.line, ref.character, ref.line, ref.character + ref.length);
      let target: vscode.Uri | undefined;
      if (ref.kind === 'url' || isRemote(ref.target) || ref.target.startsWith('mailto:')) {
        try {
          target = vscode.Uri.parse(ref.target);
        } catch {
          continue;
        }
      } else if (ref.kind === 'xref') {
        if (!ref.target) {
          // Same-document anchor → jump to its line.
          const line = anchors.find((a) => a.id === ref.fragment)?.line ?? headings.find((h) => h.id === ref.fragment)?.line;
          if (line === undefined) continue;
          target = document.uri.with({ fragment: `L${line + 1}` });
        } else target = resolveDocumentPath(document, ref.target, 'text');
      } else if (ref.kind === 'link') {
        if (!ref.target) continue;
        target = resolveDocumentPath(document, ref.target, 'text');
      } else target = resolveDocumentPath(document, ref.target, ref.kind === 'image' || ref.kind === 'video' || ref.kind === 'audio' ? 'image' : 'text');
      const link = new vscode.DocumentLink(range, target);
      link.tooltip = ref.kind === 'xref' && !ref.target ? vscode.l10n.t('Go to anchor') : undefined;
      links.push(link);
    }
    return links;
  }
}
