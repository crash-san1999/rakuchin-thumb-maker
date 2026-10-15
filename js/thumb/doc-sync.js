/* 楽ちんサムネメーカー：サムネのデータと画面のつなぎ（値の読み書き・変更通知・入力欄の同期） */
/*
  役割：入力欄の data-d に書くキー（パス文字列）で DOC の値を読み書きし、DOC を変えたら保存・取り消し履歴・再描画・
       レイヤーパネルの更新をまとめて予約し（docChanged）、DOC の値を設定パネルの入力欄へ映す（syncDoc）。
       データの形（既定値・読み込み・自動保存）は doc.js。
  主な公開：dGet・dSet・setD / docChanged / syncDoc・syncDocSoon / DB（入力欄との結び付け）
  依存：DOC・selLayer・saveDoc（doc.js）、makeBinder（bind.js）、pushHist・histT（history.js・preview.js）、livePaint・update・schT（render.js・preview.js）、
       renderLayers（layers.js）、renderInspector（inspector.js）、renderCells・renderCellText（collage-panel.js）、renderSched（sched-panel.js）、
       refreshSizeUI（canvas.js）、collageLayoutOk・collageFxModeChanged（collage.js）、frameGeom・frameCompensate（frames.js）、applyCropChange・cutAutoColor（assets.js・cutout.js）。
  読み込み順：doc.js の次。DB（makeBinder の結果）だけは読み込み時に作る（bind.js は先に読み込み済み）。
  呼び出し元：DOC を変える全員が、変更後に docChanged() を呼ぶ（inspector.js・events*.js・layers.js・history.js など）。
*/
/* 入力欄の data-d に書くキー（パス文字列）の解決。
   'bg.zb.amt'      … DOC からの相対パス
   '@sc' '@p.n'     … 先頭 @ は「選択中のレイヤー」からの相対パス
   '@cell.zoom'     … 分割フレームの「選択中のマス（L.ac）」からの相対パス
   戻り値は [起点オブジェクト, 残りのパス]。起点が無い（レイヤー未選択など）ときは b が null */
function dBase(k){
  if(k.startsWith('@cell.')){ const L = selLayer(); return [L && L.cells ? L.cells[L.ac || 0] : null, k.slice(6)]; }
  return k[0] === '@' ? [selLayer(), k.slice(1)] : [DOC, k];
}
function dGet(k){ const [b, p] = dBase(k); return b ? p.split('.').reduce((o, q) => o?.[q], b) : undefined; }
function dSet(k, v){
  const [b, p] = dBase(k); if(!b) return;
  const ps = p.split('.'), last = ps.pop(), o = ps.reduce((o, q) => o?.[q], b);
  if(o) o[last] = v;
  // 値の変更に連動して直す項目：分割数を変えたら、その数で使えない配置は 'cols' に戻す／効果の対象（全部⇔マスごと）の切り替えを分割フレーム側へ伝える
  if(k === '@n' && b.type === 'collage' && !collageLayoutOk(b.layout, collageN(b))) b.layout = 'cols';
  if(k === '@fxMode' && b.type === 'collage') collageFxModeChanged(b);
}
/* DOC を変えたら必ず呼ぶ「変更通知」。保存・取り消し履歴・再描画・レイヤーパネル更新をまとめて予約する。
   live=true はスライダーのドラッグ中：まず軽い即時描画（livePaint）だけして、高品質の再描画は 220ms 止まってから行う。
   履歴は 450ms まとめて1回だけ積む（ドラッグ1回＝取り消し1回にするため）。
   text モード（文字だけを透過PNGで作る）ではサムネの再描画は不要なので、保存と履歴だけ行って戻る */
function docChanged(live){
  saveDoc(); clearTimeout(histT); histT = setTimeout(pushHist, 450);
  if(DOC.mode !== 'thumb') return;
  clearTimeout(schT);
  if(live){ livePaint(); schT = setTimeout(update, 220); } else schT = setTimeout(update, 30);
  clearTimeout(docChanged.t); docChanged.t = setTimeout(renderLayers, 150);
}
// サムネ（DOC・選択中のレイヤー）用の入力欄のつなぎ込み。キーが @ で始まると選択中のレイヤー
function setD(k, v){
  // 変更前のフレーム形状（g0）を控えて、変更後に frameCompensate でレイヤー位置をずらす。
  // 切り抜きフレームを変えても、画像そのものはキャンバス上で動かないように位置を補正する
  if(/^@frame\.(cx|cy|fs|ar|shape)$/.test(k)){ const L = selLayer(), g0 = L && L.type === 'image' && frameGeom(L); dSet(k, v); if(g0 && L.frame.shape !== 'none') frameCompensate(L, g0); }
  else dSet(k, v);
}
const DB = makeBinder({val:'d', seg:'dseg', show:'dshow', reroll:'dreroll', get:dGet,
  onInput(k, v, el){
    const cL = /^@crop\./.test(k) ? selLayer() : null;
    if(cL) applyCropChange(cL, () => setD(k, v)); else setD(k, v);
    if(k === '@key.on' && v){ const L = selLayer(), A = L && ASSETS[L.asset]; if(A && L.key.c === KEY_BASE().c){ const c = cutAutoColor(cropSrc(L, A).img); if(c) L.key.c = c; } }   // 初めてオンにしたときは、四隅の色を背景色にする
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
  const sc = $('#safeChip'); if(sc) sc.hidden = !DOC.hdr;   // セーフエリアのボタンはヘッダー画像のときだけ出す
  const L = selLayer(); document.querySelectorAll('[data-flip]').forEach(b => b.classList.toggle('on', !!(L && L[b.dataset.flip])));
  renderInspector();
  renderCells(); renderCellText(); renderSched();
  refreshSizeUI();
}

