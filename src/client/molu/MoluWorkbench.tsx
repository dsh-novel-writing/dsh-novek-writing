import { useEffect, useRef } from "react";

import { MOLU_HTML } from "./markup.ts";
import { bootMoluApp, type MoluRuntimeStore } from "./runtime.js";
import { MOLU_CSS } from "./styles.ts";

export interface MoluLibraryView {
  format: number;
  savedAt: string;
  books: unknown[];
  activeId: string | null;
}

export interface MoluWorkbenchProps {
  getLibrary: () => Promise<MoluLibraryView>;
  saveLibrary: (books: unknown[]) => Promise<MoluLibraryView>;
}

export function MoluWorkbench(props: MoluWorkbenchProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const saveRef = useRef(props.saveLibrary);
  saveRef.current = props.saveLibrary;
  const getRef = useRef(props.getLibrary);
  getRef.current = props.getLibrary;

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return undefined;
    let disposed = false;
    let stop: (() => void) | undefined;
    void (async () => {
      const snapshot = await getRef.current();
      if (disposed) return;
      const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>${MOLU_CSS}</style>${MOLU_HTML}`;
      host.dataset.theme = "light";
      host.classList.add("view-home");
      const store: MoluRuntimeStore = {
        FORMAT: snapshot.format,
        usable: true,
        loadSync: () => ({
          books: snapshot.books,
          savedAt: snapshot.savedAt,
          format: snapshot.format,
        }),
        loadAsync: async () => null,
        save: async (books) => {
          try {
            const saved = await saveRef.current(books);
            return { ls: true, idb: true, savedAt: saved.savedAt };
          } catch (cause) {
            return {
              ls: false,
              idb: false,
              savedAt: new Date().toISOString(),
              error: cause instanceof Error ? cause.message : String(cause),
            };
          }
        },
        describe: () => "DeepSeek Harness 书库目录",
      };
      stop = bootMoluApp(host, store);
    })().catch(() => undefined);
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);

  return <div className="molu-host" ref={hostRef} />;
}
