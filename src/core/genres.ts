export const GENRES = [
  { id: "xuanhuan", label: "玄幻" },
  { id: "xianxia", label: "仙侠" },
  { id: "wuxia", label: "武侠" },
  { id: "qihuan", label: "奇幻" },
  { id: "xihuan", label: "西幻" },
  { id: "dushi", label: "都市" },
  { id: "xianshi", label: "现实" },
  { id: "kehuan", label: "科幻" },
  { id: "xuanyi", label: "悬疑" },
  { id: "yanqing", label: "言情" },
  { id: "qingxiaoshuo", label: "轻小说" },
  { id: "lishi", label: "历史" },
  { id: "junshi", label: "军事" },
  { id: "youxi", label: "游戏" },
  { id: "tiyu", label: "体育" },
  { id: "lingyi", label: "灵异" },
  { id: "zhichang", label: "职场" },
  { id: "chuanyue", label: "穿越" },
  { id: "chongsheng", label: "重生" },
  { id: "xitong", label: "系统流" },
  { id: "zhuzhai", label: "诸天" },
  { id: "moyu", label: "末世" },
  { id: "yijie", label: "异界" },
  { id: "xiaoyuan", label: "校园" },
  { id: "ernv", label: "年代" },
  { id: "jingji", label: "竞技" },
  { id: "other", label: "其他" },
] as const;

export type GenreId = (typeof GENRES)[number]["id"];

export function genreLabel(id: string): string {
  return GENRES.find((item) => item.id === id)?.label ?? id;
}

export function genreIdFromLabel(label: string): GenreId {
  const hit = GENRES.find((item) => item.label === label || item.id === label);
  return hit?.id ?? "other";
}

export function isGenreId(value: string): value is GenreId {
  return GENRES.some((item) => item.id === value);
}
