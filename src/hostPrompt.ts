import { assemblePrompt } from "./core/prompt.ts";
import type { NovelStudioService } from "./service.ts";

interface PromptSectionHost {
  systemPrompt: {
    section: (section: {
      name: string;
      order: number;
      text: string | (() => string);
    }) => () => void;
  };
}

export function registerStudioPrompt(ctx: PromptSectionHost, service: NovelStudioService): void {
  ctx.systemPrompt.section({
    name: "novel-studio:writing",
    order: 115,
    text: () => {
      const library = service.cache;
      if (library === undefined) return "";
      return assemblePrompt(library).writing;
    },
  });
  ctx.systemPrompt.section({
    name: "novel-studio:worldview",
    order: 116,
    text: () => {
      const library = service.cache;
      if (library === undefined) return "";
      return assemblePrompt(library).worldview;
    },
  });
  ctx.systemPrompt.section({
    name: "novel-studio:library",
    order: 120,
    text: () => {
      const library = service.cache;
      if (library === undefined) return "";
      return assemblePrompt(library).catalog;
    },
  });
  ctx.systemPrompt.section({
    name: "novel-studio:open-page",
    order: 118,
    text: () => {
      const library = service.cache;
      if (library === undefined) return "";
      return assemblePrompt(library).openPage;
    },
  });
}
