/* 楽ちんサムネメーカー：サムネのデータ構造（既定値・読み込み時の整え方・自動保存） */
/*
  役割：サムネ作成モードの保存データ DOC（キャンバス寸法・背景 bg・仕上げ fin・レイヤー配列 layers・選択状態）の
  初期値・読み込み時の正規化・自動保存を持つ。画面とのつなぎ（パス文字列での値の読み書き・変更通知・入力欄の同期）は doc-sync.js。
  主な公開：layerById・selLayer・textLayer（レイヤーを引く）/ DOC_BASE / normalizeDoc / loadSavedDoc / saveDoc /
           usedAssets / layerName / mkTextLayer（uid は core.js）
  依存：LS・S・clamp（core.js）、kindOf（layer-kinds.js：種類ごとの読み込み・補正・名前・使用画像）、
       FIN_BASE・FIN_LOOKS（finish.js）、HEADER_SPECS・EXPORT_MAX_PX（canvas.js）、mkFx（fx.js）、EXTRA_FX_BASE・fxColorsSafe（imgfx.js）。
  呼び出し元：main.js（起動時 loadSavedDoc）、export.js（プロジェクトを開く時の loadDocObj → normalizeDoc）、
            doc-sync.js（docChanged から saveDoc）、ほか DOC を読む全員。
  DOC の形（要点）：
    { mode:'thumb'|'text', w,h:キャンバス px, exportW:書き出し横幅 px, fmt, limit2mb, guides, bg, fin,
      layers:[…奥→手前の順…], sel:選択中レイヤーid, textSel:文字パネルとつながる文字レイヤーid, msel:複数選択id（保存しない） }
    layers の各要素は共通で {id, type, x, y, sc, rot, op, blend, hidden, locked, gid?, label?}。type は text / image / collage / sched / group / fx
    （種類ごとの項目と振る舞いは layer-kinds.js の登録表）。
    x・y は DOC 座標（左上が原点、単位は w×h の px）で、レイヤーの中心を指す。画像本体は DOC に入れず、asset（id）だけを持つ
    （本体は assets.js の ASSETS と IndexedDB）。
  保存先の使い分け：DOC と文字スタイル S は小さいので localStorage（'ttm_doc' / 'ttm_state'）。画像は大きいので IndexedDB。
*//*
  役割：サムネ作成モードの保存データ DOC（キャンバス寸法・背景 bg・仕上げ fin・レイヤー配列 layers・選択状態）の
  初期値・読み込み時の正規化・自動保存・「パス文字列での値の読み書き」・変更通知を持つ。
  主な公開：layerById・selLayer・textLayer（レイヤーを引く）/ DOC_BASE / normalizeDoc / loadSavedDoc / saveDoc / dGet・dSet・setD / docChanged / syncDoc / DB（入力欄との結び付け）/
           selLayer・textLayer / usedAssets / layerName / mkTextLayer（uid は core.js）
  依存：LS・S・clamp（core.js）、bind.js の makeBinder、LAYER_BASE・IMAGE_BASE・COLLAGE_BASE・GROUP_BASE・FRAME_BASE・FIN_BASE などの
       各レイヤー定義（assets.js / collage.js / group.js / frames.js / finish.js / fx.js）。
  呼び出し元：main.js（起動時 loadSavedDoc）、export.js（プロジェクトを開く時の loadDocObj → normalizeDoc）、
            history.js（取り消し）、inspector.js・events.js・layers.js など、DOC を触る全員が変更後に docChanged() を呼ぶ。
  DOC の形（要点）：
    { mode:'thumb'|'text', w,h:キャンバス px, exportW:書き出し横幅 px, fmt, limit2mb, guides, bg, fin,
      layers:[…奥→手前の順…], sel:選択中レイヤーid, textSel:文字パネルとつながる文字レイヤーid, msel:複数選択id（保存しない） }
    layers の各要素は共通で {id, type, x, y, sc, rot, op, blend, hidden, locked, gid?, label?}。type は text / image / collage / group / fx。
    x・y は DOC 座標（左上が原点、単位は w×h の px）で、レイヤーの中心を指す。画像本体は DOC に入れず、asset（id）だけを持つ
    （本体は assets.js の ASSETS と IndexedDB）。
  保存先の使い分け：DOC と文字スタイル S は小さいので localStorage（'ttm_doc' / 'ttm_state'）。画像は大きいので IndexedDB。
*/
/* ============ サムネ作成 ============ */
// ファイルの中だけで使う名前を外（ほかのファイルと共有の場所）に出さないよう、中身を関数で包んでいる。外から使う名前は最後の return で出す
// 型の定義（types/types.js）が typeof で型を引く既定値は、包みの外に置く（中に入れると型が循環するため）
// 毎回新しいオブジェクトを返す（Object.assign のベースに使うので、共有すると保存データを書き換えてしまう）
const DOC_BASE = () => ({
  mode:'thumb', w:1920, h:1080, exportW:1920, fmt:'png', limit2mb:true,
  guides:{thirds:false, badge:true, snap:true, fx:true, safe:false},
  hdr:'',   // ヘッダー画像の種類（'yt'＝YouTubeチャンネルアート / 'tw'＝Twitchバナー / ''＝なし）。あるときだけセーフエリアのガイドが使える（canvas.js の HEADER_SPECS）
  bg:{hidden:false, op:1, type:'grad', color:'#16161c', c1:'#ff5a2e', c2:'#ffbe3b', angle:120, asset:null, fit:'cover', zoom:1, ox:0, oy:0, rot:0, flip:false,
      gap:'blur', gapColor:'#111114', bright:0, contrast:0, sat:0, hue:0, blur:0, tone:'none', duo1:'#1b1464', duo2:'#ff9d5c',
      dim:0, vignette:0, fcx:0.5, fcy:0.5, shade:{on:false, c:'#000000', amt:0.75, angle:90, cover:0.55},
      zb:{on:false, amt:0.25, cx:0.5, cy:0.5}, mb:{on:false, dist:120, angle:0}, mosaic:{on:false, size:28},
      tint:{on:false, c:'#ff7a50', a:0.35, mode:'overlay'},
      ...EXTRA_FX_BASE(),   // ポスタライズ・2値化・ミニチュア・色収差・網点・線画・ゆがみなど（imgfx.js。マス・画像レイヤーと共通）
      pat:{on:false, type:'dot', c:'#000000', a:0.25, size:16, mode:'source-over'}},
  fin:FIN_BASE(),
  layers:[], sel:null, textSel:null, msel:[],
});
var {mkTextLayer, layerById, selLayer, textLayer, usedAssets, layerName, normalizeLayer, normalizeDoc, loadSavedDoc, saveDoc} = (() => {
const mkTextLayer = (style, x, y, sc) => Object.assign(LAYER_BASE(), {id:uid(), type:/** @type {'text'} */ ('text'), x, y, sc, style});
// id からレイヤーを探す（無ければ null）。選択中・文字入力中のレイヤーもこれで引く
const layerById = id => (DOC && DOC.layers.find(l => l.id === id)) || null;
const selLayer = () => layerById(DOC && DOC.sel);
/** 文字パネルとつながっている文字レイヤー（無い・文字レイヤーでないときは null） @returns {TextLayer|null} */
const textLayer = () => { const L = layerById(DOC && DOC.textSel); return L && L.type === 'text' ? L : null; };
// いま DOC が参照している画像アセットid の集合。IndexedDB の掃除（assets.js idbRestore）とプロジェクト保存で「使っているものだけ」を残すのに使う
function usedAssets(){ return new Set([DOC.bg.asset, ...DOC.layers.flatMap(l => kindOf(l).assets(l))].filter(Boolean)); }
/** @param {Layer} L */
// ユーザーが付けた名前（label）があればそれ、無ければ種類ごとの既定の名前（layer-kinds.js の name）
function layerName(L){ return L.label || kindOf(L).name(L); }
/* 保存データ（localStorage・プロジェクトJSON・取り消し履歴）を、いまの DOC の形に整えて返す。
   機能追加で増えたキーは既定値で埋め、範囲外の値は丸める。古い保存データを読んでも落ちないための唯一の入口なので、
   DOC にキーを足したら、ここで既定値が入るか（Object.assign のベースにあるか）を必ず確認すること。
   d が不正（null・layers なし）のときは、文字レイヤー1枚の新規ドキュメントを返す。 */
// レイヤー 1 枚を、種類ごとの既定値と混ぜ直す（normalizeDoc から呼ぶ）。中身は種類ごとの登録（layer-kinds.js の normalize）。
// 保存データ L に無い項目は既定値で埋まる。入れ子のオブジェクト（shadow・cells の中など）は 1 段ずつ既定値と混ぜる
function normalizeLayer(L){ return kindOf(L).normalize(L); }
// 背景・仕上げ・ガイド・ヘッダー画像の設定を既定値と混ぜ、旧データの効果の中心を引き継ぐ（o は Object.assign(DOC_BASE(), d) 済みのもの）
function normalizeDocSettings(o, d){
  // Object.assign は浅いコピーなので、入れ子のオブジェクト（bg・fin・guides と、bg の中の zb など）は個別に既定値と混ぜる。
  // こうしないと、古いデータに zb などが無いとき o.bg.zb.on が未定義参照で落ちる
  const base = DOC_BASE();
  o.bg = Object.assign(base.bg, d.bg || {});
  o.fin = Object.assign(FIN_BASE(), d.fin || {}); if(!FIN_LOOKS[o.fin.look]) o.fin.look = 'none'; if(o.fin.target !== 'bg') o.fin.target = 'all';
  for(const k of ['zb', 'mb', 'mosaic', 'tint', 'shade', 'posterize', 'thresh', 'tilt', 'pat', 'rgb', 'gmap', 'rep', 'half', 'edge', 'paint', 'warp', 'scan', 'crt']) o.bg[k] = Object.assign(DOC_BASE().bg[k], (d.bg || {})[k] || {});
  o.guides = Object.assign(base.guides, d.guides || {});
  // ヘッダー画像の種類は、キャンバスの大きさがその規定サイズと同じときだけ有効（食い違う保存データは無効にする）
  const hs = HEADER_SPECS[d.hdr]; o.hdr = hs && hs.w === o.w && hs.h === o.h ? d.hdr : ''; if(!o.hdr) o.guides.safe = false;
  // 旧データ互換：背景効果の中心はもとはズームブラー専用（zb.cx/cy）だった。fcx/fcy が無い古いデータでは、そちらの値を引き継ぐ
  if(d.bg && d.bg.fcx == null && d.bg.zb && (d.bg.zb.cx !== 0.5 || d.bg.zb.cy !== 0.5) && d.bg.zb.cx != null){ o.bg.fcx = d.bg.zb.cx; o.bg.fcy = d.bg.zb.cy; }
}
// id・画像の参照・色を、安全な値にそろえる
function sanitizeDocRefs(o){
  // セキュリティ：id・画像の参照は HTML 属性や querySelector に入るので、安全な文字だけにそろえる（細工されたプロジェクトファイル対策）。
  // 使えない id は作り直し、そのレイヤーを指す gid も同じ新しい id に付け替える
  const idMap = {};
  o.layers.forEach(l => { if(!okId(l.id)){ const n = uid(); idMap[l.id] = n; l.id = n; } });
  o.layers.forEach(l => { if(l.gid != null){ l.gid = idMap[l.gid] || l.gid; if(!okId(l.gid)) delete l.gid; } });
  o.layers.forEach(l => { if(l.asset != null && !okId(l.asset)) l.asset = null; if(l.cells) l.cells.forEach(c => { if(c.asset != null && !okId(c.asset)) c.asset = null; }); });
  if(o.bg.asset != null && !okId(o.bg.asset)) o.bg.asset = null;
  fxColorsSafe(o.bg);   // 背景の効果の色（2色・2値化・グラデーションマップなど）
  o.fin.leakC = safeColor(o.fin.leakC, '#ff8a3d');
  // 色：不正な文字列だと、HTML 属性を壊すだけでなく addColorStop が例外を出して描画が止まるので、読み込み時に使える色へそろえる
  o.layers.forEach(l => {
    if(l.cells) l.cells.forEach(c => { c.bg.c = safeColor(c.bg.c, '#ffffff'); c.bg.c2 = safeColor(c.bg.c2, '#ffd9e8');
      c.tx.fc = safeColor(c.tx.fc, '#ffffff'); c.tx.ec = safeColor(c.tx.ec, '#1f1b2d'); c.w = cellW(c); });
    kindOf(l).sanitize(l);   // 種類ごとの値（分割フレームの文字の調整・動的エフェクトの色など）
  });
}
// グループの整理（存在しないグループへの gid・空のグループ）と、複数選択のリセット
function cleanupGroups(o){
  // グループ：存在しないグループを指す gid を外し、中身のないグループを消す。複数選択は保存しない
  const gids = new Set(o.layers.filter(l => l.type === 'group').map(l => l.id));
  o.layers.forEach(l => { if(l.gid && (!gids.has(l.gid) || l.type === 'group')) delete l.gid; if(!l.gid) delete l.gid; });
  o.layers = o.layers.filter(l => l.type !== 'group' || o.layers.some(k => k.gid === l.id));
  o.msel = [];
}
// 旧データの「背景の集中線」を動的エフェクトのレイヤーに移す
function migrateOldLines(o, d){
  // 旧データ互換：以前の「背景の集中線」(bg.lines) を動的エフェクトのレイヤーに移す。
  // unshift で最背面に入れるのは、旧仕様では集中線が背景の直上（他のレイヤーより奥）に描かれていたため。中心は fcx/fcy（比率）を px に直す
  const oldLines = (d.bg || {}).lines; delete o.bg.lines;
  if(oldLines && oldLines.on){ const l = oldLines; o.layers.unshift(mkFx('lines', {c:l.c, n:l.n, inner:l.inner, w:l.w ?? 1, len:l.len ?? 1, seed:l.seed}, {op:l.a, x:(o.bg.fcx ?? 0.5) * o.w, y:(o.bg.fcy ?? 0.5) * o.h})); }
}
/** @returns {Doc} */
function normalizeDoc(d){
  /** @type {Doc} */
  const b = DOC_BASE();
  if(!d || !Array.isArray(d.layers)){
    const L = mkTextLayer(S, b.w / 2, b.h / 2, 1.5);
    b.layers = [L]; b.sel = L.id; b.textSel = L.id; return b;
  }
  const o = Object.assign(b, d);
  o.w = clamp(Math.round(d.w) || 1920, 200, 5000); o.h = clamp(Math.round(d.h) || 1080, 200, 5000);
  // 書き出しの横幅：数でなければ等倍、大きすぎるときは面積の上限に収まるまで小さくする
  let ex = Math.round(+d.exportW); if(!(ex >= 100)) ex = o.w;
  while(ex > 200 && ex * ex * o.h / o.w > EXPORT_MAX_PX) ex = Math.floor(ex * 0.9);
  o.exportW = ex;
  normalizeDocSettings(o, d);
  // レイヤーを type ごとに既定値と混ぜ直す。壊れた要素と、種類の keep が false のもの（未対応の動的エフェクトの種類など。バージョン違いの保存データ）は捨てる
  o.layers = d.layers.filter(L => L && typeof L === 'object').filter(L => kindOf(L).keep(L)).map(L => normalizeLayer(L));
  sanitizeDocRefs(o);
  cleanupGroups(o);
  migrateOldLines(o, d);
  if(!o.layers.find(l => l.id === o.textSel)){ const T = o.layers.find(l => l.type === 'text'); o.textSel = T ? T.id : null; }
  if(o.sel && !o.layers.find(l => l.id === o.sel)) o.sel = null;
  return o;
}
// 保存しておいた作業を読み込み、選択中の文字レイヤーのスタイルを文字パネルにつなぐ。
// S（文字パネルが編集中のスタイル）は textSel の文字レイヤーの style と同じ参照を共有する。ここで差し替えないと、パネルの編集が DOC に届かない
function loadSavedDoc(){
  try{ DOC = normalizeDoc(LS.get('ttm_doc', null)); }catch(e){ console.warn('保存データを読み込めませんでした', e); DOC = normalizeDoc(null); }
  const T = textLayer(); if(T) S = T.style;
}

// 自動保存。スライダーを動かしている間に何度も呼ばれるので 250ms まとめる（localStorage の JSON 化は重い）。
// 容量超過などの失敗は LS.set 側が警告を出す。画像の本体はここには入らない（IndexedDB。assets.js）
function saveDoc(){
  clearTimeout(saveDoc.t);
  saveDoc.t = setTimeout(() => { LS.set('ttm_state', S); if(DOC) LS.set('ttm_doc', DOC); }, 250);
}
return {mkTextLayer, layerById, selLayer, textLayer, usedAssets, layerName, normalizeLayer, normalizeDoc, loadSavedDoc, saveDoc};
})();
