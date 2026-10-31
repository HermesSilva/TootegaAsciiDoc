// Hover on `{attribute}` references: shows the value defined in the document (or the intrinsic meaning).
import * as vscode from 'vscode';
import { attributeReferences, INTRINSIC_ATTRIBUTES, scanStructure } from './structure';

export class AsciiDocHoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    const line = document.lineAt(position.line).text;
    const ref = attributeReferences(line).find((r) => position.character >= r.character && position.character <= r.character + r.length);
    if (!ref) return undefined;
    const range = new vscode.Range(position.line, ref.character, position.line, ref.character + ref.length);
    const definitions = scanStructure(document.getText()).attributes.filter((a) => a.name === ref.name && a.line <= position.line);
    const def = definitions[definitions.length - 1];
    const md = new vscode.MarkdownString();
    if (def && !def.unset) {
      md.appendCodeblock(`:${def.name}: ${def.value}`, 'asciidoc');
      md.appendMarkdown(vscode.l10n.t('Defined on line {0}.', def.line + 1));
    } else if (def?.unset) md.appendMarkdown(vscode.l10n.t('Attribute `{0}` is unset on line {1}.', def.name, def.line + 1));
    else if (INTRINSIC_ATTRIBUTES[ref.name]) md.appendMarkdown(`\`{${ref.name}}\` — ${INTRINSIC_ATTRIBUTES[ref.name]}`);
    else md.appendMarkdown(vscode.l10n.t('Attribute `{0}` is not defined in this document (it may come from an include or from the export attributes).', ref.name));
    return new vscode.Hover(md, range);
  }
}
