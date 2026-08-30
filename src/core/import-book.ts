export interface ParsedChapter {
  title: string;
  content: string;
}

export interface ParsedBook {
  title: string;
  genre: string;
  chapters: ParsedChapter[];
}

const NUM = "(?:\\d{1,4}|[零〇一二三四五六七八九十百千万两]+)";
const UNIT = "[章节回卷部篇集]";
const SPECIAL = "(楔子|序章|序言|引子|前言|后记|尾声|番外|外传|终章|最终章|大结局)";
const SEP = "[ \\u3000:：、.．·\\-—]";

const CN_SEP = new RegExp(`^第\\s*${NUM}\\s*${UNIT}${SEP}+(.+)$`);
const CN_BARE = new RegExp(`^第\\s*${NUM}\\s*${UNIT}$`);
const CN_GLUED = new RegExp(`^第\\s*${NUM}\\s*${UNIT}([^，,。．.！？!?；;：:\\s].*)$`);
const SPEC_SEP = new RegExp(`^${SPECIAL}${SEP}+(.+)$`);
const SPEC_BARE = new RegExp(`^${SPECIAL}$`);
const EN_SEP = /^chapter\s+\d{1,4}\s*[:：.\-—·]\s*(.+)$/i;
const EN_BARE = /^chapter\s+\d{1,4}[.．]?\s*$/i;
const NUM_HEADING = new RegExp(`^(${NUM})\\s*[、.．:：]\\s*(.+)$`);
const MD_HEADING = /^#{1,6}\s+/;
const SENTENCE_END = /[。！？!?；;]$/;

function mdTitle(line: string): string {
  return line.replace(/^#{1,6}\s+/, "").replace(/^\*\*?/, "").replace(/\*\*?$/, "").trim();
}

function isGlued(line: string): boolean {
  if (line.length > 40 || SENTENCE_END.test(line)) return false;
  return CN_GLUED.test(line);
}

type Kind = "heading" | "glued" | "numeric" | "body";

function classify(line: string): { kind: Kind; title: string } {
  const trimmed = line.trim();
  if (trimmed === "") return { kind: "body", title: "" };
  if (MD_HEADING.test(trimmed)) return { kind: "heading", title: mdTitle(trimmed) };
  const cn = CN_SEP.exec(trimmed);
  if (cn) return { kind: "heading", title: `第${trimmed.replace(/^第\s*/, "")}` };
  if (CN_BARE.test(trimmed)) return { kind: "heading", title: trimmed };
  const spec = SPEC_SEP.exec(trimmed) ?? (SPEC_BARE.test(trimmed) ? [trimmed, trimmed] : null);
  if (spec) return { kind: "heading", title: spec[1] ?? trimmed };
  const en = EN_SEP.exec(trimmed);
  if (en) return { kind: "heading", title: en[1] ?? trimmed };
  if (EN_BARE.test(trimmed)) return { kind: "heading", title: trimmed };
  if (isGlued(trimmed)) return { kind: "glued", title: trimmed };
  const num = NUM_HEADING.exec(trimmed);
  if (num && trimmed.length <= 30 && !/^\d/.test(num[2] ?? "")) {
    return { kind: "numeric", title: trimmed };
  }
  return { kind: "body", title: "" };
}

function frontmatterTitle(raw: string): { title?: string; genre?: string; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (match === null) return { body: raw };
  const block = match[1] ?? "";
  const rest = match[2] ?? "";
  const data: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) data[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { title: data.title, genre: data.genre, body: rest };
}

function fallbackChunks(body: string, size = 2500): ParsedChapter[] {
  const compact = body.replace(/\r\n/g, "\n").trim();
  if (compact === "") return [];
  const chapters: ParsedChapter[] = [];
  let rest = compact;
  let index = 1;
  while (rest.length > 0) {
    const slice = rest.slice(0, size);
    const cut = slice.lastIndexOf("\n\n");
    const content = cut > size * 0.4 ? slice.slice(0, cut) : slice;
    chapters.push({ title: `第${index}章`, content: content.trim() });
    rest = rest.slice(content.length).trim();
    index += 1;
  }
  return chapters;
}

export function parseBookText(raw: string, fileName = "imported"): ParsedBook {
  const meta = frontmatterTitle(raw.replace(/^\uFEFF/, ""));
  const lines = meta.body.replace(/\r\n/g, "\n").split("\n");
  const classified = lines.map((line) => ({ line, ...classify(line) }));
  const gluedCount = classified.filter((row) => row.kind === "glued").length;
  const numericCount = classified.filter((row) => row.kind === "numeric").length;
  const headingCount = classified.filter((row) => row.kind === "heading").length;
  const promoteGlued = headingCount === 0 && gluedCount >= 3;
  const promoteNumeric = headingCount === 0 && !promoteGlued && numericCount >= 3;

  const chapters: ParsedChapter[] = [];
  let current: ParsedChapter | undefined;
  const flush = (): void => {
    if (current && current.content.trim() !== "") chapters.push({ ...current, content: current.content.trim() });
  };
  for (const row of classified) {
    const heading = row.kind === "heading"
      || (row.kind === "glued" && promoteGlued)
      || (row.kind === "numeric" && promoteNumeric);
    if (heading) {
      flush();
      current = { title: row.title || row.line.trim(), content: "" };
      continue;
    }
    if (current === undefined) {
      current = { title: "正文", content: row.line };
      continue;
    }
    current.content = current.content === "" ? row.line : `${current.content}\n${row.line}`;
  }
  flush();

  const usable = chapters.filter((chapter) => chapter.content.trim() !== "");
  const result = usable.length > 0 ? usable : fallbackChunks(meta.body);
  const firstLine = lines.map((line) => line.trim()).find((line) => line !== "");
  const title = meta.title
    || (firstLine && firstLine.length <= 40 && !classify(firstLine).kind.includes("body") ? firstLine : undefined)
    || fileName.replace(/\.(txt|md|markdown)$/i, "");
  return { title, genre: meta.genre ?? "", chapters: result };
}
