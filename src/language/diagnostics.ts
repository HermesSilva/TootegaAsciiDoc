// Parser diagnostics in the Problems panel: the engine's own parser (the same one that drives the editor) runs on
// the host over every open AsciiDoc document and reports what it read in a degraded way.
import * as vscode from 'vscode';
import { analisarAsciiDoc } from '@core/components/asciidoc/parser/blocos';
import { logError } from '../util/logger';

export class AsciiDocDiagnostics implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('tootega-asciidoc');
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((d) => this.schedule(d)),
      vscode.workspace.onDidChangeTextDocument((e) => this.schedule(e.document)),
      vscode.workspace.onDidCloseTextDocument((d) => this.collection.delete(d.uri)),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('tootegaAsciidoc.diagnostics.enabled')) {
          this.collection.clear();
          for (const d of vscode.workspace.textDocuments) this.schedule(d);
        }
      }),
    );
    for (const d of vscode.workspace.textDocuments) this.schedule(d);
  }

  dispose(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    for (const d of this.disposables) d.dispose();
    this.collection.dispose();
  }

  private schedule(document: vscode.TextDocument): void {
    if (document.languageId !== 'asciidoc') return;
    const key = document.uri.toString();
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        this.run(document);
      }, 400),
    );
  }

  private run(document: vscode.TextDocument): void {
    if (!vscode.workspace.getConfiguration('tootegaAsciidoc').get<boolean>('diagnostics.enabled', true)) {
      this.collection.delete(document.uri);
      return;
    }
    try {
      const { avisos } = analisarAsciiDoc(document.getText());
      const diagnostics = avisos.map((a) => {
        const line = Math.max(0, Math.min(document.lineCount - 1, a.linha - 1));
        const range = new vscode.Range(line, 0, line, document.lineAt(line).text.length);
        const d = new vscode.Diagnostic(range, a.texto, vscode.DiagnosticSeverity.Warning);
        d.source = 'Tootega AsciiDoc';
        return d;
      });
      this.collection.set(document.uri, diagnostics);
    } catch (e) {
      logError('diagnostics', e);
    }
  }
}
