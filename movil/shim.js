/* Calendario (versión móvil) — sustituye lo que en el PC hace Electron (disco, notificaciones, documentos…)
   usando el almacenamiento del propio navegador (IndexedDB). Se carga antes que app.js. */
(function () {
    'use strict';

    // ---------- IndexedDB mínima (clave -> valor) ----------
    const DB_NAME = 'calendario-movil', STORE = 'kv';
    let dbp = null;
    function db() {
        if (dbp) return dbp;
        dbp = new Promise((resolve, reject) => {
            const rq = indexedDB.open(DB_NAME, 1);
            rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
            rq.onsuccess = () => resolve(rq.result);
            rq.onerror = () => reject(rq.error);
        });
        return dbp;
    }
    const idbGet = k => db().then(d => new Promise((res, rej) => {
        const r = d.transaction(STORE).objectStore(STORE).get(k);
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
    const idbSet = (k, v) => db().then(d => new Promise((res, rej) => {
        const t = d.transaction(STORE, 'readwrite');
        t.objectStore(STORE).put(v, k);
        t.oncomplete = () => res(true); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    }));

    // ---------- Datos en memoria (app.js los pide de forma síncrona al arrancar) ----------
    let cache = null;
    let saveTimer = null, pending = null;
    function flushSave() {
        clearTimeout(saveTimer); saveTimer = null;
        if (!pending) return Promise.resolve();
        const d = pending; pending = null;
        return idbSet('data', d).catch(err => { console.error('No se pudo guardar:', err); });
    }

    const toBytes = d => d instanceof ArrayBuffer ? new Uint8Array(d)
        : ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : new Uint8Array(d || 0);
    const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
    const MIME = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
    const safeName = (name, ext) => {
        let base = String(name || 'documento').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 100);
        return (base || 'documento') + '.' + ext;
    };

    async function loadDoc(stored) {
        const rec = await idbGet('doc:' + stored);
        if (!rec) throw new Error('No se encuentra el documento en este dispositivo.');
        return rec;
    }
    function download(blob, name) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name; a.style.display = 'none';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    // ---------- Notificaciones ----------
    const clickCbs = [];
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', e => {
            if (e.data && e.data.type === 'notification-click') clickCbs.forEach(cb => cb(e.data.payload));
        });
    }

    window.store = {
        loadSync: () => cache,
        save: (data) => { cache = data; pending = data; clearTimeout(saveTimer); saveTimer = setTimeout(flushSave, 250); return Promise.resolve(true); },
        flash: () => { },
        notify: async (p) => {
            try {
                if (!('Notification' in window) || Notification.permission !== 'granted') return;
                const opts = { body: p.body || '', tag: 'ev-' + p.eventId, data: { eventId: p.eventId, date: p.date }, icon: 'movil/icon-192.png' };
                const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
                if (reg) reg.showNotification(p.title || 'Calendario', opts);
                else new Notification(p.title || 'Calendario', opts);
            } catch (e) { console.error(e); }
        },
        onNotificationClick: (cb) => { clickCbs.push(cb); },
        openExternal: async (url) => { try { window.open(String(url), '_blank', 'noopener'); return { ok: true }; } catch (e) { return { ok: false }; } },
        suggestPlaces: async (q) => {
            q = String(q || '').trim().slice(0, 100);
            if (q.length < 2) return { ok: true, features: [] };
            const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 5000);
            try {
                const r = await fetch('https://photon.komoot.io/api/?limit=6&q=' + encodeURIComponent(q), { signal: ctrl.signal });
                if (!r.ok) return { ok: false };
                const j = await r.json();
                const keys = ['name', 'street', 'housenumber', 'city', 'town', 'village', 'locality', 'district', 'county', 'state', 'country'];
                return {
                    ok: true, features: (Array.isArray(j.features) ? j.features : []).slice(0, 6).map(f => {
                        const p = (f && f.properties) || {}, out = {};
                        keys.forEach(k => { if (typeof p[k] === 'string') out[k] = p[k].slice(0, 120); });
                        return out;
                    })
                };
            } catch (e) { return { ok: false }; } finally { clearTimeout(t); }
        },
        // Las imágenes se guardan dentro de los propios datos (data URL)
        saveImage: (dataUrl) => dataUrl,
        readImage: async (url) => (typeof url === 'string' && url.startsWith('data:')) ? url : null,

        // Documentos importados (Word / PDF): se guardan en el dispositivo
        saveDocument: async (p) => {
            try {
                if (!p || typeof p.name !== 'string') return { ok: false, error: 'Datos no válidos.' };
                const ext = (p.name.split('.').pop() || '').toLowerCase();
                if (!MIME[ext]) return { ok: false, error: 'Solo se admiten documentos Word (.doc, .docx) y PDF.' };
                const bytes = toBytes(p.data);
                if (!bytes.length) return { ok: false, error: 'El archivo está vacío.' };
                if (bytes.length > 50 * 1024 * 1024) return { ok: false, error: 'El archivo supera el máximo de 50 MB.' };
                const name = safeName(p.name, ext);
                const stored = rid() + '/' + name;
                await idbSet('doc:' + stored, { name, ext, data: bytes.slice().buffer });
                return { ok: true, stored, ext, size: bytes.length };
            } catch (e) { console.error(e); return { ok: false, error: 'No se pudo guardar el archivo en el dispositivo.' }; }
        },
        readDocument: async (stored) => {
            try { const rec = await loadDoc(stored); return { ok: true, data: rec.data.slice(0) }; }
            catch (e) { return { ok: false, error: e.message }; }
        },
        // "Abrir": PDF en otra pestaña; Word se descarga para abrirlo con la app del móvil
        openDocument: async (stored) => {
            try {
                const rec = await loadDoc(stored);
                const blob = new Blob([rec.data], { type: MIME[rec.ext] });
                if (rec.ext === 'pdf') {
                    const url = URL.createObjectURL(blob);
                    const w = window.open(url, '_blank');
                    if (!w) download(blob, rec.name);
                    setTimeout(() => URL.revokeObjectURL(url), 120000);
                } else download(blob, rec.name);
                return { ok: true };
            } catch (e) { return { ok: false, error: e.message }; }
        },
        // "Abrir con otro programa": hoja de compartir del móvil (o descarga si no existe)
        openDocumentWith: async (stored) => {
            try {
                const rec = await loadDoc(stored);
                const blob = new Blob([rec.data], { type: MIME[rec.ext] });
                const file = new File([blob], rec.name, { type: MIME[rec.ext] });
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    try { await navigator.share({ files: [file], title: rec.name }); return { ok: true }; }
                    catch (e) { if (e && e.name === 'AbortError') return { ok: true }; }
                }
                download(blob, rec.name);
                return { ok: true };
            } catch (e) { return { ok: false, error: e.message }; }
        },
        onDocumentChanged: () => { },
        rescue: async (data) => { try { await idbSet('rescate-' + Date.now(), data); return true; } catch (e) { return false; } }
    };

    // En el móvil no hay barra de ventana: se ofrecen los métodos vacíos por si app.js los llama
    window.windowControls = {
        minimize() { }, toggleMaximize() { }, close() { }, onMaximizeChange() { }, setOverlayTheme() { }
    };

    // Al pasar a segundo plano el móvil puede cerrar la página sin avisar: se fuerza el guardado pendiente
    function flushAll() {
        try { window.dispatchEvent(new Event('beforeunload')); } catch (e) { }
        flushSave();
    }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });
    window.addEventListener('pagehide', flushAll);

    // Permiso de avisos: se pide la primera vez que se guarda un evento (no al abrir la app)
    document.addEventListener('submit', (e) => {
        if (e.target && e.target.id === 'eventForm' && 'Notification' in window && Notification.permission === 'default') {
            try { Notification.requestPermission(); } catch (err) { }
        }
    }, true);

    // Pide guardado persistente (evita que el navegador borre los datos si falta espacio)
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }

    // ---------- Arranque: se leen los datos y entonces se carga app.js ----------
    function startApp() {
        const s = document.createElement('script');
        s.src = 'js/app.js';
        document.body.appendChild(s);
    }
    idbGet('data').then(d => { cache = d || null; }).catch(err => { console.error(err); }).then(startApp);

    // Service worker (funcionar sin conexión)
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW:', err)));
    }
})();
