import { useEffect, useState } from "react";

type Listener = () => void;

const KEY = "novel-studio.ui";
const WIDTH_MIN = 320;
const WIDTH_DEFAULT = 960;
const CHAT_RESERVE = 240;

interface UiState {
  open: boolean;
  width: number;
  tab: StudioTab;
}

export type StudioTab = "library" | "desk" | "canon";

const listeners = new Set<Listener>();
let state: UiState = load();

function readTab(raw: unknown): StudioTab {
  if (raw === "canon" || raw === "config" || raw === "prompt" || raw === "quality" || raw === "bench") return "canon";
  if (raw === "desk") return "desk";
  return "library";
}

function load(): UiState {
  if (typeof localStorage === "undefined") return { open: false, width: WIDTH_DEFAULT, tab: "library" };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<UiState>;
    return {
      open: raw.open === true,
      width: clamp(typeof raw.width === "number" ? raw.width : WIDTH_DEFAULT),
      tab: readTab(raw.tab),
    };
  } catch {
    return { open: false, width: WIDTH_DEFAULT, tab: "library" };
  }
}

function persist(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(state));
}

function emit(): void {
  persist();
  for (const listener of listeners) listener();
}

function maxWidth(): number {
  if (typeof window === "undefined") return 880;
  return Math.max(WIDTH_MIN, window.innerWidth - measureSidebarWidth() - CHAT_RESERVE);
}

function clamp(px: number): number {
  return Math.min(maxWidth(), Math.max(WIDTH_MIN, Math.round(px)));
}

export function isStudioOpen(): boolean {
  return state.open;
}

export function setStudioOpen(open: boolean): void {
  if (state.open === open) {
    syncStudioChrome(false);
    return;
  }
  state = { ...state, open };
  syncStudioChrome(true);
  emit();
}

export function toggleStudio(): void {
  setStudioOpen(!state.open);
}

export function getStudioWidth(): number {
  return state.width;
}

export function setStudioWidth(px: number): void {
  const next = clamp(px);
  if (state.width === next) {
    syncStudioChrome(false);
    return;
  }
  state = { ...state, width: next };
  syncStudioChrome(false);
  emit();
}

export function getStudioTab(): StudioTab {
  return state.tab;
}

export function setStudioTab(tab: StudioTab): void {
  if (state.tab === tab) return;
  state = { ...state, tab };
  emit();
}

export function subscribeStudio(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useStudioOpen(): boolean {
  const [open, setOpen] = useState(isStudioOpen);
  useEffect(() => subscribeStudio(() => {
    setOpen(isStudioOpen());
  }), []);
  return open;
}

export function useStudioWidth(): number {
  const [width, setWidth] = useState(getStudioWidth);
  useEffect(() => subscribeStudio(() => {
    setWidth(getStudioWidth());
  }), []);
  return width;
}

export function useStudioTab(): StudioTab {
  const [tab, setTab] = useState(getStudioTab);
  useEffect(() => subscribeStudio(() => {
    setTab(getStudioTab());
  }), []);
  return tab;
}

interface InlineStyleSnapshot {
  paddingLeft: string;
  paddingLeftPriority: string;
  transition: string;
  transitionPriority: string;
}

let insetHost: HTMLElement | null = null;
let insetStyleSnapshot: InlineStyleSnapshot | null = null;

function conversationHost(): HTMLElement | null {
  if (typeof document === "undefined" || typeof HTMLElement === "undefined") return null;
  const scrollport = document.querySelector("[data-conversation-scroll]");
  const host = scrollport?.parentElement;
  return host instanceof HTMLElement ? host : null;
}

function restoreInsetHost(): void {
  if (insetHost === null || insetStyleSnapshot === null) return;
  if (insetStyleSnapshot.paddingLeft === "") insetHost.style.removeProperty("padding-left");
  else {
    insetHost.style.setProperty(
      "padding-left",
      insetStyleSnapshot.paddingLeft,
      insetStyleSnapshot.paddingLeftPriority,
    );
  }
  if (insetStyleSnapshot.transition === "") insetHost.style.removeProperty("transition");
  else {
    insetHost.style.setProperty(
      "transition",
      insetStyleSnapshot.transition,
      insetStyleSnapshot.transitionPriority,
    );
  }
  insetHost = null;
  insetStyleSnapshot = null;
}

function captureInsetHost(host: HTMLElement): void {
  if (insetHost === host && insetStyleSnapshot !== null) return;
  restoreInsetHost();
  insetHost = host;
  insetStyleSnapshot = {
    paddingLeft: host.style.getPropertyValue("padding-left"),
    paddingLeftPriority: host.style.getPropertyPriority("padding-left"),
    transition: host.style.getPropertyValue("transition"),
    transitionPriority: host.style.getPropertyPriority("transition"),
  };
}

export function clearConversationInset(): void {
  restoreInsetHost();
}

export function applyConversationInset(width: number, animate = true): HTMLElement | null {
  const host = conversationHost();
  if (host === null) return null;
  captureInsetHost(host);
  if (width <= 0) {
    restoreInsetHost();
    return host;
  }
  host.style.setProperty(
    "transition",
    animate ? "padding-left var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease)" : "none",
  );
  host.style.setProperty("padding-left", `${width}px`);
  return host;
}

export function measureSidebarWidth(): number {
  if (typeof document === "undefined") return 280;
  const candidates = [
    document.querySelector("[data-sidebar]"),
    document.querySelector("[data-layout-sidebar]"),
    document.querySelector("aside"),
  ];
  for (const node of candidates) {
    if (node instanceof HTMLElement) {
      const width = node.getBoundingClientRect().width;
      if (width > 40) return Math.round(width);
    }
  }
  return 280;
}

export function syncStudioChrome(animate = false): void {
  if (typeof document === "undefined") return;
  const next = clamp(state.width);
  if (next !== state.width) {
    state = { ...state, width: next };
    emit();
  }
  document.documentElement.style.setProperty("--ns-sidebar-width", `${measureSidebarWidth()}px`);
  document.documentElement.style.setProperty("--ns-studio-width", `${state.width}px`);
  if (state.open) applyConversationInset(state.width, animate);
  else clearConversationInset();
}

export function releaseShellChrome(): void {
  clearConversationInset();
}
