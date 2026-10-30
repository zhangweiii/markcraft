# MarkCraft — Markdown 阅读器与编辑器（Chrome 扩展）

免费、开源（MIT）。[官网](https://markcraft.cc) · [English](README.md) · [问题反馈](https://github.com/zhangweiii/markcraft/issues)

![MarkCraft 渲染 Markdown 文档：左侧文件栏、Mermaid 图表和右侧大纲](site/assets/screens/hero-light.jpg)

MarkCraft 是一个 Manifest V3 Chrome 扩展，用来阅读、编辑、批注和演示 Markdown 文件。所有处理都在本地完成，不收集任何数据。

## 安装

[添加至 Chrome — Chrome 应用商店](https://chromewebstore.google.com/detail/eibpkekkbhlojpcfbfcihegmhiclfopg)

需要打开本地文件时，在 `chrome://extensions` → MarkCraft → **详情** 中开启 **允许访问文件网址**。

### 从源码安装

```sh
git clone https://github.com/zhangweiii/markcraft.git
cd markcraft
npm install
npm run build          # 输出到 dist/
```

1. 打开 `chrome://extensions`，开启右上角的 **开发者模式**。
2. 点 **加载已解压的扩展程序**，选择 `dist/` 目录。
3. 在 MarkCraft 的 **详情** 页里开启 **允许访问文件网址**（打开本地 `file://` 文件需要这一项）。

## 界面

采用“文档优先”布局：

- **左侧**：文件浏览器。支持排序（名称 / 修改时间 / 大小）、.txt 筛选、按文件名过滤、展开 / 折叠全部、收藏和文件夹内搜索。
- **右侧**：大纲、标注和 Agent 三个标签页。
- **右下角悬浮按钮**：操作面板 ⚡、编辑、布局（居中 / 全宽）、主题、文件栏、目录栏。
- **字数统计**：底部居中的浮动胶囊，接近页尾时会自动隐藏。顶部有阅读进度条。

## 设置（⌘, 或 操作面板 → 打开设置，同时也是扩展选项页）

| 分组 | 内容 |
|---|---|
| 通用 | 语言、主题、打开模式、自动刷新及间隔、直接应用变更、.txt 渲染、远程 Markdown、排除文件夹、庆祝动画 |
| 外观 | 字体、字号、行高、居中 / 全宽、最大宽度、文字方向、代码高亮主题（12 种）、代码换行、行号、阅读进度、字数统计及自动隐藏、表头吸顶、外链标识、元数据卡片、本地化提示块标题、换行方式、长名称换行、导出时附带目录 |
| 插件 | Mintlify 组件（Card/Tabs/Steps/Accordion/CodeGroup/提示框等）、任务列表、高级表格、Front Matter、`==高亮==`、`++插入++`、`~下标~`、`^上标^`、排版美化、Emoji、脚注、定义列表、缩写、`:::` 容器、GitHub 提示块、KaTeX、Mermaid、Graphviz、WaveDrom、PlantUML |
| 演示 | 字体、强调色、背景色、标题色、文字色、背景图片及透明度 |
| PlantUML | 开关、服务器地址、发送数据前的同意 / 撤销 |
| AI 服务商 | API 格式（OpenAI / Anthropic）、Base URL、模型、API Key（只保存在本设备）、测试连接、移除 |
| 快捷键 | 21 个可自定义的快捷键：点“修改”后录制新组合键 |
| 导入 / 导出 | 导出 / 导入设置 JSON、清除缓存、删除全部标注、恢复默认 |

## 功能（按重要程度排列）

### 阅读
- 自动接管 `file://` 和 http(s) 上的原始 `.md` / `.markdown` / `.mdx` 等文件，例如 raw.githubusercontent.com；`.txt` 也可以按 Markdown 渲染（llms.txt、更新日志等）。
- 支持 GFM：表格、任务列表（可点击勾选，会写回源码）、删除线、自动链接、脚注、GitHub 提示块（`> [!NOTE]`）、YAML front matter。
- highlight.js 语法高亮，代码块带一键复制按钮，行号可选。
- KaTeX 数学公式：`$…$`、`$$…$$`、`\(…\)`、`\[…\]`、```` ```math ````。
- 图表：Mermaid、Graphviz（`dot`）、WaveDrom 在本地渲染；PlantUML 需要服务器，默认关闭，开启前会征求同意。
- 大纲（TOC）：带滚动跟随和标题筛选，可折叠，侧栏宽度可拖动并会被记住。
- 查找（⌘F）：高亮所有匹配，可上下跳转，支持区分大小写、全词匹配和正则。
- 图片灯箱：支持图集切换、缩放和平移；图表可以全屏缩放、平移，并下载为 SVG。
- 字数、字符数、阅读时间和阅读进度条；长表格的表头会吸顶；外链有图标标识。
- RTL：逐段自动判断文字方向，也可以手动指定。
- 主题：自动、浅色、深色、护眼；字体、字号和内容宽度都可以调。
- 界面支持简体中文和英文，跟随浏览器语言，也可以在设置里切换。

### 文件
- 文件浏览器：`file://` 文档会自动浏览所在目录，也可以用“打开文件夹”授权任意目录。
- 文件夹收藏，以及文件夹内全文搜索。
- 拖放文件或文件夹即可打开；最近打开的文档会显示在弹出窗口和欢迎页里。
- 变更检测：文件在外部被修改（比如被 AI Agent 改动）后，顶部会出现差异提示条，显示 +/− 统计，可以查看差异、接受或忽略。接受后，改动过的段落会短暂高亮。
- 多个文档就用浏览器标签页（⌘T / ⌘N / ⌘W）；在文件树里 ⌘+点击会在新标签页打开。

### 编辑
- 三种模式：阅读、编辑（Milkdown Crepe 所见即所得，输入 `#`、`**`、`-` 等 Markdown 语法时直接变成格式）和源码。⌘E 切换阅读与编辑，⌘⇧E 切换源码。
- 粘贴的 Markdown 会解析成富文本；在编辑器里，Mermaid 和数学代码块会实时预览。
- 保存（⌘S）和另存为（⇧⌘S），并显示保存状态。
  - 通过“打开文件”或拖放打开的文件会直接写回。
  - `file://` 文件：第一次保存时选一次同一个文件，之后会记住并直接写回。经常编辑的目录可以用“打开文件夹”，一次授权即可。
- 有未保存修改时关闭页面会提醒；front matter 在所见即所得编辑时原样保留。

### 评审与 AI
- 选中文字后会弹出工具条，可以用 4 种颜色高亮、加下划线或写评论（⌘⇧R）。评论按文档保存，并会带进打印、HTML 和 Word 导出。
- 交接（⌘⇧Enter）：根据评审意见生成一段可编辑的提示词，可以复制，也可以直接发给 Agent。
- 内置 Agent：在设置 → AI 服务商中配置服务商（OpenAI 兼容格式或 Anthropic 格式、你自己的 API Key，只保存在本设备）后才能使用；结果以差异形式展示，接受后才应用。

### 演示与导出
- 幻灯片演示（⌥⌘P）：按 `---` 或 h1/h2 分页，支持 4 种主题、演讲者备注（`Note:` 或 `<!-- notes -->`）、全屏、触摸滑动和自动播放。
- 思维导图（⌥⌘M）：交互式，可以展开或折叠，下载为 SVG / PNG / JPEG。
- 导出 Word（.docx）：保留标题、列表、表格、代码、引用、链接和图片，图表会转成图片。
- 导出 HTML、打印 / 存为 PDF（干净的打印版式），也可以复制为富文本或 Markdown。

## 开发

```sh
npm run watch                       # 增量构建
CH="/path/to/Chrome for Testing" npm test   # 端到端测试（Playwright，用 test/fixtures 下的样例）
```

源码结构：`src/detect.js` 是内容脚本，负责识别 Markdown 并跳转到查看器；`src/viewer/*` 是查看器应用；`src/shared/*` 放设置、IndexedDB、i18n 和 AI 服务商调用。
