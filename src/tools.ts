import { defineTool, type ToolDefinition } from "@deepseek-ai/dsh-tools";

import type { NovelStudioService } from "./service.ts";
import type { WorkflowPhase } from "./core/types.ts";

interface ToolsContext {
  tools: { register: (tool: ToolDefinition) => void };
}

function signalOf(exec: { signal: AbortSignal }): AbortSignal {
  return exec.signal;
}

function compactText(title: string, detail: string): Array<{ type: "text"; text: string }> {
  return [{ type: "text", text: `${title}: ${detail}` }];
}

function asJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as never;
}

function present(title: string, rawInput: unknown): { card: "generic"; title: string; kind: "other"; rawInput: unknown } {
  return { card: "generic", title, kind: "other", rawInput };
}

const JSON_VALUE = { type: "json" } as const;

function str(args: Record<string, unknown>, key: string): string | undefined {
  return typeof args[key] === "string" ? args[key] : undefined;
}

function bool(args: Record<string, unknown>, key: string): boolean | undefined {
  return typeof args[key] === "boolean" ? args[key] : undefined;
}

const PHASES = ["premise", "cast", "outline", "draft", "revise", "complete"] as const;

export function registerNovelStudioTools(ctx: ToolsContext, service: NovelStudioService): void {
  ctx.tools.register(defineTool({
    name: "novel_guide",
    description:
      "Self-bootstrap for the novel studio. Call when the user asks what this plugin does, "
      + "how to write the next chapter, or when you are unsure which step comes next. "
      + "Returns the live book, suggested workflow phase, and the write-then-commit protocol.",
    parameters: {},
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => compactText("Guide", String(value).slice(0, 80)),
    },
    presentCall: (args) => present("小说台指引", args),
    execute: async (_args, exec) => asJson({ text: await service.getGuide() }),
  }));

  ctx.tools.register(defineTool({
    name: "novel_list",
    description: "List novels in the Markdown library and show which one is active. Does not read chapter bodies.",
    parameters: {},
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => {
        const snap = value as { novels?: unknown[]; activeSlug?: string | null };
        return compactText("书库", `${snap.novels?.length ?? 0} 本，当前 ${snap.activeSlug ?? "无"}`);
      },
    },
    presentCall: (args) => present("列出小说", args),
    execute: (_args, exec) => service.getSnapshot({}, signalOf(exec)).then(asJson),
  }));

  ctx.tools.register(defineTool({
    name: "novel_create",
    description: "Create a new novel folder (worldview, outline, characters, chapters, facts) and switch to it. Settings files are for the author to fill in.",
    parameters: {
      title: { type: "string", description: "Book title" },
      genre: { type: "string", description: "Genre label, e.g. 玄幻 / 悬疑" },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => compactText("新建", (value as { activeSlug?: string }).activeSlug ?? "ok"),
    },
    presentCall: (args) => present("新建小说", args),
    async execute(args, exec) {
      const title = str(args, "title");
      if (title === undefined || title.trim() === "") throw new Error("title is required");
      return asJson(await service.createNovel({ title, genre: str(args, "genre") }, signalOf(exec)));
    },
  }));

  ctx.tools.register(defineTool({
    name: "novel_switch",
    description: "Activate a novel by slug so prompts and tools target it.",
    parameters: {
      slug: { type: "string", description: "Folder slug under novels/" },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => compactText("切换", (value as { activeSlug?: string }).activeSlug ?? ""),
    },
    presentCall: (args) => present("切换小说", args),
    async execute(args, exec) {
      const slug = str(args, "slug");
      if (slug === undefined) throw new Error("slug is required");
      return asJson(await service.switchNovel({ slug }, signalOf(exec)));
    },
  }));

  ctx.tools.register(defineTool({
    name: "novel_rename",
    description: "Rename a novel's display title in book.md. Does not move the folder.",
    parameters: {
      slug: { type: "string" },
      title: { type: "string" },
    },
    output: {
      schema: JSON_VALUE,
      render: () => compactText("重命名", "saved"),
    },
    presentCall: (args) => present("重命名小说", args),
    async execute(args, exec) {
      const slug = str(args, "slug");
      const title = str(args, "title");
      if (slug === undefined || title === undefined) throw new Error("slug and title are required");
      return asJson(await service.renameNovel({ slug, title }, signalOf(exec)));
    },
  }));

  ctx.tools.register(defineTool({
    name: "novel_delete",
    description: "Delete a novel folder. Irreversible. Only after the user confirms the slug.",
    parameters: {
      slug: { type: "string" },
      confirm: { type: "boolean", description: "Must be true" },
    },
    output: {
      schema: JSON_VALUE,
      render: () => compactText("删除", "removed"),
    },
    presentCall: (args) => present("删除小说", args),
    async execute(args, exec) {
      if (bool(args, "confirm") !== true) throw new Error("confirm=true is required");
      const slug = str(args, "slug");
      if (slug === undefined) throw new Error("slug is required");
      return asJson(await service.deleteNovel({ slug }, signalOf(exec)));
    },
  }));

  ctx.tools.register(defineTool({
    name: "novel_prompt",
    description:
      "Read or save writing prompts. Omit text to read the assembled prompt (paths only, never note/chapter bodies). "
      + "scope=studio saves the library default; scope=book saves novels/<slug>/prompt.md. "
      + "inject=false turns off book prompt injection into system prompt.",
    parameters: {
      scope: { type: "string", description: "read | studio | book" },
      text: { type: "string", description: "Full prompt text to save" },
      slug: { type: "string" },
      inject: { type: "boolean", description: "Whether the active book injects its writing prompt" },
    },
    output: {
      schema: JSON_VALUE,
      render: () => compactText("提示词", "ok"),
    },
    presentCall: (args) => present("创作提示词", args),
    async execute(args, exec) {
      const signal = signalOf(exec);
      const scope = str(args, "scope") ?? "read";
      const text = str(args, "text");
      if (scope === "read" || text === undefined) {
        return asJson({ text: await service.getPromptText(), snapshot: await service.getSnapshot({}, signal) });
      }
      if (scope === "studio") return asJson(await service.setStudioPrompt({ text }, signal));
      const slug = str(args, "slug") ?? (await service.getSnapshot({}, signal)).activeSlug;
      if (slug === null || slug === undefined) throw new Error("no active novel");
      if (typeof args.inject === "boolean") {
        await service.setInjectWritingPrompt({ slug, inject: args.inject }, signal);
      }
      return asJson(await service.saveNovelPrompt({ slug, text }, signal));
    },
  }));

  ctx.tools.register(defineTool({
    name: "novel_write_context",
    description:
      "Build a budgeted context pack for the next chapter: writing prompt, premise, outline excerpt, "
      + "character excerpts, last chapters. Notes are listed as paths only. After writing, call novel_commit_chapter.",
    parameters: {
      slug: { type: "string", description: "Defaults to the active novel" },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => compactText("上下文包", (value as { pack?: { title?: string } }).pack?.title ?? "ok"),
    },
    presentCall: (args) => present("写章上下文", args),
    async execute(args, exec) {
      const snap = await service.getSnapshot({}, signalOf(exec));
      const slug = str(args, "slug") ?? snap.activeSlug;
      if (slug === null || slug === undefined) throw new Error("no active novel");
      return asJson(await service.writeContext({ slug }, signalOf(exec)));
    },
  }));

  ctx.tools.register(defineTool({
    name: "novel_commit_chapter",
    description:
      "Write a finished chapter to disk (create or overwrite). Call this after the chapter body has already appeared in your visible reply so the manuscript can follow along. Extracts [fact:kind|name|value] lines into the ledger.",
    parameters: {
      slug: { type: "string" },
      title: { type: "string" },
      text: { type: "string" },
      path: { type: "string", description: "Existing chapter path to overwrite" },
    },
    output: {
      schema: JSON_VALUE,
      render: () => compactText("落盘", "chapter saved"),
    },
    presentCall: (args) => present("提交章节", args),
    async execute(args, exec) {
      const snap = await service.getSnapshot({}, signalOf(exec));
      const slug = str(args, "slug") ?? snap.activeSlug;
      const title = str(args, "title");
      const text = str(args, "text");
      if (slug === null || slug === undefined || title === undefined || text === undefined) {
        throw new Error("slug, title and text are required");
      }
      const path = str(args, "path");
      return asJson(await service.commitChapter({ slug, title, text, ...(path === undefined ? {} : { path }) }, signalOf(exec)));
    },
  }));

  ctx.tools.register(defineTool({
    name: "novel_asset_create",
    description: "Create a chapter Markdown file. Character, outline, worldview and facts are author-owned — do not create or edit those.",
    parameters: {
      slug: { type: "string" },
      kind: { type: "string", description: "Must be chapter" },
      title: { type: "string" },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => compactText("新建文件", (value as { path?: string }).path ?? ""),
    },
    presentCall: (args) => present("新建设定/章节/笔记", args),
    async execute(args, exec) {
      const snap = await service.getSnapshot({}, signalOf(exec));
      const slug = str(args, "slug") ?? snap.activeSlug;
      const kind = str(args, "kind");
      const title = str(args, "title");
      if (slug === null || slug === undefined || title === undefined) throw new Error("slug and title are required");
      if (kind !== "chapter") throw new Error("agent may only create chapters; settings are author-owned");
      return asJson(await service.createAsset({ slug, kind, title }, signalOf(exec)));
    },
  }));

  ctx.tools.register(defineTool({
    name: "novel_import",
    description: "Import a txt/markdown manuscript: split chapters and create a new novel.",
    parameters: {
      fileName: { type: "string" },
      text: { type: "string" },
      genre: { type: "string" },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => {
        const result = value as { slug?: string; chapters?: number };
        return compactText("导入", `${result.slug ?? ""} ${result.chapters ?? 0} 章`);
      },
    },
    presentCall: (args) => present("导入小说", args),
    async execute(args, exec) {
      const fileName = str(args, "fileName") ?? "imported.txt";
      const text = str(args, "text");
      if (text === undefined) throw new Error("text is required");
      return asJson(await service.importBook({ fileName, text, genre: str(args, "genre") }, signalOf(exec)));
    },
  }));

  ctx.tools.register(defineTool({
    name: "novel_export",
    description: "Export the novel as txt, markdown, or platform-plain (no markdown, 起点/番茄 style).",
    parameters: {
      slug: { type: "string" },
      format: { type: "string", description: "txt | markdown | platform" },
      author: { type: "string" },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => compactText("导出", (value as { format?: string }).format ?? "ok"),
    },
    presentCall: (args) => present("导出小说", args),
    async execute(args, exec) {
      const snap = await service.getSnapshot({}, signalOf(exec));
      const slug = str(args, "slug") ?? snap.activeSlug;
      const format = str(args, "format") ?? "markdown";
      if (slug === null || slug === undefined) throw new Error("no active novel");
      if (format !== "txt" && format !== "markdown" && format !== "platform") throw new Error("bad format");
      return asJson(await service.exportBook({
        slug,
        format,
        ...(str(args, "author") === undefined ? {} : { author: str(args, "author") }),
      }, signalOf(exec)));
    },
  }));

  ctx.tools.register(defineTool({
    name: "novel_diagnose",
    description: "Score chapters for length, dialogue, hooks, opening, and infodumps. Does not rewrite text.",
    parameters: { slug: { type: "string" } },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => compactText("诊断", `分数 ${(value as { score?: number }).score ?? 0}`),
    },
    presentCall: (args) => present("诊断", args),
    async execute(args, exec) {
      const snap = await service.getSnapshot({}, signalOf(exec));
      const slug = str(args, "slug") ?? snap.activeSlug;
      if (slug === null || slug === undefined) throw new Error("no active novel");
      return asJson(await service.diagnoseNovel({ slug }, signalOf(exec)));
    },
  }));

  ctx.tools.register(defineTool({
    name: "novel_polish",
    description: "Scan for machine-prose tics (缓缓/不禁/心中暗想 …). Returns counts, not a rewritten manuscript.",
    parameters: { slug: { type: "string" } },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => compactText("去味", `hits ${(value as { hits?: unknown[] }).hits?.length ?? 0}`),
    },
    presentCall: (args) => present("去味扫描", args),
    async execute(args, exec) {
      const snap = await service.getSnapshot({}, signalOf(exec));
      const slug = str(args, "slug") ?? snap.activeSlug;
      if (slug === null || slug === undefined) throw new Error("no active novel");
      return asJson(await service.polishNovel({ slug }, signalOf(exec)));
    },
  }));

  ctx.tools.register(defineTool({
    name: "novel_validate",
    description: "Structural checks: empty chapters, missing hooks, unused character files, duplicate titles.",
    parameters: { slug: { type: "string" } },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => compactText("校验", `${(value as { issues?: unknown[] }).issues?.length ?? 0} 条`),
    },
    presentCall: (args) => present("校验", args),
    async execute(args, exec) {
      const snap = await service.getSnapshot({}, signalOf(exec));
      const slug = str(args, "slug") ?? snap.activeSlug;
      if (slug === null || slug === undefined) throw new Error("no active novel");
      return asJson(await service.validateNovel({ slug }, signalOf(exec)));
    },
  }));

  ctx.tools.register(defineTool({
    name: "novel_search",
    description: "Search Markdown files in the library. Returns matching lines and paths so you can read only what you need.",
    parameters: {
      query: { type: "string" },
      limit: { type: "number" },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => compactText("搜索", `${Array.isArray(value) ? value.length : 0} 条`),
    },
    presentCall: (args) => present("搜索书库", args),
    async execute(args, exec) {
      const query = str(args, "query");
      if (query === undefined) throw new Error("query is required");
      const limit = typeof args.limit === "number" ? args.limit : 40;
      return asJson(await service.searchLibrary({ query, limit }, signalOf(exec)));
    },
  }));

  ctx.tools.register(defineTool({
    name: "novel_read_outline",
    description:
      "Read the active novel's outline. Call this at the start and end of a chapter to check the chapter against the plan. The outline is not in the system prompt.",
    parameters: { slug: { type: "string" } },
    output: {
      schema: JSON_VALUE,
      render: () => compactText("大纲", "read"),
    },
    presentCall: (args) => present("读大纲", args),
    async execute(args, exec) {
      const snap = await service.getSnapshot({}, signalOf(exec));
      const slug = str(args, "slug") ?? snap.activeSlug;
      if (slug === null || slug === undefined) throw new Error("no active novel");
      return asJson(await service.readOutline({ slug }, signalOf(exec)));
    },
  }));

  ctx.tools.register(defineTool({
    name: "novel_read_character",
    description:
      "Read one character. Default layer=basic (name, age, personality) which is already in the system prompt. "
      + "Use layer=complex only when the author asks or the plot truly needs life history / major choices.",
    parameters: {
      slug: { type: "string" },
      id: { type: "string", description: "Character folder id or name" },
      layer: { type: "string", description: "basic (default) | complex" },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => compactText("人物", (value as { name?: string }).name ?? "ok"),
    },
    presentCall: (args) => present("读人物", args),
    async execute(args, exec) {
      const snap = await service.getSnapshot({}, signalOf(exec));
      const slug = str(args, "slug") ?? snap.activeSlug;
      const id = str(args, "id");
      if (slug === null || slug === undefined || id === undefined) throw new Error("slug and id are required");
      const layer = str(args, "layer") === "complex" ? "complex" : "basic";
      return asJson(await service.readCharacter({ slug, id, layer }, signalOf(exec)));
    },
  }));

  ctx.tools.register(defineTool({
    name: "novel_read_facts",
    description:
      "Read the fact / research library for accuracy. Not injected into the system prompt. Use when a realistic detail must not be invented.",
    parameters: { slug: { type: "string" } },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => compactText("史实库", `${(value as { items?: unknown[] }).items?.length ?? 0} 条`),
    },
    presentCall: (args) => present("读史实库", args),
    async execute(args, exec) {
      const snap = await service.getSnapshot({}, signalOf(exec));
      const slug = str(args, "slug") ?? snap.activeSlug;
      if (slug === null || slug === undefined) throw new Error("no active novel");
      return asJson(await service.readFacts({ slug }, signalOf(exec)));
    },
  }));

  ctx.tools.register(defineTool({
    name: "novel_clone",
    description: "Clone a novel's settings (characters, outline, glossary) into a new book and drop copied chapters.",
    parameters: {
      slug: { type: "string" },
      title: { type: "string" },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => compactText("克隆", (value as { activeSlug?: string }).activeSlug ?? ""),
    },
    presentCall: (args) => present("克隆设定", args),
    async execute(args, exec) {
      const snap = await service.getSnapshot({}, signalOf(exec));
      const slug = str(args, "slug") ?? snap.activeSlug;
      const title = str(args, "title");
      if (slug === null || slug === undefined || title === undefined) throw new Error("slug and title are required");
      return asJson(await service.cloneNovel({ slug, title }, signalOf(exec)));
    },
  }));

  ctx.tools.register(defineTool({
    name: "novel_set_phase",
    description: "Advance the workflow phase (premise → cast → outline → draft → revise → complete). Skipping ahead requires force=true after the user agrees.",
    parameters: {
      slug: { type: "string" },
      phase: { type: "string" },
      force: { type: "boolean" },
    },
    output: {
      schema: JSON_VALUE,
      render: () => compactText("阶段", "updated"),
    },
    presentCall: (args) => present("工作流阶段", args),
    async execute(args, exec) {
      const snap = await service.getSnapshot({}, signalOf(exec));
      const slug = str(args, "slug") ?? snap.activeSlug;
      const phase = str(args, "phase");
      if (slug === null || slug === undefined || phase === undefined) throw new Error("slug and phase are required");
      if (!(PHASES as readonly string[]).includes(phase)) throw new Error("unknown phase");
      return asJson(await service.setPhase({
        slug,
        phase: phase as WorkflowPhase,
        ...(bool(args, "force") === undefined ? {} : { force: bool(args, "force") }),
      }, signalOf(exec)));
    },
  }));

  ctx.tools.register(defineTool({
    name: "novel_fact",
    description: "Upsert a continuity fact (person/item/place/foreshadow/time) into studio/ledger.json and return conflicts.",
    parameters: {
      novel: { type: "string" },
      kind: { type: "string" },
      name: { type: "string" },
      value: { type: "string" },
      chapter: { type: "string" },
    },
    output: {
      schema: JSON_VALUE,
      render: () => compactText("账本", "saved"),
    },
    presentCall: (args) => present("连续性事实", args),
    async execute(args, exec) {
      const novel = str(args, "novel");
      const kind = str(args, "kind");
      const name = str(args, "name");
      const value = str(args, "value");
      const chapter = str(args, "chapter");
      if (novel === undefined || kind === undefined || name === undefined || value === undefined || chapter === undefined) {
        throw new Error("novel, kind, name, value, chapter are required");
      }
      if (kind !== "person" && kind !== "item" && kind !== "place" && kind !== "foreshadow" && kind !== "time") {
        throw new Error("bad kind");
      }
      return asJson(await service.upsertFact({ novel, kind, name, value, chapter }, signalOf(exec)));
    },
  }));

  ctx.tools.register(defineTool({
    name: "novel_timeline",
    description: "Extract time markers (次日/夜里/三月…) from chapter files of the active novel.",
    parameters: { slug: { type: "string" } },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => compactText("时间线", `${Array.isArray(value) ? value.length : 0} 处`),
    },
    presentCall: (args) => present("时间线", args),
    async execute(args, exec) {
      const snap = await service.getSnapshot({}, signalOf(exec));
      const slug = str(args, "slug") ?? snap.activeSlug;
      if (slug === null || slug === undefined) throw new Error("no active novel");
      return asJson(await service.getTimeline({ slug }, signalOf(exec)));
    },
  }));

  ctx.tools.register(defineTool({
    name: "novel_setup",
    description: "Read or change the library root (absolute path or ~/…). Preview by omitting apply, save with apply=true after the user confirms.",
    parameters: {
      libraryRoot: { type: "string" },
      apply: { type: "boolean" },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => compactText("设置", (value as { libraryRoot?: string }).libraryRoot ?? ""),
    },
    presentCall: (args) => present("书库设置", args),
    async execute(args, exec) {
      if (bool(args, "apply") === true) {
        const libraryRoot = str(args, "libraryRoot");
        if (libraryRoot === undefined) throw new Error("libraryRoot is required when apply=true");
        return asJson(await service.setLibraryRoot({ libraryRoot }, signalOf(exec)));
      }
      return asJson(await service.getSettings({}, signalOf(exec)));
    },
  }));
}
