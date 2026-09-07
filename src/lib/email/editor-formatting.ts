export type TextSelection = { text: string; start: number; end: number };
function hasItalicWrapper(value: string) {
  return value.startsWith("*") && value.endsWith("*") && value.length > 2 &&
    ((!value.startsWith("**") && !value.endsWith("**")) ||
      (value.startsWith("***") && value.endsWith("***") && !value.startsWith("****")));
}

/** Toggle italics without changing the rest of the draft, newlines or list markers. */
export function toggleItalicSelection(text: string, start: number, end: number): TextSelection {
  start = Math.max(0, Math.min(text.length, start));
  end = Math.max(start, Math.min(text.length, end));
  if (start === end) {
    const placeholder = "italic text";
    return { text: text.slice(0, start) + "*" + placeholder + "*" + text.slice(end),
      start: start + 1, end: start + 1 + placeholder.length };
  }
  const selected = text.slice(start, end);
  const leftStars = /*+$/.exec(text.slice(0, start))?.[0].length ?? 0;
  const rightStars = /^*+/.exec(text.slice(end))?.[0].length ?? 0;
  if (leftStars % 2 === 1 && rightStars % 2 === 1) {
    return { text: text.slice(0, start - 1) + selected + text.slice(end + 1), start: start - 1, end: end - 1 };
  }
  const lines = selected.split("
");
  const parts = lines.map(line => /^(s*(?:-s+|d+.s+)?)(.*?)(s*)$/.exec(line)!);
  const nonempty = parts.filter(part => part[2]);
  if (!nonempty.length) return { text, start, end };
  const remove = nonempty.every(part => hasItalicWrapper(part[2]));
  const replacement = parts.map(part => {
    if (!part[2]) return part[0];
    return part[1] + (remove ? part[2].slice(1, -1) : "*" + part[2] + "*") + part[3];
  }).join("
");
  return { text: text.slice(0, start) + replacement + text.slice(end), start, end: start + replacement.length };
}
