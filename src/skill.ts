interface SkillsContext {
  skills: {
    register: (skill: {
      name: string;
      description: string;
      source: "runtime";
      content: string;
      invocation: { modelInvocable: boolean; userInvocable: boolean };
    }) => () => void;
  };
}

export const NOVEL_STUDIO_SKILL = {
  name: "novel-studio",
  description: "用小说台写书：系统提示里已有世界观和人物基础；先读大纲，再读已写章节，再按需读人物。设定只读，章节才可写。",
  source: "runtime" as const,
  invocation: { modelInvocable: true, userInvocable: true },
  content: `# 小说台

## 开始前

1. 用户不知道这个插件能做什么，或你不确定下一步时，先调用 \`novel_guide\`。
2. 侧栏底部「小说」打开的是极简工作台：书架（封面）/ 单栏稿纸 / 设定。
3. **设定只能作者增删改。** 你只读世界观、大纲、人物、史实，不要创建或改写那些文件。
4. 用用户正在使用的语言写作。

## 系统提示里已有什么

- 时间线 + 背景故事（世界观）。情节至少须符合。
- 每个人物的**基础设定**（姓名、年龄、性格）。
- 眼前稿纸：最近一章末尾。

不在系统提示里、需要时再读：

- 大纲：\`novel_read_outline\`（每章开始和结束对照目标）
- 史实库：\`novel_read_facts\`（贴合现实、防乱编）
- 人物复杂设定：\`novel_read_character\` 且 \`layer=complex\`（生平、重大转折、抉择）。默认不要读。

## 写章协议

1. 先 \`novel_read_outline\`。
2. 再看眼前稿纸和已写章节。
3. 再按情节决定是否读人物；无必要只要基础（已在系统提示里）。
4. 用户说续写：先在可见回复里写出下一章全文（Markdown，从标题开始），让稿纸跟着长；写完立刻 \`novel_commit_chapter\`。

## 书库

- 默认 \`~/.dsh/novel-studio/library\`。
- 每本书：\`book.md\`、\`worldview/{timeline,background}.md\`、\`outline.md\`、\`facts/\`、\`characters/<id>/{basic,complex}.md\`、\`chapters/\`。
- 封面：\`cover.jpg|png|webp\`（竖版）。
- 新建 \`novel_create\`，切换 \`novel_switch\`。删除必须用户确认后再 \`novel_delete\` 且 \`confirm=true\`。
`,
};

export function registerNovelStudioSkill(ctx: SkillsContext): () => void {
  return ctx.skills.register(NOVEL_STUDIO_SKILL);
}
