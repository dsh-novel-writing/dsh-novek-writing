import { useEffect, useState } from "react";
import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";

import type { StudioKey } from "./locales.ts";
import type { SettingsView } from "./remoteTypes.ts";
import "./overlay.css";

export type SettingsCardProps =
  & PropsRuntime<"settings.plugin.item">
  & PropsLocale<"dsh.novel.studio">
  & InjectFace<{
    t: (key: StudioKey) => string;
    getSettings: () => Promise<SettingsView>;
    setLibraryRoot: (path: string) => Promise<void>;
  }>;

export function SettingsCard({ t, getSettings, setLibraryRoot }: SettingsCardProps) {
  const [root, setRoot] = useState("");
  const [hint, setHint] = useState("");
  useEffect(() => {
    void getSettings().then((settings) => {
      setRoot(settings.libraryRoot);
    }).catch((error: unknown) => {
      setHint(error instanceof Error ? error.message : t("error.remote"));
    });
  }, [getSettings, t]);
  return (
    <div data-plugin="novel-studio" data-surface="settings">
      <strong>{t("settings.title")}</strong>
      <label>
        {t("settings.root")}
        <input value={root} onChange={(event) => {
          setRoot(event.target.value);
        }} />
      </label>
      <p className="hint">{t("settings.rootHint")}</p>
      <button
        type="button"
        className="ns-btn"
        onClick={() => {
          void setLibraryRoot(root).then(() => {
            setHint("ok");
          }).catch((error: unknown) => {
            setHint(error instanceof Error ? error.message : "failed");
          });
        }}
      >
        {t("settings.saveRoot")}
      </button>
      {hint === "" ? null : <p className="hint">{hint}</p>}
    </div>
  );
}
