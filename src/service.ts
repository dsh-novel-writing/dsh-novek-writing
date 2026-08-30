import { mkdir, readFile } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";

import type { Context } from "@deepseek-ai/cordis";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

import { cloneNovel } from "./core/clone.ts";
import { agentMayWrite } from "./core/canon.ts";
import { assembleContextPack, renderContextPack } from "./core/context-pack.ts";
import { conflictsFor, extractFacts, loadLedger, stripFactLines, upsertFact, type LedgerFact } from "./core/continuity.ts";
import { diagnoseNovel } from "./core/diagnose.ts";
import { exportBook } from "./core/export-book.ts";
import { GENRES } from "./core/genres.ts";
import { guideText } from "./core/guide.ts";
import { parseBookText } from "./core/import-book.ts";
import {
  activeNovel,
  createAsset,
  createNovel,
  DEFAULT_STUDIO_PROMPT,
  deleteAsset,
  deleteNovel,
  getCoverBytes,
  loadLibrary,
  loadNovel,
  readAsset,
  readCharacterLayer,
  renameNovel,
  saveAsset,
  saveNovelPrompt,
  saveStudioPrompt,
  setCoverBytes,
  snapshotAsset,
  switchNovel,
  writeBookMeta,
} from "./core/library.ts";
import { novelLayout } from "./core/paths.ts";
import { mergePolishReports, scanPolish } from "./core/polish.ts";
import { jsonSafe } from "./core/json.ts";
import { assemblePrompt } from "./core/prompt.ts";
import { listPromptTemplates, savePromptTemplate } from "./core/prompts-library.ts";
import { searchLibrary } from "./core/search.ts";
import { extractTimeline } from "./core/timeline.ts";
import { validateNovel } from "./core/validation.ts";
import { listVersions, restoreVersion } from "./core/versions.ts";
import { phaseBlocked } from "./core/workflow.ts";
import { resolveLibraryRoot, type Config } from "./config.ts";
import type { Library, Novel, WorkflowPhase } from "./core/types.ts";
import {
  ensureMoluBook,
  getMoluLibraryView,
  patchMoluChapter,
  saveMoluLibraryView,
} from "./molu/ops.ts";
import { loadMoluLibraryFile, saveMoluLibraryFile } from "./molu/store.ts";

export const NOVEL_STUDIO_SERVICE = "novelStudio";

function inside(root: string, path: string): boolean {
  if (!isAbsolute(path)) return false;
  const rel = relative(root, path);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

async function textsOf(novel: Novel): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const file of [...novel.chapters, ...novel.characters, ...novel.notes]) {
    try {
      map.set(file.path, await readFile(file.path, "utf8"));
    } catch {
      map.set(file.path, "");
    }
  }
  return map;
}

export class NovelStudioService extends TypertRemoteService {
  libraryRoot: string;
  cache: Library | undefined;

  constructor(ctx: Context, config: Config) {
    super(ctx, NOVEL_STUDIO_SERVICE);
    this.libraryRoot = resolveLibraryRoot(config);
    void this.refresh();
  }

  async refresh(): Promise<Library> {
    await mkdir(this.libraryRoot, { recursive: true });
    this.cache = await loadLibrary(this.libraryRoot);
    if (this.cache.studioPrompt === DEFAULT_STUDIO_PROMPT) {
      await saveStudioPrompt(this.libraryRoot, DEFAULT_STUDIO_PROMPT);
      this.cache = await loadLibrary(this.libraryRoot);
    }
    return this.cache;
  }

  snapshotOf(library: Library) {
    return jsonSafe({
      root: library.root,
      studioPrompt: library.studioPrompt,
      activeSlug: library.state.activeSlug,
      novels: library.novels,
      revision: library.revision,
    });
  }

  async getSnapshot(_request: Record<string, never>, _signal?: AbortSignal) {
    return this.snapshotOf(await this.refresh());
  }

  async getSettings(_request: Record<string, never>, _signal?: AbortSignal) {
    const library = await this.refresh();
    return jsonSafe({
      libraryRoot: library.root,
      studioPrompt: library.studioPrompt,
      genres: [...GENRES],
    });
  }

  async setLibraryRoot(request: { libraryRoot: string }, _signal?: AbortSignal) {
    this.libraryRoot = resolveLibraryRoot({ libraryRoot: request.libraryRoot });
    return this.getSettings({}, _signal);
  }

  async setStudioPrompt(request: { text: string }, _signal?: AbortSignal) {
    await saveStudioPrompt(this.libraryRoot, request.text);
    return this.snapshotOf(await this.refresh());
  }

  async setInjectWritingPrompt(request: { slug: string; inject: boolean }, _signal?: AbortSignal) {
    const novel = await loadNovel(this.libraryRoot, request.slug);
    novel.meta.injectWritingPrompt = request.inject;
    await writeBookMeta(novel);
    return this.snapshotOf(await this.refresh());
  }

  async createNovel(request: { title: string; genre?: string }, _signal?: AbortSignal) {
    const created = await createNovel(this.libraryRoot, request.title, request.genre ?? "");
    await ensureMoluBook(this.libraryRoot, created.slug, request.title, request.genre ?? "");
    return this.snapshotOf(await this.refresh());
  }

  async switchNovel(request: { slug: string }, _signal?: AbortSignal) {
    await switchNovel(this.libraryRoot, request.slug);
    return this.snapshotOf(await this.refresh());
  }

  async renameNovel(request: { slug: string; title: string }, _signal?: AbortSignal) {
    await renameNovel(this.libraryRoot, request.slug, request.title);
    const molu = await loadMoluLibraryFile(this.libraryRoot);
    const book = molu?.books.find((item) => item.id === request.slug);
    if (molu !== undefined && book !== undefined) {
      book.project.name = request.title;
      await saveMoluLibraryFile(this.libraryRoot, molu);
    }
    return this.snapshotOf(await this.refresh());
  }

  async deleteNovel(request: { slug: string }, _signal?: AbortSignal) {
    await deleteNovel(this.libraryRoot, request.slug);
    const molu = await loadMoluLibraryFile(this.libraryRoot);
    if (molu !== undefined) {
      const books = molu.books.filter((item) => item.id !== request.slug);
      await saveMoluLibraryFile(this.libraryRoot, {
        ...molu,
        books,
        activeId: molu.activeId === request.slug ? books[0]?.id ?? null : molu.activeId,
      });
    }
    return this.snapshotOf(await this.refresh());
  }

  async getAsset(request: { path: string }, _signal?: AbortSignal) {
    if (!inside(this.libraryRoot, request.path)) throw new Error("path outside library");
    return jsonSafe({ path: request.path, ...(await readAsset(request.path)) });
  }

  async saveAsset(request: { path: string; text: string }, _signal?: AbortSignal) {
    if (!inside(this.libraryRoot, request.path)) throw new Error("path outside library");
    const library = await this.refresh();
    const novel = activeNovel(library);
    if (novel !== undefined) await snapshotAsset(this.libraryRoot, novel.meta.slug, request.path).catch(() => undefined);
    await saveAsset(request.path, request.text);
    return this.getAsset({ path: request.path }, _signal);
  }

  async createAsset(request: { slug: string; kind: "character" | "chapter" | "note" | "fact"; title: string }, _signal?: AbortSignal) {
    const path = await createAsset(this.libraryRoot, request.slug, request.kind, request.title);
    return this.getAsset({ path }, _signal);
  }

  async deleteAsset(request: { path: string }, _signal?: AbortSignal) {
    if (!inside(this.libraryRoot, request.path)) throw new Error("path outside library");
    await deleteAsset(request.path);
    return this.snapshotOf(await this.refresh());
  }

  async importBook(request: { fileName: string; text: string; genre?: string }, _signal?: AbortSignal) {
    const parsed = parseBookText(request.text, request.fileName);
    const created = await createNovel(this.libraryRoot, parsed.title, request.genre ?? parsed.genre);
    for (const chapter of parsed.chapters) {
      const path = await createAsset(this.libraryRoot, created.slug, "chapter", chapter.title);
      await saveAsset(path, `# ${chapter.title}\n\n${chapter.content.trim()}\n`);
    }
    await ensureMoluBook(this.libraryRoot, created.slug, parsed.title, request.genre ?? parsed.genre);
    return jsonSafe({ slug: created.slug, chapters: parsed.chapters.length });
  }

  async exportBook(request: { slug: string; format: "txt" | "markdown" | "platform"; author?: string }, _signal?: AbortSignal) {
    const novel = await loadNovel(this.libraryRoot, request.slug);
    const chapters = [];
    for (const file of novel.chapters) {
      chapters.push({ title: file.title, content: await readFile(file.path, "utf8") });
    }
    return jsonSafe({
      format: request.format,
      text: exportBook(chapters, {
        format: request.format,
        title: novel.meta.title,
        ...(request.author === undefined ? {} : { author: request.author }),
      }),
    });
  }

  async diagnoseNovel(request: { slug: string }, _signal?: AbortSignal) {
    const novel = await loadNovel(this.libraryRoot, request.slug);
    return jsonSafe(diagnoseNovel(novel, await textsOf(novel)));
  }

  async polishNovel(request: { slug: string }, _signal?: AbortSignal) {
    const novel = await loadNovel(this.libraryRoot, request.slug);
    const reports = [];
    for (const file of novel.chapters) {
      reports.push(scanPolish(file.title, await readFile(file.path, "utf8")));
    }
    return jsonSafe(mergePolishReports(novel.meta.title, reports));
  }

  async searchLibrary(request: { query: string; limit?: number }, _signal?: AbortSignal) {
    return jsonSafe(await searchLibrary(await this.refresh(), request.query, request.limit ?? 40));
  }

  async writeContext(request: { slug: string }, _signal?: AbortSignal) {
    const library = await this.refresh();
    const novel = await loadNovel(this.libraryRoot, request.slug);
    const pack = await assembleContextPack(novel, library.studioPrompt);
    return jsonSafe({ pack, text: renderContextPack(pack) });
  }

  async commitChapter(
    request: { slug: string; title: string; text: string; path?: string },
    _signal?: AbortSignal,
  ) {
    let path = request.path;
    if (path === undefined) path = await createAsset(this.libraryRoot, request.slug, "chapter", request.title);
    if (!inside(this.libraryRoot, path)) throw new Error("path outside library");
    if (!agentMayWrite(this.libraryRoot, path)) throw new Error("agent may only write chapter markdown");
    const facts = extractFacts(request.slug, request.title, request.text);
    const prose = stripFactLines(request.text);
    await saveAsset(path, prose.startsWith("#") ? prose : `# ${request.title}\n\n${prose}`);
    for (const fact of facts) await upsertFact(this.libraryRoot, fact);
    await patchMoluChapter(this.libraryRoot, request.slug, request.title, prose);
    return this.snapshotOf(await this.refresh());
  }

  async cloneNovel(request: { slug: string; title: string }, _signal?: AbortSignal) {
    await cloneNovel(this.libraryRoot, request.slug, request.title);
    return this.snapshotOf(await this.refresh());
  }

  async setPhase(request: { slug: string; phase: WorkflowPhase; force?: boolean }, _signal?: AbortSignal) {
    const novel = await loadNovel(this.libraryRoot, request.slug);
    if (request.force !== true) {
      const blocked = phaseBlocked(novel, request.phase);
      if (blocked !== undefined) throw new Error(blocked);
    }
    novel.meta.phase = request.phase;
    await writeBookMeta(novel);
    return this.snapshotOf(await this.refresh());
  }

  async upsertFact(request: Omit<LedgerFact, "id">, _signal?: AbortSignal) {
    const fact: LedgerFact = {
      id: `${request.novel}:${request.kind}:${request.name}`,
      ...request,
    };
    const ledger = await upsertFact(this.libraryRoot, fact);
    return jsonSafe({ ledger, conflicts: conflictsFor(ledger, request.novel) });
  }

  async savePromptTemplate(request: { id: string; title: string; body: string }, _signal?: AbortSignal) {
    await savePromptTemplate(this.libraryRoot, request.id, request.title, request.body);
    return jsonSafe(await listPromptTemplates(this.libraryRoot));
  }

  async listPromptTemplates(_request: Record<string, never>, _signal?: AbortSignal) {
    return jsonSafe(await listPromptTemplates(this.libraryRoot));
  }

  async saveNovelPrompt(request: { slug: string; text: string }, _signal?: AbortSignal) {
    await saveNovelPrompt(this.libraryRoot, request.slug, request.text);
    return this.snapshotOf(await this.refresh());
  }

  async validateNovel(request: { slug: string }, _signal?: AbortSignal) {
    const issues = await this.getValidation(request.slug);
    return jsonSafe({ issues });
  }

  async getTimeline(request: { slug: string }, _signal?: AbortSignal) {
    const novel = await loadNovel(this.libraryRoot, request.slug);
    const chapters = [];
    for (const file of novel.chapters) {
      chapters.push({ title: file.title, text: await readFile(file.path, "utf8") });
    }
    return jsonSafe(extractTimeline(chapters));
  }

  async getLedger(_request: Record<string, never>, _signal?: AbortSignal) {
    return jsonSafe(await loadLedger(this.libraryRoot));
  }

  async listVersions(request: { slug: string }, _signal?: AbortSignal) {
    return jsonSafe(await listVersions(this.libraryRoot, request.slug));
  }

  async restoreVersion(request: { dest: string; versionPath: string }, _signal?: AbortSignal) {
    if (!inside(this.libraryRoot, request.dest) || !inside(this.libraryRoot, request.versionPath)) {
      throw new Error("path outside library");
    }
    await restoreVersion(request.dest, request.versionPath);
    return this.getAsset({ path: request.dest }, _signal);
  }

  async getGuide(): Promise<string> {
    const library = await this.refresh();
    return guideText(library, activeNovel(library));
  }

  async getPromptText(): Promise<string> {
    return assemblePrompt(await this.refresh()).combined;
  }

  async getValidation(slug: string) {
    const novel = await loadNovel(this.libraryRoot, slug);
    return validateNovel(novel, await textsOf(novel));
  }

  async loadLedger() {
    return jsonSafe(await loadLedger(this.libraryRoot));
  }

  async getCover(request: { slug: string }, _signal?: AbortSignal) {
    const novel = await loadNovel(this.libraryRoot, request.slug);
    const cover = await getCoverBytes(novel.meta.path);
    return jsonSafe({ slug: request.slug, ...cover });
  }

  async setCover(request: { slug: string; mime: string; data: string }, _signal?: AbortSignal) {
    const novel = await loadNovel(this.libraryRoot, request.slug);
    await setCoverBytes(novel.meta.path, request.mime, request.data);
    return this.getCover({ slug: request.slug }, _signal);
  }

  async setFontSize(request: { slug: string; fontSize: number }, _signal?: AbortSignal) {
    const novel = await loadNovel(this.libraryRoot, request.slug);
    novel.meta.fontSize = request.fontSize;
    await writeBookMeta(novel);
    return this.snapshotOf(await this.refresh());
  }

  async readOutline(request: { slug: string }, _signal?: AbortSignal) {
    const layout = novelLayout(this.libraryRoot, request.slug);
    try {
      return jsonSafe({ path: layout.outline, ...(await readAsset(layout.outline)) });
    } catch {
      return jsonSafe({ path: layout.outline, title: "大纲", text: "" });
    }
  }

  async readFacts(request: { slug: string }, _signal?: AbortSignal) {
    const novel = await loadNovel(this.libraryRoot, request.slug);
    const items = [];
    for (const file of novel.facts) {
      items.push({ title: file.title, path: file.path, text: await readFile(file.path, "utf8") });
    }
    return jsonSafe({ items });
  }

  async readCharacter(
    request: { slug: string; id: string; layer?: "basic" | "complex" },
    _signal?: AbortSignal,
  ) {
    return jsonSafe(await readCharacterLayer(this.libraryRoot, request.slug, request.id, request.layer ?? "basic"));
  }

  async getMoluLibrary(_request: Record<string, never>, _signal?: AbortSignal) {
    return jsonSafe(await getMoluLibraryView(this.libraryRoot));
  }

  async saveMoluLibrary(request: { books: unknown[]; activeId?: string | null }, _signal?: AbortSignal) {
    const view = await saveMoluLibraryView(this.libraryRoot, request.books, request.activeId);
    await this.refresh();
    return jsonSafe(view);
  }
}
