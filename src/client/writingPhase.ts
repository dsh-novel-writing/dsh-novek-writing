import { useEffect, useState } from "react";

import { getWritingPhase, isModelWriting, subscribeWriting } from "./sessionBridge.ts";

export function useWritingPhase(): string {
  const [phase, setPhase] = useState(getWritingPhase);
  useEffect(() => {
    const sync = (): void => {
      setPhase(getWritingPhase());
    };
    const unsub = subscribeWriting(sync);
    const timer = window.setInterval(sync, 250);
    return () => {
      unsub();
      window.clearInterval(timer);
    };
  }, []);
  return phase;
}

export function useModelWriting(): boolean {
  const phase = useWritingPhase();
  return phase === "submitting" || phase === "adjudicating" || isModelWriting();
}
