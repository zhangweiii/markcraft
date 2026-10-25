// MarkCraft website: language + theme toggles, latest release info, small interactions.
const REPO = 'zhangweiii/markcraft';

const ZH = {
  'nav.features': '功能',
  'nav.install': '安装',
  'nav.changelog': '版本发布',
  'hero.pill': '免费开源',
  'hero.title': '在 Chrome 里<br><span class="grad">好好</span>读 Markdown',
  'hero.lede': 'MarkCraft 把本地或网上的任何 <code>.md</code> 文件变成排版精致的文档：图表、公式、大纲一应俱全。还能直接编辑、批注和演示，所有内容都只留在你的电脑上。',
  'cta.download': '下载 Chrome 扩展',
  'cta.github': '在 GitHub 查看',
  'cta.feedback': '反馈意见',
  'hero.fine': '支持 Chrome、Edge、Brave 和 Arc · MIT 许可证 · 无需注册',
  'strip.data': '字节上传——渲染全部在浏览器里完成',
  'strip.diagrams': '种图表引擎：Mermaid、Graphviz、WaveDrom、PlantUML',
  'strip.modes': '种模式：阅读、所见即所得编辑、源码',
  'strip.free': '永久免费——没有试用期、没有限制、没有专业版',
  'f1.eyebrow': '渲染',
  'f1.title': '图表、公式和代码，<br>打开就能看。',
  'f1.body': 'Mermaid 流程图、Graphviz、WaveDrom 和 KaTeX 公式直接在文中渲染，不用构建，也不用复制到别的工具。任何图表都能全屏缩放、拖动，或下载成 SVG、PNG、JPEG。',
  'f1.l1': 'GitHub 风格 Markdown、提示块、脚注和任务列表',
  'f1.l2': '12 种代码高亮主题，代码块显示文件名，一键复制',
  'f1.l3': 'Mintlify 组件：Card、Tabs、Steps、Accordion、CodeGroup',
  'f2.eyebrow': '批注与 AI',
  'f2.title': '像审文档一样批注，<br>再交给 AI 处理。',
  'f2.body': '四种颜色高亮、下划线、评论，任意段落都能标。批注可以一键生成提示词，也可以让 Claude Code 或 Codex 在隔离副本上修改，你看过差异再决定是否应用。',
  'f2.l1': '按类型筛选，未解决的一目了然',
  'f2.l2': '批注刷新后仍在，打印和导出时也会保留',
  'f2.l3': '用清晰的 +/− 差异接受或放弃 Agent 的修改',
  'f3.eyebrow': '编辑',
  'f3.title': '原地编辑，<br>直接保存回文件。',
  'f3.body': '一个快捷键在阅读、所见即所得编辑和源码之间切换。输入时图表和公式实时预览，<kbd>⌘S</kbd> 直接写回磁盘。',
  'f3.l1': '文件变化时自动刷新，并显示可接受的 +/− 差异',
  'f3.l2': '文件夹浏览器：排序、收藏和全文搜索',
  'f3.l3': '粘贴 Markdown、拖放文件、新建文档',
  'f4.eyebrow': '演示与导出',
  'f4.title': '从笔记，<br>到幻灯片和思维导图。',
  'f4.body': '用 <code>---</code> 分页就能全屏演示，字体、颜色、背景都能自定义。也可以把文档结构展开成可交互的思维导图。需要分享时，导出为 Word、HTML 或 PDF。',
  'f4.l1': '演讲者备注、自动播放、键盘和触控翻页',
  'f4.l2': '思维导图可下载为 SVG、PNG 或 JPEG',
  'f4.l3': '导出时保留高亮，可附带目录',
  'f5.eyebrow': '设置',
  'f5.title': '按你喜欢的方式阅读。',
  'f5.body': '浅色、深色、护眼三种主题，五种字体，字号、行高、宽度都可调。每个 Markdown 插件都能单独开关，每个快捷键都能改。界面支持 English 和简体中文。',
  'f5.l1': '随时用 <kbd>⌘,</kbd> 打开快速设置',
  'f5.l2': '设置可导入导出为 JSON',
  'f5.l3': '自动识别从右到左的文字',
  'more.title': '还有这些细节。',
  'g1.t': '大纲', 'g1.d': '随滚动高亮的目录，支持搜索和折叠。',
  'g2.t': '页内查找', 'g2.d': '区分大小写、全词匹配和正则，不会搜到界面文字。',
  'g3.t': '自动刷新', 'g3.d': '监听文件变化，应用前先告诉你改了什么。',
  'g4.t': 'Word、HTML、PDF', 'g4.d': '导出时图表、公式和批注都完整保留。',
  'g5.t': '快捷键', 'g5.d': '21 个操作都能改键，按 <kbd>?</kbd> 查看速查表。',
  'g6.t': '文件夹', 'g6.d': '浏览、按类型或日期分组、收藏和搜索文件夹。',
  'g7.t': '网页 Markdown', 'g7.d': 'GitHub 等网站上的原始 .md 文件也会自动渲染。',
  'g8.t': '本地助手', 'g8.d': '可选：直接保存文件、内置终端和 Agent。',
  'privacy.title': '隐私是默认设置。',
  'privacy.body': '没有账号、没有统计、没有遥测。文档只在你的浏览器里渲染，不会上传到任何地方。唯一可选的联网功能 PlantUML，在你明确同意之前一直关闭。',
  'install.eyebrow': '安装',
  'install.title': '一分钟装好。',
  's1.t': '下载', 's1.d': '下载最新的 <a class="download-link" href="https://github.com/zhangweiii/markcraft/releases/latest">markcraft 压缩包</a> 并解压。',
  's2.t': '加载', 's2.d': '打开 <button class="copy" type="button" data-copy="chrome://extensions">chrome://extensions</button>，开启 <b>开发者模式</b>，点 <b>加载已解压的扩展程序</b>，选择解压后的文件夹。',
  's3.t': '允许本地文件', 's3.d': '在 MarkCraft 的 <b>详情</b> 里开启 <b>允许访问文件网址</b>，然后打开任意 <code>.md</code> 文件即可。',
  'install.source': '想从源码构建？',
  'final.title': '永久免费，完全开源。',
  'final.body': 'MarkCraft 采用 MIT 许可证，公开开发。欢迎提 Issue、想法和 Pull Request。',
  'footer.issues': '问题反馈',
  'footer.license': 'MIT 许可证',
  'footer.by': 'MarkCraft 贡献者',
};

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

// ---------- language ----------
const nodes = [...document.querySelectorAll('[data-i18n]')];
const EN = new Map(nodes.map((n) => [n, n.innerHTML]));
const META = { title: document.title, description: document.querySelector('meta[name="description"]').content };
const META_ZH = {
  title: 'MarkCraft — Chrome 上的 Markdown 阅读器与编辑器',
  description: '免费开源的 Chrome 扩展：把任何 .md 文件变成带图表、公式和大纲的精致文档，支持编辑、批注、演示和导出，全部本地处理。',
};
let release = null;

function setLang(lang) {
  const zh = lang === 'zh';
  document.documentElement.lang = zh ? 'zh-CN' : 'en';
  for (const n of nodes) n.innerHTML = zh ? ZH[n.dataset.i18n] ?? EN.get(n) : EN.get(n);
  document.title = zh ? META_ZH.title : META.title;
  document.querySelector('meta[name="description"]').content = zh ? META_ZH.description : META.description;
  document.getElementById('lang-label').textContent = zh ? 'EN' : '中文';
  applyRelease();
  bindCopy();
}

function initialLang() {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'zh' || q === 'en') return q;
  const saved = store.get('mc-lang');
  if (saved) return saved;
  return /^zh\b/i.test(navigator.language || '') ? 'zh' : 'en';
}

let lang = initialLang();
document.getElementById('lang-toggle').addEventListener('click', () => {
  lang = lang === 'zh' ? 'en' : 'zh';
  store.set('mc-lang', lang);
  setLang(lang);
});

// ---------- theme ----------
const media = matchMedia('(prefers-color-scheme: dark)');
const currentTheme = () => document.documentElement.dataset.theme || (media.matches ? 'dark' : 'light');
document.getElementById('theme-toggle').addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.set('mc-theme', next);
});

// ---------- latest release + stars ----------
function applyRelease() {
  if (!release) return;
  document.querySelectorAll('.version').forEach((el) => (el.textContent = release.tag));
  if (release.zip) document.querySelectorAll('.download-link').forEach((a) => (a.href = release.zip));
}

async function loadRepoInfo() {
  try {
    const [rel, repo] = await Promise.all([
      fetch(`https://api.github.com/repos/${REPO}/releases/latest`).then((r) => (r.ok ? r.json() : null)),
      fetch(`https://api.github.com/repos/${REPO}`).then((r) => (r.ok ? r.json() : null)),
    ]);
    if (rel?.tag_name) {
      const zip = rel.assets?.find((a) => a.name.endsWith('.zip'));
      release = { tag: rel.tag_name, zip: zip?.browser_download_url };
      applyRelease();
    }
    if (repo?.stargazers_count) {
      const s = document.getElementById('stars');
      s.textContent = repo.stargazers_count >= 1000 ? (repo.stargazers_count / 1000).toFixed(1) + 'k' : repo.stargazers_count;
      s.hidden = false;
    }
  } catch {
    // Offline or rate-limited: the static links still point at the releases page.
  }
}

// ---------- copy chips ----------
function bindCopy() {
  document.querySelectorAll('.copy').forEach((b) => {
    b.onclick = async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
        b.classList.add('done');
        setTimeout(() => b.classList.remove('done'), 1500);
      } catch {}
    };
  });
}

// ---------- nav border + reveal ----------
const nav = document.querySelector('.nav');
const onScroll = () => nav.classList.toggle('scrolled', scrollY > 8);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

const targets = document.querySelectorAll('.feature, .strip, .more .card, .steps li, .privacy-inner, .final-inner');
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px' });
  targets.forEach((t) => { t.classList.add('reveal'); io.observe(t); });
}

document.getElementById('year').textContent = new Date().getFullYear();
setLang(lang);
loadRepoInfo();
