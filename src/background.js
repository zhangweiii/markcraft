const VIEWER = chrome.runtime.getURL('viewer.html');

function openViewer(query = '') {
  return chrome.tabs.create({ url: VIEWER + query });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'open-link', title: 'Open link in MarkCraft', contexts: ['link'] });
  chrome.contextMenus.create({ id: 'open-page', title: 'Render this page as Markdown', contexts: ['page'] });
  chrome.contextMenus.create({ id: 'new-from-selection', title: 'New Markdown document from selection', contexts: ['selection'] });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'open-link') openViewer('?file=' + encodeURIComponent(info.linkUrl));
  if (info.menuItemId === 'open-page' && tab?.url) chrome.tabs.update(tab.id, { url: VIEWER + '?file=' + encodeURIComponent(tab.url) });
  if (info.menuItemId === 'new-from-selection') {
    await chrome.storage.session.set({ pendingText: info.selectionText || '' });
    openViewer('?new=1&pending=1');
  }
});

chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === 'open-file') openViewer('?welcome=1');
  if (cmd === 'new-doc') openViewer('?new=1');
});
