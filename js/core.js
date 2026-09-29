/* 楽ちんサムネメーカー：ユーティリティ・アイコン */
/* ============ 基本 ============ */
const $ = s => document.querySelector(s);
const clone = o => JSON.parse(JSON.stringify(o));
const LS = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch{ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} }
};
const isTyping = e => { const t = e.target; return t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.isContentEditable; };
// サムネのレイヤーに共通の初期値（1920×1080 の中央）
const LAYER_BASE = () => ({x:960, y:540, sc:1, rot:0, op:1, hidden:false, locked:false, blend:'source-over'});
// 小数第3位までに丸める（保存データを読みやすく小さく保つ）
const r3 = v => Math.round(v * 1000) / 1000;
// 日時入りのファイル名用（例：20260929-213000）
const stamp = (d = new Date()) => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
// ファイルとしてダウンロードさせる
function downloadBlob(blob, name){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }
// キャンバス上に出す案内の帯（編集モード中など）
function drawBanner(ctx, W, dpr, msg){
  ctx.save(); ctx.font = `800 ${12 * dpr}px "M PLUS Rounded 1c", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const tw = ctx.measureText(msg).width + 24 * dpr; ctx.fillStyle = 'rgba(31,27,45,.88)'; ctx.beginPath(); ctx.roundRect(W / 2 - tw / 2, 8 * dpr, tw, 26 * dpr, 13 * dpr); ctx.fill();
  ctx.fillStyle = '#ffb800'; ctx.fillText(msg, W / 2, 14 * dpr); ctx.restore();
}
function toast(msg, err){
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.className = 'toast', 2600);
}

/* ============ アイコン ============ */
const ICONS = {
  grid:'<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M12 4.5v15M3.5 12h8.5"/>',
  crop:'<path d="M7 3v14h14"/><path d="M3 7h14v14"/>',
  dice:'<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><circle cx="8.6" cy="8.6" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.4" cy="15.4" r="1.2" fill="currentColor" stroke="none"/>',
  drop:'<path d="m14 7 3 3"/><path d="M16.4 4.2a2.2 2.2 0 0 1 3.2 3.2L17.5 9.5l-3-3z"/><path d="M14.5 6.5 6 15l-1 4 4-1 8.5-8.5"/>',
  image:'<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.7"/><path d="m20.5 15.5-4.8-4.8L6 19.5"/>',
  contrast:'<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/>',
  undo:'<path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5H15a4.5 4.5 0 0 1 0 9h-3"/>',
  redo:'<path d="m15 14 4.5-4.5L15 5"/><path d="M19.5 9.5H9a4.5 4.5 0 0 0 0 9h3"/>',
  phone:'<rect x="7" y="3" width="10" height="18" rx="2.6"/><path d="M11 17.5h2"/>',
  star:'<path d="m12 3.8 2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.8l-5.1 2.7 1-5.7-4.1-4 5.7-.8z"/>',
  download:'<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 19.5h14"/>',
  copy:'<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  dup:'<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/><path d="M14 12v4M12 14h4"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  reset:'<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>',
  text:'<path d="M5 6.5V5h14v1.5"/><path d="M12 5v14"/><path d="M9 19h6"/>',
  save:'<path d="M5 4.5h11l3.5 3.5V19a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5z"/><path d="M8 4.5v5h7v-5"/><path d="M8 19.5v-5h8v5"/>',
  folder:'<path d="M3.5 7A2.5 2.5 0 0 1 6 4.5h3.5l2 2.5H18A2.5 2.5 0 0 1 20.5 9.5V17a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 17z"/>',
  monitor:'<rect x="3.5" y="4.5" width="17" height="11.5" rx="2"/><path d="M9 20h6M12 16v4"/>',
  up:'<path d="M12 19V5"/><path d="m6.5 10.5 5.5-5.5 5.5 5.5"/>',
  down:'<path d="M12 5v14"/><path d="m6.5 13.5 5.5 5.5 5.5-5.5"/>',
  eye:'<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeoff:'<path d="M4 4l16 16"/><path d="M9.9 5.8A9.9 9.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4M6.3 7.3A15.6 15.6 0 0 0 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 4.1-1"/>',
  trash:'<path d="M4.5 7h15"/><path d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"/><path d="M6.5 7l1 12a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-12"/>',
  grip:'<circle cx="9" cy="6.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="17.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="17.5" r="1.3" fill="currentColor" stroke="none"/>',
  lock:'<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  unlock:'<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 7.6-1.7"/>',
  more:'<circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  front:'<path d="M12 20V9"/><path d="m7.5 13.5 4.5-4.5 4.5 4.5"/><path d="M5 4.5h14"/>',
  back:'<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 19.5h14"/>',
  pen:'<path d="M4.5 19.5l1-4L15.8 5.2a2 2 0 0 1 2.9 0l.1.1a2 2 0 0 1 0 2.9L8.5 18.5z"/><path d="M13.5 7.5l3 3"/>',
  layers:'<path d="m12 4 8.5 4.5L12 13 3.5 8.5z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5"/><path d="m3.5 16.5 8.5 4.5 8.5-4.5"/>',
  sparkle:'<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  sliders:'<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  close:'<path d="M6 6l12 12M18 6 6 18"/>',
  share:'<path d="M12 15V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M5 12.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5.5"/>',
  help:'<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/>',
  burst:'<path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5M5.3 5.3l3.5 3.5M15.2 15.2l3.5 3.5M5.3 18.7l3.5-3.5M15.2 8.8l3.5-3.5"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  boom:'<path d="M12 2.8l1.9 4.6 4.4-2.4-1.3 4.8 4.9.9-4 3 3 3.9-4.9-.2.3 5-3.9-3-2.9 4.1-1-4.9-4.6 1.8 2-4.5-4.6-1.8 4.7-1.5L4.8 5.5l4.5 2.1z"/>',
  fxadd:'<path d="M11 3.5l1.6 4.3 4.3 1.6-4.3 1.6L11 15.3l-1.6-4.3-4.3-1.6 4.3-1.6z"/><path d="M18.5 14v6M15.5 17h6"/>',
  palette:'<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.4-1.3-1.7-1.3-3 0-.9.8-1.6 1.7-1.6h2.3a4 4 0 0 0 4-4c0-3.7-3.8-6.7-8.5-6.7z"/><circle cx="7.8" cy="11" r="1.1" fill="currentColor" stroke="none"/><circle cx="10.5" cy="7.4" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="7.8" r="1.1" fill="currentColor" stroke="none"/>',
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
// HTML に書いた <i data-ic="名前"> をアイコンの SVG に置き換える
const paintIcons = (root = document) => root.querySelectorAll('[data-ic]').forEach(el => { el.outerHTML = ic(el.dataset.ic); });
function paintRange(el){ const mn = +el.min || 0, mx = +el.max || 100; el.style.setProperty('--p', clamp01((el.value - mn) / (mx - mn)) * 100 + '%'); }
function clamp01(v){ return Math.max(0, Math.min(1, v || 0)); }
document.addEventListener('input', e => { if(e.target.type === 'range') paintRange(e.target); });
let DOC = null;

const DEFAULT = {
  text: '楽々サムネメーカー',
  font: 'Dela Gothic One', fontLatin: '', weight: 400, size: 160, ls: 0, lh: 1.15, align: 'center',
  fillType: 'grad', fill1: '#ffffff', fill2: '#ffe14d', fill3on: false, fill3: '#ffffff', gradAngle: 90, gradScope: 'block',
  metal: 'gold', splitDir: 'h', splitPos: 0.55, fillMode: 'normal',
  accent1: '#ff3b3b', accent2: '#ffb000',
  strokes: [ {on:true, w:9, c:'#141414'}, {on:true, w:11, c:'#ff2d55'}, {on:false, w:7, c:'#ffffff'} ],
  bevel:   {on:false, style:'emboss', target:'fill', size:8, depth:1, angle:225, hl:0.8, sh:0.5},
  gloss:   {on:false, a:0.45, h:0.45, curve:0.4},
  pattern: {on:false, type:'stripe', c:'#ffffff', a:0.2, size:12, angle:45},
  marker:  {on:false, c:'#fff200', a:0.9, h:0.38, pos:0.78, over:0.2},
  extrude: {on:true, depth:12, angle:60, c:'#6a0018', shade:0.45, fade:0, stripe:false, c2:'#ffffff', stripeW:3},
  shadow:  {on:true, x:6, y:10, blur:14, c:'#000000', a:0.55},
  glow:    {on:false, blur:30, c:'#00e5ff', a:0.9, str:2, dual:false, c2:'#ff2bd6'},
  warp:    {type:'none', amt:0.3, freq:1},
  jitter:  {on:false, rot:8, y:10, scale:0.08, seed:1},
  grunge:  {on:false, amt:0.4, size:3, seed:1},
  glitch:  {on:false, rgb:6, slices:6, shift:30, seed:1},
  inner:   {on:false, x:3, y:5, blur:6, c:'#000000', a:0.55},
  plate:   {on:false, shape:'round', c:'#ffffff', a:1, sc:'#111111', sw:6, pad:0.22, tail:'left', seed:3},
  box:     {on:false, shape:'square', c:'#e8132b', rand:false, alt:true, c2:'#111111', pad:0.06, sc:'#ffffff', sw:0},
  dots:    {on:false, shape:'dot', c:'#e8132b', size:0.14},
  offset:  {on:false, x:12, y:12, c:'#00c8ff', hollow:false, w:4},
  reflect: {on:false, a:0.35, gap:4, len:0.55},
  fire:    {on:false, height:1.0, wild:0.6, c1:'#fff3a0', c2:'#ff9a1f', c3:'#d7261e', seed:1},
  drip:    {on:false, style:'round', amt:0.35, len:0.6, w:0.12, sample:true, c:'#7cff4f', seed:1},
  sparkle: {on:false, count:14, size:0.22, c:'#ffffff', glow:true, seed:1},
  bulbs:   {on:false, gap:0.16, size:0.035, c:'#ffe27a', glow:0.9},
  distort: {on:false, amt:8, scale:40, seed:1},
  trail:   {on:false, angle:180, len:0.8, count:8, a:0.5, tint:false, c:'#ffffff'},
  skew: 6, rotate: 0, pad: 16, scale: 2
};
function merged(p){
  const o = clone(DEFAULT);
  for(const k in p){
    const v = clone(p[k]);
    o[k] = (v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) ? Object.assign(o[k], v) : v;
  }
  return o;
}
let S = merged(LS.get('ttm_state', {}));
/* ============ 配色 ============ */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/* ============ 描画エンジン ============ */
const PI = Math.PI;
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const hex2rgb = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); };
const rgba = (h, a) => { const [r, g, b] = hex2rgb(h); return `rgba(${r},${g},${b},${a})`; };
function rng(seed){
  let a = (Math.imul(seed | 0, 2654435761) >>> 0) || 1;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
