export interface OutlineBeat {
  heading: string;
  depth: number;
  preview: string;
}

export function parseOutlineBeats(outline: string): OutlineBeat[] {
  const beats: OutlineBeat[] = [];
  const lines = outline.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      beats.push({ heading: heading[2] ?? "", depth: heading[1]?.length ?? 1, preview: "" });
      continue;
    }
    const numbered = /^(\d+)[.．、]\s*(.+)$/.exec(line.trim());
    if (numbered) {
      beats.push({ heading: numbered[2] ?? "", depth: 2, preview: "" });
      continue;
    }
    const last = beats[beats.length - 1];
    if (last !== undefined && last.preview.length < 80 && line.trim() !== "") {
      last.preview = `${last.preview} ${line.trim()}`.trim();
    }
  }
  return beats;
}

export function missingBeats(beats: OutlineBeat[], chapterTitles: string[]): string[] {
  if (beats.length === 0) return [];
  return beats
    .filter((beat) => beat.depth <= 2)
    .filter((beat) => !chapterTitles.some((title) => title.includes(beat.heading) || beat.heading.includes(title)))
    .map((beat) => beat.heading);
}
