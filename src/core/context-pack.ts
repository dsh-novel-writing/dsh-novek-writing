import { readFile } from "node:fs/promises";

import type { ContextPack, Novel } from "./types.ts";
import { estimateTokens } from "./stats.ts";

const EXCERPT = 400;
const DEFAULT_BUDGET = 8000;
const PREV_CHAPTERS = 2;

export interface ContextPackOptions {
  budget?: number;
  previousChapters?: number;
}

export async function assembleContextPack(
  novel: Novel,
  studioPrompt: string,
  options: ContextPackOptions = {},
): Promise<ContextPack> {
  const budget = options.budget ?? DEFAULT_BUDGET;
  const previousLimit = options.previousChapters ?? PREV_CHAPTERS;
  const truncated: string[] = [];
  const writingPrompt = novel.writingPrompt.trim() === "" ? studioPrompt : novel.writingPrompt;
  const outline = novel.outline === undefined
    ? ""
    : await readFile(novel.outline.path, "utf8").then((text) => text.trim()).catch(() => "");
  const characters: ContextPack["characters"] = novel.cast.map((card) => ({
    title: card.name,
    path: card.basicPath,
    excerpt: card.basic.slice(0, EXCERPT),
  }));
  const previousChapters: ContextPack["previousChapters"] = [];
  const recent = novel.chapters.slice(-previousLimit);
  for (const file of recent) {
    const text = await readFile(file.path, "utf8");
    previousChapters.push({ title: file.title, path: file.path, text });
  }
  const notes = novel.notes.map((file) => ({ title: file.title, path: file.path }));
  let pack: ContextPack = {
    title: novel.meta.title,
    genre: novel.meta.genre,
    writingPrompt,
    premise: novel.meta.premise.slice(0, 800),
    outline: outline.slice(0, 1200),
    characters,
    previousChapters,
    notes,
    truncated,
  };
  while (estimateTokens(JSON.stringify(pack)) > budget && pack.previousChapters.length > 0) {
    const dropped = pack.previousChapters.shift();
    if (dropped !== undefined) truncated.push(`dropped previous chapter ${dropped.title}`);
    pack = { ...pack, previousChapters: pack.previousChapters, truncated: [...truncated] };
  }
  if (estimateTokens(JSON.stringify(pack)) > budget) {
    pack = {
      ...pack,
      characters: pack.characters.map((item) => ({ ...item, excerpt: item.excerpt.slice(0, 180) })),
      truncated: [...pack.truncated, "shortened character excerpts"],
    };
  }
  return pack;
}

export function renderContextPack(pack: ContextPack): string {
  const lines = [
    `# 写章上下文包：《${pack.title}》`,
    pack.genre === "" ? undefined : `题材：${pack.genre}`,
    pack.writingPrompt === "" ? undefined : `创作提示词：\n${pack.writingPrompt}`,
    `前提：\n${pack.premise || "（空）"}`,
    pack.outline === "" ? undefined : `大纲摘录：\n${pack.outline}`,
    "人物摘录（不是全文）：",
    ...pack.characters.map((item) => `- ${item.title} @ ${item.path}\n${item.excerpt}`),
    "最近章节（按需，已裁剪预算）：",
    ...pack.previousChapters.map((item) => `- ${item.title} @ ${item.path}\n${item.text}`),
    "笔记路径（不要默认读全文）：",
    ...pack.notes.map((item) => `- ${item.title} — ${item.path}`),
    pack.truncated.length === 0 ? undefined : `裁剪记录：${pack.truncated.join("；")}`,
    "写完后调用 novel_commit_chapter 把正文写入章节文件。",
  ];
  return lines.filter((row): row is string => row !== undefined).join("\n\n");
}
