/* 楽ちんサムネメーカー：キャンバス・レイヤーパネルの操作 */
/* ---------- イベント ---------- */
document.addEventListener('click', e => {
  const pb = e.target.closest('[data-place]');
  if(pb){
    const L = selLayer(), d = L && dims.get(L.id); if(!d) return;
    const h = pb.dataset.place[0], v = pb.dataset.place[1], mx = DOC.w * 0.035, my = DOC.h * 0.05;
    const a = (L.rot || 0) * PI / 180, bw = Math.abs(d.w * Math.cos(a)) + Math.abs(d.h * Math.sin(a)), bh = Math.abs(d.w * Math.sin(a)) + Math.abs(d.h * Math.cos(a));
    L.x = Math.round(h === 'l' ? mx + bw / 2 : h === 'r' ? DOC.w - mx - bw / 2 : DOC.w / 2);
    L.y = Math.round(v === 't' ? my + bh / 2 : v === 'b' ? DOC.h - my - bh / 2 : DOC.h / 2);
    syncDoc(); docChanged(false); return;
  }
  if(e.target.closest('#collageEditBtn')){ const L = selLayer(); if(L) setCollageEdit(collageEdit ? null : L.id); return; }
  if(e.target.closest('#collageFill')){ const L = selLayer(); if(L){ Object.assign(L, {x:960, y:540, bw:1920, bh:1080, sc:1, rot:0}); syncDoc(); docChanged(false); } return; }
  if(e.target.closest('#frameEditBtn')){ const L = selLayer(); if(L) setFrameEdit(frameEdit ? null : L.id); return; }
  const frp = e.target.closest('[data-frpre]');
  if(frp){
    const L = selLayer(); if(!L || L.type !== 'image') return;
    const p = FRAME_PRESETS.find(q => q[0] === frp.dataset.frpre);
    const g0 = L.frame.shape !== 'none' && frameGeom(L);
    L.frame = Object.assign(FRAME_BASE(), {fs:L.frame.fs, cx:L.frame.cx, cy:L.frame.cy}, p[2]);
    if(g0 && L.frame.shape !== 'none') frameCompensate(L, g0);
    if(p[3]) L.outline = Object.assign({}, L.outline, {on:true}, p[3]);
    syncDoc(); docChanged(false); return;
  }
  const afb = e.target.closest('[data-addfx]');
  if(afb){ addFx(afb.dataset.addfx); return; }
  const fx = e.target.closest('[data-bgfx]');
  if(fx){ const withLayers = applyBgFx(fx.dataset.bgfx); toast(fx.dataset.bgfx === 'reset' ? '背景エフェクトをリセットしました（自分で追加した動的エフェクトはそのまま）' : `「${fx.textContent}」を適用しました` + (withLayers ? '（集中線や光はレイヤーとして追加。ドラッグで動かせます）' : '')); return; }
  const gb = e.target.closest('[data-guide]');
  if(gb){ DOC.guides[gb.dataset.guide] = !DOC.guides[gb.dataset.guide]; syncDoc(); saveDoc(); paintPreview(false); return; }
  const mb = e.target.closest('[data-mode]');
  if(mb){ setMode(mb.dataset.mode); return; }
  const tb = e.target.closest('#tabs [data-page]');
  if(tb){ setPage(tb.dataset.page); return; }
  if(e.target.closest('#insDesel')){ selectLayer(null); return; }
});
{
  const list = $('#layerList');
  let ld = null, suppressClick = false;
  list.addEventListener('pointerdown', e => {
    if(e.button !== 0) return;
    const row = e.target.closest('.ly[data-lid]'); if(!row || e.target.closest('[data-la]') || e.target.closest('input')) return;
    const rows = [...list.querySelectorAll('.ly[data-lid]')], from = rows.indexOf(row);
    ld = {row, id:row.dataset.lid, y0:e.clientY, started:false, rows, rects:rows.map(r => r.getBoundingClientRect()), from, to:from, pid:e.pointerId};
  });
  list.addEventListener('pointermove', e => {
    if(!ld) return;
    const dy = e.clientY - ld.y0;
    if(!ld.started){ if(Math.abs(dy) < 5) return; ld.started = true; ld.row.classList.add('dragging'); ld.row.setPointerCapture(ld.pid); }
    const {rects, from, rows} = ld, R = rects[from], lo = rects[0].top - R.top, hi = rects[rects.length - 1].bottom - R.bottom;
    const d = clamp(dy, lo, hi); ld.row.style.transform = `translateY(${d}px)`;
    const cy = R.top + R.height / 2 + d; let to = 0;
    rects.forEach((r, i) => { if(i !== from && r.top + r.height / 2 < cy) to++; });
    const h = R.height + 2;
    rows.forEach((r, i) => {
      if(i === from) return;
      const sh = from < to && i > from && i <= to ? -h : from > to && i >= to && i < from ? h : 0;
      r.style.transform = sh ? `translateY(${sh}px)` : '';
    });
    ld.to = to;
    // リストの端では自動スクロール
    const lr = list.getBoundingClientRect();
    if(e.clientY < lr.top + 24) list.scrollTop -= 8; else if(e.clientY > lr.bottom - 24) list.scrollTop += 8;
  });
  const endDrag = () => {
    if(!ld) return;
    const {started, from, to, id, rows} = ld; ld = null;
    if(!started) return;
    suppressClick = true; setTimeout(() => suppressClick = false, 0);
    rows.forEach(r => { r.style.transform = ''; r.classList.remove('dragging'); });
    const n = DOC.layers.length;
    if(to !== from){ moveLayer(id, n - 1 - to); const L = DOC.layers.find(l => l.id === id); toast(`「${layerName(L)}」を${to < from ? '前面' : '背面'}へ移動しました`); }
    else renderLayers();
    if(DOC.sel !== id) selectLayer(id);
  };
  list.addEventListener('pointerup', endDrag); list.addEventListener('pointercancel', endDrag);
  list.addEventListener('pointerdown', e => { if(e.target.closest('.ly-op')) lpSliding = true; }, true);
  window.addEventListener('pointerup', () => { lpSliding = false; });
  list.addEventListener('input', e => { const op = e.target.closest('.ly-op'); if(op) op.querySelector('b').textContent = Math.round(parseFloat(e.target.value) * 100) + '%'; });
  list.addEventListener('click', e => {
    if(suppressClick) return;
    const bga = e.target.closest('[data-bga]');
    if(bga){ DOC.bg.hidden = !DOC.bg.hidden; renderLayers(); syncDoc(); docChanged(false); toast(DOC.bg.hidden ? '背景を非表示にしました（PNGで保存すると背景が透明になります）' : '背景を表示しました'); return; }
    if(e.target.closest('.ly-op')) return;
    if(e.target.closest('[data-bgrow]')){ selectLayer(null); if(isMobile) openSheet('ins', true); return; }
    const row = e.target.closest('[data-lid]'); if(!row) return;
    const act = e.target.closest('[data-la]');
    if(act){
      if(act.dataset.la === 'menu'){ const r = act.getBoundingClientRect(); if(row.dataset.lid !== DOC.sel) selectLayer(row.dataset.lid); setTimeout(() => showMenu(row.dataset.lid, r.left - 150, r.bottom + 4), 0); return; }
      layerAction(row.dataset.lid, act.dataset.la); return;
    }
    if(e.target.closest('input')) return;
    selectLayer(row.dataset.lid);
  });
  list.addEventListener('dblclick', e => {
    const row = e.target.closest('[data-lid]'); if(!row || e.target.closest('[data-la]')) return;
    startRename(row.dataset.lid);
  });
  list.addEventListener('contextmenu', e => {
    const row = e.target.closest('[data-lid]'); if(!row) return;
    e.preventDefault(); if(row.dataset.lid !== DOC.sel) selectLayer(row.dataset.lid);
    showMenu(row.dataset.lid, e.clientX, e.clientY);
  });
  $('#addCollageBtn').onclick = () => addCollage();
}
$('#addText').onclick = () => {
  const st = clone(S); st.text = 'テキスト';
  const L = mkTextLayer(st, DOC.w / 2, DOC.h / 2, 1.2);
  DOC.layers.push(L); selectLayer(L.id); docChanged(false);
  openInspector('txt-text'); setTimeout(() => { $('#text').focus(); $('#text').select(); }, 60);
};
$('#addImg').onclick = () => $('#imgfile').click();
$('#imgfile').onchange = e => { addImageLayers([...e.target.files]); e.target.value = ''; };
$('#bgimgfile').onchange = e => { const f = e.target.files[0]; if(f) setBgFromFile(f); e.target.value = ''; };
$('#saveProj').onclick = () => {
  const used = usedAssets(), assets = {};
  used.forEach(id => { if(id && ASSETS[id]) assets[id] = ASSETS[id].src; });
  const blob = new Blob([JSON.stringify({app:'rakuchin-thumb', v:1, doc:DOC, assets})], {type:'application/json'});
  downloadBlob(blob, 'rakuchin-thumb-project.json'); toast('プロジェクトを保存しました');
};
$('#openProj').onclick = () => $('#projfile').click();
$('#projfile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if(f) openProjectFile(f); };
async function openProjectFile(f){
  try{
    const j = JSON.parse(await f.text()); if(!j.doc) throw new Error('プロジェクトファイルではありません');
    for(const [id, src] of Object.entries(j.assets || {})) await addAsset(src, id, id);
    loadDocObj(j.doc); toast('プロジェクトを開きました');
  }catch(err){ toast('開けませんでした: ' + err.message, true); }
}

/* ドラッグ＆ドロップ（画面のどこに落としてもOK）・貼り付け */
{
  const ov = $('#ddov'); let depth = 0;
  const hasFiles = e => [...(e.dataTransfer?.types || [])].some(t => t === 'Files' || t === 'text/uri-list');
  const show = on => { ov.classList.toggle('show', on); if(!on) ov.querySelectorAll('[data-dz]').forEach(z => z.classList.remove('hot')); };
  window.addEventListener('dragenter', e => { if(!hasFiles(e)) return; e.preventDefault(); depth++; show(true); });
  window.addEventListener('dragleave', e => { if(!hasFiles(e)) return; depth = Math.max(0, depth - 1); if(!depth) show(false); });
  window.addEventListener('dragover', e => {
    if(!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
    const z = e.target.closest && e.target.closest('[data-dz]');
    const hot = z || ov.querySelector('[data-dz=layer]');
    ov.querySelectorAll('[data-dz]').forEach(x => x.classList.toggle('hot', x === hot));
  });
  window.addEventListener('drop', async e => {
    if(!hasFiles(e)) return;
    e.preventDefault(); depth = 0;
    const z = e.target.closest && e.target.closest('[data-dz]'), zone = z ? z.dataset.dz : 'layer';
    show(false);
    let files = [...(e.dataTransfer.files || [])];
    // ほかのタブからドラッグした画像（ファイルが付いていない場合）はURLから取得を試す
    if(!files.length){
      const url = (e.dataTransfer.getData('text/uri-list') || '').split('\n').find(u => /^https?:/.test(u.trim()));
      if(url){
        try{ const r = await fetch(url.trim()); const b = await r.blob(); if(!/^image\//.test(b.type)) throw 0; files = [new File([b], url.split('/').pop().split('?')[0] || 'image', {type:b.type})]; }
        catch{ toast('この画像はサイトの制限で直接追加できません。一度PCに保存してからドラッグしてください', true); return; }
      }
    }
    const imgs = files.filter(f => /^image\//.test(f.type));
    const fontsF = files.filter(f => /\.(ttf|otf|woff2?)$/i.test(f.name));
    const proj = files.find(f => /\.json$/i.test(f.name));
    if(proj){ openProjectFile(proj); return; }
    if(fontsF.length) addFontFiles(fontsF);
    if(!imgs.length){ if(!fontsF.length) toast('画像（PNG / JPG / WebP など）かフォントファイルをドロップしてください', true); return; }
    if(DOC.mode !== 'thumb'){ setMode('thumb'); }
    if(zone === 'bg'){ await setBgFromFile(imgs[0]); openInspector(); toast('背景に設定しました'); if(imgs.length > 1) addImageLayers(imgs.slice(1)); }
    else { const rest = await collageTakeFiles(imgs, e.clientX, e.clientY); if(rest.length) addImageLayers(rest, true); }
  });
  document.addEventListener('paste', e => {
    if(DOC.mode !== 'thumb') return;
    if(isTyping(e)) return;
    const files = [...(e.clipboardData?.files || [])].filter(f => /^image\//.test(f.type));
    if(files.length){ e.preventDefault(); addImageLayers(files); }
  });
}

/* キャンバス上の操作 */
{
  const tv = $('#tv');
  const toDoc = e => { const r = tv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * DOC.w, (e.clientY - r.top) / r.height * DOC.h]; };
  const hitLayers = (x, y, all) => {
    const out = [];
    for(let i = DOC.layers.length - 1; i >= 0; i--){
      const L = DOC.layers[i]; if(L.hidden || (L.locked && !all)) continue;
      const d = dims.get(L.id); if(!d) continue;
      const a = -(L.rot || 0) * PI / 180, dx = x - L.x, dy = y - L.y;
      const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      if(Math.abs(lx) <= d.w / 2 && Math.abs(ly) <= d.h / 2) out.push(L);
    }
    return out;
  };
  const hitLayer = (x, y) => {
    const hs = hitLayers(x, y);
    // 選択中のレイヤーが重なりの中にあれば優先（手前のレイヤーに邪魔されずに動かせる）
    const cur = hs.find(l => l.id === DOC.sel);
    return cur && hs.length > 1 && lastAltPick === cur.id ? cur : hs[0] || null;
  };
  let lastAltPick = null;
  const handleAt = (x, y) => {
    const L = selLayer(), g = L && !L.hidden && !L.locked && layerGeom(L); if(!g) return null;
    const px = DOC.w / tvCss;
    if(Math.hypot(x - g.rot[0], y - g.rot[1]) < 11 * px) return 'rot';
    if(g.pts.some(([cx, cy]) => Math.hypot(x - cx, y - cy) < 10 * px)) return 'scale';
    return null;
  };
  tv.addEventListener('pointerdown', e => {
    if(DOC.mode !== 'thumb' || e.button !== 0) return;
    const [x, y] = toDoc(e);
    hideMenu();
    if(fxHandleOn() && Math.hypot(x - DOC.bg.fcx * DOC.w, y - DOC.bg.fcy * DOC.h) < 20 * DOC.w / tvCss){
      drag = {mode:'fx'}; tv.setPointerCapture(e.pointerId); e.preventDefault(); tv.style.cursor = 'grabbing'; return;
    }
    if(collagePointerDown(e, x, y, tv)) return;
    const FE = frameEditLayer();
    if(FE){
      const G = frameGeom(FE), [u, v] = frameLocal(FE, x, y), px = DOC.w / tvCss / FE.sc;
      const corner = [[-1, -1], [1, -1], [1, 1], [-1, 1]].some(([sx, sy]) => Math.hypot(u - sx * G.fw / 2, v - sy * G.fh / 2) < 14 * px);
      const inImg = Math.abs((FE.flip ? -u : u) + G.cxp - G.iw / 2) <= G.iw / 2 && Math.abs(v + G.cyp - G.ih / 2) <= G.ih / 2;
      if(corner || inImg){
        drag = {mode: corner ? 'fscale' : 'fmove', L:FE, x0:x, y0:y, u0:u, v0:v, g0:G, fs0:FE.frame.fs ?? 1, cx0:G.cxp / G.iw, cy0:G.cyp / G.ih, base:{x:FE.x, y:FE.y}, r0:Math.max(1, Math.hypot(u, v))};
        tv.setPointerCapture(e.pointerId); e.preventDefault(); return;
      }
      setFrameEdit(null);
    }
    let mode = handleAt(x, y), T = selLayer();
    if(!mode && e.altKey){
      // Alt+クリック：重なっている下のレイヤーを順番に選ぶ
      const hs = hitLayers(x, y);
      if(hs.length){ const k = hs.findIndex(l => l.id === DOC.sel); const nx = hs[(k + 1) % hs.length]; lastAltPick = nx.id; selectLayer(nx.id); T = nx; mode = 'move'; }
    }
    if(!mode){
      lastAltPick = null;
      T = hitLayer(x, y);
      if(!T){
        if(DOC.sel) selectLayer(null);
        if(DOC.bg.type === 'image' && ASSETS[DOC.bg.asset]){
          drag = {mode:'bg', x0:x, y0:y, ox:DOC.bg.ox, oy:DOC.bg.oy}; tv.style.cursor = 'grabbing';
          tv.setPointerCapture(e.pointerId); e.preventDefault();
        }
        return;
      }
      mode = 'move'; if(T.id !== DOC.sel) selectLayer(T.id);
    }
    drag = {mode, L:T, x0:x, y0:y, lx:T.x, ly:T.y, sc:T.sc, rot:T.rot || 0, d0:Math.hypot(x - T.x, y - T.y), a0:Math.atan2(y - T.y, x - T.x)};
    tv.setPointerCapture(e.pointerId); e.preventDefault();
  });
  tv.addEventListener('pointermove', e => {
    if(DOC.mode !== 'thumb') return;
    const [x, y] = toDoc(e);
    if(!drag && fxHandleOn() && Math.hypot(x - DOC.bg.fcx * DOC.w, y - DOC.bg.fcy * DOC.h) < 20 * DOC.w / tvCss){ tv.style.cursor = 'grab'; return; }
    if(!drag && (frameEditLayer() || collageEditLayer())){ tv.style.cursor = 'move'; return; }
    if(!drag){ const h = handleAt(x, y); tv.style.cursor = h === 'rot' ? 'grab' : h === 'scale' ? 'nwse-resize' : hitLayer(x, y) ? 'move' : (DOC.bg.type === 'image' && ASSETS[DOC.bg.asset] ? 'grab' : 'default'); return; }
    const L = drag.L, px = DOC.w / tvCss;
    if(drag.mode === 'cpan'){ collagePointerMove(x, y); return; }
    if(drag.mode === 'fmove' || drag.mode === 'fscale'){
      const G = drag.g0;
      // 基準位置に戻してから計算（画像は固定、フレームだけ動く）
      if(drag.mode === 'fmove'){
        const a = (L.rot || 0) * PI / 180, ddx = x - drag.x0, ddy = y - drag.y0;
        const du = (ddx * Math.cos(-a) - ddy * Math.sin(-a)) / L.sc * (L.flip ? -1 : 1), dv = (ddx * Math.sin(-a) + ddy * Math.cos(-a)) / L.sc;
        L.frame.cx = Math.round(clamp(drag.cx0 + du / G.iw, 0, 1) * 1000) / 1000; L.frame.cy = Math.round(clamp(drag.cy0 + dv / G.ih, 0, 1) * 1000) / 1000;
      }else{
        const [u, v] = frameLocal(drag.base ? Object.assign({}, L, drag.base) : L, x, y);
        L.frame.fs = Math.round(clamp(drag.fs0 * Math.hypot(u, v) / drag.r0, 0.1, 1) * 1000) / 1000;
      }
      frameCompensate(L, G, drag.base); syncDoc(); livePaint(); return;
    }
    if(drag.mode === 'fx'){
      let fx = x / DOC.w, fy = y / DOC.h;
      if(DOC.guides.snap && !e.altKey){ for(const v of [0.5, 1 / 3, 2 / 3]){ if(Math.abs(fx - v) * tvCss < 8) fx = v; if(Math.abs(fy - v) * tvCss * 9 / 16 < 8) fy = v; } }
      DOC.bg.fcx = Math.round(clamp(fx, -0.2, 1.2) * 1000) / 1000; DOC.bg.fcy = Math.round(clamp(fy, -0.2, 1.2) * 1000) / 1000;
      syncDoc(); livePaint(); return;
    }
    if(drag.mode === 'bg'){
      DOC.bg.ox = Math.round((drag.ox + (x - drag.x0) / (DOC.w / 2)) * 1000) / 1000;
      DOC.bg.oy = Math.round((drag.oy + (y - drag.y0) / (DOC.h / 2)) * 1000) / 1000;
      syncDoc(); livePaint(); return;
    }
    if(drag.mode === 'move'){
      let nx = drag.lx + x - drag.x0, ny = drag.ly + y - drag.y0; snapLines = {x:null, y:null};
      if(DOC.guides.snap && !e.altKey){
        const th = 8 * px;
        for(const sx of [DOC.w / 2, DOC.w / 3, DOC.w * 2 / 3]) if(Math.abs(nx - sx) < th){ nx = sx; snapLines.x = sx; break; }
        for(const sy of [DOC.h / 2, DOC.h / 3, DOC.h * 2 / 3]) if(Math.abs(ny - sy) < th){ ny = sy; snapLines.y = sy; break; }
      }
      L.x = Math.round(nx); L.y = Math.round(ny);
    }else if(drag.mode === 'scale'){
      L.sc = Math.round(clamp(drag.sc * Math.hypot(x - L.x, y - L.y) / Math.max(1, drag.d0), 0.05, 10) * 1000) / 1000;
    }else{
      let r = drag.rot + (Math.atan2(y - L.y, x - L.x) - drag.a0) * 180 / PI;
      r = ((r + 540) % 360) - 180;
      if(e.shiftKey) r = Math.round(r / 15) * 15; else for(const s of [0, 90, -90, 180, -180]) if(Math.abs(r - s) < 3) r = s;
      L.rot = Math.round(r * 10) / 10;
    }
    syncDoc(); livePaint();
  });
  const end = () => { if(!drag) return; drag = null; snapLines = {x:null, y:null}; docChanged(false); };
  tv.addEventListener('pointerup', end); tv.addEventListener('pointercancel', end);
  tv.addEventListener('wheel', e => {
    if(DOC.mode !== 'thumb') return;
    const [x, y] = toDoc(e), L = hitLayer(x, y), k = Math.exp(-e.deltaY * 0.0015);
    if(collageWheel(e, x, y, k)) return;
    const FE = frameEditLayer();
    if(FE){ const g0 = frameGeom(FE); FE.frame.fs = Math.round(clamp((FE.frame.fs ?? 1) * k, 0.1, 1) * 1000) / 1000; frameCompensate(FE, g0); e.preventDefault(); syncDoc(); docChanged(true); return; }
    if(L){ if(L.id !== DOC.sel) selectLayer(L.id); L.sc = Math.round(clamp(L.sc * k, 0.05, 10) * 1000) / 1000; }
    else if(DOC.bg.type === 'image' && ASSETS[DOC.bg.asset]){
      const b = DOC.bg, nz = clamp(b.zoom * k, 0.2, 4), r = nz / b.zoom;
      // カーソル位置を基準に拡大縮小
      const cx = DOC.w / 2 + b.ox * DOC.w / 2, cy = DOC.h / 2 + b.oy * DOC.h / 2;
      b.ox = ((x + (cx - x) * r) - DOC.w / 2) / (DOC.w / 2); b.oy = ((y + (cy - y) * r) - DOC.h / 2) / (DOC.h / 2); b.zoom = nz;
    }else return;
    e.preventDefault(); syncDoc(); docChanged(true);
  }, {passive:false});
  tv.addEventListener('contextmenu', e => {
    if(DOC.mode !== 'thumb') return;
    const [x, y] = toDoc(e), L = hitLayers(x, y, true)[0]; if(!L) return;
    e.preventDefault(); if(L.id !== DOC.sel) selectLayer(L.id); showMenu(L.id, e.clientX, e.clientY);
  });
  tv.addEventListener('dblclick', e => {
    const [x, y] = toDoc(e), L = hitLayer(x, y);
    if(L && L.type === 'text'){ selectLayer(L.id); openInspector('txt-text'); if(!isMobile){ $('#text').focus(); $('#text').select(); } }
    else if(L && L.type === 'image' && L.frame && L.frame.shape !== 'none' && !frameEdit){ selectLayer(L.id); setFrameEdit(L.id); }
    else if(L && L.type === 'collage' && !collageEdit){ selectLayer(L.id); setCollageEdit(L.id, collageCellAt(L, x, y)); }
  });
  document.addEventListener('keydown', e => {
    if(DOC.mode !== 'thumb' || $('#help').classList.contains('show') || document.querySelector('.pop.show')) return;
    if(isTyping(e)) return;
    const L = selLayer(); if(!L) return;
    const st = e.shiftKey ? 10 : 1;
    if(e.key === 'Delete' || e.key === 'Backspace'){ e.preventDefault(); layerAction(L.id, 'del'); }
    else if(e.key.startsWith('Arrow')){
      e.preventDefault(); if(L.locked) return;
      if(e.key === 'ArrowLeft') L.x -= st; if(e.key === 'ArrowRight') L.x += st;
      if(e.key === 'ArrowUp') L.y -= st; if(e.key === 'ArrowDown') L.y += st;
      docChanged(true);
    }else if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd'){ e.preventDefault(); layerAction(L.id, 'dup'); }
    else if((e.ctrlKey || e.metaKey) && (e.code === 'BracketRight' || e.code === 'BracketLeft')){
      e.preventDefault(); const fwd = e.code === 'BracketRight';
      layerAction(L.id, e.shiftKey ? (fwd ? 'front' : 'back') : (fwd ? 'up' : 'down'));
    }
    else if(e.key === 'Escape'){ hideMenu(); if(frameEdit){ setFrameEdit(null); return; } if(collageEdit){ setCollageEdit(null); return; } selectLayer(null); }
  });
}
