export interface DiffLine {
  kind: "same" | "add" | "del";
  text: string;
}

export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const table = lcs(a, b);
  const out: DiffLine[] = [];
  walk(a, b, a.length, b.length, table, out);
  return out;
}

function lcs(a: string[], b: string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () => Array.from({ length: b.length + 1 }, () => 0));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const row = table[i];
      const prev = table[i - 1];
      if (row === undefined || prev === undefined) continue;
      row[j] = a[i - 1] === b[j - 1] ? (prev[j - 1] ?? 0) + 1 : Math.max(prev[j] ?? 0, row[j - 1] ?? 0);
    }
  }
  return table;
}

function walk(a: string[], b: string[], i: number, j: number, table: number[][], out: DiffLine[]): void {
  if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
    walk(a, b, i - 1, j - 1, table, out);
    out.push({ kind: "same", text: a[i - 1] ?? "" });
    return;
  }
  const left = table[i]?.[j - 1] ?? 0;
  const up = table[i - 1]?.[j] ?? 0;
  if (j > 0 && (i === 0 || left >= up)) {
    walk(a, b, i, j - 1, table, out);
    out.push({ kind: "add", text: b[j - 1] ?? "" });
    return;
  }
  if (i > 0) {
    walk(a, b, i - 1, j, table, out);
    out.push({ kind: "del", text: a[i - 1] ?? "" });
  }
}

export function changedCount(lines: DiffLine[]): { added: number; removed: number } {
  return {
    added: lines.filter((line) => line.kind === "add").length,
    removed: lines.filter((line) => line.kind === "del").length,
  };
}
