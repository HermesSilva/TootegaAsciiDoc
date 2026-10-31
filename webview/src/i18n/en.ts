// English base catalogue of the webview's own strings (the engine's strings live in engine-en.ts).
export const en = {
  loading: 'Loading the document…',
  previewTitle: 'Preview',
  previewEmpty: 'The document is empty.',
  previewOf: 'Preview of {0}',
  documentReadOnly: 'This document is read-only.',
  errorTitle: 'The editor could not start',
  errorBody: 'The webview failed while rendering the editor: {0}. Reopen the file (Reopen with… → Tootega AsciiDoc editor). If it repeats, enable tootegaAsciidoc.debugLog and check the "Tootega AsciiDoc" output channel.',
  remoteImageBlocked: 'Remote image not loaded: tootegaAsciidoc.images.allowRemote is off.',
};

export type Strings = typeof en;
