/* 楽ちんサムネメーカー：分割フレーム（複数の画像を2〜8分割で並べる）① データの形・マスの効果・分割のしかたの一覧
   1つの分割フレーム＝DOC.layers の1枚のレイヤー（type:'collage'）。L.cells[0..7] にマスごとの画像・背景色・文字・効果を持ち、
   使うのは先頭 collageN(L) 個だけ（n を減らしても残りのマスのデータは捨てずに残す）。
   分割フレームは 4 つのファイルに分かれていて、index.html でこの順に続けて読み込む（読み込み順を変えないこと）：
     collage.js（このファイル）… CELL_FX_BASE・mergeCellFx・cellFxOn（マスの効果。group.js・画像レイヤーとも共通）／CELL_BASE・COLLAGE_BASE（データの形）／
                                 COLLAGE_LAYOUTS・COLLAGE_EDGES・COLLAGE_BSTYLES（選択肢）／collageN・collageLayoutOk／applyCellFx
     collage-draw.js  … 分割の計算（collageCells）・境界の形（collageShape）・マスの画像と文字の描画・drawCollage（group.js の drawOne から呼ばれる）
     collage-cells.js … 位置→マス（collageCellAt・collageCellSize）・マスの文字のスタイル・1週間の自動入力・画像の割り当て（collageTakeFiles・collageSetCell）・入れ替え
     collage-panel.js … 操作パネル（renderCells・renderCellText）・パネルのイベント登録（document への addEventListener）・レイアウトのアイコン（collageIcon）
   座標系：マスの多角形は W×H（描画先キャンバスのピクセル）。レイヤー自体の位置・大きさはドキュメント座標（L.bw×L.bh を L.sc 倍）。 */
/* マスの画像にかける効果（色調・ぼかし・ズーム／モーションブラー・モザイク・暗く・周辺減光・色を重ねる・シルエット） */
const CELL_FX_BASE = () => ({bright:0, contrast:0, sat:0, hue:0, blur:0, tone:'none', duo1:'#1b1464', duo2:'#ff9d5c',
  zb:{on:false, amt:0.25}, mb:{on:false, dist:120, angle:0}, mosaic:{on:false, size:28}, dim:0, vignette:0, tint:{on:false, c:'#ff7a50', a:0.35, mode:'overlay'},
  sil:{on:false, c:'#111111', a:1}});   // sil＝シルエット：絵のある部分を c で塗る（a＝濃さ。1 で完全に 1 色、下げると元の絵が透ける）
// 保存データの効果を既定値と合わせる（入れ子の項目も）
// 効果の項目が増えた後でも古い保存データが壊れないよう、必ず CELL_FX_BASE にマージして使う（zb・mb などは1段だけ深くマージ）
function mergeCellFx(o){
  const b = CELL_FX_BASE(); o = o || {};
  for(const k in b) if(o[k] != null) b[k] = b[k] && typeof b[k] === 'object' ? Object.assign(b[k], o[k]) : o[k];
  b.sil.c = safeColor(b.sil.c, '#111111');   // シルエットの色は fillStyle にそのまま入るので、使える色の文字列にそろえる
  return b;
}
// 何か1つでも効果が有効か。無効なら別キャンバスを作らず直接描ける（描画の軽量化に使う）
const cellFxOn = x => !!x && (x.bright || x.contrast || x.sat || x.hue || x.blur > 0 || x.tone !== 'none' || x.zb.on || x.mb.on || x.mosaic.on || x.dim > 0 || x.vignette > 0 || x.tint.on || !!(x.sil && x.sil.on));
// マス i にかかる効果（「全部のマス」なら共通の効果、「マスごと」ならそのマスの効果）
/** @param {Layer} L */
const collageFx = (L, i) => L.fxMode === 'cell' ? (L.cells[i] || {}).fx : L.fx;
const CELL_FX_CHIPS = [['vivid', '鮮やか'], ['soft', 'ふんわり'], ['mono', 'モノクロ'], ['retro', 'レトロ'], ['duo', 'デュオトーン'], ['red', 'モノクロ＋赤'],
  ['dark', '暗く'], ['focus', '集中'], ['speed', '疾走'], ['mosaic', 'モザイク'], ['reset', 'なし']];
const CELL_FX_PRESETS = {
  reset:{}, vivid:{sat:0.45, contrast:0.18}, soft:{blur:6, bright:0.05, vignette:0.3}, mono:{tone:'mono', contrast:0.25, vignette:0.4},
  retro:{tone:'sepia', contrast:0.08, vignette:0.55}, duo:{tone:'duotone', contrast:0.1}, red:{tone:'mono', contrast:0.2, tint:{on:true, c:'#ff2d2d', a:0.45, mode:'multiply'}},
  dark:{dim:0.45, vignette:0.4}, focus:{zb:{on:true, amt:0.25}, contrast:0.1, vignette:0.45}, speed:{mb:{on:true, dist:120, angle:0}, contrast:0.1}, mosaic:{mosaic:{on:true, size:28}},
};
// マスの背景色と文字（画像の代わり、または画像の上に重ねる）
const CELL_BASE = () => ({asset:null, zoom:1, ox:0, oy:0, rot:0, flip:false, flipV:false, fx:CELL_FX_BASE(),
  bg:{on:false, c:'#ffffff', c2:'#ffd9e8', grad:false}, tx:{on:false, text:'', pos:'c', sc:1, ox:0, oy:0, fcOn:false, fc:'#ffffff', ecOn:false, ec:'#1f1b2d', wk:false},
  w:1});
// w＝マスの幅の比率（「縦に並べる」「横に並べる」だけで使う。全部同じなら等分）。tx の fcOn・fc／ecOn・ec＝このマスだけ文字の色・フチの色を変える。
// tx.wk＝「1週間を入れる」が書いた文字の目印（MEMO の位置を変えて入れ直すとき、日付を書いたマスは上書きしてよい）
// マスの幅の比率を変えられる配置（縦に並べる・横に並べる）。境界線のドラッグ・つまみの表示・説明の帯で共通（設定パネルの表示条件は inspector.js の show に同じ並びで書く）
const collageResizable = lay => lay === 'cols' || lay === 'rows';
// マスの幅の比率。保存データの不正な値（文字・負の数・極端な値）は 0.05〜20 に収める
const cellW = c => clamp(+(c && c.w) || 1, 0.05, 20);
// bw/bh は作った時点のドキュメントの大きさ（以後 DOC のサイズ変更とは独立。表示の大きさは bw/bh × sc）。DOC が未初期化のときは 1920×1080
// cells は常に8個ぶん確保（n を増減しても画像を失わない）。ac は操作パネルで選択中のマス
function COLLAGE_BASE(){
  return Object.assign(LAYER_BASE(), {type:'collage',
    bw:(typeof DOC === 'object' && DOC ? DOC.w : 1920), bh:(typeof DOC === 'object' && DOC ? DOC.h : 1080), n:2, layout:'cols', slant:0, main:0.55, edge:'straight', amp:24, bstyle:'line', lw:10, lc:'#ffffff',
    outer:false, radius:0, ac:0, fxMode:'all', fx:CELL_FX_BASE(), shadow:{on:false, blur:30, y:10, a:0.5},
    tstyle:null, tpre:'', wk:{start:'', first:'mon', show:'both', fmt:'ja1', paren:'half', layout:'side', color:true, memo:8},
    ttx:{sc:1, ox:0, oy:0},   // 全部のマスの文字にまとめて上乗せする大きさ（倍率）・左右・上下（マスの幅・高さに対する割合）
    cells:[...Array(8)].map(() => CELL_BASE())});
}
// 効果の対象を「マスごと」に切り替えたら、まだ効果のないマスには今の共通の効果を写す
/** @param {Layer} L */
function collageFxModeChanged(L){ if(L.fxMode === 'cell') L.cells.forEach(c => { if(!cellFxOn(c.fx)) c.fx = mergeCellFx(JSON.parse(JSON.stringify(L.fx))); }); }
function applyCellFx(name){
  const L = selLayer(); if(!L || (L.type !== 'collage' && L.type !== 'group' && L.type !== 'image')) return;
  const fx = mergeCellFx(JSON.parse(JSON.stringify(CELL_FX_PRESETS[name] || {})));
  // 画像レイヤーの明度・彩度は L.bright / L.sat に持つので、プリセットの値はそちらへ移す
  if(L.type === 'image'){ L.bright = fx.bright; L.sat = fx.sat; fx.bright = 0; fx.sat = 0; L.fx = fx; syncDoc(); docChanged(false); return; }
  if(L.fxMode === 'cell') L.cells[L.ac || 0].fx = fx; else L.fx = fx;
  syncDoc(); docChanged(false);
}
// レイアウト：[キー, 表示名, 使える分割数の条件]。キーは L.layout に保存される。条件外の組み合わせは collageLayoutOk で 'cols' に戻して描く
/** @type {Array<[string, string, (n: number) => boolean]>} */
const COLLAGE_LAYOUTS = [
  ['cols', '縦に並べる', n => n >= 2], ['rows', '横に並べる', n => n >= 2], ['grid', 'グリッド', n => n === 4 || n === 6 || n === 8], ['grid2', 'グリッド（縦長）', n => n === 6 || n === 8],
  ['bigL', '左に大きく', n => n >= 3], ['bigT', '上に大きく', n => n >= 3], ['bigR', '右に大きく', n => n >= 3], ['bigB', '下に大きく', n => n >= 3], ['radial', '放射状', n => n >= 2],
  // 1週間の予定表向け：2段に分けて、上から順に数える（7分割なら「月〜日」を上段・下段に並べられる）
  ['wk43', '上4・下3（月〜木／金〜日）', n => n === 7], ['wk34', '上3・下4', n => n === 7], ['wk52', '上5・下2（平日／土日）', n => n === 7], ['wk25', '上2・下5', n => n === 7],
  ['wk53', '上5・下3', n => n === 8], ['wk35', '上3・下5', n => n === 8],
];
// 2段レイアウトの [上段のマス数, 下段のマス数]
const COLLAGE_ROWS2 = {wk43:[4, 3], wk34:[3, 4], wk52:[5, 2], wk25:[2, 5], wk53:[5, 3], wk35:[3, 5]};
const COLLAGE_EDGES = [['straight', 'まっすぐ'], ['zigzag', 'ギザギザ'], ['wave', '波'], ['rough', 'ラフ']];
const COLLAGE_BSTYLES = [['line', '線'], ['none', 'なし（ぴったり）'], ['gap', 'すき間（背景が見える）'], ['glow', '光る線'], ['blur', 'ぼかしてつなげる'], ['shadow', '影で重ねる']];
/** @param {Layer} L */
// n は数値だが、古い・手で書き換えた保存データでは文字列のこともあるので parseInt で受ける
const collageN = L => clamp(parseInt(/** @type {any} */ (L.n)) || 2, 2, 8);
const collageLayoutOk = (lay, n) => { const d = COLLAGE_LAYOUTS.find(l => l[0] === lay); return !!d && d[2](n); };
