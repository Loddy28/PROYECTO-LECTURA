pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pestanas = [];
let historialPestanasCerradas = [];
let idxPestanaActiva = -1;
let clickPosTemp = null;
let currentSelectionRange = null;
let modoNocheActivo = false;
let renderCycleId = 0;
let observerPaginas = null;
const paginasRenderizadas = new Map();
let gavetaActiva = null;
let herramientaCursor = 'select';
let isPanning = false;
let startPanX = 0, startPanY = 0;
let startScrollLeft = 0, startScrollTop = 0;

let colorResaltadoActivo = '#facc15';
let opacidadResaltadoActiva = 0.55;
const COLORES_ACROBAT = [
  '#facc15', '#fde047', '#4ade80', '#2dd4bf', '#38bdf8', '#818cf8',
  '#c084fc', '#fb923c', '#f87171', '#f43f5e', '#a8a29e', '#71717a',
  '#0284c7', '#16a34a'
];

let isDrawingHighlight = false;
let hlStartPageNum = null;
let hlStartRelX = 0, hlStartRelY = 0;
let hlFixedH = 18;
let hlPageBoxRef = null;
const hlDragBox = document.getElementById('highlight-drag-box');

let isDrawingPen = false;
let penActivePuntos = [];
let penPageBoxRef = null;
let penPageNum = null;
let penLivePath = null;

let comentarioEnPopupActivo = null;
let textoOriginalAntesDeEditar = '';
let isEditingPopup = false;
let zoomVisualActual = 1.0;
let timerFinZoom = null;

const wrapper = document.getElementById('viewer-wrapper');
const pagesContainer = document.getElementById('pages-container');
const sidebar = document.getElementById('comments-sidebar');
const contextMenu = null;
const selectionPopover = document.getElementById('selection-popover');
const btnNightToggle = document.getElementById('btn-night-toggle');
const tabsBar = document.getElementById('tabs-bar');
const vCurrPage = document.getElementById('v-curr-page');
const vTotalPages = document.getElementById('v-total-pages');
const viewModesPopover = document.getElementById('view-modes-popover');
const btnViewModes = document.getElementById('btn-view-modes');
const colorPanelPopover = document.getElementById('color-panel-popover');
const floatColorPreview = document.getElementById('float-color-preview');
const swatchesContainer = document.getElementById('swatches-container');
const opacityValLbl = document.getElementById('opacity-val-lbl');
const hlMenuPopover = document.getElementById('highlight-menu-popover');
const commentHoverPopup = document.getElementById('comment-hover-popup');
const commentPopupTime = document.getElementById('comment-popup-time');
const commentPopupText = document.getElementById('comment-popup-text');
const commentPopupActions = document.getElementById('comment-popup-actions');
const btnEditInline = document.getElementById('btn-edit-inline');
const saveConfirmModal = document.getElementById('save-confirm-modal');
const modalFilenameTxt = document.getElementById('modal-filename-txt');
const pageNavBar = document.getElementById('page-nav-bar');
const navBarLabel = document.getElementById('nav-bar-label');
const drawerHeaderTitle = document.getElementById('drawer-header-title');
const drawerItemsList = document.getElementById('drawer-items-list');
const drawerActionBtn = document.getElementById('drawer-action-btn');
const btnDockBookmarks = document.getElementById('btn-dock-bookmarks');
const btnDockAnnotations = document.getElementById('btn-dock-annotations');
const searchBarContainer = document.getElementById('search-bar-container');
const searchInput = document.getElementById('search-input');
const searchCounter = document.getElementById('search-counter');
const gotoContainer = document.getElementById('goto-page-container');
const gotoInput = document.getElementById('goto-page-input');
const gotoTotalLabel = document.getElementById('goto-total-label');

const CLOUD_CONFIG = {
  MASTER_KEY: '$2a$10$5SLQlzfD5Z7hI3SKYZOQcub1lGHRof/xowmOk1Qufn3hmiPHc7Mjq'
};

function mostrarToast(mensaje, esExito = true) {
  const toast = document.getElementById('save-toast');
  if (!toast) return;

  const msg = document.getElementById('save-toast-msg');
  if (msg) msg.textContent = mensaje;

  toast.style.borderColor = esExito ? 'rgba(74, 222, 128, 0.4)' : 'rgba(239, 68, 68, 0.4)';
  const icon = toast.querySelector('.save-toast-icon');
  if (icon) {
    icon.style.background = esExito ? '#16a34a' : '#ef4444';
    icon.textContent = esExito ? '✓' : '✕';
  }

  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2400);
}

async function sincronizarHaciaNube(nombreArchivo, payload) {
  if (!CLOUD_CONFIG.MASTER_KEY) return;

  const nombreLimpio = nombreArchivo.replace(/[^a-zA-Z0-9_-]/g, '_');
  try {
    const res = await fetch('https://api.jsonbin.io/v3/b', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': CLOUD_CONFIG.MASTER_KEY,
        'X-Bin-Name': `pdf_${nombreLimpio}`
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      console.log(`[Nube] Respaldo guardado exitosamente para: ${nombreArchivo}`);
      mostrarToast(`Guardado y respaldado en la nube`);
    } else {
      const errData = await res.json();
      console.error("[Nube] Error al respaldar:", errData);
      mostrarToast(`Guardado local (Error en nube)`, false);
    }
  } catch (err) {
    console.error("[Nube] Error de conexión con JSONBin:", err);
  }
}

async function recuperarDesdeNube(nombreArchivo) {
  if (!CLOUD_CONFIG.MASTER_KEY) return null;
  const nombreLimpio = nombreArchivo.replace(/[^a-zA-Z0-9_-]/g, '_');

  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b?name=pdf_${nombreLimpio}`, {
      method: 'GET',
      headers: {
        'X-Master-Key': CLOUD_CONFIG.MASTER_KEY
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.record || null;
  } catch (err) {
    return null;
  }
}

function getPestanaActual() {
  return (idxPestanaActiva >= 0 && idxPestanaActiva < pestanas.length) ? pestanas[idxPestanaActiva] : null;
}

function marcarModificado() {
  const p = getPestanaActual();
  if (p) {
    p.modificado = true;
    actualizarBarraPestanas();
  }
}

function guardarSnapshot() {
  const p = getPestanaActual();
  if (!p) return;
  p.undoStack.push(JSON.parse(JSON.stringify(p.appState)));
  p.redoStack = [];
  if (p.undoStack.length > 35) p.undoStack.shift();
  marcarModificado();
}

function deshacer() {
  const p = getPestanaActual();
  if (!p || p.undoStack.length === 0) return;
  p.redoStack.push(JSON.parse(JSON.stringify(p.appState)));
  p.appState = p.undoStack.pop();
  reconstruirAnotacionesEnDOM();
  marcarModificado();
}

function rehacer() {
  const p = getPestanaActual();
  if (!p || p.redoStack.length === 0) return;
  p.undoStack.push(JSON.parse(JSON.stringify(p.appState)));
  p.appState = p.redoStack.pop();
  reconstruirAnotacionesEnDOM();
  marcarModificado();
}

async function abrirPDF() {
  if (window.pywebview && window.pywebview.api) {
    await abrirPDFDesdePython();
  } else {
    const inputWeb = document.getElementById('web-file-input');
    if (inputWeb) inputWeb.click();
  }
}

async function abrirPDFDesdePython() {
  const res = await window.pywebview.api.abrir_dialogo_archivo();
  if (!res.exito) {
    if (res.error) alert(res.error);
    return;
  }
  
  if (res.archivos && res.archivos.length > 0) {
    for (const archivo of res.archivos) {
      let bytes;
      if (archivo.data) {
        const binaryString = atob(archivo.data);
        bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
        await procesarDocumentoPDF(bytes, archivo.nombre, archivo.ruta, archivo.data);
      }
    }
  }
}

// ========================================================
// CONVERTIDORES PROFESIONALES DE ALTA PRECISIÓN (OFFICE)
// PPTX, PPT (97-2003), DOCX, DOC, XLSX, XLS a PDF idéntico
// ========================================================

function xmlLocal(el) {
  return el ? (el.localName || el.tagName.split(':').pop()) : '';
}
function xmlChildren(parent, localName) {
  if (!parent || !parent.childNodes) return [];
  const res = [];
  for (let i = 0; i < parent.childNodes.length; i++) {
    const node = parent.childNodes[i];
    if (node.nodeType === 1 && (!localName || xmlLocal(node) === localName)) {
      res.push(node);
    }
  }
  return res;
}
function xmlChild(parent, localName) {
  if (!parent || !parent.childNodes) return null;
  for (let i = 0; i < parent.childNodes.length; i++) {
    const node = parent.childNodes[i];
    if (node.nodeType === 1 && xmlLocal(node) === localName) return node;
  }
  return null;
}
function xmlDescendants(parent, localName) {
  if (!parent || !parent.getElementsByTagName) return [];
  const list = parent.getElementsByTagName('*');
  const res = [];
  for (let i = 0; i < list.length; i++) {
    if (xmlLocal(list[i]) === localName) res.push(list[i]);
  }
  return res;
}
function xmlDescendant(parent, localName) {
  if (!parent || !parent.getElementsByTagName) return null;
  const list = parent.getElementsByTagName('*');
  for (let i = 0; i < list.length; i++) {
    if (xmlLocal(list[i]) === localName) return list[i];
  }
  return null;
}
function xmlAttr(el, name) {
  if (!el || !el.getAttribute) return null;
  if (el.hasAttribute(name)) return el.getAttribute(name);
  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i];
    const local = attr.localName || attr.name.split(':').pop();
    if (local.toLowerCase() === name.toLowerCase()) return attr.value;
  }
  return null;
}

function hslToHex(h, s, l) {
  l = Math.max(0, Math.min(1, l));
  s = Math.max(0, Math.min(1, s));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const toHex = val => Math.round((val + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsl(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s, l };
}

function resolverColorOpenXML(colorContainer, themeColors, clrMap, phClrHex = null) {
  if (!colorContainer) return null;
  let targetNode = null;
  const tagsColor = ['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr'];
  for (let tag of tagsColor) {
    targetNode = xmlChild(colorContainer, tag) || (xmlLocal(colorContainer) === tag ? colorContainer : null);
    if (targetNode) break;
  }
  if (!targetNode) return null;

  let baseHex = '#000000';
  const tag = xmlLocal(targetNode);
  const val = xmlAttr(targetNode, 'val') || '';

  if (tag === 'srgbClr') {
    baseHex = `#${val}`;
  } else if (tag === 'schemeClr') {
    if (val === 'phClr' && phClrHex) {
      baseHex = phClrHex;
    } else {
      const mapeado = (clrMap && clrMap[val]) ? clrMap[val] : val;
      baseHex = (themeColors && themeColors[mapeado]) ? themeColors[mapeado] : (themeColors && themeColors[val]) ? themeColors[val] : '#333333';
    }
  } else if (tag === 'sysClr') {
    const lastClr = xmlAttr(targetNode, 'lastClr');
    baseHex = lastClr ? `#${lastClr}` : '#000000';
  } else if (tag === 'prstClr') {
    const colMap = { white: '#ffffff', black: '#000000', red: '#ef4444', blue: '#3b82f6', green: '#22c55e', yellow: '#eab308' };
    baseHex = colMap[val.toLowerCase()] || '#111111';
  }

  let { h, s, l } = hexToHsl(baseHex);
  const lumMod = xmlChild(targetNode, 'lumMod');
  const lumOff = xmlChild(targetNode, 'lumOff');
  const tint = xmlChild(targetNode, 'tint');
  const shade = xmlChild(targetNode, 'shade');
  const alphaNode = xmlChild(targetNode, 'alpha');

  if (lumMod) l = l * (parseInt(xmlAttr(lumMod, 'val'), 10) / 100000);
  if (lumOff) l = l + (parseInt(xmlAttr(lumOff, 'val'), 10) / 100000);
  if (tint) {
    const factor = parseInt(xmlAttr(tint, 'val'), 10) / 100000;
    l = l * factor + (1 - factor);
  }
  if (shade) {
    const factor = parseInt(xmlAttr(shade, 'val'), 10) / 100000;
    l = l * factor;
  }

  let hexFinal = hslToHex(h, s, l);
  let opacity = 1.0;
  if (alphaNode) {
    opacity = parseInt(xmlAttr(alphaNode, 'val'), 10) / 100000;
  }
  return { hex: hexFinal, opacity };
}

async function cargarRelacionesZip(zip, xmlPath) {
  const parts = xmlPath.split('/');
  const fileName = parts.pop();
  const dir = parts.join('/');
  const relsPath = dir ? `${dir}/_rels/${fileName}.rels` : `_rels/${fileName}.rels`;
  const relsFile = zip.file(relsPath);
  const map = {};
  if (!relsFile) return map;
  try {
    const text = await relsFile.async('text');
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'application/xml');
    const relNodes = xmlDescendants(doc, 'Relationship');
    for (let r of relNodes) {
      const id = xmlAttr(r, 'Id');
      const target = xmlAttr(r, 'Target');
      const type = xmlAttr(r, 'Type') || '';
      if (!id || !target) continue;
      let fullPath = target;
      if (!target.startsWith('/')) {
        const curParts = dir ? dir.split('/') : [];
        const tParts = target.split('/');
        for (let p of tParts) {
          if (p === '..') curParts.pop();
          else if (p !== '.') curParts.push(p);
        }
        fullPath = curParts.join('/');
      } else {
        fullPath = target.replace(/^\//, '');
      }
      map[id] = { target: fullPath, type };
    }
  } catch (e) {}
  return map;
}

async function cargarTemaOpenXML(zip, themePath) {
  const themeColors = {
    dk1: '#000000', lt1: '#ffffff', dk2: '#1f2937', lt2: '#f3f4f6',
    accent1: '#8c6239', accent2: '#4a7c59', accent3: '#c85a17',
    accent4: '#4682b4', accent5: '#9370db', accent6: '#20b2aa',
    hlink: '#2563eb', folHlink: '#7c3aed'
  };
  const fonts = { major: 'Georgia, serif', minor: 'Calibri, Arial, sans-serif' };
  const fillStyles = [];

  const themeFile = zip.file(themePath || 'ppt/theme/theme1.xml');
  if (!themeFile) return { colors: themeColors, fonts, fillStyles };

  try {
    const text = await themeFile.async('text');
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'application/xml');
    const clrScheme = xmlDescendant(doc, 'clrScheme');
    if (clrScheme) {
      const mapping = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
      for (let k of mapping) {
        const node = xmlChild(clrScheme, k);
        if (node) {
          const srgb = xmlChild(node, 'srgbClr');
          const sys = xmlChild(node, 'sysClr');
          if (srgb && xmlAttr(srgb, 'val')) themeColors[k] = `#${xmlAttr(srgb, 'val')}`;
          else if (sys && xmlAttr(sys, 'lastClr')) themeColors[k] = `#${xmlAttr(sys, 'lastClr')}`;
        }
      }
    }
    const majorFont = xmlDescendant(doc, 'majorFont');
    if (majorFont) {
      const latin = xmlChild(majorFont, 'latin');
      if (latin && xmlAttr(latin, 'typeface')) fonts.major = `"${xmlAttr(latin, 'typeface')}", Georgia, serif`;
    }
    const minorFont = xmlDescendant(doc, 'minorFont');
    if (minorFont) {
      const latin = xmlChild(minorFont, 'latin');
      if (latin && xmlAttr(latin, 'typeface')) fonts.minor = `"${xmlAttr(latin, 'typeface')}", Calibri, Arial, sans-serif`;
    }
    const fillStyleLst = xmlDescendant(doc, 'fillStyleLst');
    if (fillStyleLst) {
      for (let child of fillStyleLst.children) fillStyles.push(child);
    }
  } catch (e) {}
  return { colors: themeColors, fonts, fillStyles };
}

// 1. MOTOR NATIVO Y DE PRESENTACIONES PPTX / PPT
async function intentarConversionNativaOffice(archivo) {
  try {
    const arrayBuffer = await archivo.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const b64 = await bytesABase64Async(bytes);

    if (window.pywebview && window.pywebview.api && window.pywebview.api.convertir_archivo) {
      const res = await window.pywebview.api.convertir_archivo(archivo.name, b64, archivo.path || null);
      if (res && res.exito && res.data) {
        return base64ABytes(res.data);
      }
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const resp = await fetch('http://127.0.0.1:8765/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: archivo.name, data: b64 }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (resp.ok) {
        const json = await resp.json();
        if (json && json.exito && json.data) {
          return base64ABytes(json.data);
        }
      }
    } catch (_) {}
  } catch (_) {}
  return null;
}

async function convertirPresentacionAPDF(archivo) {
  const arrayBuffer = await archivo.arrayBuffer();
  const headerBytes = new Uint8Array(arrayBuffer.slice(0, 8));
  const esOle2 = headerBytes[0] === 0xD0 && headerBytes[1] === 0xCF && headerBytes[2] === 0x11 && headerBytes[3] === 0xE0;

  if (esOle2) {
    return await convertirLegacyPPTaPDF(arrayBuffer, archivo.name);
  }

  const zip = new JSZip();
  const contenidoZip = await zip.loadAsync(arrayBuffer);

  let slideWidthEmu = 9144000;
  let slideHeightEmu = 6858000;
  const presFile = contenidoZip.file('ppt/presentation.xml');
  if (presFile) {
    const presText = await presFile.async('text');
    const parser = new DOMParser();
    const presDoc = parser.parseFromString(presText, 'application/xml');
    const sldSz = xmlDescendant(presDoc, 'sldSz');
    if (sldSz) {
      const cx = parseInt(xmlAttr(sldSz, 'cx'), 10);
      const cy = parseInt(xmlAttr(sldSz, 'cy'), 10);
      if (cx && cy) { slideWidthEmu = cx; slideHeightEmu = cy; }
    }
  }

  const slideW_pt = slideWidthEmu / 12700;
  const slideH_pt = slideHeightEmu / 12700;
  const domW = 1280;
  const domH = Math.round(domW * (slideHeightEmu / slideWidthEmu));
  const scaleX = domW / slideWidthEmu;
  const scaleY = domH / slideHeightEmu;

  const mediaMap = {};
  for (let filename in contenidoZip.files) {
    if (filename.startsWith('ppt/media/')) {
      try {
        const fileObj = contenidoZip.files[filename];
        const ext = filename.split('.').pop().toLowerCase();
        let mime = 'image/jpeg';
        if (ext === 'png') mime = 'image/png';
        else if (ext === 'gif') mime = 'image/gif';
        else if (ext === 'svg') mime = 'image/svg+xml';
        else if (ext === 'bmp') mime = 'image/bmp';
        const b64 = await fileObj.async('base64');
        mediaMap[filename] = `data:${mime};base64,${b64}`;
      } catch (e) {}
    }
  }

  const theme = await cargarTemaOpenXML(contenidoZip, 'ppt/theme/theme1.xml');

  const slideEntries = [];
  const slideRegex = /^ppt\/slides\/slide(\d+)\.xml$/;
  contenidoZip.forEach((path) => {
    const m = path.match(slideRegex);
    if (m) slideEntries.push({ num: parseInt(m[1], 10), path });
  });
  slideEntries.sort((a, b) => a.num - b.num);

  if (slideEntries.length === 0) {
    return await fallbackPPTX(archivo);
  }

  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF({
    orientation: slideW_pt >= slideH_pt ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [slideW_pt, slideH_pt]
  });

  const renderContainer = document.createElement('div');
  renderContainer.style.position = 'fixed';
  renderContainer.style.top = '-99999px';
  renderContainer.style.left = '-99999px';
  renderContainer.style.width = `${domW}px`;
  renderContainer.style.height = `${domH}px`;
  renderContainer.style.overflow = 'hidden';
  document.body.appendChild(renderContainer);

  for (let i = 0; i < slideEntries.length; i++) {
    if (i > 0) docPdf.addPage([slideW_pt, slideH_pt], slideW_pt >= slideH_pt ? 'landscape' : 'portrait');
    renderContainer.innerHTML = '';

    const slideInfo = slideEntries[i];
    const slideText = await contenidoZip.file(slideInfo.path).async('text');
    const parser = new DOMParser();
    const slideDoc = parser.parseFromString(slideText, 'application/xml');
    const slideRels = await cargarRelacionesZip(contenidoZip, slideInfo.path);

    let layoutPath = null;
    let masterPath = null;
    let layoutDoc = null;
    let masterDoc = null;
    let layoutRels = {};
    let masterRels = {};

    for (let rId in slideRels) {
      if (slideRels[rId].type.endsWith('/slideLayout')) {
        layoutPath = slideRels[rId].target;
        break;
      }
    }
    if (layoutPath && contenidoZip.file(layoutPath)) {
      const lText = await contenidoZip.file(layoutPath).async('text');
      layoutDoc = parser.parseFromString(lText, 'application/xml');
      layoutRels = await cargarRelacionesZip(contenidoZip, layoutPath);
      for (let rId in layoutRels) {
        if (layoutRels[rId].type.endsWith('/slideMaster')) {
          masterPath = layoutRels[rId].target;
          break;
        }
      }
    }
    if (masterPath && contenidoZip.file(masterPath)) {
      const mText = await contenidoZip.file(masterPath).async('text');
      masterDoc = parser.parseFromString(mText, 'application/xml');
      masterRels = await cargarRelacionesZip(contenidoZip, masterPath);
    }

    let clrMap = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
    if (masterDoc) {
      const cmNode = xmlDescendant(masterDoc, 'clrMap');
      if (cmNode) {
        for (let a of ['bg1', 'tx1', 'bg2', 'tx2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6']) {
          const v = xmlAttr(cmNode, a);
          if (v) clrMap[a] = v;
        }
      }
    }

    const slideEl = document.createElement('div');
    slideEl.style.position = 'relative';
    slideEl.style.width = `${domW}px`;
    slideEl.style.height = `${domH}px`;
    slideEl.style.backgroundColor = '#ffffff';
    slideEl.style.overflow = 'hidden';
    slideEl.style.fontFamily = theme.fonts.minor;
    slideEl.style.boxSizing = 'border-box';

    let bgApplied = false;
    const candidatesBg = [
      { doc: slideDoc, rels: slideRels },
      { doc: layoutDoc, rels: layoutRels },
      { doc: masterDoc, rels: masterRels }
    ];

    for (let c of candidatesBg) {
      if (!c.doc) continue;
      const bgNode = xmlDescendant(c.doc, 'bg') || xmlDescendant(c.doc, 'bgPr');
      if (!bgNode) continue;

      const blipFill = xmlDescendant(bgNode, 'blipFill');
      if (blipFill) {
        const blip = xmlDescendant(blipFill, 'blip');
        const rId = blip ? xmlAttr(blip, 'embed') : null;
        if (rId && c.rels[rId] && mediaMap[c.rels[rId].target]) {
          slideEl.style.backgroundImage = `url("${mediaMap[c.rels[rId].target]}")`;
          slideEl.style.backgroundSize = xmlDescendant(blipFill, 'tile') ? 'auto' : 'cover';
          slideEl.style.backgroundPosition = 'center center';
          slideEl.style.backgroundRepeat = xmlDescendant(blipFill, 'tile') ? 'repeat' : 'no-repeat';
          bgApplied = true;
          break;
        }
      }
      const solidFill = xmlDescendant(bgNode, 'solidFill');
      if (solidFill) {
        const col = resolverColorOpenXML(solidFill, theme.colors, clrMap);
        if (col) {
          slideEl.style.backgroundColor = col.hex;
          bgApplied = true;
          break;
        }
      }
      const gradFill = xmlDescendant(bgNode, 'gradFill');
      if (gradFill) {
        const stops = xmlDescendants(gradFill, 'gs');
        if (stops.length > 0) {
          const colStops = stops.map(s => {
            const pos = (parseInt(xmlAttr(s, 'pos'), 10) / 1000) || 0;
            const cRes = resolverColorOpenXML(s, theme.colors, clrMap);
            return `${cRes ? cRes.hex : '#ffffff'} ${pos}%`;
          });
          slideEl.style.background = `linear-gradient(180deg, ${colStops.join(', ')})`;
          bgApplied = true;
          break;
        }
      }
    }
    if (!bgApplied) {
      slideEl.style.backgroundColor = '#ffffff';
    }

    if (masterDoc) {
      const spTreeM = xmlDescendant(masterDoc, 'spTree');
      if (spTreeM) {
        const shapesM = xmlChildren(spTreeM);
        for (let sh of shapesM) {
          const tag = xmlLocal(sh);
          if (tag === 'cxnSp') {
            renderizarFormaEnDOM(sh, slideEl, scaleX, scaleY, theme, clrMap, masterRels, mediaMap);
          } else if (tag === 'sp') {
            const spPr = xmlChild(sh, 'spPr');
            const ext = spPr && xmlChild(spPr, 'xfrm') ? xmlChild(xmlChild(spPr, 'xfrm'), 'ext') : null;
            if (ext) {
              const h = parseInt(xmlAttr(ext, 'cy'), 10);
              const w = parseInt(xmlAttr(ext, 'cx'), 10);
              if (h <= 50000 || w <= 50000) {
                renderizarFormaEnDOM(sh, slideEl, scaleX, scaleY, theme, clrMap, masterRels, mediaMap);
              }
            }
          }
        }
      }
    }

    const spTreeSlide = xmlDescendant(slideDoc, 'spTree');
    if (spTreeSlide) {
      const shapes = xmlChildren(spTreeSlide);
      for (let sh of shapes) {
        const tag = xmlLocal(sh);
        if (tag === 'sp' || tag === 'pic' || tag === 'cxnSp' || tag === 'grpSp') {
          renderizarFormaEnDOM(sh, slideEl, scaleX, scaleY, theme, clrMap, slideRels, mediaMap);
        } else if (tag === 'graphicFrame') {
          await renderizarGraphicFrame(sh, slideEl, scaleX, scaleY, theme, clrMap, slideRels, mediaMap, contenidoZip);
        }
      }
    }

    renderContainer.appendChild(slideEl);

    const canvas = await html2canvas(slideEl, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: null
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    docPdf.addImage(imgData, 'JPEG', 0, 0, slideW_pt, slideH_pt);

    const spansTexto = slideEl.querySelectorAll('.ptx-text-run');
    docPdf.setTextColor(0, 0, 0);
    for (let span of spansTexto) {
      const rect = span.getBoundingClientRect();
      const parentRect = slideEl.getBoundingClientRect();
      const x_pt = (rect.left - parentRect.left) * (slideW_pt / domW);
      const y_pt = (rect.top - parentRect.top + rect.height * 0.78) * (slideH_pt / domH);
      const fs_pt = Math.max(7, Math.min(48, (parseFloat(window.getComputedStyle(span).fontSize) || 14) * (slideH_pt / domH)));
      const txt = span.textContent;
      if (txt && txt.trim()) {
        try {
          docPdf.setFontSize(fs_pt);
          docPdf.text(txt, x_pt, y_pt, { renderingMode: 'invisible' });
        } catch (e) {}
      }
    }
  }

  document.body.removeChild(renderContainer);
  const pdfBytes = docPdf.output('arraybuffer');
  return new Uint8Array(pdfBytes);
}

function renderizarFormaEnDOM(shapeNode, containerEl, scaleX, scaleY, theme, clrMap, rels, mediaMap, offsetCoords = null) {
  const tag = xmlLocal(shapeNode);

  if (tag === 'grpSp') {
    const grpSpPr = xmlChild(shapeNode, 'grpSpPr');
    const xfrm = grpSpPr ? xmlChild(grpSpPr, 'xfrm') : null;
    const off = xfrm ? xmlChild(xfrm, 'off') : null;
    const gx = off ? parseInt(xmlAttr(off, 'x'), 10) : 0;
    const gy = off ? parseInt(xmlAttr(off, 'y'), 10) : 0;
    const nextOffset = {
      x: gx + (offsetCoords ? offsetCoords.x : 0),
      y: gy + (offsetCoords ? offsetCoords.y : 0)
    };
    const childShapes = xmlChildren(shapeNode);
    for (let cs of childShapes) {
      const cTag = xmlLocal(cs);
      if (['sp', 'pic', 'cxnSp', 'grpSp', 'graphicFrame'].includes(cTag)) {
        renderizarFormaEnDOM(cs, containerEl, scaleX, scaleY, theme, clrMap, rels, mediaMap, nextOffset);
      }
    }
    return;
  }

  const spPr = xmlChild(shapeNode, 'spPr') || xmlChild(shapeNode, 'dspPr');
  const xfrm = spPr ? xmlChild(spPr, 'xfrm') : null;
  const off = xfrm ? xmlChild(xfrm, 'off') : null;
  const ext = xfrm ? xmlChild(xfrm, 'ext') : null;

  let x = off ? parseInt(xmlAttr(off, 'x'), 10) : 0;
  let y = off ? parseInt(xmlAttr(off, 'y'), 10) : 0;
  let cx = ext ? parseInt(xmlAttr(ext, 'cx'), 10) : 0;
  let cy = ext ? parseInt(xmlAttr(ext, 'cy'), 10) : 0;

  if (offsetCoords) {
    x += offsetCoords.x;
    y += offsetCoords.y;
  }

  const pxLeft = Math.round(x * scaleX);
  const pxTop = Math.round(y * scaleY);
  const pxWidth = Math.round(cx * scaleX);
  const pxHeight = Math.round(cy * scaleY);

  if (pxWidth <= 0 && pxHeight <= 0) return;

  const hasTxBody = !!(xmlChild(shapeNode, 'txBody') || xmlChild(shapeNode, 'dspTxBody'));
  const isSmartArtShape = !!(xmlChild(shapeNode, 'dspPr') || xmlChild(shapeNode, 'dspStyle'));
  const prstGeom = spPr ? xmlChild(spPr, 'prstGeom') : null;
  const geomType = prstGeom ? xmlAttr(prstGeom, 'prst') : 'rect';

  const box = document.createElement('div');
  box.style.position = 'absolute';
  box.style.left = `${pxLeft}px`;
  box.style.top = `${pxTop}px`;
  box.style.width = `${Math.max(2, pxWidth)}px`;
  box.style.height = `${Math.max(2, pxHeight)}px`;
  box.style.boxSizing = 'border-box';

  const rot = xfrm ? xmlAttr(xfrm, 'rot') : null;
  if (rot) {
    const deg = parseInt(rot, 10) / 60000;
    box.style.transform = `rotate(${deg}deg)`;
    box.style.transformOrigin = 'center center';
  }

  if (geomType === 'roundRect') {
    const gd = xmlDescendant(prstGeom, 'gd');
    let adj = 16667;
    if (gd && xmlAttr(gd, 'fmla')) {
      const match = xmlAttr(gd, 'fmla').match(/val\s+(\d+)/);
      if (match) adj = parseInt(match[1], 10);
    }
    const rPx = Math.round(Math.min(pxWidth, pxHeight) * (adj / 100000));
    box.style.borderRadius = `${Math.max(6, Math.min(rPx, 45))}px`;
  } else if (geomType === 'ellipse') {
    box.style.borderRadius = '50%';
  }

  let phClr = null;
  const styleNode = xmlChild(shapeNode, 'style') || xmlChild(shapeNode, 'dspStyle');
  if (styleNode) {
    const fillRef = xmlChild(styleNode, 'fillRef');
    if (fillRef) {
      const colRef = resolverColorOpenXML(fillRef, theme.colors, clrMap);
      if (colRef) phClr = colRef.hex;
    }
  }

  let fillRes = spPr ? resolverColorOpenXML(xmlChild(spPr, 'solidFill'), theme.colors, clrMap, phClr) : null;
  if (!fillRes && spPr) {
    const grad = xmlChild(spPr, 'gradFill');
    if (grad) {
      const stops = xmlDescendants(grad, 'gs');
      if (stops.length > 0) {
        const cStops = stops.map(s => {
          const p = (parseInt(xmlAttr(s, 'pos'), 10) / 1000) || 0;
          const col = resolverColorOpenXML(s, theme.colors, clrMap, phClr);
          return `${col ? col.hex : '#999'} ${p}%`;
        });
        box.style.background = `linear-gradient(135deg, ${cStops.join(', ')})`;
      }
    }
  }

  if (!fillRes && !box.style.background && styleNode && (isSmartArtShape || geomType === 'roundRect' || !hasTxBody)) {
    const fillRef = xmlChild(styleNode, 'fillRef');
    if (fillRef) {
      const idx = parseInt(xmlAttr(fillRef, 'idx'), 10);
      if (idx > 0 && theme.fillStyles && theme.fillStyles[idx - 1]) {
        fillRes = resolverColorOpenXML(theme.fillStyles[idx - 1], theme.colors, clrMap, phClr);
      }
      if (!fillRes && phClr && (isSmartArtShape || !hasTxBody)) {
        fillRes = { hex: phClr, opacity: 1.0 };
      }
    }
  }

  if (fillRes) {
    box.style.backgroundColor = fillRes.hex;
    if (fillRes.opacity < 1.0) box.style.opacity = fillRes.opacity;
  } else if (!box.style.background) {
    box.style.backgroundColor = 'transparent';
  }

  const ln = spPr ? xmlChild(spPr, 'ln') : null;
  if (ln) {
    const lnCol = resolverColorOpenXML(xmlChild(ln, 'solidFill'), theme.colors, clrMap, phClr);
    const lnW = parseInt(xmlAttr(ln, 'w'), 10);
    const borderPx = lnW ? Math.max(1, Math.round(lnW * scaleX)) : 1;
    if (lnCol) {
      box.style.border = `${borderPx}px solid ${lnCol.hex}`;
    }
  } else if (styleNode && (isSmartArtShape || geomType === 'roundRect')) {
    const lnRef = xmlChild(styleNode, 'lnRef');
    if (lnRef && parseInt(xmlAttr(lnRef, 'idx'), 10) > 0) {
      const colLn = resolverColorOpenXML(lnRef, theme.colors, clrMap, phClr);
      if (colLn) box.style.border = `1px solid ${colLn.hex}`;
    }
  }

  const blip = xmlDescendant(shapeNode, 'blip');
  if (blip) {
    const rId = xmlAttr(blip, 'embed');
    if (rId && rels[rId] && mediaMap[rels[rId].target]) {
      const img = document.createElement('img');
      img.src = mediaMap[rels[rId].target];
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain';
      img.style.display = 'block';
      box.appendChild(img);
    }
  }

  const txBody = xmlChild(shapeNode, 'txBody') || xmlChild(shapeNode, 'dspTxBody');
  if (txBody) {
    renderizarTxBodyEnBox(txBody, box, theme, clrMap, phClr, pxWidth, pxHeight, geomType);
  }

  containerEl.appendChild(box);
}

function renderizarTxBodyEnBox(txBody, box, theme, clrMap, phClr, boxW, boxH, geomType) {
  const bodyPr = xmlChild(txBody, 'bodyPr') || xmlChild(txBody, 'dspBodyPr');
  const anchor = bodyPr ? xmlAttr(bodyPr, 'anchor') : (geomType === 'roundRect' || geomType === 'ellipse' ? 'ctr' : 't');

  const textWrap = document.createElement('div');
  textWrap.style.width = '100%';
  textWrap.style.height = '100%';
  textWrap.style.display = 'flex';
  textWrap.style.flexDirection = 'column';
  textWrap.style.boxSizing = 'border-box';
  textWrap.style.padding = '8px 12px';

  if (anchor === 'ctr') textWrap.style.justifyContent = 'center';
  else if (anchor === 'b') textWrap.style.justifyContent = 'flex-end';
  else textWrap.style.justifyContent = 'flex-start';

  const paragraphs = xmlChildren(txBody, 'p');
  for (let p of paragraphs) {
    const pPr = xmlChild(p, 'pPr');
    const algn = pPr ? xmlAttr(pPr, 'algn') : (geomType === 'roundRect' ? 'ctr' : 'l');
    const pEl = document.createElement('div');
    pEl.style.lineHeight = '1.25';
    pEl.style.margin = '2px 0';
    pEl.style.wordBreak = 'break-word';

    if (algn === 'ctr') pEl.style.textAlign = 'center';
    else if (algn === 'r') pEl.style.textAlign = 'right';
    else if (algn === 'just') pEl.style.textAlign = 'justify';
    else pEl.style.textAlign = 'left';

    const buChar = pPr ? xmlChild(pPr, 'buChar') : null;
    if (buChar) {
      let ch = xmlAttr(buChar, 'char') || '•';
      if (ch === '\uF0B7' || ch === '\uF0A7') ch = '•';
      const bulletSpan = document.createElement('span');
      bulletSpan.textContent = `${ch} `;
      bulletSpan.style.marginRight = '4px';
      bulletSpan.style.opacity = '0.9';
      pEl.appendChild(bulletSpan);
    }

    const runs = xmlChildren(p);
    for (let r of runs) {
      const rTag = xmlLocal(r);
      if (rTag === 'r' || rTag === 'fld') {
        const rPr = xmlChild(r, 'rPr');
        const tNode = xmlChild(r, 't');
        if (!tNode || !tNode.textContent) continue;

        const span = document.createElement('span');
        span.className = 'ptx-text-run';
        span.textContent = tNode.textContent;

        let sz = rPr ? parseInt(xmlAttr(rPr, 'sz'), 10) : null;
        if (!sz && pPr) {
          const defRPr = xmlChild(pPr, 'defRPr');
          if (defRPr) sz = parseInt(xmlAttr(defRPr, 'sz'), 10);
        }
        if (!sz) sz = (geomType === 'roundRect' && boxH > 60) ? 2800 : 1600;
        const fontPx = Math.max(10, Math.round((sz / 100) * 1.33));
        span.style.fontSize = `${fontPx}px`;

        if (rPr && xmlAttr(rPr, 'b') === '1') span.style.fontWeight = 'bold';
        if (rPr && xmlAttr(rPr, 'i') === '1') span.style.fontStyle = 'italic';
        if (rPr && (xmlAttr(rPr, 'u') === 'sng' || xmlAttr(rPr, 'u') === '1')) span.style.textDecoration = 'underline';

        const latin = rPr ? xmlChild(rPr, 'latin') : null;
        if (latin && xmlAttr(latin, 'typeface')) {
          span.style.fontFamily = `"${xmlAttr(latin, 'typeface')}", ${theme.fonts.minor}`;
        } else if (geomType === 'roundRect') {
          span.style.fontFamily = theme.fonts.major;
        }

        let colRes = rPr ? resolverColorOpenXML(xmlChild(rPr, 'solidFill'), theme.colors, clrMap) : null;
        if (colRes) {
          span.style.color = colRes.hex;
        } else {
          const bgBox = box.style.backgroundColor;
          span.style.color = (bgBox && bgBox !== 'transparent' && bgBox !== 'rgba(0, 0, 0, 0)') ? '#ffffff' : '#1e293b';
        }

        pEl.appendChild(span);
      }
    }

    if (pEl.childNodes.length > 0) {
      textWrap.appendChild(pEl);
    }
  }

  box.appendChild(textWrap);

  setTimeout(() => {
    if (textWrap.scrollHeight > boxH + 4) {
      const factor = Math.max(0.7, (boxH / textWrap.scrollHeight) * 0.95);
      textWrap.style.transform = `scale(${factor})`;
      textWrap.style.transformOrigin = (anchor === 'ctr') ? 'center center' : 'top left';
    }
  }, 10);
}

async function renderizarGraphicFrame(gfNode, containerEl, scaleX, scaleY, theme, clrMap, rels, mediaMap, zip) {
  const xfrm = xmlChild(gfNode, 'xfrm');
  const off = xfrm ? xmlChild(xfrm, 'off') : null;
  const ext = xfrm ? xmlChild(xfrm, 'ext') : null;
  const gfX = off ? parseInt(xmlAttr(off, 'x'), 10) : 0;
  const gfY = off ? parseInt(xmlAttr(off, 'y'), 10) : 0;
  const gfW = ext ? parseInt(xmlAttr(ext, 'cx'), 10) : 0;
  const gfH = ext ? parseInt(xmlAttr(ext, 'cy'), 10) : 0;

  const tbl = xmlDescendant(gfNode, 'tbl');
  if (tbl) {
    const tableEl = document.createElement('table');
    tableEl.style.position = 'absolute';
    tableEl.style.left = `${Math.round(gfX * scaleX)}px`;
    tableEl.style.top = `${Math.round(gfY * scaleY)}px`;
    tableEl.style.width = `${Math.round(gfW * scaleX)}px`;
    tableEl.style.height = `${Math.round(gfH * scaleY)}px`;
    tableEl.style.borderCollapse = 'collapse';
    tableEl.style.boxSizing = 'border-box';

    const rows = xmlChildren(tbl, 'tr');
    for (let tr of rows) {
      const rowEl = document.createElement('tr');
      const cells = xmlChildren(tr, 'tc');
      for (let tc of cells) {
        const cellEl = document.createElement('td');
        cellEl.style.border = '1px solid #475569';
        cellEl.style.padding = '6px 10px';
        cellEl.style.verticalAlign = 'middle';
        cellEl.style.boxSizing = 'border-box';

        const tcPr = xmlChild(tc, 'tcPr');
        if (tcPr) {
          const col = resolverColorOpenXML(xmlChild(tcPr, 'solidFill'), theme.colors, clrMap);
          if (col) cellEl.style.backgroundColor = col.hex;
        }
        const txBody = xmlChild(tc, 'txBody');
        if (txBody) {
          renderizarTxBodyEnBox(txBody, cellEl, theme, clrMap, null, 100, 40, 'rect');
        }
        rowEl.appendChild(cellEl);
      }
      tableEl.appendChild(rowEl);
    }
    containerEl.appendChild(tableEl);
    return;
  }

  const relIds = xmlDescendant(gfNode, 'relIds');
  let drawingPath = null;
  if (relIds) {
    const dmId = xmlAttr(relIds, 'dm');
    if (dmId && rels[dmId]) {
      const dataPath = rels[dmId].target;
      const numMatch = dataPath.match(/data(\d+)\.xml/);
      if (numMatch) {
        drawingPath = `ppt/diagrams/drawing${numMatch[1]}.xml`;
      }
    }
  }

  if (!drawingPath || !zip.file(drawingPath)) {
    for (let rId in rels) {
      if (rels[rId].target.includes('diagrams/drawing')) {
        drawingPath = rels[rId].target;
        break;
      }
    }
  }

  if (drawingPath && zip.file(drawingPath)) {
    try {
      const dText = await zip.file(drawingPath).async('text');
      const parser = new DOMParser();
      const dDoc = parser.parseFromString(dText, 'application/xml');
      const dRels = await cargarRelacionesZip(zip, drawingPath);
      const spTree = xmlDescendant(dDoc, 'spTree');

      if (spTree) {
        const shapes = xmlDescendants(spTree, 'sp');
        let minX = Infinity, minY = Infinity;
        for (let sh of shapes) {
          const xf = xmlDescendant(sh, 'xfrm');
          const o = xf ? xmlChild(xf, 'off') : null;
          if (o) {
            const sx = parseInt(xmlAttr(o, 'x'), 10);
            const sy = parseInt(xmlAttr(o, 'y'), 10);
            if (sx < minX) minX = sx;
            if (sy < minY) minY = sy;
          }
        }

        const offsetCoords = (minX < gfX * 0.5 && gfX > 200000) ? { x: gfX, y: gfY } : null;
        for (let sh of shapes) {
          renderizarFormaEnDOM(sh, containerEl, scaleX, scaleY, theme, clrMap, dRels, mediaMap, offsetCoords);
        }
        return;
      }
    } catch (e) {}
  }

  const dataPathFallback = (relIds && rels[xmlAttr(relIds, 'dm')]) ? rels[xmlAttr(relIds, 'dm')].target : null;
  if (dataPathFallback && zip.file(dataPathFallback)) {
    try {
      const dtText = await zip.file(dataPathFallback).async('text');
      const parser = new DOMParser();
      const dtDoc = parser.parseFromString(dtText, 'application/xml');
      const ptNodes = xmlDescendants(dtDoc, 'pt');
      const textCards = [];
      for (let pt of ptNodes) {
        const tNodes = xmlDescendants(pt, 't');
        const txt = tNodes.map(n => n.textContent).join(' ').trim();
        if (txt) textCards.push(txt);
      }

      if (textCards.length > 0) {
        const groupEl = document.createElement('div');
        groupEl.style.position = 'absolute';
        groupEl.style.left = `${Math.round(gfX * scaleX)}px`;
        groupEl.style.top = `${Math.round(gfY * scaleY)}px`;
        groupEl.style.width = `${Math.round(gfW * scaleX)}px`;
        groupEl.style.height = `${Math.round(gfH * scaleY)}px`;
        groupEl.style.display = 'flex';
        groupEl.style.flexDirection = 'column';
        groupEl.style.gap = '10px';
        groupEl.style.justifyContent = 'center';

        textCards.forEach((cardText, idx) => {
          const card = document.createElement('div');
          card.style.background = idx === 0 ? '#8c6239' : '#334155';
          card.style.color = '#ffffff';
          card.style.padding = '12px 18px';
          card.style.borderRadius = '10px';
          card.style.fontSize = idx === 0 ? '22px' : '16px';
          card.style.fontWeight = idx === 0 ? 'bold' : 'normal';
          card.style.textAlign = idx === 0 ? 'center' : 'left';
          card.textContent = cardText;
          groupEl.appendChild(card);
        });
        containerEl.appendChild(groupEl);
      }
    } catch (e) {}
  }
}

// 2. MOTOR PPT LEGACY
async function convertirLegacyPPTaPDF(arrayBuffer, nombreArchivo) {
  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: [960, 540]
  });

  try {
    let textoDiapositivas = [];
    if (window.XLSX && window.XLSX.CFB) {
      const cfb = window.XLSX.CFB.read(new Uint8Array(arrayBuffer), { type: 'array' });
      const pptStream = window.XLSX.CFB.find(cfb, 'PowerPoint Document');
      if (pptStream && pptStream.content) {
        const bytes = pptStream.content;
        let pos = 0;
        let actualSlideText = [];

        while (pos < bytes.length - 8) {
          const recType = bytes[pos + 2] | (bytes[pos + 3] << 8);
          const recLen = bytes[pos + 4] | (bytes[pos + 5] << 8) | (bytes[pos + 6] << 16) | (bytes[pos + 7] << 24);
          pos += 8;

          if (recType === 1006) {
            if (actualSlideText.length > 0) {
              textoDiapositivas.push(actualSlideText);
              actualSlideText = [];
            }
          } else if (recType === 4000 && recLen > 0 && recLen < 50000 && pos + recLen <= bytes.length) {
            let str = '';
            for (let k = 0; k < recLen; k += 2) {
              const code = bytes[pos + k] | (bytes[pos + k + 1] << 8);
              if (code >= 32) str += String.fromCharCode(code);
              else if (code === 10 || code === 13) str += '\n';
            }
            if (str.trim()) actualSlideText.push(str.trim());
          } else if (recType === 4008 && recLen > 0 && recLen < 50000 && pos + recLen <= bytes.length) {
            let str = '';
            for (let k = 0; k < recLen; k++) {
              const code = bytes[pos + k];
              if (code >= 32) str += String.fromCharCode(code);
              else if (code === 10 || code === 13) str += '\n';
            }
            if (str.trim()) actualSlideText.push(str.trim());
          }
          pos += recLen;
        }
        if (actualSlideText.length > 0) textoDiapositivas.push(actualSlideText);
      }
    }

    if (textoDiapositivas.length === 0) {
      const u8 = new Uint8Array(arrayBuffer);
      let s = '';
      for (let i = 0; i < u8.length; i++) {
        const c = u8[i];
        if ((c >= 32 && c <= 126) || c === 10 || c === 13 || (c >= 192 && c <= 255)) s += String.fromCharCode(c);
        else s += '\0';
      }
      const partes = s.split('\0').map(x => x.trim()).filter(x => x.length > 6);
      if (partes.length > 0) {
        let chunk = [];
        for (let p of partes) {
          chunk.push(p);
          if (chunk.length >= 6) {
            textoDiapositivas.push(chunk);
            chunk = [];
          }
        }
        if (chunk.length > 0) textoDiapositivas.push(chunk);
      }
    }

    for (let i = 0; i < Math.max(1, textoDiapositivas.length); i++) {
      if (i > 0) docPdf.addPage([960, 540], 'landscape');
      const parrafos = textoDiapositivas[i] || [`Presentación: ${nombreArchivo}`];

      docPdf.setFillColor(250, 248, 245);
      docPdf.rect(0, 0, 960, 540, 'F');

      docPdf.setFillColor(140, 98, 57);
      docPdf.roundedRect(40, 30, 880, 80, 10, 10, 'F');
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(22);
      docPdf.setTextColor(255, 255, 255);
      const titulo = parrafos[0] || `Diapositiva ${i + 1}`;
      const lineasTitulo = docPdf.splitTextToSize(titulo, 840);
      docPdf.text(lineasTitulo[0], 480, 75, { align: 'center' });

      docPdf.setFont('helvetica', 'normal');
      docPdf.setFontSize(15);
      docPdf.setTextColor(30, 41, 59);
      let y = 145;

      for (let j = 1; j < parrafos.length; j++) {
        const pTxt = parrafos[j];
        const lineas = docPdf.splitTextToSize(`• ${pTxt}`, 840);
        docPdf.text(lineas, 60, y);
        y += (lineas.length * 22) + 8;
        if (y > 490) break;
      }
    }

    return new Uint8Array(docPdf.output('arraybuffer'));
  } catch (err) {
    return await fallbackPPTX(new Blob([arrayBuffer]));
  }
}

async function fallbackPPTX(archivo) {
  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [960, 540] });
  docPdf.setFillColor(250, 248, 245);
  docPdf.rect(0, 0, 960, 540, 'F');
  docPdf.setFontSize(20);
  docPdf.setTextColor(140, 98, 57);
  docPdf.text('Presentación Documental', 480, 260, { align: 'center' });
  return new Uint8Array(docPdf.output('arraybuffer'));
}

// 3. MOTOR WORD (.docx y .doc)
async function convertirDocumentoAPDF(archivo) {
  const arrayBuffer = await archivo.arrayBuffer();
  const ext = archivo.name.split('.').pop().toLowerCase();

  if (ext === 'doc') {
    return await convertirLegacyDOCaPDF(arrayBuffer, archivo.name);
  }

  const result = await mammoth.convertToHtml({ arrayBuffer });
  const htmlContent = result.value;

  const tempContainer = document.createElement('div');
  tempContainer.style.position = 'fixed';
  tempContainer.style.top = '-99999px';
  tempContainer.style.left = '-99999px';
  tempContainer.style.width = '794px';
  tempContainer.style.background = '#ffffff';
  tempContainer.style.color = '#111827';
  tempContainer.style.fontFamily = 'Calibri, Arial, "Segoe UI", sans-serif';
  tempContainer.style.fontSize = '14px';
  tempContainer.style.lineHeight = '1.6';
  tempContainer.style.padding = '55px 65px';
  tempContainer.style.boxSizing = 'border-box';

  tempContainer.innerHTML = `
    <style>
      table { border-collapse: collapse; width: 100%; margin: 18px 0; }
      table, th, td { border: 1px solid #374151; padding: 8px 12px; font-size: 13px; text-align: left; }
      th { background-color: #f3f4f6; font-weight: bold; }
      p { margin: 0 0 12px 0; }
      h1 { color: #1e3a8a; font-size: 24px; margin: 24px 0 12px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
      h2 { color: #1e40af; font-size: 19px; margin: 20px 0 10px 0; }
      h3 { color: #1d4ed8; font-size: 16px; margin: 16px 0 8px 0; }
      ul, ol { margin: 8px 0 14px 26px; padding: 0; }
      li { margin-bottom: 6px; }
      img { max-width: 100%; height: auto; display: block; margin: 14px auto; }
      blockquote { border-left: 4px solid #3b82f6; padding-left: 14px; margin: 14px 0; color: #475569; font-style: italic; }
    </style>
    <div>${htmlContent}</div>
  `;
  document.body.appendChild(tempContainer);

  const canvas = await html2canvas(tempContainer, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff'
  });
  document.body.removeChild(tempContainer);

  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF('p', 'pt', 'a4');
  const pdfWidth = docPdf.internal.pageSize.getWidth();
  const pdfHeight = docPdf.internal.pageSize.getHeight();

  const pxPageHeight = (pdfHeight / pdfWidth) * canvas.width;
  const totalPages = Math.ceil(canvas.height / pxPageHeight);

  for (let i = 0; i < totalPages; i++) {
    if (i > 0) docPdf.addPage('a4', 'portrait');

    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = Math.min(pxPageHeight, canvas.height - (i * pxPageHeight));
    const ctx = pageCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(canvas, 0, i * pxPageHeight, canvas.width, pageCanvas.height, 0, 0, pageCanvas.width, pageCanvas.height);

    const imgData = pageCanvas.toDataURL('image/jpeg', 0.95);
    const destHeight = (pageCanvas.height / canvas.width) * pdfWidth;
    docPdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, destHeight);
  }

  return new Uint8Array(docPdf.output('arraybuffer'));
}

async function convertirLegacyDOCaPDF(arrayBuffer, nombreArchivo) {
  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF('p', 'pt', 'a4');
  const pdfWidth = docPdf.internal.pageSize.getWidth();
  const pdfHeight = docPdf.internal.pageSize.getHeight();

  let textoCompleto = '';
  const u8 = new Uint8Array(arrayBuffer);
  let cur = '';
  for (let i = 0; i < u8.length; i++) {
    const c = u8[i];
    if ((c >= 32 && c <= 126) || (c >= 160 && c <= 255) || c === 10 || c === 13) {
      cur += String.fromCharCode(c);
    } else {
      if (cur.trim().length > 10) textoCompleto += cur.trim() + '\n\n';
      cur = '';
    }
  }

  const parrafos = textoCompleto.split('\n').filter(p => p.trim().length > 0);
  docPdf.setFont('helvetica', 'bold');
  docPdf.setFontSize(18);
  docPdf.setTextColor(30, 58, 138);
  docPdf.text(nombreArchivo.replace(/\.doc$/i, ''), 50, 60);

  docPdf.setFont('helvetica', 'normal');
  docPdf.setFontSize(11);
  docPdf.setTextColor(17, 24, 39);

  let y = 95;
  for (let p of parrafos) {
    const lineas = docPdf.splitTextToSize(p, pdfWidth - 100);
    if (y + (lineas.length * 16) > pdfHeight - 60) {
      docPdf.addPage('a4', 'portrait');
      y = 60;
    }
    docPdf.text(lineas, 50, y);
    y += (lineas.length * 16) + 8;
  }

  return new Uint8Array(docPdf.output('arraybuffer'));
}

// 4. MOTOR EXCEL (.xlsx, .xls, .csv)
async function convertirExcelAPDF(archivo) {
  const arrayBuffer = await archivo.arrayBuffer();
  const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pdfWidth = docPdf.internal.pageSize.getWidth();
  const pdfHeight = docPdf.internal.pageSize.getHeight();

  let pageAdded = false;

  for (let sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const data = window.XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    if (!data || data.length === 0) continue;

    if (pageAdded) docPdf.addPage('a4', 'landscape');
    pageAdded = true;

    docPdf.setFillColor(241, 245, 249);
    docPdf.rect(0, 0, pdfWidth, 45, 'F');
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(14);
    docPdf.setTextColor(15, 23, 42);
    docPdf.text(`📊 ${sheetName} — ${archivo.name}`, 35, 28);

    const maxCols = Math.min(12, Math.max(...data.map(r => (r ? r.length : 0))));
    const colWidth = (pdfWidth - 70) / Math.max(1, maxCols);
    let y = 65;

    for (let rIdx = 0; rIdx < data.length; rIdx++) {
      const row = data[rIdx];
      if (!row || row.length === 0) continue;

      if (y > pdfHeight - 40) {
        docPdf.addPage('a4', 'landscape');
        y = 45;
      }

      const isHeader = rIdx === 0;
      docPdf.setFillColor(isHeader ? 226 : (rIdx % 2 === 0 ? 255 : 248), isHeader ? 232 : (rIdx % 2 === 0 ? 255 : 250), isHeader ? 240 : (rIdx % 2 === 0 ? 255 : 252));
      docPdf.rect(35, y, pdfWidth - 70, 20, 'F');
      docPdf.setDrawColor(203, 213, 225);
      docPdf.rect(35, y, pdfWidth - 70, 20, 'S');

      docPdf.setFont('helvetica', isHeader ? 'bold' : 'normal');
      docPdf.setFontSize(9);
      docPdf.setTextColor(isHeader ? 30 : 51, isHeader ? 41 : 65, isHeader ? 59 : 85);

      for (let cIdx = 0; cIdx < maxCols; cIdx++) {
        const val = row[cIdx] !== undefined && row[cIdx] !== null ? String(row[cIdx]) : '';
        const x = 35 + (cIdx * colWidth) + 6;
        const txtClipped = docPdf.splitTextToSize(val, colWidth - 10)[0] || '';
        docPdf.text(txtClipped, x, y + 14);
      }
      y += 20;
    }
  }

  return new Uint8Array(docPdf.output('arraybuffer'));
}

// 5. PROCESADOR PRINCIPAL UNIVERSAL DE DOCUMENTOS (SILENCIOSO)
async function procesarArchivoWeb(e) {
  const archivos = Array.from(e.target.files);
  if (archivos.length === 0) return;

  for (const archivo of archivos) {
    const nombreOriginal = archivo.name;
    const extension = nombreOriginal.slice(nombreOriginal.lastIndexOf('.')).toLowerCase();

    try {
      let bytes = null;
      let nombreDocumento = nombreOriginal;

      if (['.pptx', '.ppt', '.docx', '.doc', '.xlsx', '.xls', '.csv'].includes(extension)) {
        bytes = await intentarConversionNativaOffice(archivo);

        if (!bytes) {
          if (extension === '.pptx' || extension === '.ppt') {
            bytes = await convertirPresentacionAPDF(archivo);
          } else if (extension === '.docx' || extension === '.doc') {
            bytes = await convertirDocumentoAPDF(archivo);
          } else if (extension === '.xlsx' || extension === '.xls' || extension === '.csv') {
            bytes = await convertirExcelAPDF(archivo);
          }
        }
        nombreDocumento = nombreOriginal.replace(/\.(pptx|ppt|docx|doc|xlsx|xls|csv)$/i, '.pdf');
      } else {
        const buffer = await archivo.arrayBuffer();
        bytes = new Uint8Array(buffer);
      }

      if (bytes && bytes.byteLength > 0) {
        await procesarDocumentoPDF(bytes, nombreDocumento, nombreDocumento, null);
      }
    } catch (err) {
      console.error('Error al procesar archivo:', err);
    }
  }
  e.target.value = '';
}

async function guardarPDF() {
  const p = getPestanaActual();
  if (!p) return;

  const payload = {
    resaltados: p.appState.resaltados || [],
    textos: p.appState.textos || [],
    comentarios: p.appState.comentarios || [],
    trazos: p.appState.trazos || [],
    marcadores: p.marcadores || []
  };

  const claveStorage = `pdf_anotaciones_${p.nombre}`;
  localStorage.setItem(claveStorage, JSON.stringify(payload));

  p.modificado = false;
  actualizarProgresoReciente(p.nombre, p.paginaActual);
  actualizarBarraPestanas();

  sincronizarHaciaNube(p.nombre, payload);
}

let pestanaPendienteGuardar = null;

async function iniciarFlujoCierreApp() {
  pestanas.forEach(p => actualizarProgresoReciente(p.nombre, p.paginaActual));
  const modificada = pestanas.find(p => p.modificado);
  if (!modificada) {
    if (window.pywebview && window.pywebview.api) {
      await window.pywebview.api.forzar_cierre();
    }
    return;
  }
  pestanaPendienteGuardar = modificada;
  modalFilenameTxt.textContent = `${modificada.nombre}`;
  saveConfirmModal.style.display = 'flex';
}

async function resolverModalGuardado(opcion) {
  if (saveConfirmModal) saveConfirmModal.style.display = 'none';
  if (!pestanaPendienteGuardar) return;

  const p = pestanaPendienteGuardar;
  const idx = pestanas.indexOf(p);

  if (opcion === 'cancelar') {
    pestanaPendienteGuardar = null;
    return;
  }

  if (opcion === 'guardar') {
    const payload = {
      resaltados: p.appState.resaltados || [],
      textos: p.appState.textos || [],
      comentarios: p.appState.comentarios || [],
      trazos: p.appState.trazos || [],
      marcadores: p.marcadores || []
    };
    localStorage.setItem(`pdf_anotaciones_${p.nombre}`, JSON.stringify(payload));
    sincronizarHaciaNube(p.nombre, payload);
    p.modificado = false;
  }

  pestanaPendienteGuardar = null;
  if (idx !== -1) {
    ejecutarCierreEfectivoPestana(idx);
  }
}

function actualizarBarraPestanas() {
  tabsBar.innerHTML = '';
  pestanas.forEach((p, idx) => {
    const tab = document.createElement('div');
    tab.className = `tab-btn ${idx === idxPestanaActiva ? 'active' : ''}`;
    tab.title = p.nombre;
    tab.onclick = () => cambiarPestana(idx);
    tab.innerHTML = `
      <span class="tab-num-badge">${idx + 1}</span>
      <span class="tab-name">${p.nombre}</span>
      ${p.modificado ? '<span class="tab-dirty-indicator" title="Cambios sin guardar"></span>' : ''}
      <span class="tab-close" onclick="cerrarPestana(event, ${idx})">✕</span>
    `;
    tabsBar.appendChild(tab);
  });
}

async function cambiarPestana(idx) {
  if (idx < 0 || idx >= pestanas.length || idx === idxPestanaActiva) return;
  const previa = getPestanaActual();
  if (previa) {
    previa.scrollX = wrapper.scrollLeft;
    previa.scrollY = wrapper.scrollTop;
    actualizarProgresoReciente(previa.nombre, previa.paginaActual);
  }

  if (typeof cerrarBarraBusqueda === 'function') cerrarBarraBusqueda();
  if (typeof cerrarSaltoRapido === 'function') cerrarSaltoRapido();
  if (typeof cerrarMenuBloque === 'function') cerrarMenuBloque();
  if (typeof ocultarPopupComentario === 'function') ocultarPopupComentario();

  idxPestanaActiva = idx;
  const actual = getPestanaActual();

  actualizarVisibilidadRecientes();
  actualizarBarraPestanas();
  actualizarEstilosModoVista();
  actualizarContenidoGaveta();

  if (selectionPopover) selectionPopover.style.display = 'none';
  await renderizarTodasLasPaginas();

  wrapper.scrollLeft = actual.scrollX || 0;
  wrapper.scrollTop = actual.scrollY || 0;
  actualizarContadorPaginas();
}

async function cerrarPestana(e, idx = idxPestanaActiva) {
  if (e) e.stopPropagation();
  if (idx < 0 || idx >= pestanas.length) return;

  const p = pestanas[idx];
  if (!p) return;

  actualizarProgresoReciente(p.nombre, p.paginaActual);

  if (p.modificado) {
    pestanaPendienteGuardar = p;
    if (modalFilenameTxt) modalFilenameTxt.textContent = `${p.nombre}`;
    if (saveConfirmModal) saveConfirmModal.style.display = 'flex';
    return;
  }

  await ejecutarCierreEfectivoPestana(idx);
}

async function ejecutarCierreEfectivoPestana(idx) {
  const eraActiva = (idx === idxPestanaActiva);
  const cerrada = pestanas[idx];
  if (cerrada) {
    historialPestanasCerradas.push(cerrada);
    actualizarProgresoReciente(cerrada.nombre, cerrada.paginaActual);
    if (cerrada.bytesPDF && cerrada.bytesPDF.byteLength > 0) {
      guardarBinarioRecienteIDB(cerrada.nombre, cerrada.bytesPDF, cerrada.datosB64);
    }
  }
  pestanas.splice(idx, 1);

  if (pestanas.length === 0) {
    idxPestanaActiva = -1;
    if (pagesContainer) pagesContainer.innerHTML = '';
    if (sidebar) sidebar.innerHTML = '';
    if (vCurrPage) vCurrPage.textContent = '-';
    if (vTotalPages) vTotalPages.textContent = '-';
    if (typeof cerrarBarraBusqueda === 'function') cerrarBarraBusqueda();
    if (typeof cerrarSaltoRapido === 'function') cerrarSaltoRapido();
    if (typeof cerrarGaveta === 'function') cerrarGaveta();
    if (typeof cerrarMenuBloque === 'function') cerrarMenuBloque();
    if (typeof ocultarPopupComentario === 'function') ocultarPopupComentario();
    actualizarBarraPestanas();
    actualizarEstilosModoVista();
    actualizarContenidoGaveta();
    actualizarVisibilidadRecientes();
    return;
  }

  if (eraActiva) {
    const nuevoIdx = Math.min(idx, pestanas.length - 1);
    idxPestanaActiva = -1;
    await cambiarPestana(nuevoIdx);
  } else {
    if (idx < idxPestanaActiva) {
      idxPestanaActiva--;
    }
    actualizarBarraPestanas();
  }
}

function mostrarPopupComentario(e, comentario, forzarEdicion = false) {
  if (!comentario || !commentHoverPopup) return;
  if (isEditingPopup && comentarioEnPopupActivo && comentarioEnPopupActivo.id === comentario.id) return;

  comentarioEnPopupActivo = comentario;
  textoOriginalAntesDeEditar = comentario.texto;

  if (commentPopupTime) commentPopupTime.textContent = comentario.hora || 'Hoy';
  if (commentPopupText) commentPopupText.textContent = comentario.texto;

  const rect = e.target.getBoundingClientRect();
  const wrapperRect = wrapper.getBoundingClientRect();

  const topPos = Math.max(12, (rect.top - wrapperRect.top + wrapper.scrollTop) - 80);
  const leftPos = Math.max(12, Math.min(window.innerWidth - 340, (rect.left - wrapperRect.left + wrapper.scrollLeft)));

  commentHoverPopup.style.top = topPos + 'px';
  commentHoverPopup.style.left = leftPos + 'px';
  commentHoverPopup.style.display = 'flex';

  if (forzarEdicion) {
    habilitarEdicionInlineComentario();
  } else {
    desactivarModoEdicionVisual();
  }
}

function ocultarPopupComentario() {
  if (isEditingPopup) return;
  if (commentHoverPopup) commentHoverPopup.style.display = 'none';
  comentarioEnPopupActivo = null;
}

function habilitarEdicionInlineComentario() {
  if (!commentPopupText) return;
  isEditingPopup = true;
  commentPopupText.contentEditable = "true";
  commentPopupText.classList.add('is-editing');
  if (commentPopupActions) commentPopupActions.style.display = 'flex';
  if (btnEditInline) btnEditInline.style.display = 'none';
  commentPopupText.focus();
}

function desactivarModoEdicionVisual() {
  isEditingPopup = false;
  if (commentPopupText) {
    commentPopupText.contentEditable = "false";
    commentPopupText.classList.remove('is-editing');
  }
  if (commentPopupActions) commentPopupActions.style.display = 'none';
  if (btnEditInline) btnEditInline.style.display = 'block';
}

function cancelarEdicionInlineComentario() {
  if (commentPopupText) commentPopupText.textContent = textoOriginalAntesDeEditar;
  desactivarModoEdicionVisual();
}

function guardarEdicionInlineComentario() {
  if (!comentarioEnPopupActivo || !commentPopupText) return;
  const nuevo = commentPopupText.innerText.trim();
  if (nuevo && nuevo !== comentarioEnPopupActivo.texto) {
    guardarSnapshot();
    comentarioEnPopupActivo.texto = nuevo;
    marcarModificado();
    reconstruirAnotacionesEnDOM();
    if (typeof actualizarContenidoGaveta === 'function') actualizarContenidoGaveta();
  }
  desactivarModoEdicionVisual();
}

function eliminarComentarioDesdePopup() {
  if (!comentarioEnPopupActivo) return;
  const p = getPestanaActual();
  if (!p) return;
  guardarSnapshot();
  p.appState.comentarios = p.appState.comentarios.filter(c => c.id !== comentarioEnPopupActivo.id);
  desactivarModoEdicionVisual();
  if (commentHoverPopup) commentHoverPopup.style.display = 'none';
  marcarModificado();
  reconstruirAnotacionesEnDOM();
  if (typeof actualizarContenidoGaveta === 'function') actualizarContenidoGaveta();
}

// SISTEMA DE DOCUMENTOS RECIENTES
const RECIENTES_STORAGE_KEY = 'pdf_recientes_meta_v1';
const RECIENTES_LAYOUT_KEY = 'pdf_recientes_layout_v1';
const MAX_DOCUMENTOS_RECIENTES = 18;
const cacheBinariosMemoria = new Map();
let abriendoRecienteEnCurso = false;
let filtroRecientesTexto = '';
let filtroRecienteCategoria = '';
const seleccionadosRecientes = new Set();
let menuRecienteDocActivo = null;
let menuRecienteModoSeleccion = false;
let disposicionRecientes = localStorage.getItem(RECIENTES_LAYOUT_KEY) || 'list';

function clonarBytesSeguro(bytes) {
  if (!bytes) return null;
  const vista = bytes instanceof Uint8Array
    ? bytes
    : new Uint8Array(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength);
  if (!vista.byteLength) return null;
  const copia = new Uint8Array(vista.byteLength);
  copia.set(vista);
  return copia;
}

function bytesABase64Async(uint8) {
  return new Promise((resolve) => {
    try {
      const blob = new Blob([uint8], { type: 'application/pdf' });
      const reader = new FileReader();
      reader.onload = () => {
        const res = reader.result || '';
        const idx = res.indexOf(',');
        resolve(idx !== -1 ? res.slice(idx + 1) : res);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    } catch (e) {
      resolve(null);
    }
  });
}

function base64ABytes(b64) {
  if (!b64 || typeof b64 !== 'string') return null;
  try {
    const binStr = atob(b64);
    const len = binStr.length;
    if (!len) return null;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    return null;
  }
}

function abrirIDBRecientes() {
  return new Promise((resolve) => {
    if (!window.indexedDB) return resolve(null);
    const req = indexedDB.open('LectorPDFRecientesDB', 2);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('archivos')) {
        db.createObjectStore('archivos', { keyPath: 'nombre' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => resolve(null);
  });
}

async function guardarBinarioRecienteIDB(nombre, bytes, datosB64 = null) {
  if (!nombre || !bytes) return;
  const copiaSegura = clonarBytesSeguro(bytes);
  if (!copiaSegura) return;

  cacheBinariosMemoria.set(nombre, copiaSegura);

  const b64Str = datosB64 || await bytesABase64Async(copiaSegura);

  if (b64Str && b64Str.length < 4200000) {
    try {
      localStorage.setItem(`pdf_rec_b64_${nombre}`, b64Str);
    } catch (e) {
      try {
        Object.keys(localStorage)
          .filter(k => k.startsWith('pdf_rec_b64_') && k !== `pdf_rec_b64_${nombre}`)
          .forEach(k => localStorage.removeItem(k));
        localStorage.setItem(`pdf_rec_b64_${nombre}`, b64Str);
      } catch (_) {}
    }
  }

  try {
    const db = await abrirIDBRecientes();
    if (db) {
      await new Promise((resolve) => {
        const tx = db.transaction('archivos', 'readwrite');
        tx.objectStore('archivos').put({
          nombre,
          b64: b64Str || null,
          data: copiaSegura.buffer.slice(0),
          updatedAt: Date.now()
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    }
  } catch (e) {}
}

async function obtenerBinarioRecienteIDB(nombre) {
  if (cacheBinariosMemoria.has(nombre)) {
    const enMem = cacheBinariosMemoria.get(nombre);
    const clonMem = clonarBytesSeguro(enMem);
    if (clonMem) return clonMem;
  }

  try {
    const b64Local = localStorage.getItem(`pdf_rec_b64_${nombre}`);
    if (b64Local) {
      const desdeLocal = base64ABytes(b64Local);
      if (desdeLocal && desdeLocal.byteLength > 0) {
        cacheBinariosMemoria.set(nombre, desdeLocal);
        return clonarBytesSeguro(desdeLocal);
      }
    }
  } catch (e) {}

  try {
    const db = await abrirIDBRecientes();
    if (!db) return null;
    return await new Promise((resolve) => {
      const tx = db.transaction('archivos', 'readonly');
      const req = tx.objectStore('archivos').get(nombre);
      req.onsuccess = () => {
        if (req.result) {
          if (req.result.data) {
            const clonIDB = clonarBytesSeguro(req.result.data);
            if (clonIDB) {
              cacheBinariosMemoria.set(nombre, clonIDB);
              resolve(clonarBytesSeguro(clonIDB));
              return;
            }
          }
          if (req.result.b64) {
            const desdeB64 = base64ABytes(req.result.b64);
            if (desdeB64 && desdeB64.byteLength > 0) {
              cacheBinariosMemoria.set(nombre, desdeB64);
              resolve(clonarBytesSeguro(desdeB64));
              return;
            }
          }
        }
        resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

async function eliminarBinarioRecienteIDB(nombre) {
  cacheBinariosMemoria.delete(nombre);
  try { localStorage.removeItem(`pdf_rec_b64_${nombre}`); } catch (e) {}
  try {
    const db = await abrirIDBRecientes();
    if (!db) return;
    const tx = db.transaction('archivos', 'readwrite');
    tx.objectStore('archivos').delete(nombre);
  } catch (e) {}
}

async function limpiarBinariosRecientesIDB() {
  cacheBinariosMemoria.clear();
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('pdf_rec_b64_'))
      .forEach(k => localStorage.removeItem(k));
  } catch (e) {}
  try {
    const db = await abrirIDBRecientes();
    if (!db) return;
    const tx = db.transaction('archivos', 'readwrite');
    tx.objectStore('archivos').clear();
  } catch (e) {}
}

function obtenerListaRecientes() {
  try {
    const raw = localStorage.getItem(RECIENTES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function guardarListaRecientes(lista) {
  try {
    localStorage.setItem(RECIENTES_STORAGE_KEY, JSON.stringify(lista.slice(0, MAX_DOCUMENTOS_RECIENTES)));
  } catch (e) {}
}

async function generarMiniaturaPortada(primeraPag) {
  try {
    const vpBase = primeraPag.getViewport({ scale: 1.0 });
    const escalaThumb = Math.min(220 / vpBase.width, 260 / vpBase.height);
    const vpThumb = primeraPag.getViewport({ scale: escalaThumb });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vpThumb.width);
    canvas.height = Math.round(vpThumb.height);
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await primeraPag.render({ canvasContext: ctx, viewport: vpThumb }).promise;
    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.78),
      esHorizontal: vpBase.width > vpBase.height * 1.1
    };
  } catch (e) {
    return { dataUrl: null, esHorizontal: false };
  }
}

async function registrarDocumentoEnRecientes({ nombre, ruta, numPages, primeraPag, bytes, datosB64 }) {
  if (bytes && bytes.byteLength > 0) {
    await guardarBinarioRecienteIDB(nombre, bytes, datosB64);
  }

  const lista = obtenerListaRecientes();
  const previo = lista.find(item => item.nombre === nombre);
  const { dataUrl, esHorizontal } = await generarMiniaturaPortada(primeraPag);

  const nuevoItem = {
    nombre,
    ruta: ruta || (previo ? previo.ruta : nombre),
    categoria: previo ? (previo.categoria || null) : null,
    numPages: numPages || (previo ? previo.numPages : 1),
    ultimaPagina: previo && previo.ultimaPagina ? Math.min(previo.ultimaPagina, numPages || previo.ultimaPagina) : 1,
    esHorizontal: esHorizontal,
    thumbnail: dataUrl || (previo ? previo.thumbnail : null),
    timestamp: Date.now()
  };

  const filtrada = lista.filter(item => item.nombre !== nombre);
  filtrada.unshift(nuevoItem);
  guardarListaRecientes(filtrada);

  return nuevoItem;
}

function actualizarProgresoReciente(nombre, paginaActual) {
  if (!nombre || !paginaActual) return;
  const lista = obtenerListaRecientes();
  const item = lista.find(x => x.nombre === nombre);
  if (item) {
    item.ultimaPagina = paginaActual;
    item.timestamp = Date.now();
    guardarListaRecientes(lista);
  }
}

function formatearTiempoRelativo(ts) {
  if (!ts) return 'Reciente';
  const diffSeg = Math.floor((Date.now() - ts) / 1000);
  if (diffSeg < 60) return 'Hace unos segundos';
  const diffMin = Math.floor(diffSeg / 60);
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHoras = Math.floor(diffMin / 60);
  if (diffHoras < 24) return `Hace ${diffHoras} ${diffHoras === 1 ? 'hora' : 'horas'}`;
  const diffDias = Math.floor(diffHoras / 24);
  if (diffDias === 1) return 'Ayer';
  if (diffDias < 7) return `Hace ${diffDias} días`;
  const fecha = new Date(ts);
  return fecha.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function cambiarDisposicionRecientes(modo) {
  disposicionRecientes = modo === 'grid' ? 'grid' : 'list';
  localStorage.setItem(RECIENTES_LAYOUT_KEY, disposicionRecientes);
  renderizarVistaRecientes();
}

function filtrarDocumentosRecientes(query) {
  filtroRecientesTexto = (query || '').trim().toLowerCase();
  renderizarVistaRecientes();
}

function filtrarPorCategoria(cat) {
  if (filtroRecienteCategoria === cat) {
    filtroRecienteCategoria = '';
  } else {
    filtroRecienteCategoria = cat || '';
  }
  renderizarVistaRecientes();
}

function obtenerDocumentosRecientesVisibles() {
  const todos = obtenerListaRecientes();
  return todos.filter(doc => {
    if (filtroRecienteCategoria && doc.categoria !== filtroRecienteCategoria) {
      return false;
    }
    if (filtroRecientesTexto) {
      const matchNombre = doc.nombre && doc.nombre.toLowerCase().includes(filtroRecientesTexto);
      const matchRuta = doc.ruta && doc.ruta.toLowerCase().includes(filtroRecientesTexto);
      const matchCat = doc.categoria && doc.categoria.toLowerCase().includes(filtroRecientesTexto);
      if (!matchNombre && !matchRuta && !matchCat) return false;
    }
    return true;
  });
}

function toggleSeleccionReciente(nombre) {
  if (seleccionadosRecientes.has(nombre)) {
    seleccionadosRecientes.delete(nombre);
  } else {
    seleccionadosRecientes.add(nombre);
  }
  actualizarBarraMultiseleccion();
  actualizarEstadoTarjetasRecientes();
}

function seleccionarTodosRecientesVisibles() {
  const visibles = obtenerDocumentosRecientesVisibles();
  if (visibles.length === 0) return;
  visibles.forEach(doc => seleccionadosRecientes.add(doc.nombre));
  actualizarBarraMultiseleccion();
  actualizarEstadoTarjetasRecientes();
}

function limpiarSeleccionRecientes() {
  seleccionadosRecientes.clear();
  actualizarBarraMultiseleccion();
  actualizarEstadoTarjetasRecientes();
}

function actualizarBarraMultiseleccion() {
  const bar = document.getElementById('recent-multiselect-bar');
  const badge = document.getElementById('multiselect-count-badge');
  const label = document.getElementById('multiselect-label-txt');
  const openTxt = document.getElementById('btn-multiselect-open-txt');
  if (!bar) return;

  const count = seleccionadosRecientes.size;
  if (count === 0) {
    bar.style.display = 'none';
  } else {
    bar.style.display = 'flex';
    if (badge) badge.textContent = count;
    if (label) label.textContent = count === 1 ? 'documento seleccionado' : 'documentos seleccionados';
    if (openTxt) openTxt.textContent = count === 1 ? 'Abrir seleccionado' : `Abrir seleccionados (${count})`;
  }
}

function actualizarEstadoTarjetasRecientes() {
  const listEl = document.getElementById('recent-docs-list');
  if (!listEl) return;
  const cards = listEl.querySelectorAll('.recent-doc-item');
  cards.forEach(card => {
    const docName = card.dataset.docName;
    if (!docName) return;
    const isSelected = seleccionadosRecientes.has(docName);
    card.classList.toggle('is-selected', isSelected);
  });
}

async function abrirRecientesSeleccionados() {
  if (seleccionadosRecientes.size === 0) return;
  const docs = Array.from(seleccionadosRecientes);
  limpiarSeleccionRecientes();
  for (const nombre of docs) {
    await abrirDocumentoReciente(nombre);
  }
}

function eliminarDocumentoReciente(e, nombre) {
  if (e) e.stopPropagation();
  seleccionadosRecientes.delete(nombre);
  const lista = obtenerListaRecientes().filter(x => x.nombre !== nombre);
  guardarListaRecientes(lista);
  eliminarBinarioRecienteIDB(nombre);
  actualizarBarraMultiseleccion();
  renderizarVistaRecientes();
}

function limpiarTodosLosRecientes() {
  const lista = obtenerListaRecientes();
  if (lista.length === 0) return;
  seleccionadosRecientes.clear();
  filtroRecienteCategoria = '';
  guardarListaRecientes([]);
  limpiarBinariosRecientesIDB();
  actualizarBarraMultiseleccion();
  renderizarVistaRecientes();
  mostrarToast('Historial de recientes limpiado');
}

async function abrirDocumentoReciente(nombre) {
  if (abriendoRecienteEnCurso) return;
  const existenteIdx = pestanas.findIndex(p => p.nombre === nombre);
  if (existenteIdx !== -1) {
    await cambiarPestana(existenteIdx);
    return;
  }

  const lista = obtenerListaRecientes();
  const item = lista.find(x => x.nombre === nombre);
  if (!item) return;

  abriendoRecienteEnCurso = true;
  try {
    const bytesGuardados = await obtenerBinarioRecienteIDB(nombre);
    if (bytesGuardados && bytesGuardados.byteLength > 0) {
      await procesarDocumentoPDF(bytesGuardados, item.nombre, item.ruta, null, item.ultimaPagina || 1);
      return;
    }

    mostrarToast('Abrí el archivo una vez más para guardar su copia rápida', false);
    abrirPDF();
  } finally {
    abriendoRecienteEnCurso = false;
  }
}

function abrirMenuTarjetaReciente(e, nombre) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  menuRecienteDocActivo = nombre;
  menuRecienteModoSeleccion = false;

  const menu = document.getElementById('recent-card-menu');
  const title = document.getElementById('recent-menu-doc-title');
  const input = document.getElementById('recent-category-input');
  const btnRemove = document.getElementById('btn-remove-cat-menu');
  const btnDelete = document.getElementById('btn-delete-recent-menu');
  if (!menu) return;

  const doc = obtenerListaRecientes().find(x => x.nombre === nombre);
  const catActual = (doc && doc.categoria) ? doc.categoria : '';

  if (title) title.textContent = nombre;
  if (input) input.value = catActual;
  if (btnRemove) {
    btnRemove.style.display = catActual ? 'flex' : 'none';
    const txtSpan = btnRemove.querySelector('span:last-child');
    if (txtSpan) txtSpan.textContent = 'Quitar categoría';
  }
  if (btnDelete) {
    btnDelete.style.display = 'flex';
    const txtSpan = btnDelete.querySelector('span:last-child');
    if (txtSpan) txtSpan.textContent = 'Quitar de recientes';
  }

  poblarCategoriasExistentesEnMenu(input);
  posicionarMenuReciente(e, menu);
  menu.style.display = 'flex';
  if (input) setTimeout(() => { input.focus(); input.select(); }, 50);
}

function abrirMenuCategorizarSeleccion(e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  if (seleccionadosRecientes.size === 0) return;

  menuRecienteDocActivo = null;
  menuRecienteModoSeleccion = true;

  const menu = document.getElementById('recent-card-menu');
  const title = document.getElementById('recent-menu-doc-title');
  const input = document.getElementById('recent-category-input');
  const btnRemove = document.getElementById('btn-remove-cat-menu');
  const btnDelete = document.getElementById('btn-delete-recent-menu');
  if (!menu) return;

  const count = seleccionadosRecientes.size;
  if (title) title.textContent = `Categorizar (${count} seleccionados)`;
  if (input) input.value = '';
  if (btnRemove) {
    btnRemove.style.display = 'flex';
    const txtSpan = btnRemove.querySelector('span:last-child');
    if (txtSpan) txtSpan.textContent = 'Quitar categoría a todos';
  }
  if (btnDelete) {
    btnDelete.style.display = 'flex';
    const txtSpan = btnDelete.querySelector('span:last-child');
    if (txtSpan) txtSpan.textContent = 'Quitar seleccionados de recientes';
  }

  poblarCategoriasExistentesEnMenu(input);
  posicionarMenuReciente(e, menu);
  menu.style.display = 'flex';
  if (input) setTimeout(() => { input.focus(); }, 50);
}

function cerrarMenuTarjetaReciente() {
  const menu = document.getElementById('recent-card-menu');
  if (menu) menu.style.display = 'none';
  menuRecienteDocActivo = null;
  menuRecienteModoSeleccion = false;
}

function posicionarMenuReciente(e, menu) {
  const menuWidth = 270;
  const menuHeight = 220;
  let x = 100, y = 100;

  if (e && e.currentTarget && e.currentTarget.getBoundingClientRect) {
    const rect = e.currentTarget.getBoundingClientRect();
    x = rect.left;
    y = rect.bottom + 6;
  } else if (e && e.clientX !== undefined) {
    x = e.clientX;
    y = e.clientY + 6;
  }

  if (x + menuWidth > window.innerWidth - 12) {
    x = window.innerWidth - menuWidth - 12;
  }
  if (x < 12) x = 12;

  if (y + menuHeight > window.innerHeight - 12) {
    y = Math.max(12, y - menuHeight - 36);
  }

  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
}

function poblarCategoriasExistentesEnMenu(inputEl) {
  const container = document.getElementById('recent-existing-cats');
  if (!container) return;
  container.innerHTML = '';

  const todos = obtenerListaRecientes();
  const unicas = Array.from(new Set(todos.map(d => (d.categoria || '').trim()).filter(Boolean)));
  if (unicas.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  unicas.forEach(cat => {
    const pill = document.createElement('span');
    pill.className = 'recent-existing-cat-pill';
    pill.textContent = cat;
    pill.title = `Aplicar "${cat}"`;
    pill.onclick = (ev) => {
      ev.stopPropagation();
      if (inputEl) inputEl.value = cat;
      guardarCategoriaDesdeMenu();
    };
    container.appendChild(pill);
  });
}

function guardarCategoriaDesdeMenu() {
  const input = document.getElementById('recent-category-input');
  const cat = input ? input.value.trim() : '';

  const lista = obtenerListaRecientes();

  if (menuRecienteModoSeleccion) {
    if (seleccionadosRecientes.size === 0) {
      cerrarMenuTarjetaReciente();
      return;
    }
    let modificados = 0;
    lista.forEach(doc => {
      if (seleccionadosRecientes.has(doc.nombre)) {
        if (cat) {
          doc.categoria = cat;
        } else {
          delete doc.categoria;
        }
        modificados++;
      }
    });
    guardarListaRecientes(lista);
    mostrarToast(cat ? `Categoría "${cat}" asignada a ${modificados} documentos` : 'Categoría removida');
    limpiarSeleccionRecientes();
  } else if (menuRecienteDocActivo) {
    const doc = lista.find(x => x.nombre === menuRecienteDocActivo);
    if (doc) {
      if (cat) {
        doc.categoria = cat;
      } else {
        delete doc.categoria;
      }
      guardarListaRecientes(lista);
      mostrarToast(cat ? `Categoría guardada: ${cat}` : 'Categoría removida');
    }
  }

  cerrarMenuTarjetaReciente();
  renderizarVistaRecientes();
}

function quitarCategoriaDesdeMenu() {
  const lista = obtenerListaRecientes();

  if (menuRecienteModoSeleccion) {
    if (seleccionadosRecientes.size === 0) {
      cerrarMenuTarjetaReciente();
      return;
    }
    let modificados = 0;
    lista.forEach(doc => {
      if (seleccionadosRecientes.has(doc.nombre)) {
        delete doc.categoria;
        modificados++;
      }
    });
    guardarListaRecientes(lista);
    mostrarToast(`Categoría removida de ${modificados} documentos`);
    limpiarSeleccionRecientes();
  } else if (menuRecienteDocActivo) {
    const doc = lista.find(x => x.nombre === menuRecienteDocActivo);
    if (doc) {
      delete doc.categoria;
      guardarListaRecientes(lista);
      mostrarToast('Categoría eliminada');
    }
  }

  cerrarMenuTarjetaReciente();
  renderizarVistaRecientes();
}

function eliminarRecienteDesdeMenu() {
  if (menuRecienteModoSeleccion) {
    if (seleccionadosRecientes.size === 0) {
      cerrarMenuTarjetaReciente();
      return;
    }
    const listaParaEliminar = Array.from(seleccionadosRecientes);
    const nuevaLista = obtenerListaRecientes().filter(x => !seleccionadosRecientes.has(x.nombre));
    guardarListaRecientes(nuevaLista);
    listaParaEliminar.forEach(nombre => eliminarBinarioRecienteIDB(nombre));
    mostrarToast(`${listaParaEliminar.length} documentos quitados de recientes`);
    limpiarSeleccionRecientes();
  } else if (menuRecienteDocActivo) {
    eliminarDocumentoReciente(null, menuRecienteDocActivo);
    mostrarToast('Documento quitado de recientes');
  }

  cerrarMenuTarjetaReciente();
}

function manejarKeydownInputCategoria(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    guardarCategoriaDesdeMenu();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    cerrarMenuTarjetaReciente();
  }
}

function renderizarChipsCategorias(todos) {
  const catBar = document.getElementById('recent-categories-bar');
  if (!catBar) return;

  const conteoPorCat = new Map();
  todos.forEach(doc => {
    if (doc.categoria && typeof doc.categoria === 'string' && doc.categoria.trim()) {
      const c = doc.categoria.trim();
      conteoPorCat.set(c, (conteoPorCat.get(c) || 0) + 1);
    }
  });

  if (conteoPorCat.size === 0) {
    catBar.style.display = 'none';
    catBar.innerHTML = '';
    filtroRecienteCategoria = '';
    return;
  }

  if (filtroRecienteCategoria && !conteoPorCat.has(filtroRecienteCategoria)) {
    filtroRecienteCategoria = '';
  }

  catBar.style.display = 'flex';
  catBar.innerHTML = '';

  const chipTodas = document.createElement('button');
  chipTodas.className = `recent-cat-chip ${!filtroRecienteCategoria ? 'active' : ''}`;
  chipTodas.innerHTML = `
    <span>Todas</span>
    <span class="recent-cat-chip-count">${todos.length}</span>
  `;
  chipTodas.onclick = () => filtrarPorCategoria('');
  catBar.appendChild(chipTodas);

  Array.from(conteoPorCat.keys()).sort().forEach(cat => {
    const count = conteoPorCat.get(cat);
    const chip = document.createElement('button');
    chip.className = `recent-cat-chip ${filtroRecienteCategoria === cat ? 'active' : ''}`;
    chip.innerHTML = `
      <span>🏷️ ${escapeHTML(cat)}</span>
      <span class="recent-cat-chip-count">${count}</span>
    `;
    chip.onclick = () => filtrarPorCategoria(cat);
    catBar.appendChild(chip);
  });
}

function renderizarVistaRecientes() {
  const view = document.getElementById('recent-docs-view');
  const listEl = document.getElementById('recent-docs-list');
  const countPill = document.getElementById('recent-count-pill');
  const btnList = document.getElementById('btn-recent-list');
  const btnGrid = document.getElementById('btn-recent-grid');
  const btnClear = document.getElementById('btn-clear-recents');
  if (!view || !listEl) return;

  if (btnList) btnList.classList.toggle('active', disposicionRecientes === 'list');
  if (btnGrid) btnGrid.classList.toggle('active', disposicionRecientes === 'grid');
  listEl.className = disposicionRecientes === 'grid' ? 'recent-grid-layout' : 'recent-list-layout';

  const todos = obtenerListaRecientes();
  if (countPill) countPill.textContent = todos.length;
  if (btnClear) btnClear.style.display = todos.length > 0 ? 'inline-flex' : 'none';

  renderizarChipsCategorias(todos);
  actualizarBarraMultiseleccion();

  const filtrados = todos.filter(doc => {
    if (filtroRecienteCategoria && doc.categoria !== filtroRecienteCategoria) {
      return false;
    }
    if (filtroRecientesTexto) {
      const matchNombre = doc.nombre && doc.nombre.toLowerCase().includes(filtroRecientesTexto);
      const matchRuta = doc.ruta && doc.ruta.toLowerCase().includes(filtroRecientesTexto);
      const matchCat = doc.categoria && doc.categoria.toLowerCase().includes(filtroRecientesTexto);
      if (!matchNombre && !matchRuta && !matchCat) return false;
    }
    return true;
  });

  listEl.innerHTML = '';

  if (filtrados.length === 0) {
    listEl.className = '';
    const empty = document.createElement('div');
    empty.className = 'recent-empty-state';
    empty.onclick = () => abrirPDF();
    const motivoFiltro = filtroRecienteCategoria
      ? `en la categoría "${filtroRecienteCategoria}"`
      : (filtroRecientesTexto ? `para "${filtroRecientesTexto}"` : '');

    empty.innerHTML = todos.length === 0
      ? `
        <div class="recent-empty-icon">📚</div>
        <div class="recent-empty-title">No hay documentos recientes todavía</div>
        <div class="recent-empty-desc">Hacé clic aquí o arrastrá tus archivos PDF, Word o PowerPoint para empezar a leer con aceleración por GPU.</div>
      `
      : `
        <div class="recent-empty-icon">🔍</div>
        <div class="recent-empty-title">Sin coincidencias ${motivoFiltro}</div>
        <div class="recent-empty-desc">Probá cambiando el filtro o hacé clic aquí para abrir un documento nuevo.</div>
      `;
    listEl.appendChild(empty);
    return;
  }

  filtrados.forEach(doc => {
    const card = document.createElement('div');
    const estaSeleccionado = seleccionadosRecientes.has(doc.nombre);
    card.className = `recent-doc-item ${estaSeleccionado ? 'is-selected' : ''}`;
    card.dataset.docName = doc.nombre;

    card.onclick = (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || seleccionadosRecientes.size > 0) {
        toggleSeleccionReciente(doc.nombre);
      } else {
        abrirDocumentoReciente(doc.nombre);
      }
    };
    card.ondblclick = () => abrirDocumentoReciente(doc.nombre);

    const ext = (doc.nombre.split('.').pop() || 'PDF').toUpperCase();
    const thumbHtml = doc.thumbnail
      ? `<img class="recent-thumb-img" src="${doc.thumbnail}" alt="${escapeHTML(doc.nombre)}" loading="lazy">`
      : `<div class="recent-thumb-fallback"><span>📄</span><span class="recent-thumb-ext">${ext}</span></div>`;

    const mostrarRuta = doc.ruta && doc.ruta !== doc.nombre ? doc.ruta : '';
    const tieneAvance = doc.ultimaPagina && doc.ultimaPagina > 1;
    const catHtml = doc.categoria
      ? `<span class="recent-cat-badge" title="Categoría: ${escapeHTML(doc.categoria)}">🏷️ ${escapeHTML(doc.categoria)}</span>`
      : '';

    card.innerHTML = `
      <div class="recent-select-check" title="Seleccionar">✓</div>
      <div class="recent-thumb-box ${doc.esHorizontal ? 'is-landscape' : ''}">
        ${thumbHtml}
      </div>
      <div class="recent-doc-info">
        <div class="recent-doc-title-row">
          <span class="recent-doc-name" title="${escapeHTML(doc.nombre)}">${escapeHTML(doc.nombre)}</span>
          ${catHtml}
        </div>
        <div class="recent-doc-meta">
          <span>${formatearTiempoRelativo(doc.timestamp)}</span>
          <span class="recent-meta-dot">•</span>
          <span>${doc.numPages || 1} ${(doc.numPages === 1) ? 'página' : 'páginas'}</span>
          ${mostrarRuta ? `<span class="recent-meta-dot">•</span><span class="recent-doc-path" title="${escapeHTML(mostrarRuta)}">${escapeHTML(mostrarRuta)}</span>` : ''}
        </div>
      </div>
      <div class="recent-doc-right">
        ${tieneAvance
          ? `<span class="recent-resume-pill" title="Retomar en página ${doc.ultimaPagina}">Pág. ${doc.ultimaPagina} / ${doc.numPages}</span>`
          : `<span class="recent-pages-pill">${doc.numPages || 1} págs</span>`
        }
        <div class="recent-right-actions">
          <button class="recent-more-btn" title="Opciones y categoría">⋮</button>
        </div>
      </div>
    `;

    const checkBtn = card.querySelector('.recent-select-check');
    if (checkBtn) {
      checkBtn.onclick = (e) => {
        e.stopPropagation();
        toggleSeleccionReciente(doc.nombre);
      };
    }

    const btnMore = card.querySelector('.recent-more-btn');
    if (btnMore) {
      btnMore.onclick = (e) => {
        e.stopPropagation();
        abrirMenuTarjetaReciente(e, doc.nombre);
      };
    }

    listEl.appendChild(card);
  });
}

function actualizarVisibilidadRecientes() {
  const view = document.getElementById('recent-docs-view');
  const stage = document.getElementById('stage');
  const floatingToolbar = document.getElementById('floating-toolbar');
  const colorPanel = document.getElementById('color-panel-popover');
  const desktopBadge = document.getElementById('desktop-page-badge');
  const sinPestanas = pestanas.length === 0;

  if (view) {
    view.style.display = sinPestanas ? 'flex' : 'none';
  }
  if (stage) {
    stage.style.display = sinPestanas ? 'none' : 'flex';
  }
  if (desktopBadge) {
    desktopBadge.classList.toggle('hidden', sinPestanas);
  }
  if (floatingToolbar) {
    // Por defecto en pantalla de recientes o sin pestañas, siempre oculto
    if (sinPestanas) {
      floatingToolbar.classList.add('hidden');
      floatingToolbar.style.display = 'none';
      if (colorPanel) colorPanel.style.display = 'none';
    }
  }
  if (sinPestanas) {
    renderizarVistaRecientes();
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  const lista = obtenerListaRecientes();
  if (lista.length > 0) {
    const validos = [];
    for (const item of lista) {
      const bin = await obtenerBinarioRecienteIDB(item.nombre);
      if (bin && bin.byteLength > 0) {
        validos.push(item);
      }
    }
    if (validos.length !== lista.length) {
      guardarListaRecientes(validos);
    }
  }
  actualizarVisibilidadRecientes();
});

if (wrapper) {
  wrapper.addEventListener('dragover', (e) => {
    e.preventDefault();
    document.body.classList.add('is-dragging-file');
  });
  wrapper.addEventListener('dragleave', (e) => {
    if (e.target === wrapper) {
      document.body.classList.remove('is-dragging-file');
    }
  });
  wrapper.addEventListener('drop', async (e) => {
    e.preventDefault();
    document.body.classList.remove('is-dragging-file');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await procesarArchivoWeb({ target: { files: e.dataTransfer.files, value: '' } });
    }
  });
}

document.addEventListener('click', (e) => {
  const menu = document.getElementById('recent-card-menu');
  if (menu && menu.style.display !== 'none' && !menu.contains(e.target) && !e.target.closest('.recent-more-btn') && !e.target.closest('.btn-multiselect-tag')) {
    cerrarMenuTarjetaReciente();
  }
});

document.addEventListener('keydown', (e) => {
  const view = document.getElementById('recent-docs-view');
  const enRecientes = view && view.style.display !== 'none';
  if (!enRecientes) return;

  if (e.key === 'Escape') {
    const menu = document.getElementById('recent-card-menu');
    if (menu && menu.style.display !== 'none') {
      cerrarMenuTarjetaReciente();
      return;
    }
    if (seleccionadosRecientes.size > 0) {
      limpiarSeleccionRecientes();
    }
  } else if (e.key === 'Enter' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    if (seleccionadosRecientes.size > 0) {
      e.preventDefault();
      abrirRecientesSeleccionados();
    }
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'q' || e.key === 'Q')) {
    e.preventDefault();
    e.stopPropagation();

    if (pestanas.length === 0 || idxPestanaActiva < 0 || idxPestanaActiva >= pestanas.length) {
      actualizarVisibilidadRecientes();
      return;
    }

    cerrarPestana(null, idxPestanaActiva);
  }
});

async function reabrirUltimaPestanaCerrada() {
  if (!historialPestanasCerradas || historialPestanasCerradas.length === 0) return;

  const doc = historialPestanasCerradas.pop();
  if (!doc) return;

  const existenteIdx = pestanas.findIndex(p => p.nombre === doc.nombre);
  if (existenteIdx !== -1) {
    await cambiarPestana(existenteIdx);
    return;
  }

  const previa = getPestanaActual();
  if (previa && typeof wrapper !== 'undefined' && wrapper) {
    previa.scrollX = wrapper.scrollLeft;
    previa.scrollY = wrapper.scrollTop;
    if (typeof actualizarProgresoReciente === 'function') {
      actualizarProgresoReciente(previa.nombre, previa.paginaActual);
    }
  }

  pestanas.push(doc);
  idxPestanaActiva = pestanas.length - 1;

  if (typeof actualizarVisibilidadRecientes === 'function') {
    actualizarVisibilidadRecientes();
  }
  actualizarBarraPestanas();
  actualizarEstilosModoVista();
  actualizarContenidoGaveta();
  if (typeof renderizarTodasLasPaginas === 'function') {
    await renderizarTodasLasPaginas();
  }

  if (typeof irAPagina === 'function' && doc.paginaActual && doc.paginaActual > 1) {
    irAPagina(doc.paginaActual);
  } else if (typeof wrapper !== 'undefined' && wrapper) {
    wrapper.scrollLeft = doc.scrollX || 0;
    wrapper.scrollTop = doc.scrollY || 0;
  }
  actualizarContadorPaginas();
}

document.addEventListener('keydown', async (e) => {
  const tagActivo = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
  const isEditingText = tagActivo === 'input' || tagActivo === 'textarea' || (document.activeElement && document.activeElement.isContentEditable);
  if (isEditingText) return;

  const esModificador = e.ctrlKey || e.metaKey;
  if (!esModificador) return;

  const esReabrirCtrlZ = !e.shiftKey && !e.altKey && (e.key === 'z' || e.key === 'Z');
  const esReabrirCtrlShiftT = e.shiftKey && !e.altKey && (e.key === 't' || e.key === 'T');

  if (esReabrirCtrlZ || esReabrirCtrlShiftT) {
    if (historialPestanasCerradas && historialPestanasCerradas.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      await reabrirUltimaPestanaCerrada();
    }
  }
}, true);

// ========================================================
// CAPTURA NATIVA DE ARCHIVOS AL HACER DOBLE CLIC EN WINDOWS
// ========================================================
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async (launchParams) => {
    if (!launchParams.files || !launchParams.files.length) return;
    for (const fileHandle of launchParams.files) {
      try {
        const file = await fileHandle.getFile();
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        if (typeof procesarDocumentoPDF === 'function') {
          await procesarDocumentoPDF(bytes, file.name, file.name, null);
        }
      } catch (err) {
        console.error('Error al abrir archivo desde launchQueue:', err);
      }
    }
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Fallo al registrar Service Worker:', err);
    });
  });
}