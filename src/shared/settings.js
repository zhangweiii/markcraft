// User preferences (synced) and layout state (local).
export const PLUGIN_DEFAULTS = {
  footnote: true,
  alerts: true,
  taskLists: true,
  katex: true,
  mermaid: true,
  graphviz: true,
  wavedrom: true,
  plantuml: false, // sends diagram source to a server, so opt-in
  emoji: true,
  mark: true, // ==highlight==
  insertion: true, // ++inserted++
  subscript: true, // H~2~O
  superscript: true, // x^2^
  deflist: true,
  abbreviation: true,
  container: true, // ::: tip
  frontMatter: true, // strip YAML front matter from the body
  tables: true, // multiline cells, rowspan/colspan, headerless tables
  typographer: false,
  mintlify: true, // <Card>, <Tabs>, <Steps>, <Accordion>, callouts…
};

export const DEFAULTS = {
  // General
  enabled: true, // master switch for taking over .md pages
  whatsNew: true,
  language: 'auto', // auto | en | zh-CN
  theme: 'auto', // auto | light | dark | sepia
  defaultMode: 'read', // read | edit | source
  autoRefresh: true,
  pollInterval: 1000,
  autoAccept: false, // apply external changes silently instead of showing the diff banner
  renderTxt: true,
  interceptHttp: true,
  celebration: false,
  // Appearance
  fontFamily: 'system',
  fontSize: 16,
  lineHeight: 1.6,
  contentWidth: 1000,
  layout: 'centered', // centered | full
  syntaxTheme: 'auto',
  codeWrap: 'scroll', // scroll | wrap
  codeLineNumbers: false,
  textDirection: 'auto', // auto | ltr | rtl
  stickyHeaders: true,
  linkIndicators: true,
  readingProgress: true,
  showStats: true,
  statsAutoHide: true,
  wrapLongNames: false,
  frontMatterCard: true,
  localizeAlerts: true,
  tocInExport: false,
  lineBreaks: 'commonmark', // commonmark | github
  plugins: PLUGIN_DEFAULTS,
  // Presentation
  presFont: 'default',
  presAccent: '',
  presBackground: '',
  presHeading: '',
  presText: '',
  presImage: '',
  presImageOpacity: 30,
  // PlantUML
  plantumlServer: 'https://www.plantuml.com/plantuml',
  plantumlConsent: false,
  // Files
  excludeFoldersOn: true,
  excludeFolders: ['node_modules', '.git', 'dist', 'build', '__pycache__'],
  // Agent
  agentCli: 'claude', // claude | codex
  // Shortcuts (action -> combo); empty means the default from SHORTCUTS
  shortcuts: {},
};

// Customizable keyboard shortcuts. "Mod" is ⌘ on macOS and Ctrl elsewhere.
export const SHORTCUTS = {
  toggleFiles: { combo: 'Mod+Shift+B', label: 'Toggle Folder Browser sidebar' },
  toggleToc: { combo: 'Mod+Shift+L', label: 'Toggle Table of Contents sidebar' },
  toggleAnnotations: { combo: 'Mod+Alt+A', label: 'Toggle annotation panel' },
  toggleTheme: { combo: 'Mod+Shift+D', label: 'Toggle theme (Light/Dark/Auto)' },
  toggleLayout: { combo: 'Mod+Shift+C', label: 'Toggle layout (Wide/Centered)' },
  toggleRaw: { combo: 'Mod+Shift+U', label: 'View raw data' },
  quickSettings: { combo: 'Mod+,', label: 'Open Quick Settings' },
  searchFolder: { combo: 'Mod+Shift+F', label: 'Search in folder' },
  quickHighlight: { combo: 'Mod+Shift+H', label: 'Quick highlight selected text' },
  comment: { combo: 'Mod+Shift+R', label: 'Comment on selection' },
  handoff: { combo: 'Mod+Shift+Enter', label: 'Hand off review prompt' },
  toggleEdit: { combo: 'Mod+E', label: 'Toggle Read / Edit' },
  sourceMode: { combo: 'Mod+Shift+E', label: 'Source mode' },
  find: { combo: 'Mod+F', label: 'Find' },
  save: { combo: 'Mod+S', label: 'Save' },
  saveAs: { combo: 'Mod+Shift+S', label: 'Save as' },
  open: { combo: 'Mod+O', label: 'Open file' },
  print: { combo: 'Mod+P', label: 'Print / PDF' },
  present: { combo: 'Mod+Alt+P', label: 'Presentation Mode' },
  mindmap: { combo: 'Mod+Alt+M', label: 'Mind Map' },
  scrollTop: { combo: 'Home', label: 'Scroll to top of page' },
};

export const LAYOUT_DEFAULTS = {
  sidebarWidth: 280,
  sidebarOpen: false,
  panelWidth: 340,
  panelOpen: true,
  panelTab: 'outline',
  fxSort: 'name', // name | modified | size
  fxSortDesc: false,
  fxFoldersFirst: true,
  fxShowTxt: true,
  fxGroup: 'none', // none | type | modified
};

function merge(saved = {}) {
  const s = { ...DEFAULTS, ...saved };
  s.plugins = { ...PLUGIN_DEFAULTS, ...(saved.plugins || {}) };
  // Settings written by earlier versions.
  if (saved.math === false) s.plugins.katex = false;
  if (saved.mermaid === false) s.plugins.mermaid = false;
  if (typeof saved.plantumlServer === 'string' && saved.plantumlServer === '') s.plantumlServer = DEFAULTS.plantumlServer;
  return s;
}

export async function getSettings() {
  const { settings } = await chrome.storage.sync.get('settings');
  return merge(settings);
}

export async function setSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.sync.set({ settings: next });
  return next;
}

export async function resetSettings(keys) {
  if (!keys) return chrome.storage.sync.set({ settings: { ...DEFAULTS } });
  const cur = await getSettings();
  for (const k of keys) cur[k] = structuredClone(DEFAULTS[k]);
  await chrome.storage.sync.set({ settings: cur });
}

export async function getLayout() {
  const { layout } = await chrome.storage.local.get('layout');
  return { ...LAYOUT_DEFAULTS, ...(layout || {}) };
}

let layoutTimer;
let pendingLayout = {};
export function saveLayout(patch) {
  Object.assign(pendingLayout, patch);
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(async () => {
    const { layout } = await chrome.storage.local.get('layout');
    await chrome.storage.local.set({ layout: { ...(layout || {}), ...pendingLayout } });
    pendingLayout = {};
  }, 200);
}

export function onSettingsChanged(fn) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) fn(merge(changes.settings.newValue || {}));
  });
}
