const CJK = /[\u4e00-\u9fff]/;

export function countChars(text: string): number {
  return [...text.replace(/\s+/g, "")].length;
}

export function countWords(text: string): number {
  const cjk = [...text].filter((char) => CJK.test(char)).length;
  const latin = text
    .replace(/[\u4e00-\u9fff]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0).length;
  return cjk + latin;
}

export function dialogueRatio(text: string): number {
  let inside = false;
  let spoken = 0;
  for (const char of text) {
    if (char === '"' || char === "“" || char === "「" || char === "『") {
      inside = true;
      continue;
    }
    if (char === "”" || char === "」" || char === "』") {
      inside = false;
      continue;
    }
    if (inside) spoken += 1;
  }
  return text.length === 0 ? 0 : spoken / text.length;
}

export function paragraphLengths(text: string): number[] {
  return text
    .split(/\n{2,}/)
    .map((part) => countChars(part))
    .filter((n) => n > 0);
}

export interface ChapterStats {
  chars: number;
  words: number;
  dialogue: number;
  paragraphs: number;
  longestParagraph: number;
}

export function chapterStats(text: string): ChapterStats {
  const lengths = paragraphLengths(text);
  return {
    chars: countChars(text),
    words: countWords(text),
    dialogue: dialogueRatio(text),
    paragraphs: lengths.length,
    longestParagraph: lengths.reduce((max, n) => Math.max(max, n), 0),
  };
}

export function estimateTokens(text: string): number {
  return Math.ceil(countChars(text) * 1.2);
}
