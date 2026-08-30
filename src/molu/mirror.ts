import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { writeAtomic } from "../core/atomic.ts";
import { dumpFrontMatter, slugify } from "../core/frontmatter.ts";
import { novelLayout } from "../core/paths.ts";
import { htmlToPlain } from "./html.ts";
import type { MoluBook, MoluOutlineNode } from "./types.ts";

function outlineMarkdown(nodes: MoluOutlineNode[], depth = 0): string {
  return nodes.map((node) => {
    const pad = "  ".repeat(depth);
    const line = `${pad}- **${node.type}** ${node.title}${node.note === "" ? "" : ` — ${node.note}`}`;
    const kids = outlineMarkdown(node.children, depth + 1);
    return kids === "" ? line : `${line}\n${kids}`;
  }).join("\n");
}

async function writeMd(path: string, title: string, body: string): Promise<void> {
  const text = body.trim() === "" ? `# ${title}\n` : `# ${title}\n\n${body.trim()}\n`;
  await writeAtomic(path, text.endsWith("\n") ? text : `${text}\n`);
}

export async function mirrorMoluBook(root: string, book: MoluBook): Promise<string> {
  const slug = slugify(book.id);
  const layout = novelLayout(root, slug);
  await mkdir(layout.characters, { recursive: true });
  await mkdir(layout.chapters, { recursive: true });
  await mkdir(layout.notes, { recursive: true });
  await mkdir(join(layout.path, "world"), { recursive: true });
  await mkdir(join(layout.path, "scenes"), { recursive: true });
  await mkdir(join(layout.path, "plot"), { recursive: true });

  await writeAtomic(layout.book, dumpFrontMatter({
    title: book.project.name,
    genre: book.project.genre,
    status: "draft",
    phase: "draft",
    injectWritingPrompt: true,
    chapterTargetMin: 2000,
    chapterTargetMax: book.project.dailyGoal > 0 ? book.project.dailyGoal * 2 : 4000,
    workbench: "molu",
    moluId: book.id,
  }, `${book.project.name}`));

  let chapterIndex = 0;
  for (const volume of book.volumes) {
    for (const chapter of volume.chapters) {
      chapterIndex += 1;
      const stem = `${String(chapterIndex).padStart(3, "0")}-${slugify(chapter.title) || chapter.id}`;
      const prose = htmlToPlain(chapter.body);
      await writeMd(join(layout.chapters, `${stem}.md`), chapter.title, prose);
    }
  }

  for (const character of book.characters) {
    const body = [
      character.role === "" ? "" : `角色：${character.role}`,
      character.identity === "" ? "" : `身份：${character.identity}`,
      character.tagline === "" ? "" : `口头禅：${character.tagline}`,
      htmlToPlain(character.desc),
    ].filter((line) => line !== "").join("\n\n");
    await writeMd(join(layout.characters, `${slugify(character.id) || character.id}.md`), character.name, body);
  }

  for (const note of book.notes) {
    await writeMd(join(layout.notes, `${slugify(note.id) || note.id}.md`), note.title, htmlToPlain(note.excerpt));
  }

  for (const entry of book.world) {
    await writeMd(
      join(layout.path, "world", `${slugify(entry.id) || entry.id}.md`),
      entry.title,
      [entry.type, entry.summary, htmlToPlain(entry.body)].filter((line) => line !== "").join("\n\n"),
    );
  }

  for (const scene of book.scenes) {
    await writeMd(
      join(layout.path, "scenes", `${slugify(scene.id) || scene.id}.md`),
      scene.title,
      [
        `类型：${scene.type}`,
        `地点：${scene.place}`,
        `章节：${scene.chapter}`,
        htmlToPlain(scene.desc),
      ].join("\n\n"),
    );
  }

  await writeMd(layout.outline, "大纲", outlineMarkdown(book.outline));

  const glossary = [
    ...book.settingsGroups.map((group) => {
      const items = group.items.map((item) => `- **${item.term}**（${item.tag}）：${item.def}`).join("\n");
      return `## ${group.name}\n\n${items}`;
    }),
    ...book.library.map((group) => {
      const items = group.items.map((item) => `- **${item.term}**（${item.tag}）：${item.def}`).join("\n");
      return `## ${group.group}\n\n${items}`;
    }),
    ...book.plotlines.map((line) => `## ${line.name}\n\n类型：${line.type}\n进度：${line.progress}%\n${line.note}`),
    ...book.timeline.map((event) => `- ${event.year} **${event.title}**（${event.type}） ${event.desc}`),
  ].join("\n\n");
  await writeMd(layout.glossary, "设定与资料", glossary);

  return slug;
}

export async function removeMoluMirror(root: string, bookId: string): Promise<void> {
  const layout = novelLayout(root, slugify(bookId));
  await rm(layout.path, { recursive: true, force: true });
}

export async function mirrorMoluBooks(root: string, books: MoluBook[], previousIds: string[]): Promise<void> {
  const keep = new Set(books.map((book) => slugify(book.id)));
  for (const book of books) await mirrorMoluBook(root, book);
  for (const id of previousIds) {
    if (!keep.has(slugify(id))) await removeMoluMirror(root, id);
  }
}
