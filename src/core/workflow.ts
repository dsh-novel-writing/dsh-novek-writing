import type { Novel, WorkflowPhase } from "./types.ts";

const ORDER: WorkflowPhase[] = ["premise", "cast", "outline", "draft", "revise", "complete"];

export function phaseIndex(phase: WorkflowPhase): number {
  return ORDER.indexOf(phase);
}

export function nextPhase(phase: WorkflowPhase): WorkflowPhase {
  return ORDER[Math.min(ORDER.length - 1, phaseIndex(phase) + 1)] ?? "complete";
}

export function suggestPhase(novel: Novel): WorkflowPhase {
  if (novel.meta.premise.trim().length < 20) return "premise";
  if (novel.characters.length === 0) return "cast";
  if (novel.outline === undefined) return "outline";
  if (novel.chapters.length === 0) return "draft";
  if (novel.meta.status === "revising") return "revise";
  if (novel.meta.status === "complete") return "complete";
  return "draft";
}

export function phaseBlocked(novel: Novel, target: WorkflowPhase): string | undefined {
  const current = phaseIndex(novel.meta.phase);
  const want = phaseIndex(target);
  if (want <= current + 1) return undefined;
  return `当前阶段是 ${novel.meta.phase}，不能直接跳到 ${target}。先完成中间文档，或由用户明确放行。`;
}

export const PHASE_HELP: Record<WorkflowPhase, string> = {
  premise: "写清这本书要讲什么、谁来读、核心冲突。产出 book.md 前提。",
  cast: "为主要人物各建一个 characters/*.md，写动机、秘密、关系和外观约束。",
  outline: "写 outline.md：卷结构、主线、反派计划、每章钩子不必一次写完。",
  draft: "按章写 chapters/*.md。每次只推进一章，用上下文包而不是灌全书。",
  revise: "对照诊断和去味报告改已经落盘的章节，改动前先快照。",
  complete: "导出 txt/markdown，检查术语表和笔记里未回收的线索。",
};
