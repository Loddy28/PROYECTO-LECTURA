async function procesarDocumentoPDF(bytes, nombre, ruta, datosB64, paginaInicial = null) {
  const vistaEntrada = bytes instanceof Uint8Array
    ? bytes
    : new Uint8Array(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength);
  const bytesCopia = new Uint8Array(vistaEntrada.byteLength);
  bytesCopia.set(vistaEntrada);

  const bytesParaWorker = new Uint8Array(bytesCopia.byteLength);
  bytesParaWorker.set(bytesCopia);

  const loadingTask = pdfjsLib.getDocument({
    data: bytesParaWorker,
    cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
    cMapPacked: true
  });
  const doc = await loadingTask.promise;

  let marcadoresExistentes = [];
  try {
    const outline = await doc.getOutline();
    if (outline && outline.length > 0) {
      for (let item of outline) {
        let pageNum = 1;
        if (item.dest) {
          const dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest;
          if (dest) {
            const pageIndex = await doc.getPageIndex(dest[0]);
            pageNum = pageIndex + 1;
          }
        }
        marcadoresExistentes.push({
          id: 'toc_' + Date.now() + Math.random(),
          titulo: item.title,
          pageNum: pageNum
        });
      }
    }
  } catch (err) {}

  let estadoGuardado = { resaltados: [], textos: [], comentarios: [], trazos: [] };
  const claveStorage = `pdf_anotaciones_${nombre}`;
  const cacheLocal = localStorage.getItem(claveStorage);

  if (cacheLocal) {
    try {
      const parsed = JSON.parse(cacheLocal);
      estadoGuardado = {
        resaltados: parsed.resaltados || [],
        textos: parsed.textos || [],
        comentarios: parsed.comentarios || [],
        trazos: parsed.trazos || []
      };
      if (parsed.marcadores && parsed.marcadores.length > 0) {
        marcadoresExistentes = parsed.marcadores;
      }
    } catch (err) {}
  } else if (typeof recuperarDesdeNube === 'function') {
    const respaldo = await recuperarDesdeNube(nombre);
    if (respaldo) {
      estadoGuardado = {
        resaltados: respaldo.resaltados || [],
        textos: respaldo.textos || [],
        comentarios: respaldo.comentarios || [],
        trazos: respaldo.trazos || []
      };
      if (respaldo.marcadores) marcadoresExistentes = respaldo.marcadores;
      localStorage.setItem(claveStorage, JSON.stringify(estadoGuardado));
    }
  }

  const primeraPag = await doc.getPage(1);
  const vpOriginal = primeraPag.getViewport({ scale: 1.0 });

  let zoomInicial = 1.20;
  if (window.innerWidth <= 768) {
    zoomInicial = window.innerWidth / vpOriginal.width;
  }

  let pagArranque = paginaInicial || 1;
  const esMovilOApaisado = window.innerWidth <= 768 || (window.matchMedia && window.matchMedia('(pointer: coarse) and (max-height: 520px)').matches);

  if (typeof registrarDocumentoEnRecientes === 'function') {
    const itemReciente = await registrarDocumentoEnRecientes({
      nombre,
      ruta,
      numPages: doc.numPages,
      primeraPag,
      bytes: bytesCopia,
      datosB64
    });
    // En móviles iniciamos en la página 1 limpia salvo que se haya solicitado explícitamente paginaInicial
    if (!paginaInicial && !esMovilOApaisado && itemReciente && itemReciente.ultimaPagina > 1) {
      pagArranque = itemReciente.ultimaPagina;
    }
  }

  const nuevaPestana = {
    nombre: nombre,
    ruta: ruta,
    datosB64: datosB64,
    bytesPDF: bytesCopia,
    pdfDoc: doc,
    escalaZoom: zoomInicial,
    disposicion: 'single',
    desplazamientoContinuo: true,
    paginaActual: pagArranque,
    appState: estadoGuardado,
    marcadores: marcadoresExistentes,
    modificado: false,
    undoStack: [],
    redoStack: [],
    scrollX: 0,
    scrollY: 0
  };

  const previa = getPestanaActual();
  if (previa && wrapper) {
    previa.scrollX = wrapper.scrollLeft;
    previa.scrollY = wrapper.scrollTop;
    if (typeof actualizarProgresoReciente === 'function') {
      actualizarProgresoReciente(previa.nombre, previa.paginaActual);
    }
  }

  pestanas.push(nuevaPestana);
  idxPestanaActiva = pestanas.length - 1;

  if (typeof actualizarVisibilidadRecientes === 'function') {
    actualizarVisibilidadRecientes();
  }
  actualizarBarraPestanas();
  actualizarEstilosModoVista();
  actualizarContenidoGaveta();

  // Asegurar estado inicial limpio en modo inmersivo móvil: header y toolbar ocultos por defecto
  if (typeof esDispositivoMovilOTouch === 'function' && esDispositivoMovilOTouch()) {
    document.body.classList.remove('mobile-topbar-visible');
    if (typeof cerrarBarraHerramientasMobile === 'function') {
      cerrarBarraHerramientasMobile();
    }
  }

  await renderizarTodasLasPaginas();

  if (esMovilOApaisado && !paginaInicial) {
    if (wrapper) {
      wrapper.scrollLeft = 0;
      wrapper.scrollTop = 0;
    }
    nuevaPestana.paginaActual = 1;
  } else if (pagArranque > 1) {
    irAPagina(pagArranque);
  } else if (wrapper) {
    wrapper.scrollLeft = 0;
    wrapper.scrollTop = 0;
  }
  actualizarContadorPaginas();
}

function inicializarObserver() {
  if (observerPaginas) observerPaginas.disconnect();
  const margenCarga = (window.innerWidth <= 768 || (window.matchMedia && window.matchMedia('(pointer: coarse) and (max-height: 520px)').matches))
    ? '120px 0px 120px 0px'
    : '250px 0px 250px 0px';

  observerPaginas = new IntersectionObserver((entries) => {
    let mayorInterseccion = null;
    let maxRatio = 0;

    entries.forEach(entry => {
      const pageBox = entry.target;
      const pageNum = parseInt(pageBox.getAttribute('data-page-num'), 10);
      if (entry.isIntersecting) {
        renderizarPaginaIndividual(pageNum, pageBox);
        if (entry.intersectionRatio > maxRatio) {
          maxRatio = entry.intersectionRatio;
          mayorInterseccion = pageNum;
        }
      } else {
        destruirContenidoPagina(pageNum, pageBox);
      }
    });

    if (mayorInterseccion) {
      const p = getPestanaActual();
      if (p && p.paginaActual !== mayorInterseccion) {
        p.paginaActual = mayorInterseccion;
        actualizarContadorPaginas();
      }
    }
  }, {
    root: wrapper,
    rootMargin: margenCarga,
    threshold: [0, 0.25, 0.5, 0.75, 1.0]
  });
}

function actualizarScrollDinamicoMovil() {
  const p = getPestanaActual();
  if (!p || !wrapper) return;

  const anchoDisponible = window.innerWidth;
  const primeraPagina = document.querySelector('.page-box');
  const anchoHoja = primeraPagina ? primeraPagina.offsetWidth : 0;

  // Permitir desplazamiento horizontal libre cuando el ancho de la página supera la pantalla o hay zoom activo
  if (anchoHoja > anchoDisponible - 10 || p.escalaZoom > 1.05 || zoomVisualActual > 1.02) {
    wrapper.style.overflowX = 'auto';
    wrapper.style.touchAction = 'pan-x pan-y';
    if (pagesContainer) pagesContainer.style.touchAction = 'pan-x pan-y';
  } else {
    wrapper.style.overflowX = 'auto';
    wrapper.style.touchAction = 'pan-x pan-y';
    if (pagesContainer) pagesContainer.style.touchAction = 'pan-x pan-y';
  }
}

function capturarAnclajeZoom(clientX, clientY) {
  const p = getPestanaActual();
  if (!p || !wrapper) return null;

  const wrapperRect = wrapper.getBoundingClientRect();
  const refX = clientX !== undefined ? clientX : (wrapperRect.left + wrapperRect.width / 2);
  const refY = clientY !== undefined ? clientY : (wrapperRect.top + wrapperRect.height / 2);

  let targetBox = null;
  const elBajoCursor = document.elementFromPoint(refX, refY);
  if (elBajoCursor) {
    targetBox = elBajoCursor.closest('.page-box');
  }

  if (!targetBox) {
    const basePag = p.paginaActual || 1;
    let mejorDist = Infinity;
    for (let d = -3; d <= 3; d++) {
      const candidato = document.getElementById(`page-box-${basePag + d}`);
      if (!candidato) continue;
      const r = candidato.getBoundingClientRect();
      const dist = refY < r.top ? (r.top - refY) : (refY > r.bottom ? (refY - r.bottom) : 0);
      if (dist < mejorDist) {
        mejorDist = dist;
        targetBox = candidato;
      }
    }
  }

  if (!targetBox) {
    targetBox = document.getElementById(`page-box-${p.paginaActual || 1}`);
  }
  if (!targetBox) return null;

  const pageNum = parseInt(targetBox.getAttribute('data-page-num'), 10);
  const boxRect = targetBox.getBoundingClientRect();

  const ratioX = boxRect.width > 0 ? Math.max(0, Math.min(1, (refX - boxRect.left) / boxRect.width)) : 0.5;
  const ratioY = boxRect.height > 0 ? Math.max(0, Math.min(1, (refY - boxRect.top) / boxRect.height)) : 0.5;

  const puntoPantallaX = boxRect.left + (ratioX * boxRect.width);
  const puntoPantallaY = boxRect.top + (ratioY * boxRect.height);

  return {
    pageNum,
    ratioX,
    ratioY,
    vx: puntoPantallaX - wrapperRect.left,
    vy: puntoPantallaY - wrapperRect.top
  };
}

function aplicarAnclajeZoom(anclaje) {
  if (!anclaje || !wrapper) return;
  const newBox = document.getElementById(`page-box-${anclaje.pageNum}`);
  if (!newBox) return;

  const wrapperRect = wrapper.getBoundingClientRect();
  const newBoxRect = newBox.getBoundingClientRect();

  const actualPointX = (newBoxRect.left - wrapperRect.left) + (anclaje.ratioX * newBoxRect.width);
  const actualPointY = (newBoxRect.top - wrapperRect.top) + (anclaje.ratioY * newBoxRect.height);

  wrapper.scrollLeft += (actualPointX - anclaje.vx);
  wrapper.scrollTop += (actualPointY - anclaje.vy);
}

async function renderizarTodasLasPaginas(anclajeZoom = null) {
  const p = getPestanaActual();
  if (!p || !p.pdfDoc) return;

  renderCycleId++;
  const currentCycle = renderCycleId;

  const primeraPagina = await p.pdfDoc.getPage(1);
  if (currentCycle !== renderCycleId) return;

  const viewportBase = primeraPagina.getViewport({ scale: p.escalaZoom });
  const cssWidthBase = Math.round(viewportBase.width);
  const cssHeightBase = Math.round(viewportBase.height);

  pagesContainer.style.transition = 'none';
  pagesContainer.style.transform = 'none';
  zoomVisualActual = 1.0;

  paginasRenderizadas.forEach(task => {
    try { task.cancel(); } catch (e) {}
  });
  paginasRenderizadas.clear();
  pagesContainer.innerHTML = '';
  inicializarObserver();

  const total = p.pdfDoc.numPages;
  const actual = anclajeZoom ? anclajeZoom.pageNum : (p.paginaActual || 1);
  const esDoble = p.disposicion === 'double';
  const esContinuo = p.desplazamientoContinuo !== false;

  let gruposPaginas = [];
  if (esContinuo) {
    if (esDoble) {
      for (let i = 1; i <= total; i += 2) {
        gruposPaginas.push([i, i + 1 <= total ? i + 1 : null].filter(Boolean));
      }
    } else {
      for (let i = 1; i <= total; i++) {
        gruposPaginas.push([i]);
      }
    }
  } else {
    if (esDoble) {
      const parInicio = (actual % 2 === 0) ? actual - 1 : actual;
      gruposPaginas.push([parInicio, parInicio + 1 <= total ? parInicio + 1 : null].filter(Boolean));
    } else {
      gruposPaginas.push([actual]);
    }
  }

  const fragment = document.createDocumentFragment();
  const paginasCercanas = [];

  for (let grupo of gruposPaginas) {
    let rowContainer = esDoble ? document.createElement('div') : fragment;
    if (esDoble) {
      rowContainer.className = 'spread-row';
      fragment.appendChild(rowContainer);
    }

    const esMovil = window.innerWidth <= 768 || (window.matchMedia && window.matchMedia('(pointer: coarse) and (max-height: 520px)').matches);
    const radioCercania = esMovil ? 0 : 1; // En móviles priorizar exclusivamente la página visible inicial

    for (let num of grupo) {
      const pageBox = document.createElement('div');
      pageBox.className = 'page-box page-container';
      pageBox.id = `page-box-${num}`;
      pageBox.setAttribute('data-page-num', num);
      pageBox.style.width = cssWidthBase + 'px';
      pageBox.style.height = cssHeightBase + 'px';
      pageBox.style.minHeight = cssHeightBase + 'px';

      const annotLayer = document.createElement('div');
      annotLayer.className = 'annotation-layer';
      pageBox.appendChild(annotLayer);

      const inkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      inkSvg.setAttribute('class', 'ink-layer');
      pageBox.appendChild(inkSvg);

      pageBox.addEventListener('contextmenu', (e) => {
        // En desktop, el click derecho alterna la barra flotante de herramientas
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && !e.target.isContentEditable) {
          e.preventDefault();
          if (typeof window.alternarDockHerramientas === 'function') {
            window.alternarDockHerramientas(e);
          }
        }
      });

      rowContainer.appendChild(pageBox);
      if (esContinuo) {
        if (Math.abs(num - actual) <= radioCercania) {
          paginasCercanas.push({ num, pageBox });
        }
        if (observerPaginas) {
          observerPaginas.observe(pageBox);
        }
      } else {
        paginasCercanas.push({ num, pageBox });
      }
    }
  }

  pagesContainer.appendChild(fragment);

  if (esContinuo && anclajeZoom) {
    p.paginaActual = anclajeZoom.pageNum;
    aplicarAnclajeZoom(anclajeZoom);
  } else if (!esContinuo) {
    wrapper.scrollTop = 0;
  }

  for (const item of paginasCercanas) {
    renderizarPaginaIndividual(item.num, item.pageBox);
  }

  reconstruirAnotacionesEnDOM();
  actualizarContadorPaginas();
  actualizarScrollDinamicoMovil();

  if (searchBarContainer.style.display === 'flex' && searchInput.value.trim().length > 0) {
    ejecutarBusqueda();
  }
}

async function renderizarPaginaIndividual(num, pageBox) {
  const p = getPestanaActual();
  if (!p || !p.pdfDoc || pageBox.getAttribute('data-cargada') === 'true') return;
  pageBox.setAttribute('data-cargada', 'true');

  try {
    const page = await p.pdfDoc.getPage(num);
    const viewport = page.getViewport({ scale: p.escalaZoom });
    const cssWidth = Math.round(viewport.width);
    const cssHeight = Math.round(viewport.height);
    pageBox.style.width = cssWidth + 'px';
    pageBox.style.height = cssHeight + 'px';
    pageBox.style.minHeight = cssHeight + 'px';

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    canvas.width = Math.round(viewport.width * dpr);
    canvas.height = Math.round(viewport.height * dpr);
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';
    canvas.style.imageRendering = 'crisp-edges';

    pageBox.insertBefore(canvas, pageBox.firstChild);
    const renderTask = page.render({
      canvasContext: ctx,
      viewport: viewport,
      transform: [dpr, 0, 0, dpr, 0, 0]
    });
    paginasRenderizadas.set(num, renderTask);
    await renderTask.promise;

    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer';
    textLayerDiv.style.width = cssWidth + 'px';
    textLayerDiv.style.height = cssHeight + 'px';
    textLayerDiv.style.setProperty('--scale-factor', p.escalaZoom);
    pageBox.insertBefore(textLayerDiv, pageBox.querySelector('.annotation-layer'));

    const textContent = await page.getTextContent();
    await pdfjsLib.renderTextLayer({
      textContentSource: textContent,
      container: textLayerDiv,
      viewport: viewport,
      textDivs: []
    }).promise;
  } catch (err) {
    if (err.name !== 'RenderingCancelledException') {
      console.error(`Error en página ${num}:`, err);
    }
  }
}

function destruirContenidoPagina(pageNum, pageBox) {
  if (pageBox.getAttribute('data-cargada') !== 'true') return;
  const activeTask = paginasRenderizadas.get(pageNum);
  if (activeTask) {
    try { activeTask.cancel(); } catch (e) {}
    paginasRenderizadas.delete(pageNum);
  }
  const canvas = pageBox.querySelector('canvas');
  if (canvas) { canvas.remove(); }
  const textLayer = pageBox.querySelector('.textLayer');
  if (textLayer) textLayer.remove();
  pageBox.removeAttribute('data-cargada');
}

let anclajeZoomWheel = null;

wrapper.addEventListener('wheel', (e) => {
  if (e.ctrlKey) {
    e.preventDefault();
    const p = getPestanaActual();
    if (!p || !p.pdfDoc) return;

    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    const nuevoZoom = p.escalaZoom * factor;
    if (nuevoZoom < 0.4 || nuevoZoom > 4.0) return;

    if (!anclajeZoomWheel) {
      anclajeZoomWheel = capturarAnclajeZoom(e.clientX, e.clientY);
    }

    zoomVisualActual *= factor;
    p.escalaZoom = nuevoZoom;
    if (typeof actualizarIndicadorZoom === 'function') actualizarIndicadorZoom();

    pagesContainer.style.transition = 'none';
    pagesContainer.style.transformOrigin = '0 0';
    pagesContainer.style.transform = `scale(${zoomVisualActual})`;

    if (anclajeZoomWheel) {
      aplicarAnclajeZoom(anclajeZoomWheel);
    }

    if (selectionPopover) selectionPopover.style.display = 'none';
    if (typeof cerrarMenuBloque === 'function') cerrarMenuBloque();
    if (typeof ocultarPopupComentario === 'function') ocultarPopupComentario();

    if (timerFinZoom) clearTimeout(timerFinZoom);
    timerFinZoom = setTimeout(() => {
      const anclajeFinal = anclajeZoomWheel;
      anclajeZoomWheel = null;
      renderizarTodasLasPaginas(anclajeFinal);
    }, 150);
  }
}, { passive: false });

function ajustarZoomManual(delta) {
  const p = getPestanaActual();
  if (!p || !p.pdfDoc) return;
  // Si delta es 0, restablecer al 100% (1.0)
  const nuevoZoom = delta === 0 ? 1.0 : Math.min(Math.max(0.6, p.escalaZoom + delta), 3.2);
  if (Math.abs(nuevoZoom - p.escalaZoom) < 0.01) return;
  const anclaje = capturarAnclajeZoom();
  p.escalaZoom = nuevoZoom;
  if (typeof actualizarIndicadorZoom === 'function') actualizarIndicadorZoom();
  renderizarTodasLasPaginas(anclaje);
}

let touchZoomActivo = false;
let distDedosInicio = 0;
let escalaBaseZoom = 1.0;
let zoomProyectadoTouch = 1.0;
let anclajeTouchZoom = null;
let timerDebounceTouch = null;

function distanciaEntrePuntos(t1, t2) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.hypot(dx, dy);
}

window.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    const p = getPestanaActual();
    if (!p || !p.pdfDoc) return;

    touchZoomActivo = true;
    distDedosInicio = distanciaEntrePuntos(e.touches[0], e.touches[1]);
    escalaBaseZoom = p.escalaZoom;
    zoomProyectadoTouch = p.escalaZoom;

    const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    anclajeTouchZoom = capturarAnclajeZoom(cx, cy);

    pagesContainer.style.transition = 'none';
  }
}, { passive: false });

window.addEventListener('touchmove', (e) => {
  if (touchZoomActivo && e.touches.length === 2) {
    const p = getPestanaActual();
    if (!p || !p.pdfDoc) return;

    e.preventDefault();

    const distActual = distanciaEntrePuntos(e.touches[0], e.touches[1]);
    if (distDedosInicio <= 0) return;

    const multiplicador = distActual / distDedosInicio;
    zoomProyectadoTouch = Math.min(Math.max(0.45, escalaBaseZoom * multiplicador), 3.8);

    const factorVisual = zoomProyectadoTouch / p.escalaZoom;
    pagesContainer.style.transformOrigin = '0 0';
    pagesContainer.style.transform = `scale(${factorVisual})`;

    if (anclajeTouchZoom) {
      aplicarAnclajeZoom(anclajeTouchZoom);
    }
  }
}, { passive: false });

window.addEventListener('touchend', (e) => {
  if (touchZoomActivo && e.touches.length < 2) {
    touchZoomActivo = false;
    distDedosInicio = 0;

    const p = getPestanaActual();
    if (!p || !p.pdfDoc) return;

    p.escalaZoom = zoomProyectadoTouch;
    const anclajeFinal = anclajeTouchZoom;
    anclajeTouchZoom = null;
    if (typeof actualizarIndicadorZoom === 'function') actualizarIndicadorZoom();

    if (timerDebounceTouch) clearTimeout(timerDebounceTouch);
    timerDebounceTouch = setTimeout(() => {
      renderizarTodasLasPaginas(anclajeFinal);
      actualizarScrollDinamicoMovil();
    }, 120);
  }
});