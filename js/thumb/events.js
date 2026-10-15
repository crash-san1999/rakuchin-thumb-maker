/* 楽ちんサムネメーカー：ボタンの操作・プロジェクトの保存／読み込み／新規作成 */
/*
  役割：サムネ作成モードの「入力の受け付け」のうち、設定パネルや上のバーのボタン、レイヤーの追加ボタン、
       プロジェクトの保存・読み込み・新規作成を受け持つ。処理の中身は各ファイル（layers.js・editmodes.js・doc-sync.js 等）に任せ、
       ここは「どの操作を何に振り分けるか」を持つ。入力の受け付けは役割ごとに次のファイルに分けている：
         events.js        … ここ（ボタン・プロジェクト）
         events-layers.js … レイヤーパネル（並べ替えのドラッグ・選択・名前の変更・メニュー）
         events-drop.js   … ファイルのドラッグ＆ドロップ・貼り付け
         events-canvas.js … キャンバス上のドラッグ・ホイール・キー操作
  主な公開：saveProject / newProject / openProjectFile / openNew・closeNew
  依存：DOC・selLayer・saveDoc（doc.js）、docChanged・syncDoc（doc-sync.js）、dims（render.js）、toggleEdit・setEdit・EDIT_MODES（editmodes.js）、
       FRAME_PRESETS・frameGeom・frameCompensate（frames.js）、addFx・applyBgFx（fx.js）、applyFinPreset（finish.js）、
       addCollage（collage-panel.js）、addSched（sched-panel.js）、ungroupLayers（group.js）、addImageLayers・setBgFromFile・addAsset（assets.js）、
       libImport（library.js）、loadDocObj（export.js）。
  読み込み順：inspector.js の次、events-layers.js → events-drop.js → events-canvas.js の前。読み込み時にイベントを登録する（DOM は存在済み）。
       同じ対象（document の click など）に登録する順番が元の events.js と変わらないよう、この並びを保つ。
*/
/* ---------- イベント ---------- */
// 設定パネルのボタン類（クリックの委譲）。ボタンの id・data 属性は inspector.js の行定義と対応する
document.addEventListener('click', e => {
  const pb = tgt(e).closest('[data-place]');
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
  if(tgt(e).closest('#collageEditBtn, #cellFab')){ toggleEdit('cells'); return; }
  // 分割フレームを画面いっぱいに：中心・大きさ・回転を初期化（bw/bh はキャンバスと同じ寸法）
  if(tgt(e).closest('#collageFill')){ const L = selLayer(); if(L){ Object.assign(L, {x:DOC.w / 2, y:DOC.h / 2, bw:DOC.w, bh:DOC.h, sc:1, rot:0}); syncDoc(); docChanged(false); } return; }
  if(tgt(e).closest('#frameEditBtn')){ toggleEdit('frame'); return; }
  // ブラシ開始時、前回「色を拾う」で終わっていたら道具を「消す」に戻す（拾うモードのまま入ると色を拾うだけで終わってしまうため）
  if(tgt(e).closest('#cutBrushBtn')){ const L = selLayer(); if(L && L.btool === 'pick') L.btool = 'erase'; toggleEdit('cut'); return; }
  if(tgt(e).closest('#cutPickBtn')){ const L = selLayer(); if(L && L.type === 'image' && EDIT_MODES.cut.ok(L)){ L.btool = 'pick'; if(edit && edit.kind === 'cut') syncDoc(); else setEdit('cut', L); paintPreview(false); } else if(L) toast('切り抜きフレームを使っている画像では、色を拾うモードは使えません。「四隅から自動で拾う」か、色の欄で指定してください', true); return; }
  if(tgt(e).closest('#cutAutoBtn')){
    const L = selLayer(), A = L && L.type === 'image' && ASSETS[L.asset]; if(!A) return;
    const c = cutAutoColor(cropSrc(L, A).img); if(!c){ toast('四隅が透明なので、色を拾えませんでした', true); return; }
    L.key.c = c; L.key.on = true; syncDoc(); docChanged(false); return;
  }
  if(tgt(e).closest('#cutUndoStroke')){ const L = selLayer(); if(L && L.type === 'image' && L.strokes.length){ L.strokes.pop(); syncDoc(); docChanged(false); } return; }
  if(tgt(e).closest('#cutClearStrokes')){ const L = selLayer(); if(L && L.type === 'image' && L.strokes.length){ L.strokes = []; syncDoc(); docChanged(false); toast('ブラシの跡を消しました'); } return; }
  // フレームのプリセット：形・枠をプリセットで置き換えるが、大きさ・位置（fs・cx・cy）は引き継ぎ、見た目の位置が動かないよう補正する。
  // p[2] が frame の差分、p[3] があればフチ（outline）も一緒にオンにする
  const frp = tgt(e).closest('[data-frpre]');
  if(frp){
    const L = selLayer(); if(!L || L.type !== 'image') return;
    const p = FRAME_PRESETS.find(q => q[0] === frp.dataset.frpre);
    const g0 = L.frame.shape !== 'none' && frameGeom(L);
    L.frame = Object.assign(FRAME_BASE(), {fs:L.frame.fs, cx:L.frame.cx, cy:L.frame.cy}, p[2]);
    if(g0 && L.frame.shape !== 'none') frameCompensate(L, g0);
    if(p[3]) L.outline = Object.assign({}, L.outline, {on:true}, p[3]);
    syncDoc(); docChanged(false); return;
  }
  const afb = tgt(e).closest('[data-addfx]');
  if(afb){ addFx(afb.dataset.addfx); return; }
  const fx = tgt(e).closest('[data-bgfx]');
  if(fx){ const withLayers = applyBgFx(fx.dataset.bgfx); toast(fx.dataset.bgfx === 'reset' ? '背景エフェクトをリセットしました（自分で追加した動的エフェクトはそのまま）' : `「${fx.textContent}」を適用しました` + (withLayers ? '（集中線や光はレイヤーとして追加。ドラッグで動かせます）' : '')); return; }
  const ffx = tgt(e).closest('[data-finfx]');
  if(ffx){ applyFinPreset(ffx.dataset.finfx); toast(ffx.dataset.finfx === 'reset' ? '仕上げエフェクトを外しました' : `仕上げ「${ffx.textContent}」をかけました（「仕上げ」タブで調整できます）`); return; }
  const gb = tgt(e).closest('[data-guide]');
  if(gb){ DOC.guides[gb.dataset.guide] = !DOC.guides[gb.dataset.guide]; syncDoc(); saveDoc(); paintPreview(false); return; }
  const mb = tgt(e).closest('[data-mode]');
  if(mb){ setMode(mb.dataset.mode); return; }
  const tb = tgt(e).closest('#tabs [data-page]');
  if(tb){ setPage(tb.dataset.page); return; }
  if(tgt(e).closest('#insDesel')){ selectLayer(null); return; }
});
// レイヤーの追加・設定パネルのボタン（元はレイヤーパネルのブロックの中にあったもの）
$('#addCollageBtn').onclick = () => addCollage();
$('#addSchedBtn').onclick = () => addSched();
document.addEventListener('click', e => { if(tgt(e).closest('#cropReset')){ const L = selLayer(); if(L && L.type === 'image'){ applyCropChange(L, () => { L.crop = {t:0, b:0, l:0, r:0}; }); syncDoc(); docChanged(false); } } });
document.addEventListener('click', e => { if(tgt(e).closest('#imgColorReset')){ const L = selLayer(); if(L && L.type === 'image'){ L.bright = 0; L.sat = 0; L.fx = mergeCellFx(); syncDoc(); docChanged(false); } } });
document.addEventListener('click', e => { if(tgt(e).closest('#ungroupBtn')){ const G = selLayer(); if(isGroup(G)) ungroupLayers(G); } });
$('#addText').onclick = () => {
  const st = clone(S); st.text = 'テキスト';
  const L = mkTextLayer(st, DOC.w / 2, DOC.h / 2, 1.2);
  DOC.layers.push(L); selectLayer(L.id); docChanged(false);
  openInspector('txt-text'); setTimeout(() => { $as('#text', HTMLTextAreaElement).focus(); $as('#text', HTMLTextAreaElement).select(); }, 60);
};
$('#addImg').onclick = () => $('#imgfile').click();
$('#imgfile').onchange = e => { addImageLayers([...inputOf(e).files]); inputOf(e).value = ''; };
$('#bgimgfile').onchange = e => { const f = inputOf(e).files[0]; if(f) setBgFromFile(f); inputOf(e).value = ''; };
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
const openNew = () => { $$('.pop.show').forEach(p => p.classList.remove('show')); $('#newModal').classList.add('show'); };
const closeNew = () => $('#newModal').classList.remove('show');
document.addEventListener('click', e => { if(tgt(e).closest('#newBtn, #newBtn2')) openNew(); });
$('#newModal').addEventListener('click', e => { if(tgt(e).id === 'newModal' || tgt(e).closest('[data-new-close]')) closeNew(); });
$('#newSave').onclick = () => { saveProject(); closeNew(); newProject($as('#newKeepSize', HTMLInputElement).checked); };
$('#newNoSave').onclick = () => { closeNew(); newProject($as('#newKeepSize', HTMLInputElement).checked); };
$('#openProj').onclick = () => $('#projfile').click();
$('#projfile').onchange = e => { const f = inputOf(e).files[0]; inputOf(e).value = ''; if(f) openProjectFile(f); };
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
