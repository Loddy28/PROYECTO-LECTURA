function construirDPath(puntos, escala) {
  if (!puntos || puntos.length === 0) return '';
  if (puntos.length === 1) {
    const x = puntos[0].x * escala;
    const y = puntos[0].y * escala;
    return `M ${x} ${y} L ${x + 0.1} ${y + 0.1}`;
  }
  let d = `M ${puntos[0].x * escala} ${puntos[0].y * escala}`;
  for (let i = 1; i < puntos.length - 1; i++) {
    const xc = ((puntos[i].x + puntos[i + 1].x) / 2) * escala;
    const yc = ((puntos[i].y + puntos[i + 1].y) / 2) * escala;
    d += ` Q ${puntos[i].x * escala} ${puntos[i].y * escala}, ${xc} ${yc}`;
  }
  const ultimo = puntos[puntos.length - 1];
  d += ` L ${ultimo.x * escala} ${ultimo.y * escala}`;
  return d;
}

// ========================================================
// RENDERIZADO Y CONTROL DE ANOTACIONES EN DOM
// ========================================================
function reconstruirAnotacionesEnDOM() {
  const p = getPestanaActual();
  document.querySelectorAll('.annotation-layer').forEach(layer => layer.innerHTML = '');
  document.querySelectorAll('.ink-layer').forEach(svg => svg.innerHTML = '');
  document.querySelectorAll('.pin-anotacion').forEach(pin => pin.remove());
  if (sidebar) sidebar.innerHTML = '';
  if (!p) return;

  // 1. Resaltados y tachados
  (p.appState.resaltados || []).forEach(item => {
    const pageBox = document.getElementById(`page-box-${item.pageNum}`);
    if (!pageBox) return;
    const layer = pageBox.querySelector('.annotation-layer');

    if (item.tipo === 'tachado') {
      const strike = document.createElement('div');
      strike.className = 'strike-line';
      strike.style.left = (item.x * p.escalaZoom) + 'px';
      strike.style.top = (item.y * p.escalaZoom + ((item.h * p.escalaZoom) / 2)) + 'px';
      strike.style.width = (item.w * p.escalaZoom) + 'px';
      strike.onclick = (e) => {
        if (herramientaCursor === 'eraser') {
          e.stopPropagation();
          borrarAnotacionPorElemento(strike);
          return;
        }
        if (typeof abrirMenuBloque === 'function') abrirMenuBloque(e, 'resaltado', item, strike);
      };
      layer.appendChild(strike);
    } else {
      const hl = document.createElement('div');
      hl.className = 'highlight-rect';
      hl.id = item.id;
      hl.style.left = (item.x * p.escalaZoom) + 'px';
      hl.style.top = (item.y * p.escalaZoom) + 'px';
      hl.style.width = (item.w * p.escalaZoom) + 'px';
      hl.style.height = (item.h * p.escalaZoom) + 'px';
      hl.style.backgroundColor = item.color || '#facc15';
      hl.style.opacity = item.opacity !== undefined ? item.opacity : 0.55;

      hl.onclick = (e) => {
        if (herramientaCursor === 'eraser') {
          e.stopPropagation();
          borrarAnotacionPorElemento(hl);
          return;
        }
        if (typeof abrirMenuBloque === 'function') {
          abrirMenuBloque(e, 'resaltado', item, hl);
        }
      };

      const comAsociado = p.appState.comentarios.find(c => c.id === item.comentarioId || (c.pageNum === item.pageNum && Math.abs(c.relY - item.y) < 14));
      if (comAsociado) {
        hl.onmouseenter = (e) => mostrarPopupComentario(e, comAsociado, false);
        hl.onmouseleave = () => { if (!isEditingPopup) ocultarPopupComentario(); };
      }
      layer.appendChild(hl);
    }
  });

  // 2. Trazos de lápiz
  (p.appState.trazos || []).forEach(tr => {
    const pageBox = document.getElementById(`page-box-${tr.pageNum}`);
    if (!pageBox) return;
    const inkSvg = pageBox.querySelector('.ink-layer');
    if (!inkSvg) return;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'ink-stroke');
    path.id = tr.id;
    path.setAttribute('stroke', tr.color || '#facc15');
    path.setAttribute('stroke-width', (tr.grosor || 18) * p.escalaZoom);
    path.setAttribute('stroke-opacity', tr.opacity !== undefined ? tr.opacity : 0.55);
    path.setAttribute('d', construirDPath(tr.puntos, p.escalaZoom));

    path.onclick = (e) => {
      e.stopPropagation();
      if (herramientaCursor === 'eraser') {
        borrarAnotacionPorElemento(path);
        return;
      }
      if (typeof abrirMenuBloque === 'function') {
        abrirMenuBloque(e, 'trazo', tr, path);
      }
    };

    const comAsociado = p.appState.comentarios.find(c => c.id === tr.comentarioId);
    if (comAsociado) {
      path.onmouseenter = (e) => mostrarPopupComentario(e, comAsociado, false);
      path.onmouseleave = () => { if (!isEditingPopup) ocultarPopupComentario(); };
    }
    inkSvg.appendChild(path);
  });

  // 3. Cuadros de texto
  (p.appState.textos || []).forEach(t => {
    const pageBox = document.getElementById(`page-box-${t.pageNum}`);
    if (!pageBox) return;

    const item = document.createElement('div');
    item.className = 'xodo-text-item';
    item.id = t.id;
    item.style.left = (t.x * p.escalaZoom) + 'px';
    item.style.top = (t.y * p.escalaZoom) + 'px';

    item.innerHTML = `
      <div class="xodo-text-toolbar">
        <button class="mini-btn btn-fdown" title="Reducir tamaño">A-</button>
        <button class="mini-btn btn-fup" title="Aumentar tamaño">A+</button>
        <div class="color-dot" style="background: #ea580c;" data-c="#ea580c" title="Naranja"></div>
        <div class="color-dot" style="background: #0284c7;" data-c="#0284c7" title="Azul"></div>
        <div class="color-dot" style="background: #16a34a;" data-c="#16a34a" title="Verde"></div>
        <div class="color-dot" style="background: #18181b;" data-c="#18181b" title="Negro"></div>
        <button class="mini-btn btn-del" style="color: #ef4444;" title="Eliminar texto">✕</button>
      </div>
      <div class="xodo-text-content" contenteditable="true" spellcheck="false" style="color: ${t.color}; font-size: ${t.fontSize * (p.escalaZoom / 1.2)}px;">${t.texto}</div>
    `;

    pageBox.appendChild(item);
    const content = item.querySelector('.xodo-text-content');

    content.oninput = () => {
      t.texto = content.innerText;
      marcarModificado();
    };

    content.onkeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        content.blur();
        item.classList.remove('selected');
        setHerramientaCursor('select');
      }
      if (e.key === 'Delete' && (content.innerText.trim().length <= 1 || e.ctrlKey)) {
        e.preventDefault();
        guardarSnapshot();
        p.appState.textos = p.appState.textos.filter(x => x.id !== t.id);
        item.remove();
        marcarModificado();
        actualizarContenidoGaveta();
      }
    };

    content.onblur = () => {
      setTimeout(() => {
        if (!content.innerText.trim()) {
          p.appState.textos = p.appState.textos.filter(x => x.id !== t.id);
          item.remove();
          marcarModificado();
        } else {
          item.classList.remove('selected');
        }
        actualizarContenidoGaveta();
      }, 150);
    };

    item.querySelector('.btn-fup').onclick = (e) => {
      e.stopPropagation();
      t.fontSize = Math.min(36, t.fontSize + 2);
      content.style.fontSize = (t.fontSize * (p.escalaZoom / 1.2)) + 'px';
      marcarModificado();
    };
    item.querySelector('.btn-fdown').onclick = (e) => {
      e.stopPropagation();
      t.fontSize = Math.max(9, t.fontSize - 2);
      content.style.fontSize = (t.fontSize * (p.escalaZoom / 1.2)) + 'px';
      marcarModificado();
    };
    item.querySelectorAll('.color-dot').forEach(dot => {
      dot.onclick = (e) => {
        e.stopPropagation();
        t.color = dot.getAttribute('data-c');
        content.style.color = t.color;
        marcarModificado();
      };
    });

    const btnDel = item.querySelector('.btn-del');
    btnDel.onmousedown = (e) => e.stopPropagation();
    btnDel.onclick = (e) => {
      e.stopPropagation();
      guardarSnapshot();
      p.appState.textos = p.appState.textos.filter(x => x.id !== t.id);
      item.remove();
      marcarModificado();
      actualizarContenidoGaveta();
    };

    let isDragging = false;
    let startX, startY, origLeft, origTop;
    item.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.xodo-text-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      if (e.target === content) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      origLeft = item.offsetLeft;
      origTop = item.offsetTop;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const nl = origLeft + (e.clientX - startX);
      const nt = origTop + (e.clientY - startY);
      item.style.left = nl + 'px';
      item.style.top = nt + 'px';
      t.x = nl / p.escalaZoom;
      t.y = nt / p.escalaZoom;
      marcarModificado();
    });

    window.addEventListener('mouseup', () => { isDragging = false; });
  });

  // 4. Comentarios al margen
  (p.appState.comentarios || []).forEach(com => {
    const pageBox = document.getElementById(`page-box-${com.pageNum}`);
    if (pageBox) {
      const pin = document.createElement('div');
      pin.className = 'pin-anotacion';
      pin.style.left = (com.relX * p.escalaZoom - 6) + 'px';
      pin.style.top = (com.relY * p.escalaZoom - 6) + 'px';
      pin.onmouseenter = (e) => mostrarPopupComentario(e, com, false);
      pin.onmouseleave = () => { if (!isEditingPopup) ocultarPopupComentario(); };
      pin.onclick = (e) => {
        e.stopPropagation();
        mostrarPopupComentario(e, com, true);
      };
      pageBox.appendChild(pin);
    }

    if (sidebar) {
      const card = document.createElement('div');
      card.className = 'comment-card';
      card.style.top = (com.globalY - 10) + 'px';
      card.innerHTML = `
        <div class="comment-header">
          <div class="author-info">
            <div class="avatar">LS</div>
            <div>
              <div class="author-name">${com.autor}</div>
              <div class="comment-time">${com.hora}</div>
            </div>
          </div>
          <button class="btn-del-comment" onclick="eliminarComentario('${com.id}')">✕</button>
        </div>
        <div class="comment-body" contenteditable="true" spellcheck="false">${com.texto}</div>
      `;

      const bodyEl = card.querySelector('.comment-body');
      bodyEl.onblur = () => {
        const val = bodyEl.innerText.trim();
        if (val && val !== com.texto) {
          guardarSnapshot();
          com.texto = val;
          marcarModificado();
          actualizarContenidoGaveta();
        }
      };
      sidebar.appendChild(card);
    }
  });
}

function aplicarResaltadoSeleccion(color = colorResaltadoActivo) {
  const p = getPestanaActual();
  if (!p || !currentSelectionRange) return;
  guardarSnapshot();

  const rects = currentSelectionRange.getClientRects();
  let node = currentSelectionRange.commonAncestorContainer;
  while (node && !node.classList?.contains('page-box')) {
    node = node.parentNode;
  }
  if (!node) return;

  const pageBox = node;
  const pageNum = parseInt(pageBox.getAttribute('data-page-num'), 10);
  const boxRect = pageBox.getBoundingClientRect();

  for (let r of rects) {
    p.appState.resaltados.push({
      id: 'res_' + Date.now() + Math.random(),
      pageNum: pageNum,
      tipo: 'resaltado',
      x: (r.left - boxRect.left) / p.escalaZoom,
      y: (r.top - boxRect.top) / p.escalaZoom,
      w: r.width / p.escalaZoom,
      h: r.height / p.escalaZoom,
      color: color,
      opacity: opacidadResaltadoActiva
    });
  }

  window.getSelection().removeAllRanges();
  if (selectionPopover) selectionPopover.style.display = 'none';
  reconstruirAnotacionesEnDOM();
  actualizarContenidoGaveta();
}

function aplicarTachadoSeleccion() {
  const p = getPestanaActual();
  if (!p || !currentSelectionRange) return;
  guardarSnapshot();

  const rects = currentSelectionRange.getClientRects();
  let node = currentSelectionRange.commonAncestorContainer;
  while (node && !node.classList?.contains('page-box')) {
    node = node.parentNode;
  }
  if (!node) return;

  const pageBox = node;
  const pageNum = parseInt(pageBox.getAttribute('data-page-num'), 10);
  const boxRect = pageBox.getBoundingClientRect();

  for (let r of rects) {
    p.appState.resaltados.push({
      id: 'tach_' + Date.now() + Math.random(),
      pageNum: pageNum,
      tipo: 'tachado',
      x: (r.left - boxRect.left) / p.escalaZoom,
      y: (r.top - boxRect.top) / p.escalaZoom,
      w: r.width / p.escalaZoom,
      h: r.height / p.escalaZoom,
      color: '#ef4444'
    });
  }

  window.getSelection().removeAllRanges();
  if (selectionPopover) selectionPopover.style.display = 'none';
  reconstruirAnotacionesEnDOM();
  actualizarContenidoGaveta();
}

function setHerramientaCursor(tipo) {
  herramientaCursor = tipo;

  document.body.classList.toggle('mode-hand', tipo === 'hand');
  document.body.classList.toggle('mode-pen', tipo === 'pen');
  document.body.classList.toggle('mode-eraser', tipo === 'eraser');
  document.body.classList.toggle('mode-area-highlight', tipo === 'area-hl');
  document.body.classList.toggle('mode-add-text', tipo === 'add-text');
  document.body.classList.toggle('mode-add-comment', tipo === 'add-comment');

  document.querySelectorAll('.float-tool-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtnMap = {
    'select': 'f-tool-select',
    'hand': 'f-tool-hand',
    'pen': 'f-tool-pen',
    'eraser': 'f-tool-eraser',
    'area-hl': 'f-tool-area-hl',
    'add-text': 'f-tool-add-text',
    'add-comment': 'f-tool-add-comment'
  };
  const btn = document.getElementById(activeBtnMap[tipo]);
  if (btn) btn.classList.add('active');
}

function agregarMarcadorActual() {
  const p = getPestanaActual();
  if (!p) return;

  const pag = p.paginaActual || 1;
  const titulo = prompt(`Nombre del marcador para la página ${pag}:`, `Sección Pág. ${pag}`);
  if (!titulo || !titulo.trim()) return;

  if (!p.marcadores) p.marcadores = [];
  p.marcadores.push({
    id: 'mark_' + Date.now(),
    titulo: titulo.trim(),
    pageNum: pag
  });
  p.marcadores.sort((a, b) => a.pageNum - b.pageNum);

  marcarModificado();
  actualizarContenidoGaveta();
  if (typeof mostrarNotificacionToast === 'function') {
    mostrarNotificacionToast(`Pág. ${pag} agregada a marcadores`);
  }
}

// ==========================================
// ARRASTRE DE PANTALLA, HERRAMIENTAS Y CLIC
// ==========================================
let isErasing = false;

if (wrapper) {
  wrapper.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;

    if (herramientaCursor === 'hand') {
      isPanning = true;
      startPanX = e.clientX;
      startPanY = e.clientY;
      startScrollLeft = wrapper.scrollLeft;
      startScrollTop = wrapper.scrollTop;
      document.body.classList.add('is-panning');
      e.preventDefault();
    }
    else if (herramientaCursor === 'eraser') {
      isErasing = true;
      verificarYBorrarBajoPunto(e.clientX, e.clientY);
      e.preventDefault();
    }
    else if (herramientaCursor === 'add-text') {
      const pageBox = e.target.closest('.page-box');
      if (!pageBox) return;
      const p = getPestanaActual();
      if (!p) return;

      const pageNum = parseInt(pageBox.getAttribute('data-page-num'), 10);
      const rect = pageBox.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / p.escalaZoom;
      const relY = (e.clientY - rect.top) / p.escalaZoom;

      guardarSnapshot();
      const nuevoTexto = {
        id: 'txt_' + Date.now(),
        pageNum: pageNum,
        x: relX,
        y: relY,
        texto: '',
        color: '#ea580c',
        fontSize: 14
      };

      p.appState.textos.push(nuevoTexto);
      reconstruirAnotacionesEnDOM();

      setTimeout(() => {
        const itemDom = document.getElementById(nuevoTexto.id);
        if (itemDom) {
          const content = itemDom.querySelector('.xodo-text-content');
          itemDom.classList.add('selected');
          content.focus();
        }
      }, 20);

      setHerramientaCursor('select');
      e.preventDefault();
    }
    else if (herramientaCursor === 'add-comment') {
      const pageBox = e.target.closest('.page-box');
      if (!pageBox) return;
      const p = getPestanaActual();
      if (!p) return;

      const pageNum = parseInt(pageBox.getAttribute('data-page-num'), 10);
      const rect = pageBox.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / p.escalaZoom;
      const relY = (e.clientY - rect.top) / p.escalaZoom;

      const texto = prompt("Escribí tu comentario para este punto:");
      if (texto && texto.trim()) {
        guardarSnapshot();
        const ahora = new Date();
        const dia = String(ahora.getDate()).padStart(2, '0');
        const mes = String(ahora.getMonth() + 1).padStart(2, '0');
        const anio = ahora.getFullYear();
        const hora = String(ahora.getHours()).padStart(2, '0');
        const min = String(ahora.getMinutes()).padStart(2, '0');
        const stampStr = `${dia}/${mes}/${anio} • ${hora}:${min}`;

        p.appState.comentarios.push({
          id: 'com_' + Date.now(),
          pageNum: pageNum,
          relX: relX,
          relY: relY,
          globalY: pageBox.offsetTop + (relY * p.escalaZoom),
          texto: texto.trim(),
          autor: "Lucas",
          hora: stampStr
        });

        reconstruirAnotacionesEnDOM();
        actualizarContenidoGaveta();
      }

      setHerramientaCursor('select');
      e.preventDefault();
    }
    else if (herramientaCursor === 'pen') {
      const pageBox = e.target.closest('.page-box');
      if (!pageBox) return;
      const p = getPestanaActual();
      if (!p) return;

      isDrawingPen = true;
      penPageBoxRef = pageBox;
      penPageNum = parseInt(pageBox.getAttribute('data-page-num'), 10);

      const rect = pageBox.getBoundingClientRect();
      const pt = {
        x: (e.clientX - rect.left) / p.escalaZoom,
        y: (e.clientY - rect.top) / p.escalaZoom
      };
      penActivePuntos = [pt];

      const inkSvg = pageBox.querySelector('.ink-layer');
      penLivePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      penLivePath.setAttribute('class', 'ink-stroke');
      penLivePath.setAttribute('stroke', colorResaltadoActivo);
      penLivePath.setAttribute('stroke-width', 18 * p.escalaZoom);
      penLivePath.setAttribute('stroke-opacity', opacidadResaltadoActiva);
      penLivePath.setAttribute('d', construirDPath(penActivePuntos, p.escalaZoom));
      inkSvg.appendChild(penLivePath);

      e.preventDefault();
    }
    else if (herramientaCursor === 'area-hl') {
      const pageBox = e.target.closest('.page-box');
      if (!pageBox) return;

      const p = getPestanaActual();
      if (!p) return;

      isDrawingHighlight = true;
      hlPageBoxRef = pageBox;
      hlStartPageNum = parseInt(pageBox.getAttribute('data-page-num'), 10);

      const pageRect = pageBox.getBoundingClientRect();
      hlStartRelX = (e.clientX - pageRect.left) / p.escalaZoom;
      hlStartRelY = (e.clientY - pageRect.top) / p.escalaZoom;
      hlFixedH = 18;

      if (hlDragBox.parentNode !== pageBox) {
        pageBox.appendChild(hlDragBox);
      }

      hlDragBox.style.left = (hlStartRelX * p.escalaZoom) + 'px';
      hlDragBox.style.top = ((hlStartRelY - 9) * p.escalaZoom) + 'px';
      hlDragBox.style.width = '0px';
      hlDragBox.style.height = (hlFixedH * p.escalaZoom) + 'px';
      hlDragBox.style.backgroundColor = colorResaltadoActivo;
      hlDragBox.style.opacity = opacidadResaltadoActiva;
      hlDragBox.style.display = 'block';
      e.preventDefault();
    }
  });

  // Eventos táctiles para trazo continuo de Lápiz, Resaltador y Borrado continuo
  wrapper.addEventListener('touchstart', (e) => {
    if (herramientaCursor !== 'pen' && herramientaCursor !== 'area-hl' && herramientaCursor !== 'eraser') return;
    if (e.touches.length !== 1) return;

    const t = e.touches[0];
    const target = document.elementFromPoint(t.clientX, t.clientY) || e.target;
    const pageBox = target.closest ? target.closest('.page-box') : null;
    const p = getPestanaActual();
    if (!p) return;

    if (herramientaCursor === 'eraser') {
      isErasing = true;
      verificarYBorrarBajoPunto(t.clientX, t.clientY);
      e.preventDefault();
      return;
    }

    if (!pageBox) return;

    if (herramientaCursor === 'pen') {
      isDrawingPen = true;
      penPageBoxRef = pageBox;
      penPageNum = parseInt(pageBox.getAttribute('data-page-num'), 10);

      const rect = pageBox.getBoundingClientRect();
      const pt = {
        x: (t.clientX - rect.left) / p.escalaZoom,
        y: (t.clientY - rect.top) / p.escalaZoom
      };
      penActivePuntos = [pt];

      const inkSvg = pageBox.querySelector('.ink-layer');
      penLivePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      penLivePath.setAttribute('class', 'ink-stroke');
      penLivePath.setAttribute('stroke', colorResaltadoActivo);
      penLivePath.setAttribute('stroke-width', 18 * p.escalaZoom);
      penLivePath.setAttribute('stroke-opacity', opacidadResaltadoActiva);
      penLivePath.setAttribute('d', construirDPath(penActivePuntos, p.escalaZoom));
      inkSvg.appendChild(penLivePath);

      e.preventDefault();
    }
    else if (herramientaCursor === 'area-hl') {
      isDrawingHighlight = true;
      hlPageBoxRef = pageBox;
      hlStartPageNum = parseInt(pageBox.getAttribute('data-page-num'), 10);

      const pageRect = pageBox.getBoundingClientRect();
      hlStartRelX = (t.clientX - pageRect.left) / p.escalaZoom;
      hlStartRelY = (t.clientY - pageRect.top) / p.escalaZoom;
      hlFixedH = 18;

      if (hlDragBox.parentNode !== pageBox) {
        pageBox.appendChild(hlDragBox);
      }

      hlDragBox.style.left = (hlStartRelX * p.escalaZoom) + 'px';
      hlDragBox.style.top = ((hlStartRelY - 9) * p.escalaZoom) + 'px';
      hlDragBox.style.width = '0px';
      hlDragBox.style.height = (hlFixedH * p.escalaZoom) + 'px';
      hlDragBox.style.backgroundColor = colorResaltadoActivo;
      hlDragBox.style.opacity = opacidadResaltadoActiva;
      hlDragBox.style.display = 'block';
      e.preventDefault();
    }
  }, { passive: false });

  wrapper.addEventListener('touchmove', (e) => {
    if (herramientaCursor !== 'pen' && herramientaCursor !== 'area-hl' && herramientaCursor !== 'eraser') return;
    if (e.touches.length !== 1) return;

    const t = e.touches[0];

    if (herramientaCursor === 'eraser' && isErasing) {
      verificarYBorrarBajoPunto(t.clientX, t.clientY);
      e.preventDefault();
      return;
    }

    if (isDrawingPen && penPageBoxRef && penLivePath) {
      const p = getPestanaActual();
      if (!p) return;

      const rect = penPageBoxRef.getBoundingClientRect();
      const pt = {
        x: (t.clientX - rect.left) / p.escalaZoom,
        y: (t.clientY - rect.top) / p.escalaZoom
      };

      penActivePuntos.push(pt);
      penLivePath.setAttribute('d', construirDPath(penActivePuntos, p.escalaZoom));
      e.preventDefault();
      return;
    }

    if (isDrawingHighlight && hlPageBoxRef) {
      const p = getPestanaActual();
      if (!p) return;

      const pageRect = hlPageBoxRef.getBoundingClientRect();
      const curRelX = (t.clientX - pageRect.left) / p.escalaZoom;

      const left = Math.min(hlStartRelX, curRelX);
      const ancho = Math.abs(curRelX - hlStartRelX);

      hlDragBox.style.left = (left * p.escalaZoom) + 'px';
      hlDragBox.style.width = (ancho * p.escalaZoom) + 'px';
      e.preventDefault();
    }
  }, { passive: false });

  wrapper.addEventListener('touchend', (e) => {
    if (herramientaCursor !== 'pen' && herramientaCursor !== 'area-hl' && herramientaCursor !== 'eraser') return;

    if (isErasing) {
      isErasing = false;
    }

    if (isDrawingPen) {
      isDrawingPen = false;
      const p = getPestanaActual();
      if (p && penActivePuntos.length > 0) {
        if (!p.appState.trazos) p.appState.trazos = [];
        guardarSnapshot();
        p.appState.trazos.push({
          id: 'ink_' + Date.now(),
          pageNum: penPageNum,
          puntos: penActivePuntos,
          color: colorResaltadoActivo,
          opacity: opacidadResaltadoActiva,
          grosor: 18
        });
        reconstruirAnotacionesEnDOM();
        actualizarContenidoGaveta();
      }
      penActivePuntos = [];
      penPageBoxRef = null;
      penLivePath = null;
    }

    if (isDrawingHighlight) {
      isDrawingHighlight = false;
      hlDragBox.style.display = 'none';

      if (hlDragBox.parentNode !== wrapper) {
        wrapper.appendChild(hlDragBox);
      }

      const p = getPestanaActual();
      if (p && hlPageBoxRef) {
        const pageRect = hlPageBoxRef.getBoundingClientRect();
        const endRelX = (hlDragBox.offsetWidth > 0 && e.changedTouches && e.changedTouches[0])
          ? (e.changedTouches[0].clientX - pageRect.left) / p.escalaZoom
          : hlStartRelX;

        const finalX = Math.min(hlStartRelX, endRelX);
        const finalW = Math.abs(endRelX - hlStartRelX);

        if (finalW > 5) {
          guardarSnapshot();
          if (!p.appState.resaltados) p.appState.resaltados = [];
          p.appState.resaltados.push({
            id: 'res_line_' + Date.now(),
            pageNum: hlStartPageNum,
            tipo: 'resaltado',
            x: finalX,
            y: hlStartRelY - 9,
            w: finalW,
            h: hlFixedH,
            color: colorResaltadoActivo,
            opacity: opacidadResaltadoActiva
          });
          reconstruirAnotacionesEnDOM();
          actualizarContenidoGaveta();
        }
      }
      hlPageBoxRef = null;
    }
  });
}

function verificarYBorrarBajoPunto(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el) return;
  const targetAnotacion = el.closest ? (el.closest('.highlight-rect') || el.closest('.ink-stroke') || el.closest('.strike-line') || (el.hasAttribute && el.hasAttribute('data-id') ? el : null)) : null;
  if (targetAnotacion) {
    borrarAnotacionPorElemento(targetAnotacion);
  }
}

window.addEventListener('mousemove', (e) => {
  if (isPanning) {
    const dx = e.clientX - startPanX;
    const dy = e.clientY - startPanY;
    wrapper.scrollLeft = startScrollLeft - dx;
    wrapper.scrollTop = startScrollTop - dy;
    return;
  }

  if (herramientaCursor === 'eraser' && isErasing) {
    verificarYBorrarBajoPunto(e.clientX, e.clientY);
    e.preventDefault();
    return;
  }

  if (isDrawingPen && penPageBoxRef && penLivePath) {
    const p = getPestanaActual();
    if (!p) return;

    const rect = penPageBoxRef.getBoundingClientRect();
    const pt = {
      x: (e.clientX - rect.left) / p.escalaZoom,
      y: (e.clientY - rect.top) / p.escalaZoom
    };

    penActivePuntos.push(pt);
    penLivePath.setAttribute('d', construirDPath(penActivePuntos, p.escalaZoom));
    e.preventDefault();
    return;
  }

  if (isDrawingHighlight && hlPageBoxRef) {
    const p = getPestanaActual();
    if (!p) return;

    const pageRect = hlPageBoxRef.getBoundingClientRect();
    const curRelX = (e.clientX - pageRect.left) / p.escalaZoom;

    const left = Math.min(hlStartRelX, curRelX);
    const ancho = Math.abs(curRelX - hlStartRelX);

    hlDragBox.style.left = (left * p.escalaZoom) + 'px';
    hlDragBox.style.width = (ancho * p.escalaZoom) + 'px';
    e.preventDefault();
  }
});

window.addEventListener('mouseup', (e) => {
  if (isPanning) {
    isPanning = false;
    document.body.classList.remove('is-panning');
  }

  if (isErasing) {
    isErasing = false;
  }

  if (isDrawingPen) {
    isDrawingPen = false;
    const p = getPestanaActual();
    if (p && penActivePuntos.length > 0) {
      if (!p.appState.trazos) p.appState.trazos = [];
      guardarSnapshot();
      p.appState.trazos.push({
        id: 'ink_' + Date.now(),
        pageNum: penPageNum,
        puntos: penActivePuntos,
        color: colorResaltadoActivo,
        opacity: opacidadResaltadoActiva,
        grosor: 18
      });
      reconstruirAnotacionesEnDOM();
      actualizarContenidoGaveta();
    }
    penActivePuntos = [];
    penPageBoxRef = null;
    penLivePath = null;
  }

  if (isDrawingHighlight) {
    isDrawingHighlight = false;
    hlDragBox.style.display = 'none';

    if (hlDragBox.parentNode !== wrapper) {
      wrapper.appendChild(hlDragBox);
    }

    const p = getPestanaActual();
    if (p && hlPageBoxRef) {
      const pageRect = hlPageBoxRef.getBoundingClientRect();
      const endRelX = (e.clientX - pageRect.left) / p.escalaZoom;

      const finalX = Math.min(hlStartRelX, endRelX);
      const finalW = Math.abs(endRelX - hlStartRelX);

      if (finalW > 5) {
        guardarSnapshot();
        if (!p.appState.resaltados) p.appState.resaltados = [];
        p.appState.resaltados.push({
          id: 'res_line_' + Date.now(),
          pageNum: hlStartPageNum,
          tipo: 'resaltado',
          x: finalX,
          y: hlStartRelY - 9,
          w: finalW,
          h: hlFixedH,
          color: colorResaltadoActivo,
          opacity: opacidadResaltadoActiva
        });
        reconstruirAnotacionesEnDOM();
        actualizarContenidoGaveta();
      }
    }
    hlPageBoxRef = null;
  }
});

// ========================================================
// HERRAMIENTA GOMA DE BORRAR (ERASER)
// ========================================================
function borrarAnotacionPorElemento(el) {
  const p = getPestanaActual();
  if (!p) return;

  const id = el.id || el.getAttribute('data-id');
  if (!id) return;

  guardarSnapshot();

  p.appState.resaltados = (p.appState.resaltados || []).filter(item => item.id !== id);
  p.appState.trazos = (p.appState.trazos || []).filter(item => item.id !== id);

  el.remove();
  marcarModificado();
  if (typeof actualizarContenidoGaveta === 'function') actualizarContenidoGaveta();
}