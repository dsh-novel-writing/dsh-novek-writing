import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";

import { headingChapterIndex, headingOf } from "../core/live-chapter.ts";
import { insertAt, markdownToHtml, wrapSelection } from "../core/markdown.ts";
import { continueInstruction } from "../core/prompt.ts";
import { chapterStats } from "../core/stats.ts";
import { observeLiveChapter } from "./liveObserver.ts";
import { MarkdownView } from "./MarkdownView.tsx";
import {
  getStudioWidth,
  isStudioOpen,
  setStudioOpen,
  setStudioTab,
  setStudioWidth,
  syncStudioChrome,
  useStudioTab,
  useStudioWidth,
  type StudioTab,
} from "./chrome.ts";
import type { StudioKey } from "./locales.ts";
import { printManuscript } from "./print.ts";
import type {
  CharacterCardView,
  NovelView,
  SnapshotView,
} from "./remoteTypes.ts";
import { activeNovel } from "./remoteTypes.ts";
import { clearWritingRequest, sendWritingInstruction, type WritingSendResult } from "./sessionBridge.ts";
import { useModelWriting } from "./writingPhase.ts";
import "./overlay.css";

const TABS: StudioTab[] = ["library", "desk", "canon"];
const FONT_SIZES = [14, 16, 18, 20, 22, 24, 28, 32];
const HISTORY_MAX = 80;

export interface StudioFace {
  ready: () => boolean;
  getSnapshot: () => Promise<SnapshotView>;
  createNovel: (title: string, genre?: string) => Promise<SnapshotView>;
  switchNovel: (slug: string) => Promise<SnapshotView>;
  renameNovel: (slug: string, title: string) => Promise<SnapshotView>;
  deleteNovel: (slug: string) => Promise<SnapshotView>;
  cloneNovel: (slug: string, title: string) => Promise<SnapshotView>;
  getAsset: (path: string) => Promise<{ path: string; title: string; text: string }>;
  saveAsset: (path: string, text: string) => Promise<{ path: string; title: string; text: string }>;
  createAsset: (slug: string, kind: "character" | "chapter" | "note" | "fact", title: string) => Promise<{ path: string; title: string; text: string }>;
  deleteAsset: (path: string) => Promise<SnapshotView>;
  importBook: (fileName: string, text: string) => Promise<{ slug: string; chapters: number }>;
  exportBook: (slug: string, format: "txt" | "markdown" | "platform") => Promise<{ text: string; format: string }>;
  getCover: (slug: string) => Promise<{ slug: string; mime: string; data: string }>;
  setCover: (slug: string, mime: string, data: string) => Promise<{ slug: string; mime: string; data: string }>;
  setFontSize: (slug: string, fontSize: number) => Promise<SnapshotView>;
}

export type StudioDockProps =
  & PropsRuntime<"shell.overlay">
  & PropsLocale<"dsh.novel.studio">
  & InjectFace<{ t: (key: StudioKey) => string } & StudioFace>;

function download(name: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function tabKey(tab: StudioTab): StudioKey {
  if (tab === "canon") return "tab.canon";
  if (tab === "library") return "tab.library";
  return "tab.desk";
}

function deskResultKey(result: WritingSendResult): StudioKey {
  if (result === "queued") return "desk.queued";
  if (result === "busy") return "desk.busy";
  if (result === "appended") return "desk.appended";
  return "desk.sent";
}

function coverUrl(mime: string, data: string): string {
  if (data === "") return "";
  return `data:${mime || "image/jpeg"};base64,${data}`;
}

export function StudioDock(props: StudioDockProps) {
  const { t } = props;
  const width = useStudioWidth();
  const tab = useStudioTab();
  const [snapshot, setSnapshot] = useState<SnapshotView>();
  const [error, setError] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [assetTitle, setAssetTitle] = useState("");
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(true);
  const [deskNote, setDeskNote] = useState("");
  const [liveText, setLiveText] = useState("");
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [savedFlash, setSavedFlash] = useState(false);
  const drag = useRef<{ startX: number; startW: number } | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const history = useRef<string[]>([""]);
  const histIndex = useRef(0);
  const skipHist = useRef(false);
  const writing = useModelWriting();
  const seenChapters = useRef<number | null>(null);

  const novel = useMemo(() => activeNovel(snapshot), [snapshot]);
  const face = useRef(props);
  face.current = props;

  const refresh = useCallback(async (mode: "full" | "meta" = "full") => {
    if (!face.current.ready()) {
      setError(t("error.remote"));
      return;
    }
    const next = await face.current.getSnapshot();
    setSnapshot(next);
    if (mode === "full") setError("");
  }, [t]);

  useEffect(() => {
    void refresh().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : t("error.remote"));
    });
  }, [refresh, t]);

  useEffect(() => {
    if (snapshot !== undefined && error === "") return;
    const timer = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 500);
    return () => {
      window.clearInterval(timer);
    };
  }, [snapshot, error, refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (dirty) return;
      void refresh("meta").catch(() => undefined);
    }, writing || liveText !== "" ? 800 : 3000);
    return () => {
      window.clearInterval(timer);
    };
  }, [refresh, dirty, writing, liveText]);

  useEffect(() => {
    syncStudioChrome(false);
    const onResize = (): void => {
      syncStudioChrome(false);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [width]);

  useEffect(() => {
    if (snapshot === undefined) return;
    let alive = true;
    void Promise.all(snapshot.novels.map(async (item) => {
      const cover = await face.current.getCover(item.meta.slug);
      return [item.meta.slug, coverUrl(cover.mime, cover.data)] as const;
    })).then((entries) => {
      if (!alive) return;
      const next: Record<string, string> = {};
      for (const [slug, url] of entries) {
        if (url !== "") next[slug] = url;
      }
      setCovers(next);
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [snapshot?.revision]);

  const resetHistory = (text: string): void => {
    history.current = [text];
    histIndex.current = 0;
  };

  const openAsset = async (path: string): Promise<void> => {
    const asset = await face.current.getAsset(path);
    clearWritingRequest();
    setLiveText("");
    setSelectedPath(path);
    setDraft(asset.text);
    setAssetTitle(asset.title);
    setDirty(false);
    resetHistory(asset.text);
    setStudioTab("desk");
  };

  useEffect(() => {
    const path = novel?.openPage?.path;
    if (path === undefined || selectedPath !== null) return;
    void openAsset(path);
  }, [novel?.openPage?.path, selectedPath]);

  useEffect(() => {
    const after = novel?.openPage?.chapterIndex ?? 0;
    setLiveText((text) => {
      if (text === "") return text;
      const current = headingChapterIndex(text);
      if (current !== undefined && current <= after) return "";
      return text;
    });
  }, [novel?.openPage?.chapterIndex]);

  useEffect(() => {
    if (dirty || novel === undefined) return;
    const after = novel.openPage?.chapterIndex ?? 0;
    return observeLiveChapter((text) => {
      setLiveText(text);
      setPreview(true);
      setStudioTab("desk");
      setStudioOpen(true);
    }, after);
  }, [dirty, novel === undefined, novel?.openPage?.chapterIndex]);

  useEffect(() => {
    const chapters = novel?.chapters ?? [];
    if (seenChapters.current === null) {
      seenChapters.current = chapters.length;
      return;
    }
    if (chapters.length > seenChapters.current && dirty === false) {
      const last = chapters[chapters.length - 1];
      if (last !== undefined) {
        setDeskNote("");
        void openAsset(last.path);
      }
    }
    seenChapters.current = chapters.length;
  }, [novel?.chapters, dirty]);

  const saveCurrent = async (): Promise<void> => {
    if (selectedPath === null) return;
    await face.current.saveAsset(selectedPath, draft);
    setDirty(false);
    setSavedFlash(true);
    window.setTimeout(() => {
      setSavedFlash(false);
    }, 1200);
    await refresh();
  };

  useEffect(() => {
    if (!dirty || selectedPath === null) return;
    const timer = window.setTimeout(() => {
      void saveCurrent().catch(() => undefined);
    }, 900);
    return () => {
      window.clearTimeout(timer);
    };
  }, [draft, dirty, selectedPath]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key !== "s") return;
      if (!isStudioOpen()) return;
      const dock = document.querySelector('[data-plugin="novel-studio"][data-surface="dock"]');
      if (!(dock instanceof HTMLElement)) return;
      const active = document.activeElement;
      const inside = dock.contains(event.target instanceof Node ? event.target : null)
        || (active instanceof Node && dock.contains(active));
      if (!inside) return;
      event.preventDefault();
      if (selectedPath === null || dirty === false) return;
      void saveCurrent();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [selectedPath, draft, dirty]);

  const changeDraft = (value: string): void => {
    if (!skipHist.current) {
      const stack = history.current.slice(0, histIndex.current + 1);
      if (stack[stack.length - 1] !== value) {
        stack.push(value);
        if (stack.length > HISTORY_MAX) stack.shift();
        history.current = stack;
        histIndex.current = stack.length - 1;
      }
    }
    skipHist.current = false;
    setDraft(value);
    setDirty(true);
  };

  const undo = (): void => {
    if (histIndex.current <= 0) return;
    histIndex.current -= 1;
    skipHist.current = true;
    const next = history.current[histIndex.current] ?? "";
    setDraft(next);
    setDirty(true);
  };

  const redo = (): void => {
    if (histIndex.current >= history.current.length - 1) return;
    histIndex.current += 1;
    skipHist.current = true;
    const next = history.current[histIndex.current] ?? "";
    setDraft(next);
    setDirty(true);
  };

  const streaming = dirty === false && liveText !== "";
  const shown = streaming ? liveText : draft;
  const busy = writing || streaming;
  const pageTitle = streaming ? (headingOf(liveText) || assetTitle) : assetTitle;
  const fontSize = novel?.meta.fontSize ?? 18;

  return (
    <div
      data-plugin="novel-studio"
      data-surface="dock"
      className="docked"
    >
      <div className="ns-header">
        <div className="ns-title">{novel?.meta.title ?? t("dock.title")}</div>
        <button type="button" className="ns-icon" aria-label={t("footer.close")} onClick={() => {
          setStudioOpen(false);
        }}>
          ×
        </button>
      </div>
      <div className="ns-tabs">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "ns-tab active" : "ns-tab"}
            onClick={() => {
              setStudioTab(id);
            }}
          >
            {t(tabKey(id))}
          </button>
        ))}
      </div>
      {error === "" ? null : <div className="ns-status">{error}</div>}
      <div className="ns-body">
        {tab === "library" ? (
          <LibraryPane
            t={t}
            snapshot={snapshot}
            novel={novel}
            covers={covers}
            onCreateBook={async () => {
              const title = window.prompt(t("action.new"));
              if (title === null || title.trim() === "") return;
              setSelectedPath(null);
              setSnapshot(await face.current.createNovel(title.trim()));
            }}
            onSwitch={async (slug) => {
              setSelectedPath(null);
              setSnapshot(await face.current.switchNovel(slug));
              setStudioTab("desk");
            }}
            onRename={async () => {
              if (novel === undefined) return;
              const title = window.prompt(t("action.rename"), novel.meta.title);
              if (title === null || title.trim() === "") return;
              setSnapshot(await face.current.renameNovel(novel.meta.slug, title.trim()));
            }}
            onDelete={async () => {
              if (novel === undefined) return;
              if (!window.confirm(`${t("action.delete")} ${novel.meta.title}?`)) return;
              setSelectedPath(null);
              setSnapshot(await face.current.deleteNovel(novel.meta.slug));
            }}
            onCover={async (file) => {
              if (novel === undefined) return;
              const data = await fileToBase64(file);
              const cover = await face.current.setCover(novel.meta.slug, file.type || "image/jpeg", data);
              setCovers((prev) => ({ ...prev, [novel.meta.slug]: coverUrl(cover.mime, cover.data) }));
            }}
            onImport={async (fileName, text) => {
              setSelectedPath(null);
              await face.current.importBook(fileName, text);
              await refresh();
            }}
            onExport={async (format) => {
              if (novel === undefined) return;
              const result = await face.current.exportBook(novel.meta.slug, format);
              download(`${novel.meta.slug}.${format === "markdown" ? "md" : "txt"}`, result.text);
            }}
            onPdf={async () => {
              if (novel === undefined) return;
              const result = await face.current.exportBook(novel.meta.slug, "markdown");
              printManuscript(novel.meta.title, markdownToHtml(result.text));
            }}
          />
        ) : null}
        {tab === "desk" ? (
          <DeskPane
            t={t}
            novel={novel}
            selectedPath={selectedPath}
            title={pageTitle}
            draft={shown}
            dirty={dirty}
            preview={preview}
            live={streaming}
            writing={busy}
            note={deskNote}
            saved={savedFlash}
            fontSize={fontSize}
            stats={chapterStats(shown)}
            editorRef={editorRef}
            onPick={(path) => {
              void openAsset(path);
            }}
            onPreview={setPreview}
            onChange={changeDraft}
            onUndo={undo}
            onRedo={redo}
            onFont={async (size) => {
              if (novel === undefined) return;
              setSnapshot(await face.current.setFontSize(novel.meta.slug, size));
            }}
            onContinue={() => {
              if (novel === undefined || writing) return;
              void (async () => {
                if (dirty && selectedPath !== null) await saveCurrent();
                setPreview(true);
                setStudioTab("desk");
                setStudioOpen(true);
                setLiveText("");
                setDeskNote("");
                const result: WritingSendResult = sendWritingInstruction(continueInstruction(novel));
                if (result !== "sent") setDeskNote(t(deskResultKey(result)));
              })();
            }}
            onCreateChapter={async () => {
              if (novel === undefined) return;
              const title = window.prompt(t("action.createChapter"), `第${novel.chapters.length + 1}章`);
              if (title === null || title.trim() === "") return;
              const asset = await face.current.createAsset(novel.meta.slug, "chapter", title.trim());
              await refresh();
              await openAsset(asset.path);
              setPreview(false);
            }}
          />
        ) : null}
        {tab === "canon" ? (
          <CanonPane
            t={t}
            novel={novel}
            getAsset={(path) => face.current.getAsset(path)}
            saveAsset={(path, text) => face.current.saveAsset(path, text)}
            createCharacter={async () => {
              if (novel === undefined) return;
              const title = window.prompt(t("action.createCharacter"));
              if (title === null || title.trim() === "") return;
              await face.current.createAsset(novel.meta.slug, "character", title.trim());
              await refresh();
            }}
            createFact={async () => {
              if (novel === undefined) return;
              const title = window.prompt(t("action.createFact"));
              if (title === null || title.trim() === "") return;
              await face.current.createAsset(novel.meta.slug, "fact", title.trim());
              await refresh();
            }}
          />
        ) : null}
      </div>
      <div
        className="ns-resize"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { startX: event.clientX, startW: getStudioWidth() };
        }}
        onPointerMove={(event) => {
          if (drag.current === null) return;
          setStudioWidth(drag.current.startW + (event.clientX - drag.current.startX));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      />
    </div>
  );
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function applyAround(el: HTMLTextAreaElement | null, text: string, before: string, after = before): string {
  if (el === null) return wrapSelection(text, 0, text.length, before, after);
  return wrapSelection(text, el.selectionStart, el.selectionEnd, before, after);
}

function DeskPane(props: {
  t: (key: StudioKey) => string;
  novel: NovelView | undefined;
  selectedPath: string | null;
  title: string;
  draft: string;
  dirty: boolean;
  preview: boolean;
  live: boolean;
  writing: boolean;
  note: string;
  saved: boolean;
  fontSize: number;
  stats: { chars: number; words: number; dialogue: number; paragraphs: number };
  editorRef: RefObject<HTMLTextAreaElement>;
  onPick: (path: string) => void;
  onPreview: (preview: boolean) => void;
  onChange: (value: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onFont: (size: number) => void;
  onContinue: () => void;
  onCreateChapter: () => Promise<void>;
}) {
  const { t, novel } = props;
  const imageInput = useRef<HTMLInputElement>(null);
  if (novel === undefined) return <div className="ns-empty">{t("dock.empty")}</div>;
  const viewing = props.preview || props.live || props.writing;
  const empty = props.selectedPath === null && props.live !== true;
  const bookChars = novel.meta.bookChars + (props.live ? props.stats.chars : 0);
  return (
    <div className="ns-desk">
      <div className="ns-toolbar ns-format">
        <select
          aria-label={t("desk.pick")}
          value={props.selectedPath ?? novel.openPage?.path ?? ""}
          onChange={(event) => {
            if (event.target.value !== "") props.onPick(event.target.value);
          }}
        >
          {novel.chapters.length === 0 ? <option value="">{t("desk.blank")}</option> : null}
          {novel.chapters.map((file) => (
            <option key={file.path} value={file.path}>{file.title}</option>
          ))}
        </select>
        <button type="button" className="ns-btn ns-btn-primary" disabled={props.writing} onClick={props.onContinue}>{t("desk.continue")}</button>
        <button
          type="button"
          className="ns-btn ns-toggle"
          aria-pressed={viewing}
          disabled={props.writing}
          onClick={() => {
            if (props.writing) return;
            props.onPreview(!props.preview);
          }}
        >
          {viewing ? t("desk.edit") : t("desk.preview")}
        </button>
        <button type="button" className="ns-btn" disabled={viewing} onClick={() => {
          props.onChange(applyAround(props.editorRef.current, props.draft, "**"));
        }}>{t("desk.bold")}</button>
        <button type="button" className="ns-btn" disabled={viewing} onClick={() => {
          props.onChange(applyAround(props.editorRef.current, props.draft, "*"));
        }}>{t("desk.italic")}</button>
        <button type="button" className="ns-btn" disabled={viewing} onClick={() => {
          const el = props.editorRef.current;
          const at = el?.selectionStart ?? props.draft.length;
          props.onChange(insertAt(props.draft, at, "\n\n---\n\n"));
        }}>{t("desk.rule")}</button>
        <button type="button" className="ns-btn" disabled={viewing} onClick={props.onUndo}>{t("desk.undo")}</button>
        <button type="button" className="ns-btn" disabled={viewing} onClick={props.onRedo}>{t("desk.redo")}</button>
        <button type="button" className="ns-btn" disabled={viewing} onClick={() => {
          imageInput.current?.click();
        }}>{t("desk.image")}</button>
        <label className="ns-font">
          {t("desk.font")}
          <select
            aria-label={t("desk.font")}
            value={props.fontSize}
            onChange={(event) => {
              props.onFont(Number(event.target.value));
            }}
          >
            {FONT_SIZES.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
        {novel.chapters.length === 0 ? (
          <button type="button" className="ns-btn" onClick={() => void props.onCreateChapter()}>{t("action.createChapter")}</button>
        ) : null}
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = "";
            if (file === undefined) return;
            void fileToDataUrl(file).then((url) => {
              const el = props.editorRef.current;
              const at = el?.selectionStart ?? props.draft.length;
              props.onChange(insertAt(props.draft, at, `\n\n![${file.name}](${url})\n\n`));
            });
          }}
        />
      </div>
      {empty ? (
        <div className="ns-empty">{t("desk.blank")}</div>
      ) : viewing ? (
        <MarkdownView className="ns-md ns-page" text={props.draft} live={props.live} />
      ) : (
        <div className="ns-editor-pane">
          <textarea
            ref={props.editorRef}
            className="ns-paper"
            style={{ fontSize: `${props.fontSize}px` }}
            value={props.draft}
            spellCheck={false}
            onChange={(event) => {
              props.onChange(event.target.value);
            }}
          />
        </div>
      )}
      <div className="ns-statusbar">
        <span className={props.writing ? "ns-live-dot" : undefined}>
          {props.writing
            ? (props.live && props.title !== "" ? `${t("desk.live")} · ${props.title}` : t("desk.live"))
            : props.title}
        </span>
        <span>{t("desk.chapterChars")} {props.stats.chars}{props.dirty ? " *" : props.saved ? ` · ${t("desk.saved")}` : ""}</span>
        <span>{t("desk.bookChars")} {bookChars}</span>
        {props.note === "" ? null : <span>{props.note}</span>}
      </div>
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(String(reader.result ?? ""));
    };
    reader.onerror = () => {
      reject(new Error("read image"));
    };
    reader.readAsDataURL(file);
  });
}

function CanonPane(props: {
  t: (key: StudioKey) => string;
  novel: NovelView | undefined;
  getAsset: (path: string) => Promise<{ path: string; title: string; text: string }>;
  saveAsset: (path: string, text: string) => Promise<{ path: string; title: string; text: string }>;
  createCharacter: () => Promise<void>;
  createFact: () => Promise<void>;
}) {
  const { t, novel } = props;
  const [timeline, setTimeline] = useState("");
  const [background, setBackground] = useState("");
  const [outline, setOutline] = useState("");
  const [card, setCard] = useState<CharacterCardView>();
  const [layer, setLayer] = useState<"basic" | "complex">("basic");
  const [castText, setCastText] = useState("");
  const [factPath, setFactPath] = useState("");
  const [factText, setFactText] = useState("");
  const loaded = useRef("");

  useEffect(() => {
    if (novel === undefined) return;
    if (loaded.current === novel.meta.slug) return;
    loaded.current = novel.meta.slug;
    setTimeline(novel.worldview.timeline);
    setBackground(novel.worldview.background);
    setCard(novel.cast[0]);
    setLayer("basic");
    setCastText(novel.cast[0]?.basic ?? "");
    setFactPath(novel.facts[0]?.path ?? "");
    void props.getAsset(novel.outline?.path ?? "").then((asset) => {
      setOutline(asset.text);
    }).catch(() => {
      setOutline("");
    });
  }, [novel?.meta.slug]);

  useEffect(() => {
    if (card === undefined) return;
    const path = layer === "complex" ? card.complexPath : card.basicPath;
    void props.getAsset(path).then((asset) => {
      setCastText(asset.text);
    }).catch(() => {
      setCastText(layer === "basic" ? card.basic : "");
    });
  }, [card?.id, layer]);

  useEffect(() => {
    if (factPath === "") {
      setFactText("");
      return;
    }
    void props.getAsset(factPath).then((asset) => {
      setFactText(asset.text);
    }).catch(() => {
      setFactText("");
    });
  }, [factPath]);

  if (novel === undefined) return <div className="ns-empty">{t("dock.empty")}</div>;

  const saveLater = (path: string, text: string): void => {
    window.setTimeout(() => {
      void props.saveAsset(path, text).catch(() => undefined);
    }, 400);
  };

  return (
    <div className="ns-scroll ns-canon">
      <p className="ns-banner">{t("canon.banner")}</p>
      <div className="ns-group">{t("canon.world")}</div>
      <div className="ns-label">{t("canon.timeline")}</div>
      <textarea
        className="ns-canon-field"
        value={timeline}
        onChange={(event) => {
          const value = event.target.value;
          setTimeline(value);
          if (novel.timeline !== undefined) saveLater(novel.timeline.path, value);
        }}
      />
      <div className="ns-label">{t("canon.background")}</div>
      <textarea
        className="ns-canon-field"
        value={background}
        onChange={(event) => {
          const value = event.target.value;
          setBackground(value);
          if (novel.background !== undefined) saveLater(novel.background.path, value);
        }}
      />
      <div className="ns-group">{t("canon.outline")}</div>
      <p className="ns-meta">{t("canon.outlineHint")}</p>
      <textarea
        className="ns-canon-field"
        value={outline}
        onChange={(event) => {
          const value = event.target.value;
          setOutline(value);
          if (novel.outline !== undefined) saveLater(novel.outline.path, value);
        }}
      />
      <div className="ns-group">{t("canon.cast")}</div>
      <div className="ns-toolbar">
        <button type="button" className="ns-btn" onClick={() => void props.createCharacter()}>{t("action.createCharacter")}</button>
      </div>
      {novel.cast.length === 0 ? <div className="ns-meta">{t("desk.blank")}</div> : (
        <>
          <div className="ns-chip-row">
            {novel.cast.map((item) => (
              <button
                key={item.id}
                type="button"
                className={card?.id === item.id ? "ns-chip active" : "ns-chip"}
                onClick={() => {
                  setCard(item);
                  setLayer("basic");
                }}
              >
                {item.name}
              </button>
            ))}
          </div>
          <div className="ns-toolbar">
            <button type="button" className={layer === "basic" ? "ns-btn ns-btn-primary" : "ns-btn"} onClick={() => {
              setLayer("basic");
            }}>{t("canon.basic")}</button>
            <button type="button" className={layer === "complex" ? "ns-btn ns-btn-primary" : "ns-btn"} onClick={() => {
              setLayer("complex");
            }}>{t("canon.complex")}</button>
          </div>
          <textarea
            className="ns-canon-field ns-canon-tall"
            value={castText}
            onChange={(event) => {
              const value = event.target.value;
              setCastText(value);
              if (card === undefined) return;
              saveLater(layer === "complex" ? card.complexPath : card.basicPath, value);
            }}
          />
        </>
      )}
      <div className="ns-group">{t("canon.facts")}</div>
      <p className="ns-meta">{t("canon.factsHint")}</p>
      <div className="ns-toolbar">
        <button type="button" className="ns-btn" onClick={() => void props.createFact()}>{t("action.createFact")}</button>
      </div>
      {novel.facts.map((file) => (
        <button
          key={file.path}
          type="button"
          className={file.path === factPath ? "ns-row active" : "ns-row"}
          onClick={() => {
            setFactPath(file.path);
          }}
        >
          {file.title}
        </button>
      ))}
      {factPath === "" ? null : (
        <textarea
          className="ns-canon-field"
          value={factText}
          onChange={(event) => {
            const value = event.target.value;
            setFactText(value);
            saveLater(factPath, value);
          }}
        />
      )}
    </div>
  );
}

function LibraryPane(props: {
  t: (key: StudioKey) => string;
  snapshot: SnapshotView | undefined;
  novel: NovelView | undefined;
  covers: Record<string, string>;
  onCreateBook: () => Promise<void>;
  onSwitch: (slug: string) => Promise<void>;
  onRename: () => Promise<void>;
  onDelete: () => Promise<void>;
  onCover: (file: File) => Promise<void>;
  onImport: (fileName: string, text: string) => Promise<void>;
  onExport: (format: "txt" | "markdown") => Promise<void>;
  onPdf: () => Promise<void>;
}) {
  const { t, snapshot, novel } = props;
  const importRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  if (snapshot === undefined) return <div className="ns-empty">{t("error.remote")}</div>;
  return (
    <div className="ns-scroll">
      <div className="ns-toolbar">
        <button type="button" className="ns-btn ns-btn-primary" onClick={() => void props.onCreateBook()}>{t("action.new")}</button>
        <button type="button" className="ns-btn" onClick={() => {
          importRef.current?.click();
        }}>{t("io.import")}</button>
        <button type="button" className="ns-btn" onClick={() => void props.onRename()}>{t("action.rename")}</button>
        <button type="button" className="ns-btn danger" onClick={() => void props.onDelete()}>{t("action.delete")}</button>
      </div>
      {snapshot.novels.length === 0 ? <div className="ns-empty">{t("dock.empty")}</div> : (
        <div className="ns-shelf">
          {snapshot.novels.map((item) => {
            const cover = props.covers[item.meta.slug];
            const active = item.meta.slug === snapshot.activeSlug;
            return (
              <button
                key={item.meta.slug}
                type="button"
                className={active ? "ns-cover-card active" : "ns-cover-card"}
                onClick={() => void props.onSwitch(item.meta.slug)}
              >
                <span className="ns-cover-art">
                  {cover === undefined ? <span className="ns-cover-fallback">{item.meta.title.slice(0, 1)}</span> : (
                    <img src={cover} alt="" />
                  )}
                </span>
                <span className="ns-cover-title">{item.meta.title}</span>
                <span className="ns-meta">{item.meta.bookChars} · {item.chapters.length}</span>
              </button>
            );
          })}
        </div>
      )}
      {novel === undefined ? null : (
        <>
          <div className="ns-group">{t("library.cover")}</div>
          <p className="ns-meta">{t("library.coverHint")}</p>
          <button type="button" className="ns-btn" onClick={() => {
            coverRef.current?.click();
          }}>{t("library.cover")}</button>
          <div className="ns-group">{t("library.publish")}</div>
          <div className="ns-toolbar">
            <button type="button" className="ns-btn" onClick={() => void props.onExport("markdown")}>{t("io.exportMd")}</button>
            <button type="button" className="ns-btn" onClick={() => void props.onExport("txt")}>{t("io.exportTxt")}</button>
            <button type="button" className="ns-btn" onClick={() => void props.onPdf()}>{t("io.exportPdf")}</button>
          </div>
        </>
      )}
      <input
        ref={importRef}
        type="file"
        accept=".txt,.md,.markdown"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file === undefined) return;
          void file.text().then((text) => props.onImport(file.name, text));
        }}
      />
      <input
        ref={coverRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.currentTarget.value = "";
          if (file === undefined) return;
          void props.onCover(file);
        }}
      />
    </div>
  );
}
