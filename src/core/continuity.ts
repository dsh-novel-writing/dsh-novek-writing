import { writeAtomic } from "./atomic.ts";
import { libraryLayout } from "./paths.ts";
import { readOptional } from "./atomic.ts";

export interface LedgerFact {
  id: string;
  novel: string;
  kind: "person" | "item" | "place" | "foreshadow" | "time";
  name: string;
  value: string;
  chapter: string;
}

export interface LedgerFile {
  facts: LedgerFact[];
}

export async function loadLedger(root: string): Promise<LedgerFile> {
  const raw = await readOptional(libraryLayout(root).ledger);
  if (raw === undefined) return { facts: [] };
  try {
    const parsed = JSON.parse(raw) as LedgerFile;
    return { facts: Array.isArray(parsed.facts) ? parsed.facts : [] };
  } catch {
    return { facts: [] };
  }
}

export async function saveLedger(root: string, ledger: LedgerFile): Promise<void> {
  await writeAtomic(libraryLayout(root).ledger, `${JSON.stringify(ledger, null, 2)}\n`);
}

export async function upsertFact(root: string, fact: LedgerFact): Promise<LedgerFile> {
  const ledger = await loadLedger(root);
  const index = ledger.facts.findIndex((item) => item.id === fact.id);
  if (index >= 0) ledger.facts[index] = fact;
  else ledger.facts.push(fact);
  await saveLedger(root, ledger);
  return ledger;
}

export function conflictsFor(ledger: LedgerFile, novel: string): Array<{ a: LedgerFact; b: LedgerFact }> {
  const mine = ledger.facts.filter((fact) => fact.novel === novel);
  const found: Array<{ a: LedgerFact; b: LedgerFact }> = [];
  for (let i = 0; i < mine.length; i += 1) {
    for (let j = i + 1; j < mine.length; j += 1) {
      const a = mine[i];
      const b = mine[j];
      if (a === undefined || b === undefined) continue;
      if (a.kind === b.kind && a.name === b.name && a.value !== b.value) found.push({ a, b });
    }
  }
  return found;
}

const FACT_LINE = /^\[fact:(\w+)\|([^|\]]+)\|([^\]]+)\]/;

export function stripFactLines(text: string): string {
  const kept = text.split("\n").filter((line) => !FACT_LINE.test(line.trim()));
  return `${kept.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

export function extractFacts(novel: string, chapter: string, text: string): LedgerFact[] {
  const facts: LedgerFact[] = [];
  for (const line of text.split("\n")) {
    const match = FACT_LINE.exec(line.trim());
    if (match === null) continue;
    const kind = match[1] as LedgerFact["kind"];
    facts.push({
      id: `${novel}:${kind}:${match[2]}`,
      novel,
      kind: ["person", "item", "place", "foreshadow", "time"].includes(kind) ? kind : "item",
      name: match[2] ?? "",
      value: match[3] ?? "",
      chapter,
    });
  }
  return facts;
}
