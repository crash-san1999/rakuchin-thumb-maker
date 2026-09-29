/* 楽ちんサムネメーカー：分割フレーム（複数の画像を2〜6分割で並べる） */
function COLLAGE_BASE(){
  return {type:'collage', x:960, y:540, sc:1, rot:0, op:1, hidden:false, locked:false, blend:'source-over',
    bw:1920, bh:1080, n:2, layout:'cols', slant:0, main:0.55, edge:'straight', amp:24, bstyle:'line', lw:10, lc:'#ffffff',
    outer:false, radius:0, ac:0, cells:[...Array(6)].map(() => ({asset:null, zoom:1, ox:0, oy:0}))};
}
const COLLAGE_LAYOUTS = [
  ['cols', '縦に並べる', n => n >= 2], ['rows', '横に並べる', n => n >= 2], ['grid', 'グリッド', n => n === 4 || n === 6], ['grid2', 'グリッド（縦長）', n => n === 6],
  ['bigL', '左に大きく', n => n >= 3], ['bigT', '上に大きく', n => n >= 3], ['radial', '放射状', n => n >= 2],
];
const COLLAGE_EDGES = [['straight', 'まっすぐ'], ['zigzag', 'ギザギザ'], ['wave', '波'], ['rough', 'ラフ']];
const COLLAGE_BSTYLES = [['line', '線'], ['none', 'なし（ぴったり）'], ['gap', 'すき間（背景が見える）'], ['glow', '光る線'], ['blur', 'ぼかしてつなげる'], ['shadow', '影で重ねる']];
const collageN = L => clamp(parseInt(L.n) || 2, 2, 6);
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
  if(lay === 'grid' || lay === 'grid2'){
    const c = lay === 'grid' ? (n === 4 ? 2 : 3) : 2, r = n / c, out = [];
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
  const iw = A.img.naturalWidth, ih = A.img.naturalHeight, k = Math.max(cw / iw, ch / ih) * clamp(cell.zoom || 1, 0.2, 8);
  const dw = iw * k, dh = ih * k, cx = bx0 + cw / 2 + (cell.ox || 0) * cw, cy = by0 + ch / 2 + (cell.oy || 0) * ch;
  x.drawImage(A.img, cx - dw / 2, cy - dh / 2, dw, dh);
}
function collageCanvas(L, W, H, f){
  const n = collageN(L), c = mk(W, H), x = c.getContext('2d'), s = W / L.bw; // s = キャンバス1px あたりのドキュメント倍率
  const cells = collageCells(L.layout, n, W, H, L.slant, L.main), A = Math.max(2, (L.amp || 20) * f);
  const {polys, lines} = collageShape(cells, W, H, L.edge || 'straight', A);
  const lw = Math.max(0, (L.lw ?? 10) * f), st = L.bstyle || 'line', showEmpty = !exporting;
  const rad = Math.min(W, H) / 2 * 0 + Math.max(0, (L.radius || 0) * s);
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
  const n = collageN(L);
  if(!collageLayoutOk(L.layout, n)) L.layout = 'cols';
  const w = L.bw * L.sc, h = L.bh * L.sc, W = Math.max(2, Math.round(w * f)), H = Math.max(2, Math.round(h * f));
  dims.set(L.id, {w, h});
  const sk = JSON.stringify([L.bw, L.bh, n, L.layout, L.slant, L.main, L.edge, L.amp, L.bstyle, L.lw, L.lc, L.outer, L.radius, L.cells.slice(0, n), L.cells.slice(0, n).map(c => !!ASSETS[c.asset]), exporting]);
  let e = cache.get(L.id);
  if(!(e && e.sk === sk && (live ? Math.abs(e.c.width - W) / W < 0.5 : e.c.width === W && e.c.height === H))){
    e = {sk, k: W / w, c: collageCanvas(L, W, H, f)}; cache.set(L.id, e);
  }
  ctx.save(); ctx.globalAlpha = L.op ?? 1; ctx.globalCompositeOperation = L.blend || 'source-over';
  ctx.translate(L.x * f, L.y * f); ctx.rotate((L.rot || 0) * PI / 180);
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
  goTab('thumb'); selectLayer(L.id); docChanged(false);
  toast('分割フレームを追加しました。マスに画像をドロップするか、左の「マスの画像」から選んでください');
}
async function collageSetCell(L, i, file){
  const id = await addAsset(await fileToSrc(file), file.name);
  L.cells[i] = Object.assign({zoom:1, ox:0, oy:0}, L.cells[i], {asset:id, zoom:1, ox:0, oy:0});
}
// ドロップ位置のマス、なければ選択中の分割フレームの空いているマスに順に入れる。残りを返す
async function collageTakeFiles(files, cx, cy){
  let rest = files.slice();
  if(DOC.mode === 'thumb' && cx != null){
    const r = $('#tv').getBoundingClientRect();
    if(cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom){
      const x = (cx - r.left) / r.width * DOC.w, y = (cy - r.top) / r.height * DOC.h;
      const L = [...DOC.layers].reverse().find(l => l.type === 'collage' && !l.hidden && collageCellAt(l, x, y) >= 0);
      if(L){
        let i = collageCellAt(L, x, y); const n = collageN(L);
        while(rest.length && i < n){ await collageSetCell(L, i, rest.shift()); L.ac = i; i++; while(i < n && ASSETS[L.cells[i].asset]) i++; }
        selectLayer(L.id); docChanged(false); toast('分割フレームのマスに画像を入れました');
        return rest;
      }
    }
  }
  const S = selLayer();
  if(S && S.type === 'collage'){
    const n = collageN(S); let filled = 0;
    for(let i = 0; i < n && rest.length; i++) if(!ASSETS[S.cells[i].asset]){ await collageSetCell(S, i, rest.shift()); S.ac = i; filled++; }
    if(filled){ docChanged(false); toast(`分割フレームの空いているマスに ${filled} 枚入れました`); }
  }
  return rest;
}

/* マスの一覧（操作パネル） */
function renderCells(){
  const box = document.getElementById('cellBox'), L = selLayer(); if(!box || !L || L.type !== 'collage') return;
  const n = collageN(L); L.ac = clamp(L.ac || 0, 0, n - 1);
  box.innerHTML = `<div class="cellgrid">${[...Array(n)].map((_, i) => { const A = ASSETS[L.cells[i].asset];
    return `<button class="cellbtn${i === L.ac ? ' on' : ''}" data-cell="${i}" title="マス${i + 1}">${A ? `<img src="${A.thumb}" alt="">` : `<span>${i + 1}</span>`}<em>${i + 1}</em></button>`; }).join('')}</div>
    <div class="crow" style="margin-top:8px"><button class="btn sm" data-cellact="pick">${ic('image')}マス${L.ac + 1}に画像を入れる</button>${ASSETS[L.cells[L.ac].asset] ? `<button class="btn sm ghost" data-cellact="clear">${ic('trash')}外す</button>` : ''}</div>`;
}
document.addEventListener('click', e => {
  const cb = e.target.closest('[data-cell]'), ca = e.target.closest('[data-cellact]'), L = selLayer();
  if(!L || L.type !== 'collage' || (!cb && !ca)) return;
  if(cb){ L.ac = +cb.dataset.cell; if(!ASSETS[L.cells[L.ac].asset]) $('#cellfile').click(); syncDoc(); paintPreview(false); return; }
  if(ca.dataset.cellact === 'pick') $('#cellfile').click();
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

/* マスの調整モード：ドラッグで中の画像を動かす／ホイール・ピンチで拡大縮小 */
let collageEdit = null;
const collageEditLayer = () => { if(!collageEdit) return null; const L = DOC.layers.find(l => l.id === collageEdit); return L && L.type === 'collage' && !L.hidden ? L : null; };
function setCollageEdit(id, cell){
  collageEdit = id || null;
  const L = collageEditLayer(); if(L && cell != null && cell >= 0) L.ac = cell;
  const b = document.getElementById('collageEditBtn'); if(b) b.lastChild.textContent = collageEdit ? '調整を終える' : 'キャンバスでマスの画像を調整';
  if(collageEdit) toast(isMobile ? 'マスをドラッグで中の画像を移動、ピンチで拡大縮小。外をタップで終了' : 'マスをドラッグで中の画像を移動、ホイールで拡大縮小。Esc か外をクリックで終了');
  syncDoc(); paintPreview(false);
}
function collagePointerDown(e, x, y, tv){
  const L = collageEditLayer(); if(!L) return false;
  const i = collageCellAt(L, x, y);
  if(i < 0){ setCollageEdit(null); return false; }
  L.ac = i; const c = L.cells[i];
  drag = {mode:'cpan', L, x0:x, y0:y, ox0:c.ox || 0, oy0:c.oy || 0, i, size:collageCellSize(L, i)};
  tv.setPointerCapture(e.pointerId); e.preventDefault(); syncDoc(); return true;
}
function collagePointerMove(x, y){
  const L = drag.L, a = -(L.rot || 0) * PI / 180, dx = x - drag.x0, dy = y - drag.y0, c = L.cells[drag.i];
  c.ox = Math.round((drag.ox0 + (dx * Math.cos(a) - dy * Math.sin(a)) / drag.size[0]) * 1000) / 1000;
  c.oy = Math.round((drag.oy0 + (dx * Math.sin(a) + dy * Math.cos(a)) / drag.size[1]) * 1000) / 1000;
  syncDoc(); livePaint();
}
function collageWheel(e, x, y, k){
  const L = collageEditLayer(); if(!L) return false;
  const i = collageCellAt(L, x, y); if(i < 0) return false;
  L.ac = i; const c = L.cells[i]; c.zoom = Math.round(clamp((c.zoom || 1) * k, 0.2, 8) * 1000) / 1000;
  e.preventDefault(); syncDoc(); docChanged(true); return true;
}
function drawCollageOverlay(ctx, W, H, dpr){
  const L = collageEditLayer(); if(!L) return false;
  const f = W / DOC.w, w = L.bw * L.sc, h = L.bh * L.sc, cells = collageCells(L.layout, collageN(L), w, h, L.slant, L.main);
  ctx.save(); ctx.translate(L.x * f, L.y * f); ctx.rotate((L.rot || 0) * PI / 180); ctx.scale(f, f); ctx.translate(-w / 2, -h / 2);
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  cells.forEach((p, i) => { collagePath(ctx, p); ctx.lineWidth = (i === L.ac ? 3 : 1.5) * dpr / f; ctx.strokeStyle = i === L.ac ? '#ffb800' : 'rgba(255,255,255,.8)'; ctx.setLineDash(i === L.ac ? [] : [6 * dpr / f, 5 * dpr / f]); ctx.stroke(); });
  ctx.restore();
  ctx.font = `800 ${12 * dpr}px "M PLUS Rounded 1c", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const msg = isMobile ? `マス${L.ac + 1}を調整中：ドラッグで移動／ピンチで拡大縮小／外をタップで終了` : `マス${L.ac + 1}を調整中：ドラッグで移動／ホイールで拡大縮小／Esc か外をクリックで終了`;
  const tw = ctx.measureText(msg).width + 24 * dpr; ctx.fillStyle = 'rgba(31,27,45,.88)'; ctx.beginPath(); ctx.roundRect(W / 2 - tw / 2, 8 * dpr, tw, 26 * dpr, 13 * dpr); ctx.fill();
  ctx.fillStyle = '#ffb800'; ctx.fillText(msg, W / 2, 14 * dpr);
  return true;
}
const collageIconCache = {};
function collageIcon(lay, n){
  const k = lay + n; if(collageIconCache[k]) return collageIconCache[k];
  const c = mk(48, 28), x = c.getContext('2d'), cols = ['#ff4f8b', '#ffb800', '#34d2ff', '#7cd67c', '#b388ff', '#ff8a4c'];
  collageCells(lay, n, 48, 28, lay === 'radial' ? 0 : 0, 0.55).forEach((p, i) => { collagePath(x, p); x.fillStyle = cols[i % 6]; x.fill(); x.lineWidth = 1.5; x.strokeStyle = '#1f1b2d'; x.stroke(); });
  return collageIconCache[k] = c.toDataURL();
}
