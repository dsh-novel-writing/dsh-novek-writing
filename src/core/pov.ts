export type Voice = "first" | "second" | "third" | "mixed" | "unknown";

const FIRST = /(^|[。！？\n])我[们的也在把被把把]?/;
const SECOND = /(^|[。！？\n])你[们的也在把被]?/;
const THIRD = /(他|她|它)[的了也在把被]?/;

export function detectVoice(text: string): Voice {
  const sample = text.slice(0, 2400);
  const first = (sample.match(new RegExp(FIRST, "g")) ?? []).length;
  const second = (sample.match(new RegExp(SECOND, "g")) ?? []).length;
  const third = (sample.match(new RegExp(THIRD, "g")) ?? []).length;
  const total = first + second + third;
  if (total < 4) return "unknown";
  const share = (n: number) => n / total;
  const leaders = [
    ["first", first],
    ["second", second],
    ["third", third],
  ] as const;
  const sorted = [...leaders].sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const next = sorted[1];
  if (top === undefined || next === undefined) return "unknown";
  if (share(top[1]) < 0.55) return "mixed";
  if (share(next[1]) > 0.28) return "mixed";
  return top[0];
}

export function voiceDrift(chapters: Array<{ title: string; text: string }>): Array<{ chapter: string; voice: Voice }> {
  return chapters.map((chapter) => ({ chapter: chapter.title, voice: detectVoice(chapter.text) }));
}
