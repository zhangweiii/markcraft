// User preferences (synced) and layout state (local).
export const DEFAULTS = {
  theme: 'auto', // auto | light | dark | sepia
  fontFamily: 'sans', // sans | serif | mono
  fontSize: 16,
  contentWidth: 860,
  defaultMode: 'read', // read | edit | source
  interceptHttp: true, // render .md served over http(s) too
  renderTxt: true, // render .txt files (llms.txt, changelogs, notes) as Markdown
  showStats: true, // word count, reading time and progress
  textDirection: 'auto', // auto | ltr | rtl
  autoAccept: false, // apply external changes without the banner when there are no unsaved edits
  pollInterval: 1000,
  mermaid: true,
  plantumlServer: '', // empty = off; PlantUML needs a server, so it is opt-in
  math: true,
  codeLineNumbers: false,
  agentCli: 'claude', // claude | codex
  agentIsolated: true,
};

export const LAYOUT_DEFAULTS = {
  sidebarWidth: 270,
  sidebarOpen: true,
  sidebarTab: 'outline',
  panelWidth: 360,
  panelOpen: false,
  panelTab: 'comments',
};

export async function getSettings() {
  const { settings } = await chrome.storage.sync.get('settings');
  return { ...DEFAULTS, ...(settings || {}) };
}

export async function setSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.sync.set({ settings: next });
  return next;
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
    if (area === 'sync' && changes.settings) fn({ ...DEFAULTS, ...(changes.settings.newValue || {}) });
  });
}
