// UI localization. English strings are the keys; text nodes and title/placeholder
// attributes of the interface are translated in place (document content never is).
const ZH = {
  // top bar & menu
  Read: '阅读', Edit: '编辑', Source: '源码', Save: '保存', More: '更多',
  'Read (⌘E toggles)': '阅读（⌘E 切换）', 'Live WYSIWYG editing (⌘E toggles)': '所见即所得编辑（⌘E 切换）', 'Markdown source (⌘⇧E)': 'Markdown 源码（⌘⇧E）',
  'Toggle sidebar (⌘\\)': '切换侧边栏（⌘\\）', 'Find (⌘F)': '查找（⌘F）', 'Comment on selection (⌘⇧R)': '评论所选内容（⌘⇧R）',
  'Review & agent panel (⌘⇧L)': '评审与 Agent 面板（⌘⇧L）', 'Save (⌘S)': '保存（⌘S）', 'Unsaved changes': '有未保存的修改',
  'Present as slides (⌥⌘P)': '幻灯片演示（⌥⌘P）', 'Mind map (⌥⌘M)': '思维导图（⌥⌘M）',
  'Open file…': '打开文件…', 'Open folder…': '打开文件夹…', 'New document': '新建文档', 'Save as…': '另存为…', 'Reload from disk': '从磁盘重新加载',
  'Present as slides': '幻灯片演示', 'Mind map': '思维导图', 'Export Word (.docx)': '导出 Word（.docx）', 'Export HTML…': '导出 HTML…',
  'Download Markdown': '下载 Markdown', 'Print / Save as PDF…': '打印 / 存为 PDF…', 'Copy as rich text': '复制为富文本', 'Copy Markdown': '复制 Markdown',
  Theme: '主题', Auto: '自动', Light: '浅色', Dark: '深色', Sepia: '护眼', 'View raw file': '查看原始文件', 'Keyboard shortcuts': '键盘快捷键', 'Settings…': '设置…',
  // sidebar
  Outline: '大纲', Files: '文件', 'Filter headings': '筛选标题', 'No headings': '没有标题', 'Parent folder': '上级文件夹',
  'Bookmark this folder': '收藏此文件夹', 'Remove folder bookmark': '取消收藏此文件夹', 'Folder bookmarks': '文件夹收藏', 'Search in folder': '在文件夹中搜索',
  'Open a folder to browse its Markdown files.': '打开一个文件夹以浏览其中的 Markdown 文件。', 'No Markdown files here': '这里没有 Markdown 文件',
  'No bookmarks yet. Open a folder and click ☆.': '还没有收藏。打开文件夹后点击 ☆。', 'Searching…': '搜索中…', Remove: '移除',
  // find
  Find: '查找', 'Find in document': '在文档中查找', 'Match case': '区分大小写', 'Whole word': '全词匹配', 'Regular expression': '正则表达式',
  'Previous (⇧Enter)': '上一个（⇧Enter）', 'Next (Enter)': '下一个（Enter）', 'Close (Esc)': '关闭（Esc）', 'No results': '无结果',
  // panel
  Review: '评审', Agent: 'Agent', Terminal: '终端', Close: '关闭', 'Hand off…': '交接…', 'Hand off review as a prompt (⌘⇧Enter)': '将评审意见生成提示词交接（⌘⇧Enter）',
  'Clear all': '全部清除', 'Ask an agent to change this document': '让 Agent 修改此文档', 'Agent CLI': 'Agent 命令行工具',
  'e.g. Tighten the introduction and add a summary table of the options': '例如：精简引言，并添加一个选项对比表',
  'Copy prompt': '复制提示词', Stop: '停止', Run: '运行', 'The agent edits an isolated copy. You review a +/− diff before anything is applied.': 'Agent 在隔离副本上修改，应用前你可以先审阅 +/− 差异。',
  'Running…': '运行中…', Finished: '已完成', Failed: '失败', 'Proposed changes': '建议的修改', Discard: '放弃', Apply: '应用', 'Apply & Save': '应用并保存',
  'The agent made no changes to the document.': 'Agent 没有修改文档。', 'Check again': '重新检测', Clear: '清空',
  'command (cd works; Ctrl+C stops)': '命令（支持 cd；Ctrl+C 停止）',
  'Native helper not installed.': '尚未安装本地助手。',
  'Running agents and the terminal needs the small local helper that ships with MarkCraft. In a terminal run:': '运行 Agent 和终端需要 MarkCraft 自带的本地助手。请在终端中运行：',
  'then reload this page. Until then, use': '然后刷新此页面。在此之前，可以使用',
  'to hand the task to your agent manually.': '手动把任务交给你的 Agent。',
  'The terminal needs the native helper. Run': '终端需要本地助手。请在 MarkCraft 目录运行',
  'from the MarkCraft folder, then reload.': '，然后刷新页面。',
  // review
  Comment: '评论', Highlight: '高亮', Underline: '下划线', Resolve: '解决', Reopen: '重新打开', Delete: '删除', detached: '已脱离',
  'Highlight yellow': '黄色高亮', 'Highlight green': '绿色高亮', 'Highlight blue': '蓝色高亮', 'Highlight pink': '粉色高亮', 'Comment (⌘⇧R)': '评论（⌘⇧R）', '💬 Comment': '💬 评论',
  'Add a note (optional)': '添加备注（可选）', 'Add a review comment… (⌘Enter to save)': '添加评审意见…（⌘Enter 保存）', Cancel: '取消',
  'The quoted text is no longer in the document': '引用的文字已不在文档中',
  'Select text in the document to highlight, underline or comment on it (': '在文档中选中文字即可高亮、加下划线或评论（',
  ') comments). Annotations are kept per document and appear in print and exports.': ' 评论）。标注按文档保存，并会出现在打印和导出中。',
  'Hand off review': '交接评审意见', 'Edit the prompt, then copy it to your agent or run it with the built-in agent.': '编辑提示词，然后复制给你的 Agent，或用内置 Agent 运行。',
  'Mark comments as resolved': '将评论标记为已解决', 'Send to Agent': '发送给 Agent',
  // banner & diff
  'changed on disk': '已在磁盘上被修改', '— ': '— ', 'you have unsaved edits': '你有未保存的修改', 'View changes': '查看差异', Dismiss: '忽略', Accept: '接受',
  'Keep the version in the editor': '保留编辑器中的版本', 'Changes on disk': '磁盘上的修改', 'Compared with your unsaved buffer.': '与未保存的内容比较。',
  'Compared with the version you are viewing.': '与当前查看的版本比较。', 'Open containing folder…': '打开所在文件夹…',
  // welcome
  'Read, edit and review Markdown — right in Chrome.': '在 Chrome 中直接阅读、编辑和评审 Markdown。', Recent: '最近打开',
  'Drop a Markdown file or folder to open it': '拖放 Markdown 文件或文件夹以打开', 'Allow access': '允许访问',
  'Chrome needs you to confirm access again after a restart.': '浏览器重启后需要你再次确认访问权限。', 'Try again': '重试', 'Open extension settings': '打开扩展设置',
  'Open settings': '打开设置', 'This document is empty.': '此文档为空。', 'Loading editor…': '正在加载编辑器…', 'Front matter': '元数据（Front matter）',
  'Start writing… type / for commands': '开始写作…输入 / 调出命令',
  // toasts
  'Access was not granted': '未获得访问权限', 'Prompt copied — paste it into your agent': '提示词已复制，粘贴给你的 Agent 即可',
  'Prompt copied — paste it into Claude Code, Codex or any agent': '提示词已复制，可粘贴到 Claude Code、Codex 或任意 Agent',
  'Add review comments first (select text, then ⌘⇧R)': '请先添加评审意见（选中文字后按 ⌘⇧R）', 'Select some text in the document first': '请先在文档中选中文字',
  'Switch to Read or Edit mode to comment on text': '请切换到阅读或编辑模式再评论', 'Changes applied — not saved yet': '修改已应用，尚未保存',
  'Reloaded — file changed on disk': '文件已在磁盘上修改，已重新加载', 'Copied as rich text': '已复制为富文本', 'Markdown copied': 'Markdown 已复制',
  'Building Word document…': '正在生成 Word 文档…', 'Nothing to present': '没有可演示的内容', 'Bookmark removed': '已取消收藏',
  'That folder is no longer available': '该文件夹已不可用', 'Not a Markdown file: ': '不是 Markdown 文件：',
  // mind map / presentation / lightbox
  'Expand all': '全部展开', Collapse: '折叠', Fit: '适应', 'Previous (←)': '上一张（←）', 'Next (→)': '下一张（→）', 'Next (→ / Space)': '下一页（→ / 空格）',
  'Zoom out (−)': '缩小（−）', 'Fit (0)': '适应（0）', 'Zoom in (+)': '放大（+）', Download: '下载', 'Fullscreen (zoom & pan)': '全屏（缩放和平移）',
  'Auto-play (A)': '自动播放（A）', 'Auto-play interval': '自动播放间隔', 'Theme (T)': '主题（T）', 'Speaker notes (N)': '演讲者备注（N）', 'Fullscreen (F)': '全屏（F）',
  'Exit (Esc)': '退出（Esc）', 'No speaker notes for this slide.': '此页没有演讲者备注。', 'Copy code': '复制代码',
  // shortcuts dialog
  'Open file': '打开文件', 'Save as': '另存为', 'Print / PDF': '打印 / PDF', 'Toggle Read / Edit': '切换阅读 / 编辑', 'Source mode': '源码模式',
  'Next / previous match': '下一个 / 上一个匹配', 'Toggle sidebar': '切换侧边栏', 'Toggle review / agent panel': '切换评审 / Agent 面板',
  'Comment on selection': '评论所选内容', 'Hand off review prompt': '交接评审提示词',
  'Present as slides (←/→, F fullscreen, N notes, T theme, A auto-play)': '幻灯片演示（←/→ 翻页，F 全屏，N 备注，T 主题，A 自动播放）',
  'New tab / window / close (browser)': '新标签页 / 新窗口 / 关闭（浏览器）', 'This help': '本帮助',
  // popup
  'Recent documents': '最近的文档', 'No recent documents': '没有最近的文档', 'Render this page as Markdown': '将此页面渲染为 Markdown', 'Enable…': '去开启…',
  Settings: '设置', 'Local': '本地',
  'Markdown needs': 'Markdown 需要开启',
  // options
  'MarkCraft Settings': 'MarkCraft 设置', Appearance: '外观', 'Auto (system)': '自动（跟随系统）', Font: '字体', 'Sans-serif': '无衬线', Serif: '衬线', Monospace: '等宽',
  'Font size': '字号', 'Content width': '内容宽度', 'Line numbers in code blocks': '代码块显示行号', Rendering: '渲染', 'Mermaid diagrams': 'Mermaid 图表',
  'KaTeX math (': 'KaTeX 数学公式（', 'Text direction': '文字方向', 'Automatic (per paragraph)': '自动（逐段检测）', 'Left to right': '从左到右', 'Right to left': '从右到左',
  'Open documents in': '打开文档时使用', 'Read mode': '阅读模式', 'Edit (WYSIWYG) mode': '编辑（所见即所得）模式',
  'Show word count, reading time and reading progress': '显示字数、阅读时间和阅读进度',
  'Render raw Markdown served over http(s) (e.g. raw.githubusercontent.com)': '渲染通过 http(s) 提供的原始 Markdown（如 raw.githubusercontent.com）',
  'Render': '渲染', 'files as Markdown (llms.txt, changelogs, notes)': '文件为 Markdown（llms.txt、更新日志、笔记）',
  'PlantUML server': 'PlantUML 服务器',
  'Files & changes': '文件与变更', 'Apply external changes automatically when there are no unsaved edits (otherwise show a diff banner)': '没有未保存修改时自动应用外部变更（否则显示差异提示条）',
  'Check local files every': '检查本地文件的间隔', 'Agent & terminal': 'Agent 与终端', 'Default agent': '默认 Agent', 'Checking native helper…': '正在检测本地助手…',
  Data: '数据', 'Clear recent documents': '清除最近的文档', 'Delete all review comments': '删除所有评审意见', 'Reset settings': '恢复默认设置', 'Saved ✓': '已保存 ✓',
  'Recent documents cleared': '已清除最近的文档', 'Comments deleted': '评论已删除', Language: '语言', 'Automatic (browser)': '自动（跟随浏览器）',
  'Native helper not installed — agent and terminal features are disabled.': '未安装本地助手，Agent 和终端功能不可用。',
  'Native helper not responding.': '本地助手没有响应。',
  // templates
  '{n} words · {c} characters · {m}': '{n} 字 · {c} 字符 · {m}', '< 1 min read': '阅读不到 1 分钟', '{m} min read': '约 {m} 分钟读完',
  'Saved {time}': '已保存 {time}', 'Saved “{name}”': '已保存“{name}”', 'Save failed: {e}': '保存失败：{e}', 'Word export failed: {e}': 'Word 导出失败：{e}',
  'Mind map failed: {e}': '思维导图生成失败：{e}', '{n} files · {m} searched': '{n} 个文件匹配 · 共搜索 {m} 个', 'No matches in {n} files': '在 {n} 个文件中没有匹配',
  'Couldn’t open {name}': '无法打开 {name}', 'Allow access to “{name}”': '允许访问“{name}”', 'Bookmarked “{name}”': '已收藏“{name}”',
  '“{name}” has unsaved changes. Discard them?': '“{name}”有未保存的修改，要放弃吗？', 'Delete all review comments for this document?': '删除此文档的所有评审意见？',
};

const DICTS = { zh: ZH };
let dict = null;

export function setLanguage(lang = 'auto') {
  const l = (lang === 'auto' ? navigator.language : lang) || 'en';
  dict = DICTS[l.toLowerCase().split('-')[0]] || null;
  document.documentElement.lang = dict ? 'zh-CN' : 'en';
}

export function t(s, vars) {
  let out = dict?.[s] ?? s;
  if (vars) out = out.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  return out;
}

// Containers holding user content (documents, file names, logs) are never translated,
// except for the hint messages shown inside them.
const SKIP = '.markdown-body:not(.empty-hint), #source, .present-stage, .mindmap-svg, #term-out, #agent-log, .diff, #doc-name, #doc-path, .composer-quote, .comment-card blockquote, .comment-card textarea, .toc-text, .fx-name, .bm-name, .bm-path, #fx-results .sr-file, .recent, #recent, code, pre, kbd';
const ATTRS = ['title', 'placeholder', 'aria-label'];

function skip(el) {
  if (!el) return true;
  const hit = el.closest(SKIP);
  return !!hit && !el.closest('.empty-hint, .notice');
}

function translateText(node) {
  const raw = node.data;
  const key = raw.trim();
  if (!key || !dict || !(key in dict)) return;
  node.data = raw.replace(key, dict[key]);
}

function translateEl(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute?.(a);
    if (v && dict[v.trim()]) el.setAttribute(a, dict[v.trim()]);
  }
  if (el.tagName === 'OPTION' && dict[el.textContent.trim()]) el.textContent = dict[el.textContent.trim()];
}

export function translateTree(root = document.body) {
  if (!dict) return;
  if (root.nodeType === Node.TEXT_NODE) return skip(root.parentElement) || translateText(root);
  if (root.nodeType !== Node.ELEMENT_NODE || skip(root)) return;
  translateEl(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.nodeType === Node.ELEMENT_NODE && skip(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) translateText(n);
    else translateEl(n);
  }
}

// Translate the static page now and anything the UI adds later.
export function localize() {
  if (!dict) return;
  translateTree(document.body);
  document.title = t(document.title);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes') { if (!skip(r.target)) translateEl(r.target); continue; }
      if (r.type === 'characterData') { if (!skip(r.target.parentElement)) translateText(r.target); continue; }
      r.addedNodes.forEach((n) => translateTree(n));
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
