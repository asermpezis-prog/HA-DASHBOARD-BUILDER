'use strict';
/* HA Dashboard Builder – Oberfläche */

const $ = (s) => document.querySelector(s);
const DEFAULT_KEY = '__default__';

const S = {
  dashboards: [], dash: null, config: null, baseHash: null, baseJSON: '',
  entities: [], entMap: {}, view: 0, undo: [], redo: [], drag: null,
};

// ------------------------------------------------------------------ Hilfen
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    n.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return n;
}

async function api(path, opts = {}) {
  const init = { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json' } };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  const res = await fetch('api/' + path, init);
  let data = null;
  try { data = await res.json(); } catch { /* leer */ }
  if (!res.ok) {
    const err = new Error((data && data.detail) || res.statusText || 'Fehler');
    err.status = res.status;
    throw err;
  }
  return data;
}

function toast(msg, kind = '') {
  const t = el('div', { class: 'toast ' + kind }, msg);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), kind === 'err' ? 8000 : 3500);
}

const enc = encodeURIComponent;
const clone = (o) => JSON.parse(JSON.stringify(o));
const curView = () => (S.config && S.config.views ? S.config.views[S.view] : null);
const isDirty = () => S.config && JSON.stringify(S.config) !== S.baseJSON;

function mdi(name) {
  const n = typeof name === 'string' && name.startsWith('mdi:') ? name.slice(4) : 'shape-outline';
  return el('i', { class: 'mdi mdi-' + n });
}

const DOMAIN_ICON = {
  light: 'mdi:lightbulb', switch: 'mdi:toggle-switch', sensor: 'mdi:gauge', binary_sensor: 'mdi:radiobox-marked',
  climate: 'mdi:thermostat', cover: 'mdi:window-shutter', camera: 'mdi:cctv', person: 'mdi:account',
  automation: 'mdi:robot', script: 'mdi:script-text', scene: 'mdi:palette', alarm_control_panel: 'mdi:shield-home',
  media_player: 'mdi:cast', fan: 'mdi:fan', humidifier: 'mdi:air-humidifier', weather: 'mdi:weather-partly-cloudy',
  input_boolean: 'mdi:toggle-switch-outline', input_number: 'mdi:ray-vertex', input_select: 'mdi:format-list-bulleted',
  button: 'mdi:gesture-tap-button', lock: 'mdi:lock', vacuum: 'mdi:robot-vacuum', update: 'mdi:package-up',
  device_tracker: 'mdi:map-marker', sun: 'mdi:white-balance-sunny', zone: 'mdi:map-marker-radius', todo: 'mdi:clipboard-list',
};
const DC_ICON = {
  temperature: 'mdi:thermometer', humidity: 'mdi:water-percent', timestamp: 'mdi:clock-outline', power: 'mdi:flash',
  energy: 'mdi:lightning-bolt', battery: 'mdi:battery', illuminance: 'mdi:brightness-5', motion: 'mdi:motion-sensor',
  door: 'mdi:door', window: 'mdi:window-closed', pressure: 'mdi:gauge', carbon_dioxide: 'mdi:molecule-co2',
};
const TYPE_ICON = {
  heading: 'mdi:format-header-1', markdown: 'mdi:language-markdown', entities: 'mdi:format-list-bulleted',
  'vertical-stack': 'mdi:view-sequential', 'horizontal-stack': 'mdi:view-column', grid: 'mdi:view-grid',
  'mushroom-title-card': 'mdi:format-title', 'history-graph': 'mdi:chart-line', 'mushroom-chips-card': 'mdi:dots-horizontal',
};
const entIcon = (e) => (e && (e.icon || DC_ICON[e.device_class] || DOMAIN_ICON[e.domain])) || 'mdi:shape-outline';

function fmtState(e) {
  if (!e) return '';
  if (e.state === 'unavailable') return 'nicht verfügbar';
  if (e.state === 'unknown') return 'unbekannt';
  if (e.device_class === 'timestamp') {
    const d = new Date(e.state);
    if (!isNaN(d)) return d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  }
  return e.state + (e.unit ? ' ' + e.unit : '');
}

function usedEntities() {
  const set = new Set();
  const re = /[a-z_]+\.[a-z0-9_]+/g;
  (function walk(o) {
    if (typeof o === 'string') { for (const m of o.match(re) || []) if (S.entMap[m]) set.add(m); }
    else if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') Object.values(o).forEach(walk);
  })(S.config);
  return set;
}

// ------------------------------------------------------------------ Undo / Änderungen
function mutate(fn) {
  S.undo.push(JSON.stringify(S.config));
  if (S.undo.length > 150) S.undo.shift();
  S.redo = [];
  fn();
  render();
}
function undo() {
  if (!S.undo.length) return;
  S.redo.push(JSON.stringify(S.config));
  S.config = JSON.parse(S.undo.pop());
  S.view = Math.min(S.view, Math.max(0, S.config.views.length - 1));
  render();
}
function redo() {
  if (!S.redo.length) return;
  S.undo.push(JSON.stringify(S.config));
  S.config = JSON.parse(S.redo.pop());
  S.view = Math.min(S.view, Math.max(0, S.config.views.length - 1));
  render();
}

// ------------------------------------------------------------------ Karten-Modelle
function getCards(view, cid, create) {
  if (cid === 'c') {
    if (!view.cards && create) view.cards = [];
    return view.cards || [];
  }
  const s = view.sections[+cid.slice(1)];
  if (!s.cards && create) s.cards = [];
  return s.cards || [];
}

function makeCard(eid, type) {
  const e = S.entMap[eid];
  switch (type) {
    case 'mushroom-entity': return { type: 'custom:mushroom-entity-card', entity: eid };
    case 'mushroom-template': return {
      type: 'custom:mushroom-template-card', entity: eid, primary: (e && e.name) || eid,
      secondary: `{{ states('${eid}') }}${e && e.unit ? ' ' + e.unit : ''}`, icon: entIcon(e),
    };
    case 'button': return { type: 'button', entity: eid };
    case 'entities': return { type: 'entities', entities: [eid] };
    case 'sensor': return { type: 'sensor', entity: eid, graph: 'line' };
    case 'history': return { type: 'history-graph', entities: [eid] };
    default: return { type: 'tile', entity: eid };
  }
}

const BLOCKS = [
  { id: 'heading', label: 'Überschrift', icon: 'mdi:format-header-1', make: () => ({ type: 'heading', heading: 'Überschrift' }) },
  { id: 'entities', label: 'Entities-Liste', icon: 'mdi:format-list-bulleted', make: () => ({ type: 'entities', title: 'Neue Liste', entities: [] }) },
  { id: 'markdown', label: 'Text', icon: 'mdi:language-markdown', make: () => ({ type: 'markdown', content: '## Text\nHier Text eingeben' }) },
  { id: 'mtitle', label: 'Mushroom Titel', icon: 'mdi:format-title', make: () => ({ type: 'custom:mushroom-title-card', title: 'Titel' }) },
  { id: 'chips', label: 'Mushroom Chips', icon: 'mdi:dots-horizontal', make: () => ({ type: 'custom:mushroom-chips-card', chips: [] }) },
  { id: 'vstack', label: 'Vertical Stack', icon: 'mdi:view-sequential', make: () => ({ type: 'vertical-stack', cards: [] }) },
];

function newCardFromDrag(d) {
  if (d.src === 'entity') return makeCard(d.entity_id, $('#cardType').value);
  if (d.src === 'block') return BLOCKS.find((b) => b.id === d.block).make();
  return null;
}

function cardSpan(c) {
  const go = c.grid_options && c.grid_options.columns;
  if (go === 'full') return 12;
  if (typeof go === 'number') return Math.max(1, Math.min(12, go));
  const lo = c.layout_options && c.layout_options.grid_columns;
  if (lo === 'full') return 12;
  if (typeof lo === 'number') return Math.max(1, Math.min(12, lo * 3));
  const t = (c.type || '').replace(/^custom:/, '');
  if (['tile', 'button', 'mushroom-entity-card', 'mushroom-template-card', 'mushroom-light-card',
       'mushroom-person-card', 'mushroom-climate-card', 'mushroom-cover-card', 'mushroom-fan-card'].includes(t)) return 6;
  return 12;
}

function cardInfo(c) {
  const type = (c.type || '?').replace(/^custom:/, '');
  const ent = c.entity ? S.entMap[c.entity] : null;
  const title = c.heading || c.title || c.name || c.primary || (ent && ent.name) || c.entity || type;
  const subs = [];
  let missing = false;
  if (c.entity) {
    if (ent) subs.push(`${c.entity} · ${fmtState(ent)}`);
    else if (S.entities.length) { subs.push(`${c.entity} · ⚠ nicht gefunden`); missing = true; }
    else subs.push(c.entity);
  }
  if (c.secondary) subs.push(c.secondary);
  if (type === 'markdown' && c.content) subs.push(c.content);
  if (Array.isArray(c.cards)) subs.push(`${c.cards.length} verschachtelte Karte(n) – per YAML bearbeiten`);
  if (Array.isArray(c.chips)) subs.push(`${c.chips.length} Chip(s)`);
  const rows = Array.isArray(c.entities) ? c.entities.map((r) => (typeof r === 'string' ? { entity: r } : r || {})) : null;
  const icon = c.icon || (ent && entIcon(ent)) || TYPE_ICON[type] || 'mdi:card-outline';
  return { type, title, sub: subs.join(' — '), rows, icon, missing, heading: type === 'heading' || type === 'mushroom-title-card' };
}

const viewLabel = (v, i) => v.title || v.path || (v.icon ? v.icon.replace('mdi:', '') : '') || `Ansicht ${i + 1}`;

// ------------------------------------------------------------------ Laden
async function init() {
  buildStaticUI();
  try {
    const st = await api('status');
    const m = $('#mode');
    m.textContent = st.mode === 'demo' ? 'Demo-Modus' : st.target;
    if (st.mode === 'demo') m.classList.add('demo');
  } catch (e) { /* ignorieren */ }

  try {
    S.dashboards = await api('dashboards');
  } catch (e) {
    toast(e.message, 'err');
    $('#board').replaceChildren(el('div', { class: 'notice' }, 'Keine Verbindung zu Home Assistant: ', e.message));
    return;
  }
  const sel = $('#dashSelect');
  sel.replaceChildren(...S.dashboards.map((d) => el('option', { value: d.key },
    d.title + (d.mode === 'yaml' ? ' (YAML-Modus, nur lesen)' : ''))));
  let start = null;
  try { start = localStorage.getItem('hdb.dash'); } catch { /* egal */ }
  if (!S.dashboards.some((d) => d.key === start)) start = S.dashboards[0].key;
  sel.value = start;

  loadEntities();
  await loadDashboard(start);
}

async function loadEntities() {
  try {
    S.entities = await api('entities');
  } catch (e) { toast('Entitäten konnten nicht geladen werden: ' + e.message, 'err'); return; }
  S.entMap = Object.fromEntries(S.entities.map((e) => [e.entity_id, e]));
  const areas = [...new Set(S.entities.map((e) => e.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  const domains = [...new Set(S.entities.map((e) => e.domain))].sort();
  $('#areaFilter').replaceChildren(el('option', { value: '' }, 'Alle Bereiche'),
    ...areas.map((a) => el('option', { value: a }, a)), el('option', { value: '__none__' }, 'Ohne Bereich'));
  $('#domainFilter').replaceChildren(el('option', { value: '' }, 'Alle Typen'),
    ...domains.map((d) => el('option', { value: d }, d)));
  render();
}

async function loadDashboard(key) {
  let r;
  try { r = await api('config?dashboard=' + enc(key)); } catch (e) { toast(e.message, 'err'); return; }
  S.dash = key;
  try { localStorage.setItem('hdb.dash', key); } catch { /* egal */ }
  S.config = r.config && typeof r.config === 'object' ? r.config : {};
  if (!Array.isArray(S.config.views)) S.config.views = [];
  S.baseHash = r.hash;
  S.baseJSON = JSON.stringify(S.config);
  S.undo = []; S.redo = []; S.view = 0;
  $('#dashSelect').value = key;
  render();
  if (!$('#versionsPanel').hidden) loadVersions();
}

// ------------------------------------------------------------------ Rendern
function render() {
  if (!S.config) return;
  renderTabs();
  renderViewBar();
  renderBoard();
  renderEntities();
  updateToolbar();
}

function updateToolbar() {
  $('#dirty').hidden = !isDirty();
  $('#btnUndo').disabled = !S.undo.length;
  $('#btnRedo').disabled = !S.redo.length;
  const d = S.dashboards.find((x) => x.key === S.dash);
  $('#btnPush').disabled = d && d.mode === 'yaml';
}

function renderTabs() {
  const nav = $('#viewTabs');
  nav.replaceChildren();
  S.config.views.forEach((v, i) => {
    const t = el('button', {
      class: 'tab' + (i === S.view ? ' active' : ''), draggable: 'true',
      title: 'Klicken zum Öffnen · ziehen zum Umsortieren · Karten hierher ziehen zum Verschieben',
      onclick: () => { S.view = i; render(); },
    }, v.icon ? mdi(v.icon) : null, viewLabel(v, i));
    t.addEventListener('dragstart', (e) => { S.drag = { src: 'view', index: i }; e.dataTransfer.setData('text/plain', 'view'); });
    t.addEventListener('dragover', (e) => {
      if (!S.drag || !['view', 'card'].includes(S.drag.src) || (S.drag.src === 'view' && S.drag.index === i)) return;
      e.preventDefault(); t.classList.add('drop-hl');
    });
    t.addEventListener('dragleave', () => t.classList.remove('drop-hl'));
    t.addEventListener('drop', (e) => {
      e.preventDefault(); t.classList.remove('drop-hl');
      const d = S.drag; if (!d) return;
      if (d.src === 'view') {
        mutate(() => {
          const [v2] = S.config.views.splice(d.index, 1);
          S.config.views.splice(i, 0, v2);
          S.view = i;
        });
      } else if (d.src === 'card' && d.view !== i) {
        mutate(() => {
          const [card] = getCards(S.config.views[d.view], d.cid).splice(d.index, 1);
          const target = S.config.views[i];
          if (Array.isArray(target.sections)) {
            if (!target.sections.length) target.sections.push({ type: 'grid', cards: [] });
            getCards(target, 's' + (target.sections.length - 1), true).push(card);
          } else getCards(target, 'c', true).push(card);
        });
        toast(`Karte nach „${viewLabel(S.config.views[i], i)}“ verschoben`);
      }
    });
    nav.append(t);
  });
  nav.append(el('button', { class: 'tab add', onclick: addView }, el('i', { class: 'mdi mdi-plus' }), 'Ansicht'));
}

function renderViewBar() {
  const bar = $('#viewBar');
  bar.replaceChildren();
  const v = curView();
  if (!v) return;
  const isSections = Array.isArray(v.sections) || (v.type === 'sections' && !v.cards);
  const typ = isSections ? `Abschnitte · max. ${v.max_columns || 4} Spalten` : (v.type || 'masonry');
  bar.append(...[
    el('span', { class: 'info' }, el('b', {}, viewLabel(v, S.view)), ` · ${typ}` + (v.path ? ` · /${v.path}` : '')),
    isSections ? el('button', { onclick: addSection }, el('i', { class: 'mdi mdi-plus' }), 'Abschnitt') : null,
    !isSections ? el('button', { onclick: convertToSections, title: 'Masonry-Ansicht in Abschnitte-Ansicht umwandeln' },
      el('i', { class: 'mdi mdi-view-grid-plus-outline' }), 'In Abschnitte umwandeln') : null,
    el('button', { onclick: editView }, el('i', { class: 'mdi mdi-cog-outline' }), 'Ansicht-Einstellungen'),
    el('button', { onclick: duplicateView, title: 'Ansicht duplizieren' }, el('i', { class: 'mdi mdi-content-copy' })),
    el('button', { class: 'danger', onclick: deleteView, title: 'Ansicht löschen' }, el('i', { class: 'mdi mdi-delete-outline' })),
  ].filter(Boolean));
}

function renderBoard() {
  const board = $('#board');
  board.replaceChildren();
  const v = curView();
  if (S.config.strategy && !S.config.views.length) {
    board.append(el('div', { class: 'notice' },
      'Dieses Dashboard wird automatisch von Home Assistant erzeugt (Strategie). ',
      el('br'), 'Lege eine Ansicht an, um es manuell zu gestalten.'));
    return;
  }
  if (!v) {
    board.append(el('div', { class: 'notice' }, 'Noch keine Ansicht vorhanden. ',
      el('button', { class: 'primary', onclick: addView }, 'Erste Ansicht anlegen')));
    return;
  }
  if (Array.isArray(v.sections) || (v.type === 'sections' && !v.cards)) {
    const cols = Math.max(1, Math.min(v.max_columns || 4, 10));
    const grid = el('div', { class: 'board', style: `--cols:${cols}` });
    (v.sections || []).forEach((s, i) => grid.append(renderSection(v, s, i, cols)));
    grid.append(renderNewSection());
    board.append(grid);
  } else {
    const box = el('div', { class: 'section' },
      el('div', { class: 'sec-head' }, el('span', { class: 'title' }, `Karten (${v.type || 'masonry'})`)));
    box.append(renderCards(v, 'c', true));
    board.append(box);
  }
}

function renderSection(v, s, idx, cols) {
  const cid = 's' + idx;
  const cards = s.cards || [];
  const head = cards.find((c) => c.type === 'heading');
  const span = Math.min(s.column_span || 1, cols);
  const sec = el('div', { class: 'section', style: `grid-column: span ${span}` });
  const handle = el('span', { class: 'handle', draggable: 'true', title: 'Abschnitt verschieben' }, el('i', { class: 'mdi mdi-drag' }));
  handle.addEventListener('dragstart', (e) => {
    S.drag = { src: 'section', index: idx };
    e.dataTransfer.setData('text/plain', 'section');
    e.dataTransfer.setDragImage(sec, 20, 20);
  });
  sec.append(el('div', { class: 'sec-head' },
    handle,
    el('span', { class: 'title' }, head ? head.heading : `Abschnitt ${idx + 1}`),
    el('button', { class: 'icon', title: 'schmaler', disabled: span <= 1,
      onclick: () => mutate(() => { s.column_span = Math.max(1, span - 1); if (s.column_span === 1) delete s.column_span; }) },
    el('i', { class: 'mdi mdi-arrow-collapse-horizontal' })),
    el('span', { title: 'Breite in Spalten' }, span),
    el('button', { class: 'icon', title: 'breiter', disabled: span >= cols,
      onclick: () => mutate(() => { s.column_span = Math.min(cols, span + 1); }) }, el('i', { class: 'mdi mdi-arrow-expand-horizontal' })),
    el('button', { class: 'icon', title: 'Abschnitt (YAML) bearbeiten', onclick: () => editSection(idx) }, el('i', { class: 'mdi mdi-pencil-outline' })),
    el('button', { class: 'icon danger', title: 'Abschnitt löschen', onclick: () => deleteSection(idx) }, el('i', { class: 'mdi mdi-delete-outline' })),
  ));
  sec.append(renderCards(v, cid, false));

  sec.addEventListener('dragover', (e) => {
    if (!S.drag || S.drag.src !== 'section' || S.drag.index === idx) return;
    e.preventDefault();
    clearMarks();
    const r = sec.getBoundingClientRect();
    sec.classList.add(e.clientX < r.left + r.width / 2 ? 'ins-before' : 'ins-after');
  });
  sec.addEventListener('drop', (e) => {
    if (!S.drag || S.drag.src !== 'section') return;
    e.preventDefault();
    const r = sec.getBoundingClientRect();
    let to = e.clientX < r.left + r.width / 2 ? idx : idx + 1;
    const from = S.drag.index;
    clearMarks();
    if (from < to) to--;
    if (from === to) return;
    mutate(() => { const [x] = v.sections.splice(from, 1); v.sections.splice(to, 0, x); });
  });
  return sec;
}

function renderNewSection() {
  const z = el('div', { class: 'newsec', onclick: addSection },
    el('div', {}, el('i', { class: 'mdi mdi-plus-box-outline' }), el('br'), 'Neuer Abschnitt', el('br'),
      el('small', {}, 'klicken oder Element hierher ziehen')));
  z.addEventListener('dragover', (e) => {
    if (!S.drag || !['entity', 'block', 'card'].includes(S.drag.src)) return;
    e.preventDefault(); z.classList.add('drop-hl');
  });
  z.addEventListener('dragleave', () => z.classList.remove('drop-hl'));
  z.addEventListener('drop', (e) => {
    e.preventDefault(); z.classList.remove('drop-hl');
    const d = S.drag; if (!d) return;
    mutate(() => {
      const v = curView();
      let card;
      if (d.src === 'card') [card] = getCards(S.config.views[d.view], d.cid).splice(d.index, 1);
      else card = newCardFromDrag(d);
      if (!v.sections) v.sections = [];
      v.sections.push({ type: 'grid', cards: [card] });
    });
  });
  return z;
}

function renderCards(v, cid, masonry) {
  const cards = getCards(v, cid, false);
  const body = el('div', { class: 'cards' + (masonry ? ' masonry' : '') });
  body.dataset.cid = cid;
  cards.forEach((c, i) => body.append(renderCard(c, cid, i)));
  if (!cards.length) body.append(el('div', { class: 'empty' }, 'Entitäten oder Bausteine hierher ziehen'));

  body.addEventListener('dragover', (e) => {
    const d = S.drag;
    if (!d || !['entity', 'block', 'card'].includes(d.src)) return;
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = d.src === 'card' ? 'move' : 'copy';
    clearMarks();
    const t = dropTarget(body, e);
    const nodes = body.querySelectorAll(':scope > .card');
    if (t.into != null) nodes[t.into].classList.add('drop-into');
    else if (t.index < nodes.length) {
      const n = nodes[t.index];
      n.classList.add('ins-before');
      if (n.getBoundingClientRect().width > body.getBoundingClientRect().width * 0.85) n.classList.add('row');
    } else body.classList.add('ins-end');
  });
  body.addEventListener('dragleave', (e) => { if (!body.contains(e.relatedTarget)) clearMarks(); });
  body.addEventListener('drop', (e) => {
    const d = S.drag;
    if (!d || !['entity', 'block', 'card'].includes(d.src)) return;
    e.preventDefault(); e.stopPropagation();
    const t = dropTarget(body, e);
    clearMarks();
    handleDrop(cid, t, d);
  });
  return body;
}

function dropTarget(body, e) {
  const nodes = [...body.querySelectorAll(':scope > .card')];
  if (S.drag.src === 'entity') {
    for (const [i, n] of nodes.entries()) {
      if (n.dataset.accepts !== '1') continue;
      const r = n.getBoundingClientRect();
      if (e.clientX > r.left + r.width * 0.12 && e.clientX < r.right - r.width * 0.12 &&
          e.clientY > r.top + r.height * 0.2 && e.clientY < r.bottom - r.height * 0.2) return { into: i };
    }
  }
  for (const [i, n] of nodes.entries()) {
    const r = n.getBoundingClientRect();
    if (e.clientY < r.top) return { index: i };
    if (e.clientY <= r.bottom && e.clientX < r.left + r.width / 2) return { index: i };
  }
  return { index: nodes.length };
}

function handleDrop(cid, t, d) {
  if (d.src === 'card' && d.view === S.view && d.cid === cid && t.into == null &&
      (t.index === d.index || t.index === d.index + 1)) return; // keine Bewegung
  mutate(() => {
    const view = curView();
    if (t.into != null) {
      const card = getCards(view, cid)[t.into];
      if (!Array.isArray(card.entities)) card.entities = [];
      card.entities.push(d.entity_id);
      return;
    }
    let idx = t.index;
    let card;
    if (d.src === 'card') {
      [card] = getCards(S.config.views[d.view], d.cid).splice(d.index, 1);
      if (d.view === S.view && d.cid === cid && d.index < idx) idx--;
    } else card = newCardFromDrag(d);
    getCards(view, cid, true).splice(idx, 0, card);
  });
}

function clearMarks() {
  document.querySelectorAll('.ins-before,.ins-after,.ins-end,.drop-into,.row,.drop-hl')
    .forEach((n) => n.classList.remove('ins-before', 'ins-after', 'ins-end', 'drop-into', 'row', 'drop-hl'));
}

function renderCard(c, cid, i) {
  const info = cardInfo(c);
  const n = el('div', {
    class: 'card' + (info.heading ? ' is-heading' : '') + (info.missing ? ' missing' : ''),
    draggable: 'true', style: `grid-column: span ${cardSpan(c)}`, title: 'Ziehen zum Verschieben · Doppelklick zum Bearbeiten',
  });
  if (info.rows) n.dataset.accepts = '1';
  n.addEventListener('dragstart', (e) => {
    e.stopPropagation();
    S.drag = { src: 'card', view: S.view, cid, index: i };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'card');
    requestAnimationFrame(() => n.classList.add('dragging'));
  });
  n.addEventListener('dblclick', () => editCard(cid, i));

  n.append(el('div', { class: 'card-top' },
    mdi(info.icon),
    el('div', { class: 'card-text' },
      el('div', { class: 'card-title' }, info.title),
      info.sub ? el('div', { class: 'card-sub' }, info.sub) : null,
      el('span', { class: 'badge' }, info.type)),
    el('div', { class: 'card-actions' },
      el('button', { class: 'icon', title: 'Bearbeiten (YAML)', onclick: () => editCard(cid, i) }, el('i', { class: 'mdi mdi-pencil-outline' })),
      el('button', { class: 'icon', title: 'Duplizieren', onclick: () => mutate(() => {
        const arr = getCards(curView(), cid); arr.splice(i + 1, 0, clone(arr[i]));
      }) }, el('i', { class: 'mdi mdi-content-copy' })),
      el('button', { class: 'icon danger', title: 'Entfernen', onclick: () => mutate(() => getCards(curView(), cid).splice(i, 1)) },
        el('i', { class: 'mdi mdi-close' })))));

  if (info.rows) {
    const ul = el('ul', { class: 'rows' });
    info.rows.forEach((r, ri) => {
      const e = r.entity ? S.entMap[r.entity] : null;
      const label = r.entity ? (r.name || (e ? e.name : r.entity)) : (r.type ? `[${r.type}] ${r.label || r.name || ''}` : 'Zeile');
      ul.append(el('li', { class: r.entity && !e && S.entities.length ? 'missing' : '' },
        el('span', { title: r.entity || '' }, label),
        e ? el('small', { class: 'muted' }, fmtState(e)) : null,
        el('button', { class: 'icon', title: 'Zeile entfernen', onclick: (ev) => {
          ev.stopPropagation();
          mutate(() => getCards(curView(), cid)[i].entities.splice(ri, 1));
        } }, el('i', { class: 'mdi mdi-close', style: 'font-size:14px' }))));
    });
    ul.append(el('li', {}, el('span', { class: 'hint' }, 'Entität auf die Karte ziehen = Zeile hinzufügen')));
    n.append(ul);
  }
  return n;
}

// ------------------------------------------------------------------ Palette
function buildStaticUI() {
  $('#blocks').replaceChildren(...BLOCKS.map((b) => {
    const n = el('div', { class: 'block', draggable: 'true', title: 'In einen Abschnitt ziehen' }, mdi(b.icon), b.label);
    n.addEventListener('dragstart', (e) => { S.drag = { src: 'block', block: b.id }; e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/plain', b.id); });
    return n;
  }));
  ['#search', '#areaFilter', '#domainFilter', '#unusedOnly', '#hideDiag'].forEach((s) =>
    $(s).addEventListener('input', renderEntities));

  document.addEventListener('dragend', () => {
    S.drag = null; clearMarks();
    document.querySelectorAll('.dragging').forEach((n) => n.classList.remove('dragging'));
  });

  $('#dashSelect').addEventListener('change', async (e) => {
    const key = e.target.value;
    if (isDirty() && !confirm('Es gibt nicht übertragene Änderungen. Trotzdem wechseln und verwerfen?\n(Tipp: vorher „Version speichern“)')) {
      e.target.value = S.dash; return;
    }
    await loadDashboard(key);
  });
  $('#btnReload').onclick = async () => {
    if (isDirty() && !confirm('Nicht übertragene Änderungen verwerfen und Stand aus Home Assistant laden?')) return;
    await loadDashboard(S.dash);
    loadEntities();
    toast('Aktueller Stand aus Home Assistant geladen');
  };
  $('#btnUndo').onclick = undo;
  $('#btnRedo').onclick = redo;
  $('#btnYaml').onclick = editAll;
  $('#btnSaveVersion').onclick = saveVersion;
  $('#btnVersions').onclick = () => {
    const p = $('#versionsPanel'); p.hidden = !p.hidden; if (!p.hidden) loadVersions();
  };
  $('#btnCloseVersions').onclick = () => { $('#versionsPanel').hidden = true; };
  $('#btnPush').onclick = pushFlow;

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#modal').hidden) { closeModal(); return; }
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) || !$('#modal').hidden) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
  });
  window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });
}

function renderEntities() {
  const list = $('#entityList');
  if (!S.entities.length) { list.replaceChildren(el('div', { class: 'more' }, 'Lade Entitäten …')); return; }
  const q = $('#search').value.trim().toLowerCase();
  const area = $('#areaFilter').value;
  const dom = $('#domainFilter').value;
  const unused = $('#unusedOnly').checked;
  const hideDiag = $('#hideDiag').checked;
  const used = usedEntities();
  const words = q.split(/\s+/).filter(Boolean);
  const hits = S.entities.filter((e) => {
    if (hideDiag && (e.category || e.hidden)) return false;
    if (area === '__none__' ? e.area : area && e.area !== area) return false;
    if (dom && e.domain !== dom) return false;
    if (unused && used.has(e.entity_id)) return false;
    if (words.length) {
      const hay = `${e.name} ${e.entity_id} ${e.area || ''} ${e.floor || ''}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  $('#entCount').textContent = `(${hits.length})`;
  const LIMIT = 400;
  const out = [];
  let lastGrp;
  for (const e of hits.slice(0, LIMIT)) {
    const grp = e.area ? (e.floor ? `${e.floor} › ${e.area}` : e.area) : 'Ohne Bereich';
    if (grp !== lastGrp) { out.push(el('div', { class: 'grp' }, grp)); lastGrp = grp; }
    const isUsed = used.has(e.entity_id);
    const n = el('div', { class: 'ent' + (isUsed ? ' used' : ''), draggable: 'true',
      title: `${e.entity_id}\nZiehen = Karte anlegen · Doppelklick = an letzten Abschnitt anhängen` },
    mdi(entIcon(e)),
    el('div', { class: 'ent-text' }, el('div', { class: 'ent-name' }, e.name), el('div', { class: 'ent-id' }, e.entity_id)),
    el('span', { class: 'ent-state' }, fmtState(e)),
    isUsed ? el('span', { class: 'ent-used', title: 'Wird im Dashboard bereits verwendet' }, '✓') : null);
    n.addEventListener('dragstart', (ev) => {
      S.drag = { src: 'entity', entity_id: e.entity_id };
      ev.dataTransfer.effectAllowed = 'copy';
      ev.dataTransfer.setData('text/plain', e.entity_id);
    });
    n.addEventListener('dblclick', () => quickAdd(e.entity_id));
    out.push(n);
  }
  if (hits.length > LIMIT) out.push(el('div', { class: 'more' }, `… und ${hits.length - LIMIT} weitere – Suche oder Filter nutzen`));
  if (!hits.length) out.push(el('div', { class: 'more' }, 'Keine Treffer'));
  list.replaceChildren(...out);
}

function quickAdd(eid) {
  const v = curView();
  if (!v) { toast('Erst eine Ansicht anlegen', 'err'); return; }
  mutate(() => {
    const card = makeCard(eid, $('#cardType').value);
    if (Array.isArray(v.sections) || v.type === 'sections') {
      if (!v.sections || !v.sections.length) v.sections = [{ type: 'grid', cards: [] }];
      getCards(v, 's' + (v.sections.length - 1), true).push(card);
    } else getCards(v, 'c', true).push(card);
  });
  toast('Karte hinzugefügt');
}

// ------------------------------------------------------------------ Ansichten & Abschnitte
function addView() {
  mutate(() => {
    if (S.config.strategy && !S.config.views.length) delete S.config.strategy;
    const n = S.config.views.length + 1;
    S.config.views.push({ title: `Neue Ansicht ${n}`, path: `ansicht-${n}`, type: 'sections', max_columns: 4,
      sections: [{ type: 'grid', cards: [{ type: 'heading', heading: 'Neuer Bereich' }] }] });
    S.view = S.config.views.length - 1;
  });
}
function duplicateView() {
  mutate(() => {
    const v = clone(curView());
    v.title = (v.title || 'Ansicht') + ' (Kopie)';
    if (v.path) v.path += '-kopie';
    S.config.views.splice(S.view + 1, 0, v);
    S.view += 1;
  });
}
function deleteView() {
  const v = curView();
  if (!confirm(`Ansicht „${viewLabel(v, S.view)}“ wirklich löschen?`)) return;
  mutate(() => { S.config.views.splice(S.view, 1); S.view = Math.max(0, S.view - 1); });
}
function addSection() {
  mutate(() => {
    const v = curView();
    if (!v.sections) v.sections = [];
    v.sections.push({ type: 'grid', cards: [{ type: 'heading', heading: 'Neuer Abschnitt' }] });
  });
}
function deleteSection(idx) {
  const v = curView();
  const n = (v.sections[idx].cards || []).length;
  if (n && !confirm(`Abschnitt mit ${n} Karte(n) löschen?`)) return;
  mutate(() => v.sections.splice(idx, 1));
}
function convertToSections() {
  mutate(() => {
    const v = curView();
    v.sections = [{ type: 'grid', cards: v.cards || [] }];
    delete v.cards;
    v.type = 'sections';
    if (!v.max_columns) v.max_columns = 4;
  });
}

// ------------------------------------------------------------------ YAML-Editoren
async function editYaml(title, obj, onSave, extraActions = []) {
  let text;
  try { ({ text } = await api('yaml/dump', { method: 'POST', body: { data: obj } })); } catch (e) { toast(e.message, 'err'); return; }
  const ta = el('textarea', { class: 'code', spellcheck: 'false' });
  ta.value = text;
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = ta.selectionStart;
      ta.setRangeText('  ', s, ta.selectionEnd, 'end');
    }
  });
  const err = el('div', { class: 'err' });
  openModal(title, [ta, err], [
    ...extraActions.map((a) => ({ ...a, action: () => a.action(ta.value) })),
    { label: 'Abbrechen' },
    { label: 'Übernehmen', primary: true, action: async () => {
      try {
        const { data } = await api('yaml/parse', { method: 'POST', body: { text: ta.value } });
        onSave(data);
        return true;
      } catch (e) { err.textContent = e.message; return false; }
    } },
  ]);
  ta.focus();
}

function editCard(cid, i) {
  const vi = S.view;
  const card = getCards(S.config.views[vi], cid)[i];
  editYaml('Karte bearbeiten', card, (data) => mutate(() => { getCards(S.config.views[vi], cid)[i] = data; }));
}
function editSection(idx) {
  const vi = S.view;
  const s = S.config.views[vi].sections[idx];
  const { cards, ...rest } = s;
  editYaml('Abschnitt-Einstellungen (ohne Karten)', rest, (data) => mutate(() => {
    const cur = S.config.views[vi].sections[idx];
    const merged = { ...data };
    if (cur.cards) merged.cards = cur.cards;
    S.config.views[vi].sections[idx] = merged;
  }));
}
function editView() {
  const vi = S.view;
  const { sections, cards, ...rest } = S.config.views[vi];
  editYaml('Ansicht-Einstellungen (ohne Abschnitte/Karten)', rest, (data) => mutate(() => {
    const cur = S.config.views[vi];
    const merged = { ...data };
    if (cur.sections) merged.sections = cur.sections;
    if (cur.cards) merged.cards = cur.cards;
    S.config.views[vi] = merged;
  }));
}
function editAll() {
  const name = (S.dash === DEFAULT_KEY ? 'lovelace' : S.dash) + '.yaml';
  editYaml('Gesamte Dashboard-Konfiguration', S.config, (data) => mutate(() => {
    S.config = data;
    if (!Array.isArray(S.config.views)) S.config.views = [];
    S.view = Math.min(S.view, Math.max(0, S.config.views.length - 1));
  }), [{ label: 'Als Datei herunterladen', action: (text) => { download(name, text); return false; } }]);
}
function download(name, text) {
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/yaml' })), download: name });
  document.body.append(a); a.click(); a.remove();
}

// ------------------------------------------------------------------ Modal
function openModal(title, body, actions) {
  $('#modalTitle').textContent = title;
  $('#modalBody').replaceChildren(...[body].flat().filter(Boolean));
  $('#modalActions').replaceChildren(...actions.map((a) => {
    const b = el('button', { class: a.primary ? 'primary' : (a.danger ? 'danger' : '') }, a.label);
    b.onclick = async () => {
      if (!a.action) { closeModal(); return; }
      b.disabled = true;
      let close = true;
      try { close = await a.action(); } finally { b.disabled = false; }
      if (close !== false) closeModal();
    };
    return b;
  }));
  $('#modal').hidden = false;
}
function closeModal() { $('#modal').hidden = true; $('#modalBody').replaceChildren(); }
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });

function diffView(text) {
  const pre = el('div', { class: 'diff' });
  for (const line of text.split('\n')) {
    let cls = '';
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) cls = 'h';
    else if (line.startsWith('+')) cls = 'a';
    else if (line.startsWith('-')) cls = 'd';
    pre.append(el('div', { class: cls }, line || ' '));
  }
  return pre;
}

async function showDiff(oldCfg, newCfg, oldLabel, newLabel, title) {
  const d = await api('diff', { method: 'POST', body: { old: oldCfg, new: newCfg, old_label: oldLabel, new_label: newLabel } });
  openModal(title, d.changed
    ? [el('div', { class: 'muted' }, `+${d.added} / −${d.removed} Zeilen (rot: ${oldLabel}, grün: ${newLabel})`), diffView(d.diff)]
    : el('div', {}, 'Keine Unterschiede.'), [{ label: 'Schließen' }]);
}

// ------------------------------------------------------------------ Versionen & Übertragen
function promptText(title, label, placeholder, okLabel) {
  return new Promise((resolve) => {
    const inp = el('input', { type: 'text', class: 'input', placeholder });
    let done = false;
    openModal(title, [el('label', {}, label), inp], [
      { label: 'Abbrechen', action: () => { done = true; resolve(null); return true; } },
      { label: okLabel, primary: true, action: () => { done = true; resolve(inp.value); return true; } },
    ]);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#modalActions button.primary').click(); });
    inp.focus();
    const obs = new MutationObserver(() => { if ($('#modal').hidden) { obs.disconnect(); if (!done) resolve(null); } });
    obs.observe($('#modal'), { attributes: true });
  });
}

async function saveVersion() {
  const msg = await promptText('Version speichern', 'Kurze Beschreibung (optional):', 'z. B. Neue Raumkarten im Keller', 'Speichern');
  if (msg === null) return;
  try {
    const r = await api('versions', { method: 'POST', body: { dashboard: S.dash, config: S.config, message: msg } });
    toast(`Version #${r.version} gespeichert (noch nicht übertragen)`, 'ok');
    if (!$('#versionsPanel').hidden) loadVersions();
  } catch (e) { toast(e.message, 'err'); }
}

const KIND = { push: 'Übertragen', backup: 'Sicherung', draft: 'Entwurf' };

async function loadVersions() {
  const box = $('#versionList');
  box.replaceChildren(el('div', { class: 'more' }, 'Lade …'));
  let list;
  try { list = await api('versions?dashboard=' + enc(S.dash)); } catch (e) { box.replaceChildren(el('div', { class: 'err' }, e.message)); return; }
  if (!list.length) {
    box.replaceChildren(el('div', { class: 'more' },
      'Noch keine Versionen. Beim ersten Übertragen wird der bisherige Stand aus Home Assistant automatisch gesichert.'));
    return;
  }
  box.replaceChildren(...list.map((v) => el('div', { class: 'ver' },
    el('div', { class: 'meta' }, el('b', {}, '#' + v.id), el('span', { class: 'kind ' + v.kind }, KIND[v.kind] || v.kind),
      new Date(v.created).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })),
    el('div', { class: 'msg' }, v.message || ''),
    el('div', { class: 'acts' },
      el('button', { onclick: () => compareVersion(v.id) }, el('i', { class: 'mdi mdi-compare' }), 'mit Editor vergleichen'),
      el('button', { onclick: () => restoreVersion(v.id) }, el('i', { class: 'mdi mdi-restore' }), 'in Editor laden'),
      el('button', { class: 'danger', title: 'Version löschen', onclick: () => deleteVersion(v.id) }, el('i', { class: 'mdi mdi-delete-outline' }))),
  )));
}

async function compareVersion(id) {
  try {
    const v = await api('versions/' + id);
    await showDiff(v.config, S.config, `Version #${id}`, 'Editor', `Version #${id} ↔ Editor`);
  } catch (e) { toast(e.message, 'err'); }
}
async function restoreVersion(id) {
  try {
    const v = await api('versions/' + id);
    mutate(() => {
      S.config = v.config;
      if (!Array.isArray(S.config.views)) S.config.views = [];
      S.view = Math.min(S.view, Math.max(0, S.config.views.length - 1));
    });
    toast(`Version #${id} in den Editor geladen. Mit „Übertragen“ wird sie in Home Assistant aktiv.`);
  } catch (e) { toast(e.message, 'err'); }
}
async function deleteVersion(id) {
  if (!confirm(`Version #${id} endgültig löschen?`)) return;
  try { await api('versions/' + id, { method: 'DELETE' }); loadVersions(); } catch (e) { toast(e.message, 'err'); }
}

async function pushFlow() {
  const dash = S.dashboards.find((d) => d.key === S.dash);
  if (dash && dash.mode === 'yaml') { toast('Dieses Dashboard läuft im YAML-Modus und kann nicht über die API gespeichert werden.', 'err'); return; }
  let cur, d;
  try {
    cur = await api('config?dashboard=' + enc(S.dash));
    d = await api('diff', { method: 'POST', body: { old: cur.config, new: S.config, old_label: 'Home Assistant', new_label: 'Editor' } });
  } catch (e) { toast(e.message, 'err'); return; }
  if (!d.changed) { toast('Keine Änderungen gegenüber Home Assistant.'); S.baseJSON = JSON.stringify(S.config); S.baseHash = cur.hash; updateToolbar(); return; }
  const conflict = S.baseHash && cur.hash !== S.baseHash;
  const msg = el('input', { type: 'text', class: 'input', placeholder: 'Was hast du geändert? (z. B. Kamera-Kachel entfernt)' });
  openModal(`Änderungen nach Home Assistant übertragen – ${dash ? dash.title : S.dash}`, [
    conflict ? el('div', { class: 'warnbox' },
      '⚠ Das Dashboard wurde seit dem Laden direkt in Home Assistant geändert. Beim Übertragen werden diese Änderungen überschrieben. ',
      'Der aktuelle HA-Stand wird vorher automatisch als Sicherung gespeichert.') : null,
    el('div', { class: 'muted' }, `+${d.added} / −${d.removed} Zeilen  ·  rot = bisher in HA, grün = neu`),
    diffView(d.diff),
    el('label', {}, 'Beschreibung der Version:'), msg,
  ], [
    { label: 'Abbrechen' },
    { label: conflict ? 'Trotzdem übertragen' : 'Jetzt übertragen', primary: true, action: async () => {
      try {
        const r = await api('push', { method: 'POST', body: {
          dashboard: S.dash, config: S.config, message: msg.value, base_hash: S.baseHash, force: !!conflict } });
        S.baseJSON = JSON.stringify(S.config);
        S.baseHash = r.hash;
        updateToolbar();
        toast(r.changed ? `Übertragen ✓ – Version #${r.version} (Sicherung #${r.backup})` : 'Keine Änderungen', 'ok');
        if (!$('#versionsPanel').hidden) loadVersions();
        return true;
      } catch (e) { toast(e.message, 'err'); return false; }
    } },
  ]);
  msg.focus();
}

init();
