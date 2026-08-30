import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { writeAtomic } from "./atomic.ts";
import { novelLayout } from "./paths.ts";

export interface VersionFile {
  name: string;
  path: string;
  bytes: number;
  at: number;
}

export async function listVersions(root: string, slug: string): Promise<VersionFile[]> {
  const dir = novelLayout(root, slug).versions;
  let names: string[] = [];
  try {
    names = (await readdir(dir)).sort().reverse();
  } catch {
    return [];
  }
  const items: VersionFile[] = [];
  for (const name of names) {
    const path = join(dir, name);
    const raw = await readFile(path, "utf8");
    const stamp = Number(name.split("-")[0] ?? 0);
    items.push({
      name,
      path,
      bytes: Buffer.byteLength(raw),
      at: Number.isFinite(stamp) ? stamp : 0,
    });
  }
  return items;
}

export async function restoreVersion(dest: string, versionPath: string): Promise<void> {
  const raw = await readFile(versionPath, "utf8");
  await writeAtomic(dest, raw.endsWith("\n") ? raw : `${raw}\n`);
}

export function versionLabel(file: VersionFile): string {
  if (file.at > 0) return `${new Date(file.at).toISOString().slice(0, 16).replace("T", " ")} ${basename(file.path).replace(/^\d+-/, "")}`;
  return file.name;
}
