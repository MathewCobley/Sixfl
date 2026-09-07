type Emphasis = { marker: 1 | 2; closed: boolean; children: Array<string | Emphasis> };
function escape(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/** Small, bounded inline parser. Only balanced *, ** and *** become markup.
 * URLs, unmatched markers, underscores and template tokens remain text.
 * All source text is HTML-escaped; raw HTML is never accepted. */
export function renderEmailInlineFormatting(value: string): string {
  return value.split("\n").map(renderLine).join("\n");
}
function renderLine(value: string): string {
  const root: Emphasis = { marker: 1, closed: false, children: [] };
  const stack = [root];
  const append = (text: string) => {
    const children = stack[stack.length - 1].children;
    const last = children.length - 1;
    if (typeof children[last] === "string") children[last] += text;
    else children.push(text);
  };
  for (let i = 0; i < value.length;) {
    const url = /^(?:https?:\/\/|www\.)[^\s<>]+/i.exec(value.slice(i));
    if (url) {
      // Preserve URL punctuation, while allowing an emphasized sentence to end in a URL.
      const trailing = /\*+$/.exec(url[0])?.[0].length ?? 0;
      let closing = 0;
      if (trailing <= 3) {
        for (let depth = stack.length - 1; depth > 0; depth--) {
          if (closing + stack[depth].marker > trailing) break;
          closing += stack[depth].marker;
        }
      }
      const length = url[0].length - closing;
      append(url[0].slice(0, length));
      i += length;
      continue;
    }
    if (value[i] !== "*") { append(value[i++]); continue; }
    let end = i;
    while (value[end] === "*") end++;
    let remaining = end - i;
    if (remaining > 3) { append(value.slice(i, end)); i = end; continue; }
    const canClose = i > 0 && !/\s/.test(value[i - 1]);
    const canOpen = end < value.length && !/\s/.test(value[end]);
    if (canClose) {
      while (stack.length > 1 && remaining >= stack[stack.length - 1].marker) {
        const node = stack.pop()!;
        node.closed = true;
        remaining -= node.marker;
      }
    }
    if (remaining && canOpen && stack.length < 16) {
      for (const marker of (remaining === 3 ? [2, 1] : [remaining]) as Array<1 | 2>) {
        const node: Emphasis = { marker, closed: false, children: [] };
        stack[stack.length - 1].children.push(node);
        stack.push(node);
      }
    } else if (remaining) append("*".repeat(remaining));
    i = end;
  }
  function render(children: Emphasis["children"]): string {
    return children.map(node => {
      if (typeof node === "string") return escape(node);
      const body = render(node.children);
      if (!node.closed) return "*".repeat(node.marker) + body;
      return node.marker === 2 ? "<strong>" + body + "</strong>" : "<em>" + body + "</em>";
    }).join("");
  }
  return render(root.children);
}
