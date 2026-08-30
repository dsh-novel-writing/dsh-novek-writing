import { z } from "zod";

export const emptyObjectSchema = z.object({});

export const slugSchema = z.object({ slug: z.string() });
export const libraryRootSchema = z.object({ libraryRoot: z.string() });
export const textSchema = z.object({ text: z.string() });
export const createNovelSchema = z.object({
  title: z.string(),
  genre: z.string().optional(),
});
export const renameNovelSchema = z.object({
  slug: z.string(),
  title: z.string(),
});
export const setInjectSchema = z.object({
  slug: z.string(),
  inject: z.boolean(),
});
export const assetPathSchema = z.object({ path: z.string() });
export const saveAssetSchema = z.object({
  path: z.string(),
  text: z.string(),
});
export const createAssetSchema = z.object({
  slug: z.string(),
  kind: z.enum(["character", "chapter", "note", "fact"]),
  title: z.string(),
});
export const importSchema = z.object({
  fileName: z.string(),
  text: z.string(),
  genre: z.string().optional(),
});
export const exportSchema = z.object({
  slug: z.string(),
  format: z.enum(["txt", "markdown", "platform"]),
  author: z.string().optional(),
});
export const searchSchema = z.object({
  query: z.string(),
  limit: z.number().optional(),
});
export const commitChapterSchema = z.object({
  slug: z.string(),
  title: z.string(),
  text: z.string(),
  path: z.string().optional(),
});
export const cloneSchema = z.object({
  slug: z.string(),
  title: z.string(),
});
export const factSchema = z.object({
  novel: z.string(),
  kind: z.enum(["person", "item", "place", "foreshadow", "time"]),
  name: z.string(),
  value: z.string(),
  chapter: z.string(),
});
export const phaseSchema = z.object({
  slug: z.string(),
  phase: z.enum(["premise", "cast", "outline", "draft", "revise", "complete"]),
  force: z.boolean().optional(),
});
export const promptTemplateSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
});

const novelFileSchema = z.object({
  id: z.string(),
  title: z.string(),
  path: z.string(),
  kind: z.string(),
  bytes: z.number(),
  chars: z.number(),
});

const novelMetaSchema = z.object({
  slug: z.string(),
  title: z.string(),
  genre: z.string(),
  status: z.string(),
  injectWritingPrompt: z.boolean(),
  path: z.string(),
  premise: z.string(),
  phase: z.string(),
  chapterTargetMin: z.number(),
  chapterTargetMax: z.number(),
  coverPath: z.string(),
  bookChars: z.number(),
  fontSize: z.number(),
});

const characterCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  basicPath: z.string(),
  complexPath: z.string(),
  basic: z.string(),
});

export const novelSchema = z.object({
  meta: novelMetaSchema,
  writingPrompt: z.string(),
  characters: z.array(novelFileSchema),
  chapters: z.array(novelFileSchema),
  notes: z.array(novelFileSchema),
  facts: z.array(novelFileSchema),
  cast: z.array(characterCardSchema),
  worldview: z.object({
    timeline: z.string(),
    background: z.string(),
  }),
  outline: novelFileSchema.optional(),
  glossary: novelFileSchema.optional(),
  timeline: novelFileSchema.optional(),
  background: novelFileSchema.optional(),
  openPage: z.object({
    title: z.string(),
    path: z.string(),
    tail: z.string(),
    chapterIndex: z.number(),
    chapterCount: z.number(),
  }).optional(),
});

export const snapshotSchema = z.object({
  root: z.string(),
  studioPrompt: z.string(),
  activeSlug: z.string().nullable(),
  novels: z.array(novelSchema),
  revision: z.number(),
});

export const settingsViewSchema = z.object({
  libraryRoot: z.string(),
  studioPrompt: z.string(),
  genres: z.array(z.object({ id: z.string(), label: z.string() })),
});

export const assetViewSchema = z.object({
  path: z.string(),
  title: z.string(),
  text: z.string(),
});

export const importResultSchema = z.object({
  slug: z.string(),
  chapters: z.number(),
});

export const exportResultSchema = z.object({
  text: z.string(),
  format: z.string(),
});

export const diagnoseSchema = z.object({
  title: z.string(),
  score: z.number(),
  issues: z.array(z.object({
    chapter: z.string(),
    dimension: z.string(),
    severity: z.string(),
    message: z.string(),
  })),
});

export const polishSchema = z.object({
  title: z.string(),
  density: z.number(),
  hits: z.array(z.object({
    word: z.string(),
    category: z.string(),
    count: z.number(),
    samples: z.array(z.string()),
  })),
});

export const novelPromptSchema = z.object({
  slug: z.string(),
  text: z.string(),
});

export const validationSchema = z.object({
  issues: z.array(z.object({
    path: z.string(),
    message: z.string(),
  })),
});

export const restoreVersionSchema = z.object({
  dest: z.string(),
  versionPath: z.string(),
});

export const jsonUnknown = z.unknown();

export const coverViewSchema = z.object({
  slug: z.string(),
  mime: z.string(),
  data: z.string(),
});

export const setCoverSchema = z.object({
  slug: z.string(),
  mime: z.string(),
  data: z.string(),
});

export const fontSizeSchema = z.object({
  slug: z.string(),
  fontSize: z.number(),
});

export const readCharacterSchema = z.object({
  slug: z.string(),
  id: z.string(),
  layer: z.enum(["basic", "complex"]).optional(),
});

export const characterLayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  layer: z.enum(["basic", "complex"]),
  path: z.string(),
  text: z.string(),
});

export const moluLibrarySchema = z.object({
  format: z.number(),
  savedAt: z.string(),
  books: z.array(z.unknown()),
  activeId: z.string().nullable(),
});

export const moluSaveSchema = z.object({
  books: z.array(z.unknown()),
  activeId: z.string().nullable().optional(),
});
