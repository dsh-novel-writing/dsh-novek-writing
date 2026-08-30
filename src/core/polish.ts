import type { PolishHit, PolishReport } from "./types.ts";

export interface TasteWord {
  word: string;
  category: "connector" | "action" | "psychology" | "ornament" | "tone";
}

function words(category: TasteWord["category"], list: readonly string[]): TasteWord[] {
  return list.map((word) => ({ word, category }));
}

/** Original compact list of common machine-prose tics for Chinese fiction. */
export const TASTE_WORDS: TasteWord[] = [
  ...words("connector", [
    "不禁", "不由得", "与此同时", "与此同时", "总而言之", "综上所述", "众所周知",
    "显而易见", "换句话说", "也就是说", "另一方面", "归根结底", "说到底",
    "忽然之间", "突然之间", "下一秒", "下一刻", "就在这时", "恰在此时",
    "万万没想到", "出乎意料", "意料之外", "值得一提的是", "不难发现",
  ]),
  ...words("action", [
    "缓缓", "微微", "轻轻", "淡淡", "静静", "默默", "渐渐", "嘴角上扬",
    "勾起嘴角", "点了点头", "摇了摇头", "皱了皱眉", "挑了挑眉", "深吸一口气",
    "闭上双眼", "抬起头来", "转过身来", "回过神来", "似笑非笑", "意味深长",
    "微微一笑", "轻轻颔首", "沉默片刻", "沉默半晌", "缓缓开口", "淡淡开口",
  ]),
  ...words("psychology", [
    "心底", "心中暗想", "内心深处", "油然而生", "一股暖流", "一丝寒意",
    "莫名其妙", "不由自主", "情不自禁", "下意识", "暗自", "心头一紧",
    "心里咯噔", "思绪万千", "灵光一闪", "一个念头", "脑海中浮现", "眼前浮现",
  ]),
  ...words("ornament", [
    "深邃", "幽深", "修长", "倾国倾城", "惊为天人", "宛如", "宛若",
    "透着一丝", "露出一抹", "眼底闪过", "目光深邃", "气质出尘", "无法言喻",
    "难以言说", "气势如虹", "杀气凛然", "威压如山",
  ]),
  ...words("tone", [
    "罢了", "轻叹一声", "长叹一声", "苦笑一声", "冷笑一声", "哑然失笑",
    "无奈地笑了笑", "算了算了", "无妨无妨",
  ]),
];

function samplesAround(text: string, word: string, limit: number): string[] {
  const found: string[] = [];
  let from = 0;
  while (found.length < limit) {
    const at = text.indexOf(word, from);
    if (at < 0) break;
    found.push(text.slice(Math.max(0, at - 12), Math.min(text.length, at + word.length + 12)).replace(/\s+/g, " "));
    from = at + word.length;
  }
  return found;
}

export function scanPolish(title: string, text: string): PolishReport {
  const hits: PolishHit[] = [];
  let total = 0;
  for (const item of TASTE_WORDS) {
    let count = 0;
    let from = 0;
    while (from < text.length) {
      const at = text.indexOf(item.word, from);
      if (at < 0) break;
      count += 1;
      from = at + item.word.length;
    }
    if (count === 0) continue;
    total += count;
    hits.push({
      word: item.word,
      category: item.category,
      count,
      samples: samplesAround(text, item.word, 2),
    });
  }
  hits.sort((a, b) => b.count - a.count);
  const density = text.length === 0 ? 0 : Number((total / Math.max(1, text.length / 1000)).toFixed(2));
  return { title, density, hits };
}

export function mergePolishReports(title: string, reports: PolishReport[]): PolishReport {
  const map = new Map<string, PolishHit>();
  for (const report of reports) {
    for (const hit of report.hits) {
      const current = map.get(hit.word);
      if (current === undefined) {
        map.set(hit.word, { ...hit, samples: [...hit.samples] });
        continue;
      }
      current.count += hit.count;
      current.samples = [...current.samples, ...hit.samples].slice(0, 3);
    }
  }
  const hits = [...map.values()].sort((a, b) => b.count - a.count);
  const total = hits.reduce((sum, hit) => sum + hit.count, 0);
  const chars = reports.reduce((sum, report) => sum + report.hits.length, 0);
  return { title, density: Number((total / Math.max(1, chars)).toFixed(2)), hits };
}
