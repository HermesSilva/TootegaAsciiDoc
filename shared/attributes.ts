// Document-attribute helpers shared by the host and the webview (pure, no VS Code API).

const ATTRIBUTE_LINE = /^:([A-Za-z0-9_][A-Za-z0-9_-]*)(!?):\s*(.*?)\s*$/;

/** First value of a document attribute (`:name: value`); `:name!:` unsets it. No include expansion — a hint. */
export function documentAttribute(text: string, name: string): string | undefined {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const m = ATTRIBUTE_LINE.exec(line);
    if (m && m[1] === name) return m[2] === '!' ? undefined : m[3];
  }
  return undefined;
}

/** `:imagesdir:` of the text, with `{docdir}` resolved to the document folder (`.`). Empty when absent. */
export function imagesDirOf(text: string): string {
  return (documentAttribute(text, 'imagesdir') ?? '').replace(/\{docdir\}/g, '.');
}

export function isRemoteTarget(target: string): boolean {
  return /^(?:https?|ftp|file):\/\//i.test(target) || target.startsWith('data:') || target.startsWith('blob:');
}

export function isAbsoluteFsPath(p: string): boolean {
  return /^(?:[A-Za-z]:[\\/]|\/|\\\\)/.test(p);
}

/** Joins URL-ish segments without doubling slashes; `..` segments are kept for the browser to resolve. */
export function joinUrl(base: string, ...parts: string[]): string {
  let out = base.replace(/\/+$/, '');
  for (const part of parts) {
    const clean = part.replace(/^\.\//, '').replace(/^\/+|\/+$/g, '');
    if (clean) out += `/${clean.split('/').map((s) => (s === '..' || s === '.' ? s : encodeURIComponent(decodeURIComponentSafe(s)))).join('/')}`;
  }
  return out;
}

/** Relative POSIX-style path from `fromDir` to `to` (case-insensitive segment comparison, as on Windows). */
export function relativePath(fromDir: string, to: string): string {
  const a = fromDir.replace(/\/+$/, '').split('/').filter(Boolean);
  const b = to.split('/').filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length && a[i].toLowerCase() === b[i].toLowerCase()) i++;
  const up = a.slice(i).map(() => '..');
  return [...up, ...b.slice(i)].join('/');
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
