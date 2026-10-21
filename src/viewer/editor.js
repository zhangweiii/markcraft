// Live WYSIWYG editor (Milkdown Crepe): Markdown syntax turns into formatting as
// you type, and pasted Markdown is parsed into rich content.
import { FRONT_MATTER, katexHtml, escapeHtml } from './render.js';
import { DIAGRAM_LANGS, renderDiagram } from './diagrams.js';

let cssLoaded = false;

function loadCss() {
  if (cssLoaded) return;
  cssLoaded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'editor-style.css';
  document.head.append(link);
}

// Live previews for diagram/math code blocks inside the editor.
function renderPreview(dark, getSettings) {
  return (language, content, apply) => {
    const lang = (language || '').toLowerCase();
    if (!content.trim()) return null;
    const kind = DIAGRAM_LANGS[lang];
    if (kind) {
      renderDiagram(kind, content, { dark: dark(), settings: getSettings() })
        .then((svg) => {
          const div = document.createElement('div');
          div.className = `diagram ${kind}-diagram`;
          div.innerHTML = svg;
          apply(div);
        })
        .catch((e) => apply(`<div class="diagram-error-msg">${escapeHtml(String(e.message || e).split('\n')[0])}</div>`));
      return undefined;
    }
    if (lang === 'math' || lang === 'latex' || lang === 'tex' || lang === 'katex') return katexHtml(content);
    return null;
  };
}

export async function createEditor({ root, markdown, resolveAsset, uploadImage, onChange, isDark, getSettings }) {
  loadCss();
  // Front matter is not Markdown; keep it out of the editor and re-attach on change.
  const fm = FRONT_MATTER.exec(markdown);
  const head = fm ? fm[0].replace(/\n?$/, '\n') : '';
  if (fm) markdown = markdown.slice(fm[0].length);
  const { Crepe } = await import('@milkdown/crepe');
  const crepe = new Crepe({
    root,
    defaultValue: markdown,
    features: { [Crepe.Feature.AI]: false, [Crepe.Feature.TopBar]: false },
    featureConfigs: {
      [Crepe.Feature.ImageBlock]: {
        proxyDomURL: async (url) => (await resolveAsset(url)) || url,
        onUpload: uploadImage,
        inlineOnUpload: uploadImage,
        blockOnUpload: uploadImage,
      },
      [Crepe.Feature.CodeMirror]: { renderPreview: renderPreview(isDark, getSettings) },
      [Crepe.Feature.Placeholder]: { text: 'Start writing… type / for commands', mode: 'doc' },
    },
  });
  await crepe.create();
  // Crepe normalizes Markdown on load; treat that normalized text as the clean baseline
  // so merely opening the editor does not mark the document dirty.
  const baseline = crepe.getMarkdown();
  let lastEmitted = baseline;
  crepe.on((api) => {
    api.markdownUpdated((_ctx, md) => {
      if (md === lastEmitted) return;
      lastEmitted = md;
      onChange(head + md, md === baseline);
    });
  });
  // Crepe only proxies block images; resolve relative inline images ourselves.
  const fixImages = () => {
    for (const img of root.querySelectorAll('img[src]')) {
      const src = img.getAttribute('src');
      if (/^(data|blob|https?):/i.test(src) || img.dataset.mcFor === src) continue;
      img.dataset.mcFor = src;
      resolveAsset(src).then((url) => {
        if (url && img.getAttribute('src') === src) {
          img.src = url;
          img.dataset.mcFor = url;
        }
      });
    }
  };
  const observer = new MutationObserver(fixImages);
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
  fixImages();
  return {
    crepe,
    baseline,
    getMarkdown: () => head + crepe.getMarkdown(),
    focus: () => root.querySelector('.ProseMirror')?.focus(),
    destroy: () => { observer.disconnect(); return crepe.destroy(); },
  };
}
