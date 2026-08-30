import { extractLiveChapter } from "../core/live-chapter.ts";

export function observeLiveChapter(onChange: (text: string) => void, afterChapter = 0): () => void {
  let last = "";
  const observer = new MutationObserver(() => {
    read();
  });
  let observed: Element | null = null;
  const read = (): void => {
    const host = document.querySelector("[data-conversation-scroll]");
    if (host !== observed) {
      observer.disconnect();
      observed = host;
      if (host !== null) observer.observe(host, { subtree: true, childList: true, characterData: true });
    }
    if (!(host instanceof HTMLElement)) return;
    const next = extractLiveChapter(host.innerText, afterChapter);
    if (next === undefined || next === last) return;
    last = next;
    onChange(next);
  };
  read();
  const timer = window.setInterval(read, 280);
  return () => {
    observer.disconnect();
    window.clearInterval(timer);
  };
}
