/* 楽ちんサムネメーカー：サムネの描画（文字・画像レイヤー・背景・合成） */
/* ---------- 描画 ---------- */
const prevCache = new Map(), dims = new Map();
// 消えたレイヤーの描画キャッシュ・大きさの記録を捨てる（取り消し・削除のあと）
function pruneLayerCaches(){ const ids = new Set(DOC.layers.map(l => l.id)); if(globalThis.pruneMasks) pruneMasks(ids); for(const m of [prevCache, dims, cropCache, cutCache]) for(const k of [...m.keys()]) if(k !== '__bg' && !ids.has(k)) m.delete(k); }
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
    const c = render(need, Object.assign({}, L.style, {pad: 2}));
    e = {sk, k:need, c}; cache.set(L.id, e);
  }
  return e;
}
function tinted(A, color){
  // フチ色ごとに作ると色を動かすたびにメモリが増えるので、最後の1色だけ持つ
  if(A.tintColor === color && A.tintCanvas) return A.tintCanvas;
  const c = mk(A.img.naturalWidth, A.img.naturalHeight), x = c.getContext('2d');
  x.drawImage(A.img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  A.tintColor = color; return A.tintCanvas = c;
}
// 画像の明度・彩度（0 で元のまま）。フチ・影にはかけず、絵だけにかける
const imgFilter = L => { const f = []; if(L.bright) f.push(`brightness(${Math.max(0, 1 + L.bright)})`); if(L.sat) f.push(`saturate(${Math.max(0, 1 + L.sat)})`); return f.join(' ') || 'none'; };
function imageCanvas(L, f, live, cache){
  const A = layerSrc(L); if(!A) return null;
  if(L.frame && L.frame.shape && L.frame.shape !== 'none') return framedCanvas(L, f, live, cache);
  const need = L.sc * f, o = L.outline, ow = o.on ? o.w : 0;
  const sk = [L.asset, JSON.stringify(cropOf(L)), o.on, o.w, o.c, o.style, o.c2, o.w2, o.blur, L.flip, L.flipV, L.bright, L.sat, cutSig(L)].join('|');
  let e = cache.get(L.id);
  if(!(e && e.sk === sk && (live || Math.abs(e.k - need) / need < 0.02))){
    const iw = A.img.naturalWidth, ih = A.img.naturalHeight, r = ow * f, st = o.style === 'double' || o.style === 'grad' ? o.style : 'solid';
    const r2 = st === 'double' ? (ow + Math.max(0, o.w2 || 0)) * f : r, ob = r > 0 ? Math.max(0, o.blur || 0) * f : 0;
    const pad = Math.ceil(Math.max(r, r2) + ob * 1.6) + 2;
    const cw = Math.max(1, Math.round(iw * need)), ch = Math.max(1, Math.round(ih * need));
    const c = mk(cw + pad * 2, ch + pad * 2), x = c.getContext('2d');
    const flipTo = y => { if(L.flip){ y.translate(c.width, 0); y.scale(-1, 1); } if(L.flipV){ y.translate(0, c.height); y.scale(1, -1); } };
    if(r > 0){
      const O = mk(c.width, c.height), y = O.getContext('2d'); flipTo(y);
      const stamp = (t, rad) => { const n = Math.max(16, Math.min(56, Math.round(rad * 1.5)));
        for(const rr of [rad, rad * 0.55]) for(let i = 0; i < n; i++){ const a = i / n * 2 * PI; y.drawImage(t, pad + Math.cos(a) * rr, pad + Math.sin(a) * rr, cw, ch); } };
      if(st === 'double') stamp(tinted(A, o.c2), r2);
      stamp(tinted(A, o.c), r);
      if(st === 'grad'){ y.setTransform(1, 0, 0, 1, 0, 0); y.globalCompositeOperation = 'source-in'; const g = y.createLinearGradient(0, pad, 0, c.height - pad); g.addColorStop(0, o.c); g.addColorStop(1, o.c2); y.fillStyle = g; y.fillRect(0, 0, c.width, c.height); }
      if(ob > 0){ x.filter = `blur(${ob / 2}px)`; x.drawImage(O, 0, 0); x.filter = 'none'; } else x.drawImage(O, 0, 0);
    }
    flipTo(x);
    x.filter = imgFilter(L); x.drawImage(A.img, pad, pad, cw, ch); x.filter = 'none';
    e = {sk, k:need, c}; cache.set(L.id, e);
  }
  return e;
}
/* 影・光彩：絵の形（フチ込み）から作ったぼかし画像。画像のキャッシュ(e)にくっつけて使い回す。大きさは e.c の座標 */
function haloCanvas(e, q, col, blur, spread, str){
  const key = [q.toFixed(3), col, blur, spread, str].join('|'); e.halo = e.halo || new Map();
  if(e.halo.has(key)) return e.halo.get(key);
  const sp = Math.max(0, spread) * q, bl = Math.max(0, blur) * q, pad = Math.min(700, Math.ceil(sp + bl * 1.6) + 2);
  const W = e.c.width + pad * 2, H = e.c.height + pad * 2, S = mk(W, H), sx = S.getContext('2d');
  if(sp > 0.5){ const n = Math.max(16, Math.min(60, Math.round(sp * 1.5)));
    for(const rr of [sp, sp * 0.55]) for(let i = 0; i < n; i++){ const a = i / n * 2 * PI; sx.drawImage(e.c, pad + Math.cos(a) * rr, pad + Math.sin(a) * rr); } }
  sx.drawImage(e.c, pad, pad);
  sx.globalCompositeOperation = 'source-in'; sx.fillStyle = col; sx.fillRect(0, 0, W, H);
  let out = S;
  if(bl > 0.3){ out = mk(W, H); const ox = out.getContext('2d'); ox.filter = `blur(${bl / 2}px)`; ox.drawImage(S, 0, 0); ox.filter = 'none'; }
  if(str > 1){ const o2 = mk(W, H), x2 = o2.getContext('2d'); for(let i = 0; i < Math.min(4, Math.round(str)); i++) x2.drawImage(out, 0, 0); out = o2; }
  if(e.halo.size > 6) e.halo.clear();
  e.halo.set(key, out); return out;
}
function drawLayer(ctx, L, f, live, cache){
  const need = L.sc * f;
  const e = L.type === 'text' ? textCanvas(L, need, live, cache) : imageCanvas(L, f, live, cache);
  if(!e) return;
  const s = need / e.k;
  dims.set(L.id, {w: e.c.width / e.k * L.sc, h: e.c.height / e.k * L.sc});
  ctx.save(); ctx.globalAlpha = L.op ?? 1; ctx.globalCompositeOperation = L.blend || 'source-over';
  const q = f / s, drawH = (H, a, dx, dy) => { ctx.save(); ctx.globalAlpha *= a; ctx.translate(L.x * f + dx, L.y * f + dy); ctx.rotate((L.rot || 0) * PI / 180); ctx.scale(s, s); ctx.drawImage(H, -H.width / 2, -H.height / 2); ctx.restore(); };
  if(L.type === 'image'){
    const sh = L.shadow, g = L.glow;
    if(sh.on && sh.a > 0) drawH(haloCanvas(e, q, sh.c || '#000000', sh.blur, sh.sp || 0, 1), sh.a, (sh.x || 0) * f, sh.y * f);
    if(g && g.on && g.a > 0) drawH(haloCanvas(e, q, g.c, g.blur, 0, g.str || 1), g.a, 0, 0);
  }
  ctx.translate(L.x * f, L.y * f); ctx.rotate((L.rot || 0) * PI / 180); ctx.scale(s, s);
  ctx.drawImage(e.c, -e.c.width / 2, -e.c.height / 2);
  ctx.restore();
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
/* 画像の色調・効果（背景と分割フレームのマスで共通。b は bright/contrast/sat/hue/blur/tone/duo1/duo2/mosaic/mb/zb を持つ） */
function toneFilter(b, f){
  const fl = [];
  if(b.bright) fl.push(`brightness(${1 + b.bright})`);
  if(b.contrast) fl.push(`contrast(${Math.max(0, 1 + b.contrast)})`);
  if(b.sat) fl.push(`saturate(${Math.max(0, 1 + b.sat)})`);
  if(b.hue) fl.push(`hue-rotate(${b.hue}deg)`);
  if(b.tone === 'mono') fl.push('grayscale(1)'); else if(b.tone === 'sepia') fl.push('sepia(.9)');
  if(b.blur > 0) fl.push(`blur(${b.blur * f}px)`);
  return fl.join(' ') || 'none';
}
// 描き終えた画像にかける効果（2色・モザイク・モーションブラー・ズームブラー）。cx, cy はズームブラーの中心
function postFx(c, b, f, cx, cy){
  if(b.tone === 'duotone') duotone(c, b.duo1, b.duo2);
  if(b.posterize && b.posterize.on) posterize(c, b.posterize.n);
  if(b.thresh && b.thresh.on) threshold(c, b.thresh);
  if(b.tilt && b.tilt.on) tiltShift(c, b.tilt, f);
  if(b.mosaic.on) mosaic(c, b.mosaic.size * f);
  let out = c;
  if(b.mb.on && b.mb.dist > 0) out = motionBlur(out, b.mb.dist * f, b.mb.angle);
  if(b.zb.on && b.zb.amt > 0) out = zoomBlur(out, b.zb.amt, cx, cy);
  return out;
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
  x.save(); x.translate(W / 2 + b.ox * W / 2, H / 2 + b.oy * H / 2); x.rotate((b.rot || 0) * PI / 180); if(b.flip) x.scale(-1, 1);
  x.filter = toneFilter(b, f); x.drawImage(A.img, -dw / 2, -dh / 2, dw, dh); x.restore();
  return postFx(c, b, f, clamp(b.fcx, 0, 1) * W, clamp(b.fcy, 0, 1) * H);
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
  if(b.pat && b.pat.on && b.pat.a > 0) drawBgPattern(ctx, W, H, f, b.pat, W * b.fcx, H * b.fcy);
  if(b.vignette > 0){
    const vx = W * b.fcx, vy = H * b.fcy, far = Math.max(Math.hypot(vx, vy), Math.hypot(W - vx, vy), Math.hypot(vx, H - vy), Math.hypot(W - vx, H - vy));
    const g = ctx.createRadialGradient(vx, vy, Math.min(W, H) * 0.3, vx, vy, far);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${b.vignette})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
}
function compose(ctx, W, H, live, cache){
  const f = W / DOC.w, key = JSON.stringify(DOC.bg) + '|' + W + 'x' + H + '|' + DOC.w + 'x' + DOC.h + '|' + (ASSETS[DOC.bg.asset] ? 1 : 0);
  let b = cache.get('__bg');
  if(!b || b.key !== key){ const c = mk(W, H); drawBackground(c.getContext('2d'), W, H, f); b = {key, c}; cache.set('__bg', b); }
  const fo = finOn(DOC.fin), T = fo ? mk(W, H) : null, x = fo ? T.getContext('2d') : ctx;
  if(!DOC.bg.hidden){ x.save(); x.globalAlpha = clamp(DOC.bg.op ?? 1, 0, 1); x.drawImage(b.c, 0, 0); x.restore(); }
  for(const L of DOC.layers) if(!L.hidden && !L.gid) drawOne(x, L, f, live, cache);
  // 仕上げエフェクト：全部描いてから、まとめてかける
  if(fo){ applyFinish(T, DOC.fin, f); ctx.drawImage(T, 0, 0); }
}
function paintPreview(live){
  if(!DOC || DOC.mode !== 'thumb') return;
  const st = $('#stage'), tv = $('#tv'), small = st.classList.contains('small');
  const cs = getComputedStyle(st), pw = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), ph = st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 8;
  let w = Math.max(isMobile ? 140 : 240, Math.min(pw - (isMobile ? 6 : 0), ph * DOC.w / DOC.h));
  if(small) w = 246;
  tvCss = w;
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(w * dpr), H = Math.round(W * DOC.h / DOC.w);
  if(tv.width !== W || tv.height !== H){ tv.width = W; tv.height = H; }
  tv.style.width = w + 'px'; tv.style.height = (w * DOC.h / DOC.w) + 'px';
  const ctx = tv.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
  tv.classList.toggle('clearbg', !!DOC.bg.hidden || (DOC.bg.op ?? 1) < 1);
  compose(ctx, W, H, live, prevCache);
  if(!small) drawOverlay(ctx, W, H, dpr);
  updateCellFab();
  if(!live) refreshThumbs();
  $('#info').textContent = `${DOC.exportW} × ${Math.round(DOC.exportW * DOC.h / DOC.w)} px ・ ${DOC.fmt.toUpperCase()}`;
}
function livePaint(){ cancelAnimationFrame(livePaint.r); livePaint.r = requestAnimationFrame(() => paintPreview(true)); }
async function drawThumb(){
  const my = ++tok;
  for(const L of DOC.layers) if(L.type === 'text' && !L.hidden) await ensureFont(L.style); else if(L.type === 'collage') await ensureCollageFonts(L);
  if(my !== tok) return;
  paintPreview(false); updateVis(); updateTextTip();
}
// 分割フレームを選んでいるとき、キャンバスに「マスの画像を動かす」ボタンを出す
function updateCellFab(){
  const b = $('#cellFab'); if(!b) return; const L = selLayer(), show = !!(L && L.type === 'collage' && !L.hidden && !L.locked), on = !!(edit && edit.kind === 'cells');
  b.hidden = !show; b.classList.toggle('on', on); const t = on ? 'マスの調整を終える' : 'マスの画像を動かす'; if(b.lastChild.textContent !== t) b.lastChild.textContent = t;
}
