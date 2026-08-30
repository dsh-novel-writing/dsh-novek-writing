export interface TimelineBeat {
  chapter: string;
  line: number;
  marker: string;
  text: string;
}

const MARKERS = [
  /三[年月日天时]后/,
  /次[日天早夜]/,
  /当[日天夜]/,
  /黎明|清晨|正午|黄昏|深夜|夜里|五更/,
  /春|夏|秋|冬[天日]/,
  /\d{1,2}月/,
  /第[一二三四五六七八九十百]+[日天年]/,
  /元年|同年|翌年/,
];

export function extractTimeline(chapters: Array<{ title: string; text: string }>): TimelineBeat[] {
  const beats: TimelineBeat[] = [];
  for (const chapter of chapters) {
    const lines = chapter.text.split("\n");
    lines.forEach((line, index) => {
      for (const marker of MARKERS) {
        const match = marker.exec(line);
        if (match === null) continue;
        beats.push({
          chapter: chapter.title,
          line: index + 1,
          marker: match[0],
          text: line.trim().slice(0, 120),
        });
        break;
      }
    });
  }
  return beats;
}
