        // Variables globales
        let currentDate = new Date();
        // ============================================
        // SANEADO DE DATOS Y DOCUMENTOS
        // ============================================
        const SAFE_IMG_RE = /^(data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+\/=]+|calimg:\/\/img\/[a-f0-9]{40}\.[a-z]+|https?:\/\/[^\s"'<>()]+)$/i;
        const HEX6_RE = /^#[0-9a-f]{6}$/i;

        function cleanIconValue(v) {
            if (typeof v !== 'string' || !v) return null;
            if (/^<i class="[\w\s-]+"><\/i>$/.test(v)) return v;   // icono de fuente (Flaticon)
            return SAFE_IMG_RE.test(v) ? v : null;
        }

        const PAGE_SEP = '<hr style="page-break-after: always; border: none; border-top: 1px dashed #ccc; margin: 20px 0;">';
        const PAGE_SPLIT_RE = /<hr[^>]*page-break-after:\s*always[^>]*>/i;
        // ============================================
        // INDICADORES DE CARGA
        // ============================================
        const loaderHtml = (text, cls) => '<div class="' + (cls || 'list-loading') + '"><span class="app-spinner' + (cls ? '' : ' sm') + '"></span><span>' + escapeHtml(text) + '</span></div>';

        // Pastilla flotante: busyStart devuelve la función que la oculta (con retraso para no parpadear en tareas rápidas)
        let busyCount = 0, busyTimer = null, busyEl = null;
        function busyStart(label, delay) {
            if (!busyEl) {
                busyEl = document.createElement('div');
                busyEl.className = 'busy-pill';
                busyEl.setAttribute('role', 'status');
                busyEl.setAttribute('aria-live', 'polite');
                busyEl.innerHTML = '<span class="app-spinner sm"></span><span class="busy-text"></span>';
                document.body.appendChild(busyEl);
            }
            busyEl.querySelector('.busy-text').textContent = label || 'Cargando…';
            busyCount++;
            clearTimeout(busyTimer);
            busyTimer = setTimeout(() => { if (busyCount > 0) busyEl.classList.add('show'); }, delay === undefined ? 150 : delay);
            let done = false;
            return () => {
                if (done) return;
                done = true;
                busyCount = Math.max(0, busyCount - 1);
                if (!busyCount) { clearTimeout(busyTimer); busyEl.classList.remove('show'); }
            };
        }
        // Para trabajo pesado que bloquea la pantalla: pinta el indicador antes de empezar y lo quita al terminar
        async function busyRun(label, fn) {
            const end = busyStart(label, 0);
            try {
                await new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));
                return await fn();
            } finally { end(); }
        }
        // Listados largos: se pinta "Cargando…" y el listado se calcula justo después; si llega otra petición, gana la última
        let listLoaderToken = 0;
        function withListLoader(container, count, threshold, text, run) {
            if (count < threshold) { run(); return; }
            const t = ++listLoaderToken;
            container.innerHTML = loaderHtml(text);
            requestAnimationFrame(() => setTimeout(() => { if (t === listLoaderToken) run(); }, 0));
        }

        const SAFE_TAGS = new Set(['P', 'DIV', 'BR', 'SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'FONT', 'HR', 'BLOCKQUOTE', 'SUB', 'SUP',
            'A', 'IMG', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'COLGROUP', 'COL', 'CAPTION']);
        // Enlaces: solo web, correo y teléfono. Imágenes del documento: solo incrustadas (data:), nunca remotas
        const SAFE_LINK_RE = /^(https?:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+|tel:[+\d\s().-]+)$/i;
        const DOC_IMG_RE = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+\/=]+$/i;
        const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'FRAME', 'FRAMESET', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE', 'SVG', 'MATH',
            'TEMPLATE', 'NOSCRIPT', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'AUDIO', 'VIDEO', 'TITLE', 'HEAD']);
        const SAFE_STYLE_PROPS = new Set(['color', 'background-color', 'font-size', 'font-weight', 'font-style', 'font-family', 'text-decoration',
            'text-decoration-line', 'text-align', 'line-height', 'margin', 'margin-left', 'margin-top', 'margin-bottom', 'padding-left',
            'text-indent', 'list-style-type', 'text-transform', 'letter-spacing',
            'margin-right', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'width', 'max-width', 'height',
            'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-collapse', 'table-layout', 'border-color',
            'border-style', 'border-width', 'vertical-align']);

        function cleanStyle(css) {
            return String(css).split(';').map(s => s.trim()).filter(Boolean).map(decl => {
                const i = decl.indexOf(':');
                if (i < 1) return null;
                const prop = decl.slice(0, i).trim().toLowerCase();
                const val = decl.slice(i + 1).trim();
                if (!SAFE_STYLE_PROPS.has(prop)) return null;
                if (/url\s*\(|expression|javascript|@import|[<>\\]|\/\*/i.test(val)) return null;
                return prop + ': ' + val;
            }).filter(Boolean).join('; ');
        }

        function cleanDocNode(node) {
            Array.from(node.childNodes).forEach(ch => {
                if (ch.nodeType === 3) return;
                if (ch.nodeType !== 1) { ch.remove(); return; }
                const tag = ch.nodeName;
                if (!SAFE_TAGS.has(tag)) {
                    if (DROP_TAGS.has(tag)) { ch.remove(); return; }
                    cleanDocNode(ch);                                   // etiqueta desconocida: se conserva solo su contenido
                    while (ch.firstChild) node.insertBefore(ch.firstChild, ch);
                    ch.remove();
                    return;
                }
                Array.from(ch.attributes).forEach(a => {
                    const n = a.name.toLowerCase(), v = a.value;
                    if (n === 'style') { const s = cleanStyle(v); if (s) ch.setAttribute('style', s); else ch.removeAttribute('style'); }
                    else if (n === 'size' && tag === 'FONT' && /^[1-7]$/.test(v)) { /* ok */ }
                    else if (n === 'color' && tag === 'FONT' && /^#?[0-9a-z]{3,20}$/i.test(v)) { /* ok */ }
                    else if (n === 'start' && tag === 'OL' && /^\d{1,4}$/.test(v)) { /* ok */ }
                    else if (n === 'align' && /^(left|center|right|justify)$/i.test(v)) { /* ok */ }
                    else if (tag === 'A' && n === 'href' && SAFE_LINK_RE.test(v)) { /* ok */ }
                    else if (tag === 'A' && n === 'title') { /* ok */ }
                    else if (tag === 'IMG' && n === 'src' && DOC_IMG_RE.test(v)) { /* ok */ }
                    else if (tag === 'IMG' && (n === 'alt' || n === 'title')) { /* ok */ }
                    else if ((tag === 'IMG' || tag === 'TD' || tag === 'TH' || tag === 'COL' || tag === 'TABLE') && (n === 'width' || n === 'height') && /^\d{1,4}%?$/.test(v)) { /* ok */ }
                    else if ((tag === 'TD' || tag === 'TH') && (n === 'colspan' || n === 'rowspan') && /^\d{1,3}$/.test(v)) { /* ok */ }
                    else ch.removeAttribute(a.name);
                });
                if (tag === 'IMG' && !ch.getAttribute('src')) { ch.remove(); return; }
                cleanDocNode(ch);
                if (tag === 'A') {
                    if (ch.getAttribute('href')) { ch.setAttribute('target', '_blank'); ch.setAttribute('rel', 'noopener noreferrer'); }
                    else { while (ch.firstChild) node.insertBefore(ch.firstChild, ch); ch.remove(); }   // enlace no válido: queda el texto
                }
            });
        }

        // DOMParser crea un documento inerte: no ejecuta scripts ni carga nada mientras se limpia
        function sanitizeDocHtml(html) {
            const doc = new DOMParser().parseFromString('<!DOCTYPE html><body>' + String(html || ''), 'text/html');
            cleanDocNode(doc.body);
            return doc.body.innerHTML;
        }
        function sanitizeDocContent(content) {
            return String(content || '').split(PAGE_SPLIT_RE).map(sanitizeDocHtml).join(PAGE_SEP);
        }

        function sanitizeImportedData(d) {
            const arr = v => Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : [];
            d.events = arr(d.events); d.categories = arr(d.categories); d.folders = arr(d.folders);
            d.files = arr(d.files); d.templates = arr(d.templates);
            d.categories.forEach(c => {
                c.icon = cleanIconValue(c.icon);
                if (c.backgroundImage && !SAFE_IMG_RE.test(c.backgroundImage)) delete c.backgroundImage;
                if (c.color !== undefined && !HEX6_RE.test(c.color)) c.color = '#3c6df0';
                if (c.type === 'image' && !c.backgroundImage) { c.type = 'color'; c.color = c.color || '#3c6df0'; }
            });
            d.folders.forEach(f => {
                f.icon = cleanIconValue(f.icon);
                if (f.color !== undefined && !HEX6_RE.test(f.color)) f.color = '#3c6df0';
            });
            d.files.forEach(f => { f.content = sanitizeDocContent(f.content); });
            return d;
        }

        // ============================================
        // VALIDACIÓN DE DATOS (copias .json y archivo de datos)
        // ============================================
        const DATA_LIMITS = { events: 50000, categories: 500, folders: 2000, files: 5000, templates: 500, doneDates: 5000, image: 8000000, importBytes: 150 * 1024 * 1024 };
        const VALID_REPEATS = ['daily', 'weekly', 'monthWeekly', 'monthly', 'yearly'];
        const VALID_REMINDERS = [0, 5, 10, 15, 30, 60, 120, 1440];
        const ATTACH_EXTS = ['pdf', 'doc', 'docx'];
        const ATTACH_MAX_BYTES = 50 * 1024 * 1024;
        const ATTACH_STORED_RE = /^[a-f0-9]{32}\/(?!\.)[^\\\/:*?"<>|\u0000-\u001f]{1,130}\.(pdf|doc|docx)$/i;
        const DEFAULT_CATEGORIES = [
            { id: 1, name: 'Trabajo', color: '#3c6df0', type: 'color' },
            { id: 2, name: 'Personal', color: '#f0623c', type: 'color' },
            { id: 3, name: 'Salud', color: '#3cf06d', type: 'color' },
            { id: 4, name: 'Social', color: '#f03cb5', type: 'color' },
            { id: 5, name: 'Educación', color: '#9c3cf0', type: 'color' }
        ];

        function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
        function validDateStr(v) {
            if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
            const [y, m, d] = v.split('-').map(Number);
            if (y < 1000) return false;
            const dt = new Date(y, m - 1, d);
            return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
        }
        function validTimeStr(v) { return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v); }
        function cleanStr(v, max, fallback) {
            if (typeof v === 'number' && isFinite(v)) v = String(v);
            if (typeof v !== 'string') return fallback === undefined ? '' : fallback;
            return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);
        }
        function cleanId(v) {
            if (typeof v === 'string' && /^\d{1,16}(\.\d+)?$/.test(v)) v = Number(v);
            return (typeof v === 'number' && isFinite(v) && v > 0) ? v : null;
        }
        function cleanTs(v) { return (typeof v === 'number' && isFinite(v) && v > 0 && v < 8.64e15) ? Math.floor(v) : null; }
        function safeImgValue(v) { return (typeof v === 'string' && v.length <= DATA_LIMITS.image && SAFE_IMG_RE.test(v)) ? v : null; }
        function safeIconValue(v) { return (typeof v === 'string' && v.length <= DATA_LIMITS.image) ? cleanIconValue(v) : null; }

        // Convierte CUALQUIER objeto en datos válidos para la app: lo que no sirve se descarta o se corrige,
        // nunca se deja pasar tal cual. Devuelve { data, report }.
        function validateAppData(raw, opts) {
            const o = Object.assign({ sanitizeHtml: true }, opts || {});
            raw = isPlainObject(raw) ? raw : {};
            const report = { dropped: { events: 0, categories: 0, folders: 0, files: 0, templates: 0 }, droppedTotal: 0, fixed: 0 };
            let idSeq = Date.now();
            const items = (v, max, key) => {
                if (!Array.isArray(v)) return [];
                if (v.length > max) { report.dropped[key] += v.length - max; return v.slice(0, max); }
                return v;
            };
            const allocator = (list) => {
                const reserved = new Set();
                list.forEach(x => { const i = isPlainObject(x) ? cleanId(x.id) : null; if (i !== null) reserved.add(i); });
                const used = new Set();
                return (rawId) => {
                    const orig = cleanId(rawId);
                    let id = orig;
                    if (id === null || used.has(id)) {
                        do { id = ++idSeq; } while (used.has(id) || reserved.has(id));
                        report.fixed++;
                    }
                    used.add(id);
                    return { id, orig };
                };
            };

            // ---- Categorías ----
            const catRaw = items(raw.categories, DATA_LIMITS.categories, 'categories');
            const catAlloc = allocator(catRaw), catMap = new Map(), categories = [];
            catRaw.forEach(c => {
                if (!isPlainObject(c)) { report.dropped.categories++; return; }
                const name = cleanStr(c.name, 120).trim();
                if (!name) { report.dropped.categories++; return; }
                const { id, orig } = catAlloc(c.id);
                if (orig !== null && !catMap.has(orig)) catMap.set(orig, id);
                const cat = { id, name, type: c.type === 'image' ? 'image' : 'color' };
                const icon = safeIconValue(c.icon); if (icon) cat.icon = icon;
                const bg = safeImgValue(c.backgroundImage); if (bg) cat.backgroundImage = bg;
                if (typeof c.color === 'string' && /^#[0-9a-f]{6}$/i.test(c.color)) cat.color = c.color;
                if (cat.type === 'image' && !cat.backgroundImage) cat.type = 'color';
                if (cat.type === 'color' && !cat.color) cat.color = '#3c6df0';
                categories.push(cat);
            });

            // ---- Carpetas ----
            const folRaw = items(raw.folders, DATA_LIMITS.folders, 'folders');
            const folAlloc = allocator(folRaw), folMap = new Map(), folders = [], folParentRaw = [];
            folRaw.forEach(f => {
                if (!isPlainObject(f)) { report.dropped.folders++; return; }
                const name = cleanStr(f.name, 120).trim();
                if (!name) { report.dropped.folders++; return; }
                const { id, orig } = folAlloc(f.id);
                if (orig !== null && !folMap.has(orig)) folMap.set(orig, id);
                const fol = { id, name, color: (typeof f.color === 'string' && /^#[0-9a-f]{6}$/i.test(f.color)) ? f.color : '#3c6df0', icon: safeIconValue(f.icon), parentId: null };
                const ca = cleanTs(f.createdAt), up = cleanTs(f.updatedAt);
                if (ca) fol.createdAt = ca;
                if (up) fol.updatedAt = up;
                folders.push(fol); folParentRaw.push(cleanId(f.parentId));
            });
            folders.forEach((f, i) => {
                const p = folParentRaw[i];
                f.parentId = (p !== null && folMap.has(p) && folMap.get(p) !== f.id) ? folMap.get(p) : null;
            });
            const folById = new Map(folders.map(f => [f.id, f]));
            folders.forEach(f => {            // rompe ciclos (A dentro de B dentro de A)
                const seen = new Set([f.id]);
                let p = f.parentId;
                while (p !== null && p !== undefined) {
                    if (seen.has(p)) { f.parentId = null; report.fixed++; break; }
                    seen.add(p);
                    const pf = folById.get(p);
                    p = pf ? pf.parentId : null;
                }
            });

            // ---- Documentos ----
            const fileRaw = items(raw.files, DATA_LIMITS.files, 'files');
            const fileAlloc = allocator(fileRaw), files = [];
            fileRaw.forEach(f => {
                if (!isPlainObject(f) || (f.kind !== 'attachment' && typeof f.title !== 'string' && typeof f.content !== 'string')) { report.dropped.files++; return; }
                const { id } = fileAlloc(f.id);
                const fid = cleanId(f.folderId);
                const now = Date.now();
                const createdAt = cleanTs(f.createdAt) || now;
                const rec = {
                    id,
                    title: cleanStr(f.title, 200).trim() || 'Documento sin título',
                    description: cleanStr(f.description, 2000),
                    content: '',
                    folderId: (fid !== null && folMap.has(fid)) ? folMap.get(fid) : null,
                    createdAt,
                    updatedAt: cleanTs(f.updatedAt) || createdAt
                };
                if (f.kind === 'attachment') {      // Word / PDF importado
                    const ext = typeof f.ext === 'string' ? f.ext.toLowerCase() : '';
                    if (!ATTACH_EXTS.includes(ext) || typeof f.stored !== 'string' || !ATTACH_STORED_RE.test(f.stored) ||
                        f.stored.split('.').pop().toLowerCase() !== ext) { report.dropped.files++; return; }
                    rec.kind = 'attachment'; rec.ext = ext; rec.stored = f.stored;
                    rec.size = (typeof f.size === 'number' && isFinite(f.size) && f.size >= 0) ? Math.floor(f.size) : 0;
                    rec.origName = cleanStr(f.origName, 200);
                    rec.inApp = f.inApp === true;      // Word convertido: se edita dentro de la app
                    if (typeof f.searchText === 'string') rec.searchText = f.searchText.slice(0, 300000);
                    if (typeof f.content === 'string') rec.content = o.sanitizeHtml ? sanitizeDocContent(f.content) : f.content;
                } else {
                    const content = typeof f.content === 'string' ? f.content : '';
                    rec.content = o.sanitizeHtml ? sanitizeDocContent(content) : content;
                }
                if (typeof f.header === 'string' && f.header) rec.header = cleanStr(f.header, 300);
                if (typeof f.footer === 'string' && f.footer) rec.footer = cleanStr(f.footer, 300);
                if (f.pageStyle) { const ps = cleanPageStyle(f.pageStyle); if (ps) rec.pageStyle = ps; }
                files.push(rec);
            });

            const fileIdSet = new Set(files.map(f => f.id));
            // ---- Eventos ----
            const evRaw = items(raw.events, DATA_LIMITS.events, 'events');
            const evAlloc = allocator(evRaw), events = [];
            evRaw.forEach(e => {
                if (!isPlainObject(e) || !validDateStr(e.start)) { report.dropped.events++; return; }
                const { id } = evAlloc(e.id);
                const cid = cleanId(e.categoryId);
                const ev = {
                    id,
                    title: cleanStr(e.title, 200).trim() || 'Sin título',
                    start: e.start,
                    end: (validDateStr(e.end) && e.end > e.start) ? e.end : null,
                    categoryId: (cid !== null && catMap.has(cid)) ? catMap.get(cid) : null,
                    description: cleanStr(e.description, 20000),
                    important: e.important === true,
                    startTime: validTimeStr(e.startTime) ? e.startTime : null,
                    endTime: validTimeStr(e.endTime) ? e.endTime : null
                };
                if (ev.endTime && !ev.end && ev.startTime && ev.endTime <= ev.startTime) ev.endTime = null;
                ev.location = cleanStr(e.location, 200).trim() || null;
                if (Array.isArray(e.docIds)) {
                    const dids = [...new Set(e.docIds.map(cleanId).filter(x => x !== null && fileIdSet.has(x)))].slice(0, 20);
                    if (dids.length) ev.docIds = dids;
                }
                ev.repeat = (!ev.end && VALID_REPEATS.includes(e.repeat)) ? e.repeat : null;
                ev.repeatUntil = (ev.repeat && ev.repeat !== 'monthWeekly' && validDateStr(e.repeatUntil) && e.repeatUntil >= ev.start) ? e.repeatUntil : null;
                ev.reminder = (typeof e.reminder === 'number' && VALID_REMINDERS.includes(e.reminder)) ? e.reminder : null;
                if (ev.reminder !== null && !ev.startTime && validTimeStr(e.reminderTime)) ev.reminderTime = e.reminderTime;
                if (Array.isArray(e.doneDates)) {
                    const dd = [...new Set(e.doneDates.filter(validDateStr))].slice(0, DATA_LIMITS.doneDates);
                    if (dd.length) ev.doneDates = dd;
                }
                events.push(ev);
            });

            // ---- Plantillas ----
            const tplRaw = items(raw.templates, DATA_LIMITS.templates, 'templates');
            const tplAlloc = allocator(tplRaw), templates = [];
            tplRaw.forEach(t => {
                if (!isPlainObject(t)) { report.dropped.templates++; return; }
                const title = cleanStr(t.title, 200).trim();
                const name = cleanStr(t.name, 120).trim() || title;
                if (!name) { report.dropped.templates++; return; }
                const { id } = tplAlloc(t.id);
                const cid = cleanId(t.categoryId);
                templates.push({
                    id, name, title: title || name,
                    startTime: validTimeStr(t.startTime) ? t.startTime : null,
                    endTime: validTimeStr(t.endTime) ? t.endTime : null,
                    description: cleanStr(t.description, 20000),
                    location: cleanStr(t.location, 200).trim() || null,
                    important: t.important === true,
                    repeat: VALID_REPEATS.includes(t.repeat) ? t.repeat : null,
                    reminder: (typeof t.reminder === 'number' && VALID_REMINDERS.includes(t.reminder)) ? t.reminder : null,
                    categoryId: (cid !== null && catMap.has(cid)) ? catMap.get(cid) : null
                });
                const tplLast = templates[templates.length - 1];
                if (tplLast.reminder !== null && !tplLast.startTime && validTimeStr(t.reminderTime)) tplLast.reminderTime = t.reminderTime;
            });

            report.droppedTotal = Object.values(report.dropped).reduce((a, b) => a + b, 0);
            return { data: { events, categories, folders, files, templates }, report };
        }

        // Lee el texto de un .json y decide si es una copia de Calendario. Nunca lanza errores.
        function parseBackupText(text) {
            const fail = (error) => ({ ok: false, error });
            try {
                if (typeof text !== 'string' || !text.trim()) return fail('El archivo está vacío.');
                if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
                let raw;
                try { raw = JSON.parse(text); }
                catch (err) { return fail('El archivo no es un JSON válido: tiene errores de sintaxis o está cortado. (Detalle técnico: ' + (err && err.message ? err.message : 'error') + ')'); }
                if (Array.isArray(raw)) return fail('El JSON es una lista suelta, no una copia de seguridad de Calendario.');
                if (!isPlainObject(raw)) return fail('El JSON no contiene una copia de seguridad de Calendario.');
                const known = ['events', 'categories', 'folders', 'files', 'templates'];
                if (!known.some(k => Object.prototype.hasOwnProperty.call(raw, k)))
                    return fail('Este JSON no tiene nada que ver con Calendario: no contiene eventos, categorías ni documentos.');
                if (!Array.isArray(raw.events) || !Array.isArray(raw.categories))
                    return fail('La copia está incompleta o dañada: faltan los eventos o las categorías (o no son una lista).');
                for (const k of ['folders', 'files', 'templates']) {
                    if (raw[k] !== undefined && !Array.isArray(raw[k])) return fail('La copia está dañada: "' + k + '" no es una lista.');
                }
                if (typeof raw.version === 'number' && raw.version > 1)
                    return fail('Esta copia se creó con una versión más reciente de Calendario y esta versión no puede leerla con seguridad.');
                const res = validateAppData(raw, { sanitizeHtml: true });
                const d = res.data;
                const counts = { events: d.events.length, categories: d.categories.length, folders: d.folders.length, files: d.files.length, templates: d.templates.length };
                const kept = counts.events + counts.categories + counts.folders + counts.files + counts.templates;
                const had = raw.events.length + raw.categories.length + (raw.folders || []).length + (raw.files || []).length + (raw.templates || []).length;
                if (had > 0 && kept === 0) return fail('El archivo tiene datos, pero ninguno tiene el formato correcto de Calendario.');
                return { ok: true, data: d, report: res.report, counts };
            } catch (err) {
                console.error(err);
                return fail('No se pudo analizar el archivo (error inesperado).');
            }
        }

        // Datos guardados en archivo (Electron). Si no hay archivo, se usa localStorage (migración / navegador).
        // Todo lo que se lee pasa por validateAppData: un archivo dañado o manipulado no puede romper la app.
        let fileData = null;
        try { fileData = (window.store && window.store.loadSync) ? window.store.loadSync() : null; } catch (err) { console.error(err); }
        const bootSource = isPlainObject(fileData) ? fileData : null;
        const readStoredList = (key) => { try { const v = JSON.parse(localStorage.getItem(key)); return Array.isArray(v) ? v : null; } catch (err) { return null; } };
        const bootPick = (k, lsKey) => (bootSource && Array.isArray(bootSource[k])) ? bootSource[k] : readStoredList(lsKey);
        const bootCats = bootPick('categories', 'eventCategories');
        const boot = validateAppData({
            events: bootPick('events', 'calendarEvents'),
            categories: Array.isArray(bootCats) ? bootCats : DEFAULT_CATEGORIES.map(c => ({ ...c })),
            folders: bootPick('folders', 'calendarFolders'),
            files: bootPick('files', 'calendarFiles'),
            templates: bootPick('templates', 'eventTemplates')
        }, { sanitizeHtml: false });
        let events = boot.data.events;
        let categories = boot.data.categories;
        let selectedDay = null;
        let editingEventId = null;
        let selectedCategoryId = null;
        let categoryAppearanceType = 'color';
        let categoryUploadedImage = null;
        let categoryUploadedIcon = null;
        let editingCategoryId = null;
        let isAddingNewCategory = false;
        let isSearchMode = false;
        let isSavingCategory = false;
        let previousModal = null;
        let headerVisible = false;
        let headerHideTimeout = null;
        let isSearchActive = false;
        const searchFilters = { cats: new Set(), importance: 'all', location: '' };
        let sidebarOpen = false;
        let leftMenuOpen = false;
        let configSubmenuOpen = false;
        let colorSubmenuOpen = false;

        // Documentos
        let folders = boot.data.folders;
        let files = boot.data.files;
        let templates = boot.data.templates;
        let editingFolderId = null;
        let selectedFolderParent = null;   // carpeta superior elegida en el modal de carpeta (null = nivel principal)
        let saveAsSelectedFolder = null;   // carpeta elegida en "Guardar como" (null = archivo suelto)
        let documentsSidebarOpen = false;
        let selectedFolderColor = '#3c6df0';
        let selectedFolderIcon = null;
        let currentFolderIconUpload = null;
        let folderOrderMode = localStorage.getItem('folderOrderMode') || 'ordered';

        // Editor de documentos
        let currentEditorFileId = null;
        let isEditorExpanded = false;
        let isRepaginating = false;
        let docViewerState = null;      // visor fiel abierto (PDF / Word)
        let docViewerToken = 0;
        let repaginateScheduled = null;
        let scheduleRepaginateNow = () => { };
        let docEditorResizeObserver = null;
        let isEditorHidden = false;
        let savedSelection = null;
        let currentTextStyle = 'p';

        // Modal de confirmación
        let confirmCallback = null;
        let closeDocColorPopup = () => { };

        // Agenda
        let agendaPopupOpen = false;

        const folderColors = [
            '#3c6df0', '#f0623c', '#3cf06d', '#f03cb5', '#9c3cf0',
            '#f0b400', '#00c9a7', '#ff6b6b', '#ffe66d'
        ];

        let isDarkMode = localStorage.getItem('darkMode') === 'true';
        let bgColorName = localStorage.getItem('bgColor') || 'rojo';

        const bgColors = {
            rojo: { name: 'Rojo', color1: '180, 0, 0', color2: '220, 30, 30', icon: '<i class="fa-solid fa-circle" style="color: rgb(255, 0, 0);"></i>' },
            rosa: { name: 'Rosa', color1: '220, 20, 120', color2: '255, 80, 160', icon: '<i class="fa-solid fa-circle" style="color: rgb(255, 20, 147);"></i>' },
            amarillo: { name: 'Amarillo', color1: '200, 180, 0', color2: '255, 230, 50', icon: '<i class="fa-solid fa-circle" style="color: rgb(255, 215, 0);"></i>' },
            azul: { name: 'Azul', color1: '0, 80, 200', color2: '50, 130, 255', icon: '<i class="fa-solid fa-circle" style="color: rgb(0, 123, 255);"></i>' },
            verde: { name: 'Verde', color1: '0, 150, 50', color2: '50, 200, 100', icon: '<i class="fa-solid fa-circle" style="color: rgb(0, 200, 0);"></i>' },
            naranja: { name: 'Naranja', color1: '200, 100, 0', color2: '255, 150, 50', icon: '<i class="fa-solid fa-circle" style="color: rgb(255, 140, 0);"></i>' },
            morado: { name: 'Morado', color1: '100, 0, 180', color2: '150, 50, 255', icon: '<i class="fa-solid fa-circle" style="color: rgb(138, 43, 226);"></i>' },
            cian: { name: 'Cian', color1: '0, 150, 180', color2: '50, 210, 255', icon: '<i class="fa-solid fa-circle" style="color: rgb(0, 255, 255);"></i>' }
        };

        // Elementos DOM
        const calendarEl = document.getElementById('calendar');
        const currentMonthEl = document.getElementById('currentMonth');
        const calendarHeader = document.getElementById('calendarHeader');
        const headerActivator = document.querySelector('.header-activator');
        const prevMonthBtn = document.getElementById('prevMonth');
        const nextMonthBtn = document.getElementById('nextMonth');
        const todayBtn = document.getElementById('todayBtn');
        const addEventBtn = document.getElementById('addEventBtn');
        const eventModal = document.getElementById('eventModal');
        const dayEventsModal = document.getElementById('dayEventsModal');
        const editCategoryModal = document.getElementById('editCategoryModal');
        const eventForm = document.getElementById('eventForm');
        const editCategoryForm = document.getElementById('editCategoryForm');
        const dayEventsListEl = document.getElementById('dayEventsList');
        const dayEventsTitleEl = document.getElementById('dayEventsTitle');
        const addEventToDayBtn = document.getElementById('addEventToDay');
        const categorySelectorEl = document.getElementById('categorySelector');
        const newCategoryNameEl = document.getElementById('newCategoryName');
        const addCategoryBtn = document.getElementById('addCategoryBtn');
        const categoryAppearanceEl = document.getElementById('categoryAppearance');
        const categoryColorOptionEl = document.getElementById('categoryColorOption');
        const categoryImageOptionEl = document.getElementById('categoryImageOption');
        const categoryColorSelectorEl = document.getElementById('categoryColorSelector');
        const categoryImageSelectorEl = document.getElementById('categoryImageSelector');
        const categoryColorEl = document.getElementById('categoryColor');
        const categoryColorPreviewEl = document.getElementById('categoryColorPreview');
        const categoryIconUploadEl = document.getElementById('categoryIconUpload');
        const categoryIconPreviewEl = document.getElementById('categoryIconPreview');
        const categoryImageUploadEl = document.getElementById('categoryImageUpload');
        const categoryImageUrlEl = document.getElementById('categoryImageUrl');
        const categoryImagePreviewEl = document.getElementById('categoryImagePreview');
        const editCategoryIdEl = document.getElementById('editCategoryId');
        const editCategoryNameEl = document.getElementById('editCategoryName');
        const editCategoryColorEl = document.getElementById('editCategoryColor');
        const editCategoryColorPreviewEl = document.getElementById('editCategoryColorPreview');
        const editCategoryColorOptionEl = document.getElementById('editCategoryColorOption');
        const editCategoryImageOptionEl = document.getElementById('editCategoryImageOption');
        const editCategoryColorSelectorEl = document.getElementById('editCategoryColorSelector');
        const editCategoryImageSelectorEl = document.getElementById('editCategoryImageSelector');
        const editCategoryIconUploadEl = document.getElementById('editCategoryIconUpload');
        const editCategoryIconPreviewEl = document.getElementById('editCategoryIconPreview');
        const editCategoryImageUploadEl = document.getElementById('editCategoryImageUpload');
        const editCategoryImageUrlEl = document.getElementById('editCategoryImageUrl');
        const editCategoryImagePreviewEl = document.getElementById('editCategoryImagePreview');
        const searchInput = document.getElementById('searchInput');
        const searchToggle = document.getElementById('searchToggle');
        const searchContainer = document.getElementById('searchContainer');
        const closeSearch = document.getElementById('closeSearch');
        const weekdays = document.getElementById('weekdays');
        const weekdaysMobile = document.getElementById('weekdaysMobile');
        const eventStartTimeEl = document.getElementById('eventStartTime');
        const eventEndTimeEl = document.getElementById('eventEndTime');
        const eventStartEl = document.getElementById('eventStart');
        const eventEndEl = document.getElementById('eventEnd');
        const removeIconBtn = document.getElementById('removeIconBtn');
        const editRemoveIconBtn = document.getElementById('editRemoveIconBtn');
        const sidebarToggle = document.getElementById('sidebarToggle');
        const upcomingSidebar = document.getElementById('upcomingSidebar');
        const closeSidebar = document.getElementById('closeSidebar');
        const upcomingEventsList = document.getElementById('upcomingEventsList');
        const dayEventsToggle = document.getElementById('dayEventsToggle');
        const dayEventsDropdown = document.getElementById('dayEventsDropdown');
        const dayEventsDropdownList = document.getElementById('dayEventsDropdownList');
        const clearTimeButtons = document.querySelectorAll('.clear-time-btn');

        // Agenda
        const agendaPopup = document.getElementById('agendaPopup');
        const closeAgendaPopup = document.getElementById('closeAgendaPopup');
        const agendaBody = document.getElementById('agendaBody');
        const menuAgenda = document.getElementById('menuAgenda');

        // Modal de confirmación
        const confirmModal = document.getElementById('confirmModal');
        const confirmTitle = document.getElementById('confirmTitle');
        const confirmMessage = document.getElementById('confirmMessage');
        const confirmCancelBtn = document.getElementById('confirmCancelBtn');
        const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

        // Elementos del menú
        const leftMenuToggle = document.getElementById('leftMenuToggle');
        const leftMenu = document.getElementById('leftMenu');
        const menuUpcoming = document.getElementById('menuUpcoming');
        const menuAddEvent = document.getElementById('menuAddEvent');
        const menuDocuments = document.getElementById('menuDocuments');
        const menuSettings = document.getElementById('menuSettings');
        const configSubmenu = document.getElementById('configSubmenu');
        const darkModeBtn = document.getElementById('darkModeBtn');
        const bgColorBtn = document.getElementById('bgColorBtn');
        const colorSubmenu = document.getElementById('colorSubmenu');

        // Elementos de Documentos
        const documentsSidebar = document.getElementById('documentsSidebar');
        const documentsFloatButtons = document.getElementById('documentsFloatButtons');
        const closeDocumentsSidebar = document.getElementById('closeDocumentsSidebar');
        const documentsContent = document.getElementById('documentsContent');
        const createFolderBtn = document.getElementById('createFolderBtn');
        const createFileBtn = document.getElementById('createFileBtn');
        const folderModal = document.getElementById('folderModal');
        const folderForm = document.getElementById('folderForm');
        const folderModalTitle = document.getElementById('folderModalTitle');
        const folderIdEl = document.getElementById('folderId');
        const folderNameEl = document.getElementById('folderName');
        const folderColorOptions = document.getElementById('folderColorOptions');
        const folderCustomColor = document.getElementById('folderCustomColor');
        const folderIconPreview = document.getElementById('folderIconPreview');
        const folderIconUpload = document.getElementById('folderIconUpload');
        const removeFolderIconBtn = document.getElementById('removeFolderIconBtn');
        const orderOrderedBtn = document.getElementById('orderOrderedBtn');
        const orderUnorderedBtn = document.getElementById('orderUnorderedBtn');

        // Elementos del editor de documentos
        const docEditorOverlay = document.getElementById('docEditorOverlay');
        const docEditorPanel = document.getElementById('docEditorPanel');
        const docEditorTitle = document.getElementById('docEditorTitle');
        const DOC_TITLE_MAX = 200;
        docEditorTitle.addEventListener('beforeinput', (e) => {
            if (!e.data || e.inputType === 'deleteContentBackward') return;
            const sel = window.getSelection();
            const selLen = sel && docEditorTitle.contains(sel.anchorNode) ? sel.toString().length : 0;
            if (docEditorTitle.textContent.length - selLen + e.data.length > DOC_TITLE_MAX) e.preventDefault();
        });
        docEditorTitle.addEventListener('input', () => {   // pegar texto largo: se recorta
            if (docEditorTitle.textContent.length > DOC_TITLE_MAX) {
                docEditorTitle.textContent = docEditorTitle.textContent.slice(0, DOC_TITLE_MAX);
                const r = document.createRange(); r.selectNodeContents(docEditorTitle); r.collapse(false);
                const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
            }
        });
        const docEditorPages = document.getElementById('docEditorPages');
        const docEditorBody = document.getElementById('docEditorBody');
        const docEditorBodyWrap = document.getElementById('docEditorBodyWrap');
        const docEditorCustomScrollbar = document.getElementById('docEditorCustomScrollbar');
        const docEditorCustomScrollbarThumb = document.getElementById('docEditorCustomScrollbarThumb');

        // Nuevos controles del editor
        const docFormatBar = document.getElementById('docFormatBar');
        const docStyleBtn = document.getElementById('docStyleBtn');
        const docStyleMenu = document.getElementById('docStyleMenu');
        const docStyleLabel = document.getElementById('docStyleLabel');
        const docFontSizeBtn = document.getElementById('docFontSizeBtn');
        const docFontSizeMenu = document.getElementById('docFontSizeMenu');
        const docFontSizeLabel = document.getElementById('docFontSizeLabel');
        const docTextColor = document.getElementById('docTextColor');
        const docBoldBtn = document.getElementById('docBoldBtn');
        const docItalicBtn = document.getElementById('docItalicBtn');
        const docUnderlineBtn = document.getElementById('docUnderlineBtn');
        const docAlignBtn = document.getElementById('docAlignBtn');
        const docAlignMenu = document.getElementById('docAlignMenu');
        const docControlButtons = document.getElementById('docControlButtons');
        const docActionsBtn = document.getElementById('docActionsBtn');
        const docExpandControlBtn = document.getElementById('docExpandControlBtn');
        const docHideControlBtn = document.getElementById('docHideControlBtn');
        const docExitControlBtn = document.getElementById('docExitControlBtn');
        const docActionsMenu = document.getElementById('docActionsMenu');
        const docActionsSave = document.getElementById('docActionsSave');
        const docActionsSaveAs = document.getElementById('docActionsSaveAs');
        const docActionsDownload = document.getElementById('docActionsDownload');
        const docExportSubmenu = document.getElementById('docExportSubmenu');
        const exportWordOption = document.getElementById('exportWordOption');
        const exportPdfOption = document.getElementById('exportPdfOption');
        const docActionsDelete = document.getElementById('docActionsDelete');
        const docEditorRestoreTab = document.getElementById('docEditorRestoreTab');

        // Modal Guardar como
        const saveAsModal = document.getElementById('saveAsModal');
        const saveAsForm = document.getElementById('saveAsForm');
        const saveAsName = document.getElementById('saveAsName');
        const saveAsFolderPicker = document.getElementById('saveAsFolderPicker');
        const folderParentPicker = document.getElementById('folderParentPicker');

        // Selectores de iconos
        const iconPickerContainer = document.getElementById('iconPickerContainer');
        const iconPickerList = document.getElementById('iconPickerList');
        const iconPickerSearch = document.getElementById('iconPickerSearch');
        const editIconPickerContainer = document.getElementById('editIconPickerContainer');
        const editIconPickerList = document.getElementById('editIconPickerList');
        const editIconPickerSearch = document.getElementById('editIconPickerSearch');

        // Lista de iconos de Flaticon (se llenará dinámicamente desde el CDN)
        let flaticonIcons = [];

        // ============================================
        // FUNCIONES AUXILIARES
        // ============================================
        function hexToRgb(hex) {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : { r: 0, g: 0, b: 0 };
        }

        function lightenColorAlpha(hex, amount = 0.7, alpha = 0.55) {
            const rgb = hexToRgb(hex);
            const r = Math.round(rgb.r + (255 - rgb.r) * amount);
            const g = Math.round(rgb.g + (255 - rgb.g) * amount);
            const b = Math.round(rgb.b + (255 - rgb.b) * amount);
            return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
        }

        function isLightHex(hex) {
            const rgb = hexToRgb(hex);
            const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
            return luminance > 0.65;
        }

        function isLightColor(color) {
            if (color.includes('url') || color === 'image') return false;

            let r, g, b;
            if (color.startsWith('#')) {
                const hex = color.substring(1);
                r = parseInt(hex.substring(0, 2), 16);
                g = parseInt(hex.substring(2, 4), 16);
                b = parseInt(hex.substring(4, 6), 16);
            } else if (color.startsWith('rgb')) {
                const rgb = color.match(/\d+/g);
                r = parseInt(rgb[0]);
                g = parseInt(rgb[1]);
                b = parseInt(rgb[2]);
            } else {
                const lightColors = ['white', 'lightyellow', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightgreen', 'beige', 'lemonchiffon', 'linen', 'papayawhip', 'antiquewhite', 'blanchedalmond', 'bisque', 'cornsilk', 'eggshell', 'floralwhite', 'gainsboro', 'ghostwhite', 'honeydew', 'ivory', 'lavender', 'lavenderblush', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'oldlace', 'palegoldenrod', 'paleturquoise', 'peachpuff', 'seashell', 'snow', 'thistle', 'wheat', 'whitesmoke', 'azure'];
                return lightColors.includes(color.toLowerCase());
            }

            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            return luminance > 0.6;
        }

        // Luminancia relativa (WCAG) y ratio de contraste entre dos luminancias
        function relativeLuminance(rgb) {
            const f = (c) => {
                c /= 255;
                return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            };
            return 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b);
        }

        function contrastRatio(l1, l2) {
            const a = Math.max(l1, l2);
            const b = Math.min(l1, l2);
            return (a + 0.05) / (b + 0.05);
        }

        function rgbToHsl(r, g, b) {
            r /= 255; g /= 255; b /= 255;
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const d = max - min;
            const l = (max + min) / 2;
            let h = 0;
            let s = 0;
            if (d !== 0) {
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
                else if (max === g) h = (b - r) / d + 2;
                else h = (r - g) / d + 4;
                h *= 60;
            }
            return { h: h, s: s * 100, l: l * 100 };
        }

        function hslToRgb(h, s, l) {
            s /= 100;
            l /= 100;
            const k = (n) => (n + h / 30) % 12;
            const a = s * Math.min(l, 1 - l);
            const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
            return {
                r: Math.round(255 * f(0)),
                g: Math.round(255 * f(8)),
                b: Math.round(255 * f(4))
            };
        }

        // Color de texto legible sobre baseColor: una versión más clara u oscura del propio color de fondo
        // (fondo oscuro -> texto claro, fondo claro -> texto oscuro). Con imagen de fondo siempre es blanco.
        // level: 'main' (título, más marcado) | 'soft' (hora, fecha, descripción)
        function getContrastColor(baseColor, isImage = false, level = 'main') {
            if (isImage) return '#ffffff';

            const bg = hexToRgb(baseColor);
            const bgL = relativeLuminance(bg);
            const hsl = rgbToHsl(bg.r, bg.g, bg.b);

            // Fondo claro -> texto oscuro del mismo color; fondo oscuro -> texto claro del mismo color
            const bgIsLight = (0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b) / 255 > 0.6;

            const readable = level === 'readable';       // hora, ubicación, descripción
            const soft = level === 'soft' || readable;
            const minContrast = readable ? 4.5 : (soft ? 3 : 4.5);

            // Se conserva el matiz y la saturación de la categoría (mínimo 45 para que se note el color).
            // Los grises (saturación casi 0) se quedan grises.
            const sat = hsl.s < 8 ? hsl.s : Math.min(100, Math.max(hsl.s, 45));

            // Rango de luminosidad HSL a probar (de menos a más extremo)
            const start = bgIsLight
                ? (readable ? 30 : (soft ? 34 : 26))
                : (readable ? 82 : (soft ? 78 : 88));
            const end = bgIsLight ? 6 : 98;
            const dir = start < end ? 1 : -1;

            let best = hslToRgb(hsl.h, sat, start);
            for (let l = start; dir > 0 ? l <= end : l >= end; l += dir) {
                best = hslToRgb(hsl.h, sat, l);
                if (contrastRatio(relativeLuminance(best), bgL) >= minContrast) break;
            }
            return 'rgb(' + best.r + ', ' + best.g + ', ' + best.b + ')';
        }

        // Tono suave para hora / fecha / descripción
        function getSoftColor(category, textColor) {
            if (category && category.type !== 'image' && category.color) {
                return getContrastColor(category.color, false, 'soft');
            }
            return textColor; // sin categoría o con imagen: se queda como está
        }

        // Pone el icono de la categoría dentro de iconEl, teñido con "color"
        // Icono flotante de las agendas: círculo del color del texto con el icono del color de la categoría
        function applyHoverIcon(iconEl, category, textColor) {
            const catColor = (category.type !== 'image' && category.color) ? category.color : '#222222';
            const bubble = document.createElement('span');
            bubble.className = 'icon-bubble';
            if (category.icon.startsWith('<i')) bubble.style.backgroundColor = textColor;
            else bubble.classList.add('img-bubble');
            applyIconColor(bubble, category.icon, catColor);
            iconEl.appendChild(bubble);
        }

        function applyIconColor(iconEl, iconSrc, color) {
            if (!iconSrc) return;

            if (iconSrc.startsWith('<i')) {
                // Icono de fuente (Flaticon): hereda el color
                iconEl.innerHTML = iconSrc;
                iconEl.style.color = color;
                return;
            }

            // Icono de imagen: se muestra tal cual es (sin teñir), como en el listado de categorías
            const img = document.createElement('img');
            img.className = 'icon-img';
            img.src = iconSrc;
            img.alt = '';
            img.draggable = false;
            iconEl.appendChild(img);
        }

        // Devuelve una imagen (data URL) válida como máscara:
        // - con transparencia: la propia imagen
        // - opaca (JPG, PNG con fondo): se quita el color de fondo y el dibujo pasa a ser la forma
        const iconMaskCache = new Map();
        function resolveIconMask(src) {
            if (iconMaskCache.has(src)) return iconMaskCache.get(src);
            const p = (async () => {
                let url = src;
                try {
                    if (!/^data:/.test(src) && window.store && window.store.readImage) {
                        url = (await window.store.readImage(src)) || src;
                    }
                    const img = new Image();
                    img.src = url;
                    await img.decode();
                    const iw = img.naturalWidth, ih = img.naturalHeight;
                    if (!iw || !ih) return url;
                    const S = 256;
                    const sc = Math.min(S / iw, S / ih, 1);
                    const w = Math.max(1, Math.round(iw * sc)), h = Math.max(1, Math.round(ih * sc));
                    const cv = document.createElement('canvas');
                    cv.width = w; cv.height = h;
                    const ctx = cv.getContext('2d', { willReadFrequently: true });
                    ctx.drawImage(img, 0, 0, w, h);
                    const im = ctx.getImageData(0, 0, w, h);
                    const d = im.data, n = w * h;

                    // ¿Tiene transparencia de verdad?
                    let transp = 0;
                    for (let i = 3; i < d.length; i += 4) if (d[i] < 200) transp++;
                    if (transp > n * 0.005) return url;

                    // Opaca: color de fondo = el más habitual en el borde
                    const bins = new Map();
                    const addPx = (x, y) => {
                        const o = (y * w + x) * 4;
                        const key = (d[o] >> 4) + ',' + (d[o + 1] >> 4) + ',' + (d[o + 2] >> 4);
                        const b = bins.get(key) || { c: 0, r: 0, g: 0, b: 0 };
                        b.c++; b.r += d[o]; b.g += d[o + 1]; b.b += d[o + 2];
                        bins.set(key, b);
                    };
                    for (let x = 0; x < w; x++) { addPx(x, 0); addPx(x, h - 1); }
                    for (let y = 1; y < h - 1; y++) { addPx(0, y); addPx(w - 1, y); }
                    let best = null;
                    bins.forEach(b => { if (!best || b.c > best.c) best = b; });
                    const br = best.r / best.c, bg = best.g / best.c, bb = best.b / best.c;

                    // Opacidad según lo distinto que sea cada píxel del fondo
                    let solid = 0;
                    for (let i = 0; i < d.length; i += 4) {
                        const diff = Math.max(Math.abs(d[i] - br), Math.abs(d[i + 1] - bg), Math.abs(d[i + 2] - bb));
                        const a = Math.max(0, Math.min(1, (diff - 24) / 72));
                        d[i] = d[i + 1] = d[i + 2] = 0;
                        d[i + 3] = Math.round(a * 255);
                        if (a > 0.5) solid++;
                    }
                    // Si no queda dibujo (o queda todo), no se toca la imagen
                    if (solid < n * 0.01 || solid > n * 0.97) return url;
                    ctx.putImageData(im, 0, 0);
                    return cv.toDataURL('image/png');
                } catch (e) { return url; }
            })();
            iconMaskCache.set(src, p);
            return p;
        }

        // ===== Tamaño visual uniforme de los iconos de categoría =====
        // Imágenes: se mide el recuadro real del dibujo (sin márgenes transparentes) y se escala para llenar el cuadro.
        // Iconos de fuente: se ajusta el font-size según lo que mide realmente el glifo.
        const iconBoundsCache = new Map();

        function getImageIconBounds(src) {
            if (iconBoundsCache.has(src)) return iconBoundsCache.get(src);
            const p = (async () => {
                try {
                    const url = await resolveIconMask(src);
                    const img = new Image();
                    img.src = url;
                    await img.decode();
                    const S = 96;
                    const iw = img.naturalWidth || S, ih = img.naturalHeight || S;
                    const sc = Math.min(S / iw, S / ih);
                    const dw = iw * sc, dh = ih * sc;
                    const cv = document.createElement('canvas');
                    cv.width = cv.height = S;
                    const ctx = cv.getContext('2d', { willReadFrequently: true });
                    ctx.drawImage(img, (S - dw) / 2, (S - dh) / 2, dw, dh);
                    const d = ctx.getImageData(0, 0, S, S).data;
                    let x0 = S, y0 = S, x1 = -1, y1 = -1;
                    for (let y = 0; y < S; y++) {
                        for (let x = 0; x < S; x++) {
                            if (d[(y * S + x) * 4 + 3] > 20) {
                                if (x < x0) x0 = x;
                                if (x > x1) x1 = x;
                                if (y < y0) y0 = y;
                                if (y > y1) y1 = y;
                            }
                        }
                    }
                    if (x1 < 0) return null;
                    return { x0: x0 / S, y0: y0 / S, x1: (x1 + 1) / S, y1: (y1 + 1) / S };
                } catch (e) { return null; }
            })();
            iconBoundsCache.set(src, p);
            return p;
        }

        // Dibuja el glifo de un icono de fuente en un canvas y devuelve un PNG recortado
        // al dibujo real y centrado (para usarlo como máscara)
        function renderGlyphToMask(iEl) {
            const cs = getComputedStyle(iEl, '::before');
            const ch = (cs.content || '').replace(/^["']|["']$/g, '');
            if (!ch || ch === 'none' || ch === 'normal') return null;

            const S = 160;
            const cv = document.createElement('canvas');
            cv.width = cv.height = S;
            const ctx = cv.getContext('2d', { willReadFrequently: true });
            ctx.font = (cs.fontWeight || '400') + ' 100px ' + cs.fontFamily;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#000';
            ctx.fillText(ch, S / 2, S * 0.72);

            const d = ctx.getImageData(0, 0, S, S).data;
            let x0 = S, y0 = S, x1 = -1, y1 = -1;
            for (let y = 0; y < S; y++) {
                for (let x = 0; x < S; x++) {
                    if (d[(y * S + x) * 4 + 3] > 20) {
                        if (x < x0) x0 = x;
                        if (x > x1) x1 = x;
                        if (y < y0) y0 = y;
                        if (y > y1) y1 = y;
                    }
                }
            }
            if (x1 < 0) return null;

            const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
            const O = 128;
            const k = O / Math.max(bw, bh);
            const out = document.createElement('canvas');
            out.width = out.height = O;
            out.getContext('2d').drawImage(cv, x0, y0, bw, bh, (O - bw * k) / 2, (O - bh * k) / 2, bw * k, bh * k);
            return out.toDataURL('image/png');
        }

        async function normalizeCategoryIcon(iconEl, iconSrc, glyphPx) {
            try {
                // Iconos de imagen: recorta márgenes transparentes y centra
                const mask = iconEl.querySelector('.icon-mask');
                if (mask) {
                    const b = await getImageIconBounds(iconSrc);
                    if (!b) return;
                    const k = 1 / Math.max(b.x1 - b.x0, b.y1 - b.y0);
                    const dx = (b.x0 + b.x1) / 2 - 0.5;
                    const dy = (b.y0 + b.y1) / 2 - 0.5;
                    mask.style.transform =
                        'translate(' + (-dx * k * 100).toFixed(2) + '%,' + (-dy * k * 100).toFixed(2) + '%) scale(' + k.toFixed(4) + ')';
                    return;
                }

                // Iconos de fuente: se convierten en máscara recortada y centrada
                const i = iconEl.querySelector('i');
                if (i) {
                    if (document.fonts && document.fonts.ready) await document.fonts.ready;
                    const url = renderGlyphToMask(i);
                    if (!url) return;
                    const color = iconEl.style.color || getComputedStyle(iconEl).color;
                    const m = document.createElement('span');
                    m.className = 'icon-mask';
                    m.style.webkitMaskImage = 'url("' + url + '")';
                    m.style.maskImage = 'url("' + url + '")';
                    m.style.backgroundColor = color;
                    iconEl.innerHTML = '';
                    iconEl.appendChild(m);
                }
            } catch (e) { /* si falla, se queda el icono original */ }
        }

        function getContrastText(hex) {
            return isLightHex(hex) ? '#000000' : '#ffffff';
        }

        function formatShortDate(timestamp) {
            if (!timestamp) return '';
            const date = new Date(timestamp);
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            return day + '/' + month + '/' + year + ' ' + hours + ':' + minutes;
        }

        function formatDate(date) {
            const year = date.getFullYear();
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const day = date.getDate().toString().padStart(2, '0');
            return year + '-' + month + '-' + day;
        }

        function formatDateForInput(dateStr) {
            const date = new Date(dateStr);
            return formatDate(date);
        }

        // ============================================
        // ICONOS PERSONALIZADOS PARA INPUT DATE Y TIME
        // ============================================
        function setupInputIcons() {
            document.querySelectorAll('input[type="date"], input[type="time"]').forEach(input => {
                const wrapper = input.closest('.date-input-wrapper, .time-input-wrapper');
                if (!wrapper) return;

                const icon = wrapper.querySelector('.input-icon-overlay');
                if (!icon) return;

                icon.style.pointerEvents = 'auto';
                icon.style.cursor = 'pointer';

                icon.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openDateTimePicker(input);
                });
            });
        }

        // ============================================
        // SCROLL PERSONALIZADO FLOTANTE (ventana principal)
        // ============================================
        const customScrollbar = document.getElementById('custom-scrollbar');
        const customThumb = document.getElementById('custom-scrollbar-thumb');
        let isDragging = false;
        let dragStartY = 0;
        let dragStartScroll = 0;
        let scrollHideTimeout = null;

        function updateCustomScrollbar() {
            const scrollTop = window.scrollY || document.documentElement.scrollTop;
            const scrollHeight = document.documentElement.scrollHeight;
            const clientHeight = document.documentElement.clientHeight;
            const maxScroll = scrollHeight - clientHeight;

            if (maxScroll <= 0) {
                customScrollbar.classList.remove('visible');
                return;
            }

            const thumbHeight = Math.max((clientHeight / scrollHeight) * clientHeight, 40);
            const thumbTop = (scrollTop / maxScroll) * (clientHeight - thumbHeight);

            customThumb.style.height = thumbHeight + 'px';
            customThumb.style.top = thumbTop + 'px';

            customScrollbar.classList.add('visible');

            if (!isDragging) {
                clearTimeout(scrollHideTimeout);
                scrollHideTimeout = setTimeout(() => {
                    customScrollbar.classList.remove('visible');
                }, 1500);
            }
        }

        document.addEventListener('mousemove', (e) => {
            if (e.clientX > window.innerWidth - 20) {
                customScrollbar.classList.add('visible');
                clearTimeout(scrollHideTimeout);
            }
        });

        document.addEventListener('mouseleave', () => {
            if (!isDragging) {
                scrollHideTimeout = setTimeout(() => {
                    customScrollbar.classList.remove('visible');
                }, 1500);
            }
        });

        window.addEventListener('scroll', updateCustomScrollbar, { passive: true });
        window.addEventListener('resize', updateCustomScrollbar);

        customThumb.addEventListener('mousedown', (e) => {
            isDragging = true;
            dragStartY = e.clientY;
            dragStartScroll = window.scrollY || document.documentElement.scrollTop;
            customThumb.classList.add('dragging');
            customScrollbar.classList.add('visible');
            clearTimeout(scrollHideTimeout);
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const deltaY = e.clientY - dragStartY;
            const scrollHeight = document.documentElement.scrollHeight;
            const clientHeight = document.documentElement.clientHeight;
            const maxScroll = scrollHeight - clientHeight;
            const thumbHeight = customThumb.offsetHeight;
            const trackHeight = clientHeight - thumbHeight;

            if (trackHeight <= 0) return;

            const scrollDelta = (deltaY / trackHeight) * maxScroll;
            window.scrollTo({
                top: dragStartScroll + scrollDelta,
                behavior: 'auto'
            });
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                customThumb.classList.remove('dragging');
                scrollHideTimeout = setTimeout(() => {
                    customScrollbar.classList.remove('visible');
                }, 1500);
            }
        });

        customScrollbar.addEventListener('mousedown', (e) => {
            if (e.target === customThumb) return;

            const clickY = e.clientY;
            const thumbTop = customThumb.offsetTop;
            const thumbHeight = customThumb.offsetHeight;
            const clientHeight = document.documentElement.clientHeight;

            if (clickY < thumbTop) {
                window.scrollBy({ top: -clientHeight * 0.9, behavior: 'smooth' });
            } else if (clickY > thumbTop + thumbHeight) {
                window.scrollBy({ top: clientHeight * 0.9, behavior: 'smooth' });
            }
        });

        window.addEventListener('load', updateCustomScrollbar);

        // ============================================
        // SCROLL PERSONALIZADO DEL EDITOR
        // ============================================
        let isEditorDragging = false;
        let editorDragStartY = 0;
        let editorDragStartScroll = 0;
        let editorScrollHideTimeout = null;

        function updateEditorCustomScrollbar() {
            const scrollTop = docEditorBody.scrollTop;
            const scrollHeight = docEditorBody.scrollHeight;
            const clientHeight = docEditorBody.clientHeight;
            const maxScroll = scrollHeight - clientHeight;

            if (maxScroll <= 0) {
                docEditorCustomScrollbar.classList.remove('visible');
                return;
            }

            const thumbHeight = Math.max((clientHeight / scrollHeight) * clientHeight, 40);
            const thumbTop = (scrollTop / maxScroll) * (clientHeight - thumbHeight);

            docEditorCustomScrollbarThumb.style.height = thumbHeight + 'px';
            docEditorCustomScrollbarThumb.style.top = thumbTop + 'px';

            docEditorCustomScrollbar.classList.add('visible');

            if (!isEditorDragging) {
                clearTimeout(editorScrollHideTimeout);
                editorScrollHideTimeout = setTimeout(() => {
                    docEditorCustomScrollbar.classList.remove('visible');
                }, 1500);
            }
        }

        docEditorBodyWrap.addEventListener('mousemove', (e) => {
            if (e.clientX > docEditorBodyWrap.getBoundingClientRect().right - 20) {
                docEditorCustomScrollbar.classList.add('visible');
                clearTimeout(editorScrollHideTimeout);
            }
        });

        docEditorBodyWrap.addEventListener('mouseleave', () => {
            if (!isEditorDragging) {
                editorScrollHideTimeout = setTimeout(() => {
                    docEditorCustomScrollbar.classList.remove('visible');
                }, 1500);
            }
        });

        docEditorBody.addEventListener('scroll', updateEditorCustomScrollbar, { passive: true });

        docEditorCustomScrollbarThumb.addEventListener('mousedown', (e) => {
            isEditorDragging = true;
            editorDragStartY = e.clientY;
            editorDragStartScroll = docEditorBody.scrollTop;
            docEditorCustomScrollbarThumb.classList.add('dragging');
            docEditorCustomScrollbar.classList.add('visible');
            clearTimeout(editorScrollHideTimeout);
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isEditorDragging) return;

            const deltaY = e.clientY - editorDragStartY;
            const scrollHeight = docEditorBody.scrollHeight;
            const clientHeight = docEditorBody.clientHeight;
            const maxScroll = scrollHeight - clientHeight;
            const thumbHeight = docEditorCustomScrollbarThumb.offsetHeight;
            const trackHeight = clientHeight - thumbHeight;

            if (trackHeight <= 0) return;

            const scrollDelta = (deltaY / trackHeight) * maxScroll;
            docEditorBody.scrollTop = editorDragStartScroll + scrollDelta;
        });

        document.addEventListener('mouseup', () => {
            if (isEditorDragging) {
                isEditorDragging = false;
                docEditorCustomScrollbarThumb.classList.remove('dragging');
                editorScrollHideTimeout = setTimeout(() => {
                    docEditorCustomScrollbar.classList.remove('visible');
                }, 1500);
            }
        });

        docEditorCustomScrollbar.addEventListener('mousedown', (e) => {
            if (e.target === docEditorCustomScrollbarThumb) return;

            const clickY = e.clientY;
            const thumbTop = docEditorCustomScrollbarThumb.offsetTop;
            const thumbHeight = docEditorCustomScrollbarThumb.offsetHeight;
            const clientHeight = docEditorBody.clientHeight;

            if (clickY < thumbTop) {
                docEditorBody.scrollBy({ top: -clientHeight * 0.9, behavior: 'smooth' });
            } else if (clickY > thumbTop + thumbHeight) {
                docEditorBody.scrollBy({ top: clientHeight * 0.9, behavior: 'smooth' });
            }
        });

        // ============================================
        // FUNCIONES DE CONFIGURACIÓN
        // ============================================
        function applyDarkMode(enabled) {
            if (enabled) {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.remove('dark-mode');
            }
            localStorage.setItem('darkMode', enabled);
            isDarkMode = enabled;

            darkModeBtn.innerHTML = enabled
                ? '<i class="fi fi-sr-sun"></i>'
                : '<i class="fi fi-ss-moon"></i>';

            // El tooltip indica el modo al que se va a cambiar
            const nextModeLabel = enabled ? 'Modo claro' : 'Modo oscuro';
            darkModeBtn.setAttribute('data-tooltip', nextModeLabel);
            darkModeBtn.setAttribute('aria-label', nextModeLabel);
            darkModeBtn.removeAttribute('title');

            if (window.windowControls && window.windowControls.setOverlayTheme) {
                window.windowControls.setOverlayTheme(enabled);
            }
        }

        function applyBgColor(colorName) {
            const color = bgColors[colorName] || bgColors.rojo;
            document.documentElement.style.setProperty('--bg-anim-color', color.color1);
            document.documentElement.style.setProperty('--bg-anim-color-2', color.color2);
            localStorage.setItem('bgColor', colorName);
            bgColorName = colorName;

            document.querySelectorAll('.color-submenu-item').forEach(item => {
                item.classList.toggle('selected', item.dataset.color === colorName);
            });
        }

        function renderColorSubmenu() {
            colorSubmenu.innerHTML = '';
            Object.keys(bgColors).forEach(key => {
                const color = bgColors[key];
                const item = document.createElement('button');
                item.className = 'color-submenu-item';
                item.dataset.color = key;
                item.title = color.name;
                item.innerHTML = color.icon;
                if (key === bgColorName) {
                    item.classList.add('selected');
                }
                item.addEventListener('click', () => {
                    applyBgColor(key);
                });
                colorSubmenu.appendChild(item);
            });
        }

        // ============================================
        // INICIALIZACIÓN
        // ============================================
        function init() {
            applyDarkMode(isDarkMode);
            applyBgColor(bgColorName);
            renderColorSubmenu();

            // Cargar iconos de forma asíncrona
            loadFlaticonIcons();

            renderCalendar();
            renderCategorySelector();
            setupEventListeners();
            setupCalendarDelegation();
            new ResizeObserver(justifyCategoryRows).observe(categorySelectorEl);
            updateAddCategoryButton();
            loadUpcomingEvents();

            eventStartTimeEl.value = '';
            eventEndTimeEl.value = '';

            setupHeaderBehavior();
            setupClearTimeButtons();
            setupInputIcons();
            setupDateTimePickers();
            setupColorPickers();

            renderDocuments();
            renderFolderColorOptions();
            updateOrderToggleUI();
            setupEditorEvents();
            setupFormatBarEvents();

            setTimeout(updateCustomScrollbar, 100);
            updateSubmenuPositions();
        }

        // Muestra cada X solo si su campo tiene valor
        function syncClearTimeButtons() {
            clearTimeButtons.forEach(btn => {
                const t = document.getElementById(btn.getAttribute('data-target'));
                btn.style.display = (t && t.value) ? '' : 'none';
            });
        }

        function setupClearTimeButtons() {
            clearTimeButtons.forEach(button => {
                button.addEventListener('click', function () {
                    const targetId = this.getAttribute('data-target');
                    const targetInput = document.getElementById(targetId);
                    if (targetInput) {
                        targetInput.value = '';
                        validateTimes();
                        validateDates();
                        // Avisa a los demás controles (p. ej. al quitar la fecha final reaparece "Repetir")
                        targetInput.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
            });

            // La X se actualiza al escribir/elegir y también cuando el código cambia el valor (editar evento, limpiar formulario...)
            const valueDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
            clearTimeButtons.forEach(btn => {
                const t = document.getElementById(btn.getAttribute('data-target'));
                if (!t || t._clearHooked) return;
                t._clearHooked = true;
                Object.defineProperty(t, 'value', {
                    configurable: true,
                    get() { return valueDesc.get.call(this); },
                    set(v) { valueDesc.set.call(this, v); syncClearTimeButtons(); }
                });
                t.addEventListener('input', syncClearTimeButtons);
                t.addEventListener('change', syncClearTimeButtons);
            });
            syncClearTimeButtons();
        }

        // ============================================
        // SELECTOR DE ICONOS (flaticon)
        // ============================================
        const ICON_CDN_VERSION = '4.0.0';
        const ICON_CACHE_KEY = 'flaticonIconsCache_' + ICON_CDN_VERSION;
        const ICON_PAGE_SIZE = 300;
        const ICON_PREFIX_LEN = 9; // longitud de 'fi fi-br-'

        const ICON_STYLE_URLS = [
            'https://cdn-uicons.flaticon.com/' + ICON_CDN_VERSION + '/uicons-bold-rounded/css/uicons-bold-rounded.css',
            'https://cdn-uicons.flaticon.com/' + ICON_CDN_VERSION + '/uicons-solid-rounded/css/uicons-solid-rounded.css'
        ];

        const ICON_FALLBACK_NAMES = [
            'add', 'bell', 'calendar', 'check', 'clock', 'cross', 'document', 'download', 'edit', 'envelope',
            'folder', 'heart', 'home', 'info', 'link', 'lock', 'music', 'pencil', 'phone', 'play',
            'plus', 'search', 'settings', 'star', 'tag', 'trash', 'user', 'video-camera', 'volume', 'wifi'
        ];

        function getFallbackIcons() {
            const out = [];
            ['br', 'sr'].forEach(p => ICON_FALLBACK_NAMES.forEach(n => out.push('fi fi-' + p + '-' + n)));
            return out;
        }

        // Estado independiente por cada selector (alta y edición)
        const pickerStates = new WeakMap();

        function getPickerState(listEl) {
            let st = pickerStates.get(listEl);
            if (!st) {
                st = { term: '', style: 'all', limit: ICON_PAGE_SIZE, selected: null, countEl: null, searchEl: null, chips: [] };
                pickerStates.set(listEl, st);
            }
            return st;
        }

        function refreshAllIconPickers() {
            renderIconPicker(iconPickerList);
            renderIconPicker(editIconPickerList);
        }

        async function loadFlaticonIcons() {
            // 0) Lista incluida en local (vendor/uicons/icon-list.js): no necesita red
            if (Array.isArray(window.FLATICON_ICON_LIST) && window.FLATICON_ICON_LIST.length > 0) {
                flaticonIcons = window.FLATICON_ICON_LIST.slice();
                refreshAllIconPickers();
                return;
            }

            // 1) Caché local: arranque instantáneo y funciona sin red
            try {
                const cached = JSON.parse(localStorage.getItem(ICON_CACHE_KEY));
                if (Array.isArray(cached) && cached.length > 0) {
                    flaticonIcons = cached;
                    refreshAllIconPickers();
                    return;
                }
            } catch (e) { /* caché corrupta: se ignora */ }

            // 2) Descarga desde el CDN
            try {
                const responses = await Promise.all(ICON_STYLE_URLS.map(url => fetch(url, { cache: 'force-cache' })));
                const texts = await Promise.all(responses.map(r => {
                    if (!r.ok) throw new Error('HTTP ' + r.status + ' en ' + r.url);
                    return r.text();
                }));

                const set = new Set();
                texts.forEach(css => {
                    for (const m of css.matchAll(/\.fi-(br|sr)-([\w-]+)::?before/g)) {
                        set.add('fi fi-' + m[1] + '-' + m[2]);
                    }
                });

                if (set.size === 0) throw new Error('No se encontró ningún icono en el CSS');

                flaticonIcons = [...set].sort();
                console.log('Se cargaron ' + flaticonIcons.length + ' iconos de Flaticon.');

                try {
                    localStorage.setItem(ICON_CACHE_KEY, JSON.stringify(flaticonIcons));
                } catch (e) {
                    console.warn('No se pudo guardar la caché de iconos:', e);
                }
            } catch (error) {
                console.error('Error al cargar los iconos desde el CDN (se usa la lista reducida):', error);
                flaticonIcons = getFallbackIcons(); // no se cachea
            }

            refreshAllIconPickers();
        }

        function renderIconPicker(listEl, keepScroll = false) {
            const st = getPickerState(listEl);
            const scroller = listEl.parentElement;
            const prevScroll = scroller ? scroller.scrollTop : 0;

            if (flaticonIcons.length === 0) {
                listEl.innerHTML = '<div class="icon-picker-empty">Cargando iconos...</div>';
                return;
            }

            const term = st.term;
            const filtered = flaticonIcons.filter(c => {
                if (st.style !== 'all' && !c.startsWith('fi fi-' + st.style + '-')) return false;
                return !term || c.slice(ICON_PREFIX_LEN).includes(term);
            });

            if (term) {
                filtered.sort((a, b) => a.slice(ICON_PREFIX_LEN).localeCompare(b.slice(ICON_PREFIX_LEN)));
            }

            const frag = document.createDocumentFragment();

            filtered.slice(0, st.limit).forEach(iconClass => {
                const el = document.createElement('div');
                el.className = 'icon-picker-item' + (iconClass === st.selected ? ' selected' : '');
                el.dataset.icon = iconClass;
                el.title = iconClass.slice(ICON_PREFIX_LEN);
                el.innerHTML = '<i class="' + iconClass + '"></i>';
                frag.appendChild(el);
            });

            if (filtered.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'icon-picker-empty';
                empty.textContent = 'Sin resultados';
                frag.appendChild(empty);
            } else if (filtered.length > st.limit) {
                const more = document.createElement('div');
                more.className = 'icon-picker-more';
                more.textContent = 'Mostrar más (' + (filtered.length - st.limit).toLocaleString('es-ES') + ' restantes)';
                frag.appendChild(more);
            }

            listEl.innerHTML = '';
            listEl.appendChild(frag);

            if (st.countEl) {
                st.countEl.textContent = filtered.length.toLocaleString('es-ES') + ' iconos';
            }

            if (scroller) scroller.scrollTop = keepScroll ? prevScroll : 0;
        }

        function setupIconPicker(listEl, searchEl, previewEl, onPick) {
            const st = getPickerState(listEl);
            st.searchEl = searchEl;

            // Barra fija con buscador + filtros (se construye por JS, no hace falta tocar el HTML)
            const toolbar = document.createElement('div');
            toolbar.className = 'icon-picker-toolbar';
            searchEl.parentNode.insertBefore(toolbar, searchEl);
            toolbar.appendChild(searchEl);

            const row = document.createElement('div');
            row.className = 'icon-picker-filters';

            [['all', 'Todos'], ['br', 'Bold'], ['sr', 'Solid']].forEach(([value, label]) => {
                const chip = document.createElement('div');
                chip.className = 'icon-chip' + (value === st.style ? ' active' : '');
                chip.dataset.style = value;
                chip.textContent = label;
                chip.addEventListener('click', () => {
                    st.style = value;
                    st.limit = ICON_PAGE_SIZE;
                    st.chips.forEach(c => c.classList.toggle('active', c === chip));
                    renderIconPicker(listEl);
                });
                st.chips.push(chip);
                row.appendChild(chip);
            });

            st.countEl = document.createElement('span');
            st.countEl.className = 'icon-count';
            row.appendChild(st.countEl);
            toolbar.appendChild(row);

            // Búsqueda con debounce
            let timer;
            searchEl.addEventListener('input', (e) => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    st.term = e.target.value.toLowerCase().trim();
                    st.limit = ICON_PAGE_SIZE;
                    renderIconPicker(listEl);
                }, 150);
            });

            // UN solo listener para todos los iconos (delegación)
            listEl.addEventListener('click', (e) => {
                if (e.target.closest('.icon-picker-more')) {
                    st.limit += ICON_PAGE_SIZE;
                    renderIconPicker(listEl, true);
                    return;
                }
                const item = e.target.closest('.icon-picker-item');
                if (!item) return;

                listEl.querySelectorAll('.icon-picker-item.selected').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                st.selected = item.dataset.icon;

                const html = '<i class="' + st.selected + '"></i>';
                previewEl.innerHTML = html;
                onPick(html);
            });

            renderIconPicker(listEl);
        }

        // Marca como seleccionado el icono que ya tiene una categoría (al editar)
        function setPickerSelection(listEl, iconHtml) {
            const st = getPickerState(listEl);
            const m = typeof iconHtml === 'string' ? iconHtml.match(/class="([^"]+)"/) : null;
            st.selected = m ? m[1] : null;
            st.term = '';
            st.style = 'all';
            st.limit = ICON_PAGE_SIZE;
            if (st.searchEl) st.searchEl.value = '';
            st.chips.forEach(c => c.classList.toggle('active', c.dataset.style === 'all'));

            // Si el icono seleccionado queda fuera del límite inicial, amplía lo justo para que se vea
            if (st.selected) {
                const idx = flaticonIcons.indexOf(st.selected);
                if (idx >= st.limit) st.limit = idx + 1;
            }
            renderIconPicker(listEl);

            if (st.selected) {
                const el = listEl.querySelector('.icon-picker-item.selected');
                if (el) el.scrollIntoView({ block: 'nearest' });
            }
        }

        function clearPickerSelection(listEl) {
            const st = getPickerState(listEl);
            st.selected = null;
            listEl.querySelectorAll('.icon-picker-item.selected').forEach(el => el.classList.remove('selected'));
        }

        function loadUpcomingEvents() {
            withListLoader(upcomingEventsList, events.length, 250, 'Cargando eventos…', loadUpcomingEventsNow);
        }
        function loadUpcomingEventsNow() {
            upcomingEventsList.innerHTML = '';

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const upcomingEvents = events.flatMap(ev => eventOccurrences(ev, formatDate(today), addDaysStr(formatDate(today), 120))).filter(event => {
                if (isEventDone(event)) return false;
                const eventStart = new Date(event.start);
                eventStart.setHours(0, 0, 0, 0);
                return eventStart >= today;
            });

            upcomingEvents.sort((a, b) => {
                const dateA = new Date(a.start);
                const dateB = new Date(b.start);
                return dateA - dateB;
            });

            const eventsToShow = upcomingEvents.slice(0, 10);

            if (eventsToShow.length === 0) {
                upcomingEventsList.innerHTML = '<div class="ev-empty"><i class="fi fi-sr-calendar"></i><br>No hay eventos próximos</div>';
                return;
            }

            eventsToShow.forEach(event => {
                const category = event.categoryId ? categories.find(c => c.id === event.categoryId) : null;
                const eventDate = new Date(event.start);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());

                let dateText = '';
                if (eventDateOnly.getTime() === today.getTime()) {
                    dateText = 'Hoy';
                } else if (eventDateOnly.getTime() === today.getTime() + 86400000) {
                    dateText = 'Mañana';
                } else {
                    const options = { weekday: 'short', month: 'short', day: 'numeric' };
                    dateText = eventDate.toLocaleDateString('es-ES', options);
                }

                const eventElement = document.createElement('div');
                eventElement.className = 'upcoming-event-item';

                let textColor = '#ffffff'; // Por defecto blanco
                let isImage = false;

                if (!event.categoryId) {
                    eventElement.classList.add('no-category');
                    textColor = 'var(--text-color)';
                } else if (category) {
                    if (category.type === 'image' && category.backgroundImage) {
                        eventElement.style.backgroundImage = 'url(' + category.backgroundImage + ')';
                        eventElement.style.backgroundSize = 'cover';
                        eventElement.style.backgroundPosition = 'center';
                        eventElement.style.textShadow = '0 0px 7px rgba(0, 0, 0, 0.7)';
                        isImage = true;
                        textColor = '#ffffff';
                        const overlay = document.createElement('div');
                        overlay.className = 'event-item-overlay';
                        eventElement.appendChild(overlay);
                    } else {
                        eventElement.style.backgroundColor = category.color;
                        textColor = getContrastColor(category.color, false);
                        eventElement.style.color = textColor;
                    }
                }

                const softColor = getSoftColor(category, textColor);

                const content = document.createElement('div');
                content.className = 'upcoming-event-item-content';

                const iconDiv = document.createElement('div');
                iconDiv.className = 'upcoming-event-item-icon';
                if (category && category.icon) {
                    applyIconColor(iconDiv, category.icon, textColor);
                } else {
                    iconDiv.classList.add('no-icon');
                }

                const info = document.createElement('div');
                info.className = 'upcoming-event-item-info';

                const timeText = event.startTime && event.endTime
                    ? event.startTime.substring(0, 5) + ' - ' + event.endTime.substring(0, 5)
                    : '';

                // Hoy / Mañana / "Dom, 18 oct" (con la primera letra en mayúscula)
                const dayLabel = dateText.charAt(0).toUpperCase() + dateText.slice(1);
                const upTime = event.startTime
                    ? event.startTime.substring(0, 5) + (event.endTime ? ' - ' + event.endTime.substring(0, 5) : '')
                    : '';
                info.innerHTML =
                    '<div class="upcoming-event-item-title" style="color: ' + textColor + ';">' + escapeHtml(event.title) + '</div>' +
                    '<div class="upcoming-event-item-date has-extra" style="color: ' + softColor + ';"><span>' + escapeHtml(dayLabel) + '</span>' +
                    (upTime ? '<span class="ev-dot">·</span><span>' + upTime + '</span>' : '') +
                    (event.important ? '<span class="ev-dot">·</span><span class="ev-imp">Importante</span>' : '') + '</div>';

                content.appendChild(iconDiv);
                content.appendChild(info);

                // Sin botones de editar / borrar: aquí solo se consultan los eventos
                eventElement.appendChild(content);

                eventElement.addEventListener('click', () => {
                    const eventStartDate = new Date(event.start);
                    currentDate = new Date(eventStartDate.getFullYear(), eventStartDate.getMonth(), 1);
                    renderCalendar();
                    closeSidebarFunc();

                    const dateStr = formatDate(eventStartDate);
                    setTimeout(() => {
                        const dayElement = document.querySelector('.calendar-day[data-date="' + dateStr + '"]');
                        if (dayElement) {
                            dayElement.style.boxShadow = '0 0 0 3px var(--primary-color)';
                            setTimeout(() => {
                                dayElement.style.boxShadow = '';
                            }, 2000);
                        }
                    }, 100);
                });

                upcomingEventsList.appendChild(eventElement);
            });
        }

        function loadDayEventsDropdown(dateStr) {
            dayEventsDropdownList.innerHTML = '';

            if (!dateStr) return;

            const dayEvents = getEventsForDay(dateStr).map(e => dayView(e, dateStr));

            if (dayEvents.length === 0) {
                dayEventsDropdownList.innerHTML =
                    '<div class="no-events-dropdown">' +
                    '<p>No hay eventos para este día</p>' +
                    '</div>';
                return;
            }

            const sortedEvents = dayEvents.sort((a, b) => {
                const timeA = a.startTime || '23:59';
                const timeB = b.startTime || '23:59';
                return timeA.localeCompare(timeB);
            });

            sortedEvents.forEach(event => {
                const eventElement = document.createElement('div');
                eventElement.className = 'dropdown-event-item';
                if (event.important) {
                    eventElement.style.borderLeftColor = '#ff0000';
                }

                const timeText = event.timeLabel || (event.startTime && event.endTime
                    ? event.startTime.substring(0, 5) + ' - ' + event.endTime.substring(0, 5)
                    : '');

                eventElement.innerHTML =
                    (timeText ? '<div class="dropdown-event-time">' + timeText + '</div>' : '') +
                    '<div class="dropdown-event-title">' + escapeHtml(event.title) + '</div>';

                const cat = event.categoryId ? categories.find(c => c.id === event.categoryId) : null;
                if (cat) {
                    let tc = '#ffffff';
                    if (cat.type === 'image' && cat.backgroundImage) {
                        eventElement.style.backgroundImage = 'url(' + cat.backgroundImage + ')';
                        eventElement.style.backgroundSize = 'cover';
                        eventElement.style.backgroundPosition = 'center';
                        eventElement.style.textShadow = '0 0 7px rgba(0, 0, 0, 0.7)';
                    } else {
                        eventElement.style.backgroundColor = cat.color;
                        tc = getContrastColor(cat.color, false);
                    }
                    eventElement.style.color = tc;
                    const tEl = eventElement.querySelector('.dropdown-event-time');
                    if (tEl) tEl.style.color = getSoftColor(cat, tc);
                } else {
                    eventElement.classList.add('no-category');
                }

                dayEventsDropdownList.appendChild(eventElement);
            });
        }

        function toggleDayEventsDropdown() {
            const dateStr = eventStartEl.value;
            if (dateStr) {
                loadDayEventsDropdown(dateStr);
                dayEventsDropdown.classList.toggle('visible');
            }
        }

        function closeDayEventsDropdown() {
            dayEventsDropdown.classList.remove('visible');
        }

        function closeSidebarFunc() {
            sidebarOpen = false;
            upcomingSidebar.classList.remove('open');
            if (sidebarToggle) sidebarToggle.classList.remove('open');
        }

        function toggleLeftMenu() {
            leftMenuOpen = !leftMenuOpen;
            leftMenu.classList.toggle('open', leftMenuOpen);

            if (!leftMenuOpen) {
                closeConfigSubmenu();
                closeColorSubmenu();
            }
        }

        function closeLeftMenu() {
            leftMenuOpen = false;
            leftMenu.classList.remove('open');
            closeConfigSubmenu();
            closeColorSubmenu();
        }

        const SUBMENU_GAP = 12; // distancia fija entre el menú y el submenú

        function updateSubmenuPositions() {
            const menuRect = leftMenu.getBoundingClientRect();

            // Submenú de configuración: siempre SUBMENU_GAP píxeles por debajo del menú
            const configTop = menuRect.bottom + SUBMENU_GAP;
            document.documentElement.style.setProperty('--config-top', configTop + 'px');

            // Submenú de colores: siempre a la altura del primer menú (alineado con su parte superior)
            // y sin salirse de la pantalla
            const h = colorSubmenu.offsetHeight;
            let top = menuRect.top;
            top = Math.min(top, window.innerHeight - h - 12);
            top = Math.max(top, 12);
            colorSubmenu.style.top = top + 'px';
        }

        function toggleConfigSubmenu() {
            updateSubmenuPositions();
            configSubmenuOpen = !configSubmenuOpen;
            configSubmenu.classList.toggle('open', configSubmenuOpen);

            if (!configSubmenuOpen) {
                closeColorSubmenu();
            }
        }

        function closeConfigSubmenu() {
            configSubmenuOpen = false;
            configSubmenu.classList.remove('open');
            closeColorSubmenu();
            // El menú de Importar / Exportar se va junto con el submenú
            if (document.getElementById('ioMenu')) closeIoMenu();
        }

        function toggleColorSubmenu() {
            updateSubmenuPositions();
            colorSubmenuOpen = !colorSubmenuOpen;
            colorSubmenu.classList.toggle('open', colorSubmenuOpen);
        }

        function closeColorSubmenu() {
            colorSubmenuOpen = false;
            colorSubmenu.classList.remove('open');
        }

        function setupHeaderBehavior() {
            headerActivator.addEventListener('click', () => {
                showHeader();
                headerActivator.classList.add('active');
            });

            calendarHeader.addEventListener('mouseenter', () => {
                if (!isSearchActive) {
                    showHeader();

                    if (headerHideTimeout) {
                        clearTimeout(headerHideTimeout);
                        headerHideTimeout = null;
                    }
                }
            });

            calendarHeader.addEventListener('mouseleave', (e) => {
                if (!isSearchActive) {
                    const relatedTarget = e.relatedTarget;
                    if (!calendarHeader.contains(relatedTarget)) {
                        hideHeaderWithAnimation();
                    }
                }
            });
        }

        function showHeader() {
            if (!headerVisible) {
                calendarHeader.classList.add('visible');
                document.body.classList.add('header-open');
                headerVisible = true;
                headerActivator.classList.add('active');
            }

            if (headerHideTimeout) {
                clearTimeout(headerHideTimeout);
                headerHideTimeout = null;
            }
        }

        function hideHeaderWithAnimation() {
            if (headerVisible) {
                calendarHeader.classList.remove('visible');
                document.body.classList.remove('header-open');
                headerVisible = false;
                headerActivator.classList.remove('active');
            }
        }

        const HOLIDAYS = {
            '1-14': { key: 'valentine', name: 'San Valentín' },
            '9-31': { key: 'halloween', name: 'Halloween' },
            '11-25': { key: 'christmas', name: 'Navidad' }
        };

        function getHoliday(dateStr) {
            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
            if (!m) return null;
            return HOLIDAYS[(parseInt(m[2], 10) - 1) + '-' + parseInt(m[3], 10)] || null;
        }

        function updateAddCategoryButton() {
            const name = newCategoryNameEl.value.trim();
            addCategoryBtn.disabled = !name;
        }

        function setupEventListeners() {
            prevMonthBtn.addEventListener('click', () => {
                currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
                renderCalendar();
                setTimeout(updateCustomScrollbar, 50);
            });

            nextMonthBtn.addEventListener('click', () => {
                currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
                renderCalendar();
                setTimeout(updateCustomScrollbar, 50);
            });

            todayBtn.addEventListener('click', () => {
                currentDate = new Date();
                renderCalendar();
                exitSearchMode();
                setTimeout(updateCustomScrollbar, 50);
            });

            addEventBtn.addEventListener('click', () => {
                showEventModal();
            });

            document.getElementById('closeEventModal').addEventListener('click', () => {
                eventModal.style.display = 'none';
                resetCategoryAppearance();
                closeDayEventsDropdown();
            });

            document.getElementById('closeDayEventsModal').addEventListener('click', () => {
                dayEventsModal.style.display = 'none';
                focusDay(selectedDay);
            });

            document.getElementById('closeEditCategoryModal').addEventListener('click', () => {
                editCategoryModal.style.display = 'none';
                if (previousModal === 'event') {
                    eventModal.style.display = 'flex';
                }
                previousModal = null;
            });

            eventForm.addEventListener('submit', handleEventSubmit);
            editCategoryForm.addEventListener('submit', handleEditCategorySubmit);

            addEventToDayBtn.addEventListener('click', () => {
                dayEventsModal.style.display = 'none';
                showEventModal(selectedDay);
            });

            addCategoryBtn.addEventListener('click', handleAddCategory);
            newCategoryNameEl.addEventListener('input', updateAddCategoryButton);

            categoryColorOptionEl.addEventListener('click', () => {
                setCategoryAppearanceType('color');
            });

            categoryImageOptionEl.addEventListener('click', () => {
                setCategoryAppearanceType('image');
            });

            categoryColorEl.addEventListener('input', updateCategoryColorPreview);
            categoryIconUploadEl.addEventListener('change', handleCategoryIconUpload);
            categoryImageUploadEl.addEventListener('change', handleCategoryImageUpload);
            categoryImageUrlEl.addEventListener('input', updateCategoryImagePreviewFromUrl);

            editCategoryColorOptionEl.addEventListener('click', () => {
                setEditCategoryAppearanceType('color');
            });

            editCategoryImageOptionEl.addEventListener('click', () => {
                setEditCategoryAppearanceType('image');
            });

            editCategoryColorEl.addEventListener('input', () => {
                editCategoryColorPreviewEl.style.backgroundColor = editCategoryColorEl.value;
            });

            editCategoryIconUploadEl.addEventListener('change', handleEditCategoryIconUpload);
            editCategoryImageUploadEl.addEventListener('change', handleEditCategoryImageUpload);
            editCategoryImageUrlEl.addEventListener('input', updateEditCategoryImagePreviewFromUrl);

            // Buscadores de iconos
            setupIconPicker(iconPickerList, iconPickerSearch, categoryIconPreviewEl, (html) => {
                categoryUploadedIcon = html;
                categoryIconUploadEl.value = '';
            });
            setupIconPicker(editIconPickerList, editIconPickerSearch, editCategoryIconPreviewEl, () => {
                editCategoryIconUploadEl.value = '';
            });

            // Búsqueda en vivo: se actualiza con cada letra que se escribe
            searchInput.addEventListener('input', debounce(searchEvents, 150));
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                }
            });

            searchToggle.addEventListener('click', () => {
                searchContainer.classList.toggle('visible');
                if (searchContainer.classList.contains('visible')) {
                    searchInput.focus();
                    isSearchActive = true;
                    showHeader();
                } else {
                    isSearchActive = false;
                    exitSearchMode();
                }
            });

            closeSearch.addEventListener('click', () => {
                searchContainer.classList.remove('visible');
                isSearchActive = false;
                currentDate = new Date();   // vuelve siempre al mes de hoy
                exitSearchMode();

                // Centra el día de hoy en pantalla (espera a que acabe la animación del buscador)
                setTimeout(() => {
                    const todayEl = calendarEl.querySelector('.calendar-day.today');
                    if (todayEl) todayEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 350);
            });

            document.getElementById('eventTitle').addEventListener('input', e => { if (e.target.value.trim()) clearFieldError(e.target); });
            document.getElementById('eventRepeatUntil').addEventListener('change', validateDates);
            document.getElementById('eventRepeat').addEventListener('change', validateDates);
            eventStartTimeEl.addEventListener('change', validateTimes);
            eventEndTimeEl.addEventListener('change', validateTimes);
            eventStartEl.addEventListener('change', validateDates);
            eventEndEl.addEventListener('change', validateDates);

            removeIconBtn.addEventListener('click', () => {
                categoryUploadedIcon = null;
                categoryIconPreviewEl.innerHTML = '<div class="no-icon-placeholder">Vista previa del icono</div>';
                categoryIconUploadEl.value = '';
                // También quitar la selección del selector de iconos
                clearPickerSelection(iconPickerList);
            });

            editRemoveIconBtn.addEventListener('click', () => {
                editCategoryIconPreviewEl.innerHTML = '<div class="no-icon-placeholder">Vista previa del icono</div>';
                editCategoryIconUploadEl.value = '';
                clearPickerSelection(editIconPickerList);
            });

            closeSidebar.addEventListener('click', closeSidebarFunc);

            dayEventsToggle.addEventListener('click', toggleDayEventsDropdown);

            document.addEventListener('click', (e) => {
                if (!dayEventsToggle.contains(e.target) && !dayEventsDropdown.contains(e.target)) {
                    closeDayEventsDropdown();
                }
                if (leftMenuOpen && !leftMenu.contains(e.target) && !leftMenuToggle.contains(e.target) &&
                    !configSubmenu.contains(e.target) && !colorSubmenu.contains(e.target)) {
                    closeLeftMenu();
                }
            });

            eventStartEl.addEventListener('change', function () {
                closeDayEventsDropdown();
            });

            // Los modales NO se cierran al pulsar fuera de ellos:
            // solo con la X, con "Cancelar" o con el botón de guardar de cada uno.

            // Listeners del menú lateral
            leftMenuToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleLeftMenu();
            });

            menuUpcoming.addEventListener('click', () => {
                closeLeftMenu();

                // Cerrar documentos si está abierto
                if (documentsSidebarOpen) {
                    documentsSidebarOpen = false;
                    documentsFloatButtons.classList.remove('visible');
                    documentsSidebar.classList.remove('open');
                }

                setEvTab('upcoming');
                sidebarOpen = true;
                upcomingSidebar.classList.add('open');
            });

            menuAgenda.addEventListener('click', () => {
                closeLeftMenu();
                openAgendaFunc();
            });

            menuAddEvent.addEventListener('click', () => {
                closeLeftMenu();
                showEventModal();
            });

            menuDocuments.addEventListener('click', () => {
                closeLeftMenu();

                // Cerrar próximos eventos si está abierto
                if (sidebarOpen) {
                    sidebarOpen = false;
                    upcomingSidebar.classList.remove('open');
                }

                documentsSidebarOpen = true;
                documentsSidebar.classList.add('open');
                documentsFloatButtons.classList.add('visible');
                renderDocuments();
            });

            menuSettings.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleConfigSubmenu();
            });

            darkModeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                applyDarkMode(!isDarkMode);
            });

            bgColorBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleColorSubmenu();
            });

            // Documentos
            closeDocumentsSidebar.addEventListener('click', () => {
                documentsSidebarOpen = false;
                documentsFloatButtons.classList.remove('visible');
                documentsSidebar.classList.remove('open');
            });

            createFolderBtn.addEventListener('click', () => {
                openNewFolderModal(null);
            });

            createFileBtn.addEventListener('click', () => {
                // NUEVO: Si hay un editor minimizado, no permitir abrir otro documento
                if (isEditorHidden) {
                    showConfirmModal({
                        title: 'Documento minimizado',
                        message: 'Tienes un documento minimizado. Debes cerrarlo o guardarlo antes de abrir otro.',
                        cancelText: 'Cancelar',
                        deleteText: 'Abrir el minimizado',
                        onConfirm: () => {
                            showDocEditor();
                        }
                    });
                    return;
                }
                openDocEditor(null);
            });

            document.getElementById('closeFolderModal').addEventListener('click', () => {
                folderModal.style.display = 'none';
            });

            folderForm.addEventListener('submit', handleFolderSubmit);

            folderCustomColor.addEventListener('input', (e) => {
                selectedFolderColor = e.target.value;
                renderFolderColorOptions();
            });

            folderIconUpload.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                if (!file.type.match('image.*')) return;

                const reader = new FileReader();
                reader.onload = function (ev) {
                    currentFolderIconUpload = ev.target.result;
                    selectedFolderIcon = ev.target.result;
                    folderIconPreview.innerHTML = '<img src="' + selectedFolderIcon + '" alt="Icono de carpeta">';
                };
                reader.readAsDataURL(file);
            });

            removeFolderIconBtn.addEventListener('click', () => {
                selectedFolderIcon = null;
                currentFolderIconUpload = null;
                folderIconUpload.value = '';
                folderIconPreview.innerHTML = '<i class="fas fa-folder"></i>';
            });

            orderOrderedBtn.addEventListener('click', () => {
                folderOrderMode = 'ordered';
                localStorage.setItem('folderOrderMode', folderOrderMode);
                updateOrderToggleUI();
                renderDocuments();
            });

            orderUnorderedBtn.addEventListener('click', () => {
                folderOrderMode = 'unordered';
                localStorage.setItem('folderOrderMode', folderOrderMode);
                updateOrderToggleUI();
                renderDocuments();
            });

            // ============================================
            // LISTENERS DEL EDITOR DE DOCUMENTOS
            // ============================================
            document.getElementById('closeSaveAsModal').addEventListener('click', () => {
                saveAsModal.style.display = 'none';
            });

            saveAsForm.addEventListener('submit', handleSaveAsSubmit);

            // Botón azul (acciones): abre/cierra el menú
            docActionsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const willOpen = !docActionsMenu.classList.contains('visible');
                docStyleMenu.classList.remove('visible');
                docFontSizeMenu.classList.remove('visible');
                docAlignMenu.classList.remove('visible');
                docStyleBtn.classList.remove('active');
                docFontSizeBtn.classList.remove('active');
                docActionsMenu.classList.toggle('visible', willOpen);
                if (!willOpen) {
                    docExportSubmenu.classList.remove('visible');
                }
            });

            docExpandControlBtn.addEventListener('click', () => {
                toggleDocEditorExpand();
            });

            docHideControlBtn.addEventListener('click', () => {
                hideDocEditor();
            });

            docExitControlBtn.addEventListener('click', () => {
                exitAndSaveEditor();
            });

            // ACCIONES DEL MENÚ DE 3 PUNTOS (azul)
            docActionsSave.addEventListener('click', (e) => {
                e.stopPropagation();
                docActionsMenu.classList.remove('visible');
                docExportSubmenu.classList.remove('visible');
                saveDocEditor(false);
            });

            docActionsSaveAs.addEventListener('click', (e) => {
                e.stopPropagation();
                docActionsMenu.classList.remove('visible');
                docExportSubmenu.classList.remove('visible');
                openSaveAsModal();
            });

            // Exportar: al hacer clic muestra el submenú a la izquierda
            docActionsDownload.addEventListener('click', (e) => {
                e.stopPropagation();
                docExportSubmenu.classList.toggle('visible');
            });

            exportWordOption.addEventListener('click', (e) => {
                e.stopPropagation();
                docExportSubmenu.classList.remove('visible');
                docActionsMenu.classList.remove('visible');
                exportAsWord();
            });

            exportPdfOption.addEventListener('click', (e) => {
                e.stopPropagation();
                docExportSubmenu.classList.remove('visible');
                docActionsMenu.classList.remove('visible');
                exportAsPdf();
            });

            docActionsDelete.addEventListener('click', (e) => {
                e.stopPropagation();
                docActionsMenu.classList.remove('visible');
                docExportSubmenu.classList.remove('visible');
                deleteCurrentDocument();
            });

            docEditorRestoreTab.addEventListener('click', () => {
                showDocEditor();
            });

            // Menú de estilos - botón principal
            docStyleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const willOpen = !docStyleMenu.classList.contains('visible');
                docFontSizeMenu.classList.remove('visible');
                docAlignMenu.classList.remove('visible');
                docActionsMenu.classList.remove('visible');
                docExportSubmenu.classList.remove('visible');
                docFontSizeBtn.classList.remove('active');
                docStyleMenu.classList.toggle('visible', willOpen);
                docStyleBtn.classList.toggle('active', willOpen);
            });

            // Menú de tamaño - botón principal
            docFontSizeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const willOpen = !docFontSizeMenu.classList.contains('visible');
                docStyleMenu.classList.remove('visible');
                docAlignMenu.classList.remove('visible');
                docActionsMenu.classList.remove('visible');
                docExportSubmenu.classList.remove('visible');
                docStyleBtn.classList.remove('active');
                docFontSizeMenu.classList.toggle('visible', willOpen);
                docFontSizeBtn.classList.toggle('active', willOpen);
            });

            // Menú de alineación - botón principal
            docAlignBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const willOpen = !docAlignMenu.classList.contains('visible');
                docStyleMenu.classList.remove('visible');
                docFontSizeMenu.classList.remove('visible');
                docActionsMenu.classList.remove('visible');
                docExportSubmenu.classList.remove('visible');
                docStyleBtn.classList.remove('active');
                docFontSizeBtn.classList.remove('active');
                docAlignMenu.classList.toggle('visible', willOpen);
            });

            // Cerrar submenús del calendario al hacer clic fuera
            document.addEventListener('click', (e) => {
                if (configSubmenuOpen && !configSubmenu.contains(e.target) &&
                    !menuSettings.contains(e.target) && !colorSubmenu.contains(e.target)) {
                    closeConfigSubmenu();
                }
                if (colorSubmenuOpen && !colorSubmenu.contains(e.target) &&
                    !bgColorBtn.contains(e.target) && !configSubmenu.contains(e.target)) {
                    closeColorSubmenu();
                }
            });

            // Cerrar menús flotantes del editor al hacer click fuera
            document.addEventListener('mousedown', (e) => {
                const menus = [
                    { menu: docAlignMenu, btn: docAlignBtn },
                    { menu: docActionsMenu, btn: docActionsBtn },
                    { menu: docStyleMenu, btn: docStyleBtn },
                    { menu: docFontSizeMenu, btn: docFontSizeBtn }
                ];
                menus.forEach(({ menu, btn }) => {
                    if (menu.classList.contains('visible') &&
                        !menu.contains(e.target) &&
                        !btn.contains(e.target)) {
                        menu.classList.remove('visible');
                        if (btn === docStyleBtn) docStyleBtn.classList.remove('active');
                        if (btn === docFontSizeBtn) docFontSizeBtn.classList.remove('active');
                    }
                });
                // Cerrar submenú de exportar si se hace clic fuera
                if (docExportSubmenu.classList.contains('visible') &&
                    !docExportSubmenu.contains(e.target) &&
                    !docActionsDownload.contains(e.target)) {
                    docExportSubmenu.classList.remove('visible');
                }
            });

            // Agenda
            closeAgendaPopup.addEventListener('click', closeAgendaFunc);
        }

        function updateOrderToggleUI() {
            if (folderOrderMode === 'ordered') {
                orderOrderedBtn.classList.add('active');
                orderUnorderedBtn.classList.remove('active');
            } else {
                orderOrderedBtn.classList.remove('active');
                orderUnorderedBtn.classList.add('active');
            }
        }

        // ---- Errores en rojo bajo el campo ----
        function clearFieldError(el) {
            if (!el) return;
            const wrap = el.closest('.date-input-wrapper, .time-input-wrapper');
            const host = wrap || el.parentElement;
            host.querySelectorAll('.field-error[data-for="' + el.id + '"]').forEach(x => x.remove());
            el.classList.remove('has-error');
            if (wrap) refreshErrorSpace(wrap);
        }
        function refreshErrorSpace(wrap) {
            const row = wrap.closest('.date-range-container, .time-input-group') || wrap;
            let h = 0;
            row.querySelectorAll('.field-error.abs').forEach(x => { h = Math.max(h, x.offsetHeight + 8); });
            row.style.marginBottom = h ? h + 'px' : '';
        }
        function setFieldError(el, msg) {
            clearFieldError(el);
            if (!msg || !el) return;
            const err = document.createElement('div');
            err.className = 'field-error';
            err.dataset.for = el.id;
            err.setAttribute('role', 'alert');
            const ic = document.createElement('i'); ic.className = 'fas fa-circle-exclamation';
            const tx = document.createElement('span'); tx.textContent = msg;
            err.appendChild(ic); err.appendChild(tx);
            const wrap = el.closest('.date-input-wrapper, .time-input-wrapper');
            el.classList.add('has-error');
            if (wrap) { err.classList.add('abs'); wrap.appendChild(err); refreshErrorSpace(wrap); }
            else el.insertAdjacentElement('afterend', err);
        }
        function clearAllEventErrors() {
            ['eventTitle', 'eventStart', 'eventEnd', 'eventStartTime', 'eventEndTime', 'eventRepeatUntil']
                .forEach(id => clearFieldError(document.getElementById(id)));
        }

        function validateDates() {
            const startDate = eventStartEl.value;
            const endDate = eventEndEl.value;
            const until = document.getElementById('eventRepeatUntil');

            if (startDate) clearFieldError(eventStartEl);
            if (endDate && startDate && startDate > endDate) setFieldError(eventEndEl, 'La fecha de fin debe ser posterior a la de inicio');
            else clearFieldError(eventEndEl);

            const rep = document.getElementById('eventRepeat');
            if (until && until.value && startDate && rep && rep.value && until.value < startDate) setFieldError(until, 'La repetición no puede acabar antes de empezar');
            else clearFieldError(until);
        }

        function validateTimes() {
            const startTime = eventStartTimeEl.value;
            const endTime = eventEndTimeEl.value;

            if (endTime && !startTime) setFieldError(eventStartTimeEl, 'Pon la hora de inicio para usar hora de fin');
            else clearFieldError(eventStartTimeEl);

            // Si el evento acaba otro día (lun 22:00 -> mar 02:00), la hora de fin puede ser anterior a la de inicio
            const endsAnotherDay = !!(eventEndEl.value && eventStartEl.value && eventEndEl.value > eventStartEl.value);
            if (startTime && endTime && !endsAnotherDay && startTime >= endTime) setFieldError(eventEndTimeEl, 'La hora de fin debe ser posterior a la de inicio');
            else clearFieldError(eventEndTimeEl);
        }

        // Comprueba todo el formulario al guardar; devuelve el primer campo con error (o null)
        function validateEventForm() {
            const titleEl = document.getElementById('eventTitle');
            if (!titleEl.value.trim()) setFieldError(titleEl, 'Escribe un nombre para el evento');
            else clearFieldError(titleEl);
            if (!eventStartEl.value) setFieldError(eventStartEl, 'Elige la fecha del evento');
            validateDates();
            validateTimes();
            const order = ['eventTitle', 'eventStart', 'eventEnd', 'eventStartTime', 'eventEndTime', 'eventRepeatUntil'];
            for (const id of order) {
                const el = document.getElementById(id);
                if (el && el.classList.contains('has-error')) return el;
            }
            return null;
        }

        function handleAddCategory() {
            const name = newCategoryNameEl.value.trim();

            if (!isSavingCategory) {
                if (!name) return;

                isAddingNewCategory = true;
                categoryAppearanceEl.style.display = 'block';

                addCategoryBtn.innerHTML = '<i class="fi fi-sr-disk"></i> Guardar';
                addCategoryBtn.classList.add('saving-mode');
                isSavingCategory = true;
            } else {
                addNewCategory();

                addCategoryBtn.innerHTML = '<i class="fas fa-plus"></i> Añadir';
                addCategoryBtn.classList.remove('saving-mode');
                isSavingCategory = false;
            }
        }

        function enterSearchMode() {
            isSearchMode = true;
            document.querySelector('.calendar-container').classList.add('search-mode');
            searchContainer.classList.add('visible');
        }

        function exitSearchMode() {
            if (document.activeElement === searchInput) searchInput.blur();
            isSearchMode = false;
            document.querySelector('.calendar-container').classList.remove('search-mode');
            searchContainer.classList.remove('visible');
            searchInput.value = '';
            resetSearchFilters();
            renderCalendar();
            setTimeout(updateCustomScrollbar, 50);
        }

        // Mensaje (sin alert) cuando no hay ninguna coincidencia
        function showNoSearchResults(term, filtering) {
            const msg = term
                ? 'Ningún evento coincide con "' + escapeHtml(term) + '"' + (filtering ? ' y los filtros' : '')
                : 'Ningún evento coincide con los filtros';
            calendarEl.innerHTML =
                '<div class="search-empty-state">' +
                '<i class="fi fi-sr-search"></i>' +
                '<h3>No se han encontrado coincidencias</h3>' +
                '<p>' + msg + '</p>' +
                '</div>';
        }

        // Búsqueda en vivo: solo por nombre, más los filtros activos
        function searchEvents() {
            const rawTerm = searchInput.value.trim();
            const searchTerm = acNorm(rawTerm);
            const filtering = hasActiveSearchFilters();

            if (!searchTerm && !filtering) {
                if (isSearchMode) clearSearchResults();
                return;
            }

            enterSearchMode();
            isSearchActive = true;

            const matchingEvents = events.filter(ev => eventMatchesSearch(ev, searchTerm));

            if (matchingEvents.length === 0) {
                showNoSearchResults(rawTerm, filtering);
                setTimeout(updateCustomScrollbar, 50);
                return;
            }

            // Se repinta desde cero en cada cambio: así se limpian resaltados y mensajes anteriores
            renderCalendar();
            const shownDays = paintSearchResults(matchingEvents);

            // Si el mes que se está viendo no tiene coincidencias pero otro sí, salta al más cercano
            if (shownDays === 0) {
                const viewedMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getTime();
                let nearest = matchingEvents[0];
                let nearestDiff = Infinity;
                matchingEvents.forEach(ev => {
                    const diff = Math.abs(new Date(ev.start).getTime() - viewedMonth);
                    if (diff < nearestDiff) {
                        nearestDiff = diff;
                        nearest = ev;
                    }
                });
                const target = new Date(nearest.start);
                currentDate = new Date(target.getFullYear(), target.getMonth(), 1);
                renderCalendar();
                paintSearchResults(matchingEvents);
            }

            setTimeout(updateCustomScrollbar, 50);
        }

        // ===== Filtros del buscador =====
        function hasActiveSearchFilters() {
            return searchFilters.cats.size > 0 ||
                searchFilters.importance !== 'all' ||
                !!searchFilters.location.trim();
        }

        function eventMatchesSearch(event, term) {
            if (term && !acNorm(event.title).includes(term)) return false;

            if (searchFilters.cats.size) {
                const key = event.categoryId ? String(event.categoryId) : '__none__';
                if (!searchFilters.cats.has(key)) return false;
            }
            if (searchFilters.importance === 'yes' && !event.important) return false;
            if (searchFilters.importance === 'no' && event.important) return false;

            const loc = acNorm(searchFilters.location.trim());
            if (loc && !acNorm(event.location).includes(loc)) return false;

            return true;
        }

        function updateSearchFilterBadge() {
            document.getElementById('searchFilterBtn').classList.toggle('has-filters', hasActiveSearchFilters());
        }

        function onSearchFiltersChanged() {
            updateSearchFilterBadge();
            searchEvents();
        }

        function renderSearchFilterPop() {
            const wrap = document.getElementById('sfpCategories');
            wrap.textContent = '';

            // Quita de la selección categorías que ya no existen
            Array.from(searchFilters.cats).forEach(k => {
                if (k !== '__none__' && !categories.some(c => String(c.id) === k)) searchFilters.cats.delete(k);
            });

            const addChip = (key, label, dotStyle) => {
                const chip = document.createElement('div');
                chip.className = 'sfp-chip' + (searchFilters.cats.has(key) ? ' on' : '');
                chip.setAttribute('role', 'button');
                chip.tabIndex = 0;
                const dot = document.createElement('span');
                dot.className = 'sfp-dot';
                dot.style.cssText = dotStyle;
                const nm = document.createElement('span');
                nm.textContent = label;
                chip.appendChild(dot);
                chip.appendChild(nm);
                const toggle = () => {
                    if (searchFilters.cats.has(key)) searchFilters.cats.delete(key);
                    else searchFilters.cats.add(key);
                    chip.classList.toggle('on', searchFilters.cats.has(key));
                    onSearchFiltersChanged();
                };
                chip.addEventListener('click', toggle);
                chip.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
                });
                wrap.appendChild(chip);
            };

            addChip('__none__', 'Sin categoría', 'background: transparent; border: 1.5px dashed var(--text-light);');
            categories.forEach(c => {
                const dotStyle = (c.type === 'image' && c.backgroundImage)
                    ? 'background-image: url("' + c.backgroundImage + '"); background-size: cover; background-position: center;'
                    : 'background: ' + (c.color || '#888') + ';';
                addChip(String(c.id), c.name, dotStyle);
            });

            document.querySelectorAll('#sfpImportance [data-v]').forEach(el => {
                el.classList.toggle('on', el.dataset.v === searchFilters.importance);
            });
        }

        function positionSearchFilterPop() {
            const btn = document.getElementById('searchFilterBtn');
            const pop = document.getElementById('searchFilterPop');
            const r = btn.getBoundingClientRect();
            const w = pop.offsetWidth;
            pop.style.top = (r.bottom + 16) + 'px';
            pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
        }

        function openSearchFilterPop() {
            renderSearchFilterPop();
            document.getElementById('searchFilterPop').classList.add('open');
            positionSearchFilterPop();
        }

        function closeSearchFilterPop() {
            document.getElementById('searchFilterPop').classList.remove('open');
        }

        function resetSearchFilters() {
            searchFilters.cats.clear();
            searchFilters.importance = 'all';
            searchFilters.location = '';
            document.getElementById('sfpLocation').value = '';
            closeSearchFilterPop();
            updateSearchFilterBadge();
        }

        (function initSearchFilter() {
            const btn = document.getElementById('searchFilterBtn');
            const pop = document.getElementById('searchFilterPop');
            const locInput = document.getElementById('sfpLocation');

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (pop.classList.contains('open')) closeSearchFilterPop();
                else openSearchFilterPop();
            });

            // Clic fuera: cierra el panel
            document.addEventListener('mousedown', (e) => {
                if (pop.classList.contains('open') && !pop.contains(e.target) && !btn.contains(e.target)) closeSearchFilterPop();
            });

            // Escape: cierra solo el panel (no todo el buscador)
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && pop.classList.contains('open')) {
                    e.stopPropagation();
                    e.preventDefault();
                    closeSearchFilterPop();
                }
            }, true);

            window.addEventListener('resize', () => {
                if (pop.classList.contains('open')) positionSearchFilterPop();
            });

            document.querySelectorAll('#sfpImportance [data-v]').forEach(el => {
                el.addEventListener('click', () => {
                    searchFilters.importance = el.dataset.v;
                    renderSearchFilterPop();
                    onSearchFiltersChanged();
                });
            });

            locInput.addEventListener('input', debounce(() => {
                searchFilters.location = locInput.value;
                onSearchFiltersChanged();
            }, 150));

            document.getElementById('sfpClear').addEventListener('click', () => {
                searchFilters.cats.clear();
                searchFilters.importance = 'all';
                searchFilters.location = '';
                locInput.value = '';
                renderSearchFilterPop();
                onSearchFiltersChanged();
            });
        })();

        // Cada vez que se abre un modal, empieza arriba del todo
        (function resetModalScrollOnOpen() {
            const toTop = (modal) => {
                modal.scrollTop = 0;
                modal.querySelectorAll('*').forEach(el => { if (el.scrollTop) el.scrollTop = 0; });
            };

            document.querySelectorAll('.modal').forEach(modal => {
                let wasOpen = getComputedStyle(modal).display !== 'none';

                new MutationObserver(() => {
                    const open = getComputedStyle(modal).display !== 'none';
                    if (open === wasOpen) return;
                    wasOpen = open;

                    if (!open) {
                        // El formulario de evento se oculta para editar una categoría y luego vuelve:
                        // en ese caso se respeta la posición donde estaba
                        modal.dataset.keepScroll = (modal.id === 'eventModal' && previousModal === 'event') ? '1' : '';
                        return;
                    }
                    if (modal.dataset.keepScroll) { modal.dataset.keepScroll = ''; return; }
                    toTop(modal);
                }).observe(modal, { attributes: true, attributeFilter: ['style', 'class'] });
            });
        })();

        // Caja de búsqueda vacía: vuelve el calendario normal (con los días de la semana),
        // pero la caja de búsqueda sigue abierta.
        function clearSearchResults() {
            isSearchMode = false;
            document.querySelector('.calendar-container').classList.remove('search-mode');
            renderCalendar();
            setTimeout(updateCustomScrollbar, 50);
        }

        // Deja visibles solo los días con coincidencias y resalta los eventos encontrados.
        // Devuelve cuántos días se muestran en el mes que se está viendo.
        function paintSearchResults(matchingEvents) {
            calendarEl.querySelectorAll('.calendar-day').forEach(day => {
                day.style.display = 'none';
            });

            let shownDays = 0;

            matchingEvents.forEach(event => {
                const eventStart = new Date(event.start);
                const eventEnd = event.end ? new Date(event.end) : new Date(event.start);

                const cursor = new Date(eventStart);
                while (cursor <= eventEnd) {
                    const dateStr = formatDate(cursor);
                    const dayElement = calendarEl.querySelector('.calendar-day[data-date="' + dateStr + '"]');
                    if (dayElement) {
                        if (dayElement.style.display === 'none') {
                            dayElement.style.display = 'block';
                            shownDays++;
                        }
                        const eventEl = dayElement.querySelector('.event[data-event-id="' + event.id + '"]');
                        if (eventEl) eventEl.classList.add('search-hit');
                    }
                    cursor.setDate(cursor.getDate() + 1);
                }
            });

            return shownDays;
        }

        function setCategoryAppearanceType(type) {
            categoryAppearanceType = type;

            if (type === 'color') {
                categoryColorOptionEl.classList.add('selected');
                categoryImageOptionEl.classList.remove('selected');
                categoryColorSelectorEl.style.display = 'block';
                categoryImageSelectorEl.style.display = 'none';
            } else {
                categoryColorOptionEl.classList.remove('selected');
                categoryImageOptionEl.classList.add('selected');
                categoryColorSelectorEl.style.display = 'none';
                categoryImageSelectorEl.style.display = 'block';
            }
        }

        function setEditCategoryAppearanceType(type) {
            if (type === 'color') {
                editCategoryColorOptionEl.classList.add('selected');
                editCategoryImageOptionEl.classList.remove('selected');
                editCategoryColorSelectorEl.style.display = 'block';
                editCategoryImageSelectorEl.style.display = 'none';
            } else {
                editCategoryColorOptionEl.classList.remove('selected');
                editCategoryImageOptionEl.classList.add('selected');
                editCategoryColorSelectorEl.style.display = 'none';
                editCategoryImageSelectorEl.style.display = 'block';
            }
        }

        function updateCategoryColorPreview() {
            categoryColorPreviewEl.style.backgroundColor = categoryColorEl.value;
        }

        function handleCategoryIconUpload(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (!file.type.match('image.*')) return;

            const reader = new FileReader();
            reader.onload = function (e) {
                categoryUploadedIcon = e.target.result;
                categoryIconPreviewEl.innerHTML = '<img src="' + categoryUploadedIcon + '" alt="Icono de categoría">';
                clearPickerSelection(iconPickerList);
            };
            reader.readAsDataURL(file);
        }

        function handleEditCategoryIconUpload(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (!file.type.match('image.*')) return;

            const reader = new FileReader();
            reader.onload = function (e) {
                editCategoryIconPreviewEl.innerHTML = '<img src="' + e.target.result + '" alt="Icono de categoría">';
                clearPickerSelection(editIconPickerList);
            };
            reader.readAsDataURL(file);
        }

        function handleCategoryImageUpload(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (!file.type.match('image.*')) return;

            const reader = new FileReader();
            reader.onload = function (e) {
                categoryUploadedImage = e.target.result;
                categoryImagePreviewEl.style.backgroundImage = 'url(' + categoryUploadedImage + ')';
                categoryImagePreviewEl.textContent = '';
            };
            reader.readAsDataURL(file);
        }

        function handleEditCategoryImageUpload(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (!file.type.match('image.*')) return;

            const reader = new FileReader();
            reader.onload = function (e) {
                editCategoryImagePreviewEl.style.backgroundImage = 'url(' + e.target.result + ')';
                editCategoryImagePreviewEl.textContent = '';
                editCategoryImageUrlEl.value = '';
            };
            reader.readAsDataURL(file);
        }

        function updateCategoryImagePreviewFromUrl() {
            if (categoryImageUrlEl.value) {
                categoryImagePreviewEl.style.backgroundImage = 'url(' + categoryImageUrlEl.value + ')';
                categoryImagePreviewEl.textContent = '';
                categoryUploadedImage = categoryImageUrlEl.value;
            } else {
                categoryImagePreviewEl.style.backgroundImage = 'none';
                categoryImagePreviewEl.textContent = 'Vista previa de la imagen';
                categoryUploadedImage = null;
            }
        }

        function updateEditCategoryImagePreviewFromUrl() {
            if (editCategoryImageUrlEl.value) {
                editCategoryImagePreviewEl.style.backgroundImage = 'url(' + editCategoryImageUrlEl.value + ')';
                editCategoryImagePreviewEl.textContent = '';
            } else {
                editCategoryImagePreviewEl.style.backgroundImage = 'none';
                editCategoryImagePreviewEl.textContent = 'Vista previa de la imagen';
            }
        }

        function resetCategoryAppearance() {
            isAddingNewCategory = false;
            isSavingCategory = false;
            categoryAppearanceEl.style.display = 'none';
            setCategoryAppearanceType('color');
            categoryColorEl.value = '#3c6df0';
            updateCategoryColorPreview();
            categoryIconUploadEl.value = '';
            categoryIconPreviewEl.innerHTML = '<div class="no-icon-placeholder">Vista previa del icono</div>';
            categoryUploadedIcon = null;
            categoryImageUploadEl.value = '';
            categoryImageUrlEl.value = '';
            categoryImagePreviewEl.style.backgroundImage = 'none';
            categoryImagePreviewEl.textContent = 'Vista previa de la imagen';
            categoryUploadedImage = null;
            clearPickerSelection(iconPickerList);

            addCategoryBtn.innerHTML = '<i class="fas fa-plus"></i> Añadir';
            addCategoryBtn.classList.remove('saving-mode');
            updateAddCategoryButton();
        }

        function renderCategorySelector() {
            categorySelectorEl.innerHTML = '';

            const noCategoryElement = document.createElement('div');
            noCategoryElement.className = 'category-option no-category-option';

            const noCategoryIcon = document.createElement('div');
            noCategoryIcon.className = 'category-icon';
            noCategoryIcon.innerHTML = '<i class="fas fa-ban" style="font-size: 16px; color: var(--text-light);"></i>';

            const noCategoryText = document.createElement('div');
            noCategoryText.className = 'category-text';
            noCategoryText.textContent = 'Sin categoría';

            noCategoryElement.appendChild(noCategoryIcon);
            noCategoryElement.appendChild(noCategoryText);
            noCategoryElement.dataset.id = 'none';

            noCategoryElement.addEventListener('click', () => {
                categorySelectorEl.querySelectorAll('.category-option.show-actions').forEach(el => el.classList.remove('show-actions'));
                selectedCategoryId = null;
                updateCategorySelection();
            });

            categorySelectorEl.appendChild(noCategoryElement);

            categories.forEach(category => {
                const categoryElement = document.createElement('div');
                categoryElement.className = 'category-option';

                if (!category.icon) {
                    categoryElement.classList.add('no-icon');
                }

                const categoryIcon = document.createElement('div');
                categoryIcon.className = 'category-icon';

                if (category.icon) {
                    // Comprobar si es una URL de imagen o un icono de fuente
                    if (category.icon.startsWith('<i')) {
                        categoryIcon.innerHTML = category.icon;
                    } else {
                        const iconImg = document.createElement('img');
                        iconImg.src = category.icon;
                        iconImg.alt = category.name;
                        categoryIcon.appendChild(iconImg);
                    }
                } else {
                    categoryIcon.innerHTML = '<i class="fas fa-tag" style="font-size: 16px;"></i>';
                }

                const categoryText = document.createElement('div');
                categoryText.className = 'category-text';
                categoryText.textContent = category.name;

                categoryElement.appendChild(categoryIcon);
                categoryElement.appendChild(categoryText);

                if (category.type === 'image' && category.backgroundImage) {
                    categoryElement.style.backgroundImage = 'url(' + category.backgroundImage + ')';
                    categoryElement.style.backgroundSize = 'cover';
                    categoryElement.style.backgroundPosition = 'center';
                    categoryElement.style.color = '#fff';
                    categoryElement.style.textShadow = '0 1px 3px rgba(0, 0, 0, 0.8)';
                } else {
                    categoryElement.style.backgroundColor = category.color;
                    const isLight = isLightColor(category.color);
                    categoryElement.style.color = isLight ? '#000' : '#fff';

                    if (!category.icon) {
                        const iconElement = categoryIcon.querySelector('i');
                        if (iconElement) {
                            iconElement.style.color = isLight ? '#000' : '#fff';
                        }
                    }
                }

                categoryElement.dataset.id = category.id;

                const categoryActions = document.createElement('div');
                categoryActions.className = 'category-actions';

                const editBtn = document.createElement('button');
                editBtn.type = 'button';
                editBtn.className = 'category-action-btn';
                editBtn.innerHTML = '<i class="fa-solid fa-marker"></i>';
                editBtn.title = 'Editar categoría';

                const isLight = isLightColor(category.type === 'image' ? 'image' : category.color);
                if (isLight) {
                    editBtn.classList.add('light-text');
                }

                editBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    previousModal = 'event';
                    editCategory(category.id);
                });

                const deleteBtn = document.createElement('button');
                deleteBtn.type = 'button';
                deleteBtn.className = 'category-action-btn';
                deleteBtn.innerHTML = '<i class="fi fi-sr-trash"></i>';
                deleteBtn.title = 'Eliminar categoría';

                if (isLight) {
                    deleteBtn.classList.add('light-text');
                }

                deleteBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteCategory(category.id);
                });

                categoryActions.appendChild(editBtn);
                categoryActions.appendChild(deleteBtn);
                categoryElement.appendChild(categoryActions);

                categoryElement.addEventListener('click', () => {
                    const wasOpen = categoryElement.classList.contains('show-actions');
                    categorySelectorEl.querySelectorAll('.category-option.show-actions').forEach(el => el.classList.remove('show-actions'));
                    if (!wasOpen) categoryElement.classList.add('show-actions');
                    selectedCategoryId = category.id;
                    updateCategorySelection();
                });

                categorySelectorEl.appendChild(categoryElement);
            });

            if (categories.length > 0 && !selectedCategoryId) {
                selectedCategoryId = categories[0].id;
            }

            updateCategorySelection();
            justifyCategoryRows();
        }

        function updateCategorySelection() {
            document.querySelectorAll('.category-option').forEach(option => {
                const optionId = option.dataset.id === 'none' ? null : parseInt(option.dataset.id);
                if (optionId === selectedCategoryId) {
                    option.classList.add('selected');
                } else {
                    option.classList.remove('selected');
                }
            });
        }

        // Justifica las filas de categorías; la última fila conserva su tamaño natural
        function justifyCategoryRows() {
            const items = Array.from(categorySelectorEl.querySelectorAll('.category-option'));
            if (items.length === 0) return;

            // 1) Restablecer: todas crecen (valor del CSS)
            items.forEach(el => { el.style.flexGrow = ''; });

            // 2) Si el modal está oculto no se puede medir
            if (categorySelectorEl.offsetParent === null) return;

            // 3) Detectar la última fila por su posición vertical
            const lastTop = Math.max(...items.map(el => el.offsetTop));
            items.forEach(el => {
                if (Math.abs(el.offsetTop - lastTop) < 2) {
                    el.style.flexGrow = '0';
                }
            });
        }

        function editCategory(categoryId) {
            const category = categories.find(c => c.id === categoryId);
            if (!category) return;

            editingCategoryId = categoryId;
            editCategoryIdEl.value = categoryId;
            editCategoryNameEl.value = category.name;

            if (category.icon) {
                if (category.icon.startsWith('<i')) {
                    editCategoryIconPreviewEl.innerHTML = category.icon;
                } else {
                    editCategoryIconPreviewEl.innerHTML = '<img src="' + category.icon + '" alt="Icono de categoría">';
                }
            } else {
                editCategoryIconPreviewEl.innerHTML = '<div class="no-icon-placeholder">Vista previa del icono</div>';
            }

            if (category.type === 'image') {
                setEditCategoryAppearanceType('image');
                if (category.backgroundImage) {
                    editCategoryImagePreviewEl.style.backgroundImage = 'url(' + category.backgroundImage + ')';
                    editCategoryImagePreviewEl.textContent = '';
                    if (category.backgroundImage.startsWith('http')) {
                        editCategoryImageUrlEl.value = category.backgroundImage;
                    } else {
                        editCategoryImageUrlEl.value = '';
                    }
                }
            } else {
                setEditCategoryAppearanceType('color');
                editCategoryColorEl.value = category.color;
                editCategoryColorPreviewEl.style.backgroundColor = category.color;
            }

            setPickerSelection(editIconPickerList, category.icon || null);
            eventModal.style.display = 'none';
            editCategoryModal.style.display = 'flex';
        }

        async function handleEditCategorySubmit(e) {
            e.preventDefault();

            const categoryId = parseInt(editCategoryIdEl.value);
            const name = editCategoryNameEl.value.trim();

            if (!name) return;

            const categoryIndex = categories.findIndex(c => c.id === categoryId);
            if (categoryIndex !== -1) {
                const type = editCategoryColorSelectorEl.style.display !== 'none' ? 'color' : 'image';

                const categoryData = {
                    id: categoryId,
                    name,
                    type
                };

                // Obtener el icono del preview
                const iconElement = editCategoryIconPreviewEl.querySelector('i');
                if (iconElement) {
                    // Es un icono de fuente
                    categoryData.icon = iconElement.outerHTML;
                } else {
                    const iconImg = editCategoryIconPreviewEl.querySelector('img');
                    if (iconImg && iconImg.src && !iconImg.src.includes('no-icon-placeholder')) {
                        categoryData.icon = iconImg.src;
                    } else {
                        categoryData.icon = null;
                    }
                }

                if (type === 'color') {
                    categoryData.color = editCategoryColorEl.value;
                    delete categoryData.backgroundImage;
                } else {
                    if (editCategoryImageUrlEl.value) {
                        categoryData.backgroundImage = editCategoryImageUrlEl.value;
                    } else if (editCategoryImagePreviewEl.style.backgroundImage !== 'none') {
                        const backgroundImage = editCategoryImagePreviewEl.style.backgroundImage;
                        const urlMatch = backgroundImage.match(/url\(["']?(.*?)["']?\)/);
                        if (urlMatch && urlMatch[1]) {
                            categoryData.backgroundImage = urlMatch[1];
                        } else {
                            categoryData.backgroundImage = categories[categoryIndex].backgroundImage;
                        }
                    } else {
                        categoryData.backgroundImage = categories[categoryIndex].backgroundImage;
                    }
                    delete categoryData.color;
                }

                categories[categoryIndex] = categoryData;

                safeSave('eventCategories', categories);

                renderCategorySelector();

                editCategoryModal.style.display = 'none';
                eventModal.style.display = 'flex';
                previousModal = null;

                renderCalendar();
                loadUpcomingEvents();
            }
        }

        async function deleteCategory(categoryId) {
            const category = categories.find(c => c.id === categoryId);
            if (!category) return;

            showConfirmModal({
                title: 'Eliminar categoría',
                message: '¿Seguro que quieres eliminar la categoría "' + category.name + '"? Los eventos que la usen se quedarán sin categoría.',
                cancelText: 'Cancelar',
                deleteText: 'Eliminar',
                onConfirm: () => {
                    categories = categories.filter(c => c.id !== categoryId);
                    if (selectedCategoryId === categoryId) selectedCategoryId = null;

                    events = events.map(event => {
                        if (event.categoryId === categoryId) {
                            return { ...event, categoryId: null };
                        }
                        return event;
                    });

                    safeSave('eventCategories', categories);
                    safeSave('calendarEvents', events);

                    renderCategorySelector();
                    renderCalendar();
                    loadUpcomingEvents();

                    if (dayEventsModal.style.display === 'flex') {
                        showDayEvents(selectedDay);
                    }
                }
            });
        }

        function addNewCategory() {
            const name = newCategoryNameEl.value.trim();
            if (!name) return;

            const newCategory = {
                id: Date.now(),
                name,
                type: categoryAppearanceType
            };

            if (categoryUploadedIcon) {
                newCategory.icon = categoryUploadedIcon;
            }

            if (categoryAppearanceType === 'color') {
                newCategory.color = categoryColorEl.value;
            } else if (categoryUploadedImage || categoryImageUrlEl.value) {
                newCategory.backgroundImage = categoryUploadedImage || categoryImageUrlEl.value;
            } else {
                return;
            }

            categories.push(newCategory);

            safeSave('eventCategories', categories);

            renderCategorySelector();

            selectedCategoryId = newCategory.id;
            updateCategorySelection();

            newCategoryNameEl.value = '';
            resetCategoryAppearance();

            loadUpcomingEvents();
        }

        function escapeHtml(str) {
            return String(str ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        // ============================================
        // AVISOS (sustituyen a los avisos del navegador)
        // ============================================
        function showToast(message, kind = 'error', action = null) {
            let host = document.getElementById('toastHost');
            if (!host) {
                host = document.createElement('div');
                host.id = 'toastHost';
                host.className = 'toast-host';
                host.setAttribute('role', 'status');
                host.setAttribute('aria-live', 'polite');
                document.body.appendChild(host);
            }
            const toast = document.createElement('div');
            toast.className = 'app-toast app-toast-' + kind;
            const icon = document.createElement('i');
            icon.className = kind === 'error' ? 'fi fi-sr-diamond-exclamation' : 'fi fi-sr-check-circle';
            const text = document.createElement('span');
            text.textContent = message;
            toast.appendChild(icon);
            toast.appendChild(text);
            if (action && action.label && typeof action.fn === 'function') {
                const ab = document.createElement('button');
                ab.type = 'button'; ab.textContent = action.label;
                ab.addEventListener('click', () => {
                    toast.classList.remove('show');
                    setTimeout(() => toast.remove(), 300);
                    action.fn();
                });
                toast.appendChild(ab);
            }
            host.appendChild(toast);
            requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, action ? 7000 : 3800);
        }

        // ============================================
        // CALENDARIO MENSUAL
        // Los eventos de varios días se reparten en "carriles" por semana (así mantienen la misma fila
        // todos los días) y cada casilla dibuja su propio segmento dentro de sí misma.
        // ============================================
        let SPAN_MAX_ROWS = 3;   // filas visibles por casilla (barras + eventos de un día)
        let dayLaneOrder = {};   // fecha -> ids de los eventos de varios días, en el orden en que se ven en la casilla

        function isMultiDayEvent(ev) {
            return !!(ev.end && ev.end > ev.start);
        }

        // Días que quedan de un evento desde dateStr hasta su fin, contando dateStr (el último día vale 1)
        function daysLeftInclusive(dateStr, endStr) {
            const p = x => { const [y, m, d] = x.split('-').map(Number); return Date.UTC(y, m - 1, d); };
            return Math.max(1, Math.round((p(endStr) - p(dateStr)) / 86400000) + 1);
        }

        // Orden ÚNICO de los eventos de un día (casilla del calendario y ventana del día):
        // por hora de inicio (los que no tienen hora, al final), sean de uno o de varios días.
        function compareSingleDayEvents(a, b) {
            const timeA = a.startTime || '99:99';
            const timeB = b.startTime || '99:99';
            return timeA.localeCompare(timeB) ||
                (b.important ? 1 : 0) - (a.important ? 1 : 0) ||
                (a.id - b.id);
        }

        function sortEventsForDay(dateStr, list) {
            return list.slice().sort(compareSingleDayEvents);
        }

        // Reparte los eventos de varios días en carriles, semana a semana
        function planSpanBars(dateStrs, occsIn) {
            const cells = dateStrs.map((d, i) => ({ col: i % 7, lanes: [], hidden: [], all: [] }));
            const segs = [];
            const multi = (occsIn || events.flatMap(ev => eventOccurrences(ev, dateStrs[0], dateStrs[dateStrs.length - 1]))).filter(isMultiDayEvent);
            if (multi.length === 0) return { cells, segs };

            for (let w = 0; w < dateStrs.length / 7; w++) {
                const days = dateStrs.slice(w * 7, w * 7 + 7);
                const ws = days[0], we = days[6];
                const weekSegs = [];

                multi.forEach(ev => {
                    if (ev.end < ws || ev.start > we) return;
                    const c0 = ev.start <= ws ? 0 : days.indexOf(ev.start);
                    const c1 = ev.end >= we ? 6 : days.indexOf(ev.end);
                    if (c0 < 0 || c1 < 0) return;
                    weekSegs.push({
                        ev, week: w, c0, c1, lane: 0,
                        flatL: ev.start < ws, flatR: ev.end > we
                    });
                });

                // Primero los que empiezan antes (así ocupan siempre la fila de arriba y no quedan huecos);
                // la importancia solo desempata
                weekSegs.sort((x, y) =>
                    x.c0 - y.c0 ||
                    (y.c1 - y.c0) - (x.c1 - x.c0) ||
                    (y.ev.important ? 1 : 0) - (x.ev.important ? 1 : 0) ||
                    String(x.ev.startTime || '').localeCompare(String(y.ev.startTime || '')) ||
                    (x.ev.id - y.ev.id)
                );

                const occ = [];
                weekSegs.forEach(seg => {
                    let l = 0;
                    for (; ; l++) {
                        occ[l] = occ[l] || [false, false, false, false, false, false, false];
                        let free = true;
                        for (let c = seg.c0; c <= seg.c1; c++) if (occ[l][c]) { free = false; break; }
                        if (free) break;
                    }
                    for (let c = seg.c0; c <= seg.c1; c++) occ[l][c] = true;
                    seg.lane = l;
                    segs.push(seg);

                    for (let c = seg.c0; c <= seg.c1; c++) {
                        cells[w * 7 + c].all[l] = seg;
                    }
                });
            }

            // Cada casilla se "compacta": sin filas vacías, el primer evento siempre va arriba del todo
            cells.forEach(cell => {
                const ordered = cell.all.filter(Boolean);
                cell.lanes = ordered.slice(0, SPAN_MAX_ROWS);
                cell.hidden = ordered.slice(SPAN_MAX_ROWS).map(sg => sg.ev);
            });
            return { cells, segs };
        }

        // Un "chip" de evento (el mismo para las casillas y para las barras)
        function createEventChip(event, titleText) {
            const category = event.categoryId ? categories.find(c => c.id === event.categoryId) : null;
            const eventElement = document.createElement('div');
            eventElement.className = 'event';
            eventElement.dataset.eventId = event.id; // para resaltarlo al buscar

            if (isEventDone(event)) eventElement.classList.add('done');

            if (event.important) {
                eventElement.classList.add('important');
                const importantIndicator = document.createElement('div');
                importantIndicator.className = 'important-indicator';
                importantIndicator.innerHTML = '!';
                eventElement.appendChild(importantIndicator);
            }

            if (!category || !category.icon) {
                eventElement.classList.add('no-icon');
            }

            const eventIcon = document.createElement('div');
            eventIcon.className = 'event-icon';

            const eventText = document.createElement('div');
            eventText.className = 'event-text';
            eventText.textContent = titleText;

            eventElement.appendChild(eventIcon);
            eventElement.appendChild(eventText);

            let textColor = '#ffffff';

            if (!event.categoryId) {
                eventElement.classList.add('no-category');
                textColor = 'var(--text-color)';
            } else if (category) {
                if (category.type === 'image' && category.backgroundImage) {
                    eventElement.style.backgroundImage = 'url(' + category.backgroundImage + ')';
                    eventElement.style.backgroundSize = 'cover';
                    eventElement.style.backgroundPosition = 'center';
                    eventElement.style.textShadow = '0 0px 7px rgba(0, 0, 0, 0.7)';
                    textColor = '#ffffff';
                } else {
                    eventElement.style.backgroundColor = category.color;
                    textColor = getContrastColor(category.color, false);
                }
            }

            if (event.categoryId && category) {
                eventElement.style.color = textColor;
                applyIconColor(eventIcon, category.icon, textColor);
            } else {
                eventElement.style.color = 'var(--text-color)';
            }

            return eventElement;
        }

        function renderCalendar() {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            const hadFocus = calendarEl.contains(document.activeElement);

            const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
            currentMonthEl.textContent = monthNames[month] + ' ' + year;
            dayLaneOrder = {};

            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            let firstDayIndex = firstDay.getDay();
            firstDayIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
            const daysInMonth = lastDay.getDate();
            const prevMonthLastDay = new Date(year, month, 0).getDate();

            const defs = [];
            for (let i = firstDayIndex; i > 0; i--) {
                const day = prevMonthLastDay - i + 1;
                defs.push({ day, className: 'other-month', dateStr: formatDate(new Date(year, month - 1, day)), isToday: false });
            }
            const today = new Date();
            for (let i = 1; i <= daysInMonth; i++) {
                const isToday = today.getDate() === i && today.getMonth() === month && today.getFullYear() === year;
                defs.push({ day: i, className: 'current-month', dateStr: formatDate(new Date(year, month, i)), isToday });
            }
            const nextMonthDays = 42 - defs.length;
            for (let i = 1; i <= nextMonthDays; i++) {
                defs.push({ day: i, className: 'other-month', dateStr: formatDate(new Date(year, month + 1, i)), isToday: false });
            }

            // Las ocurrencias se calculan UNA vez y se reparten por día (antes se recalculaban en cada casilla)
            const first = defs[0].dateStr, last = defs[defs.length - 1].dateStr;
            const occs = events.flatMap(ev => eventOccurrences(ev, first, last));
            dayEventsCache = new Map(defs.map(d => [d.dateStr, []]));
            occs.forEach(o => {
                const end = o.end || o.start;
                for (let s = o.start < first ? first : o.start; s <= end && s <= last; s = addDaysStr(s, 1)) {
                    dayEventsCache.get(s).push(o);
                }
            });

            const useBars = !isSearchMode && window.innerWidth > 400;
            const plan = useBars ? planSpanBars(defs.map(d => d.dateStr), occs) : null;

            // Animación solo si cambia de mes
            const key = year + '-' + month;
            calendarEl.classList.toggle('month-anim', key !== lastRenderedMonthKey);
            lastRenderedMonthKey = key;

            // Se construye fuera del DOM y se sustituye de una sola vez
            const frag = document.createDocumentFragment();
            defs.forEach((d, idx) => frag.appendChild(createDayElement(d.day, d.className, d.dateStr, d.isToday, plan ? plan.cells[idx] : null)));
            calendarEl.replaceChildren(frag);
            dayEventsCache = null;

            // Una sola casilla en el orden de tabulación (la última enfocada, hoy o el día 1)
            let tabCell = lastFocusedDate && calendarEl.querySelector('.calendar-day.current-month[data-date="' + lastFocusedDate + '"]');
            if (!tabCell) tabCell = calendarEl.querySelector('.calendar-day.today') || calendarEl.querySelector('.calendar-day.current-month');
            if (tabCell) {
                tabCell.tabIndex = 0;
                if (hadFocus) tabCell.focus({ preventScroll: true });
            }

            updateMonthStats();
            setTimeout(updateCustomScrollbar, 50);
        }

        function createDayElement(day, className, dateStr, isToday = false, cellPlan = null) {
            const dayElement = document.createElement('div');
            dayElement.className = 'calendar-day ' + className;
            dayElement.setAttribute('data-date', dateStr);
            if (isToday) dayElement.classList.add('today');

            const holiday = getHoliday(dateStr);
            if (holiday) {
                dayElement.classList.add('holiday', 'holiday-' + holiday.key);
                dayElement.setAttribute('aria-label', holiday.name);
            }

            const dayHeader = document.createElement('div');
            dayHeader.className = 'day-header';

            const dayNumber = document.createElement('div');
            dayNumber.className = 'day-number';
            dayNumber.textContent = day;
            dayHeader.appendChild(dayNumber);

            dayElement.appendChild(dayHeader);

            const dayEvents = getEventsForDay(dateStr);

            if (dayEvents.length > 0) {
                const sortedEvents = sortEventsForDay(dateStr, dayEvents);

                const isSmallMobile = window.innerWidth <= 400;

                let chips, extras;
                if (cellPlan) {
                    chips = sortedEvents.slice(0, SPAN_MAX_ROWS);
                    extras = sortedEvents.slice(SPAN_MAX_ROWS);
                } else {
                    chips = isSmallMobile ? [] : sortedEvents.slice(0, 3);
                    extras = isSmallMobile ? sortedEvents : sortedEvents.slice(3);
                }

                if (!isSmallMobile) {
                    const eventsContainer = document.createElement('div');
                    eventsContainer.className = 'events-container';

                    // Eventos de varios días: chip con los días que quedan
                    const makeSpanChip = (ev) => {
                        const category = ev.categoryId ? categories.find(c => c.id === ev.categoryId) : null;
                        const isStart = ev.start === dateStr;
                        const shortTitle = ev.title.length > 15 ? ev.title.substring(0, 12) + '...' : ev.title;
                        const chip = createEventChip(ev, isStart ? shortTitle : '');
                        chip.classList.add('span-seg');
                        if (!isStart) chip.classList.add('seg-blank');

                        const badge = document.createElement('span');
                        badge.className = 'span-days';
                        badge.textContent = daysLeftInclusive(dateStr, ev.end);
                        if (category) {
                            const isImg = category.type === 'image' && category.backgroundImage;
                            badge.style.background = chip.style.color || '#ffffff';
                            badge.style.color = isImg ? '#222222' : category.color;
                        } else {
                            badge.classList.add('no-category-badge');
                        }
                        chip.insertBefore(badge, chip.querySelector('.event-icon'));
                        return chip;
                    };

                    chips.forEach(event => {
                        if (cellPlan && isMultiDayEvent(event)) {
                            eventsContainer.appendChild(makeSpanChip(event));
                            return;
                        }
                        const shortTitle = event.title.length > 15 ? event.title.substring(0, 12) + '...' : event.title;
                        eventsContainer.appendChild(createEventChip(event, shortTitle));
                    });

                    dayElement.appendChild(eventsContainer);
                }

                if (extras.length > 0) {
                    const extraIndicator = document.createElement('div');
                    extraIndicator.className = 'extra-events-indicator';

                    // En móvil pequeño se ven hasta 8 puntos; si no, hasta 3. El resto se resume en "+N"
                    const dotsToShow = Math.min(extras.length, isSmallMobile ? 8 : 3);
                    const remainingEvents = extras.length - dotsToShow;

                    if (remainingEvents > 0) {
                        const additionalCount = document.createElement('span');
                        additionalCount.className = 'additional-count';
                        additionalCount.textContent = '+' + remainingEvents;
                        extraIndicator.appendChild(additionalCount);
                    }

                    for (let i = 0; i < dotsToShow; i++) {
                        const event = extras[i];
                        const category = event.categoryId ? categories.find(c => c.id === event.categoryId) : null;
                        const eventDot = document.createElement('span');
                        eventDot.className = 'event-dot';

                        if (category && category.type !== 'image') {
                            eventDot.style.backgroundColor = category.color;
                        } else {
                            eventDot.style.backgroundColor = '#999';
                        }

                        extraIndicator.appendChild(eventDot);
                    }

                    dayElement.appendChild(extraIndicator);
                }
            }

            if (!isSearchMode) {
                dayElement.querySelectorAll('.event[data-event-id]').forEach(chip => { chip.draggable = true; });
            }

            // Teclado y lectores de pantalla (clic y arrastre se gestionan por delegación)
            dayElement.tabIndex = -1;
            dayElement.setAttribute('role', 'button');
            const longDate = parseD(dateStr).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
            dayElement.setAttribute('aria-label', (holiday ? holiday.name + ', ' : '') + longDate +
                (dayEvents.length ? ', ' + dayEvents.length + (dayEvents.length === 1 ? ' evento' : ' eventos') : ', sin eventos'));

            return dayElement;
        }

        function getEventsForDay(dateStr) {
            if (dayEventsCache && dayEventsCache.has(dateStr)) return dayEventsCache.get(dateStr).slice();
            return events.flatMap(ev => eventOccurrences(ev, dateStr, dateStr));
        }

        function showDayEvents(dateStr) {
            selectedDay = dateStr;
            applyDayModalHoliday(dateStr);
            const date = new Date(dateStr);
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            dayEventsTitleEl.textContent = date.toLocaleDateString('es-ES', options);

            dayEventsListEl.innerHTML = '';

            const dayEvents = getEventsForDay(dateStr).map(e => dayView(e, dateStr));

            if (dayEvents.length === 0) {
                dayEventsListEl.innerHTML =
                    '<div class="empty-state">' +
                    '<i class="fi fi-sr-calendar-xmark"></i>' +
                    '<p>No hay eventos para este día</p>' +
                    '</div>';
            } else {
                // Mismo orden que en la casilla del calendario
                const sortedEvents = sortEventsForDay(dateStr, dayEvents);

                sortedEvents.forEach(event => {
                    addEventToDayList(event);
                });
            }

            dayEventsModal.style.display = 'flex';
            dayEventsListEl.scrollTop = 0;
        }

        function strokeIcon(paths, size) {
            return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0">' + paths + '</svg>';
        }

        function iconPin(size) {
            return strokeIcon('<path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0z"/>', size);
        }

        function iconAlignLeft(size) {
            return strokeIcon('<path d="M4 6l16 0"/><path d="M4 12l10 0"/><path d="M4 18l14 0"/>', size);
        }

        function addEventToDayList(event, target = dayEventsListEl) {
            const category = event.categoryId ? categories.find(c => c.id === event.categoryId) : null;
            const eventElement = document.createElement('div');
            eventElement.className = 'event-item';
            eventElement.dataset.eventId = event.id;

            if (event.important) {
                eventElement.classList.add('important');
            }

            if (!category || !category.icon) {
                eventElement.classList.add('no-icon');
            }

            // Tarjeta "rica": tiene documentos y (ubicación o descripción)
            const hasDocs = (event.docIds || []).some(id => files.some(f => f.id === id));
            const isRich = hasDocs && !!(event.location || event.description);
            const iconBox = isRich ? 32 : 26;     // cuadro del icono
            const iconGlyph = isRich ? 24 : 22;   // tamaño visual del dibujo
            if (isRich) eventElement.classList.add('rich');
            eventElement.style.setProperty('--ico-box', iconBox + 'px');
            eventElement.style.setProperty('--ico-glyph', iconGlyph + 'px');

            let textColor = '#ffffff';
            let isImage = false;

            if (!event.categoryId) {
                eventElement.classList.add('no-category');
                textColor = 'var(--text-color)';
            } else if (category) {
                if (category.type === 'image' && category.backgroundImage) {
                    eventElement.style.backgroundImage = 'url(' + category.backgroundImage + ')';
                    eventElement.style.backgroundSize = 'cover';
                    eventElement.style.backgroundPosition = 'center';
                    const overlay = document.createElement('div');
                    overlay.className = 'event-item-overlay';
                    eventElement.appendChild(overlay);
                    isImage = true;
                    textColor = '#ffffff';
                } else {
                    eventElement.style.backgroundColor = category.color;
                    textColor = getContrastColor(category.color, false);
                }
            }

            const softColor = getSoftColor(category, textColor);

            const eventHeader = document.createElement('div');
            eventHeader.className = 'event-item-header';

            const eventIcon = document.createElement('div');
            eventIcon.className = 'event-item-icon';

            if (category && category.icon) {
                applyIconColor(eventIcon, category.icon, textColor);
            }

            const eventInfo = document.createElement('div');
            eventInfo.className = 'event-info';

            const timeText = event.timeLabel || (event.startTime && event.endTime
                ? event.startTime.substring(0, 5) + ' - ' + event.endTime.substring(0, 5)
                : (event.startTime ? event.startTime.substring(0, 5) : ''));

            const mapsUrl = event.location ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(event.location) : '';
            const locHtml = event.location ? '<div class="event-location" style="color: ' + softColor + '; margin-top: 2px;"><span style="display:flex; flex-shrink:0; margin-right:3px;">' + iconPin(14) + '</span><a class="event-location-link" href="' + mapsUrl + '">' + escapeHtml(event.location) + '</a></div>' : '';
            const timeHtml = timeText ? '<div class="event-time" style="color: ' + softColor + ';">' + timeText + '</div>' : '';
            const titleHtml = '<div class="event-title" style="color: ' + textColor + ';" title="' + escapeHtml(event.title) + '"><span class="event-title-text">' + escapeHtml(event.title) + '</span></div>';

            if (isRich) {
                // Icono grande a la izquierda de título + hora; ubicación, descripción y docs quedan debajo sin sangría
                eventInfo.innerHTML =
                    '<div class="event-top"><div class="event-top-text">' + titleHtml + timeHtml + '</div></div>' +
                    locHtml;
                const topEl = eventInfo.querySelector('.event-top');
                topEl.insertBefore(eventIcon, topEl.firstChild);
            } else {
                eventInfo.innerHTML = titleHtml + timeHtml + locHtml;
            }

            // Descripción con botón de flecha minimalista
            let sepEl = null;
            if (event.description) {
                const descContainer = document.createElement('div');
                descContainer.style.display = 'flex';
                descContainer.style.alignItems = 'flex-start';
                descContainer.style.gap = '5px';
                descContainer.style.marginTop = '4px';
                descContainer.style.width = '100%';

                const descText = document.createElement('div');
                descText.className = 'event-description';
                descText.style.color = softColor;
                descText.style.whiteSpace = 'nowrap';
                descText.style.overflow = 'hidden';
                descText.style.textOverflow = 'ellipsis';
                descText.style.flex = '1';
                descText.style.lineHeight = '1.4';
                descText.style.position = 'relative';
                descText.style.textIndent = '17px';      // sangría solo en la primera línea
                descText.textContent = event.description;

                const descIcon = document.createElement('span');
                descIcon.style.cssText =
                    'position:absolute; left:0; top:0; width:14px; height:1.4em;' +
                    'display:flex; align-items:center; justify-content:center; text-indent:0;';
                descIcon.innerHTML = iconAlignLeft(14);
                descText.appendChild(descIcon);

                const toggleBtn = document.createElement('button');
                toggleBtn.type = 'button';
                toggleBtn.className = 'event-desc-toggle';
                toggleBtn.innerHTML = '<i class="fas fa-chevron-down" style="font-size: 11px;"></i>';
                toggleBtn.style.setProperty('background', 'none', 'important');
                toggleBtn.style.setProperty('border', 'none', 'important');
                toggleBtn.style.setProperty('box-shadow', 'none', 'important');
                toggleBtn.style.setProperty('backdrop-filter', 'none', 'important');
                toggleBtn.style.setProperty('padding', '2px 5px', 'important');
                toggleBtn.style.color = softColor;
                toggleBtn.style.cursor = 'pointer';
                toggleBtn.style.display = 'none';
                toggleBtn.style.alignItems = 'center';
                toggleBtn.style.justifyContent = 'center';
                toggleBtn.style.transition = 'transform 0.3s ease, opacity 0.2s ease';
                toggleBtn.title = 'Mostrar descripción completa';

                // Si el texto se corta, se muestra la flecha y se reserva su hueco en ubicación y hr
                requestAnimationFrame(() => {
                    if (descText.scrollWidth > descText.clientWidth) {
                        toggleBtn.style.display = 'flex';
                        const reserve = toggleBtn.offsetWidth + 5;
                        const locEl = eventInfo.querySelector('.event-location');
                        if (locEl) locEl.style.marginRight = reserve + 'px';
                        if (sepEl) sepEl.style.width = 'calc(100% - ' + reserve + 'px)';
                    }
                });

                let descOpen = false;
                toggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    descOpen = !descOpen;

                    const startH = descText.offsetHeight;
                    let endH;

                    descText.style.overflow = 'hidden';
                    if (descOpen) {
                        descText.classList.add('is-open');
                        descText.style.whiteSpace = 'normal';
                        descText.style.textOverflow = 'clip';
                        endH = descText.scrollHeight;
                    } else {
                        descText.style.whiteSpace = 'nowrap';
                        endH = descText.scrollHeight;
                        descText.style.whiteSpace = 'normal';
                    }

                    descText.style.transition = 'none';
                    descText.style.height = startH + 'px';
                    void descText.offsetHeight;
                    descText.style.transition = 'height 0.3s ease';
                    descText.style.height = endH + 'px';

                    const onEnd = (ev) => {
                        if (ev.propertyName !== 'height') return;
                        descText.removeEventListener('transitionend', onEnd);
                        descText.style.height = '';
                        descText.style.transition = '';
                        if (!descOpen) {
                            descText.classList.remove('is-open');
                            descText.style.whiteSpace = 'nowrap';
                            descText.style.textOverflow = 'ellipsis';
                        }
                    };
                    descText.addEventListener('transitionend', onEnd);

                    toggleBtn.style.transform = descOpen ? 'rotate(180deg)' : 'rotate(0deg)';
                    toggleBtn.title = descOpen ? 'Ocultar descripción' : 'Mostrar descripción completa';
                });

                descContainer.appendChild(descText);
                descContainer.appendChild(toggleBtn);

                // Separador entre ubicación y descripción (solo si hay ubicación)
                if (event.location) {
                    const sep = document.createElement('hr');
                    sep.className = 'event-sep';
                    sep.style.borderTopColor = softColor;
                    sepEl = sep;
                    eventInfo.appendChild(sep);
                }
                eventInfo.appendChild(descContainer);
            }

            if (event.location) {
                const locLink = eventInfo.querySelector('.event-location-link');
                if (locLink) {
                    locLink.title = event.location + ' · clic para abrir en Maps';
                    locLink.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); openInGoogleMaps(event.location); });
                }
            }

            // Docs: en la tarjeta "rica" van fuera de la columna de info, a todo el ancho
            const docChips = buildEventDocChips(event, softColor, textColor, category, isImage, isRich);
            if (docChips && !isRich) eventInfo.appendChild(docChips);

            if (!isRich) eventHeader.appendChild(eventIcon);
            eventHeader.appendChild(eventInfo);

            const eventActions = document.createElement('div');
            eventActions.className = 'event-actions';

            if (event.important) {
                const flag = document.createElement('span');
                flag.className = 'event-flag';
                flag.textContent = '!';
                flag.title = 'Evento importante';
                const titleEl = eventInfo.querySelector('.event-title');
                if (titleEl) titleEl.appendChild(flag);
            }

            const editBtn = document.createElement('button');
            editBtn.className = 'event-action-btn';
            editBtn.innerHTML = '<i class="fa-solid fa-marker"></i>';
            editBtn.style.color = textColor;
            editBtn.style.borderColor = textColor;
            editBtn.title = 'Editar evento';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                editEvent(event.id);
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'event-action-btn';
            deleteBtn.innerHTML = '<i class="fi fi-sr-trash"></i>';
            deleteBtn.style.color = textColor;
            deleteBtn.style.borderColor = textColor;
            deleteBtn.title = 'Eliminar evento';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteEvent(event.id);
            });

            // En hover, el fondo del botón es EXACTAMENTE el color de su borde (textColor)
            [editBtn, deleteBtn].forEach(btn => {
                btn.style.setProperty('--btn-hover-bg', textColor);
            });

            // Categorías de COLOR: en hover el icono toma el color de la categoría
            if (category && category.type !== 'image' && category.color) {
                [editBtn, deleteBtn].forEach(btn => {
                    btn.classList.add('hover-cat-color');
                    btn.style.setProperty('--cat-color', category.color);
                });
            }

            const doneBtn = document.createElement('button');
            doneBtn.className = 'event-action-btn';
            const isDone = isEventDone(event);
            doneBtn.innerHTML = isDone ? '<i style="font-size: 13px; margin-top: 1px !important;" class="fi fi-br-rotate-left"></i>' : '<i style="font-size: 13px; margin-top: 1px !important;" class="fi fi-br-check"></i>';
            doneBtn.title = isDone ? 'Marcar como pendiente' : 'Marcar como hecho';
            if (isDone) eventElement.classList.add('is-done');
            doneBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleEventDone(event.id, event.start); });

            [doneBtn].forEach(btn => {
                btn.style.color = textColor;
                btn.style.borderColor = textColor;
                btn.style.setProperty('--btn-hover-bg', textColor);
                if (category && category.type !== 'image' && category.color) {
                    btn.classList.add('hover-cat-color');
                    btn.style.setProperty('--cat-color', category.color);
                }
            });

            // Los tres botones siempre visibles; el de "hecho" va primero
            const moreBtns = document.createElement('div');
            moreBtns.className = 'event-actions-more';
            moreBtns.appendChild(editBtn);
            moreBtns.appendChild(deleteBtn);
            eventActions.appendChild(doneBtn);
            eventActions.appendChild(moreBtns);

            eventElement.appendChild(eventHeader);
            eventElement.appendChild(eventActions);
            if (docChips && isRich) eventElement.appendChild(docChips);

            target.appendChild(eventElement);

            // Mismo tamaño visual para todos los iconos de categoría
            if (category && category.icon) normalizeCategoryIcon(eventIcon, category.icon, iconGlyph);
        }

        // La hora del aviso solo se pide si hay recordatorio y el evento no tiene hora de inicio
        function syncReminderTimeUI() {
            const row = document.getElementById('reminderTimeRow');
            if (!row) return;
            row.style.display = (document.getElementById('eventReminder').value !== '' && !eventStartTimeEl.value) ? '' : 'none';
        }
        document.getElementById('eventReminder').addEventListener('change', syncReminderTimeUI);
        ['input', 'change'].forEach(t => eventStartTimeEl.addEventListener(t, syncReminderTimeUI));

        function showEventModal(dateStr = null, event = null) {
            const modalTitle = document.getElementById('modalTitle');
            const eventId = document.getElementById('eventId');
            const eventTitle = document.getElementById('eventTitle');
            const eventStart = document.getElementById('eventStart');
            const eventEnd = document.getElementById('eventEnd');
            const eventDescription = document.getElementById('eventDescription');
            const eventImportant = document.getElementById('eventImportant');

            eventForm.reset();
            clearAllEventErrors();
            resetCategoryAppearance();
            closeDayEventsDropdown();

            selectedCategoryId = categories.length > 0 ? categories[0].id : null;
            updateCategorySelection();

            eventStartTimeEl.value = '';
            eventEndTimeEl.value = '';
            eventStartTimeEl.style.borderColor = '';
            eventEndTimeEl.style.borderColor = '';

            if (event) {
                modalTitle.textContent = 'Editar Evento';
                eventId.value = event.id;
                eventTitle.value = event.title;
                eventStart.value = formatDateForInput(event.start);
                eventEnd.value = event.end ? formatDateForInput(event.end) : '';
                eventDescription.value = event.description || '';
                eventImportant.checked = event.important || false;
                editingEventId = event.id;
                selectedCategoryId = event.categoryId || null;

                if (event.startTime) {
                    eventStartTimeEl.value = event.startTime;
                }
                if (event.endTime) {
                    eventEndTimeEl.value = event.endTime;
                }

                updateCategorySelection();
            } else {
                modalTitle.textContent = 'Nuevo Evento';
                const today = dateStr || formatDateForInput(new Date());
                eventStart.value = today;
                eventImportant.checked = false;
                editingEventId = null;
            }

            const evx = event || {};
            document.getElementById('eventRepeat').value = evx.repeat || '';
            csSync('eventRepeat');
            document.getElementById('eventReminder').value = (evx.reminder !== null && evx.reminder !== undefined && evx.reminder !== '') ? String(evx.reminder) : '';
            csSync('eventReminder');
            document.getElementById('eventReminderTime').value = evx.reminderTime || '09:00';
            syncReminderTimeUI();
            document.getElementById('eventRepeatUntil').value = evx.repeatUntil || '';
            document.getElementById('eventLocation').value = evx.location || '';
            refreshLocationList();
            eventDocIds = (evx.docIds || []).filter(id => files.some(f => f.id === id));
            renderEventDocs();
            renderTemplates();
            syncRepeatUI();
            eventModal.style.display = 'flex';
            validateDates();
            validateTimes();
        }

        function handleEventSubmit(e) {
            e.preventDefault();

            const eventId = document.getElementById('eventId').value;
            let title = document.getElementById('eventTitle').value;
            if (title.length > 120) title = title.substring(0, 117) + '...'; // Límite de seguridad
            const start = document.getElementById('eventStart').value;
            const end = document.getElementById('eventEnd').value || start;
            const categoryId = selectedCategoryId ? parseInt(selectedCategoryId) : null;
            const description = document.getElementById('eventDescription').value;
            const important = document.getElementById('eventImportant').checked;
            const startTime = eventStartTimeEl.value || null;
            const endTime = eventEndTimeEl.value || null;

            const badField = validateEventForm();
            if (badField) {
                badField.scrollIntoView({ block: 'center', behavior: 'smooth' });
                if (!badField.closest('.date-input-wrapper, .time-input-wrapper')) badField.focus();
                return;
            }

            if (editingEventId) {
                const eventIndex = events.findIndex(ev => ev.id === editingEventId);
                if (eventIndex !== -1) {
                    events[eventIndex] = {
                        ...events[eventIndex],
                        title,
                        start,
                        end: end !== start ? end : null,
                        categoryId,
                        description,
                        important,
                        startTime,
                        endTime
                    };
                }
            } else {
                const newEvent = {
                    id: Date.now(),
                    title,
                    start,
                    end: end !== start ? end : null,
                    categoryId,
                    description,
                    important,
                    startTime,
                    endTime
                };
                events.push(newEvent);
            }

            const tgt = editingEventId ? events.find(ev => ev.id === editingEventId) : events[events.length - 1];
            if (tgt) {
                tgt.location = document.getElementById('eventLocation').value.trim() || null;
                const keepDocs = eventDocIds.filter(id => files.some(f => f.id === id)).slice(0, MAX_EVENT_DOCS);
                if (keepDocs.length) tgt.docIds = keepDocs; else delete tgt.docIds;
                // Un evento con fecha final (varios días) no se repite; "Cada lunes del mes" tampoco usa "repetir hasta"
                tgt.repeat = tgt.end ? null : (document.getElementById('eventRepeat').value || null);
                tgt.repeatUntil = (tgt.repeat && tgt.repeat !== 'monthWeekly') ? (document.getElementById('eventRepeatUntil').value || null) : null;
                const remV = document.getElementById('eventReminder').value;
                tgt.reminder = remV === '' ? null : Number(remV);
                const remT = document.getElementById('eventReminderTime').value;
                if (tgt.reminder !== null && !tgt.startTime && validTimeStr(remT)) tgt.reminderTime = remT;
                else delete tgt.reminderTime;
            }
            safeSave('calendarEvents', events);

            eventModal.style.display = 'none';
            closeDayEventsDropdown();
            renderCalendar();
            loadUpcomingEvents();
            if (agendaPopupOpen) renderAgenda();

            if (dayEventsModal.style.display === 'flex') {
                showDayEvents(selectedDay);
            }
        }

        function editEvent(eventId) {
            const event = events.find(ev => ev.id === eventId);
            if (event) {
                dayEventsModal.style.display = 'none';
                showEventModal(null, event);
            }
        }

        async function deleteEvent(eventId) {
            const event = events.find(ev => ev.id === eventId);
            if (!event) return;

            showConfirmModal({
                title: 'Eliminar evento',
                message: '¿Seguro que quieres eliminar el evento "' + event.title + '"? Podrás recuperarlo con Ctrl+Z.',
                cancelText: 'Cancelar',
                deleteText: 'Eliminar',
                onConfirm: () => {
                    events = events.filter(ev => ev.id !== eventId);
                    safeSave('calendarEvents', events);
                    showToast('Evento eliminado', 'ok', { label: 'Deshacer', fn: undo });

                    renderCalendar();
                    loadUpcomingEvents();
                    if (agendaPopupOpen) renderAgenda();

                    // Solo refresca el modal del día si ya estaba abierto
                    if (dayEventsModal.style.display === 'flex') {
                        showDayEvents(selectedDay);
                    }
                }
            });
        }

        // ============================================
        // MODAL DE CONFIRMACIÓN PERSONALIZADO
        // ============================================
        let confirmAltCallback = null;
        function showConfirmModal(options) {
            const {
                title = 'Confirmar acción', message = '¿Estás seguro?',
                cancelText = 'Cancel', deleteText = 'Delete', variant = 'danger',
                onConfirm = null, onCancel = null, altText = '', onAlt = null
            } = options;
            // Tercera opción (opcional): botones apilados -> principal, alternativa y cancelar
            let altBtn = document.getElementById('confirmAltBtn');
            if (!altBtn) {
                altBtn = document.createElement('button');
                altBtn.type = 'button'; altBtn.id = 'confirmAltBtn';
                altBtn.className = 'confirm-btn confirm-btn-cancel';
                confirmCancelBtn.parentNode.insertBefore(altBtn, confirmDeleteBtn);
                altBtn.addEventListener('click', () => {
                    const cb = confirmAltCallback;
                    confirmCallback = null; confirmCancelCallback = null; confirmAltCallback = null;
                    closeConfirmModal();
                    if (typeof cb === 'function') setTimeout(cb, 50);
                });
            }
            confirmAltCallback = altText ? onAlt : null;
            altBtn.textContent = altText;
            altBtn.style.display = altText ? '' : 'none';
            const actions = confirmCancelBtn.parentNode;
            actions.style.flexDirection = altText ? 'column' : '';
            confirmDeleteBtn.style.order = altText ? '1' : '';
            altBtn.style.order = altText ? '2' : '';
            confirmCancelBtn.style.order = altText ? '3' : '';
            confirmTitle.textContent = title;
            confirmMessage.textContent = message;
            confirmCancelBtn.textContent = cancelText;
            confirmDeleteBtn.textContent = deleteText;
            confirmCallback = onConfirm;
            confirmCancelCallback = onCancel;
            confirmModal.classList.toggle('confirm-save', variant === 'save');
            confirmModal.style.display = 'flex';
            requestAnimationFrame(() => confirmModal.classList.add('open'));
        }

        function closeConfirmModal() {
            confirmModal.classList.remove('open');
            setTimeout(() => { confirmModal.style.display = 'none'; }, 250);
        }

        confirmCancelBtn.addEventListener('click', () => {
            const cb = confirmCancelCallback;
            confirmCallback = null; confirmCancelCallback = null;
            closeConfirmModal();
            if (typeof cb === 'function') setTimeout(cb, 50);
        });

        confirmDeleteBtn.addEventListener('click', () => {
            const cb = confirmCallback;
            confirmCallback = null; confirmCancelCallback = null;
            closeConfirmModal();
            if (typeof cb === 'function') setTimeout(cb, 50);
        });


        // (El modal de confirmación tampoco se cierra al pulsar fuera: solo con sus botones)

        // ============================================
        // FUNCIONES DE DOCUMENTOS
        // ============================================
        function renderFolderColorOptions() {
            folderColorOptions.innerHTML = '';
            folderColors.forEach(color => {
                const swatch = document.createElement('div');
                swatch.className = 'color-swatch';
                swatch.style.backgroundColor = color;
                if (color === selectedFolderColor) {
                    swatch.classList.add('selected');
                }
                swatch.addEventListener('click', () => {
                    selectedFolderColor = color;
                    folderCustomColor.value = color;
                    renderFolderColorOptions();
                });
                folderColorOptions.appendChild(swatch);
            });
        }

        // ---------- Utilidades del árbol de carpetas ----------
        function colorToRgba(hex, alpha) {
            const c = hexToRgb(hex);
            return 'rgba(' + c.r + ', ' + c.g + ', ' + c.b + ', ' + alpha + ')';
        }

        function sortByRecent(a, b) {
            const aTime = a.updatedAt || a.createdAt || a.id || 0;
            const bTime = b.updatedAt || b.createdAt || b.id || 0;
            return bTime - aTime;
        }

        // Carpeta superior válida (si apunta a una carpeta que ya no existe, cuenta como nivel principal)
        function getFolderParentId(folder) {
            const p = folder.parentId;
            if (p === null || p === undefined || p === folder.id) return null;
            return folders.some(f => f.id === p) ? p : null;
        }

        function getChildFolders(parentId) {
            return folders.filter(f => getFolderParentId(f) === parentId).sort(sortByRecent);
        }

        function getFolderDescendantIds(folderId) {
            const result = new Set();
            const walk = (id) => {
                getChildFolders(id).forEach(child => {
                    if (!result.has(child.id)) {
                        result.add(child.id);
                        walk(child.id);
                    }
                });
            };
            walk(folderId);
            return result;
        }

        // Archivos dentro de una carpeta y de todas sus subcarpetas
        function countFilesDeep(folderId) {
            const ids = getFolderDescendantIds(folderId);
            ids.add(folderId);
            return files.filter(f => ids.has(f.folderId)).length;
        }

        // Selector de carpetas en forma de árbol (lo usan el modal de carpeta y "Guardar como")
        function renderFolderTreePicker(container, opts) {
            const selectedId = opts.selectedId === undefined ? null : opts.selectedId;
            const excludeIds = opts.excludeIds || new Set();
            const scrollTop = container.scrollTop;
            const scrollLeft = container.scrollLeft;

            container.innerHTML = '';

            const choose = (id) => {
                opts.onSelect(id);
                renderFolderTreePicker(container, { ...opts, selectedId: id });
            };

            const makeRow = (id, name, color, iconUrl, rootIconClass) => {
                const row = document.createElement('div');
                row.className = 'tp-row' + (id === selectedId ? ' selected' : '');
                row.style.setProperty('--tp-color', color);
                row.style.setProperty('--tp-soft', colorToRgba(color, 0.14));

                const icon = document.createElement('span');
                icon.className = 'tp-icon';
                if (iconUrl) {
                    const img = document.createElement('img');
                    img.src = iconUrl;
                    img.alt = '';
                    icon.appendChild(img);
                } else {
                    icon.innerHTML = '<i class="' + (rootIconClass || 'fi fi-sr-folder') + '"></i>';
                }

                const label = document.createElement('span');
                label.className = 'tp-name';
                label.textContent = name;

                const check = document.createElement('i');
                check.className = 'fas fa-check tp-check';

                row.appendChild(icon);
                row.appendChild(label);
                row.appendChild(check);
                row.addEventListener('click', () => choose(id));
                return row;
            };

            const buildLevel = (parentId, target) => {
                getChildFolders(parentId)
                    .filter(f => !excludeIds.has(f.id))
                    .forEach(folder => {
                        const color = folder.color || '#3c6df0';
                        const node = document.createElement('div');
                        node.className = 'tp-node';
                        node.appendChild(makeRow(folder.id, folder.name, color, folder.icon));

                        const hasKids = getChildFolders(folder.id).some(f => !excludeIds.has(f.id));
                        if (hasKids) {
                            const wrap = document.createElement('div');
                            wrap.className = 'tp-children';
                            wrap.style.setProperty('--rail', colorToRgba(color, 0.5));
                            buildLevel(folder.id, wrap);
                            node.appendChild(wrap);
                        }
                        target.appendChild(node);
                    });
            };

            const rootNode = document.createElement('div');
            rootNode.className = 'tp-node';
            rootNode.appendChild(makeRow(null, opts.rootLabel, '#8a8f9c', null, 'fas fa-inbox'));

            const rootChildren = document.createElement('div');
            rootChildren.className = 'tp-children';
            buildLevel(null, rootChildren);
            if (rootChildren.children.length > 0) rootNode.appendChild(rootChildren);

            container.appendChild(rootNode);
            container.scrollTop = scrollTop;
            container.scrollLeft = scrollLeft;
        }

        function renderDocuments() {
            if (docSearchTerm) { renderDocSearchResults(); return; }
            documentsContent.innerHTML = '';
            documentsContent.classList.toggle('unsorted', folderOrderMode !== 'ordered');

            if (folderOrderMode === 'ordered') {
                const rootFolders = getChildFolders(null);

                if (rootFolders.length === 0) {
                    documentsContent.innerHTML =
                        '<div class="no-files-message" style="margin-top: 30px;">' +
                        '<i class="fi fi-sr-folder-open"></i>' +
                        '<br>No hay carpetas creadas' +
                        '</div>';
                    return;
                }

                // Niveles de subcarpetas de cada rama (para repartir la sangría por igual)
                const levelsOf = (f, seen) => {
                    if (seen.has(f.id)) return 0;
                    seen.add(f.id);
                    return getChildFolders(f.id).reduce((m, c) => Math.max(m, 1 + levelsOf(c, seen)), 0);
                };
                rootFolders.forEach(folder => {
                    const n = buildFolderNode(folder);
                    n.style.setProperty('--D', Math.max(1, levelsOf(folder, new Set())));
                    documentsContent.appendChild(n);
                });
            } else {
                // Sin ordenar: solo los archivos que no están en ninguna carpeta
                const looseFiles = files
                    .filter(f => !f.folderId || !folders.some(x => x.id === f.folderId))
                    .sort(sortByRecent);

                if (looseFiles.length === 0) {
                    documentsContent.innerHTML =
                        '<div class="no-files-message" style="margin-top: 30px;">' +
                        '<i class="fas fa-file-circle-xmark"></i>' +
                        'No hay archivos sueltos' +
                        '</div>';
                    return;
                }

                looseFiles.forEach(file => {
                    documentsContent.appendChild(createFileElement(file, null));
                });
            }
        }

        const folderOpenState = new Map();   // id de carpeta -> abierta/cerrada a mano
        // Construye una carpeta (tarjeta + archivos) y, debajo, sus subcarpetas unidas por el árbol
        function buildFolderNode(folder, depth = 0) {
            const folderFiles = files
                .filter(f => f.folderId === folder.id)
                .sort(sortByRecent);
            const childFolders = getChildFolders(folder.id);

            // Cerrada por defecto; abierta solo si hay documentos dentro (o en sus subcarpetas).
            // Si la persona la abrió o cerró a mano, se respeta mientras la app esté abierta.
            const hasDocsInside = childFolders.length > 0 ? countFilesDeep(folder.id) > 0 : folderFiles.length > 0;
            const initialOpen = folderOpenState.has(folder.id) ? folderOpenState.get(folder.id) : hasDocsInside;

            const folderColor = folder.color || '#3c6df0';
            const folderTextColor = getContrastText(folderColor);
            const lightFolderBg = lightenColorAlpha(folderColor, 0.75, 0.5);

            const node = document.createElement('div');
            node.className = 'tree-node';

            const folderItem = document.createElement('div');
            folderItem.className = 'folder-item';

            const folderHeader = document.createElement('div');
            folderHeader.className = 'folder-header' + (depth >= 2 ? ' compact' : '');
            folderHeader.style.backgroundColor = folderColor;
            folderHeader.style.color = folderTextColor;

            const folderToggleIcon = document.createElement('div');
            folderToggleIcon.className = 'folder-toggle-icon';
            folderToggleIcon.style.color = folderTextColor;
            folderToggleIcon.style.borderColor = 'rgba(255,255,255,0.4)';
            if (folder.icon) {
                const iconImg = document.createElement('img');
                iconImg.src = folder.icon;
                iconImg.alt = folder.name;
                folderToggleIcon.appendChild(iconImg);
            } else {
                folderToggleIcon.innerHTML = initialOpen
                    ? '<i class="fi fi-sr-folder-open"></i>'
                    : '<i class="fi fi-sr-folder"></i>';
            }

            const folderName = document.createElement('span');
            folderName.className = 'folder-name';
            folderName.textContent = folder.name;
            folderName.style.color = folderTextColor;

            const folderCount = document.createElement('span');
            folderCount.className = 'folder-count';
            const totalFiles = countFilesDeep(folder.id);
            folderCount.textContent = totalFiles;
            folderCount.style.color = folderTextColor;

            const folderActions = document.createElement('div');
            folderActions.className = 'folder-actions';

            const addSubfolderBtn = document.createElement('button');
            addSubfolderBtn.className = 'folder-action-btn';
            addSubfolderBtn.innerHTML = '<i class="fi fi-sr-add-folder"></i>';
            addSubfolderBtn.title = 'Nueva subcarpeta';
            addSubfolderBtn.style.color = folderTextColor;
            addSubfolderBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openNewFolderModal(folder.id);
            });

            const editFolderBtn = document.createElement('button');
            editFolderBtn.className = 'folder-action-btn';
            editFolderBtn.innerHTML = '<i class="fa-solid fa-marker"></i>';
            editFolderBtn.title = 'Editar carpeta';
            editFolderBtn.style.color = folderTextColor;
            editFolderBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                editFolder(folder);
            });

            const deleteFolderBtn = document.createElement('button');
            deleteFolderBtn.className = 'folder-action-btn';
            deleteFolderBtn.innerHTML = '<i class="fi fi-sr-trash"></i>';
            deleteFolderBtn.title = 'Eliminar carpeta';
            deleteFolderBtn.style.color = folderTextColor;
            deleteFolderBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const parentId = getFolderParentId(folder);
                showConfirmModal({
                    title: 'Eliminar carpeta',
                    message: parentId
                        ? '¿Seguro que quieres eliminar la carpeta "' + folder.name + '"? Sus archivos y subcarpetas pasarán a la carpeta superior.'
                        : '¿Seguro que quieres eliminar la carpeta "' + folder.name + '"? Los archivos dentro se quedarán sin carpeta y las subcarpetas pasarán al nivel principal.',
                    cancelText: 'Cancelar',
                    deleteText: 'Eliminar',
                    onConfirm: () => {
                        // El contenido no se pierde: sube un nivel
                        files = files.map(f => {
                            if (f.folderId === folder.id) {
                                return { ...f, folderId: parentId, updatedAt: Date.now() };
                            }
                            return f;
                        });
                        folders = folders
                            .filter(f => f.id !== folder.id)
                            .map(f => (f.parentId === folder.id ? { ...f, parentId: parentId } : f));
                        safeSave('calendarFolders', folders);
                        safeSave('calendarFiles', files);
                        renderDocuments();
                        showToast('Carpeta eliminada', 'ok', { label: 'Deshacer', fn: undo });
                    }
                });
            });

            folderActions.appendChild(addSubfolderBtn);
            folderActions.appendChild(editFolderBtn);
            folderActions.appendChild(deleteFolderBtn);

            folderHeader.appendChild(folderToggleIcon);
            folderHeader.appendChild(folderName);
            // El contador solo aparece a partir de 1 documento
            if (totalFiles > 0) folderHeader.appendChild(folderCount);
            folderHeader.appendChild(folderActions);

            const folderFilesContainer = document.createElement('div');
            folderFilesContainer.className = 'folder-files' + (initialOpen ? ' open' : '');
            folderFilesContainer.style.backgroundColor = lightFolderBg;

            const filesInner = document.createElement('div');
            filesInner.className = 'folder-files-inner';
            const filesBody = document.createElement('div');
            filesBody.className = 'folder-files-body';
            filesInner.appendChild(filesBody);
            folderFilesContainer.appendChild(filesInner);

            folderFiles.forEach(file => {
                filesBody.appendChild(createFileElement(file, folderColor));
            });

            if (folderFiles.length === 0) {
                if (childFolders.length > 0) {
                    // Solo subcarpetas: no hace falta la franja vacía de archivos
                    folderFilesContainer.classList.add('is-empty');
                } else {
                    const emptyMsg = document.createElement('div');
                    emptyMsg.className = 'no-files-message';
                    emptyMsg.innerHTML = '<i class="fas fa-inbox"></i> Carpeta vacía';
                    filesBody.appendChild(emptyMsg);
                }
            }

            folderItem.appendChild(folderHeader);
            folderItem.appendChild(folderFilesContainer);
            node.appendChild(folderItem);

            // Subcarpetas (recursivo)
            let childrenWrap = null;
            if (childFolders.length > 0) {
                const treeChildren = document.createElement('div');
                treeChildren.className = 'tree-children';
                treeChildren.style.setProperty('--rail', colorToRgba(folderColor, 0.75));
                // Cuanto más profundo, menos sangría entre una carpeta y su hija
                if (depth + 1 >= 2) treeChildren.style.setProperty('--elbow', '22px');
                childFolders.forEach(child => {
                    treeChildren.appendChild(buildFolderNode(child, depth + 1));
                });
                const collapseInner = document.createElement('div');
                collapseInner.className = 'tree-collapse-inner';
                collapseInner.appendChild(treeChildren);
                childrenWrap = document.createElement('div');
                childrenWrap.className = 'tree-collapse' + (initialOpen ? ' open' : '');
                childrenWrap.appendChild(collapseInner);
                node.appendChild(childrenWrap);
            }

            // Abrir / cerrar: afecta a los archivos y a las subcarpetas a la vez
            const setOpen = (open) => {
                folderOpenState.set(folder.id, open);
                folderFilesContainer.classList.toggle('open', open);
                if (childrenWrap) childrenWrap.classList.toggle('open', open);
                if (!folder.icon) {
                    folderToggleIcon.innerHTML = open
                        ? '<i class="fi fi-sr-folder-open"></i>'
                        : '<i class="fi fi-sr-folder"></i>';
                }
            };
            const toggleFolder = (e) => {
                e.stopPropagation();
                setOpen(!folderFilesContainer.classList.contains('open'));
            };
            folderToggleIcon.addEventListener('click', toggleFolder);
            folderName.addEventListener('click', toggleFolder);

            return node;
        }

        function createFileElement(file, folderColor) {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.style.cursor = 'pointer';

            const att = isAttachment(file) ? ATTACH_KINDS[file.ext] : null;
            const fileIcon = document.createElement('i');
            fileIcon.className = att ? att.icon : 'fi fi-sr-document';
            if (att) {
                fileIcon.style.color = att.color;
            } else if (folderColor) {
                const rgb = hexToRgb(folderColor);
                fileIcon.style.color = 'rgb(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ')';
            }

            const fileInfo = document.createElement('div');
            fileInfo.className = 'file-info';

            const fileTitle = document.createElement('div');
            fileTitle.className = 'file-title';
            fileTitle.textContent = file.title;

            const fileDesc = document.createElement('div');
            fileDesc.className = 'file-description';
            const dateValue = file.updatedAt || file.createdAt;
            if (att) {
                fileDesc.textContent = att.label + (file.size ? ' · ' + formatBytes(file.size) : '') + (dateValue ? ' · Importado: ' + formatShortDate(dateValue) : '');
            } else if (dateValue) {
                fileDesc.textContent = 'Editado: ' + formatShortDate(dateValue);
            } else {
                fileDesc.textContent = 'Sin fecha';
            }

            fileInfo.appendChild(fileTitle);
            fileInfo.appendChild(fileDesc);

            fileItem.appendChild(fileIcon);
            fileItem.appendChild(fileInfo);

            if (att) {   // Word / PDF importado: se abre dentro de la app (y se puede abrir con otro programa)
                const actions = document.createElement('div');
                actions.className = 'file-actions';
                const mk = (icon, title, cls, fn) => {
                    const b = document.createElement('button');
                    b.type = 'button'; b.className = 'file-action-btn' + (cls ? ' ' + cls : ''); b.title = title;
                    b.innerHTML = '<i class="' + icon + '"></i>';
                    b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); });
                    return b;
                };
                actions.appendChild(mk('fi fi-sr-leave', 'Abrir con otro programa', '', () => openAttachmentWith(file)));
                actions.appendChild(mk('fa-solid fa-marker', 'Renombrar o mover', '', () => openEditAttachmentModal(file)));
                actions.appendChild(mk('fi fi-sr-trash', 'Quitar', 'danger', () => deleteAttachment(file)));
                fileItem.appendChild(actions);
                fileItem.title = (file.ext === 'pdf' || file.ext === 'docx' || file.inApp) ? 'Abrir en la aplicación' : 'Abrir con el programa predeterminado';
                fileItem.addEventListener('click', () => openAttachmentInApp(file));
                return fileItem;
            }

            fileItem.addEventListener('click', () => {
                // NUEVO: Si hay un editor minimizado, no permitir abrir otro documento
                if (isEditorHidden) {
                    showConfirmModal({
                        title: 'Documento minimizado',
                        message: 'Tienes un documento minimizado. Debes cerrarlo o guardarlo antes de abrir otro.',
                        cancelText: 'Cancelar',
                        deleteText: 'Abrir el minimizado',
                        onConfirm: () => {
                            showDocEditor();
                        }
                    });
                    return;
                }
                openDocEditor(file);
            });

            return fileItem;
        }

        // Abre el modal para crear una carpeta (parentId = carpeta donde se crea; null = nivel principal)
        function openNewFolderModal(parentId = null) {
            editingFolderId = null;
            folderModalTitle.textContent = parentId ? 'Nueva subcarpeta' : 'Nueva Carpeta';
            folderIdEl.value = '';
            folderNameEl.value = '';
            selectedFolderColor = '#3c6df0';
            folderCustomColor.value = '#3c6df0';
            selectedFolderIcon = null;
            currentFolderIconUpload = null;
            folderIconUpload.value = '';
            folderIconPreview.innerHTML = '<i class="fas fa-folder"></i>';
            selectedFolderParent = parentId;
            renderFolderParentPicker();
            renderFolderColorOptions();
            folderModal.style.display = 'flex';
            folderNameEl.focus();
        }

        // Árbol para elegir dónde vive la carpeta (al editar no se puede meter dentro de sí misma ni de sus hijas)
        function renderFolderParentPicker() {
            const exclude = new Set();
            if (editingFolderId) {
                exclude.add(editingFolderId);
                getFolderDescendantIds(editingFolderId).forEach(id => exclude.add(id));
            }
            renderFolderTreePicker(folderParentPicker, {
                selectedId: selectedFolderParent,
                excludeIds: exclude,
                rootLabel: 'Nivel principal (sin carpeta superior)',
                onSelect: (id) => { selectedFolderParent = id; }
            });
        }

        function editFolder(folder) {
            editingFolderId = folder.id;
            selectedFolderParent = getFolderParentId(folder);
            renderFolderParentPicker();
            folderModalTitle.textContent = 'Editar Carpeta';
            folderIdEl.value = folder.id;
            folderNameEl.value = folder.name;
            selectedFolderColor = folder.color || '#3c6df0';
            folderCustomColor.value = selectedFolderColor;
            selectedFolderIcon = folder.icon || null;
            currentFolderIconUpload = folder.icon || null;
            folderIconUpload.value = '';
            if (folder.icon) {
                folderIconPreview.innerHTML = '<img src="' + folder.icon + '" alt="Icono de carpeta">';
            } else {
                folderIconPreview.innerHTML = '<i class="fas fa-folder"></i>';
            }
            renderFolderColorOptions();
            folderModal.style.display = 'flex';
            folderNameEl.focus();
        }

        function handleFolderSubmit(e) {
            e.preventDefault();

            const name = folderNameEl.value.trim();
            const now = Date.now();
            if (!name) return;

            // Seguridad: una carpeta nunca puede quedar dentro de sí misma ni de sus subcarpetas
            let parentId = selectedFolderParent;
            if (editingFolderId && parentId !== null &&
                (parentId === editingFolderId || getFolderDescendantIds(editingFolderId).has(parentId))) {
                parentId = null;
            }

            const folderData = {
                name,
                color: selectedFolderColor,
                icon: selectedFolderIcon,
                parentId: parentId,
                updatedAt: now
            };

            if (editingFolderId) {
                const folderIndex = folders.findIndex(f => f.id === editingFolderId);
                if (folderIndex !== -1) {
                    folders[folderIndex] = {
                        ...folders[folderIndex],
                        ...folderData
                    };
                }
            } else {
                folders.push({
                    id: now,
                    ...folderData,
                    createdAt: now
                });
            }

            safeSave('calendarFolders', folders);
            folderModal.style.display = 'none';
            editingFolderId = null;
            renderDocuments();
        }

        // ============================================
        // EDITOR DE DOCUMENTOS (A4 + paginación por desbordamiento)
        // ============================================

        function getDefaultDocumentName() {
            let n = 1;
            while (files.some(f => f.title === 'Documento' + n)) {
                n++;
            }
            return 'Documento' + n;
        }

        function getPageUsableHeight() {
            const firstPage = docEditorPages.querySelector('.doc-editor-page');
            if (!firstPage) return 0;
            const style = window.getComputedStyle(firstPage);
            const pt = parseFloat(style.paddingTop) || 0;
            const pb = parseFloat(style.paddingBottom) || 0;
            return firstPage.clientHeight - pt - pb;
        }

        function createNewPage(pageNumber) {
            const page = document.createElement('div');
            page.className = 'doc-editor-page';
            page.contentEditable = 'true';
            page.spellcheck = true;
            page.setAttribute('data-page-number', pageNumber);
            stylePage(page);
            return page;
        }

        function fitPagesToWidth() {
            if (docViewerState) { layoutViewer(); return; }
            const mobile = window.matchMedia('(max-width: 768px)').matches;
            const pageW = 210 * (96 / 25.4), pageH = 297 * (96 / 25.4);
            const fit = Math.min(1, Math.max(0, docEditorBody.clientWidth - 20) / pageW);
            const scale = mobile ? Math.max(fit, 0.75) : fit;
            const pans = scale > fit + 0.001;
            docEditorPages.style.alignItems = pans ? 'flex-start' : '';
            docEditorBody.style.overflowX = pans ? 'auto' : '';
            docEditorPages.querySelectorAll('.doc-editor-page').forEach(page => {
                page.style.transformOrigin = pans ? 'top left' : '';
                page.style.transform = 'scale(' + scale + ')';
                page.style.marginBottom = (pageH * scale - pageH) + 'px';
                page.style.marginLeft = pans ? '10px' : '';
                page.style.marginRight = pans ? (pageW * scale - pageW + 10) + 'px' : '';
            });
        }

        // --- Seguimiento del cursor: al mover contenido entre páginas el cursor no se pierde ---
        let caretTrack = null;
        const continuationBlocks = new WeakSet();

        function captureCaret() {
            caretTrack = null;
            const sel = window.getSelection();
            if (!sel.rangeCount || !sel.isCollapsed) return null;
            const node = sel.anchorNode;
            if (!node || !docEditorPages.contains(node)) return null;
            const page = (node.nodeType === 1 ? node : node.parentElement).closest('.doc-editor-page');
            caretTrack = { node: node, offset: sel.anchorOffset, page: page };
            return caretTrack;
        }

        function restoreCaret() {
            const c = caretTrack;
            caretTrack = null;
            if (!c || !c.node.isConnected) return;
            const sel = window.getSelection();
            if (sel.rangeCount && sel.isCollapsed && sel.anchorNode === c.node && sel.anchorOffset === c.offset) return;

            const max = c.node.nodeType === 3 ? c.node.length : c.node.childNodes.length;
            const el = c.node.nodeType === 1 ? c.node : c.node.parentElement;
            const newPage = el && el.closest('.doc-editor-page');
            if (!newPage) return;
            if (document.activeElement !== newPage) newPage.focus({ preventScroll: true });

            const r = document.createRange();
            r.setStart(c.node, Math.min(c.offset, max));
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);

            // Si el cursor pasó a otra página, se muestra
            if (newPage !== c.page && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
        }

        // Envuelve texto suelto de una página en un bloque para poder partirlo
        function wrapLooseRoot(page) {
            const wrapper = document.createElement('div');
            while (page.firstChild) wrapper.appendChild(page.firstChild);
            page.appendChild(wrapper);
            return wrapper;
        }

        // Un único bloque más alto que la página: se parte por palabras y el resto pasa a la página siguiente
        function splitOversizeChild(page, nextPage, usableHeight) {
            let child = page.firstChild;
            if (!child) return false;
            if (child.nodeType === 3) child = wrapLooseRoot(page);
            if (child.nodeType !== 1 || !/^(DIV|P|H1|H2|H3|BLOCKQUOTE)$/.test(child.nodeName)) return false;

            // Nodos de texto del bloque, en orden
            const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
            const texts = [];
            let total = 0;
            let tn;
            while ((tn = walker.nextNode())) {
                texts.push(tn);
                total += tn.length;
            }
            if (total < 2) return false;

            const cs = window.getComputedStyle(page);
            const pt = parseFloat(cs.paddingTop) || 0;
            const pr = page.getBoundingClientRect();
            const scale = (page.offsetHeight > 0 && pr.height > 0) ? pr.height / page.offsetHeight : 1;
            const limit = pr.top + (pt + usableHeight + 2) * scale;

            const locate = (p) => {
                let acc = 0;
                for (let i = 0; i < texts.length; i++) {
                    if (acc + texts[i].length >= p) return { node: texts[i], offset: p - acc };
                    acc += texts[i].length;
                }
                const last = texts[texts.length - 1];
                return { node: last, offset: last.length };
            };
            const fits = (p) => {
                if (p <= 0) return true;
                const pos = locate(p);
                const r = document.createRange();
                r.setStart(child, 0);
                r.setEnd(pos.node, pos.offset);
                return r.getBoundingClientRect().bottom <= limit;
            };

            let lo = 0, hi = total - 1;
            while (lo < hi) {
                const mid = Math.ceil((lo + hi) / 2);
                if (fits(mid)) lo = mid; else hi = mid - 1;
            }
            let cut = lo;
            if (cut <= 0) return false;

            // Ajustar a final de palabra
            const full = texts.map(t => t.nodeValue).join('');
            const sp = full.lastIndexOf(' ', cut - 1);
            if (sp > 0) cut = sp + 1;
            if (cut >= total) return false;

            const pos = locate(cut);
            let startNode = pos.node;
            let startOffset = pos.offset;
            const range = document.createRange();

            if (startOffset > 0 && startOffset < startNode.length) {
                const original = startNode;
                const tail = original.splitText(startOffset);
                if (caretTrack && caretTrack.node === original && caretTrack.offset > startOffset) {
                    caretTrack.node = tail;
                    caretTrack.offset -= startOffset;
                }
                range.setStartBefore(tail);
            } else if (startOffset === 0) {
                range.setStartBefore(startNode);
            } else {
                range.setStartAfter(startNode);
            }
            range.setEnd(child, child.childNodes.length);
            const fragment = range.extractContents();

            let cont = nextPage.firstChild;
            if (!(cont && continuationBlocks.has(cont) && cont.nodeName === child.nodeName)) {
                cont = child.cloneNode(false);
                continuationBlocks.add(cont);
                nextPage.insertBefore(cont, nextPage.firstChild);
            }
            cont.insertBefore(fragment, cont.firstChild);

            if (caretTrack && caretTrack.node === child) {
                caretTrack.offset = Math.min(caretTrack.offset, child.childNodes.length);
            }
            return true;
        }

        // ---------- Paginación rápida ----------
        // Se mide cada hoja UNA vez (todas las lecturas juntas) y el contenido que sobra se mueve por lotes.
        // Antes se movía un bloque y se volvía a medir en cada paso, lo que forzaba un recálculo de maquetación por bloque.
        const PAGE_TOL = 2;
        const pageMeasureRange = document.createRange();

        function measurePage(page, ctx) {
            const pr = page.getBoundingClientRect();
            const sc = (page.offsetHeight > 0 && pr.height > 0) ? pr.height / page.offsetHeight : 1;
            const nodes = Array.from(page.childNodes);
            const tops = new Array(nodes.length), bottoms = new Array(nodes.length);
            let last = 0;
            for (let k = 0; k < nodes.length; k++) {
                const n = nodes[k];
                let r = null;
                if (n.nodeType === 1) r = n.getBoundingClientRect();
                else if (n.nodeType === 3 && n.nodeValue.length) { pageMeasureRange.selectNode(n); r = pageMeasureRange.getBoundingClientRect(); }
                if (r && (r.height > 0 || r.width > 0)) {
                    tops[k] = (r.top - pr.top) / sc - ctx.pt;
                    bottoms[k] = (r.bottom - pr.top) / sc - ctx.pt;
                    if (bottoms[k] > last) last = bottoms[k];
                } else { tops[k] = bottoms[k] = last; }
            }
            return { nodes, tops, bottoms, bottom: last, pr, sc };
        }

        // Nº de <li> de una lista que caben antes de 'limit' (medido de una vez)
        function listFitCount(list, m, ctx, limit) {
            const lis = Array.from(list.children);
            let j = 0;
            for (; j < lis.length; j++) {
                const r = lis[j].getBoundingClientRect();
                if ((r.bottom - m.pr.top) / m.sc - ctx.pt > limit) break;
            }
            return j;
        }

        // Nº de filas de una tabla que caben antes de 'limit'
        function tableFitCount(table, m, ctx, limit) {
            const rows = Array.from(table.rows);
            let j = 0;
            for (; j < rows.length; j++) {
                const r = rows[j].getBoundingClientRect();
                if ((r.bottom - m.pr.top) / m.sc - ctx.pt > limit) break;
            }
            return j;
        }
        // Parte 'table' tras sus primeras j filas; el resto (y los bloques 'rest') va al principio de nextPage
        function splitTableInto(table, j, nextPage, rest) {
            const rows = Array.from(table.rows).slice(j);
            const t0 = nextPage.firstChild;
            if (!rest.length && t0 && t0.nodeName === 'TABLE' && continuationBlocks.has(t0)) {
                const tb = t0.tBodies[0] || t0;
                rows.reverse().forEach(r => tb.insertBefore(r, tb.firstChild));
                return;
            }
            const nt = table.cloneNode(false);
            const cg = table.querySelector('colgroup');
            if (cg) nt.appendChild(cg.cloneNode(true));
            const tb = document.createElement('tbody');
            rows.forEach(r => tb.appendChild(r));
            nt.appendChild(tb);
            continuationBlocks.add(nt);
            const frag = document.createDocumentFragment();
            frag.appendChild(nt);
            rest.forEach(n => frag.appendChild(n));
            nextPage.insertBefore(frag, nextPage.firstChild);
        }

        function pushOverflow(pages, i, usable, ctx) {
            let moved = false, guard = 0;
            const limit = usable + PAGE_TOL;
            while (guard++ < 60) {
                const page = pages[i];
                const m = measurePage(page, ctx);
                if (!m.nodes.length || m.bottom <= limit) break;
                let k = 0;
                while (k < m.nodes.length && m.bottoms[k] <= limit) k++;
                if (k >= m.nodes.length) break;

                let nextPage = pages[i + 1];
                const ensureNext = () => {
                    if (!nextPage) {
                        nextPage = createNewPage(pages.length + 1);
                        docEditorPages.appendChild(nextPage);
                        pages.push(nextPage);
                    }
                    return nextPage;
                };
                const node = m.nodes[k];
                const isList = node.nodeType === 1 && (node.nodeName === 'UL' || node.nodeName === 'OL');
                const isTable = node.nodeType === 1 && node.nodeName === 'TABLE' && node.rows.length > 1;

                if (k === 0) {
                    if (m.nodes.length > 1) {
                        // El primer bloque ya no cabe solo: el resto pasa entero y luego se parte ese bloque
                        const frag = document.createDocumentFragment();
                        for (let x = 1; x < m.nodes.length; x++) frag.appendChild(m.nodes[x]);
                        const np = ensureNext();
                        np.insertBefore(frag, np.firstChild);
                        moved = true;
                        continue;
                    }
                    if (isList && node.children.length > 1) {
                        const j = listFitCount(node, m, ctx, limit);
                        if (j < 1 || j >= node.children.length) break;
                        splitListInto(node, j, ensureNext(), []);
                        moved = true;
                        continue;
                    }
                    if (isTable) {
                        const j = tableFitCount(node, m, ctx, limit);
                        if (j < 1 || j >= node.rows.length) break;
                        splitTableInto(node, j, ensureNext(), []);
                        moved = true;
                        continue;
                    }
                    if (!splitOversizeChild(page, ensureNext(), usable)) break;
                    moved = true;
                    continue;
                }

                if (isTable) {
                    const j = tableFitCount(node, m, ctx, limit);
                    if (j >= 1 && j < node.rows.length) {
                        splitTableInto(node, j, ensureNext(), m.nodes.slice(k + 1));
                        moved = true;
                        continue;
                    }
                }

                // Lista que empieza en esta hoja y se sale: se reparten sus <li>
                if (isList && node.children.length > 1) {
                    const j = listFitCount(node, m, ctx, limit);
                    if (j >= 1 && j < node.children.length) {
                        const rest = m.nodes.slice(k + 1);
                        splitListInto(node, j, ensureNext(), rest);
                        moved = true;
                        continue;
                    }
                }

                const frag = document.createDocumentFragment();
                for (let x = k; x < m.nodes.length; x++) frag.appendChild(m.nodes[x]);
                const np = ensureNext();
                np.insertBefore(frag, np.firstChild);
                moved = true;
            }
            return moved;
        }

        // Parte 'list' tras sus primeros j <li>; el resto (y los bloques 'rest' que le seguían) va al principio de nextPage
        function splitListInto(list, j, nextPage, rest) {
            const lis = Array.from(list.children).slice(j);
            const startNum = (parseInt(list.getAttribute('start'), 10) || 1) + j;
            const isOl = list.nodeName === 'OL';
            const target0 = nextPage.firstChild;
            if (!rest.length && target0 && target0.nodeType === 1 && target0.nodeName === list.nodeName) {
                const frag = document.createDocumentFragment();
                lis.forEach(li => frag.appendChild(li));
                target0.insertBefore(frag, target0.firstChild);
                if (isOl) target0.setAttribute('start', startNum);
                return;
            }
            const nl = list.cloneNode(false);
            if (isOl) nl.setAttribute('start', startNum);
            lis.forEach(li => nl.appendChild(li));
            const frag = document.createDocumentFragment();
            frag.appendChild(nl);
            rest.forEach(n => frag.appendChild(n));
            nextPage.insertBefore(frag, nextPage.firstChild);
        }

        // Si la hoja tiene hueco, trae del principio de la siguiente todo lo que quepa (medido de una vez)
        function pullBack(pages, i, usable, ctx) {
            let any = false, guard = 0;
            const limit = usable + PAGE_TOL;
            while (guard++ < 40) {
                const page = pages[i], next = pages[i + 1];
                if (!next) break;
                while (next.firstChild && next.firstChild.nodeType === 3 && next.firstChild.nodeValue.trim() === '') next.removeChild(next.firstChild);
                if (!next.firstChild) { next.remove(); pages.splice(i + 1, 1); any = true; continue; }

                const m = measurePage(page, ctx);
                const free = usable - m.bottom;
                if (free < 10) break;

                const first = next.firstChild, last = page.lastChild;
                if (first.nodeName === 'TABLE' && continuationBlocks.has(first) && last && last.nodeName === 'TABLE') {
                    const lt = last.tBodies[0] || last;
                    let moved = 0;
                    while (first.rows.length) {
                        const r = first.rows[0];
                        lt.appendChild(r);
                        if (measurePage(page, ctx).bottom > limit) { first.tBodies[0].insertBefore(r, first.tBodies[0].firstChild); break; }
                        moved++;
                    }
                    if (!first.rows.length) first.remove();
                    if (!moved) break;
                    any = true;
                    continue;
                }
                if (continuationBlocks.has(first) && last && last.nodeType === 1 && last.nodeName === first.nodeName) {
                    const kids = Array.from(first.childNodes);
                    kids.forEach(k => last.appendChild(k));
                    if (measurePage(page, ctx).bottom > limit) { kids.forEach(k => first.appendChild(k)); break; }
                    first.remove();
                    any = true;
                    continue;
                }

                const nm = measurePage(next, ctx);
                const base = nm.tops[0];
                let cnt = 0;
                while (cnt < nm.nodes.length && (nm.bottoms[cnt] - base) <= free - 4) cnt++;
                if (cnt === 0) break;

                const movedNodes = [];
                for (let x = 0; x < cnt; x++) { page.appendChild(nm.nodes[x]); movedNodes.push(nm.nodes[x]); }
                let over = measurePage(page, ctx).bottom > limit;
                while (over && movedNodes.length) {
                    next.insertBefore(movedNodes.pop(), next.firstChild);
                    over = movedNodes.length ? measurePage(page, ctx).bottom > limit : false;
                }
                if (!movedNodes.length) break;
                any = true;
            }
            return any;
        }

        // full=true: revisa todo el documento (abrir, mostrar, importar). full=false: mientras se escribe,
        // solo desde la hoja del cursor y se detiene en cuanto una hoja queda igual.
        function repaginate(full = true) {
            if (isRepaginating) return;
            if (docViewerState) return;
            isRepaginating = true;
            captureCaret();
            try {
                const usable = getPageUsableHeight();
                if (usable <= 0) return;
                const pages = Array.from(docEditorPages.querySelectorAll('.doc-editor-page'));
                if (!pages.length) return;
                const countBefore = pages.length;
                const ctx = { pt: parseFloat(window.getComputedStyle(pages[0]).paddingTop) || 0 };

                let start = 0, editIdx = -1;
                if (!full && caretTrack && caretTrack.page) {
                    editIdx = pages.indexOf(caretTrack.page);
                    if (editIdx >= 0) start = Math.max(0, editIdx - 1);
                }
                // Las páginas tienen overflow:hidden y el navegador las desplaza al escribir pasado el final
                for (let q = start; q < pages.length; q++) { if (pages[q].scrollTop) pages[q].scrollTop = 0; }

                for (let i = start; i < pages.length; i++) {
                    const pushed = pushOverflow(pages, i, usable, ctx);
                    const pulled = pullBack(pages, i, usable, ctx);
                    if (editIdx >= 0 && i >= editIdx && !pushed && !pulled) break;
                }

                // Páginas vacías al final
                const all = Array.from(docEditorPages.querySelectorAll('.doc-editor-page'));
                for (let j = all.length - 1; j >= 1; j--) {
                    const pg = all[j];
                    if (pg.textContent.trim() === '' && pg.querySelectorAll('br').length === 0 && pg.childNodes.length === 0) pg.remove();
                }
                const remaining = docEditorPages.querySelectorAll('.doc-editor-page');
                if (full || remaining.length !== countBefore) {
                    remaining.forEach((p, idx) => { p.setAttribute('data-page-number', idx + 1); });
                    applyHeaderFooter();
                    fitPagesToWidth();
                }
                updateEditorCustomScrollbar();
            } finally {
                isRepaginating = false;
                restoreCaret();
            }
        }

        // Reparte un contenido largo en hojas con UNA sola medición (en una hoja oculta sin límite de altura)
        // y devuelve las hojas ya creadas. Las que se pasen por poco las corrige después repaginate().
        function buildPagesFast(html) {
            const probe = document.createElement('div');
            probe.className = 'doc-editor-page';
            probe.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;height:auto;min-height:0;transform:none;margin:0;pointer-events:none;';
            probe.innerHTML = html;
            document.body.appendChild(probe);
            try {
                const cs = window.getComputedStyle(probe);
                const pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0;
                const usable = 297 * 96 / 25.4 - pt - pb - 6;
                const nodes = Array.from(probe.childNodes);
                const rects = nodes.map(n => {
                    if (n.nodeType === 1) return n.getBoundingClientRect();
                    if (n.nodeType === 3 && n.nodeValue.trim()) { pageMeasureRange.selectNode(n); return pageMeasureRange.getBoundingClientRect(); }
                    return null;
                });
                const groups = [];
                let cur = [], startTop = null;
                nodes.forEach((n, idx) => {
                    const r = rects[idx];
                    if (r && (r.height > 0 || r.width > 0)) {
                        if (startTop === null) startTop = r.top;
                        if (cur.length && (r.bottom - startTop) > usable) { groups.push(cur); cur = []; startTop = r.top; }
                    }
                    cur.push(n);
                });
                if (cur.length) groups.push(cur);
                return groups.map((g, idx) => {
                    const page = createNewPage(idx + 1);
                    const frag = document.createDocumentFragment();
                    g.forEach(n => frag.appendChild(n));
                    page.appendChild(frag);
                    return page;
                });
            } finally {
                probe.remove();
            }
        }

        function openDocEditor(file) {
            // NUEVO: Si hay un editor minimizado, no permitir abrir otro documento
            if (isEditorHidden) {
                showConfirmModal({
                    title: 'Documento minimizado',
                    message: 'Tienes un documento minimizado. Debes cerrarlo o guardarlo antes de abrir otro.',
                    cancelText: 'Cancelar',
                    deleteText: 'Abrir el minimizado',
                    onConfirm: () => {
                        showDocEditor();
                    }
                });
                return;
            }

            currentEditorFileId = file ? file.id : null;
            isEditorExpanded = false;
            isEditorHidden = false;
            currentTextStyle = 'p';
            docEditorPanel.classList.remove('expanded');
            docEditorPanel.classList.remove('hidden-mode');
            docExpandControlBtn.innerHTML = '<i class="fi fi-br-expand"></i>';
            docEditorRestoreTab.classList.remove('visible');
            setStyleUI('p');
            setFontSizeUI(DEFAULT_FONT_PX);

            // NUEVO: Forzar el color principal en el selector según el modo
            docTextColor.value = isDarkMode ? '#ffffff' : '#222222';

            docActionsMenu.classList.remove('visible');
            docExportSubmenu.classList.remove('visible');
            docStyleMenu.classList.remove('visible');
            docFontSizeMenu.classList.remove('visible');
            docAlignMenu.classList.remove('visible');
            docStyleBtn.classList.remove('active');
            docFontSizeBtn.classList.remove('active');
            closeDocColorPopup();

            if (docViewerState) teardownViewer();
            setViewerMode(false);
            docEditorPages.innerHTML = '';
            closeDocFind();
            let edLoad = document.getElementById('docEditorLoading');
            if (!edLoad) {
                edLoad = document.createElement('div');
                edLoad.id = 'docEditorLoading';
                edLoad.className = 'doc-editor-loading';
                edLoad.innerHTML = '<span class="app-spinner lg"></span><span>Abriendo documento…</span>';
                docEditorPanel.appendChild(edLoad);
            }
            edLoad.classList.toggle('show', !!(file && (file.content || '').length > 6000));
            editorHeader = file && typeof file.header === 'string' ? file.header : '';
            editorFooter = file && typeof file.footer === 'string' ? file.footer : '';
            editorPageStyle = file ? cleanPageStyle(file.pageStyle) : null;

            if (file) {
                docEditorTitle.textContent = file.title || '';
                const content = sanitizeDocContent(file.content || '');
                const pageSplitRegex = /<hr[^>]*page-break-after:\s*always[^>]*>/i;
                const parts = content.split(pageSplitRegex);

                if (parts.length > 1) {
                    parts.forEach((part, idx) => {
                        const page = createNewPage(idx + 1);
                        page.innerHTML = part;
                        docEditorPages.appendChild(page);
                    });
                } else {
                    const fast = content.length > 6000 ? buildPagesFast(content) : [];
                    if (fast.length) {
                        fast.forEach(pg => docEditorPages.appendChild(pg));
                    } else {
                        const firstPage = createNewPage(1);
                        firstPage.innerHTML = content;
                        docEditorPages.appendChild(firstPage);
                    }
                }
            } else {
                docEditorTitle.textContent = getDefaultDocumentName();
                const firstPage = createNewPage(1);
                docEditorPages.appendChild(firstPage);
            }

            // Los documentos antiguos usaban <font size>: se pasan a px reales para que barra y texto coincidan
            normalizeLegacyFonts(docEditorPages);
            applyHeaderFooter();
            markEditorClean();

            docEditorOverlay.classList.add('open');
            docEditorPanel.classList.add('open');

            const doLayout = () => {
                fitPagesToWidth();
                repaginate();
                const firstPage = docEditorPages.querySelector('.doc-editor-page');
                if (firstPage) firstPage.focus();
                updateEditorCustomScrollbar();
                markEditorClean();
                edLoad.classList.remove('show');
            };

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setTimeout(doLayout, 150);
                });
            });

            if (!docEditorResizeObserver) {
                docEditorResizeObserver = new ResizeObserver(() => {
                    if (docEditorPanel.classList.contains('open')) {
                        fitPagesToWidth();
                        updateEditorCustomScrollbar();
                    }
                });
                docEditorResizeObserver.observe(docEditorBody);
            }
        }

        function closeDocEditor() {
            closeDocFind();
            const edl = document.getElementById('docEditorLoading');
            if (edl) edl.classList.remove('show');
            teardownViewer();
            setViewerMode(false);
            docEditorOverlay.classList.remove('open');
            docEditorPanel.classList.remove('open');
            docEditorPanel.classList.remove('expanded');
            docEditorPanel.classList.remove('hidden-mode');
            isEditorExpanded = false;
            isEditorHidden = false;
            docExpandControlBtn.innerHTML = '<i class="fi fi-br-expand"></i>';
            docEditorRestoreTab.classList.remove('visible');
            currentEditorFileId = null;
        }

        function hideDocEditor() {
            closeDocFind();
            closeDocColorPopup();
            isEditorHidden = true;
            docEditorPanel.classList.add('hidden-mode');
            docEditorOverlay.classList.remove('open');
            docEditorRestoreTab.classList.add('visible');
            docActionsMenu.classList.remove('visible');
            docExportSubmenu.classList.remove('visible');
            docAlignMenu.classList.remove('visible');
            docStyleMenu.classList.remove('visible');
            docFontSizeMenu.classList.remove('visible');
            docStyleBtn.classList.remove('active');
            docFontSizeBtn.classList.remove('active');
        }

        function showDocEditor() {
            isEditorHidden = false;
            docEditorPanel.classList.remove('hidden-mode');
            docEditorOverlay.classList.add('open');
            docEditorRestoreTab.classList.remove('visible');
            setTimeout(() => {
                fitPagesToWidth();
                repaginate();
                updateEditorCustomScrollbar();
            }, 100);
        }

        let editorSavedSnapshot = '';
        let confirmCancelCallback = null;

        // ============================================
        // EDITOR: cabecera y pie, enlaces, imágenes, tablas, interlineado, sangría y buscar/reemplazar
        // ============================================
        let editorHeader = '', editorFooter = '';   // texto de cabecera y pie del documento abierto ({n} = nº de página, {total} = nº de páginas)
        let closeDocFind = () => { };                // los define el cableado del final del script
        let openDocFind = () => { };
        let lastClickedImg = null;
        let editorPageStyle = null;                  // { font, size, lh, after, mt, mr, mb, ml } de un Word convertido

        function cleanPageStyle(p) {
            if (!p || typeof p !== 'object') return null;
            const o = {}, num = (v, a, b) => typeof v === 'number' && isFinite(v) && v >= a && v <= b;
            if (typeof p.font === 'string' && /^[\w\s-]{1,60}$/.test(p.font)) o.font = p.font;
            if (num(p.size, 6, 40)) o.size = Math.round(p.size);
            if (num(p.lh, 0.8, 3)) o.lh = p.lh;
            if (num(p.after, 0, 80)) o.after = Math.round(p.after);
            ['mt', 'mr', 'mb', 'ml'].forEach(k => { if (num(p[k], 5, 60)) o[k] = p[k]; });
            return Object.keys(o).length ? o : null;
        }
        function stylePage(p) {
            ['fontFamily', 'fontSize', 'lineHeight', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].forEach(k => { p.style[k] = ''; });
            p.style.removeProperty('--doc-after');
            const ps = editorPageStyle;
            if (!ps) return;
            if (ps.font) p.style.fontFamily = "'" + ps.font + "', Arial, sans-serif";
            if (ps.size) p.style.fontSize = ps.size + 'px';
            if (ps.lh) p.style.lineHeight = String(ps.lh);
            if (ps.after) p.style.setProperty('--doc-after', ps.after + 'px');
            if (ps.mt) p.style.paddingTop = ps.mt + 'mm';
            if (ps.mr) p.style.paddingRight = ps.mr + 'mm';
            if (ps.mb) p.style.paddingBottom = ps.mb + 'mm';
            if (ps.ml) p.style.paddingLeft = ps.ml + 'mm';
        }
        function pageStyleAttr() {
            const ps = editorPageStyle;
            if (!ps) return '';
            const st = [];
            if (ps.mt || ps.mr || ps.mb || ps.ml) st.push('padding: ' + [ps.mt || 25, ps.mr || 20, ps.mb || 25, ps.ml || 20].map(v => v + 'mm').join(' '));
            if (ps.font) st.push("font-family: '" + ps.font + "', Arial, sans-serif");
            if (ps.size) st.push('font-size: ' + ps.size + 'px');
            if (ps.lh) st.push('line-height: ' + ps.lh);
            return st.length ? ' style="' + st.join('; ') + '"' : '';
        }

        function hfExpand(t, n, total) { return String(t || '').replace(/\{n\}/g, n).replace(/\{total\}/g, total); }
        // Cabecera y pie se pintan con atributos de la hoja (no forman parte del contenido guardado)
        function applyHeaderFooter() {
            const pages = Array.from(docEditorPages.querySelectorAll('.doc-editor-page'));
            pages.forEach((p, i) => {
                if (editorHeader) p.setAttribute('data-header', hfExpand(editorHeader, i + 1, pages.length)); else p.removeAttribute('data-header');
                if (editorFooter) p.setAttribute('data-footer', hfExpand(editorFooter, i + 1, pages.length)); else p.removeAttribute('data-footer');
                stylePage(p);
            });
        }
        function hfHtml(text, n, total, cls) {
            return text ? '<div class="' + cls + '">' + escapeHtml(hfExpand(text, n, total)) + '</div>' : '';
        }

        // Mini diálogo con campos de texto
        function docMiniDialog(opts) {
            const ov = document.createElement('div');
            ov.className = 'doc-mini-overlay';
            const dlg = document.createElement('div');
            dlg.className = 'doc-mini-dialog';
            const h = document.createElement('h3');
            h.textContent = opts.title;
            dlg.appendChild(h);
            const inputs = {};
            opts.fields.forEach(f => {
                const lab = document.createElement('label');
                lab.textContent = f.label;
                dlg.appendChild(lab);
                const el = document.createElement(f.rows ? 'textarea' : 'input');
                if (f.rows) el.rows = f.rows; else el.type = f.type || 'text';
                if (f.min !== undefined) el.min = f.min;
                if (f.max !== undefined) el.max = f.max;
                if (f.placeholder) el.placeholder = f.placeholder;
                el.value = f.value === undefined ? '' : f.value;
                dlg.appendChild(el);
                inputs[f.id] = el;
                if (f.hint) {
                    const hi = document.createElement('div');
                    hi.className = 'mini-hint';
                    hi.textContent = f.hint;
                    dlg.appendChild(hi);
                }
            });
            const actions = document.createElement('div');
            actions.className = 'mini-actions';
            const onKey = e => {
                if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); }
                else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); submit(); }
            };
            const close = () => { ov.remove(); document.removeEventListener('keydown', onKey, true); };
            const submit = () => {
                const vals = {};
                Object.keys(inputs).forEach(k => { vals[k] = inputs[k].value; });
                if (opts.onOk(vals) !== false) close();
            };
            (opts.extra || []).forEach(x => {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = x.text;
                b.addEventListener('click', () => { close(); x.fn(); });
                actions.appendChild(b);
            });
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.textContent = 'Cancelar';
            cancel.addEventListener('click', close);
            const ok = document.createElement('button');
            ok.type = 'button';
            ok.className = 'primary';
            ok.textContent = opts.okText || 'Aceptar';
            ok.addEventListener('click', submit);
            actions.appendChild(cancel);
            actions.appendChild(ok);
            dlg.appendChild(actions);
            ov.appendChild(dlg);
            ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
            document.addEventListener('keydown', onKey, true);
            document.body.appendChild(ov);
            const first = Object.keys(inputs)[0] && inputs[Object.keys(inputs)[0]];
            if (first) { first.focus(); if (first.select) first.select(); }
        }

        // Pone el cursor dentro de la página si no lo había
        function ensureEditorCaret(page) {
            const sel = window.getSelection();
            if (sel.rangeCount && page.contains(sel.anchorNode)) return;
            const r = document.createRange();
            r.selectNodeContents(page);
            r.collapse(false);
            sel.removeAllRanges();
            sel.addRange(r);
        }
        function placeCaretIn(el) {
            const r = document.createRange();
            r.selectNodeContents(el);
            r.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(r);
            saveSelection();
        }
        function afterDocFormat() {
            saveSelection();
            if (!isRepaginating) scheduleRepaginateNow();
        }

        // ---------- Enlaces ----------
        function normalizeLinkUrl(u) {
            u = String(u || '').trim();
            if (!u) return '';
            if (/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(u)) return 'mailto:' + u;
            if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
            if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return '';        // otros esquemas (javascript:, data:...) no se admiten
            return 'https://' + u;
        }
        function docInsertLink() {
            const page = focusEditorForCommand();
            if (!page) return;
            const sel = window.getSelection();
            const selText = sel.rangeCount ? sel.toString() : '';
            const n0 = sel.anchorNode;
            const startEl = n0 && (n0.nodeType === 1 ? n0 : n0.parentElement);
            const curLink = startEl && startEl.closest ? startEl.closest('a') : null;
            const saved = savedSelection ? savedSelection.cloneRange() : null;
            const fields = [{ id: 'url', label: 'Dirección (web, correo o teléfono)', value: curLink ? curLink.getAttribute('href') : '', placeholder: 'https://…' }];
            if (!selText) fields.push({ id: 'text', label: 'Texto del enlace', value: curLink ? curLink.textContent : '' });
            docMiniDialog({
                title: curLink ? 'Editar enlace' : 'Insertar enlace',
                fields,
                okText: 'Aceptar',
                extra: curLink ? [{
                    text: 'Quitar enlace', fn: () => {
                        savedSelection = saved; focusEditorForCommand();
                        document.execCommand('unlink');
                        afterDocFormat();
                    }
                }] : [],
                onOk: v => {
                    const href = normalizeLinkUrl(v.url);
                    if (!href || !SAFE_LINK_RE.test(href)) { showToast('La dirección del enlace no es válida'); return false; }
                    savedSelection = saved;
                    const pg = focusEditorForCommand();
                    if (!pg) return;
                    ensureEditorCaret(pg);
                    if (curLink && !selText) {
                        curLink.setAttribute('href', href);
                        if (v.text) curLink.textContent = v.text;
                    } else if (selText) {
                        document.execCommand('createLink', false, href);
                    } else {
                        document.execCommand('insertHTML', false, '<a href="' + escapeHtml(href) + '">' + escapeHtml(v.text || href) + '</a>');
                    }
                    afterDocFormat();
                }
            });
        }

        // ---------- Imágenes ----------
        // Se reducen a 1200 px de ancho como máximo para que el documento no pese de más
        function readImageFile(file) {
            return new Promise((resolve, reject) => {
                if (!/^image\/(png|jpe?g|gif|webp)$/i.test(file.type)) { reject(new Error('type')); return; }
                const fr = new FileReader();
                fr.onerror = () => reject(new Error('read'));
                fr.onload = () => {
                    const src = String(fr.result);
                    if (/gif$/i.test(file.type)) { if (src.length <= 2000000) resolve(src); else reject(new Error('big')); return; }
                    const img = new Image();
                    img.onerror = () => reject(new Error('decode'));
                    img.onload = () => {
                        const sc = Math.min(1, 1200 / img.naturalWidth);
                        if (sc === 1 && src.length <= 1500000) { resolve(src); return; }
                        const c = document.createElement('canvas');
                        c.width = Math.max(1, Math.round(img.naturalWidth * sc));
                        c.height = Math.max(1, Math.round(img.naturalHeight * sc));
                        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                        const png = /png$/i.test(file.type);
                        let out = c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.85);
                        if (png && out.length > 1500000) out = c.toDataURL('image/jpeg', 0.85);
                        if (out.length > 6000000) reject(new Error('big')); else resolve(out);
                    };
                    img.src = src;
                };
                fr.readAsDataURL(file);
            });
        }
        async function insertImageFile(file) {
            try {
                const src = await readImageFile(file);
                const page = focusEditorForCommand();
                if (!page) return;
                ensureEditorCaret(page);
                document.execCommand('insertImage', false, src);
                afterDocFormat();
            } catch (err) {
                showToast(err && err.message === 'big' ? 'La imagen es demasiado grande' : 'No se pudo insertar la imagen');
            }
        }
        function docPickImage() {
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = 'image/png,image/jpeg,image/gif,image/webp';
            inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; if (f) insertImageFile(f); });
            inp.click();
        }

        // ---------- Tablas ----------
        function docCurrentCell() {
            const n = savedSelection && savedSelection.startContainer;
            const el = n && (n.nodeType === 1 ? n : n.parentElement);
            const c = el && el.closest ? el.closest('td,th') : null;
            return c && docEditorPages.contains(c) ? c : null;
        }
        function docInsertTable() {
            const saved = savedSelection ? savedSelection.cloneRange() : null;
            docMiniDialog({
                title: 'Insertar tabla',
                fields: [
                    { id: 'rows', label: 'Filas', type: 'number', value: '3', min: 1, max: 50 },
                    { id: 'cols', label: 'Columnas', type: 'number', value: '3', min: 1, max: 10 }
                ],
                okText: 'Insertar',
                onOk: v => {
                    const rows = Math.min(50, parseInt(v.rows, 10) || 0), cols = Math.min(10, parseInt(v.cols, 10) || 0);
                    if (rows < 1 || cols < 1) return false;
                    const w = (100 / cols).toFixed(2) + '%';
                    let html = '<table data-new="1" style="border-collapse: collapse; width: 100%"><colgroup>' +
                        ('<col style="width: ' + w + '">').repeat(cols) + '</colgroup><tbody>';
                    for (let r = 0; r < rows; r++) {
                        html += '<tr>' + '<td style="border: 1px solid #999; padding: 4px 6px"><br></td>'.repeat(cols) + '</tr>';
                    }
                    html += '</tbody></table><p><br></p>';
                    savedSelection = saved;
                    const page = focusEditorForCommand();
                    if (!page) return;
                    ensureEditorCaret(page);
                    document.execCommand('insertHTML', false, html);
                    const t = docEditorPages.querySelector('table[data-new]');
                    if (t) { t.removeAttribute('data-new'); const c = t.querySelector('td'); if (c) placeCaretIn(c); }
                    afterDocFormat();
                }
            });
        }
        function rebuildColgroup(table) {
            const first = table.rows[0];
            if (!first) return;
            const n = Array.from(first.cells).reduce((a, c) => a + (c.colSpan || 1), 0);
            let cg = table.querySelector('colgroup');
            if (!cg) { cg = document.createElement('colgroup'); table.insertBefore(cg, table.firstChild); }
            cg.innerHTML = '';
            for (let i = 0; i < n; i++) {
                const col = document.createElement('col');
                col.style.width = (100 / n).toFixed(2) + '%';
                cg.appendChild(col);
            }
        }
        function newCellLike(c) {
            const td = document.createElement(c.nodeName === 'TH' ? 'th' : 'td');
            if (c.getAttribute('style')) td.setAttribute('style', c.getAttribute('style'));
            td.innerHTML = '<br>';
            return td;
        }
        function tableOp(op, cell) {
            cell = cell || docCurrentCell();
            if (!cell) return;
            const tr = cell.parentElement, table = cell.closest('table'), idx = cell.cellIndex;
            if (op === 'rowAfter') {
                const nr = document.createElement('tr');
                Array.from(tr.cells).forEach(c => { const td = newCellLike(c); if (c.colSpan > 1) td.colSpan = c.colSpan; nr.appendChild(td); });
                tr.after(nr);
                placeCaretIn(nr.cells[Math.min(idx, nr.cells.length - 1)]);
            } else if (op === 'colAfter') {
                Array.from(table.rows).forEach(r => { const c = r.cells[idx]; if (c) c.after(newCellLike(c)); });
                rebuildColgroup(table);
                placeCaretIn(tr.cells[idx + 1] || cell);
            } else if (op === 'delRow') {
                if (table.rows.length <= 1) { table.remove(); }
                else {
                    const target = tr.nextElementSibling || tr.previousElementSibling;
                    tr.remove();
                    placeCaretIn(target.cells[Math.min(idx, target.cells.length - 1)]);
                }
            } else if (op === 'delCol') {
                if (tr.cells.length <= 1) { table.remove(); }
                else {
                    Array.from(table.rows).forEach(r => { if (r.cells[idx]) r.cells[idx].remove(); });
                    rebuildColgroup(table);
                    placeCaretIn(tr.cells[Math.min(idx, tr.cells.length - 1)]);
                }
            } else if (op === 'delTable') {
                table.remove();
            }
            afterDocFormat();
        }
        // Tab / Mayús+Tab dentro de una tabla: pasa a la celda siguiente / anterior (al final añade una fila)
        function tableTab(e) {
            const sel = window.getSelection();
            if (!sel.rangeCount) return false;
            const n = sel.anchorNode;
            const el = n && (n.nodeType === 1 ? n : n.parentElement);
            const cell = el && el.closest ? el.closest('td,th') : null;
            if (!cell || !docEditorPages.contains(cell)) return false;
            const cells = Array.from(cell.closest('table').querySelectorAll('td,th'));
            const i = cells.indexOf(cell) + (e.shiftKey ? -1 : 1);
            if (i < 0) return true;
            if (i >= cells.length) {
                tableOp('rowAfter', cell);
                return true;
            }
            placeCaretIn(cells[i]);
            return true;
        }

        // ---------- Interlineado y sangría ----------
        function docSelectedBlocks(retry = true) {
            const page = focusEditorForCommand();
            if (!page) return [];
            ensureEditorCaret(page);
            const sel = window.getSelection();
            const range = sel.getRangeAt(0);
            const isLeaf = el => !Array.from(el.children).some(c => /^(P|DIV|H1|H2|H3|LI|BLOCKQUOTE|UL|OL|TABLE)$/.test(c.nodeName));
            const found = Array.from(docEditorPages.querySelectorAll('.doc-editor-page p, .doc-editor-page div, .doc-editor-page h1, .doc-editor-page h2, .doc-editor-page h3, .doc-editor-page li, .doc-editor-page blockquote, .doc-editor-page td, .doc-editor-page th'))
                .filter(el => isLeaf(el) && range.intersectsNode(el));
            if (!found.length && retry) {              // texto suelto en la hoja: se mete en un párrafo
                document.execCommand('formatBlock', false, '<p>');
                return docSelectedBlocks(false);
            }
            return found;
        }
        function docSetLineHeight(v) {
            docSelectedBlocks().forEach(b => { if (v) b.style.lineHeight = v; else b.style.removeProperty('line-height'); });
            afterDocFormat();
        }
        function docIndent(delta) {
            const blocks = docSelectedBlocks();
            if (blocks.some(b => b.nodeName === 'LI')) document.execCommand(delta > 0 ? 'indent' : 'outdent');   // listas: anidan
            docSelectedBlocks().filter(b => b.nodeName !== 'LI').forEach(b => {
                const cur = parseFloat(b.style.marginLeft) || 0;
                const next = Math.max(0, Math.min(240, cur + delta * 24));
                if (next) b.style.marginLeft = next + 'px'; else b.style.removeProperty('margin-left');
            });
            afterDocFormat();
        }
        function getEditorSnapshot() { return docEditorTitle.textContent.trim() + '\u0001' + getEditorCombinedContent() + '\u0001' + editorHeader + '\u0001' + editorFooter; }
        function isEditorDirty() { return getEditorSnapshot() !== editorSavedSnapshot; }
        function markEditorClean() { editorSavedSnapshot = getEditorSnapshot(); }

        // Historial para deshacer / rehacer (instantáneas de todos los datos)
        const UNDO_MAX = 25;
        const undoStack = [], redoStack = [];
        const snapState = () => JSON.stringify({ events, categories, folders, files, templates });
        let lastSnap = snapState();
        function trackUndo() {
            const cur = snapState();
            if (cur === lastSnap) return;
            undoStack.push(lastSnap);
            if (undoStack.length > UNDO_MAX) undoStack.shift();
            redoStack.length = 0;
            lastSnap = cur;
        }

        // Guardado en archivo (Electron): agrupa varios cambios seguidos en una sola escritura
        let _fileTimer;
        function getFilePayload() {
            return { version: 1, exportedAt: new Date().toISOString(), events, categories, folders, files, templates };
        }
        function persistToFile() {
            clearTimeout(_fileTimer);
            _fileTimer = setTimeout(() => { _fileTimer = null; window.store.save(getFilePayload()); }, 300);
        }
        window.addEventListener('beforeunload', () => {
            if (window.store && _fileTimer) { clearTimeout(_fileTimer); window.store.save(getFilePayload()); }
        });

        function safeSave(key, value) {
            externalizeImages();
            trackUndo();
            if (window.store && window.store.save) { persistToFile(); return true; }
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (err) {
                showConfirmModal({
                    title: 'No se pudo guardar',
                    message: 'El almacenamiento está lleno. Borra documentos o iconos grandes e inténtalo de nuevo.',
                    cancelText: 'Cerrar', deleteText: 'Entendido'
                });
                return false;
            }
        }

        function exitAndSaveEditor() {
            docActionsMenu.classList.remove('visible');
            docExportSubmenu.classList.remove('visible');
            if (docViewerState || !isEditorDirty()) { closeDocEditor(); return; }
            const name = docEditorTitle.textContent.trim() || 'Documento sin título';
            showConfirmModal({
                title: '¿Guardar los cambios?',
                message: 'Has hecho cambios en "' + name + '" que no se han guardado.',
                cancelText: 'No guardar', deleteText: 'Guardar', variant: 'save',
                onConfirm: () => { saveDocEditor(false); closeDocEditor(); },
                onCancel: () => { closeDocEditor(); }
            });
        }

        function deleteCurrentDocument() {
            if (!currentEditorFileId) {
                showConfirmModal({
                    title: 'Descartar documento',
                    message: 'Este documento no está guardado. ¿Seguro que quieres descartarlo? Se perderán todos los cambios.',
                    cancelText: 'Cancelar',
                    deleteText: 'Descartar',
                    onConfirm: () => {
                        closeDocEditor();
                    }
                });
                return;
            }
            const file = files.find(f => f.id === currentEditorFileId);
            if (!file) return;
            showConfirmModal({
                title: 'Borrar documento',
                message: '¿Seguro que quieres borrar el documento "' + file.title + '"? Esta acción no se puede deshacer.',
                cancelText: 'Cancelar',
                deleteText: 'Borrar',
                onConfirm: () => {
                    files = files.filter(f => f.id !== currentEditorFileId);
                    safeSave('calendarFiles', files);
                    renderDocuments();
                    showToast('Documento eliminado', 'ok', { label: 'Deshacer', fn: undo });
                    closeDocEditor();
                }
            });
        }

        function toggleDocEditorExpand() {
            isEditorExpanded = !isEditorExpanded;
            docEditorPanel.classList.toggle('expanded', isEditorExpanded);
            docExpandControlBtn.innerHTML = isEditorExpanded
                ? '<i class="fi fi-br-compress"></i>'
                : '<i class="fi fi-br-expand"></i>';

            setTimeout(() => {
                fitPagesToWidth();
                updateEditorCustomScrollbar();
            }, 400);
        }

        function getEditorCombinedContent() {
            const pages = Array.from(docEditorPages.querySelectorAll('.doc-editor-page'));
            const separator = '<hr style="page-break-after: always; border: none; border-top: 1px dashed #ccc; margin: 20px 0;">';
            return pages.map(p => p.innerHTML).join(separator);
        }

        function saveDocEditor(isSaveAs = false, saveAsFolderId = null, saveAsTitle = null) {
            const title = (saveAsTitle || docEditorTitle.textContent.trim()) || 'Documento sin título';
            const content = sanitizeDocContent(getEditorCombinedContent());
            const now = Date.now();

            if (isSaveAs) {
                const existingIdx = currentEditorFileId
                    ? files.findIndex(f => f.id === currentEditorFileId)
                    : -1;

                if (existingIdx !== -1) {
                    // El documento ya existía: se MUEVE / renombra, no se duplica
                    files[existingIdx] = {
                        ...files[existingIdx],
                        title: title,
                        content: content,
                        header: editorHeader,
                        footer: editorFooter,
                        pageStyle: editorPageStyle,
                        folderId: saveAsFolderId,
                        updatedAt: now
                    };
                } else {
                    // Documento nuevo que aún no estaba guardado
                    const newFile = {
                        id: now,
                        title: title,
                        description: '',
                        content: content,
                        header: editorHeader,
                        footer: editorFooter,
                        pageStyle: editorPageStyle,
                        folderId: saveAsFolderId,
                        createdAt: now,
                        updatedAt: now
                    };
                    files.push(newFile);
                    currentEditorFileId = newFile.id;
                }
            } else if (currentEditorFileId) {
                const idx = files.findIndex(f => f.id === currentEditorFileId);
                if (idx !== -1) {
                    files[idx] = {
                        ...files[idx],
                        title: title,
                        content: content,
                        header: editorHeader,
                        footer: editorFooter,
                        pageStyle: editorPageStyle,
                        updatedAt: now
                    };
                } else {
                    const newFile = {
                        id: now,
                        title: title,
                        description: '',
                        content: content,
                        header: editorHeader,
                        footer: editorFooter,
                        pageStyle: editorPageStyle,
                        folderId: null,
                        createdAt: now,
                        updatedAt: now
                    };
                    files.push(newFile);
                    currentEditorFileId = newFile.id;
                }
            } else {
                const newFile = {
                    id: now,
                    title: title,
                    description: '',
                    content: content,
                    header: editorHeader,
                    footer: editorFooter,
                    pageStyle: editorPageStyle,
                    folderId: null,
                    createdAt: now,
                    updatedAt: now
                };
                files.push(newFile);
                currentEditorFileId = newFile.id;
            }

            if (safeSave('calendarFiles', files)) markEditorClean();
            renderDocuments();
        }

        function openSaveAsModal() {
            // Preselecciona la carpeta donde ya está el documento (si lo está)
            const currentFile = currentEditorFileId ? files.find(f => f.id === currentEditorFileId) : null;
            saveAsSelectedFolder = currentFile && folders.some(f => f.id === currentFile.folderId)
                ? currentFile.folderId
                : null;
            renderFolderTreePicker(saveAsFolderPicker, {
                selectedId: saveAsSelectedFolder,
                rootLabel: 'Sin carpeta (archivo suelto)',
                onSelect: (id) => { saveAsSelectedFolder = id; }
            });

            saveAsName.value = docEditorTitle.textContent.trim() || getDefaultDocumentName();

            saveAsModal.style.display = 'flex';
            saveAsName.focus();
            saveAsName.select();
        }

        function handleSaveAsSubmit(e) {
            e.preventDefault();
            const title = saveAsName.value.trim();
            const folderId = saveAsSelectedFolder;
            if (!title) return;

            docEditorTitle.textContent = title;
            saveDocEditor(true, folderId, title);
            saveAsModal.style.display = 'none';
        }

        // ============================================
        // EXPORTAR
        // ============================================
        function exportAsWord() { return busyRun('Preparando el archivo Word…', exportAsWordNow); }
        function exportAsWordNow() {
            const title = (docEditorTitle.textContent.trim() || 'Documento').replace(/[^a-z0-9áéíóúñ\-_ ]/gi, '');
            const pages = Array.from(docEditorPages.querySelectorAll('.doc-editor-page'));

            let fullHtml = '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<title>' + title + '</title>\n<style>\n' +
                'body { font-family: "Calibri", "Segoe UI", Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #222; margin: 0; padding: 0; }\n' +
                'p, div { margin: 0; }\n' +
                '.page { padding: 25mm 20mm 25mm 20mm; min-height: 297mm; box-sizing: border-box; page-break-after: always; }\n' +
                '.page:last-child { page-break-after: auto; }\n' +
                '.hf { font-size: 11px; color: #888; text-align: center; white-space: pre-line; }\n' +
                'table { border-collapse: collapse; } img { max-width: 100%; }\n' +
                'h1 { font-size: 32px; margin: 6px 0 4px; } h2 { font-size: 24px; margin: 5px 0 3px; } h3 { font-size: 18px; margin: 4px 0 2px; }\n' +
                '<\/style>\n<\/head>\n<body>';

            pages.forEach(function (page, i) {
                fullHtml += '<div class="page"' + pageStyleAttr() + '>' + hfHtml(editorHeader, i + 1, pages.length, 'hf') + page.innerHTML + hfHtml(editorFooter, i + 1, pages.length, 'hf') + '</div>';
            });

            fullHtml += '<\/body>\n<\/html>';

            const blob = new Blob([fullHtml], { type: 'application/msword' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = title + '.doc';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        function exportAsPdf() { return busyRun('Generando el PDF…', exportAsPdfNow); }
        async function exportAsPdfNow() {
            const title = (docEditorTitle.textContent.trim() || 'Documento').replace(/[^a-z0-9áéíóúñ\-_ ]/gi, '');
            const pages = Array.from(docEditorPages.querySelectorAll('.doc-editor-page'));
            if (!(window.jspdf && window.jspdf.jsPDF && window.html2canvas)) {
                showToast('No se pudo cargar la librería de PDF (falta la carpeta vendor)');
                return;
            }
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            const holder = document.createElement('div');
            holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;z-index:-1;';
            document.body.appendChild(holder);
            try {
                for (let i = 0; i < pages.length; i++) {
                    const clone = pages[i].cloneNode(true);
                    clone.style.cssText += ';transform:none;margin:0;background:#fff;color:#222;box-shadow:none;';
                    clone.setAttribute('data-page-number', i + 1);
                    holder.innerHTML = '';
                    holder.appendChild(clone);
                    // html2canvas clona TODO el documento antes de dibujar: con ignoreElements solo clona la página
                    const canvas = await html2canvas(clone, {
                        scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff',
                        ignoreElements: el => el !== clone && !clone.contains(el) && !el.contains(clone)
                    });
                    if (i > 0) pdf.addPage();
                    pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
                    await new Promise(r => setTimeout(r, 0));   // deja respirar a la interfaz entre páginas
                }
                pdf.save(title + '.pdf');
            } catch (err) {
                console.error('Error al exportar PDF:', err);
            } finally {
                holder.remove();
            }
        }

        // ============================================
        // BARRA DE FORMATO (execCommand)
        // ============================================
        function saveSelection() {
            const sel = window.getSelection();
            if (sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                if (range.commonAncestorContainer &&
                    docEditorPages.contains(range.commonAncestorContainer)) {
                    savedSelection = range.cloneRange();
                }
            }
        }

        function restoreSelection() {
            if (savedSelection) {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(savedSelection);
            }
        }

        const FONT_SIZE_PX = { '1': 10, '2': 12, '3': 14, '4': 16, '5': 18, '6': 24, '7': 32 };
        const DEFAULT_FONT_PX = 14;
        // Tamaños reales de <font size> en el navegador (para documentos antiguos)
        const LEGACY_FONT_PX = { '1': 10, '2': 13, '3': 16, '4': 18, '5': 24, '6': 32, '7': 48 };
        let pendingFontPx = null; // tamaño elegido sin texto seleccionado (se aplica al escribir)

        function getEditorPage() {
            let page = null;
            if (savedSelection) {
                const n = savedSelection.startContainer;
                const el = n && (n.nodeType === 1 ? n : n.parentElement);
                page = el && el.closest ? el.closest('.doc-editor-page') : null;
                if (page && !docEditorPages.contains(page)) page = null;
            }
            return page || docEditorPages.querySelector('.doc-editor-page:focus-within') || docEditorPages.querySelector('.doc-editor-page');
        }

        // Devuelve el foco al editor y recupera la selección antes de ejecutar un comando
        function focusEditorForCommand() {
            const page = getEditorPage();
            if (page && document.activeElement !== page) page.focus({ preventScroll: true });
            restoreSelection();
            return page;
        }

        function setStyleUI(style) {
            const labels = { p: 'Normal', h1: 'Título 1', h2: 'Título 2', h3: 'Título 3' };
            docStyleLabel.textContent = labels[style] || 'Normal';
            currentTextStyle = style;
            docStyleMenu.querySelectorAll('button').forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-style') === style);
            });
        }

        function setFontSizeUI(px) {
            const rounded = Math.round(px);
            docFontSizeLabel.textContent = rounded + 'px';
            docFontSizeMenu.querySelectorAll('button').forEach(b => {
                b.classList.toggle('active', FONT_SIZE_PX[b.getAttribute('data-size')] === rounded);
            });
        }

        function setAlignUI(align) {
            docAlignMenu.querySelectorAll('button').forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-align') === align);
            });
            let iconHTML;
            switch (align) {
                case 'center': iconHTML = '<i class="fi fi-sc-align-center"></i>'; break;
                case 'right': iconHTML = '<i style="transform: scaleX(-1);" class="fi fi-sc-align-left"></i>'; break;
                case 'justify': iconHTML = '<i class="fi fi-sc-align-justify"></i>'; break;
                default: iconHTML = '<i class="fi fi-sc-align-left"></i>';
            }
            docAlignBtn.innerHTML = iconHTML;
        }

        function rgbToHex(rgb) {
            const m = rgb && rgb.match(/\d+(\.\d+)?/g);
            if (!m || m.length < 3) return null;
            return '#' + m.slice(0, 3).map(v => Math.round(parseFloat(v)).toString(16).padStart(2, '0')).join('');
        }

        // Pasa <font size> antiguos a px (misma apariencia que tenían)
        function normalizeLegacyFonts(root) {
            root.querySelectorAll('font[size]').forEach(f => {
                const px = LEGACY_FONT_PX[f.getAttribute('size')];
                if (px) f.style.fontSize = px + 'px';
                f.removeAttribute('size');
            });
        }

        // Convierte los <font size="7"> creados por execCommand en px exactos (los del menú)
        function applyPendingFontSize(root, px) {
            root.querySelectorAll('font[size="7"]').forEach(f => {
                // lo que haya dentro con otro tamaño no debe pisar el nuevo
                f.querySelectorAll('[style*="font-size"], font').forEach(inner => {
                    inner.style.fontSize = '';
                    if (inner.tagName === 'FONT') inner.removeAttribute('size');
                });
                f.removeAttribute('size');
                f.style.fontSize = px + 'px';
            });
        }

        // Refleja en la barra el formato real del texto donde está el cursor
        function syncFormatBar() {
            if (!docEditorPanel.classList.contains('open')) return;
            const sel = window.getSelection();
            if (!sel.rangeCount) return;
            let node = sel.anchorNode;
            if (!node || !docEditorPages.contains(node)) return;
            let el = node.nodeType === 3 ? node.parentElement : node;
            if (el && el.childNodes && node.nodeType === 1 && !sel.isCollapsed && el.childNodes[sel.anchorOffset] &&
                el.childNodes[sel.anchorOffset].nodeType === 1) {
                el = el.childNodes[sel.anchorOffset];
            }
            if (!el) return;
            const page = el.closest('.doc-editor-page');
            if (!page) return;

            // Estilo de párrafo
            const heading = el.closest('h1, h2, h3');
            setStyleUI(heading && page.contains(heading) ? heading.nodeName.toLowerCase() : 'p');

            // Tamaño real (si hay un tamaño pendiente sin escribir, ese)
            const cs = window.getComputedStyle(el);
            setFontSizeUI(pendingFontPx || parseFloat(cs.fontSize) || DEFAULT_FONT_PX);

            // Color
            if (document.activeElement !== docTextColor) {
                const hex = rgbToHex(cs.color);
                if (hex) docTextColor.value = hex;
            }

            // Alineación del bloque
            let block = el;
            while (block && block !== page && window.getComputedStyle(block).display.indexOf('inline') === 0) {
                block = block.parentElement;
            }
            let align = window.getComputedStyle(block || page).textAlign;
            if (align === 'start' || align === 'left' || align === '-webkit-left') align = 'left';
            else if (align === 'end' || align === '-webkit-right') align = 'right';
            else if (align === '-webkit-center') align = 'center';
            if (['left', 'center', 'right', 'justify'].indexOf(align) === -1) align = 'left';
            setAlignUI(align);

            // Negrita / cursiva / subrayado
            docBoldBtn.classList.toggle('active', document.queryCommandState('bold'));
            docItalicBtn.classList.toggle('active', document.queryCommandState('italic'));
            docUnderlineBtn.classList.toggle('active', document.queryCommandState('underline'));
        }

        // Al cambiar de estilo algunos navegadores meten el bloque nuevo DENTRO del antiguo
        // (<h1><p>..</p></h1>). Se desanida para que el cambio de estilo funcione siempre.
        function unwrapNestedBlocks(root) {
            const sel = window.getSelection();
            let pts = null;
            if (sel.rangeCount) {
                const r = sel.getRangeAt(0);
                pts = [r.startContainer, r.startOffset, r.endContainer, r.endOffset];
            }
            let changed = false;
            root.querySelectorAll('h1, h2, h3, p').forEach(outer => {
                if (!outer.parentNode) return;
                const hasBlockChild = Array.from(outer.children).some(c => /^(DIV|P|H1|H2|H3)$/.test(c.nodeName));
                if (!hasBlockChild) return;
                const parent = outer.parentNode;
                const idx = Array.prototype.indexOf.call(parent.childNodes, outer);
                if (pts) {
                    if (pts[0] === outer) { pts[0] = parent; pts[1] += idx; }
                    if (pts[2] === outer) { pts[2] = parent; pts[3] += idx; }
                }
                while (outer.firstChild) parent.insertBefore(outer.firstChild, outer);
                outer.remove();
                changed = true;
            });
            if (changed && pts && pts[0].isConnected && pts[2].isConnected) {
                const r = document.createRange();
                try {
                    r.setStart(pts[0], Math.min(pts[1], pts[0].nodeType === 3 ? pts[0].length : pts[0].childNodes.length));
                    r.setEnd(pts[2], Math.min(pts[3], pts[2].nodeType === 3 ? pts[2].length : pts[2].childNodes.length));
                    sel.removeAllRanges();
                    sel.addRange(r);
                } catch (err) { /* selección no válida: se deja como está */ }
            }
        }

        function applyTextStyle(style) {
            const stylePage = focusEditorForCommand();
            document.execCommand('formatBlock', false, '<' + style + '>');
            if (stylePage) unwrapNestedBlocks(stylePage);

            // Un título tiene su propio tamaño: se quitan los tamaños sueltos para que se vea y la barra lo marque
            if (style !== 'p') {
                const sel = window.getSelection();
                if (sel.rangeCount) {
                    const range = sel.getRangeAt(0);
                    docEditorPages.querySelectorAll('h1, h2, h3').forEach(h => {
                        if (!range.intersectsNode(h)) return;
                        h.querySelectorAll('[style*="font-size"], font').forEach(inner => {
                            inner.style.fontSize = '';
                            if (inner.tagName === 'FONT') inner.removeAttribute('size');
                        });
                    });
                }
            }
            pendingFontPx = null;
            saveSelection();
            syncFormatBar();
            if (!isRepaginating) scheduleRepaginateNow();
        }

        function applyFontSize(size) {
            const px = FONT_SIZE_PX[size] || DEFAULT_FONT_PX;
            const page = focusEditorForCommand();
            const sel = window.getSelection();
            const collapsed = !sel.rangeCount || sel.isCollapsed;

            document.execCommand('styleWithCSS', false, false);
            document.execCommand('fontSize', false, '7');

            if (collapsed) {
                // Sin texto seleccionado: se aplicará al escribir (se convierte en el evento input)
                pendingFontPx = px;
            } else {
                pendingFontPx = null;
                applyPendingFontSize(docEditorPages, px);
            }
            saveSelection();
            setFontSizeUI(px);
            if (page) page.focus({ preventScroll: true });
            if (!isRepaginating) scheduleRepaginateNow();
        }

        function applyAlignment(align) {
            focusEditorForCommand();
            if (align === 'justify') {
                document.execCommand('justifyFull', false, null);
            } else {
                document.execCommand('justify' + align.charAt(0).toUpperCase() + align.slice(1), false, null);
            }
            setAlignUI(align);
            saveSelection();
        }

        // ============================================
        // SELECTOR DE COLOR REUTILIZABLE
        // Presets + personalizado (HEX / RGB / HSL) + historial propio (máx. 16, se añade con el botón)
        // ============================================
        const COLOR_PRESETS = ['#222222', '#000000', '#ffffff', '#e53935', '#fb8c00', '#fdd835',
            '#43a047', '#00acc1', '#1e88e5', '#5e35b1', '#d81b60', '#8d6e63'];
        const COLOR_HISTORY_MAX = 16;
        const colorPickerInstances = [];
        const colorParseCtx = document.createElement('canvas').getContext('2d');

        function colorToHex(r, g, b) {
            return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
        }

        // Acepta cualquier formato CSS: #abc, #aabbcc, rgb(), hsl(), nombres (red)...
        function parseAnyColor(str) {
            str = (str || '').trim();
            if (!str) return null;
            if (/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(str)) str = '#' + str;
            colorParseCtx.fillStyle = '#010203';
            colorParseCtx.fillStyle = str;
            const v1 = colorParseCtx.fillStyle;
            colorParseCtx.fillStyle = '#020304';
            colorParseCtx.fillStyle = str;
            const v2 = colorParseCtx.fillStyle;
            if (v1 !== v2) return null; // formato no válido
            if (/^#[0-9a-f]{6}$/i.test(v1)) return v1.toLowerCase();
            const m = v1.match(/\d+(\.\d+)?/g);
            return m && m.length >= 3 ? colorToHex(+m[0], +m[1], +m[2]) : null;
        }

        function createColorPicker(opts) {
            const trigger = opts.trigger;
            const historyKey = opts.historyKey;
            const keepEditorSelection = !!opts.keepEditorSelection;
            const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

            let history = [];
            try {
                history = (JSON.parse(localStorage.getItem(historyKey)) || [])
                    .filter(c => /^#[0-9a-f]{6}$/i.test(c))
                    .filter((c, i, arr) => arr.findIndex(x => x.toLowerCase() === c.toLowerCase()) === i)
                    .slice(0, COLOR_HISTORY_MAX);
            } catch (err) { history = []; }

            const popup = document.createElement('div');
            popup.className = 'doc-color-popup';
            popup.innerHTML =
                '<div class="dcp-title">Colores</div>' +
                '<div class="dcp-swatches"></div>' +
                '<div class="dcp-title">Personalizado</div>' +
                '<div class="dcp-custom-head"><div class="dcp-preview"></div>' +
                '<div class="dcp-tabs">' +
                '<div class="dcp-tab active" data-mode="hex">HEX</div>' +
                '<div class="dcp-tab" data-mode="rgb">RGB</div>' +
                '<div class="dcp-tab" data-mode="hsl">HSL</div></div></div>' +
                '<div class="dcp-sliders">' +
                '<input type="range" class="dcp-h" min="0" max="360" step="1">' +
                '<input type="range" class="dcp-s" min="0" max="100" step="1">' +
                '<input type="range" class="dcp-l" min="0" max="100" step="1"></div>' +
                '<div class="dcp-fields"></div>' +
                '<div class="dcp-hint">Admite #hex, rgb(), hsl() o nombres (red)</div>' +
                '<div class="dcp-add" role="button" tabindex="0"><span class="dcp-add-label">Añadir al historial</span></div>' +
                '<div class="dcp-title"><span>Historial</span><span class="dcp-count"></span></div>' +
                '<div class="dcp-history"></div>';
            document.body.appendChild(popup);

            const swatchesEl = popup.querySelector('.dcp-swatches');
            const historyEl = popup.querySelector('.dcp-history');
            const previewEl = popup.querySelector('.dcp-preview');
            const fieldsEl = popup.querySelector('.dcp-fields');
            const sliderH = popup.querySelector('.dcp-h');
            const sliderS = popup.querySelector('.dcp-s');
            const sliderL = popup.querySelector('.dcp-l');
            const tabs = popup.querySelectorAll('.dcp-tab');
            const addBtn = popup.querySelector('.dcp-add');
            const addLabel = popup.querySelector('.dcp-add-label');
            const countEl = popup.querySelector('.dcp-count');
            let mode = 'hex';
            let cur = { r: 34, g: 34, b: 34, h: 0, s: 0, l: 13 };

            const curHex = () => colorToHex(cur.r, cur.g, cur.b);
            const inHistory = (hex) => history.some(c => c.toLowerCase() === hex.toLowerCase());
            const saveHistory = () => {
                try { localStorage.setItem(historyKey, JSON.stringify(history)); } catch (err) { /* sin espacio */ }
            };

            function setFromRgb(r, g, b, keepHue) {
                const hsl = rgbToHsl(r, g, b);
                cur.r = r; cur.g = g; cur.b = b;
                cur.l = Math.round(hsl.l);
                cur.s = Math.round(hsl.s);
                // En los grises el matiz no se puede deducir: se conserva el actual
                cur.h = (keepHue && hsl.s < 1) ? cur.h : Math.round(hsl.h);
            }
            function setFromHsl(h, s, l) {
                const c = hslToRgb(h, s, l);
                cur.h = h; cur.s = s; cur.l = l;
                cur.r = c.r; cur.g = c.g; cur.b = c.b;
            }

            function apply() { if (opts.onApply) opts.onApply(curHex()); }

            function renderDots(container, colors, removable) {
                container.innerHTML = '';
                const now = curHex().toLowerCase();
                colors.forEach(c => {
                    const d = document.createElement('div');
                    d.className = 'dcp-dot' + (c.toLowerCase() === now ? ' selected' : '');
                    d.style.setProperty('--c', c);
                    d.title = c;
                    d.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const rgb = hexToRgb(c);
                        setFromRgb(rgb.r, rgb.g, rgb.b, true);
                        refresh(true);
                        apply();
                    });
                    if (removable) {
                        const del = document.createElement('span');
                        del.className = 'dcp-del';
                        del.textContent = '×';
                        del.title = 'Quitar del historial';
                        del.addEventListener('click', (e) => {
                            e.stopPropagation();
                            history = history.filter(x => x.toLowerCase() !== c.toLowerCase());
                            saveHistory();
                            refresh(false);
                        });
                        d.appendChild(del);
                    }
                    container.appendChild(d);
                });
            }

            function updateAddBtn() {
                const has = inHistory(curHex());
                const full = history.length >= COLOR_HISTORY_MAX;
                addBtn.classList.toggle('disabled', has || full);
                addLabel.textContent = has ? 'Ya está en el historial' : (full ? 'Historial lleno' : 'Añadir al historial');
                countEl.textContent = history.length + '/' + COLOR_HISTORY_MAX;
            }

            function renderHistory() {
                if (history.length === 0) {
                    historyEl.innerHTML = '<span class="dcp-history-empty">Aún no has añadido ningún color</span>';
                } else {
                    renderDots(historyEl, history, true);
                }
                updateAddBtn();
            }

            function addCurrentToHistory() {
                const hex = curHex();
                if (inHistory(hex) || history.length >= COLOR_HISTORY_MAX) return;
                history.unshift(hex);
                saveHistory();
                refresh(false);
            }
            addBtn.addEventListener('click', (e) => { e.stopPropagation(); addCurrentToHistory(); });
            addBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addCurrentToHistory(); }
            });

            function renderFields() {
                fieldsEl.innerHTML = '';
                const mk = (value, attrs) => {
                    const inp = document.createElement('input');
                    inp.className = 'dcp-field';
                    inp.value = value;
                    Object.keys(attrs || {}).forEach(k => inp.setAttribute(k, attrs[k]));
                    fieldsEl.appendChild(inp);
                    return inp;
                };
                if (mode === 'hex') {
                    const inp = mk(curHex(), { type: 'text', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Color' });
                    const commit = () => {
                        const hex = parseAnyColor(inp.value);
                        if (!hex) { inp.classList.add('invalid'); return; }
                        const rgb = hexToRgb(hex);
                        setFromRgb(rgb.r, rgb.g, rgb.b, true);
                        refresh(true);
                        apply();
                    };
                    inp.addEventListener('change', commit);
                    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
                } else {
                    const defs = mode === 'rgb'
                        ? [['r', 255, 'R'], ['g', 255, 'G'], ['b', 255, 'B']]
                        : [['h', 360, 'H'], ['s', 100, 'S'], ['l', 100, 'L']];
                    const inputs = defs.map(d => mk(cur[d[0]], { type: 'number', min: 0, max: d[1], step: 1, 'aria-label': d[2], placeholder: d[2] }));
                    const commit = () => {
                        const v = inputs.map((inp, i) => clamp(parseInt(inp.value, 10) || 0, 0, defs[i][1]));
                        if (mode === 'rgb') setFromRgb(v[0], v[1], v[2], true);
                        else setFromHsl(v[0], v[1], v[2]);
                        refresh(true);
                        apply();
                    };
                    inputs.forEach(inp => {
                        inp.addEventListener('change', commit);
                        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
                    });
                }
            }

            function paintSliders() {
                sliderH.value = cur.h; sliderS.value = cur.s; sliderL.value = cur.l;
                sliderH.style.background = 'linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))';
                sliderS.style.background = 'linear-gradient(to right, hsl(' + cur.h + ',0%,' + cur.l + '%), hsl(' + cur.h + ',100%,' + cur.l + '%))';
                sliderL.style.background = 'linear-gradient(to right, #000, hsl(' + cur.h + ',' + cur.s + '%,50%), #fff)';
                previewEl.style.setProperty('--c', curHex());
            }

            // rebuildFields = reconstruir los campos de texto (si no, solo se actualizan sus valores)
            function refresh(rebuildFields) {
                paintSliders();
                if (rebuildFields) {
                    renderFields();
                } else {
                    const inputs = fieldsEl.querySelectorAll('.dcp-field');
                    if (mode === 'hex') inputs[0].value = curHex();
                    else if (mode === 'rgb') { inputs[0].value = cur.r; inputs[1].value = cur.g; inputs[2].value = cur.b; }
                    else { inputs[0].value = cur.h; inputs[1].value = cur.s; inputs[2].value = cur.l; }
                    inputs.forEach(i => i.classList.remove('invalid'));
                }
                renderDots(swatchesEl, COLOR_PRESETS, false);
                renderHistory();
            }

            // Sliders: en el documento se aplica al soltar (para no perder la selección); en el resto, en vivo
            [sliderH, sliderS, sliderL].forEach(sl => {
                sl.addEventListener('input', () => {
                    setFromHsl(+sliderH.value, +sliderS.value, +sliderL.value);
                    refresh(false);
                    if (!keepEditorSelection) apply();
                });
                sl.addEventListener('change', () => { if (keepEditorSelection) apply(); });
            });

            tabs.forEach(t => t.addEventListener('click', (e) => {
                e.stopPropagation();
                mode = t.dataset.mode;
                tabs.forEach(x => x.classList.toggle('active', x === t));
                renderFields();
            }));

            // Clic dentro del popup: no se pierde el foco/selección salvo en los campos de texto
            popup.addEventListener('mousedown', (e) => {
                if (!e.target.closest('input')) e.preventDefault();
            });

            function place() {
                popup.style.maxHeight = (window.innerHeight - 16) + 'px';
                const r = trigger.getBoundingClientRect();
                const w = popup.offsetWidth, h = popup.offsetHeight;
                let top = r.top - h - 8;
                if (top < 8) {
                    top = r.bottom + 8;
                    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
                }
                const left = clamp(r.left + r.width / 2 - w / 2, 8, Math.max(8, window.innerWidth - w - 8));
                popup.style.top = top + 'px';
                popup.style.left = left + 'px';
            }

            const inst = {
                isOpen: () => popup.classList.contains('visible'),
                close: () => popup.classList.remove('visible'),
                open: () => {
                    colorPickerInstances.forEach(i => { if (i !== inst) i.close(); });
                    if (opts.onOpen) opts.onOpen();
                    const rgb = hexToRgb(parseAnyColor(trigger.value) || '#222222');
                    setFromRgb(rgb.r, rgb.g, rgb.b, false);
                    refresh(true);
                    place();
                    popup.classList.add('visible');
                }
            };
            colorPickerInstances.push(inst);

            // El selector nativo no se abre: se usa este
            trigger.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (inst.isOpen()) inst.close(); else inst.open();
            });
            trigger.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger.click(); }
            });

            document.addEventListener('mousedown', (e) => {
                if (inst.isOpen() && !popup.contains(e.target) && !trigger.contains(e.target)) inst.close();
            }, true);
            window.addEventListener('scroll', (e) => {
                if (!inst.isOpen() || popup.contains(e.target)) return;
                // El popup sigue al botón mientras se hace scroll; si el botón sale de pantalla, se cierra
                const r = trigger.getBoundingClientRect();
                if (r.bottom < 0 || r.top > window.innerHeight) inst.close(); else place();
            }, true);
            window.addEventListener('resize', () => { if (inst.isOpen()) inst.close(); });

            return inst;
        }

        // ============================================
        // SELECTORES DE FECHA Y HORA PERSONALIZADOS
        // El <input> sigue guardando el valor (AAAA-MM-DD / HH:MM); solo se sustituye el desplegable nativo.
        // ============================================
        const DT_MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const DT_WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
        const dtPop = document.createElement('div');
        dtPop.className = 'dt-popup';
        document.body.appendChild(dtPop);
        let dtState = null;   // { input, wrapper, kind: 'date'|'time', view, y, m }
        const dtp2 = n => String(n).padStart(2, '0');

        function dtEmit(input) {
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        function dtMk(cls, text) {
            const d = document.createElement('div');
            d.className = cls;
            if (text !== undefined) d.textContent = text;
            return d;
        }
        function dtClose() {
            if (!dtState) return;
            dtState.wrapper.classList.remove('dt-active');
            dtPop.classList.remove('visible');
            dtState = null;
        }
        function dtPlace() {
            if (!dtState) return;
            const r = dtState.wrapper.getBoundingClientRect();
            const w = dtPop.offsetWidth, h = dtPop.offsetHeight;
            let top = r.bottom + 6;
            if (top + h > window.innerHeight - 8) {
                const above = r.top - h - 6;
                top = above >= 8 ? above : Math.max(8, window.innerHeight - h - 8);
            }
            const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
            dtPop.style.top = top + 'px';
            dtPop.style.left = left + 'px';
        }

        function dtRenderDate() {
            const s = dtState, inp = s.input;
            const sel = inp.value, today = formatDate(new Date());
            dtPop.innerHTML = '';
            dtPop.classList.remove('dt-time');
            const head = dtMk('dt-head');
            const prev = dtMk('dt-nav'); prev.innerHTML = '<i class="fas fa-chevron-left"></i>';
            const next = dtMk('dt-nav'); next.innerHTML = '<i class="fas fa-chevron-right"></i>';
            const title = dtMk('dt-title', s.view === 'months' ? String(s.y) : DT_MONTHS[s.m] + ' ' + s.y);
            const step = dir => {
                if (s.view === 'months') s.y += dir;
                else { s.m += dir; if (s.m < 0) { s.m = 11; s.y--; } else if (s.m > 11) { s.m = 0; s.y++; } }
                dtRenderDate(); dtPlace();
            };
            prev.addEventListener('click', () => step(-1));
            next.addEventListener('click', () => step(1));
            title.addEventListener('click', () => { s.view = s.view === 'months' ? 'days' : 'months'; dtRenderDate(); dtPlace(); });
            head.appendChild(prev); head.appendChild(title); head.appendChild(next);
            dtPop.appendChild(head);

            if (s.view === 'months') {
                const grid = dtMk('dt-months');
                DT_MONTHS.forEach((name, i) => {
                    const m = dtMk('dt-month' + (sel && sel.startsWith(s.y + '-' + dtp2(i + 1)) ? ' sel' : ''), name.slice(0, 3));
                    m.addEventListener('click', () => { s.m = i; s.view = 'days'; dtRenderDate(); dtPlace(); });
                    grid.appendChild(m);
                });
                dtPop.appendChild(grid);
            } else {
                const grid = dtMk('dt-grid');
                DT_WEEKDAYS.forEach(d => grid.appendChild(dtMk('dt-wd', d)));
                const offset = (new Date(s.y, s.m, 1).getDay() + 6) % 7;
                for (let i = 0; i < 42; i++) {
                    const d = new Date(s.y, s.m, 1 - offset + i), str = formatDate(d);
                    let cls = 'dt-day';
                    if (d.getMonth() !== s.m) cls += ' out';
                    if (str === today) cls += ' today';
                    if (str === sel) cls += ' sel';
                    if ((inp.min && str < inp.min) || (inp.max && str > inp.max)) cls += ' disabled';
                    const cell = dtMk(cls, String(d.getDate()));
                    cell.addEventListener('click', () => { inp.value = str; dtEmit(inp); dtClose(); });
                    grid.appendChild(cell);
                }
                dtPop.appendChild(grid);
            }

            const actions = dtMk('dt-actions');
            const hoy = dtMk('dt-btn', 'Hoy');
            hoy.addEventListener('click', () => { inp.value = today; dtEmit(inp); dtClose(); });
            actions.appendChild(hoy);
            if (!inp.required) {
                const clr = dtMk('dt-btn', 'Borrar');
                clr.addEventListener('click', () => { inp.value = ''; dtEmit(inp); dtClose(); });
                actions.appendChild(clr);
            }
            dtPop.appendChild(actions);
        }

        function dtRenderTime() {
            const s = dtState, inp = s.input;
            dtPop.innerHTML = '';
            dtPop.classList.add('dt-time');
            const preview = dtMk('dt-preview');
            const cols = dtMk('dt-cols');
            const mkCol = (label, count) => {
                const wrap = dtMk('dt-colwrap'); wrap.appendChild(dtMk('dt-coltitle', label));
                const col = dtMk('dt-col');
                for (let i = 0; i < count; i++) { const it = dtMk('dt-item', dtp2(i)); it.dataset.v = i; col.appendChild(it); }
                wrap.appendChild(col); cols.appendChild(wrap);
                return col;
            };
            const hCol = mkCol('Hora', 24), mCol = mkCol('Min', 60);
            // La hora se elige aquí y no se pasa al campo hasta pulsar "Listo"
            const mv = /^(\d{2}):(\d{2})/.exec(inp.value || '');
            let pending = mv ? { h: +mv[1], m: +mv[2] } : null;
            const cur = () => pending;
            const paint = (scroll) => {
                const c = cur();
                preview.textContent = c ? dtp2(c.h) + ':' + dtp2(c.m) : '--:--';
                [[hCol, c && c.h], [mCol, c && c.m]].forEach(([col, v]) => {
                    col.querySelectorAll('.dt-item').forEach(it => it.classList.toggle('sel', v !== null && v !== undefined && +it.dataset.v === v));
                    if (scroll && v !== null && v !== undefined) {
                        const it = col.children[v];
                        col.scrollTop = it.offsetTop - (col.clientHeight - it.offsetHeight) / 2;   // centrado, sin pegarlo arriba
                    }
                });
            };
            const setTime = (h, m) => { pending = { h, m }; paint(false); };
            hCol.addEventListener('click', e => {
                const it = e.target.closest('.dt-item'); if (!it) return;
                const c = cur(); setTime(+it.dataset.v, c ? c.m : 0);
            });
            mCol.addEventListener('click', e => {
                const it = e.target.closest('.dt-item'); if (!it) return;
                const c = cur(); setTime(c ? c.h : new Date().getHours(), +it.dataset.v);
            });
            dtPop.appendChild(preview); dtPop.appendChild(cols);
            const actions = dtMk('dt-actions');
            const ahora = dtMk('dt-btn', 'Ahora');
            ahora.addEventListener('click', () => { const n = new Date(); setTime(n.getHours(), n.getMinutes()); paint(true); });
            actions.appendChild(ahora);
            const clr = dtMk('dt-btn', 'Borrar');
            clr.addEventListener('click', () => { inp.value = ''; dtEmit(inp); dtClose(); });
            actions.appendChild(clr);
            const ok = dtMk('dt-btn primary', 'Listo');
            const confirmTime = () => {
                if (pending) { inp.value = dtp2(pending.h) + ':' + dtp2(pending.m); dtEmit(inp); }
                dtClose();
            };
            ok.addEventListener('click', confirmTime);
            actions.appendChild(ok);
            s.confirm = confirmTime;
            dtPop.appendChild(actions);
            s.paintTime = paint;
        }

        function openDateTimePicker(input) {
            const wrapper = input.closest('.date-input-wrapper, .time-input-wrapper');
            if (!wrapper) return;
            if (dtState && dtState.input === input) { dtClose(); return; }
            dtClose();
            colorPickerInstances.forEach(i => i.close());
            const kind = input.type === 'time' ? 'time' : 'date';
            const base = (input.value && /^\d{4}-\d{2}-\d{2}$/.test(input.value))
                ? new Date(input.value + 'T00:00:00')
                : (kind === 'date' && input.id === 'eventEnd' && eventStartEl.value ? new Date(eventStartEl.value + 'T00:00:00') : new Date());
            dtState = { input, wrapper, kind, view: 'days', y: base.getFullYear(), m: base.getMonth() };
            wrapper.classList.add('dt-active');
            if (kind === 'date') dtRenderDate(); else dtRenderTime();
            dtPlace();
            dtPop.classList.add('visible');
            if (kind === 'time' && dtState.paintTime) dtState.paintTime(true);
        }

        function setupDateTimePickers() {
            document.querySelectorAll('input[type="date"], input[type="time"]').forEach(input => {
                const wrapper = input.closest('.date-input-wrapper, .time-input-wrapper');
                if (!wrapper) return;
                wrapper.addEventListener('click', e => {
                    if (e.target.closest('.clear-time-btn')) return;
                    e.preventDefault();
                    openDateTimePicker(input);
                });
                input.addEventListener('keydown', e => {
                    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); openDateTimePicker(input); }
                });
            });
            document.addEventListener('mousedown', e => {
                if (!dtState) return;
                if (dtPop.contains(e.target) || dtState.wrapper.contains(e.target)) return;
                dtClose();
            }, true);
            document.addEventListener('keydown', e => {
                if (!dtState) return;
                if (e.key === 'Escape' || e.key === 'Enter') {
                    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
                    if (e.key === 'Enter' && dtState.confirm) dtState.confirm(); else dtClose();
                }
            }, true);
            window.addEventListener('scroll', e => {
                if (!dtState || dtPop.contains(e.target)) return;
                const r = dtState.wrapper.getBoundingClientRect();
                if (r.bottom < 0 || r.top > window.innerHeight) dtClose(); else dtPlace();
            }, true);
            window.addEventListener('resize', dtClose);
        }

        // Selectores de color del resto del calendario (cada uno con su historial)
        function setupColorPickers() {
            [
                ['categoryColor', 'colorHistory_category'],
                ['editCategoryColor', 'colorHistory_editCategory'],
                ['folderCustomColor', 'colorHistory_folder']
            ].forEach(([id, key]) => {
                const el = document.getElementById(id);
                if (!el) return;
                createColorPicker({
                    trigger: el,
                    historyKey: key,
                    onApply: (hex) => {
                        el.value = hex;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                });
            });
        }

        function setupFormatBarEvents() {
            const docMoreBtn = document.getElementById('docMoreBtn');
            const docMoreMenu = document.getElementById('docMoreMenu');

            // Selector de color del documento (historial propio: 'docColorHistory')
            const docColorPicker = createColorPicker({
                trigger: docTextColor,
                historyKey: 'docColorHistory',
                keepEditorSelection: true,
                onOpen: () => {
                    [docStyleMenu, docFontSizeMenu, docAlignMenu, docMoreMenu, docActionsMenu, docExportSubmenu].forEach(m => m.classList.remove('visible'));
                    docStyleBtn.classList.remove('active');
                    docFontSizeBtn.classList.remove('active');
                },
                onApply: (hex) => {
                    docTextColor.value = hex;
                    focusEditorForCommand();
                    document.execCommand('styleWithCSS', false, true);
                    document.execCommand('foreColor', false, hex);
                    document.execCommand('styleWithCSS', false, false);
                    saveSelection();
                    if (!isRepaginating) scheduleRepaginateNow();
                }
            });
            closeDocColorPopup = docColorPicker.close;
            docMoreBtn.addEventListener('mousedown', (e) => e.preventDefault());
            docMoreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const open = !docMoreMenu.classList.contains('visible');
                [docStyleMenu, docFontSizeMenu, docAlignMenu, docActionsMenu, docExportSubmenu].forEach(m => m.classList.remove('visible'));
                docStyleBtn.classList.remove('active');
                docFontSizeBtn.classList.remove('active');
                docMoreMenu.classList.toggle('visible', open);
            });
            docMoreMenu.querySelectorAll('button').forEach(b => b.addEventListener('click', () => docMoreMenu.classList.remove('visible')));
            document.addEventListener('mousedown', (e) => {
                if (!docMoreMenu.contains(e.target) && !docMoreBtn.contains(e.target)) docMoreMenu.classList.remove('visible');
            });

            docFormatBar.querySelectorAll('button[data-cmd]').forEach(b => {
                b.addEventListener('mousedown', (e) => e.preventDefault());
                b.addEventListener('click', () => {
                    focusEditorForCommand();
                    document.execCommand(b.dataset.cmd);
                    saveSelection();
                    syncFormatBar();
                    scheduleRepaginateNow();
                });
            });

            // Guardar selección continuamente mientras el foco esté dentro del editor
            document.addEventListener('selectionchange', () => {
                if (!docEditorPanel.classList.contains('open')) return;
                const sel = window.getSelection();
                if (sel.rangeCount === 0) return;
                const node = sel.anchorNode;
                if (!node || !docEditorPages.contains(node)) return;
                saveSelection();
            });

            // Botones de la barra principal que no deben perder la selección
            const preventBlurButtons = [
                docBoldBtn, docItalicBtn, docUnderlineBtn, docAlignBtn,
                docStyleBtn, docFontSizeBtn, docActionsBtn, docActionsDownload
            ];
            preventBlurButtons.forEach(btn => {
                btn.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                });
            });

            // Botones de los submenús (estilos, tamaños, alineación, acciones, exportar)
            const submenuButtons = docStyleMenu.querySelectorAll('button');
            submenuButtons.forEach(btn => {
                btn.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                });
            });
            docFontSizeMenu.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                });
            });
            docAlignMenu.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                });
            });
            docActionsMenu.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                });
            });
            docExportSubmenu.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                });
            });

            // Aplicar estilos a los botones del submenú de estilos
            docStyleMenu.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const style = btn.getAttribute('data-style');
                    applyTextStyle(style);
                    docStyleMenu.classList.remove('visible');
                    docStyleBtn.classList.remove('active');
                });
            });

            // Aplicar tamaños a los botones del submenú de tamaños
            docFontSizeMenu.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const size = btn.getAttribute('data-size');
                    applyFontSize(size);
                    docFontSizeMenu.classList.remove('visible');
                    docFontSizeBtn.classList.remove('active');
                });
            });

            // Aplicar alineación a los botones del submenú de alineación
            docAlignMenu.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const align = btn.getAttribute('data-align');
                    applyAlignment(align);
                    docAlignMenu.classList.remove('visible');
                });
            });

            docBoldBtn.addEventListener('click', () => {
                focusEditorForCommand();
                document.execCommand('bold');
                saveSelection();
                syncFormatBar();
            });

            docItalicBtn.addEventListener('click', () => {
                focusEditorForCommand();
                document.execCommand('italic');
                saveSelection();
                syncFormatBar();
            });

            docUnderlineBtn.addEventListener('click', () => {
                focusEditorForCommand();
                document.execCommand('underline');
                saveSelection();
                syncFormatBar();
            });

            docTextColor.addEventListener('mousedown', (e) => {
                // No prevenir por defecto aquí porque el input color nativo necesita el click
                e.stopPropagation();
            });

            docEditorPages.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
                    const k = (e.key || '').toLowerCase();
                    if (k === 'b' || k === 'i' || k === 'u') {
                        e.preventDefault();
                        document.execCommand(k === 'b' ? 'bold' : (k === 'i' ? 'italic' : 'underline'));
                        syncFormatBar();
                    }
                }
            });

            document.addEventListener('selectionchange', () => {
                if (!docEditorPanel.classList.contains('open')) return;
                const sel = window.getSelection();
                if (sel.rangeCount === 0) return;
                const node = sel.anchorNode;
                if (!node || !docEditorPages.contains(node)) return;

                syncFormatBar();
            });
        }

        // ============================================
        // LISTAS AUTOMÁTICAS ("- " / "* " / "1. ")
        // ============================================
        const EDITOR_BLOCK_TAGS = /^(DIV|P|H1|H2|H3|H4|H5|H6|LI|BLOCKQUOTE)$/;

        // ¿El nodo de texto está al principio de su línea?
        function isAtLineStart(node, page) {
            let n = node;
            while (n && n !== page) {
                let prev = n.previousSibling;
                while (prev && prev.nodeType === 3 && prev.textContent === '') {
                    prev = prev.previousSibling; // ignorar textos vacíos
                }
                if (prev) return prev.nodeName === 'BR';
                const parent = n.parentNode;
                if (parent === page || EDITOR_BLOCK_TAGS.test(parent.nodeName)) return true;
                n = parent;
            }
            return true;
        }

        function isInsideListItem() {
            const sel = window.getSelection();
            if (!sel.rangeCount) return false;
            const node = sel.anchorNode;
            const el = node && (node.nodeType === 3 ? node.parentElement : node);
            return !!(el && el.closest && el.closest('li'));
        }

        // Devuelve true si convirtió el marcador en lista
        function tryAutoList() {
            const sel = window.getSelection();
            if (!sel.rangeCount || !sel.isCollapsed) return false;

            const range = sel.getRangeAt(0);
            const node = range.startContainer;
            if (node.nodeType !== Node.TEXT_NODE) return false;

            const el = node.parentElement;
            const page = el && el.closest('.doc-editor-page');
            if (!page || el.closest('li')) return false;
            if (!isAtLineStart(node, page)) return false;

            const before = node.textContent.slice(0, range.startOffset);
            let command = null;
            if (/^[-*]$/.test(before)) command = 'insertUnorderedList';
            else if (/^1[.)]$/.test(before)) command = 'insertOrderedList';
            if (!command) return false;

            // Seleccionar el marcador y borrarlo con execCommand (así Ctrl+Z lo restaura)
            const r = document.createRange();
            r.setStart(node, 0);
            r.setEnd(node, range.startOffset);
            sel.removeAllRanges();
            sel.addRange(r);
            document.execCommand('delete');
            document.execCommand(command);
            return true;
        }

        // Eventos del editor
        function setupEditorEvents() {
            const scheduleRepaginate = () => {
                if (repaginateScheduled) clearTimeout(repaginateScheduled);
                repaginateScheduled = setTimeout(() => {
                    repaginateScheduled = null;
                    repaginate(false);
                }, 150);
            };

            scheduleRepaginateNow = scheduleRepaginate;

            docEditorTitle.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const p = docEditorPages.querySelector('.doc-editor-page');
                    if (p) p.focus();
                }
            });
            docEditorTitle.addEventListener('paste', (e) => {
                e.preventDefault();
                const t = (e.clipboardData.getData('text/plain') || '').replace(/\s+/g, ' ');
                document.execCommand('insertText', false, t);
            });
            document.addEventListener('keydown', (e) => {
                if (!docEditorPanel.classList.contains('open') || docEditorPanel.classList.contains('hidden-mode') || docViewerState) return;
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    if (e.shiftKey) openSaveAsModal(); else saveDocEditor(false);
                }
            });
            docEditorPages.addEventListener('paste', (e) => {
                e.preventDefault();
                const imgFile = Array.from((e.clipboardData || window.clipboardData).files || []).find(f => /^image\/(png|jpe?g|gif|webp)$/i.test(f.type));
                if (imgFile) { insertImageFile(imgFile); return; }
                const text = (e.clipboardData || window.clipboardData).getData('text/plain');
                document.execCommand('insertText', false, text);
                scheduleRepaginate();
            });

            docEditorPages.addEventListener('input', (e) => {
                if (e.target.classList.contains('doc-editor-page')) {
                    // Tamaño elegido sin selección: el primer texto escrito lo recibe
                    if (pendingFontPx) {
                        applyPendingFontSize(e.target, pendingFontPx);
                        pendingFontPx = null;
                    }
                    if (!isRepaginating) {
                        scheduleRepaginate();
                    }
                }
            });

            // Mover el cursor cancela el tamaño pendiente
            docEditorPages.addEventListener('mousedown', () => { pendingFontPx = null; });
            docEditorPages.addEventListener('keydown', (e) => {
                if (/^(Arrow|Home$|End$|Page)/.test(e.key)) pendingFontPx = null;
            });

            // Teclado del editor: listas automáticas, Tab y Backspace
            docEditorPages.addEventListener('keydown', (e) => {
                if (!e.target.classList.contains('doc-editor-page')) return;

                // NUEVO: "- " / "* " / "1. " al principio de línea -> lista
                if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    if (tryAutoList()) {
                        e.preventDefault();
                        if (!isRepaginating) scheduleRepaginate();
                        return;
                    }
                }

                // CAMBIADO: Tab da sangría dentro de una lista; fuera de una lista inserta espacios como antes
                if (e.key === 'Tab') {
                    e.preventDefault();
                    if (tableTab(e)) { if (!isRepaginating) scheduleRepaginate(); return; }
                    if (isInsideListItem()) {
                        document.execCommand(e.shiftKey ? 'outdent' : 'indent');
                    } else {
                        docIndent(e.shiftKey ? -1 : 1);   // Tab sangra el párrafo; Mayús+Tab reduce la sangría
                    }
                    if (!isRepaginating) scheduleRepaginate();
                    return;
                }

                // Backspace / Supr en el límite entre páginas
                if (e.key === 'Backspace' || e.key === 'Delete') {
                    const page = e.target;
                    const sel = window.getSelection();
                    if (!sel.rangeCount || !sel.isCollapsed) return;
                    const range = sel.getRangeAt(0);
                    if (e.key === 'Backspace') {
                        const prev = page.previousElementSibling;
                        const first = page.firstChild;
                        if (!prev || !prev.classList.contains('doc-editor-page') || !first) return;
                        if (!(first === range.startContainer || first.contains(range.startContainer))) return;
                        const r = document.createRange();
                        r.selectNodeContents(page);
                        r.setEnd(range.startContainer, range.startOffset);
                        if (r.toString() !== '') return;
                        e.preventDefault();
                        prev.appendChild(first);
                        prev.focus({ preventScroll: true });
                        const c = document.createRange();
                        c.setStart(first, 0);
                        c.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(c);
                        document.execCommand('delete');
                        scheduleRepaginate();
                    } else {
                        const next = page.nextElementSibling;
                        const last = page.lastChild;
                        if (!next || !next.classList.contains('doc-editor-page') || !last || !next.firstChild) return;
                        if (!(last === range.endContainer || last.contains(range.endContainer))) return;
                        const r = document.createRange();
                        r.selectNodeContents(page);
                        r.setStart(range.endContainer, range.endOffset);
                        if (r.toString() !== '') return;
                        e.preventDefault();
                        page.appendChild(next.firstChild);
                        const c = document.createRange();
                        c.selectNodeContents(last);
                        c.collapse(false);
                        sel.removeAllRanges();
                        sel.addRange(c);
                        document.execCommand('forwardDelete');
                        scheduleRepaginate();
                    }
                }
            });
        }

        // ============================================
        // AGENDA DE HOY (POPUP GRANDE CON ANIMACIÓN DE OPACIDAD)
        // ============================================
        // La agenda cubre las 24 h del día
        const AGENDA_HOUR_HEIGHT = 61;
        const AGENDA_START_HOUR = 0;
        const AGENDA_END_HOUR = 23;
        let agendaRenderedDate = null;
        let agendaMode = 'day';
        let agendaDate = formatDate(new Date());
        let agendaNowTimer = null;

        // Coloca la línea de "ahora"; si ha pasado la medianoche, repinta la agenda con el nuevo día
        function updateAgendaNowLine() {
            const wkNow = agendaBody.querySelector('.wk-now');
            if (wkNow) {
                const n = new Date();
                const top = ((n.getHours() + n.getMinutes() / 60) * AGENDA_HOUR_HEIGHT) + 'px';
                wkNow.style.top = top;
                const wkLabel = agendaBody.querySelector('.wk-now-label');
                if (wkLabel) {
                    wkLabel.style.top = top;
                    wkLabel.textContent = String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
                }
                return;
            }
            const line = agendaBody.querySelector('.agenda-now-line');
            if (!line) return;
            const now = new Date();
            if (agendaRenderedDate && formatDate(now) !== agendaRenderedDate) {
                // Pasó la medianoche: si se estaba viendo "hoy", se pasa al nuevo día
                if (agendaDate === agendaRenderedDate) agendaDate = formatDate(now);
                renderAgenda();
                return;
            }
            const hours = now.getHours() + now.getMinutes() / 60;
            line.style.top = ((hours - AGENDA_START_HOUR) * AGENDA_HOUR_HEIGHT) + 'px';
            line.querySelector('.agenda-now-label').textContent =
                String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        }

        function scrollAgendaToNow() {
            const line = agendaBody.querySelector('.agenda-now-line');
            if (!line) return;
            const grid = line.parentElement;
            const y = grid.offsetTop + (parseFloat(line.style.top) || 0);
            agendaBody.scrollTop = Math.max(0, y - agendaBody.clientHeight / 3);
        }

        function openAgendaFunc() {
            agendaMode = 'day'; agendaDate = formatDate(new Date());
            agendaPopupOpen = true;
            renderAgenda();
            // Forzar reflow para que la transición de opacidad funcione
            void agendaPopup.offsetWidth;
            agendaPopup.classList.add('open');
            scrollAgendaToNow();
            clearInterval(agendaNowTimer);
            agendaNowTimer = setInterval(updateAgendaNowLine, 30000);
        }

        function closeAgendaFunc() {
            agendaPopupOpen = false;
            clearInterval(agendaNowTimer);
            agendaPopup.classList.remove('open');
            // Vaciar la agenda cuando termina el fade, para no dejar elementos viejos en el DOM
            setTimeout(() => {
                if (!agendaPopupOpen) agendaBody.innerHTML = '';
            }, 400);
        }

        // Envoltorio seguro: si algo falla, el popup se abre igualmente y enseña el error
        function renderAgenda() {
            const keepScroll = agendaBody.scrollTop;
            try {
                if (agendaMode === 'week') buildWeekAgenda(); else buildAgenda();
                updateAgendaHeader();
                agendaBody.scrollTop = keepScroll;
            } catch (err) {
                console.error('Error al pintar la agenda:', err);
                agendaBody.innerHTML =
                    '<div class="agenda-no-events">' +
                    '<i class="fi fi-sr-calendar-xmark"></i>' +
                    '<p>No se pudo pintar la agenda</p>' +
                    '<small>' + String(err && err.message ? err.message : err)
                        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</small>' +
                    '</div>';
            }
        }

        function buildAgenda() {
            agendaBody.innerHTML = '';

            const todayStr = agendaDate;
            const timedEvents = getEventsForDay(todayStr).filter(e => e.startTime).map(e => dayView(e, todayStr)).filter(e => e.startTime);

            // Sin eventos con hora
            if (timedEvents.length === 0) {
                const noEvents = document.createElement('div');
                noEvents.className = 'agenda-no-events';
                noEvents.innerHTML =
                    '<i class="fi fi-sr-calendar-xmark"></i>' +
                    '<p>No hay eventos con hora para este día</p>';
                agendaBody.appendChild(noEvents);
                return;
            }

            const HOUR_HEIGHT = AGENDA_HOUR_HEIGHT; // 60px de contenido + 1px de borde
            const START_HOUR = AGENDA_START_HOUR;
            const END_HOUR = AGENDA_END_HOUR;
            const TOTAL_HOURS = END_HOUR - START_HOUR + 1;

            // Rejilla
            const grid = document.createElement('div');
            grid.className = 'agenda-grid';
            grid.style.position = 'relative';
            grid.style.height = (TOTAL_HOURS * HOUR_HEIGHT) + 'px';
            grid.style.width = '100%';

            // Filas de horas
            for (let hour = START_HOUR; hour <= END_HOUR; hour++) {
                const row = document.createElement('div');
                row.className = 'agenda-hour-row';
                row.style.height = HOUR_HEIGHT + 'px';
                row.style.minHeight = HOUR_HEIGHT + 'px';
                row.style.position = 'relative';

                const hourLabel = document.createElement('div');
                hourLabel.className = 'agenda-hour-label';
                hourLabel.textContent = hour.toString().padStart(2, '0') + ':00';

                const hourContent = document.createElement('div');
                hourContent.className = 'agenda-hour-content';
                hourContent.style.height = '100%';
                hourContent.style.position = 'relative';

                row.appendChild(hourLabel);
                row.appendChild(hourContent);
                grid.appendChild(row);
            }

            // "08:30" -> 8.5
            const parseTime = (timeStr) => {
                if (!timeStr) return 0;
                const parts = timeStr.split(':');
                return parseInt(parts[0], 10) + parseInt(parts[1], 10) / 60;
            };

            // Posición base (top y height) de cada evento
            const eventsWithPosition = timedEvents.map(event => {
                const startH = parseTime(event.startTime);
                let endH = event.endTime ? parseTime(event.endTime) : startH + 1;
                if (endH <= startH) endH = startH + 1;

                const clampedStart = Math.max(START_HOUR, startH);
                const clampedEnd = Math.min(END_HOUR + 1, endH);

                // Duración en minutos (redondeada para evitar errores de decimales)
                const durationMin = Math.round((clampedEnd - clampedStart) * 60);
                const isShort = durationMin < 25;

                const top = (clampedStart - START_HOUR) * HOUR_HEIGHT;
                // Altura real: ya no se agranda el evento (mínimo 4px para que siempre se vea)
                const height = Math.max((clampedEnd - clampedStart) * HOUR_HEIGHT, 4);

                return { event, startH: clampedStart, endH: clampedEnd, top, height, isShort };
            });

            eventsWithPosition.sort((a, b) => {
                if (a.top !== b.top) return a.top - b.top;
                return b.height - a.height;
            });

            // Agrupar eventos que se solapan entre sí
            const n = eventsWithPosition.length;
            const visited = new Array(n).fill(false);
            const groups = [];

            for (let i = 0; i < n; i++) {
                if (visited[i]) continue;

                const queue = [i];
                visited[i] = true;
                const group = [];

                while (queue.length > 0) {
                    const idx = queue.shift();
                    group.push(idx);

                    for (let j = 0; j < n; j++) {
                        if (visited[j]) continue;
                        const a = eventsWithPosition[idx];
                        const b = eventsWithPosition[j];
                        if (a.top < b.top + b.height && a.top + a.height > b.top) {
                            visited[j] = true;
                            queue.push(j);
                        }
                    }
                }

                groups.push(group);
            }

            // Asignar columnas (los eventos que se solapan van lado a lado)
            groups.forEach(group => {
                group.sort((ia, ib) => {
                    const a = eventsWithPosition[ia];
                    const b = eventsWithPosition[ib];
                    if (a.top !== b.top) return a.top - b.top;
                    return b.height - a.height;
                });

                const columns = [];

                group.forEach(idx => {
                    const ev = eventsWithPosition[idx];
                    let placed = false;

                    for (let c = 0; c < columns.length; c++) {
                        const lastEv = eventsWithPosition[columns[c]];
                        if (lastEv.top + lastEv.height <= ev.top + 1) {
                            columns[c] = idx;
                            ev.columnIndex = c;
                            placed = true;
                            break;
                        }
                    }

                    if (!placed) {
                        ev.columnIndex = columns.length;
                        columns.push(idx);
                    }
                });

                group.forEach(idx => {
                    eventsWithPosition[idx].totalColumns = columns.length;
                });
            });

            // Capa de eventos sobre la rejilla
            // (posición, ancho máximo y z-index están en el CSS: .agenda-events-layer)
            const eventsLayer = document.createElement('div');
            eventsLayer.className = 'agenda-events-layer';

            eventsWithPosition.forEach(ev => {
                const event = ev.event;
                const category = event.categoryId ? categories.find(c => c.id === event.categoryId) : null;

                const eventEl = document.createElement('div');
                eventEl.className = 'agenda-event-item';
                if (ev.isShort) {
                    eventEl.classList.add('agenda-event-short');
                    // Sin texto visible: el título y la hora salen al pasar el ratón
                    const shortTime = event.timeLabel ? ' (' + event.timeLabel + ')'
                        : event.startTime && event.endTime
                            ? ' (' + event.startTime.substring(0, 5) + ' - ' + event.endTime.substring(0, 5) + ')'
                            : '';
                    eventEl.title = event.title + shortTime;
                    if (category && category.icon) eventEl.setAttribute('data-tooltip-cat', category.id);
                }
                eventEl.style.position = 'absolute';

                // Pequeña separación entre eventos: el evento se ENCOGE por arriba y por abajo,
                // así nunca se sale del hueco que le corresponde por su hora.
                const inset = Math.min(1.5, ev.height / 6);
                const finalHeight = Math.max(ev.height - inset * 2, 3);
                eventEl.style.top = (ev.top + inset) + 'px';
                eventEl.style.height = finalHeight + 'px';

                // Si hay altura de sobra, título y hora van en dos líneas (como en la foto)
                if (!ev.isShort && finalHeight >= 56) {
                    eventEl.classList.add('agenda-event-stacked');
                }

                // Ancho y posición según las columnas
                const totalCols = ev.totalColumns || 1;
                const colIndex = ev.columnIndex || 0;
                const widthPercent = 100 / totalCols;
                const gap = 4;

                eventEl.style.left = 'calc(' + (colIndex * widthPercent) + '% + ' + (colIndex * gap / totalCols) + 'px)';
                eventEl.style.width = 'calc(' + widthPercent + '% - ' + (gap * (totalCols - 1) / totalCols) + 'px)';
                eventEl.style.pointerEvents = 'auto';
                eventEl.style.zIndex = String(3 + Math.floor(ev.top / 10));

                // Colores (título/iconos: tono marcado; hora: tono suave)
                let textColor = '#ffffff';

                if (!category) {
                    // Sin categoría, o con una categoría que ya no existe
                    eventEl.classList.add('no-category');
                    textColor = 'var(--text-color)';
                } else if (category.type === 'image' && category.backgroundImage) {
                    eventEl.style.backgroundImage = 'url(' + category.backgroundImage + ')';
                    eventEl.style.backgroundSize = 'cover';
                    eventEl.style.backgroundPosition = 'center';
                    eventEl.style.textShadow = '0 0px 7px rgba(0, 0, 0, 0.7)';
                    textColor = '#ffffff';
                } else {
                    eventEl.style.backgroundColor = category.color;
                    textColor = getContrastColor(category.color, false);
                }

                const softColor = getSoftColor(category, textColor);
                eventEl.style.color = textColor;

                // Icono
                const iconDiv = document.createElement('div');
                iconDiv.className = 'event-icon-sm';
                if (category && category.icon) {
                    applyHoverIcon(iconDiv, category, textColor);
                }

                // Título
                const titleSpan = document.createElement('span');
                titleSpan.className = 'event-title-sm';
                titleSpan.textContent = event.title;
                titleSpan.style.color = textColor;

                // Hora
                const timeSpan = document.createElement('span');
                timeSpan.className = 'event-time-sm';
                timeSpan.style.color = softColor;
                if (event.timeLabel) {
                    timeSpan.textContent = event.timeLabel;
                } else if (event.startTime && event.endTime) {
                    timeSpan.textContent = event.startTime.substring(0, 5) + ' - ' + event.endTime.substring(0, 5);
                } else if (event.startTime) {
                    timeSpan.textContent = event.startTime.substring(0, 5);
                }

                // Título + hora agrupados (en fila o en columna según la altura del evento)
                const textWrap = document.createElement('div');
                textWrap.className = 'event-text-sm';
                textWrap.appendChild(titleSpan);
                textWrap.appendChild(timeSpan);

                // Los eventos de menos de 25 min no llevan ni icono ni texto
                if (!ev.isShort) {
                    eventEl.appendChild(iconDiv);
                    eventEl.appendChild(textWrap);
                }

                // Al hacer clic en un evento se abren los detalles del día
                eventEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeAgendaFunc();
                    selectedDay = todayStr;
                    showDayEvents(todayStr);
                });

                eventsLayer.appendChild(eventEl);
            });

            grid.appendChild(eventsLayer);

            // Línea roja con la hora actual
            const nowLine = document.createElement('div');
            nowLine.className = 'agenda-now-line';
            if (todayStr !== formatDate(new Date())) nowLine.style.display = 'none';
            const nowLabel = document.createElement('span');
            nowLabel.className = 'agenda-now-label';
            const nowRule = document.createElement('span');
            nowRule.className = 'agenda-now-rule';
            nowLine.appendChild(nowLabel);
            nowLine.appendChild(nowRule);
            grid.appendChild(nowLine);

            agendaBody.appendChild(grid);
            agendaRenderedDate = formatDate(new Date());   // día real en que se pintó (evita repintados infinitos)
            updateAgendaNowLine();
        }

        // ============================================
        // FIN AGENDA
        // ============================================


        // ============================================
        // RECURRENCIA, VISTAS, ARRASTRAR, RECORDATORIOS Y COPIA DE SEGURIDAD
        // ============================================
        const parseD = x => { const [y, m, d] = x.split('-').map(Number); return new Date(y, m - 1, d); };
        function addDaysStr(x, n) { const d = parseD(x); return formatDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); }
        // Hora de un evento EN UN DÍA CONCRETO.
        // - Varios días con horas normales (10:00-11:00): cada día dura exactamente esas horas.
        // - Varios días que acaban "más temprano" de lo que empiezan (18:00 -> 03:00, o sea que pasan la medianoche):
        //   el primer día va de la hora de inicio a las 24:00 ("18:00 →") y el último de las 00:00 a la hora de fin ("→ 03:00").
        //   Los días intermedios de ese tipo de evento no ocupan hueco en las agendas por horas.
        function dayView(ev, day) {
            if (!ev || !ev.startTime || !ev.end || ev.end === ev.start || !day) return ev;
            if (!ev.endTime || ev.endTime > ev.startTime) return ev;
            const first = day <= ev.start, last = day >= ev.end;
            if (!first && !last) return { ...ev, startTime: null, endTime: null, timeLabel: '', _mid: true };
            return {
                ...ev,
                startTime: first ? ev.startTime : '00:00',
                endTime: first ? '24:00' : ev.endTime,
                timeLabel: first ? ev.startTime.substring(0, 5) + ' →' : '→ ' + ev.endTime.substring(0, 5)
            };
        }
        function dayDiff(a, b) { const u = x => { const [y, m, d] = x.split('-').map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((u(b) - u(a)) / 864e5); }

        // Ocurrencias de un evento que tocan el rango [from, to] (los repetidos generan copias con el mismo id)
        function eventOccurrences(ev, from, to) {
            const dur = ev.end ? dayDiff(ev.start, ev.end) : 0;
            if (!ev.repeat) return ((ev.end || ev.start) >= from && ev.start <= to) ? [ev] : [];
            const [y0, m0, d0] = ev.start.split('-').map(Number);
            const rep = ev.repeat === 'monthWeekly' ? 'weekly' : ev.repeat;
            // "Cada lunes del mes": como cada semana, pero solo hasta el último día del mes de inicio
            const until = ev.repeat === 'monthWeekly' ? formatDate(new Date(y0, m0, 0)) : ev.repeatUntil;
            const out = [], limit = until && until < to ? until : to;
            const step = rep === 'daily' ? 1 : 7;
            let k = (rep === 'daily' || rep === 'weekly') ? Math.max(0, Math.floor((dayDiff(ev.start, from) - dur) / step)) : 0;
            for (let i = 0; i < 5000; i++, k++) {
                let s;
                if (rep === 'daily' || rep === 'weekly') s = addDaysStr(ev.start, k * step);
                else {
                    const d = rep === 'monthly' ? new Date(y0, m0 - 1 + k, d0) : new Date(y0 + k, m0 - 1, d0);
                    if (d.getDate() !== d0) continue;
                    s = formatDate(d);
                }
                if (s > limit) break;
                if (addDaysStr(s, dur) >= from) out.push(s === ev.start ? ev : { ...ev, start: s, end: dur ? addDaysStr(s, dur) : null, _occ: true });
            }
            return out;
        }

        // Arrastrar un evento a otro día (en eventos repetidos mueve toda la serie)
        function moveEventByDays(id, delta) {
            const ev = events.find(e => e.id === id);
            if (!ev || !delta) return;
            ev.start = addDaysStr(ev.start, delta);
            if (ev.end) ev.end = addDaysStr(ev.end, delta);
            if (ev.repeatUntil) ev.repeatUntil = addDaysStr(ev.repeatUntil, delta);
            safeSave('calendarEvents', events);
            renderCalendar(); loadUpcomingEvents();
            if (agendaPopupOpen) renderAgenda();
            showToast('Evento movido', 'ok', { label: 'Deshacer', fn: undo });
        }

        // Formulario: "repetir hasta" solo si se repite; pide permiso de notificaciones al elegir recordatorio
        // El texto de la opción depende del día de la semana de la fecha de inicio ("Cada lunes del mes"...)
        function updateMonthWeekdayOption() {
            const names = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
            const start = eventStartEl.value;
            const label = start ? 'Cada ' + names[parseD(start).getDay()] + ' del mes' : 'Cada mismo día de la semana del mes';
            const opt = document.querySelector('#eventRepeat option[value="monthWeekly"]');
            const item = document.querySelector('#repeatSelect .cselect-opt[data-v="monthWeekly"]');
            if (opt) opt.textContent = label;
            if (item) item.textContent = label;
            csSync('eventRepeat');
        }

        // Muestra u oculta "Repetir" y "Repetir hasta" según el formulario
        function syncRepeatUI() {
            const start = eventStartEl.value, end = eventEndEl.value;
            const hasEndDate = !!(end && start && end !== start);   // dura varios días
            const repeatEl = document.getElementById('eventRepeat');
            updateMonthWeekdayOption();
            if (hasEndDate && repeatEl.value) { repeatEl.value = ''; csSync('eventRepeat'); }
            document.getElementById('repeatGroup').style.display = hasEndDate ? 'none' : '';
            document.getElementById('repeatUntilGroup').style.display =
                (!hasEndDate && repeatEl.value && repeatEl.value !== 'monthWeekly') ? '' : 'none';
        }
        document.getElementById('eventRepeat').addEventListener('change', syncRepeatUI);
        ['input', 'change'].forEach(t => {
            eventStartEl.addEventListener(t, syncRepeatUI);
            eventEndEl.addEventListener(t, syncRepeatUI);
            eventStartEl.addEventListener(t, validateTimes);
            eventEndEl.addEventListener(t, validateTimes);
        });


        // Copia de seguridad (exportar / importar JSON)
        async function exportJSON() {
            const payload = JSON.parse(JSON.stringify(getFilePayload()));
            // El archivo exportado lleva las imágenes dentro (portable); en tu disco están como archivos
            if (window.store && window.store.readImage) {
                const rd = async v => (typeof v === 'string' && v.startsWith('calimg://')) ? ((await window.store.readImage(v)) || v) : v;
                for (const c of payload.categories) {
                    if (c.icon) c.icon = await rd(c.icon);
                    if (c.backgroundImage) c.backgroundImage = await rd(c.backgroundImage);
                }
                for (const f of payload.folders) { if (f.icon) f.icon = await rd(f.icon); }
            }
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'calendario-backup-' + formatDate(new Date()) + '.json';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            showToast('Copia de seguridad exportada', 'ok');
        }
        function showImportProblem(title, message) {
            showConfirmModal({ title, message, cancelText: 'Cerrar', deleteText: 'Entendido', variant: 'save' });
        }
        // Fusiona una lista por id: añade lo nuevo y actualiza lo distinto (si ambos tienen fecha de
        // modificación, gana el más reciente; si no, gana el archivo importado). Nunca borra nada.
        function mergeById(local, incoming, skip) {
            const stable = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x))
                ? Object.keys(x).sort().reduce((o, kk) => { if (x[kk] !== null && x[kk] !== undefined) o[kk] = x[kk]; return o; }, {}) : x);   // null y ausente cuentan igual
            const out = local.slice();
            const st = { added: 0, updated: 0, same: 0, kept: 0, skipped: 0 };
            incoming.forEach(inc => {
                const i = out.findIndex(x => x.id === inc.id);
                if (i < 0) {
                    if (skip && skip(inc)) { st.skipped++; return; }
                    out.push(inc); st.added++; return;
                }
                if (stable(out[i]) === stable(inc)) { st.same++; return; }
                const lu = Number(out[i].updatedAt) || 0, iu = Number(inc.updatedAt) || 0;
                if (lu && iu && lu > iu) { st.kept++; return; }
                out[i] = inc; st.updated++;
            });
            return { list: out, st };
        }
        function planMerge(d) {
            // Los Word/PDF importados son archivos en el dispositivo: no viajan dentro del .json
            const noBinary = f => f && f.kind === 'attachment';
            return {
                events: mergeById(events, d.events), categories: mergeById(categories, d.categories),
                folders: mergeById(folders, d.folders), files: mergeById(files, d.files, noBinary),
                templates: mergeById(templates, d.templates)
            };
        }

        document.getElementById('importFile').addEventListener('change', e => {
            const f = e.target.files[0]; e.target.value = '';
            if (!f) return;
            if (!/\.json$/i.test(f.name)) { showImportProblem('No se puede importar', 'Elige un archivo con extensión .json. Has elegido "' + f.name + '".'); return; }
            if (f.size === 0) { showImportProblem('No se puede importar', 'El archivo está vacío (0 bytes).'); return; }
            if (f.size > DATA_LIMITS.importBytes) { showImportProblem('No se puede importar', 'El archivo es demasiado grande (' + formatBytes(f.size) + ').'); return; }
            const r = new FileReader();
            r.onerror = () => showImportProblem('No se pudo leer', 'No se pudo leer el archivo. Comprueba que no esté abierto en otro programa ni dañado.');
            r.onload = () => {
                const res = parseBackupText(String(r.result));
                if (!res.ok) { showImportProblem('Copia no válida', res.error + ' No se ha cambiado nada.'); return; }
                const d = res.data, c = res.counts, rep = res.report;
                const dropMsg = rep.droppedTotal ? ' Se omitirán ' + rep.droppedTotal + ' elementos dañados o incompletos.' : '';
                const countsMsg = 'El archivo contiene ' + c.events + ' eventos, ' + c.categories + ' categorías, ' + c.folders + ' carpetas, ' +
                    c.files + ' documentos y ' + c.templates + ' plantillas.';

                const doReplace = () => {
                    try {
                        events = d.events; categories = d.categories;
                        templates = d.templates; folders = d.folders; files = d.files;
                        safeSave('calendarEvents', events); safeSave('eventCategories', categories);
                        safeSave('calendarFolders', folders); safeSave('calendarFiles', files);
                        safeSave('eventTemplates', templates);
                        selectedCategoryId = null;
                        renderCalendar(); renderCategorySelector(); loadUpcomingEvents(); renderDocuments();
                        renderTemplates(); refreshLocationList();
                        showToast('Copia importada', 'ok', { label: 'Deshacer', fn: undo });
                    } catch (err) {
                        console.error(err);
                        showToast('Ocurrió un error al importar. Usa Ctrl+Z para volver atrás.');
                    }
                };
                const doMerge = (plan) => {
                    try {
                        events = plan.events.list; categories = plan.categories.list;
                        folders = plan.folders.list; files = plan.files.list; templates = plan.templates.list;
                        safeSave('calendarEvents', events); safeSave('eventCategories', categories);
                        safeSave('calendarFolders', folders); safeSave('calendarFiles', files);
                        safeSave('eventTemplates', templates);
                        renderCalendar(); renderCategorySelector(); loadUpcomingEvents(); renderDocuments();
                        renderTemplates(); refreshLocationList();
                        showToast('Copia fusionada', 'ok', { label: 'Deshacer', fn: undo });
                    } catch (err) {
                        console.error(err);
                        showToast('Ocurrió un error al fusionar. Usa Ctrl+Z para volver atrás.');
                    }
                };

                // Si no tienes nada, simplemente se carga
                const hasLocal = events.length || files.length || folders.length || templates.length;
                if (!hasLocal) {
                    showConfirmModal({
                        title: 'Importar copia de seguridad', message: countsMsg + dropMsg + ' Podrás deshacerlo.',
                        cancelText: 'Cancelar', deleteText: 'Importar', variant: 'save', onConfirm: doReplace
                    });
                    return;
                }

                // ¿Es el mismo calendario con cambios? Se mira cuántos elementos del archivo ya existen aquí (por id)
                const loc = { events, folders, files, templates };
                let impTotal = 0, locTotal = 0, shared = 0;
                ['events', 'folders', 'files', 'templates'].forEach(k => {
                    const ids = new Set(loc[k].map(x => x.id));
                    impTotal += d[k].length; locTotal += loc[k].length;
                    shared += d[k].filter(x => ids.has(x.id)).length;
                });
                const related = impTotal === 0
                    ? d.categories.some(x => categories.some(y => y.id === x.id))
                    : shared > 0 && (shared / impTotal >= 0.5 || shared / Math.max(1, locTotal) >= 0.5);

                if (!related) {
                    showConfirmModal({
                        title: 'Este calendario es distinto',
                        message: 'Casi no coincide ningún evento ni documento con los tuyos, así que no se fusionará: se reemplazarán tus datos actuales por los del archivo. ' +
                            countsMsg + dropMsg + ' Podrás deshacerlo.',
                        cancelText: 'Cancelar', deleteText: 'Reemplazar', variant: 'save', onConfirm: doReplace
                    });
                    return;
                }

                const plan = planMerge(d);
                const tot = key => Object.keys(plan).reduce((n, k) => n + plan[k].st[key], 0);
                const nAdd = tot('added'), nUpd = tot('updated'), nSame = tot('same'), nKept = tot('kept'), nSkip = tot('skipped');
                if (!nAdd && !nUpd) {
                    showConfirmModal({
                        title: 'Nada que fusionar',
                        message: 'Tus datos ya contienen todo lo que hay en el archivo' +
                            (nSkip ? ' (salvo ' + nSkip + ' documentos Word/PDF importados, cuyos archivos no viajan en la copia)' : '') +
                            '. Si quieres, puedes sustituirlos igualmente por los del archivo.',
                        cancelText: 'Cerrar', deleteText: 'Sustituir igualmente', variant: 'save', onConfirm: doReplace
                    });
                    return;
                }
                let m = 'Es el mismo calendario con cambios. Fusionar añade ' + nAdd + ' elementos nuevos y actualiza ' + nUpd +
                    (nSame ? ' (' + nSame + ' ya estaban igual)' : '') + ', sin borrar nada de lo tuyo.';
                if (nKept) m += ' ' + nKept + ' se quedan como están porque los tienes más recientes.';
                if (nSkip) m += ' ' + nSkip + ' documentos Word/PDF importados no se pueden pasar: hay que volver a importarlos aquí.';
                m += ' Sobrescribir reemplaza todos tus datos por los del archivo.' + dropMsg + ' Podrás deshacerlo.';
                showConfirmModal({
                    title: 'Importar copia de seguridad', message: m,
                    cancelText: 'Cancelar', deleteText: 'Fusionar', altText: 'Sobrescribir', variant: 'save',
                    onConfirm: () => doMerge(plan), onAlt: doReplace
                });
            };
            r.readAsText(f);
        });



        // ============================================
        // AGENDA: navegación, agenda semanal y desplegable "Repetir"
        // ============================================
        function weekStartOf(d) { return addDaysStr(d, -((parseD(d).getDay() + 6) % 7)); }
        function updateAgendaHeader() {
            const t = document.getElementById('agendaTitle'), b = document.getElementById('agendaModeBtn');
            const f = (d, o) => parseD(d).toLocaleDateString('es-ES', o);
            if (agendaMode === 'week') {
                const ws = weekStartOf(agendaDate), o = { day: 'numeric', month: 'short' };
                t.textContent = 'Semana del ' + f(ws, o) + ' al ' + f(addDaysStr(ws, 6), o);
                b.textContent = 'Agenda de hoy';
            } else {
                const txt = f(agendaDate, { weekday: 'long', day: 'numeric', month: 'long' });
                t.textContent = agendaDate === formatDate(new Date()) ? 'Agenda de hoy' : txt.charAt(0).toUpperCase() + txt.slice(1);
                b.textContent = 'Agenda semanal';
            }
            const td = formatDate(new Date());
            const isCurrent = agendaMode === 'week' ? weekStartOf(agendaDate) === weekStartOf(td) : agendaDate === td;
            document.getElementById('agendaTodayBtn').classList.toggle('hidden', isCurrent);
        }
        document.getElementById('agendaTodayBtn').addEventListener('click', () => {
            agendaDate = formatDate(new Date());
            renderAgenda();
            if (agendaMode === 'day') scrollAgendaToNow();
        });
        document.getElementById('agendaModeBtn').addEventListener('click', () => {
            if (agendaMode === 'day') agendaMode = 'week';
            else { agendaMode = 'day'; agendaDate = formatDate(new Date()); }
            agendaBody.scrollTop = 0;
            renderAgenda();
            agendaBody.scrollTop = agendaMode === 'week' ? 7 * AGENDA_HOUR_HEIGHT : 0;
            if (agendaMode === 'day') scrollAgendaToNow();
        });
        [['agendaPrev', -1], ['agendaNext', 1]].forEach(([id, n]) => {
            document.getElementById(id).addEventListener('click', () => {
                agendaDate = addDaysStr(agendaDate, agendaMode === 'week' ? 7 * n : n);
                renderAgenda();
            });
        });

        function buildWeekAgenda() {
            agendaBody.innerHTML = '';
            const H = AGENDA_HOUR_HEIGHT, today = formatDate(new Date());
            const ws = weekStartOf(agendaDate);
            const days = [0, 1, 2, 3, 4, 5, 6].map(i => addDaysStr(ws, i));
            const names = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
            const wk = document.createElement('div');
            wk.className = 'wk';
            const row = cls => { const r = document.createElement('div'); r.className = 'wk-row ' + cls; const g = document.createElement('div'); g.className = 'wk-gutter'; r.appendChild(g); return r; };
            const openDay = d => { closeAgendaFunc(); selectedDay = d; showDayEvents(d); };

            // Mismos colores que la Agenda de hoy
            const paint = (el, cat) => {
                let tc = '#ffffff';
                if (!cat) { el.classList.add('no-category'); tc = 'var(--text-color)'; }
                else if (cat.type === 'image' && cat.backgroundImage) {
                    el.style.backgroundImage = 'url(' + cat.backgroundImage + ')';
                    el.style.backgroundSize = 'cover'; el.style.backgroundPosition = 'center';
                    el.style.textShadow = '0 0px 7px rgba(0, 0, 0, 0.7)';
                } else { el.style.backgroundColor = cat.color; tc = getContrastColor(cat.color, false); }
                el.style.color = tc;
                return tc;
            };
            const fill = (el, e, cat, tc, withTime, withIcon = true) => {
                if (withIcon && cat && cat.icon) {
                    const icon = document.createElement('div');
                    icon.className = 'event-icon-sm';
                    applyHoverIcon(icon, cat, tc);
                    el.appendChild(icon);
                }
                const wrap = document.createElement('div');
                wrap.className = 'event-text-sm';
                const t = document.createElement('span');
                t.className = 'event-title-sm';
                t.textContent = e.title;
                t.style.color = tc;
                wrap.appendChild(t);
                if (withTime && e.startTime) {
                    const h = document.createElement('span');
                    h.className = 'event-time-sm';
                    h.style.color = getSoftColor(cat, tc);
                    h.textContent = e.timeLabel || (e.startTime.substring(0, 5) + (e.endTime ? ' - ' + e.endTime.substring(0, 5) : ''));
                    wrap.appendChild(h);
                }
                el.appendChild(wrap);
            };

            // Cabecera de días (solo sobre las columnas de días)
            const head = row('wk-head');
            days.forEach((d, i) => {
                const c = document.createElement('div');
                c.className = 'wk-day' + (d === today ? ' today' : '');
                c.innerHTML = '<span>' + names[i] + '</span><b>' + parseD(d).getDate() + '</b>';
                c.title = 'Ver este día';
                c.addEventListener('click', () => { agendaMode = 'day'; agendaDate = d; renderAgenda(); });
                head.appendChild(c);
            });
            wk.appendChild(head);

            // Todo el día (eventos sin hora)
            const all = document.createElement('div');
            all.className = 'wk-allday';
            all.innerHTML = '<div class="wk-allday-cap"><i class="fi fi-sr-calendar-clock"></i> Todo el día <small>· eventos sin hora asignada</small></div>';
            const allRow = row('wk-allday-row');
            days.forEach(d => {
                const c = document.createElement('div');
                c.className = 'wk-allcell';
                getEventsForDay(d).filter(e => !e.startTime).forEach(e => {
                    const cat = e.categoryId ? categories.find(x => x.id === e.categoryId) : null;
                    const chip = document.createElement('div');
                    chip.className = 'agenda-event-item wk-chip';
                    chip.title = e.title;
                    if (cat && cat.icon) chip.setAttribute('data-tooltip-cat', cat.id);
                    fill(chip, e, cat, paint(chip, cat), false);
                    if (e.important) { const im = document.createElement('div'); im.className = 'important-indicator'; im.textContent = '!'; chip.appendChild(im); }
                    chip.addEventListener('click', ev => { ev.stopPropagation(); openDay(d); });
                    c.appendChild(chip);
                });
                allRow.appendChild(c);
            });
            all.appendChild(allRow);
            wk.appendChild(all);

            // Horas + columnas de cada día
            const body = row('wk-body');
            body.style.height = (24 * H) + 'px';
            for (let h = 0; h < 24; h++) {
                const l = document.createElement('div');
                l.style.height = H + 'px';
                l.textContent = String(h).padStart(2, '0') + ':00';
                body.firstChild.appendChild(l);
            }
            const tm = t => { const p = t.split(':'); return +p[0] + p[1] / 60; };
            const PILL_H = 24;   // sin hora de fin y chocando con otro que empieza después: solo las 2 semicircunferencias
            const BIG_H = 48;    // sin hora de fin y sin chocar con nadie: título (1 línea) + hora
            days.forEach(d => {
                const col = document.createElement('div');
                col.className = 'wk-col' + (d === today ? ' today' : '');

                const items = getEventsForDay(d).filter(e => e.startTime).map(e0 => dayView(e0, d)).filter(e => e.startTime).map(e => {
                    const st = tm(e.startTime);
                    let en = e.endTime ? tm(e.endTime) : st;
                    if (e.endTime && en <= st) en = st + 1;
                    return { e, st, en, open: !e.endTime };
                });

                // Altura de los eventos sin hora de fin
                items.forEach(it => {
                    if (it.open) {
                        it.big = !items.some(o => o !== it && o.st >= it.st && o.st < it.st + BIG_H / H);
                        it.hpx = it.big ? BIG_H : PILL_H;
                        it.en = it.st + it.hpx / H;
                    }
                    it.en = Math.min(24, it.en);
                });
                items.sort((a, b) => a.st - b.st || b.en - a.en);

                // Grupos de eventos que se solapan, con sus columnas
                const clusters = [];
                let cur = null, clusterEnd = -1;
                items.forEach(it => {
                    if (!cur || it.st >= clusterEnd) { cur = { list: [], ends: [] }; clusters.push(cur); clusterEnd = -1; }
                    let c = cur.ends.findIndex(x => x <= it.st);
                    if (c < 0) { c = cur.ends.length; cur.ends.push(0); }
                    cur.ends[c] = it.en; it.c = c; cur.list.push(it);
                    clusterEnd = Math.max(clusterEnd, it.en);
                });
                // Cada evento se estira hacia la derecha hasta chocar con un evento que realmente
                // se solape con él (así no queda "encerrado" por eventos con los que no coincide)
                clusters.forEach(cl => {
                    const n = cl.ends.length;
                    cl.list.forEach(it => {
                        it.n = n; it.span = 1;
                        for (let c = it.c + 1; c < n; c++) {
                            if (cl.list.some(o => o !== it && o.c === c && o.st < it.en && o.en > it.st)) break;
                            it.span++;
                        }
                    });
                });

                items.forEach(it => {
                    const e = it.e, cat = e.categoryId ? categories.find(c => c.id === e.categoryId) : null;
                    const h = it.open ? it.hpx : Math.max((it.en - it.st) * H, 4);
                    const inset = Math.min(1.5, h / 6);
                    const fh = Math.max(h - inset * 2, 3);
                    const isShort = !it.open && Math.round((it.en - it.st) * 60) < 25;
                    const eff = it.n / it.span;            // cuántos "anchos" caben a la vez
                    const narrow = eff >= 3;               // muy estrecho: sin texto ni icono
                    const two = !narrow && eff > 1.5;
                    const stacked = it.open ? it.big : (!isShort && fh >= 44);
                    const showTime = it.open ? !narrow : eff <= 1.5;

                    const el = document.createElement('div');
                    el.className = 'agenda-event-item wk-ev'
                        + (isShort ? ' agenda-event-short' : '')
                        + (stacked ? ' agenda-event-stacked' : '')
                        + (narrow ? ' wk-ev-narrow' : (two ? ' wk-ev-2' : ''))
                        + (it.open && !it.big ? ' wk-ev-pill' : '');
                    el.style.top = (it.st * H + inset) + 'px';
                    el.style.height = fh + 'px';
                    el.style.setProperty('--clamp', it.open ? 1 :
                        (stacked ? Math.max(1, Math.floor((fh - 16 - (showTime ? 28 : 0)) / 15)) : Math.max(1, Math.floor((fh - 4) / 15))));
                    el.style.left = 'calc(' + (it.c * 100 / it.n) + '% + 2px)';
                    el.style.width = 'calc(' + (it.span * 100 / it.n) + '% - 4px)';

                    const hora = e.timeLabel || (e.startTime.substring(0, 5) + (e.endTime ? ' - ' + e.endTime.substring(0, 5) : ''));
                    el.title = e.title + ' (' + hora + ')';
                    if (cat && cat.icon) el.setAttribute('data-tooltip-cat', cat.id);   // el tooltip enseña el icono

                    const tc = paint(el, cat);
                    if (!isShort) fill(el, e, cat, tc, stacked && showTime, !narrow);
                    el.addEventListener('click', ev => { ev.stopPropagation(); openDay(d); });
                    col.appendChild(el);
                });

                if (d === today) { const n = document.createElement('div'); n.className = 'wk-now'; col.appendChild(n); }
                body.appendChild(col);
            });
            if (days.indexOf(today) !== -1) {
                const nl = document.createElement('div');
                nl.className = 'wk-now-label';
                body.appendChild(nl);
            }
            wk.appendChild(body);
            agendaBody.appendChild(wk);
            updateAgendaNowLine();
        }

        // Desplegable propio: sustituye al <select> nativo (que queda oculto y guarda el valor)
        function csSync(id) {
            const sel = document.getElementById(id), box = sel.closest('.cselect');
            box.querySelector('.cselect-label').textContent = sel.options[sel.selectedIndex].text;
            box.querySelectorAll('.cselect-opt').forEach(o => o.classList.toggle('selected', o.dataset.v === sel.value));
        }
        function initCustomSelect(id) {
            const sel = document.getElementById(id), box = sel.closest('.cselect');
            const menu = box.querySelector('.cselect-menu');
            Array.from(sel.options).forEach(op => {
                const d = document.createElement('div');
                d.className = 'cselect-opt'; d.dataset.v = op.value; d.textContent = op.text;
                d.addEventListener('click', e => {
                    e.stopPropagation();
                    sel.value = op.value;
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                    csSync(id); box.classList.remove('open');
                });
                menu.appendChild(d);
            });
            box.querySelector('.cselect-btn').addEventListener('click', e => {
                e.stopPropagation();
                // Cierra cualquier otro desplegable que esté abierto (Repetir ↔ Recordatorio)
                document.querySelectorAll('.cselect.open').forEach(o => { if (o !== box) o.classList.remove('open'); });
                box.classList.toggle('open');
            });
            document.addEventListener('click', e => { if (!box.contains(e.target)) box.classList.remove('open'); });
            csSync(id);
        }
        initCustomSelect('eventRepeat');
        initCustomSelect('eventReminder');

        // ============================================
        // RECORDATORIOS: tarjetas de aviso propias
        // ============================================
        const REM_FIRED_KEY = 'firedReminders';
        const REMINDER_OPTIONS = [0, 5, 10, 15, 30, 60, 120, 1440];
        let firedReminders = {};
        try { firedReminders = JSON.parse(localStorage.getItem(REM_FIRED_KEY)) || {}; } catch (err) { firedReminders = {}; }
        let notifSoundOn = true;
        try { notifSoundOn = localStorage.getItem('notifSound') !== 'false'; } catch (err) { }

        function fmtMinutes(min) {
            if (min >= 1440 && min % 1440 === 0) return (min / 1440) + (min === 1440 ? ' día' : ' días');
            if (min >= 60) {
                const h = Math.floor(min / 60), m = min % 60;
                return h + ' h' + (m ? ' ' + m + ' min' : '');
            }
            return min + ' min';
        }

        function playChime() {
            if (!notifSoundOn) return;
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return;
                const ac = new AC();
                [880, 1318.5].forEach((fr, i) => {
                    const t0 = ac.currentTime + i * 0.16;
                    const o = ac.createOscillator(), g = ac.createGain();
                    o.type = 'sine'; o.frequency.value = fr;
                    g.gain.setValueAtTime(0.0001, t0);
                    g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.03);
                    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
                    o.connect(g); g.connect(ac.destination);
                    o.start(t0); o.stop(t0 + 0.6);
                });
                setTimeout(() => { try { ac.close(); } catch (err) { } }, 1500);
            } catch (err) { }
        }

        function getRemHost() {
            let h = document.getElementById('remHost');
            if (!h) {
                h = document.createElement('div');
                h.id = 'remHost';
                h.className = 'rem-host';
                h.setAttribute('role', 'alert');
                document.body.appendChild(h);
            }
            return h;
        }

        function remWhenText(startMs, ev) {
            const diff = Math.round((startMs - Date.now()) / 60000);
            if (!ev.startTime) {   // todo el día: no hay "empieza en...", se dice qué día es
                const d0 = new Date(startMs), now = new Date();
                const dd = Math.round((new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
                const when = dd === 0 ? 'Hoy' : dd === 1 ? 'Mañana' : dd === -1 ? 'Ayer'
                    : d0.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
                return when + ' · todo el día';
            }
            const hora = ev.startTime.substring(0, 5);
            let t;
            if (diff > 1) t = 'Empieza en ' + fmtMinutes(diff);
            else if (diff >= -1) t = 'Empieza ahora';
            else t = 'Empezó hace ' + fmtMinutes(-diff);
            return t + ' · ' + hora;
        }

        let glowTimers = [];
        function clearGlow() {
            glowTimers.forEach(clearTimeout);
            glowTimers = [];
            document.querySelectorAll('.glow-target, .glow-out')
                .forEach(el => el.classList.remove('glow-target', 'glow-out'));
        }

        // Abre el día del evento y sombrea su tarjeta 5 s (negro en claro, blanco en oscuro) + 1 s de desvanecido
        function goToEventAndGlow(evId, dateStr) {
            clearGlow();
            if (agendaPopupOpen) closeAgendaFunc();
            if (isSearchMode) exitSearchMode();
            const d = parseD(dateStr);
            currentDate = new Date(d.getFullYear(), d.getMonth(), 1);
            renderCalendar();
            showDayEvents(dateStr);

            const card = dayEventsListEl.querySelector('.event-item[data-event-id="' + evId + '"]');
            if (!card) return;
            card.scrollIntoView({ block: 'center' });
            card.classList.add('glow-target');
            glowTimers.push(setTimeout(() => card.classList.add('glow-out'), 5000));
            glowTimers.push(setTimeout(clearGlow, 6100));
        }

        function showReminderCard(ev, startMs) {
            const host = getRemHost();
            const cat = ev.categoryId ? categories.find(c => c.id === ev.categoryId) : null;
            const card = document.createElement('div');
            card.className = 'rem-card';
            if (cat && cat.color) card.style.setProperty('--rem-color', cat.color);

            const top = document.createElement('div'); top.className = 'rem-top';
            const bell = document.createElement('div'); bell.className = 'rem-bell';
            bell.innerHTML = '<i class="fi fi-sr-bell"></i>';
            const text = document.createElement('div'); text.className = 'rem-text';
            const title = document.createElement('div'); title.className = 'rem-title'; title.textContent = ev.title;
            const when = document.createElement('div'); when.className = 'rem-when'; when.textContent = remWhenText(startMs, ev);
            text.appendChild(title); text.appendChild(when);
            const x = document.createElement('button'); x.type = 'button'; x.className = 'rem-close';
            x.setAttribute('aria-label', 'Cerrar aviso'); x.innerHTML = '<i class="fas fa-xmark"></i>';
            top.appendChild(bell); top.appendChild(text); top.appendChild(x);

            const actions = document.createElement('div'); actions.className = 'rem-actions';
            const lbl = document.createElement('span'); lbl.textContent = 'Aplazar';
            actions.appendChild(lbl);

            const timer = setInterval(() => { when.textContent = remWhenText(startMs, ev); }, 20000);
            let autoTimer = setTimeout(() => dismiss(), 15000);   // desaparece solo a los 15 s
            const dismiss = () => {
                clearInterval(timer);
                clearTimeout(autoTimer);
                card.classList.remove('show');
                setTimeout(() => card.remove(), 300);
            };
            [[5, '5 min'], [15, '15 min'], [60, '1 h']].forEach(([m, label]) => {
                const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
                b.addEventListener('click', () => {
                    dismiss();
                    setTimeout(() => showReminderCard(ev, startMs), m * 60000);
                    showToast('Aviso aplazado ' + label, 'ok');
                });
                actions.appendChild(b);
            });
            const view = document.createElement('button'); view.type = 'button'; view.className = 'rem-view'; view.textContent = 'Ver evento';
            view.addEventListener('click', () => {
                dismiss();
                goToEventAndGlow(ev.id, formatDate(new Date(startMs)));
            });
            actions.appendChild(view);
            x.addEventListener('click', dismiss);

            card.appendChild(top); card.appendChild(actions);
            host.appendChild(card);
            requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('show')));
            playChime();
            if (window.store && window.store.flash) { try { window.store.flash(); } catch (err) { } }
            systemNotify(ev, startMs);
        }

        function checkReminders() {
            const now = Date.now(), t = new Date();
            const from = formatDate(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1));
            const to = formatDate(new Date(t.getFullYear(), t.getMonth(), t.getDate() + 2));
            let dirty = false;
            events.forEach(ev => {
                if (ev.reminder === null || ev.reminder === undefined || ev.reminder === '') return;
                eventOccurrences(ev, from, to).forEach(occ => {
                    if (isEventDone(occ)) return;   // si ya está hecho, no avisa
                    const [y, m, d] = occ.start.split('-').map(Number);
                    const baseTime = ev.startTime || ev.reminderTime || '09:00';   // todo el día: hora elegida para el aviso
                    const [hh, mm] = baseTime.split(':').map(Number);
                    const startMs = new Date(y, m - 1, d, hh, mm).getTime();
                    const fireAt = startMs - Number(ev.reminder) * 60000;
                    if (now < fireAt || now > startMs + 15 * 60000) return;
                    const key = ev.id + '|' + occ.start + '|' + baseTime + '|' + ev.reminder;
                    if (firedReminders[key]) return;
                    firedReminders[key] = now; dirty = true;
                    showReminderCard(ev, startMs);
                });
            });
            Object.keys(firedReminders).forEach(k => {
                if (now - firedReminders[k] > 3 * 86400000) { delete firedReminders[k]; dirty = true; }
            });
            if (dirty) { try { localStorage.setItem(REM_FIRED_KEY, JSON.stringify(firedReminders)); } catch (err) { } }
        }
        setInterval(checkReminders, 15000);
        setTimeout(checkReminders, 1500);

        // Botón de sonido de los avisos
        (function () {
            const b = document.getElementById('notifSoundBtn');
            if (!b) return;
            const paint = () => {
                b.innerHTML = '<i class="fi ' + (notifSoundOn ? 'fi-sr-bell' : 'fi-ss-bell-slash') + '"></i>';
                b.title = notifSoundOn ? 'Sonido de avisos: activado' : 'Sonido de avisos: silenciado';
            };
            paint();
            b.addEventListener('click', e => {
                e.stopPropagation();
                notifSoundOn = !notifSoundOn;
                try { localStorage.setItem('notifSound', String(notifSoundOn)); } catch (err) { }
                paint();
                showToast(notifSoundOn ? 'Sonido de avisos activado' : 'Avisos en silencio', 'ok');
                if (notifSoundOn) playChime();
            });
        })();

        // ============================================
        // DESHACER / REHACER
        // ============================================
        function applySnapshot(str) {
            const d = JSON.parse(str);
            events = d.events || []; categories = d.categories || [];
            folders = d.folders || []; files = d.files || [];
            templates = d.templates || [];
            lastSnap = str;
            if (window.store && window.store.save) persistToFile();
            else {
                try {
                    localStorage.setItem('calendarEvents', JSON.stringify(events));
                    localStorage.setItem('eventCategories', JSON.stringify(categories));
                    localStorage.setItem('calendarFolders', JSON.stringify(folders));
                    localStorage.setItem('calendarFiles', JSON.stringify(files));
                } catch (err) { }
            }
            if (selectedCategoryId && !categories.some(c => c.id === selectedCategoryId)) selectedCategoryId = null;
            renderCalendar(); renderCategorySelector(); loadUpcomingEvents(); renderDocuments();
            if (agendaPopupOpen) renderAgenda();
            if (dayEventsModal.style.display === 'flex' && selectedDay) showDayEvents(selectedDay);
            if (isSearchActive && (searchInput.value.trim() || hasActiveSearchFilters())) searchEvents();
        }
        function undo() {
            if (!undoStack.length) { showToast('No hay nada que deshacer', 'ok'); return; }
            redoStack.push(lastSnap);
            applySnapshot(undoStack.pop());
            showToast('Deshecho', 'ok', { label: 'Rehacer', fn: redo });
        }
        function redo() {
            if (!redoStack.length) { showToast('No hay nada que rehacer', 'ok'); return; }
            undoStack.push(lastSnap);
            applySnapshot(redoStack.pop());
            showToast('Rehecho', 'ok');
        }

        // ============================================
        // IMPORTAR Y EXPORTAR .ICS
        // ============================================
        const icsEscape = t => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
        const icsUnescape = t => String(t || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
        function icsFold(line) {
            const out = []; let l = line;
            while (l.length > 73) { out.push(l.slice(0, 73)); l = ' ' + l.slice(73); }
            out.push(l);
            return out.join('\r\n');
        }
        const icsDay = s => s.replace(/-/g, '');
        function icsLocal(dateStr, timeStr) { return icsDay(dateStr) + 'T' + timeStr.replace(':', '').substring(0, 4) + '00'; }
        function addMinutesLocal(dateStr, timeStr, min) {
            const [y, m, d] = dateStr.split('-').map(Number), [hh, mm] = timeStr.split(':').map(Number);
            const dt = new Date(y, m - 1, d, hh, mm + min);
            return { date: formatDate(dt), time: pad2n(dt.getHours()) + ':' + pad2n(dt.getMinutes()) };
        }
        const pad2n = n => String(n).padStart(2, '0');

        function exportICS() {
            const t = new Date();
            const stamp = t.getUTCFullYear() + pad2n(t.getUTCMonth() + 1) + pad2n(t.getUTCDate()) + 'T' + pad2n(t.getUTCHours()) + pad2n(t.getUTCMinutes()) + pad2n(t.getUTCSeconds()) + 'Z';
            const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Calendario//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Calendario'];
            const freq = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' };
            events.forEach(ev => {
                if (!ev.start) return;
                const cat = ev.categoryId ? categories.find(c => c.id === ev.categoryId) : null;
                L.push('BEGIN:VEVENT', 'UID:' + ev.id + '@calendario.local', 'DTSTAMP:' + stamp);
                if (ev.startTime) {
                    const endDate = ev.end || ev.start;
                    const e = ev.endTime ? { date: endDate, time: ev.endTime }
                        : (endDate !== ev.start ? { date: addDaysStr(endDate, 1), time: '00:00' } : addMinutesLocal(endDate, ev.startTime, 60));
                    L.push('DTSTART:' + icsLocal(ev.start, ev.startTime), 'DTEND:' + icsLocal(e.date, e.time));
                } else {
                    L.push('DTSTART;VALUE=DATE:' + icsDay(ev.start), 'DTEND;VALUE=DATE:' + icsDay(addDaysStr(ev.end || ev.start, 1)));
                }
                if (ev.repeat === 'monthWeekly') {
                    const [yy, mm] = ev.start.split('-').map(Number);
                    L.push('RRULE:FREQ=WEEKLY;UNTIL=' + icsDay(formatDate(new Date(yy, mm, 0))) + (ev.startTime ? 'T235959' : ''));
                } else if (ev.repeat && freq[ev.repeat]) {
                    let r = 'RRULE:FREQ=' + freq[ev.repeat];
                    if (ev.repeatUntil) r += ';UNTIL=' + icsDay(ev.repeatUntil) + (ev.startTime ? 'T235959' : '');
                    L.push(r);
                }
                L.push('SUMMARY:' + icsEscape(ev.title));
                if (ev.description) L.push('DESCRIPTION:' + icsEscape(ev.description));
                if (ev.location) L.push('LOCATION:' + icsEscape(ev.location));
                if (cat && cat.name) L.push('CATEGORIES:' + icsEscape(cat.name));
                if (ev.important) L.push('PRIORITY:1');
                if (ev.reminder !== null && ev.reminder !== undefined && ev.reminder !== '') {
                    const rem = Number(ev.reminder);
                    // Con hora: minutos antes del inicio. Todo el día: minutos desde las 00:00 hasta la hora del aviso (09:00 por defecto)
                    const [rh, rm] = (ev.reminderTime || '09:00').split(':').map(Number);
                    const off = ev.startTime ? -rem : rh * 60 + rm - rem;
                    L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(ev.title),
                        'TRIGGER:' + (off < 0 ? '-' : '') + 'PT' + Math.abs(off) + 'M', 'END:VALARM');
                }
                L.push('END:VEVENT');
            });
            L.push('END:VCALENDAR');
            const blob = new Blob([L.map(icsFold).join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'calendario-' + formatDate(new Date()) + '.ics';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            showToast(events.length + ' eventos exportados a .ics', 'ok');
        }

        function icsParseDT(value, params) {
            let m = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
            if (m) return { date: m[1] + '-' + m[2] + '-' + m[3], time: null };
            m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(value);
            if (!m) return null;
            if (m[7]) {   // UTC → hora local
                const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
                return { date: formatDate(d), time: pad2n(d.getHours()) + ':' + pad2n(d.getMinutes()) };
            }
            return { date: m[1] + '-' + m[2] + '-' + m[3], time: m[4] + ':' + m[5] };
        }
        function icsParseDuration(v) {
            const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v || '');
            if (!m) return null;
            const min = (+(m[2] || 0)) * 10080 + (+(m[3] || 0)) * 1440 + (+(m[4] || 0)) * 60 + (+(m[5] || 0)) + Math.round((+(m[6] || 0)) / 60);
            return m[1] === '-' ? -min : min;
        }

        function parseICS(text) {
            const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
            const out = []; let cur = null, alarm = false;
            lines.forEach(line => {
                if (line === 'BEGIN:VEVENT') { cur = { props: {}, trigger: null }; return; }
                if (line === 'END:VEVENT') { if (cur) out.push(cur); cur = null; alarm = false; return; }
                if (!cur) return;
                if (line === 'BEGIN:VALARM') { alarm = true; return; }
                if (line === 'END:VALARM') { alarm = false; return; }
                const m = /^([A-Za-z0-9-]+)((?:;[^:]*)*):(.*)$/.exec(line);
                if (!m) return;
                const name = m[1].toUpperCase();
                if (alarm) { if (name === 'TRIGGER' && cur.trigger === null) cur.trigger = m[3]; return; }
                if (!(name in cur.props)) cur.props[name] = { v: m[3], p: m[2] || '' };
            });
            return out;
        }

        function importICSText(text) {
            const raw = parseICS(text);
            if (!raw.length) { showToast('El archivo .ics no contiene eventos'); return; }
            const palette = ['#3c6df0', '#f0623c', '#3cf06d', '#f03cb5', '#9c3cf0', '#f0c53c', '#3cd0f0'];
            const freqMap = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' };
            const dayCode = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
            let added = 0, dup = 0, noRepeat = 0, newCats = 0, seq = 0;
            raw.forEach(r => {
                const P = r.props;
                if (!P.DTSTART) return;
                const ds = icsParseDT(P.DTSTART.v, P.DTSTART.p);
                if (!ds) return;
                const ev = { id: Date.now() + (seq++), title: (icsUnescape(P.SUMMARY ? P.SUMMARY.v : '') || 'Sin título').slice(0, 120), start: ds.date, end: null, categoryId: null, description: '', important: false, startTime: ds.time, endTime: null };

                let de = P.DTEND ? icsParseDT(P.DTEND.v, P.DTEND.p) : null;
                if (!de && P.DURATION) {
                    const dm = icsParseDuration(P.DURATION.v);
                    if (dm !== null && ds.time) { const x = addMinutesLocal(ds.date, ds.time, dm); de = { date: x.date, time: x.time }; }
                    else if (dm !== null) de = { date: addDaysStr(ds.date, Math.max(1, Math.round(dm / 1440))), time: null };
                }
                if (ds.time) {
                    if (de) {
                        if (de.date === ds.date) { if (de.time && de.time > ds.time) ev.endTime = de.time; }
                        else {
                            if (de.time === '00:00') ev.end = addDaysStr(de.date, -1);
                            else { ev.end = de.date; ev.endTime = de.time; }
                            if (ev.end && ev.end <= ev.start) { ev.end = null; ev.endTime = null; }
                        }
                    }
                } else if (de && de.date) {
                    const last = addDaysStr(de.date, -1);   // en eventos de día completo el fin es exclusivo
                    if (last > ds.date) ev.end = last;
                }

                const rr = P.RRULE ? P.RRULE.v : null;
                if (rr) {
                    const kv = {}; rr.split(';').forEach(s => { const i = s.indexOf('='); if (i > 0) kv[s.slice(0, i).toUpperCase()] = s.slice(i + 1); });
                    let ok = !!freqMap[kv.FREQ] && (!kv.INTERVAL || kv.INTERVAL === '1') && !kv.BYSETPOS && !kv.BYMONTH && !kv.BYYEARDAY && !kv.BYWEEKNO;
                    if (ok && kv.BYDAY) ok = kv.FREQ === 'WEEKLY' && !kv.BYDAY.includes(',') && kv.BYDAY === dayCode[parseD(ds.date).getDay()];
                    if (ok && kv.BYMONTHDAY) ok = kv.FREQ === 'MONTHLY' && kv.BYMONTHDAY === String(+ds.date.slice(8));
                    if (ok) {
                        ev.repeat = freqMap[kv.FREQ];
                        if (kv.UNTIL) { const u = icsParseDT(kv.UNTIL, ''); if (u) ev.repeatUntil = u.date; }
                        else if (kv.COUNT && +kv.COUNT > 1) {
                            const n = +kv.COUNT - 1, [y, mo, d] = ds.date.split('-').map(Number);
                            ev.repeatUntil = ev.repeat === 'daily' ? addDaysStr(ds.date, n)
                                : ev.repeat === 'weekly' ? addDaysStr(ds.date, n * 7)
                                    : ev.repeat === 'monthly' ? formatDate(new Date(y, mo - 1 + n, d))
                                        : formatDate(new Date(y + n, mo - 1, d));
                        }
                    } else noRepeat++;
                }

                let desc = P.DESCRIPTION ? icsUnescape(P.DESCRIPTION.v) : '';
                if (P.LOCATION && P.LOCATION.v) ev.location = icsUnescape(P.LOCATION.v).trim().slice(0, 200) || null;
                ev.description = desc.slice(0, 1000);
                if (P.PRIORITY && +P.PRIORITY.v >= 1 && +P.PRIORITY.v <= 4) ev.important = true;

                if (r.trigger) {
                    const tm = icsParseDuration(r.trigger);
                    if (tm !== null && ds.time && tm <= 0) {
                        const rem = -tm;
                        ev.reminder = REMINDER_OPTIONS.reduce((a, b) => Math.abs(b - rem) < Math.abs(a - rem) ? b : a, 0);
                    } else if (tm !== null && !ds.time) {
                        // Todo el día: el aviso cae en (00:00 del día + tm). Se guarda la hora y si es ese día o el anterior
                        const dayOff = Math.floor(tm / 1440), mod = tm - dayOff * 1440;
                        if (dayOff === 0 || dayOff === -1 || dayOff < -1) {
                            ev.reminder = dayOff === 0 ? 0 : 1440;
                            ev.reminderTime = pad2n(Math.floor(mod / 60)) + ':' + pad2n(mod % 60);
                        }
                    }
                }

                if (P.CATEGORIES && P.CATEGORIES.v) {
                    const cn = icsUnescape(P.CATEGORIES.v.split(',')[0]).trim();
                    if (cn) {
                        let c = categories.find(x => x.name && x.name.toLowerCase() === cn.toLowerCase());
                        if (!c) {
                            c = { id: Date.now() + 100000 + (seq++), name: cn, color: palette[categories.length % palette.length], type: 'color' };
                            categories.push(c); newCats++;
                        }
                        ev.categoryId = c.id;
                    }
                }

                if (events.some(e => e.title === ev.title && e.start === ev.start && (e.startTime || null) === (ev.startTime || null))) { dup++; return; }
                events.push(ev); added++;
            });
            if (!added) { showToast(dup ? 'Todos los eventos ya estaban en el calendario' : 'No se pudo importar ningún evento'); return; }
            safeSave('calendarEvents', events);
            if (newCats) { safeSave('eventCategories', categories); renderCategorySelector(); }
            renderCalendar(); loadUpcomingEvents();
            if (agendaPopupOpen) renderAgenda();
            let msg = added + (added === 1 ? ' evento importado' : ' eventos importados');
            if (dup) msg += ' · ' + dup + ' repetidos omitidos';
            if (noRepeat) msg += ' · ' + noRepeat + ' con repetición compleja (sin repetir)';
            showToast(msg, 'ok', { label: 'Deshacer', fn: undo });
        }

        // Menú de opciones de Importar / Exportar (junto al botón pulsado)
        const IO_COMPAT = 'Compatible con Google Calendar, Outlook y Apple Calendar';
        const IO_OPTIONS = {
            export: [
                { icon: 'fi fi-sr-box-open-full', title: 'Calendario completo (.json)', sub: 'Eventos, categorías y documentos', fn: () => exportJSON() },
                { icon: 'fi fi-sr-calendar-heart', title: 'Solo eventos (.ics)', sub: IO_COMPAT, fn: () => exportICS() }
            ],
            import: [
                { icon: 'fi fi-sr-box-open-full', title: 'Calendario completo (.json)', sub: 'Podrás fusionarlo con el tuyo o sustituirlo', fn: () => document.getElementById('importFile').click() },
                { icon: 'fi fi-sr-calendar-heart', title: 'Eventos de un archivo (.ics)', sub: IO_COMPAT + ' · se añaden a los tuyos', fn: () => document.getElementById('importIcsFile').click() }
            ]
        };
        let ioMenuFor = null;
        function closeIoMenu() {
            const m = document.getElementById('ioMenu');
            if (m) m.classList.remove('open');
            ioMenuFor = null;
        }
        function openIoMenu(kind, anchor) {
            if (ioMenuFor === kind) { closeIoMenu(); return; }
            let m = document.getElementById('ioMenu');
            if (!m) { m = document.createElement('div'); m.id = 'ioMenu'; m.className = 'io-menu'; m.setAttribute('role', 'menu'); document.body.appendChild(m); m.addEventListener('click', e => e.stopPropagation()); }
            m.innerHTML = '';
            IO_OPTIONS[kind].forEach(o => {
                const b = document.createElement('button'); b.type = 'button'; b.className = 'io-menu-item'; b.setAttribute('role', 'menuitem');
                const ic = document.createElement('span'); ic.className = 'io-menu-icon'; ic.innerHTML = '<i class="' + o.icon + '"></i>';
                const tx = document.createElement('span'); tx.className = 'io-menu-text';
                const t = document.createElement('span'); t.textContent = o.title;
                const sub = document.createElement('small'); sub.textContent = o.sub;
                tx.appendChild(t); tx.appendChild(sub); b.appendChild(ic); b.appendChild(tx);
                b.addEventListener('click', () => { closeIoMenu(); o.fn(); });
                m.appendChild(b);
            });
            const r = anchor.getBoundingClientRect();
            m.classList.add('open');
            const h = m.offsetHeight;
            m.style.left = (r.right + 14) + 'px';
            m.style.top = Math.max(12, Math.min(window.innerHeight - h - 12, r.top + r.height / 2 - h / 2)) + 'px';
            ioMenuFor = kind;
        }
        document.getElementById('exportBtn').addEventListener('click', e => { e.stopPropagation(); openIoMenu('export', e.currentTarget); });
        document.getElementById('importBtn').addEventListener('click', e => { e.stopPropagation(); openIoMenu('import', e.currentTarget); });
        document.addEventListener('click', closeIoMenu);
        document.getElementById('importIcsFile').addEventListener('change', e => {
            const f = e.target.files[0]; e.target.value = '';
            if (!f) return;
            if (!/\.ics$/i.test(f.name)) { showImportProblem('No se puede importar', 'Elige un archivo con extensión .ics. Has elegido "' + f.name + '".'); return; }
            if (f.size === 0 || f.size > 30 * 1024 * 1024) { showImportProblem('No se puede importar', f.size === 0 ? 'El archivo está vacío (0 bytes).' : 'El archivo es demasiado grande para ser un calendario .ics.'); return; }
            const r = new FileReader();
            r.onerror = () => showToast('No se pudo leer el archivo .ics');
            r.onload = () => busyRun('Importando eventos…', () => { try { importICSText(String(r.result)); } catch (err) { console.error(err); showToast('No se pudo leer el archivo .ics'); } });
            r.readAsText(f);
        });

        // ============================================
        // IMPORTAR DOCUMENTOS (Word / PDF) AL SIDEBAR DE DOCUMENTOS
        // ============================================
        const ATTACH_KINDS = {
            pdf: { label: 'PDF', icon: 'fi fi-sr-file-pdf', color: '#dc2626' },
            doc: { label: 'Word', icon: 'fi fi-sr-file-word', color: '#2b579a' },
            docx: { label: 'Word', icon: 'fi fi-sr-file-word', color: '#2b579a' }
        };
        function isAttachment(f) { return !!f && f.kind === 'attachment' && !!ATTACH_KINDS[f.ext]; }
        function formatBytes(n) {
            if (!isFinite(n) || n <= 0) return '0 KB';
            if (n < 1048576) return Math.max(1, Math.round(n / 1024)) + ' KB';
            return (n / 1048576).toFixed(1).replace('.', ',') + ' MB';
        }
        function bytesInclude(b, str) {
            const n = str.length, c0 = str.charCodeAt(0);
            outer: for (let i = 0; i <= b.length - n; i++) {
                if (b[i] !== c0) continue;
                for (let j = 1; j < n; j++) if (b[i + j] !== str.charCodeAt(j)) continue outer;
                return true;
            }
            return false;
        }
        // Comprueba el CONTENIDO real (no solo la extensión)
        function checkDocumentBytes(b, ext) {
            const starts = (arr) => arr.every((v, i) => b[i] === v);
            if (ext === 'pdf') {
                const head = String.fromCharCode.apply(null, b.subarray(0, Math.min(1024, b.length)));
                return head.indexOf('%PDF-') !== -1 ? { ok: true }
                    : { ok: false, error: 'El archivo no es un PDF real: su contenido no tiene formato PDF aunque la extensión sea .pdf.' };
            }
            if (ext === 'doc') {
                return starts([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]) ? { ok: true }
                    : { ok: false, error: 'El archivo no es un Word .doc real. Si es un .docx con la extensión cambiada, renómbralo a .docx.' };
            }
            if (ext === 'docx') {
                if (!starts([0x50, 0x4B, 0x03, 0x04]))
                    return { ok: false, error: 'El archivo no es un Word .docx real (o está protegido con contraseña, y esos no se pueden importar).' };
                return bytesInclude(b, 'word/document.xml') ? { ok: true }
                    : { ok: false, error: 'El archivo es un .zip, pero no contiene un documento de Word.' };
            }
            return { ok: false, error: 'Tipo de archivo no admitido.' };
        }
        async function sniffDocumentFile(file) {
            const m = /\.([a-z0-9]+)$/i.exec(file.name || '');
            const ext = m ? m[1].toLowerCase() : '';
            if (!ATTACH_EXTS.includes(ext))
                return { ok: false, error: 'Solo se pueden importar documentos Word (.doc, .docx) o PDF (.pdf). Has elegido "' + file.name + '".' };
            if (file.size === 0) return { ok: false, error: 'El archivo está vacío (0 bytes).' };
            if (file.size > ATTACH_MAX_BYTES)
                return { ok: false, error: 'El archivo pesa ' + formatBytes(file.size) + ' y el máximo permitido es ' + formatBytes(ATTACH_MAX_BYTES) + '.' };
            let buffer;
            try { buffer = await file.arrayBuffer(); }
            catch (err) { return { ok: false, error: 'No se pudo leer el archivo. Comprueba que no esté abierto en otro programa ni dañado.' }; }
            const chk = checkDocumentBytes(new Uint8Array(buffer), ext);
            if (!chk.ok) return chk;
            return { ok: true, ext, buffer };
        }

        (function () {
            const modal = document.getElementById('importDocModal');
            const form = document.getElementById('importDocForm');
            const nameEl = document.getElementById('importDocName');
            const infoEl = document.getElementById('importDocInfo');
            const pickerEl = document.getElementById('importDocFolderPicker');
            const titleEl = document.getElementById('importDocTitle');
            const submitBtn = document.getElementById('importDocSubmit');
            const fileInput = document.getElementById('importDocFile');
            let pending = null, editingId = null, targetFolder = null, busy = false;

            function paintInfo(ext, name, size) {
                const k = ATTACH_KINDS[ext];
                infoEl.innerHTML = '';
                const i = document.createElement('i'); i.className = k.icon; i.style.color = k.color; i.style.fontSize = '22px';
                const t = document.createElement('span'); t.className = 'import-doc-info-text';
                t.textContent = name + ' · ' + k.label + (size ? ' · ' + formatBytes(size) : '');
                infoEl.appendChild(i); infoEl.appendChild(t);
            }
            function paintPicker() {
                renderFolderTreePicker(pickerEl, {
                    selectedId: targetFolder,
                    rootLabel: 'Sin carpeta (archivo suelto)',
                    onSelect: (id) => { targetFolder = id; }
                });
            }
            function closeModal() { modal.style.display = 'none'; pending = null; editingId = null; }

            document.getElementById('importDocBtn').addEventListener('click', () => fileInput.click());
            document.getElementById('closeImportDocModal').addEventListener('click', closeModal);

            fileInput.addEventListener('change', async (e) => {
                const f = e.target.files[0]; e.target.value = '';
                if (!f) return;
                if (!(window.store && window.store.saveDocument)) {
                    showImportProblem('No disponible', 'Importar documentos solo funciona en la aplicación de escritorio.');
                    return;
                }
                const res = await sniffDocumentFile(f);
                if (!res.ok) { showImportProblem('No se puede importar', res.error); return; }
                pending = { ext: res.ext, buffer: res.buffer, size: f.size, origName: f.name };
                editingId = null; targetFolder = null;
                titleEl.textContent = 'Importar documento';
                submitBtn.innerHTML = '<i class="fi fi-sr-disk"></i> Importar';
                nameEl.value = (f.name.replace(/\.[^.]+$/, '').trim() || 'Documento').slice(0, 200);
                paintInfo(res.ext, f.name, f.size);
                paintPicker();
                modal.style.display = 'flex';
                nameEl.focus(); nameEl.select();
            });

            window.openEditAttachmentModal = function (file) {
                pending = null; editingId = file.id;
                targetFolder = folders.some(x => x.id === file.folderId) ? file.folderId : null;
                titleEl.textContent = 'Renombrar o mover';
                submitBtn.innerHTML = '<i class="fi fi-sr-disk"></i> Guardar';
                nameEl.value = file.title || '';
                paintInfo(file.ext, file.origName || file.title || 'Documento', file.size);
                paintPicker();
                modal.style.display = 'flex';
                nameEl.focus(); nameEl.setSelectionRange(nameEl.value.length, nameEl.value.length);
            };

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (busy) return;
                const title = nameEl.value.trim().slice(0, 200);
                if (!title) { nameEl.focus(); return; }
                const folderId = (targetFolder !== null && folders.some(f => f.id === targetFolder)) ? targetFolder : null;
                const where = folderId !== null ? 'en "' + folders.find(f => f.id === folderId).name + '"' : 'como archivo suelto (míralo en "Sin ordenar")';

                if (editingId !== null) {
                    const i = files.findIndex(f => f.id === editingId);
                    if (i !== -1) {
                        files[i] = { ...files[i], title, folderId, updatedAt: Date.now() };
                        safeSave('calendarFiles', files);
                        renderDocuments();
                        showToast('Documento actualizado', 'ok');
                    }
                    closeModal();
                    return;
                }
                if (!pending) return;
                busy = true; submitBtn.disabled = true;
                try {
                    const res = await window.store.saveDocument({ name: pending.origName, data: pending.buffer });
                    if (!res || !res.ok) {
                        showImportProblem('No se pudo importar', (res && res.error) || 'No se pudo guardar el archivo en el disco.');
                        return;
                    }
                    const now = Date.now();
                    let id = now; while (files.some(f => f.id === id)) id++;
                    const html = '', inApp = false;   // se abre tal cual; el Word se edita con Word
                    files.push({
                        id, title, description: '', content: html, inApp, folderId,
                        createdAt: now, updatedAt: now,
                        kind: 'attachment', ext: res.ext, stored: res.stored, size: res.size,
                        origName: String(pending.origName).slice(0, 200)
                    });
                    safeSave('calendarFiles', files);
                    if (res.ext === 'pdf' || res.ext === 'docx') indexAttachmentText(id, pending.buffer.slice(0), res.ext);
                    closeModal();
                    renderDocuments();
                    showToast('Documento importado ' + where, 'ok', { label: 'Deshacer', fn: undo });
                } catch (err) {
                    console.error(err);
                    showImportProblem('No se pudo importar', 'Ocurrió un error inesperado al guardar el documento.');
                } finally {
                    busy = false; submitBtn.disabled = false;
                }
            });
        })();

        // ---------- Word (.docx) -> HTML editable (sin librerías externas) ----------
        const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
        async function zipIndex(buf) {
            const u8 = new Uint8Array(buf), dv = new DataView(buf);
            let eocd = -1;
            for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
                if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
            }
            if (eocd < 0) throw new Error('zip');
            const count = dv.getUint16(eocd + 10, true);
            let p = dv.getUint32(eocd + 16, true);
            const map = new Map(), dec = new TextDecoder();
            for (let n = 0; n < count; n++) {
                if (dv.getUint32(p, true) !== 0x02014b50) break;
                const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
                const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
                const lho = dv.getUint32(p + 42, true);
                map.set(dec.decode(u8.subarray(p + 46, p + 46 + nl)), { method, csize, lho });
                p += 46 + nl + el + cl;
            }
            return map;
        }
        async function zipBytes(buf, index, name) {
            const e = index.get(name);
            if (!e) return null;
            const dv = new DataView(buf);
            const start = e.lho + 30 + dv.getUint16(e.lho + 26, true) + dv.getUint16(e.lho + 28, true);
            let bytes = new Uint8Array(buf, start, e.csize);
            if (e.method === 8) {
                const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
                bytes = new Uint8Array(await new Response(s).arrayBuffer());
            } else if (e.method !== 0) throw new Error('compresión no soportada');
            return bytes;
        }
        async function zipText(buf, index, name) {
            const bytes = await zipBytes(buf, index, name);
            return bytes ? new TextDecoder('utf-8').decode(bytes) : null;
        }

        // Devuelve { html, header, footer }: el cuerpo ya convertido (con tablas, imágenes, enlaces e interlineado)
        // y el texto de la cabecera y el pie (con {n} y {total} en lugar de los campos de nº de página)
        async function docxToDoc(buffer) {
            const idx = await zipIndex(buffer);
            const docXml = await zipText(buffer, idx, 'word/document.xml');
            if (!docXml) throw new Error('sin document.xml');
            const parse = s => new DOMParser().parseFromString(s, 'application/xml');
            const kids = (el, n) => el ? Array.from(el.children).filter(c => c.localName === n) : [];
            const kid = (el, n) => kids(el, n)[0] || null;
            const wval = el => el ? (el.getAttributeNS(W_NS, 'val') || el.getAttribute('w:val')) : null;
            const wattr = (el, n) => el ? (el.getAttributeNS(W_NS, n) || el.getAttribute('w:' + n)) : null;
            const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const on = el => el && !/^(0|false|off|none)$/i.test(wval(el) || 'true');
            const escAttr = t => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            // Relaciones (imágenes, enlaces, cabecera y pie)
            const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
            const rattr = (el, n) => el ? (el.getAttributeNS(R_NS, n) || el.getAttribute('r:' + n)) : null;
            const rels = {};
            const relXml = await zipText(buffer, idx, 'word/_rels/document.xml.rels');
            if (relXml) kids(parse(relXml).documentElement, 'Relationship').forEach(r => {
                rels[r.getAttribute('Id')] = { target: r.getAttribute('Target') || '', type: r.getAttribute('Type') || '', ext: r.getAttribute('TargetMode') === 'External' };
            });
            // Las imágenes usadas se leen antes (el resto del proceso es síncrono) y se incrustan como data:
            const IMG_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
            const imgData = {}, usedRel = new Set();
            const relRe = /r:(?:embed|id)="([^"]+)"/g;
            let relM;
            while ((relM = relRe.exec(docXml))) usedRel.add(relM[1]);
            let imgBudget = 12 * 1024 * 1024;
            for (const rid of usedRel) {
                const r = rels[rid];
                if (!r || r.ext || !/\/image$/.test(r.type)) continue;
                const mime = IMG_MIME[(r.target.split('.').pop() || '').toLowerCase()];
                if (!mime) continue;                                   // emf, wmf, svg, tiff...: no se pueden mostrar
                const path = r.target.charAt(0) === '/' ? r.target.slice(1) : 'word/' + r.target.replace(/^(\.\.\/)+/, '');
                const bytes = await zipBytes(buffer, idx, path);
                if (!bytes || bytes.length > 6 * 1024 * 1024 || bytes.length > imgBudget) continue;
                imgBudget -= bytes.length;
                let bin = '';
                for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
                imgData[rid] = 'data:' + mime + ';base64,' + btoa(bin);
            }
            function imageHtml(el) {   // w:drawing / w:pict -> <img>
                const all = Array.from(el.getElementsByTagName('*'));
                const blip = all.find(n => n.localName === 'blip' || n.localName === 'imagedata');
                if (!blip) return '';
                const rid = rattr(blip, 'embed') || rattr(blip, 'id');
                const src = rid && imgData[rid];
                if (!src) return '';
                const ext = all.find(n => n.localName === 'extent');
                const cx = ext ? parseInt(ext.getAttribute('cx'), 10) : 0;
                const px = cx > 0 ? Math.max(8, Math.round(cx / 9525)) : 0;
                const pr = all.find(n => n.localName === 'docPr');
                const descr = pr ? pr.getAttribute('descr') : '';
                return '<img src="' + src + '"' + (descr ? ' alt="' + escAttr(descr.slice(0, 200)) + '"' : '') +
                    (px ? ' style="width: ' + px + 'px; max-width: 100%; height: auto"' : '') + '>';
            }
            // Texto de una cabecera/pie; los campos PAGE y NUMPAGES pasan a {n} y {total}
            function hfText(root) {
                const lines = [];
                Array.from(root.getElementsByTagName('*')).filter(n => n.localName === 'p').forEach(p => {
                    Array.from(p.getElementsByTagName('*')).filter(x => x.localName === 'fldSimple').forEach(f => {
                        const instr = wattr(f, 'instr') || '';
                        const tok = /NUMPAGES/i.test(instr) ? '{total}' : (/PAGE/i.test(instr) ? '{n}' : null);
                        if (!tok) return;
                        const te = root.ownerDocument.createElementNS(W_NS, 'w:t');
                        te.textContent = tok;
                        while (f.firstChild) f.removeChild(f.firstChild);
                        f.appendChild(te);
                    });
                    let t = '', field = null, skip = false;
                    Array.from(p.getElementsByTagName('*')).forEach(n => {
                        const ln = n.localName;
                        if (ln === 'fldChar') {
                            const ty = wattr(n, 'fldCharType');
                            if (ty === 'begin') { field = ''; skip = false; }
                            else if (ty === 'separate') skip = true;
                            else if (ty === 'end') {
                                if (field !== null) t += /NUMPAGES/i.test(field) ? '{total}' : (/PAGE/i.test(field) ? '{n}' : '');
                                field = null; skip = false;
                            }
                        } else if (ln === 'instrText' && field !== null) field += n.textContent;
                        else if (ln === 't' && !skip) t += n.textContent;
                        else if (ln === 'tab' && !skip) t += '   ';
                    });
                    if (t.trim()) lines.push(t.trim());
                });
                return lines.join('\n').slice(0, 300);
            }

            // Estilos -> nivel de título
            const headingOf = {}, styleNum = {};
            const stXml = await zipText(buffer, idx, 'word/styles.xml');
            if (stXml) {
                kids(parse(stXml).documentElement, 'style').forEach(s => {
                    const id = wattr(s, 'styleId') || '', name = wval(kid(s, 'name')) || '';
                    let m = /^heading\s?([1-6])$/i.exec(name) || /^heading([1-6])$/i.exec(id);
                    const sn = kid(kid(s, 'pPr'), 'numPr');   // listas definidas en el estilo (p. ej. "Lista con viñetas")
                    if (sn && wval(kid(sn, 'numId'))) styleNum[id] = { numId: wval(kid(sn, 'numId')), ilvl: wval(kid(sn, 'ilvl')) || '0' };
                    if (m) headingOf[id] = Math.min(3, +m[1]);
                    else if (/^title$/i.test(name) || /^title$/i.test(id)) headingOf[id] = 1;
                });
            }
            // Numeración -> tipo de lista por (numId, nivel)
            const numFmt = {};
            const nmXml = await zipText(buffer, idx, 'word/numbering.xml');
            if (nmXml) {
                const root = parse(nmXml).documentElement, abs = {};
                kids(root, 'abstractNum').forEach(a => {
                    const lv = {};
                    kids(a, 'lvl').forEach(l => { lv[wattr(l, 'ilvl')] = wval(kid(l, 'numFmt')) || 'decimal'; });
                    abs[wattr(a, 'abstractNumId')] = lv;
                });
                kids(root, 'num').forEach(n => { numFmt[wattr(n, 'numId')] = abs[wval(kid(n, 'abstractNumId'))] || {}; });
            }

            // ---- Estilos de Word: se aplican los de párrafo y carácter y los valores por defecto del documento ----
            const thXml = await zipText(buffer, idx, 'word/theme/theme1.xml');
            const theme = { minor: '', major: '' };
            if (thXml) {
                const m1 = /<a:minorFont>\s*<a:latin typeface="([^"]*)"/.exec(thXml), m2 = /<a:majorFont>\s*<a:latin typeface="([^"]*)"/.exec(thXml);
                theme.minor = m1 ? m1[1] : ''; theme.major = m2 ? m2[1] : '';
            }
            // Colores de tema (accent1..6, dk1, lt1...) para rellenos, bordes y textos que no llevan el hex directo
            const themeCols = {};
            if (thXml) {
                const re = /<a:(dk1|lt1|dk2|lt2|accent[1-6])>\s*<a:(?:srgbClr val|sysClr [^>]*lastClr)="([0-9A-Fa-f]{6})"/g;
                let tm;
                while ((tm = re.exec(thXml))) themeCols[tm[1]] = tm[2];
            }
            const themeHex = (name, tint, shade) => {
                const key = { text1: 'dk1', background1: 'lt1', text2: 'dk2', background2: 'lt2', dark1: 'dk1', light1: 'lt1', dark2: 'dk2', light2: 'lt2' }[name] || name;
                const h = themeCols[key];
                if (!h) return null;
                let c = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16));
                if (shade) { const f = parseInt(shade, 16) / 255; c = c.map(v => Math.round(v * f)); }
                if (tint) { const f = parseInt(tint, 16) / 255; c = c.map(v => Math.round(v * f + 255 * (1 - f))); }
                return c.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('').toUpperCase();
            };
            const colorAttr = (el, hexA, themeA, tintA, shadeA) => {
                if (!el) return null;
                const h = wattr(el, hexA);
                if (h && /^[0-9a-f]{6}$/i.test(h)) return h.toUpperCase();
                const t = wattr(el, themeA);
                return t ? themeHex(t, wattr(el, tintA), wattr(el, shadeA)) : null;
            };
            const fillOf = shd => (shd && wattr(shd, 'val') !== 'nil') ? colorAttr(shd, 'fill', 'themeFill', 'themeFillTint', 'themeFillShade') : null;
            const parseBorders = el => {
                const o = {};
                if (!el) return o;
                Array.from(el.children).forEach(b => {
                    const n = b.localName === 'start' ? 'left' : (b.localName === 'end' ? 'right' : b.localName);
                    o[n] = { val: wval(b) || 'single', sz: parseInt(wattr(b, 'sz') || '4', 10), color: colorAttr(b, 'color', 'themeColor', 'themeTint', 'themeShade') };
                });
                return o;
            };
            const parseMar = el => {
                const o = {};
                if (!el) return o;
                Array.from(el.children).forEach(m => {
                    const v = parseInt(wattr(m, 'w') || '', 10);
                    if (isNaN(v)) return;
                    const n = m.localName === 'start' ? 'left' : (m.localName === 'end' ? 'right' : m.localName);
                    o[n] = v;
                });
                return o;
            };
            const borderCss = b => {
                if (!b || /^(nil|none)$/i.test(b.val)) return null;
                const px = Math.max(/double/i.test(b.val) ? 3 : 1, Math.round((b.sz || 4) / 8 * 96 / 72));
                const style = /double/i.test(b.val) ? 'double' : (/dash/i.test(b.val) ? 'dashed' : (/dot/i.test(b.val) ? 'dotted' : 'solid'));
                return px + 'px ' + style + ' #' + (b.color || '000000');
            };
            const mergeTbl = (a, b) => {
                a = a || {}; b = b || {};
                const cond = { ...(a.cond || {}) };
                Object.keys(b.cond || {}).forEach(k => {
                    const x = cond[k] || {}, y = b.cond[k];
                    cond[k] = { r: { ...x.r, ...y.r }, p: { ...x.p, ...y.p }, fill: y.fill || x.fill, borders: { ...x.borders, ...y.borders }, tblBorders: { ...x.tblBorders, ...y.tblBorders }, tblMar: { ...x.tblMar, ...y.tblMar } };
                });
                return { borders: { ...a.borders, ...b.borders }, mar: { ...a.mar, ...b.mar }, fill: b.fill || a.fill, cond };
            };
            const fillLum = f => (parseInt(f.slice(0, 2), 16) * 299 + parseInt(f.slice(2, 4), 16) * 587 + parseInt(f.slice(4, 6), 16) * 114) / 1000;
            const rprObj = rPr => {
                const o = {};
                if (!rPr) return o;
                const sz = parseInt(wval(kid(rPr, 'sz')), 10);
                if (sz > 0) o.sz = sz;
                ['b', 'i', 'u', 'caps', 'strike'].forEach(k => { const e = kid(rPr, k); if (e) o[k] = !!on(e); });
                const colEl = kid(rPr, 'color');
                const col = colorAttr(colEl, 'val', 'themeColor', 'themeTint', 'themeShade');
                if (col) o.color = col;
                else if (colEl && /^auto$/i.test(wval(colEl) || '')) o.color = 'auto';   // automático: Word elige blanco o negro según el fondo
                const rf = fillOf(kid(rPr, 'shd'));
                if (rf) o.fill = rf;
                const f = kid(rPr, 'rFonts');
                if (f) {
                    let n = wattr(f, 'ascii') || wattr(f, 'hAnsi');
                    if (!n) { const th = wattr(f, 'asciiTheme') || wattr(f, 'hAnsiTheme'); if (th) n = /major/i.test(th) ? theme.major : theme.minor; }
                    if (n) o.font = n;
                }
                return o;
            };
            const parObj = pPr => {
                const o = {};
                if (!pPr) return o;
                const sp = kid(pPr, 'spacing');
                if (sp) {
                    const num = a => { const v = parseInt(wattr(sp, a) || '', 10); return isNaN(v) ? undefined : v; };
                    const l = num('line'); if (l > 0) { o.line = l; o.rule = wattr(sp, 'lineRule') || 'auto'; }
                    const b = num('before'); if (b !== undefined) o.before = b;
                    const a = num('after'); if (a !== undefined) o.after = a;
                }
                const jc = wval(kid(pPr, 'jc')); if (jc) o.jc = jc;
                const pf = fillOf(kid(pPr, 'shd')); if (pf) o.fill = pf;
                const ind = kid(pPr, 'ind');
                if (ind) {
                    const g = a => parseInt(wattr(ind, a) || '', 10);
                    const l = isNaN(g('left')) ? g('start') : g('left');
                    if (!isNaN(l)) o.left = l;
                    if (!isNaN(g('firstLine'))) { o.firstLine = g('firstLine'); o.hanging = 0; }
                    if (!isNaN(g('hanging'))) { o.hanging = g('hanging'); o.firstLine = 0; }
                }
                return o;
            };
            const rawSty = {};
            let defStyleId = null, defTblStyleId = null, defR = {}, defP = {};
            let ctxR = {}, ctxP = {};   // formato heredado de la tabla/celda que se está convirtiendo
            if (stXml) {
                const sroot = parse(stXml).documentElement, dd = kid(sroot, 'docDefaults');
                defR = rprObj(kid(kid(dd, 'rPrDefault'), 'rPr'));
                defP = parObj(kid(kid(dd, 'pPrDefault'), 'pPr'));
                kids(sroot, 'style').forEach(s => {
                    const id = wattr(s, 'styleId') || '';
                    const tblPrS = kid(s, 'tblPr'), tcPrS = kid(s, 'tcPr'), cond = {};
                    kids(s, 'tblStylePr').forEach(cs => {
                        const cpr = kid(cs, 'tcPr');
                        cond[wattr(cs, 'type')] = { r: rprObj(kid(cs, 'rPr')), p: parObj(kid(cs, 'pPr')), fill: fillOf(kid(cpr, 'shd')), borders: parseBorders(kid(cpr, 'tcBorders')), tblBorders: parseBorders(kid(kid(cs, 'tblPr'), 'tblBorders')), tblMar: parseMar(kid(kid(cs, 'tblPr'), 'tblCellMar')) };
                    });
                    rawSty[id] = {
                        based: wval(kid(s, 'basedOn')), r: rprObj(kid(s, 'rPr')), p: parObj(kid(s, 'pPr')),
                        tbl: { borders: parseBorders(kid(tblPrS, 'tblBorders')), mar: parseMar(kid(tblPrS, 'tblCellMar')), fill: fillOf(kid(tcPrS, 'shd')), cond }
                    };
                    if (wattr(s, 'type') === 'paragraph' && wattr(s, 'default') === '1') defStyleId = id;
                    if (wattr(s, 'type') === 'table' && wattr(s, 'default') === '1') defTblStyleId = id;
                });
            }
            const resolvedSty = {};
            function sty(id) {
                if (!id || !rawSty[id]) return { r: {}, p: {}, tbl: {} };
                if (resolvedSty[id]) return resolvedSty[id];
                resolvedSty[id] = { r: {}, p: {}, tbl: {} };          // evita ciclos en basedOn
                const b = rawSty[id].based ? sty(rawSty[id].based) : { r: {}, p: {}, tbl: {} };
                return (resolvedSty[id] = { r: { ...b.r, ...rawSty[id].r }, p: { ...b.p, ...rawSty[id].p }, tbl: mergeTbl(b.tbl, rawSty[id].tbl) });
            }
            // Orden de prioridad: valores del documento < estilo Normal < formato de tabla/celda < estilo del párrafo
            const styleRunBase = id => ({ ...defR, ...sty(defStyleId).r, ...ctxR, ...(id && id !== defStyleId ? sty(id).r : {}) });
            const stylePar = id => ({ ...defP, ...sty(defStyleId).p, ...ctxP, ...(id && id !== defStyleId ? sty(id).p : {}) });
            const pr0 = styleRunBase(null), pp0 = stylePar(null);
            const pageDef = {
                font: /^[\w\s-]{1,60}$/.test(pr0.font || '') ? pr0.font : '',
                size: pr0.sz > 0 ? Math.round(pr0.sz * 2 / 3) : 0,
                lh: pp0.line > 0 && (!pp0.rule || pp0.rule === 'auto') ? +(pp0.line / 240).toFixed(2) : 0,
                after: Math.round((pp0.after || 0) / 15)
            };

            const HL = { yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', red: '#ff0000', blue: '#0000ff', lightGray: '#d3d3d3' };
            const PB = '\u0001PB\u0001';
            function runHtml(r, base) {
                let inner = '';
                Array.from(r.children).forEach(c => {
                    const n = c.localName;
                    if (n === 't') inner += esc(c.textContent);
                    else if (n === 'tab') inner += '&emsp;';
                    else if (n === 'noBreakHyphen') inner += '-';
                    else if (n === 'br') inner += wattr(c, 'type') === 'page' ? PB : '<br>';
                    else if (n === 'drawing' || n === 'pict' || n === 'AlternateContent') inner += imageHtml(c);
                });
                if (!inner) return '';
                const rPr = kid(r, 'rPr'), st = [];
                const rs = rPr ? wval(kid(rPr, 'rStyle')) : null;
                const o = { ...(base || {}), ...sty(rs).r, ...rprObj(rPr) };
                const hexCol = o.color && /^[0-9a-f]{6}$/i.test(o.color) ? o.color : null;
                if (o.fill) {                                   // texto con fondo propio: color propio para que se lea en claro y oscuro
                    st.push('background-color: #' + o.fill);
                    const dark = fillLum(o.fill) < 128;
                    st.push('color: #' + (hexCol && !(dark && fillLum(hexCol) <= 40) && !(!dark && fillLum(hexCol) >= 215) ? hexCol : (dark ? 'FFFFFF' : '000000')));
                } else if (hexCol && fillLum(hexCol) > 40) st.push('color: #' + hexCol);   // el negro se deja al color por defecto (claro/oscuro)
                if (o.sz > 0 && Math.round(o.sz * 2 / 3) !== pageDef.size) st.push('font-size: ' + Math.round(o.sz * 2 / 3) + 'px');
                if (o.font && o.font !== pageDef.font && /^[\w\s-]{1,60}$/.test(o.font)) st.push("font-family: '" + o.font + "', Arial, sans-serif");
                const hl = HL[wval(kid(rPr, 'highlight'))];
                if (hl) st.push('background-color: ' + hl);
                if (o.caps) st.push('text-transform: uppercase');
                if (st.length) inner = '<span style="' + st.join('; ') + '">' + inner + '</span>';
                if (o.b) inner = '<b>' + inner + '</b>';
                if (o.i) inner = '<i>' + inner + '</i>';
                if (o.u) inner = '<u>' + inner + '</u>';
                if (o.strike || on(kid(rPr, 'dstrike'))) inner = '<s>' + inner + '</s>';
                const va = wval(kid(rPr, 'vertAlign'));
                if (va === 'superscript') inner = '<sup>' + inner + '</sup>';
                else if (va === 'subscript') inner = '<sub>' + inner + '</sub>';
                return inner;
            }
            function inlineHtml(el, base) {
                let out = '';
                Array.from(el.children).forEach(c => {
                    const n = c.localName;
                    if (n === 'r') out += runHtml(c, base);
                    else if (n === 'hyperlink') {
                        const inner = inlineHtml(c, base), rel = rels[rattr(c, 'id')];
                        const href = rel && rel.ext ? rel.target : '';
                        out += (inner && SAFE_LINK_RE.test(href)) ? '<a href="' + escAttr(href) + '">' + inner + '</a>' : inner;
                    }
                    else if (n === 'smartTag' || n === 'ins' || n === 'sdt' || n === 'sdtContent') out += inlineHtml(c, base);
                });
                return out;
            }

            let out = '';
            const stack = [];
            const closeTo = n => { while (stack.length > n) out += '</li></' + stack.pop() + '>'; };
            function pushItem(inner, lvl, type) {
                closeTo(lvl + 1);
                if (stack.length === lvl + 1) {
                    if (stack[lvl] === type) { out += '</li><li>' + inner; return; }
                    closeTo(lvl);
                }
                while (stack.length < lvl + 1) {
                    out += '<' + type + '>'; stack.push(type);
                    if (stack.length < lvl + 1) out += '<li>';
                }
                out += '<li>' + inner;
            }
            function paragraph(p) {
                const pPr = kid(p, 'pPr');
                const numPr = kid(pPr, 'numPr');
                const sNum = styleNum[wval(kid(pPr, 'pStyle'))];
                const numId = numPr ? wval(kid(numPr, 'numId')) : (sNum ? sNum.numId : null);
                const html = inlineHtml(p, styleRunBase(wval(kid(pPr, 'pStyle'))));
                if (on(kid(pPr, 'pageBreakBefore'))) { closeTo(0); out += PAGE_SEP; }
                if (numId && numId !== '0') {
                    const lvl = Math.min(parseInt((numPr ? wval(kid(numPr, 'ilvl')) : (sNum && sNum.ilvl)) || '0', 10) || 0, 5);
                    const fmt = (numFmt[numId] || {})[String(lvl)] || 'bullet';
                    pushItem(html.replace(new RegExp(PB, 'g'), '') || '<br>', lvl, fmt === 'bullet' ? 'ul' : 'ol');
                    return;
                }
                closeTo(0);
                const sid = wval(kid(pPr, 'pStyle'));
                const lvl = headingOf[sid];
                const tag = lvl ? 'h' + lvl : 'p';
                const eff = { ...stylePar(sid), ...parObj(pPr) };
                const st = [];
                if (eff.jc === 'center') st.push('text-align: center');
                else if (eff.jc === 'right' || eff.jc === 'end') st.push('text-align: right');
                else if (eff.jc === 'both' || eff.jc === 'distribute') st.push('text-align: justify');
                if (eff.left > 0) st.push('margin-left: ' + Math.round(eff.left / 15) + 'px');
                if (eff.firstLine > 0) st.push('text-indent: ' + Math.round(eff.firstLine / 15) + 'px');
                else if (eff.hanging > 0) st.push('text-indent: -' + Math.round(eff.hanging / 15) + 'px');
                if (eff.line > 0) {
                    if (!eff.rule || eff.rule === 'auto') {
                        const lh = +Math.min(3, Math.max(0.8, eff.line / 240)).toFixed(2);
                        if (lh !== pageDef.lh) st.push('line-height: ' + lh);
                    } else st.push('line-height: ' + Math.round(eff.line / 15) + 'px');
                }
                if (eff.fill) { st.push('background-color: #' + eff.fill); st.push('color: #' + (fillLum(eff.fill) < 128 ? 'FFFFFF' : '000000')); }
                const bf = Math.min(80, Math.round((eff.before || 0) / 15)), af = Math.min(80, Math.round((eff.after || 0) / 15));
                if (lvl) {
                    st.push('margin-top: ' + bf + 'px', 'margin-bottom: ' + af + 'px');
                    const rb = styleRunBase(sid);
                    if (rb.sz > 0) st.push('font-size: ' + Math.round(rb.sz * 2 / 3) + 'px');
                    st.push('font-weight: normal');
                } else {
                    if (bf > 0) st.push('margin-top: ' + bf + 'px');
                    if (af !== pageDef.after) st.push('margin-bottom: ' + af + 'px');
                }
                const open = '<' + tag + (st.length ? ' style="' + st.join('; ') + '"' : '') + '>';
                const parts = html.split(PB);
                parts.forEach((part, i) => {
                    if (i > 0) out += PAGE_SEP;
                    if (part || parts.length === 1) out += open + (part || '<br>') + '</' + tag + '>';
                });
            }
            // Contenido de una celda (párrafos, listas y tablas anidadas), sin saltos de página.
            // r y p son el formato que la celda hereda del estilo de la tabla (p. ej. texto blanco y negrita en la fila de títulos)
            function cellHtml(tc, r, p) {
                closeTo(0);
                const saved = out, sr = ctxR, sp = ctxP;
                out = ''; ctxR = r || {}; ctxP = p || {};
                block(tc);
                closeTo(0);
                const res = out.split(PAGE_SEP).join('');
                out = saved; ctxR = sr; ctxP = sp;
                return res || '<p><br></p>';
            }
            // Tabla de Word -> <table> real: anchos, bordes y colores, relleno, márgenes de celda, altos de fila
            // y el formato condicional del estilo de tabla (fila de títulos, filas alternas, primera columna...)
            function table(t) {
                closeTo(0);
                const tblPr = kid(t, 'tblPr');
                const ts = sty(wval(kid(tblPr, 'tblStyle')) || defTblStyleId), tb0 = ts.tbl || {};
                const wt = (tb0.cond || {}).wholeTable || {};
                const tb = { ...(tb0.borders || {}), ...(wt.tblBorders || {}), ...parseBorders(kid(tblPr, 'tblBorders')) };
                const mar = { top: 0, left: 108, bottom: 0, right: 108, ...(tb0.mar || {}), ...(wt.tblMar || {}), ...parseMar(kid(tblPr, 'tblCellMar')) };
                const lk = kid(tblPr, 'tblLook'), bits = lk ? parseInt(wattr(lk, 'val') || '0', 16) : 0x20;
                const flag = (n, bit) => { const v = wattr(lk, n); return v !== null && v !== undefined && v !== '' ? /^(1|true|on)$/i.test(v) : !!(bits & bit); };
                const look = { fr: flag('firstRow', 0x20), lr: flag('lastRow', 0x40), fc: flag('firstColumn', 0x80), lc: flag('lastColumn', 0x100), nh: flag('noHBand', 0x200), nv: flag('noVBand', 0x400) };
                const gridCols = kids(kid(t, 'tblGrid'), 'gridCol').map(g => parseInt(wattr(g, 'w') || '0', 10));
                const total = gridCols.reduce((a, b) => a + b, 0);
                const trs = kids(t, 'tr');
                const rows = trs.map(tr => {
                    let col = 0;
                    return kids(tr, 'tc').map(tc => {
                        const pr = kid(tc, 'tcPr'), vm = kid(pr, 'vMerge');
                        const o = { tc, pr, col, span: Math.max(1, parseInt(wval(kid(pr, 'gridSpan')) || '1', 10)), vm: vm ? (wval(vm) || 'continue') : null, rs: 1, skip: false };
                        col += o.span;
                        return o;
                    });
                });
                rows.forEach((cells, ri) => cells.forEach(c => {          // combinación vertical -> rowspan
                    if (c.vm !== 'restart') return;
                    for (let k = ri + 1; k < rows.length; k++) {
                        const nx = rows[k].find(x => x.col === c.col && x.vm === 'continue');
                        if (!nx) break;
                        nx.skip = true; c.rs++;
                    }
                }));
                rows.forEach(cells => cells.forEach(c => { if (c.vm === 'continue') c.skip = true; }));
                const R = rows.length;
                const C = gridCols.length || Math.max(0, ...rows.map(cs => cs.reduce((a, c) => a + c.span, 0)));
                // Ancho, alineación y sangría de la tabla
                const tw = kid(tblPr, 'tblW'), twRaw = wattr(tw, 'w') || '', twT = wattr(tw, 'type');
                let widthCss;
                if (twT === 'pct' && parseFloat(twRaw) > 0) widthCss = (/%$/.test(twRaw) ? parseFloat(twRaw) : parseFloat(twRaw) / 50).toFixed(1) + '%';
                else {
                    const px = twT === 'dxa' && parseInt(twRaw, 10) > 0 ? parseInt(twRaw, 10) / 15 : total / 15;
                    widthCss = px > 0 ? Math.round(px) + 'px' : '100%';
                }
                const tj = wval(kid(tblPr, 'jc')), ti = parseInt(wattr(kid(tblPr, 'tblInd'), 'w') || '0', 10);
                let tst = 'border-collapse: collapse; table-layout: fixed; width: ' + widthCss + '; max-width: 100%';
                if (tj === 'center') tst += '; margin-left: auto; margin-right: auto';
                else if (tj === 'right' || tj === 'end') tst += '; margin-left: auto';
                else if (ti > 0) tst += '; margin-left: ' + Math.round(ti / 15) + 'px';
                let h = '<table style="' + tst + '">';
                if (total > 0) h += '<colgroup>' + gridCols.map(w => '<col style="width: ' + (w * 100 / total).toFixed(2) + '%">').join('') + '</colgroup>';
                h += '<tbody>';
                const cd = tb0.cond || {};
                rows.forEach((cells, ri) => {
                    const trH = parseInt(wattr(kid(kid(trs[ri], 'trPr'), 'trHeight'), 'val') || '', 10);
                    h += '<tr>';
                    cells.forEach(c => {
                        if (c.skip) return;
                        const lastCol = c.col + c.span >= C;
                        // Formatos condicionales que afectan a esta celda, de menor a mayor prioridad
                        const conds = [];
                        const push = k => { if (cd[k]) conds.push(cd[k]); };
                        push('wholeTable');
                        const bodyRow = ri - (look.fr ? 1 : 0), bodyCol = c.col - (look.fc ? 1 : 0);
                        if (!look.nh && bodyRow >= 0 && !(look.lr && ri === R - 1)) push(bodyRow % 2 === 0 ? 'band1Horz' : 'band2Horz');
                        if (!look.nv && bodyCol >= 0 && !(look.lc && lastCol)) push(bodyCol % 2 === 0 ? 'band1Vert' : 'band2Vert');
                        if (look.fc && c.col === 0) push('firstCol');
                        if (look.lc && lastCol) push('lastCol');
                        if (look.fr && ri === 0) push('firstRow');
                        if (look.lr && ri === R - 1) push('lastRow');
                        if (look.fr && look.fc && ri === 0 && c.col === 0) push('nwCell');
                        if (look.fr && look.lc && ri === 0 && lastCol) push('neCell');
                        if (look.lr && look.fc && ri === R - 1 && c.col === 0) push('swCell');
                        if (look.lr && look.lc && ri === R - 1 && lastCol) push('seCell');
                        const mc = conds.reduce((a, x) => ({ r: { ...a.r, ...x.r }, p: { ...a.p, ...x.p }, fill: x.fill || a.fill, borders: { ...a.borders, ...x.borders } }), { r: {}, p: {}, fill: null, borders: {} });
                        const fill = fillOf(kid(c.pr, 'shd')) || mc.fill || tb0.fill || null;
                        const pos = {
                            top: ri === 0 ? tb.top : tb.insideH,
                            bottom: ri + c.rs >= R ? tb.bottom : tb.insideH,
                            left: c.col === 0 ? tb.left : tb.insideV,
                            right: lastCol ? tb.right : tb.insideV
                        };
                        const side = o => ({ top: o.top, right: o.right, bottom: o.bottom, left: o.left });
                        const bs = { ...pos, ...JSON.parse(JSON.stringify(side(mc.borders))), ...JSON.parse(JSON.stringify(side(parseBorders(kid(c.pr, 'tcBorders'))))) };
                        const st = [];
                        ['top', 'right', 'bottom', 'left'].forEach(sd => st.push('border-' + sd + ': ' + (borderCss(bs[sd]) || 'none')));
                        const cm = { ...mar, ...parseMar(kid(c.pr, 'tcMar')) };
                        st.push('padding: ' + [cm.top, cm.right, cm.bottom, cm.left].map(v => Math.round((v || 0) / 15) + 'px').join(' '));
                        const inheritedR = { ...ts.r, ...mc.r };
                        if (fill) {
                            st.push('background-color: #' + fill);
                            const lum = fillLum(fill), tc = /^[0-9a-f]{6}$/i.test(inheritedR.color || '') ? inheritedR.color : null;
                            // Sobre un fondo propio el texto lleva color propio (en modo oscuro saldría claro sobre claro).
                            // Si es automático, o negro sobre fondo oscuro (Word lo pone en blanco), se elige el que contrasta
                            const bad = !tc || (lum < 128 && fillLum(tc) <= 40) || (lum >= 128 && fillLum(tc) >= 215);
                            st.push('color: #' + (bad ? (lum < 128 ? 'FFFFFF' : '000000') : tc));
                        }
                        const va = wval(kid(c.pr, 'vAlign'));
                        if (va === 'center') st.push('vertical-align: middle'); else if (va === 'bottom') st.push('vertical-align: bottom');
                        if (trH > 0) st.push('height: ' + Math.round(trH / 15) + 'px');
                        h += '<td' + (c.span > 1 ? ' colspan="' + c.span + '"' : '') + (c.rs > 1 ? ' rowspan="' + c.rs + '"' : '') +
                            ' style="' + st.join('; ') + '">' + cellHtml(c.tc, inheritedR, { ...ts.p, ...mc.p }) + '</td>';
                    });
                    h += '</tr>';
                });
                out += h + '</tbody></table>';
            }
            function block(el) {
                Array.from(el.children).forEach(c => {
                    if (c.localName === 'p') paragraph(c);
                    else if (c.localName === 'tbl') table(c);
                    else if (c.localName === 'sdt') { const sc = kid(c, 'sdtContent'); if (sc) block(sc); }
                });
            }
            const body = kid(parse(docXml).documentElement, 'body');
            if (!body) throw new Error('sin body');
            block(body);
            closeTo(0);
            const sect = kid(body, 'sectPr');
            const hfOf = async kind => {
                const ref = kids(sect, kind + 'Reference').find(r => (wattr(r, 'type') || 'default') === 'default');
                const rel = ref && rels[rattr(ref, 'id')];
                if (!rel) return '';
                const xml = await zipText(buffer, idx, 'word/' + rel.target.replace(/^\//, '').replace(/^(\.\.\/)+/, '').replace(/^word\//, ''));
                return xml ? hfText(parse(xml).documentElement) : '';
            };
            const mar = kid(sect, 'pgMar'), page = { ...pageDef };
            ['top', 'right', 'bottom', 'left'].forEach(k => {
                const v = parseInt(wattr(mar, k) || '', 10);
                if (!isNaN(v) && v >= 0) page['m' + k.charAt(0)] = Math.round(v / 5.67) / 10;   // mm
            });
            return { html: out || '<p><br></p>', header: await hfOf('header'), footer: await hfOf('footer'), page };
        }
        async function docxToHtml(buffer) { return (await docxToDoc(buffer)).html; }

        // ============================================
        // WORD TAL CUAL (docx-preview) DENTRO DE LA HOJA + CONVERSIÓN PDF -> WORD
        // ============================================
        const docViewerPages = document.getElementById('docViewerPages');

        function toArrayBuffer(d) {
            if (d instanceof ArrayBuffer) return d;
            if (ArrayBuffer.isView(d)) return d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength);
            return new Uint8Array(d).buffer;
        }
        async function readStoredBuffer(file) {
            if (!(window.store && window.store.readDocument)) throw new Error('Los documentos importados solo se pueden abrir desde la aplicación de escritorio');
            const r = await window.store.readDocument(file.stored);
            if (!r || !r.ok) throw new Error((r && r.error) || 'No se pudo leer el documento');
            return toArrayBuffer(r.data);
        }
        function ensurePdfJs() {
            const lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
            if (!lib) throw new Error('pdf.js no está cargado (falta vendor/js/pdf.min.js)');
            window.pdfjsLib = lib;
            lib.GlobalWorkerOptions.workerSrc = 'vendor/js/pdf.worker.min.js';
            return lib;
        }

        function setViewerMode(on) {
            docEditorPanel.classList.toggle('view-mode', on);
            docEditorTitle.contentEditable = on ? 'false' : 'true';
            docActionsSave.style.display = on ? 'none' : '';
            docActionsSaveAs.style.display = on ? 'none' : '';
            if (docActionsDownload.parentElement) docActionsDownload.parentElement.style.display = on ? 'none' : '';
        }
        function teardownViewer() {
            docViewerToken++;
            docViewerState = null;
            docViewerPages.textContent = '';
        }

        async function openDocViewer(file) {
            if (file.ext !== 'docx') { openAttachment(file); return; }
            if (isEditorHidden) {
                showConfirmModal({
                    title: 'Documento minimizado',
                    message: 'Tienes un documento minimizado. Debes cerrarlo o guardarlo antes de abrir otro.',
                    cancelText: 'Cancelar', deleteText: 'Abrir el minimizado',
                    onConfirm: () => { showDocEditor(); }
                });
                return;
            }
            teardownViewer();
            const token = ++docViewerToken;
            currentEditorFileId = file.id;
            docEditorPages.textContent = '';
            docEditorTitle.textContent = file.title || '';
            setViewerMode(true);
            docViewerPages.className = 'doc-viewer-pages';
            docViewerPages.innerHTML = loaderHtml('Cargando documento…', 'doc-view-loading');
            docEditorBody.scrollTop = 0;
            docEditorOverlay.classList.add('open');
            docEditorPanel.classList.add('open');
            docViewerState = { file, kind: 'docx', token };
            if (!docEditorResizeObserver) {
                docEditorResizeObserver = new ResizeObserver(() => {
                    if (docEditorPanel.classList.contains('open')) { fitPagesToWidth(); updateEditorCustomScrollbar(); }
                });
                docEditorResizeObserver.observe(docEditorBody);
            }
            const st = docViewerState;
            try {
                const buf = await readStoredBuffer(file);
                if (token !== docViewerToken) return;
                await renderDocxViewer(st, buf);
                if (token === docViewerToken) updateEditorCustomScrollbar();
            } catch (err) {
                if (token !== docViewerToken) return;
                console.error('Visor Word:', err);
                closeDocEditor();
                showToast('No se pudo mostrar el documento aquí; se abre con tu programa de Word.');
                openAttachment(file);
            }
        }

        async function renderDocxViewer(st, buf) {
            if (!(window.docx && window.docx.renderAsync && window.JSZip)) throw new Error('docx-preview no está cargado (faltan vendor/js/jszip.min.js y docx-preview.min.js)');
            const holder = document.createElement('div');
            holder.className = 'doc-view-docx';
            docViewerPages.textContent = '';
            docViewerPages.appendChild(holder);
            await window.docx.renderAsync(buf, holder, holder, {
                className: 'docx', inWrapper: true, ignoreWidth: false, ignoreHeight: false, ignoreFonts: false,
                breakPages: true, ignoreLastRenderedPageBreak: true, renderHeaders: true, renderFooters: true,
                renderFootnotes: true, renderEndnotes: true, useBase64URL: true, experimental: false, trimXmlDeclaration: true
            });
            if (docViewerState !== st) return;
            layoutViewer();
        }

        // Ajusta el ancho de las hojas del Word al panel
        function layoutViewer() {
            if (!docViewerState) return;
            const wrap = docViewerPages.querySelector('.docx-wrapper');
            if (wrap) {
                wrap.style.zoom = '';
                let maxW = 0;
                wrap.querySelectorAll('section.docx').forEach(s => { maxW = Math.max(maxW, s.offsetWidth); });
                const z = maxW > 0 ? Math.min(1, (docEditorBody.clientWidth - 20) / maxW) : 1;
                wrap.style.zoom = z;
            }
            updateEditorCustomScrollbar();
        }

        // ---------- Botones del visor de Word ----------
        document.getElementById('docViewWordBtn').addEventListener('click', () => { if (docViewerState) editInWord(docViewerState.file); });
        // Crea una COPIA editable (márgenes, fuentes, tamaños, interlineado, tablas, imágenes, cabecera y pie del Word);
        // el Word original y su visor no cambian
        document.getElementById('docViewConvertBtn').addEventListener('click', async () => {
            if (!docViewerState) return;
            const f = docViewerState.file;
            const endBusy = busyStart('Creando la copia editable…', 0);
            try {
                const r = await docxToDoc(await readStoredBuffer(f));
                const now = Date.now();
                let id = now; while (files.some(x => x.id === id)) id++;
                const rec = {
                    id, title: ((f.title || 'Documento') + ' (editable)').slice(0, 200), description: '',
                    content: sanitizeDocContent(r.html), header: r.header || '', footer: r.footer || '',
                    folderId: (f.folderId !== undefined ? f.folderId : null), createdAt: now, updatedAt: now
                };
                const ps = cleanPageStyle(r.page);
                if (ps) rec.pageStyle = ps;
                files.push(rec);
                if (!safeSave('calendarFiles', files)) return;
                renderDocuments();
                openDocEditor(rec);
                showToast('Copia editable creada; el Word original no ha cambiado', 'ok', { label: 'Deshacer', fn: undo });
            } catch (err) {
                console.error(err);
                showToast('No se pudo crear la copia editable');
            } finally { endBusy(); }
        });

        // ---------- Editar en Word de verdad y ver los cambios aquí ----------
        // main.js vigila el archivo abierto fuera de la app; al guardarse en Word llega 'doc:changed' y se refresca la vista.
        async function editInWord(file) {
            if (!(window.store && window.store.openDocument)) { showToast('Solo disponible en la aplicación de escritorio'); return; }
            try {
                const r = await window.store.openDocument(file.stored);
                if (!r || !r.ok) { showToast((r && r.error) || 'No se pudo abrir el documento'); return; }
                showToast('Abierto en Word. Cuando guardes allí, este documento se actualiza solo.', 'ok');
            } catch (err) { console.error(err); showToast('No se pudo abrir el documento'); }
        }
        async function readStoredBufferRetry(file, tries = 6) {
            let lastErr;
            for (let k = 0; k < tries; k++) {
                try { return await readStoredBuffer(file); }
                catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 500)); }   // Word puede tener el archivo bloqueado un instante al guardar
            }
            throw lastErr;
        }
        const extChangeBusy = {};
        async function onExternalDocChange(p) {
            if (!p || !p.stored) return;
            const f = files.find(x => x.stored === p.stored);
            if (!f || f.ext !== 'docx' || extChangeBusy[f.id]) return;
            extChangeBusy[f.id] = true;
            try {
                const buf = await readStoredBufferRetry(f);
                f.size = buf.byteLength;
                lastSnap = snapState();      // no cuenta como cambio para Deshacer
                persistToFile();
                indexAttachmentText(f.id, buf.slice(0), 'docx');
                const name = '"' + (f.title || 'Documento') + '"';
                if (docViewerState && docViewerState.file.id === f.id) {
                    const st = docViewerState, sc = docEditorBody.scrollTop;
                    await renderDocxViewer(st, buf.slice(0));
                    docEditorBody.scrollTop = sc;
                    updateEditorCustomScrollbar();
                    showToast('Documento actualizado desde Word', 'ok');
                } else if (f.inApp) {
                    showToast(name + ' se guardó en Word. Tu versión editable antigua no cambia.', 'ok');
                } else {
                    showToast(name + ' actualizado desde Word', 'ok');
                }
            } catch (err) {
                console.warn('No se pudo actualizar el documento tras guardarlo en Word', err);
            } finally { delete extChangeBusy[f.id]; }
        }
        if (window.store && window.store.onDocumentChanged) window.store.onDocumentChanged(onExternalDocChange);

        // ---------- Visor PDF a pantalla completa (ocupa solo la ventana de la app) ----------
        function setPdfFullscreen(on) {
            document.getElementById('pdfViewerPanel').classList.toggle('fullscreen', on);
            document.getElementById('pdfViewerFullscreen').innerHTML = on ? '<i class="fi fi-br-compress"></i>' : '<i class="fi fi-br-expand"></i>';
        }
        document.getElementById('pdfViewerFullscreen').addEventListener('click', () => {
            setPdfFullscreen(!document.getElementById('pdfViewerPanel').classList.contains('fullscreen'));
        });

        // ---------- Texto plano de un adjunto, para que la búsqueda de Documentos lo encuentre ----------
        async function attachmentPlainText(buf, ext) {
            let t = '';
            if (ext === 'pdf') {
                const lib = ensurePdfJs();
                const pdf = await lib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
                try {
                    for (let n = 1; n <= pdf.numPages && t.length < 300000; n++) {
                        const pg = await pdf.getPage(n);
                        const tc = await pg.getTextContent();
                        t += tc.items.map(i => i.str).join(' ') + ' ';
                        pg.cleanup();
                        if (n % 10 === 0) await new Promise(r => setTimeout(r, 0));
                    }
                } finally { pdf.destroy(); }
            } else if (ext === 'docx') {
                t = new DOMParser().parseFromString((await docxToHtml(buf)).replace(/<\/(td|th|tr|p|li|h[1-6])>/gi, '$& '), 'text/html').body.textContent || '';
            }
            return t.replace(/\s+/g, ' ').trim().slice(0, 300000);
        }
        async function indexAttachmentText(id, buf, ext) {
            try {
                const t = await attachmentPlainText(buf, ext);
                const i = files.findIndex(f => f.id === id);
                if (i === -1 || !t) return;
                files[i].searchText = t;
                lastSnap = snapState();      // no cuenta como cambio para Deshacer
                persistToFile();
            } catch (err) { console.warn('No se pudo indexar el texto del documento', err); }
        }

        // ============================================
        // VISOR DE PDF PROPIO (pdf.js): controles flotantes a un lado y scroll personalizado
        // ============================================
        let pdfViewerFile = null;
        const pdfv = { pdf: null, pages: [], token: 0, zoom: 1, fit: 'auto', blob: null, cur: 1, raf: 0 };
        const pdfScroll = document.getElementById('pdfScroll');
        const pdfPagesEl = document.getElementById('pdfPages');
        const pdfPageInput = document.getElementById('pdfPageInput');
        const PDF_ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
        const PDF_PX = 96 / 72;     // 100% = tamaño natural del PDF (un A4 mide ~794 px)

        function pdfFitZoom(mode) {
            if (!pdfv.pages.length) return 1;
            const maxW = Math.max(...pdfv.pages.map(p => p.wpt));
            const fit = mode === 'width'
                ? (pdfScroll.clientWidth - 0.5) / (maxW * PDF_PX)          // todo el ancho, sin márgenes
                : (pdfScroll.clientWidth - 64) / (maxW * PDF_PX);
            return Math.max(0.25, Math.min(4, mode === 'auto' ? Math.min(1, fit) : fit));
        }
        function pdfLayout(keepCenter) {
            const sH = pdfScroll.scrollHeight, cH = pdfScroll.clientHeight, sW = pdfScroll.scrollWidth, cW = pdfScroll.clientWidth;
            const fracY = sH > 0 ? (pdfScroll.scrollTop + cH / 2) / sH : 0;
            const fracX = sW > 0 ? (pdfScroll.scrollLeft + cW / 2) / sW : 0.5;
            pdfv.pages.forEach(p => {
                p.el.style.width = Math.round(p.wpt * PDF_PX * pdfv.zoom) + 'px';
                p.el.style.height = Math.round(p.hpt * PDF_PX * pdfv.zoom) + 'px';
            });
            if (keepCenter) {
                pdfScroll.scrollTop = fracY * pdfScroll.scrollHeight - cH / 2;
                pdfScroll.scrollLeft = fracX * pdfScroll.scrollWidth - cW / 2;
            }
            pdfScroll.classList.toggle('fitted', pdfv.fit === 'width');
            pdfShowZoom();
            pdfScheduleUpdate();
        }
        function pdfShowZoom() {
            const el = document.getElementById('pdfZoomVal');
            if (document.activeElement !== el) el.value = Math.round(pdfv.zoom * 100) + '%';
        }
        function pdfSetZoom(z, keepCenter = true) {
            pdfv.zoom = Math.max(0.25, Math.min(4, z));
            pdfLayout(keepCenter);
        }
        function pdfZoomStep(dir) {
            const z = pdfv.zoom;
            const next = dir > 0 ? PDF_ZOOMS.find(v => v > z * 1.001) : PDF_ZOOMS.slice().reverse().find(v => v < z / 1.001);
            if (!next) return;
            pdfv.fit = null;
            pdfSetZoom(next);
        }
        function pdfGoTo(n) {
            if (!pdfv.pages.length) return;
            n = Math.max(1, Math.min(pdfv.pages.length, n | 0));
            const el = pdfv.pages[n - 1].el;
            pdfScroll.scrollTop = el.getBoundingClientRect().top - pdfScroll.getBoundingClientRect().top + pdfScroll.scrollTop - 16;
            pdfScheduleUpdate();
        }

        function pdfScheduleUpdate() {
            if (pdfv.raf) return;
            pdfv.raf = requestAnimationFrame(() => { pdfv.raf = 0; pdfRenderVisible(); pdfUpdateCurrent(); pdfUpdateScrollbar(); });
        }
        function pdfUpdateCurrent() {
            if (!pdfv.pages.length) return;
            const sr = pdfScroll.getBoundingClientRect();
            const mid = sr.top + sr.height * 0.35;
            let cur = pdfv.pages.length;
            for (let i = 0; i < pdfv.pages.length; i++) {
                if (pdfv.pages[i].el.getBoundingClientRect().bottom > mid) { cur = i + 1; break; }
            }
            pdfv.cur = cur;
            if (document.activeElement !== pdfPageInput) pdfPageInput.value = cur;
        }
        function pdfRenderVisible() {
            if (!pdfv.pdf) return;
            const sr = pdfScroll.getBoundingClientRect();
            const margin = Math.max(400, sr.height * 1.2);
            pdfv.pages.forEach(p => {
                const r = p.el.getBoundingClientRect();
                const near = r.bottom > sr.top - margin && r.top < sr.bottom + margin;
                const far = r.bottom < sr.top - margin * 3 || r.top > sr.bottom + margin * 3;
                const w = Math.round(p.wpt * PDF_PX * pdfv.zoom);
                if (near && !p.busy && (p.state === 0 || (p.state === 2 && p.renderedW !== w))) pdfDrawPage(p);
                else if (far && p.state === 2 && !p.busy) pdfReleasePage(p);
            });
        }
        function pdfReleasePage(p) {
            p.gen++;
            if (p.task) { try { p.task.cancel(); } catch (e) { } p.task = null; }
            p.el.textContent = '';
            p.state = 0;
        }
        async function pdfDrawPage(p) {
            const doc = pdfv.pdf;
            if (!doc || p.busy) return;
            p.busy = true;
            const gen = ++p.gen;
            const wCss = Math.round(p.wpt * PDF_PX * pdfv.zoom);
            try {
                const page = await doc.getPage(p.n);
                if (pdfv.pdf !== doc || gen !== p.gen) return;
                const s = wCss / page.getViewport({ scale: 1 }).width;
                const vpText = page.getViewport({ scale: s });
                let q = Math.min(window.devicePixelRatio || 1, 2);
                const area = vpText.width * vpText.height * q * q;
                if (area > 16e6) q *= Math.sqrt(16e6 / area);          // límite de memoria en zooms muy altos
                const vp = page.getViewport({ scale: s * q });
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.floor(vp.width));
                canvas.height = Math.max(1, Math.floor(vp.height));
                p.task = page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport: vp });
                await p.task.promise;
                if (pdfv.pdf !== doc || gen !== p.gen) return;
                const tc = await page.getTextContent();
                if (pdfv.pdf !== doc || gen !== p.gen) return;
                p.el.textContent = '';
                p.el.appendChild(canvas);
                p.el.appendChild(buildPdfTextLayer(tc, vpText));
                p.state = 2;
                p.renderedW = wCss;
                page.cleanup();
            } catch (err) {
                if (!(err && err.name === 'RenderingCancelledException')) { console.warn('Página ' + p.n + ' del PDF:', err); p.state = 3; }
            } finally {
                p.busy = false;
                p.task = null;
                pdfScheduleUpdate();
            }
        }

        // Capa de texto transparente para poder seleccionar y copiar
        let pdfTextCtx = null;
        function buildPdfTextLayer(tc, vp) {
            const layer = document.createElement('div');
            layer.className = 'pdf-text-layer';
            if (!pdfTextCtx) pdfTextCtx = document.createElement('canvas').getContext('2d');
            const Util = window.pdfjsLib.Util;
            const frag = document.createDocumentFragment();
            tc.items.forEach(it => {
                if (!it.str || !it.str.trim()) return;
                const tx = Util.transform(vp.transform, it.transform);
                const fh = Math.hypot(tx[2], tx[3]);
                if (!fh || !isFinite(fh)) return;
                const span = document.createElement('span');
                span.textContent = it.str;
                span.style.fontSize = fh + 'px';
                span.style.left = tx[4] + 'px';
                span.style.top = (tx[5] - fh * 0.85) + 'px';
                pdfTextCtx.font = fh + 'px sans-serif';
                const mw = pdfTextCtx.measureText(it.str).width;
                const target = it.width * vp.scale;
                const sx = (mw > 0 && target > 0) ? target / mw : 1;
                const ang = Math.atan2(tx[1], tx[0]);
                span.style.transform = (ang ? 'rotate(' + ang + 'rad) ' : '') + 'scaleX(' + sx + ')';
                frag.appendChild(span);
            });
            layer.appendChild(frag);
            return layer;
        }

        // ---------- Scroll personalizado ----------
        const pdfBar = document.getElementById('pdfScrollbar'), pdfThumb = document.getElementById('pdfScrollbarThumb'), pdfStage = document.getElementById('pdfStage');
        let pdfBarHide = null, pdfBarDrag = null;
        const pdfHideBarLater = () => { clearTimeout(pdfBarHide); pdfBarHide = setTimeout(() => pdfBar.classList.remove('visible'), 1500); };
        function pdfUpdateScrollbar() {
            const sH = pdfScroll.scrollHeight, cH = pdfScroll.clientHeight, max = sH - cH;
            if (max <= 0) { pdfBar.classList.remove('visible'); return; }
            const th = Math.max(40, cH / sH * cH);
            pdfThumb.style.height = th + 'px';
            pdfThumb.style.top = (pdfScroll.scrollTop / max * (cH - th)) + 'px';
            pdfBar.classList.add('visible');
            if (!pdfBarDrag) pdfHideBarLater();
        }
        pdfThumb.addEventListener('mousedown', (e) => {
            pdfBarDrag = { y: e.clientY, s: pdfScroll.scrollTop };
            pdfThumb.classList.add('dragging');
            clearTimeout(pdfBarHide);
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!pdfBarDrag) return;
            const max = pdfScroll.scrollHeight - pdfScroll.clientHeight;
            const track = pdfScroll.clientHeight - pdfThumb.offsetHeight;
            if (track <= 0) return;
            pdfScroll.scrollTop = pdfBarDrag.s + (e.clientY - pdfBarDrag.y) / track * max;
        });
        document.addEventListener('mouseup', () => {
            if (!pdfBarDrag) return;
            pdfBarDrag = null;
            pdfThumb.classList.remove('dragging');
            pdfHideBarLater();
        });
        pdfStage.addEventListener('mousemove', (e) => {
            if (pdfBarDrag) return;
            if (e.clientX > pdfStage.getBoundingClientRect().right - 24) { pdfBar.classList.add('visible'); clearTimeout(pdfBarHide); }
        });
        pdfStage.addEventListener('mouseleave', () => { if (!pdfBarDrag) pdfHideBarLater(); });

        pdfScroll.addEventListener('scroll', pdfScheduleUpdate, { passive: true });
        pdfScroll.addEventListener('wheel', (e) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();
            pdfv.fit = null;
            pdfSetZoom(pdfv.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
        }, { passive: false });
        pdfScroll.addEventListener('keydown', (e) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            if (e.key === '+' || e.key === '=') { e.preventDefault(); pdfZoomStep(1); }
            else if (e.key === '-') { e.preventDefault(); pdfZoomStep(-1); }
            else if (e.key === '0') { e.preventDefault(); pdfv.fit = 'auto'; pdfSetZoom(pdfFitZoom('auto')); }
        });
        new ResizeObserver(() => {
            if (!pdfv.pdf) return;
            if (pdfv.fit) { pdfv.zoom = pdfFitZoom(pdfv.fit); pdfLayout(true); } else pdfScheduleUpdate();
        }).observe(pdfScroll);

        // ---------- Controles flotantes ----------
        document.getElementById('pdfZoomIn').addEventListener('click', () => pdfZoomStep(1));
        document.getElementById('pdfZoomOut').addEventListener('click', () => pdfZoomStep(-1));
        // Zoom escrito a mano: 25–400 + Intro (flechas arriba/abajo: siguiente nivel)
        const pdfZoomEl = document.getElementById('pdfZoomVal');
        pdfZoomEl.addEventListener('focus', () => { pdfZoomEl.value = String(Math.round(pdfv.zoom * 100)); pdfZoomEl.select(); });
        pdfZoomEl.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                const v = parseFloat(pdfZoomEl.value.replace(',', '.').replace('%', ''));
                if (isFinite(v) && v > 0) { pdfv.fit = null; pdfSetZoom(v / 100); }
                pdfZoomEl.blur(); pdfScroll.focus({ preventScroll: true });
            } else if (e.key === 'Escape') {
                pdfZoomEl.blur(); pdfScroll.focus({ preventScroll: true });
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                pdfZoomStep(e.key === 'ArrowUp' ? 1 : -1);
                pdfZoomEl.value = String(Math.round(pdfv.zoom * 100)); pdfZoomEl.select();
            }
        });
        pdfZoomEl.addEventListener('blur', pdfShowZoom);
        document.getElementById('pdfFit').addEventListener('click', () => { pdfv.fit = 'width'; pdfSetZoom(pdfFitZoom('width')); });
        pdfPageInput.addEventListener('focus', () => pdfPageInput.select());
        pdfPageInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { pdfGoTo(parseInt(pdfPageInput.value, 10) || pdfv.cur); pdfPageInput.blur(); pdfScroll.focus({ preventScroll: true }); }
            else if (e.key === 'Escape') { pdfPageInput.value = pdfv.cur; pdfPageInput.blur(); pdfScroll.focus({ preventScroll: true }); }
        });
        pdfPageInput.addEventListener('blur', () => { pdfPageInput.value = pdfv.cur; });
        document.getElementById('pdfDownload').addEventListener('click', () => {
            if (!pdfv.blob || !pdfViewerFile) return;
            let name = String(pdfViewerFile.origName || pdfViewerFile.title || 'documento').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'documento';
            if (!/\.pdf$/i.test(name)) name += '.pdf';
            const url = URL.createObjectURL(pdfv.blob);
            const a = document.createElement('a');
            a.href = url; a.download = name;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        });

        // ---------- Abrir / cerrar ----------
        function pdfResetDoc() {
            pdfv.pages.forEach(p => { if (p.task) { try { p.task.cancel(); } catch (e) { } } });
            if (pdfv.pdf) { try { pdfv.pdf.destroy(); } catch (e) { } }
            pdfv.pdf = null; pdfv.pages = []; pdfv.blob = null; pdfv.cur = 1;
            pdfPagesEl.textContent = '';
        }
        async function openPdfViewer(file) {
            if (!(window.store && window.store.readDocument)) { openAttachment(file); return; }
            const token = ++pdfv.token;
            pdfResetDoc();
            pdfViewerFile = file;
            document.getElementById('pdfViewerTitle').textContent = file.title || 'PDF';
            pdfPagesEl.innerHTML = loaderHtml('Cargando PDF…', 'doc-view-loading');
            pdfScroll.scrollTop = 0; pdfScroll.scrollLeft = 0;
            pdfPageInput.value = 1;
            document.getElementById('pdfPageTotal').textContent = '–';
            document.getElementById('pdfViewerOverlay').classList.add('open');
            document.getElementById('pdfViewerPanel').classList.add('open');
            try {
                const buf = await readStoredBuffer(file);
                if (token !== pdfv.token) return;
                const blob = new Blob([buf], { type: 'application/pdf' });
                const lib = ensurePdfJs();
                const pdf = await lib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
                if (token !== pdfv.token) { pdf.destroy(); return; }
                pdfv.pdf = pdf; pdfv.blob = blob;
                const first = await pdf.getPage(1);
                const v1 = first.getViewport({ scale: 1 });
                pdfPagesEl.textContent = '';
                const frag = document.createDocumentFragment();
                for (let n = 1; n <= pdf.numPages; n++) {
                    const el = document.createElement('div');
                    el.className = 'pdf-page';
                    frag.appendChild(el);
                    pdfv.pages.push({ n, el, wpt: v1.width, hpt: v1.height, state: 0, busy: false, gen: 0, renderedW: 0, task: null });
                }
                pdfPagesEl.appendChild(frag);
                document.getElementById('pdfPageTotal').textContent = pdf.numPages;
                pdfv.fit = 'auto';
                pdfv.zoom = pdfFitZoom('auto');
                pdfLayout(false);
                pdfScroll.focus({ preventScroll: true });
                // Tamaño real de cada página (por si no todas son iguales), sin bloquear la interfaz
                (async () => {
                    let changed = false;
                    for (let n = 2; n <= pdf.numPages; n++) {
                        if (pdfv.pdf !== pdf) return;
                        try {
                            const pg = await pdf.getPage(n);
                            const v = pg.getViewport({ scale: 1 });
                            const p = pdfv.pages[n - 1];
                            if (Math.abs(v.width - p.wpt) > 0.5 || Math.abs(v.height - p.hpt) > 0.5) { p.wpt = v.width; p.hpt = v.height; changed = true; }
                            pg.cleanup();
                        } catch (e) { }
                        if (n % 30 === 0) {
                            await new Promise(res => setTimeout(res, 0));
                            if (changed && pdfv.pdf === pdf) { pdfLayout(true); changed = false; }
                        }
                    }
                    if (changed && pdfv.pdf === pdf) pdfLayout(true);
                })();
            } catch (err) {
                if (token !== pdfv.token) return;
                console.error('Visor PDF:', err);
                closePdfViewer();
                showToast(err && err.name === 'PasswordException' ? 'Este PDF tiene contraseña; se abre con tu programa.' : 'No se pudo mostrar el PDF aquí; se abre con tu programa.');
                openAttachment(file);
            }
        }
        function closePdfViewer() {
            pdfv.token++;
            document.getElementById('pdfViewerOverlay').classList.remove('open');
            document.getElementById('pdfViewerPanel').classList.remove('open');
            setTimeout(() => {
                if (document.getElementById('pdfViewerPanel').classList.contains('open')) return;
                pdfResetDoc();
                pdfViewerFile = null;
                setPdfFullscreen(false);
            }, 450);
        }
        document.getElementById('pdfViewerClose').addEventListener('click', closePdfViewer);
        document.getElementById('pdfViewerOverlay').addEventListener('click', closePdfViewer);
        document.getElementById('pdfViewerOpenWith').addEventListener('click', () => { if (pdfViewerFile) openAttachmentWith(pdfViewerFile); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.getElementById('pdfViewerPanel').classList.contains('open')) closePdfViewer();
        });

        // ---------- Ubicación -> Google Maps ----------
        function openInGoogleMaps(place) {
            const url = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(place);
            if (window.store && window.store.openExternal) window.store.openExternal(url);
            else window.open(url, '_blank', 'noopener');
        }

        // ============================================
        // AUTOCOMPLETAR UBICACIONES
        // Lugares ya usados + sugerencias de OpenStreetMap (Photon), como en Google Maps
        // ============================================
        const acNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        function placeFromProps(p) {
            if (!p || typeof p !== 'object') return null;
            const str = v => (typeof v === 'string' ? v.trim() : '');
            const street = [str(p.street), str(p.housenumber)].filter(Boolean).join(' ');
            const name = str(p.name);
            const place = str(p.city) || str(p.town) || str(p.village) || str(p.locality) || str(p.district) || str(p.county);
            const title = name || street || place || str(p.state) || str(p.country);
            if (!title) return null;
            const subParts = [];
            if (name && street) subParts.push(street);
            if (place && place !== title) subParts.push(place);
            if (str(p.state) && str(p.state) !== place && str(p.state) !== title) subParts.push(str(p.state));
            if (str(p.country)) subParts.push(str(p.country));
            const valueParts = [title];
            if (name && street) valueParts.push(street);
            if (place && place !== title) valueParts.push(place);
            return { title, sub: subParts.join(', '), value: valueParts.join(', ').slice(0, 200), hist: false };
        }

        function attachLocationAutocomplete(input) {
            const wrap = input.closest('.location-wrap');
            if (!wrap) return;
            const box = document.createElement('div');
            box.className = 'loc-suggest';
            box.style.display = 'none';
            wrap.appendChild(box);
            let items = [], active = -1, seq = 0, timer = null;
            const cache = new Map();

            function history(q) {
                const counts = new Map();
                events.forEach(e => { if (e.location) counts.set(e.location, (counts.get(e.location) || 0) + 1); });
                templates.forEach(t => { if (t.location) counts.set(t.location, (counts.get(t.location) || 0) + 1); });
                const nq = acNorm(q);
                return [...counts.entries()]
                    .filter(([v]) => !nq || acNorm(v).includes(nq))
                    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
                    .map(([v]) => ({ title: v, sub: '', value: v, hist: true }));
            }
            async function fetchPlaces(q) {
                const key = acNorm(q);
                if (cache.has(key)) return cache.get(key);
                let props = [];
                if (window.store && window.store.suggestPlaces) {
                    const r = await window.store.suggestPlaces(q);
                    if (!r || !r.ok) throw new Error('sin respuesta');
                    props = r.features || [];
                } else {
                    const r = await fetch('https://photon.komoot.io/api/?limit=6&q=' + encodeURIComponent(q));
                    const j = await r.json();
                    props = (j.features || []).map(f => f.properties || {});
                }
                const out = [], seen = new Set();
                props.forEach(p => {
                    const it = placeFromProps(p);
                    if (it && !seen.has(acNorm(it.value))) { seen.add(acNorm(it.value)); out.push(it); }
                });
                cache.set(key, out);
                if (cache.size > 60) cache.delete(cache.keys().next().value);
                return out;
            }
            function hide() { box.style.display = 'none'; items = []; active = -1; seq++; }
            function paint() {
                Array.from(box.querySelectorAll('.loc-suggest-item')).forEach((r, i) => r.classList.toggle('active', i === active));
            }
            function choose(i) {
                const it = items[i];
                if (!it) return;
                input.value = it.value;
                hide();
            }
            function render() {
                box.textContent = '';
                if (!items.length) { box.style.display = 'none'; return; }
                items.forEach((it, i) => {
                    const row = document.createElement('div');
                    row.className = 'loc-suggest-item' + (i === active ? ' active' : '');
                    const ic = document.createElement('i');
                    ic.className = 'fas ' + (it.hist ? 'fa-clock-rotate-left' : 'fa-location-dot');
                    const txt = document.createElement('div');
                    txt.className = 'loc-suggest-text';
                    const t = document.createElement('div');
                    t.className = 'loc-suggest-title'; t.textContent = it.title;
                    txt.appendChild(t);
                    if (it.sub) { const s = document.createElement('div'); s.className = 'loc-suggest-sub'; s.textContent = it.sub; txt.appendChild(s); }
                    row.appendChild(ic); row.appendChild(txt);
                    row.addEventListener('mousedown', (e) => { e.preventDefault(); choose(i); });
                    row.addEventListener('mousemove', () => { if (active !== i) { active = i; paint(); } });
                    box.appendChild(row);
                });
                if (items.some(it => !it.hist)) {
                    const foot = document.createElement('div');
                    foot.className = 'loc-suggest-foot';
                    foot.textContent = 'Datos © OpenStreetMap';
                    box.appendChild(foot);
                }
                box.style.display = 'block';
                box.scrollIntoView({ block: 'nearest' });
            }
            async function update() {
                const q = input.value.trim();
                const my = ++seq;
                const hist = history(q);
                if (q.length < 2) { items = hist.slice(0, 5); active = -1; render(); return; }
                const histItems = hist.slice(0, 2);
                items = histItems.slice(); active = -1; render();       // lo guardado aparece al instante
                let places = [];
                try { places = await fetchPlaces(q); } catch (e) { places = []; }
                if (my !== seq) return;
                const have = new Set(histItems.map(h => acNorm(h.value)));
                const rest = places.filter(p => !have.has(acNorm(p.value)));
                const more = places.length ? [] : hist.slice(2, 5);      // sin red: más lugares guardados
                items = [...histItems, ...rest.slice(0, 5 - histItems.length), ...more].slice(0, 5);
                active = -1;
                render();
            }
            input.addEventListener('input', () => {
                clearTimeout(timer);
                const q = input.value.trim();
                seq++;                                           // descarta la consulta anterior
                items = history(q).slice(0, q.length < 2 ? 5 : 2);   // al instante, con lo ya guardado
                active = -1; render();
                if (q.length >= 2) timer = setTimeout(update, 250);
            });
            input.addEventListener('focus', () => { clearTimeout(timer); update(); });
            input.addEventListener('blur', () => { clearTimeout(timer); setTimeout(hide, 150); });
            input.addEventListener('keydown', (e) => {
                const open = box.style.display !== 'none' && items.length;
                if (!open) return;
                if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; paint(); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; paint(); }
                else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(active); }
                else if (e.key === 'Escape') { e.stopPropagation(); hide(); }
            });
        }
        attachLocationAutocomplete(document.getElementById('eventLocation'));

        // ============================================
        // AUTOCOMPLETAR NOMBRE DEL EVENTO (Nuevo y Editar)
        // Mientras se escribe, aparecen nombres ya usados en otros eventos (o plantillas) que coinciden
        // ============================================
        function attachTitleAutocomplete(input) {
            if (!input || !input.parentNode) return;
            const wrap = document.createElement('div');
            wrap.className = 'title-suggest-wrap';
            input.parentNode.insertBefore(wrap, input);
            wrap.appendChild(input);
            const box = document.createElement('div');
            box.className = 'loc-suggest';
            box.style.display = 'none';
            wrap.appendChild(box);
            input.setAttribute('autocomplete', 'off');
            let items = [], active = -1;

            function candidates(q) {
                const nq = acNorm(q.trim());
                if (!nq) return [];
                const map = new Map();
                const add = t => {
                    const title = String(t || '').trim();
                    if (!title) return;
                    const k = acNorm(title);
                    const cur = map.get(k);
                    if (cur) cur.count++; else map.set(k, { title, count: 1, key: k });
                };
                events.forEach(e => add(e.title));
                templates.forEach(t => add(t.title));
                return [...map.values()]
                    .filter(c => c.key.includes(nq) && c.key !== nq)
                    .sort((a, b) =>
                        (b.key.startsWith(nq) - a.key.startsWith(nq)) ||
                        b.count - a.count ||
                        a.title.localeCompare(b.title, 'es'))
                    .slice(0, 6);
            }
            function hide() { box.style.display = 'none'; items = []; active = -1; }
            function paint() {
                Array.from(box.querySelectorAll('.loc-suggest-item')).forEach((r, i) => r.classList.toggle('active', i === active));
            }
            function choose(i) {
                const it = items[i];
                if (!it) return;
                input.value = it.title;
                hide();
                input.dispatchEvent(new Event('input', { bubbles: true }));   // limpia el aviso de campo vacío
                hide();
            }
            function render(q) {
                box.textContent = '';
                if (!items.length) { box.style.display = 'none'; return; }
                const nq = acNorm(q.trim());
                items.forEach((it, i) => {
                    const row = document.createElement('div');
                    row.className = 'loc-suggest-item' + (i === active ? ' active' : '');
                    const ic = document.createElement('i');
                    ic.className = 'fas fa-clock-rotate-left';
                    const txt = document.createElement('div');
                    txt.className = 'loc-suggest-text';
                    const t = document.createElement('div');
                    t.className = 'loc-suggest-title';
                    const at = acNorm(it.title).indexOf(nq);
                    if (at >= 0 && acNorm(it.title).length === it.title.length) {
                        t.appendChild(document.createTextNode(it.title.slice(0, at)));
                        const b = document.createElement('span');
                        b.style.color = 'var(--primary-color, #3c6df0)';
                        b.textContent = it.title.slice(at, at + nq.length);
                        t.appendChild(b);
                        t.appendChild(document.createTextNode(it.title.slice(at + nq.length)));
                    } else t.textContent = it.title;
                    txt.appendChild(t);
                    row.appendChild(ic); row.appendChild(txt);
                    row.addEventListener('mousedown', (e) => { e.preventDefault(); choose(i); });
                    row.addEventListener('mousemove', () => { if (active !== i) { active = i; paint(); } });
                    box.appendChild(row);
                });
                box.style.display = 'block';
                box.scrollIntoView({ block: 'nearest' });
            }
            input.addEventListener('input', () => {
                items = candidates(input.value);
                active = -1;
                render(input.value);
            });
            input.addEventListener('blur', () => setTimeout(hide, 150));
            input.addEventListener('keydown', (e) => {
                const open = box.style.display !== 'none' && items.length;
                if (!open) return;
                if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; paint(); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; paint(); }
                else if ((e.key === 'Enter' || e.key === 'Tab') && active >= 0) { e.preventDefault(); choose(active); }
                else if (e.key === 'Escape') { e.stopPropagation(); hide(); }
            });
        }
        attachTitleAutocomplete(document.getElementById('eventTitle'));

        // ============================================
        // DOCUMENTOS ADJUNTOS A EVENTOS
        // ============================================
        let eventDocIds = [];
        const MAX_EVENT_DOCS = 20;
        const evDocPicker = document.getElementById('eventDocPicker');
        const evDocPickerSearch = document.getElementById('eventDocPickerSearch');
        const evDocPickerList = document.getElementById('eventDocPickerList');

        function docIconClass(f) {
            if (f.kind === 'attachment') return f.ext === 'pdf' ? 'fa-solid fa-file-pdf ic-pdf' : 'fa-solid fa-file-word ic-word';
            return 'fa-solid fa-file-lines ic-note';
        }
        function folderPathName(folderId) {
            const parts = [];
            let cur = folders.find(f => f.id === folderId), guard = 0;
            while (cur && guard++ < 30) { parts.unshift(cur.name); cur = folders.find(f => f.id === cur.parentId); }
            return parts.join(' / ');
        }
        function renderEventDocs() {
            eventDocIds = eventDocIds.filter(id => files.some(f => f.id === id));
            const list = document.getElementById('eventDocsList');
            list.textContent = '';
            if (!eventDocIds.length) {
                const none = document.createElement('span');
                none.className = 'event-docs-empty';
                none.textContent = 'Sin documentos adjuntos';
                list.appendChild(none);
            }
            eventDocIds.forEach(id => {
                const f = files.find(x => x.id === id);
                if (!f) return;
                const chip = document.createElement('span');
                chip.className = 'ev-doc-chip';
                const ic = document.createElement('i'); ic.className = docIconClass(f);
                const nm = document.createElement('span'); nm.textContent = f.title || 'Documento'; nm.title = f.title || 'Documento';
                const x = document.createElement('span');
                x.className = 'ev-doc-x'; x.setAttribute('role', 'button'); x.title = 'Quitar'; x.innerHTML = '<i class="fas fa-xmark"></i>';
                x.addEventListener('click', () => { eventDocIds = eventDocIds.filter(i => i !== id); renderEventDocs(); });
                chip.appendChild(ic); chip.appendChild(nm); chip.appendChild(x);
                list.appendChild(chip);
            });
        }
        // Selección temporal: solo se guarda en el evento al pulsar "Aceptar"
        let pickerDocIds = [];

        function renderEventDocPicker() {
            const q = acNorm(evDocPickerSearch.value.trim());
            const rows = files.map(f => ({ f, path: folderPathName(f.folderId) }))
                .filter(r => !q || acNorm(r.f.title).includes(q) || acNorm(r.path).includes(q))
                .sort((a, b) =>
                    (a.f.title || '').localeCompare(b.f.title || '', 'es', { numeric: true, sensitivity: 'base' }) ||
                    a.path.localeCompare(b.path, 'es'));
            const keep = evDocPickerList.scrollTop;
            evDocPickerList.textContent = '';
            if (!rows.length) {
                const empty = document.createElement('div');
                empty.className = 'ev-pick-empty';
                empty.textContent = files.length ? 'Ningún documento coincide con la búsqueda.' : 'Aún no tienes documentos. Crea o importa uno desde el panel de Documentos.';
                evDocPickerList.appendChild(empty);
                return;
            }
            rows.forEach(({ f, path }) => {
                const row = document.createElement('div');
                row.className = 'ev-pick-row' + (pickerDocIds.includes(f.id) ? ' selected' : '');
                row.setAttribute('role', 'button'); row.tabIndex = 0;
                const ic = document.createElement('i'); ic.className = 'ev-pick-ic ' + docIconClass(f);
                const meta = document.createElement('div'); meta.className = 'ev-pick-meta';
                const nm = document.createElement('div'); nm.className = 'ev-pick-name'; nm.textContent = f.title || 'Documento sin título';
                meta.appendChild(nm);
                if (path) { const pt = document.createElement('div'); pt.className = 'ev-pick-path'; pt.textContent = path; meta.appendChild(pt); }
                const ck = document.createElement('i'); ck.className = 'fas fa-circle-check ev-pick-check';
                row.appendChild(ic); row.appendChild(meta); row.appendChild(ck);
                const toggle = () => {
                    if (pickerDocIds.includes(f.id)) pickerDocIds = pickerDocIds.filter(i => i !== f.id);
                    else if (pickerDocIds.length >= MAX_EVENT_DOCS) { showToast('Máximo ' + MAX_EVENT_DOCS + ' documentos por evento'); return; }
                    else pickerDocIds.push(f.id);
                    renderEventDocPicker();
                };
                row.addEventListener('click', toggle);
                row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
                evDocPickerList.appendChild(row);
            });
            evDocPickerList.scrollTop = keep;
        }

        function openEventDocPicker() {
            pickerDocIds = eventDocIds.slice();      // copia de lo que ya tiene el evento
            evDocPickerSearch.value = '';
            renderEventDocPicker();
            evDocPicker.style.display = 'flex';
            evDocPickerSearch.focus();
        }

        // save === true  -> se aplica la selección; cualquier otra cosa -> se descarta
        function closeEventDocPicker(save) {
            if (save === true) eventDocIds = pickerDocIds.slice();
            evDocPicker.style.display = 'none';
            renderEventDocs();
        }

        document.getElementById('eventDocsAddBtn').addEventListener('click', openEventDocPicker);
        document.getElementById('eventDocPickerDone').addEventListener('click', () => closeEventDocPicker(true));
        document.getElementById('eventDocPickerClose').addEventListener('click', () => closeEventDocPicker(false));
        evDocPickerSearch.addEventListener('input', renderEventDocPicker);
        evDocPicker.addEventListener('mousedown', (e) => { if (e.target === evDocPicker) closeEventDocPicker(false); });
        evDocPicker.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeEventDocPicker(false); } });

        // Abrir un documento adjunto desde un evento (los modales quedan por encima del editor, así que se cierran)
        function openFileFromEvent(id) {
            const f = files.find(x => x.id === id);
            if (!f) { showToast('Ese documento ya no existe'); return; }
            dayEventsModal.style.display = 'none';
            closeDayEventsDropdown();
            if (f.kind === 'attachment') openAttachmentInApp(f); else openDocEditor(f);
        }
        function buildEventDocChips(event, softColor, textColor, category, isImage, fit) {
            const docs = (event.docIds || []).map(id => files.find(f => f.id === id)).filter(Boolean);
            if (!docs.length) return null;
            const wrap = document.createElement('div');
            wrap.className = 'event-docs-chips';

            // fit = true: se pintan todos y se ocultan los que no caben (+X); si no, máximo 3 como antes
            (fit ? docs : docs.slice(0, 3)).forEach(f => {
                const chip = document.createElement('span');
                chip.className = 'event-doc-chip';
                chip.setAttribute('role', 'button'); chip.tabIndex = 0;
                chip.style.color = softColor;
                chip.dataset.name = f.title || 'Documento';
                if (fit) chip.style.flex = '0 0 auto';
                chip.style.setProperty('--chip-hover-bg', textColor || 'currentColor');
                const hoverFg = (category && !isImage && category.color) ? category.color : (isImage ? '#111' : 'var(--card-bg)');
                chip.style.setProperty('--chip-hover-fg', hoverFg);
                chip.title = (f.title || 'Documento') + ' · clic para abrir';
                const ic = document.createElement('i'); ic.className = docIconClass(f).replace(/ic-\w+/, '');
                const nm = document.createElement('span'); nm.textContent = f.title || 'Documento';
                chip.appendChild(ic); chip.appendChild(nm);
                const open = (e) => { e.preventDefault(); e.stopPropagation(); openFileFromEvent(f.id); };
                chip.addEventListener('click', open);
                chip.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(e); });
                wrap.appendChild(chip);
            });

            if (!fit) {
                if (docs.length > 3) {
                    const more = document.createElement('span');
                    more.className = 'event-doc-more'; more.style.color = softColor;
                    more.textContent = '+' + (docs.length - 3);
                    more.title = docs.slice(3).map(f => f.title || 'Documento').join(', ');
                    wrap.appendChild(more);
                }
                return wrap;
            }

            const more = document.createElement('span');
            more.className = 'event-doc-more';
            more.style.color = softColor;
            more.style.display = 'none';
            wrap.appendChild(more);

            // Recalcula cuántos caben cada vez que cambia el ancho (al abrir el modal, redimensionar...)
            if (typeof ResizeObserver !== 'undefined') {
                new ResizeObserver(() => fitDocChips(wrap)).observe(wrap);
            }
            return wrap;
        }

        // Muestra tantos documentos como quepan en una sola fila y pone "+X" con el resto
        function fitDocChips(wrap) {
            const chips = Array.from(wrap.querySelectorAll('.event-doc-chip'));
            const more = wrap.querySelector('.event-doc-more');
            const avail = wrap.clientWidth;
            if (!chips.length || !more || !avail) return;

            chips.forEach(c => { c.style.display = ''; });
            more.style.display = 'none';

            const gap = parseFloat(getComputedStyle(wrap).columnGap) || 6;
            const widths = chips.map(c => c.offsetWidth);
            const total = widths.reduce((s, w, i) => s + w + (i ? gap : 0), 0);
            if (total <= avail) return;                       // caben todos: no hay +X

            more.textContent = '+' + chips.length;            // peor caso de ancho
            more.style.display = '';
            const moreW = more.offsetWidth + gap;
            more.style.display = 'none';

            let used = 0, count = 0;
            for (let i = 0; i < chips.length; i++) {
                const next = used + (i ? gap : 0) + widths[i];
                if (next + moreW > avail) break;
                used = next; count++;
            }
            count = Math.max(1, count);

            chips.forEach((c, i) => { c.style.display = i < count ? '' : 'none'; });
            const hidden = chips.length - count;
            if (hidden > 0) {
                more.textContent = '+' + hidden;
                more.title = chips.slice(count).map(c => c.dataset.name).join(', ');
                more.style.display = '';
            }
        }

        // Clic en un documento importado: PDF -> visor; Word (.docx convertido) -> editor; resto -> programa externo
        function openAttachmentInApp(file) {
            if (file.ext === 'pdf') { openPdfViewer(file); return; }      // PDF: solo visor (no editable)
            if (file.ext === 'docx') { openDocViewer(file); return; }      // Word: siempre tal cual, en la hoja (se edita en Word)
            if (file.inApp) { openDocEditor(file); return; }
            if (file.ext === 'doc') showToast('Los .doc antiguos no se pueden editar aquí; se abre con tu programa. Guárdalo como .docx para editarlo en la app.');
            openAttachment(file);
        }
        // Abre el archivo en otro programa. Se muestra que está trabajando (un PDF grande puede tardar unos segundos),
        // se ignoran los clics repetidos mientras tanto y, si un método falla, se prueba el otro.
        // Word y PDF usan primero el selector "Abrir con" y, solo si falla, el programa predeterminado.
        let openWithBusy = false;
        async function openAttachmentWith(file) {
            const st = window.store;
            if (!st || !(st.openDocumentWith || st.openDocument)) { showToast('Solo disponible en la aplicación de escritorio'); return; }
            if (!file || !file.stored) { showToast('Este documento no tiene un archivo asociado'); return; }
            if (openWithBusy) return;
            openWithBusy = true;
            const end = busyStart('Abriendo en otro programa…', 0);
            const slow = setTimeout(() => showToast('Está tardando en abrirse; si el archivo es grande, espera unos segundos'), 6000);
            const withFn = st.openDocumentWith ? () => st.openDocumentWith(file.stored) : null;
            const defFn = st.openDocument ? () => st.openDocument(file.stored) : null;
            const attempts = [withFn, defFn].filter(Boolean);   // primero el selector "Abrir con" (Word y PDF), y si falla, el programa predeterminado
            let reason = '', opened = false;
            try {
                for (const run of attempts) {
                    try {
                        const t0 = performance.now();
                        const r = await run();
                        console.info('Abrir con: respuesta en ' + Math.round(performance.now() - t0) + ' ms', r);
                        if (r && r.ok) { opened = true; break; }
                        if (r && r.error) reason = r.error;
                    } catch (err) { console.error(err); reason = (err && err.message) || reason; }
                }
            } finally {
                clearTimeout(slow);
                end();
                openWithBusy = false;
            }
            if (!opened) showToast('No se pudo abrir el documento' + (reason ? ': ' + reason : ''));
        }

        async function openAttachment(file) {
            if (!(window.store && window.store.openDocument)) { showToast('Los documentos importados solo se pueden abrir desde la aplicación de escritorio'); return; }
            try {
                const r = await window.store.openDocument(file.stored);
                if (!r || !r.ok) showToast((r && r.error) || 'No se pudo abrir el documento');
            } catch (err) { console.error(err); showToast('No se pudo abrir el documento'); }
        }

        function deleteAttachment(file) {
            showConfirmModal({
                title: 'Quitar documento',
                message: '¿Seguro que quieres quitar "' + file.title + '" de tus documentos? Podrás deshacerlo con Ctrl+Z.',
                cancelText: 'Cancelar', deleteText: 'Quitar',
                onConfirm: () => {
                    files = files.filter(f => f.id !== file.id);
                    safeSave('calendarFiles', files);
                    renderDocuments();
                    showToast('Documento quitado', 'ok', { label: 'Deshacer', fn: undo });
                }
            });
        }

        // ============================================
        // BÚSQUEDA EN DOCUMENTOS
        // ============================================
        const docTextCache = new Map();
        function docPlainText(f) {
            if (!f.content && f.searchText) return f.searchText;
            const c = docTextCache.get(f.id);
            if (c && c.u === f.updatedAt && c.l === (f.content || '').length) return c.t;
            let t = '';
            try { t = new DOMParser().parseFromString(f.content || '', 'text/html').body.textContent || ''; } catch (err) { }
            t = t.replace(/\s+/g, ' ').trim();
            docTextCache.set(f.id, { u: f.updatedAt, l: (f.content || '').length, t });
            return t;
        }
        function appendMarked(parent, text, term) {
            const low = text.toLowerCase(), tl = term.toLowerCase();
            let i = 0, k;
            while ((k = low.indexOf(tl, i)) !== -1) {
                if (k > i) parent.appendChild(document.createTextNode(text.slice(i, k)));
                const mk = document.createElement('mark'); mk.textContent = text.slice(k, k + term.length); parent.appendChild(mk);
                i = k + term.length;
            }
            if (i < text.length) parent.appendChild(document.createTextNode(text.slice(i)));
        }
        // Búsqueda dentro del panel de Documentos: lista plana de resultados con un extracto
        let docSearchTerm = '';
        function renderDocSearchResults() {
            withListLoader(documentsContent, files.length, 60, 'Buscando en los documentos…', renderDocSearchResultsNow);
        }
        function renderDocSearchResultsNow() {
            const term = docSearchTerm, tl = term.toLowerCase();
            documentsContent.innerHTML = '';
            documentsContent.classList.add('unsorted');   // mismo aspecto (y contraste en oscuro) que "Sin ordenar"
            const matches = files
                .filter(f => (f.title || '').toLowerCase().includes(tl) || docPlainText(f).toLowerCase().includes(tl))
                .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'es', { numeric: true, sensitivity: 'base' }));
            if (!matches.length) {
                const m = document.createElement('div');
                m.className = 'no-files-message'; m.style.marginTop = '30px';
                m.innerHTML = '<i class="fas fa-file-circle-xmark"></i>';
                m.appendChild(document.createTextNode('Ningún documento coincide con "' + term + '"'));
                documentsContent.appendChild(m);
                return;
            }
            const count = document.createElement('div');
            count.className = 'doc-search-count';
            count.textContent = matches.length + (matches.length === 1 ? ' resultado' : ' resultados');
            documentsContent.appendChild(count);
            matches.forEach(f => {
                const fo = f.folderId ? folders.find(x => x.id === f.folderId) : null;
                const el = createFileElement(f, fo ? (fo.color || null) : null);
                const title = el.querySelector('.file-title');
                if (title) { title.textContent = ''; appendMarked(title, f.title || 'Documento sin título', term); }
                const info = el.querySelector('.file-info');
                const desc = el.querySelector('.file-description');
                if (desc) desc.textContent = (fo ? fo.name : 'Sin carpeta') + ' · ' + desc.textContent;
                const txt = docPlainText(f), k = txt.toLowerCase().indexOf(tl);
                if (info && k !== -1) {
                    const a = Math.max(0, k - 40), b = Math.min(txt.length, k + term.length + 70);
                    const sn = document.createElement('div'); sn.className = 'doc-search-snippet';
                    appendMarked(sn, (a > 0 ? '…' : '') + txt.slice(a, b) + (b < txt.length ? '…' : ''), term);
                    info.appendChild(sn);
                }
                documentsContent.appendChild(el);
            });
        }
        (function () {
            const inp = document.getElementById('docSearchInput'), box = document.getElementById('docSearch'), clr = document.getElementById('docSearchClear');
            const orderToggle = document.querySelector('.doc-order-toggle');
            const lockOrder = on => {
                orderToggle.classList.toggle('locked', on);
                orderToggle.querySelectorAll('.doc-order-btn').forEach(btn => { btn.disabled = on; });
            };
            const apply = () => {
                docSearchTerm = inp.value.trim();
                box.classList.toggle('has-text', !!inp.value);
                lockOrder(!!docSearchTerm);
                renderDocuments();
            };
            inp.addEventListener('input', apply);
            inp.addEventListener('keydown', e => {
                if (e.key === 'Escape') {
                    e.stopPropagation();
                    if (inp.value) { inp.value = ''; apply(); } else inp.blur();
                }
            });
            clr.addEventListener('click', () => { inp.value = ''; apply(); inp.focus(); });
            closeDocumentsSidebar.addEventListener('click', () => {
                if (inp.value) { inp.value = ''; docSearchTerm = ''; box.classList.remove('has-text'); }
                lockOrder(false);
            });
        })();

        // ============================================
        // ATAJOS DE TECLADO Y CHULETA
        // ============================================
        const SHORTCUT_GROUPS = [
            ['Eventos', [
                [['N'], 'Nuevo evento'],
                [['Ctrl', 'Z'], 'Deshacer'],
                [['Ctrl', 'Y'], 'Rehacer (también Ctrl+Mayús+Z)'],
                [['Esc'], 'Cerrar la ventana de encima']
            ]],
            ['Moverse', [
                [['←'], 'Mes anterior (en la agenda: día / semana)'],
                [['→'], 'Mes siguiente (en la agenda: día / semana)'],
                [['Mayús', '← →'], 'Mover el foco por los días del calendario'],
                [['H'], 'Ir a hoy']
            ]],
            ['Vistas', [
                [['A'], 'Abrir / cerrar la agenda'],
                [['S'], 'Agenda de hoy ↔ semanal'],
                [['E'], 'Abrir / cerrar Eventos'],
                [['D'], 'Abrir / cerrar Documentos'],
                [['M'], 'Abrir / cerrar el menú lateral'],
                [['C'], 'Modo claro / oscuro']
            ]],
            ['Búsqueda y ayuda', [
                [['/'], 'Buscar (en Documentos si está abierto)'],
                [['Ctrl', 'F'], 'Buscar'],
                [['?'], 'Mostrar esta chuleta']
            ]],
            ['Documentos', [
                [['Ctrl', 'S'], 'Guardar documento'],
                [['Ctrl', 'Mayús', 'S'], 'Guardar como…']
            ]]
        ];
        function buildShortcuts() {
            let ov = document.getElementById('shortcutsModal');
            if (ov) return ov;
            ov = document.createElement('div'); ov.id = 'shortcutsModal'; ov.className = 'modal';
            const box = document.createElement('div'); box.className = 'modal-content'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Atajos de teclado');
            const head = document.createElement('div'); head.className = 'modal-header';
            const h = document.createElement('h2'); h.className = 'modal-title'; h.textContent = 'Atajos de teclado';
            const x = document.createElement('span'); x.className = 'close'; x.innerHTML = '&times;'; x.setAttribute('aria-label', 'Cerrar');
            head.appendChild(h); head.appendChild(x); box.appendChild(head);
            const grid = document.createElement('div'); grid.className = 'sc-grid';
            SHORTCUT_GROUPS.forEach(([name, rows]) => {
                const g = document.createElement('div'); g.className = 'sc-group';
                const t = document.createElement('h3'); t.textContent = name; g.appendChild(t);
                rows.forEach(([keys, label]) => {
                    const r = document.createElement('div'); r.className = 'sc-row';
                    const l = document.createElement('span'); l.textContent = label;
                    const ks = document.createElement('div'); ks.className = 'sc-keys';
                    keys.forEach(k => { const kb = document.createElement('kbd'); kb.textContent = k; ks.appendChild(kb); });
                    r.appendChild(l); r.appendChild(ks); g.appendChild(r);
                });
                grid.appendChild(g);
            });
            box.appendChild(grid);
            const foot = document.createElement('div'); foot.className = 'sc-foot';
            foot.textContent = 'Los atajos de una sola tecla no funcionan mientras escribes en un campo ni con una ventana abierta.';
            box.appendChild(foot);
            ov.appendChild(box); document.body.appendChild(ov);
            x.addEventListener('click', closeShortcuts);
            ov.addEventListener('mousedown', e => { if (e.target === ov) closeShortcuts(); });
            return ov;
        }
        function openShortcuts() { buildShortcuts().style.display = 'flex'; }
        function closeShortcuts() { const o = document.getElementById('shortcutsModal'); if (o) o.style.display = 'none'; }
        const shortcutsOpen = () => { const o = document.getElementById('shortcutsModal'); return !!(o && o.style.display === 'flex'); };

        const isTypingTarget = e => { const t = e.target; return !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable); };
        const anyModalOpen = () => Array.from(document.querySelectorAll('.modal')).some(m => getComputedStyle(m).display !== 'none');
        const docEditorIsOpen = () => docEditorPanel.classList.contains('open') && !docEditorPanel.classList.contains('hidden-mode');

        function openSearchBox() {
            if (documentsSidebarOpen) { document.getElementById('docSearchInput').focus(); return; }
            if (!searchContainer.classList.contains('visible')) searchToggle.click();
            else searchInput.focus();
        }

        function handleEscape(e) {
            if (ioMenuFor) { closeIoMenu(); e.preventDefault(); return; }
            if (shortcutsOpen()) { closeShortcuts(); e.preventDefault(); return; }
            if (docEditorIsOpen()) return;
            const order = ['confirmModal', 'importDocModal', 'saveAsModal', 'folderModal', 'editCategoryModal', 'eventModal', 'dayEventsModal'];
            for (const id of order) {
                const m = document.getElementById(id);
                if (m && getComputedStyle(m).display !== 'none') {
                    e.preventDefault();
                    if (id === 'confirmModal') confirmCancelBtn.click();
                    else { const c = m.querySelector('.close'); if (c) c.click(); else m.style.display = 'none'; }
                    return;
                }
            }
            if (agendaPopupOpen) { closeAgendaFunc(); e.preventDefault(); return; }
            if (documentsSidebarOpen) { closeDocumentsSidebar.click(); e.preventDefault(); return; }
            if (sidebarOpen) { closeSidebarFunc(); e.preventDefault(); return; }
            if (searchContainer.classList.contains('visible')) { closeSearch.click(); e.preventDefault(); }
        }

        document.addEventListener('keydown', e => {
            const k = e.key;
            if (k === 'Escape') { handleEscape(e); return; }
            const mod = e.ctrlKey || e.metaKey;
            if (mod && !e.altKey) {
                const lk = k.toLowerCase();
                if (lk === 'z' || lk === 'y') {
                    if (isTypingTarget(e) || docEditorIsOpen()) return;   // ahí manda el deshacer del propio campo
                    e.preventDefault();
                    if (lk === 'y' || e.shiftKey) redo(); else undo();
                } else if (lk === 'f') {
                    if (docEditorIsOpen() || anyModalOpen()) return;
                    e.preventDefault(); openSearchBox();
                }
                return;
            }
            if (e.altKey || isTypingTarget(e)) return;
            if (k === '?') {
                if (shortcutsOpen()) closeShortcuts();
                else if (!anyModalOpen() && !docEditorIsOpen()) openShortcuts();
                e.preventDefault(); return;
            }
            const lk = k.length === 1 ? k.toLowerCase() : k;
            if (lk === 'c') { darkModeBtn.click(); return; }    // modo claro/oscuro: disponible siempre
            if (shortcutsOpen() || anyModalOpen() || docEditorIsOpen() || document.getElementById('pdfViewerPanel').classList.contains('open')) return;
            // Dentro de la agenda, Documentos o Eventos solo funcionan las teclas de ese sitio (no se puede abrir otro desde ahí)
            const ctxKeys = agendaPopupOpen ? ['a', 's', 'h', 'n', 'ArrowLeft', 'ArrowRight']
                : documentsSidebarOpen ? ['d']
                    : sidebarOpen ? ['e', 'h', 'n', 'ArrowLeft', 'ArrowRight'] : null;
            if (ctxKeys && !ctxKeys.includes(lk)) return;
            if (documentsSidebarOpen && !agendaPopupOpen && ['t', 'h', 's', 'ArrowLeft', 'ArrowRight'].includes(lk)) return;
            // Mayús + flechas: foco en el calendario (si no hay día enfocado, empieza en el día 1 del mes)
            if (e.shiftKey && !agendaPopupOpen && !isSearchMode && (lk === 'ArrowLeft' || lk === 'ArrowRight')) {
                e.preventDefault();
                const cur = document.activeElement && document.activeElement.closest
                    ? document.activeElement.closest('.calendar-day') : null;
                focusDay(cur
                    ? addDaysStr(cur.dataset.date, lk === 'ArrowRight' ? 1 : -1)
                    : formatDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)));
                return;
            }
            // Con el panel de Eventos abierto, las flechas cambian de mes (H vuelve al mes actual)
            if (sidebarOpen && !agendaPopupOpen && (lk === 'ArrowLeft' || lk === 'ArrowRight')) {
                e.preventDefault();
                if (evTab === 'month' && !isSearchMode) {
                    document.getElementById(lk === 'ArrowRight' ? 'nextMonth' : 'prevMonth').click();
                }
                return;
            }
            switch (lk) {
                case 'n': e.preventDefault(); showEventModal(agendaPopupOpen ? agendaDate : null); break;
                case 'h':
                    if (agendaPopupOpen) { agendaDate = formatDate(new Date()); renderAgenda(); if (agendaMode === 'day') scrollAgendaToNow(); }
                    else document.getElementById('todayBtn').click();
                    break;
                case 'ArrowLeft': case 'ArrowRight': {
                    const dir = lk === 'ArrowLeft' ? 'Prev' : 'Next';
                    if (agendaPopupOpen) document.getElementById('agenda' + dir).click();
                    else if (!isSearchMode) document.getElementById(dir.toLowerCase() + 'Month').click();
                    e.preventDefault(); break;
                }
                case 'a': agendaPopupOpen ? closeAgendaFunc() : openAgendaFunc(); break;
                case 's': if (agendaPopupOpen) document.getElementById('agendaModeBtn').click(); break;
                case 'e':
                    if (agendaPopupOpen) break;
                    if (sidebarOpen) closeSidebarFunc(); else menuUpcoming.click();
                    break;
                case 'm': document.getElementById('leftMenuToggle').click(); break;
                case 'c': darkModeBtn.click(); break;
                case 'd':
                    if (documentsSidebarOpen) closeDocumentsSidebar.click();
                    else menuDocuments.click();
                    break;
                case '/': e.preventDefault(); openSearchBox(); break;
            }
        });

        // ============================================
        // UTILIDADES
        // ============================================
        function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

        let dayEventsCache = null;
        let lastRenderedMonthKey = '';
        let lastFocusedDate = null;

        // ============================================
        // IMÁGENES EN ARCHIVO (data:... → calimg://img/hash.ext)
        // ============================================
        function externalizeImages() {
            if (!(window.store && window.store.saveImage)) return false;
            let changed = false;
            const conv = v => {
                if (typeof v === 'string' && v.startsWith('data:image/')) {
                    const u = window.store.saveImage(v);
                    if (u) { changed = true; return u; }
                }
                return v;
            };
            categories.forEach(c => {
                if (c.icon) c.icon = conv(c.icon);
                if (c.backgroundImage) c.backgroundImage = conv(c.backgroundImage);
            });
            folders.forEach(f => { if (f.icon) f.icon = conv(f.icon); });
            return changed;
        }

        // ============================================
        // HECHO / PENDIENTE Y CONTADOR DEL MES
        // ============================================
        function isEventDone(ev) { return Array.isArray(ev.doneDates) && ev.doneDates.includes(ev.start); }

        function toggleEventDone(id, key) {
            const ev = events.find(e => e.id === id);
            if (!ev) return;
            if (!Array.isArray(ev.doneDates)) ev.doneDates = [];
            const i = ev.doneDates.indexOf(key);
            if (i >= 0) ev.doneDates.splice(i, 1); else ev.doneDates.push(key);
            safeSave('calendarEvents', events);
            renderCalendar(); loadUpcomingEvents();
            if (agendaPopupOpen) renderAgenda();
            if (dayEventsModal.style.display === 'flex') {
                const st = dayEventsListEl.scrollTop;
                showDayEvents(selectedDay);
                dayEventsListEl.scrollTop = st;
            }
        }

        function updateMonthStats() { if (sidebarOpen && evTab === 'month') renderEventsPanel(); }

        // ============================================
        // DUPLICAR PLANTILLAS
        // ============================================

        function refreshLocationList() {
            const dl = document.getElementById('locationList');
            if (!dl) return;
            const set = new Set(events.map(e => e.location).filter(Boolean));
            templates.forEach(t => { if (t.location) set.add(t.location); });
            dl.innerHTML = '';
            [...set].sort((a, b) => a.localeCompare(b, 'es')).slice(0, 50).forEach(v => {
                const o = document.createElement('option'); o.value = v; dl.appendChild(o);
            });
        }

        function applyTemplate(t) {
            document.getElementById('eventTitle').value = t.title || '';
            eventStartTimeEl.value = t.startTime || '';
            eventEndTimeEl.value = t.endTime || '';
            document.getElementById('eventDescription').value = t.description || '';
            document.getElementById('eventLocation').value = t.location || '';
            document.getElementById('eventImportant').checked = !!t.important;
            document.getElementById('eventRepeat').value = t.repeat || ''; csSync('eventRepeat');
            document.getElementById('eventReminder').value = (t.reminder !== null && t.reminder !== undefined && t.reminder !== '') ? String(t.reminder) : '';
            csSync('eventReminder');
            document.getElementById('eventReminderTime').value = t.reminderTime || '09:00';
            syncReminderTimeUI();
            selectedCategoryId = (t.categoryId && categories.some(c => c.id === t.categoryId)) ? t.categoryId : null;
            updateCategorySelection();
            syncRepeatUI(); clearAllEventErrors(); validateTimes();
        }

        function renderTemplates() {
            const box = document.getElementById('templateList');
            const grp = document.getElementById('templatesGroup');
            if (!box || !grp) return;
            box.innerHTML = '';
            grp.style.display = templates.length ? '' : 'none';
            templates.forEach(t => {
                const cat = t.categoryId ? categories.find(c => c.id === t.categoryId) : null;
                const chip = document.createElement('div');
                chip.className = 'template-chip';
                chip.tabIndex = 0;
                chip.setAttribute('role', 'button');
                const dot = document.createElement('span');
                dot.className = 'template-dot';
                dot.style.background = (cat && cat.type !== 'image' && cat.color) ? cat.color : '#999';
                const name = document.createElement('span');
                name.textContent = t.name;
                const del = document.createElement('span');
                del.className = 'template-del';
                del.textContent = '×';
                del.title = 'Borrar plantilla';
                del.addEventListener('click', (e) => {
                    e.stopPropagation();
                    templates = templates.filter(x => x.id !== t.id);
                    safeSave('eventTemplates', templates);
                    renderTemplates();
                });
                chip.addEventListener('click', () => applyTemplate(t));
                chip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applyTemplate(t); } });
                chip.appendChild(dot); chip.appendChild(name); chip.appendChild(del);
                box.appendChild(chip);
            });
        }

        function saveCurrentAsTemplate() {
            const titleEl = document.getElementById('eventTitle');
            const title = titleEl.value.trim();
            if (!title) { setFieldError(titleEl, 'Escribe un nombre para guardar la plantilla'); titleEl.focus(); return; }
            const multiDay = eventEndEl.value && eventEndEl.value !== eventStartEl.value;
            const remV = document.getElementById('eventReminder').value;
            const t = {
                id: Date.now(), name: title, title,
                startTime: eventStartTimeEl.value || null,
                endTime: eventEndTimeEl.value || null,
                description: document.getElementById('eventDescription').value,
                location: document.getElementById('eventLocation').value.trim() || null,
                important: document.getElementById('eventImportant').checked,
                repeat: multiDay ? null : (document.getElementById('eventRepeat').value || null),
                reminder: remV === '' ? null : Number(remV),
                categoryId: selectedCategoryId
            };
            const tplRemT = document.getElementById('eventReminderTime').value;
            if (t.reminder !== null && !t.startTime && validTimeStr(tplRemT)) t.reminderTime = tplRemT;
            const i = templates.findIndex(x => x.name.toLowerCase() === title.toLowerCase());
            if (i >= 0) { t.id = templates[i].id; templates[i] = t; } else templates.push(t);
            safeSave('eventTemplates', templates);
            renderTemplates();
            showToast(i >= 0 ? 'Plantilla actualizada' : 'Plantilla guardada', 'ok');
        }
        document.getElementById('saveTemplateBtn').addEventListener('click', saveCurrentAsTemplate);

        // ============================================
        // NOTIFICACIONES DEL SISTEMA
        // ============================================
        function systemNotify(ev, startMs) {
            if (!(window.store && window.store.notify)) return;
            if (document.hasFocus() && !document.hidden) return;   // con la app delante basta la tarjeta propia
            window.store.notify({
                title: ev.title,
                body: remWhenText(startMs, ev) + (ev.location ? ' · ' + ev.location : ''),
                eventId: ev.id,
                date: formatDate(new Date(startMs))
            });
        }
        if (window.store && window.store.onNotificationClick) {
            window.store.onNotificationClick(p => { if (p && p.eventId && p.date) goToEventAndGlow(p.eventId, p.date); });
        }

        // Abrir la carpeta de copias automáticas desde el menú de exportar
        if (window.store && window.store.openBackups) {
            IO_OPTIONS.export.push({
                icon: 'fi fi-sr-folder-loop', title: 'Abrir carpeta de copias automáticas',
                sub: 'Una copia por día · se conservan las últimas 10', fn: () => window.store.openBackups()
            });
        }

        // ============================================
        // CALENDARIO: CLIC, ARRASTRE Y TECLADO (por delegación: 5 listeners en total, no 4 por casilla)
        // ============================================
        function focusDay(dateStr) {
            if (isSearchMode) return;
            const d = parseD(dateStr);
            lastFocusedDate = dateStr;
            if (d.getMonth() !== currentDate.getMonth() || d.getFullYear() !== currentDate.getFullYear()) {
                currentDate = new Date(d.getFullYear(), d.getMonth(), 1);
                renderCalendar();
            }
            const el = calendarEl.querySelector('.calendar-day.current-month[data-date="' + dateStr + '"]');
            if (el) { el.tabIndex = 0; el.focus(); }
        }

        function setupCalendarDelegation() {
            calendarEl.addEventListener('click', e => {
                const day = e.target.closest('.calendar-day');
                if (day) showDayEvents(day.dataset.date);
            });

            calendarEl.addEventListener('dragstart', e => {
                const chip = e.target.closest && e.target.closest('.event[data-event-id]');
                const day = chip && chip.closest('.calendar-day');
                if (!chip || !day) return;
                e.dataTransfer.setData('text/plain', chip.dataset.eventId + '|' + day.dataset.date);
                e.dataTransfer.effectAllowed = 'move';
            });

            let overDay = null;
            calendarEl.addEventListener('dragover', e => {
                if (isSearchMode) return;
                const day = e.target.closest('.calendar-day');
                if (!day) return;
                e.preventDefault();
                if (overDay !== day) {
                    if (overDay) overDay.classList.remove('drag-over');
                    day.classList.add('drag-over');
                    overDay = day;
                }
            });
            calendarEl.addEventListener('dragleave', e => {
                if (overDay && !overDay.contains(e.relatedTarget)) { overDay.classList.remove('drag-over'); overDay = null; }
            });
            calendarEl.addEventListener('drop', e => {
                const day = e.target.closest('.calendar-day');
                if (!day || isSearchMode) return;
                e.preventDefault();
                day.classList.remove('drag-over'); overDay = null;
                const [id, from] = (e.dataTransfer.getData('text/plain') || '').split('|');
                if (id && from) moveEventByDays(Number(id), dayDiff(from, day.dataset.date));
            });

            // Una sola casilla con tabindex=0 (la enfocada)
            calendarEl.addEventListener('focusin', e => {
                const d = e.target.closest && e.target.closest('.calendar-day');
                if (!d) return;
                calendarEl.querySelectorAll('.calendar-day[tabindex="0"]').forEach(x => { x.tabIndex = -1; });
                d.tabIndex = 0;
                lastFocusedDate = d.dataset.date;
            });

            // Flechas = día/semana · Inicio/Fin = lunes/domingo · RePág/AvPág = mes · Enter/Espacio = abrir
            calendarEl.addEventListener('keydown', e => {
                const cell = e.target.closest && e.target.closest('.calendar-day');
                if (!cell || e.ctrlKey || e.metaKey || e.altKey) return;
                const date = cell.dataset.date;
                const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
                if (moves[e.key] !== undefined) {
                    e.preventDefault(); e.stopPropagation();
                    focusDay(addDaysStr(date, moves[e.key]));
                } else if (e.key === 'Home' || e.key === 'End') {
                    e.preventDefault(); e.stopPropagation();
                    const ws = weekStartOf(date);
                    focusDay(e.key === 'Home' ? ws : addDaysStr(ws, 6));
                } else if (e.key === 'PageUp' || e.key === 'PageDown') {
                    e.preventDefault(); e.stopPropagation();
                    const d = parseD(date), n = e.key === 'PageUp' ? -1 : 1;
                    const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
                    t.setDate(Math.min(d.getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
                    focusDay(formatDate(t));
                } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault(); e.stopPropagation();
                    showDayEvents(date);
                }
            });
        }

        // ============================================
        // ARRANQUE: limpiar iconos guardados y pasar imágenes antiguas a archivo
        // ============================================
        sanitizeImportedData({ events: [], categories, folders, files: [], templates: [] });
        if (boot.report.droppedTotal) {
            console.warn('Datos dañados omitidos al abrir:', boot.report.dropped);
            try { if (bootSource && window.store && window.store.rescue) window.store.rescue(bootSource); } catch (err) { }
            setTimeout(() => showToast('Se omitieron ' + boot.report.droppedTotal + ' elementos dañados al abrir. Se guardó una copia del archivo original en la carpeta de copias.'), 1200);
        }
        if (externalizeImages()) { lastSnap = snapState(); persistToFile(); }

        // ============================================
        // SIDEBAR "EVENTOS": pestañas, contador, filtros y paginación
        // ============================================
        let evTab = 'upcoming', evSort = 'date', evDesc = false, evQuery = '', evMonthKey = '';
        const evStatus = new Set();   // vacío = Todos
        const evCats = new Set();     // categorías elegidas ('__none__' = sin categoría); vacío = todas
        let evImportance = 'all', evLocation = '';
        const evCap = s => s.charAt(0).toUpperCase() + s.slice(1);

        // Botón de dirección del orden: el mismo elemento se reutiliza para poder animar el cambio de icono
        let evDirChip = null, evDirAnim = false;
        const evDirIconClass = () => 'fi ' + (evDesc ? 'fi-sc-sort-amount-up' : 'fi-sc-sort-amount-down');
        function evGetDirChip() {
            if (evDirChip) return evDirChip;
            evDirChip = evMk('ev-chip', '<i class="' + evDirIconClass() + '" style="display:inline-block"></i>', () => {
                evDesc = !evDesc;
                const wasAnimating = evDirAnim;
                evDirAnim = true;        // el render no toca el icono mientras gira
                renderEventsPanel();
                if (wasAnimating) return;   // si se pulsa varias veces seguidas, al terminar queda el icono correcto
                const ic = evDirChip.querySelector('i');
                // Gira hasta 90º, cambia de icono justo cuando va de canto (no se nota) y termina de girar
                const a1 = ic.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(90deg)' }], { duration: 140, easing: 'ease-in' });
                a1.onfinish = () => {
                    ic.className = evDirIconClass();
                    const a2 = ic.animate([{ transform: 'rotate(-90deg)' }, { transform: 'rotate(0deg)' }], { duration: 140, easing: 'ease-out' });
                    a2.onfinish = () => { evDirAnim = false; ic.className = evDirIconClass(); };
                };
            });
            return evDirChip;
        }

        function evMk(cls, html, fn, title) {
            const d = document.createElement('div');
            d.className = cls;
            d.innerHTML = html;
            d.tabIndex = 0;
            d.setAttribute('role', 'button');
            if (title) d.title = title;
            d.addEventListener('click', fn);
            d.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
            return d;
        }

        function evStatusOf(o, todayStr) { return isEventDone(o) ? 'done' : (o.start < todayStr ? 'late' : 'pending'); }

        function evMonthEvents() {
            const y = currentDate.getFullYear(), m = currentDate.getMonth();
            const from = formatDate(new Date(y, m, 1)), to = formatDate(new Date(y, m + 1, 0));
            return events.flatMap(ev => eventOccurrences(ev, from, to)).filter(o => o.start >= from && o.start <= to);
        }

        function setEvTab(tab) {
            evTab = tab;
            document.getElementById('evTabUpcoming').classList.toggle('active', tab === 'upcoming');
            document.getElementById('evTabMonth').classList.toggle('active', tab === 'month');
            evCloseFilterPop();
            upcomingEventsList.style.display = tab === 'upcoming' ? '' : 'none';
            document.getElementById('eventsPanel').style.display = tab === 'month' ? '' : 'none';
            if (tab === 'month') renderEventsPanel();
        }



        // Panel de filtros (mismo estilo que el del buscador superior)
        function evRenderFilterPop(all, counts) {
            if (!all) {
                const t = formatDate(new Date());
                all = evMonthEvents();
                counts = { done: 0, pending: 0, late: 0 };
                all.forEach(o => counts[evStatusOf(o, t)]++);
            }
            const mkChip = (wrap, on, dotStyle, label, count, fn) => {
                const chip = document.createElement('div');
                chip.className = 'sfp-chip' + (on ? ' on' : '');
                chip.setAttribute('role', 'button');
                chip.tabIndex = 0;
                if (dotStyle) { const dot = document.createElement('span'); dot.className = 'sfp-dot'; dot.style.cssText = dotStyle; chip.appendChild(dot); }
                const nm = document.createElement('span');
                nm.textContent = label;
                chip.appendChild(nm);
                if (count !== null) { const c = document.createElement('span'); c.className = 'evf-count'; c.textContent = count; chip.appendChild(c); }
                chip.addEventListener('click', fn);
                chip.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
                wrap.appendChild(chip);
            };
            const st = document.getElementById('evfStatus');
            st.textContent = '';
            [['done', 'Hechos', 'background:#3fb950;'], ['pending', 'Pendientes', 'background:#d29922;'], ['late', 'Sin hacer', 'background:#f85149;']].forEach(([k, label, dot]) => {
                mkChip(st, evStatus.has(k), dot, label, counts[k], () => { if (evStatus.has(k)) evStatus.delete(k); else evStatus.add(k); renderEventsPanel(); });
            });
            Array.from(evCats).forEach(k => { if (k !== '__none__' && !categories.some(c => String(c.id) === k)) evCats.delete(k); });
            const ct = document.getElementById('evfCategories');
            ct.textContent = '';
            const toggleCat = k => { if (evCats.has(k)) evCats.delete(k); else evCats.add(k); renderEventsPanel(); };
            mkChip(ct, evCats.has('__none__'), 'background: transparent; border: 1.5px dashed var(--text-light);', 'Sin categoría', null, () => toggleCat('__none__'));
            categories.forEach(c => {
                const dot = (c.type === 'image' && c.backgroundImage)
                    ? 'background-image: url("' + c.backgroundImage + '"); background-size: cover; background-position: center;'
                    : 'background: ' + (c.color || '#888') + ';';
                mkChip(ct, evCats.has(String(c.id)), dot, c.name, null, () => toggleCat(String(c.id)));
            });
            document.querySelectorAll('#evfImportance [data-v]').forEach(el => el.classList.toggle('on', el.dataset.v === evImportance));
        }
        function evPositionFilterPop() {
            const r = document.getElementById('evFilterBtn').getBoundingClientRect(), pop = document.getElementById('evFilterPop');
            const w = pop.offsetWidth;
            pop.style.top = (r.bottom + 16) + 'px';
            pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
        }
        function evCloseFilterPop() { document.getElementById('evFilterPop').classList.remove('open'); }

        function evBuildCard(o, todayStr) {
            const cat = o.categoryId ? categories.find(c => c.id === o.categoryId) : null;
            const st = evStatusOf(o, todayStr);
            const el = document.createElement('div');
            el.className = 'upcoming-event-item';
            let tc = '#ffffff';
            if (!cat) {
                el.classList.add('no-category');
                tc = 'var(--text-color)';
            } else if (cat.type === 'image' && cat.backgroundImage) {
                el.style.backgroundImage = 'url(' + cat.backgroundImage + ')';
                el.style.backgroundSize = 'cover';
                el.style.backgroundPosition = 'center';
                el.style.textShadow = '0 0 7px rgba(0, 0, 0, 0.7)';
            } else {
                el.style.backgroundColor = cat.color;
                tc = getContrastColor(cat.color, false);
                el.style.color = tc;
            }
            const soft = getSoftColor(cat, tc);

            const content = document.createElement('div');
            content.className = 'upcoming-event-item-content';
            const icon = document.createElement('div');
            icon.className = 'upcoming-event-item-icon';
            if (cat && cat.icon) applyIconColor(icon, cat.icon, tc); else icon.classList.add('no-icon');

            const info = document.createElement('div');
            info.className = 'upcoming-event-item-info';
            const title = document.createElement('div');
            title.className = 'upcoming-event-item-title' + (st === 'done' ? ' ev-title-done' : '');
            title.style.color = tc;
            title.textContent = o.title;
            const date = document.createElement('div');
            date.className = 'upcoming-event-item-date';
            date.style.color = soft;
            date.classList.add('has-extra');
            const mkSp = (txt, cls) => { const e = document.createElement('span'); if (cls) e.className = cls; e.textContent = txt; date.appendChild(e); };
            mkSp(evCap(parseD(o.start).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })));
            if (o.startTime) { mkSp('·', 'ev-dot'); mkSp(o.startTime.substring(0, 5) + (o.endTime ? ' - ' + o.endTime.substring(0, 5) : '')); }
            if (o.important) { mkSp('·', 'ev-dot'); mkSp('Importante', 'ev-imp'); }
            info.appendChild(title);
            info.appendChild(date);
            content.appendChild(icon);
            content.appendChild(info);
            el.appendChild(content);

            if (st !== 'pending') {
                const b = document.createElement('div');
                b.className = 'ev-badge';
                b.style.color = tc;
                b.title = st === 'done' ? 'Hecho' : 'Sin hacer';
                b.innerHTML = st === 'done' ? '<i class="fi fi-sr-check-circle"></i>' : '<i class="fi fi-sr-diamond-exclamation"></i>';
                el.appendChild(b);
            }
            el.addEventListener('click', () => goToEventAndGlow(o.id, o.start));
            return el;
        }

        function renderEventsPanel() {
            if (evTab !== 'month') return;
            withListLoader(document.getElementById('evList'), events.length, 250, 'Cargando eventos…', renderEventsPanelNow);
        }
        function renderEventsPanelNow() {
            if (evTab !== 'month') return;
            const y = currentDate.getFullYear(), m = currentDate.getMonth(), key = y + '-' + m;
            if (key !== evMonthKey) evMonthKey = key;

            const todayStr = formatDate(new Date());
            const all = evMonthEvents();
            const counts = { done: 0, pending: 0, late: 0 };
            all.forEach(o => counts[evStatusOf(o, todayStr)]++);
            const hasImportant = all.some(o => o.important);
            if (evSort === 'importance' && !hasImportant) evSort = 'date';

            document.getElementById('evFilterBtn').classList.toggle('has-filters', evStatus.size > 0 || evCats.size > 0 || evImportance !== 'all' || !!evLocation.trim());
            if (document.getElementById('evFilterPop').classList.contains('open')) evRenderFilterPop(all, counts);

            // Orden: fecha / categoría / importancia (+ dirección)
            const so = document.getElementById('evSortChips');
            so.innerHTML = '';
            const soGroup = document.createElement('div');
            soGroup.className = 'ev-fgroup';
            soGroup.innerHTML = '<span class="ev-label">Ordenar</span>';
            const soRow = document.createElement('div');
            soRow.className = 'ev-chips-row';
            soGroup.appendChild(soRow);
            so.appendChild(soGroup);
            [['date', 'Fecha'], ['category', 'Categoría'], ['importance', 'Importancia']].forEach(([k, label]) => {
                const off = k === 'importance' && !hasImportant;
                const chip = evMk('ev-chip' + (evSort === k ? ' active' : '') + (off ? ' disabled' : ''), label,
                    () => { if (off) return; evSort = k; renderEventsPanel(); },
                    off ? 'No hay eventos importantes este mes' : '');
                if (off) chip.setAttribute('aria-disabled', 'true');
                soRow.appendChild(chip);
            });
            const dirChip = evGetDirChip();
            dirChip.title = evDesc ? 'Fechas de más reciente a más antigua' : 'Fechas de más antigua a más reciente';
            if (!evDirAnim) dirChip.querySelector('i').className = evDirIconClass();
            soRow.appendChild(dirChip);

            // Filtrado
            const q = evQuery.trim().toLowerCase();
            const list = all.filter(o => {
                if (evStatus.size && !evStatus.has(evStatusOf(o, todayStr))) return false;
                if (evCats.size && !evCats.has(o.categoryId ? String(o.categoryId) : '__none__')) return false;
                if (evImportance === 'yes' && !o.important) return false;
                if (evImportance === 'no' && o.important) return false;
                if (evLocation.trim() && !acNorm(o.location).includes(acNorm(evLocation.trim()))) return false;
                if (q && !((o.title || '').toLowerCase().includes(q) || (o.description || '').toLowerCase().includes(q) || (o.location || '').toLowerCase().includes(q))) return false;
                return true;
            });

            // Orden
            const dir = evDesc ? -1 : 1;
            const byDate = (a, b) => dir * (a.start.localeCompare(b.start) || (a.startTime || '99:99').localeCompare(b.startTime || '99:99') || (a.id - b.id));
            const catName = o => { const c = o.categoryId ? categories.find(x => x.id === o.categoryId) : null; return c ? c.name : null; };
            if (evSort === 'category') {
                list.sort((a, b) => {
                    const A = catName(a), B = catName(b);
                    if (A === B) return byDate(a, b);
                    if (A === null) return 1;
                    if (B === null) return -1;
                    return A.localeCompare(B, 'es') || byDate(a, b);
                });
            } else if (evSort === 'importance') {
                list.sort((a, b) => ((b.important ? 1 : 0) - (a.important ? 1 : 0)) || byDate(a, b));
            } else list.sort(byDate);

            const slice = list;

            const box = document.getElementById('evList');
            box.innerHTML = '';
            if (!slice.length) {
                box.innerHTML = '<div class="ev-empty"><i class="fi fi-sr-calendar-xmark"></i><br>' +
                    (all.length ? 'Ningún evento coincide con los filtros' : 'No hay eventos este mes') + '</div>';
            } else {
                let last;
                slice.forEach(o => {
                    if (evSort === 'category') {
                        const n = catName(o) || 'Sin categoría';
                        if (n !== last) { const g = document.createElement('div'); g.className = 'ev-group'; g.textContent = n; box.appendChild(g); last = n; }
                    }
                    box.appendChild(evBuildCard(o, todayStr));
                });
            }
            box.scrollTop = 0;

            const pg = document.getElementById('evPager');
            pg.innerHTML = '';
            pg.appendChild(evMk('ev-nav', '<i class="fas fa-chevron-left"></i>', () => prevMonthBtn.click(), 'Mes anterior'));
            const t = document.createElement('span');
            t.textContent = currentMonthEl.textContent + ' · ' + list.length + (list.length === 1 ? ' evento' : ' eventos');
            pg.appendChild(t);
            pg.appendChild(evMk('ev-nav', '<i class="fas fa-chevron-right"></i>', () => nextMonthBtn.click(), 'Mes siguiente'));
        }

        (function setupEventsSidebar() {
            const bind = (id, tab) => {
                const el = document.getElementById(id);
                el.addEventListener('click', () => setEvTab(tab));
                el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEvTab(tab); } });
            };
            bind('evTabUpcoming', 'upcoming');
            bind('evTabMonth', 'month');

            const inp = document.getElementById('evSearchInput'), box = document.getElementById('evSearch'), clr = document.getElementById('evSearchClear');
            const apply = () => { evQuery = inp.value; box.classList.toggle('has-text', !!inp.value); renderEventsPanel(); };
            inp.addEventListener('input', apply);
            inp.addEventListener('keydown', e => {
                if (e.key === 'Escape') { e.stopPropagation(); if (inp.value) { inp.value = ''; apply(); } else inp.blur(); }
            });
            clr.addEventListener('click', () => { inp.value = ''; apply(); inp.focus(); });

            // Filtros (botón dentro del buscador + panel flotante)
            const fBtn = document.getElementById('evFilterBtn'), pop = document.getElementById('evFilterPop'), loc = document.getElementById('evfLocation');
            const toggle = () => {
                if (pop.classList.contains('open')) { evCloseFilterPop(); return; }
                evRenderFilterPop();
                pop.classList.add('open');
                evPositionFilterPop();
            };
            fBtn.addEventListener('click', e => { e.stopPropagation(); toggle(); });
            fBtn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
            document.addEventListener('mousedown', e => { if (pop.classList.contains('open') && !pop.contains(e.target) && !fBtn.contains(e.target)) evCloseFilterPop(); });
            window.addEventListener('keydown', e => { if (e.key === 'Escape' && pop.classList.contains('open')) { e.stopPropagation(); e.preventDefault(); evCloseFilterPop(); } }, true);
            window.addEventListener('resize', () => { if (pop.classList.contains('open')) evPositionFilterPop(); });
            document.querySelectorAll('#evfImportance [data-v]').forEach(el => el.addEventListener('click', () => { evImportance = el.dataset.v; renderEventsPanel(); }));
            loc.addEventListener('input', debounce(() => { evLocation = loc.value; renderEventsPanel(); }, 150));
            document.getElementById('evfClear').addEventListener('click', () => {
                evStatus.clear(); evCats.clear(); evImportance = 'all'; evLocation = ''; loc.value = '';
                renderEventsPanel();
            });
        })();

        init();

        // En pantallas táctiles no hay "mouseleave": el header se oculta al tocar fuera
        document.addEventListener('click', (e) => {
            if (headerVisible && !isSearchActive &&
                !calendarHeader.contains(e.target) && !headerActivator.contains(e.target)) {
                hideHeaderWithAnimation();
            }
        });

        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                renderCalendar();
                updateCustomScrollbar();
                updateSubmenuPositions();
                if (docEditorPanel.classList.contains('open')) {
                    fitPagesToWidth();
                    updateEditorCustomScrollbar();
                }
                if (agendaPopupOpen) renderAgenda();
            }, 150);
        });

        // ============================================
        // TOOLTIPS PERSONALIZADOS
        // ============================================
        (function setupTooltips() {
            const tip = document.createElement('div');
            tip.className = 'app-tooltip';
            tip.setAttribute('role', 'tooltip');
            document.body.appendChild(tip);

            const GAP = 10;
            const MARGIN = 8;
            const DELAY = 250;
            let showTimer = null;
            let currentEl = null;

            // --- title -> data-tooltip (así el navegador no muestra el suyo) ---
            function convertTitle(el) {
                if (!el || el.nodeType !== 1) return;
                const t = el.getAttribute('title');
                if (!t) return;

                // Accesibilidad: botones solo con icono
                if (!el.getAttribute('aria-label') && el.textContent.trim() === '') {
                    el.setAttribute('aria-label', t);
                }

                // Sin tooltip en los controles de ventana ni en lo marcado con data-no-tooltip
                if (el.closest('.window-controls, [data-no-tooltip]')) {
                    el.removeAttribute('title'); // tampoco sale el tooltip nativo del navegador
                    return;
                }

                el.setAttribute('data-tooltip', t);
                el.removeAttribute('title');
            }

            function convertTree(root) {
                convertTitle(root);
                if (root.querySelectorAll) root.querySelectorAll('[title]').forEach(convertTitle);
            }

            convertTree(document.body);

            // También convierte los elementos que se crean después (botones de eventos, categorías...)
            new MutationObserver((mutations) => {
                mutations.forEach((m) => {
                    if (calendarEl.contains(m.target)) return;   // el calendario no lleva títulos
                    if (m.type === 'attributes') convertTitle(m.target);
                    else m.addedNodes.forEach((n) => { if (n.nodeType === 1) convertTree(n); });
                });
                if (currentEl && !currentEl.isConnected) hide();
            }).observe(document.body, {
                subtree: true,
                childList: true,
                attributes: true,
                attributeFilter: ['title']
            });

            // --- posición preferida según dónde está el botón ---
            function preferredSide(el) {
                const forced = el.getAttribute('data-tooltip-pos'); // opcional: top | bottom | left | right
                if (forced) return forced;
                if (el.closest('.left-menu, .config-submenu, .color-submenu')) return 'right';
                if (el.closest('.documents-float-buttons')) return 'left';
                return 'top';
            }

            function place(el) {
                const r = el.getBoundingClientRect();
                const tw = tip.offsetWidth;
                const th = tip.offsetHeight;
                const vw = window.innerWidth;
                const vh = window.innerHeight;

                const fits = {
                    top: r.top - th - GAP >= MARGIN,
                    bottom: r.bottom + th + GAP <= vh - MARGIN,
                    left: r.left - tw - GAP >= MARGIN,
                    right: r.right + tw + GAP <= vw - MARGIN
                };

                let side = preferredSide(el);
                if (!fits[side]) {
                    const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[side];
                    side = fits[opposite] ? opposite : (['top', 'bottom', 'right', 'left'].find((s) => fits[s]) || side);
                }

                let x, y;
                if (side === 'top' || side === 'bottom') {
                    x = r.left + r.width / 2 - tw / 2;
                    y = side === 'top' ? r.top - th - GAP : r.bottom + GAP;
                } else {
                    y = r.top + r.height / 2 - th / 2;
                    x = side === 'left' ? r.left - tw - GAP : r.right + GAP;
                }

                x = Math.max(MARGIN, Math.min(x, vw - tw - MARGIN));
                y = Math.max(MARGIN, Math.min(y, vh - th - MARGIN));

                tip.dataset.side = side;
                tip.style.left = x + 'px';
                tip.style.top = y + 'px';
            }

            function show(el) {
                const text = el.getAttribute('data-tooltip');
                if (!text) return;

                // "Negrita (Ctrl+B)" -> etiqueta + tecla
                const m = text.match(/^(.*?)\s*\(((?:Ctrl|Cmd|Alt|Shift)[^)]*)\)$/i);

                tip.textContent = '';

                // Icono de la categoría: círculo del color de la categoría con el icono en blanco
                const catId = el.getAttribute('data-tooltip-cat');
                const tipCat = catId ? categories.find(c => String(c.id) === catId) : null;
                if (tipCat && tipCat.icon) {
                    const bubble = document.createElement('span');
                    bubble.className = 'icon-bubble';
                    bubble.style.flex = 'none';
                    if (tipCat.icon.startsWith('<i')) {
                        bubble.style.backgroundColor = (tipCat.type !== 'image' && tipCat.color) ? tipCat.color : '#222222';
                    } else bubble.classList.add('img-bubble');
                    applyIconColor(bubble, tipCat.icon, '#ffffff');
                    tip.appendChild(bubble);
                }

                const label = document.createElement('span');
                label.textContent = m ? m[1] : text;
                tip.appendChild(label);
                if (m) {
                    const key = document.createElement('kbd');
                    key.textContent = m[2];
                    tip.appendChild(key);
                }

                place(el);
                tip.classList.add('visible');
            }

            function hide() {
                clearTimeout(showTimer);
                showTimer = null;
                currentEl = null;
                tip.classList.remove('visible');
            }

            document.addEventListener('mouseover', (e) => {
                const el = e.target.closest ? e.target.closest('[data-tooltip]') : null;
                if (el === currentEl) return;
                hide();
                if (!el) return;
                currentEl = el;
                showTimer = setTimeout(() => show(el), DELAY);
            });

            document.addEventListener('mouseout', (e) => {
                if (currentEl && !currentEl.contains(e.relatedTarget)) hide();
            });

            // Con teclado (Tab) también se muestra
            document.addEventListener('focusin', (e) => {
                const el = e.target.closest ? e.target.closest('[data-tooltip]') : null;
                if (el && el.matches(':focus-visible')) {
                    hide();
                    currentEl = el;
                    show(el);
                }
            });
            document.addEventListener('focusout', hide);

            document.addEventListener('mousedown', hide);
            document.addEventListener('keydown', hide);
            window.addEventListener('resize', hide);
            window.addEventListener('scroll', hide, true);
        })();

        // ============================================a
        // CONTROLES DE VENTANA
        // ============================================
        (function setupWindowControls() {
            const api = window.windowControls // expuesto por preload.js
            // Si Windows dibuja los botones (titleBarOverlay), se ocultan los HTML
            const wco = navigator.windowControlsOverlay;
            const syncNativeControls = () => {
                document.documentElement.classList.toggle('has-native-controls', !!(wco && wco.visible));
            };
            if (wco) {
                syncNativeControls();
                wco.addEventListener('geometrychange', syncNativeControls);
            }
            const btnMin = document.getElementById('wcMinimize');
            const btnMax = document.getElementById('wcMaximize');
            const btnClose = document.getElementById('wcClose');

            if (!btnMin || !btnMax || !btnClose) return;

            const ICON_MAX = '<svg viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8" rx="1"/></svg>';
            const ICON_RESTORE = '<svg viewBox="0 0 12 12"><rect x="2" y="4" width="6" height="6" rx="1"/><path d="M4 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H8"/></svg>';

            function setMaxIcon(isMax) {
                btnMax.innerHTML = isMax ? ICON_RESTORE : ICON_MAX;
                btnMax.title = isMax ? 'Restaurar' : 'Ampliar';
            }

            if (api) {
                // ----- Electron -----
                btnMin.addEventListener('click', () => api.minimize());
                btnMax.addEventListener('click', () => api.toggleMaximize());
                btnClose.addEventListener('click', () => api.close());

                // Recibir el estado de maximizado desde main.js
                api.onMaximizeChange(setMaxIcon);
            } else {

                btnMax.addEventListener('click', () => {
                    if (!document.fullscreenElement) {
                        document.documentElement.requestFullscreen().catch(() => { });
                    } else {
                        document.exitFullscreen();
                    }
                });
                document.addEventListener('fullscreenchange', () => {
                    setMaxIcon(!!document.fullscreenElement);
                });

                btnClose.addEventListener('click', () => window.close());
            }
        })();

        const HOLIDAY_MODAL_CLASSES = [
            'holiday-modal',
            'holiday-modal-valentine',
            'holiday-modal-halloween',
            'holiday-modal-christmas'
        ];

        // Pone (o quita) el fondo festivo en el modal del listado de eventos del día
        function applyDayModalHoliday(dateStr) {
            const content = dayEventsModal.querySelector('.modal-content');
            content.classList.remove(...HOLIDAY_MODAL_CLASSES);

            const holiday = getHoliday(dateStr);
            if (holiday) {
                content.classList.add('holiday-modal', 'holiday-modal-' + holiday.key);
            }
        }

        // ============================================
        // EXPANDIR EL SIDEBAR DE DOCUMENTOS
        // ============================================
        (function setupDocsExpand() {
            const tg = document.getElementById('docExpandToggle');
            const fb = document.getElementById('documentsFloatButtons');
            let expanded = false;
            const apply = (on) => {
                expanded = on;
                document.body.classList.toggle('docs-expanded', on);
                tg.title = on ? 'Reducir' : 'Expandir';
                tg.innerHTML = '<i class="fas fa-chevron-' + (on ? 'right' : 'left') + '"></i>';
            };
            tg.addEventListener('click', () => apply(!expanded));
            // Aparece y desaparece a la vez que los botones flotantes
            const sync = () => {
                const vis = fb.classList.contains('visible');
                tg.classList.toggle('visible', vis);
                if (!vis && expanded) apply(false);   // al cerrar el sidebar vuelve a su tamaño normal
            };
            new MutationObserver(sync).observe(fb, { attributes: true, attributeFilter: ['class'] });
            sync();
        })();

        // ============================================
        // SCROLL PERSONALIZADO DEL LISTADO DE DOCUMENTOS
        // ============================================
        const docListScrollbar = document.createElement('div');
        docListScrollbar.id = 'doc-list-scrollbar';
        const docListThumb = document.createElement('div');
        docListThumb.id = 'doc-list-scrollbar-thumb';
        docListScrollbar.appendChild(docListThumb);
        documentsSidebar.appendChild(docListScrollbar);

        let docListDragging = false;
        let docListDragStartY = 0;
        let docListDragStartScroll = 0;
        let docListHideTimer = null;

        function updateDocListScrollbar() {
            const sc = documentsContent;

            // La barra ocupa justo la zona de la lista (debajo de la cabecera con Ordenado / Sin ordenar)
            docListScrollbar.style.top = sc.offsetTop + 'px';
            docListScrollbar.style.height = sc.clientHeight + 'px';

            const scrollHeight = sc.scrollHeight;
            const clientHeight = sc.clientHeight;
            const maxScroll = scrollHeight - clientHeight;

            if (maxScroll <= 0) {
                docListScrollbar.classList.remove('visible');
                return;
            }

            const thumbHeight = Math.max((clientHeight / scrollHeight) * clientHeight, 40);
            const thumbTop = (sc.scrollTop / maxScroll) * (clientHeight - thumbHeight);

            docListThumb.style.height = thumbHeight + 'px';
            docListThumb.style.top = thumbTop + 'px';
            docListScrollbar.classList.add('visible');

            if (!docListDragging) {
                clearTimeout(docListHideTimer);
                docListHideTimer = setTimeout(() => {
                    docListScrollbar.classList.remove('visible');
                }, 1500);
            }
        }

        // El ancho cambia al expandir/reducir el sidebar
        if (window.ResizeObserver) {
            new ResizeObserver(() => {
                if (documentsSidebar.classList.contains('open')) updateDocListScrollbar();
            }).observe(documentsContent);
        }

        documentsContent.addEventListener('scroll', updateDocListScrollbar, { passive: true });

        // Al acercar el ratón al borde derecho, aparece (igual que la de la página principal)
        documentsSidebar.addEventListener('mousemove', (e) => {
            if (e.clientX > documentsSidebar.getBoundingClientRect().right - 20) {
                updateDocListScrollbar();
                clearTimeout(docListHideTimer);
            }
        });

        documentsSidebar.addEventListener('mouseleave', () => {
            if (docListDragging) return;
            clearTimeout(docListHideTimer);
            docListHideTimer = setTimeout(() => {
                docListScrollbar.classList.remove('visible');
            }, 1500);
        });

        // Arrastrar la barra
        docListThumb.addEventListener('mousedown', (e) => {
            docListDragging = true;
            docListDragStartY = e.clientY;
            docListDragStartScroll = documentsContent.scrollTop;
            docListThumb.classList.add('dragging');
            docListScrollbar.classList.add('visible');
            clearTimeout(docListHideTimer);
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!docListDragging) return;
            const sc = documentsContent;
            const maxScroll = sc.scrollHeight - sc.clientHeight;
            const trackHeight = sc.clientHeight - docListThumb.offsetHeight;
            if (trackHeight <= 0) return;
            sc.scrollTop = docListDragStartScroll + ((e.clientY - docListDragStartY) / trackHeight) * maxScroll;
        });

        document.addEventListener('mouseup', () => {
            if (!docListDragging) return;
            docListDragging = false;
            docListThumb.classList.remove('dragging');
            docListHideTimer = setTimeout(() => {
                docListScrollbar.classList.remove('visible');
            }, 1500);
        });

        // Si cambia el contenido (nuevas carpetas/archivos, abrir/cerrar carpetas) se recalcula
        let docScrollRaf = 0;
        new MutationObserver(() => {
            if (docScrollRaf) return;
            docScrollRaf = requestAnimationFrame(() => {
                docScrollRaf = 0;
                if (documentsSidebar.classList.contains('open')) updateDocListScrollbar();
            });
        }).observe(documentsContent, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
        documentsContent.addEventListener('transitionend', () => {
            if (documentsSidebar.classList.contains('open')) updateDocListScrollbar();
        });
        window.addEventListener('resize', () => {
            if (documentsSidebar.classList.contains('open')) updateDocListScrollbar();
        });

        // ============================================
        // SOLO SE VE EL SCROLL DE LA PANTALLA QUE ESTÁ ENCIMA
        // ============================================
        let docListWasActive = false;

        function syncScrollbarContexts() {
            const docsOn = documentsSidebar.classList.contains('open');
            const upcomingOn = upcomingSidebar.classList.contains('open');
            const agendaOn = agendaPopup.classList.contains('open');
            const editorOn = docEditorPanel.classList.contains('open') &&
                !docEditorPanel.classList.contains('hidden-mode');
            const modalOn = Array.from(document.querySelectorAll('.modal'))
                .some(m => getComputedStyle(m).display !== 'none');

            // Página principal: solo cuando no hay ninguna otra pantalla encima
            const hideMain = docsOn || upcomingOn || agendaOn || editorOn || modalOn;
            // Listado de documentos: se oculta si hay un documento, la agenda o un modal encima
            const hideList = !docsOn || editorOn || agendaOn || modalOn;
            // Documento: se oculta si hay un modal encima (Guardar como, confirmaciones...)
            const hideEditor = !editorOn || modalOn;

            document.body.classList.toggle('sb-hide-main', hideMain);
            document.body.classList.toggle('sb-hide-list', hideList);
            document.body.classList.toggle('sb-hide-editor', hideEditor);

            // Al volver a ver el listado, la barra aparece un momento
            const listActive = !hideList;
            if (listActive && !docListWasActive) updateDocListScrollbar();
            docListWasActive = listActive;
        }

        const scrollContextObserver = new MutationObserver(syncScrollbarContexts);
        [documentsSidebar, upcomingSidebar, agendaPopup, docEditorPanel].forEach(el => {
            scrollContextObserver.observe(el, { attributes: true, attributeFilter: ['class'] });
        });
        document.querySelectorAll('.modal').forEach(m => {
            scrollContextObserver.observe(m, { attributes: true, attributeFilter: ['style', 'class'] });
        });
        syncScrollbarContexts();

        // ============================================
        // CABLEADO: menú de herramientas, enlaces con Ctrl+clic, buscar y reemplazar
        // ============================================
        (function () {
            const toolsBtn = document.getElementById('docToolsBtn');
            const menu = document.getElementById('docToolsMenu');
            const mainView = document.getElementById('toolsMain'), findEl = document.getElementById('docFindBar');
            const hfEl = document.getElementById('docHfBar'), panelsHolder = document.getElementById('toolsPanels');
            const hIn = document.getElementById('docHeaderInput'), fIn2 = document.getElementById('docFooterInput');
            const fIn = document.getElementById('docFindInput'), rIn = document.getElementById('docReplaceInput');
            const fCount = document.getElementById('docFindCount'), fCase = document.getElementById('docFindCase');
            const closeMenu = () => menu.classList.remove('visible');

            const mkBtn = (html, fn, keep) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.innerHTML = html;
                b.addEventListener('mousedown', e => e.preventDefault());
                b.addEventListener('click', () => { if (!keep) closeMenu(); fn(); });
                return b;
            };
            const ico = icon => icon ? '<i class="' + icon + '"></i>' : '';
            const addItem = (icon, label, fn, hint, keep) => mainView.appendChild(mkBtn(ico(icon) + '<span>' + label + '</span>' + (hint ? '<span class="tools-hint">' + hint + '</span>' : ''), fn, keep));
            const addSep = () => { };
            const addTitle = t => { const d = document.createElement('div'); d.className = 'tools-title'; d.textContent = t; mainView.appendChild(d); };
            const addRow = (items, lead, cls) => {
                const r = document.createElement('div');
                r.className = 'tools-row ' + (cls || '');
                if (lead) { const l = document.createElement('span'); l.className = 'tools-ico'; l.title = lead[1]; l.innerHTML = '<i class="' + lead[0] + '"></i>'; r.appendChild(l); }
                items.forEach(([icon, label, fn]) => r.appendChild(mkBtn(ico(icon) + '<span>' + label + '</span>', fn)));
                mainView.appendChild(r);
            };

            function buildMenu() {
                panelsHolder.append(findEl, hfEl);       // los desplegables vuelven a su sitio antes de reconstruir el menú
                mainView.innerHTML = '';
                findEl.classList.remove('open');
                hfEl.classList.remove('open');
                addTitle('Insertar');
                addRow([['fi fi-sc-link-alt', 'Enlace', docInsertLink], ['fi fi-sc-picture', 'Imagen', docPickImage], ['fi fi-sc-table-list', 'Tabla', docInsertTable]], null, 'tiles');
                if (docCurrentCell()) {
                    addTitle('Tabla');
                    addItem('fi fi-sc-table-rows', 'Fila debajo', () => tableOp('rowAfter'));
                    addItem('fi fi-sc-table-columns', 'Columna a la derecha', () => tableOp('colAfter'));
                    addItem('fi fi-sc-delete-right', 'Borrar fila', () => tableOp('delRow'));
                    addItem('fi fi-sc-delete-right', 'Borrar columna', () => tableOp('delCol'));
                    mainView.lastElementChild.querySelector('i').style.transform = 'rotate(90deg)';
mainView.lastElementChild.querySelector('i').style.marginLeft = '-1px';
mainView.lastElementChild.querySelector('span').style.marginLeft = '1px';
                    addItem('fi fi-sc-trash-can-list', 'Borrar tabla', () => tableOp('delTable'));
                }
                if (lastClickedImg && lastClickedImg.isConnected) {
                    const img = lastClickedImg;
                    addTitle('Imagen');
                    addItem('fas fa-trash', 'Quitar imagen', () => { img.remove(); lastClickedImg = null; positionImgHandle(); afterDocFormat(); });
                }
                addTitle('Interlineado');
                addRow([['', '1', () => docSetLineHeight(1)], ['', '1,15', () => docSetLineHeight(1.15)], ['', '1,5', () => docSetLineHeight(1.5)], ['', '2', () => docSetLineHeight(2)]], null, 'chips');
                addTitle('Documento');
                const hb = mkBtn('<i class="fi fi-sc-heading"></i><span>Cabecera y pie</span><i class="fas fa-chevron-down tools-chev"></i>', () => toggleHf(), true);
                hb.id = 'toolsHfItem';
                mainView.appendChild(hb);
                mainView.appendChild(hfEl);
                const fb = mkBtn('<i class="fi fi-sc-search"></i><span>Buscar y reemplazar</span><i class="fas fa-chevron-down tools-chev"></i>', () => toggleFind(), true);
                fb.id = 'toolsFindItem';
                fb.title = 'Buscar y reemplazar (Ctrl+F)';
                mainView.appendChild(fb);
                mainView.appendChild(findEl);
            }
            toolsBtn.addEventListener('mousedown', e => e.preventDefault());
            toolsBtn.addEventListener('click', e => {
                e.stopPropagation();
                if (menu.classList.contains('visible')) { closeDocFind(); return; }
                buildMenu();
                menu.classList.add('visible');
            });
            document.addEventListener('mousedown', e => {
                if (menu.classList.contains('visible') && !menu.contains(e.target) && !toolsBtn.contains(e.target)) closeDocFind();
            });

            // Imagen pulsada (para cambiar su tamaño) y Ctrl+clic en un enlace para abrirlo
            docEditorPages.addEventListener('click', e => {
                lastClickedImg = e.target.tagName === 'IMG' ? e.target : null;
                positionImgHandle();
                const a = e.target.closest ? e.target.closest('a[href]') : null;
                if (a && (e.ctrlKey || e.metaKey) && SAFE_LINK_RE.test(a.getAttribute('href'))) {
                    e.preventDefault();
                    window.open(a.getAttribute('href'), '_blank', 'noopener');
                }
            });

            // ---- Buscar y reemplazar ----
            let ranges = [], cur = -1, timer = null;
            const hl = !!(window.CSS && CSS.highlights && window.Highlight);
            const BLK = 'p,div,h1,h2,h3,li,blockquote,td,th';

            function collect() {
                const q0 = fIn.value, out = [];
                if (!q0) return out;
                const mc = fCase.classList.contains('on');
                docEditorPages.querySelectorAll('.doc-editor-page').forEach(page => {
                    const groups = new Map();
                    const w = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
                    let n;
                    while ((n = w.nextNode())) {
                        if (!n.nodeValue) continue;
                        const blk = (n.parentElement && n.parentElement.closest(BLK)) || page;
                        if (!groups.has(blk)) groups.set(blk, []);
                        groups.get(blk).push(n);
                    }
                    groups.forEach(nodes => {
                        const full = nodes.map(x => x.nodeValue).join('');
                        let hay = mc ? full : full.toLowerCase(), q = mc ? q0 : q0.toLowerCase();
                        if (hay.length !== full.length) { hay = full; q = q0; }
                        const at = off => {
                            let acc = 0;
                            for (const nd of nodes) {
                                if (off <= acc + nd.nodeValue.length) return [nd, off - acc];
                                acc += nd.nodeValue.length;
                            }
                            const l = nodes[nodes.length - 1];
                            return [l, l.nodeValue.length];
                        };
                        let from = 0, i;
                        while ((i = hay.indexOf(q, from)) !== -1) {
                            const s1 = at(i), e1 = at(i + q.length);
                            const r = document.createRange();
                            r.setStart(s1[0], s1[1]);
                            r.setEnd(e1[0], e1[1]);
                            out.push(r);
                            from = i + Math.max(1, q.length);
                        }
                    });
                });
                return out;
            }
            function paint() {
                if (hl) {
                    if (ranges.length) CSS.highlights.set('doc-find-all', new Highlight(...ranges)); else CSS.highlights.delete('doc-find-all');
                    if (cur >= 0 && ranges[cur]) CSS.highlights.set('doc-find-cur', new Highlight(ranges[cur])); else CSS.highlights.delete('doc-find-cur');
                }
                fCount.textContent = fIn.value ? (ranges.length ? (cur + 1) + '/' + ranges.length : '0') : '';
            }
            function show() {
                const r = ranges[cur];
                if (!r) return;
                const el = r.startContainer.parentElement;
                if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
            function refresh(keep) {
                ranges = collect();
                cur = ranges.length ? (keep && cur >= 0 ? Math.min(cur, ranges.length - 1) : 0) : -1;
                paint();
                if (!keep) show();
            }
            function go(d) {
                if (!ranges.length) refresh(false);
                if (!ranges.length) return;
                cur = (cur + d + ranges.length) % ranges.length;
                paint(); show();
            }
            function replaceRange(r, text) {
                const page = r.startContainer.parentElement.closest('.doc-editor-page');
                if (!page) return;
                page.focus({ preventScroll: true });
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(r);
                if (text) document.execCommand('insertText', false, text); else document.execCommand('delete');
            }
            function replaceOne() {
                if (!ranges.length) refresh(false);
                if (!ranges.length) return;
                replaceRange(ranges[cur], rIn.value);
                afterDocFormat();
                refresh(true);
                show();
            }
            function replaceAll() {
                const all = collect();
                if (!all.length) return;
                for (let i = all.length - 1; i >= 0; i--) replaceRange(all[i], rIn.value);
                afterDocFormat();
                refresh(false);
                showToast(all.length + (all.length === 1 ? ' reemplazo' : ' reemplazos'), 'ok');
            }
            function clearFind() {
                ranges = []; cur = -1;
                if (hl) { CSS.highlights.delete('doc-find-all'); CSS.highlights.delete('doc-find-cur'); }
                fCount.textContent = '';
            }
            // Abre o pliega el desplegable de buscar y reemplazar (el resto del menú sube o baja con transición)
            function toggleHf(force) {
                const open = force === undefined ? !hfEl.classList.contains('open') : force;
                if (open) toggleFind(false);
                hfEl.classList.toggle('open', open);
                const it = document.getElementById('toolsHfItem');
                if (it) it.classList.toggle('open', open);
                if (open) {
                    hIn.value = editorHeader; fIn2.value = editorFooter;
                    setTimeout(() => hIn.focus(), 150);
                }
            }
            // Cabecera y pie se aplican mientras se escribe
            hIn.addEventListener('input', () => { editorHeader = hIn.value.slice(0, 300); applyHeaderFooter(); });
            fIn2.addEventListener('input', () => { editorFooter = fIn2.value.slice(0, 300); applyHeaderFooter(); });
            [hIn, fIn2].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Escape') closeDocFind(); else if (e.key === 'Enter') { e.preventDefault(); toggleHf(false); } }));
            function toggleFind(force) {
                const open = force === undefined ? !findEl.classList.contains('open') : force;
                if (open) toggleHf(false);
                findEl.classList.toggle('open', open);
                const it = document.getElementById('toolsFindItem');
                if (it) it.classList.toggle('open', open);
                if (open) { setTimeout(() => { fIn.focus(); fIn.select(); }, 150); refresh(false); }
                else clearFind();
            }
            closeDocFind = function () {
                closeMenu();
                findEl.classList.remove('open');
                hfEl.classList.remove('open');
                clearFind();
            };
            openDocFind = function () {
                if (!docEditorPanel.classList.contains('open') || docViewerState) return;
                const t = window.getSelection().toString();
                if (t && t.length < 80 && t.indexOf('\n') === -1) fIn.value = t;
                if (!menu.classList.contains('visible')) { buildMenu(); menu.classList.add('visible'); }
                toggleFind(true);
            };
            const later = () => { clearTimeout(timer); timer = setTimeout(() => refresh(false), 120); };
            fIn.addEventListener('input', later);
            fCase.addEventListener('click', () => { fCase.classList.toggle('on'); refresh(false); });
            document.getElementById('docFindNext').addEventListener('click', () => go(1));
            document.getElementById('docFindPrev').addEventListener('click', () => go(-1));
            document.getElementById('docReplaceOne').addEventListener('click', replaceOne);
            document.getElementById('docReplaceAll').addEventListener('click', replaceAll);
            fIn.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); }
                else if (e.key === 'Escape') closeDocFind();
            });
            rIn.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); replaceOne(); }
                else if (e.key === 'Escape') closeDocFind();
            });
            docEditorPages.addEventListener('input', () => { if (menu.classList.contains('visible') && findEl.classList.contains('open')) later(); });
            document.addEventListener('keydown', e => {
                if (!docEditorPanel.classList.contains('open') || docEditorPanel.classList.contains('hidden-mode') || docViewerState) return;
                const k = (e.key || '').toLowerCase();
                if ((e.ctrlKey || e.metaKey) && !e.altKey && (k === 'f' || k === 'h')) { e.preventDefault(); openDocFind(); }
            }, true);
        })();

        // ============================================
        // IMÁGENES: marco y tirador para cambiar el tamaño arrastrando
        // ============================================
        const imgBox = document.createElement('div');
        imgBox.className = 'doc-img-box';
        const imgHandle = document.createElement('div');
        imgHandle.className = 'doc-img-handle';
        document.body.appendChild(imgBox);
        document.body.appendChild(imgHandle);
        function positionImgHandle() {
            const img = lastClickedImg;
            const ok = img && img.isConnected && docEditorPanel.classList.contains('open') && !docEditorPanel.classList.contains('hidden-mode');
            if (!ok) { imgBox.style.display = imgHandle.style.display = 'none'; return; }
            const r = img.getBoundingClientRect();
            // Solo se ve la parte de la imagen que está dentro del documento (no bajo la barra de título ni fuera del panel)
            const br = docEditorBody.getBoundingClientRect();
            const tbEl = document.querySelector('#docEditorPanel .doc-editor-topbar');
            const top = Math.max(br.top, tbEl ? tbEl.getBoundingClientRect().bottom : 0);
            const vis = r.bottom > top + 2 && r.top < br.bottom && r.right > br.left && r.left < br.right;
            if (!vis) { imgBox.style.display = imgHandle.style.display = 'none'; return; }
            imgBox.style.cssText = 'display:block;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;' +
                'clip-path: inset(' + Math.max(0, top - r.top) + 'px ' + Math.max(0, r.right - br.right) + 'px ' + Math.max(0, r.bottom - br.bottom) + 'px ' + Math.max(0, br.left - r.left) + 'px)';
            const handleIn = r.bottom >= top && r.bottom <= br.bottom && r.right >= br.left && r.right <= br.right;
            imgHandle.style.left = r.right + 'px';
            imgHandle.style.top = r.bottom + 'px';
            imgHandle.style.display = handleIn ? 'block' : 'none';
        }
        imgHandle.addEventListener('pointerdown', e => {
            const img = lastClickedImg;
            if (!img) return;
            e.preventDefault();
            imgHandle.setPointerCapture(e.pointerId);
            const r0 = img.getBoundingClientRect();
            const scale = img.offsetWidth ? r0.width / img.offsetWidth : 1;
            const page = img.closest('.doc-editor-page');
            const cs = page ? getComputedStyle(page) : null;
            const maxW = page ? page.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) : 800;
            const startX = e.clientX, startW = r0.width / scale;
            const move = ev => {
                const w = Math.max(24, Math.min(maxW, startW + (ev.clientX - startX) / scale));
                img.style.width = Math.round(w) + 'px';
                img.style.height = 'auto';
                img.style.maxWidth = '100%';
                positionImgHandle();
            };
            const up = () => {
                imgHandle.removeEventListener('pointermove', move);
                imgHandle.removeEventListener('pointerup', up);
                imgHandle.removeEventListener('pointercancel', up);
                afterDocFormat();
                positionImgHandle();
            };
            imgHandle.addEventListener('pointermove', move);
            imgHandle.addEventListener('pointerup', up);
            imgHandle.addEventListener('pointercancel', up);
        });
        docEditorBody.addEventListener('scroll', positionImgHandle, { passive: true });
        window.addEventListener('resize', positionImgHandle);
        docEditorPages.addEventListener('input', () => { if (lastClickedImg) setTimeout(positionImgHandle, 200); });
        document.addEventListener('mousedown', e => {
            if (!lastClickedImg) return;
            if (e.target === imgHandle || (e.target.tagName === 'IMG' && e.target === lastClickedImg)) return;
            if (docEditorPages.contains(e.target) || docEditorPanel.contains(e.target)) { lastClickedImg = null; positionImgHandle(); }
        });
