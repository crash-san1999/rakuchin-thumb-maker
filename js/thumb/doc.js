/* 楽ちんサムネメーカー：サムネのデータ構造・動的エフェクト定義・画像アセット */
/* ============ サムネ作成 ============ */
const DOC_BASE = () => ({
  mode:'thumb', w:1920, h:1080, exportW:1920, fmt:'png', limit2mb:true,
  guides:{thirds:false, badge:true, snap:true, fx:true},
  bg:{hidden:false, op:1, type:'grad', color:'#16161c', c1:'#ff5a2e', c2:'#ffbe3b', angle:120, asset:null, fit:'cover', zoom:1, ox:0, oy:0, rot:0, flip:false,
      gap:'blur', gapColor:'#111114', bright:0, contrast:0, sat:0, hue:0, blur:0, tone:'none', duo1:'#1b1464', duo2:'#ff9d5c',
      dim:0, vignette:0, fcx:0.5, fcy:0.5, shade:{on:false, c:'#000000', amt:0.75, angle:90, cover:0.55}, lines:{on:false, c:'#ffffff', a:0.5, n:120, inner:0.55, w:1, len:1, seed:1},
      zb:{on:false, amt:0.25, cx:0.5, cy:0.5}, mb:{on:false, dist:120, angle:0}, mosaic:{on:false, size:28},
      tint:{on:false, c:'#ff7a50', a:0.35, mode:'overlay'}},
  layers:[], sel:null, textSel:null,
});
const uid = () => 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
/* 動的エフェクト（レイヤーとして移動・拡大縮小・回転できる効果） */
const FX_DEF = {
  lines:   () => ({c:'#ffffff', n:120, inner:0.55, w:1, len:1, seed:1, full:true, reach:1.8, fade:0.4}),
  light:   () => ({c:'#fff1a8', amt:0.9, r:0.45}),
  sparkle: () => ({c:'#ffffff', n:14, size:1, seed:3, glow:true}),
  burst:   () => ({c:'#ffe600', c2:'#1f1b2d', sw:10, spikes:16, depth:0.3, seed:2}),
};
const FX_NAMES = {lines:'集中線', light:'光（スポット）', sparkle:'キラキラ', burst:'爆発（ギザギザ）'};
const FX_ICONS = {lines:'burst', light:'sun', sparkle:'sparkle', burst:'boom'};
const FX_HINT = {lines:'放射状の線で視線を集める。中心の空きを動かして注目させたい所へ', light:'光が差しているように明るく（スクリーン合成）', sparkle:'星のきらめきを散らす', burst:'マンガ風の爆発。文字の後ろに敷いて「ドーン！」'};
const FX_LAYER_DEF = {lines:{op:0.55}, light:{blend:'screen', x:1380, y:330}, burst:{sc:0.8}};
const FX_BOX = L => { const p = L.p; return {lines:p.full === false ? [1920 * p.inner * p.reach, 1080 * p.inner * p.reach] : [1920 * p.inner, 1080 * p.inner], light:[1920 * p.r * 1.1, 1920 * p.r * 1.1], sparkle:[640, 400], burst:[780, 500]}[L.kind] || [400, 400]; };
const mkFx = (kind, p = {}, ex = {}) => Object.assign({id:uid(), type:'fx', kind, x:960, y:540, sc:1, rot:0, hidden:false, locked:false, op:1, blend:'source-over'}, FX_LAYER_DEF[kind] || {}, ex, {p:Object.assign(FX_DEF[kind](), p)});
const mkTextLayer = (style, x, y, sc) => ({id:uid(), type:'text', x, y, sc, rot:0, op:1, hidden:false, locked:false, blend:'source-over', style});
const selLayer = () => (DOC && DOC.layers.find(l => l.id === DOC.sel)) || null;
const textLayer = () => (DOC && DOC.layers.find(l => l.id === DOC.textSel)) || null;
function layerName(L){
  if(L.label) return L.label;
  if(L.type === 'text') return L.style.text.replace(/[{}]/g, '').replace(/\n/g, ' ').trim().slice(0, 28) || '（空の文字）';
  if(L.type === 'fx') return FX_NAMES[L.kind] || 'エフェクト';
  return L.name || '画像';
}
function normalizeDoc(d){
  const b = DOC_BASE();
  if(!d || !Array.isArray(d.layers)){
    const L = mkTextLayer(S, b.w / 2, b.h / 2, 1.5);
    b.layers = [L]; b.sel = L.id; b.textSel = L.id; return b;
  }
  const o = Object.assign(b, d);
  o.w = 1920; o.h = 1080;
  const base = DOC_BASE();
  o.bg = Object.assign(base.bg, d.bg || {});
  for(const k of ['lines', 'zb', 'mb', 'mosaic', 'tint', 'shade']) o.bg[k] = Object.assign(DOC_BASE().bg[k], (d.bg || {})[k] || {});
  o.guides = Object.assign(base.guides, d.guides || {});
  if(d.bg && d.bg.fcx == null && d.bg.zb && (d.bg.zb.cx !== 0.5 || d.bg.zb.cy !== 0.5) && d.bg.zb.cx != null){ o.bg.fcx = d.bg.zb.cx; o.bg.fcy = d.bg.zb.cy; }
  o.layers = d.layers.filter(L => L.type !== 'fx' || FX_DEF[L.kind]).map(L => L.type === 'text'
    ? Object.assign({op:1, rot:0, hidden:false, locked:false, blend:'source-over'}, L, {style: merged(L.style || {})})
    : L.type === 'fx' ? Object.assign({x:960, y:540, sc:1, rot:0, op:1, hidden:false, locked:false, blend:'source-over'}, L, {p:Object.assign(FX_DEF[L.kind](), L.p || {})})
    : Object.assign({op:1, rot:0, hidden:false, locked:false, blend:'source-over', flip:false}, L, {
        outline: Object.assign({on:true, w:10, c:'#ffffff'}, L.outline || {}),
        frame: (fr => { const o = Object.assign(FRAME_BASE(), fr); if(fr.fs == null && fr.zoom) o.fs = Math.max(0.1, 1 / fr.zoom); delete o.zoom; delete o.ox; delete o.oy; return o; })(L.frame || {}),
        shadow: Object.assign({on:true, blur:30, y:14, a:0.45}, L.shadow || {})}));
  // 以前の「背景の集中線」を動的エフェクトのレイヤーに移す
  if(o.bg.lines.on){ const l = o.bg.lines; o.layers.unshift(mkFx('lines', {c:l.c, n:l.n, inner:l.inner, w:l.w ?? 1, len:l.len ?? 1, seed:l.seed}, {op:l.a, x:(o.bg.fcx ?? 0.5) * 1920, y:(o.bg.fcy ?? 0.5) * 1080})); l.on = false; }
  if(!o.layers.find(l => l.id === o.textSel)){ const T = o.layers.find(l => l.type === 'text'); o.textSel = T ? T.id : null; }
  if(o.sel && !o.layers.find(l => l.id === o.sel)) o.sel = null;
  return o;
}
DOC = normalizeDoc(LS.get('ttm_doc', null));
{ const T = textLayer(); if(T) S = T.style; }

function saveDoc(){
  clearTimeout(saveDoc.t);
  saveDoc.t = setTimeout(() => { LS.set('ttm_state', S); if(DOC) LS.set('ttm_doc', DOC); }, 250);
}

/* ---------- 画像アセット（IndexedDBに保存） ---------- */
const ASSETS = {};
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const idbReq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
let idbP = null;
function idb(){
  return idbP || (idbP = new Promise((res, rej) => {
    try{ const r = indexedDB.open('ttm', 1); r.onupgradeneeded = () => r.result.createObjectStore('assets'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }
    catch(e){ rej(e); }
  }));
}
async function idbPut(id, v){ try{ const db = await idb(); db.transaction('assets', 'readwrite').objectStore('assets').put(v, id); }catch{} }
async function addAsset(src, name, id, skipPut){
  id = id || 'A' + uid();
  const img = await loadImg(src);
  const tc = mk(72, 72), tx = tc.getContext('2d'), s = Math.min(72 / img.naturalWidth, 72 / img.naturalHeight);
  tx.drawImage(img, (72 - img.naturalWidth * s) / 2, (72 - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
  ASSETS[id] = {img, src, name, thumb: tc.toDataURL()};
  if(!skipPut) idbPut(id, {src, name});
  return id;
}
async function fileToSrc(file){
  const src = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const img = await loadImg(src), mx = Math.max(img.naturalWidth, img.naturalHeight), LIM = 3840;
  if(mx <= LIM) return src;
  const k = LIM / mx, c = mk(img.naturalWidth * k, img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return file.type === 'image/jpeg' ? c.toDataURL('image/jpeg', 0.92) : c.toDataURL('image/png');
}
async function idbRestore(){
  try{
    const db = await idb(), st = db.transaction('assets').objectStore('assets');
    const [keys, vals] = await Promise.all([idbReq(st.getAllKeys()), idbReq(st.getAll())]);
    const used = new Set([DOC.bg.asset, ...DOC.layers.filter(l => l.type === 'image').map(l => l.asset)]);
    for(let i = 0; i < keys.length; i++){
      if(used.has(keys[i])){ if(!ASSETS[keys[i]]) await addAsset(vals[i].src, vals[i].name, keys[i], true); }
      else db.transaction('assets', 'readwrite').objectStore('assets').delete(keys[i]);
    }
  }catch{}
  renderLayers(); paintPreview(false);
}

