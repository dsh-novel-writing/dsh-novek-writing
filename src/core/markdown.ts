export function wrapSelection(text: string, start: number, end: number, before: string, after = before): string {
  const inner = text.slice(start, end);
  return `${text.slice(0, start)}${before}${inner}${after}${text.slice(end)}`;
}

export function insertAt(text: string, at: number, snippet: string): string {
  return `${text.slice(0, at)}${snippet}${text.slice(at)}`;
}

export function headingLine(level: 1 | 2 | 3, title: string): string {
  return `${"#".repeat(level)} ${title}`;
}

export function stripMarkdown(text: string): string {
  return text
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1");
}

export function firstParagraph(text: string): string {
  return text.replace(/^---\n[\s\S]*?\n---\n/, "").trim().split(/\n{2,}/)[0] ?? "";
}

export type MdInline =
  | { kind: "text"; value: string }
  | { kind: "strong"; value: string }
  | { kind: "em"; value: string }
  | { kind: "code"; value: string }
  | { kind: "img"; alt: string; src: string };

export type MdBlock =
  | { kind: "h"; level: 1 | 2 | 3 | 4; inlines: MdInline[] }
  | { kind: "p"; inlines: MdInline[] }
  | { kind: "quote"; inlines: MdInline[] }
  | { kind: "li"; inlines: MdInline[] }
  | { kind: "pre"; value: string }
  | { kind: "hr" };

export function parseInline(text: string): MdInline[] {
  const out: MdInline[] = [];
  const re = /(!\[[^\]]*]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let match = re.exec(text);
  while (match !== null) {
    if (match.index > last) out.push({ kind: "text", value: text.slice(last, match.index) });
    const token = match[0];
    const img = /^!\[([^\]]*)]\(([^)]+)\)$/.exec(token);
    if (img !== null) out.push({ kind: "img", alt: img[1] ?? "", src: img[2] ?? "" });
    else if (token.startsWith("**")) out.push({ kind: "strong", value: token.slice(2, -2) });
    else if (token.startsWith("`")) out.push({ kind: "code", value: token.slice(1, -1) });
    else out.push({ kind: "em", value: token.slice(1, -1) });
    last = match.index + token.length;
    match = re.exec(text);
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out.length === 0 ? [{ kind: "text", value: "" }] : out;
}

export function parseMarkdownBlocks(text: string): MdBlock[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.startsWith("```")) {
      const buf: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").startsWith("```")) {
        buf.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      blocks.push({ kind: "pre", value: buf.join("\n") });
      continue;
    }
    if (/^---+$/.test(line.trim()) || line.trim() === "***") {
      blocks.push({ kind: "hr" });
      index += 1;
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading !== null) {
      const marks = heading[1] ?? "#";
      const level = Math.min(4, marks.length) as 1 | 2 | 3 | 4;
      blocks.push({ kind: "h", level, inlines: parseInline(heading[2] ?? "") });
      index += 1;
      continue;
    }
    if (line.startsWith("> ")) {
      blocks.push({ kind: "quote", inlines: parseInline(line.slice(2)) });
      index += 1;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      blocks.push({ kind: "li", inlines: parseInline(line.replace(/^[-*]\s+/, "")) });
      index += 1;
      continue;
    }
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    const para = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index] ?? "";
      if (next.trim() === "" || next.startsWith("#") || next.startsWith("```") || next.startsWith("> ") || /^[-*]\s+/.test(next)) {
        break;
      }
      para.push(next);
      index += 1;
    }
    blocks.push({ kind: "p", inlines: parseInline(para.join("\n")) });
  }
  return blocks;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlinesToHtml(nodes: MdInline[]): string {
  return nodes.map((node) => {
    if (node.kind === "strong") return `<strong>${escapeHtml(node.value)}</strong>`;
    if (node.kind === "em") return `<em>${escapeHtml(node.value)}</em>`;
    if (node.kind === "code") return `<code>${escapeHtml(node.value)}</code>`;
    if (node.kind === "img") {
      return `<img alt="${escapeHtml(node.alt)}" src="${escapeHtml(node.src)}" />`;
    }
    return escapeHtml(node.value).replace(/\n/g, "<br />");
  }).join("");
}

export function markdownToHtml(text: string): string {
  return parseMarkdownBlocks(text).map((block) => {
    if (block.kind === "hr") return "<hr />";
    if (block.kind === "pre") return `<pre>${escapeHtml(block.value)}</pre>`;
    if (block.kind === "h") return `<h${block.level}>${inlinesToHtml(block.inlines)}</h${block.level}>`;
    if (block.kind === "quote") return `<blockquote>${inlinesToHtml(block.inlines)}</blockquote>`;
    if (block.kind === "li") return `<li>${inlinesToHtml(block.inlines)}</li>`;
    return `<p>${inlinesToHtml(block.inlines)}</p>`;
  }).join("\n");
}
