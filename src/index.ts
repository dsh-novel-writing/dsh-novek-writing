import type { Context } from "@deepseek-ai/cordis";

import { Config } from "./config.ts";
import { NovelStudioService } from "./service.ts";
import { registerStudioPrompt } from "./hostPrompt.ts";
import { registerNovelStudioSettingsNamespace } from "./settingsHost.ts";
import { registerNovelStudioSkill } from "./skill.ts";
import { registerNovelStudioTools } from "./tools.ts";

export const name = "novel-studio";
export { Config };
export type { Config as ConfigType } from "./config.ts";
export { SLOT_PLAN, additiveSlots, forbiddenSlots } from "./slots.ts";

export function apply(ctx: Context, config: Config): void {
  const service = new NovelStudioService(ctx, config);
  ctx.inject(["settings"], (settingsCtx) => {
    registerNovelStudioSettingsNamespace(settingsCtx.settings);
  });
  ctx.inject(["tools"], (toolsCtx) => {
    registerNovelStudioTools(toolsCtx as never, service);
  });
  ctx.inject(["systemPrompt"], (promptCtx) => {
    registerStudioPrompt(promptCtx as never, service);
  });
  ctx.inject(["skills"], (skillsCtx) => {
    registerNovelStudioSkill(skillsCtx as never);
  });
}
