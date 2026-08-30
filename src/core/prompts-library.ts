import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { writeAtomic } from "./atomic.ts";
import { headingTitle } from "./frontmatter.ts";
import { libraryLayout } from "./paths.ts";

export interface PromptTemplate {
  id: string;
  title: string;
  body: string;
}

export const BUILTIN_TEMPLATES: PromptTemplate[] = [
  {
    id: "cold-fantasy",
    title: "冷硬玄幻",
    body: "短句。少形容词。动作先于心理。每段至少有一个可被看见的细节。禁止解说世界观。",
  },
  {
    id: "urban-night",
    title: "都市夜色",
    body: "当代口语。天气和城市噪音作为节拍器。人物不自我总结。对话打断说明。",
  },
  {
    id: "mystery",
    title: "悬疑克制",
    body: "信息只通过物件和口误泄露。每章结束留下一个具体问题，不是抽象情绪。",
  },
  {
    id: "romance",
    title: "关系推进",
    body: "冲突来自目标不一致，不来自误会电话。亲密场面写动作和停顿，不写形容词堆叠。",
  },
  {
    id: "de-ai",
    title: "去说明腔",
    body: "删掉“不禁/缓缓/心中暗想”。用具体动词替换万能动作。章末不要感叹收束。",
  },
];

export async function listPromptTemplates(root: string): Promise<PromptTemplate[]> {
  const dir = libraryLayout(root).prompts;
  const extra: PromptTemplate[] = [];
  try {
    const names = (await readdir(dir)).filter((name) => name.endsWith(".md"));
    for (const name of names) {
      const { readFile } = await import("node:fs/promises");
      const body = await readFile(join(dir, name), "utf8");
      extra.push({ id: name.replace(/\.md$/, ""), title: headingTitle(body, name), body: body.trim() });
    }
  } catch {
    // no custom templates yet
  }
  return [...BUILTIN_TEMPLATES, ...extra];
}

export async function savePromptTemplate(root: string, id: string, title: string, body: string): Promise<void> {
  const dir = libraryLayout(root).prompts;
  await mkdir(dir, { recursive: true });
  await writeAtomic(join(dir, `${id}.md`), `# ${title}\n\n${body.trim()}\n`);
}

export function renderTemplate(template: PromptTemplate, bookTitle: string): string {
  return template.body.replaceAll("{{title}}", bookTitle);
}
