import { relative, sep } from "node:path";

/** Settings the author owns. The agent may read them, never write them. */
export function isCanonPath(libraryRoot: string, path: string): boolean {
  const rel = relative(libraryRoot, path).split(sep).join("/");
  if (rel.startsWith("..")) return false;
  return /(^|\/)(worldview|facts|characters)\//.test(`/${rel}/`)
    || /(^|\/)outline\.md$/.test(`/${rel}`)
    || /(^|\/)glossary\.md$/.test(`/${rel}`)
    || /(^|\/)book\.md$/.test(`/${rel}`)
    || /(^|\/)prompt\.md$/.test(`/${rel}`)
    || /(^|\/)cover\.(jpe?g|png|webp|gif)$/i.test(rel);
}

export function isChapterPath(libraryRoot: string, path: string): boolean {
  const rel = relative(libraryRoot, path).split(sep).join("/");
  return /(^|\/)chapters\/[^/]+\.md$/.test(rel);
}

export function agentMayWrite(libraryRoot: string, path: string): boolean {
  return isChapterPath(libraryRoot, path);
}
