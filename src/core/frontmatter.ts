export function slugify(title: string): string {
  const ascii = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii === "" ? `novel-${Date.now()}` : ascii;
}

export function fileStem(title: string, prefix = ""): string {
  const body = slugify(title);
  return prefix === "" ? body : `${prefix}-${body}`;
}

export function parseFrontMatter(raw: string): { data: Record<string, string | boolean | number>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (match === null) return { data: {}, body: raw.trim() };
  const block = match[1] ?? "";
  const rest = match[2] ?? "";
  const data: Record<string, string | boolean | number> = {};
  for (const line of block.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (value === "true" || value === "false") data[key] = value === "true";
    else if (/^-?\d+$/.test(value)) data[key] = Number(value);
    else data[key] = value.replace(/^["']|["']$/g, "");
  }
  return { data, body: rest.trim() };
}

export function headingTitle(raw: string, fallback: string): string {
  const line = raw.split("\n").find((row) => /^#\s+/.test(row));
  return line === undefined ? fallback : line.replace(/^#\s+/, "").trim();
}

export function dumpFrontMatter(data: Record<string, string | boolean | number>, body: string): string {
  const lines = Object.entries(data).map(([key, value]) => `${key}: ${String(value)}`);
  return `---\n${lines.join("\n")}\n---\n\n${body.trim()}\n`;
}
