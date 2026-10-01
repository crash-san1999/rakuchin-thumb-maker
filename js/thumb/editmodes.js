/* 楽ちんサムネメーカー：キャンバス上の編集モード（フレーム調整・マスの調整） */
/*
  画像のフレーム調整と、分割フレームのマスの調整は同じ流れで動く：
    ダブルクリック（ボタン）で入る → ドラッグ・ホイール・ピンチで調整 → Esc・外をクリック・別のレイヤーを選ぶと終わる
  モードごとの違いだけを EDIT_MODES に書き、入り方・終わり方・入力の振り分けはここで共通に扱う。
*/
let edit = null; // {kind, id}
let cutCursor = null;   // ブラシの丸を出す位置（ドキュメント座標）
const r4 = v => Math.round(v * 10000) / 10000;
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
      const inImg = Math.abs((L.flip ? -u : u) + G.cxp - G.iw / 2) <= G.iw / 2 && Math.abs((L.flipV ? -v : v) + G.cyp - G.ih / 2) <= G.ih / 2;
      if(!corner && !inImg) return null;
      return {sub: corner ? 'scale' : 'move', g0:G, fs0:L.frame.fs ?? 1, cx0:G.cxp / G.iw, cy0:G.cyp / G.ih, base:{x:L.x, y:L.y}, r0:Math.max(1, Math.hypot(u, v))};
    },
    move(L, x, y, d){
      const G = d.g0;
      // 開始時の位置を基準に計算する（画像は固定、フレームだけ動く）
      if(d.sub === 'move'){
        const [du, dv] = rotLocal(L, x - d.x0, y - d.y0);
        L.frame.cx = r3(clamp(d.cx0 + du / L.sc * (L.flip ? -1 : 1) / G.iw, 0, 1)); L.frame.cy = r3(clamp(d.cy0 + dv / L.sc * (L.flipV ? -1 : 1) / G.ih, 0, 1));
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
      ctx.save(); if(L.flip || L.flipV) ctx.scale(L.flip ? -1 : 1, L.flipV ? -1 : 1); ctx.globalAlpha = 0.38; ctx.drawImage(G.A.img, -G.cxp, -G.cyp, G.iw, G.ih); ctx.restore();
      const k = 1 / (L.sc * f), hw = G.fw / 2, hh = G.fh / 2;
      ctx.lineWidth = 2 * dpr * k; ctx.strokeStyle = '#ffb800'; ctx.setLineDash([7 * dpr * k, 5 * dpr * k]); ctx.strokeRect(-hw, -hh, hw * 2, hh * 2); ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = dpr * k; ctx.beginPath(); framePath(ctx, L.frame.shape, G.fw, G.fh, L.frame.r, L.frame.seed); ctx.stroke();
      ctx.fillStyle = '#ffb800'; ctx.strokeStyle = '#1f1b2d'; ctx.lineWidth = 2 * dpr * k;
      for(const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]){ ctx.beginPath(); ctx.arc(sx * hw, sy * hh, 7 * dpr * k, 0, 2 * PI); ctx.fill(); ctx.stroke(); }
      ctx.restore();
    },
  },
  // 背景透過のブラシ：なぞって消す・戻す／画像から背景色を拾う
  cut: {
    btn:'cutBrushBtn', label:'キャンバスでブラシを使う',
    ok: L => L.type === 'image' && L.frame && L.frame.shape === 'none' && !!ASSETS[L.asset],
    hint: () => isMobile ? 'なぞって消す・戻す。外をタップで終了' : 'ドラッグで消す・戻す、ホイールで太さ。Esc か外をクリックで終了',
    banner: L => (L.btool === 'pick' ? '色を拾う：背景にしたい色の場所をクリック' : L.btool === 'restore' ? 'ブラシで戻す：なぞったところの元の絵が戻ります' : 'ブラシで消す：なぞったところが透明になります') + (isMobile ? '／外をタップで終了' : '／ホイールで太さ／Esc で終了'),
    down(L, x, y){
      const A = ASSETS[L.asset], S = cropSrc(L, A), cw = S.img.naturalWidth, ch = S.img.naturalHeight, [u, v] = frameLocal(L, x, y);
      const su = L.flip ? -u : u, sv = L.flipV ? -v : v, m = L.btool === 'pick' ? 0 : L.bsz / 2 / L.sc;
      if(Math.abs(su) > cw / 2 + m || Math.abs(sv) > ch / 2 + m) return null;   // 画像の外をクリックしたら終わり
      const iw0 = A.img.naturalWidth, ih0 = A.img.naturalHeight, rc = cropOn(L) ? cropRect(L, iw0, ih0) : {sx:0, sy:0}, px = rc.sx + su + cw / 2, py = rc.sy + sv + ch / 2;
      if(L.btool === 'pick'){
        const c = cutPixelColor(S.img, su + cw / 2, sv + ch / 2);
        if(c){ L.key.c = c; L.key.on = true; } else toast('そこは透明です。ほかの場所をクリックしてください', true);
        return {sub:'pick', ok:!!c};
      }
      const st = {id:uid(), m:L.btool === 'restore' ? 'r' : 'e', r:r4(L.bsz / 2 / L.sc / iw0), p:[[r4(px / iw0), r4(py / ih0)]]};
      L.strokes.push(st);
      return {sub:'brush', st, iw0, ih0, last:[px, py], rp:L.bsz / 2 / L.sc};
    },
    move(L, x, y, d){
      cutCursor = [x, y];
      if(d.sub !== 'brush') return;
      const A = ASSETS[L.asset], S = cropSrc(L, A), cw = S.img.naturalWidth, ch = S.img.naturalHeight, [u, v] = frameLocal(L, x, y);
      const rc = cropOn(L) ? cropRect(L, d.iw0, d.ih0) : {sx:0, sy:0}, px = rc.sx + (L.flip ? -u : u) + cw / 2, py = rc.sy + (L.flipV ? -v : v) + ch / 2;
      if(Math.hypot(px - d.last[0], py - d.last[1]) < Math.max(0.5, d.rp * 0.2)) return;
      d.st.p.push([r4(px / d.iw0), r4(py / d.ih0)]); d.last = [px, py];
    },
    up(L, d){ if(d.sub === 'pick' && d.ok){ L.btool = 'erase'; setEdit(null); toast('背景色を拾いました。許容値で調整できます'); } },
    zoom(L, k){ L.bsz = Math.round(clamp(L.bsz * k, 4, 600)); },
    pinchStart: L => ({}),
    pinch(){},
    overlay(ctx, L, f, dpr){
      const A = ASSETS[L.asset], S = cropSrc(L, A);
      // 消した部分も薄く見せる（戻すときの目安）
      ctx.save(); ctx.translate(L.x * f, L.y * f); ctx.rotate((L.rot || 0) * PI / 180); ctx.scale(L.sc * f * (L.flip ? -1 : 1), L.sc * f * (L.flipV ? -1 : 1));
      ctx.globalAlpha = 0.28; ctx.drawImage(S.img, -S.img.naturalWidth / 2, -S.img.naturalHeight / 2); ctx.restore();
      if(cutCursor){
        const cx = cutCursor[0] * f, cy = cutCursor[1] * f; ctx.save(); ctx.lineWidth = 1.5 * dpr;
        if(L.btool === 'pick'){ ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 9 * dpr, 0, 7); ctx.moveTo(cx - 14 * dpr, cy); ctx.lineTo(cx + 14 * dpr, cy); ctx.moveTo(cx, cy - 14 * dpr); ctx.lineTo(cx, cy + 14 * dpr); ctx.stroke(); }
        else{ const r = L.bsz / 2 * f; ctx.strokeStyle = '#111'; ctx.beginPath(); ctx.arc(cx, cy, r + dpr, 0, 7); ctx.stroke(); ctx.strokeStyle = L.btool === 'restore' ? '#5cf08a' : '#fff'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke(); }
        ctx.restore();
      }
    },
  },
  // 分割フレームのマス：マスの中の画像を動かす・拡大縮小する
  cells: {
    btn:'collageEditBtn', label:'キャンバスでマスの画像を調整',
    ok: L => L.type === 'collage',
    hint: () => isMobile ? 'マスをドラッグで中の画像を移動、別のマスまで持っていくと入れ替え、ピンチで拡大縮小。外をタップで終了' : 'マスをドラッグで中の画像を移動、別のマスまで持っていくと入れ替え、ホイールで拡大縮小（Shift+ホイールで回転）。Esc か外をクリックで終了',
    banner: L => isMobile ? `マス${L.ac + 1}：ドラッグで移動／別のマスへで入れ替え／ピンチで拡大縮小／外をタップで終了` : `マス${L.ac + 1}：ドラッグで移動／別のマスへ持っていくと入れ替え／ホイールで拡大縮小・Shift+ホイールで回転／Esc で終了`,
    enter(L, x, y){ if(x != null){ const i = collageCellAt(L, x, y); if(i >= 0) L.ac = i; } },
    down(L, x, y){
      const i = collageCellAt(L, x, y); if(i < 0) return null;
      L.ac = i; const c = L.cells[i];
      return {i, ox0:c.ox || 0, oy0:c.oy || 0, size:collageCellSize(L, i), swap:-1, has:!!ASSETS[c.asset]};
    },
    move(L, x, y, d){
      const c = L.cells[d.i], j = collageCellAt(L, x, y);
      // 画像のあるマスを、別のマスの上まで持っていったら「入れ替え」（離すまで位置は元のまま）
      d.swap = d.has && j >= 0 && j !== d.i ? j : -1; swapTarget = d.swap >= 0 ? {id:L.id, j:d.swap} : null;
      if(d.swap >= 0){ c.ox = d.ox0; c.oy = d.oy0; return; }
      const [dx, dy] = rotLocal(L, x - d.x0, y - d.y0);
      c.ox = r3(d.ox0 + dx / d.size[0]); c.oy = r3(d.oy0 + dy / d.size[1]);
    },
    up(L, d){
      swapTarget = null;
      if(d.swap >= 0){ const j = d.swap; swapCells(L, d.i, j); toast(`マス${d.i + 1}とマス${j + 1}の画像を入れ替えました`); syncDoc(); }
    },
    zoom(L, k, x, y, e){
      const i = collageCellAt(L, x, y); if(i < 0) return false;
      L.ac = i; const c = L.cells[i];
      if(e && e.shiftKey){ const dv = e.deltaY || e.deltaX; if(dv) c.rot = Math.round((((c.rot || 0) + (dv > 0 ? 3 : -3)) + 540) % 360 - 180); return; }   // Shift＋ホイールで回転（Shift だと横スクロールになるブラウザもあるので両方見る）
      c.zoom = r3(clamp((c.zoom || 1) * k, 0.2, 8));
    },
    pinchStart: L => ({zoom: L.cells[L.ac || 0].zoom || 1}),
    pinch(L, st, k){ const c = L.cells[L.ac || 0]; c.zoom = r3(clamp(st.zoom * k, 0.2, 8)); },
    overlay(ctx, L, f, dpr){
      const w = L.bw * L.sc, h = L.bh * L.sc, cells = collageCells(L.layout, collageN(L), w, h, L.slant, L.main);
      ctx.save(); ctx.translate(L.x * f, L.y * f); ctx.rotate((L.rot || 0) * PI / 180); ctx.scale(f, f); ctx.translate(-w / 2, -h / 2);
      ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
      const sw = swapTarget && swapTarget.id === L.id ? swapTarget.j : -1;
      cells.forEach((p, i) => { collagePath(ctx, p); if(i === sw){ ctx.fillStyle = 'rgba(92,240,138,.28)'; ctx.fill(); } ctx.lineWidth = (i === L.ac || i === sw ? 3 : 1.5) * dpr / f; ctx.strokeStyle = i === sw ? '#5cf08a' : i === L.ac ? '#ffb800' : 'rgba(255,255,255,.8)'; ctx.setLineDash(i === L.ac || i === sw ? [] : [6 * dpr / f, 5 * dpr / f]); ctx.stroke(); });
      ctx.restore();
    },
  },
};
// レイヤーの回転を打ち消した向きでの移動量（ドキュメント座標）
function rotLocal(L, dx, dy){ const a = -(L.rot || 0) * PI / 180; return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)]; }
// 画像上の点（ドキュメント座標）→ フレーム基準のローカル座標（画像ピクセル）
function frameLocal(L, x, y){ const [u, v] = rotLocal(L, x - L.x, y - L.y); return [u / L.sc, v / L.sc]; }

let swapTarget = null;   // マスの入れ替え先（ドラッグ中だけ）
const editModeFor = L => L && Object.keys(EDIT_MODES).find(k => EDIT_MODES[k].ok(L)) || null;
function editLayer(){
  if(!edit) return null;
  const L = DOC.layers.find(l => l.id === edit.id);
  return L && !L.hidden && EDIT_MODES[edit.kind].ok(L) ? L : null;
}
function setEdit(kind, L, x, y){
  edit = kind && L ? {kind, id:L.id} : null; if(!edit) cutCursor = null;
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
function editPointerMove(x, y){ cutCursor = edit.kind === 'cut' ? [x, y] : null; EDIT_MODES[edit.kind].move(drag.L, x, y, drag); syncDocSoon(); livePaint(); }
function editWheel(e, x, y, k){
  const L = editLayer(); if(!L) return false;
  if(EDIT_MODES[edit.kind].zoom(L, k, x, y, e) === false) return false;
  e.preventDefault(); syncDoc(); docChanged(true); return true;
}
function editPinchStart(I){ const L = editLayer(); return L ? {kind:'edit', L, i:I, st:EDIT_MODES[edit.kind].pinchStart(L)} : null; }
function editPinch(p, k){ EDIT_MODES[edit.kind].pinch(p.L, p.st, k); }
function drawEditOverlay(ctx, W, H, dpr){
  const L = editLayer(); if(!L) return false;
  const M = EDIT_MODES[edit.kind]; M.overlay(ctx, L, W / DOC.w, dpr); drawBanner(ctx, W, dpr, M.banner(L));
  return true;
}
