// Schema-driven settings panel, shared by the options page and the in-page Quick Settings modal.
import { DEFAULTS, PLUGIN_DEFAULTS, SHORTCUTS, getSettings, setSettings, resetSettings } from './settings.js';
import { db } from './db.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import * as llm from './llm.js';

const isMac = navigator.platform.includes('Mac');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const FONTS = {
  system: 'Default (system)',
  sans: 'Sans-serif',
  serif: 'Serif',
  humanist: 'Humanist',
  rounded: 'Rounded',
  mono: 'Monospace',
};

export const SYNTAX_THEMES = {
  auto: 'MarkCraft (auto light/dark)',
  github: 'GitHub',
  'github-dark': 'GitHub Dark',
  'atom-one-light': 'Atom One Light',
  'atom-one-dark': 'Atom One Dark',
  vs: 'Visual Studio',
  vs2015: 'VS 2015 (dark)',
  monokai: 'Monokai',
  nord: 'Nord',
  'tokyo-night-dark': 'Tokyo Night',
  'stackoverflow-light': 'Stack Overflow Light',
  xcode: 'Xcode',
};

const PLUGINS = [
  ['Core Rendering', [['taskLists', 'Task Lists', 'Render GitHub-style task lists with checkboxes'], ['tables', 'Advanced Tables', 'Extended table features: multiline cells, rowspan/colspan, headerless tables'], ['frontMatter', 'Front Matter', 'Strip YAML front matter (---) blocks instead of rendering them as text']]],
  ['Text Formatting', [['mark', 'Highlight', 'Render highlighted text with ==text== syntax'], ['insertion', 'Insertion', 'Render insertion with ++text++ syntax'], ['subscript', 'Subscript', 'Render subscript with ~text~ syntax (e.g., H~2~O)'], ['superscript', 'Superscript', 'Render superscript with ^text^ syntax (e.g., x^2^)'], ['typographer', 'Typographer', 'Auto-convert typography: (c) → ©, -- → –, --- → —, and smart quotes'], ['emoji', 'Emoji', 'Convert emoji shortcodes like :smile: to unicode emoji']]],
  ['Extended Syntax', [['footnote', 'Footnotes', 'Add footnotes with [^1] syntax'], ['deflist', 'Definition Lists', 'Support for definition lists (Term / : definition)'], ['abbreviation', 'Abbreviations', 'Define abbreviations with *[abbr]: definition syntax'], ['container', 'Custom Containers', 'Create custom block containers with ::: syntax'], ['alerts', 'GitHub Alerts', 'Render [!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION] blocks']]],
  ['Advanced Features', [['katex', 'Math Equations', 'Render LaTeX math equations ($...$ inline, $$...$$ display)'], ['mermaid', 'Mermaid Diagrams', 'Render flowcharts, sequence diagrams, class diagrams, and more'], ['graphviz', 'Graphviz Diagrams', 'Render DOT-language graphs locally via WebAssembly'], ['wavedrom', 'WaveDrom Diagrams', 'Render WaveJSON timing diagrams locally'], ['plantuml', 'PlantUML Diagrams', 'Render PlantUML diagrams via a diagram server (consent required)'], ['mintlify', 'Mintlify Components', 'Render Mintlify MDX components: Card, CardGroup, Tabs, Steps, Accordion, CodeGroup, callouts']]],
];

// Field: [key, type, label, description, extra]
const SECTIONS = [
  {
    id: 'general', icon: 'sliders', title: 'General',
    groups: [
      ['', [
        ['enabled', 'toggle', 'Extension Enabled', 'Render Markdown files automatically when you open them'],
        ['language', 'select', 'Language', "Language of MarkCraft's interface", { options: { auto: 'Automatic (browser)', en: 'English', 'zh-CN': '简体中文' }, reload: true }],
        ['theme', 'segment', 'Theme', '', { options: { auto: 'Auto', light: 'Light', dark: 'Dark', sepia: 'Sepia' } }],
        ['defaultMode', 'segment', 'Open documents in', '', { options: { read: 'Read', edit: 'Edit', source: 'Source' } }],
      ]],
      ['Files', [
        ['autoRefresh', 'toggle', 'Auto-Refresh', 'Automatically reload when the file changes'],
        ['pollInterval', 'select', 'Refresh interval', 'How often to check for file changes while Auto-Refresh is on', { options: { 500: '0.5 s', 1000: '1 s', 2000: '2 s', 5000: '5 s', 10000: '10 s' }, number: true, dep: 'autoRefresh' }],
        ['autoAccept', 'toggle', 'Apply changes without asking', 'When there are no unsaved edits, apply external changes directly instead of showing the diff banner', { dep: 'autoRefresh' }],
        ['renderTxt', 'toggle', 'Render .txt as Markdown', 'Automatically render .txt files as formatted Markdown'],
        ['interceptHttp', 'toggle', 'Render remote Markdown', 'Render raw Markdown served over http(s), e.g. raw.githubusercontent.com'],
        ['excludeFoldersOn', 'toggle', 'Exclude Folders', 'Skip specified folders during scanning to improve performance'],
        ['excludeFolders', 'list', '', '', { dep: 'excludeFoldersOn', placeholder: 'Add folder name...' }],
      ]],
      ['Updates', [['whatsNew', 'toggle', "What's New Notification", 'Show a one-time summary of new features and fixes when MarkCraft updates'], ['celebration', 'toggle', 'Celebration animation', 'Show confetti animation when you reach the end of a document']]],
    ],
    reset: ['enabled', 'whatsNew', 'language', 'theme', 'defaultMode', 'autoRefresh', 'pollInterval', 'autoAccept', 'renderTxt', 'interceptHttp', 'excludeFoldersOn', 'excludeFolders', 'celebration'],
  },
  {
    id: 'appearance', icon: 'palette', title: 'Appearance',
    groups: [
      ['Reading', [
        ['fontFamily', 'select', 'Font Family', '', { options: FONTS }],
        ['fontSize', 'range', 'Font Size', '', { min: 12, max: 24, step: 1, unit: 'px' }],
        ['lineHeight', 'range', 'Line Height', '', { min: 1.2, max: 2.2, step: 0.05 }],
        ['layout', 'segment', 'Layout', '', { options: { centered: 'Centered', full: 'Full width' } }],
        ['contentWidth', 'range', 'Max Width', 'Limit content width for better readability. Only applies to centered layout mode.', { min: 560, max: 1600, step: 20, unit: 'px', dep: (s) => s.layout === 'centered' }],
        ['textDirection', 'segment', 'Text Direction', 'Direction of the document content. Auto detects it per block from the text itself.', { options: { auto: 'Auto (detect)', ltr: 'Left to right', rtl: 'Right to left' } }],
      ]],
      ['Code Blocks', [
        ['syntaxTheme', 'select', 'Syntax Theme', 'Color theme for code blocks. The MarkCraft theme adapts to light/dark mode.', { options: SYNTAX_THEMES }],
        ['codeWrap', 'segment', 'Code Block Display', 'Scroll keeps formatting with a horizontal scrollbar; Wrap breaks long lines.', { options: { scroll: 'Scroll', wrap: 'Wrap' } }],
        ['codeLineNumbers', 'toggle', 'Line numbers', 'Show line numbers in code blocks'],
      ]],
      ['Reading Aids', [
        ['readingProgress', 'toggle', 'Show reading progress', 'Display a progress bar at the top showing your reading position'],
        ['showStats', 'toggle', 'Show word count', 'Display word count, character count, and reading time'],
        ['statsAutoHide', 'toggle', 'Auto-hide word count', 'Hide the word count bar when scrolled near the bottom of the page', { dep: 'showStats' }],
        ['stickyHeaders', 'toggle', 'Sticky Table Headers', 'Keep the header row visible while scrolling long tables'],
        ['linkIndicators', 'toggle', 'External Link Indicators', 'Show icons next to external links'],
      ]],
      ['Content', [
        ['frontMatterCard', 'toggle', 'Display Metadata', 'Show YAML front matter as a formatted metadata card at the top of the document'],
        ['localizeAlerts', 'toggle', 'Localize Alert Titles', 'Display alert block titles in the selected language'],
        ['lineBreaks', 'segment', 'Line Breaks', 'CommonMark treats single newlines as spaces; GitHub style converts them to line breaks.', { options: { commonmark: 'CommonMark', github: 'GitHub style' } }],
      ]],
      ['Sidebar', [['wrapLongNames', 'toggle', 'Wrap Long Names', 'Wrap long file names and headings in the sidebars instead of truncating them']]],
      ['Export', [['tocInExport', 'toggle', 'Table of contents in PDF and HTML export', 'Adds a table of contents at the top of PDF (via print) and HTML exports.']]],
    ],
    reset: ['fontFamily', 'fontSize', 'lineHeight', 'layout', 'contentWidth', 'textDirection', 'syntaxTheme', 'codeWrap', 'codeLineNumbers', 'readingProgress', 'showStats', 'statsAutoHide', 'stickyHeaders', 'linkIndicators', 'frontMatterCard', 'localizeAlerts', 'lineBreaks', 'wrapLongNames', 'tocInExport'],
  },
  { id: 'plugins', icon: 'puzzle', title: 'Plugins', plugins: true, reset: ['plugins'] },
  {
    id: 'presentation', icon: 'present', title: 'Presentation',
    groups: [['', [
      ['presFont', 'select', 'Font', 'Font for slide content', { options: { default: 'Theme default', ...FONTS } }],
      ['presAccent', 'color', 'Accent Color', 'Progress bar, links, inline code, and blockquotes'],
      ['presBackground', 'color', 'Background Color', 'Slide background color (leave empty for theme default)'],
      ['presHeading', 'color', 'Heading Color', 'Heading text color (h1, h2, h3)'],
      ['presText', 'color', 'Text Color', 'Body text color'],
      ['presImage', 'text', 'Background Image', 'Image URL for slide background (leave empty for none)', { placeholder: 'https://…' }],
      ['presImageOpacity', 'range', 'Image Opacity', 'How visible the background image is (0% = hidden, 100% = full)', { min: 0, max: 100, step: 5, unit: '%', dep: (s) => !!s.presImage }],
    ]]],
    reset: ['presFont', 'presAccent', 'presBackground', 'presHeading', 'presText', 'presImage', 'presImageOpacity'],
  },
  {
    id: 'plantuml', icon: 'workflow', title: 'PlantUML',
    groups: [['', [
      ['plantumlEnabled', 'toggle', 'Render PlantUML diagrams', 'Enable inline rendering of ```plantuml code blocks. Requires consent for the diagram server below.'],
      ['plantumlServer', 'text', 'PlantUML server URL', 'Base URL of a PlantUML server, e.g. https://www.plantuml.com/plantuml (community service) or a self-hosted instance.', { placeholder: 'https://www.plantuml.com/plantuml' }],
      ['plantumlConsent', 'consent', '', ''],
    ]]],
    reset: ['plantumlServer', 'plantumlConsent'],
  },
  { id: 'ai', icon: 'agent', title: 'AI Provider', ai: true },
  { id: 'shortcuts', icon: 'keyboard', title: 'Shortcuts', shortcuts: true, reset: ['shortcuts'] },
  { id: 'data', icon: 'wrench', title: 'Import / Export', data: true },
];

export function comboLabel(combo) {
  return combo
    .split('+')
    .map((k) => (k === 'Mod' ? (isMac ? '⌘' : 'Ctrl') : k === 'Shift' ? (isMac ? '⇧' : 'Shift') : k === 'Alt' ? (isMac ? '⌥' : 'Alt') : k === 'Enter' ? '↵' : k))
    .join(isMac ? '' : '+');
}

export function comboFromEvent(e) {
  const parts = [];
  if (isMac ? e.metaKey : e.ctrlKey) parts.push('Mod');
  if (isMac && e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  let key = e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : e.key;
  if (key === ' ') key = 'Space';
  if (key === 'Comma') key = ',';
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(key)) return null;
  if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join('+');
}

export async function mountSettings(root, { compact = false, onClose } = {}) {
  let s = await getSettings();
  let active = sessionStorage.getItem('mc-settings-tab') || 'general';
  let filter = '';
  const recording = { key: null };
  // Unsaved AI provider form. The saved API key is never put back into the page.
  let ai = null;
  const aiDraft = () => {
    if (!ai) {
      const p = llm.getProvider();
      ai = { format: p?.format || 'openai', baseUrl: p?.baseUrl || llm.FORMATS.openai.baseUrl, model: p?.model || '', apiKey: '', status: '', ok: false };
      if (!p) ai.model = llm.FORMATS[ai.format].model;
    }
    return ai;
  };
  // A blank key field keeps the saved key, but only while the host stays the same:
  // pointing the provider at another server always requires typing the key again.
  const aiCandidate = () => {
    const d = aiDraft();
    const saved = llm.getProvider();
    let apiKey = d.apiKey.trim();
    if (!apiKey && saved && saved.format === d.format && llm.providerHost(saved) === llm.providerHost({ baseUrl: d.baseUrl.trim() })) apiKey = saved.apiKey;
    return { format: d.format, baseUrl: d.baseUrl.trim(), model: d.model.trim(), apiKey };
  };

  root.classList.add('mc-settings');
  root.innerHTML = `
    <nav class="st-nav">
      <div class="st-brand">${icon('settings', 20)}<div><b>${t('Settings')}</b><span>${t('Customize your reading experience')}</span></div></div>
      <div class="st-search">${icon('search', 15)}<input type="search" placeholder="${t('Search settings')}"></div>
      <div class="st-tabs">${SECTIONS.map((sec) => `<button data-tab="${sec.id}">${icon(sec.icon, 17)}<span>${t(sec.title)}</span></button>`).join('')}</div>
    </nav>
    <section class="st-body"></section>
    ${onClose ? `<button class="st-close" title="${t('Close')}">${icon('x', 18)}</button>` : ''}`;
  const body = root.querySelector('.st-body');
  root.querySelector('.st-close')?.addEventListener('click', onClose);
  root.querySelector('.st-search input').addEventListener('input', (e) => { filter = e.target.value.trim().toLowerCase(); render(); });
  root.querySelector('.st-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    active = b.dataset.tab;
    sessionStorage.setItem('mc-settings-tab', active);
    render();
  });

  const value = (key) => (key === 'plantumlEnabled' ? s.plugins.plantuml : s[key]);
  const depOk = (dep) => (!dep ? true : typeof dep === 'function' ? dep(s) : !!s[dep]);

  function field([key, type, label, desc, x = {}]) {
    const v = value(key);
    const head = label ? `<div class="st-label"><b>${esc(t(label))}</b>${desc ? `<p>${esc(t(desc))}</p>` : ''}</div>` : '';
    let ctl = '';
    if (type === 'toggle') ctl = `<label class="switch"><input type="checkbox" data-key="${key}" ${v ? 'checked' : ''}><span></span></label>`;
    if (type === 'select') ctl = `<select data-key="${key}" ${x.number ? 'data-number' : ''}>${Object.entries(x.options).map(([k, l]) => `<option value="${k}" ${String(v) === String(k) ? 'selected' : ''}>${esc(t(l))}</option>`).join('')}</select>`;
    if (type === 'segment') ctl = `<div class="segment" data-key="${key}">${Object.entries(x.options).map(([k, l]) => `<button data-v="${k}" class="${String(v) === k ? 'on' : ''}">${esc(t(l))}</button>`).join('')}</div>`;
    if (type === 'range') ctl = `<div class="range"><input type="range" data-key="${key}" min="${x.min}" max="${x.max}" step="${x.step}" value="${v}"><output>${v}${x.unit || ''}</output></div>`;
    if (type === 'text') ctl = `<input type="text" class="text" data-key="${key}" value="${esc(v || '')}" placeholder="${esc(x.placeholder || '')}" spellcheck="false">`;
    if (type === 'color') ctl = `<div class="color"><input type="color" data-key="${key}" value="${v || '#000000'}" ${v ? '' : 'data-empty'}><button class="link" data-clear="${key}" ${v ? '' : 'hidden'}>${t('Theme default')}</button>${v ? '' : `<span class="muted">${t('Theme default')}</span>`}</div>`;
    if (type === 'list') {
      ctl = `<div class="chips">${(v || []).map((f, i) => `<span class="chip">${esc(f)}<button data-rm="${key}" data-i="${i}">×</button></span>`).join('')}
        <input type="text" class="chip-input" data-add="${key}" placeholder="${esc(t(x.placeholder || ''))}"></div>`;
    }
    if (type === 'consent') {
      return `<div class="st-row st-consent ${s.plantumlConsent ? 'ok' : ''}">${icon(s.plantumlConsent ? 'check' : 'info', 16)}<span>${t(s.plantumlConsent ? 'Consent granted - diagram source may be sent to the configured server.' : 'Consent not granted - diagrams render as code blocks until you agree.')}</span>
        <button class="btn small" data-consent="${s.plantumlConsent ? 'revoke' : 'grant'}">${t(s.plantumlConsent ? 'Revoke consent' : 'Agree')}</button></div>`;
    }
    const disabled = !depOk(x.dep);
    return `<div class="st-row ${type === 'list' || type === 'text' ? 'stack' : ''} ${disabled ? 'disabled' : ''}" data-search="${esc((t(label) + ' ' + t(desc) + ' ' + label + ' ' + desc).toLowerCase())}">${head}<div class="st-ctl">${ctl}</div></div>`;
  }

  function sectionHtml(sec) {
    let html = '';
    if (sec.groups) {
      for (const [title, fields] of sec.groups) {
        const rows = fields.map(field).join('');
        html += `<div class="st-group">${title ? `<h3>${esc(t(title))}</h3>` : ''}<div class="st-card">${rows}</div></div>`;
      }
    }
    if (sec.plugins) {
      html += `<p class="st-intro">${t('Enable or disable markdown rendering plugins')}</p>`;
      for (const [cat, items] of PLUGINS) {
        html += `<div class="st-group"><h3>${esc(t(cat))}</h3><div class="st-card">${items.map(([k, l, d]) => `<div class="st-row" data-search="${esc((t(l) + ' ' + t(d) + ' ' + l).toLowerCase())}"><div class="st-label"><b>${esc(t(l))}</b><p>${esc(t(d))}</p></div><div class="st-ctl"><label class="switch"><input type="checkbox" data-plugin="${k}" ${s.plugins[k] ? 'checked' : ''}><span></span></label></div></div>`).join('')}</div></div>`;
      }
    }
    if (sec.shortcuts) {
      html += `<p class="st-intro">${t('Click Change, then press the new key combination.')} ${t('Presentation and Mind Map shortcuts use standard conventions and cannot be customized.')}</p><div class="st-group"><div class="st-card">`;
      for (const [id, def] of Object.entries(SHORTCUTS)) {
        const cur = s.shortcuts[id] || def.combo;
        const rec = recording.key === id;
        html += `<div class="st-row" data-search="${esc((t(def.label) + ' ' + def.label).toLowerCase())}"><div class="st-label"><b>${esc(t(def.label))}</b>${s.shortcuts[id] ? `<p class="mod">${t('Customized')}</p>` : ''}</div>
          <div class="st-ctl"><kbd class="combo ${rec ? 'rec' : ''}">${rec ? t('Press keys...') : comboLabel(cur)}</kbd><button class="btn small" data-record="${id}">${t('Change')}</button>${s.shortcuts[id] ? `<button class="btn small ghost" data-unrecord="${id}">${t('Reset')}</button>` : ''}</div></div>`;
      }
      html += '</div></div>';
    }
    if (sec.ai) {
      const d = aiDraft();
      const saved = llm.getProvider();
      const row = (label, desc, ctl, stack = true) => `<div class="st-row ${stack ? 'stack' : ''}" data-search="${esc((t(label) + ' ' + t(desc) + ' ' + label + ' ai provider api key openai anthropic').toLowerCase())}"><div class="st-label"><b>${esc(t(label))}</b>${desc ? `<p>${esc(t(desc))}</p>` : ''}</div><div class="st-ctl">${ctl}</div></div>`;
      html += `<p class="st-intro">${t('Required for the built-in agent. The document you hand to the agent is sent to this provider. Your API key is stored only in this browser on this device: it is not synced, not included in settings exports, and only sent to the base URL below.')}</p>
      <div class="st-group"><div class="st-card">
        ${row('API format', 'Use OpenAI for any OpenAI-compatible service (OpenAI, DeepSeek, OpenRouter, Ollama…).', `<div class="segment">${Object.entries(llm.FORMATS).map(([k, f]) => `<button data-ai-format="${k}" class="${d.format === k ? 'on' : ''}">${esc(f.label)}</button>`).join('')}</div>`, false)}
        ${row('Base URL', d.format === 'anthropic' ? 'e.g. https://api.anthropic.com' : 'e.g. https://api.openai.com/v1 — requests go to <Base URL>/chat/completions', `<input type="text" class="text" data-ai="baseUrl" value="${esc(d.baseUrl)}" placeholder="${esc(llm.FORMATS[d.format].baseUrl)}" spellcheck="false" autocomplete="off">`)}
        ${row('Model', d.format === 'anthropic' ? 'e.g. claude-opus-5-5' : 'e.g. gpt-5, deepseek-chat', `<input type="text" class="text" data-ai="model" value="${esc(d.model)}" placeholder="${esc(llm.FORMATS[d.format].model || 'model name')}" spellcheck="false" autocomplete="off">`)}
        ${row('API key', saved ? 'A key is saved. Leave empty to keep it (only while the host stays the same).' : 'Stored only on this device.', `<input type="password" class="text" data-ai="apiKey" value="${esc(d.apiKey)}" placeholder="${esc(saved ? '••••••••' : 'sk-…')}" spellcheck="false" autocomplete="off">`)}
        <div class="st-row"><div class="st-label"><b>${t(saved ? 'Configured' : 'Not configured')}</b><p class="ai-status ${d.ok ? 'ok' : ''}">${esc(d.status || (saved ? `${llm.providerHost(saved)} · ${saved.model}` : t('The built-in agent is unavailable until a provider is saved.')))}</p></div>
          <div class="st-ctl">${saved ? `<button class="btn small danger" data-op="ai-clear">${t('Remove')}</button>` : ''}<button class="btn small" data-op="ai-test">${t('Test')}</button><button class="btn small primary" data-op="ai-save">${t('Save')}</button></div></div>
      </div></div>`;
    }
    if (sec.data) {
      html += `<div class="st-group"><h3>${t('Import / Export')}</h3><div class="st-card">
        <div class="st-row"><div class="st-label"><b>${t('Export Settings')}</b><p>${t('Download your settings as a JSON file.')}</p></div><div class="st-ctl"><button class="btn small" data-op="export">${icon('download', 15)} ${t('Export Settings')}</button></div></div>
        <div class="st-row"><div class="st-label"><b>${t('Import Settings')}</b><p>${t('Import settings from a previously exported JSON file. This will replace your current settings.')}</p></div><div class="st-ctl"><button class="btn small" data-op="import">${icon('upload', 15)} ${t('Import Settings')}</button></div></div>
      </div></div>
      <div class="st-group"><h3>${t('Maintenance')}</h3><div class="st-card">
        <div class="st-row"><div class="st-label"><b>${t('Clear Cache')}</b><p>${t('Clears cached file handles, recent documents and folder bookmarks. Your annotations are kept.')}</p></div><div class="st-ctl"><button class="btn small" data-op="cache">${t('Clear Cache')}</button></div></div>
        <div class="st-row"><div class="st-label"><b>${t('Delete all annotations')}</b><p>${t('Remove highlights and comments for every document.')}</p></div><div class="st-ctl"><button class="btn small danger" data-op="annotations">${t('Delete')}</button></div></div>
        <div class="st-row"><div class="st-label"><b>${t('Reset to Defaults')}</b><p>${t('This will reset all settings to their default values.')}</p></div><div class="st-ctl"><button class="btn small danger" data-op="reset-all">${t('Reset to Defaults')}</button></div></div>
      </div></div>`;
    }
    if (sec.reset) html += `<div class="st-foot"><button class="btn small ghost" data-reset="${sec.id}">${icon('reset', 14)} ${t('Reset')} ${esc(t(sec.title))}</button></div>`;
    return html;
  }

  function render() {
    root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', !filter && b.dataset.tab === active));
    if (filter) {
      body.innerHTML = SECTIONS.map((sec) => `<div class="st-section" data-sec="${sec.id}"><h2>${icon(sec.icon, 18)} ${esc(t(sec.title))}</h2>${sectionHtml(sec)}</div>`).join('');
      for (const row of body.querySelectorAll('.st-row[data-search]')) row.hidden = !row.dataset.search.includes(filter);
      for (const g of body.querySelectorAll('.st-group')) g.hidden = ![...g.querySelectorAll('.st-row')].some((r) => !r.hidden);
      for (const sec of body.querySelectorAll('.st-section')) sec.hidden = ![...sec.querySelectorAll('.st-group')].some((g) => !g.hidden);
      body.querySelectorAll('.st-foot, .st-intro').forEach((n) => n.remove());
    } else {
      const sec = SECTIONS.find((x) => x.id === active) || SECTIONS[0];
      body.innerHTML = `<h2>${icon(sec.icon, 20)} ${esc(t(sec.title))}</h2>${sectionHtml(sec)}`;
    }
  }

  async function save(patch, opts = {}) {
    s = await setSettings(patch);
    if (opts.reload) return location.reload();
    if (opts.render !== false) render();
  }

  body.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.plugin) return save({ plugins: { ...s.plugins, [el.dataset.plugin]: el.checked } });
    const key = el.dataset.key;
    if (!key) return;
    if (key === 'plantumlEnabled') return save({ plugins: { ...s.plugins, plantuml: el.checked } });
    const fieldDef = SECTIONS.flatMap((x) => x.groups || []).flatMap(([, f]) => f).find((f) => f[0] === key);
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'range' || el.dataset.number !== undefined) v = Number(v);
    if (key === 'plantumlServer' && v && !/^https:\/\/.+/.test(v)) return alert(t('Server URL must start with https://'));
    save({ [key]: v }, { reload: fieldDef?.[4]?.reload });
  });
  body.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.ai) { aiDraft()[el.dataset.ai] = el.value; return; }
    if (el.type === 'range') {
      const unit = SECTIONS.flatMap((x) => x.groups || []).flatMap(([, f]) => f).find((f) => f[0] === el.dataset.key)?.[4]?.unit || '';
      el.nextElementSibling.textContent = el.value + unit;
      save({ [el.dataset.key]: Number(el.value) }, { render: false });
    }
    if (el.type === 'color') save({ [el.dataset.key]: el.value }, { render: false });
  });
  body.addEventListener('keydown', async (e) => {
    const el = e.target;
    if (el.dataset.add && e.key === 'Enter') {
      const name = el.value.trim();
      const list = [...(s[el.dataset.add] || [])];
      if (!name) return;
      if (/[/\\]/.test(name)) return alert(t('Folder name cannot contain path separators (/ or \\)'));
      if (list.includes(name)) return alert(t('This folder is already in the list'));
      if (list.length >= 50) return alert(t('Maximum 50 folders allowed'));
      list.push(name);
      await save({ [el.dataset.add]: list });
      body.querySelector(`[data-add="${el.dataset.add}"]`)?.focus();
    }
  });
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.aiFormat) {
      const d = aiDraft();
      const prev = llm.FORMATS[d.format];
      const next = llm.FORMATS[b.dataset.aiFormat];
      if (!d.baseUrl.trim() || d.baseUrl.trim() === prev.baseUrl) d.baseUrl = next.baseUrl;
      if (!d.model.trim() || d.model.trim() === prev.model) d.model = next.model;
      d.format = b.dataset.aiFormat;
      return render();
    }
    if (b.dataset.op?.startsWith('ai-')) {
      const d = aiDraft();
      if (b.dataset.op === 'ai-clear') {
        if (!confirm(t('Remove the AI provider and its API key from this device?'))) return;
        llm.clearProvider();
        ai = null;
        return render();
      }
      const cand = aiCandidate();
      if (b.dataset.op === 'ai-save') {
        try { llm.setProvider(cand); } catch (err) { Object.assign(d, { status: t(err.message), ok: false }); return render(); }
        Object.assign(d, { apiKey: '', status: t('Saved.'), ok: true });
        return render();
      }
      const err = llm.providerError(cand);
      if (err) { Object.assign(d, { status: t(err), ok: false }); return render(); }
      Object.assign(d, { status: t('Testing…'), ok: false });
      render();
      try {
        const reply = await llm.testProvider(llm.normalizeProvider(cand));
        Object.assign(d, { status: t('Connection works. The model replied: {r}', { r: reply || '—' }), ok: true });
      } catch (err) {
        Object.assign(d, { status: err.message, ok: false });
      }
      return render();
    }
    if (b.closest('.segment')) return save({ [b.closest('.segment').dataset.key]: b.dataset.v });
    if (b.dataset.clear) return save({ [b.dataset.clear]: '' });
    if (b.dataset.rm) { const list = [...s[b.dataset.rm]]; list.splice(+b.dataset.i, 1); return save({ [b.dataset.rm]: list }); }
    if (b.dataset.consent) return save({ plantumlConsent: b.dataset.consent === 'grant', plugins: { ...s.plugins, plantuml: b.dataset.consent === 'grant' ? true : s.plugins.plantuml } });
    if (b.dataset.record) {
      recording.key = b.dataset.record;
      clearTimeout(recording.timer);
      recording.timer = setTimeout(() => {
        if (!recording.key) return;
        recording.key = null;
        render();
        alert(t('No key captured - the shortcut may be reserved by the browser. Try a different combo.'));
      }, 6000);
      render();
      return;
    }
    if (b.dataset.unrecord) { const sc = { ...s.shortcuts }; delete sc[b.dataset.unrecord]; return save({ shortcuts: sc }); }
    if (b.dataset.reset) {
      const sec = SECTIONS.find((x) => x.id === b.dataset.reset);
      if (!confirm(t('This will restore these settings to their default values.'))) return;
      await resetSettings(sec.reset);
      s = await getSettings();
      return render();
    }
    const op = b.dataset.op;
    if (op === 'export') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'markcraft', version: 1, settings: s }, null, 2)], { type: 'application/json' }));
      a.download = 'markcraft-settings.json';
      a.click();
    }
    if (op === 'import') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = async () => {
        const f = input.files[0];
        if (!f) return;
        if (f.size > 1e6) return alert(t('File too large: settings files should be under 1 MB'));
        let data;
        try { data = JSON.parse(await f.text()); } catch { return alert(t('Invalid file: not valid JSON')); }
        if (data?.app !== 'markcraft' || typeof data.settings !== 'object') return alert(t('Invalid file: not a MarkCraft settings export'));
        if (!confirm(t('This will replace your current settings.'))) return;
        const clean = Object.fromEntries(Object.entries(data.settings).filter(([k]) => k in DEFAULTS));
        await chrome.storage.sync.set({ settings: { ...DEFAULTS, ...clean, plugins: { ...PLUGIN_DEFAULTS, ...(clean.plugins || {}) } } });
        location.reload();
      };
      input.click();
    }
    if (op === 'cache' && confirm(t('Clear Cache?'))) {
      await Promise.all(['handles', 'recent', 'bindings'].map((st) => db.clear(st)));
      await chrome.storage.local.remove('folderBookmarks');
      b.textContent = '✓';
    }
    if (op === 'annotations' && confirm(t('Delete all annotations for every document?'))) { await db.clear('comments'); b.textContent = '✓'; }
    if (op === 'reset-all' && confirm(t('This will reset all settings to their default values. This action cannot be undone.'))) { await resetSettings(); location.reload(); }
  });

  // Shortcut recording.
  const onKey = async (e) => {
    if (!recording.key) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { recording.key = null; return render(); }
    const combo = comboFromEvent(e);
    if (!combo) return;
    const id = recording.key;
    recording.key = null;
    const sc = { ...s.shortcuts };
    if (combo === SHORTCUTS[id].combo) delete sc[id];
    else sc[id] = combo;
    await save({ shortcuts: sc });
  };
  window.addEventListener('keydown', onKey, true);

  render();
  return { destroy: () => window.removeEventListener('keydown', onKey, true), refresh: async () => { s = await getSettings(); render(); } };
}
