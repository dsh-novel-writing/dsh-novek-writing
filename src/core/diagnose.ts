import { pacingOf } from "./pacing.ts";
import { detectVoice } from "./pov.ts";
import { chapterStats } from "./stats.ts";
import type { DiagnoseIssue, DiagnoseReport, Novel } from "./types.ts";

const HOOK = ["突然", "竟然", "难道", "究竟", "只见", "猛然", "不妙", "危险", "怎么会", "来不及"];
const CONFLICT = ["杀", "怒", "敌", "逃", "追", "仇", "挑战", "打", "死", "战", "恨", "争"];
const STRONG = /[！？!?]/;

function dialogueHeavy(text: string): boolean {
  return /["“「『]/.test(text);
}

function tail(text: string, n: number): string {
  return text.trimEnd().slice(-n);
}

export function hasChapterHook(text: string): boolean {
  const end = tail(text, 80);
  return dialogueHeavy(end)
    || HOOK.some((word) => end.includes(word))
    || CONFLICT.some((word) => end.includes(word))
    || STRONG.test(end);
}

function openingEvent(text: string): boolean {
  const head = text.trimStart().slice(0, 160);
  return /[，。！？]/.test(head) && (CONFLICT.some((word) => head.includes(word)) || dialogueHeavy(head) || /忽然|突然|一声|门口|夜里/.test(head));
}

function infodump(text: string): boolean {
  const blocks = text.split(/\n{2,}/);
  return blocks.some((block) => !dialogueHeavy(block) && block.replace(/\s/g, "").length > 420);
}

export function diagnoseNovel(novel: Novel, texts: Map<string, string>): DiagnoseReport {
  const issues: DiagnoseIssue[] = [];
  let scoreSum = 0;
  let scored = 0;
  novel.chapters.forEach((file, index) => {
    const text = texts.get(file.path) ?? "";
    const stats = chapterStats(text);
    let local = 100;
    const push = (dimension: string, severity: DiagnoseIssue["severity"], message: string, penalty: number): void => {
      issues.push({ chapter: file.title, dimension, severity, message });
      local -= penalty;
    };
    if (stats.chars < novel.meta.chapterTargetMin) {
      push("字数", "warn", `仅 ${stats.chars} 字，低于目标 ${novel.meta.chapterTargetMin}`, 12);
    }
    if (stats.chars > novel.meta.chapterTargetMax) {
      push("字数", "info", `${stats.chars} 字，超过目标 ${novel.meta.chapterTargetMax}`, 4);
    }
    if (stats.dialogue < 0.05) push("对话", "warn", "对话占比过低，场面容易变成说明文", 8);
    if (stats.dialogue > 0.72) push("对话", "info", "对话占比很高，注意动作和空间交代", 4);
    if (!hasChapterHook(text)) push("章末钩子", "warn", "结尾 80 字缺少悬念、对话或强标点", 10);
    if (index === 0 && !openingEvent(text)) push("开场", "warn", "开头缺少事件感", 10);
    if (infodump(text)) push("设定灌输", "warn", "存在大段无对话说明", 8);
    if (index < 3 && !CONFLICT.some((word) => text.includes(word))) {
      push("冲突", "info", "前三章冲突词偏少", 6);
    }
    const pace = pacingOf(text);
    if (pace.longestQuiet >= 3) push("节奏", "warn", `连续 ${pace.longestQuiet} 段几乎没有动作或对话`, 8);
    const voice = detectVoice(text);
    if (voice === "mixed") push("视角", "info", "第一/第三人称标记混杂", 4);
    if (voice === "second") push("视角", "warn", "出现第二人称叙述，确认是有意为之", 6);
    local = Math.max(0, Math.min(100, local));
    scoreSum += local;
    scored += 1;
  });
  return {
    title: novel.meta.title,
    score: scored === 0 ? 0 : Math.round(scoreSum / scored),
    issues,
  };
}
