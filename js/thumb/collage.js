/* 楽ちんサムネメーカー：分割フレーム（複数の画像を2〜8分割で並べる） */
/* マスの画像にかける効果（色調・ぼかし・ズーム／モーションブラー・モザイク・暗く・周辺減光・色を重ねる） */
const CELL_FX_BASE = () => ({bright:0, contrast:0, sat:0, hue:0, blur:0, tone:'none', duo1:'#1b1464', duo2:'#ff9d5c',
  zb:{on:false, amt:0.25}, mb:{on:false, dist:120, angle:0}, mosaic:{on:false, size:28}, dim:0, vignette:0, tint:{on:false, c:'#ff7a50', a:0.35, mode:'overlay'}});
// 保存データの効果を既定値と合わせる（入れ子の項目も）
function mergeCellFx(o){
  const b = CELL_FX_BASE(); o = o || {};
  for(const k in b) if(o[k] != null) b[k] = b[k] && typeof b[k] === 'object' ? Object.assign(b[k], o[k]) : o[k];
  return b;
}
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
function COLLAGE_BASE(){
  return Object.assign(LAYER_BASE(), {type:'collage',
    bw:(typeof DOC === 'object' && DOC ? DOC.w : 1920), bh:(typeof DOC === 'object' && DOC ? DOC.h : 1080), n:2, layout:'cols', slant:0, main:0.55, edge:'straight', amp:24, bstyle:'line', lw:10, lc:'#ffffff',
    outer:false, radius:0, ac:0, fxMode:'all', fx:CELL_FX_BASE(), shadow:{on:false, blur:30, y:10, a:0.5},
    cells:[...Array(8)].map(() => ({asset:null, zoom:1, ox:0, oy:0, rot:0, flip:false, flipV:false, fx:CELL_FX_BASE()}))});
}
// 効果の対象を「マスごと」に切り替えたら、まだ効果のないマスには今の共通の効果を写す
function collageFxModeChanged(L){ if(L.fxMode === 'cell') L.cells.forEach(c => { if(!cellFxOn(c.fx)) c.fx = mergeCellFx(JSON.parse(JSON.stringify(L.fx))); }); }
function applyCellFx(name){
  const L = selLayer(); if(!L || (L.type !== 'collage' && L.type !== 'group')) return;
  const fx = mergeCellFx(JSON.parse(JSON.stringify(CELL_FX_PRESETS[name] || {})));
  if(L.fxMode === 'cell') L.cells[L.ac || 0].fx = fx; else L.fx = fx;
  syncDoc(); docChanged(false);
}
const COLLAGE_LAYOUTS = [
  ['cols', '縦に並べる', n => n >= 2], ['rows', '横に並べる', n => n >= 2], ['grid', 'グリッド', n => n === 4 || n === 6 || n === 8], ['grid2', 'グリッド（縦長）', n => n === 6 || n === 8],
  ['bigL', '左に大きく', n => n >= 3], ['bigT', '上に大きく', n => n >= 3], ['radial', '放射状', n => n >= 2],
  // 1週間の予定表向け：2段に分けて、上から順に数える（7分割なら「月〜日」を上段・下段に並べられる）
  ['wk43', '上4・下3（月〜木／金〜日）', n => n === 7], ['wk34', '上3・下4', n => n === 7], ['wk52', '上5・下2（平日／土日）', n => n === 7], ['wk25', '上2・下5', n => n === 7],
  ['wk53', '上5・下3', n => n === 8], ['wk35', '上3・下5', n => n === 8],
];
const COLLAGE_ROWS2 = {wk43:[4, 3], wk34:[3, 4], wk52:[5, 2], wk25:[2, 5], wk53:[5, 3], wk35:[3, 5]};
const COLLAGE_EDGES = [['straight', 'まっすぐ'], ['zigzag', 'ギザギザ'], ['wave', '波'], ['rough', 'ラフ']];
const COLLAGE_BSTYLES = [['line', '線'], ['none', 'なし（ぴったり）'], ['gap', 'すき間（背景が見える）'], ['glow', '光る線'], ['blur', 'ぼかしてつなげる'], ['shadow', '影で重ねる']];
const collageN = L => clamp(parseInt(L.n) || 2, 2, 8);
const collageLayoutOk = (lay, n) => { const d = COLLAGE_LAYOUTS.find(l => l[0] === lay); return !!d && d[2](n); };
let exporting = false;

/* 分割のしかた → マスの多角形（W×H のピクセル座標） */
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
function collageCellImage(x, L, i, poly, W, H, showEmpty){
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
  // 回転しても、マスに隙間ができない大きさを基準にする
  const ra = (cell.rot || 0) * PI / 180, rc = Math.abs(Math.cos(ra)), rs = Math.abs(Math.sin(ra));
  const iw = A.img.naturalWidth, ih = A.img.naturalHeight, k = Math.max((cw * rc + ch * rs) / iw, (cw * rs + ch * rc) / ih) * clamp(cell.zoom || 1, 0.2, 8);
  const dw = iw * k, dh = ih * k, cx = bx0 + cw / 2 + (cell.ox || 0) * cw, cy = by0 + ch / 2 + (cell.oy || 0) * ch;
  const fx = collageFx(L, i);
  if(!cellFxOn(fx)){ cellImg(x, A.img, cx, cy, dw, dh, cell); return; }
  // 効果あり：マスの範囲（ぼかし・ブラーのぶん少し広め）を別のキャンバスで作ってから置く
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
function collageCanvas(L, W, H, f, lay){
  const n = collageN(L), c = mk(W, H), x = c.getContext('2d'), s = W / L.bw; // s = キャンバス1px あたりのドキュメント倍率
  const cells = collageCells(lay || L.layout, n, W, H, L.slant, L.main), A = Math.max(2, (L.amp || 20) * f);
  const {polys, lines} = collageShape(cells, W, H, L.edge || 'straight', A);
  const lw = Math.max(0, (L.lw ?? 10) * f), st = L.bstyle || 'line', showEmpty = !exporting;
  const rad = Math.max(0, (L.radius || 0) * s);
  x.save(); x.beginPath(); x.roundRect(0, 0, W, H, Math.min(rad, Math.min(W, H) / 2)); x.clip();
  polys.forEach((p, i) => { x.save(); collagePath(x, p); x.clip(); collageCellImage(x, L, i, p, W, H, showEmpty); x.restore(); });
  const strokeLines = (w, col) => { x.lineWidth = w; x.strokeStyle = col; x.lineJoin = 'round'; x.lineCap = 'round'; x.beginPath(); lines.forEach(pts => pts.forEach(([px, py], j) => j ? x.lineTo(px, py) : x.moveTo(px, py))); x.stroke(); };
  if(st === 'blur' && lw > 0){
    const ext = p => p.map(([px, py]) => [px < 0.6 ? -lw * 4 : px > W - 0.6 ? W + lw * 4 : px, py < 0.6 ? -lw * 4 : py > H - 0.6 ? H + lw * 4 : py]);
    polys.forEach((p, i) => {
      const t = mk(W, H), tx = t.getContext('2d'); collageCellImage(tx, L, i, p, W, H, showEmpty);
      tx.globalCompositeOperation = 'destination-in'; tx.filter = `blur(${lw * 0.8}px)`; collagePath(tx, ext(p)); tx.fillStyle = '#000'; tx.fill(); tx.filter = 'none';
      x.drawImage(t, 0, 0);
    });
  }else if(st === 'shadow' && lw > 0){
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
function drawCollage(ctx, L, f, live, cache){
  const n = collageN(L), lay = collageLayoutOk(L.layout, n) ? L.layout : 'cols';
  const w = L.bw * L.sc, h = L.bh * L.sc, W = Math.max(2, Math.round(w * f)), H = Math.max(2, Math.round(h * f));
  dims.set(L.id, {w, h});
  const sk = JSON.stringify([L.bw, L.bh, n, lay, L.slant, L.main, L.edge, L.amp, L.bstyle, L.lw, L.lc, L.outer, L.radius, L.fxMode, L.fx, L.cells.slice(0, n), L.cells.slice(0, n).map(c => !!ASSETS[c.asset]), exporting]);
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

/* 追加・画像の割り当て */
function addCollage(){
  const L = Object.assign(COLLAGE_BASE(), {id: uid()});
  DOC.layers.unshift(L); if(DOC.mode !== 'thumb') setMode('thumb');
  openInspector(); selectLayer(L.id); docChanged(false);
  toast('分割フレームを追加しました。マスに画像をドロップするか、左の「マスの画像」から選んでください');
}
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
  const key = [L.id, n, L.ac, ...L.cells.slice(0, n).map(c => ASSETS[c.asset] ? c.asset : '')].join('|');
  document.querySelectorAll('.cellBox').forEach(box => {
  if(box.dataset.key === key) return; box.dataset.key = key;
  box.innerHTML = `<div class="cellgrid">${[...Array(n)].map((_, i) => { const A = ASSETS[L.cells[i].asset];
    return `<button class="cellbtn${i === L.ac ? ' on' : ''}" data-cell="${i}" draggable="${A ? 'true' : 'false'}" title="マス${i + 1}（ドラッグで別のマスと入れ替え）">${A ? `<img src="${A.thumb}" alt="" draggable="false">` : `<span>${i + 1}</span>`}<em>${i + 1}</em></button>`; }).join('')}</div>
    <div class="crow" style="margin-top:8px"><button class="btn sm" data-cellact="pick">${ic('image')}マス${L.ac + 1}に画像を入れる</button>${ASSETS[L.cells[L.ac].asset] ? `<button class="btn sm ghost" data-cellact="clear">${ic('trash')}外す</button>` : ''}</div>${ASSETS[L.cells[L.ac].asset] ? `<div class="crow"><button class="btn sm ghost" data-cellact="flip">${ic('fliph')}左右反転</button><button class="btn sm ghost" data-cellact="flipV">${ic('flipv')}上下反転</button><button class="btn sm ghost" data-cellact="reset">${ic('reset')}位置・大きさを元に戻す</button></div>` : ''}`;
  });
}
document.addEventListener('click', e => { const b = e.target.closest('[data-cfx]'); if(b) applyCellFx(b.dataset.cfx); });
// 一覧のマスをドラッグして、別のマスに落とすと入れ替え
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
  if(cb){ L.ac = +cb.dataset.cell; if(!ASSETS[L.cells[L.ac].asset]) $('#cellfile').click(); syncDoc(); paintPreview(false); return; }
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

const collageIconCache = {};
function collageIcon(lay, n){
  const k = lay + n; if(collageIconCache[k]) return collageIconCache[k];
  const c = mk(48, 28), x = c.getContext('2d'), cols = ['#ff4f8b', '#ffb800', '#34d2ff', '#7cd67c', '#b388ff', '#ff8a4c', '#2bb5a0', '#e0e04a'];
  collageCells(lay, n, 48, 28, 0, 0.55).forEach((p, i) => { collagePath(x, p); x.fillStyle = cols[i % 8]; x.fill(); x.lineWidth = 1.5; x.strokeStyle = '#1f1b2d'; x.stroke(); });
  return collageIconCache[k] = c.toDataURL();
}
