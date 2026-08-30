import { PHASE_HELP, suggestPhase } from "./workflow.ts";
import type { Library, Novel } from "./types.ts";

export function guideText(library: Library, novel: Novel | undefined): string {
  if (novel === undefined) {
    return [
      "小说台还没有激活的书。",
      `书库在 ${library.root}。`,
      "先 novel_create 建一本，或让用户点侧栏底部「小说」打开书架新建。",
      "设定（世界观/大纲/人物/史实）只由作者改。你只读不写设定，可写的只有章节。",
    ].join("\n");
  }
  const phase = suggestPhase(novel);
  return [
    `当前书：《${novel.meta.title}》 题材 ${novel.meta.genre || "未填"} 状态 ${novel.meta.status}。`,
    `目录：${novel.meta.path}`,
    `建议阶段：${phase} — ${PHASE_HELP[phase]}`,
    `人物 ${novel.cast.length}，章节 ${novel.chapters.length}，史实 ${novel.facts.length}。`,
    "系统提示里已有时间线、背景故事、人物基础设定（姓名/年龄/性格）。大纲和史实库不在系统提示里。",
    "工作流：先 novel_read_outline 对照目标，再读已写内容（眼前稿纸），再按情节决定是否 novel_read_character（默认 basic）。",
    "复杂生平/抉择用 novel_read_character layer=complex，仅在作者点名或情节真正需要时。史实核对用 novel_read_facts。",
    "用户说续写时先在可见回复里写出下一章，再 novel_commit_chapter。不要改设定文件。",
  ].join("\n");
}
