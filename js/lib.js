// ============================================================
//  Petites fonctions utilitaires partagées
// ============================================================

/** Crée un élément DOM. tag#id.class, attributs, enfants. */
export function el(sel, attrs = {}, ...children) {
  const [tagPart, ...classes] = sel.split('.');
  const [tag, id] = tagPart.split('#');
  const node = document.createElement(tag || 'div');
  if (id) node.id = id;
  if (classes.length) node.className = classes.join(' ');

  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className += (node.className ? ' ' : '') + v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'value') node.value = v;
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const $  = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

/** Identifiant unique (compatible UUID Supabase). */
export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/** Notification éphémère en bas d'écran. */
let toastTimer;
export function toast(msg, isError = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.toggle('err', !!isError);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/** Boîte de dialogue de confirmation. Renvoie une promesse booléenne. */
export function confirmBox(question, okLabel = 'Confirmer', danger = true) {
  return new Promise(resolve => {
    const root = document.getElementById('modalRoot');
    const close = ok => { root.innerHTML = ''; resolve(ok); };
    const back = el('div.modal-back', {
      onclick: e => { if (e.target === back) close(false); },
    },
      el('div.modal', {},
        el('h3', { text: question }),
        el('div.btn-row', {},
          el('button.btn.ghost', { text: 'Annuler', onclick: () => close(false) }),
          el(danger ? 'button.btn.danger' : 'button.btn.primary',
             { text: okLabel, onclick: () => close(true) }),
        ),
      ),
    );
    root.append(back);
  });
}

/** Ouvre une modale personnalisée. `build(close)` doit renvoyer un noeud. */
export function openModal(build) {
  const root = document.getElementById('modalRoot');
  const close = () => { root.innerHTML = ''; };
  const back = el('div.modal-back', { onclick: e => { if (e.target === back) close(); } });
  const modal = el('div.modal');
  modal.append(build(close));
  back.append(modal);
  root.append(back);
  return close;
}

// ---------- Dates & durées ----------

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const pad = n => String(n).padStart(2, '0');

export function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function fmtDateLong(iso) {
  if (!iso) return '—';
  const dt = new Date(iso + 'T12:00:00');
  return dt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** "HH:MM" -> minutes depuis minuit */
export function timeToMin(t) {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** minutes -> "HH:MM" (avec passage de minuit) */
export function minToTime(min) {
  if (min === null || min === undefined || isNaN(min)) return '';
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** Durée lisible : 78 -> "1h18" */
export function fmtDuration(min) {
  if (!min && min !== 0) return '—';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h${pad(m)}` : `${m} min`;
}

// ---------- Divers ----------

export const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function num(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}

export function fullName(p) {
  if (!p) return '';
  return [p.prenom, p.nom].filter(Boolean).join(' ').trim();
}

export function initials(p) {
  return ((p?.prenom?.[0] || '') + (p?.nom?.[0] || '')).toUpperCase() || '?';
}

/** Lit un fichier image, le redimensionne et renvoie un data-URL. */
export function fileToDataURL(file, maxSize = 700, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image illisible'));
      img.onload = () => {
        let { width: w, height: h } = img;
        const ratio = Math.min(1, maxSize / Math.max(w, h));
        w = Math.round(w * ratio); h = Math.round(h * ratio);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Fait défiler jusqu'à un élément, sans casser là où l'API manque. */
export function scrollTo(node, options = { behavior: 'smooth', block: 'center' }) {
  if (!node) return;
  if (typeof node.scrollIntoView === 'function') {
    try { node.scrollIntoView(options); return; } catch { /* option non gérée */ }
  }
  const vue = document.getElementById('view');
  if (vue && typeof node.offsetTop === 'number') vue.scrollTop = node.offsetTop - 60;
}

/** Anti-rebond pour les champs de recherche. */
export function debounce(fn, ms = 350) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
