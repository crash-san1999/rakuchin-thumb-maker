/* 楽ちんサムネメーカー：分割フレーム ② 描画（collage.js の続き。4 ファイルの分担は collage.js の先頭を参照）
   分割のしかた → マスの多角形（collageCells）→ 境界の形（collageShape）→ マスごとに画像・背景色・文字を描いて 1 枚にする（collageCanvas）→ drawCollage。
   exporting（書き出し中の目印。export.js が切り替える）の間は、空のマスの「画像をドロップ」表示を描かない。
   依存：ASSETS・toneFilter・postFx（render.js）・render（text-render.js）・collage.js のデータ定義、collage-cells.js の cellTextStyle まわり。 */
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
  /** @type {Array<[number[], number]>} */
  const corners = [[0, 0], [W, 0], [W, H], [0, H]].map(p => [p, Math.atan2(p[1] - cy, p[0] - cx)]);
  const norm = a => ((a % (2 * PI)) + 2 * PI) % (2 * PI);
  return [...Array(n)].map((_, i) => {
    const s = a0 + 2 * PI * i / n, span = 2 * PI / n;
    const mid = corners.map(([p, a]) => /** @type {[number[], number]} */ ([p, norm(a - s)])).filter(([, r]) => r > 1e-6 && r < span - 1e-6).sort((u, v) => u[1] - v[1]).map(([p]) => p);
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
/** @param {Layer} L */
function collageCellPicture(x, L, i, poly, W, H, showEmpty){
  const cell = L.cells[i] || /** @type {CollageCell} */ ({}), A = ASSETS[cell.asset];
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
/** @param {Layer} L */
function cellTextStyle(L, text){ return Object.assign({}, L.tstyle || collageDefaultStyle(), {text, pad:2}); }
/** @param {Layer} L */
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
/** @param {Layer} L */
function collageCellImage(x, L, i, poly, W, H, showEmpty){
  const cell = L.cells[i] || /** @type {CollageCell} */ ({}), A = ASSETS[cell.asset], bg = cell.bg, hasBg = !!(bg && bg.on), hasTx = cellHasText(cell);
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
/** @param {Layer} L */
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
/** @param {Layer} L */
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

