import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";

import { isStudioOpen, toggleStudio, useStudioOpen } from "./chrome.ts";
import type { StudioKey } from "./locales.ts";
import "./overlay.css";

export type FooterActionProps =
  & PropsRuntime<"sidebar.footer.action">
  & PropsLocale<"dsh.novel.studio">
  & InjectFace<{ t: (key: StudioKey) => string }>;

export function FooterAction({ wide, t }: FooterActionProps) {
  const open = useStudioOpen();
  const label = open ? t("footer.close") : t("footer.open");
  return (
    <div data-plugin="novel-studio" data-surface="footer" className={wide ? "" : "rail"}>
      <button
        type="button"
        className={open ? "active" : ""}
        aria-label={label}
        title={label}
        onClick={() => {
          toggleStudio();
        }}
      >
        <span className="ns-mark" />
        {wide ? t("footer.label") : null}
      </button>
    </div>
  );
}

export function footerIsOpen(): boolean {
  return isStudioOpen();
}
