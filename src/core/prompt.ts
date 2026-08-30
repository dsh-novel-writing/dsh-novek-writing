import { namesFromCharacterFiles } from "./consistency.ts";
import { activeNovel } from "./library.ts";
import type { Library, Novel, PromptSections } from "./types.ts";

export const OPEN_PAGE_CHARS = 1200;

function listBlock(label: string, files: Novel["characters"], empty: string): string {
  if (files.length === 0) return `${label}\n- ${empty}`;
  return `${label}\n${files.map((file) => `- ${file.title} — ${file.path}`).join("\n")}`;
}

function orEmpty(text: string, empty: string): string {
  return text.trim() === "" ? empty : text.trim();
}

export function writingSection(library: Library, novel: Novel | undefined): string {
  if (novel === undefined || novel.meta.injectWritingPrompt === false) return "";
  const text = novel.writingPrompt.trim() === "" ? library.studioPrompt : novel.writingPrompt;
  if (text.trim() === "") return "";
  return `## 小说创作提示词\n${text.trim()}`;
}

export function worldviewSection(novel: Novel | undefined): string {
  if (novel === undefined) return "";
  const basics = novel.cast.length === 0
    ? "（还没有人物基础设定）"
    : novel.cast.map((card) => `### ${card.name}\n${orEmpty(card.basic, "（空）")}`).join("\n\n");
  return [
    "## 世界观（情节至少须符合）",
    "只以下面的时间线和背景故事为准。史实库不在系统提示里，需要核对现实细节时再读。",
    "### 时间线",
    orEmpty(novel.worldview.timeline, "（尚未填写）"),
    "### 背景故事",
    orEmpty(novel.worldview.background, "（尚未填写）"),
    "## 人物基础设定（每次创作都要参考）",
    "默认只要姓名、年龄、性格。生平、重大转折与抉择属于复杂设定，没有作者明确要求不要去读。",
    basics,
  ].join("\n");
}

export function catalogSection(library: Library, novel: Novel | undefined): string {
  if (novel === undefined) {
    return [
      "## 当前小说",
      `书库目录：${library.root}`,
      "当前没有激活的小说。用 novel_create 新建，或 novel_switch 选择已有作品。",
      "设定文件只能由作者增删改。你只读不写设定，可写的只有章节正文。",
    ].join("\n");
  }
  const complexPaths = novel.cast.map((card) => `- ${card.name} 复杂设定 — ${card.complexPath}`);
  return [
    "## 当前小说",
    `书名：${novel.meta.title}`,
    `题材：${novel.meta.genre || "（未填）"}`,
    `状态：${novel.meta.status} / 阶段：${novel.meta.phase}`,
    `目录：${novel.meta.path}`,
    `书库：${library.root}`,
    novel.outline.path === "" ? "大纲：（还没有大纲文件）" : `大纲（对照目标用，不在系统提示正文里）：${novel.outline.path}`,
    listBlock("史实库 / 资料库（准确度参考，不默认注入）：", novel.facts, "（还没有史实条目）"),
    complexPaths.length === 0
      ? "人物复杂设定：（还没有）"
      : `人物复杂设定（无必要不要读）：\n${complexPaths.join("\n")}`,
    listBlock("已写章节（路径索引；眼前只摊开最近一章末尾）：", novel.chapters, "（还没有章节）"),
    listBlock("笔记（仅在用户要求时读取）：", novel.notes, "（还没有笔记）"),
    "工作流：先 novel_read_outline 对照本章目标，再读已写内容（眼前稿纸 + 需要时的更早章节），再按情节决定是否 novel_read_character（默认 layer=basic；复杂设定要作者点名）。",
    "设定只读：novel_read_outline / novel_read_character / novel_read_facts。不要改世界观、大纲、人物或史实文件。",
    "切换作品：novel_switch；新建：novel_create。用户说续写时先在回复里写出下一章正文（从标题开始），再 novel_commit_chapter。",
  ].join("\n");
}

export function pageTail(text: string, limit = OPEN_PAGE_CHARS): string {
  const trimmed = text.trimEnd();
  if (trimmed.length <= limit) return trimmed;
  return trimmed.slice(-limit);
}

export function openPageSection(novel: Novel | undefined): string {
  if (novel === undefined) return "";
  const names = namesFromCharacterFiles(novel);
  const cast = names.length === 0 ? "（还没有人物文件）" : names.join("、");
  if (novel.openPage === undefined) {
    return [
      "## 眼前的稿纸",
      `你正准备写《${novel.meta.title}》。稿纸还是空白的。`,
      `在场人物：${cast}`,
      "用户说开始写 / 第一章 / 续写时：先 novel_read_outline，再在回复里写出第1章正文（Markdown，从标题开始），写完立刻 novel_commit_chapter。",
    ].join("\n");
  }
  const page = novel.openPage;
  return [
    "## 眼前的稿纸",
    `你正写《${novel.meta.title}》。已经落盘 ${page.chapterCount} 章，摊开的是第 ${page.chapterIndex} 章《${page.title}》。`,
    "下面是这一页的末尾——相当于纸笔写作时眼睛看着的那一页。更早的章节不要默认读全文。",
    `在场人物：${cast}`,
    "---",
    page.tail,
    "---",
    "用户说「续写 / 下一章 / 接着写」时：先对照大纲，再在回复里写出下一章全文（从 `# 第N章` 标题开始），让用户在稿纸上看到正文往下长；写完立刻 novel_commit_chapter。可见正文里不要写 [fact:] 行。",
  ].join("\n");
}

export function assemblePrompt(library: Library): PromptSections {
  const novel = activeNovel(library);
  const writing = writingSection(library, novel);
  const worldview = worldviewSection(novel);
  const catalog = catalogSection(library, novel);
  const openPage = openPageSection(novel);
  return {
    writing,
    worldview,
    catalog,
    openPage,
    combined: [writing, worldview, catalog, openPage].filter((part) => part !== "").join("\n\n"),
  };
}

export function continueInstruction(novel: {
  meta: { title: string };
  openPage?: { title: string; chapterIndex: number };
}): string {
  if (novel.openPage === undefined) return `开始写《${novel.meta.title}》的第1章。`;
  return `续写《${novel.meta.title}》的下一章。`;
}
