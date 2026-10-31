import type { Strings } from './en';

export const ptBR: Partial<Strings> = {
  loading: 'Carregando o documento…',
  previewTitle: 'Prévia',
  previewEmpty: 'O documento está vazio.',
  previewOf: 'Prévia de {0}',
  documentReadOnly: 'Este documento é somente leitura.',
  errorTitle: 'O editor não conseguiu iniciar',
  errorBody: 'O webview falhou ao renderizar o editor: {0}. Reabra o arquivo (Reabrir com… → Editor Tootega AsciiDoc). Se repetir, ligue tootegaAsciidoc.debugLog e veja o canal de saída "Tootega AsciiDoc".',
  remoteImageBlocked: 'Imagem remota não carregada: tootegaAsciidoc.images.allowRemote está desligado.',
};
