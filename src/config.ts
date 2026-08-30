import { homedir } from "node:os";
import { join } from "node:path";

import Schema from "@deepseek-ai/schemastery";

export interface Config {
  libraryRoot: string;
}

export function defaultLibraryRoot(home = homedir()): string {
  return join(home, ".dsh", "novel-studio", "library");
}

export function expandHomePath(value: string, home = homedir()): string {
  if (value === "~") return home;
  if (value.startsWith("~/")) return join(home, value.slice(2));
  return value;
}

export function resolveLibraryRoot(config: Config, home = homedir()): string {
  const raw = config.libraryRoot.trim() === "" ? defaultLibraryRoot(home) : config.libraryRoot;
  return expandHomePath(raw, home);
}

export const Config: Schema<Config> = Schema.object({
  libraryRoot: Schema.string().default(defaultLibraryRoot()),
});
