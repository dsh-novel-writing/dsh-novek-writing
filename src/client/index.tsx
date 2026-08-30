import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import type {} from "@deepseek-ai/dsh-api-remotes/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings-plugins/client";

import { TYPERT_REMOTE } from "../remote.ts";
import { NOVEL_STUDIO_SETTINGS_NAMESPACE } from "../settingsContract.ts";
import { BookChip } from "./BookChip.tsx";
import {
  isStudioOpen,
  releaseShellChrome,
  subscribeStudio,
} from "./chrome.ts";
import { FooterAction } from "./FooterAction.tsx";
import { en, NS, zh, type StudioKey } from "./locales.ts";
import { remountPluginCss, releasePluginCss } from "./pluginCss.ts";
import type { NovelStudioRemote, SettingsView } from "./remoteTypes.ts";
import { unwrap } from "./remoteTypes.ts";
import { SettingsCard } from "./SettingsCard.tsx";
import { registerStudioSettingsCard, type CompatibleSettingsSlots } from "./settingsSlot.ts";
import { StudioDock, type StudioFace } from "./StudioDock.tsx";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotMap {
    "sidebar.footer.action": {
      kind: "list";
      scope: "root";
      owner: { wide: boolean };
    };
    "conversation.input.dock": {
      kind: "list";
      scope: "session";
      owner: {
        session: { sessionId: string };
        input: { draft: string; phase: string };
        inputActions: { setDraft: (text: string) => void; submit: () => void };
      };
    };
  }
  interface LocaleNamespaceMap {
    "dsh.novel.studio": StudioKey;
  }
}

export const inject = ["slots", "locale", "remote", "layout"];

function remoteOf(ctx: ClientContext): NovelStudioRemote | undefined {
  return ctx.get("remote.novelStudio") as NovelStudioRemote | undefined;
}

function faceOf(ctx: ClientContext): StudioFace {
  const fail = (): never => {
    throw new Error("novel studio remote unavailable");
  };
  return {
    ready: () => remoteOf(ctx) !== undefined,
    getSnapshot: async () => unwrap(await (remoteOf(ctx) ?? fail()).getSnapshot({}), "snapshot"),
    createNovel: async (title, genre) => unwrap(await (remoteOf(ctx) ?? fail()).createNovel({
      title,
      ...(genre === undefined ? {} : { genre }),
    }), "create"),
    switchNovel: async (slug) => unwrap(await (remoteOf(ctx) ?? fail()).switchNovel({ slug }), "switch"),
    renameNovel: async (slug, title) => unwrap(await (remoteOf(ctx) ?? fail()).renameNovel({ slug, title }), "rename"),
    deleteNovel: async (slug) => unwrap(await (remoteOf(ctx) ?? fail()).deleteNovel({ slug }), "delete"),
    cloneNovel: async (slug, title) => unwrap(await (remoteOf(ctx) ?? fail()).cloneNovel({ slug, title }), "clone"),
    getAsset: async (path) => unwrap(await (remoteOf(ctx) ?? fail()).getAsset({ path }), "get asset"),
    saveAsset: async (path, text) => unwrap(await (remoteOf(ctx) ?? fail()).saveAsset({ path, text }), "save"),
    createAsset: async (slug, kind, title) => unwrap(await (remoteOf(ctx) ?? fail()).createAsset({ slug, kind, title }), "create asset"),
    deleteAsset: async (path) => unwrap(await (remoteOf(ctx) ?? fail()).deleteAsset({ path }), "delete asset"),
    importBook: async (fileName, text) => unwrap(await (remoteOf(ctx) ?? fail()).importBook({ fileName, text }), "import"),
    exportBook: async (slug, format) => unwrap(await (remoteOf(ctx) ?? fail()).exportBook({ slug, format }), "export"),
    getCover: async (slug) => unwrap(await (remoteOf(ctx) ?? fail()).getCover({ slug }), "cover"),
    setCover: async (slug, mime, data) => unwrap(await (remoteOf(ctx) ?? fail()).setCover({ slug, mime, data }), "set cover"),
    setFontSize: async (slug, fontSize) => unwrap(await (remoteOf(ctx) ?? fail()).setFontSize({ slug, fontSize }), "font"),
  };
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "novel-studio: dictionaries");
  ctx.effect(() => {
    remountPluginCss();
    return () => {
      releasePluginCss();
      releaseShellChrome();
    };
  }, "novel-studio: chrome");

  ctx.slots.register({
    name: "sidebar.footer.action",
    id: "novel-studio-footer",
    order: 30,
    locale: NS,
    inject: () => ({ t: ctx.locale.bind(NS) }),
  }, FooterAction);

  ctx.effect(async () => {
    const disposeRemote = await ctx.remote.$mount(TYPERT_REMOTE);
    if (ctx.fiber.state >= 5) {
      await disposeRemote();
      return () => {};
    }

    const stopOverlay = ctx.slots.inject("shell.overlay", () => {
      let disposeOccupant: (() => void) | undefined;
      const release = (): void => {
        disposeOccupant?.();
        disposeOccupant = undefined;
      };
      const sync = (): void => {
        if (isStudioOpen()) {
          if (disposeOccupant !== undefined) return;
          disposeOccupant = ctx.slots.register({
            name: "shell.overlay",
            id: "novel-studio-dock",
            order: 25,
            locale: NS,
            inject: () => ({
              t: ctx.locale.bind(NS),
              ...faceOf(ctx),
            }),
          }, StudioDock);
          return;
        }
        release();
      };
      const stop = subscribeStudio(sync);
      sync();
      return () => {
        stop();
        release();
      };
    });

    const stopSettings = ctx.slots.inject("settings.plugin.item", () =>
      registerStudioSettingsCard(
        ctx.slots as unknown as CompatibleSettingsSlots,
        SettingsCard,
        {
          namespace: NOVEL_STUDIO_SETTINGS_NAMESPACE,
          legacyId: "novel-studio",
          legacyOrder: 45,
          locale: NS,
          inject: () => ({
            t: ctx.locale.bind(NS),
            getSettings: async (): Promise<SettingsView> => {
              const remote = remoteOf(ctx);
              if (remote === undefined) throw new Error("remote unavailable");
              return unwrap(await remote.getSettings({}), "settings");
            },
            setLibraryRoot: async (libraryRoot: string): Promise<void> => {
              const remote = remoteOf(ctx);
              if (remote === undefined) throw new Error("remote unavailable");
              unwrap(await remote.setLibraryRoot({ libraryRoot }), "set root");
            },
          }),
        },
      ));

    const stopChip = ctx.slots.inject("conversation.input.dock", () =>
      ctx.slots.register({
        name: "conversation.input.dock",
        id: "novel-studio-book-chip",
        order: 40,
        locale: NS,
        inject: () => ({
          t: ctx.locale.bind(NS),
          getSnapshot: async () => {
            const remote = remoteOf(ctx);
            if (remote === undefined) throw new Error("remote unavailable");
            return unwrap(await remote.getSnapshot({}), "snapshot");
          },
        }),
      }, BookChip));

    return async () => {
      stopOverlay();
      stopSettings();
      stopChip();
      await disposeRemote();
    };
  }, "novel-studio: remote-view");
}
