// Rasterize an SVG string (used by DOCX export and mind map downloads).
export async function svgToBlob(svgText, type = 'image/png', scale = 2, background = null) {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  try {
    img.src = url;
    await img.decode();
    const w = Math.max(1, Math.round((img.naturalWidth || 800) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || 600) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Rasterizing failed'))), type, 0.92));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Serialize an inline <svg> element with explicit pixel size.
export function svgElementText(svg) {
  const clone = svg.cloneNode(true);
  const r = svg.getBoundingClientRect();
  const vb = svg.viewBox?.baseVal;
  const w = r.width || vb?.width || 600;
  const h = r.height || vb?.height || 400;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', w);
  clone.setAttribute('height', h);
  clone.removeAttribute('style');
  return { text: new XMLSerializer().serializeToString(clone), width: w, height: h };
}
