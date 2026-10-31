// Export commands: HTML, PDF, Markdown and DocBook through the AsciiDocConverter WebAssembly module. The converter's
// messages go to the Problems panel (source "AsciiDocConverter") and the first one is shown with the result — a
// warning from the processor is never lost.
import * as path from 'node:path';
import * as vscode from 'vscode';
import { imagesDirOf, isAbsoluteFsPath } from '../../shared/attributes';
import { resolveLocale } from '../i18n/host';
import { logError } from '../util/logger';
import { ExportFormat, RESULT_NAMES, type ConversionResponse } from './abi';
import { Converter } from './converter';
import { replaceFormulas } from './formulaPrePass';

interface FormatInfo {
  format: ExportFormat;
  extension: string;
  label: string;
  filter: () => string;
  openExternal: boolean;
}

const FORMATS: Record<'html' | 'pdf' | 'markdown' | 'docbook', FormatInfo> = {
  html: { format: ExportFormat.HTML5, extension: '.html', label: 'HTML', filter: () => vscode.l10n.t('HTML files'), openExternal: true },
  pdf: { format: ExportFormat.PDF, extension: '.pdf', label: 'PDF', filter: () => vscode.l10n.t('PDF files'), openExternal: true },
  markdown: { format: ExportFormat.Markdown, extension: '.md', label: 'Markdown', filter: () => vscode.l10n.t('Markdown files'), openExternal: false },
  docbook: { format: ExportFormat.DocBook5, extension: '.xml', label: 'DocBook 5', filter: () => vscode.l10n.t('DocBook files'), openExternal: false },
};

export function registerExportCommands(context: vscode.ExtensionContext, activeAsciiDocUri: (resource?: vscode.Uri) => vscode.Uri | undefined): void {
  const converter = new Converter(path.join(context.extensionPath, 'dist'));
  const diagnostics = vscode.languages.createDiagnosticCollection('tootega-asciidoc-export');
  context.subscriptions.push({ dispose: () => converter.dispose() }, diagnostics);

  for (const key of Object.keys(FORMATS) as (keyof typeof FORMATS)[]) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`tootegaAsciidoc.export.${key}`, async (resource?: vscode.Uri) => {
        const uri = activeAsciiDocUri(resource);
        if (!uri) {
          void vscode.window.showInformationMessage(vscode.l10n.t('Open an AsciiDoc file first.'));
          return;
        }
        await exportDocument(uri, FORMATS[key], converter, diagnostics);
      }),
    );
  }
}

async function exportDocument(uri: vscode.Uri, info: FormatInfo, converter: Converter, diagnostics: vscode.DiagnosticCollection): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('tootegaAsciidoc', uri);
  let text: string;
  try {
    const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    text = open ? open.getText() : Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
  } catch (e) {
    void vscode.window.showErrorMessage(vscode.l10n.t('Cannot open {0}: {1}', uri.fsPath, e instanceof Error ? e.message : String(e)));
    return;
  }

  const target = await outputLocation(uri, info, cfg);
  if (!target) return;

  const options: Record<string, unknown> = {
    idioma: resolveLocale() === 'pt-BR' ? 'pt-BR' : 'en',
    atributos: cfg.get<Record<string, string>>('export.attributes', {}),
  };
  if (info.format === ExportFormat.HTML5) {
    options.autonomo = cfg.get<boolean>('export.html.standalone', true);
    options.dataUri = cfg.get<boolean>('export.html.embedImages', true);
    const stylesheet = cfg.get<string>('export.html.stylesheet', '').trim();
    if (stylesheet) options.folhaDeEstilo = stylesheet;
  }
  if (info.format === ExportFormat.PDF) options.pdf = { pagina: cfg.get<string>('export.pdf.pageSize', 'A4') };

  // Formulas (stem/latexmath/asciimath) become MathML before the converter runs — HTML and DocBook only (DF-7).
  if (info.format === ExportFormat.HTML5 || info.format === ExportFormat.DocBook5) {
    const formulas = replaceFormulas(text, info.format === ExportFormat.HTML5 ? 'html' : 'docbook');
    text = formulas.text;
    if (formulas.warnings.length > 0)
      void vscode.window.showWarningMessage(vscode.l10n.t('{0} formula warning(s) in {1}; the first (line {2}): {3}', formulas.warnings.length, path.basename(uri.fsPath), formulas.warnings[0].line, formulas.warnings[0].text));
  }

  const imagesDir = imagesDirOf(text);
  const documentDir = path.dirname(uri.fsPath);
  const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Exporting {0} to {1}…', path.basename(uri.fsPath), info.label), cancellable: false }, async () => {
    try {
      return await converter.convert({
        text,
        format: info.format,
        options,
        documentPath: uri.fsPath,
        workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath),
        allowOutsideWorkspace: cfg.get<boolean>('export.allowOutsideWorkspace', false),
        imagesDir: imagesDir ? (isAbsoluteFsPath(imagesDir) ? imagesDir : path.resolve(documentDir, imagesDir)) : '',
      });
    } catch (e) {
      return { id: 0, ok: false, rc: -3, messages: [], denied: [], error: e instanceof Error ? e.message : String(e) } satisfies ConversionResponse;
    }
  });

  publishDiagnostics(uri, result, diagnostics);

  if (!result.ok || !result.output) {
    const reason = result.error ?? result.messages.find((m) => m.nivel === 'erro')?.texto ?? `${RESULT_NAMES[result.rc] ?? result.rc}`;
    logError('export', `${info.label} ${uri.fsPath}: ${reason}`);
    const action = await vscode.window.showErrorMessage(vscode.l10n.t('Export to {0} failed for {1}: {2}', info.label, path.basename(uri.fsPath), reason), vscode.l10n.t('Show problems'));
    if (action) await vscode.commands.executeCommand('workbench.actions.view.problems');
    return;
  }

  try {
    await vscode.workspace.fs.writeFile(target, result.output);
  } catch (e) {
    void vscode.window.showErrorMessage(vscode.l10n.t('Export to {0} failed for {1}: {2}', info.label, path.basename(uri.fsPath), e instanceof Error ? e.message : String(e)));
    return;
  }

  const summary = result.messages.length > 0 ? ` ${vscode.l10n.t('The converter ({0}) returned {1} message(s); the first: {2}', result.version ?? 'AsciiDocConverter', result.messages.length, result.messages[0].texto)}` : '';
  const denied = result.denied.length > 0 ? ` ${vscode.l10n.t("Resource outside the workspace was denied: {0}. Enable 'tootegaAsciidoc.export.allowOutsideWorkspace' to allow it.", result.denied[0])}` : '';
  const actions = [vscode.l10n.t('Open')];
  if (result.messages.length > 0 || result.denied.length > 0) actions.push(vscode.l10n.t('Show problems'));
  const message = `${vscode.l10n.t('Exported: {0}', target.fsPath)}${summary}${denied}`;
  const shouldOpen = cfg.get<boolean>('export.openAfterExport', true);
  const choice = result.messages.length > 0 || result.denied.length > 0 ? await vscode.window.showWarningMessage(message, ...actions) : shouldOpen ? undefined : await vscode.window.showInformationMessage(message, ...actions);
  if (choice === vscode.l10n.t('Show problems')) await vscode.commands.executeCommand('workbench.actions.view.problems');
  if (choice === vscode.l10n.t('Open') || (choice === undefined && shouldOpen && result.messages.length === 0 && result.denied.length === 0)) await openOutput(target, info);
}

async function outputLocation(uri: vscode.Uri, info: FormatInfo, cfg: vscode.WorkspaceConfiguration): Promise<vscode.Uri | undefined> {
  const name = path.basename(uri.fsPath).replace(/\.[^.]+$/, '') + info.extension;
  const configured = cfg.get<string>('export.outputDirectory', '').trim();
  const dir = configured ? (isAbsoluteFsPath(configured) ? configured : path.resolve(path.dirname(uri.fsPath), configured)) : path.dirname(uri.fsPath);
  const suggested = vscode.Uri.file(path.join(dir, name));
  if (!cfg.get<boolean>('export.askOutputLocation', true)) {
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
    return suggested;
  }
  return vscode.window.showSaveDialog({ defaultUri: suggested, title: vscode.l10n.t('Save as'), filters: { [info.filter()]: [info.extension.slice(1)] } });
}

async function openOutput(target: vscode.Uri, info: FormatInfo): Promise<void> {
  if (info.openExternal) await vscode.env.openExternal(target);
  else await vscode.window.showTextDocument(target, { preview: true, viewColumn: vscode.ViewColumn.Beside });
}

function publishDiagnostics(uri: vscode.Uri, result: ConversionResponse, diagnostics: vscode.DiagnosticCollection): void {
  const byFile = new Map<string, vscode.Diagnostic[]>();
  for (const m of result.messages) {
    const file = m.arquivo && m.arquivo !== '' ? m.arquivo : uri.fsPath;
    const line = Math.max(0, m.linha - 1);
    const col = Math.max(0, m.coluna - 1);
    const d = new vscode.Diagnostic(new vscode.Range(line, col, line, col + 1), m.texto, m.nivel === 'erro' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning);
    d.source = 'AsciiDocConverter';
    const list = byFile.get(file) ?? [];
    list.push(d);
    byFile.set(file, list);
  }
  for (const denied of result.denied) {
    const d = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), vscode.l10n.t("Resource outside the workspace was denied: {0}. Enable 'tootegaAsciidoc.export.allowOutsideWorkspace' to allow it.", denied), vscode.DiagnosticSeverity.Warning);
    d.source = 'AsciiDocConverter';
    const list = byFile.get(uri.fsPath) ?? [];
    list.push(d);
    byFile.set(uri.fsPath, list);
  }
  diagnostics.delete(uri);
  for (const [file, list] of byFile) diagnostics.set(vscode.Uri.file(file), list);
}
