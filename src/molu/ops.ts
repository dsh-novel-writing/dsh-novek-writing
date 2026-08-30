import { saveState } from "../core/library.ts";
import { emptyMoluLibraryFile, createMoluBook } from "./empty.ts";
import { countWords, plainToHtml } from "./html.ts";
import { hydrateBooksFromMarkdown } from "./hydrate.ts";
import { mirrorMoluBooks } from "./mirror.ts";
import { sanitizeBooks } from "./sanitize.ts";
import {
  findMoluBook,
  loadMoluLibraryFile,
  saveMoluLibraryFile,
} from "./store.ts";
import { MOLU_FORMAT } from "./types.ts";
import type { MoluLibraryFile } from "./types.ts";

export async function resolveMoluLibrary(root: string): Promise<MoluLibraryFile> {
  const existing = await loadMoluLibraryFile(root);
  if (existing !== undefined) return existing;
  const books = await hydrateBooksFromMarkdown(root);
  return saveMoluLibraryFile(root, emptyMoluLibraryFile(books, books[0]?.id ?? null));
}

export async function getMoluLibraryView(root: string) {
  const file = await resolveMoluLibrary(root);
  return {
    format: file.format,
    savedAt: file.savedAt,
    books: file.books,
    activeId: file.activeId,
  };
}

export async function saveMoluLibraryView(root: string, booksRaw: unknown[], activeId?: string | null) {
  const books = sanitizeBooks(booksRaw) ?? [];
  const previous = await loadMoluLibraryFile(root);
  const previousIds = previous?.books.map((book) => book.id) ?? [];
  const next = await saveMoluLibraryFile(root, {
    format: MOLU_FORMAT,
    savedAt: "",
    books,
    activeId: activeId === undefined ? previous?.activeId ?? books[0]?.id ?? null : activeId,
  });
  await mirrorMoluBooks(root, next.books, previousIds);
  if (next.activeId !== null) await saveState(root, { activeSlug: next.activeId });
  return {
    format: next.format,
    savedAt: next.savedAt,
    books: next.books,
    activeId: next.activeId,
  };
}

export async function ensureMoluBook(root: string, slug: string, title: string, genre: string): Promise<void> {
  const file = await resolveMoluLibrary(root);
  if (findMoluBook(file, slug) !== undefined) return;
  const hydrated = await hydrateBooksFromMarkdown(root);
  const book = hydrated.find((item) => item.id === slug) ?? createMoluBook(title, genre || "长篇", slug);
  const next = await saveMoluLibraryFile(root, {
    ...file,
    books: [...file.books, book],
    activeId: slug,
  });
  await saveState(root, { activeSlug: next.activeId });
}

export async function patchMoluChapter(
  root: string,
  slug: string,
  title: string,
  text: string,
): Promise<void> {
  const file = await loadMoluLibraryFile(root);
  if (file === undefined) return;
  const book = findMoluBook(file, slug);
  if (book === undefined) return;
  const html = plainToHtml(text);
  const words = countWords(html);
  let found = false;
  for (const volume of book.volumes) {
    const chapter = volume.chapters.find((item) => item.title === title);
    if (chapter === undefined) continue;
    chapter.body = html;
    chapter.words = words;
    chapter.status = "写作中";
    chapter.edited = "刚刚";
    found = true;
    break;
  }
  if (!found) {
    const volume = book.volumes[0] ?? { id: "v1", title: "卷一", status: "写作中", chapters: [] };
    if (book.volumes[0] === undefined) book.volumes.push(volume);
    volume.chapters.push({
      id: `c${Date.now()}`,
      title,
      words,
      status: "写作中",
      edited: "刚刚",
      related: [],
      body: html,
      note: "",
    });
  }
  book.updated = "刚刚";
  book.project.lastSaved = "刚刚";
  await saveMoluLibraryFile(root, file);
}
