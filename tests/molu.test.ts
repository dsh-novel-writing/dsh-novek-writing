import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createNovel, loadLibrary } from "../src/core/library.ts";
import { createMoluBook } from "../src/molu/empty.ts";
import { htmlToPlain, plainToHtml } from "../src/molu/html.ts";
import { getMoluLibraryView, saveMoluLibraryView } from "../src/molu/ops.ts";
import { sanitizeBooks } from "../src/molu/sanitize.ts";
import { MOLU_HTML } from "../src/client/molu/markup.ts";

const fixtureRoot = fileURLToPath(new URL("../fixtures/library", import.meta.url));

describe("molu sanitize", () => {
  it("keeps all eleven workbench modules in the overlay markup", () => {
    for (const module of [
      "chapters", "outline", "scenes", "characters", "world", "settings",
      "plot", "timeline", "library", "notes", "materials",
    ]) {
      expect(MOLU_HTML).toContain(`data-module="${module}"`);
    }
    expect(MOLU_HTML).toContain("小说创作工作台");
  });
  it("accepts an empty library and fills module defaults", () => {
    expect(sanitizeBooks([])).toEqual([]);
    const books = sanitizeBooks([{
      id: "b1",
      project: { name: "试作", genre: "悬疑" },
      volumes: [{ id: "v1", title: "卷一", chapters: [{ id: "c1", title: "第一章", body: "<p>hello</p>" }] }],
    }]);
    expect(books).toHaveLength(1);
    const book = books![0]!;
    expect(book.project.name).toBe("试作");
    expect(book.volumes[0]?.chapters[0]?.body).toBe("<p>hello</p>");
    expect(book.settingsGroups).toEqual([]);
    expect(book.scenes).toEqual([]);
    expect(book.relations.nodes).toEqual([]);
  });

  it("rejects non-arrays", () => {
    expect(sanitizeBooks(null)).toBeUndefined();
    expect(sanitizeBooks({})).toBeUndefined();
  });
});

describe("molu html", () => {
  it("round-trips prose through html", () => {
    const html = plainToHtml("# 第一章\n\n第一段。\n\n第二段。");
    expect(html).toContain("<p>第一段。</p>");
    expect(htmlToPlain(html)).toContain("第一段。");
  });
});

describe("molu library persist", () => {
  it("hydrates existing markdown novels into the workbench", async () => {
    const root = await mkdtemp(join(tmpdir(), "molu-hydrate-"));
    try {
      await cp(fixtureRoot, root, { recursive: true });
      const view = await getMoluLibraryView(root);
      expect(view.books.map((book) => (book as { project: { name: string } }).project.name).sort()).toEqual([
        "北门问剑",
        "雨城夜话",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("saves the 11-module book and mirrors chapter markdown", async () => {
    const root = await mkdtemp(join(tmpdir(), "molu-"));
    try {
      const book = createMoluBook("镜湖", "奇幻", "jing-hu");
      book.volumes[0]!.chapters.push({
        id: "c1",
        title: "第一章 起雾",
        words: 4,
        status: "写作中",
        edited: "刚刚",
        related: [],
        body: "<p>湖面起雾。</p>",
        note: "",
      });
      book.characters.push({
        id: "p1",
        name: "阿雾",
        role: "主角",
        age: 19,
        identity: "",
        tagline: "",
        desc: "<p>会看天气。</p>",
        relations: [],
      });
      book.scenes.push({
        id: "s1",
        title: "码头",
        type: "开场",
        place: "镜湖",
        chapter: "第一章 起雾",
        chars: ["阿雾"],
        mood: "冷",
        words: 400,
        desc: "晨雾",
      });
      const saved = await saveMoluLibraryView(root, [book], "jing-hu");
      expect(saved.books).toHaveLength(1);
      const chapter = await readFile(join(root, "novels", "jing-hu", "chapters", "001-第一章-起雾.md"), "utf8");
      expect(chapter).toContain("湖面起雾。");
      const library = await loadLibrary(root);
      expect(library.novels.map((novel) => novel.meta.slug)).toEqual(["jing-hu"]);
      expect(library.novels[0]?.chapters[0]?.title).toBe("第一章 起雾");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps novel_create markdown novels visible in 墨庐", async () => {
    const root = await mkdtemp(join(tmpdir(), "molu-create-"));
    try {
      await createNovel(root, "第三本", "悬疑");
      const view = await getMoluLibraryView(root);
      expect(view.books.some((book) => (book as { project: { name: string } }).project.name === "第三本")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
