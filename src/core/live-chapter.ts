const MARKDOWN_HEADING = /^(#{1,3})\s+(第[0-9一二三四五六七八九十百千]+章(?:\s+\S.*)?|Chapter\s+\d+(?:\s+\S.*)?)$/i;
const PLAIN_HEADING = /^(第[0-9一二三四五六七八九十百千]+章(?:\s+\S.*)?|Chapter\s+\d+(?:\s+\S.*)?)$/i;
const STOP = /^(Tool call|Context injection|Good response|Bad response|Ran for |Running|Deep diving|\[fact:|《.+》 · )/;

export function headingOf(text: string): string {
  for (const row of text.split("\n")) {
    const line = row.trim();
    if (line.startsWith("#")) return line.replace(/^#+\s*/, "").trim();
    if (PLAIN_HEADING.test(line)) return line;
  }
  return "";
}

export function headingChapterIndex(text: string): number | undefined {
  const heading = headingOf(text);
  const match = heading.match(/第\s*([0-9]+)\s*章/) ?? heading.match(/Chapter\s+(\d+)/i);
  if (match === null) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function isChapterStart(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 72) return false;
  if (trimmed.includes("`") || /novel_commit|稿纸跟着|标题开始/.test(trimmed)) return false;
  return MARKDOWN_HEADING.test(trimmed) || PLAIN_HEADING.test(trimmed);
}

export function extractLiveChapter(raw: string, afterChapter = 0): string | undefined {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (isChapterStart(lines[index] ?? "")) start = index;
  }
  if (start < 0) return undefined;
  const body: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (index > start && (STOP.test(trimmed) || trimmed === "Think" || isChapterStart(line))) break;
    body.push(line);
  }
  if (body.length > 0 && !(body[0] ?? "").trim().startsWith("#")) {
    body[0] = `# ${(body[0] ?? "").trim()}`;
  }
  const text = body.join("\n").replace(/[ \t]+\n/g, "\n").trim();
  if (text.length < 16) return undefined;
  const chapter = headingChapterIndex(text);
  if (chapter !== undefined && chapter <= afterChapter) return undefined;
  return text;
}
