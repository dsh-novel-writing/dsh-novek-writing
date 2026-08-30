import { stripMarkdown } from "./markdown.ts";
import type { NovelFile } from "./types.ts";

export type ExportFormat = "txt" | "markdown" | "platform";

export interface ExportChapter {
  title: string;
  content: string;
}

export interface ExportOptions {
  format: ExportFormat;
  title: string;
  author?: string;
  authorNotes?: string;
}

function chapterBlock(chapter: ExportChapter, format: ExportFormat, index: number): string {
  const body = chapter.content.trimEnd();
  if (format === "markdown") return `## 第 ${index} 章 ${chapter.title}\n\n${body}`;
  if (format === "platform") {
    const plain = stripMarkdown(body).replace(/\n{3,}/g, "\n\n").trim();
    return `${chapter.title}\n\n${plain}`;
  }
  return `${chapter.title}\n\n${stripMarkdown(body)}`;
}

export function exportBook(chapters: ExportChapter[], options: ExportOptions): string {
  const header = options.format === "markdown"
    ? `# ${options.title}${options.author ? `\n\n> 作者：${options.author}` : ""}`
    : `${options.title}${options.author ? `\n作者：${options.author}` : ""}`;
  const parts = [header, ""];
  chapters.forEach((chapter, index) => {
    parts.push(chapterBlock(chapter, options.format, index + 1));
    if (options.authorNotes) {
      parts.push("");
      parts.push(options.authorNotes);
    }
    parts.push("");
  });
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export function bomTxt(text: string): Buffer {
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, "utf8")]);
}

export function filesToExportChapters(files: NovelFile[], texts: Map<string, string>): ExportChapter[] {
  return files.map((file) => ({ title: file.title, content: texts.get(file.path) ?? "" }));
}
