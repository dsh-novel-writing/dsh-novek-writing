interface InputState {
  draft: string;
  phase: string;
}

interface InputActions {
  setDraft: (text: string) => void;
  submit: () => void;
}

interface ActiveBridge {
  sessionId: string;
  input: InputState;
  actions: InputActions;
}

type Listener = () => void;

let active: ActiveBridge | undefined;
let pending: string | undefined;
let requested = false;
const listeners = new Set<Listener>();

export type WritingSendResult = "sent" | "queued" | "busy" | "appended";

function emit(): void {
  for (const listener of listeners) listener();
}

function deliver(text: string): WritingSendResult {
  if (active === undefined) {
    pending = text;
    return "queued";
  }
  if (active.input.phase === "submitting" || active.input.phase === "adjudicating") {
    pending = text;
    requested = true;
    emit();
    return "busy";
  }
  if (active.input.draft.trim() !== "") {
    active.actions.setDraft(`${active.input.draft.trim()}\n\n${text}`);
    requested = true;
    emit();
    return "appended";
  }
  active.actions.setDraft(text);
  active.actions.submit();
  requested = true;
  emit();
  return "sent";
}

export function bindSessionBridge(sessionId: string, input: InputState, actions: InputActions): () => void {
  const bridge = { sessionId, input, actions };
  active = bridge;
  emit();
  if (pending !== undefined) {
    const text = pending;
    pending = undefined;
    queueMicrotask(() => {
      deliver(text);
    });
  }
  return () => {
    if (active === bridge) active = undefined;
    emit();
  };
}

export function sendWritingInstruction(text: string): WritingSendResult {
  return deliver(text);
}

export function getWritingPhase(): string {
  return active?.input.phase ?? "idle";
}

export function isModelWriting(): boolean {
  const phase = getWritingPhase();
  if (requested) return true;
  return phase === "submitting" || phase === "adjudicating";
}

export function clearWritingRequest(): void {
  if (!requested) return;
  requested = false;
  emit();
}

export function subscribeWriting(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
