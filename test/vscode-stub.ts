// Minimal stub of the VS Code API for the host unit tests (vitest runs in node, without the editor
// runtime). It covers only what the code under test touches. Extend it as needed.
export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number,
  ) {}
}

export class Range {
  constructor(
    public readonly start: Position,
    public readonly end: Position,
  ) {}
}

export const window = {
  createOutputChannel: () => ({
    appendLine: (_msg: string) => {},
    dispose: () => {},
  }),
};

export const workspace = {
  getConfiguration: () => ({ get: <T>(_key: string, fallback: T): T => fallback }),
};

export const env = { language: 'en' };

export const l10n = { t: (s: string, ...args: unknown[]) => s.replace(/\{(\d+)\}/g, (_m, i) => String(args[Number(i)])) };
