'use strict';
/* HA Dashboard Builder – Zeichenfläche im Stil von PowerPoint/Visio */

const $ = (s) => document.querySelector(s);
const DEFAULT_KEY = '__default__';
const DROP_SRC = ['entity', 'block', 'card', 'template'];
const ROW_H = 56;
const GAP = 8;

const S = {
  dashboards: [], dash: null, config: null, baseHash: null, baseJSON: '',
  entities: [], entMap: {}, templates: [], view: 0,
  undo: [], redo: [], lastKey: null, lastT: 0,
  drag: null, drop: null, ph: null,
  sel: null, clip: null, dev: 'pc', zoom: 1, tab: 'format',
};

// ================================================================== Hilfen
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;
    else if (k === 'value') n.value = v;
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
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const curView = () => (S.config && S.config.views ? S.config.views[S.view] : null);
const isDirty = () => S.config && JSON.stringify(S.config) !== S.baseJSON;
const ctype = (c) => String((c && c.type) || '').replace(/^custom:/, '');

function slugify(t) {
  return String(t || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function mdi(name, extra = '') {
  const n = typeof name === 'string' && name.startsWith('mdi:') ? name.slice(4) : 'shape-outline';
  return el('i', { class: 'mdi mdi-' + n + (extra ? ' ' + extra : '') });
}

const DOMAIN_ICON = {
  light: 'mdi:lightbulb', switch: 'mdi:toggle-switch', sensor: 'mdi:gauge', binary_sensor: 'mdi:radiobox-marked',
  climate: 'mdi:thermostat', cover: 'mdi:window-shutter', camera: 'mdi:cctv', person: 'mdi:account',
  automation: 'mdi:robot', script: 'mdi:script-text', scene: 'mdi:palette', alarm_control_panel: 'mdi:shield-home',
  media_player: 'mdi:cast', fan: 'mdi:fan', humidifier: 'mdi:air-humidifier', weather: 'mdi:weather-partly-cloudy',
  input_boolean: 'mdi:toggle-switch-outline', input_number: 'mdi:ray-vertex', input_select: 'mdi:format-list-bulleted',
  button: 'mdi:gesture-tap-button', lock: 'mdi:lock', vacuum: 'mdi:robot-vacuum', update: 'mdi:package-up',
  device_tracker: 'mdi:map-marker', sun: 'mdi:white-balance-sunny', zone: 'mdi:map-marker-radius', todo: 'mdi:clipboard-list',
  counter: 'mdi:counter', timer: 'mdi:timer-outline', select: 'mdi:format-list-bulleted', number: 'mdi:ray-vertex',
};
const DC_ICON = {
  temperature: 'mdi:thermometer', humidity: 'mdi:water-percent', timestamp: 'mdi:clock-outline', power: 'mdi:flash',
  energy: 'mdi:lightning-bolt', battery: 'mdi:battery', illuminance: 'mdi:brightness-5', motion: 'mdi:motion-sensor',
  door: 'mdi:door', window: 'mdi:window-closed', pressure: 'mdi:gauge', carbon_dioxide: 'mdi:molecule-co2', occupancy: 'mdi:home-account',
};
const entIcon = (e) => (e && (e.icon || DC_ICON[e.device_class] || DOMAIN_ICON[e.domain])) || 'mdi:shape-outline';

const HA_COLORS = {
  red: '#f44336', pink: '#e91e63', purple: '#926bc7', 'deep-purple': '#6e41ab', indigo: '#3f51b5', blue: '#2196f3',
  'light-blue': '#03a9f4', cyan: '#00bcd4', teal: '#009688', green: '#4caf50', 'light-green': '#8bc34a', lime: '#cddc39',
  yellow: '#ffeb3b', amber: '#ffc107', orange: '#ff9800', 'deep-orange': '#ff6f22', brown: '#795548',
  'light-grey': '#bdbdbd', grey: '#9e9e9e', 'dark-grey': '#606060', 'blue-grey': '#607d8b', black: '#000000', white: '#ffffff',
  primary: '#03a9f4', accent: '#ff9800', disabled: '#bdbdbd',
};
const BG_COLORS = [
  ['Grün', 'rgba(76,175,80,0.12)'], ['Blau', 'rgba(33,150,243,0.12)'], ['Violett', 'rgba(146,107,199,0.14)'],
  ['Rot', 'rgba(244,67,54,0.10)'], ['Orange', 'rgba(255,152,0,0.14)'], ['Gelb', 'rgba(255,235,59,0.22)'],
  ['Türkis', 'rgba(0,150,136,0.12)'], ['Grau', 'rgba(158,158,158,0.15)'],
];
function resolveColor(c) {
  if (!c || typeof c !== 'string') return null;
  if (HA_COLORS[c]) return HA_COLORS[c];
  if (/^(#|rgb|hsl)/i.test(c.trim())) return c.trim();
  return null;
}

function fmtState(e) {
  if (!e) return '';
  if (e.state === 'unavailable') return 'nicht verfügbar';
  if (e.state === 'unknown') return 'unbekannt';
  if (e.device_class === 'timestamp') {
    const d = new Date(e.state);
    if (!isNaN(d)) return d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  }
  const map = { on: 'An', off: 'Aus', home: 'Zuhause', not_home: 'Abwesend', disarmed: 'Unscharf', armed_away: 'Scharf (abwesend)',
    armed_home: 'Scharf (zuhause)', open: 'Offen', closed: 'Geschlossen', locked: 'Verriegelt', unlocked: 'Entriegelt', idle: 'Inaktiv', playing: 'Spielt' };
  return (map[e.state] || e.state) + (e.unit ? ' ' + e.unit : '');
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

// ================================================================== Jinja-Vorschau (vereinfacht)
function evalExpr(expr) {
  const [base, ...filters] = expr.split('|').map((x) => x.trim());
  let v; let m;
  if ((m = base.match(/^states\(\s*['"]([^'"]+)['"]\s*\)$/))) v = S.entMap[m[1]] ? S.entMap[m[1]].state : '–';
  else if ((m = base.match(/^states\.([a-z_]+\.[a-z0-9_]+)\.state$/))) v = S.entMap[m[1]] ? S.entMap[m[1]].state : '–';
  else if ((m = base.match(/^state_attr\(/))) v = '–';
  else if ((m = base.match(/^is_state\(/))) v = '';
  else if ((m = base.match(/^['"](.*)['"]$/))) v = m[1];
  else if (/^-?\d+(\.\d+)?$/.test(base)) v = base;
  else return '⋯';
  for (const f of filters) {
    const r = f.match(/^round\((\d+)\)$/);
    if (r && v !== '' && !isNaN(+v)) v = (+v).toFixed(+r[1]);
    else if (f === 'int' && !isNaN(+v)) v = String(Math.trunc(+v));
  }
  return v;
}
function renderTpl(s) {
  if (typeof s !== 'string') return '';
  if (!s.includes('{')) return s;
  return s
    .replace(/\{%-?\s*(else|elif)[\s\S]*?\{%-?\s*endif\s*-?%\}/g, '')
    .replace(/\{%-?[\s\S]*?-?%\}/g, '')
    .replace(/\{\{-?([\s\S]*?)-?\}\}/g, (_, e) => evalExpr(e.trim()))
    .replace(/[ \t]*\n[ \t]*\n+/g, '\n')
    .trim();
}
function tplIcon(s, fallback) {
  const r = renderTpl(s || '');
  return r && r.startsWith('mdi:') ? r : fallback;
}

// card_mod: Hintergrund lesen/schreiben (nur einfache Fälle)
function cardModStyleStr(c) {
  const cm = c && c.card_mod;
  if (!cm) return null;
  const st = cm.style;
  if (typeof st === 'string') return st;
  return null;
}
function cardBg(c) {
  const st = cardModStyleStr(c);
  if (st) {
    const m = st.match(/background(?:-color)?\s*:\s*([^;!}\n]+)/i);
    if (m && !/var\(|\{\{|url\(/.test(m[1])) return m[1].trim();
  }
  if (ctype(c) === 'button-card' && Array.isArray(c.styles && c.styles.card)) {
    for (const o of c.styles.card) {
      const v = o && (o.background || o['background-color']);
      if (typeof v === 'string' && !/var\(|\[\[\[/.test(v)) return v;
    }
  }
  return null;
}
function setCardBg(c, color) {
  const cm = c.card_mod;
  if (cm && cm.style != null && typeof cm.style !== 'string') return false;
  let st = (cm && cm.style) || '';
  const decl = /background(?:-color)?\s*:\s*[^;}\n]+;?/i;
  if (!color) {
    st = st.replace(decl, '').replace(/ha-card\s*\{\s*\}/, '').trim();
  } else if (decl.test(st)) {
    st = st.replace(decl, `background: ${color};`);
  } else if (/ha-card\s*\{/.test(st)) {
    st = st.replace(/ha-card\s*\{/, `ha-card {\n  background: ${color};`);
  } else {
    st = `ha-card {\n  background: ${color};\n}\n` + st;
  }
  if (st.trim()) c.card_mod = { ...(cm || {}), style: st };
  else if (cm) { const { style, ...rest } = cm; if (Object.keys(rest).length) c.card_mod = rest; else delete c.card_mod; }
  return true;
}

// ================================================================== Kartenmodell
function getCards(view, cid, create) {
  if (cid === 'c') {
    if (!view.cards && create) view.cards = [];
    return view.cards || [];
  }
  const s = view.sections[+cid.slice(1)];
  if (!s) return [];
  if (!s.cards && create) s.cards = [];
  return s.cards || [];
}
const isSectionsView = (v) => !!v && (Array.isArray(v.sections) || (v.type === 'sections' && !v.cards));

function cardSpan(c) {
  const go = c.grid_options && c.grid_options.columns;
  if (go === 'full') return 12;
  if (typeof go === 'number') return clamp(go, 1, 12);
  const lo = c.layout_options && c.layout_options.grid_columns;
  if (lo === 'full') return 12;
  if (typeof lo === 'number') return clamp(lo * 3, 1, 12);
  const t = ctype(c);
  if (t === 'button') return 3;
  if (t === 'tile' || (t.startsWith('mushroom-') && t !== 'mushroom-title-card' && t !== 'mushroom-chips-card')) return 6;
  return 12;
}
function cardRows(c) {
  const go = c.grid_options && c.grid_options.rows;
  if (typeof go === 'number') return clamp(go, 1, 12);
  if (go === 'auto') return null;
  const lo = c.layout_options && c.layout_options.grid_rows;
  if (typeof lo === 'number') return clamp(lo, 1, 12);
  const t = ctype(c);
  if (t === 'tile') return 1 + (Array.isArray(c.features) ? c.features.length : 0);
  if (t === 'button') return 2;
  if (t.startsWith('mushroom-') && !['mushroom-template-card', 'mushroom-title-card', 'mushroom-chips-card'].includes(t)) return c.layout === 'vertical' ? 2 : 1;
  if (t === 'mushroom-template-card') {
    const multi = c.multiline_secondary || (typeof c.secondary === 'string' && c.secondary.includes('\n'));
    return multi ? null : (c.layout === 'vertical' ? 2 : 1);
  }
  return null;
}
function setSize(c, cols, rows) {
  const go = { ...(c.grid_options || {}) };
  if (cols === undefined) { /* unverändert */ } else if (cols == null) delete go.columns; else go.columns = cols;
  if (rows === undefined) { /* unverändert */ } else if (rows == null) delete go.rows; else go.rows = rows;
  if (Object.keys(go).length) c.grid_options = go; else delete c.grid_options;
  if (c.layout_options) {
    const lo = { ...c.layout_options };
    if (cols !== undefined) delete lo.grid_columns;
    if (rows !== undefined) delete lo.grid_rows;
    if (Object.keys(lo).length) c.layout_options = lo; else delete c.layout_options;
  }
}

function makeCard(eid, type) {
  const e = S.entMap[eid];
  switch (type) {
    case 'mushroom-entity': return { type: 'custom:mushroom-entity-card', entity: eid };
    case 'mushroom-template': return {
      type: 'custom:mushroom-template-card', entity: eid, primary: (e && (e.area || e.name)) || eid,
      secondary: `{{ states('${eid}') }}${e && e.unit ? ' ' + e.unit : ''}`, icon: entIcon(e),
    };
    case 'button': return { type: 'button', entity: eid, show_state: true };
    case 'entities': return { type: 'entities', entities: [eid] };
    case 'sensor': return { type: 'sensor', entity: eid, graph: 'line' };
    case 'history': return { type: 'history-graph', entities: [eid] };
    default: return { type: 'tile', entity: eid };
  }
}

const BLOCKS = [
  { id: 'heading', label: 'Überschrift', icon: 'mdi:format-header-1', make: () => ({ type: 'heading', heading: 'Überschrift' }) },
  { id: 'room', label: 'Raumkarte', icon: 'mdi:sofa-outline', make: () => ({ type: 'custom:mushroom-template-card', primary: 'Raum', secondary: '', icon: 'mdi:sofa-outline', icon_color: 'blue' }) },
  { id: 'tile', label: 'Kachel', icon: 'mdi:card-outline', make: () => ({ type: 'tile', entity: '' }) },
  { id: 'entities', label: 'Liste', icon: 'mdi:format-list-bulleted', make: () => ({ type: 'entities', title: 'Neue Liste', entities: [] }) },
  { id: 'markdown', label: 'Text', icon: 'mdi:format-text', make: () => ({ type: 'markdown', content: '## Text\nHier Text eingeben' }) },
  { id: 'button', label: 'Button', icon: 'mdi:gesture-tap-button', make: () => ({ type: 'button', name: 'Button', icon: 'mdi:power' }) },
  { id: 'chips', label: 'Chips', icon: 'mdi:dots-horizontal-circle-outline', make: () => ({ type: 'custom:mushroom-chips-card', chips: [] }) },
  { id: 'mtitle', label: 'Titel', icon: 'mdi:format-title', make: () => ({ type: 'custom:mushroom-title-card', title: 'Titel', subtitle: '' }) },
  { id: 'vstack', label: 'Stapel', icon: 'mdi:view-sequential-outline', make: () => ({ type: 'vertical-stack', cards: [] }) },
];
function newCardFromDrag(d) {
  if (d.src === 'entity') return makeCard(d.entity_id, $('#cardType').value);
  if (d.src === 'block') return BLOCKS.find((b) => b.id === d.block).make();
  return null;
}

function cardTitle(c) {
  const ent = c.entity ? S.entMap[c.entity] : null;
  return renderTpl(c.heading || c.title || c.name || c.primary || '') || (ent && ent.name) || c.entity || TYPE_NAMES[ctype(c)] || ctype(c) || 'Karte';
}
const TYPE_NAMES = {
  heading: 'Überschrift', tile: 'Kachel', entities: 'Liste', glance: 'Übersicht', markdown: 'Text', button: 'Button',
  sensor: 'Sensor', 'history-graph': 'Verlauf', 'vertical-stack': 'Stapel (vertikal)', 'horizontal-stack': 'Stapel (horizontal)',
  grid: 'Raster', 'mushroom-template-card': 'Raumkarte (Mushroom)', 'mushroom-entity-card': 'Mushroom Entity',
  'mushroom-title-card': 'Titel (Mushroom)', 'mushroom-chips-card': 'Chips (Mushroom)', 'button-card': 'button-card',
  conditional: 'Bedingte Karte', 'picture-elements': 'Bild mit Elementen', thermostat: 'Thermostat', 'weather-forecast': 'Wetter',
};
const typeName = (c) => TYPE_NAMES[ctype(c)] || ctype(c);

// ================================================================== Karten zeichnen (Nachbildung)
function iconColorFor(c, ent) {
  const explicit = resolveColor(renderTpl(c.icon_color || c.color || ''));
  if (explicit) return explicit;
  if (!ent) return null;
  const on = ['on', 'home', 'open', 'playing', 'unlocked'].includes(ent.state);
  if (['light', 'switch', 'input_boolean', 'fan', 'humidifier'].includes(ent.domain)) return on ? HA_COLORS.amber : HA_COLORS.grey;
  if (ent.domain === 'alarm_control_panel') return ent.state === 'disarmed' ? HA_COLORS.green : HA_COLORS.red;
  if (ent.domain === 'binary_sensor') return on ? HA_COLORS.red : HA_COLORS.grey;
  if (ent.domain === 'sensor' || ent.domain === 'person') return HA_COLORS['light-blue'];
  return HA_COLORS.grey;
}
function iconBubble(icon, color) {
  return el('div', { class: 'c-icon', style: color ? `--ic:${color}` : '' }, mdi(icon));
}

function bodyFor(c, depth = 0) {
  const t = ctype(c);
  const ent = c.entity ? S.entMap[c.entity] : null;
  if (t === 'heading') {
    return el('div', { class: 'c-heading' + (c.heading_style === 'subtitle' ? ' sub' : '') }, c.icon ? mdi(c.icon) : null, c.heading || '');
  }
  if (t === 'mushroom-title-card') {
    return el('div', { class: 'c-heading', style: 'flex-direction:column;align-items:flex-start;gap:2px;font-size:20px' },
      renderTpl(c.title || ''), c.subtitle ? el('span', { style: 'font-size:14px;color:var(--ha-sec)' }, renderTpl(c.subtitle)) : null);
  }
  if (t === 'mushroom-template-card') {
    const vertical = c.layout === 'vertical';
    return el('div', { class: 'c-tile', style: vertical ? 'flex-direction:column;justify-content:center;text-align:center' : '' },
      iconBubble(tplIcon(c.icon, 'mdi:shape-outline'), resolveColor(renderTpl(c.icon_color || '')) || HA_COLORS.grey),
      el('div', { class: 'c-txt' }, el('div', { class: 'c-pri' }, renderTpl(c.primary || '')),
        c.secondary ? el('div', { class: 'c-sec' }, renderTpl(c.secondary)) : null));
  }
  if (t === 'tile' || t === 'button-card' || (t.startsWith('mushroom-') && t !== 'mushroom-chips-card')) {
    const name = renderTpl(c.name || '') || (ent ? ent.name : (c.entity ? c.entity : 'Entität wählen …'));
    const showState = c.show_state !== false;
    const sec = ent && showState ? fmtState(ent) : (renderTpl(c.label || '') || '');
    const vertical = c.vertical || c.layout === 'vertical';
    return el('div', { class: 'c-tile', style: vertical ? 'flex-direction:column;justify-content:center;text-align:center' : '' },
      iconBubble(c.icon || entIcon(ent), iconColorFor(c, ent)),
      el('div', { class: 'c-txt' }, el('div', { class: 'c-pri' }, name), sec ? el('div', { class: 'c-sec' }, sec) : null));
  }
  if (t === 'mushroom-chips-card') {
    const chips = (c.chips || []).map((ch) => {
      const e = ch.entity ? S.entMap[ch.entity] : null;
      const content = renderTpl(ch.content || '') || (e ? fmtState(e) : '') || ch.type;
      return el('div', { class: 'c-chip' }, mdi(tplIcon(ch.icon, e ? entIcon(e) : 'mdi:circle-small')), content);
    });
    return el('div', { class: 'c-chips' }, chips.length ? chips : el('span', { class: 'c-chip' }, 'Chips (per Code ergänzen)'));
  }
  if (t === 'entities' || t === 'glance') {
    const rows = (c.entities || []).map((r) => (typeof r === 'string' ? { entity: r } : r || {}));
    return el('div', {},
      c.title ? el('div', { class: 'c-head' }, c.title) : null,
      el('div', { class: 'c-rows' },
        rows.map((r) => {
          if (!r.entity) return el('div', { class: 'c-row' }, el('span', { style: 'color:var(--ha-sec)' }, r.label || r.name || `[${r.type || 'Zeile'}]`));
          const e = S.entMap[r.entity];
          const toggleable = e && ['switch', 'light', 'input_boolean', 'fan', 'humidifier'].includes(e.domain) && e.state !== 'unavailable';
          return el('div', { class: 'c-row' }, mdi(r.icon || entIcon(e)), el('span', {}, r.name || (e ? e.name : r.entity)),
            toggleable ? el('div', { class: 'toggle' + (e.state === 'on' ? ' on' : '') }) : el('b', {}, e ? fmtState(e) : '⚠'));
        }),
        !rows.length ? el('div', { class: 'c-row add' }, 'Entitäten hierher ziehen') : null));
  }
  if (t === 'markdown') {
    const lines = String(c.content || '').split('\n');
    return el('div', { class: 'c-md' }, c.title ? el('h2', {}, c.title) : null,
      lines.map((l) => {
        const txt = renderTpl(l);
        const h = txt.match(/^(#{1,3})\s+(.*)$/);
        if (h) return el('h' + h[1].length, {}, h[2]);
        return txt.trim() ? el('p', {}, txt.replace(/\*\*(.*?)\*\*/g, '$1')) : null;
      }));
  }
  if (t === 'button') {
    const name = c.name || (ent ? ent.name : '');
    return el('div', { class: 'c-button', style: `--ic:${iconColorFor(c, ent) || 'var(--ha-sec)'}` },
      mdi(c.icon || entIcon(ent)), c.show_name === false ? null : el('div', { class: 'c-pri' }, name),
      c.show_state && ent ? el('div', { class: 'c-sec' }, fmtState(ent)) : null);
  }
  if (t === 'sensor') {
    return el('div', { class: 'c-generic' }, el('div', { class: 'c-sec' }, c.name || (ent ? ent.name : c.entity)),
      el('div', { style: 'font-size:28px' }, ent ? fmtState(ent) : '–'), c.graph ? el('div', { class: 'c-graph' }) : null);
  }
  if (t === 'history-graph' || t === 'statistics-graph') {
    return el('div', { class: 'c-generic' }, el('div', { class: 'c-pri' }, c.title || 'Verlauf'),
      el('div', { class: 'c-sec' }, (c.entities || []).map((r) => (typeof r === 'string' ? r : r.entity)).filter(Boolean).map((id) => (S.entMap[id] ? S.entMap[id].name : id)).join(', ')),
      el('div', { class: 'c-graph', style: 'height:60px' }));
  }
  if ((t === 'vertical-stack' || t === 'horizontal-stack' || t === 'grid') && depth < 3) {
    const kids = (c.cards || []).map((k) => el('div', { class: 'hc', style: 'cursor:inherit' }, bodyFor(k, depth + 1)));
    return el('div', { class: 'c-stack' + (t === 'horizontal-stack' ? ' row' : '') },
      c.title ? el('div', { class: 'c-pri' }, c.title) : null,
      kids.length ? kids : el('div', {}, 'Leerer Stapel – Karten per Code ergänzen'));
  }
  if (t === 'conditional' && c.card && depth < 3) {
    return el('div', {}, el('div', { class: 'c-sec', style: 'padding:4px 10px 0' }, 'bedingt sichtbar'), bodyFor(c.card, depth + 1));
  }
  return el('div', { class: 'c-generic' }, el('div', { class: 'tag' }, typeName(c)),
    el('div', { class: 'c-pri' }, cardTitle(c)), ent ? el('div', { class: 'c-sec' }, fmtState(ent)) : null);
}

// ================================================================== Undo / Änderungen
function mutate(fn, key) {
  const now = Date.now();
  if (!(key && key === S.lastKey && now - S.lastT < 1200)) {
    S.undo.push(JSON.stringify(S.config));
    if (S.undo.length > 200) S.undo.shift();
    S.redo = [];
  }
  S.lastKey = key || null; S.lastT = now;
  fn();
  if (key) { renderCanvas(); updateToolbar(); scheduleEntities(); }
  else render();
}
function undo() {
  if (!S.undo.length) return;
  S.redo.push(JSON.stringify(S.config));
  S.config = JSON.parse(S.undo.pop());
  S.lastKey = null;
  fixAfterChange();
  render();
}
function redo() {
  if (!S.redo.length) return;
  S.undo.push(JSON.stringify(S.config));
  S.config = JSON.parse(S.redo.pop());
  S.lastKey = null;
  fixAfterChange();
  render();
}
function fixAfterChange() {
  S.view = clamp(S.view, 0, Math.max(0, S.config.views.length - 1));
  if (S.sel && !selObj()) S.sel = null;
}
let entTimer = null;
function scheduleEntities() { clearTimeout(entTimer); entTimer = setTimeout(renderEntities, 400); }

// ================================================================== Auswahl
function selObj() {
  const s = S.sel; const v = curView();
  if (!s || !v || s.view !== S.view) return null;
  if (s.kind === 'card') return getCards(v, s.cid)[s.index] || null;
  if (s.kind === 'section') return (v.sections || [])[s.index] || null;
  if (s.kind === 'view') return v;
  return null;
}
function select(sel) {
  S.sel = sel ? { view: S.view, ...sel } : null;
  if (S.tab !== 'format') switchTab('format');
  renderCanvas();
  renderProps();
  updateToolbar();
}

// ================================================================== Laden
async function init() {
  buildStaticUI();
  try {
    const st = await api('status');
    const m = $('#mode');
    m.textContent = st.mode === 'demo' ? 'Demo-Modus' : st.target;
    if (st.mode === 'demo') m.classList.add('demo');
  } catch { /* egal */ }
  try { S.dashboards = await api('dashboards'); } catch (e) {
    toast(e.message, 'err');
    $('#canvas').replaceChildren(el('div', { class: 'notice' }, 'Keine Verbindung zu Home Assistant: ', e.message));
    return;
  }
  let start = null;
  try { start = localStorage.getItem('hdb.dash'); } catch { /* egal */ }
  if (!S.dashboards.some((d) => d.key === start)) start = S.dashboards[0].key;
  S.dash = start;
  fillDashSelect();
  loadEntities();
  loadTemplates();
  await loadDashboard(start);
}

function fillDashSelect() {
  $('#dashSelect').replaceChildren(...S.dashboards.map((d) => el('option', { value: d.key },
    d.title + (d.mode === 'yaml' ? ' (YAML-Modus, nur lesen)' : ''))));
  if (S.dash) $('#dashSelect').value = S.dash;
}

async function loadEntities() {
  try { S.entities = await api('entities'); } catch (e) { toast('Entitäten konnten nicht geladen werden: ' + e.message, 'err'); return; }
  S.entMap = Object.fromEntries(S.entities.map((e) => [e.entity_id, e]));
  const areas = [...new Set(S.entities.map((e) => e.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  const domains = [...new Set(S.entities.map((e) => e.domain))].sort();
  $('#areaFilter').replaceChildren(el('option', { value: '' }, 'Alle Räume'),
    ...areas.map((a) => el('option', { value: a }, a)), el('option', { value: '__none__' }, 'Ohne Raum'));
  $('#domainFilter').replaceChildren(el('option', { value: '' }, 'Alle Typen'), ...domains.map((d) => el('option', { value: d }, d)));
  $('#entOptions').replaceChildren(...S.entities.map((e) => el('option', { value: e.entity_id }, `${e.name}${e.area ? ' · ' + e.area : ''}`)));
  render();
  renderTemplates();
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
  S.undo = []; S.redo = []; S.view = 0; S.sel = null; S.lastKey = null;
  $('#dashSelect').value = key;
  render();
  if (S.tab === 'versions') loadVersions();
}

// ================================================================== Rendern
function render() {
  if (!S.config) return;
  renderTabs();
  renderCanvas();
  renderProps();
  renderEntities();
  updateToolbar();
}

function updateToolbar() {
  $('#dirty').hidden = !isDirty();
  $('#btnUndo').disabled = !S.undo.length;
  $('#btnRedo').disabled = !S.redo.length;
  const d = S.dashboards.find((x) => x.key === S.dash);
  $('#btnPush').disabled = !!(d && d.mode === 'yaml');
  const o = selObj();
  $('#selInfo').textContent = !o ? 'Nichts ausgewählt – klicke eine Karte an'
    : S.sel.kind === 'card' ? `Karte: ${cardTitle(o)} (${typeName(o)}) · ${cardSpan(o)}/12 Spalten · ${cardRows(o) || 'auto'} Zeilen`
      : S.sel.kind === 'section' ? `Abschnitt ${S.sel.index + 1} · Breite ${o.column_span || 1}` : `Ansicht: ${viewLabel(o, S.view)}`;
}

const viewLabel = (v, i) => v.title || v.path || (v.icon ? v.icon.replace('mdi:', '') : '') || `Ansicht ${i + 1}`;

function renderTabs() {
  const nav = $('#viewTabs');
  nav.replaceChildren();
  S.config.views.forEach((v, i) => {
    const t = el('button', {
      class: 'tab' + (i === S.view ? ' active' : ''), draggable: 'true',
      title: 'Klicken zum Öffnen · ziehen zum Umsortieren · Karte hierher ziehen = in diese Ansicht verschieben',
      onclick: () => { S.view = i; S.sel = { view: i, kind: 'view' }; render(); },
    }, v.icon ? mdi(v.icon) : null, v.title || (v.icon ? '' : viewLabel(v, i)));
    t.addEventListener('dragstart', (e) => { S.drag = { src: 'view', index: i }; e.dataTransfer.setData('text/plain', 'view'); });
    t.addEventListener('dragover', (e) => {
      if (!S.drag || !['view', 'card'].includes(S.drag.src) || (S.drag.src === 'view' && S.drag.index === i) || (S.drag.src === 'card' && S.drag.view === i)) return;
      e.preventDefault(); t.classList.add('drop-hl');
    });
    t.addEventListener('dragleave', () => t.classList.remove('drop-hl'));
    t.addEventListener('drop', (e) => {
      e.preventDefault(); t.classList.remove('drop-hl');
      const d = S.drag; if (!d) return;
      if (d.src === 'view') {
        mutate(() => { const [x] = S.config.views.splice(d.index, 1); S.config.views.splice(i, 0, x); S.view = i; S.sel = null; });
      } else if (d.src === 'card') {
        mutate(() => {
          const [card] = getCards(S.config.views[d.view], d.cid).splice(d.index, 1);
          const target = S.config.views[i];
          if (isSectionsView(target)) {
            if (!target.sections || !target.sections.length) target.sections = [{ type: 'grid', cards: [] }];
            getCards(target, 's' + (target.sections.length - 1), true).push(card);
          } else getCards(target, 'c', true).push(card);
          S.sel = null;
        });
        toast(`Karte nach „${viewLabel(S.config.views[i], i)}“ verschoben`);
      }
    });
    nav.append(t);
  });
  nav.append(el('button', { class: 'tab add', onclick: addView, title: 'Neue Ansicht' }, el('i', { class: 'mdi mdi-plus' }), 'Ansicht'));
}

function renderCanvas() {
  const cv = $('#canvas');
  cv.className = 'canvas dev-' + S.dev;
  cv.style.zoom = S.zoom;
  cv.replaceChildren();
  S.ph = null;
  const v = curView();
  if (S.config.strategy && !S.config.views.length) {
    cv.append(el('div', { class: 'notice' }, 'Dieses Dashboard wird automatisch von Home Assistant erzeugt.', el('br'),
      el('button', { class: 'primary', onclick: addView, style: 'margin-top:12px' }, 'Eigene Ansicht anlegen')));
    return;
  }
  if (!v) {
    cv.append(el('div', { class: 'notice' }, 'Noch keine Ansicht vorhanden.', el('br'),
      el('button', { class: 'primary', onclick: addView, style: 'margin-top:12px' }, 'Erste Ansicht anlegen')));
    return;
  }
  if (isSectionsView(v)) {
    const cols = clamp(v.max_columns || 4, 1, 10);
    // Spaltenbreite an die verfügbare Fläche anpassen (wie HA: schmalere Spalten statt abschneiden)
    const avail = ($('#canvasWrap').clientWidth - 40) / S.zoom - 40;
    const colw = clamp(Math.floor((avail - (cols - 1) * 16) / cols), 200, 440);
    const board = el('div', { class: 'board', style: `--cols:${cols};--colw:${colw}px` });
    (v.sections || []).forEach((s, i) => board.append(renderSection(v, s, i, cols)));
    board.append(renderNewSection());
    cv.append(board);
  } else {
    cv.append(el('div', { class: 'notice', style: 'padding:0 0 14px' },
      'Diese Ansicht nutzt das alte Masonry-Layout – Größen lassen sich dort nicht einstellen. ',
      el('button', { onclick: convertToSections }, el('i', { class: 'mdi mdi-view-grid-plus-outline' }), 'In Raster umwandeln')));
    const board = el('div', { class: 'board', style: '--cols:1;--colw:min(760px, 100%)' });
    const sec = el('div', { class: 'sec', style: '--span:1' });
    sec.append(renderGrid(v, 'c'));
    board.append(sec);
    cv.append(board);
  }
}

function renderSection(v, s, idx, cols) {
  const cid = 's' + idx;
  const span = clamp(s.column_span || 1, 1, cols);
  const selected = S.sel && S.sel.kind === 'section' && S.sel.index === idx && S.sel.view === S.view;
  const sec = el('div', { class: 'sec' + (selected ? ' sel' : ''), style: `grid-column: span ${span}; --span:${span}` });
  sec.dataset.index = idx;
  const bar = el('div', { class: 'sec-bar', draggable: 'true', title: 'Abschnitt: anklicken zum Auswählen, ziehen zum Verschieben' },
    el('i', { class: 'mdi mdi-drag', style: 'font-size:14px' }), `Abschnitt ${idx + 1}`);
  bar.addEventListener('click', (e) => { e.stopPropagation(); select({ kind: 'section', index: idx }); });
  bar.addEventListener('dragstart', (e) => { S.drag = { src: 'section', index: idx }; e.dataTransfer.setData('text/plain', 'section'); e.dataTransfer.setDragImage(sec, 20, 20); });
  const rz = el('div', { class: 'sec-resize', title: 'Breite des Abschnitts ziehen' });
  rz.addEventListener('pointerdown', (e) => startSectionResize(e, sec, s, cols));
  sec.append(bar, renderGrid(v, cid), rz);
  sec.addEventListener('click', (e) => { if (e.target === sec) select({ kind: 'section', index: idx }); });
  sec.addEventListener('contextmenu', (e) => { if (e.target.closest('.hc')) return; e.preventDefault(); select({ kind: 'section', index: idx }); showCtx(e, sectionMenu(idx)); });
  sec.addEventListener('dragover', (e) => {
    if (!S.drag || S.drag.src !== 'section' || S.drag.index === idx) return;
    e.preventDefault(); clearMarks();
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
    mutate(() => { const [x] = v.sections.splice(from, 1); v.sections.splice(to, 0, x); S.sel = { view: S.view, kind: 'section', index: to }; });
  });
  return sec;
}

function renderNewSection() {
  const z = el('div', { class: 'newsec', onclick: addSection },
    el('div', {}, el('i', { class: 'mdi mdi-plus-box-outline', style: 'font-size:26px' }), el('br'), 'Neuer Abschnitt', el('br'),
      el('small', {}, 'klicken oder Element hierher ziehen')));
  z.addEventListener('dragover', (e) => {
    if (!S.drag || !DROP_SRC.includes(S.drag.src)) return;
    e.preventDefault(); removePh(); z.classList.add('drop-hl');
  });
  z.addEventListener('dragleave', () => z.classList.remove('drop-hl'));
  z.addEventListener('drop', (e) => {
    e.preventDefault(); z.classList.remove('drop-hl');
    const d = S.drag; if (!d) return;
    if (d.src === 'template') { insertTemplate(d.id, { newSection: true }); return; }
    mutate(() => {
      const v = curView();
      let card;
      if (d.src === 'card') [card] = getCards(S.config.views[d.view], d.cid).splice(d.index, 1);
      else card = newCardFromDrag(d);
      if (!v.sections) v.sections = [];
      v.sections.push({ type: 'grid', cards: [card] });
      S.sel = { view: S.view, kind: 'card', cid: 's' + (v.sections.length - 1), index: 0 };
    });
  });
  return z;
}

function renderGrid(v, cid) {
  const cards = getCards(v, cid, false);
  const grid = el('div', { class: 'grid12' });
  grid.dataset.cid = cid;
  cards.forEach((c, i) => grid.append(renderCard(c, cid, i)));
  if (!cards.length) grid.append(el('div', { class: 'empty' }, 'Elemente hierher ziehen'));

  grid.addEventListener('dragover', (e) => {
    const d = S.drag;
    if (!d || !DROP_SRC.includes(d.src)) return;
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = d.src === 'card' ? 'move' : 'copy';
    const into = d.src === 'entity' ? intoTarget(grid, e) : null;
    document.querySelectorAll('.drop-into').forEach((n) => n.classList.remove('drop-into'));
    if (into != null) {
      removePh();
      grid.querySelectorAll(':scope > .hc')[into].classList.add('drop-into');
      S.drop = { cid, into };
      return;
    }
    const idx = dropIndex(grid, e);
    placePh(grid, idx);
    S.drop = { cid, index: idx };
  });
  grid.addEventListener('drop', (e) => {
    const d = S.drag;
    if (!d || !DROP_SRC.includes(d.src)) return;
    e.preventDefault(); e.stopPropagation();
    const t = S.drop && S.drop.cid === cid ? S.drop : { cid, index: dropIndex(grid, e) };
    clearMarks();
    handleDrop(cid, t, d);
  });
  return grid;
}

function renderCard(c, cid, i) {
  const t = ctype(c);
  const span = cardSpan(c);
  const rows = cardRows(c);
  const selected = S.sel && S.sel.kind === 'card' && S.sel.cid === cid && S.sel.index === i && S.sel.view === S.view;
  const missing = c.entity && S.entities.length && !S.entMap[c.entity];
  const bg = cardBg(c);
  let style = `grid-column: span ${span};`;
  if (rows) style += `grid-row: span ${rows}; height:${rows * ROW_H + (rows - 1) * GAP}px;`;
  if (bg) style += `background:${bg};`;
  const n = el('div', { class: `hc t-${t}` + (selected ? ' sel' : '') + (missing ? ' missing' : ''), draggable: 'true', style });
  n.dataset.index = i;
  if (Array.isArray(c.entities)) n.dataset.accepts = '1';
  n.append(el('div', { class: 'clip' }, bodyFor(c)));
  n.append(el('div', { class: 'size-badge' }, `${span}/12 · ${rows ? rows + ' Z.' : 'auto'}`));
  for (const dir of ['e', 's', 'se']) {
    const h = el('div', { class: 'hd hd-' + dir });
    h.addEventListener('pointerdown', (e) => startCardResize(e, n, cid, i, dir));
    n.append(h);
  }
  n.addEventListener('click', (e) => { e.stopPropagation(); select({ kind: 'card', cid, index: i }); });
  n.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); select({ kind: 'card', cid, index: i }); showCtx(e, cardMenu()); });
  n.addEventListener('dragstart', (e) => {
    e.stopPropagation();
    S.drag = { src: 'card', view: S.view, cid, index: i, span, rows };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'card');
    requestAnimationFrame(() => n.classList.add('dragging'));
  });
  return n;
}

// ---------- Ziehen mit Platzhalter (Einrasten)
function dragSize() {
  const d = S.drag;
  if (!d) return { span: 6, rows: 1 };
  if (d.src === 'card') return { span: d.span, rows: d.rows };
  let card = null;
  if (d.src === 'entity') card = makeCard(d.entity_id, $('#cardType').value);
  else if (d.src === 'block') card = BLOCKS.find((b) => b.id === d.block).make();
  else if (d.src === 'template') { const t = S.templates.find((x) => x.id === d.id); card = t && t.card; }
  return card ? { span: cardSpan(card), rows: cardRows(card) } : { span: 6, rows: 1 };
}
function visibleCards(grid) {
  return [...grid.querySelectorAll(':scope > .hc')].filter((n) => !n.classList.contains('dragging'));
}
function dropIndex(grid, e) {
  const nodes = visibleCards(grid);
  for (const [i, n] of nodes.entries()) {
    const r = n.getBoundingClientRect();
    if (e.clientY < r.top) return i;
    if (e.clientY <= r.bottom && e.clientX < r.left + r.width / 2) return i;
  }
  return nodes.length;
}
function intoTarget(grid, e) {
  const nodes = [...grid.querySelectorAll(':scope > .hc')];
  for (const [i, n] of nodes.entries()) {
    if (n.dataset.accepts !== '1') continue;
    const r = n.getBoundingClientRect();
    if (e.clientX > r.left + r.width * 0.12 && e.clientX < r.right - r.width * 0.12 &&
        e.clientY > r.top + r.height * 0.2 && e.clientY < r.bottom - r.height * 0.2) return i;
  }
  return null;
}
function placePh(grid, idx) {
  if (!S.ph) {
    const { span, rows } = dragSize();
    S.ph = el('div', { class: 'ph' });
    S.ph.style.gridColumn = `span ${span}`;
    if (rows) S.ph.style.height = `${rows * ROW_H + (rows - 1) * GAP}px`;
  }
  if (S.ph.parentNode === grid && +S.ph.dataset.idx === idx) return;
  const nodes = visibleCards(grid);
  const empty = grid.querySelector(':scope > .empty');
  if (empty) empty.hidden = true;
  if (idx < nodes.length) grid.insertBefore(S.ph, nodes[idx]); else grid.append(S.ph);
  S.ph.dataset.idx = idx;
}
function removePh() {
  if (S.ph && S.ph.parentNode) {
    const g = S.ph.parentNode;
    S.ph.remove();
    const empty = g.querySelector(':scope > .empty');
    if (empty) empty.hidden = false;
  }
}
function clearMarks() {
  removePh();
  document.querySelectorAll('.ins-before,.ins-after,.drop-into,.drop-hl')
    .forEach((n) => n.classList.remove('ins-before', 'ins-after', 'drop-into', 'drop-hl'));
}

function handleDrop(cid, t, d) {
  if (d.src === 'template') { insertTemplate(d.id, { cid, index: t.index, view: S.view }); return; }
  if (d.src === 'card' && d.view === S.view && d.cid === cid && t.into == null && (t.index === d.index || t.index === d.index + 1)) {
    renderCanvas(); return;
  }
  mutate(() => {
    const view = curView();
    if (t.into != null) {
      const card = getCards(view, cid)[t.into];
      if (!Array.isArray(card.entities)) card.entities = [];
      card.entities.push(d.entity_id);
      S.sel = { view: S.view, kind: 'card', cid, index: t.into };
      return;
    }
    let idx = t.index;
    let card;
    if (d.src === 'card') {
      [card] = getCards(S.config.views[d.view], d.cid).splice(d.index, 1);
      if (d.view === S.view && d.cid === cid && d.index < idx) idx--;
    } else card = newCardFromDrag(d);
    getCards(view, cid, true).splice(idx, 0, card);
    S.sel = { view: S.view, kind: 'card', cid, index: idx };
  });
}

// ---------- Größe ändern
function startCardResize(e, node, cid, i, dir) {
  e.preventDefault(); e.stopPropagation();
  const card = getCards(curView(), cid)[i];
  const grid = node.parentElement;
  const gr = grid.getBoundingClientRect();
  const z = gr.width / grid.offsetWidth || 1;
  const gapS = GAP * z;
  const colW = (gr.width - 11 * gapS) / 12;
  const rowS = ROW_H * z;
  const r0 = node.getBoundingClientRect();
  const x0 = e.clientX; const y0 = e.clientY;
  let cols = cardSpan(card); let rows = cardRows(card);
  const badge = node.querySelector('.size-badge');
  node.classList.add('resizing');
  const move = (ev) => {
    if (dir.includes('e')) {
      cols = clamp(Math.round((r0.width + ev.clientX - x0 + gapS) / (colW + gapS)), 1, 12);
      node.style.gridColumn = `span ${cols}`;
    }
    if (dir.includes('s')) {
      rows = clamp(Math.round((r0.height + ev.clientY - y0 + gapS) / (rowS + gapS)), 1, 12);
      node.style.gridRow = `span ${rows}`;
      node.style.height = `${rows * ROW_H + (rows - 1) * GAP}px`;
    }
    badge.textContent = `${cols}/12 · ${rows ? rows + ' Z.' : 'auto'}`;
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    node.classList.remove('resizing');
    const before = [cardSpan(card), cardRows(card)];
    if (before[0] === cols && before[1] === rows) return;
    mutate(() => {
      const c = getCards(curView(), cid)[i];
      setSize(c, dir.includes('e') ? cols : undefined, dir.includes('s') ? rows : undefined);
    });
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function startSectionResize(e, secNode, s, cols) {
  e.preventDefault(); e.stopPropagation();
  const board = secNode.parentElement;
  const br = board.getBoundingClientRect();
  const z = br.width / board.offsetWidth || 1;
  const gapS = 16 * z;
  const colW = (br.width - (cols - 1) * gapS) / cols;
  const r0 = secNode.getBoundingClientRect();
  const x0 = e.clientX;
  let span = s.column_span || 1;
  const move = (ev) => {
    span = clamp(Math.round((r0.width + ev.clientX - x0 + gapS) / (colW + gapS)), 1, cols);
    secNode.style.gridColumn = `span ${span}`;
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (span === (s.column_span || 1)) return;
    mutate(() => { if (span > 1) s.column_span = span; else delete s.column_span; });
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

// ================================================================== Bearbeiten-Befehle
function selCards() {
  if (!S.sel || S.sel.kind !== 'card') return null;
  return getCards(curView(), S.sel.cid);
}
function deleteSelection() {
  const o = selObj(); if (!o) return;
  if (S.sel.kind === 'card') mutate(() => { selCards().splice(S.sel.index, 1); S.sel = null; });
  else if (S.sel.kind === 'section') {
    const n = (o.cards || []).length;
    if (n && !confirm(`Abschnitt mit ${n} Karte(n) löschen?`)) return;
    mutate(() => { curView().sections.splice(S.sel.index, 1); S.sel = null; });
  }
}
function duplicateSelection() {
  const o = selObj(); if (!o) return;
  if (S.sel.kind === 'card') mutate(() => { selCards().splice(S.sel.index + 1, 0, clone(o)); S.sel.index += 1; });
  else if (S.sel.kind === 'section') mutate(() => { curView().sections.splice(S.sel.index + 1, 0, clone(o)); S.sel.index += 1; });
}
function copySelection(cut) {
  const o = selObj();
  if (!o || S.sel.kind !== 'card') return;
  S.clip = clone(o);
  if (cut) mutate(() => { selCards().splice(S.sel.index, 1); S.sel = null; });
  toast(cut ? 'Ausgeschnitten' : 'Kopiert');
}
function pasteClip() {
  if (!S.clip) { toast('Zwischenablage ist leer'); return; }
  const card = clone(S.clip);
  if (S.sel && S.sel.kind === 'card' && selObj()) {
    mutate(() => { selCards().splice(S.sel.index + 1, 0, card); S.sel.index += 1; });
  } else if (S.sel && S.sel.kind === 'section' && selObj()) {
    const idx = S.sel.index;
    mutate(() => { const arr = getCards(curView(), 's' + idx, true); arr.push(card); S.sel = { view: S.view, kind: 'card', cid: 's' + idx, index: arr.length - 1 }; });
  } else placeCard(card, {});
}
function moveSelection(delta) {
  const arr = selCards(); if (!arr) return;
  const i = S.sel.index; const j = i + delta;
  if (j < 0 || j >= arr.length) return;
  mutate(() => { const [x] = arr.splice(i, 1); arr.splice(j, 0, x); S.sel.index = j; });
}
function placeCard(card, place) {
  mutate(() => {
    const v = S.config.views[place.view ?? S.view] || curView();
    if (place.newSection) {
      if (!v.sections) v.sections = [];
      v.sections.push({ type: 'grid', cards: [card] });
      S.sel = { view: S.view, kind: 'card', cid: 's' + (v.sections.length - 1), index: 0 };
    } else if (place.cid) {
      getCards(v, place.cid, true).splice(place.index, 0, card);
      S.sel = { view: S.view, kind: 'card', cid: place.cid, index: place.index };
    } else if (isSectionsView(v)) {
      if (!v.sections || !v.sections.length) v.sections = [{ type: 'grid', cards: [] }];
      const cid = 's' + (v.sections.length - 1);
      const arr = getCards(v, cid, true); arr.push(card);
      S.sel = { view: S.view, kind: 'card', cid, index: arr.length - 1 };
    } else { const arr = getCards(v, 'c', true); arr.push(card); S.sel = { view: S.view, kind: 'card', cid: 'c', index: arr.length - 1 }; }
  });
}

// ---------- Kontextmenü
function cardMenu() {
  return [
    ['mdi:content-cut', 'Ausschneiden', 'Strg+X', () => copySelection(true)],
    ['mdi:content-copy', 'Kopieren', 'Strg+C', () => copySelection(false)],
    ['mdi:content-paste', 'Einfügen', 'Strg+V', pasteClip],
    ['mdi:content-duplicate', 'Duplizieren', 'Strg+D', duplicateSelection],
    '-',
    ['mdi:arrow-left', 'Nach vorne verschieben', '←', () => moveSelection(-1)],
    ['mdi:arrow-right', 'Nach hinten verschieben', '→', () => moveSelection(1)],
    '-',
    ['mdi:star-outline', 'Als Vorlage speichern', '', () => saveAsTemplate(selObj())],
    ['mdi:code-braces', 'Code bearbeiten …', '', () => editCode()],
    '-',
    ['mdi:delete-outline', 'Löschen', 'Entf', deleteSelection],
  ];
}
function sectionMenu() {
  return [
    ['mdi:content-paste', 'Karte einfügen', 'Strg+V', pasteClip],
    ['mdi:format-header-1', 'Überschrift hinzufügen', '', () => { const i = S.sel.index; mutate(() => { getCards(curView(), 's' + i, true).unshift({ type: 'heading', heading: 'Überschrift' }); S.sel = { view: S.view, kind: 'card', cid: 's' + i, index: 0 }; }); }],
    ['mdi:content-duplicate', 'Abschnitt duplizieren', 'Strg+D', duplicateSelection],
    '-',
    ['mdi:delete-outline', 'Abschnitt löschen', 'Entf', deleteSelection],
  ];
}
function showCtx(e, items) {
  const m = $('#ctxMenu');
  m.replaceChildren(...items.map((it) => (it === '-' ? el('hr') :
    el('button', { onclick: () => { hideCtx(); it[3](); } }, mdi(it[0]), it[1], it[2] ? el('kbd', {}, it[2]) : null))));
  m.hidden = false;
  const w = m.offsetWidth; const h = m.offsetHeight;
  m.style.left = Math.min(e.clientX, innerWidth - w - 8) + 'px';
  m.style.top = Math.min(e.clientY, innerHeight - h - 8) + 'px';
}
function hideCtx() { $('#ctxMenu').hidden = true; }

// ================================================================== Format-Fenster
function switchTab(tab) {
  S.tab = tab;
  document.querySelectorAll('.ins-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  $('#formatPane').hidden = tab !== 'format';
  $('#versionsPane').hidden = tab !== 'versions';
  if (tab === 'versions') loadVersions();
}

// Feld-Bausteine
function field(label, input, sub) {
  return el('div', { class: 'f' }, el('label', {}, label), input, sub ? el('div', { class: 'sub' }, sub) : null);
}
function textField(label, value, onInput, opts = {}) {
  const inp = opts.multiline ? el('textarea', { spellcheck: 'false' }) : el('input', { type: 'text', placeholder: opts.placeholder || '' });
  inp.value = value == null ? '' : value;
  inp.addEventListener('input', () => onInput(inp.value));
  return field(label, inp, opts.sub);
}
function entityField(label, value, onChange, opts = {}) {
  const inp = el('input', { type: 'text', list: 'entOptions', placeholder: 'Entität suchen …', spellcheck: 'false' });
  inp.value = value || '';
  const info = el('div', { class: 'sub' });
  const upd = () => {
    const e = S.entMap[inp.value.trim()];
    info.textContent = e ? `${e.name}${e.area ? ' · ' + e.area : ''} · ${fmtState(e)}` : (inp.value.trim() ? '⚠ Entität nicht gefunden' : (opts.hint || ''));
  };
  inp.addEventListener('input', () => { upd(); const v = inp.value.trim(); if (!v || S.entMap[v]) onChange(v); });
  inp.addEventListener('change', () => onChange(inp.value.trim()));
  upd();
  return el('div', { class: 'f' }, el('label', {}, label), inp, info);
}
function iconField(label, value, onChange) {
  const prev = el('div', { class: 'icon-prev' }, mdi(value || ''));
  const inp = el('input', { type: 'text', list: 'iconOptions', placeholder: 'mdi:…', spellcheck: 'false' });
  inp.value = value || '';
  inp.addEventListener('input', () => {
    prev.replaceChildren(mdi(inp.value.trim()));
    onChange(inp.value.trim());
  });
  return field(label, el('div', { class: 'inline' }, prev, inp), 'Name aus materialdesignicons.com, z. B. mdi:sofa');
}
function swatchField(label, value, onChange, opts = {}) {
  const list = opts.list || Object.keys(HA_COLORS).filter((k) => !['primary', 'accent', 'disabled', 'black', 'white'].includes(k)).map((k) => [k, k]);
  const box = el('div', { class: 'swatches' });
  const mk = (val, css, title) => {
    const b = el('button', { class: 'sw' + (val ? '' : ' none') + ((value || '') === (val || '') ? ' on' : ''), title, style: css ? `background:${css}` : '' });
    b.addEventListener('click', () => { box.querySelectorAll('.sw').forEach((x) => x.classList.remove('on')); b.classList.add('on'); onChange(val); });
    return b;
  };
  box.append(mk('', null, opts.noneLabel || 'Standard'));
  for (const [val, title] of list) box.append(mk(val, resolveColor(val) || val, title));
  return field(label, box, opts.sub);
}
function sizeField(c) {
  const opts = [[3, '¼'], [4, '⅓'], [6, '½'], [8, '⅔'], [9, '¾'], [12, 'Ganz']];
  const cur = cardSpan(c);
  const box = el('div', { class: 'sizes' }, opts.map(([v, l]) =>
    el('button', { class: cur === v ? 'on' : '', onclick: () => mutate(() => setSize(selObj(), v, undefined)), title: `${v} von 12 Spalten` }, l)));
  const rowsSel = el('select', {}, el('option', { value: '' }, 'Automatisch (Inhalt)'),
    [1, 2, 3, 4, 5, 6, 8].map((r) => el('option', { value: String(r) }, `${r} Zeile${r > 1 ? 'n' : ''} (${r * ROW_H + (r - 1) * GAP} px)`)));
  const rows = (c.grid_options && typeof c.grid_options.rows === 'number') || (c.layout_options && typeof c.layout_options.grid_rows === 'number') ? String(cardRows(c)) : '';
  rowsSel.value = rows;
  rowsSel.addEventListener('change', () => mutate(() => setSize(selObj(), undefined, rowsSel.value ? +rowsSel.value : null)));
  return el('div', { class: 'fs' }, el('h4', {}, 'Größe'),
    field(`Breite – ${cur} von 12`, box), field('Höhe', rowsSel, 'Tipp: Ziehe an den Anfassern der ausgewählten Karte.'));
}
function rowsField(c, key = 'entities') {
  const box = el('div', { class: 'rowlist' });
  const rows = c[key] || [];
  rows.forEach((r, i) => {
    const id = typeof r === 'string' ? r : (r && r.entity) || '';
    const inp = el('input', { type: 'text', list: 'entOptions', spellcheck: 'false' });
    inp.value = id;
    if (typeof r !== 'string' && r && !r.entity) inp.value = `[${r.type || 'Zeile'}]`, inp.disabled = true;
    inp.addEventListener('change', () => {
      const v = inp.value.trim(); if (!v) return;
      mutate(() => { const o = selObj(); if (typeof o[key][i] === 'string') o[key][i] = v; else o[key][i] = { ...o[key][i], entity: v }; renderProps(); }, 'row' + i);
    });
    box.append(el('div', { class: 'rowitem' }, inp,
      el('button', { class: 'icon', title: 'nach oben', disabled: i === 0, onclick: () => mutate(() => { const a = selObj()[key]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; }) }, mdi('mdi:arrow-up')),
      el('button', { class: 'icon danger', title: 'entfernen', onclick: () => mutate(() => selObj()[key].splice(i, 1)) }, mdi('mdi:close'))));
  });
  const add = el('input', { type: 'text', list: 'entOptions', placeholder: '+ Entität hinzufügen …', spellcheck: 'false' });
  add.addEventListener('change', () => { const v = add.value.trim(); if (!v) return; mutate(() => { const o = selObj(); if (!Array.isArray(o[key])) o[key] = []; o[key].push(v); }); });
  box.append(add);
  return field('Zeilen', box, 'Tipp: Entitäten auch direkt auf die Karte ziehen.');
}
function bgField(c) {
  const ok = !(c.card_mod && c.card_mod.style != null && typeof c.card_mod.style !== 'string');
  if (!ok) return field('Hintergrund', el('div', { class: 'sub' }, 'Komplexer card-mod-Stil – bitte im Code ändern.'));
  return swatchField('Hintergrund', cardBg(c) || '', (v) => mutate(() => setCardBg(selObj(), v || null), 'bg'),
    { list: BG_COLORS.map(([n, v]) => [v, n]), noneLabel: 'Kein Hintergrund', sub: 'wird als card-mod-Stil gespeichert' });
}
function setProp(key, val, groupKey) {
  mutate(() => {
    const o = selObj();
    if (val === '' || val == null) delete o[key]; else o[key] = val;
  }, groupKey || key);
  refreshInsHead();
}

function refreshInsHead() {
  const o = selObj();
  const h = $('#formatPane .ins-head');
  if (!o || !h || S.sel.kind !== 'card') return;
  h.querySelector('b').textContent = cardTitle(o);
}

function renderProps() {
  const p = $('#formatPane');
  p.replaceChildren();
  const o = selObj();
  if (!S.config) return;
  if (!o || S.sel.kind === 'view') { p.append(...viewProps()); return; }
  if (S.sel.kind === 'section') { p.append(...sectionProps(o)); return; }
  const c = o;
  const t = ctype(c);
  const ent = c.entity ? S.entMap[c.entity] : null;
  const out = [];
  out.push(el('div', { class: 'ins-head' }, mdi(c.icon && !String(c.icon).includes('{') ? c.icon : (ent ? entIcon(ent) : 'mdi:card-outline')),
    el('div', {}, el('b', {}, cardTitle(c)), el('div', { class: 'type' }, typeName(c)))));
  const content = el('div', { class: 'fs' }, el('h4', {}, 'Inhalt'));
  const add = (...n) => content.append(...n);

  if (t === 'heading') {
    add(textField('Text', c.heading, (v) => setProp('heading', v)),
      iconField('Icon', c.icon, (v) => setProp('icon', v)),
      field('Stil', (() => { const s = el('select', {}, el('option', { value: 'title' }, 'Titel'), el('option', { value: 'subtitle' }, 'Untertitel')); s.value = c.heading_style || 'title'; s.onchange = () => setProp('heading_style', s.value === 'title' ? '' : s.value); return s; })()));
  } else if (t === 'mushroom-template-card') {
    add(textField('Titel', c.primary, (v) => setProp('primary', v), { sub: 'darf Vorlagen wie {{ states(\'sensor.x\') }} enthalten' }));
    const sec = textField('Untertitel / Werte', c.secondary, (v) => setProp('secondary', v), { multiline: true });
    const pick = el('input', { type: 'text', list: 'entOptions', placeholder: '+ Wert einer Entität einfügen …', spellcheck: 'false' });
    pick.addEventListener('change', () => {
      const id = pick.value.trim(); const e = S.entMap[id]; if (!e) return;
      const ta = sec.querySelector('textarea');
      const ins = `{{ states('${id}') }}${e.unit ? ' ' + e.unit : ''}`;
      ta.setRangeText((ta.value && ta.selectionStart === ta.value.length && !ta.value.endsWith('\n') ? '\n' : '') + ins, ta.selectionStart, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input'));
      pick.value = '';
    });
    sec.append(pick);
    add(sec,
      iconField('Icon', c.icon, (v) => setProp('icon', v)),
      swatchField('Icon-Farbe', c.icon_color || '', (v) => setProp('icon_color', v)),
      entityField('Entität (für Klick/Info)', c.entity, (v) => setProp('entity', v)),
      field('Anordnung', (() => { const s = el('select', {}, el('option', { value: '' }, 'Waagerecht'), el('option', { value: 'vertical' }, 'Senkrecht')); s.value = c.layout || ''; s.onchange = () => setProp('layout', s.value); return s; })()),
      bgField(c));
  } else if (t === 'entities' || t === 'glance' || t === 'history-graph') {
    add(textField('Titel', c.title, (v) => setProp('title', v)), rowsField(c), bgField(c));
  } else if (t === 'markdown') {
    add(textField('Titel', c.title, (v) => setProp('title', v)), textField('Inhalt', c.content, (v) => setProp('content', v), { multiline: true, sub: '## Überschrift, **fett**, Vorlagen erlaubt' }), bgField(c));
  } else if (t === 'mushroom-title-card') {
    add(textField('Titel', c.title, (v) => setProp('title', v)), textField('Untertitel', c.subtitle, (v) => setProp('subtitle', v)));
  } else if (t === 'mushroom-chips-card' || t === 'vertical-stack' || t === 'horizontal-stack' || t === 'grid' || t === 'conditional') {
    add(el('div', { class: 'hint' }, 'Diese Karte enthält weitere Elemente. Die lassen sich über „Code bearbeiten“ ändern.'));
    if ('title' in c || t.endsWith('stack')) add(textField('Titel', c.title, (v) => setProp('title', v)));
  } else {
    if ('entity' in c || ['tile', 'button', 'sensor', 'button-card'].includes(t) || t.startsWith('mushroom-')) {
      add(entityField('Entität', c.entity, (v) => setProp('entity', v), { hint: 'Wähle, was die Karte anzeigt' }));
    }
    add(textField('Name', c.name, (v) => setProp('name', v), { placeholder: ent ? ent.name : '' }),
      iconField('Icon', c.icon, (v) => setProp('icon', v)));
    if (t === 'tile') add(swatchField('Farbe', c.color || '', (v) => setProp('color', v)));
    else if (t.startsWith('mushroom-')) add(swatchField('Icon-Farbe', c.icon_color || '', (v) => setProp('icon_color', v)));
    if (t === 'tile') add(field('Anordnung', (() => { const s = el('select', {}, el('option', { value: '' }, 'Waagerecht'), el('option', { value: '1' }, 'Senkrecht')); s.value = c.vertical ? '1' : ''; s.onchange = () => setProp('vertical', s.value ? true : ''); return s; })()));
    if (t === 'button') {
      const cb = el('input', { type: 'checkbox', checked: !!c.show_state });
      cb.onchange = () => setProp('show_state', cb.checked ? true : '');
      add(el('label', { class: 'chk', style: 'margin-bottom:10px' }, cb, 'Zustand anzeigen'));
    }
    if (t === 'button-card') add(textField('Beschriftung (label)', c.label, (v) => setProp('label', v)));
    add(bgField(c));
  }
  out.push(content, sizeField(c));
  out.push(el('div', { class: 'fs' }, el('h4', {}, 'Aktionen'), el('div', { class: 'btnrow' },
    el('button', { onclick: duplicateSelection }, mdi('mdi:content-duplicate'), 'Duplizieren'),
    el('button', { onclick: () => saveAsTemplate(selObj()) }, mdi('mdi:star-outline'), 'Als Vorlage'),
    el('button', { onclick: () => editCode() }, mdi('mdi:code-braces'), 'Code'),
    el('button', { class: 'danger', onclick: deleteSelection }, mdi('mdi:delete-outline'), 'Löschen'))));
  p.append(...out);
}

function sectionProps(s) {
  const v = curView();
  const cols = clamp(v.max_columns || 4, 1, 10);
  const idx = S.sel.index;
  const span = clamp(s.column_span || 1, 1, cols);
  const head = (s.cards || []).find((c) => c.type === 'heading');
  const out = [el('div', { class: 'ins-head' }, mdi('mdi:view-column-outline'), el('div', {}, el('b', {}, `Abschnitt ${idx + 1}`), el('div', { class: 'type' }, `${(s.cards || []).length} Karte(n)`)))];
  const box = el('div', { class: 'sizes' }, Array.from({ length: cols }, (_, k) => k + 1).map((n) =>
    el('button', { class: span === n ? 'on' : '', onclick: () => mutate(() => { if (n > 1) s.column_span = n; else delete s.column_span; }) }, `${n}`)));
  const fs = el('div', { class: 'fs' }, el('h4', {}, 'Abschnitt'), field(`Breite – ${span} von ${cols} Spalten`, box, 'Oder am blauen Rand rechts ziehen.'));
  if (head) fs.append(textField('Überschrift', head.heading, (val) => mutate(() => { const h = (curView().sections[idx].cards || []).find((c) => c.type === 'heading'); if (h) h.heading = val; }, 'sechead')));
  else fs.append(el('div', { class: 'btnrow' }, el('button', { onclick: () => mutate(() => { getCards(curView(), 's' + idx, true).unshift({ type: 'heading', heading: 'Überschrift' }); }) }, mdi('mdi:format-header-1'), 'Überschrift hinzufügen')));
  out.push(fs, el('div', { class: 'fs' }, el('h4', {}, 'Aktionen'), el('div', { class: 'btnrow' },
    el('button', { onclick: duplicateSelection }, mdi('mdi:content-duplicate'), 'Duplizieren'),
    el('button', { onclick: () => editCode() }, mdi('mdi:code-braces'), 'Code'),
    el('button', { class: 'danger', onclick: deleteSelection }, mdi('mdi:delete-outline'), 'Löschen'))));
  return out;
}

function viewProps() {
  const v = curView();
  if (!v) return [el('div', { class: 'hint' }, 'Lege zuerst eine Ansicht an.')];
  const out = [el('div', { class: 'ins-head' }, mdi(v.icon || 'mdi:view-dashboard-outline'), el('div', {}, el('b', {}, viewLabel(v, S.view)), el('div', { class: 'type' }, 'Ansicht')))];
  const vs = () => S.config.views[S.view];
  const setV = (k, val) => mutate(() => { if (val === '' || val == null) delete vs()[k]; else vs()[k] = val; renderTabs(); }, 'view' + k);
  const fs = el('div', { class: 'fs' }, el('h4', {}, 'Ansicht'),
    textField('Titel', v.title, (x) => setV('title', x)),
    iconField('Icon', v.icon, (x) => setV('icon', x)),
    textField('URL-Pfad', v.path, (x) => setV('path', slugify(x)), { sub: 'Teil der Adresse, z. B. uebersicht' }));
  if (isSectionsView(v)) {
    const cols = v.max_columns || 4;
    fs.append(field('Spalten auf großen Bildschirmen', el('div', { class: 'sizes' }, [1, 2, 3, 4, 5, 6].map((n) =>
      el('button', { class: cols === n ? 'on' : '', onclick: () => mutate(() => { vs().max_columns = n; }) }, String(n))))));
  } else {
    fs.append(el('div', { class: 'btnrow' }, el('button', { onclick: convertToSections }, mdi('mdi:view-grid-plus-outline'), 'In Raster umwandeln')));
  }
  out.push(fs, el('div', { class: 'fs' }, el('h4', {}, 'Aktionen'), el('div', { class: 'btnrow' },
    el('button', { onclick: addSection }, mdi('mdi:plus'), 'Abschnitt'),
    el('button', { onclick: duplicateView }, mdi('mdi:content-duplicate'), 'Ansicht duplizieren'),
    el('button', { onclick: () => editCode('view') }, mdi('mdi:code-braces'), 'Code'),
    el('button', { onclick: () => editCode('all') }, mdi('mdi:file-code-outline'), 'Ganzes Dashboard'),
    el('button', { class: 'danger', onclick: deleteView }, mdi('mdi:delete-outline'), 'Ansicht löschen'))));
  out.push(el('div', { class: 'fs' }, el('h4', {}, 'Bedienung'), el('div', { class: 'hint' },
    'Karte anklicken = auswählen und rechts formatieren · ziehen = verschieben · an den Anfassern ziehen = Größe ändern · Rechtsklick = Menü · Entf, Strg+C/V/D/Z')));
  return out;
}

// ================================================================== Ansichten & Abschnitte
function addView() {
  mutate(() => {
    if (S.config.strategy && !S.config.views.length) delete S.config.strategy;
    const n = S.config.views.length + 1;
    S.config.views.push({ title: `Neue Ansicht ${n}`, path: `ansicht-${n}`, type: 'sections', max_columns: 4,
      sections: [{ type: 'grid', cards: [{ type: 'heading', heading: 'Neuer Bereich' }] }] });
    S.view = S.config.views.length - 1;
    S.sel = { view: S.view, kind: 'view' };
  });
}
function duplicateView() {
  mutate(() => {
    const v = clone(curView());
    v.title = (v.title || 'Ansicht') + ' (Kopie)';
    if (v.path) v.path += '-kopie';
    S.config.views.splice(S.view + 1, 0, v);
    S.view += 1; S.sel = { view: S.view, kind: 'view' };
  });
}
function deleteView() {
  const v = curView();
  if (!v || !confirm(`Ansicht „${viewLabel(v, S.view)}“ wirklich löschen?`)) return;
  mutate(() => { S.config.views.splice(S.view, 1); S.view = Math.max(0, S.view - 1); S.sel = null; });
}
function addSection() {
  mutate(() => {
    const v = curView();
    if (!v.sections) v.sections = [];
    v.sections.push({ type: 'grid', cards: [{ type: 'heading', heading: 'Neuer Abschnitt' }] });
    S.sel = { view: S.view, kind: 'section', index: v.sections.length - 1 };
  });
}
function convertToSections() {
  mutate(() => {
    const v = curView();
    v.sections = [{ type: 'grid', column_span: 2, cards: v.cards || [] }];
    delete v.cards;
    v.type = 'sections';
    if (!v.max_columns) v.max_columns = 4;
    S.sel = null;
  });
}

// ================================================================== Palette
function buildStaticUI() {
  $('#blocks').replaceChildren(...BLOCKS.map((b) => {
    const n = el('div', { class: 'block', draggable: 'true', title: 'Auf die Zeichenfläche ziehen oder doppelklicken' }, mdi(b.icon), b.label);
    n.addEventListener('dragstart', (e) => { S.drag = { src: 'block', block: b.id }; e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/plain', b.id); });
    n.addEventListener('dblclick', () => placeCard(b.make(), {}));
    return n;
  }));
  $('#iconOptions').replaceChildren(...COMMON_ICONS.map((i) => el('option', { value: 'mdi:' + i })));
  ['#search', '#areaFilter', '#domainFilter', '#unusedOnly', '#hideDiag'].forEach((s) => $(s).addEventListener('input', renderEntities));

  document.addEventListener('dragend', () => {
    S.drag = null; S.drop = null; clearMarks();
    document.querySelectorAll('.dragging').forEach((n) => n.classList.remove('dragging'));
  });
  $('#canvasWrap').addEventListener('dragover', (e) => { if (S.drag && !e.target.closest('.grid12')) removePh(); });
  $('#canvasWrap').addEventListener('click', (e) => { if (!e.target.closest('.hc,.sec,.notice button')) select(curView() ? { kind: 'view' } : null); });
  $('#canvasWrap').addEventListener('contextmenu', (e) => {
    if (e.target.closest('.hc,.sec')) return;
    e.preventDefault();
    showCtx(e, [['mdi:content-paste', 'Einfügen', 'Strg+V', pasteClip], ['mdi:plus-box-outline', 'Neuer Abschnitt', '', addSection], ['mdi:cog-outline', 'Ansicht-Eigenschaften', '', () => select({ kind: 'view' })]]);
  });
  document.addEventListener('mousedown', (e) => { if (!e.target.closest('#ctxMenu')) hideCtx(); });
  window.addEventListener('blur', hideCtx);

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
  $('#btnSaveVersion').onclick = saveVersion;
  $('#btnPush').onclick = pushFlow;
  $('#btnCopy').onclick = copyFlow;
  document.querySelectorAll('.ins-tabs button').forEach((b) => { b.onclick = () => switchTab(b.dataset.tab); });
  document.querySelectorAll('#deviceSeg button').forEach((b) => {
    b.onclick = () => { S.dev = b.dataset.dev; document.querySelectorAll('#deviceSeg button').forEach((x) => x.classList.toggle('on', x === b)); renderCanvas(); };
  });
  const setZoom = (z) => { S.zoom = clamp(z, 0.5, 1.5); $('#zoom').value = Math.round(S.zoom * 100); $('#zoomVal').textContent = Math.round(S.zoom * 100) + ' %'; renderCanvas(); };
  let rzT = null;
  window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(renderCanvas, 150); });
  $('#zoom').addEventListener('input', () => setZoom(+$('#zoom').value / 100));
  $('#zoomIn').onclick = () => setZoom(S.zoom + 0.1);
  $('#zoomOut').onclick = () => setZoom(S.zoom - 0.1);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideCtx(); if (!$('#modal').hidden) { closeModal(); return; } }
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) || !$('#modal').hidden) return;
    const k = e.key.toLowerCase(); const mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    else if (mod && k === 'c') { copySelection(false); }
    else if (mod && k === 'x') { copySelection(true); }
    else if (mod && k === 'v') { e.preventDefault(); pasteClip(); }
    else if (mod && k === 'd') { e.preventDefault(); duplicateSelection(); }
    else if (k === 'delete' || k === 'backspace') { if (S.sel && S.sel.kind !== 'view') { e.preventDefault(); deleteSelection(); } }
    else if (k === 'escape') { select(null); }
    else if (k === 'arrowleft' || k === 'arrowup') { if (S.sel && S.sel.kind === 'card') { e.preventDefault(); moveSelection(-1); } }
    else if (k === 'arrowright' || k === 'arrowdown') { if (S.sel && S.sel.kind === 'card') { e.preventDefault(); moveSelection(1); } }
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
    const grp = e.area ? (e.floor ? `${e.floor} › ${e.area}` : e.area) : 'Ohne Raum';
    if (grp !== lastGrp) { out.push(el('div', { class: 'grp' }, grp)); lastGrp = grp; }
    const isUsed = used.has(e.entity_id);
    const n = el('div', { class: 'ent' + (isUsed ? ' used' : ''), draggable: 'true', title: `${e.entity_id}\nZiehen = Karte anlegen · Doppelklick = anhängen` },
      mdi(entIcon(e)),
      el('div', { class: 'ent-text' }, el('div', { class: 'ent-name' }, e.name), el('div', { class: 'ent-id' }, e.entity_id)),
      el('span', { class: 'ent-state' }, fmtState(e)),
      isUsed ? el('span', { class: 'ent-used', title: 'Wird im Dashboard bereits verwendet' }, '✓') : null);
    n.addEventListener('dragstart', (ev) => { S.drag = { src: 'entity', entity_id: e.entity_id }; ev.dataTransfer.effectAllowed = 'copy'; ev.dataTransfer.setData('text/plain', e.entity_id); });
    n.addEventListener('dblclick', () => { if (!curView()) { toast('Erst eine Ansicht anlegen', 'err'); return; } placeCard(makeCard(e.entity_id, $('#cardType').value), {}); });
    out.push(n);
  }
  if (hits.length > LIMIT) out.push(el('div', { class: 'more' }, `… und ${hits.length - LIMIT} weitere – Suche oder Filter nutzen`));
  if (!hits.length) out.push(el('div', { class: 'more' }, 'Keine Treffer'));
  list.replaceChildren(...out);
}

const COMMON_ICONS = ('home home-outline sofa sofa-outline bed bed-outline shower bathtub-outline toilet stove fridge washing-machine '
  + 'desk chair-rolling server server-network gamepad-variant gamepad-variant-outline television garage garage-variant tree '
  + 'flower-outline pine-tree car carport-outline door door-open window-closed window-open lightbulb lightbulb-outline lamp ceiling-light '
  + 'power-plug power-plug-outline power-socket-de toggle-switch thermometer water-percent water air-humidifier air-filter fan '
  + 'radiator heat-wave snowflake weather-sunny weather-night weather-partly-cloudy shield-home shield-check alarm-light bell '
  + 'cctv camera motion-sensor run walk account account-group human-male-child baby-face-outline cat dog robot-vacuum '
  + 'lightning-bolt flash battery solar-power gauge chart-line clock-outline calendar trash-can-outline recycle '
  + 'arrow-down-bold arrow-up-bold stairs-up stairs-down home-floor-0 home-floor-1 home-floor-2 home-floor-b information-outline '
  + 'alert-circle-outline check-circle-outline cog wifi router-wireless printer speaker music play pause').split(' ');

// ================================================================== Code-Editor (für Spezialfälle)
async function editCode(scope) {
  let obj; let title; let save;
  if (scope === 'all') {
    obj = S.config; title = 'Code: ganzes Dashboard';
    save = (d) => mutate(() => { S.config = d; if (!Array.isArray(S.config.views)) S.config.views = []; fixAfterChange(); });
  } else if (scope === 'view' || (S.sel && S.sel.kind === 'view')) {
    const vi = S.view; const { sections, cards, ...rest } = S.config.views[vi];
    obj = rest; title = 'Code: Ansicht (ohne Abschnitte)';
    save = (d) => mutate(() => { const cur = S.config.views[vi]; const m = { ...d }; if (cur.sections) m.sections = cur.sections; if (cur.cards) m.cards = cur.cards; S.config.views[vi] = m; });
  } else if (S.sel && S.sel.kind === 'section') {
    const vi = S.view; const si = S.sel.index; const { cards, ...rest } = S.config.views[vi].sections[si];
    obj = rest; title = 'Code: Abschnitt (ohne Karten)';
    save = (d) => mutate(() => { const cur = S.config.views[vi].sections[si]; const m = { ...d }; if (cur.cards) m.cards = cur.cards; S.config.views[vi].sections[si] = m; });
  } else if (S.sel && S.sel.kind === 'card') {
    const vi = S.view; const { cid, index } = S.sel;
    obj = getCards(S.config.views[vi], cid)[index]; title = 'Code: Karte';
    save = (d) => mutate(() => { getCards(S.config.views[vi], cid)[index] = d; });
  } else return;
  let text;
  try { ({ text } = await api('yaml/dump', { method: 'POST', body: { data: obj } })); } catch (e) { toast(e.message, 'err'); return; }
  const ta = el('textarea', { class: 'input', spellcheck: 'false', style: 'min-height:55vh;font:13px/1.45 ui-monospace,monospace' });
  ta.value = text;
  ta.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); } });
  const err = el('div', { class: 'err' });
  const actions = [{ label: 'Abbrechen' }, { label: 'Übernehmen', primary: true, action: async () => {
    try { const { data } = await api('yaml/parse', { method: 'POST', body: { text: ta.value } }); save(data); return true; }
    catch (e) { err.textContent = e.message; return false; }
  } }];
  if (scope === 'all') actions.unshift({ label: 'Als Datei herunterladen', action: () => { download((S.dash === DEFAULT_KEY ? 'lovelace' : S.dash) + '.yaml', ta.value); return false; } });
  openModal(title, [el('div', { class: 'hint' }, 'Nur für Sonderfälle nötig – alles Übliche geht im Format-Fenster.'), ta, err], actions);
  ta.focus();
}
function download(name, text) {
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/yaml' })), download: name });
  document.body.append(a); a.click(); a.remove();
}

// ================================================================== Dialoge
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

function promptText(title, label, placeholder, okLabel, value = '') {
  return new Promise((resolve) => {
    const inp = el('input', { type: 'text', class: 'input', placeholder });
    inp.value = value;
    let done = false;
    openModal(title, [el('label', {}, label), inp], [
      { label: 'Abbrechen', action: () => { done = true; resolve(null); return true; } },
      { label: okLabel, primary: true, action: () => { done = true; resolve(inp.value); return true; } },
    ]);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#modalActions button.primary').click(); });
    inp.focus(); inp.select();
    const obs = new MutationObserver(() => { if ($('#modal').hidden) { obs.disconnect(); if (!done) resolve(null); } });
    obs.observe($('#modal'), { attributes: true });
  });
}

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
    ? [el('div', { class: 'hint' }, `+${d.added} / −${d.removed} Zeilen (rot: ${oldLabel}, grün: ${newLabel})`), diffView(d.diff)]
    : el('div', {}, 'Keine Unterschiede.'), [{ label: 'Schließen' }]);
}

// ================================================================== Versionen & Übertragen
async function saveVersion() {
  const msg = await promptText('Version speichern', 'Kurze Beschreibung (optional):', 'z. B. Neue Raumkarten im Keller', 'Speichern');
  if (msg === null) return;
  try {
    const r = await api('versions', { method: 'POST', body: { dashboard: S.dash, config: S.config, message: msg } });
    toast(`Version #${r.version} gespeichert (noch nicht übertragen)`, 'ok');
    if (S.tab === 'versions') loadVersions();
  } catch (e) { toast(e.message, 'err'); }
}

const KIND = { push: 'Übertragen', backup: 'Sicherung', draft: 'Entwurf' };
async function loadVersions() {
  const box = $('#versionsPane');
  box.replaceChildren(el('div', { class: 'more' }, 'Lade …'));
  let list;
  try { list = await api('versions?dashboard=' + enc(S.dash)); } catch (e) { box.replaceChildren(el('div', { class: 'err' }, e.message)); return; }
  if (!list.length) {
    box.replaceChildren(el('div', { class: 'hint' }, 'Noch keine Versionen. Beim ersten Übertragen wird der bisherige Stand aus Home Assistant automatisch gesichert.'));
    return;
  }
  box.replaceChildren(...list.map((v) => el('div', { class: 'ver' },
    el('div', { class: 'meta' }, el('b', {}, '#' + v.id), el('span', { class: 'kind ' + v.kind }, KIND[v.kind] || v.kind),
      new Date(v.created).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })),
    el('div', { class: 'msg' }, v.message || ''),
    el('div', { class: 'acts' },
      el('button', { onclick: () => compareVersion(v.id) }, mdi('mdi:compare'), 'Vergleichen'),
      el('button', { onclick: () => restoreVersion(v.id) }, mdi('mdi:restore'), 'Laden'),
      el('button', { class: 'danger', title: 'Version löschen', onclick: () => deleteVersion(v.id) }, mdi('mdi:delete-outline'))))));
}
async function compareVersion(id) {
  try { const v = await api('versions/' + id); await showDiff(v.config, S.config, `Version #${id}`, 'Editor', `Version #${id} ↔ Editor`); }
  catch (e) { toast(e.message, 'err'); }
}
async function restoreVersion(id) {
  try {
    const v = await api('versions/' + id);
    mutate(() => { S.config = v.config; if (!Array.isArray(S.config.views)) S.config.views = []; S.sel = null; fixAfterChange(); });
    toast(`Version #${id} geladen. Mit „Übertragen“ wird sie in Home Assistant aktiv.`);
  } catch (e) { toast(e.message, 'err'); }
}
async function deleteVersion(id) {
  if (!confirm(`Version #${id} endgültig löschen?`)) return;
  try { await api('versions/' + id, { method: 'DELETE' }); loadVersions(); } catch (e) { toast(e.message, 'err'); }
}

async function pushFlow() {
  const dash = S.dashboards.find((d) => d.key === S.dash);
  if (dash && dash.mode === 'yaml') { toast('Dieses Dashboard läuft im YAML-Modus und kann nicht über die API gespeichert werden.', 'err'); return; }
  let cur; let d;
  try {
    cur = await api('config?dashboard=' + enc(S.dash));
    d = await api('diff', { method: 'POST', body: { old: cur.config, new: S.config, old_label: 'Home Assistant', new_label: 'Editor' } });
  } catch (e) { toast(e.message, 'err'); return; }
  if (!d.changed) { toast('Keine Änderungen gegenüber Home Assistant.'); S.baseJSON = JSON.stringify(S.config); S.baseHash = cur.hash; updateToolbar(); return; }
  const conflict = S.baseHash && cur.hash !== S.baseHash;
  const msg = el('input', { type: 'text', class: 'input', placeholder: 'Was hast du geändert? (z. B. Raumkarten neu angeordnet)' });
  const det = el('details', {}, el('summary', { class: 'hint', style: 'cursor:pointer' }, `Technische Details: +${d.added} / −${d.removed} Zeilen`), diffView(d.diff));
  openModal(`Nach Home Assistant übertragen – ${dash ? dash.title : S.dash}`, [
    conflict ? el('div', { class: 'warnbox' }, '⚠ Das Dashboard wurde seit dem Laden direkt in Home Assistant geändert. Übertragen überschreibt diese Änderungen. Der aktuelle HA-Stand wird vorher automatisch gesichert.') : null,
    el('div', {}, 'Deine Änderungen werden in Home Assistant gespeichert und sind sofort sichtbar. Der bisherige Stand wird automatisch als Version gesichert.'),
    el('label', {}, 'Beschreibung:'), msg, det,
  ], [
    { label: 'Abbrechen' },
    { label: conflict ? 'Trotzdem übertragen' : 'Jetzt übertragen', primary: true, action: async () => {
      try {
        const r = await api('push', { method: 'POST', body: { dashboard: S.dash, config: S.config, message: msg.value, base_hash: S.baseHash, force: !!conflict } });
        S.baseJSON = JSON.stringify(S.config); S.baseHash = r.hash; updateToolbar();
        toast(r.changed ? `Übertragen ✓ – Version #${r.version}` : 'Keine Änderungen', 'ok');
        if (S.tab === 'versions') loadVersions();
        return true;
      } catch (e) { toast(e.message, 'err'); return false; }
    } },
  ]);
  msg.focus();
}

// ================================================================== Dashboard kopieren
async function copyFlow() {
  const src = S.dashboards.find((d) => d.key === S.dash) || { title: 'Dashboard', key: S.dash };
  const base = slugify(src.key === DEFAULT_KEY ? 'lovelace' : src.key) || 'dashboard';
  const taken = new Set(S.dashboards.map((d) => d.key));
  let url = `${base}-kopie`;
  for (let i = 2; taken.has(url); i++) url = `${base}-kopie-${i}`;
  const title = el('input', { type: 'text', class: 'input', value: `${src.title} (Kopie)` });
  const path = el('input', { type: 'text', class: 'input', value: url });
  const side = el('input', { type: 'checkbox', checked: true });
  const dirty = isDirty();
  const fromEditor = el('input', { type: 'radio', name: 'cpsrc', checked: dirty });
  const fromHa = el('input', { type: 'radio', name: 'cpsrc', checked: !dirty });
  const err = el('div', { class: 'err' });
  openModal(`„${src.title}“ kopieren`, [
    el('div', { class: 'hint' }, 'Legt in Home Assistant ein neues Dashboard mit demselben Inhalt an. Das Original bleibt unverändert; du bearbeitest danach die Kopie.'),
    el('div', { class: 'form' },
      el('span', {}, 'Titel'), title,
      el('span', {}, 'URL'), path,
      el('label', { class: 'full' }, side, 'In der HA-Seitenleiste anzeigen'),
      el('label', { class: 'full' }, fromHa, 'Stand aus Home Assistant kopieren'),
      el('label', { class: 'full' }, fromEditor, 'Aktuellen Editor-Stand kopieren' + (dirty ? ' (mit deinen noch nicht übertragenen Änderungen)' : ''))),
    err,
  ], [
    { label: 'Abbrechen' },
    { label: 'Kopie anlegen', primary: true, action: async () => {
      if (!fromEditor.checked && dirty && !confirm('Deine nicht übertragenen Änderungen am Original gehen beim Wechsel zur Kopie verloren. Fortfahren?')) return false;
      try {
        const r = await api('dashboards/copy', { method: 'POST', body: {
          source: S.dash, title: title.value, url_path: slugify(path.value), show_in_sidebar: side.checked,
          icon: src.icon || null, config: fromEditor.checked ? S.config : null } });
        S.dashboards = await api('dashboards');
        S.baseJSON = JSON.stringify(S.config);
        fillDashSelect();
        await loadDashboard(r.key);
        toast(`Kopie „${title.value}“ angelegt – du bearbeitest jetzt die Kopie.`, 'ok');
        return true;
      } catch (e) { err.textContent = e.message; return false; }
    } },
  ]);
  title.focus();
}

// ================================================================== Vorlagen
async function loadTemplates() {
  try { S.templates = await api('templates'); } catch { S.templates = []; }
  renderTemplates();
}
function renderTemplates() {
  const box = $('#tplList');
  $('#tplCount').textContent = S.templates.length ? `(${S.templates.length})` : '';
  if (!S.templates.length) {
    box.replaceChildren(el('div', { class: 'hint' }, 'Noch keine Vorlagen. Rechtsklick auf eine Karte → „Als Vorlage speichern“.'));
    return;
  }
  box.replaceChildren(...S.templates.map((t) => {
    const ents = templateEntities(t.card);
    const area = guessArea(ents);
    const n = el('div', { class: 'tpl', draggable: 'true', title: 'Auf die Zeichenfläche ziehen' },
      mdi(tplIcon(t.card.icon, 'mdi:card-outline')),
      el('div', { class: 'tpl-text' }, el('div', { class: 'tpl-name' }, t.name),
        el('div', { class: 'tpl-sub' }, typeName(t.card) + (area ? ` · ${area}` : ''))),
      el('button', { class: 'icon', title: 'Umbenennen', onclick: (e) => { e.stopPropagation(); renameTemplate(t); } }, mdi('mdi:pencil-outline')),
      el('button', { class: 'icon danger', title: 'Vorlage löschen', onclick: (e) => { e.stopPropagation(); deleteTemplate(t); } }, mdi('mdi:delete-outline')));
    n.addEventListener('dragstart', (e) => { S.drag = { src: 'template', id: t.id }; e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/plain', 'tpl'); });
    n.addEventListener('dblclick', () => insertTemplate(t.id, {}));
    return n;
  }));
}
async function saveAsTemplate(card) {
  if (!card) return;
  const name = await promptText('Als Vorlage speichern', 'Name der Vorlage:', 'z. B. Raumkarte', 'Speichern', cardTitle(card));
  if (name === null) return;
  if (!name.trim()) { toast('Bitte einen Namen angeben', 'err'); return; }
  try {
    await api('templates', { method: 'POST', body: { name: name.trim(), card } });
    toast(`Vorlage „${name.trim()}“ gespeichert`, 'ok');
    loadTemplates();
  } catch (e) { toast(e.message, 'err'); }
}
async function renameTemplate(t) {
  const name = await promptText('Vorlage umbenennen', 'Neuer Name:', '', 'Speichern', t.name);
  if (!name || !name.trim()) return;
  try { await api('templates/' + t.id, { method: 'PATCH', body: { name: name.trim() } }); loadTemplates(); } catch (e) { toast(e.message, 'err'); }
}
async function deleteTemplate(t) {
  if (!confirm(`Vorlage „${t.name}“ löschen?`)) return;
  try { await api('templates/' + t.id, { method: 'DELETE' }); loadTemplates(); } catch (e) { toast(e.message, 'err'); }
}

const ENT_RE = /[a-z_]+\.[a-z0-9_]+/g;
function templateEntities(card) {
  const set = new Set();
  (function walk(o) {
    if (typeof o === 'string') { for (const m of o.match(ENT_RE) || []) if (S.entMap[m] || DOMAIN_ICON[m.split('.')[0]]) set.add(m); }
    else if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') Object.values(o).forEach(walk);
  })(card);
  return [...set];
}
function guessArea(ids) {
  const cnt = {};
  for (const id of ids) { const a = S.entMap[id] && S.entMap[id].area; if (a) cnt[a] = (cnt[a] || 0) + 1; }
  const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}
function areaTokens(area) {
  const t = new Set();
  for (const w of String(area || '').split(/\s+/)) {
    const a = slugify(w).replace(/-/g, '');
    const b = w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
    if (a) t.add(a);
    if (b) t.add(b);
  }
  return t;
}
function restTokens(id, area) {
  const skip = areaTokens(area);
  return id.split('.')[1].split('_').filter((x) => x && !skip.has(x));
}
function findCounterpart(id, srcArea, dstArea, used) {
  const src = S.entMap[id];
  const domain = id.split('.')[0];
  const want = restTokens(id, srcArea);
  let best = null; let bestScore = -Infinity;
  for (const e of S.entities) {
    if (e.area !== dstArea || e.domain !== domain || used.has(e.entity_id)) continue;
    let score = 0;
    if (src && src.device_class && e.device_class === src.device_class) score += 5;
    else if (src && src.device_class && e.device_class && e.device_class !== src.device_class) continue;
    const have = restTokens(e.entity_id, dstArea);
    score += want.filter((w) => have.includes(w)).length * 2 - Math.abs(have.length - want.length) * 0.5;
    if (score > bestScore) { bestScore = score; best = e.entity_id; }
  }
  return best;
}
function applyTemplate(card, map, nameFrom, nameTo) {
  const ids = Object.keys(map).filter((k) => map[k] && map[k] !== k).sort((a, b) => b.length - a.length);
  const re = ids.length ? new RegExp('(?<![a-z0-9_.])(' + ids.map((i) => i.replace(/\./g, '\\.')).join('|') + ')(?![a-z0-9_])', 'g') : null;
  const nameRe = nameFrom && nameTo && nameFrom !== nameTo ? new RegExp(nameFrom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') : null;
  return (function walk(o) {
    if (typeof o === 'string') { let s = re ? o.replace(re, (m) => map[m]) : o; if (nameRe) s = s.replace(nameRe, nameTo); return s; }
    if (Array.isArray(o)) return o.map(walk);
    if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, walk(v)]));
    return o;
  })(clone(card));
}
function insertTemplate(id, place) {
  const t = S.templates.find((x) => x.id === id);
  if (!t) return;
  if (!curView()) { toast('Erst eine Ansicht anlegen', 'err'); return; }
  const ents = templateEntities(t.card);
  if (!ents.length) { placeCard(clone(t.card), place); return; }
  const srcArea = guessArea(ents);
  const areas = [...new Set(S.entities.map((e) => e.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  const areaSel = el('select', {}, el('option', { value: '' }, '– Entitäten nicht tauschen –'),
    ...areas.map((a) => el('option', { value: a }, a + (a === srcArea ? ' (wie Vorlage)' : ''))));
  areaSel.value = srcArea || '';
  const rename = el('input', { type: 'checkbox', checked: true });
  const renameLbl = el('label', { class: 'full' }, rename, el('span', {}));
  const rows = ents.map((eid) => {
    const inp = el('input', { type: 'text', list: 'entOptions', value: eid, spellcheck: 'false' });
    const note = el('small', {});
    const tr = el('tr', {}, el('td', {}, (S.entMap[eid] && S.entMap[eid].name) || eid, el('small', {}, eid)), el('td', {}, inp, note));
    return { eid, inp, note, tr };
  });
  const update = () => {
    const dst = areaSel.value;
    const used = new Set();
    for (const r of rows) {
      r.tr.classList.remove('nomatch'); r.note.textContent = '';
      if (!dst || dst === srcArea) { r.inp.value = r.eid; continue; }
      const cp = findCounterpart(r.eid, srcArea, dst, used);
      if (cp) { r.inp.value = cp; used.add(cp); r.note.textContent = S.entMap[cp].name; }
      else { r.inp.value = r.eid; r.tr.classList.add('nomatch'); r.note.textContent = 'keine Entsprechung in diesem Raum – bitte selbst wählen'; }
    }
    const show = srcArea && dst && dst !== srcArea;
    renameLbl.hidden = !show;
    renameLbl.lastChild.textContent = show ? `Text „${srcArea}“ durch „${dst}“ ersetzen` : '';
  };
  areaSel.addEventListener('change', update);
  update();
  openModal(`Vorlage „${t.name}“ einfügen`, [
    el('div', { class: 'hint' }, 'Für welchen Raum ist die Karte? Passende Entitäten werden automatisch eingesetzt; jede Zuordnung lässt sich ändern.'),
    el('div', { class: 'form' }, el('span', {}, 'Raum'), areaSel, renameLbl),
    el('table', { class: 'maptable' }, el('tbody', {}, rows.map((r) => r.tr))),
  ], [
    { label: 'Abbrechen' },
    { label: 'Einfügen', primary: true, action: () => {
      const map = Object.fromEntries(rows.map((r) => [r.eid, r.inp.value.trim() || r.eid]));
      const dst = areaSel.value;
      placeCard(applyTemplate(t.card, map, rename.checked && srcArea && dst ? srcArea : null, dst || null), place);
      return true;
    } },
  ]);
}

init();
