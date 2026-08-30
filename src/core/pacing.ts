export interface PacingSlice {
  index: number;
  chars: number;
  dialogue: number;
  actionHits: number;
}

export interface PacingReport {
  slices: PacingSlice[];
  dialogueMean: number;
  longestQuiet: number;
  actionMean: number;
}

const ACTION = /打|杀|跑|追|撞|摔|拔|刺|轰|炸|冲|踢|挡|闪|劈|斩|射/;

export function pacingOf(text: string, sliceSize = 400): PacingReport {
  const slices: PacingSlice[] = [];
  const compact = text.replace(/\s+/g, "");
  for (let i = 0, index = 0; i < compact.length; i += sliceSize, index += 1) {
    const chunk = compact.slice(i, i + sliceSize);
    let spoken = 0;
    let inside = false;
    for (const char of chunk) {
      if ("\"“「『".includes(char)) inside = true;
      else if ("\"”」』".includes(char)) inside = false;
      else if (inside) spoken += 1;
    }
    const actionHits = (chunk.match(ACTION) ?? []).length;
    slices.push({
      index,
      chars: chunk.length,
      dialogue: chunk.length === 0 ? 0 : spoken / chunk.length,
      actionHits,
    });
  }
  const dialogueMean = slices.length === 0
    ? 0
    : slices.reduce((sum, item) => sum + item.dialogue, 0) / slices.length;
  const actionMean = slices.length === 0
    ? 0
    : slices.reduce((sum, item) => sum + item.actionHits, 0) / slices.length;
  let quiet = 0;
  let longestQuiet = 0;
  for (const slice of slices) {
    if (slice.actionHits === 0 && slice.dialogue < 0.08) {
      quiet += 1;
      longestQuiet = Math.max(longestQuiet, quiet);
    } else quiet = 0;
  }
  return { slices, dialogueMean, longestQuiet, actionMean };
}
