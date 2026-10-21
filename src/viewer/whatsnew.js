// Release notes shown once after an update (Settings → General → What's New Notification).
export const RELEASES = [
  {
    version: '1.1.0',
    features: [
      'New document-first interface with floating dock, actions grid and side panels',
      'Quick Settings (⌘,) with General, Appearance, Plugins, Presentation, PlantUML, Shortcuts and Import/Export',
      'Rendering plugins: emoji, ==mark==, ++ins++, ~sub~, ^sup^, definition lists, abbreviations, ::: containers, typographer, advanced tables',
      'Mintlify components: Card, CardGroup, Tabs, Steps, Accordion, CodeGroup, Frame, callouts, ParamField',
      'Diagram downloads as SVG, PNG or JPEG with scale; Retry and Show source on diagram errors',
      'Customizable keyboard shortcuts; 12 syntax themes; centered or full-width layout',
      'Sidebar sorting, grouping, .txt filter, excluded folders, expand/collapse all',
    ],
    improvements: ['Annotation filters and an Unresolved section', 'Mind map keyboard controls and download dialog', 'Presentation colors, fonts and background image'],
    fixes: ['Interface could freeze in Chinese when opening some panels', 'Nested folders resolved files against the wrong directory'],
  },
  {
    version: '1.0.0',
    features: ['Markdown viewer and WYSIWYG editor with live reload, diff banner, annotations, AI agent hand-off, Word/HTML/PDF export, mind map and presentation mode'],
  },
];
