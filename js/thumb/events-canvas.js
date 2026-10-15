/* 楽ちんサムネメーカー：キャンバス上の操作 */
/*
  役割：キャンバス上のドラッグ（移動・拡大縮小・回転・背景効果の中心・しっぽのつまみ・編集モード）、ホイール、ダブルクリック、右クリック、キー操作。
  依存：DOC・selLayer（doc.js）、docChanged・syncDoc（doc-sync.js）、dims・drag・tvCss・snapLines・livePaint（render.js）、layerGeom・fxHandleOn（overlay.js）、
       editPointerDown 等（editmodes.js）、tail 系（tailhandle.js）、selectLayer・layerAction・openLayerMenu 等（layers.js）、
       hitLayer・hitLayers・hitRanked・hitForWheel・hitMenuLayer（hit.js）、groupLayers・xformSnap・xformApply（group.js）。
  読み込み順：events-drop.js の次。読み込み時にイベントを登録する（DOM は存在済み）。
  座標：キャンバス上の操作は toDoc で DOC 座標（px）に直してから扱う。画面上の距離（ハンドルの当たり・スナップ）は
       px = DOC.w / tvCss（画面1pxあたりの DOC 座標）を掛けて、プレビューの表示倍率によらず同じ操作感にする。
*/
/* キャンバス上の操作。
   pointerdown で何をつかんだかを drag.mode に決める（'fx' 背景効果の中心／'edit' 編集モード／'tail' 吹き出しのしっぽのつまみ（tailhandle.js）／'rot'・'scale' ハンドル／'move' 移動／'bg' 背景ドラッグ）。
   決める優先順位は pointerdown の中の並び順そのもの（上ほど優先）：中心◎ → 編集モード → しっぽのつまみ → ハンドル → Alt+クリックで下のレイヤー →
   Shift/Ctrl+クリックで複数選択 → 通常のヒット判定 → 何も無ければ背景。pointermove が drag.mode ごとに値を更新し、pointerup（end）で確定する。 */
{
  const tv = $('#tv');
  const toDoc = e => { const r = tv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * DOC.w, (e.clientY - r.top) / r.height * DOC.h]; };
  // 選択中レイヤーのハンドルの上か。'rot'（回転）／'scale'（四隅）／null。当たり半径は画面上の 11px・10px（描画サイズより少し大きく、掴みやすくしている）。
  // 複数選択・ロック中は出さない
  const handleAt = (x, y) => {
    if(DOC.msel && DOC.msel.length >= 2) return null;
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
    if(editPointerDown(e, x, y, tv)) return;
    // 吹き出しのしっぽのつまみ（tailhandle.js）：ハンドルより優先（つまみは枠の外や四隅の近くに出ることがあるため）
    const tail = tailHandleAt(x, y);
    const T0 = tail && selLayer(); if(tail && T0){ drag = {mode:'tail', L:T0, st:tailDragStart(T0, tail, e)}; tv.setPointerCapture(e.pointerId); e.preventDefault(); tv.style.cursor = 'grabbing'; return; }
    let mode = handleAt(x, y), T = selLayer();
    if(!mode && e.altKey){
      // Alt+クリック：重なっている下のレイヤーを順番に選ぶ
      // 絵が実際にある（rank>0）ものだけを巡回対象にする。無ければ枠の中のもの全部
      const {hs: all, r} = hitRanked(x, y), vis = all.filter(l => (r.get(l.id) || 0) > 0), hs = vis.length ? vis : all;
      if(hs.length){ const k = hs.findIndex(l => l.id === DOC.sel); const nx = hs[(k + 1) % hs.length]; selectLayer(nx.id); T = nx; mode = 'move'; }
    }
    if(!mode && (e.shiftKey || e.ctrlKey || e.metaKey)){
      // Shift／Ctrl＋クリック：複数選択に入れる・外す
      const h = hitLayer(x, y); if(h){ toggleMulti(h.id); e.preventDefault(); return; }
    }
    if(!mode){
      T = hitLayer(x, y);
      if(!T){
        if(DOC.sel || (DOC.msel || []).length) selectLayer(null);
        if(DOC.bg.type === 'image' && ASSETS[DOC.bg.asset]){
          drag = {mode:'bg', x0:x, y0:y, ox:DOC.bg.ox, oy:DOC.bg.oy}; tv.style.cursor = 'grabbing';
          tv.setPointerCapture(e.pointerId); e.preventDefault();
        }
        return;
      }
      mode = 'move'; if(!isSelected(T.id)) selectLayer(T.id);
    }
    // グループ・複数選択は、中身のレイヤーをまとめて動かす（xformSnap が開始時の状態を控える）。
    // drag には開始時の位置・倍率・角度（lx, ly, sc, rot）と、中心からの距離 d0・角度 a0 を持たせ、move では常にそこからの差で計算する（誤差を積まない）
    if(!T) return;   // ここまでで、つかむレイヤーが決まっている（ハンドル＝選択中のレイヤー、または当たったレイヤー）
    const multi = (DOC.msel || []).length >= 2 && DOC.msel.includes(T.id);
    const snap = multi ? xformSnap(DOC.msel.map(layerById).filter(/** @returns {l is Layer} */ l => !!l && !l.locked), T.x, T.y) : isGroup(T) ? xformSnap([T], T.x, T.y) : null;
    drag = {mode, L:T, snap, x0:x, y0:y, lx:T.x, ly:T.y, sc:T.sc, rot:T.rot || 0, d0:Math.hypot(x - T.x, y - T.y), a0:Math.atan2(y - T.y, x - T.x)};
    tv.setPointerCapture(e.pointerId); e.preventDefault();
  });
  tv.addEventListener('pointermove', e => {
    if(DOC.mode !== 'thumb') return;
    const [x, y] = toDoc(e);
    if(!drag && fxHandleOn() && Math.hypot(x - DOC.bg.fcx * DOC.w, y - DOC.bg.fcy * DOC.h) < 20 * DOC.w / tvCss){ tv.style.cursor = 'grab'; return; }
    if(!drag && editLayer()){ tv.style.cursor = edit.kind === 'cut' ? 'crosshair' : 'move'; if(edit.kind === 'cut'){ cutCursor = [x, y]; livePaint(); } return; }
    if(!drag && tailHandleAt(x, y)){ tv.style.cursor = 'grab'; return; }
    if(!drag){ const h = handleAt(x, y); tv.style.cursor = h === 'rot' ? 'grab' : h === 'scale' ? 'nwse-resize' : hitLayer(x, y) ? 'move' : (DOC.bg.type === 'image' && ASSETS[DOC.bg.asset] ? 'grab' : 'default'); return; }
    const L = drag.L, px = DOC.w / tvCss;
    if(drag.mode === 'edit'){ editPointerMove(x, y); return; }
    if(drag.mode === 'tail'){ tailDragMove(drag.st, x, y, e); syncDocSoon(); livePaint(); return; }
    if(drag.mode === 'fx'){
      let fx = x / DOC.w, fy = y / DOC.h;
      if(DOC.guides.snap && !e.altKey){ for(const v of [0.5, 1 / 3, 2 / 3]){ if(Math.abs(fx - v) * tvCss < 8) fx = v; if(Math.abs(fy - v) * tvCss * DOC.h / DOC.w < 8) fy = v; } }
      DOC.bg.fcx = Math.round(clamp(fx, -0.2, 1.2) * 1000) / 1000; DOC.bg.fcy = Math.round(clamp(fy, -0.2, 1.2) * 1000) / 1000;
      syncDocSoon(); livePaint(); return;
    }
    if(drag.mode === 'bg'){
      DOC.bg.ox = Math.round((drag.ox + (x - drag.x0) / (DOC.w / 2)) * 1000) / 1000;
      DOC.bg.oy = Math.round((drag.oy + (y - drag.y0) / (DOC.h / 2)) * 1000) / 1000;
      syncDocSoon(); livePaint(); return;
    }
    if(drag.mode === 'move'){
      // スナップ：中心が画面の 1/3・1/2・2/3 の線に 8px（画面上）以内に近づいたら吸着し、スナップ線を表示する。Alt で一時的に無効
      let nx = drag.lx + x - drag.x0, ny = drag.ly + y - drag.y0; snapLines = {x:null, y:null};
      if(DOC.guides.snap && !e.altKey){
        const th = 8 * px;
        for(const sx of [DOC.w / 2, DOC.w / 3, DOC.w * 2 / 3]) if(Math.abs(nx - sx) < th){ nx = sx; snapLines.x = sx; break; }
        for(const sy of [DOC.h / 2, DOC.h / 3, DOC.h * 2 / 3]) if(Math.abs(ny - sy) < th){ ny = sy; snapLines.y = sy; break; }
      }
      if(drag.snap) xformApply(drag.snap, nx - drag.lx, ny - drag.ly); else{ L.x = Math.round(nx); L.y = Math.round(ny); }
    }else if(drag.mode === 'scale' && drag.snap){
      xformApply(drag.snap, 0, 0, clamp(Math.hypot(x - drag.snap.cx, y - drag.snap.cy) / Math.max(1, drag.d0), 0.05, 10), 0);
    }else if(drag.mode === 'scale'){
      L.sc = Math.round(clamp(drag.sc * Math.hypot(x - L.x, y - L.y) / Math.max(1, drag.d0), 0.05, 10) * 1000) / 1000;
    }else if(drag.snap){
      // グループ・複数選択の回転：Shift で 15° 刻み、そうでなければ 3° 以内で 0° に吸着
      let dr = (Math.atan2(y - drag.snap.cy, x - drag.snap.cx) - drag.a0) * 180 / PI;
      if(e.shiftKey) dr = Math.round(dr / 15) * 15; else if(Math.abs(dr) < 3) dr = 0;
      xformApply(drag.snap, 0, 0, 1, dr);
    }else{
      // 回転：開始時の角度に、中心まわりの角度の変化を足す。-180〜180 に正規化し、Shift で 15° 刻み、
      // そうでなければ 0・±90・180 の近く（3° 以内）で吸着する
      let r = drag.rot + (Math.atan2(y - L.y, x - L.x) - drag.a0) * 180 / PI;
      r = ((r + 540) % 360) - 180;
      if(e.shiftKey) r = Math.round(r / 15) * 15; else for(const s of [0, 90, -90, 180, -180]) if(Math.abs(r - s) < 3) r = s;
      L.rot = Math.round(r * 10) / 10;
    }
    syncDocSoon(); livePaint();
  });
  // ドラッグの終了（pointerup / cancel）。編集モードは up フックを呼び、最後に必ず docChanged で保存・履歴を確定する
  const end = () => { if(!drag) return; const d = drag; drag = null; snapLines = {x:null, y:null}; if(d.mode === 'edit' && edit){ const up = editModeUp(edit.kind); if(up) up(d.L, d); } docChanged(false); };
  tv.addEventListener('pointerleave', () => { if(cutCursor && !drag){ cutCursor = null; livePaint(); } });
  tv.addEventListener('pointerup', end); tv.addEventListener('pointercancel', end);
  // wheelGrp：グループをホイールで拡大縮小している間の基準（開始時の状態 s と累積倍率 k）。
  // 位置を整数に丸めて保存するので、毎回の差分を掛けると誤差が積もる。500ms 以内の連続ホイールは最初の状態から数える
  let wheelGrp = null;
  // ホイール：優先順位は 編集モード → グループ → レイヤー → 背景画像。k = exp(-deltaY×0.0015) で、トラックパッドの細かい値でもなめらかに拡大縮小する
  tv.addEventListener('wheel', e => {
    if(DOC.mode !== 'thumb') return;
    const [x, y] = toDoc(e), L = hitForWheel(x, y), k = Math.exp(-e.deltaY * 0.0015);
    if(editWheel(e, x, y, k)) return;
    if(L && isGroup(L)){   // 位置を整数に丸めるので、ホイールの間は最初の状態から数えて拡大縮小する
      if(L.id !== DOC.sel) selectLayer(L.id);
      const now = performance.now(), w = wheelGrp; if(!w || w.id !== L.id || now - w.t > 500) wheelGrp = {id:L.id, t:now, k:1, s:xformSnap([L], L.x, L.y)};
      wheelGrp.t = now; wheelGrp.k = clamp(wheelGrp.k * k, 0.2, 5); xformApply(wheelGrp.s, 0, 0, wheelGrp.k, 0);
    }
    else if(L){ if(L.id !== DOC.sel) selectLayer(L.id); L.sc = Math.round(clamp(L.sc * k, 0.05, 10) * 1000) / 1000; }
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
    const [x, y] = toDoc(e), L = hitMenuLayer(x, y); if(!L) return;
    e.preventDefault(); openLayerMenu(L.id, e.clientX, e.clientY);
  });
  // ダブルクリック：グループ→中の1つを選ぶ／文字→文字の編集へ／画像・分割フレーム→編集モードへ
  tv.addEventListener('dblclick', e => {
    const [x, y] = toDoc(e), L = hitLayer(x, y);
    if(L && isGroup(L)){   // グループの中のレイヤーを、単独で選ぶ
      const k = groupKids(L).filter(k => !k.hidden).reverse().find(k => pixelRank(k, x, y) > 0);
      if(k) selectLayer(k.id);
      return;
    }
    if(L && L.type === 'text'){ selectLayer(L.id); openInspector('txt-text'); if(!isMobile){ $as('#text', HTMLTextAreaElement).focus(); $as('#text', HTMLTextAreaElement).select(); } }
    else if(L) enterEditAt(L, x, y);
  });
  // キー操作（選択中のレイヤーに対して）：Delete 削除／矢印 1px（Shift で 10px）移動／Ctrl+G グループ／Ctrl+D 複製／Ctrl+[ ] 重なり順／H・V 反転／Esc 解除。
  // 文字入力中・ヘルプやポップアップ表示中は何もしない（入力を奪わないため）
  document.addEventListener('keydown', e => {
    if(DOC.mode !== 'thumb' || $('#help').classList.contains('show') || $('.pop.show')) return;
    if(isTyping(e)) return;
    const L = selLayer(); if(!L) return;
    const st = e.shiftKey ? 10 : 1;
    if(e.key === 'Delete' || e.key === 'Backspace'){ e.preventDefault(); layerAction(L.id, 'del'); }
    else if(e.key.startsWith('Arrow')){
      e.preventDefault(); if(L.locked) return;
      const dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
      const ms = (DOC.msel || []).length >= 2 ? DOC.msel.map(layerById).filter(/** @returns {l is Layer} */ l => !!l) : [L];
      xformSnap(ms, L.x, L.y).kids.forEach(o => { o.L.x += dx; o.L.y += dy; });
      docChanged(true);
    }else if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g'){
      e.preventDefault(); if(e.shiftKey){ if(isGroup(L)) ungroupLayers(L); } else groupLayers((DOC.msel || []).length >= 2 ? DOC.msel : [L.id]);
    }else if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd'){ e.preventDefault(); layerAction(L.id, 'dup'); }
    else if((e.ctrlKey || e.metaKey) && (e.code === 'BracketRight' || e.code === 'BracketLeft')){
      e.preventDefault(); const fwd = e.code === 'BracketRight';
      layerAction(L.id, e.shiftKey ? (fwd ? 'front' : 'back') : (fwd ? 'up' : 'down'));
    }
    else if(!e.ctrlKey && !e.metaKey && !e.altKey && L.type === 'image' && (e.key === 'h' || e.key === 'H' || e.key === 'v' || e.key === 'V')){
      e.preventDefault(); layerAction(L.id, /h/i.test(e.key) ? 'flip' : 'flipV');
    }
    // Esc：メニューを閉じる → 編集モード中ならそれを終える → なければ選択解除、の順（1回の押下で1段階だけ戻る）
    else if(e.key === 'Escape'){ hideMenu(); if(edit){ setEdit(null); return; } selectLayer(null); }
  });
}
