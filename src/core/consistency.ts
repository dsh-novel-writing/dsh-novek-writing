import type { Novel, ValidationIssue } from "./types.ts";

const NAME_SPLIT = /[、,，/／|]/;

export function namesFromCharacterFiles(novel: Novel): string[] {
  const names = new Set<string>();
  for (const card of novel.cast) {
    const stem = card.name.replace(/[（(].*$/, "").trim();
    if (stem.length >= 2) names.add(stem);
  }
  for (const file of novel.characters) {
    const stem = file.title.replace(/[（(].*$/, "").trim();
    if (stem.length >= 2) names.add(stem);
    for (const part of stem.split(NAME_SPLIT)) {
      const piece = part.trim();
      if (piece.length >= 2) names.add(piece);
    }
  }
  return [...names];
}

export function unusedCharacters(novel: Novel, texts: Map<string, string>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const chapters = novel.chapters.map((file) => texts.get(file.path) ?? "").join("\n");
  for (const name of namesFromCharacterFiles(novel)) {
    if (!chapters.includes(name)) {
      issues.push({
        path: novel.meta.path,
        message: `人物「${name}」有设定文件，但已写章节里从未出现`,
      });
    }
  }
  return issues;
}

export function orphanMentions(novel: Novel, texts: Map<string, string>): ValidationIssue[] {
  const known = new Set(namesFromCharacterFiles(novel));
  if (known.size === 0) return [];
  const issues: ValidationIssue[] = [];
  const pattern = /「([^」]{2,8})」/g;
  const seen = new Set<string>();
  for (const file of novel.chapters) {
    const text = texts.get(file.path) ?? "";
    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1] ?? "";
      if (seen.has(name) || known.has(name) || /[。，、]/.test(name)) continue;
      if (name.length >= 2 && name.length <= 4 && !/[的了是在]/.test(name)) {
        seen.add(name);
        issues.push({
          path: file.path,
          message: `对话里出现「${name}」，书库里没有对应人物文件`,
        });
      }
    }
  }
  return issues;
}
