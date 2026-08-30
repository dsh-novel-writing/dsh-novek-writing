import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseOutlineBeats } from "../src/core/beats.ts";
import { namesFromCharacterFiles } from "../src/core/consistency.ts";
import { assembleContextPack, renderContextPack } from "../src/core/context-pack.ts";
import { diagnoseNovel } from "../src/core/diagnose.ts";
import { lineDiff } from "../src/core/diff.ts";
import { exportBook } from "../src/core/export-book.ts";
import { parseBookText } from "../src/core/import-book.ts";
import { activeNovel, createNovel, loadLibrary, switchNovel } from "../src/core/library.ts";
import { parseMarkdownBlocks, stripMarkdown } from "../src/core/markdown.ts";
import { scanPolish } from "../src/core/polish.ts";
import { jsonSafe } from "../src/core/json.ts";
import { assemblePrompt, continueInstruction } from "../src/core/prompt.ts";
import { extractFacts, stripFactLines } from "../src/core/continuity.ts";
import { extractLiveChapter } from "../src/core/live-chapter.ts";
import { snapshotSchema } from "../src/schemas.ts";
import { validateNovel } from "../src/core/validation.ts";
import { phaseBlocked } from "../src/core/workflow.ts";
import { additiveSlots, forbiddenSlots, SLOT_PLAN } from "../src/slots.ts";

const fixtureRoot = fileURLToPath(new URL("../fixtures/library", import.meta.url));

const SECRET_NOTES_AND_CAST = [
  "SECRET_NOTE_BODY_MARKET",
  "SECRET_CHARACTER_BODY_LIN_YUAN",
  "SECRET_NOTE_BODY_TIMELINE",
  "SECRET_CHARACTER_BODY_CHEN_QING",
];

describe("library scan", () => {
  it("loads two novels and activates north-gate", async () => {
    const library = await loadLibrary(fixtureRoot);
    expect(library.novels.map((novel) => novel.meta.slug)).toEqual(["north-gate", "rain-city"]);
    expect(activeNovel(library)?.meta.title).toBe("北门问剑");
    expect(activeNovel(library)?.chapters[0]?.title).toBe("第1章 开篇");
    expect(activeNovel(library)?.openPage?.title).toBe("第2章 守夜");
  });

  it("omits missing outline fields so Typert can serialize the snapshot", async () => {
    const library = await loadLibrary(fixtureRoot);
    for (const novel of library.novels) {
      expect(Object.hasOwn(novel, "outline")).toBe(novel.outline !== undefined);
      expect(Object.hasOwn(novel, "glossary")).toBe(novel.glossary !== undefined);
    }
    const snapshot = jsonSafe({
      root: library.root,
      studioPrompt: library.studioPrompt,
      activeSlug: library.state.activeSlug,
      novels: library.novels,
      revision: library.revision,
    });
    expect(snapshotSchema.parse(snapshot).novels).toHaveLength(2);
    expect(JSON.stringify(snapshot)).not.toContain("undefined");
  });
});

describe("prompt assembly", () => {
  it("injects paths plus the open page, never notes or older chapter bodies", async () => {
    const library = await loadLibrary(fixtureRoot);
    const sections = assemblePrompt(library);
    expect(sections.writing).toContain("BOOK_OWNED_WRITING_PROMPT");
    expect(sections.catalog).toContain("北门问剑");
    expect(sections.catalog).toContain(activeNovel(library)!.chapters[0]!.path);
    expect(sections.catalog).toContain(activeNovel(library)!.notes[0]!.path);
    expect(sections.catalog).not.toContain("SECRET_CHAPTER_BODY_OPENING");
    expect(sections.openPage).toContain("OPEN_PAGE_TAIL_NORTH_GATE");
    expect(sections.openPage).toContain("林远");
    expect(sections.openPage).not.toContain("SECRET_CHAPTER_BODY_OPENING");
    for (const secret of SECRET_NOTES_AND_CAST) {
      expect(sections.combined).not.toContain(secret);
    }
    expect(sections.combined).not.toContain("SECRET_CHAPTER_BODY_OPENING");
  });

  it("skips writing-prompt injection when the book disables it", async () => {
    const library = await loadLibrary(fixtureRoot);
    library.state.activeSlug = "rain-city";
    const sections = assemblePrompt(library);
    expect(sections.writing).toBe("");
    expect(sections.catalog).toContain("雨城夜话");
    expect(sections.catalog).not.toContain("SECRET_CHAPTER_BODY_NIGHT");
    expect(sections.combined).not.toContain("BOOK_OWNED_WRITING_PROMPT");
    expect(sections.combined).not.toContain("SECRET_NOTE_BODY_TIMELINE");
    expect(sections.combined).not.toContain("SECRET_CHARACTER_BODY_CHEN_QING");
  });
});

describe("hierarchy management", () => {
  it("creates a third novel and switches active slug", async () => {
    const root = await mkdtemp(join(tmpdir(), "novel-studio-"));
    try {
      const created = await createNovel(root, "第三本书", "悬疑");
      expect(created.slug).toBe("第三本书");
      expect(created.library.state.activeSlug).toBe("第三本书");
      await createNovel(root, "第四本");
      const switched = await switchNovel(root, "第三本书");
      expect(switched.state.activeSlug).toBe("第三本书");
      expect(switched.novels).toHaveLength(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("slot plan", () => {
  it("keeps chat and details occupied, overlay and footer additive", () => {
    expect(forbiddenSlots()).toEqual(["conversation", "details"]);
    expect(additiveSlots()).toContain("shell.overlay");
    expect(additiveSlots()).toContain("sidebar.footer.action");
    expect(additiveSlots()).toContain("conversation.input.dock");
    expect(SLOT_PLAN.conversation.action).toBe("do-not-register");
    expect(SLOT_PLAN.sidebar.action).toBe("do-not-replace-by-default");
  });
});

describe("import and export", () => {
  it("splits glued Chinese chapter headings", () => {
    const parsed = parseBookText("第一章 风起\n城里有火。\n第二章 夜雨\n雨停了。\n");
    expect(parsed.chapters.map((chapter) => chapter.title)).toEqual(["第一章 风起", "第二章 夜雨"]);
    expect(parsed.chapters[1]?.content).toContain("雨停了");
  });

  it("exports platform text without markdown markers", () => {
    const text = exportBook(
      [{ title: "开篇", content: "# 开篇\n\n**林远**走了。" }],
      { format: "platform", title: "北门" },
    );
    expect(text).not.toContain("**");
    expect(text).not.toContain("# ");
    expect(text).toContain("林远走了");
  });
});

describe("quality tools", () => {
  it("diagnoses missing hooks and polish tics without copying competitor dicts", async () => {
    const library = await loadLibrary(fixtureRoot);
    const novel = activeNovel(library)!;
    const texts = new Map<string, string>();
    for (const file of novel.chapters) texts.set(file.path, await readFile(file.path, "utf8"));
    const report = diagnoseNovel(novel, texts);
    expect(report.title).toBe("北门问剑");
    expect(report.score).toBeGreaterThanOrEqual(0);
    const polished = scanPolish("x", "他缓缓点了点头，不禁心中暗想。");
    expect(polished.hits.some((hit) => hit.word === "缓缓")).toBe(true);
    expect(polished.hits.some((hit) => hit.word === "不禁")).toBe(true);
  });

  it("validates structure and character presence", async () => {
    const library = await loadLibrary(fixtureRoot);
    const novel = activeNovel(library)!;
    const texts = new Map<string, string>();
    for (const file of [...novel.chapters, ...novel.characters]) {
      texts.set(file.path, await readFile(file.path, "utf8"));
    }
    const issues = validateNovel(novel, texts);
    expect(Array.isArray(issues)).toBe(true);
    expect(namesFromCharacterFiles(novel).length).toBeGreaterThan(0);
  });

  it("blocks skipping workflow phases", async () => {
    const library = await loadLibrary(fixtureRoot);
    const novel = activeNovel(library)!;
    novel.meta.phase = "premise";
    expect(phaseBlocked(novel, "draft")).toMatch(/不能直接跳/);
    expect(phaseBlocked(novel, "cast")).toBeUndefined();
  });
});

describe("context pack", () => {
  it("lists note paths and does not dump SECRET note bodies", async () => {
    const library = await loadLibrary(fixtureRoot);
    const novel = activeNovel(library)!;
    const pack = await assembleContextPack(novel, library.studioPrompt);
    const rendered = renderContextPack(pack);
    expect(rendered).toContain(novel.notes[0]!.path);
    expect(rendered).not.toContain("SECRET_NOTE_BODY_MARKET");
  });
});

describe("live manuscript", () => {
  it("pulls the newest chapter out of a mixed think / tool-call transcript", () => {
    const raw = [
      "Think",
      "先顺着井口写。",
      "# 第3章 井水动了",
      "阿棠还站在井沿。旧章已经落盘，但仍留在对话里。",
      "Tool call",
      "novel_commit_chapter",
      "Context injection",
      "notes/secret.md",
      "# 第4章 灯灭了一下",
      "阿棠把手按在井沿上，听见水声从很深的地方返上来。井口那盏灯晃了一下。",
      "Tool call",
      "novel_commit_chapter",
    ].join("\n");
    const live = extractLiveChapter(raw, 3);
    expect(live).toContain("第4章 灯灭了一下");
    expect(live).toContain("井口那盏灯");
    expect(live).not.toContain("第3章");
    expect(live).not.toContain("Tool call");
    expect(extractLiveChapter(raw, 4)).toBeUndefined();
  });

  it("reads a rendered heading without markdown hashes", () => {
    const raw = [
      "续写从 `# 第4章` 标题开始，让稿纸跟着长出来。写完立刻 novel_commit_chapter。不要先读笔记全文。",
      "Think",
      "planning",
      "第4章 填井",
      "",
      "天没亮，村里就来了人。脚步声从巷口响过来。",
      "Tool call",
      "novel_commit_chapter",
    ].join("\n");
    const live = extractLiveChapter(raw, 3);
    expect(live).toMatch(/^# 第4章 填井/);
    expect(live).toContain("天没亮");
    expect(live).not.toContain("novel_commit");
    expect(live).not.toContain("稿纸跟着");
  });

  it("ignores the chapter already on the open page", () => {
    const raw = "# 第2章 守夜\n\n林远还站在门边，手里的灯已经矮了一截。夜风从北门缝里挤进来。";
    expect(extractLiveChapter(raw, 2)).toBeUndefined();
    expect(extractLiveChapter(raw, 1)).toContain("第2章 守夜");
  });

  it("asks the model to write the next chapter in the visible reply first", async () => {
    const library = await loadLibrary(fixtureRoot);
    const novel = activeNovel(library)!;
    expect(continueInstruction(novel)).toBe("续写《北门问剑》的下一章。");
    expect(continueInstruction(novel)).not.toMatch(/novel_commit/);
    expect(assemblePrompt(library).openPage).toMatch(/回复里/);
  });

  it("stops live follow before ledger fact lines", () => {
    const raw = [
      "第6章 夜路",
      "",
      "阿棠把灯提得更低。",
      "[fact:place|填井|夜里渗水聚成圆圈]",
    ].join("\n");
    const live = extractLiveChapter(raw, 5);
    expect(live).toContain("灯提得更低");
    expect(live).not.toContain("[fact:");
  });
});

describe("helpers", () => {
  it("diffs lines and strips markdown", () => {
    const lines = lineDiff("a\nb\n", "a\nc\n");
    expect(lines.some((line) => line.kind === "del" && line.text === "b")).toBe(true);
    expect(lines.some((line) => line.kind === "add" && line.text === "c")).toBe(true);
    expect(stripMarkdown("**x**")).toBe("x");
    expect(parseOutlineBeats("# 卷一\n钩子").map((beat) => beat.heading)).toEqual(["卷一"]);
    const blocks = parseMarkdownBlocks("# 第2章 灯还亮着\n\n**阿棠**把灯放下。\n\n- 井\n");
    expect(blocks[0]).toMatchObject({ kind: "h", level: 1 });
    expect(blocks.some((block) => block.kind === "p")).toBe(true);
    expect(blocks.some((block) => block.kind === "li")).toBe(true);
  });

  it("detects pacing quiet runs and mixed voice", async () => {
    const { pacingOf } = await import("../src/core/pacing.ts");
    const { detectVoice } = await import("../src/core/pov.ts");
    const quiet = "说明文字".repeat(80);
    expect(pacingOf(quiet, 50).longestQuiet).toBeGreaterThan(0);
    expect(detectVoice("我走进屋。我看见他。我没有说话。我把灯打开。")).toBe("first");
  });

  it("extracts ledger facts and strips them from prose", () => {
    const text = "# 第1章\n\n林远走了。\n[fact:person|林远|左撇子]\n";
    expect(extractFacts("north-gate", "开篇", text)[0]).toMatchObject({ name: "林远", value: "左撇子" });
    expect(stripFactLines(text)).toBe("# 第1章\n\n林远走了。\n");
  });
});
