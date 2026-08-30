export const MOLU_FORMAT = 1;
export const MOLU_APP = "墨庐 · 小说创作工作台";

export interface MoluProject {
  name: string;
  genre: string;
  targetWords: number;
  lastSaved: string;
  dailyGoal: number;
}

export interface MoluChapter {
  id: string;
  title: string;
  words: number;
  status: string;
  edited: string;
  related: string[];
  body: string;
  note: string;
}

export interface MoluVolume {
  id: string;
  title: string;
  status: string;
  chapters: MoluChapter[];
}

export interface MoluCharacter {
  id: string;
  name: string;
  role: string;
  age: number | string;
  identity: string;
  tagline: string;
  desc: string;
  relations: Array<{ with: string; label: string; type: string }>;
  [key: string]: unknown;
}

export interface MoluWorldEntry {
  id: string;
  type: string;
  title: string;
  summary: string;
  body: string;
  related: string;
  [key: string]: unknown;
}

export interface MoluTermItem {
  term: string;
  tag: string;
  def: string;
  [key: string]: unknown;
}

export interface MoluTermGroup {
  name: string;
  items: MoluTermItem[];
}

export interface MoluPlotline {
  id: string;
  name: string;
  type: string;
  progress: number;
  chapters: string;
  note: string;
  [key: string]: unknown;
}

export interface MoluTimelineEvent {
  year: string;
  title: string;
  type: string;
  desc: string;
  [key: string]: unknown;
}

export interface MoluOutlineNode {
  id: string;
  type: string;
  title: string;
  note: string;
  children: MoluOutlineNode[];
}

export interface MoluScene {
  id: string;
  title: string;
  type: string;
  place: string;
  chapter: string;
  chars: string[];
  mood: string;
  words: number;
  desc: string;
  [key: string]: unknown;
}

export interface MoluLibraryGroup {
  group: string;
  items: MoluTermItem[];
}

export interface MoluNote {
  id: string;
  title: string;
  tag: string;
  date: string;
  excerpt: string;
  [key: string]: unknown;
}

export interface MoluMaterialItem {
  name: string;
  tag: string;
  meta: string;
  time: string;
  body?: string;
  [key: string]: unknown;
}

export interface MoluMaterialGroup {
  group: string;
  type: string;
  items: MoluMaterialItem[];
}

export interface MoluRelations {
  nodes: Array<{ id: string; x: number; y: number }>;
  links: Array<{ a: string; b: string; label: string; type: string }>;
}

export interface MoluBook {
  id: string;
  updated: string;
  project: MoluProject;
  volumes: MoluVolume[];
  characters: MoluCharacter[];
  world: MoluWorldEntry[];
  settingsGroups: MoluTermGroup[];
  plotlines: MoluPlotline[];
  timeline: MoluTimelineEvent[];
  outline: MoluOutlineNode[];
  scenes: MoluScene[];
  library: MoluLibraryGroup[];
  notes: MoluNote[];
  materials: MoluMaterialGroup[];
  relations: MoluRelations;
}

export interface MoluLibraryFile {
  format: number;
  savedAt: string;
  books: MoluBook[];
  activeId: string | null;
}
