// Minimal edit between two texts: the common prefix and suffix are kept, the middle is replaced. One range,
// one WorkspaceEdit — so the VS Code undo stack, Git decorations and other editors see a small change, not a
// whole-document rewrite. Pure function (unit-tested).

export interface MinimalEdit {
  /** Offset where the replacement starts (in UTF-16 code units of the old text). */
  start: number;
  /** Offset where the replaced region ends in the OLD text. */
  end: number;
  /** Text that replaces old[start, end). */
  text: string;
}

export function minimalEdit(oldText: string, newText: string): MinimalEdit | null {
  if (oldText === newText) return null;
  const max = Math.min(oldText.length, newText.length);
  let prefix = 0;
  while (prefix < max && oldText.charCodeAt(prefix) === newText.charCodeAt(prefix)) prefix++;
  // Do not split a surrogate pair.
  if (prefix > 0 && isHighSurrogate(oldText.charCodeAt(prefix - 1))) prefix--;

  let suffix = 0;
  const maxSuffix = max - prefix;
  while (
    suffix < maxSuffix &&
    oldText.charCodeAt(oldText.length - 1 - suffix) === newText.charCodeAt(newText.length - 1 - suffix)
  )
    suffix++;
  if (suffix > 0 && isLowSurrogate(oldText.charCodeAt(oldText.length - suffix))) suffix--;

  return {
    start: prefix,
    end: oldText.length - suffix,
    text: newText.slice(prefix, newText.length - suffix),
  };
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}
