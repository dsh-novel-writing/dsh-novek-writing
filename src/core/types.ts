export type NovelStatus = "draft" | "outlining" | "drafting" | "revising" | "complete";
export type AssetKind =
  | "character"
  | "character-basic"
  | "character-complex"
  | "chapter"
  | "note"
  | "outline"
  | "glossary"
  | "prompt"
  | "book"
  | "timeline"
  | "background"
  | "fact";
export type WorkflowPhase =
  | "premise"
  | "cast"
  | "outline"
  | "draft"
  | "revise"
  | "complete";

export interface NovelFile {
  id: string;
  title: string;
  path: string;
  kind: AssetKind;
  bytes: number;
  chars: number;
}

export interface NovelMeta {
  slug: string;
  title: string;
  genre: string;
  status: NovelStatus;
  injectWritingPrompt: boolean;
  path: string;
  premise: string;
  phase: WorkflowPhase;
  chapterTargetMin: number;
  chapterTargetMax: number;
  coverPath: string;
  bookChars: number;
  fontSize: number;
}

export interface OpenPage {
  title: string;
  path: string;
  tail: string;
  chapterIndex: number;
  chapterCount: number;
}

export interface CharacterCard {
  id: string;
  name: string;
  basicPath: string;
  complexPath: string;
  basic: string;
}

export interface Worldview {
  timeline: string;
  background: string;
}

export interface Novel {
  meta: NovelMeta;
  writingPrompt: string;
  characters: NovelFile[];
  chapters: NovelFile[];
  notes: NovelFile[];
  facts: NovelFile[];
  cast: CharacterCard[];
  worldview: Worldview;
  outline: NovelFile;
  glossary?: NovelFile;
  timeline: NovelFile;
  background: NovelFile;
  openPage?: OpenPage;
}

export interface StudioState {
  activeSlug: string | null;
}

export interface LibrarySettings {
  libraryRoot: string;
  studioPrompt: string;
  injectWritingPromptDefault: boolean;
}

export interface Library {
  root: string;
  studioPrompt: string;
  state: StudioState;
  novels: Novel[];
  revision: number;
}

export interface PromptSections {
  writing: string;
  worldview: string;
  catalog: string;
  openPage: string;
  combined: string;
}

export interface ContextPack {
  title: string;
  genre: string;
  writingPrompt: string;
  premise: string;
  outline: string;
  characters: Array<{ title: string; path: string; excerpt: string }>;
  previousChapters: Array<{ title: string; path: string; text: string }>;
  notes: Array<{ title: string; path: string }>;
  truncated: string[];
}

export interface DiagnoseIssue {
  chapter: string;
  dimension: string;
  severity: "info" | "warn" | "error";
  message: string;
}

export interface DiagnoseReport {
  title: string;
  score: number;
  issues: DiagnoseIssue[];
}

export interface PolishHit {
  word: string;
  category: string;
  count: number;
  samples: string[];
}

export interface PolishReport {
  title: string;
  density: number;
  hits: PolishHit[];
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface SearchHit {
  path: string;
  title: string;
  line: number;
  text: string;
}
