// Lucide icons (ISC) rendered as inline SVG strings.
import {
  Folder, FolderOpen, FileText, ListTree, MessageSquareText, Bot, SquareTerminal, PanelLeft, PanelRight, X, Zap, Sun, Moon, SunMoon,
  Settings, Search, Star, RefreshCw, ArrowUpDown, ChevronsDownUp, ChevronsUpDown, ChevronRight, Ellipsis, FileCode, FileDown, Printer,
  Presentation, Network, Code, Keyboard, Info, Pencil, Save, BookOpen, Eye, Type, Palette, Puzzle, Workflow, Command, ArrowUpFromLine,
  Download, Upload, Wrench, Highlighter, Underline, MessageSquare, Copy, Check, Plus, Trash2, FilePlus, Maximize2, StretchHorizontal,
  Columns2, ArrowUp, SlidersHorizontal, Sparkles, History, Globe, Bookmark, Clipboard, FileType, RotateCcw, CircleHelp, Filter,
} from 'lucide';

const ICONS = {
  folder: Folder, 'folder-open': FolderOpen, file: FileText, toc: ListTree, annotations: MessageSquareText, agent: Bot, terminal: SquareTerminal,
  'panel-left': PanelLeft, 'panel-right': PanelRight, x: X, zap: Zap, sun: Sun, moon: Moon, 'sun-moon': SunMoon, settings: Settings,
  search: Search, star: Star, refresh: RefreshCw, sort: ArrowUpDown, collapse: ChevronsDownUp, expand: ChevronsUpDown, chevron: ChevronRight,
  more: Ellipsis, html: FileCode, word: FileDown, print: Printer, present: Presentation, mindmap: Network, raw: Code, keyboard: Keyboard,
  info: Info, edit: Pencil, save: Save, read: BookOpen, eye: Eye, type: Type, palette: Palette, puzzle: Puzzle, workflow: Workflow,
  command: Command, top: ArrowUpFromLine, download: Download, upload: Upload, wrench: Wrench, highlight: Highlighter, underline: Underline,
  comment: MessageSquare, copy: Copy, check: Check, plus: Plus, trash: Trash2, new: FilePlus, fullscreen: Maximize2, wide: StretchHorizontal,
  centered: Columns2, up: ArrowUp, sliders: SlidersHorizontal, sparkles: Sparkles, history: History, globe: Globe, bookmark: Bookmark,
  clipboard: Clipboard, filetype: FileType, reset: RotateCcw, help: CircleHelp, filter: Filter,
};

export function icon(name, size = 18) {
  const node = ICONS[name];
  if (!node) return '';
  const inner = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
  return `<svg class="ic" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

// Replace <i data-icon="name"></i> placeholders.
export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll('i[data-icon]')) {
    el.outerHTML = icon(el.dataset.icon, +el.dataset.size || 18);
  }
}
