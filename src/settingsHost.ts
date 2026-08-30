import Schema from "@deepseek-ai/schemastery";
import { settingsNamespace, type SettingsProvider } from "@deepseek-ai/dsh-settings";

import { NOVEL_STUDIO_SETTINGS_NAMESPACE } from "./settingsContract.ts";

export function registerNovelStudioSettingsNamespace(
  settings: Pick<SettingsProvider, "register">,
): void {
  settings.register(settingsNamespace(NOVEL_STUDIO_SETTINGS_NAMESPACE), Schema.object({}));
}
