import type { MoluBook } from "./types.ts";

export function createMoluBook(name: string, genre = "长篇", id?: string): MoluBook {
  return {
    id: id ?? `b${Date.now()}`,
    updated: "刚刚",
    project: {
      name,
      genre,
      targetWords: 400000,
      lastSaved: "刚刚",
      dailyGoal: 2000,
    },
    volumes: [{ id: "v1", title: "卷一", status: "写作中", chapters: [] }],
    characters: [],
    world: [],
    settingsGroups: [
      { name: "核心规则", items: [] },
      { name: "历史大事", items: [] },
    ],
    plotlines: [],
    timeline: [],
    outline: [],
    scenes: [],
    library: [
      { group: "地名考据", items: [] },
      { group: "机构沿革", items: [] },
      { group: "物件档案", items: [] },
      { group: "行业术语", items: [] },
    ],
    notes: [],
    materials: [
      { group: "意象图片", type: "image", items: [] },
      { group: "文字摘录", type: "text", items: [] },
      { group: "声音采集", type: "audio", items: [] },
    ],
    relations: { nodes: [], links: [] },
  };
}

export function emptyMoluLibraryFile(books: MoluBook[] = [], activeId: string | null = null) {
  return {
    format: 1,
    savedAt: new Date().toISOString(),
    books,
    activeId,
  };
}
