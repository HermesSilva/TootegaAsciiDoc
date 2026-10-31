import { describe, expect, it } from 'vitest';
import { minimalEdit } from '../src/editor/textDiff';

function apply(oldText: string, edit: ReturnType<typeof minimalEdit>): string {
  if (!edit) return oldText;
  return oldText.slice(0, edit.start) + edit.text + oldText.slice(edit.end);
}

describe('minimalEdit', () => {
  it('returns null when nothing changed', () => {
    expect(minimalEdit('abc', 'abc')).toBeNull();
  });

  it('replaces only the middle', () => {
    const e = minimalEdit('= Title\n\nHello world.\n', '= Title\n\nHello there.\n');
    expect(e).toEqual({ start: 15, end: 20, text: 'there' });
    expect(apply('= Title\n\nHello world.\n', e)).toBe('= Title\n\nHello there.\n');
  });

  it('handles pure insertion and pure deletion', () => {
    expect(minimalEdit('ab', 'aXb')).toEqual({ start: 1, end: 1, text: 'X' });
    expect(minimalEdit('aXb', 'ab')).toEqual({ start: 1, end: 2, text: '' });
  });

  it('handles insertion at the end and at the start', () => {
    expect(minimalEdit('abc', 'abcd')).toEqual({ start: 3, end: 3, text: 'd' });
    expect(minimalEdit('abc', 'zabc')).toEqual({ start: 0, end: 0, text: 'z' });
  });

  it('handles repeated characters without over-matching the suffix', () => {
    const e = minimalEdit('aaa', 'aaaa');
    expect(apply('aaa', e)).toBe('aaaa');
  });

  it('does not split surrogate pairs', () => {
    const oldText = 'x😀y';
    const newText = 'x😁y';
    const e = minimalEdit(oldText, newText)!;
    expect(apply(oldText, e)).toBe(newText);
    expect(e.start).toBe(1);
    expect(e.end).toBe(3);
  });

  it('round-trips random edits', () => {
    const alphabet = 'ab\n= *_';
    let seed = 42;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 200; i++) {
      const a = Array.from({ length: Math.floor(rnd() * 30) }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join('');
      const b = Array.from({ length: Math.floor(rnd() * 30) }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join('');
      expect(apply(a, minimalEdit(a, b))).toBe(b);
    }
  });
});
