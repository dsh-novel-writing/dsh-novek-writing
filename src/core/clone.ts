import { cp, mkdir } from "node:fs/promises";

import { loadLibrary, saveState } from "./library.ts";
import { dumpFrontMatter, parseFrontMatter, slugify } from "./frontmatter.ts";
import { writeAtomic } from "./atomic.ts";
import { novelLayout } from "./paths.ts";
import type { Library } from "./types.ts";

export async function cloneNovel(
  root: string,
  slug: string,
  title: string,
): Promise<{ library: Library; slug: string }> {
  const source = novelLayout(root, slug);
  const next = slugify(title);
  const dest = novelLayout(root, next);
  await mkdir(dest.path, { recursive: true });
  await cp(source.path, dest.path, { recursive: true });
  const bookRaw = await (await import("node:fs/promises")).readFile(dest.book, "utf8");
  const parsed = parseFrontMatter(bookRaw);
  await writeAtomic(dest.book, dumpFrontMatter({
    ...parsed.data,
    title,
    status: "draft",
    phase: parsed.data.phase === "complete" ? "draft" : parsed.data.phase ?? "outline",
  }, parsed.body));
  // Drop copied chapters so the new book reuses setting, not prose.
  const { rm } = await import("node:fs/promises");
  await rm(dest.chapters, { recursive: true, force: true });
  await mkdir(dest.chapters, { recursive: true });
  await saveState(root, { activeSlug: next });
  return { library: await loadLibrary(root), slug: next };
}

export function cloneLabel(title: string): string {
  return `${title}·模板`;
}
