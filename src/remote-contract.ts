import type { InvocationDescriptor } from "@deepseek-ai/dsh-typert-protocol";
import { z } from "zod";

import {
  assetPathSchema,
  assetViewSchema,
  cloneSchema,
  commitChapterSchema,
  coverViewSchema,
  createAssetSchema,
  createNovelSchema,
  diagnoseSchema,
  emptyObjectSchema,
  exportResultSchema,
  exportSchema,
  factSchema,
  fontSizeSchema,
  importResultSchema,
  importSchema,
  jsonUnknown,
  moluLibrarySchema,
  moluSaveSchema,
  libraryRootSchema,
  phaseSchema,
  polishSchema,
  novelPromptSchema,
  promptTemplateSchema,
  readCharacterSchema,
  characterLayerSchema,
  renameNovelSchema,
  restoreVersionSchema,
  saveAssetSchema,
  setCoverSchema,
  validationSchema,
  searchSchema,
  setInjectSchema,
  settingsViewSchema,
  slugSchema,
  snapshotSchema,
  textSchema,
} from "./schemas.ts";

export const PACKAGE_NAME = "novel-studio";
export const REMOTE_NAMESPACE = "novelStudio";

function codec(typeSymbol: string, schema: z.ZodType<unknown>) {
  return { mode: "strict" as const, typeSymbol, schema };
}

function jsonParam(
  name: string,
  typeSymbol: string,
  schema: z.ZodType<unknown>,
): InvocationDescriptor["parameters"][number] {
  return {
    name,
    wire: name,
    source: "json",
    codec: codec(typeSymbol, schema),
  };
}

function invocation(
  method: string,
  request: z.ZodType<unknown>,
  result: z.ZodType<unknown>,
): InvocationDescriptor {
  return {
    id: `${PACKAGE_NAME}#${REMOTE_NAMESPACE}/${method}`,
    service: REMOTE_NAMESPACE,
    namespace: REMOTE_NAMESPACE,
    method,
    invocation: { kind: "direct" },
    parameters: [jsonParam("request", `${PACKAGE_NAME}#${method}Request`, request)],
    cancellation: { parameter: "signal" },
    result: codec(`${PACKAGE_NAME}#${method}Result`, result),
    sourceLocation: { file: "src/service.ts", line: 1, column: 1 },
  };
}

export const NOVEL_STUDIO_INVOCATIONS: readonly InvocationDescriptor[] = [
  invocation("getSnapshot", emptyObjectSchema, snapshotSchema),
  invocation("getSettings", emptyObjectSchema, settingsViewSchema),
  invocation("setLibraryRoot", libraryRootSchema, settingsViewSchema),
  invocation("setStudioPrompt", textSchema, snapshotSchema),
  invocation("setInjectWritingPrompt", setInjectSchema, snapshotSchema),
  invocation("createNovel", createNovelSchema, snapshotSchema),
  invocation("switchNovel", slugSchema, snapshotSchema),
  invocation("renameNovel", renameNovelSchema, snapshotSchema),
  invocation("deleteNovel", slugSchema, snapshotSchema),
  invocation("getAsset", assetPathSchema, assetViewSchema),
  invocation("saveAsset", saveAssetSchema, assetViewSchema),
  invocation("createAsset", createAssetSchema, assetViewSchema),
  invocation("deleteAsset", assetPathSchema, snapshotSchema),
  invocation("importBook", importSchema, importResultSchema),
  invocation("exportBook", exportSchema, exportResultSchema),
  invocation("diagnoseNovel", slugSchema, diagnoseSchema),
  invocation("polishNovel", slugSchema, polishSchema),
  invocation("searchLibrary", searchSchema, jsonUnknown),
  invocation("writeContext", slugSchema, jsonUnknown),
  invocation("commitChapter", commitChapterSchema, snapshotSchema),
  invocation("cloneNovel", cloneSchema, snapshotSchema),
  invocation("setPhase", phaseSchema, snapshotSchema),
  invocation("upsertFact", factSchema, jsonUnknown),
  invocation("savePromptTemplate", promptTemplateSchema, jsonUnknown),
  invocation("listPromptTemplates", emptyObjectSchema, jsonUnknown),
  invocation("saveNovelPrompt", novelPromptSchema, snapshotSchema),
  invocation("validateNovel", slugSchema, validationSchema),
  invocation("getTimeline", slugSchema, jsonUnknown),
  invocation("getLedger", emptyObjectSchema, jsonUnknown),
  invocation("listVersions", slugSchema, jsonUnknown),
  invocation("restoreVersion", restoreVersionSchema, assetViewSchema),
  invocation("getCover", slugSchema, coverViewSchema),
  invocation("setCover", setCoverSchema, coverViewSchema),
  invocation("setFontSize", fontSizeSchema, snapshotSchema),
  invocation("readOutline", slugSchema, assetViewSchema),
  invocation("readFacts", slugSchema, jsonUnknown),
  invocation("readCharacter", readCharacterSchema, characterLayerSchema),
  invocation("getMoluLibrary", emptyObjectSchema, moluLibrarySchema),
  invocation("saveMoluLibrary", moluSaveSchema, moluLibrarySchema),
];
