import { readFile } from "node:fs/promises";

import type { Library, SearchHit } from "./types.ts";

export async function searchLibrary(library: Library, query: string, limit = 40): Promise<SearchHit[]> {
  const needle = query.trim();
  if (needle === "") return [];
  const hits: SearchHit[] = [];
  const files = library.novels.flatMap((novel) => [
    { title: `${novel.meta.title} / 书讯`, path: `${novel.meta.path}/book.md` },
    ...novel.characters,
    ...novel.chapters,
    ...novel.notes,
    ...novel.facts,
    ...(novel.outline === undefined ? [] : [novel.outline]),
    ...(novel.glossary === undefined ? [] : [novel.glossary]),
    ...(novel.timeline === undefined ? [] : [novel.timeline]),
    ...(novel.background === undefined ? [] : [novel.background]),
  ]);
  for (const file of files) {
    if (hits.length >= limit) break;
    let raw = "";
    try {
      raw = await readFile(file.path, "utf8");
    } catch {
      continue;
    }
    const lines = raw.split("\n");
    lines.forEach((line, index) => {
      if (hits.length >= limit) return;
      if (!line.includes(needle)) return;
      hits.push({
        path: file.path,
        title: file.title,
        line: index + 1,
        text: line.trim().slice(0, 180),
      });
    });
  }
  return hits;
}
