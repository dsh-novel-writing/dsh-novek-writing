import { useEffect, useState } from "react";
import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";

import { continueInstruction } from "../core/prompt.ts";
import { setStudioOpen, setStudioTab } from "./chrome.ts";
import type { StudioKey } from "./locales.ts";
import type { SnapshotView } from "./remoteTypes.ts";
import { activeNovel } from "./remoteTypes.ts";
import { bindSessionBridge, sendWritingInstruction } from "./sessionBridge.ts";
import { useModelWriting } from "./writingPhase.ts";
import "./overlay.css";

interface InputState {
  draft: string;
  phase: string;
}

interface InputActions {
  setDraft: (text: string) => void;
  submit: () => void;
}

export type BookChipProps =
  & PropsRuntime<"conversation.input.dock">
  & PropsLocale<"dsh.novel.studio">
  & InjectFace<{
    t: (key: StudioKey) => string;
    getSnapshot: () => Promise<SnapshotView>;
  }>
  & {
    session: { sessionId: string };
    input: InputState;
    inputActions: InputActions;
  };

export function BookChip({ session, input, inputActions, t, getSnapshot }: BookChipProps) {
  const [snapshot, setSnapshot] = useState<SnapshotView>();
  const writing = useModelWriting();
  useEffect(() => bindSessionBridge(session.sessionId, input, inputActions), [session.sessionId, input, inputActions]);
  useEffect(() => {
    let alive = true;
    const load = (): void => {
      void getSnapshot().then((next) => {
        if (alive) setSnapshot(next);
      }).catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, snapshot === undefined ? 600 : 4000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [getSnapshot, snapshot === undefined]);
  const novel = activeNovel(snapshot);
  const label = novel === undefined
    ? t("chip.empty")
    : novel.openPage === undefined
      ? `《${novel.meta.title}》`
      : `《${novel.meta.title}》 · ${novel.openPage.title}`;
  return (
    <div data-plugin="novel-studio" data-surface="chip">
      <button
        type="button"
        className="ns-chip-book"
        onClick={() => {
          setStudioTab("desk");
          setStudioOpen(true);
        }}
      >
        {label}
      </button>
      {novel === undefined ? null : (
        <button
          type="button"
          className="ns-btn"
          disabled={writing}
          onClick={() => {
            setStudioTab("desk");
            setStudioOpen(true);
            sendWritingInstruction(continueInstruction(novel));
          }}
        >
          {t("chip.continue")}
        </button>
      )}
    </div>
  );
}
