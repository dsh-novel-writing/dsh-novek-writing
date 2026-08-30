import { readFile } from "node:fs/promises";

import { loadLibrary } from "../core/library.ts";
import { createMoluBook } from "./empty.ts";
import { plainToHtml } from "./html.ts";
import type { MoluBook, MoluChapter } from "./types.ts";

export async function hydrateBooksFromMarkdown(root: string): Promise<MoluBook[]> {
  const library = await loadLibrary(root);
  const books: MoluBook[] = [];
  for (const novel of library.novels) {
    const chapters: MoluChapter[] = [];
    for (const file of novel.chapters) {
      let text = "";
      try {
        text = await readFile(file.path, "utf8");
      } catch {
        text = "";
      }
      chapters.push({
        id: file.id,
        title: file.title,
        words: file.chars,
        status: "写作中",
        edited: "—",
        related: [],
        body: plainToHtml(text),
        note: "",
      });
    }
    const characters = [];
    for (const file of novel.characters) {
      let text = "";
      try {
        text = await readFile(file.path, "utf8");
      } catch {
        text = "";
      }
      characters.push({
        id: file.id,
        name: file.title,
        role: "",
        age: "",
        identity: "",
        tagline: "",
        desc: plainToHtml(text),
        relations: [],
      });
    }
    const notes = [];
    for (const file of novel.notes) {
      let text = "";
      try {
        text = await readFile(file.path, "utf8");
      } catch {
        text = "";
      }
      notes.push({
        id: file.id,
        title: file.title,
        tag: "笔记",
        date: "",
        excerpt: plainToHtml(text),
      });
    }
    const book = createMoluBook(novel.meta.title, novel.meta.genre || "长篇", novel.meta.slug);
    book.volumes = [{ id: "v1", title: "卷一", status: "写作中", chapters }];
    book.characters = characters;
    book.notes = notes;
    if (novel.outline !== undefined) {
      let text = "";
      try {
        text = await readFile(novel.outline.path, "utf8");
      } catch {
        text = "";
      }
      book.outline = [{
        id: "o1",
        type: "卷",
        title: novel.outline.title,
        note: text.slice(0, 400),
        children: [],
      }];
    }
    books.push(book);
  }
  return books;
}
