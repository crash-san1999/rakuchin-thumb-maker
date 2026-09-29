/* 楽ちんサムネメーカー：動的エフェクト（集中線・光・キラキラ・爆発）とワンクリック背景エフェクト */
/* 動的エフェクト（レイヤーとして移動・拡大縮小・回転できる効果） */
const FX_DEF = {
  lines:   () => ({c:'#ffffff', n:120, inner:0.55, w:1, len:1, seed:1, full:true, reach:1.8, fade:0.4}),
  light:   () => ({c:'#fff1a8', amt:0.9, r:0.45}),
  sparkle: () => ({c:'#ffffff', n:14, size:1, seed:3, glow:true}),
  burst:   () => ({c:'#ffe600', c2:'#1f1b2d', sw:10, spikes:16, depth:0.3, seed:2}),
};
const FX_NAMES = {lines:'集中線', light:'光（スポット）', sparkle:'キラキラ', burst:'爆発（ギザギザ）'};
const FX_ICONS = {lines:'burst', light:'sun', sparkle:'sparkle', burst:'boom'};
const FX_HINT = {lines:'放射状の線で視線を集める。中心の空きを動かして注目させたい所へ', light:'光が差しているように明るく（スクリーン合成）', sparkle:'星のきらめきを散らす', burst:'マンガ風の爆発。文字の後ろに敷いて「ドーン！」'};
const FX_LAYER_DEF = {lines:{op:0.55}, light:{blend:'screen', x:1380, y:330}, burst:{sc:0.8}};
const FX_BOX = L => { const p = L.p; return {lines:p.full === false ? [1920 * p.inner * p.reach, 1080 * p.inner * p.reach] : [1920 * p.inner, 1080 * p.inner], light:[1920 * p.r * 1.1, 1920 * p.r * 1.1], sparkle:[640, 400], burst:[780, 500]}[L.kind] || [400, 400]; };
const mkFx = (kind, p = {}, ex = {}) => Object.assign(LAYER_BASE(), {id:uid(), type:'fx', kind}, FX_LAYER_DEF[kind] || {}, ex, {p:Object.assign(FX_DEF[kind](), p)});
const BG_FX = {
  reset:  {bg:{}, fx:[]},
  focus:  {bg:{zb:{on:true, amt:0.28}, contrast:0.1, vignette:0.5}, fx:[]},
  lines:  {bg:{zb:{on:true, amt:0.18}, vignette:0.45}, fx:[['lines', {}]]},
  speed:  {bg:{mb:{on:true, dist:140, angle:0}, contrast:0.1}, fx:[]},
  soft:   {bg:{blur:10, bright:0.04, vignette:0.3}, fx:[]},
  pop:    {bg:{dim:0.25, blur:5, vignette:0.5, shade:{on:true, amt:0.6, angle:90, cover:0.55}}, fx:[]},
  vivid:  {bg:{sat:0.45, contrast:0.18}, fx:[]},
  mono:   {bg:{tone:'mono', contrast:0.25, vignette:0.45}, fx:[]},
  retro:  {bg:{tone:'sepia', contrast:0.08, vignette:0.6}, fx:[]},
  duo:    {bg:{tone:'duotone', duo1:'#1b1464', duo2:'#ff9d5c', contrast:0.1}, fx:[]},
  red:    {bg:{tone:'mono', contrast:0.2, tint:{on:true, c:'#ff2d2d', a:0.45, mode:'multiply'}}, fx:[]},
  spot:   {bg:{dim:0.25, vignette:0.4}, fx:[['light', {}]]},
  mosaic: {bg:{mosaic:{on:true, size:32}}, fx:[]},
};
function applyBgFx(name){
  const b = DOC.bg, P = BG_FX[name] || BG_FX.reset;
  Object.assign(b, {bright:0, contrast:0, sat:0, hue:0, blur:0, tone:'none', dim:0, vignette:0});
  b.zb.on = b.mb.on = b.mosaic.on = b.tint.on = b.shade.on = false;
  for(const k in P.bg){ const v = P.bg[k]; if(v && typeof v === 'object') Object.assign(b[k], v); else b[k] = v; }
  // ワンクリックで作った動的エフェクトは入れ替え（自分で追加したものはそのまま）
  const had = DOC.layers.some(l => l.type === 'fx' && l.auto);
  DOC.layers = DOC.layers.filter(l => !(l.type === 'fx' && l.auto));
  DOC.layers.unshift(...P.fx.map(([k, pp, ex]) => Object.assign(mkFx(k, pp, ex), {auto:true})));
  if(DOC.sel && !DOC.layers.find(l => l.id === DOC.sel)) DOC.sel = null;
  syncDoc(); renderLayers(); docChanged(false);
  return P.fx.length > 0 || had;
}
function addFx(kind){
  const L = mkFx(kind);
  // 選択中のレイヤーのすぐ下（なければ背景のすぐ上）に入れる
  const si = DOC.layers.findIndex(l => l.id === DOC.sel);
  DOC.layers.splice(si >= 0 ? si : 0, 0, L);
  selectLayer(L.id); renderLayers(); docChanged(false); openInspector();
  toast(`「${FX_NAMES[kind]}」を追加しました。ドラッグで移動、角で拡大縮小、上の○で回転。レイヤーパネルで前後も入れ替えられます`);
}
function drawFx(ctx, L, f){
  const p = L.p, [bw, bh] = FX_BOX(L);
  dims.set(L.id, {w:bw * L.sc, h:bh * L.sc});
  ctx.save(); ctx.globalAlpha = L.op ?? 1; ctx.globalCompositeOperation = L.blend || 'source-over';
  ctx.translate(L.x * f, L.y * f); ctx.rotate((L.rot || 0) * PI / 180); ctx.scale(L.sc * f, L.sc * f);
  const R = rng(p.seed || 1);
  if(L.kind === 'lines'){
    const rx = 960 * p.inner, ry = 540 * p.inner, step = 2 * PI / p.n, full = p.full !== false;
    // 楕円を円として扱う（縦方向を縮めて描く）
    ctx.scale(1, ry / rx);
    const outer = full ? Math.hypot(1920, 1080) * 2.4 / Math.max(0.05, L.sc) * Math.max(1, rx / ry) : rx * Math.max(1.02, p.reach);
    if(full) ctx.fillStyle = p.c;
    else{ const g = ctx.createRadialGradient(0, 0, rx, 0, 0, outer), fd = clamp(p.fade ?? 0, 0, 1);
      g.addColorStop(0, rgba(p.c, 1)); g.addColorStop(1 - fd * 0.95, rgba(p.c, 1)); g.addColorStop(1, rgba(p.c, fd > 0 ? 0 : 1)); ctx.fillStyle = g; }
    ctx.beginPath();
    for(let i = 0; i < p.n; i++){
      const a = (i + R() * 0.9) * step, w = step * (0.12 + R() * 0.38) * p.w, k = 1 + (R() * 0.55 - 0.2) * p.len;
      const ok = full ? outer : outer * (1 - R() * 0.25 * p.len);
      ctx.moveTo(Math.cos(a) * rx * k, Math.sin(a) * rx * k);
      ctx.lineTo(Math.cos(a - w) * ok, Math.sin(a - w) * ok);
      ctx.lineTo(Math.cos(a + w) * ok, Math.sin(a + w) * ok);
      ctx.closePath();
    }
    ctx.fill();
  }else if(L.kind === 'light'){
    const r = 1920 * p.r * 0.55, g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, rgba(p.c, p.amt)); g.addColorStop(0.35, rgba(p.c, p.amt * 0.55)); g.addColorStop(1, rgba(p.c, 0));
    ctx.fillStyle = g; ctx.fillRect(-r, -r, r * 2, r * 2);
  }else if(L.kind === 'sparkle'){
    ctx.fillStyle = p.c;
    for(let i = 0; i < p.n; i++){
      const px = (R() - 0.5) * bw, py = (R() - 0.5) * bh, r = (0.35 + R() * 0.9) * 42 * p.size, k = r * 0.16;
      if(p.glow){ ctx.shadowColor = p.c; ctx.shadowBlur = r * 0.8 * L.sc * f; }
      ctx.beginPath(); ctx.moveTo(px, py - r);
      ctx.quadraticCurveTo(px + k, py - k, px + r, py); ctx.quadraticCurveTo(px + k, py + k, px, py + r);
      ctx.quadraticCurveTo(px - k, py + k, px - r, py); ctx.quadraticCurveTo(px - k, py - k, px, py - r);
      ctx.fill();
    }
  }else if(L.kind === 'burst'){
    const rx = bw / 2 * 0.92, ry = bh / 2 * 0.92, n = Math.max(5, Math.round(p.spikes));
    ctx.beginPath();
    for(let i = 0; i <= n * 2; i++){
      const a = i / (n * 2) * 2 * PI - PI / 2, k = i % 2 === 0 ? 1 + R() * 0.08 : 1 - p.depth * (0.65 + R() * 0.35);
      const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.lineJoin = 'round';
    if(p.sw > 0){ ctx.lineWidth = p.sw * 2; ctx.strokeStyle = p.c2; ctx.stroke(); }
    ctx.fillStyle = p.c; ctx.fill();
  }
  ctx.restore();
}
