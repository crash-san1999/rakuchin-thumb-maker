/* 楽ちんサムネメーカー：サムネの描画（レイヤー・背景・エフェクト） */
/* ---------- 描画 ---------- */
const prevCache = new Map(), dims = new Map();
let tvCss = 800, snapLines = {x:null, y:null}, drag = null;
function fontKey(st){
  const t = st.text.replace(/[{}\n]/g, '').slice(0, 24) || 'あ';
  let k = document.fonts.check(`${st.weight} 20px "${st.font}"`, t) ? '1' : '0';
  if(st.fontLatin) k += document.fonts.check(`${st.weight} 20px "${st.fontLatin}"`, 'A1') ? '1' : '0';
  return k;
}
function textCanvas(L, need, live, cache){
  const sk = JSON.stringify(L.style) + fontKey(L.style);
  let e = cache.get(L.id);
  if(!(e && e.sk === sk && (live || Math.abs(e.k - need) / need < 0.02))){
    const save = S; S = Object.assign({}, L.style, {pad: 2});
    let c; try{ c = render(need); } finally { S = save; }
    e = {sk, k:need, c}; cache.set(L.id, e);
  }
  return e;
}
function tinted(A, color){
  A.tint = A.tint || {};
  if(A.tint[color]) return A.tint[color];
  const c = mk(A.img.naturalWidth, A.img.naturalHeight), x = c.getContext('2d');
  x.drawImage(A.img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  return A.tint[color] = c;
}
function imageCanvas(L, f, live, cache){
  const A = ASSETS[L.asset]; if(!A) return null;
  if(L.frame && L.frame.shape && L.frame.shape !== 'none') return framedCanvas(L, f, live, cache);
  const need = L.sc * f, o = L.outline, ow = o.on ? o.w : 0;
  const sk = [L.asset, o.on, o.w, o.c, L.flip].join('|');
  let e = cache.get(L.id);
  if(!(e && e.sk === sk && (live || Math.abs(e.k - need) / need < 0.02))){
    const iw = A.img.naturalWidth, ih = A.img.naturalHeight, r = ow * f, pad = Math.ceil(r) + 2;
    const cw = Math.max(1, Math.round(iw * need)), ch = Math.max(1, Math.round(ih * need));
    const c = mk(cw + pad * 2, ch + pad * 2), x = c.getContext('2d');
    if(L.flip){ x.translate(c.width, 0); x.scale(-1, 1); }
    if(r > 0){
      const t = tinted(A, o.c), n = Math.max(16, Math.min(56, Math.round(r * 1.5)));
      for(const rr of [r, r * 0.55]) for(let i = 0; i < n; i++){
        const a = i / n * 2 * PI; x.drawImage(t, pad + Math.cos(a) * rr, pad + Math.sin(a) * rr, cw, ch);
      }
    }
    x.drawImage(A.img, pad, pad, cw, ch);
    e = {sk, k:need, c}; cache.set(L.id, e);
  }
  return e;
}
function drawLayer(ctx, L, f, live, cache){
  const need = L.sc * f;
  const e = L.type === 'text' ? textCanvas(L, need, live, cache) : imageCanvas(L, f, live, cache);
  if(!e) return;
  const s = need / e.k;
  dims.set(L.id, {w: e.c.width / e.k * L.sc, h: e.c.height / e.k * L.sc});
  ctx.save(); ctx.globalAlpha = L.op ?? 1; ctx.globalCompositeOperation = L.blend || 'source-over';
  ctx.translate(L.x * f, L.y * f); ctx.rotate((L.rot || 0) * PI / 180); ctx.scale(s, s);
  if(L.type === 'image' && L.shadow.on && L.shadow.a > 0){
    ctx.shadowColor = `rgba(0,0,0,${L.shadow.a})`; ctx.shadowBlur = L.shadow.blur * f; ctx.shadowOffsetY = L.shadow.y * f;
  }
  ctx.drawImage(e.c, -e.c.width / 2, -e.c.height / 2);
  ctx.restore();
}
function drawSpeedLines(ctx, W, H){
  const l = DOC.bg.lines, R = rng(l.seed), cx = W * DOC.bg.fcx, cy = H * DOC.bg.fcy, outer = Math.hypot(W, H) * 1.6;
  const rx = W / 2 * l.inner, ry = H / 2 * l.inner, step = 2 * PI / l.n, wf = l.w ?? 1, jit = l.len ?? 1;
  ctx.fillStyle = rgba(l.c, l.a); ctx.beginPath();
  for(let i = 0; i < l.n; i++){
    const a = (i + R() * 0.9) * step, w = step * (0.12 + R() * 0.38) * wf, k = 1 + (R() * 0.55 - 0.2) * jit;
    ctx.moveTo(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k);
    ctx.lineTo(cx + Math.cos(a - w) * outer, cy + Math.sin(a - w) * outer);
    ctx.lineTo(cx + Math.cos(a + w) * outer, cy + Math.sin(a + w) * outer);
    ctx.closePath();
  }
  ctx.fill();
}
function duotone(c, c1, c2){
  const x = c.getContext('2d', {willReadFrequently:true}), im = x.getImageData(0, 0, c.width, c.height), d = im.data;
  const A = hex2rgb(c1), B = hex2rgb(c2);
  for(let i = 0; i < d.length; i += 4){
    const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    d[i] = A[0] + (B[0] - A[0]) * l; d[i + 1] = A[1] + (B[1] - A[1]) * l; d[i + 2] = A[2] + (B[2] - A[2]) * l;
  }
  x.putImageData(im, 0, 0);
}
function mosaic(c, size){
  const W = c.width, H = c.height, sw = Math.max(1, Math.round(W / Math.max(2, size))), sh = Math.max(1, Math.round(H / Math.max(2, size)));
  const t = mk(sw, sh); t.getContext('2d').drawImage(c, 0, 0, sw, sh);
  const x = c.getContext('2d'); x.save(); x.imageSmoothingEnabled = false; x.clearRect(0, 0, W, H); x.drawImage(t, 0, 0, W, H); x.restore();
}
function zoomBlur(src, amt, cx, cy){
  const W = src.width, H = src.height, o = mk(W, H), x = o.getContext('2d'), n = Math.max(10, Math.min(32, Math.round(amt * 70)));
  for(let i = 0; i < n; i++){
    const s = 1 + amt * i / (n - 1);
    x.globalAlpha = 1 / (i + 1); x.setTransform(s, 0, 0, s, cx - cx * s, cy - cy * s); x.drawImage(src, 0, 0);
  }
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1;
  return o;
}
function motionBlur(src, dist, angle){
  const W = src.width, H = src.height, o = mk(W, H), x = o.getContext('2d'), n = Math.max(8, Math.min(32, Math.round(dist / 4)));
  const a = angle * PI / 180, dx = Math.cos(a), dy = Math.sin(a);
  x.drawImage(src, 0, 0);
  for(let i = 0; i < n; i++){
    const t = (i / (n - 1) - 0.5) * dist;
    x.globalAlpha = 1 / (i + 2); x.drawImage(src, dx * t, dy * t);
  }
  x.globalAlpha = 1;
  return o;
}
function bgImageLayer(W, H, f){
  const b = DOC.bg, A = ASSETS[b.asset], c = mk(W, H), x = c.getContext('2d');
  x.fillStyle = '#101014'; x.fillRect(0, 0, W, H);
  if(!A) return c;
  const iw = A.img.naturalWidth, ih = A.img.naturalHeight, cover = Math.max(W / iw, H / ih);
  if(b.gap === 'blur'){
    const m = 80 * f;
    x.save(); x.filter = `blur(${Math.max(6, 40 * f)}px) brightness(.72)`;
    x.drawImage(A.img, (W - iw * cover) / 2 - m, (H - ih * cover) / 2 - m, iw * cover + 2 * m, ih * cover + 2 * m); x.restore();
  }else{ x.fillStyle = b.gapColor; x.fillRect(0, 0, W, H); }
  const s = (b.fit === 'contain' ? Math.min(W / iw, H / ih) : cover) * b.zoom, dw = iw * s, dh = ih * s;
  const fl = [];
  if(b.bright) fl.push(`brightness(${1 + b.bright})`);
  if(b.contrast) fl.push(`contrast(${Math.max(0, 1 + b.contrast)})`);
  if(b.sat) fl.push(`saturate(${Math.max(0, 1 + b.sat)})`);
  if(b.hue) fl.push(`hue-rotate(${b.hue}deg)`);
  if(b.tone === 'mono') fl.push('grayscale(1)'); else if(b.tone === 'sepia') fl.push('sepia(.9)');
  if(b.blur > 0) fl.push(`blur(${b.blur * f}px)`);
  x.save(); x.translate(W / 2 + b.ox * W / 2, H / 2 + b.oy * H / 2); x.rotate((b.rot || 0) * PI / 180); if(b.flip) x.scale(-1, 1);
  x.filter = fl.join(' ') || 'none'; x.drawImage(A.img, -dw / 2, -dh / 2, dw, dh); x.restore();
  if(b.tone === 'duotone') duotone(c, b.duo1, b.duo2);
  if(b.mosaic.on) mosaic(c, b.mosaic.size * f);
  let out = c;
  if(b.mb.on && b.mb.dist > 0) out = motionBlur(out, b.mb.dist * f, b.mb.angle);
  if(b.zb.on && b.zb.amt > 0) out = zoomBlur(out, b.zb.amt, clamp(b.fcx, 0, 1) * W, clamp(b.fcy, 0, 1) * H);
  if(false){
    const tx = out.getContext('2d'); tx.save(); tx.globalCompositeOperation = b.tint.mode; tx.globalAlpha = b.tint.a;
    tx.fillStyle = b.tint.c; tx.fillRect(0, 0, W, H); tx.restore();
  }
  return out;
}
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
  selectLayer(L.id); renderLayers(); docChanged(false); goTab('thumb');
  toast(`「${FX_NAMES[kind]}」を追加しました。ドラッグで移動、角で拡大縮小、上の○で回転。レイヤーパネルで前後も入れ替えられます`);
}
function showFxMenu(x, y){
  const m = $('#ctxmenu');
  m.innerHTML = '<div class="ttl">動的エフェクトを追加</div>' + Object.keys(FX_DEF).map(k =>
    `<button data-addfx="${k}">${ic(FX_ICONS[k])}<span><b style="display:block;font-weight:800">${FX_NAMES[k]}</b><small style="font-weight:500;color:var(--mute);font-size:10.5px;white-space:normal">${FX_HINT[k]}</small></span></button>`).join('');
  m.dataset.lid = ''; m.classList.add('show');
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px'; m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
}
function drawBackground(ctx, W, H, f){
  const b = DOC.bg;
  if(b.type === 'color'){ ctx.fillStyle = b.color; ctx.fillRect(0, 0, W, H); }
  else if(b.type === 'grad'){
    const a = b.angle * PI / 180, cx = W / 2, cy = H / 2, r = (Math.abs(Math.cos(a)) * W + Math.abs(Math.sin(a)) * H) / 2;
    const g = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.addColorStop(0, b.c1); g.addColorStop(1, b.c2); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }else ctx.drawImage(bgImageLayer(W, H, f), 0, 0);
  if(b.dim > 0){ ctx.fillStyle = `rgba(0,0,0,${b.dim})`; ctx.fillRect(0, 0, W, H); }
  if(b.shade.on && b.shade.amt > 0){
    const sh = b.shade, a = sh.angle * PI / 180, hx = W / 2, hy = H / 2, r = (Math.abs(Math.cos(a)) * W + Math.abs(Math.sin(a)) * H) / 2;
    const g = ctx.createLinearGradient(hx - Math.cos(a) * r, hy - Math.sin(a) * r, hx + Math.cos(a) * r, hy + Math.sin(a) * r);
    g.addColorStop(0, rgba(sh.c, 0)); g.addColorStop(clamp(1 - sh.cover, 0, 0.99), rgba(sh.c, 0)); g.addColorStop(1, rgba(sh.c, sh.amt));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if(b.tint.on && b.tint.a > 0){
    ctx.save(); ctx.globalCompositeOperation = b.tint.mode; ctx.globalAlpha = b.tint.a; ctx.fillStyle = b.tint.c; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  if(b.vignette > 0){
    const vx = W * b.fcx, vy = H * b.fcy, far = Math.max(Math.hypot(vx, vy), Math.hypot(W - vx, vy), Math.hypot(vx, H - vy), Math.hypot(W - vx, H - vy));
    const g = ctx.createRadialGradient(vx, vy, Math.min(W, H) * 0.3, vx, vy, far);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${b.vignette})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
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
function compose(ctx, W, H, live, cache){
  const f = W / DOC.w, key = JSON.stringify(DOC.bg) + '|' + W + '|' + (ASSETS[DOC.bg.asset] ? 1 : 0);
  let b = cache.get('__bg');
  if(!b || b.key !== key){ const c = mk(W, H); drawBackground(c.getContext('2d'), W, H, f); b = {key, c}; cache.set('__bg', b); }
  if(!DOC.bg.hidden){ ctx.save(); ctx.globalAlpha = clamp(DOC.bg.op ?? 1, 0, 1); ctx.drawImage(b.c, 0, 0); ctx.restore(); }
  for(const L of DOC.layers) if(!L.hidden){ if(L.type === 'fx') drawFx(ctx, L, f); else if(L.type === 'collage') drawCollage(ctx, L, f, live, cache); else drawLayer(ctx, L, f, live, cache); }
}
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
let fxEditing = false;
let frameEdit = null;
const frameEditLayer = () => { if(!frameEdit) return null; const L = DOC.layers.find(l => l.id === frameEdit); return L && L.type === 'image' && L.frame && L.frame.shape !== 'none' && !L.hidden && ASSETS[L.asset] ? L : null; };
function setFrameEdit(id){
  frameEdit = id || null;
  const b = document.getElementById('frameEditBtn'); if(b) b.lastChild.textContent = frameEdit ? '調整を終える' : 'キャンバスでフレームを調整';
  if(frameEdit) toast(isMobile ? 'ドラッグでフレームの位置、ピンチで大きさを調整。外をタップで終了' : 'ドラッグでフレームの位置、角かホイールで大きさを調整。Esc か外をクリックで終了');
  paintPreview(false);
}
// 画像上の点（ドキュメント座標）→ フレーム基準のローカル座標（画像ピクセル）
function frameLocal(L, x, y){ const a = -(L.rot || 0) * PI / 180, dx = x - L.x, dy = y - L.y; return [(dx * Math.cos(a) - dy * Math.sin(a)) / L.sc, (dx * Math.sin(a) + dy * Math.cos(a)) / L.sc]; }
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
  if(drawCollageOverlay(ctx, W, H, dpr)){ ctx.restore(); return; }
  const FE = frameEditLayer();
  if(FE){
    const G = frameGeom(FE), a = (FE.rot || 0) * PI / 180;
    ctx.save(); ctx.translate(FE.x * f, FE.y * f); ctx.rotate(a); ctx.scale(FE.sc * f, FE.sc * f);
    ctx.save(); if(FE.flip) ctx.scale(-1, 1); ctx.globalAlpha = 0.38; ctx.drawImage(G.A.img, -G.cxp, -G.cyp, G.iw, G.ih); ctx.restore();
    const k = 1 / (FE.sc * f), hw = G.fw / 2, hh = G.fh / 2;
    ctx.lineWidth = 2 * dpr * k; ctx.strokeStyle = '#ffb800'; ctx.setLineDash([7 * dpr * k, 5 * dpr * k]); ctx.strokeRect(-hw, -hh, hw * 2, hh * 2); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = dpr * k; ctx.beginPath(); framePath(ctx, FE.frame.shape, G.fw, G.fh, FE.frame.r, FE.frame.seed); ctx.stroke();
    ctx.fillStyle = '#ffb800'; ctx.strokeStyle = '#1f1b2d'; ctx.lineWidth = 2 * dpr * k;
    for(const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]){ ctx.beginPath(); ctx.arc(sx * hw, sy * hh, 7 * dpr * k, 0, 7); ctx.fill(); ctx.stroke(); }
    ctx.restore();
    ctx.font = `800 ${12 * dpr}px "M PLUS Rounded 1c", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const msg = isMobile ? 'フレーム調整中：ドラッグで位置／ピンチで大きさ／外をタップで終了' : 'フレーム調整中：ドラッグで位置／角・ホイールで大きさ／Esc か外をクリックで終了';
    const tw = ctx.measureText(msg).width + 24 * dpr; ctx.fillStyle = 'rgba(31,27,45,.88)'; ctx.beginPath(); ctx.roundRect(W / 2 - tw / 2, 8 * dpr, tw, 26 * dpr, 13 * dpr); ctx.fill();
    ctx.fillStyle = '#ffb800'; ctx.fillText(msg, W / 2, 14 * dpr);
    ctx.restore(); return;
  }
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
function paintPreview(live){
  if(!DOC || DOC.mode !== 'thumb') return;
  const st = $('#stage'), tv = $('#tv'), small = st.classList.contains('small');
  const cs = getComputedStyle(st), pw = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), ph = st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 8;
  let w = Math.max(isMobile ? 140 : 240, Math.min(pw - (isMobile ? 6 : 0), ph * 16 / 9));
  if(small) w = 246;
  tvCss = w;
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(w * dpr), H = Math.round(W * 9 / 16);
  if(tv.width !== W || tv.height !== H){ tv.width = W; tv.height = H; }
  tv.style.width = w + 'px'; tv.style.height = (w * 9 / 16) + 'px';
  const ctx = tv.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
  tv.classList.toggle('clearbg', !!DOC.bg.hidden || (DOC.bg.op ?? 1) < 1);
  compose(ctx, W, H, live, prevCache);
  if(!small) drawOverlay(ctx, W, H, dpr);
  if(!live) refreshThumbs();
  $('#info').textContent = `${DOC.exportW} × ${Math.round(DOC.exportW * 9 / 16)} px ・ ${DOC.fmt.toUpperCase()}`;
}
function livePaint(){ cancelAnimationFrame(livePaint.r); livePaint.r = requestAnimationFrame(() => paintPreview(true)); }
async function drawThumb(){
  const my = ++tok;
  for(const L of DOC.layers) if(L.type === 'text' && !L.hidden) await ensureFont(L.style);
  if(my !== tok) return;
  paintPreview(false); updateVis(); updateTextTip();
}

