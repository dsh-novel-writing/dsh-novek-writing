export interface RemoteAnswer<T> {
  ok: boolean;
  value?: T;
  error?: { code: string; message: string };
}

export interface NovelFileView {
  id: string;
  title: string;
  path: string;
  kind: string;
  bytes: number;
  chars: number;
}

export interface CharacterCardView {
  id: string;
  name: string;
  basicPath: string;
  complexPath: string;
  basic: string;
}

export interface NovelView {
  meta: {
    slug: string;
    title: string;
    genre: string;
    status: string;
    injectWritingPrompt: boolean;
    path: string;
    premise: string;
    phase: string;
    chapterTargetMin: number;
    chapterTargetMax: number;
    coverPath: string;
    bookChars: number;
    fontSize: number;
  };
  writingPrompt: string;
  characters: NovelFileView[];
  chapters: NovelFileView[];
  notes: NovelFileView[];
  facts: NovelFileView[];
  cast: CharacterCardView[];
  worldview: { timeline: string; background: string };
  outline?: NovelFileView;
  glossary?: NovelFileView;
  timeline?: NovelFileView;
  background?: NovelFileView;
  openPage?: {
    title: string;
    path: string;
    tail: string;
    chapterIndex: number;
    chapterCount: number;
  };
}

export interface SnapshotView {
  root: string;
  studioPrompt: string;
  activeSlug: string | null;
  novels: NovelView[];
  revision: number;
}

export interface AssetView {
  path: string;
  title: string;
  text: string;
}

export interface SettingsView {
  libraryRoot: string;
  studioPrompt: string;
  genres: Array<{ id: string; label: string }>;
}

export interface DiagnoseView {
  title: string;
  score: number;
  issues: Array<{ chapter: string; dimension: string; severity: string; message: string }>;
}

export interface PolishView {
  title: string;
  density: number;
  hits: Array<{ word: string; category: string; count: number; samples: string[] }>;
}

export interface ValidationView {
  issues: Array<{ path: string; message: string }>;
}

export interface SearchHitView {
  path: string;
  title: string;
  line: number;
  text: string;
}

export interface PromptTemplateView {
  id: string;
  title: string;
  body: string;
}

export interface MoluLibraryView {
  format: number;
  savedAt: string;
  books: unknown[];
  activeId: string | null;
}

export interface NovelStudioRemote {
  getSnapshot: (request: Record<string, never>) => Promise<RemoteAnswer<SnapshotView>>;
  getSettings: (request: Record<string, never>) => Promise<RemoteAnswer<SettingsView>>;
  setLibraryRoot: (request: { libraryRoot: string }) => Promise<RemoteAnswer<SettingsView>>;
  setStudioPrompt: (request: { text: string }) => Promise<RemoteAnswer<SnapshotView>>;
  setInjectWritingPrompt: (request: { slug: string; inject: boolean }) => Promise<RemoteAnswer<SnapshotView>>;
  createNovel: (request: { title: string; genre?: string }) => Promise<RemoteAnswer<SnapshotView>>;
  switchNovel: (request: { slug: string }) => Promise<RemoteAnswer<SnapshotView>>;
  renameNovel: (request: { slug: string; title: string }) => Promise<RemoteAnswer<SnapshotView>>;
  deleteNovel: (request: { slug: string }) => Promise<RemoteAnswer<SnapshotView>>;
  getAsset: (request: { path: string }) => Promise<RemoteAnswer<AssetView>>;
  saveAsset: (request: { path: string; text: string }) => Promise<RemoteAnswer<AssetView>>;
  createAsset: (request: { slug: string; kind: "character" | "chapter" | "note" | "fact"; title: string }) => Promise<RemoteAnswer<AssetView>>;
  deleteAsset: (request: { path: string }) => Promise<RemoteAnswer<SnapshotView>>;
  importBook: (request: { fileName: string; text: string; genre?: string }) => Promise<RemoteAnswer<{ slug: string; chapters: number }>>;
  exportBook: (request: { slug: string; format: "txt" | "markdown" | "platform"; author?: string }) => Promise<RemoteAnswer<{ text: string; format: string }>>;
  diagnoseNovel: (request: { slug: string }) => Promise<RemoteAnswer<DiagnoseView>>;
  polishNovel: (request: { slug: string }) => Promise<RemoteAnswer<PolishView>>;
  searchLibrary: (request: { query: string; limit?: number }) => Promise<RemoteAnswer<SearchHitView[]>>;
  writeContext: (request: { slug: string }) => Promise<RemoteAnswer<{ text: string }>>;
  commitChapter: (request: { slug: string; title: string; text: string; path?: string }) => Promise<RemoteAnswer<SnapshotView>>;
  cloneNovel: (request: { slug: string; title: string }) => Promise<RemoteAnswer<SnapshotView>>;
  setPhase: (request: { slug: string; phase: string; force?: boolean }) => Promise<RemoteAnswer<SnapshotView>>;
  savePromptTemplate: (request: { id: string; title: string; body: string }) => Promise<RemoteAnswer<PromptTemplateView[]>>;
  listPromptTemplates: (request: Record<string, never>) => Promise<RemoteAnswer<PromptTemplateView[]>>;
  saveNovelPrompt: (request: { slug: string; text: string }) => Promise<RemoteAnswer<SnapshotView>>;
  validateNovel: (request: { slug: string }) => Promise<RemoteAnswer<ValidationView>>;
  restoreVersion?: (request: { dest: string; versionPath: string }) => Promise<RemoteAnswer<AssetView>>;
  getCover: (request: { slug: string }) => Promise<RemoteAnswer<{ slug: string; mime: string; data: string }>>;
  setCover: (request: { slug: string; mime: string; data: string }) => Promise<RemoteAnswer<{ slug: string; mime: string; data: string }>>;
  setFontSize: (request: { slug: string; fontSize: number }) => Promise<RemoteAnswer<SnapshotView>>;
  getMoluLibrary: (request: Record<string, never>) => Promise<RemoteAnswer<MoluLibraryView>>;
  saveMoluLibrary: (request: { books: unknown[]; activeId?: string | null }) => Promise<RemoteAnswer<MoluLibraryView>>;
}

export function unwrap<T>(answer: RemoteAnswer<T>, fallback: string): T {
  if (!answer.ok || answer.value === undefined) {
    throw new Error(answer.error?.message ?? fallback);
  }
  return answer.value;
}

export function activeNovel(snapshot: SnapshotView | undefined): NovelView | undefined {
  if (snapshot === undefined) return undefined;
  if (snapshot.activeSlug === null) return snapshot.novels[0];
  return snapshot.novels.find((novel) => novel.meta.slug === snapshot.activeSlug) ?? snapshot.novels[0];
}
