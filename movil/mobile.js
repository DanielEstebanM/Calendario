/* Calendario (versión móvil) — gestos y ajustes que solo existen en el móvil.
   Se carga después de app.js y no modifica el comportamiento del PC. */
(function () {
    'use strict';

    // ===== Gestos de deslizar =====
    // true : deslizar a la DERECHA va al siguiente (mes/día) y a la IZQUIERDA al anterior.
    // false: al revés (lo habitual en muchas apps).
    const RIGHT_SWIPE_GOES_FORWARD = true;
    const MIN_DX = 60;        // px mínimos en horizontal
    const MAX_MS = 800;       // duración máxima del gesto
    const EDGE = 24;          // zona de los bordes que se ignora (gestos del sistema y menús laterales)

    const g = (fn) => { try { return fn(); } catch (e) { return undefined; } };
    let st = null;

    function swipeContext(el) {
        const day = document.getElementById('dayEventsModal');
        if (day && day.style.display === 'flex') {
            return el.closest('#dayEventsModal .modal-content') ? 'day' : null;
        }
        const blocked = g(() => anyModalOpen()) || g(() => sidebarOpen) || g(() => documentsSidebarOpen) ||
            g(() => agendaPopupOpen) || g(() => isSearchMode) || g(() => docEditorIsOpen()) ||
            document.getElementById('pdfViewerPanel').classList.contains('open');
        if (blocked) return null;
        return el.closest('main') ? 'month' : null;
    }

    document.addEventListener('touchstart', (e) => {
        st = null;
        if (e.touches.length !== 1) return;
        const t = e.touches[0], el = e.target;
        if (!el || !el.closest) return;
        if (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE || t.clientY < EDGE) return;
        if (el.closest('input, textarea, select, [contenteditable="true"]')) return;
        const ctx = swipeContext(el);
        if (!ctx) return;
        st = { x: t.clientX, y: t.clientY, t: Date.now(), ctx };
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!st) return;
        const s = st; st = null;
        const t = e.changedTouches[0];
        const dx = t.clientX - s.x, dy = t.clientY - s.y;
        if (Date.now() - s.t > MAX_MS || Math.abs(dx) < MIN_DX || Math.abs(dx) < Math.abs(dy) * 1.6) return;
        const forward = (dx > 0) === RIGHT_SWIPE_GOES_FORWARD;
        const slide = (el) => {
            if (el && el.animate) el.animate(
                [{ opacity: 0.25, transform: 'translateX(' + (dx > 0 ? -40 : 40) + 'px)' }, { opacity: 1, transform: 'none' }],
                { duration: 200, easing: 'ease-out' });
        };
        if (s.ctx === 'month') {
            document.getElementById(forward ? 'nextMonth' : 'prevMonth').click();
            slide(document.getElementById('calendar'));
        } else if (s.ctx === 'day' && typeof selectedDay === 'string' && selectedDay) {
            showDayEvents(addDaysStr(selectedDay, forward ? 1 : -1));
            slide(document.getElementById('dayEventsList'));
        }
    }, { passive: true });

    // ===== Documentos importados que no están en este dispositivo =====
    // El archivo de un Word/PDF importado en otro dispositivo no viaja en la copia de seguridad (.json):
    // se avisa y se ofrece añadirlo desde los archivos del móvil.
    const docs = window.__movilDocs || new Set();
    const isMissing = (f) => !!f && isAttachment(f) && !!f.stored && !docs.has(f.stored);

    function relinkDocument(file) {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.hidden = true; inp.setAttribute('data-movil-relink', '1');
        inp.accept = '.' + file.ext;
        inp.addEventListener('change', async () => {
            const f = inp.files && inp.files[0];
            inp.remove();
            if (!f) return;
            const ext = (f.name.split('.').pop() || '').toLowerCase();
            if (ext !== file.ext) { showToast('El archivo debe ser .' + file.ext + ' (como el original).'); return; }
            const res = await window.store.saveDocument({ name: f.name, data: await f.arrayBuffer() });
            if (!res || !res.ok) { showToast((res && res.error) || 'No se pudo guardar el archivo.'); return; }
            const target = files.find(x => x.id === file.id);
            if (!target) return;
            target.stored = res.stored; target.size = res.size;
            safeSave('calendarFiles', files);
            renderDocuments();
            showToast('Archivo añadido a este móvil', 'ok');
        });
        document.body.appendChild(inp);
        inp.click();
    }

    function askForFile(file) {
        showConfirmModal({
            title: 'Archivo no disponible en este móvil',
            message: '"' + file.title + '" se importó en otro dispositivo y el archivo no viaja en la copia de seguridad, ' +
                'solo su ficha. Puedes añadir aquí el mismo archivo (.' + file.ext + ') desde los archivos de tu móvil para poder abrirlo.',
            cancelText: 'Cerrar', deleteText: 'Añadir archivo', variant: 'save',
            onConfirm: () => relinkDocument(file)
        });
    }

    ['openAttachmentInApp', 'openAttachmentWith', 'openAttachment'].forEach((name) => {
        const orig = window[name];
        if (typeof orig !== 'function') return;
        window[name] = function (file) {
            if (isMissing(file)) { askForFile(file); return; }
            return orig.apply(this, arguments);
        };
    });

    // Marca en la lista los documentos cuyo archivo no está aquí
    const origCreate = window.createFileElement;
    if (typeof origCreate === 'function') {
        window.createFileElement = function (file) {
            const el = origCreate.apply(this, arguments);
            try {
                if (isMissing(file)) {
                    el.classList.add('doc-missing');
                    const d = el.querySelector('.file-description');
                    if (d) d.textContent = 'Sin archivo en este móvil · ' + d.textContent;
                }
            } catch (e) { }
            return el;
        };
        // Los documentos que ya estaban pintados se vuelven a dibujar con la marca
        try { renderDocuments(); } catch (e) { }
    }
})();
