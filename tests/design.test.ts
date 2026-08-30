import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { agentMayWrite, isCanonPath } from "../src/core/canon.ts";
import { jsonSafe } from "../src/core/json.ts";
import {
  createAsset,
  createNovel,
  loadLibrary,
  readCharacterLayer,
} from "../src/core/library.ts";
import { wrapSelection, parseInline, markdownToHtml } from "../src/core/markdown.ts";
import { assemblePrompt } from "../src/core/prompt.ts";
import { snapshotSchema } from "../src/schemas.ts";
import { activeNovel } from "../src/core/library.ts";

const fixtureRoot = fileURLToPath(new URL("../fixtures/library", import.meta.url));

describe("Design.md v0.1 prompt contract", () => {
  it("injects timeline, background, and character basics, never facts/outline/complex/notes", async () => {
    const library = await loadLibrary(fixtureRoot);
    const novel = activeNovel(library)!;
    const sections = assemblePrompt(library);
    expect(sections.worldview).toContain("WORLDVIEW_TIMELINE_NORTH_GATE");
    expect(sections.worldview).toContain("WORLDVIEW_BACKGROUND_NORTH_GATE");
    expect(sections.worldview).toContain("姓名：林远");
    expect(sections.worldview).toContain("性格：冷硬");
    expect(sections.catalog).toContain(novel.outline.path);
    expect(sections.catalog).toContain(novel.facts[0]!.path);
    expect(sections.catalog).toContain(novel.cast[0]!.complexPath);
    expect(sections.combined).not.toContain("SECRET_CHARACTER_BODY_LIN_YUAN");
    expect(sections.combined).not.toContain("OUTLINE_SECRET_NORTH_GATE");
    expect(sections.combined).not.toContain("FACT_SECRET_NORTH_GATE");
    expect(sections.combined).not.toContain("SECRET_NOTE_BODY_MARKET");
    expect(sections.combined).not.toContain("SECRET_CHAPTER_BODY_OPENING");
    expect(snapshotSchema.parse(jsonSafe({
      root: library.root,
      studioPrompt: library.studioPrompt,
      activeSlug: library.state.activeSlug,
      novels: library.novels,
      revision: library.revision,
    })).novels[0]?.cast[0]?.basic).toContain("林远");
  });

  it("keeps rain-city complex body out of the prompt when that book is active", async () => {
    const library = await loadLibrary(fixtureRoot);
    library.state.activeSlug = "rain-city";
    const sections = assemblePrompt(library);
    expect(sections.writing).toBe("");
    expect(sections.worldview).toContain("姓名：陈青");
    expect(sections.combined).not.toContain("SECRET_CHARACTER_BODY_CHEN_QING");
    expect(sections.combined).not.toContain("SECRET_NOTE_BODY_TIMELINE");
  });
});

describe("Design.md v0.1 agent read/write", () => {
  it("lets the agent write chapters only", async () => {
    const root = await mkdtemp(join(tmpdir(), "novel-design-"));
    try {
      const created = await createNovel(root, "试写", "悬疑");
      const chapter = await createAsset(root, created.slug, "chapter", "第1章");
      const timeline = join(root, "novels", created.slug, "worldview", "timeline.md");
      expect(agentMayWrite(root, chapter)).toBe(true);
      expect(agentMayWrite(root, timeline)).toBe(false);
      expect(isCanonPath(root, timeline)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("defaults character reads to basic and keeps complex behind an explicit layer", async () => {
    const basic = await readCharacterLayer(fixtureRoot, "north-gate", "lin-yuan", "basic");
    const complex = await readCharacterLayer(fixtureRoot, "north-gate", "林远", "complex");
    expect(basic.text).toContain("姓名：林远");
    expect(basic.text).not.toContain("SECRET_CHARACTER_BODY_LIN_YUAN");
    expect(complex.text).toContain("SECRET_CHARACTER_BODY_LIN_YUAN");
  });

  it("creates a book with worldview, outline, and split character files", async () => {
    const root = await mkdtemp(join(tmpdir(), "novel-new-"));
    try {
      const created = await createNovel(root, "第三本书", "悬疑");
      const timeline = await readFile(join(root, "novels", created.slug, "worldview", "timeline.md"), "utf8");
      expect(timeline).toContain("时间线");
      const path = await createAsset(root, created.slug, "character", "阿棠");
      expect(path.endsWith("basic.md")).toBe(true);
      expect(await readFile(path, "utf8")).toContain("姓名：阿棠");
      const complex = await readFile(join(root, "novels", created.slug, "characters", "阿棠", "complex.md"), "utf8");
      expect(complex).toContain("生平");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("still loads a flat legacy character file as basic", async () => {
    const root = await mkdtemp(join(tmpdir(), "novel-flat-"));
    try {
      const created = await createNovel(root, "旧书");
      const flat = join(root, "novels", created.slug, "characters", "old-name.md");
      await writeFile(flat, "# 旧人\n\n姓名：旧人\n性格：寡言\n");
      const library = await loadLibrary(root);
      const novel = library.novels[0]!;
      expect(novel.cast[0]?.basic).toContain("寡言");
      expect(assemblePrompt(library).worldview).toContain("寡言");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("manuscript helpers", () => {
  it("wraps bold and renders imported images", () => {
    expect(wrapSelection("hello", 0, 5, "**")).toBe("**hello**");
    const nodes = parseInline("见 ![井](data:image/png;base64,xx)");
    expect(nodes.some((node) => node.kind === "img")).toBe(true);
    expect(markdownToHtml("# 题\n\n一段。")).toContain("<h1>");
  });
});
