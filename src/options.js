import { getSettings } from './shared/settings.js';
import { setLanguage, localize } from './shared/i18n.js';
import { mountSettings } from './shared/settings-ui.js';

function applyTheme(theme) {
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = theme === 'sepia' ? 'sepia' : dark ? 'dark' : 'light';
}

getSettings().then(async (s) => {
  setLanguage(s.language);
  applyTheme(s.theme);
  await mountSettings(document.getElementById('settings-root'));
  localize();
  chrome.storage.onChanged.addListener((c) => c.settings && applyTheme(c.settings.newValue?.theme || 'auto'));
});
