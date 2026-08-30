import { mkdir, readdir, readFile, rename, rm, stat, unlink } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import { writeAtomic, writeAtomicBytes } from "./atomic.ts";
import { dumpFrontMatter, headingTitle, parseFrontMatter, slugify } from "./frontmatter.ts";
import { libraryLayout, novelLayout } from "./paths.ts";
import { countChars } from "./stats.ts";
import type {
  AssetKind,
  CharacterCard,
  Library,
  Novel,
  NovelFile,
  NovelMeta,
  NovelStatus,
  StudioState,
  WorkflowPhase,
} from "./types.ts";

const STATUSES = new Set<NovelStatus>(["draft", "outlining", "drafting", "revising", "complete"]);
const PHASES = new Set<WorkflowPhase>(["premise", "cast", "outline", "draft", "revise", "complete"]);

async function listMarkdown(dir: string, kind: AssetKind): Promise<NovelFile[]> {
  let names: string[] = [];
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith(".md")).sort();
  } catch {
    return [];
  }
  const files: NovelFile[] = [];
  for (const name of names) {
    const path = join(dir, name);
    const raw = await readFile(path, "utf8");
    files.push({
      id: `${kind}:${name}`,
      kind,
      path,
      title: headingTitle(raw, basename(name, ".md")),
      bytes: Buffer.byteLength(raw),
      chars: countChars(raw),
    });
  }
  return files;
}

async function optionalAsset(path: string, kind: AssetKind): Promise<NovelFile | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    return {
      id: `${kind}:${basename(path)}`,
      kind,
      path,
      title: headingTitle(raw, basename(path, ".md")),
      bytes: Buffer.byteLength(raw),
      chars: countChars(raw),
    };
  } catch {
    return undefined;
  }
}

function stubAsset(path: string, kind: AssetKind, title: string): NovelFile {
  return { id: `${kind}:${basename(path)}`, kind, path, title, bytes: 0, chars: 0 };
}

const COVER_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

async function findCover(dir: string): Promise<string> {
  for (const ext of COVER_EXTS) {
    const candidate = join(dir, `cover${ext}`);
    try {
      await stat(candidate);
      return candidate;
    } catch {
      /* try next */
    }
  }
  return "";
}

async function loadCast(dir: string): Promise<{ files: NovelFile[]; cards: CharacterCard[] }> {
  let entries: Array<{ name: string; dir: boolean }> = [];
  try {
    entries = (await readdir(dir, { withFileTypes: true })).map((entry) => ({
      name: entry.name,
      dir: entry.isDirectory(),
    }));
  } catch {
    return { files: [], cards: [] };
  }
  const files: NovelFile[] = [];
  const cards: CharacterCard[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.dir) {
      const basicPath = join(dir, entry.name, "basic.md");
      const complexPath = join(dir, entry.name, "complex.md");
      const basic = await optionalAsset(basicPath, "character-basic");
      if (basic === undefined) continue;
      files.push({ ...basic, kind: "character" });
      let basicText = "";
      try {
        basicText = (await readFile(basicPath, "utf8")).trim();
      } catch {
        basicText = "";
      }
      const complex = await optionalAsset(complexPath, "character-complex");
      cards.push({
        id: entry.name,
        name: basic.title,
        basicPath,
        complexPath: complex?.path ?? complexPath,
        basic: basicText,
      });
      continue;
    }
    if (!entry.name.endsWith(".md")) continue;
    const path = join(dir, entry.name);
    const raw = await readFile(path, "utf8");
    const file: NovelFile = {
      id: `character:${entry.name}`,
      kind: "character",
      path,
      title: headingTitle(raw, basename(entry.name, ".md")),
      bytes: Buffer.byteLength(raw),
      chars: countChars(raw),
    };
    files.push(file);
    cards.push({
      id: basename(entry.name, ".md"),
      name: file.title,
      basicPath: path,
      complexPath: path,
      basic: raw.trim(),
    });
  }
  return { files, cards };
}

export async function loadState(root: string): Promise<StudioState> {
  try {
    const raw = JSON.parse(await readFile(libraryLayout(root).state, "utf8")) as StudioState;
    return { activeSlug: raw.activeSlug ?? null };
  } catch {
    return { activeSlug: null };
  }
}

export async function saveState(root: string, state: StudioState): Promise<void> {
  await writeAtomic(libraryLayout(root).state, `${JSON.stringify(state, null, 2)}\n`);
}

export async function loadStudioPrompt(root: string): Promise<string> {
  try {
    return (await readFile(libraryLayout(root).studioPrompt, "utf8")).trim();
  } catch {
    return DEFAULT_STUDIO_PROMPT;
  }
}

export const DEFAULT_STUDIO_PROMPT = [
  "你是驻在 DeepSeek Harness 里的小说协作者，只服务当前激活作品。",
  "用用户正在使用的语言写作。",
  "世界观只以时间线和背景故事为准；史实库与大纲不在系统提示里，需要时再读。",
  "人物只默认参考基础设定（姓名、年龄、性格）。生平与重大抉择属于复杂设定，没有作者明确要求不要去读。",
  "设定文件只能由作者增删改，你只读不写。你可写的只有章节正文。",
  "工作流：先读大纲核对目标，再读已写章节，再按情节需要选择人物设定。",
  "用户说续写时：先把下一章完整写在回复里（Markdown，从章节标题开始），让稿纸能看见字往下长；写完立刻 novel_commit_chapter 落盘。",
].join("\n");

function asStatus(value: unknown): NovelStatus {
  return typeof value === "string" && STATUSES.has(value as NovelStatus) ? (value as NovelStatus) : "draft";
}

function asPhase(value: unknown): WorkflowPhase {
  return typeof value === "string" && PHASES.has(value as WorkflowPhase) ? (value as WorkflowPhase) : "premise";
}

function finiteNumber(value: unknown, fallback: number): number {
  const next = Number(value ?? fallback);
  return Number.isFinite(next) ? next : fallback;
}

function clampFontSize(value: number): number {
  const allowed = [14, 16, 18, 20, 22, 24, 28, 32];
  return allowed.reduce((best, size) => Math.abs(size - value) < Math.abs(best - value) ? size : best, 18);
}

async function readText(path: string): Promise<string> {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch {
    return "";
  }
}

export async function loadNovel(root: string, slug: string): Promise<Novel> {
  const layout = novelLayout(root, slug);
  const bookRaw = await readFile(layout.book, "utf8");
  const parsed = parseFrontMatter(bookRaw);
  const chapters = await listMarkdown(layout.chapters, "chapter");
  const bookChars = chapters.reduce((sum, file) => sum + file.chars, 0);
  const coverPath = await findCover(layout.path);
  const meta: NovelMeta = {
    slug,
    title: String(parsed.data.title ?? slug),
    genre: String(parsed.data.genre ?? ""),
    status: asStatus(parsed.data.status),
    injectWritingPrompt: parsed.data.injectWritingPrompt !== false,
    path: layout.path,
    premise: parsed.body,
    phase: asPhase(parsed.data.phase),
    chapterTargetMin: finiteNumber(parsed.data.chapterTargetMin, 2000),
    chapterTargetMax: finiteNumber(parsed.data.chapterTargetMax, 4000),
    coverPath,
    bookChars,
    fontSize: clampFontSize(finiteNumber(parsed.data.fontSize, 18)),
  };
  let writingPrompt = "";
  try {
    writingPrompt = (await readFile(layout.prompt, "utf8")).trim();
  } catch {
    writingPrompt = "";
  }
  const last = chapters[chapters.length - 1];
  let openPage: Novel["openPage"];
  if (last !== undefined) {
    const raw = await readFile(last.path, "utf8");
    openPage = {
      title: last.title,
      path: last.path,
      tail: raw.trimEnd().slice(-1200),
      chapterIndex: chapters.length,
      chapterCount: chapters.length,
    };
  }
  const outline = await optionalAsset(layout.outline, "outline") ?? stubAsset(layout.outline, "outline", "大纲");
  const glossary = await optionalAsset(layout.glossary, "glossary");
  const timeline = await optionalAsset(layout.timeline, "timeline") ?? stubAsset(layout.timeline, "timeline", "时间线");
  const background = await optionalAsset(layout.background, "background") ?? stubAsset(layout.background, "background", "背景故事");
  const castLoaded = await loadCast(layout.characters);
  return {
    meta,
    writingPrompt,
    characters: castLoaded.files,
    chapters,
    notes: await listMarkdown(layout.notes, "note"),
    facts: await listMarkdown(layout.facts, "fact"),
    cast: castLoaded.cards,
    worldview: {
      timeline: await readText(layout.timeline),
      background: await readText(layout.background),
    },
    outline,
    ...(glossary === undefined ? {} : { glossary }),
    timeline,
    background,
    ...(openPage === undefined ? {} : { openPage }),
  };
}

export async function loadLibrary(root: string): Promise<Library> {
  const layout = libraryLayout(root);
  await mkdir(layout.novels, { recursive: true });
  await mkdir(layout.studio, { recursive: true });
  const studioPrompt = await loadStudioPrompt(root);
  const state = await loadState(root);
  let slugs: string[] = [];
  try {
    slugs = (await readdir(layout.novels, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    slugs = [];
  }
  const novels: Novel[] = [];
  for (const slug of slugs) {
    try {
      novels.push(await loadNovel(root, slug));
    } catch {
      // skip broken folders
    }
  }
  return { root, studioPrompt, state, novels, revision: Date.now() };
}

export function activeNovel(library: Library): Novel | undefined {
  const slug = library.state.activeSlug;
  if (slug === null) return library.novels[0];
  return library.novels.find((novel) => novel.meta.slug === slug) ?? library.novels[0];
}

export async function writeBookMeta(novel: Novel): Promise<void> {
  const { meta } = novel;
  const body = dumpFrontMatter({
    title: meta.title,
    genre: meta.genre,
    status: meta.status,
    phase: meta.phase,
    injectWritingPrompt: meta.injectWritingPrompt,
    chapterTargetMin: meta.chapterTargetMin,
    chapterTargetMax: meta.chapterTargetMax,
    fontSize: meta.fontSize,
  }, meta.premise);
  await writeAtomic(join(meta.path, "book.md"), body);
}

export async function createNovel(
  root: string,
  title: string,
  genre = "",
): Promise<{ library: Library; slug: string }> {
  const slug = slugify(title);
  const layout = novelLayout(root, slug);
  await mkdir(layout.characters, { recursive: true });
  await mkdir(layout.chapters, { recursive: true });
  await mkdir(layout.notes, { recursive: true });
  await mkdir(layout.facts, { recursive: true });
  await mkdir(layout.worldview, { recursive: true });
  await writeAtomic(layout.book, dumpFrontMatter({
    title,
    genre,
    status: "draft",
    phase: "premise",
    injectWritingPrompt: true,
    chapterTargetMin: 2000,
    chapterTargetMax: 4000,
    fontSize: 18,
  }, `${title} 的故事还没写前提。`));
  await writeAtomic(layout.timeline, `# 时间线\n\n`);
  await writeAtomic(layout.background, `# 背景故事\n\n`);
  await writeAtomic(layout.outline, `# 大纲\n\n`);
  await saveState(root, { activeSlug: slug });
  return { library: await loadLibrary(root), slug };
}

export async function switchNovel(root: string, slug: string): Promise<Library> {
  const library = await loadLibrary(root);
  if (!library.novels.some((novel) => novel.meta.slug === slug)) {
    throw new Error(`novel not found: ${slug}`);
  }
  await saveState(root, { activeSlug: slug });
  return loadLibrary(root);
}

export async function renameNovel(root: string, slug: string, title: string): Promise<Library> {
  const novel = await loadNovel(root, slug);
  novel.meta.title = title;
  await writeBookMeta(novel);
  return loadLibrary(root);
}

export async function deleteNovel(root: string, slug: string): Promise<Library> {
  const layout = novelLayout(root, slug);
  await rm(layout.path, { recursive: true, force: true });
  const state = await loadState(root);
  if (state.activeSlug === slug) await saveState(root, { activeSlug: null });
  return loadLibrary(root);
}

export async function saveStudioPrompt(root: string, text: string): Promise<void> {
  await writeAtomic(libraryLayout(root).studioPrompt, `${text.trim()}\n`);
}

export async function saveNovelPrompt(root: string, slug: string, text: string): Promise<void> {
  await writeAtomic(novelLayout(root, slug).prompt, `${text.trim()}\n`);
}

export async function readAsset(path: string): Promise<{ title: string; text: string }> {
  const raw = await readFile(path, "utf8");
  return { title: headingTitle(raw, basename(path, ".md")), text: raw };
}

export async function saveAsset(path: string, text: string): Promise<void> {
  await writeAtomic(path, text.endsWith("\n") ? text : `${text}\n`);
}

export async function createAsset(
  root: string,
  slug: string,
  kind: "character" | "chapter" | "note" | "fact",
  title: string,
): Promise<string> {
  const layout = novelLayout(root, slug);
  if (kind === "character") {
    const id = slugify(title);
    const dir = join(layout.characters, id);
    await mkdir(dir, { recursive: true });
    const basic = join(dir, "basic.md");
    await writeAtomic(basic, `# ${title}\n\n姓名：${title}\n年龄：\n性格：\n`);
    await writeAtomic(join(dir, "complex.md"), `# ${title} · 复杂设定\n\n生平：\n\n重大情节转变：\n`);
    return basic;
  }
  const dir = kind === "fact" ? layout.facts : kind === "chapter" ? layout.chapters : layout.notes;
  await mkdir(dir, { recursive: true });
  const prefix = kind === "chapter" ? String((await listMarkdown(dir, kind)).length + 1).padStart(3, "0") : "";
  const name = `${prefix === "" ? slugify(title) : `${prefix}-${slugify(title)}`}.md`;
  const path = join(dir, name);
  await writeAtomic(path, `# ${title}\n\n`);
  return path;
}

export async function deleteAsset(path: string): Promise<void> {
  await rm(path, { force: true });
}

const COVER_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function getCoverBytes(dir: string): Promise<{ mime: string; data: string }> {
  const path = await findCover(dir);
  if (path === "") return { mime: "", data: "" };
  const buf = await readFile(path);
  const mime = COVER_MIME[extname(path).toLowerCase()] ?? "image/jpeg";
  return { mime, data: buf.toString("base64") };
}

export async function setCoverBytes(dir: string, mime: string, data: string): Promise<string> {
  const ext = mime.includes("png") ? ".png" : mime.includes("webp") ? ".webp" : mime.includes("gif") ? ".gif" : ".jpg";
  const dest = join(dir, `cover${ext}`);
  for (const other of COVER_EXTS) {
    const stale = join(dir, `cover${other}`);
    if (stale === dest) continue;
    await unlink(stale).catch(() => undefined);
  }
  await writeAtomicBytes(dest, Buffer.from(data, "base64"));
  return dest;
}

export async function readCharacterLayer(
  root: string,
  slug: string,
  id: string,
  layer: "basic" | "complex",
): Promise<{ id: string; name: string; layer: "basic" | "complex"; path: string; text: string }> {
  const novel = await loadNovel(root, slug);
  const card = novel.cast.find((item) => item.id === id || item.name === id);
  if (card === undefined) throw new Error(`character not found: ${id}`);
  const path = layer === "complex" ? card.complexPath : card.basicPath;
  let text = "";
  try {
    text = await readFile(path, "utf8");
  } catch {
    text = layer === "basic" ? card.basic : "";
  }
  return { id: card.id, name: card.name, layer, path, text };
}

export async function snapshotAsset(root: string, slug: string, path: string): Promise<string> {
  const layout = novelLayout(root, slug);
  await mkdir(layout.versions, { recursive: true });
  const dest = join(layout.versions, `${Date.now()}-${basename(path)}`);
  const raw = await readFile(path, "utf8");
  await writeAtomic(dest, raw);
  return dest;
}

export async function moveNovelFolder(root: string, slug: string, nextSlug: string): Promise<Library> {
  const from = novelLayout(root, slug).path;
  const to = novelLayout(root, nextSlug).path;
  await rename(from, to);
  const state = await loadState(root);
  if (state.activeSlug === slug) await saveState(root, { activeSlug: nextSlug });
  return loadLibrary(root);
}
