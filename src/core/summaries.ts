import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { writeAtomic } from "./atomic.ts";
import { headingTitle } from "./frontmatter.ts";
import { novelLayout } from "./paths.ts";
import { firstParagraph } from "./markdown.ts";

export interface ChapterSummary {
  id: string;
  title: string;
  path: string;
  body: string;
}

export function draftSummary(title: string, chapterText: string): string {
  const para = firstParagraph(chapterText).slice(0, 280);
  return `# ${title} 摘要\n\n${para || "（还没有摘要）"}\n`;
}

export async function listSummaries(root: string, slug: string): Promise<ChapterSummary[]> {
  const dir = novelLayout(root, slug).summaries;
  let names: string[] = [];
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith(".md")).sort();
  } catch {
    return [];
  }
  const items: ChapterSummary[] = [];
  for (const name of names) {
    const path = join(dir, name);
    const body = await readFile(path, "utf8");
    items.push({
      id: name,
      title: headingTitle(body, name.replace(/\.md$/, "")),
      path,
      body,
    });
  }
  return items;
}

export async function saveSummary(root: string, slug: string, id: string, body: string): Promise<string> {
  const dir = novelLayout(root, slug).summaries;
  await mkdir(dir, { recursive: true });
  const path = join(dir, id.endsWith(".md") ? id : `${id}.md`);
  await writeAtomic(path, body.endsWith("\n") ? body : `${body}\n`);
  return path;
}
