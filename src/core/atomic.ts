import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function writeAtomic(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, text, "utf8");
  const { rename } = await import("node:fs/promises");
  try {
    await rename(tmp, path);
  } catch {
    await writeFile(path, text, "utf8");
  }
}

export async function writeAtomicBytes(path: string, data: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, data);
  const { rename } = await import("node:fs/promises");
  try {
    await rename(tmp, path);
  } catch {
    await writeFile(path, data);
  }
}

export async function readOptional(path: string): Promise<string | undefined> {
  try {
    const { readFile } = await import("node:fs/promises");
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}
