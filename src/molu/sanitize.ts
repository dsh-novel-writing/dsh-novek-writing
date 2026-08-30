import type {
  MoluBook,
  MoluChapter,
  MoluCharacter,
  MoluLibraryGroup,
  MoluMaterialGroup,
  MoluNote,
  MoluOutlineNode,
  MoluPlotline,
  MoluRelations,
  MoluScene,
  MoluTermGroup,
  MoluTimelineEvent,
  MoluVolume,
  MoluWorldEntry,
} from "./types.ts";

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function rid(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function chapterOf(raw: unknown): MoluChapter {
  const row = asRecord(raw) ?? {};
  const body = row.body;
  return {
    id: str(row.id) || rid("c"),
    title: str(row.title) || "未命名章节",
    words: num(row.words, 0),
    status: str(row.status) || "未开始",
    edited: str(row.edited) || "—",
    related: arr(row.related).map((item) => str(item)),
    body: typeof body === "string" ? body : "",
    note: str(row.note),
  };
}

function volumeOf(raw: unknown): MoluVolume {
  const row = asRecord(raw) ?? {};
  return {
    id: str(row.id) || rid("v"),
    title: str(row.title) || "未命名卷",
    status: str(row.status) || "未开始",
    chapters: arr(row.chapters).map(chapterOf),
  };
}

function characterOf(raw: unknown): MoluCharacter {
  const row = asRecord(raw) ?? {};
  return {
    ...row,
    id: str(row.id) || rid("p"),
    name: str(row.name) || "未命名人物",
    role: str(row.role),
    age: typeof row.age === "number" || typeof row.age === "string" ? row.age : "",
    identity: str(row.identity),
    tagline: str(row.tagline),
    desc: str(row.desc),
    relations: arr(row.relations).map((item) => {
      const rel = asRecord(item) ?? {};
      return { with: str(rel.with), label: str(rel.label), type: str(rel.type) || "sub" };
    }),
  };
}

function worldOf(raw: unknown): MoluWorldEntry {
  const row = asRecord(raw) ?? {};
  return {
    ...row,
    id: str(row.id) || rid("w"),
    type: str(row.type) || "地理",
    title: str(row.title) || "未命名条目",
    summary: str(row.summary),
    body: str(row.body),
    related: str(row.related),
  };
}

function termGroupOf(raw: unknown, nameKey: "name" | "group"): MoluTermGroup | MoluLibraryGroup {
  const row = asRecord(raw) ?? {};
  const items = arr(row.items).map((item) => {
    const term = asRecord(item) ?? {};
    return { ...term, term: str(term.term), tag: str(term.tag), def: str(term.def) };
  });
  if (nameKey === "group") return { group: str(row.group) || "未分组", items };
  return { name: str(row.name) || "未分组", items };
}

function plotOf(raw: unknown): MoluPlotline {
  const row = asRecord(raw) ?? {};
  return {
    ...row,
    id: str(row.id) || rid("pl"),
    name: str(row.name) || "未命名剧情线",
    type: str(row.type) || "主线",
    progress: num(row.progress, 0),
    chapters: str(row.chapters),
    note: str(row.note),
  };
}

function timelineOf(raw: unknown): MoluTimelineEvent {
  const row = asRecord(raw) ?? {};
  return {
    ...row,
    year: str(row.year) || "",
    title: str(row.title) || "未命名事件",
    type: str(row.type) || "背景",
    desc: str(row.desc),
  };
}

function outlineOf(raw: unknown): MoluOutlineNode {
  const row = asRecord(raw) ?? {};
  return {
    id: str(row.id) || rid("o"),
    type: str(row.type) || "节",
    title: str(row.title) || "未命名节点",
    note: str(row.note),
    children: arr(row.children).map(outlineOf),
  };
}

function sceneOf(raw: unknown): MoluScene {
  const row = asRecord(raw) ?? {};
  return {
    ...row,
    id: str(row.id) || rid("s"),
    title: str(row.title) || "未命名场景",
    type: str(row.type) || "过渡",
    place: str(row.place) || "未指定",
    chapter: str(row.chapter),
    chars: arr(row.chars).map((item) => str(item)),
    mood: str(row.mood),
    words: num(row.words, 0),
    desc: str(row.desc),
  };
}

function noteOf(raw: unknown): MoluNote {
  const row = asRecord(raw) ?? {};
  return {
    ...row,
    id: str(row.id) || rid("n"),
    title: str(row.title) || "未命名笔记",
    tag: str(row.tag),
    date: str(row.date),
    excerpt: str(row.excerpt),
  };
}

function materialGroupOf(raw: unknown): MoluMaterialGroup {
  const row = asRecord(raw) ?? {};
  return {
    group: str(row.group) || "未分组",
    type: str(row.type) || "text",
    items: arr(row.items).map((item) => {
      const mat = asRecord(item) ?? {};
      return {
        ...mat,
        name: str(mat.name) || "未命名素材",
        tag: str(mat.tag),
        meta: str(mat.meta),
        time: str(mat.time),
        ...(typeof mat.body === "string" ? { body: mat.body } : {}),
      };
    }),
  };
}

function relationsOf(raw: unknown): MoluRelations {
  const row = asRecord(raw);
  if (row === undefined) return { nodes: [], links: [] };
  return {
    nodes: arr(row.nodes).map((item) => {
      const node = asRecord(item) ?? {};
      return { id: str(node.id), x: num(node.x, 0), y: num(node.y, 0) };
    }),
    links: arr(row.links).map((item) => {
      const link = asRecord(item) ?? {};
      return { a: str(link.a), b: str(link.b), label: str(link.label), type: str(link.type) || "sub" };
    }),
  };
}

export function sanitizeBook(raw: unknown, index = 0): MoluBook | undefined {
  const row = asRecord(raw);
  if (row === undefined) return undefined;
  const project = asRecord(row.project) ?? {};
  return {
    id: str(row.id) || `b${Date.now()}${index}`,
    updated: str(row.updated) || "—",
    project: {
      name: str(project.name) || "未命名作品",
      genre: str(project.genre) || "长篇",
      targetWords: num(project.targetWords, 400000),
      lastSaved: str(project.lastSaved) || "刚刚",
      dailyGoal: num(project.dailyGoal, 2000),
    },
    volumes: arr(row.volumes).map(volumeOf),
    characters: arr(row.characters).map(characterOf),
    world: arr(row.world).map(worldOf),
    settingsGroups: arr(row.settingsGroups).map((item) => termGroupOf(item, "name") as MoluTermGroup),
    plotlines: arr(row.plotlines).map(plotOf),
    timeline: arr(row.timeline).map(timelineOf),
    outline: arr(row.outline).map(outlineOf),
    scenes: arr(row.scenes).map(sceneOf),
    library: arr(row.library).map((item) => termGroupOf(item, "group") as MoluLibraryGroup),
    notes: arr(row.notes).map(noteOf),
    materials: arr(row.materials).map(materialGroupOf),
    relations: relationsOf(row.relations),
  };
}

export function sanitizeBooks(list: unknown): MoluBook[] | undefined {
  if (!Array.isArray(list)) return undefined;
  const books = list.map((item, index) => sanitizeBook(item, index)).filter((item): item is MoluBook => item !== undefined);
  return books;
}
