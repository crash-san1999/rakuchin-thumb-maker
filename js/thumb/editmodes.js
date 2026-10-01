/* 楽ちんサムネメーカー：キャンバス上の編集モード（フレーム調整・マスの調整） */
/*
  画像のフレーム調整と、分割フレームのマスの調整は同じ流れで動く：
    ダブルクリック（ボタン）で入る → ドラッグ・ホイール・ピンチで調整 → Esc・外をクリック・別のレイヤーを選ぶと終わる
  モードごとの違いだけを EDIT_MODES に書き、入り方・終わり方・入力の振り分けはここで共通に扱う。

  主な公開：EDIT_MODES / edit（今のモード {kind, id}。null なら通常）/ setEdit・toggleEdit・enterEditAt / editLayer /
           editPointerDown・editPointerMove・editWheel・editPinchStart・editPinch（入力の振り分け）/ drawEditOverlay /
           rotLocal・frameLocal（座標変換）
  呼び出し元：events.js（キャンバスのポインタ・ホイール・ダブルクリック・Esc・各ボタン）、mobile.js（ピンチ）、
            overlay.js（drawEditOverlay。編集中は通常の選択枠を出さずこちらを描く）、layers.js（別のレイヤーを選ぶと setEdit(null)）。
  依存：DOC・selLayer・syncDoc（doc.js）、drag・tvCss・livePaint・paintPreview（render.js）、frameGeom・frameCompensate・framePath（frames.js）、
       cutPixelColor・cropSrc・cropRect（cutout.js / assets.js）、collageCellAt・swapCells など（collage.js）。

  EDIT_MODES の各モードが持つもの（無いものは省略可）：
    btn・label … 切り替えボタンの id と通常時の文字（編集中は「調整を終える」に差し替える）
    ok(L)      … このレイヤーでこのモードに入れるか。編集中に条件が崩れる（形を「なし」に変えた等）と editLayer が null を返し、自然に終わる
    hint・banner … 入ったときのトースト／キャンバス上部の説明帯
    enter(L,x,y) … 入る直前の処理（ダブルクリック位置のマスを選ぶ等）
    down(L,x,y)  … ポインタを押したとき。ドラッグ中の状態 d を返す。null は「枠の外をクリック」＝モードを終えて通常操作へ
    move(L,x,y,d) / up(L,d) … ドラッグ中／離したとき。x,y は DOC 座標
    zoom(L,k,x,y,e) … ホイール（k は拡大率。false を返すと「ここでは使わない」として通常のホイール処理へ）
    pinchStart・pinch … スマホのピンチ（開始時の値を控え、倍率 k をその値に掛ける）
    overlay(ctx,L,f,dpr) … キャンバス上の補助表示（f はプレビュー倍率）
*/
// edit：今の編集モード。モードの種類は EDIT_MODES のキー
let edit = null; // {kind, id}
let cutCursor = null;   // ブラシの丸を出す位置（ドキュメント座標）
// ブラシの跡の座標・半径を小数4桁に丸める（跡は DOC に保存されるので、JSON を小さくするため）
const r4 = v => Math.round(v * 10000) / 10000;
const EDIT_MODES = {
  // 画像の切り抜きフレーム：画像はそのままで、切り抜く範囲を動かす・大きさを変える。
  // 座標は frameLocal（回転を戻し、レイヤー倍率 sc で割った「画像ピクセル」）。フレーム中心の位置 cx,cy は 0〜1 の割合、fs はフレームの大きさ
  frame: {
    btn:'frameEditBtn', label:'キャンバスでフレームを調整',
    ok: L => L.type === 'image' && L.frame && L.frame.shape !== 'none' && !!ASSETS[L.asset],
    hint: () => isMobile ? 'ドラッグでフレームの位置、ピンチで大きさを調整。外をタップで終了' : 'ドラッグでフレームの位置、角かホイールで大きさを調整。Esc か外をクリックで終了',
    banner: () => isMobile ? 'フレーム調整中：ドラッグで位置／ピンチで大きさ／外をタップで終了' : 'フレーム調整中：ドラッグで位置／角・ホイールで大きさ／Esc か外をクリックで終了',
    down(L, x, y){
      // px：画面上の 1px が画像ピクセルで何個ぶんか。角ハンドルの当たり半径 14px を、画面の見た目の大きさで判定するため
      const G = frameGeom(L), [u, v] = frameLocal(L, x, y), px = DOC.w / tvCss / L.sc;
      const corner = [[-1, -1], [1, -1], [1, 1], [-1, 1]].some(([sx, sy]) => Math.hypot(u - sx * G.fw / 2, v - sy * G.fh / 2) < 14 * px);
      const inImg = Math.abs((L.flip ? -u : u) + G.cxp - G.iw / 2) <= G.iw / 2 && Math.abs((L.flipV ? -v : v) + G.cyp - G.ih / 2) <= G.ih / 2;
      // 角（拡大縮小）でも画像の上（移動）でもなければ「外をクリック」。反転しているときは u,v の向きを戻して画像内かを調べる
      if(!corner && !inImg) return null;
      return {sub: corner ? 'scale' : 'move', g0:G, fs0:L.frame.fs ?? 1, cx0:G.cxp / G.iw, cy0:G.cyp / G.ih, base:{x:L.x, y:L.y}, r0:Math.max(1, Math.hypot(u, v))};
    },
    move(L, x, y, d){
      const G = d.g0;
      // 開始時の状態（d.cx0・d.fs0・d.base）を基準に計算する（毎回の差分を足すと誤差が積もるため）。画像は固定、フレームだけ動く。
      // 最後に frameCompensate でレイヤー位置を補正するので、画面上では画像が動かず枠だけが動いて見える
      if(d.sub === 'move'){
        const [du, dv] = rotLocal(L, x - d.x0, y - d.y0);
        L.frame.cx = r3(clamp(d.cx0 + du / L.sc * (L.flip ? -1 : 1) / G.iw, 0, 1)); L.frame.cy = r3(clamp(d.cy0 + dv / L.sc * (L.flipV ? -1 : 1) / G.ih, 0, 1));
      }else{
        const [u, v] = frameLocal(Object.assign({}, L, d.base), x, y);
        // 拡大縮小：ドラッグ開始時の「中心から角までの距離 r0」に対する、今の距離の比で大きさを決める
        L.frame.fs = r3(clamp(d.fs0 * Math.hypot(u, v) / d.r0, 0.1, 1));
      }
      frameCompensate(L, G, d.base);
    },
    zoom(L, k){ const g0 = frameGeom(L); L.frame.fs = r3(clamp((L.frame.fs ?? 1) * k, 0.1, 1)); frameCompensate(L, g0); },
    pinchStart: L => ({fs: L.frame.fs ?? 1}),
    pinch(L, st, k){ const g0 = frameGeom(L); L.frame.fs = r3(clamp(st.fs * k, 0.1, 1)); frameCompensate(L, g0); },
    overlay(ctx, L, f, dpr){
      const G = frameGeom(L);
      // 以降は「画像ピクセル座標」で描く（レイヤーの位置・回転・倍率を ctx に掛ける）。線幅などは画面で一定に見えるよう k=1/(sc*f) を掛ける。
      // 画像全体を薄く（0.38）描くのは、フレームの外側＝切り取られる部分も見せて、動かす目安にするため
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
  // 背景透過のブラシ：なぞって消す・戻す／画像から背景色を拾う。
  // 跡（L.strokes）は {id, m:'e'消す|'r'戻す, r:半径, p:[[x,y]…]}。座標・半径は「元の画像（トリミング前）」に対する 0〜1 の割合で持つ
  // （トリミング・拡大縮小を変えても跡がずれない／画像サイズに依存しない）。切り抜きフレームを使っている画像ではブラシは使えない（ok 参照。背景色の透明化だけ使える）
  cut: {
    btn:'cutBrushBtn', label:'キャンバスでブラシを使う',
    ok: L => L.type === 'image' && L.frame && L.frame.shape === 'none' && !!ASSETS[L.asset],
    hint: () => isMobile ? 'なぞって消す・戻す。外をタップで終了' : 'ドラッグで消す・戻す、ホイールで太さ。Esc か外をクリックで終了',
    banner: L => (L.btool === 'pick' ? '色を拾う：背景にしたい色の場所をクリック' : L.btool === 'restore' ? 'ブラシで戻す：なぞったところの元の絵が戻ります' : 'ブラシで消す：なぞったところが透明になります') + (isMobile ? '／外をタップで終了' : '／ホイールで太さ／Esc で終了'),
    down(L, x, y){
      const A = ASSETS[L.asset], S = cropSrc(L, A), cw = S.img.naturalWidth, ch = S.img.naturalHeight, [u, v] = frameLocal(L, x, y);
      const su = L.flip ? -u : u, sv = L.flipV ? -v : v, m = L.btool === 'pick' ? 0 : L.bsz / 2 / L.sc;
      if(Math.abs(su) > cw / 2 + m || Math.abs(sv) > ch / 2 + m) return null;   // 画像の外をクリックしたら終わり（ブラシの半径ぶんは外側も有効）
      // px,py：クリック位置を「元の画像」のピクセル座標へ（トリミングされていれば、切り取った左上 rc.sx,sy を足す）
      const iw0 = A.img.naturalWidth, ih0 = A.img.naturalHeight, rc = cropOn(L) ? cropRect(L, iw0, ih0) : {sx:0, sy:0}, px = rc.sx + su + cw / 2, py = rc.sy + sv + ch / 2;
      if(L.btool === 'pick'){
        const c = cutPixelColor(S.img, su + cw / 2, sv + ch / 2);
        if(c){ L.key.c = c; L.key.on = true; } else toast('そこは透明です。ほかの場所をクリックしてください', true);
        return {sub:'pick', ok:!!c};
      }
      // 押した瞬間に跡を作って点を1つ入れる：クリックだけでも丸く消える／戻る。cutSrc は id と点数の増加で「描き足し」を判断する（cutout.js）
      const st = {id:uid(), m:L.btool === 'restore' ? 'r' : 'e', r:r4(L.bsz / 2 / L.sc / iw0), p:[[r4(px / iw0), r4(py / ih0)]]};
      L.strokes.push(st);
      return {sub:'brush', st, iw0, ih0, last:[px, py], rp:L.bsz / 2 / L.sc};
    },
    move(L, x, y, d){
      cutCursor = [x, y];
      if(d.sub !== 'brush') return;
      const A = ASSETS[L.asset], S = cropSrc(L, A), cw = S.img.naturalWidth, ch = S.img.naturalHeight, [u, v] = frameLocal(L, x, y);
      const rc = cropOn(L) ? cropRect(L, d.iw0, d.ih0) : {sx:0, sy:0}, px = rc.sx + (L.flip ? -u : u) + cw / 2, py = rc.sy + (L.flipV ? -v : v) + ch / 2;
      // 前の点から半径の 2 割（最低 0.5px）動くまで点を足さない：点が増えすぎると保存データ・再描画が重くなるため
      if(Math.hypot(px - d.last[0], py - d.last[1]) < Math.max(0.5, d.rp * 0.2)) return;
      d.st.p.push([r4(px / d.iw0), r4(py / d.ih0)]); d.last = [px, py];
    },
    // 色を拾えたら、その色で背景透過をオンにして通常のブラシ（消す）に戻り、モードを終える
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
  // 分割フレームのマス：マスの中の画像を動かす・拡大縮小する。
  // マスの設定 L.cells[i] の ox・oy はマスの大きさに対する割合（collageCellSize で割る）、zoom は倍率、rot は度（-180〜180）。L.ac は選択中のマス
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
      // 移動量はレイヤーの回転を戻した向きで測り（rotLocal）、マスの大きさで割って割合にする
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
// レイヤーの回転を打ち消した向きでの移動量（ドキュメント座標）。回転したレイヤー上でも、ドラッグの向きがレイヤー自身の縦横に沿うようにする
function rotLocal(L, dx, dy){ const a = -(L.rot || 0) * PI / 180; return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)]; }
// 画像上の点（ドキュメント座標）→ フレーム基準のローカル座標（画像ピクセル）
function frameLocal(L, x, y){ const [u, v] = rotLocal(L, x - L.x, y - L.y); return [u / L.sc, v / L.sc]; }

let swapTarget = null;   // マスの入れ替え先（ドラッグ中だけ）
// ダブルクリックで入るモードを決める：EDIT_MODES の並び順（frame → cut → cells）で最初に ok になったもの。frame と cut は形が「なし」かどうかで排他
const editModeFor = L => L && Object.keys(EDIT_MODES).find(k => EDIT_MODES[k].ok(L)) || null;
// 編集中のレイヤー。レイヤーが消えた・隠した・条件を外れたときは null（＝実質、編集モードが終わっている）
function editLayer(){
  if(!edit) return null;
  const L = DOC.layers.find(l => l.id === edit.id);
  return L && !L.hidden && EDIT_MODES[edit.kind].ok(L) ? L : null;
}
// モードに入る（kind と L を渡す）／終える（引数なし）。ボタンの文言の切り替え、トースト、入力欄・プレビューの更新まで行う
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
// 戻り値 true＝編集モードが処理した（呼び出し側は通常のレイヤー選択をしない）。false＝通常操作へ。
// 押した位置が枠外なら、ここでモードを終えて false を返す（外をクリックで終了）。drag は render.js の共有変数で、mode:'edit' で区別する
function editPointerDown(e, x, y, tv){
  const L = editLayer(); if(!L) return false;
  const d = EDIT_MODES[edit.kind].down(L, x, y);
  if(!d){ setEdit(null); return false; }  // 外をクリックしたら終わり、ふだんの操作へ
  drag = Object.assign({mode:'edit', L, x0:x, y0:y}, d);
  tv.setPointerCapture(e.pointerId); e.preventDefault(); syncDoc(); return true;
}
// ドラッグ中。syncDocSoon は入力欄の同期を 1 フレーム 1 回に間引く（毎回の同期は重いため）
function editPointerMove(x, y){ cutCursor = edit.kind === 'cut' ? [x, y] : null; EDIT_MODES[edit.kind].move(drag.L, x, y, drag); syncDocSoon(); livePaint(); }
// ホイール。モードが「使わない」(false) と答えたら通常のホイール処理（レイヤーの拡大縮小）に任せる
function editWheel(e, x, y, k){
  const L = editLayer(); if(!L) return false;
  if(EDIT_MODES[edit.kind].zoom(L, k, x, y, e) === false) return false;
  e.preventDefault(); syncDoc(); docChanged(true); return true;
}
// スマホのピンチ（mobile.js から）。開始時の値を st に控え、editPinch で倍率 k を掛ける
function editPinchStart(I){ const L = editLayer(); return L ? {kind:'edit', L, i:I, st:EDIT_MODES[edit.kind].pinchStart(L)} : null; }
function editPinch(p, k){ EDIT_MODES[edit.kind].pinch(p.L, p.st, k); }
function drawEditOverlay(ctx, W, H, dpr){
  const L = editLayer(); if(!L) return false;
  const M = EDIT_MODES[edit.kind]; M.overlay(ctx, L, W / DOC.w, dpr); drawBanner(ctx, W, dpr, M.banner(L));
  return true;
}
