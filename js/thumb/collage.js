/* 楽ちんサムネメーカー：分割フレーム（複数の画像を2〜8分割で並べる）
   1つの分割フレーム＝DOC.layers の1枚のレイヤー（type:'collage'）。L.cells[0..7] にマスごとの画像・背景色・文字・効果を持ち、
   使うのは先頭 collageN(L) 個だけ（n を減らしても残りのマスのデータは捨てずに残す）。
   主な公開関数：drawCollage（描画。group.js の drawOne から呼ばれる）／collageCells（分割→多角形）／collageShape（境界の形）／collageCanvas（1枚に描く）／
     collageCellAt・collageCellSize（座標・大きさの問い合わせ。UI／ドラッグ側から）／collageTakeFiles・collageSetCell（画像の割り当て）／renderCells・renderCellText（操作パネル）
   効果まわり（CELL_FX_BASE・mergeCellFx・cellFxOn）は group.js のグループの効果とも共通。toneFilter・postFx は fx 共通側。
   座標系：マスの多角形は W×H（描画先キャンバスのピクセル）。レイヤー自体の位置・大きさはドキュメント座標（L.bw×L.bh を L.sc 倍）。
   依存：ASSETS・render（text-render.js）・PRESETS・fontKey・ensureFont など。このファイルの末尾に、操作パネルのイベント登録（document への addEventListener）がある。 */
/* マスの画像にかける効果（色調・ぼかし・ズーム／モーションブラー・モザイク・暗く・周辺減光・色を重ねる） */
const CELL_FX_BASE = () => ({bright:0, contrast:0, sat:0, hue:0, blur:0, tone:'none', duo1:'#1b1464', duo2:'#ff9d5c',
  zb:{on:false, amt:0.25}, mb:{on:false, dist:120, angle:0}, mosaic:{on:false, size:28}, dim:0, vignette:0, tint:{on:false, c:'#ff7a50', a:0.35, mode:'overlay'}});
// 保存データの効果を既定値と合わせる（入れ子の項目も）
// 効果の項目が増えた後でも古い保存データが壊れないよう、必ず CELL_FX_BASE にマージして使う（zb・mb などは1段だけ深くマージ）
function mergeCellFx(o){
  const b = CELL_FX_BASE(); o = o || {};
  for(const k in b) if(o[k] != null) b[k] = b[k] && typeof b[k] === 'object' ? Object.assign(b[k], o[k]) : o[k];
  return b;
}
// 何か1つでも効果が有効か。無効なら別キャンバスを作らず直接描ける（描画の軽量化に使う）
const cellFxOn = x => !!x && (x.bright || x.contrast || x.sat || x.hue || x.blur > 0 || x.tone !== 'none' || x.zb.on || x.mb.on || x.mosaic.on || x.dim > 0 || x.vignette > 0 || x.tint.on);
// マス i にかかる効果（「全部のマス」なら共通の効果、「マスごと」ならそのマスの効果）
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
  bg:{on:false, c:'#ffffff', c2:'#ffd9e8', grad:false}, tx:{on:false, text:'', pos:'c', sc:1, ox:0, oy:0}});
// bw/bh は作った時点のドキュメントの大きさ（以後 DOC のサイズ変更とは独立。表示の大きさは bw/bh × sc）。DOC が未初期化のときは 1920×1080
// cells は常に8個ぶん確保（n を増減しても画像を失わない）。ac は操作パネルで選択中のマス
function COLLAGE_BASE(){
  return Object.assign(LAYER_BASE(), {type:'collage',
    bw:(typeof DOC === 'object' && DOC ? DOC.w : 1920), bh:(typeof DOC === 'object' && DOC ? DOC.h : 1080), n:2, layout:'cols', slant:0, main:0.55, edge:'straight', amp:24, bstyle:'line', lw:10, lc:'#ffffff',
    outer:false, radius:0, ac:0, fxMode:'all', fx:CELL_FX_BASE(), shadow:{on:false, blur:30, y:10, a:0.5},
    tstyle:null, tpre:'', wk:{start:'', first:'mon', show:'both', fmt:'ja1', paren:'half', layout:'side', color:true},
    cells:[...Array(8)].map(() => CELL_BASE())});
}
// 効果の対象を「マスごと」に切り替えたら、まだ効果のないマスには今の共通の効果を写す
function collageFxModeChanged(L){ if(L.fxMode === 'cell') L.cells.forEach(c => { if(!cellFxOn(c.fx)) c.fx = mergeCellFx(JSON.parse(JSON.stringify(L.fx))); }); }
function applyCellFx(name){
  const L = selLayer(); if(!L || (L.type !== 'collage' && L.type !== 'group')) return;
  const fx = mergeCellFx(JSON.parse(JSON.stringify(CELL_FX_PRESETS[name] || {})));
  if(L.fxMode === 'cell') L.cells[L.ac || 0].fx = fx; else L.fx = fx;
  syncDoc(); docChanged(false);
}
// レイアウト：[キー, 表示名, 使える分割数の条件]。キーは L.layout に保存される。条件外の組み合わせは collageLayoutOk で 'cols' に戻して描く
const COLLAGE_LAYOUTS = [
  ['cols', '縦に並べる', n => n >= 2], ['rows', '横に並べる', n => n >= 2], ['grid', 'グリッド', n => n === 4 || n === 6 || n === 8], ['grid2', 'グリッド（縦長）', n => n === 6 || n === 8],
  ['bigL', '左に大きく', n => n >= 3], ['bigT', '上に大きく', n => n >= 3], ['radial', '放射状', n => n >= 2],
  // 1週間の予定表向け：2段に分けて、上から順に数える（7分割なら「月〜日」を上段・下段に並べられる）
  ['wk43', '上4・下3（月〜木／金〜日）', n => n === 7], ['wk34', '上3・下4', n => n === 7], ['wk52', '上5・下2（平日／土日）', n => n === 7], ['wk25', '上2・下5', n => n === 7],
  ['wk53', '上5・下3', n => n === 8], ['wk35', '上3・下5', n => n === 8],
];
// 2段レイアウトの [上段のマス数, 下段のマス数]
const COLLAGE_ROWS2 = {wk43:[4, 3], wk34:[3, 4], wk52:[5, 2], wk25:[2, 5], wk53:[5, 3], wk35:[3, 5]};
const COLLAGE_EDGES = [['straight', 'まっすぐ'], ['zigzag', 'ギザギザ'], ['wave', '波'], ['rough', 'ラフ']];
const COLLAGE_BSTYLES = [['line', '線'], ['none', 'なし（ぴったり）'], ['gap', 'すき間（背景が見える）'], ['glow', '光る線'], ['blur', 'ぼかしてつなげる'], ['shadow', '影で重ねる']];
const collageN = L => clamp(parseInt(L.n) || 2, 2, 8);
const collageLayoutOk = (lay, n) => { const d = COLLAGE_LAYOUTS.find(l => l[0] === lay); return !!d && d[2](n); };
// 書き出し中かどうか（外部から切り替える）。true の間は空のマスの「画像をドロップ」表示を描かない。キャッシュのキーにも含める（drawCollage）
let exporting = false;

/* 分割のしかた → マスの多角形（W×H のピクセル座標） */
// 戻り値：マスごとの頂点列の配列（マス番号の順。文字・画像の割り当て順と一致）。slant＝斜めの傾き（0〜）、main＝「大きく」系の大きいマスの幅の割合。
// 縦に並べる(cols)を基本形にして、横並び・縦長はその x/y を入れ替えて作る（swap。向きを保つため頂点順も反転）
function collageCells(lay, n, W, H, slant = 0, main = 0.55){
  if(!collageLayoutOk(lay, n)) lay = 'cols';
  const quadCols = (x0, x1, y0, y1, k, d) => { // x0..x1 を k 列に、上下で d ずらす
    const tops = [], bots = [];
    for(let i = 0; i <= k; i++){ const x = x0 + (x1 - x0) * i / k, e = i === 0 || i === k ? 0 : d; tops.push([x + e, y0]); bots.push([x - e, y1]); }
    return [...Array(k)].map((_, i) => [tops[i], tops[i + 1], bots[i + 1], bots[i]]);
  };
  const swap = cells => cells.map(p => p.map(([x, y]) => [y, x]).reverse());
  if(lay === 'cols') return quadCols(0, W, 0, H, n, slant * H * 0.5);
  if(lay === 'rows') return swap(quadCols(0, H, 0, W, n, slant * W * 0.5));
  if(COLLAGE_ROWS2[lay]){   // 上の段・下の段で、マスの数を変える（各段は幅を等分）
    const rows = COLLAGE_ROWS2[lay], out = [];
    rows.forEach((k, j) => out.push(...quadCols(0, W, H * j / 2, H * (j + 1) / 2, k, slant * H * 0.25)));
    return out;
  }
  if(lay === 'grid' || lay === 'grid2'){
    const c = lay === 'grid' ? (n === 4 ? 2 : n === 6 ? 3 : 4) : 2, r = n / c, out = [];
    for(let j = 0; j < r; j++) for(let i = 0; i < c; i++){ const x0 = W * i / c, x1 = W * (i + 1) / c, y0 = H * j / r, y1 = H * (j + 1) / r; out.push([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]); }
    return out;
  }
  if(lay === 'bigL' || lay === 'bigT'){
    // 左に大きい1マス＋右の列。右の残りが4マス以上なら2列に分けて並べる（上から順に番号）。bigT は W/H を入れ替えて作る
    const big = (W, H) => {
      const m = W * main, d = slant * H * 0.5, xl = y => m + d * (1 - 2 * y / H), k = n - 1, out = [[[0, 0], [xl(0), 0], [xl(H), H], [0, H]]];
      const colCells = (xa, xb, cnt) => { for(let j = 0; j < cnt; j++){ const y0 = H * j / cnt, y1 = H * (j + 1) / cnt; out.push([[xa(y0), y0], [xb(y0), y0], [xb(y1), y1], [xa(y1), y1]]); } };
      if(k <= 3) colCells(xl, () => W, k);
      else { const mid = y => (xl(y) + W) / 2; colCells(xl, mid, Math.ceil(k / 2)); colCells(mid, () => W, Math.floor(k / 2)); }
      return out;
    };
    return lay === 'bigL' ? big(W, H) : swap(big(H, W));
  }
  // 放射状：中心から扇形に分ける
  // 各扇は中心＋境界の光線が画面の縁に当たる点＋その間にある画面の角。角を含めないと、扇の間に隙間（欠け）ができる
  const cx = W / 2, cy = H / 2, a0 = -PI / 2 + slant * PI / 2;
  const ray = a => { const dx = Math.cos(a), dy = Math.sin(a); let t = Infinity;
    if(dx > 1e-9) t = Math.min(t, (W - cx) / dx); if(dx < -1e-9) t = Math.min(t, -cx / dx); if(dy > 1e-9) t = Math.min(t, (H - cy) / dy); if(dy < -1e-9) t = Math.min(t, -cy / dy);
    return [cx + dx * t, cy + dy * t]; };
  const corners = [[0, 0], [W, 0], [W, H], [0, H]].map(p => [p, Math.atan2(p[1] - cy, p[0] - cx)]);
  const norm = a => ((a % (2 * PI)) + 2 * PI) % (2 * PI);
  return [...Array(n)].map((_, i) => {
    const s = a0 + 2 * PI * i / n, span = 2 * PI / n;
    const mid = corners.map(([p, a]) => [p, norm(a - s)]).filter(([, r]) => r > 1e-6 && r < span - 1e-6).sort((u, v) => u[1] - v[1]).map(([p]) => p);
    return [[cx, cy], ray(s), ...mid, ray(s + span)];
  });
}

/* 境界の形（ギザギザ・波・ラフ）。となりのマスと同じ点になるよう、辺ごとに決まった形を作る */
// 戻り値：polys＝境界を加工したマスの頂点列、lines＝内側の境界線（線・光・すき間の描画に使う）。A＝ゆらぎの振幅（ピクセル）
// 隣り合うマスは同じ辺を共有するので、辺の両端の座標から作ったキー(key)で形をキャッシュし、向きだけ反転して使う。
// これで境界がぴったり重なる（キーは 0.5px 単位に丸める）。乱数の種も辺のキーから決めるので、再描画しても形が変わらない。
// 画像の外枠にあたる辺（onBox）は加工しない。taper で辺の両端は振幅を 0 に絞り、角でずれないようにする
function collageShape(cells, W, H, edge, A){
  const near = (a, b) => Math.abs(a - b) < 0.6;
  const onBox = (p, q) => (near(p[0], 0) && near(q[0], 0)) || (near(p[0], W) && near(q[0], W)) || (near(p[1], 0) && near(q[1], 0)) || (near(p[1], H) && near(q[1], H));
  const key = p => Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2);
  const hash = s => { let h = 2166136261; for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 100000 + 1; };
  const inner = new Map();
  const edgePts = (p, q) => {
    if(onBox(p, q) || Math.hypot(q[0] - p[0], q[1] - p[1]) < 1) return {pts:[p, q], inner:false};
    const rev = key(p) > key(q), [a, b] = rev ? [q, p] : [p, q], k = key(a) + '|' + key(b);
    let pts = inner.get(k);
    if(!pts){
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len, R = rng(hash(k));
      pts = [a];
      if(edge !== 'straight'){
        const m = edge === 'zigzag' ? Math.max(2, Math.round(len / (A * 1.3))) : edge === 'wave' ? Math.max(8, Math.round(len / (A * 0.7))) : Math.max(6, Math.round(len / (A * 0.45)));
        let walk = 0;
        for(let j = 1; j < m; j++){
          const t = j / m, taper = Math.min(1, t * 6, (1 - t) * 6);
          let s;
          if(edge === 'zigzag') s = (j % 2 ? 1 : -1) * A * (0.65 + R() * 0.7);
          else if(edge === 'wave') s = A * Math.sin(t * len / (A * 5.5) * 2 * PI);
          else { walk = walk * 0.55 + (R() - 0.5) * A * 1.6; s = walk + (R() - 0.5) * A * 0.5; }
          s *= taper; pts.push([a[0] + (b[0] - a[0]) * t + nx * s, a[1] + (b[1] - a[1]) * t + ny * s]);
        }
      }
      pts.push(b); inner.set(k, pts);
    }
    return {pts: rev ? pts.slice().reverse() : pts, inner:true};
  };
  const polys = cells.map(poly => { const out = []; poly.forEach((p, j) => { const {pts} = edgePts(p, poly[(j + 1) % poly.length]); out.push(...pts.slice(0, -1)); }); return out; });
  return {polys, lines:[...inner.values()]};
}

function collagePath(x, poly){ x.beginPath(); poly.forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py)); x.closePath(); }
// マスの画像（背景・文字・効果は別）を描く。poly の外接矩形をマスの範囲とし、画面外にはみ出す分は切る。
// showEmpty：画像のないマスにプレースホルダー（番号と「画像をドロップ」）を描くか。書き出し時は false
function collageCellPicture(x, L, i, poly, W, H, showEmpty){
  const cell = L.cells[i] || {}, A = ASSETS[cell.asset];
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  poly.forEach(([px, py]) => { bx0 = Math.min(bx0, px); by0 = Math.min(by0, py); bx1 = Math.max(bx1, px); by1 = Math.max(by1, py); });
  bx0 = Math.max(0, bx0); by0 = Math.max(0, by0); bx1 = Math.min(W, bx1); by1 = Math.min(H, by1);
  const cw = Math.max(1, bx1 - bx0), ch = Math.max(1, by1 - by0);
  if(!A){
    if(!showEmpty) return;
    x.fillStyle = i % 2 ? '#e4e0ef' : '#ece9f5'; x.fillRect(bx0, by0, cw, ch);
    x.strokeStyle = 'rgba(31,27,45,.08)'; x.lineWidth = Math.max(2, Math.min(cw, ch) * 0.02); x.beginPath();
    for(let t = -ch; t < cw; t += Math.max(12, Math.min(cw, ch) * 0.08)){ x.moveTo(bx0 + t, by1); x.lineTo(bx0 + t + ch, by0); } x.stroke();
    const fs = Math.max(10, Math.min(cw, ch) * 0.16);
    x.fillStyle = 'rgba(31,27,45,.45)'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `800 ${fs}px "M PLUS Rounded 1c", sans-serif`;
    x.fillText(String(i + 1), bx0 + cw / 2, by0 + ch / 2 - fs * 0.35);
    x.font = `700 ${fs * 0.34}px "M PLUS Rounded 1c", sans-serif`; x.fillText('画像をドロップ', bx0 + cw / 2, by0 + ch / 2 + fs * 0.55);
    return;
  }
  // 回転しても、マスに隙間ができない大きさを基準にする（k＝画像をマスの外接矩形に cover させる倍率に、回転ぶんの余裕を加えて zoom を掛けたもの）
  // 画像の位置 ox/oy はマスの幅・高さに対する割合（マスの大きさが変わっても同じ見え方になる）
  const ra = (cell.rot || 0) * PI / 180, rc = Math.abs(Math.cos(ra)), rs = Math.abs(Math.sin(ra));
  const iw = A.img.naturalWidth, ih = A.img.naturalHeight, k = Math.max((cw * rc + ch * rs) / iw, (cw * rs + ch * rc) / ih) * clamp(cell.zoom || 1, 0.2, 8);
  const dw = iw * k, dh = ih * k, cx = bx0 + cw / 2 + (cell.ox || 0) * cw, cy = by0 + ch / 2 + (cell.oy || 0) * ch;
  const fx = collageFx(L, i);
  if(!cellFxOn(fx)){ cellImg(x, A.img, cx, cy, dw, dh, cell); return; }
  // 効果あり：マスの範囲（ぼかし・ブラーのぶん少し広め）を別のキャンバスで作ってから置く
  // f＝ドキュメント座標→このキャンバスのピクセルの倍率（効果の量はドキュメント座標で持つため、描画先の大きさに合わせて換算する）。m＝余白(px)
  // 暗さ・色かぶり・ビネットは source-atop で、画像のある部分にだけかける（余白の透明部分を染めない）
  const f = W / (L.bw * L.sc), m = Math.ceil(fx.blur * f * 3 + (fx.mb.on ? fx.mb.dist * f / 2 : 0));
  const t = mk(Math.ceil(cw) + m * 2, Math.ceil(ch) + m * 2), tx = t.getContext('2d'), ox = m - bx0, oy = m - by0;
  tx.filter = toneFilter(fx, f); cellImg(tx, A.img, cx + ox, cy + oy, dw, dh, cell); tx.filter = 'none';
  const o = postFx(t, fx, f, bx0 + cw / 2 + ox, by0 + ch / 2 + oy), ox2 = o.getContext('2d');
  ox2.save(); ox2.globalCompositeOperation = 'source-atop';
  if(fx.dim > 0){ ox2.fillStyle = `rgba(0,0,0,${fx.dim})`; ox2.fillRect(0, 0, o.width, o.height); }
  if(fx.tint.on && fx.tint.a > 0){ ox2.globalCompositeOperation = fx.tint.mode; ox2.globalAlpha = fx.tint.a; ox2.fillStyle = fx.tint.c; ox2.fillRect(0, 0, o.width, o.height); ox2.globalAlpha = 1; ox2.globalCompositeOperation = 'source-atop'; }
  if(fx.vignette > 0){
    const vx = bx0 + cw / 2 + ox, vy = by0 + ch / 2 + oy, g = ox2.createRadialGradient(vx, vy, Math.min(cw, ch) * 0.3, vx, vy, Math.hypot(cw, ch) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${fx.vignette})`); ox2.fillStyle = g; ox2.fillRect(0, 0, o.width, o.height);
  }
  ox2.restore();
  x.drawImage(o, bx0 - m, by0 - m);
}
// 文字の描画：マスに収まる大きさに合わせて、文字スタイルでレンダリング（text-render.js の render）
// 文字スタイルは分割フレーム全体で1つ（L.tstyle。null なら既定の「ポップ」）。文字だけはマスごと
const cellHasText = c => !!(c && c.tx && c.tx.on && String(c.tx.text || '').trim());
function cellTextStyle(L, text){ return Object.assign({}, L.tstyle || collageDefaultStyle(), {text, pad:2}); }
function drawCellText(x, L, cell, bx0, by0, cw, ch){
  const t = cell.tx, st = cellTextStyle(L, String(t.text)), band = t.pos === 'c' ? 0.86 : 0.3;
  // まず 0.25 倍で試し描きして文字の大きさを測り、マスに収まる倍率 k を出してから本描画する（band＝文字が使える高さの割合。中央は大きく、上下寄せは帯状）。
  // sc（ユーザー調整）は 0.2〜3 倍、最終の k は 0.03〜8 に制限
  const c0 = render(0.25, st); if(c0.width <= 2) return;
  const k = clamp(Math.min(cw * 0.86 / (c0.width / 0.25), ch * band / (c0.height / 0.25)) * clamp(t.sc || 1, 0.2, 3), 0.03, 8);
  const c = render(k, st);
  const cx = bx0 + cw / 2 + (t.ox || 0) * cw, cy = (t.pos === 't' ? by0 + ch * 0.05 + c.height / 2 : t.pos === 'b' ? by0 + ch * 0.95 - c.height / 2 : by0 + ch / 2) + (t.oy || 0) * ch;
  x.drawImage(c, cx - c.width / 2, cy - c.height / 2);
}
// マス1つ分（背景色 → 画像 → 文字 の順）を描く。背景も文字も無ければ画像だけの軽い経路に任せる。
// 背景の fillRect を上下左右 1px 広げるのは、クリップ境界の隙間（アンチエイリアスの透け）を防ぐため
function collageCellImage(x, L, i, poly, W, H, showEmpty){
  const cell = L.cells[i] || {}, A = ASSETS[cell.asset], bg = cell.bg, hasBg = !!(bg && bg.on), hasTx = cellHasText(cell);
  if(!hasBg && !hasTx){ collageCellPicture(x, L, i, poly, W, H, showEmpty); return; }
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  poly.forEach(([px, py]) => { bx0 = Math.min(bx0, px); by0 = Math.min(by0, py); bx1 = Math.max(bx1, px); by1 = Math.max(by1, py); });
  bx0 = Math.max(0, bx0); by0 = Math.max(0, by0); bx1 = Math.min(W, bx1); by1 = Math.min(H, by1);
  const cw = Math.max(1, bx1 - bx0), ch = Math.max(1, by1 - by0);
  if(hasBg){
    if(bg.grad){ const g = x.createLinearGradient(0, by0, 0, by1); g.addColorStop(0, bg.c); g.addColorStop(1, bg.c2); x.fillStyle = g; } else x.fillStyle = bg.c;
    x.fillRect(bx0 - 1, by0 - 1, cw + 2, ch + 2);
  }
  if(A) collageCellPicture(x, L, i, poly, W, H, showEmpty);
  if(hasTx) drawCellText(x, L, cell, bx0, by0, cw, ch);
}
// 分割フレーム全体を W×H の1枚のキャンバスに描く（回転・位置・影・不透明度は drawCollage 側）。f＝ドキュメント座標→ピクセルの倍率、lay＝レイアウトの上書き
// 描く順序：全体を角丸でクリップ → 各マスを自分の多角形でクリップして描く → 境界線（bstyle ごと）→ 外枠。
// 境界の太さ lw・振幅 A は f 倍してピクセルにする。radius は s（キャンバス1pxあたりのドキュメント倍率）で換算
function collageCanvas(L, W, H, f, lay){
  const n = collageN(L), c = mk(W, H), x = c.getContext('2d'), s = W / L.bw; // s = キャンバス1px あたりのドキュメント倍率
  const cells = collageCells(lay || L.layout, n, W, H, L.slant, L.main), A = Math.max(2, (L.amp || 20) * f);
  const {polys, lines} = collageShape(cells, W, H, L.edge || 'straight', A);
  const lw = Math.max(0, (L.lw ?? 10) * f), st = L.bstyle || 'line', showEmpty = !exporting;
  const rad = Math.max(0, (L.radius || 0) * s);
  x.save(); x.beginPath(); x.roundRect(0, 0, W, H, Math.min(rad, Math.min(W, H) / 2)); x.clip();
  polys.forEach((p, i) => { x.save(); collagePath(x, p); x.clip(); collageCellImage(x, L, i, p, W, H, showEmpty); x.restore(); });
  const strokeLines = (w, col) => { x.lineWidth = w; x.strokeStyle = col; x.lineJoin = 'round'; x.lineCap = 'round'; x.beginPath(); lines.forEach(pts => pts.forEach(([px, py], j) => j ? x.lineTo(px, py) : x.moveTo(px, py))); x.stroke(); };
  // （すき間 gap は、境界線を destination-out で抜いて透明にする＝背後の背景が見える）
  // ぼかしてつなげる：マスごとに画像を描き、自分の多角形をぼかしたマスクで切り抜いて重ねる。
  // ext は外枠にあたる辺を画面の外へ伸ばす（そこまでぼかされて外枠が薄くならないように）
  if(st === 'blur' && lw > 0){
    const ext = p => p.map(([px, py]) => [px < 0.6 ? -lw * 4 : px > W - 0.6 ? W + lw * 4 : px, py < 0.6 ? -lw * 4 : py > H - 0.6 ? H + lw * 4 : py]);
    polys.forEach((p, i) => {
      const t = mk(W, H), tx = t.getContext('2d'); collageCellImage(tx, L, i, p, W, H, showEmpty);
      tx.globalCompositeOperation = 'destination-in'; tx.filter = `blur(${lw * 0.8}px)`; collagePath(tx, ext(p)); tx.fillStyle = '#000'; tx.fill(); tx.filter = 'none';
      x.drawImage(t, 0, 0);
    });
  }else if(st === 'shadow' && lw > 0){
    // 影で重ねる：2番目以降のマスを、影付きで上から重ねて描き直す（マス0は下地のまま。番号が大きいほど手前）
    polys.forEach((p, i) => {
      if(!i) return;
      const t = mk(W, H), tx = t.getContext('2d'); collagePath(tx, p); tx.clip(); collageCellImage(tx, L, i, p, W, H, showEmpty);
      x.save(); x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = lw * 1.2; x.shadowOffsetX = lw * 0.25; x.shadowOffsetY = lw * 0.25; x.drawImage(t, 0, 0); x.restore();
    });
  }else if(st === 'gap' && lw > 0){ x.globalCompositeOperation = 'destination-out'; strokeLines(lw, '#000'); x.globalCompositeOperation = 'source-over'; }
  else if(st === 'line' && lw > 0) strokeLines(lw, L.lc);
  else if(st === 'glow' && lw > 0){ x.save(); x.shadowColor = L.lc; x.shadowBlur = lw * 2.4; strokeLines(lw * 0.9, L.lc); strokeLines(lw * 0.9, L.lc); x.restore(); strokeLines(Math.max(1, lw * 0.3), '#ffffff'); }
  if(L.outer && lw > 0){ x.lineWidth = lw * 2; x.strokeStyle = L.lc; x.beginPath(); x.roundRect(0, 0, W, H, Math.min(rad, Math.min(W, H) / 2)); x.stroke(); }
  x.restore();
  return c;
}
// ctx に分割フレームを描く。実際の絵は collageCanvas で作ってレイヤーごとにキャッシュし、ここでは位置・回転・影・不透明度を付けて貼るだけ。
// dims（選択枠・グループ範囲用）は描画のたびに更新。f＝倍率、live＝操作中、cache＝レイヤー id → {sk, k, c}
function drawCollage(ctx, L, f, live, cache){
  const n = collageN(L), lay = collageLayoutOk(L.layout, n) ? L.layout : 'cols';
  const w = L.bw * L.sc, h = L.bh * L.sc, W = Math.max(2, Math.round(w * f)), H = Math.max(2, Math.round(h * f));
  dims.set(L.id, {w, h});
  const sk = JSON.stringify([L.bw, L.bh, n, lay, L.slant, L.main, L.edge, L.amp, L.bstyle, L.lw, L.lc, L.outer, L.radius, L.fxMode, L.fx, L.cells.slice(0, n), L.cells.slice(0, n).map(c => !!ASSETS[c.asset]), L.tstyle, L.tstyle && fontKey(Object.assign({}, L.tstyle, {text:collageAllText(L)})), exporting]);
  // sk：見た目が変わる設定すべての印（使っているマスだけ・画像の有無・文字フォントも含む）。同じならキャッシュを再利用する。
  // 操作中(live)はサイズが半分以上ずれない限り使い回す（拡大縮小ドラッグ中の再生成を避ける）。確定時はピクセルサイズが完全に一致するときだけ使う
  let e = cache.get(L.id);
  if(!(e && e.sk === sk && (live ? Math.abs(e.c.width - W) / W < 0.5 : e.c.width === W && e.c.height === H))){
    e = {sk, k: W / w, c: collageCanvas(L, W, H, f, lay)}; cache.set(L.id, e);
  }
  ctx.save(); ctx.globalAlpha = L.op ?? 1; ctx.globalCompositeOperation = L.blend || 'source-over';
  ctx.translate(L.x * f, L.y * f); ctx.rotate((L.rot || 0) * PI / 180);
  const sh = L.shadow; if(sh && sh.on && sh.a > 0){ ctx.shadowColor = `rgba(0,0,0,${sh.a})`; ctx.shadowBlur = sh.blur * f; ctx.shadowOffsetY = sh.y * f; }
  ctx.drawImage(e.c, -w * f / 2, -h * f / 2, w * f, h * f);
  ctx.restore();
}

/* キャンバス上の位置 → どのマスか */
// x, y はドキュメント座標。レイヤーの回転を逆に戻してレイヤー内の割合(u,v)にし、1000 幅の仮想キャンバスで多角形の内外判定をする。
// 戻り値はマス番号、どのマスでもなければ -1。境界の加工（ギザギザ等）は無視した、元の分割線で判定する
function collageCellAt(L, x, y){
  const a = -(L.rot || 0) * PI / 180, dx = x - L.x, dy = y - L.y;
  const w = L.bw * L.sc, h = L.bh * L.sc, u = (dx * Math.cos(a) - dy * Math.sin(a)) / w + 0.5, v = (dx * Math.sin(a) + dy * Math.cos(a)) / h + 0.5;
  if(u < 0 || u > 1 || v < 0 || v > 1) return -1;
  const cells = collageCells(L.layout, collageN(L), 1000, 1000 * h / w, L.slant, L.main), px = u * 1000, py = v * 1000 * h / w;
  const inside = poly => { let c = false; for(let i = 0, j = poly.length - 1; i < poly.length; j = i++){ const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c; } return c; };
  const i = cells.findIndex(inside); return i;
}
function collageCellSize(L, i){ // マスの大きさ（ドキュメント座標）
  const w = L.bw * L.sc, h = L.bh * L.sc, p = collageCells(L.layout, collageN(L), w, h, L.slant, L.main)[i] || [[0, 0], [w, h]];
  const xs = p.map(q => clamp(q[0], 0, w)), ys = p.map(q => clamp(q[1], 0, h));
  return [Math.max(1, Math.max(...xs) - Math.min(...xs)), Math.max(1, Math.max(...ys) - Math.min(...ys))];
}

/* マスの文字：スタイル・使う文字・フォント読み込み */
// フォント読み込みは、全マスの文字を連結した文字列で行う（使う字だけ読み込む方式のため。空なら 'あ' でフォント自体は読み込む）
const collageAllText = L => L.cells.map(c => c.tx && c.tx.text || '').join('') || 'あ';
function collageDefaultStyle(){ const p = PRESETS.find(q => q[0] === 'ポップ') || PRESETS[0]; return merged(p[1]); }
function collageSetStyle(L, name){
  const p = PRESETS.find(q => q[0] === name); if(!p) return;
  L.tpre = name; L.tstyle = merged(p[1]);
}
async function ensureCollageFonts(L){ if(L.type === 'collage' && !L.hidden && L.cells.some(cellHasText)) await ensureFont(Object.assign({}, L.tstyle || collageDefaultStyle(), {text: collageAllText(L)})); }

/* 1週間を自動で入れる：選んだ日を含む週を、週の始まり（月／日）から7日ぶん、上のマスから順に入れる */
const WK_JA = ['日', '月', '火', '水', '木', '金', '土'], WK_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const WK_BG = {wd:['#fff6dd', '#ffe9b8'], sat:['#d8ecff', '#a9d2ff'], sun:['#ffdbe3', '#ffb3c4']};
// startStr は 'YYYY-MM-DD'（形式が違う・空なら今日）。first は 'sun' なら日曜始まり、それ以外は月曜始まり。
// ローカル時間で日付だけを扱う（new Date('YYYY-MM-DD') は UTC 扱いで日がずれるので、年月日を分解して作る）
function weekDates(startStr, first){   // 戻り値：7日ぶんの Date
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startStr || ''), t = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(), d0 = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const back = first === 'sun' ? d0.getDay() : (d0.getDay() + 6) % 7;
  return [...Array(7)].map((_, i) => new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - back + i));
}
function weekLabel(d, wk){
  let w = wk.fmt === 'en' ? WK_EN[d.getDay()] : wk.fmt === 'ja3' ? WK_JA[d.getDay()] + '曜日' : WK_JA[d.getDay()];
  const dt = `${d.getMonth() + 1}/${d.getDate()}`;
  if(wk.paren === 'full') w = `（${w}）`; else if(wk.paren === 'half') w = `(${w})`;
  if(wk.show === 'date') return dt; if(wk.show === 'wd') return w;
  return wk.layout === 'side' ? dt + (wk.paren && wk.paren !== 'none' ? '' : ' ') + w : `${dt}\n${w}`;   // 日付の横（括弧があればくっつける）／日付の下
}
// 7日ぶんをマス0から順に入れる（マスが少なければそこまで）。画像のあるマスは文字を上寄せ('t')にして絵を隠さない。
// 8分割のときは最後のマスを「MEMO」にする（ただし文字が入っていれば上書きしない）
function collageFillWeek(L){
  const wk = L.wk, days = weekDates(wk.start, wk.first), n = collageN(L);
  if(!L.tstyle) collageSetStyle(L, 'ポップ');
  days.slice(0, n).forEach((d, i) => {
    const c = L.cells[i], k = d.getDay() === 6 ? 'sat' : d.getDay() === 0 ? 'sun' : 'wd';
    c.tx = Object.assign(c.tx, {on:true, text:weekLabel(d, wk), pos: ASSETS[c.asset] ? 't' : 'c', sc:1, ox:0, oy:0});
    if(wk.color) c.bg = Object.assign(c.bg, {on:true, c:WK_BG[k][0], c2:WK_BG[k][1], grad:true});
  });
  if(n >= 8 && !cellHasText(L.cells[7])) L.cells[7].tx = Object.assign(L.cells[7].tx, {on:true, text:'MEMO', pos:'c', sc:0.6});
}

/* 追加・画像の割り当て */
function addCollage(){
  const L = Object.assign(COLLAGE_BASE(), {id: uid()});
  DOC.layers.unshift(L); if(DOC.mode !== 'thumb') setMode('thumb');
  openInspector(); selectLayer(L.id); docChanged(false);
  toast('分割フレームを追加しました。マスに画像をドロップするか、左の「マスの画像」から選んでください');
}
// マスに画像を入れる。位置・大きさ・回転・反転は初期化し、背景・文字・効果は残す（古い保存データのマスに fx が無くても補う）
async function collageSetCell(L, i, file){
  const id = await addAsset(await fileToSrc(file), file.name);
  L.cells[i] = Object.assign({zoom:1, ox:0, oy:0, fx:CELL_FX_BASE()}, L.cells[i], {asset:id, zoom:1, ox:0, oy:0, rot:0, flip:false, flipV:false});
}
// ドロップ位置のマス、なければ選択中の分割フレームの空いているマスに順に入れる。残りを返す
async function collageTakeFiles(files, cx, cy){
  let rest = files.slice();
  if(DOC.mode === 'thumb' && cx != null){
    const r = $('#tv').getBoundingClientRect();
    if(cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom){
      const x = (cx - r.left) / r.width * DOC.w, y = (cy - r.top) / r.height * DOC.h;
      // ドロップでマスに入れるのは、いま選んでいる分割フレームの上に落としたときだけ（それ以外は、ふつうに画像レイヤーとして追加）
      const L = [selLayer()].find(l => l && l.type === 'collage' && !l.hidden && collageCellAt(l, x, y) >= 0);
      if(L){
        let i = collageCellAt(L, x, y); const n = collageN(L);
        while(rest.length && i < n){ await collageSetCell(L, i, rest.shift()); L.ac = i; i++; while(i < n && ASSETS[L.cells[i].asset]) i++; }
        selectLayer(L.id); docChanged(false); toast('分割フレームのマスに画像を入れました');
        return rest;
      }
    }
  }
  const C = cx == null ? selLayer() : null;   // ドロップのときは、ここでは入れない（選んでいても、落とした位置がマスの外なら画像レイヤーにする）
  if(C && C.type === 'collage'){
    const n = collageN(C); let filled = 0;
    for(let i = 0; i < n && rest.length; i++) if(!ASSETS[C.cells[i].asset]){ await collageSetCell(C, i, rest.shift()); C.ac = i; filled++; }
    if(filled){ docChanged(false); toast(`分割フレームの空いているマスに ${filled} 枚入れました`); }
  }
  return rest;
}

// マスの中の画像を、回転・反転して描く
function cellImg(x, img, cx, cy, dw, dh, cell){
  if(!cell.rot && !cell.flip && !cell.flipV){ x.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh); return; }
  x.save(); x.translate(cx, cy); x.rotate((cell.rot || 0) * PI / 180); x.scale(cell.flip ? -1 : 1, cell.flipV ? -1 : 1); x.drawImage(img, -dw / 2, -dh / 2, dw, dh); x.restore();
}
// マスの画像を入れ替える（画像・位置・大きさ・回転・反転。効果はマスに残す）
// 入れ替えるのは画像に付随する項目だけ（背景色・文字・効果は「マスの場所」に属するので動かさない）
const CELL_IMG_KEYS = ['asset', 'zoom', 'ox', 'oy', 'rot', 'flip', 'flipV'];
function swapCells(L, i, j){
  if(i === j || i < 0 || j < 0) return;
  const a = L.cells[i], b = L.cells[j];
  for(const k of CELL_IMG_KEYS){ const t = a[k]; a[k] = b[k]; b[k] = t; }
  L.ac = j;
}
function resetCell(L, i){ Object.assign(L.cells[i], {zoom:1, ox:0, oy:0, rot:0, flip:false, flipV:false}); }
/* マスの一覧（操作パネル） */
function renderCells(){
  const L = selLayer(); if(!L || L.type !== 'collage') return;
  const n = collageN(L); L.ac = clamp(L.ac || 0, 0, n - 1);
  // key：一覧の見た目が変わる要素（選択マス・画像・背景色・文字の先頭3字）だけの印。同じなら innerHTML の作り直しを省く（再描画のたびに作り直すと、ドラッグ中のボタンが消えて操作が途切れるため）
  const key = [L.id, n, L.ac, ...L.cells.slice(0, n).map(c => (ASSETS[c.asset] ? c.asset : '') + (c.bg.on ? c.bg.c : '') + (cellHasText(c) ? c.tx.text.slice(0, 3) : ''))].join('|');
  document.querySelectorAll('.cellBox').forEach(box => {
  if(box.dataset.key === key) return; box.dataset.key = key;
  box.innerHTML = `<div class="cellgrid">${[...Array(n)].map((_, i) => { const A = ASSETS[L.cells[i].asset];
    const c = L.cells[i], bgs = c.bg.on ? ` style="background:${c.bg.grad ? `linear-gradient(${safeColor(c.bg.c)},${safeColor(c.bg.c2)})` : safeColor(c.bg.c)}"` : '';
    return `<button class="cellbtn${i === L.ac ? ' on' : ''}" data-cell="${i}" draggable="${A ? 'true' : 'false'}"${bgs} title="マス${i + 1}（ドラッグで別のマスと入れ替え）">${A ? `<img src="${A.thumb}" alt="" draggable="false">` : `<span>${cellHasText(c) ? escapeHtml(c.tx.text.split('\n')[0].slice(0, 5)) : i + 1}</span>`}<em>${i + 1}</em></button>`; }).join('')}</div>
    <div class="crow" style="margin-top:8px"><button class="btn sm" data-cellact="pick">${ic('image')}マス${L.ac + 1}に画像を入れる</button>${ASSETS[L.cells[L.ac].asset] ? `<button class="btn sm ghost" data-cellact="clear">${ic('trash')}外す</button>` : ''}</div>${ASSETS[L.cells[L.ac].asset] ? `<div class="crow"><button class="btn sm ghost" data-cellact="flip">${ic('fliph')}左右反転</button><button class="btn sm ghost" data-cellact="flipV">${ic('flipv')}上下反転</button><button class="btn sm ghost" data-cellact="reset">${ic('reset')}位置・大きさを元に戻す</button></div>` : ''}`;
  });
}
/* 「背景色・文字」タブ：文字の入力・文字スタイル・1週間の自動入力 */
function renderCellText(){
  const L = selLayer(); if(!L || L.type !== 'collage') return;
  L.ac = clamp(L.ac || 0, 0, collageN(L) - 1);
  const c = L.cells[L.ac], today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const opts = (arr, v) => arr.map(([k, t]) => `<option value="${k}"${k === v ? ' selected' : ''}>${t}</option>`).join('');
  document.querySelectorAll('.ctBox').forEach(box => {
    // 入力欄は別レイヤーに切り替わったときだけ作り直す（入力中のフォーカスや選択を壊さないため）。以降の値の反映は、編集中の欄(activeElement)を避けて行う
    if(box.dataset.lid !== L.id){
      box.dataset.lid = L.id;
      box.innerHTML = `<div class="row"><label>文字（改行できます）</label><textarea id="ctText" rows="2" placeholder="例：10/5 月"></textarea></div>
        <div class="row"><label>フォント</label><select id="ctFont"></select></div>
        <div class="row"><label>太さ</label><select id="ctWeight"></select></div>
        <div class="row"><label>文字スタイル</label><select id="ctPre"><option value="">標準（ポップ）</option>${Object.entries(PCATS).map(([g, ns]) => `<optgroup label="${g}">${ns.map(n => `<option value="${n}">${n}</option>`).join('')}</optgroup>`).join('')}</select></div>`;
    }
    const ta = box.querySelector('#ctText'); if(document.activeElement !== ta) ta.value = c.tx.text || '';
    ta.dataset.cell = L.ac; box.querySelector('#ctPre').value = L.tpre || '';
    const st = L.tstyle || collageDefaultStyle(), fs = box.querySelector('#ctFont'), wsel = box.querySelector('#ctWeight');
    if(fs.dataset.built !== '1'){   // フォント一覧（欧文と、ふだん出さない書体を除く）。お気に入りを先頭に
      const ok = f => f.cat !== '欧文' && (!f.more || favs.has(f.family) || f.family === st.font), grp = {};
      fonts.filter(ok).forEach(f => (grp[favs.has(f.family) ? 'お気に入り' : f.cat] = grp[favs.has(f.family) ? 'お気に入り' : f.cat] || []).push(f));
      const keys = Object.keys(grp).sort((a, b) => (a === 'お気に入り' ? -1 : b === 'お気に入り' ? 1 : 0));
      fs.innerHTML = keys.map(g => `<optgroup label="${escapeHtml(g)}">${grp[g].map(f => `<option value="${escapeHtml(f.family)}">${escapeHtml(f.family)}</option>`).join('')}</optgroup>`).join(''); fs.dataset.built = '1';
    }
    if(![...fs.options].some(o => o.value === st.font)) fs.insertAdjacentHTML('afterbegin', `<option value="${escapeHtml(st.font)}">${escapeHtml(st.font)}</option>`);
    fs.value = st.font;
    if(wsel.dataset.f !== st.font){ wsel.dataset.f = st.font; wsel.innerHTML = weightsOf(findFont(st.font)).map(w => `<option value="${w}">${w}</option>`).join(''); }
    wsel.value = String(st.weight);
    if(wsel.value !== String(st.weight)){ const ws = [...wsel.options].map(o => +o.value); wsel.value = String(ws.reduce((a, b) => Math.abs(b - st.weight) < Math.abs(a - st.weight) ? b : a, ws[0])); }
  });
  document.querySelectorAll('.wkBox').forEach(box => {
    if(box.dataset.lid !== L.id){
      box.dataset.lid = L.id;
      box.innerHTML = `<div class="row"><label>この日を含む週</label><input type="date" id="wkStart" data-wk="start"></div>
        <div class="row"><label>週の始まり</label><select data-wk="first">${opts([['mon', '月曜日'], ['sun', '日曜日']], L.wk.first)}</select></div>
        <div class="row"><label>表示</label><select data-wk="show">${opts([['both', '日付＋曜日'], ['date', '日付だけ'], ['wd', '曜日だけ']], L.wk.show)}</select></div>
        <div class="row"><label>曜日の位置</label><select data-wk="layout">${opts([['below', '日付の下'], ['side', '日付の横']], L.wk.layout)}</select></div>
        <div class="row"><label>曜日の括弧</label><select data-wk="paren">${opts([['none', 'なし'], ['full', '（月）全角'], ['half', '(月) 半角']], L.wk.paren)}</select></div>
        <div class="row"><label>曜日の書き方</label><select data-wk="fmt">${opts([['ja1', '月'], ['ja3', '月曜日'], ['en', 'MON']], L.wk.fmt)}</select></div>
        <div class="row"><label class="chk"><input type="checkbox" data-wk="color"> 平日・土・日で背景色を分ける</label></div>
        <div class="crow"><button class="btn sm" id="wkGo">${ic('grid')}1週間を入れる</button></div>`;
    }
    const st = box.querySelector('#wkStart'); if(document.activeElement !== st) st.value = L.wk.start || today;
    box.querySelector('[data-wk="color"]').checked = !!L.wk.color;
  });
}
/* ---------- 操作パネルのイベント（document に委譲。パネルは再描画されるので、要素ごとには付けない） ---------- */
document.addEventListener('input', e => {
  const t = e.target, L = selLayer(); if(!L || L.type !== 'collage' || !t.closest) return;
  if(t.id === 'ctText'){ const c = L.cells[L.ac || 0]; c.tx.text = t.value; c.tx.on = t.value.trim() !== ''; syncDoc(); docChanged(false); }
});
document.addEventListener('change', e => {
  const t = e.target, L = selLayer(); if(!L || L.type !== 'collage' || !t.closest) return;
  if(t.id === 'ctPre'){ if(t.value) collageSetStyle(L, t.value); else { L.tpre = ''; L.tstyle = null; } syncDoc(); docChanged(false); }
  else if(t.id === 'ctFont' || t.id === 'ctWeight'){
    if(!L.tstyle) L.tstyle = collageDefaultStyle();
    if(t.id === 'ctFont'){
      L.tstyle.font = t.value; const f = findFont(t.value), ws = weightsOf(f), w0 = L.tstyle.weight;
      L.tstyle.weight = ws.reduce((a, b) => Math.abs(b - w0) < Math.abs(a - w0) ? b : a, ws[0]);   // 選んだフォントにある、いちばん近い太さに
      if(f && f.mb > 1 && !cssState.has(f.family)) toast(`「${f.family}」を読み込んでいます（約${f.mb}MB・初回のみ）`);
    } else L.tstyle.weight = +t.value;
    syncDoc(); docChanged(false);
  }
  else if(t.dataset && t.dataset.wk){ L.wk[t.dataset.wk] = t.type === 'checkbox' ? t.checked : t.value; }
});
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('#wkGo'), L = selLayer(); if(!b || !L || L.type !== 'collage') return;
  const st = b.closest('.wkBox').querySelector('#wkStart'); if(st && st.value) L.wk.start = st.value;
  collageFillWeek(L); syncDoc(); docChanged(false); toast('1週間を入れました。マスをクリックして、文字や色を直せます');
});
document.addEventListener('click', e => { const b = e.target.closest('[data-cfx]'); if(b) applyCellFx(b.dataset.cfx); });
// 一覧のマスをドラッグして、別のマスに落とすと入れ替え
// dragover／drop はキャプチャ段階で受けて stopPropagation する（ファイルのドロップで画像を追加する側の処理に渡さないため）。cellDragFrom<0 のときは何もしない
let cellDragFrom = -1;
document.addEventListener('dragstart', e => { const b = e.target.closest && e.target.closest('.cellbtn[data-cell]'); if(!b) return; cellDragFrom = +b.dataset.cell; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'cell'); });
document.addEventListener('dragover', e => { if(cellDragFrom < 0) return; const b = e.target.closest && e.target.closest('.cellbtn[data-cell]'); if(b){ e.preventDefault(); e.stopPropagation(); document.querySelectorAll('.cellbtn.dropto').forEach(x => x.classList.toggle('dropto', x === b)); b.classList.add('dropto'); } }, true);
document.addEventListener('drop', e => {
  if(cellDragFrom < 0) return; const b = e.target.closest && e.target.closest('.cellbtn[data-cell]'), L = selLayer(), from = cellDragFrom; cellDragFrom = -1;
  document.querySelectorAll('.cellbtn.dropto').forEach(x => x.classList.remove('dropto'));
  e.preventDefault(); e.stopPropagation();
  if(b && L && L.type === 'collage' && +b.dataset.cell !== from){ swapCells(L, from, +b.dataset.cell); syncDoc(); docChanged(false); toast(`マス${from + 1}とマス${+b.dataset.cell + 1}の画像を入れ替えました`); }
}, true);
document.addEventListener('dragend', () => { cellDragFrom = -1; document.querySelectorAll('.cellbtn.dropto').forEach(x => x.classList.remove('dropto')); });
document.addEventListener('click', e => {
  const cb = e.target.closest('[data-cell]'), ca = e.target.closest('[data-cellact]'), L = selLayer();
  if(!L || L.type !== 'collage' || (!cb && !ca)) return;
  if(cb){ L.ac = +cb.dataset.cell; if(!ASSETS[L.cells[L.ac].asset] && cb.closest('[data-pg="cells"]')) $('#cellfile').click(); syncDoc(); paintPreview(false); return; }   // 画像を選ぶ画面が開くのは「マスの画像」タブだけ（背景色・文字、効果のタブでは開かない）
  if(ca.dataset.cellact === 'pick') $('#cellfile').click();
  else if(ca.dataset.cellact === 'reset'){ resetCell(L, L.ac); syncDoc(); docChanged(false); }
  else if(ca.dataset.cellact === 'flip' || ca.dataset.cellact === 'flipV'){ const c = L.cells[L.ac]; c[ca.dataset.cellact] = !c[ca.dataset.cellact]; syncDoc(); docChanged(false); }
  else { L.cells[L.ac].asset = null; syncDoc(); docChanged(false); }
});
{
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.id = 'cellfile'; inp.hidden = true; inp.multiple = true; document.body.appendChild(inp);
  inp.onchange = async () => {
    const L = selLayer(), files = [...inp.files]; inp.value = ''; if(!L || L.type !== 'collage' || !files.length) return;
    const n = collageN(L); let i = L.ac || 0;
    await collageSetCell(L, i, files.shift());
    for(const f of files){ i++; while(i < n && ASSETS[L.cells[i].asset]) i++; if(i >= n) break; await collageSetCell(L, i, f); }
    syncDoc(); docChanged(false);
  };
}

// レイアウト選択ボタン用の小さなアイコン（48×28 の data URL）。キー＝レイアウト名＋分割数でキャッシュ。傾き・境界の形は付けない
const collageIconCache = {};
function collageIcon(lay, n){
  const k = lay + n; if(collageIconCache[k]) return collageIconCache[k];
  const c = mk(48, 28), x = c.getContext('2d'), cols = ['#ff4f8b', '#ffb800', '#34d2ff', '#7cd67c', '#b388ff', '#ff8a4c', '#2bb5a0', '#e0e04a'];
  collageCells(lay, n, 48, 28, 0, 0.55).forEach((p, i) => { collagePath(x, p); x.fillStyle = cols[i % 8]; x.fill(); x.lineWidth = 1.5; x.strokeStyle = '#1f1b2d'; x.stroke(); });
  return collageIconCache[k] = c.toDataURL();
}
