/* 楽ちんサムネメーカー：PC／スマホの自動判定・タッチ操作 */
/* ============ PC／スマホの自動判定 ============ */
let isMobile = false, sheet = null;
function detectMobile(){
  const pref = LS.get('ttm_view', 'auto');
  if(pref === 'pc') return false;
  if(pref === 'mobile') return true;
  const coarse = matchMedia('(pointer: coarse)').matches, hover = matchMedia('(hover: hover)').matches;
  const shortSide = Math.min(screen.width, screen.height), narrow = innerWidth < 820 || shortSide < 700;
  const ua = /Android.+Mobile|iPhone|iPod|Windows Phone|Mobile Safari/i.test(navigator.userAgent);
  return (ua && narrow) || (coarse && !hover && narrow) || innerWidth < 600;
}
function applyView(first){
  const m = detectMobile();
  if(m === isMobile && !first) return;
  isMobile = m;
  document.body.classList.toggle('is-mobile', m);
  if(!m){ openSheet(null); }
  const vb = $('#viewBtn'); if(vb){ vb.innerHTML = ic(m ? 'phone' : 'monitor'); vb.title = (m ? 'スマホ表示中' : 'PC表示中') + '（タップで切り替え）'; }
  document.querySelectorAll('#viewSeg button').forEach(b => b.classList.toggle('on', b.dataset.view === LS.get('ttm_view', 'auto')));
  if(DOC) $('#dlLabel').textContent = m ? '保存' : (DOC.mode === 'thumb' ? 'サムネを保存' : '透過PNGを保存');
  if(!first) setTimeout(() => paintPreview(false), 60);
}
function sheetTitle(n){ return n === 'layers' ? 'レイヤー' : (INS_INFO[insCtx()] || [])[1] || '設定'; }
function openSheet(name, force){
  if(!isMobile) name = null;
  if(!force && name && sheet === name) name = null;
  sheet = name;
  document.body.classList.toggle('sheet-open', !!name);
  $('#lpanel').classList.toggle('sheet-on', name === 'layers');
  $('#side').classList.toggle('sheet-on', name === 'ins');
  if(name && name !== 'layers') $('#sheetTitle').textContent = sheetTitle(name);
  document.querySelectorAll('#mbar [data-sheet]').forEach(b => b.classList.toggle('on', b.dataset.sheet === name));
  clearTimeout(openSheet.t); openSheet.t = setTimeout(() => paintPreview(false), 340);
}
function goTab(t){ setTab(t); if(isMobile) openSheet('ins', true); }
$('#mbar').addEventListener('click', e => { const b = e.target.closest('[data-sheet]'); if(!b) return; const n = b.dataset.sheet;
  if(n === 'add'){ openSheet(null); togglePop('addMenu', b); return; }
  if(n === 'bg'){ selectLayer(null); openSheet('ins', true); return; }
  openSheet(n); });
document.addEventListener('click', e => {
  if(e.target.closest('button[data-close-sheet]')){ openSheet(null); return; }
  const vb = e.target.closest('#viewSeg [data-view]');
  if(vb){ LS.set('ttm_view', vb.dataset.view); applyView(true); setTimeout(() => paintPreview(false), 60); toast(vb.dataset.view === 'auto' ? '画面を自動判定に戻しました' : vb.dataset.view === 'pc' ? 'PC表示に固定しました' : 'スマホ表示に固定しました'); }
});
$('#viewBtn').onclick = () => { LS.set('ttm_view', isMobile ? 'pc' : 'mobile'); applyView(true); setTimeout(() => paintPreview(false), 60); toast(isMobile ? 'スマホ表示に切り替えました（配置・背景 → 保存と書き出し で「自動判定」に戻せます）' : 'PC表示に切り替えました'); };
/* シートは下へスワイプで閉じる */
document.querySelectorAll('.sheet-grip').forEach(g => {
  let y0 = null;
  g.addEventListener('pointerdown', e => { if(e.target.closest('button')) return; y0 = e.clientY; g.setPointerCapture(e.pointerId); });
  g.addEventListener('pointermove', e => { if(y0 == null) return; const dy = Math.max(0, e.clientY - y0); g.parentElement.style.transform = `translateY(${dy}px)`; g.parentElement.style.transition = 'none'; });
  const up = e => { if(y0 == null) return; const dy = e.clientY - y0; y0 = null; const el = g.parentElement; el.style.transform = ''; el.style.transition = ''; if(dy > 70 || Math.abs(dy) < 4) openSheet(null); };
  g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
});
window.addEventListener('resize', () => { clearTimeout(applyView.t); applyView.t = setTimeout(() => applyView(false), 150); });

/* 共有（スマホ：写真アプリに保存できる） */
async function shareFile(blob, name){
  if(!isMobile || !navigator.canShare) return false;
  const file = new File([blob], name, {type: blob.type});
  if(!navigator.canShare({files:[file]})) return false;
  try{ await navigator.share({files:[file], title:'サムネイル'}); toast('共有メニューから「画像を保存」で写真に保存できます'); return true; }
  catch(e){ if(e && e.name === 'AbortError') return true; return false; }
}

/* キャンバスのタッチ操作：2本指でピンチ（拡大縮小・回転・移動）、長押しでメニュー、ダブルタップで文字編集 */
{
  const tv = $('#tv'), pts = new Map();
  let pinch = null, lp = null, lastTap = {t:0, x:0, y:0};
  const toDoc = (cx, cy) => { const r = tv.getBoundingClientRect(); return [(cx - r.left) / r.width * DOC.w, (cy - r.top) / r.height * DOC.h]; };
  const pairInfo = () => { const [a, b] = [...pts.values()]; return {d:Math.hypot(b.x - a.x, b.y - a.y), a:Math.atan2(b.y - a.y, b.x - a.x), cx:(a.x + b.x) / 2, cy:(a.y + b.y) / 2}; };
  tv.addEventListener('pointerdown', e => {
    if(DOC.mode !== 'thumb' || e.pointerType === 'mouse') return;
    pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if(pts.size === 2){
      e.stopImmediatePropagation(); clearTimeout(lp); drag = null; snapLines = {x:null, y:null};
      const I = pairInfo(), L = selLayer();
      const FE = frameEditLayer();
      const CE = collageEditLayer();
      if(CE) pinch = {kind:'cell', L:CE, i:I, zoom:CE.cells[CE.ac || 0].zoom || 1};
      else if(FE) pinch = {kind:'frame', L:FE, i:I, fs:FE.frame.fs ?? 1};
      else if(L && !L.locked) pinch = {kind:'layer', L, i:I, sc:L.sc, rot:L.rot || 0, x:L.x, y:L.y};
      else if(DOC.bg.type === 'image' && ASSETS[DOC.bg.asset]) pinch = {kind:'bg', i:I, zoom:DOC.bg.zoom, ox:DOC.bg.ox, oy:DOC.bg.oy};
      return;
    }
    // 長押し
    const x0 = e.clientX, y0 = e.clientY;
    clearTimeout(lp);
    lp = setTimeout(() => {
      if(pts.size !== 1) return;
      const [dx, dy] = toDoc(x0, y0);
      const L = [...DOC.layers].reverse().find(l => { if(l.hidden) return false; const d = dims.get(l.id); if(!d) return false; const a = -(l.rot || 0) * PI / 180, X = dx - l.x, Y = dy - l.y; return Math.abs(X * Math.cos(a) - Y * Math.sin(a)) <= d.w / 2 && Math.abs(X * Math.sin(a) + Y * Math.cos(a)) <= d.h / 2; });
      if(!L) return;
      if(drag && drag.L){ drag.L.x = drag.lx; drag.L.y = drag.ly; }
      drag = null; if(L.id !== DOC.sel) selectLayer(L.id);
      if(navigator.vibrate) navigator.vibrate(12);
      showMenu(L.id, x0 - 100, y0 + 12);
    }, 520);
    // ダブルタップ
    const now = Date.now();
    if(now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30){
      const [dx, dy] = toDoc(e.clientX, e.clientY), L = selLayer();
      if(L && L.type === 'text'){ clearTimeout(lp); setTimeout(() => goTab('text'), 30); }
      else if(L && L.type === 'image' && L.frame && L.frame.shape !== 'none' && !frameEdit){ clearTimeout(lp); setFrameEdit(L.id); }
      else if(L && L.type === 'collage' && !collageEdit){ clearTimeout(lp); setCollageEdit(L.id, collageCellAt(L, dx, dy)); }
    }
    lastTap = {t:now, x:e.clientX, y:e.clientY};
  }, true);
  tv.addEventListener('pointermove', e => {
    if(!pts.has(e.pointerId)) return;
    const p0 = pts.get(e.pointerId);
    if(Math.hypot(e.clientX - p0.x, e.clientY - p0.y) > 8) clearTimeout(lp);
    pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if(!pinch || pts.size < 2) return;
    e.stopImmediatePropagation();
    const I = pairInfo(), k = I.d / Math.max(1, pinch.i.d), r = tv.getBoundingClientRect(), u = DOC.w / r.width;
    if(pinch.kind === 'cell'){ const c = pinch.L.cells[pinch.L.ac || 0]; c.zoom = Math.round(clamp(pinch.zoom * k, 0.2, 8) * 1000) / 1000; }
    else if(pinch.kind === 'frame'){ const L = pinch.L, g0 = frameGeom(L); L.frame.fs = Math.round(clamp(pinch.fs * k, 0.1, 1) * 1000) / 1000; frameCompensate(L, g0); }
    else if(pinch.kind === 'layer'){
      const L = pinch.L;
      L.sc = Math.round(clamp(pinch.sc * k, 0.05, 10) * 1000) / 1000;
      let rot = pinch.rot + (I.a - pinch.i.a) * 180 / PI; rot = ((rot + 540) % 360) - 180;
      for(const s of [0, 90, -90, 180, -180]) if(Math.abs(rot - s) < 4) rot = s;
      L.rot = Math.round(rot * 10) / 10;
      L.x = Math.round(pinch.x + (I.cx - pinch.i.cx) * u); L.y = Math.round(pinch.y + (I.cy - pinch.i.cy) * u);
    }else{
      const b = DOC.bg; b.zoom = clamp(pinch.zoom * k, 0.2, 4);
      b.ox = pinch.ox + (I.cx - pinch.i.cx) * u / (DOC.w / 2); b.oy = pinch.oy + (I.cy - pinch.i.cy) * u / (DOC.h / 2);
    }
    syncDoc(); livePaint();
  }, true);
  const up = e => {
    if(!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId); clearTimeout(lp);
    if(pinch && pts.size < 2){ pinch = null; drag = null; docChanged(false); }
  };
  tv.addEventListener('pointerup', up, true); tv.addEventListener('pointercancel', up, true);
}

/* 操作ガイド */
function openHelp(){ $('#help').classList.add('show'); $('#helpNoAuto').checked = LS.get('ttm_helpAuto', false) === true; }
function closeHelp(){ $('#help').classList.remove('show'); LS.set('ttm_helpAuto', $('#helpNoAuto').checked); }
$('#helpBtn').onclick = openHelp;
$('#help').addEventListener('click', e => { if(e.target.id === 'help' || e.target.closest('[data-help-close]')) closeHelp(); });
$('#helpNoAuto').addEventListener('change', e => LS.set('ttm_helpAuto', e.target.checked));
document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && $('#help').classList.contains('show')){ closeHelp(); return; }
  const t = e.target; if(t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT') return;
  if(e.key === '?' && !e.ctrlKey && !e.metaKey){ e.preventDefault(); openHelp(); }
});

function thumbInit(){
  $('#selBox').innerHTML = `<div class="selbox"><div class="subhead" id="selTitle" hidden></div>${SEL_ROWS.map(r => drowPg(r)).join('')}</div>`;
  $('#bgRows').innerHTML = BG_ROWS.map(r => drowPg(r, true)).join('');
  $('#editText').onclick = () => { goTab('text'); if(!isMobile) $('#text').focus(); };
  $('#editStyle').onclick = () => goTab('style');
  $('#pickBg').onclick = () => $('#bgimgfile').click();
  $('#fxCenter').onclick = () => { DOC.bg.fcx = 0.5; DOC.bg.fcy = 0.5; syncDoc(); docChanged(false); };
  applyView(true);
  setMode(DOC.mode, true);
  renderInspector(true);
  syncDoc(); renderLayers();
  idbRestore();
  if(LS.get('ttm_helpAuto', 'first') !== false) setTimeout(openHelp, 400);
  window.addEventListener('resize', () => { clearTimeout(thumbInit.r); thumbInit.r = setTimeout(() => paintPreview(false), 60); });
  document.fonts.addEventListener('loadingdone', () => { if(DOC.mode === 'thumb'){ clearTimeout(thumbInit.f); thumbInit.f = setTimeout(() => paintPreview(false), 150); } });
}

