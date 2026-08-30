# 小说台（novel-studio）

DeepSeek Harness 插件。气质参考墨庐的文稿台（单栏衬线稿纸、封面书架），细节以仓库 `docs/design.md` v0.1 为准：简单、设定分层、作者改设定、模型只读写正文。

侧栏底部点「小说」后是 **侧栏 | 小说台 | 对话**。三页：

- **书架**：竖版封面、每本书独立配置
- **稿纸**：单栏创作、格式栏、字数、实时续写、自动保存
- **设定**：世界观 / 大纲 / 人物基础与复杂 / 史实库（仅作者可改）

不替换官方聊天主栏，不关掉官方会话列表。颜色只用 `--dsw-alias-*`。

## 数据

默认书库：`~/.dsh/novel-studio/library`。可在插件设置里改。

```
studio/prompt.md
studio/state.json
novels/<slug>/book.md
novels/<slug>/cover.jpg          # 可选竖版封面
novels/<slug>/worldview/timeline.md
novels/<slug>/worldview/background.md
novels/<slug>/outline.md
novels/<slug>/facts/*.md
novels/<slug>/characters/<id>/basic.md
novels/<slug>/characters/<id>/complex.md
novels/<slug>/chapters/*.md
```

系统提示每次注入：时间线 + 背景故事 + 人物基础。大纲、史实库、人物复杂设定不注入，用 `novel_read_outline` / `novel_read_facts` / `novel_read_character` 按需读。

Agent 只应写 `chapters/*.md`（`novel_commit_chapter`）。设定文件给人读、给人改。

## 安装

需要本机已安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（当前插件对齐 `0.1.0-rc.6`）。

```sh
git clone https://github.com/dsh-novel-writing/dsh-novek-writing.git
cd dsh-novek-writing
dsh plugin --profile web add .
```

`dsh plugin` 会把插件装进 web profile。不要 `disabled: true` 官方 `ui-sidebar`。停靠槽位是 footer + `shell.overlay`。

开发时在已 link 的目录里：

```sh
pnpm install
pnpm check
```

## 文档

- 设计：[`docs/design.md`](docs/design.md)
- 每次上传附带的用户原文：[`docs/prompts.md`](docs/prompts.md)

