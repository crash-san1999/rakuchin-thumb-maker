/* 楽ちんサムネメーカー：サムネのデータ構造・値の読み書き・変更通知 */
/*
  役割：サムネ作成モードの保存データ DOC（キャンバス寸法・背景 bg・仕上げ fin・レイヤー配列 layers・選択状態）の
  初期値・読み込み時の正規化・自動保存・「パス文字列での値の読み書き」・変更通知を持つ。
  主な公開：DOC_BASE / normalizeDoc / loadSavedDoc / saveDoc / dGet・dSet・setD / docChanged / syncDoc / DB（入力欄との結び付け）/
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
      posterize:{on:false, n:4}, thresh:{on:false, lvl:0.5, c1:'#111111', c2:'#ffffff'}, tilt:{on:false, pos:0.55, w:0.3, blur:14, sat:0.3},
      pat:{on:false, type:'dot', c:'#000000', a:0.25, size:16, mode:'source-over'}},
  fin:FIN_BASE(),
  layers:[], sel:null, textSel:null, msel:[],
});
const mkTextLayer = (style, x, y, sc) => Object.assign(LAYER_BASE(), {id:uid(), type:'text', x, y, sc, style});
const selLayer = () => (DOC && DOC.layers.find(l => l.id === DOC.sel)) || null;
const textLayer = () => (DOC && DOC.layers.find(l => l.id === DOC.textSel)) || null;
// いま DOC が参照している画像アセットid の集合。IndexedDB の掃除（assets.js idbRestore）とプロジェクト保存で「使っているものだけ」を残すのに使う
function usedAssets(){ return new Set([DOC.bg.asset, ...DOC.layers.flatMap(l => l.type === 'image' ? [l.asset] : l.type === 'collage' ? l.cells.map(c => c.asset) : [])].filter(Boolean)); }
/** @param {Layer} L */
function layerName(L){
  if(L.label) return L.label;
  if(L.type === 'text') return L.style.text.replace(/[{}]/g, '').replace(/\n/g, ' ').trim().slice(0, 28) || '（空の文字）';
  if(L.type === 'group') return `グループ（${groupKids(L).length}個）`;
  if(L.type === 'fx') return FX_NAMES[L.kind] || 'エフェクト';
  if(L.type === 'collage') return `分割フレーム（${collageN(L)}分割）`;
  return L.name || '画像';
}
/* 保存データ（localStorage・プロジェクトJSON・取り消し履歴）を、いまの DOC の形に整えて返す。
   機能追加で増えたキーは既定値で埋め、範囲外の値は丸める。古い保存データを読んでも落ちないための唯一の入口なので、
   DOC にキーを足したら、ここで既定値が入るか（Object.assign のベースにあるか）を必ず確認すること。
   d が不正（null・layers なし）のときは、文字レイヤー1枚の新規ドキュメントを返す。 */
function normalizeDoc(d){
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
  // Object.assign は浅いコピーなので、入れ子のオブジェクト（bg・fin・guides と、bg の中の zb など）は個別に既定値と混ぜる。
  // こうしないと、古いデータに zb などが無いとき o.bg.zb.on が未定義参照で落ちる
  const base = DOC_BASE();
  o.bg = Object.assign(base.bg, d.bg || {});
  o.fin = Object.assign(FIN_BASE(), d.fin || {}); if(!FIN_LOOKS[o.fin.look]) o.fin.look = 'none';
  for(const k of ['zb', 'mb', 'mosaic', 'tint', 'shade', 'posterize', 'thresh', 'tilt', 'pat']) o.bg[k] = Object.assign(DOC_BASE().bg[k], (d.bg || {})[k] || {});
  o.guides = Object.assign(base.guides, d.guides || {});
  // ヘッダー画像の種類は、キャンバスの大きさがその規定サイズと同じときだけ有効（食い違う保存データは無効にする）
  const hs = HEADER_SPECS[d.hdr]; o.hdr = hs && hs.w === o.w && hs.h === o.h ? d.hdr : ''; if(!o.hdr) o.guides.safe = false;
  // 旧データ互換：背景効果の中心はもとはズームブラー専用（zb.cx/cy）だった。fcx/fcy が無い古いデータでは、そちらの値を引き継ぐ
  if(d.bg && d.bg.fcx == null && d.bg.zb && (d.bg.zb.cx !== 0.5 || d.bg.zb.cy !== 0.5) && d.bg.zb.cx != null){ o.bg.fcx = d.bg.zb.cx; o.bg.fcy = d.bg.zb.cy; }
  // レイヤーを type ごとに既定値と混ぜ直す。壊れた要素と、未対応の fx 種別（バージョン違いの保存データ）は捨てる。
  // 画像は crop / key / strokes などを専用の正規化関数で丸める。frame の旧形式（zoom・ox・oy）は fs（大きさ）へ変換して捨てる
  o.layers = d.layers.filter(L => L && typeof L === 'object').filter(L => L.type !== 'fx' || hasKey(FX_DEF, L.kind)).map(L => L.type === 'text'
    ? Object.assign(LAYER_BASE(), L, {style: merged(L.style || {})})
    : L.type === 'collage' ? (b => Object.assign(b, L, {fx: mergeCellFx(L.fx), shadow: Object.assign(b.shadow, L.shadow || {}), wk: Object.assign(b.wk, L.wk || {}), tstyle: L.tstyle ? merged(L.tstyle) : null,
        cells: b.cells.map((c, i) => { const s = (L.cells || [])[i] || {}; return Object.assign(c, s, {fx: mergeCellFx(s.fx), bg: Object.assign(c.bg, s.bg || {}), tx: Object.assign(c.tx, s.tx || {})}); })}))(COLLAGE_BASE())
    : L.type === 'group' ? (b => Object.assign(b, L, {fxMode:'all', fx: mergeCellFx(L.fx), shadow: Object.assign(b.shadow, L.shadow || {})}))(Object.assign(LAYER_BASE(), GROUP_BASE()))
    : L.type === 'fx' ? Object.assign(LAYER_BASE(), L, {p:Object.assign(FX_DEF[L.kind](), L.p || {})})
    : Object.assign(LAYER_BASE(), IMAGE_BASE(), L, {
        fx: (x => { x.duo1 = safeColor(x.duo1, '#1b1464'); x.duo2 = safeColor(x.duo2, '#ff9d5c'); x.tint.c = safeColor(x.tint.c, '#ff7a50'); return x; })(mergeCellFx(L.fx)),
        outline: Object.assign(IMAGE_BASE().outline, L.outline || {}), crop: cropClamp(L.crop), key: keyNormalize(L.key), strokes: strokesNormalize(L.strokes),
        btool: ['erase', 'restore', 'pick'].includes(L.btool) ? L.btool : 'erase', bsz: clamp(+L.bsz || 60, 4, 600),
        frame: (fr => { const o = Object.assign(FRAME_BASE(), fr); if(fr.fs == null && fr.zoom) o.fs = Math.max(0.1, 1 / fr.zoom); delete o.zoom; delete o.ox; delete o.oy; return o; })(L.frame || {}),
        shadow: Object.assign(IMAGE_BASE().shadow, L.shadow || {}), glow: Object.assign(IMAGE_BASE().glow, L.glow || {})}));
  // セキュリティ：id・画像の参照は HTML 属性や querySelector に入るので、安全な文字だけにそろえる（細工されたプロジェクトファイル対策）。
  // 使えない id は作り直し、そのレイヤーを指す gid も同じ新しい id に付け替える
  const idMap = {};
  o.layers.forEach(l => { if(!okId(l.id)){ const n = uid(); idMap[l.id] = n; l.id = n; } });
  o.layers.forEach(l => { if(l.gid != null){ l.gid = idMap[l.gid] || l.gid; if(!okId(l.gid)) delete l.gid; } });
  o.layers.forEach(l => { if(l.asset != null && !okId(l.asset)) l.asset = null; if(l.cells) l.cells.forEach(c => { if(c.asset != null && !okId(c.asset)) c.asset = null; }); });
  if(o.bg.asset != null && !okId(o.bg.asset)) o.bg.asset = null;
  // 色：不正な文字列だと、HTML 属性を壊すだけでなく addColorStop が例外を出して描画が止まるので、読み込み時に使える色へそろえる
  o.layers.forEach(l => {
    if(l.cells) l.cells.forEach(c => { c.bg.c = safeColor(c.bg.c, '#ffffff'); c.bg.c2 = safeColor(c.bg.c2, '#ffd9e8'); });
    if(l.type === 'fx' && l.p) l.p.c = safeColor(l.p.c, '#ffffff');
  });
  // グループ：存在しないグループを指す gid を外し、中身のないグループを消す。複数選択は保存しない
  const gids = new Set(o.layers.filter(l => l.type === 'group').map(l => l.id));
  o.layers.forEach(l => { if(l.gid && (!gids.has(l.gid) || l.type === 'group')) delete l.gid; if(!l.gid) delete l.gid; });
  o.layers = o.layers.filter(l => l.type !== 'group' || o.layers.some(k => k.gid === l.id));
  o.msel = [];
  // 旧データ互換：以前の「背景の集中線」(bg.lines) を動的エフェクトのレイヤーに移す。
  // unshift で最背面に入れるのは、旧仕様では集中線が背景の直上（他のレイヤーより奥）に描かれていたため。中心は fcx/fcy（比率）を px に直す
  const oldLines = (d.bg || {}).lines; delete o.bg.lines;
  if(oldLines && oldLines.on){ const l = oldLines; o.layers.unshift(mkFx('lines', {c:l.c, n:l.n, inner:l.inner, w:l.w ?? 1, len:l.len ?? 1, seed:l.seed}, {op:l.a, x:(o.bg.fcx ?? 0.5) * o.w, y:(o.bg.fcy ?? 0.5) * o.h})); }
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

/* ---------- ドキュメント操作 ---------- */
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
  renderCells(); renderCellText();
  refreshSizeUI();
}

