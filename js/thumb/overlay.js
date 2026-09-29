/* 楽ちんサムネメーカー：選択枠・ハンドル・編集モードの表示（キャンバスの上に重ねる表示） */
function layerGeom(L){
  const d = dims.get(L.id); if(!d) return null;
  const a = (L.rot || 0) * PI / 180, c = Math.cos(a), s = Math.sin(a);
  const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => { const lx = u * d.w / 2, ly = v * d.h / 2; return [L.x + lx * c - ly * s, L.y + lx * s + ly * c]; });
  const px = DOC.w / tvCss, off = d.h / 2 + 30 * px, m = 14 * px;
  let rot = [L.x + off * s, L.y - off * c];
  const inside = q => q[0] > m && q[0] < DOC.w - m && q[1] > m && q[1] < DOC.h - m;
  if(!inside(rot)){ const alt = [L.x - off * s, L.y + off * c]; rot = inside(alt) ? alt : [clamp(rot[0], m, DOC.w - m), clamp(rot[1], m, DOC.h - m)]; }
  return {pts, d, a, rot};
}
const fxHandleOn = () => DOC.guides.fx && (((DOC.bg.type === 'image' && DOC.bg.zb.on) || DOC.bg.vignette > 0) && (!DOC.sel || fxEditing));
let fxEditing = false, fxEditT = null;
// 中心のスライダーを動かしている間だけ、背景効果の中心 ◎ を表示する
function showFxCenterBriefly(){ fxEditing = true; clearTimeout(fxEditT); fxEditT = setTimeout(() => { fxEditing = false; paintPreview(false); }, 1500); }
function drawOverlay(ctx, W, H, dpr){
  const f = W / DOC.w;
  ctx.save();
  if(DOC.guides.thirds){
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = dpr; ctx.setLineDash([5 * dpr, 5 * dpr]); ctx.beginPath();
    for(const t of [1 / 3, 2 / 3]){ ctx.moveTo(W * t, 0); ctx.lineTo(W * t, H); ctx.moveTo(0, H * t); ctx.lineTo(W, H * t); }
    ctx.stroke(); ctx.setLineDash([]);
  }
  if(DOC.guides.badge){
    const bw = W * 0.095, bh = H * 0.08, m = W * 0.012, x = W - m - bw, y = H - m - bh;
    ctx.fillStyle = 'rgba(0,0,0,.8)'; ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 5 * dpr); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `600 ${bh * 0.55}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('12:34', x + bw / 2, y + bh / 2 + dpr);
  }
  if(fxHandleOn()){
    const hx = DOC.bg.fcx * W, hy = DOC.bg.fcy * H, r = 13 * dpr;
    ctx.save(); ctx.lineWidth = 2.5 * dpr;
    ctx.strokeStyle = '#1f1b2d'; ctx.fillStyle = 'rgba(255,184,0,.9)';
    ctx.beginPath(); ctx.arc(hx, hy, r, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(hx, hy, r * 0.42, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx - r * 1.9, hy); ctx.lineTo(hx - r * 1.15, hy); ctx.moveTo(hx + r * 1.15, hy); ctx.lineTo(hx + r * 1.9, hy);
    ctx.moveTo(hx, hy - r * 1.9); ctx.lineTo(hx, hy - r * 1.15); ctx.moveTo(hx, hy + r * 1.15); ctx.lineTo(hx, hy + r * 1.9); ctx.stroke();
    ctx.font = `800 ${11 * dpr}px "M PLUS Rounded 1c", sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3 * dpr; ctx.strokeStyle = '#fff'; ctx.strokeText('背景効果の中心', hx + r * 1.6, hy - r * 1.4); ctx.fillStyle = '#1f1b2d'; ctx.fillText('背景効果の中心', hx + r * 1.6, hy - r * 1.4);
    ctx.restore();
  }
  if(snapLines.x != null || snapLines.y != null){
    ctx.strokeStyle = '#ff4f8b'; ctx.lineWidth = dpr; ctx.beginPath();
    if(snapLines.x != null){ ctx.moveTo(snapLines.x * f, 0); ctx.lineTo(snapLines.x * f, H); }
    if(snapLines.y != null){ ctx.moveTo(0, snapLines.y * f); ctx.lineTo(W, snapLines.y * f); }
    ctx.stroke();
  }
  if(drawEditOverlay(ctx, W, H, dpr)){ ctx.restore(); return; }
  const L = selLayer(), g = L && !L.hidden && layerGeom(L);
  if(g && L.locked){
    ctx.strokeStyle = '#ffb800'; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([6 * dpr, 5 * dpr]); ctx.beginPath();
    g.pts.forEach(([x, y], i) => i ? ctx.lineTo(x * f, y * f) : ctx.moveTo(x * f, y * f)); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
  }else if(g){
    ctx.strokeStyle = '#ff4f8b'; ctx.lineWidth = 1.5 * dpr; ctx.beginPath();
    g.pts.forEach(([x, y], i) => i ? ctx.lineTo(x * f, y * f) : ctx.moveTo(x * f, y * f)); ctx.closePath(); ctx.stroke();
    const tx = (g.pts[0][0] + g.pts[1][0]) / 2, ty = (g.pts[0][1] + g.pts[1][1]) / 2;
    ctx.beginPath(); ctx.moveTo(tx * f, ty * f); ctx.lineTo(g.rot[0] * f, g.rot[1] * f); ctx.stroke();
    const hs = 4.5 * dpr; ctx.fillStyle = '#fff';
    g.pts.forEach(([x, y]) => { ctx.beginPath(); ctx.rect(x * f - hs, y * f - hs, hs * 2, hs * 2); ctx.fill(); ctx.stroke(); });
    ctx.beginPath(); ctx.arc(g.rot[0] * f, g.rot[1] * f, 6 * dpr, 0, 7); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}
