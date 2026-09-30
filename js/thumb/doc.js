/* 楽ちんサムネメーカー：サムネのデータ構造・値の読み書き・変更通知 */
/* ============ サムネ作成 ============ */
const DOC_BASE = () => ({
  mode:'thumb', w:1920, h:1080, exportW:1920, fmt:'png', limit2mb:true,
  guides:{thirds:false, badge:true, snap:true, fx:true},
  bg:{hidden:false, op:1, type:'grad', color:'#16161c', c1:'#ff5a2e', c2:'#ffbe3b', angle:120, asset:null, fit:'cover', zoom:1, ox:0, oy:0, rot:0, flip:false,
      gap:'blur', gapColor:'#111114', bright:0, contrast:0, sat:0, hue:0, blur:0, tone:'none', duo1:'#1b1464', duo2:'#ff9d5c',
      dim:0, vignette:0, fcx:0.5, fcy:0.5, shade:{on:false, c:'#000000', amt:0.75, angle:90, cover:0.55},
      zb:{on:false, amt:0.25, cx:0.5, cy:0.5}, mb:{on:false, dist:120, angle:0}, mosaic:{on:false, size:28},
      tint:{on:false, c:'#ff7a50', a:0.35, mode:'overlay'}},
  layers:[], sel:null, textSel:null, msel:[],
});
const uid = () => 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const mkTextLayer = (style, x, y, sc) => Object.assign(LAYER_BASE(), {id:uid(), type:'text', x, y, sc, style});
const selLayer = () => (DOC && DOC.layers.find(l => l.id === DOC.sel)) || null;
const textLayer = () => (DOC && DOC.layers.find(l => l.id === DOC.textSel)) || null;
function usedAssets(){ return new Set([DOC.bg.asset, ...DOC.layers.flatMap(l => l.type === 'image' ? [l.asset] : l.type === 'collage' ? l.cells.map(c => c.asset) : [])].filter(Boolean)); }
function layerName(L){
  if(L.label) return L.label;
  if(L.type === 'text') return L.style.text.replace(/[{}]/g, '').replace(/\n/g, ' ').trim().slice(0, 28) || '（空の文字）';
  if(L.type === 'group') return `グループ（${groupKids(L).length}個）`;
  if(L.type === 'fx') return FX_NAMES[L.kind] || 'エフェクト';
  if(L.type === 'collage') return `分割フレーム（${collageN(L)}分割）`;
  return L.name || '画像';
}
function normalizeDoc(d){
  const b = DOC_BASE();
  if(!d || !Array.isArray(d.layers)){
    const L = mkTextLayer(S, b.w / 2, b.h / 2, 1.5);
    b.layers = [L]; b.sel = L.id; b.textSel = L.id; return b;
  }
  const o = Object.assign(b, d);
  o.w = clamp(Math.round(d.w) || 1920, 200, 5000); o.h = clamp(Math.round(d.h) || 1080, 200, 5000);
  const base = DOC_BASE();
  o.bg = Object.assign(base.bg, d.bg || {});
  for(const k of ['zb', 'mb', 'mosaic', 'tint', 'shade']) o.bg[k] = Object.assign(DOC_BASE().bg[k], (d.bg || {})[k] || {});
  o.guides = Object.assign(base.guides, d.guides || {});
  if(d.bg && d.bg.fcx == null && d.bg.zb && (d.bg.zb.cx !== 0.5 || d.bg.zb.cy !== 0.5) && d.bg.zb.cx != null){ o.bg.fcx = d.bg.zb.cx; o.bg.fcy = d.bg.zb.cy; }
  o.layers = d.layers.filter(L => L.type !== 'fx' || FX_DEF[L.kind]).map(L => L.type === 'text'
    ? Object.assign(LAYER_BASE(), L, {style: merged(L.style || {})})
    : L.type === 'collage' ? (b => Object.assign(b, L, {fx: mergeCellFx(L.fx), shadow: Object.assign(b.shadow, L.shadow || {}),
        cells: b.cells.map((c, i) => { const s = (L.cells || [])[i] || {}; return Object.assign(c, s, {fx: mergeCellFx(s.fx)}); })}))(COLLAGE_BASE())
    : L.type === 'group' ? (b => Object.assign(b, L, {fxMode:'all', fx: mergeCellFx(L.fx), shadow: Object.assign(b.shadow, L.shadow || {})}))(Object.assign(LAYER_BASE(), GROUP_BASE()))
    : L.type === 'fx' ? Object.assign(LAYER_BASE(), L, {p:Object.assign(FX_DEF[L.kind](), L.p || {})})
    : Object.assign(LAYER_BASE(), IMAGE_BASE(), L, {
        outline: Object.assign(IMAGE_BASE().outline, L.outline || {}), crop: Object.assign(IMAGE_BASE().crop, L.crop || {}),
        frame: (fr => { const o = Object.assign(FRAME_BASE(), fr); if(fr.fs == null && fr.zoom) o.fs = Math.max(0.1, 1 / fr.zoom); delete o.zoom; delete o.ox; delete o.oy; return o; })(L.frame || {}),
        shadow: Object.assign(IMAGE_BASE().shadow, L.shadow || {})}));
  // グループ：存在しないグループを指す gid を外し、中身のないグループを消す。複数選択は保存しない
  const gids = new Set(o.layers.filter(l => l.type === 'group').map(l => l.id));
  o.layers.forEach(l => { if(l.gid && (!gids.has(l.gid) || l.type === 'group')) delete l.gid; if(!l.gid) delete l.gid; });
  o.layers = o.layers.filter(l => l.type !== 'group' || o.layers.some(k => k.gid === l.id));
  o.msel = [];
  // 以前の「背景の集中線」を動的エフェクトのレイヤーに移す
  const oldLines = (d.bg || {}).lines; delete o.bg.lines;
  if(oldLines && oldLines.on){ const l = oldLines; o.layers.unshift(mkFx('lines', {c:l.c, n:l.n, inner:l.inner, w:l.w ?? 1, len:l.len ?? 1, seed:l.seed}, {op:l.a, x:(o.bg.fcx ?? 0.5) * 1920, y:(o.bg.fcy ?? 0.5) * 1080})); }
  if(!o.layers.find(l => l.id === o.textSel)){ const T = o.layers.find(l => l.type === 'text'); o.textSel = T ? T.id : null; }
  if(o.sel && !o.layers.find(l => l.id === o.sel)) o.sel = null;
  return o;
}
// 保存しておいた作業を読み込み、選択中の文字レイヤーのスタイルを文字パネルにつなぐ
function loadSavedDoc(){
  DOC = normalizeDoc(LS.get('ttm_doc', null));
  const T = textLayer(); if(T) S = T.style;
}

function saveDoc(){
  clearTimeout(saveDoc.t);
  saveDoc.t = setTimeout(() => { LS.set('ttm_state', S); if(DOC) LS.set('ttm_doc', DOC); }, 250);
}

/* ---------- ドキュメント操作 ---------- */
function dBase(k){
  if(k.startsWith('@cell.')){ const L = selLayer(); return [L && L.cells ? L.cells[L.ac || 0] : null, k.slice(6)]; }
  return k[0] === '@' ? [selLayer(), k.slice(1)] : [DOC, k];
}
function dGet(k){ const [b, p] = dBase(k); return b ? p.split('.').reduce((o, q) => o?.[q], b) : undefined; }
function dSet(k, v){
  const [b, p] = dBase(k); if(!b) return;
  const ps = p.split('.'), last = ps.pop(), o = ps.reduce((o, q) => o?.[q], b);
  if(o) o[last] = v;
  if(k === '@n' && b.type === 'collage' && !collageLayoutOk(b.layout, collageN(b))) b.layout = 'cols';
  if(k === '@fxMode' && b.type === 'collage') collageFxModeChanged(b);
}
function docChanged(live){
  saveDoc(); clearTimeout(histT); histT = setTimeout(pushHist, 450);
  if(DOC.mode !== 'thumb') return;
  clearTimeout(schT);
  if(live){ livePaint(); schT = setTimeout(update, 220); } else schT = setTimeout(update, 30);
  clearTimeout(docChanged.t); docChanged.t = setTimeout(renderLayers, 150);
}
// サムネ（DOC・選択中のレイヤー）用の入力欄のつなぎ込み。キーが @ で始まると選択中のレイヤー
function setD(k, v){
  // 切り抜きフレームを変えても、画像そのものはキャンバス上で動かないように位置を補正する
  if(/^@frame\.(cx|cy|fs|ar|shape)$/.test(k)){ const L = selLayer(), g0 = L && L.type === 'image' && frameGeom(L); dSet(k, v); if(g0 && L.frame.shape !== 'none') frameCompensate(L, g0); }
  else dSet(k, v);
}
const DB = makeBinder({val:'d', seg:'dseg', show:'dshow', reroll:'dreroll', get:dGet,
  onInput(k, v, el){
    const cL = /^@crop\./.test(k) ? selLayer() : null, c0 = cL && cropCentre(cL);
    setD(k, v);
    if(cL && c0){ const c1 = cropCentre(cL), a = (cL.rot || 0) * PI / 180, dx = (c1[0] - c0[0]) * cL.sc, dy = (c1[1] - c0[1]) * cL.sc;   // 見えている部分が動かないように位置を補正
      cL.x += dx * Math.cos(a) - dy * Math.sin(a); cL.y += dx * Math.sin(a) + dy * Math.cos(a); }
    if(k === '@p.reach'){ const L = selLayer(); if(L && L.p && L.p.full !== false) L.p.full = false; }   // 最大サイズを動かしたら、画面の端までをやめて指定に切り替える
    if(/^bg\.fc[xy]$/.test(k)) showFxCenterBriefly();
    syncDoc(el); docChanged(el.type === 'range');
  },
  onSeg(k, v){
    setD(k, v); syncDoc(); docChanged(false);
    if(k === 'bg.type' && v === 'image' && !ASSETS[DOC.bg.asset]) $('#bgimgfile').click();
  },
  onReroll(k){ dSet(k, Math.floor(Math.random() * 1e6)); docChanged(false); },
});
// ドラッグ中など、何度も続けて呼ばれるときは1フレームに1回だけ同期する
let syncRaf = 0;
function syncDocSoon(){ if(!syncRaf) syncRaf = requestAnimationFrame(() => { syncRaf = 0; syncDoc(); }); }
function syncDoc(except){
  DB.sync(except);
  document.querySelectorAll('[data-guide]').forEach(b => b.classList.toggle('on', !!DOC.guides[b.dataset.guide]));
  const L = selLayer(); document.querySelectorAll('[data-flip]').forEach(b => b.classList.toggle('on', !!(L && L[b.dataset.flip])));
  renderInspector();
  renderCells();
  refreshSizeUI();
}

// トリミング後の絵の中心（元の画像の中心からのずれ。画像の座標）。反転も考えに入れる
function cropCentre(L){
  const A = ASSETS[L.asset]; if(!A) return [0, 0];
  const c = cropOf(L), iw = A.img.naturalWidth, ih = A.img.naturalHeight;
  return [(c.l - c.r) / 2 * iw * (L.flip ? -1 : 1), (c.t - c.b) / 2 * ih * (L.flipV ? -1 : 1)];
}
