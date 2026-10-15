/* 楽ちんサムネメーカー：レイヤーパネルの操作 */
/*
  役割：レイヤーパネルの並べ替え（ドラッグ）・選択・複数選択・名前の変更・右クリック／長押しメニューを受け付ける。
  依存：DOC（doc.js）、docChanged（doc-sync.js）、selectLayer・toggleMulti・isSelected・layerAction・movePeer・startRename・openLayerMenu・showMenu 等（layers.js）、
       isMobile・openSheet（mobile.js。関数の中からだけ使う）。
  読み込み順：events.js の次。読み込み時にイベントを登録する（DOM は存在済み）。
*/
/* レイヤーパネル：並べ替え（ドラッグ）・選択・メニュー。
   ドラッグの流れ：pointerdown で状態 ld を作る → 5px 動いたら開始（それまではクリック扱い）→ 動かしている間は行を translateY で
   動かして見た目だけ入れ替え → 離したときに1回だけ DOC を並べ替える（movePeer）。途中で DOM を作り直さないので、つかんだ行を保てる。
   スマホは長押し（480ms）で複数選択、ドラッグは同じ階層の行どうしだけで入れ替える。 */
{
  const list = $('#layerList');
  // ld：行のドラッグの状態（つかんだ行・最初の位置・同じ階層の行とその位置・入れ替え先など）。押していないときは null
  /** @type {{row: HTMLElement, id: string, y0: number, s0: number, y: number, started: boolean, rows: HTMLElement[], rects: DOMRect[], from: number, to: number, pid: number, raf?: number}|null} */
  let ld = null;
  let suppressClick = false, lpT = 0, lpFired = false;
  list.addEventListener('pointerdown', e => {
    if(e.button !== 0) return;
    lpFired = false;
    const row = tgt(e).closest('.ly[data-lid]'); if(!row || tgt(e).closest('[data-la]') || tgt(e).closest('input')) return;
    // 入れ替えできるのは同じ階層（同じグループの中、またはグループの外）のレイヤーどうし
    // 同じ階層の行だけを入れ替え対象にする（グループの中身は中身どうし、グループの外は外どうし）
    const rows = [...$$('.ly[data-lid]', list)].filter(r => (r.dataset.gid || '') === (row.dataset.gid || '')), from = rows.indexOf(row);
    ld = {row, id:row.dataset.lid ?? '', y0:e.clientY, s0:list.scrollTop, y:e.clientY, started:false, rows, rects:[], from, to:from, pid:e.pointerId};
    clearTimeout(lpT);
    if(e.pointerType !== 'mouse') lpT = setTimeout(() => { if(ld && !ld.started){ ld = null; lpFired = true; toggleMulti(row.dataset.lid ?? ''); if(navigator.vibrate) navigator.vibrate(12); } }, 480);
  });
  // ドラッグ中の見た目と入れ替え先を決める。リストが自動スクロールしたぶんも数える
  const dragUpdate = () => {
    if(!ld) return;
    const {rects, from, rows} = ld, R = rects[from], lo = rects[0].top - R.top, hi = rects[rects.length - 1].bottom - R.bottom, lr = list.getBoundingClientRect();
    let d = clamp(ld.y - ld.y0 + (list.scrollTop - ld.s0), lo, hi);
    if(ld.y <= lr.top + 10) d = lo; else if(ld.y >= lr.bottom - 10) d = hi;   // リストの端まで持っていったら、端に置く
    ld.row.style.transform = `translateY(${d}px)`;
    const cy = ld.y + (list.scrollTop - ld.s0); let to = 0;   // 入れ替え先は、つかんだ位置（ポインター）がどの行の上にあるかで決める
    rects.forEach((r, i) => { if(i !== from && r.top + r.height / 2 < cy) to++; });
    if(d <= lo) to = 0; else if(d >= hi) to = rows.length - 1;   // 端までドラッグしたら、行の高さが違っても端に置く
    const h = R.height + 2;
    rows.forEach((r, i) => {
      if(i === from) return;
      const sh = from < to && i > from && i <= to ? -h : from > to && i >= to && i < from ? h : 0;
      r.style.transform = sh ? `translateY(${sh}px)` : '';
    });
    ld.to = to;
  };
  // リストの端に指（マウス）を置いている間は、動かさなくてもスクロールし続ける
  // （dragUpdate は自動スクロール分も数えるので、スクロール中は動かさなくても位置を更新し直す）
  const dragScroll = () => {
    if(!ld || !ld.started) return;
    const lr = list.getBoundingClientRect(), v = ld.y < lr.top + 28 ? -9 : ld.y > lr.bottom - 28 ? 9 : 0;
    if(v){ list.scrollTop += v; dragUpdate(); }
    ld.raf = requestAnimationFrame(dragScroll);
  };
  list.addEventListener('pointermove', e => {
    if(!ld) return;
    ld.y = e.clientY;
    // まだ並べ替えを始めていない：5px 以上動いたら始める（長押しのタイマーを止め、行の位置を控え、行をつかんで、端での自動スクロールを始める）
    if(!ld.started){
      if(Math.abs(e.clientY - ld.y0) < 5) return;
      clearTimeout(lpT); ld.started = true;
      if(!ld.row.classList.contains('kid')) list.classList.add('dragunits');   // グループの中身をたたんで、同じ階層だけを並べ替える
      ld.s0 = list.scrollTop; ld.rects = ld.rows.map(r => r.getBoundingClientRect()); ld.row.classList.add('dragging'); ld.row.setPointerCapture(ld.pid);
      ld.raf = requestAnimationFrame(dragScroll);
    }
    // 動かした行と、押しのけられた行の見た目の位置を合わせる
    dragUpdate();
  });
  // 指・マウスを離したとき：動かしていなければ何もしない（ふつうのクリックとして選択に任せる）。動かしていれば、見た目を戻して DOC の並びを入れ替える
  const endDrag = () => {
    if(!ld) return;
    clearTimeout(lpT); cancelAnimationFrame(ld.raf ?? 0);
    const {started, from, to, id, rows} = ld; ld = null;
    list.classList.remove('dragunits');
    if(!started) return;
    // ドラッグ直後に発火する click で、並べ替えたのに選択処理が走るのを防ぐ（同じイベントターンの間だけ無視）
    suppressClick = true; setTimeout(() => suppressClick = false, 0);
    rows.forEach(r => { r.style.transform = ''; r.classList.remove('dragging'); });
    if(to !== from){ movePeer(id, to); const L = layerById(id); if(L) toast(`「${layerName(L)}」を${to < from ? '前面' : '背面'}へ移動しました`); }
    else renderLayers();
    if(DOC.sel !== id) selectLayer(id);
  };
  list.addEventListener('pointerup', endDrag); list.addEventListener('pointercancel', endDrag);
  // 不透明度スライダーを触っている間は、パネルの再描画を止める（layers.js の lpSliding。スライダーが作り直されてドラッグが切れるのを防ぐ）。
  // 離すのは window で受ける：スライダーの外で指を離しても必ず解除するため
  list.addEventListener('pointerdown', e => { if(tgt(e).closest('.ly-op')) lpSliding = true; }, true);
  window.addEventListener('pointerup', () => { lpSliding = false; });
  list.addEventListener('input', e => { const op = tgt(e).closest('.ly-op'); if(op) $('b', op).textContent = Math.round(parseFloat(inputOf(e).value) * 100) + '%'; });
  list.addEventListener('click', e => {
    if(lpFired){ lpFired = false; return; }   // 長押しで複数選択に入った直後の click は無視する
    if(suppressClick) return;
    // 押した場所で見分ける：複数選択の帯のボタン → 背景の表示ボタン → 不透明度のスライダー（何もしない）→ 背景の行 → 行のボタン（メニュー・表示・ロックなど）→ 行そのもの（選ぶ）
    const mb = tgt(e).closest('[data-multi]');
    if(mb){ if(mb.dataset.multi === 'group') groupLayers(DOC.msel); else selectLayer(DOC.sel); return; }
    const bga = tgt(e).closest('[data-bga]');
    if(bga){ DOC.bg.hidden = !DOC.bg.hidden; renderLayers(); syncDoc(); docChanged(false); toast(DOC.bg.hidden ? '背景を非表示にしました（PNGで保存すると背景が透明になります）' : '背景を表示しました'); return; }
    if(tgt(e).closest('.ly-op')) return;
    if(tgt(e).closest('[data-bgrow]')){ selectLayer(null); if(isMobile) openSheet('ins', true); return; }
    const row = tgt(e).closest('[data-lid]'); if(!row) return;
    const act = tgt(e).closest('[data-la]');
    if(act){
      if(act.dataset.la === 'menu'){ const r = act.getBoundingClientRect(), id = row.dataset.lid ?? ''; if(!isSelected(id)) selectLayer(id); setTimeout(() => showMenu(id, r.left - 150, r.bottom + 4, r.top - 4), 0); return; }
      layerAction(row.dataset.lid ?? '', act.dataset.la ?? ''); return;
    }
    if(tgt(e).closest('input')) return;
    // Ctrl／Shift＋クリック（スマホは、選択中にタップ）で複数選択
    if(e.ctrlKey || e.metaKey || e.shiftKey || (isMobile && DOC.msel && DOC.msel.length)){ toggleMulti(row.dataset.lid ?? ''); return; }
    selectLayer(row.dataset.lid ?? null);
  });
  // 行のダブルクリック：名前の変更（ボタンの上は除く）
  list.addEventListener('dblclick', e => {
    const row = tgt(e).closest('[data-lid]'); if(!row || tgt(e).closest('[data-la]')) return;
    startRename(row.dataset.lid);
  });
  list.addEventListener('contextmenu', e => {
    const row = tgt(e).closest('[data-lid]'); if(!row) return;
    e.preventDefault(); openLayerMenu(row.dataset.lid ?? '', e.clientX, e.clientY);
  });
}
