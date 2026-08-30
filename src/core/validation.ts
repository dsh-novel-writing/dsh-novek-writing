import { orphanMentions, unusedCharacters } from "./consistency.ts";
import { hasChapterHook } from "./diagnose.ts";
import { chapterStats } from "./stats.ts";
import type { Novel, ValidationIssue } from "./types.ts";

export function validateNovel(novel: Novel, texts: Map<string, string>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (novel.meta.title.trim() === "") {
    issues.push({ path: novel.meta.path, message: "书名是空的" });
  }
  if (novel.meta.premise.trim().length < 12) {
    issues.push({ path: `${novel.meta.path}/book.md`, message: "前提过短，模型很难抓住这本书" });
  }
  if (novel.characters.length === 0 && novel.meta.phase !== "premise") {
    issues.push({ path: novel.meta.path, message: "进入人设之后的阶段，但还没有人物文件" });
  }
  for (const file of novel.chapters) {
    const text = texts.get(file.path) ?? "";
    const stats = chapterStats(text);
    if (stats.chars === 0) issues.push({ path: file.path, message: "章节是空的" });
    if (stats.chars < novel.meta.chapterTargetMin / 2) {
      issues.push({ path: file.path, message: `字数过短（${stats.chars}）` });
    }
    if (!hasChapterHook(text) && stats.chars > 400) {
      issues.push({ path: file.path, message: "缺少章末钩子" });
    }
  }
  const names = novel.chapters.map((file) => file.title);
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) issues.push({ path: novel.meta.path, message: `重复章节标题：${name}` });
    seen.add(name);
  }
  issues.push(...unusedCharacters(novel, texts));
  issues.push(...orphanMentions(novel, texts));
  return issues;
}
