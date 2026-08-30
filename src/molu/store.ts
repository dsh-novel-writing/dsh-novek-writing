import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { writeAtomic } from "../core/atomic.ts";
import { libraryLayout } from "../core/paths.ts";
import { jsonSafe } from "../core/json.ts";
import { emptyMoluLibraryFile } from "./empty.ts";
import { sanitizeBooks } from "./sanitize.ts";
import type { MoluBook, MoluLibraryFile } from "./types.ts";
import { MOLU_FORMAT } from "./types.ts";

export function moluLibraryPath(root: string): string {
  return join(libraryLayout(root).studio, "molu-library.json");
}

export async function loadMoluLibraryFile(root: string): Promise<MoluLibraryFile | undefined> {
  try {
    const raw = JSON.parse(await readFile(moluLibraryPath(root), "utf8")) as unknown;
    if (raw === null || typeof raw !== "object") return undefined;
    const rec = raw as Record<string, unknown>;
    const books = sanitizeBooks(rec.books);
    if (books === undefined) return undefined;
    return {
      format: typeof rec.format === "number" ? rec.format : MOLU_FORMAT,
      savedAt: typeof rec.savedAt === "string" ? rec.savedAt : "",
      books,
      activeId: typeof rec.activeId === "string" ? rec.activeId : null,
    };
  } catch {
    return undefined;
  }
}

export async function saveMoluLibraryFile(root: string, file: MoluLibraryFile): Promise<MoluLibraryFile> {
  await mkdir(libraryLayout(root).studio, { recursive: true });
  const next: MoluLibraryFile = {
    format: MOLU_FORMAT,
    savedAt: new Date().toISOString(),
    books: file.books,
    activeId: file.activeId,
  };
  await writeAtomic(moluLibraryPath(root), `${JSON.stringify(jsonSafe(next), null, 2)}\n`);
  return next;
}

export async function upsertMoluBook(root: string, book: MoluBook, activate = true): Promise<MoluLibraryFile> {
  const current = await loadMoluLibraryFile(root) ?? emptyMoluLibraryFile();
  const index = current.books.findIndex((item) => item.id === book.id);
  const books = current.books.slice();
  if (index >= 0) books[index] = book;
  else books.push(book);
  return saveMoluLibraryFile(root, {
    ...current,
    books,
    activeId: activate ? book.id : current.activeId,
  });
}

export function findMoluBook(file: MoluLibraryFile, slug: string): MoluBook | undefined {
  return file.books.find((book) => book.id === slug)
    ?? file.books.find((book) => book.project.name === slug);
}
