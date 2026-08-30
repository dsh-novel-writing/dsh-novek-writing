import { join } from "node:path";

export function libraryLayout(root: string) {
  return {
    root,
    novels: join(root, "novels"),
    studio: join(root, "studio"),
    state: join(root, "studio", "state.json"),
    studioPrompt: join(root, "studio", "prompt.md"),
    prompts: join(root, "studio", "prompts"),
    ledger: join(root, "studio", "ledger.json"),
  };
}

export function novelLayout(root: string, slug: string) {
  const path = join(root, "novels", slug);
  return {
    path,
    book: join(path, "book.md"),
    prompt: join(path, "prompt.md"),
    outline: join(path, "outline.md"),
    glossary: join(path, "glossary.md"),
    cover: join(path, "cover"),
    worldview: join(path, "worldview"),
    timeline: join(path, "worldview", "timeline.md"),
    background: join(path, "worldview", "background.md"),
    facts: join(path, "facts"),
    characters: join(path, "characters"),
    chapters: join(path, "chapters"),
    notes: join(path, "notes"),
    versions: join(path, "versions"),
    summaries: join(path, "summaries"),
  };
}

export function assetDir(root: string, slug: string, kind: "character" | "chapter" | "note"): string {
  const novel = novelLayout(root, slug);
  if (kind === "character") return novel.characters;
  if (kind === "chapter") return novel.chapters;
  return novel.notes;
}
