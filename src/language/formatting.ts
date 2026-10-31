// Inline formatting in the native text editor: wraps the selection with the mark, or removes the mark when the
// selection (or the text around it) is already wrapped. Without a selection the word under the cursor is used; on
// an empty spot the pair is inserted and the cursor lands between the marks.
import * as vscode from 'vscode';

export type InlineMark = '*' | '_' | '`';

interface Plan {
  range: vscode.Range;
  text: string;
  /** Where the cursor goes after the edit, relative to the start of the replaced range (undefined = keep selection). */
  cursorOffset?: number;
}

export function planToggle(document: vscode.TextDocument, selection: vscode.Selection, mark: InlineMark): Plan {
  let range: vscode.Range = selection;
  if (selection.isEmpty) {
    const word = document.getWordRangeAtPosition(selection.active);
    if (word) range = word;
  }
  const text = document.getText(range);
  // Marks inside the selection: `*bold*` → `bold`.
  if (text.length >= 2 && text.startsWith(mark) && text.endsWith(mark)) return { range, text: text.slice(1, -1) };
  // Marks around the selection: `*|bold|*` → `bold`.
  const before = range.start.character > 0 ? document.getText(new vscode.Range(range.start.translate(0, -1), range.start)) : '';
  const after = document.getText(new vscode.Range(range.end, document.validatePosition(range.end.translate(0, 1))));
  if (before === mark && after === mark) return { range: new vscode.Range(range.start.translate(0, -1), range.end.translate(0, 1)), text };
  if (text.length === 0) return { range, text: `${mark}${mark}`, cursorOffset: 1 };
  return { range, text: `${mark}${text}${mark}` };
}

export async function toggleInlineMark(editor: vscode.TextEditor, mark: InlineMark): Promise<void> {
  const document = editor.document;
  const plans = editor.selections.map((s) => planToggle(document, s, mark));
  await editor.edit((builder) => {
    for (const plan of plans) builder.replace(plan.range, plan.text);
  });
  const cursors = plans.filter((p) => p.cursorOffset !== undefined);
  if (cursors.length > 0)
    editor.selections = cursors.map((p) => {
      const pos = p.range.start.translate(0, p.cursorOffset ?? 0);
      return new vscode.Selection(pos, pos);
    });
}
