/* 楽ちんサムネメーカー：キャンバス上の編集モード（フレーム調整・マスの調整） */
/*
  画像のフレーム調整と、分割フレームのマスの調整は同じ流れで動く：
    ダブルクリック（ボタン）で入る → ドラッグ・ホイール・ピンチで調整 → Esc・外をクリック・別のレイヤーを選ぶと終わる
  モードごとの違いだけを EDIT_MODES に書き、入り方・終わり方・入力の振り分けはここで共通に扱う。
*/
let edit = null; // {kind, id}
const EDIT_MODES = {
  // 画像の切り抜きフレーム：画像はそのままで、切り抜く範囲を動かす・大きさを変える
  frame: {
    btn:'frameEditBtn', label:'キャンバスでフレームを調整',
    ok: L => L.type === 'image' && L.frame && L.frame.shape !== 'none' && !!ASSETS[L.asset],
    hint: () => isMobile ? 'ドラッグでフレームの位置、ピンチで大きさを調整。外をタップで終了' : 'ドラッグでフレームの位置、角かホイールで大きさを調整。Esc か外をクリックで終了',
    banner: () => isMobile ? 'フレーム調整中：ドラッグで位置／ピンチで大きさ／外をタップで終了' : 'フレーム調整中：ドラッグで位置／角・ホイールで大きさ／Esc か外をクリックで終了',
    down(L, x, y){
      const G = frameGeom(L), [u, v] = frameLocal(L, x, y), px = DOC.w / tvCss / L.sc;
      const corner = [[-1, -1], [1, -1], [1, 1], [-1, 1]].some(([sx, sy]) => Math.hypot(u - sx * G.fw / 2, v - sy * G.fh / 2) < 14 * px);
      const inImg = Math.abs((L.flip ? -u : u) + G.cxp - G.iw / 2) <= G.iw / 2 && Math.abs(v + G.cyp - G.ih / 2) <= G.ih / 2;
      if(!corner && !inImg) return null;
      return {sub: corner ? 'scale' : 'move', g0:G, fs0:L.frame.fs ?? 1, cx0:G.cxp / G.iw, cy0:G.cyp / G.ih, base:{x:L.x, y:L.y}, r0:Math.max(1, Math.hypot(u, v))};
    },
    move(L, x, y, d){
      const G = d.g0;
      // 開始時の位置を基準に計算する（画像は固定、フレームだけ動く）
      if(d.sub === 'move'){
        const [du, dv] = rotLocal(L, x - d.x0, y - d.y0);
        L.frame.cx = r3(clamp(d.cx0 + du / L.sc * (L.flip ? -1 : 1) / G.iw, 0, 1)); L.frame.cy = r3(clamp(d.cy0 + dv / L.sc / G.ih, 0, 1));
      }else{
        const [u, v] = frameLocal(Object.assign({}, L, d.base), x, y);
        L.frame.fs = r3(clamp(d.fs0 * Math.hypot(u, v) / d.r0, 0.1, 1));
      }
      frameCompensate(L, G, d.base);
    },
    zoom(L, k){ const g0 = frameGeom(L); L.frame.fs = r3(clamp((L.frame.fs ?? 1) * k, 0.1, 1)); frameCompensate(L, g0); },
    pinchStart: L => ({fs: L.frame.fs ?? 1}),
    pinch(L, st, k){ const g0 = frameGeom(L); L.frame.fs = r3(clamp(st.fs * k, 0.1, 1)); frameCompensate(L, g0); },
    overlay(ctx, L, f, dpr){
      const G = frameGeom(L);
      ctx.save(); ctx.translate(L.x * f, L.y * f); ctx.rotate((L.rot || 0) * PI / 180); ctx.scale(L.sc * f, L.sc * f);
      ctx.save(); if(L.flip) ctx.scale(-1, 1); ctx.globalAlpha = 0.38; ctx.drawImage(G.A.img, -G.cxp, -G.cyp, G.iw, G.ih); ctx.restore();
      const k = 1 / (L.sc * f), hw = G.fw / 2, hh = G.fh / 2;
      ctx.lineWidth = 2 * dpr * k; ctx.strokeStyle = '#ffb800'; ctx.setLineDash([7 * dpr * k, 5 * dpr * k]); ctx.strokeRect(-hw, -hh, hw * 2, hh * 2); ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = dpr * k; ctx.beginPath(); framePath(ctx, L.frame.shape, G.fw, G.fh, L.frame.r, L.frame.seed); ctx.stroke();
      ctx.fillStyle = '#ffb800'; ctx.strokeStyle = '#1f1b2d'; ctx.lineWidth = 2 * dpr * k;
      for(const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]){ ctx.beginPath(); ctx.arc(sx * hw, sy * hh, 7 * dpr * k, 0, 2 * PI); ctx.fill(); ctx.stroke(); }
      ctx.restore();
    },
  },
  // 分割フレームのマス：マスの中の画像を動かす・拡大縮小する
  cells: {
    btn:'collageEditBtn', label:'キャンバスでマスの画像を調整',
    ok: L => L.type === 'collage',
    hint: () => isMobile ? 'マスをドラッグで中の画像を移動、ピンチで拡大縮小。外をタップで終了' : 'マスをドラッグで中の画像を移動、ホイールで拡大縮小。Esc か外をクリックで終了',
    banner: L => isMobile ? `マス${L.ac + 1}を調整中：ドラッグで移動／ピンチで拡大縮小／外をタップで終了` : `マス${L.ac + 1}を調整中：ドラッグで移動／ホイールで拡大縮小／Esc か外をクリックで終了`,
    enter(L, x, y){ if(x != null){ const i = collageCellAt(L, x, y); if(i >= 0) L.ac = i; } },
    down(L, x, y){
      const i = collageCellAt(L, x, y); if(i < 0) return null;
      L.ac = i; const c = L.cells[i];
      return {i, ox0:c.ox || 0, oy0:c.oy || 0, size:collageCellSize(L, i)};
    },
    move(L, x, y, d){
      const [dx, dy] = rotLocal(L, x - d.x0, y - d.y0), c = L.cells[d.i];
      c.ox = r3(d.ox0 + dx / d.size[0]); c.oy = r3(d.oy0 + dy / d.size[1]);
    },
    zoom(L, k, x, y){
      const i = collageCellAt(L, x, y); if(i < 0) return false;
      L.ac = i; const c = L.cells[i]; c.zoom = r3(clamp((c.zoom || 1) * k, 0.2, 8));
    },
    pinchStart: L => ({zoom: L.cells[L.ac || 0].zoom || 1}),
    pinch(L, st, k){ const c = L.cells[L.ac || 0]; c.zoom = r3(clamp(st.zoom * k, 0.2, 8)); },
    overlay(ctx, L, f, dpr){
      const w = L.bw * L.sc, h = L.bh * L.sc, cells = collageCells(L.layout, collageN(L), w, h, L.slant, L.main);
      ctx.save(); ctx.translate(L.x * f, L.y * f); ctx.rotate((L.rot || 0) * PI / 180); ctx.scale(f, f); ctx.translate(-w / 2, -h / 2);
      ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
      cells.forEach((p, i) => { collagePath(ctx, p); ctx.lineWidth = (i === L.ac ? 3 : 1.5) * dpr / f; ctx.strokeStyle = i === L.ac ? '#ffb800' : 'rgba(255,255,255,.8)'; ctx.setLineDash(i === L.ac ? [] : [6 * dpr / f, 5 * dpr / f]); ctx.stroke(); });
      ctx.restore();
    },
  },
};
// レイヤーの回転を打ち消した向きでの移動量（ドキュメント座標）
function rotLocal(L, dx, dy){ const a = -(L.rot || 0) * PI / 180; return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)]; }
// 画像上の点（ドキュメント座標）→ フレーム基準のローカル座標（画像ピクセル）
function frameLocal(L, x, y){ const [u, v] = rotLocal(L, x - L.x, y - L.y); return [u / L.sc, v / L.sc]; }

const editModeFor = L => L && Object.keys(EDIT_MODES).find(k => EDIT_MODES[k].ok(L)) || null;
function editLayer(){
  if(!edit) return null;
  const L = DOC.layers.find(l => l.id === edit.id);
  return L && !L.hidden && EDIT_MODES[edit.kind].ok(L) ? L : null;
}
function setEdit(kind, L, x, y){
  edit = kind && L ? {kind, id:L.id} : null;
  for(const [k, M] of Object.entries(EDIT_MODES)){ const b = document.getElementById(M.btn); if(b) b.lastChild.textContent = edit && edit.kind === k ? '調整を終える' : M.label; }
  if(edit){ const M = EDIT_MODES[kind]; if(M.enter) M.enter(L, x, y); toast(M.hint()); }
  syncDoc(); paintPreview(false);
}
function toggleEdit(kind){ const L = selLayer(); if(edit && edit.kind === kind) setEdit(null); else if(L && EDIT_MODES[kind].ok(L)) setEdit(kind, L); }
// ダブルクリック・ダブルタップで、そのレイヤーの編集モードに入る
function enterEditAt(L, x, y){ const kind = editModeFor(L); if(!kind || edit) return false; selectLayer(L.id); setEdit(kind, L, x, y); return true; }

/* 入力の振り分け（キャンバスの操作から呼ばれる） */
function editPointerDown(e, x, y, tv){
  const L = editLayer(); if(!L) return false;
  const d = EDIT_MODES[edit.kind].down(L, x, y);
  if(!d){ setEdit(null); return false; }  // 外をクリックしたら終わり、ふだんの操作へ
  drag = Object.assign({mode:'edit', L, x0:x, y0:y}, d);
  tv.setPointerCapture(e.pointerId); e.preventDefault(); syncDoc(); return true;
}
function editPointerMove(x, y){ EDIT_MODES[edit.kind].move(drag.L, x, y, drag); syncDoc(); livePaint(); }
function editWheel(e, x, y, k){
  const L = editLayer(); if(!L) return false;
  if(EDIT_MODES[edit.kind].zoom(L, k, x, y) === false) return false;
  e.preventDefault(); syncDoc(); docChanged(true); return true;
}
function editPinchStart(I){ const L = editLayer(); return L ? {kind:'edit', L, i:I, st:EDIT_MODES[edit.kind].pinchStart(L)} : null; }
function editPinch(p, k){ EDIT_MODES[edit.kind].pinch(p.L, p.st, k); }
function drawEditOverlay(ctx, W, H, dpr){
  const L = editLayer(); if(!L) return false;
  const M = EDIT_MODES[edit.kind]; M.overlay(ctx, L, W / DOC.w, dpr); drawBanner(ctx, W, dpr, M.banner(L));
  return true;
}
