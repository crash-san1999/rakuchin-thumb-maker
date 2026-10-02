/* 楽ちんサムネメーカー：キャンバス・レイヤーパネルの操作 */
/*
  役割：サムネ作成モードの「入力の受け付け」をまとめる。ボタンのクリック、レイヤーパネルの並べ替え・選択、
       ファイルのドロップ・貼り付け、プロジェクトの保存・読み込み・新規作成、キャンバス上のドラッグ・ホイール・キー操作。
       処理の中身は各ファイル（layers.js・editmodes.js・doc.js 等）に任せ、ここは「どの操作を何に振り分けるか」を持つ。
  主な公開：saveProject / newProject / openProjectFile / openNew・closeNew
  依存：DOC・selLayer・docChanged・syncDoc（doc.js）、dims・drag・tvCss・snapLines・livePaint（render.js）、layerGeom・fxHandleOn（overlay.js）、
       editPointerDown 等（editmodes.js）、selectLayer・layerAction・showMenu 等（layers.js）、groupLayers・xformSnap・xformApply（group.js）、
       addImageLayers・setBgFromFile・addAsset（assets.js）、libAddFiles・libImport（library.js）、loadDocObj（export.js）。
  読み込み順：events.js は inspector.js の次で、ほぼ最後。ほかの全ファイルの関数が使える前提で、読み込み時にイベントを登録する（DOM は存在済み）。
  座標：キャンバス上の操作は toDoc で DOC 座標（px）に直してから扱う。画面上の距離（ハンドルの当たり・スナップ）は
       px = DOC.w / tvCss（画面1pxあたりの DOC 座標）を掛けて、プレビューの表示倍率によらず同じ操作感にする。
*/
/* ---------- イベント ---------- */
// 設定パネルのボタン類（クリックの委譲）。ボタンの id・data 属性は inspector.js の行定義と対応する
document.addEventListener('click', e => {
  const pb = e.target.closest('[data-place]');
  if(pb){
    const L = selLayer(), d = L && dims.get(L.id); if(!d) return;
    // 配置ボタン：data-place は '横縦'（l/c/r × t/m/b）。余白は幅の3.5%・高さの5%。
    // 回転しているレイヤーは、回転後の外接矩形（bw×bh）が余白の内側に収まるよう、中心 x,y を決める
    const h = pb.dataset.place[0], v = pb.dataset.place[1], mx = DOC.w * 0.035, my = DOC.h * 0.05;
    const a = (L.rot || 0) * PI / 180, bw = Math.abs(d.w * Math.cos(a)) + Math.abs(d.h * Math.sin(a)), bh = Math.abs(d.w * Math.sin(a)) + Math.abs(d.h * Math.cos(a));
    L.x = Math.round(h === 'l' ? mx + bw / 2 : h === 'r' ? DOC.w - mx - bw / 2 : DOC.w / 2);
    L.y = Math.round(v === 't' ? my + bh / 2 : v === 'b' ? DOC.h - my - bh / 2 : DOC.h / 2);
    syncDoc(); docChanged(false); return;
  }
  if(e.target.closest('#collageEditBtn, #cellFab')){ toggleEdit('cells'); return; }
  // 分割フレームを画面いっぱいに：中心・大きさ・回転を初期化（bw/bh はキャンバスと同じ寸法）
  if(e.target.closest('#collageFill')){ const L = selLayer(); if(L){ Object.assign(L, {x:DOC.w / 2, y:DOC.h / 2, bw:DOC.w, bh:DOC.h, sc:1, rot:0}); syncDoc(); docChanged(false); } return; }
  if(e.target.closest('#frameEditBtn')){ toggleEdit('frame'); return; }
  // ブラシ開始時、前回「色を拾う」で終わっていたら道具を「消す」に戻す（拾うモードのまま入ると色を拾うだけで終わってしまうため）
  if(e.target.closest('#cutBrushBtn')){ const L = selLayer(); if(L && L.btool === 'pick') L.btool = 'erase'; toggleEdit('cut'); return; }
  if(e.target.closest('#cutPickBtn')){ const L = selLayer(); if(L && L.type === 'image' && EDIT_MODES.cut.ok(L)){ L.btool = 'pick'; if(edit && edit.kind === 'cut') syncDoc(); else setEdit('cut', L); paintPreview(false); } else if(L) toast('切り抜きフレームを使っている画像では、色を拾うモードは使えません。「四隅から自動で拾う」か、色の欄で指定してください', true); return; }
  if(e.target.closest('#cutAutoBtn')){
    const L = selLayer(), A = L && L.type === 'image' && ASSETS[L.asset]; if(!A) return;
    const c = cutAutoColor(cropSrc(L, A).img); if(!c){ toast('四隅が透明なので、色を拾えませんでした', true); return; }
    L.key.c = c; L.key.on = true; syncDoc(); docChanged(false); return;
  }
  if(e.target.closest('#cutUndoStroke')){ const L = selLayer(); if(L && L.type === 'image' && L.strokes.length){ L.strokes.pop(); syncDoc(); docChanged(false); } return; }
  if(e.target.closest('#cutClearStrokes')){ const L = selLayer(); if(L && L.type === 'image' && L.strokes.length){ L.strokes = []; syncDoc(); docChanged(false); toast('ブラシの跡を消しました'); } return; }
  // フレームのプリセット：形・枠をプリセットで置き換えるが、大きさ・位置（fs・cx・cy）は引き継ぎ、見た目の位置が動かないよう補正する。
  // p[2] が frame の差分、p[3] があればフチ（outline）も一緒にオンにする
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
  const ffx = e.target.closest('[data-finfx]');
  if(ffx){ applyFinPreset(ffx.dataset.finfx); toast(ffx.dataset.finfx === 'reset' ? '仕上げエフェクトを外しました' : `仕上げ「${ffx.textContent}」をかけました（「仕上げ」タブで調整できます）`); return; }
  const gb = e.target.closest('[data-guide]');
  if(gb){ DOC.guides[gb.dataset.guide] = !DOC.guides[gb.dataset.guide]; syncDoc(); saveDoc(); paintPreview(false); return; }
  const mb = e.target.closest('[data-mode]');
  if(mb){ setMode(mb.dataset.mode); return; }
  const tb = e.target.closest('#tabs [data-page]');
  if(tb){ setPage(tb.dataset.page); return; }
  if(e.target.closest('#insDesel')){ selectLayer(null); return; }
});
/* レイヤーパネル：並べ替え（ドラッグ）・選択・メニュー。
   ドラッグの流れ：pointerdown で状態 ld を作る → 5px 動いたら開始（それまではクリック扱い）→ 動かしている間は行を translateY で
   動かして見た目だけ入れ替え → 離したときに1回だけ DOC を並べ替える（movePeer）。途中で DOM を作り直さないので、つかんだ行を保てる。
   スマホは長押し（480ms）で複数選択、ドラッグは同じ階層の行どうしだけで入れ替える。 */
{
  const list = $('#layerList');
  let ld = null, suppressClick = false, lpT = 0, lpFired = false;
  list.addEventListener('pointerdown', e => {
    if(e.button !== 0) return;
    lpFired = false;
    const row = e.target.closest('.ly[data-lid]'); if(!row || e.target.closest('[data-la]') || e.target.closest('input')) return;
    // 入れ替えできるのは同じ階層（同じグループの中、またはグループの外）のレイヤーどうし
    // 同じ階層の行だけを入れ替え対象にする（グループの中身は中身どうし、グループの外は外どうし）
    const rows = [...list.querySelectorAll('.ly[data-lid]')].filter(r => (r.dataset.gid || '') === (row.dataset.gid || '')), from = rows.indexOf(row);
    ld = {row, id:row.dataset.lid, y0:e.clientY, s0:list.scrollTop, y:e.clientY, started:false, rows, rects:null, from, to:from, pid:e.pointerId};
    clearTimeout(lpT);
    if(e.pointerType !== 'mouse') lpT = setTimeout(() => { if(ld && !ld.started){ ld = null; lpFired = true; toggleMulti(row.dataset.lid); if(navigator.vibrate) navigator.vibrate(12); } }, 480);
  });
  // ドラッグ中の見た目と入れ替え先を決める。リストが自動スクロールしたぶんも数える
  const dragUpdate = () => {
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
    if(!ld.started){
      if(Math.abs(e.clientY - ld.y0) < 5) return;
      clearTimeout(lpT); ld.started = true;
      if(!ld.row.classList.contains('kid')) list.classList.add('dragunits');   // グループの中身をたたんで、同じ階層だけを並べ替える
      ld.s0 = list.scrollTop; ld.rects = ld.rows.map(r => r.getBoundingClientRect()); ld.row.classList.add('dragging'); ld.row.setPointerCapture(ld.pid);
      ld.raf = requestAnimationFrame(dragScroll);
    }
    dragUpdate();
  });
  const endDrag = () => {
    if(!ld) return;
    clearTimeout(lpT); cancelAnimationFrame(ld.raf);
    const {started, from, to, id, rows} = ld; ld = null;
    list.classList.remove('dragunits');
    if(!started) return;
    // ドラッグ直後に発火する click で、並べ替えたのに選択処理が走るのを防ぐ（同じイベントターンの間だけ無視）
    suppressClick = true; setTimeout(() => suppressClick = false, 0);
    rows.forEach(r => { r.style.transform = ''; r.classList.remove('dragging'); });
    if(to !== from){ movePeer(id, to); const L = DOC.layers.find(l => l.id === id); toast(`「${layerName(L)}」を${to < from ? '前面' : '背面'}へ移動しました`); }
    else renderLayers();
    if(DOC.sel !== id) selectLayer(id);
  };
  list.addEventListener('pointerup', endDrag); list.addEventListener('pointercancel', endDrag);
  // 不透明度スライダーを触っている間は、パネルの再描画を止める（layers.js の lpSliding。スライダーが作り直されてドラッグが切れるのを防ぐ）。
  // 離すのは window で受ける：スライダーの外で指を離しても必ず解除するため
  list.addEventListener('pointerdown', e => { if(e.target.closest('.ly-op')) lpSliding = true; }, true);
  window.addEventListener('pointerup', () => { lpSliding = false; });
  list.addEventListener('input', e => { const op = e.target.closest('.ly-op'); if(op) op.querySelector('b').textContent = Math.round(parseFloat(e.target.value) * 100) + '%'; });
  list.addEventListener('click', e => {
    if(lpFired){ lpFired = false; return; }   // 長押しで複数選択に入った直後の click は無視する
    if(suppressClick) return;
    const mb = e.target.closest('[data-multi]');
    if(mb){ if(mb.dataset.multi === 'group') groupLayers(DOC.msel); else selectLayer(DOC.sel); return; }
    const bga = e.target.closest('[data-bga]');
    if(bga){ DOC.bg.hidden = !DOC.bg.hidden; renderLayers(); syncDoc(); docChanged(false); toast(DOC.bg.hidden ? '背景を非表示にしました（PNGで保存すると背景が透明になります）' : '背景を表示しました'); return; }
    if(e.target.closest('.ly-op')) return;
    if(e.target.closest('[data-bgrow]')){ selectLayer(null); if(isMobile) openSheet('ins', true); return; }
    const row = e.target.closest('[data-lid]'); if(!row) return;
    const act = e.target.closest('[data-la]');
    if(act){
      if(act.dataset.la === 'menu'){ const r = act.getBoundingClientRect(); if(row.dataset.lid !== DOC.sel && !(DOC.msel || []).includes(row.dataset.lid)) selectLayer(row.dataset.lid); setTimeout(() => showMenu(row.dataset.lid, r.left - 150, r.bottom + 4), 0); return; }
      layerAction(row.dataset.lid, act.dataset.la); return;
    }
    if(e.target.closest('input')) return;
    // Ctrl／Shift＋クリック（スマホは、選択中にタップ）で複数選択
    if(e.ctrlKey || e.metaKey || e.shiftKey || (isMobile && DOC.msel && DOC.msel.length)){ toggleMulti(row.dataset.lid); return; }
    selectLayer(row.dataset.lid);
  });
  list.addEventListener('dblclick', e => {
    const row = e.target.closest('[data-lid]'); if(!row || e.target.closest('[data-la]')) return;
    startRename(row.dataset.lid);
  });
  list.addEventListener('contextmenu', e => {
    const row = e.target.closest('[data-lid]'); if(!row) return;
    e.preventDefault(); if(row.dataset.lid !== DOC.sel && !(DOC.msel || []).includes(row.dataset.lid)) selectLayer(row.dataset.lid);
    showMenu(row.dataset.lid, e.clientX, e.clientY);
  });
  $('#addCollageBtn').onclick = () => addCollage();
  document.addEventListener('click', e => { if(e.target.closest('#cropReset')){ const L = selLayer(); if(L && L.type === 'image'){ applyCropChange(L, () => { L.crop = {t:0, b:0, l:0, r:0}; }); syncDoc(); docChanged(false); } } });
  document.addEventListener('click', e => { if(e.target.closest('#imgColorReset')){ const L = selLayer(); if(L && L.type === 'image'){ L.bright = 0; L.sat = 0; L.fx = mergeCellFx(); syncDoc(); docChanged(false); } } });
  document.addEventListener('click', e => { if(e.target.closest('#ungroupBtn')){ const G = selLayer(); if(isGroup(G)) ungroupLayers(G); } });
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
// いまの作業を、プロジェクトファイル（.json）として保存する。
// 形式：{app:'rakuchin-thumb', v:1, doc:DOC, assets:{アセットid: dataURL}}。DOC は画像本体を持たない（id だけ）ので、
// 使っている画像（usedAssets）の本体をここで同梱する。素材置き場のバックアップ（app:'rakuchin-thumb-maker', type:'library'）とは別形式
function saveProject(){
  const used = usedAssets(), assets = {};
  used.forEach(id => { if(id && ASSETS[id]) assets[id] = ASSETS[id].src; });
  const blob = new Blob([JSON.stringify({app:'rakuchin-thumb', v:1, doc:DOC, assets})], {type:'application/json'});
  downloadBlob(blob, `rakuchin-thumb-project_${stamp()}.json`);
}
$('#saveProj').onclick = () => { saveProject(); toast('プロジェクトを保存しました'); };
// 新規作成：まっさらな状態にする（キャンバスのサイズ・書き出し設定は残すこともできる）。取り消しで戻せる
function newProject(keepSize){
  const keep = keepSize ? {w:DOC.w, h:DOC.h, exportW:DOC.exportW, fmt:DOC.fmt, limit2mb:DOC.limit2mb} : {};
  loadDocObj(Object.assign(normalizeDoc(null), keep, {mode:'thumb'}));
  toast('新規作成しました。元に戻すには Ctrl+Z（上の ↶）');
}
const openNew = () => { document.querySelectorAll('.pop.show').forEach(p => p.classList.remove('show')); $('#newModal').classList.add('show'); };
const closeNew = () => $('#newModal').classList.remove('show');
document.addEventListener('click', e => { if(e.target.closest('#newBtn, #newBtn2')) openNew(); });
$('#newModal').addEventListener('click', e => { if(e.target.id === 'newModal' || e.target.closest('[data-new-close]')) closeNew(); });
$('#newSave').onclick = () => { saveProject(); closeNew(); newProject($('#newKeepSize').checked); };
$('#newNoSave').onclick = () => { closeNew(); newProject($('#newKeepSize').checked); };
$('#openProj').onclick = () => $('#projfile').click();
$('#projfile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if(f) openProjectFile(f); };
// ファイルを読んで、素材置き場のバックアップなら libImport へ、プロジェクトなら画像を先に登録してから DOC を差し替える
// （DOC を先に差し替えると、画像が未登録のまま描画されて「読み込めません」になるため）。
// 画像の名前は元のファイル名を保存していないので、id を名前に使っている
async function openProjectFile(f){
  try{
    const j = JSON.parse(await f.text()); if(j.type === 'library'){ libImport(f); return; }   // 素材置き場のバックアップ
    if(!j.doc) throw new Error('プロジェクトファイルではありません');
    // セキュリティ：画像は「data:image/…」だけ受け付ける（外部URLだと、開いただけで第三者のサーバーに接続してしまう）。id も安全な文字だけ
    for(const [id, src] of Object.entries(j.assets || {})){ if(okId(id) && typeof src === 'string' && /^data:image\//i.test(src)) await addAsset(src, id, id); }
    loadDocObj(j.doc); toast('プロジェクトを開きました');
  }catch(err){ toast('開けませんでした: ' + err.message, true); }
}

/* ドラッグ＆ドロップ（画面のどこに落としてもOK）・貼り付け。
   落とす先はオーバーレイ上の3か所（data-dz）：背景（bg）／素材置き場（lib）／レイヤー（layer。既定）。
   フォントファイル・プロジェクト .json もここで受ける。 */
{
  const ov = $('#ddov'); let depth = 0;   // depth：dragenter/leave は子要素をまたぐたびに発火するので、入れ子の深さを数えて、本当に画面の外へ出たときだけ消す
  // 分割フレームのマス同士の入れ替えドラッグ（cellDragFrom>=0。collage-panel.js）は、ファイルのドロップとして扱わない
  const hasFiles = e => cellDragFrom < 0 && [...(e.dataTransfer?.types || [])].some(t => t === 'Files' || t === 'text/uri-list');
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
    // ほかのタブからドラッグした画像（ファイルが付いていない場合）はURLから取得を試す。サイト側の制限（CORS）で取れないことがあるので、その場合は案内を出す
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
    // 画像は、まず分割フレームのマス（ドロップ位置）に入れ、マスに当たらなかった残りだけをレイヤーにする（collageTakeFiles）
    if(zone === 'lib'){ await libAddFiles(imgs); renderLib(); return; }   // 素材置き場へ登録だけする（キャンバスには追加しない）
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

/* キャンバス上の操作。
   pointerdown で何をつかんだかを drag.mode に決める（'fx' 背景効果の中心／'edit' 編集モード／'rot'・'scale' ハンドル／'move' 移動／'bg' 背景ドラッグ）。
   決める優先順位は pointerdown の中の並び順そのもの（上ほど優先）：中心◎ → 編集モード → ハンドル → Alt+クリックで下のレイヤー →
   Shift/Ctrl+クリックで複数選択 → 通常のヒット判定 → 何も無ければ背景。pointermove が drag.mode ごとに値を更新し、pointerup（end）で確定する。 */
// 当たり判定用のマスク（下のブロックの layerMask が作る）。レイヤーid → マスク。maskFx は描画中の効果キャッシュ
const maskCache = new Map(), maskFx = new Map();
// 消えたレイヤーのマスクを捨てる。render.js の pruneLayerCaches（取り消しで復元したとき）から呼ばれる
/** @param {Set<string>} ids 今あるレイヤーの id */
function pruneMasks(ids){ for(const m of [maskCache, maskFx]) for(const k of [...m.keys()]) if(k !== '__bg' && !ids.has(k)) m.delete(k); }
{
  const tv = $('#tv');
  const toDoc = e => { const r = tv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * DOC.w, (e.clientY - r.top) / r.height * DOC.h]; };
  /* 当たり判定：枠（四角）の中でも、透明な部分は「当たり」にしない。
     レイヤーを単独で小さく描いた透明度マスクを作って調べる（変更がなければ使い回す）。
     2 = その位置に絵がある／1 = すぐ近く（細い文字を掴みやすくするための余裕）／0 = 枠の中だけ */
  // MASK_K：当たり判定用の絵の縮小率（DOC 座標の 1/4 で描く＝軽くする）。NEAR：その絵の上で「すぐ近く」とみなす範囲（px。DOC 座標では約 16px）
  const MASK_K = 0.25, NEAR = 4;
  // マスクは、レイヤーの内容・キャンバス寸法・フォント数・画像の読み込み状況のどれかが変わらない限り使い回す（キーに全部入れてある）。
  // 影・光彩は当たり判定に含めない（見えている本体だけを掴めるように）
  /** @param {Layer} L */
  const layerMask = L => {
    const key = DOC.w + 'x' + DOC.h + '|' + JSON.stringify(L) + '|' + document.fonts.size + '|' + (L.asset && ASSETS[L.asset] ? 1 : 0) + (isGroup(L) ? groupKids(L).map(k => JSON.stringify(k)).join() : '');
    let m = maskCache.get(L.id);
    if(m && m.key === key) return m;
    const W = Math.round(DOC.w * MASK_K), H = Math.round(DOC.h * MASK_K), c = mk(W, H), x = c.getContext('2d', {willReadFrequently:true});
    const keep = new Map(dims);   // 小さく描くと選択枠の大きさ（dims）も書き換わるので、終わったら戻す
    try{ drawOne(x, /** @type {Layer} */ ({...L, op:1, blend:'source-over', shadow:{...(L.shadow || {}), on:false}, glow:{...(L.glow || {}), on:false}}), MASK_K, false, maskFx); }catch(err){ console.warn('当たり判定用の絵を作れませんでした', err); }
    finally{ dims.clear(); keep.forEach((v, k) => dims.set(k, v)); }
    m = {key, W, H, a: x.getImageData(0, 0, W, H).data};
    maskCache.set(L.id, m);
    return m;
  };
  // その位置の「絵の濃さ」の段階：2＝絵がある（アルファ>24）／1＝すぐ近く／0＝無い。マスクを作れなかったら 0
  /** @param {Layer} L */
  const pixelRank = (L, x, y) => {
    let m; try{ m = layerMask(L); }catch{ return 0; }
    const cx = Math.round(x * MASK_K), cy = Math.round(y * MASK_K);
    const at = (px, py) => px >= 0 && py >= 0 && px < m.W && py < m.H && m.a[(py * m.W + px) * 4 + 3] > 24;
    if(at(cx, cy)) return 2;
    for(let dy = -NEAR; dy <= NEAR; dy++) for(let dx = -NEAR; dx <= NEAR; dx++) if(at(cx + dx, cy + dy)) return 1;
    return 0;
  };
  // 枠の中にある重なり順（手前が先）。rank 付き
  const hitLayers = (x, y, all) => {
    const out = [];
    for(let i = DOC.layers.length - 1; i >= 0; i--){
      const L = DOC.layers[i]; if(L.hidden || (L.locked && !all)) continue;
      if(L.gid){ const G = layerById(L.gid); if(!G || G.hidden || L.id !== DOC.sel) continue; }   // グループの中身は、単独で選んでいるときだけ
      const d = dims.get(L.id); if(!d) continue;
      const a = -(L.rot || 0) * PI / 180, dx = x - L.x, dy = y - L.y;
      const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      if(Math.abs(lx) <= d.w / 2 && Math.abs(ly) <= d.h / 2) out.push(L);
    }
    return out;
  };
  // 実際に絵がある（または近い）レイヤーだけ。なければ枠の中のレイヤー全部
  const hitRanked = (x, y, all) => {
    const hs = hitLayers(x, y, all), r = new Map(hs.map(l => [l.id, pixelRank(l, x, y)]));
    return {hs, r};
  };
  // クリック位置で掴むレイヤー 1 つを決める。枠の中のレイヤーが複数あるときの優先順位は、コード内のコメントのとおり
  const hitLayer = (x, y) => {
    const {hs, r} = hitRanked(x, y);
    if(hs.length < 2) return hs[0] || null;
    const cur = hs.find(l => l.id === DOC.sel);
    // 見えている一番手前の絵を優先。絵に当たっていなければ、選択中→近いもの→枠の手前、の順
    if(cur && r.get(cur.id) === 2) return cur;   // 選択中のレイヤーの絵の上なら、手前に別の絵が重なっていても選択中を優先
    const exact = hs.find(l => r.get(l.id) === 2);
    if(exact) return exact;
    if(cur && r.get(cur.id) === 1) return cur;
    return hs.find(l => r.get(l.id) === 1) || (cur || hs[0]);
  };
  // ホイールの拡大縮小は、選択中のレイヤーの絵の上（または近く）なら、手前に別のレイヤーがあっても選択中のほうを優先
  const hitForWheel = (x, y) => {
    const {hs, r} = hitRanked(x, y), cur = hs.find(l => l.id === DOC.sel);
    return cur && r.get(cur.id) > 0 ? cur : hitLayer(x, y);
  };
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
    let mode = handleAt(x, y), T = selLayer();
    if(!mode && e.altKey){
      // Alt+クリック：重なっている下のレイヤーを順番に選ぶ
      // 絵が実際にある（rank>0）ものだけを巡回対象にする。無ければ枠の中のもの全部
      const {hs: all, r} = hitRanked(x, y), vis = all.filter(l => r.get(l.id) > 0), hs = vis.length ? vis : all;
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
      mode = 'move'; if(T.id !== DOC.sel && !(DOC.msel || []).includes(T.id)) selectLayer(T.id);
    }
    // グループ・複数選択は、中身のレイヤーをまとめて動かす（xformSnap が開始時の状態を控える）。
    // drag には開始時の位置・倍率・角度（lx, ly, sc, rot）と、中心からの距離 d0・角度 a0 を持たせ、move では常にそこからの差で計算する（誤差を積まない）
    const multi = (DOC.msel || []).length >= 2 && DOC.msel.includes(T.id);
    const snap = multi ? xformSnap(DOC.msel.map(layerById).filter(l => l && !l.locked), T.x, T.y) : isGroup(T) ? xformSnap([T], T.x, T.y) : null;
    drag = {mode, L:T, snap, x0:x, y0:y, lx:T.x, ly:T.y, sc:T.sc, rot:T.rot || 0, d0:Math.hypot(x - T.x, y - T.y), a0:Math.atan2(y - T.y, x - T.x)};
    tv.setPointerCapture(e.pointerId); e.preventDefault();
  });
  tv.addEventListener('pointermove', e => {
    if(DOC.mode !== 'thumb') return;
    const [x, y] = toDoc(e);
    if(!drag && fxHandleOn() && Math.hypot(x - DOC.bg.fcx * DOC.w, y - DOC.bg.fcy * DOC.h) < 20 * DOC.w / tvCss){ tv.style.cursor = 'grab'; return; }
    if(!drag && editLayer()){ tv.style.cursor = edit.kind === 'cut' ? 'crosshair' : 'move'; if(edit.kind === 'cut'){ cutCursor = [x, y]; livePaint(); } return; }
    if(!drag){ const h = handleAt(x, y); tv.style.cursor = h === 'rot' ? 'grab' : h === 'scale' ? 'nwse-resize' : hitLayer(x, y) ? 'move' : (DOC.bg.type === 'image' && ASSETS[DOC.bg.asset] ? 'grab' : 'default'); return; }
    const L = drag.L, px = DOC.w / tvCss;
    if(drag.mode === 'edit'){ editPointerMove(x, y); return; }
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
  const end = () => { if(!drag) return; const d = drag; drag = null; snapLines = {x:null, y:null}; if(d.mode === 'edit' && edit && EDIT_MODES[edit.kind].up) EDIT_MODES[edit.kind].up(d.L, d); docChanged(false); };
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
    const [x, y] = toDoc(e), L = hitLayers(x, y, true)[0]; if(!L) return;
    e.preventDefault(); if(L.id !== DOC.sel && !(DOC.msel || []).includes(L.id)) selectLayer(L.id); showMenu(L.id, e.clientX, e.clientY);
  });
  // ダブルクリック：グループ→中の1つを選ぶ／文字→文字の編集へ／画像・分割フレーム→編集モードへ
  tv.addEventListener('dblclick', e => {
    const [x, y] = toDoc(e), L = hitLayer(x, y);
    if(L && isGroup(L)){   // グループの中のレイヤーを、単独で選ぶ
      const k = groupKids(L).filter(k => !k.hidden).reverse().find(k => pixelRank(k, x, y) > 0);
      if(k) selectLayer(k.id);
      return;
    }
    if(L && L.type === 'text'){ selectLayer(L.id); openInspector('txt-text'); if(!isMobile){ $('#text').focus(); $('#text').select(); } }
    else if(L) enterEditAt(L, x, y);
  });
  // キー操作（選択中のレイヤーに対して）：Delete 削除／矢印 1px（Shift で 10px）移動／Ctrl+G グループ／Ctrl+D 複製／Ctrl+[ ] 重なり順／H・V 反転／Esc 解除。
  // 文字入力中・ヘルプやポップアップ表示中は何もしない（入力を奪わないため）
  document.addEventListener('keydown', e => {
    if(DOC.mode !== 'thumb' || $('#help').classList.contains('show') || document.querySelector('.pop.show')) return;
    if(isTyping(e)) return;
    const L = selLayer(); if(!L) return;
    const st = e.shiftKey ? 10 : 1;
    if(e.key === 'Delete' || e.key === 'Backspace'){ e.preventDefault(); layerAction(L.id, 'del'); }
    else if(e.key.startsWith('Arrow')){
      e.preventDefault(); if(L.locked) return;
      const dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
      const ms = (DOC.msel || []).length >= 2 ? DOC.msel.map(layerById).filter(Boolean) : [L];
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
