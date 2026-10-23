const rightDrawer = document.getElementById('right-drawer');
const drawerResizer = document.getElementById('drawer-resizer');

function inicializarPaletaColores() {
  swatchesContainer.innerHTML = '';
  COLORES_ACROBAT.forEach(hex => {
    const swatch = document.createElement('div');
    swatch.className = `color-swatch-item ${hex === colorResaltadoActivo ? 'active' : ''}`;
    swatch.style.backgroundColor = hex;
    swatch.onclick = (e) => {
      e.stopPropagation();
      seleccionarColor(hex);
    };
    swatchesContainer.appendChild(swatch);
  });
}
inicializarPaletaColores();

function togglePanelColor(e) {
  e.stopPropagation();
  const visible = colorPanelPopover.style.display === 'flex';
  if (!visible) {
    const btnRect = floatColorPreview.getBoundingClientRect();
    const toolbar = document.getElementById('floating-toolbar') || document.getElementById('header-toolbar');
    const esVerticalActiva = toolbar && (toolbar.classList.contains('toolbar-vertical-activa') || toolbar.classList.contains('mobile-toolbar-open'));
    if (esDispositivoMovilOTouch() || esVerticalActiva) {
      // En modo móvil o dock vertical, posicionar a la izquierda del dock
      colorPanelPopover.style.left = 'auto';
      colorPanelPopover.style.right = '64px';
      colorPanelPopover.style.bottom = 'auto';
      colorPanelPopover.style.top = `${Math.max(10, Math.min(window.innerHeight - 300, btnRect.top - 60))}px`;
    } else {
      // En dock flotante escritorio: centrado o alineado justo arriba de la cápsula
      const popoverWidth = 230;
      const leftPos = Math.max(12, Math.min(window.innerWidth - popoverWidth - 12, btnRect.left + (btnRect.width / 2) - (popoverWidth / 2)));
      colorPanelPopover.style.left = `${leftPos}px`;
      colorPanelPopover.style.right = 'auto';
      colorPanelPopover.style.top = 'auto';
      colorPanelPopover.style.bottom = `${Math.max(12, window.innerHeight - btnRect.top + 12)}px`;
    }
    colorPanelPopover.style.display = 'flex';
  } else {
    colorPanelPopover.style.display = 'none';
  }
}

function seleccionarColor(hex) {
  colorResaltadoActivo = hex;
  floatColorPreview.style.backgroundColor = hex;
  document.querySelectorAll('.color-swatch-item').forEach(s => {
    s.classList.toggle('active', s.style.backgroundColor === hex || s.getAttribute('data-c') === hex);
  });
  hlDragBox.style.backgroundColor = hex;
  hlDragBox.style.opacity = opacidadResaltadoActiva;
}

function cambiarOpacidad(val) {
  opacidadResaltadoActiva = parseFloat(val) / 100;
  opacityValLbl.textContent = `${val}%`;
  hlDragBox.style.opacity = opacidadResaltadoActiva;
}

function toggleGaveta(tipo) {
  if (gavetaActiva === tipo) {
    cerrarGaveta();
    return;
  }
  gavetaActiva = tipo;
  if (rightDrawer) rightDrawer.style.display = 'flex';
  btnDockBookmarks.classList.toggle('active', tipo === 'marcadores');
  btnDockAnnotations.classList.toggle('active', tipo === 'anotaciones');
  actualizarContenidoGaveta();
}

function actualizarContenidoGaveta() {
  const p = getPestanaActual();
  if (!drawerItemsList) return;
  drawerItemsList.innerHTML = '';

  if (!p) {
    drawerItemsList.innerHTML = '<div style="color: #71717a; font-size: 11px; padding: 10px;">No hay documento abierto.</div>';
    if (drawerActionBtn) drawerActionBtn.style.display = 'none';
    return;
  }

  if (gavetaActiva === 'marcadores') {
    if (drawerHeaderTitle) drawerHeaderTitle.innerHTML = '🔖 Marcadores / Índice';
    if (drawerActionBtn) {
      drawerActionBtn.style.display = 'flex';
      drawerActionBtn.textContent = '+ Agregar página actual al índice';
    }

    if (!p.marcadores || p.marcadores.length === 0) {
      drawerItemsList.innerHTML = '<div style="color: #71717a; font-size: 11px; padding: 10px;">No creaste marcadores aún. Agregá uno para crear tu índice rápido.</div>';
      return;
    }

    p.marcadores.forEach((m, idx) => {
      const item = document.createElement('div');
      item.className = 'drawer-item';
      item.innerHTML = `
        <span class="drawer-item-title" title="${m.titulo}">📌 ${m.titulo}</span>
        <div class="drawer-item-actions">
          <span class="drawer-item-badge">Pág ${m.pageNum}</span>
          <span class="drawer-item-del" title="Eliminar marcador">✕</span>
        </div>
      `;
      item.onclick = () => irAPagina(m.pageNum);
      const btnDel = item.querySelector('.drawer-item-del');
      if (btnDel) {
        btnDel.onclick = (e) => {
          e.stopPropagation();
          p.marcadores.splice(idx, 1);
          marcarModificado();
          actualizarContenidoGaveta();
        };
      }
      drawerItemsList.appendChild(item);
    });

  } else if (gavetaActiva === 'anotaciones') {
    if (drawerHeaderTitle) drawerHeaderTitle.innerHTML = '📝 Resumen de Anotaciones';
    if (drawerActionBtn) drawerActionBtn.style.display = 'none';

    const notas = [];
    (p.appState.comentarios || []).forEach(c => notas.push({ tipo: 'Comentario', texto: c.texto, pageNum: c.pageNum, id: c.id, icono: '💬' }));
    (p.appState.textos || []).forEach(t => {
      if (t.texto && t.texto.trim()) {
        notas.push({ tipo: 'Texto', texto: t.texto, pageNum: t.pageNum, id: t.id, icono: '✍️' });
      }
    });

    if (notas.length === 0) {
      drawerItemsList.innerHTML = '<div style="color: #71717a; font-size: 11px; padding: 10px;">No tenés notas ni comentarios hechos en este documento.</div>';
      return;
    }

    notas.sort((a, b) => a.pageNum - b.pageNum);

    notas.forEach(n => {
      const item = document.createElement('div');
      item.className = 'drawer-item';
      item.innerHTML = `
        <span class="drawer-item-title" title="${n.texto}">${n.icono} ${n.texto}</span>
        <span class="drawer-item-badge">Pág ${n.pageNum}</span>
      `;
      item.onclick = () => {
        irAPagina(n.pageNum);
        setTimeout(() => {
          const el = document.getElementById(n.id) || document.getElementById(`page-box-${n.pageNum}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      };
      drawerItemsList.appendChild(item);
    });
  }
}

function cerrarGaveta() {
  gavetaActiva = null;
  if (rightDrawer) rightDrawer.style.display = 'none';
  btnDockBookmarks.classList.remove('active');
  btnDockAnnotations.classList.remove('active');
}

function toggleMenuVistas(e) {
  e.stopPropagation();
  const visible = viewModesPopover.style.display === 'flex';
  viewModesPopover.style.display = visible ? 'none' : 'flex';
  btnViewModes.classList.toggle('active', !visible);
}

function setDisposicion(disp) {
  const p = getPestanaActual();
  if (!p) return;
  p.disposicion = disp;
  actualizarEstilosModoVista();
  renderizarTodasLasPaginas();
}

function toggleDesplazamientoContinuo() {
  const p = getPestanaActual();
  if (!p) return;
  p.desplazamientoContinuo = !p.desplazamientoContinuo;
  actualizarEstilosModoVista();
  renderizarTodasLasPaginas();
}

function actualizarEstilosModoVista() {
  const p = getPestanaActual();
  const disp = p ? (p.disposicion || 'single') : 'single';
  const continuo = p ? (p.desplazamientoContinuo !== false) : true;
  document.getElementById('opt-single').classList.toggle('selected', disp === 'single');
  document.getElementById('opt-double').classList.toggle('selected', disp === 'double');
  document.getElementById('opt-scroll').classList.toggle('selected', continuo);
  pageNavBar.style.display = continuo ? 'none' : 'flex';
}

function abrirSaltoRapido() {
  const p = getPestanaActual();
  if (!p || !p.pdfDoc) return;
  gotoTotalLabel.textContent = `/ ${p.pdfDoc.numPages}`;
  gotoInput.max = p.pdfDoc.numPages;
  gotoInput.value = p.paginaActual || 1;
  gotoContainer.style.display = 'flex';
  gotoInput.focus();
  gotoInput.select();
}

function cerrarSaltoRapido() {
  gotoContainer.style.display = 'none';
}

function ejecutarSaltoRapido() {
  const p = getPestanaActual();
  if (!p || !p.pdfDoc) return;
  const num = parseInt(gotoInput.value, 10);
  if (!isNaN(num) && num >= 1 && num <= p.pdfDoc.numPages) {
    irAPagina(num);
    cerrarSaltoRapido();
  }
}

gotoInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); ejecutarSaltoRapido(); }
  if (e.key === 'Escape') { e.preventDefault(); cerrarSaltoRapido(); }
});

function irAPagina(num) {
  const p = getPestanaActual();
  if (!p || !p.pdfDoc) return;
  const pagAnterior = p.paginaActual || 1;
  p.paginaActual = num;
  if (p.desplazamientoContinuo) {
    const box = document.getElementById(`page-box-${num}`);
    if (box) {
      const comportamiento = Math.abs(num - pagAnterior) > 4 ? 'auto' : 'smooth';
      box.scrollIntoView({ behavior: comportamiento, block: 'start' });
      renderizarPaginaIndividual(num, box);
    }
    vCurrPage.textContent = num.toString().padStart(2, '0');
    navBarLabel.textContent = p.disposicion === 'double'
      ? `${num}-${Math.min(num + 1, p.pdfDoc.numPages)} / ${p.pdfDoc.numPages}`
      : `${num} / ${p.pdfDoc.numPages}`;
  } else {
    renderizarTodasLasPaginas();
    actualizarContadorPaginas();
  }
}

function navegarPaginaRelativa(delta) {
  const p = getPestanaActual();
  if (!p || !p.pdfDoc) return;
  const paso = (p.disposicion === 'double') ? 2 : 1;
  irAPagina(Math.max(1, Math.min(p.pdfDoc.numPages, (p.paginaActual || 1) + (delta * paso))));
}

function actualizarContadorPaginas() {
  const p = getPestanaActual();
  const mCurrPage = document.getElementById('m-curr-page');
  const mTotalPages = document.getElementById('m-total-pages');

  if (!p || !p.pdfDoc) {
    vCurrPage.textContent = '-';
    vTotalPages.textContent = '-';
    if (mCurrPage) mCurrPage.textContent = '-';
    if (mTotalPages) mTotalPages.textContent = '-';
    navBarLabel.textContent = '- / -';
    return;
  }
  const totalPaginas = p.pdfDoc.numPages;
  vTotalPages.textContent = totalPaginas.toString().padStart(2, '0');
  if (mTotalPages) mTotalPages.textContent = totalPaginas.toString();

  if (p.desplazamientoContinuo && zoomVisualActual === 1.0 && !touchZoomActivo) {
    const wrapperRect = wrapper.getBoundingClientRect();
    const centroY = wrapperRect.top + (wrapperRect.height / 2);

    let low = 1;
    let high = totalPaginas;
    let mejorPag = p.paginaActual || 1;
    let menorDist = Infinity;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const box = document.getElementById(`page-box-${mid}`);
      if (!box) break;
      const r = box.getBoundingClientRect();

      if (centroY >= r.top && centroY <= r.bottom) {
        mejorPag = mid;
        break;
      }

      const dist = centroY < r.top ? (r.top - centroY) : (centroY - r.bottom);
      if (dist < menorDist) {
        menorDist = dist;
        mejorPag = mid;
      }

      if (centroY < r.top) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    if (p.disposicion === 'double' && mejorPag > 1 && mejorPag % 2 === 0) {
      mejorPag--;
    }
    p.paginaActual = mejorPag;
  }

  vCurrPage.textContent = (p.paginaActual || 1).toString().padStart(2, '0');
  if (mCurrPage) mCurrPage.textContent = (p.paginaActual || 1).toString();
  navBarLabel.textContent = p.disposicion === 'double'
    ? `${p.paginaActual}-${Math.min(p.paginaActual + 1, totalPaginas)} / ${totalPaginas}`
    : `${p.paginaActual} / ${totalPaginas}`;
  actualizarIndicadorZoom();
}

function actualizarIndicadorZoom() {
  const lbl = document.getElementById('dock-zoom-val');
  if (!lbl) return;
  const p = getPestanaActual();
  if (!p) {
    lbl.textContent = '100%';
    return;
  }
  const pct = Math.round((p.escalaZoom || 1.0) * (zoomVisualActual || 1.0) * 100);
  lbl.textContent = `${pct}%`;
}

wrapper.addEventListener('scroll', () => {
  const p = getPestanaActual();
  if (p && p.desplazamientoContinuo && zoomVisualActual === 1.0 && !touchZoomActivo) {
    actualizarContadorPaginas();
  }
});

function toggleModoNoche() {
  modoNocheActivo = !modoNocheActivo;
  document.body.classList.toggle('night-mode', modoNocheActivo);
  btnNightToggle.classList.toggle('active', modoNocheActivo);
  btnNightToggle.innerHTML = modoNocheActivo ? '☀️' : '🌙';
}

// ========================================================
// SISTEMA DE BÚSQUEDA PROFESIONAL ESTILO ACROBAT
// ========================================================
let busquedaMatchesGlobales = []; // Array de { pageNum, matchIndexInPage }
let indiceCoincidenciaActual = -1;
let busquedaQueryActual = '';
let abortControllerBusqueda = null;

function abrirBarraBusqueda() {
  const p = getPestanaActual();
  if (!p) return;
  if (searchBarContainer) searchBarContainer.style.display = 'flex';
  if (searchInput) {
    searchInput.focus();
    searchInput.select();
    if (searchInput.value.trim().length >= 2) ejecutarBusqueda();
  }
}

function cerrarBarraBusqueda() {
  if (abortControllerBusqueda) abortControllerBusqueda.abort();
  if (searchBarContainer) searchBarContainer.style.display = 'none';
  limpiarTodosLosResaltadosBusqueda();
  busquedaMatchesGlobales = [];
  indiceCoincidenciaActual = -1;
  busquedaQueryActual = '';
  if (searchCounter) searchCounter.textContent = '0/0';
}

function limpiarTodosLosResaltadosBusqueda() {
  document.querySelectorAll('.search-highlight').forEach(el => {
    const parent = el.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(el.textContent), el);
      parent.normalize();
    }
  });
}

async function ejecutarBusqueda() {
  const p = getPestanaActual();
  if (!p || !p.pdfDoc) return;

  const query = searchInput.value.trim().toLowerCase();
  
  // Limpiar si la consulta es muy corta o vacía
  if (!query || query.length < 2) {
    limpiarTodosLosResaltadosBusqueda();
    busquedaMatchesGlobales = [];
    indiceCoincidenciaActual = -1;
    busquedaQueryActual = '';
    if (searchCounter) searchCounter.textContent = '0/0';
    return;
  }

  // Cancelar búsqueda anterior si seguía corriendo
  if (abortControllerBusqueda) abortControllerBusqueda.abort();
  abortControllerBusqueda = new AbortController();
  const currentSignal = abortControllerBusqueda.signal;

  busquedaQueryActual = query;
  limpiarTodosLosResaltadosBusqueda();
  busquedaMatchesGlobales = [];
  indiceCoincidenciaActual = -1;
  if (searchCounter) searchCounter.textContent = 'Buscando...';

  const totalPaginas = p.pdfDoc.numPages;

  // Escaneo asíncrono página a página sin congelar la GPU ni la UI
  for (let i = 1; i <= totalPaginas; i++) {
    if (currentSignal.aborted) return;

    try {
      const page = await p.pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      
      // Armamos el texto concatenado para evitar contar caracteres erróneos
      let textoPagina = '';
      for (let item of textContent.items) {
        textoPagina += item.str + ' ';
      }
      textoPagina = textoPagina.toLowerCase();

      let pos = 0;
      let countEnPagina = 0;
      while ((pos = textoPagina.indexOf(query, pos)) !== -1) {
        busquedaMatchesGlobales.push({ pageNum: i, subIndex: countEnPagina });
        countEnPagina++;
        pos += query.length; // Avanzar el largo exacto para evitar bucles infinitos
      }

      // Si encuentra coincidencias tempranas y es la primera, saltar de inmediato como Acrobat
      if (busquedaMatchesGlobales.length > 0 && indiceCoincidenciaActual === -1) {
        indiceCoincidenciaActual = 0;
        actualizarCoincidenciaActiva(false);
      }
    } catch (e) {
      // Ignorar páginas que fallen en carga puntual
    }
  }

  if (currentSignal.aborted) return;

  if (busquedaMatchesGlobales.length > 0) {
    if (indiceCoincidenciaActual === -1) indiceCoincidenciaActual = 0;
    actualizarCoincidenciaActiva(true);
  } else {
    if (searchCounter) searchCounter.textContent = '0/0';
  }
}

async function actualizarCoincidenciaActiva(centrar = true) {
  if (busquedaMatchesGlobales.length === 0 || indiceCoincidenciaActual < 0) {
    if (searchCounter) searchCounter.textContent = '0/0';
    return;
  }

  if (searchCounter) {
    searchCounter.textContent = `${indiceCoincidenciaActual + 1}/${busquedaMatchesGlobales.length}`;
  }

  const match = busquedaMatchesGlobales[indiceCoincidenciaActual];
  
  // 1. Navegar a la página correspondiente
  irAPagina(match.pageNum);

  // 2. Esperar a que el observer monte el textLayer y resaltar
  setTimeout(() => {
    aplicarResaltadoVisualAcrobat(match.pageNum, busquedaQueryActual, match.subIndex, centrar);
  }, 120);
}

function aplicarResaltadoVisualAcrobat(pageNum, query, matchSubIndex, centrar) {
  limpiarTodosLosResaltadosBusqueda();
  const pageBox = document.getElementById(`page-box-${pageNum}`);
  if (!pageBox) return;

  const textLayer = pageBox.querySelector('.textLayer');
  if (!textLayer) return;

  let encontradosEnPagina = 0;
  let elementoCoincidenteActivo = null;

  // Recorrer los spans de texto de PDF.js
  const spans = textLayer.querySelectorAll('span');
  for (let span of spans) {
    const textoOriginal = span.textContent;
    const textoMin = textoOriginal.toLowerCase();
    let idx = textoMin.indexOf(query);

    if (idx !== -1) {
      const fragmento = document.createDocumentFragment();
      let start = 0;

      while (idx !== -1) {
        fragmento.appendChild(document.createTextNode(textoOriginal.slice(start, idx)));

        const mark = document.createElement('span');
        mark.className = 'search-highlight';
        mark.textContent = textoOriginal.slice(idx, idx + query.length);

        if (encontradosEnPagina === matchSubIndex) {
          mark.classList.add('active'); // Coincidencia activa estilo Acrobat (Azul/Naranja vibrante)
          elementoCoincidenteActivo = mark;
        }

        fragmento.appendChild(mark);
        encontradosEnPagina++;
        start = idx + query.length;
        idx = textoMin.indexOf(query, start);
      }

      fragmento.appendChild(document.createTextNode(textoOriginal.slice(start)));
      span.innerHTML = '';
      span.appendChild(fragmento);
    }
  }

  if (centrar && elementoCoincidenteActivo) {
    elementoCoincidenteActivo.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function navegarBusqueda(direccion) {
  if (busquedaMatchesGlobales.length === 0) return;
  indiceCoincidenciaActual = (indiceCoincidenciaActual + direccion + busquedaMatchesGlobales.length) % busquedaMatchesGlobales.length;
  actualizarCoincidenciaActiva(true);
}

// Debounce para evitar ejecutar 100 búsquedas al escribir rápido
let searchDebounceTimer = null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    ejecutarBusqueda();
  }, 250);
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    navegarBusqueda(e.shiftKey ? -1 : 1);
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    cerrarBarraBusqueda();
  }
});

document.addEventListener('paste', (e) => {
  const target = e.target;
  const isEditable = target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'INPUT';
  if (!isEditable) return;
  e.preventDefault();
  let texto = (e.clipboardData || window.clipboardData).getData('text/plain');
  texto = texto
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF\u202A-\u202E]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  if (target.isContentEditable) {
    document.execCommand('insertText', false, texto);
  } else {
    const start = target.selectionStart;
    const end = target.selectionEnd;
    target.value = target.value.slice(0, start) + texto + target.value.slice(end);
    target.selectionStart = target.selectionEnd = start + texto.length;
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }
});

// Atajos de teclado
window.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && (e.altKey || e.metaKey)) return;
  if (e.key === 'Alt' || e.key === 'Control' || e.key === 'Shift' || e.key === 'Meta') return;
  const tagActivo = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
  const isEditingText = tagActivo === 'input' || tagActivo === 'textarea' || (document.activeElement && document.activeElement.isContentEditable);

  if (!isEditingText && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key === 'e' || e.key === 'E') { e.preventDefault(); setHerramientaCursor('eraser'); return; }
    if (e.key === 's' || e.key === 'S') { e.preventDefault(); setHerramientaCursor('pen'); return; }
    if (e.key === 'v' || e.key === 'V') { e.preventDefault(); setHerramientaCursor('select'); return; }
    if (e.key === 'h' || e.key === 'H') { e.preventDefault(); setHerramientaCursor('hand'); return; }
    if (e.key === 't' || e.key === 'T') { e.preventDefault(); setHerramientaCursor('add-text'); return; }
    if (e.key === 'c' || e.key === 'C') { e.preventDefault(); setHerramientaCursor('add-comment'); return; }
  }

  if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
    const num = parseInt(e.key, 10);
    if (!isNaN(num) && num >= 1 && num <= 9) {
      const targetIdx = num - 1;
      if (typeof cambiarPestana === 'function' && targetIdx < pestanas.length) {
        e.preventDefault();
        cambiarPestana(targetIdx);
        return;
      }
    }
  }

  if (e.key === 'F5' || (e.ctrlKey && (e.key === 'r' || e.key === 'R'))) { e.preventDefault(); location.reload(); return; }
  if (e.ctrlKey && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); abrirPDF(); return; }
  if (e.ctrlKey && (e.key === 'g' || e.key === 'G' || e.key === 's' || e.key === 'S')) { e.preventDefault(); guardarPDF(); return; }
  if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); deshacer(); return; }
  if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); rehacer(); return; }
  if (e.ctrlKey && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); abrirBarraBusqueda(); return; }
  if (e.ctrlKey && (e.key === 'j' || e.key === 'J')) { e.preventDefault(); abrirSaltoRapido(); return; }
  if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); toggleModoNoche(); return; }
  if (e.ctrlKey && (e.key === '+' || e.key === '=')) { e.preventDefault(); ajustarZoomManual(0.15); return; }
  if (e.ctrlKey && (e.key === '-' || e.key === '_')) { e.preventDefault(); ajustarZoomManual(-0.15); return; }
  if (e.ctrlKey && (e.key === 'w' || e.key === 'W')) { e.preventDefault(); cerrarPestana(null, idxPestanaActiva); return; }
});

// Cierre al hacer clic fuera
window.addEventListener('click', (e) => {
  if (viewModesPopover && !viewModesPopover.contains(e.target) && e.target !== btnViewModes) {
    viewModesPopover.style.display = 'none';
    if (btnViewModes) btnViewModes.classList.remove('active');
  }
  if (colorPanelPopover && !colorPanelPopover.contains(e.target) && !e.target.closest('#float-color-preview')) {
    colorPanelPopover.style.display = 'none';
  }
  if (hlMenuPopover && !hlMenuPopover.contains(e.target) && !e.target.closest('.highlight-rect') && !e.target.closest('.ink-stroke')) {
    if (typeof cerrarMenuBloque === 'function') {
      cerrarMenuBloque();
    } else {
      hlMenuPopover.style.display = 'none';
    }
  }
  if (commentHoverPopup && !commentHoverPopup.contains(e.target) && !e.target.closest('.highlight-rect') && !e.target.closest('.ink-stroke') && !e.target.closest('.pin-anotacion')) {
    if (!isEditingPopup) ocultarPopupComentario();
  }
  const pop = document.getElementById('more-menu-popover');
  const btn = document.getElementById('btn-more-options');
  if (pop && pop.style.display === 'flex' && !pop.contains(e.target) && e.target !== btn) {
    cerrarMenuTresPuntos();
  }

  // Asegurar que #floating-toolbar no se cierre accidentalmente si el clic proviene de #btn-fab-tools o de sus hijos
  if (e.target.closest('#btn-fab-tools') || e.target.closest('#floating-toolbar') || e.target.closest('#header-toolbar')) {
    return;
  }
});

// Modal de pestañas móvil
function toggleModalPestanasMovil() {
  const modal = document.getElementById('tabs-mobile-modal');
  const lista = document.getElementById('tabs-mobile-list');
  const badge = document.getElementById('tabs-counter-badge');
  if (!modal || !lista) return;

  if (modal.style.display === 'flex') {
    cerrarModalPestanasMovil();
    return;
  }

  lista.innerHTML = '';
  pestanas.forEach((p, idx) => {
    const item = document.createElement('div');
    item.className = `tab-modal-item ${idx === idxPestanaActiva ? 'active' : ''}`;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'tab-modal-item-title';
    titleSpan.textContent = `${idx + 1}. ${p.nombre}`;

    const closeBtn = document.createElement('span');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = '✕';
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      cerrarPestana(e, idx);
      toggleModalPestanasMovil();
    };

    item.appendChild(titleSpan);
    item.appendChild(closeBtn);

    item.onclick = () => {
      cambiarPestana(idx);
      modal.style.display = 'none';
    };

    lista.appendChild(item);
  });

  if (badge) badge.textContent = pestanas.length || 1;
  modal.style.display = 'flex';
}

function cerrarModalPestanasMovil(e) {
  if (e && e.target && e.target.id !== 'tabs-mobile-modal' && !e.target.classList.contains('tabs-modal-close')) {
    return;
  }
  const modal = document.getElementById('tabs-mobile-modal');
  if (modal) modal.style.display = 'none';
}

// Menú de selección táctil
document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
    if (selectionPopover && !selectionPopover.contains(document.activeElement)) {
      selectionPopover.style.display = 'none';
    }
    return;
  }

  const range = sel.getRangeAt(0);
  currentSelectionRange = range;
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  if (selectionPopover) {
    const mainRect = document.getElementById('main-content').getBoundingClientRect();
    const topPos = Math.max(10, rect.top - mainRect.top - 45);
    const leftPos = Math.max(10, Math.min(window.innerWidth - 220, rect.left - mainRect.left + (rect.width / 2) - 100));

    selectionPopover.style.top = topPos + 'px';
    selectionPopover.style.left = leftPos + 'px';
    selectionPopover.style.display = 'flex';
  }
});

function copiarTextoSeleccionado() {
  const sel = window.getSelection();
  if (!sel) return;
  navigator.clipboard.writeText(sel.toString());
  if (selectionPopover) selectionPopover.style.display = 'none';
}

// Menú 3 puntos (Opciones de archivo: Abrir, Guardar, Buscar en texto)
function toggleMenuTresPuntos(e) {
  if (e) {
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
    if (typeof e.preventDefault === 'function') e.preventDefault();
  }
  const pop = document.getElementById('more-menu-popover');
  if (!pop) return;
  const activo = pop.style.display === 'flex';
  pop.style.display = activo ? 'none' : 'flex';
}

function cerrarMenuTresPuntos() {
  const pop = document.getElementById('more-menu-popover');
  if (pop) pop.style.display = 'none';
}

// ========================================================
// REDIMENSIONADO POR ARRASTRE DEL PANEL DERECHO
// ========================================================
let isResizingDrawer = false;

if (drawerResizer && rightDrawer) {
  drawerResizer.addEventListener('mousedown', (e) => {
    isResizingDrawer = true;
    document.body.classList.add('is-resizing-drawer');
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isResizingDrawer) return;
    // Ancho calculado desde el borde derecho de la ventana
    const nuevoAncho = window.innerWidth - e.clientX;
    if (nuevoAncho >= 220 && nuevoAncho <= 650) {
      rightDrawer.style.width = nuevoAncho + 'px';
    }
  });

  window.addEventListener('mouseup', () => {
    if (isResizingDrawer) {
      isResizingDrawer = false;
      document.body.classList.remove('is-resizing-drawer');
    }
  });
}

// ========================================================
// MODO INMERSIVO TIPO XODO MOBILE (TOGGLE BARRA CON DOBLE TAP)
// ========================================================
function esDispositivoMovilOTouch() {
  return window.innerWidth <= 900 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}

function alternarBarraSuperiorMovil(forzarEstado = null) {
  const estaVisible = document.body.classList.contains('mobile-topbar-visible');
  const nuevoEstado = forzarEstado !== null ? forzarEstado : !estaVisible;
  
  document.body.classList.toggle('mobile-topbar-visible', nuevoEstado);
  
  // En modo móvil, solicitar pantalla completa nativa automáticamente para ocultar barras del sistema
  if (nuevoEstado === false && esDispositivoMovilOTouch()) {
    solicitarPantallaCompleta();
  }
  
  // El doble tap NUNCA debe modificar la visibilidad de #header-toolbar.
  // Solo cerramos menús emergentes del encabezado si la barra superior se oculta.
  if (!nuevoEstado) {
    cerrarMenuTresPuntos();
    if (typeof cerrarGaveta === 'function') cerrarGaveta();
    if (typeof cerrarSaltoRapido === 'function') cerrarSaltoRapido();
    if (viewModesPopover) viewModesPopover.style.display = 'none';
  }
}

// ========================================================
// PANTALLA COMPLETA INMERSIVA (OCULTAR BARRAS DEL SISTEMA)
// ========================================================
function solicitarPantallaCompleta() {
  try {
    const docEl = document.documentElement;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (docEl.requestFullscreen) {
        docEl.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
      } else if (docEl.webkitRequestFullscreen) {
        docEl.webkitRequestFullscreen();
      }
    }
  } catch (err) {}
}

function salirPantallaCompleta() {
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  } catch (err) {}
}

function togglePantallaCompleta() {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    salirPantallaCompleta();
  } else {
    solicitarPantallaCompleta();
  }
  actualizarTextoBotonFullscreen();
}

function actualizarTextoBotonFullscreen() {
  const lbl = document.getElementById('txt-menu-fullscreen');
  if (!lbl) return;
  const esFull = !!(document.fullscreenElement || document.webkitFullscreenElement);
  lbl.textContent = esFull ? 'Salir de pantalla completa' : 'Pantalla completa';
}

document.addEventListener('fullscreenchange', actualizarTextoBotonFullscreen);
document.addEventListener('webkitfullscreenchange', actualizarTextoBotonFullscreen);

// Implementación global de alternancia para el dock de herramientas
window.alternarDockHerramientas = function(e) {
  if (e) {
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
  }
  const toolbar = document.getElementById('floating-toolbar');
  if (!toolbar) return;
  
  const estaVisible = !toolbar.classList.contains('hidden') && 
                      (toolbar.classList.contains('toolbar-vertical-activa') || 
                       window.getComputedStyle(toolbar).display === 'flex' ||
                       toolbar.style.display === 'flex');
                  
  if (estaVisible) {
    toolbar.classList.add('hidden');
    toolbar.classList.remove('toolbar-vertical-activa');
    toolbar.classList.remove('mobile-toolbar-open');
    toolbar.style.setProperty('display', 'none', 'important');
    if (colorPanelPopover) colorPanelPopover.style.display = 'none';
  } else {
    toolbar.classList.remove('hidden');
    if (typeof esDispositivoMovilOTouch === 'function' && esDispositivoMovilOTouch()) {
      toolbar.classList.add('toolbar-vertical-activa');
      toolbar.classList.add('mobile-toolbar-open');
    }
    toolbar.style.setProperty('display', 'flex', 'important');
  }
};

const toggleBarraHerramientasVertical = window.alternarDockHerramientas;
const toggleBarraHerramientasMobile = window.alternarDockHerramientas;

function cerrarBarraHerramientasVertical() {
  const toolbar = document.getElementById('floating-toolbar');
  if (toolbar) {
    toolbar.classList.remove('toolbar-vertical-activa');
    toolbar.classList.remove('mobile-toolbar-open');
    toolbar.style.setProperty('display', 'none', 'important');
  }
  if (colorPanelPopover) colorPanelPopover.style.display = 'none';
}

const cerrarBarraHerramientasMobile = cerrarBarraHerramientasVertical;

// Proteger la barra superior de clics internos para evitar cierre accidental
const topHeaderEl = document.querySelector('header');
if (topHeaderEl) {
  topHeaderEl.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  topHeaderEl.addEventListener('touchend', (e) => {
    e.stopPropagation();
  }, { passive: true });
}

// Configurar botón móvil flotante exclusivo para herramientas (#btn-fab-tools)
const fabTools = document.getElementById('btn-fab-tools');
if (fabTools) {
  fabTools.onclick = (e) => {
    window.alternarDockHerramientas(e);
  };
}

// Menú contextual con clic derecho para alternar barra de herramientas en escritorio
window.addEventListener('contextmenu', (e) => {
  const p = typeof getPestanaActual === 'function' ? getPestanaActual() : null;
  // Solo activar si hay un documento abierto
  if (!p || !p.pdfDoc) return;

  // Si se hizo clic derecho sobre inputs o campos editables, permitir menú nativo
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) {
    return;
  }

  // Prevenir menú del navegador y alternar visibilidad de la barra de herramientas
  e.preventDefault();
  window.alternarDockHerramientas(e);
});

// Evitar que toques dentro de la barra de herramientas la cierren
const floatingToolbarEl = document.getElementById('floating-toolbar') || document.getElementById('header-toolbar');
if (floatingToolbarEl) {
  floatingToolbarEl.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  floatingToolbarEl.addEventListener('touchend', (e) => {
    e.stopPropagation();
  }, { passive: true });
  floatingToolbarEl.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
}

const mobilePageBadge = document.getElementById('mobile-page-badge');
if (mobilePageBadge) {
  mobilePageBadge.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  mobilePageBadge.addEventListener('touchend', (e) => {
    e.stopPropagation();
  });
}

const moreMenuPop = document.getElementById('more-menu-popover');
if (moreMenuPop) {
  moreMenuPop.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  moreMenuPop.addEventListener('touchend', (e) => {
    e.stopPropagation();
  }, { passive: true });
}

// DETECCIÓN DE DOBLE TAP (DOUBLE TAP) EXCLUSIVA PARA MÓVIL
let ultimoTapTime = 0;
let ultimoTapX = 0;
let ultimoTapY = 0;

let touchStartTime = 0;
let touchStartX = 0;
let touchStartY = 0;
let touchMoved = false;

if (wrapper) {
  wrapper.addEventListener('touchstart', (e) => {
    if (!esDispositivoMovilOTouch()) return;
    if (e.touches.length === 1) {
      touchStartTime = Date.now();
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchMoved = false;
    } else {
      touchMoved = true;
      ultimoTapTime = 0; // Cancelar doble tap si hay multitouch
    }
  }, { passive: true });

  wrapper.addEventListener('touchmove', (e) => {
    if (!esDispositivoMovilOTouch()) return;
    if (e.touches.length === 1) {
      const dx = Math.abs(e.touches[0].clientX - touchStartX);
      const dy = Math.abs(e.touches[0].clientY - touchStartY);
      if (dx > 8 || dy > 8) {
        touchMoved = true;
        ultimoTapTime = 0; // Si el usuario mueve el dedo para hacer scroll, reseteamos el temporizador
      }
    } else {
      touchMoved = true;
      ultimoTapTime = 0;
    }
  }, { passive: true });

  wrapper.addEventListener('touchend', (e) => {
    if (!esDispositivoMovilOTouch()) return;
    const ahora = Date.now();
    const duracionToque = ahora - touchStartTime;

    // Si hubo arrastre o el toque fue largo (más de 300ms), cancelamos
    if (touchMoved || duracionToque > 300) {
      ultimoTapTime = 0;
      return;
    }

    // Verificar si el toque cayó en elementos interactivos o modales
    const target = e.target;
    if (target.closest('button') || target.closest('input') || target.closest('.mobile-float-overlay') ||
        target.closest('#btn-fab-tools') || target.closest('#recent-docs-view') || target.closest('.highlight-rect') ||
        target.closest('.xodo-text-item') || target.closest('#comment-hover-popup') || target.closest('#right-drawer') ||
        target.closest('header') || target.closest('#more-menu-popover') || target.closest('#floating-toolbar') ||
        target.closest('#header-toolbar')) {
      ultimoTapTime = 0;
      return;
    }

    // Comprobar intervalo de Doble Tap (< 300 ms) y proximidad física
    const deltaTiempo = ahora - ultimoTapTime;
    const deltaDistX = Math.abs(touchStartX - ultimoTapX);
    const deltaDistY = Math.abs(touchStartY - ultimoTapY);

    if (deltaTiempo > 0 && deltaTiempo < 300 && deltaDistX < 35 && deltaDistY < 35) {
      // DOBLE TAP CONFIRMADO
      ultimoTapTime = 0;
      alternarBarraSuperiorMovil();
    } else {
      // Primer tap registrado
      ultimoTapTime = ahora;
      ultimoTapX = touchStartX;
      ultimoTapY = touchStartY;
    }
  });
}
