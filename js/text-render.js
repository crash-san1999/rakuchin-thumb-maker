/* 楽ちんサムネメーカー：文字の描画エンジン・装飾 */
/* ============ 描画エンジン ============ */
const PI = Math.PI;
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const mctx = mk(4, 4).getContext('2d');
const hex2rgb = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); };
const rgba = (h, a) => { const [r, g, b] = hex2rgb(h); return `rgba(${r},${g},${b},${a})`; };
const darken = (h, t) => { const [r, g, b] = hex2rgb(h); return `rgb(${r*(1-t)|0},${g*(1-t)|0},${b*(1-t)|0})`; };
const fontStr = () => `${S.weight} ${S.size}px ${S.fontLatin ? '"' + S.fontLatin + '", ' : ''}"${S.font}", "Noto Sans JP", sans-serif`;
function rng(seed){
  let a = (Math.imul(seed | 0, 2654435761) >>> 0) || 1;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/* 金属の色（上→下）。0.5付近の暗い帯が「映り込みの地平線」 */
const METALS = {
  gold:     [[0,'#fffbe0'],[.2,'#ffe07a'],[.44,'#c99212'],[.5,'#7a4d00'],[.56,'#d9a520'],[.8,'#fff1a6'],[1,'#b07a0c']],
  silver:   [[0,'#ffffff'],[.22,'#e3e7ec'],[.46,'#9aa3af'],[.5,'#4e5663'],[.56,'#bfc6cf'],[.82,'#f7f9fb'],[1,'#8d95a1']],
  chrome:   [[0,'#f4faff'],[.3,'#b9d8f5'],[.48,'#5d8fc4'],[.5,'#0f1a28'],[.53,'#4a3522'],[.7,'#c8a77c'],[1,'#fff6e6']],
  copper:   [[0,'#fff0e2'],[.22,'#f2a674'],[.46,'#a44a1c'],[.5,'#5e2206'],[.56,'#cf7440'],[.82,'#ffd1ad'],[1,'#8a3810']],
  rosegold: [[0,'#fff5f3'],[.22,'#f6c3bb'],[.46,'#c07f86'],[.5,'#7d3f4a'],[.56,'#e0a3a2'],[.82,'#ffe1dc'],[1,'#a8656e']],
  bluesteel:[[0,'#f0f8ff'],[.22,'#a9c8e6'],[.46,'#3f6b96'],[.5,'#132b45'],[.56,'#5f8db8'],[.82,'#d8ebfb'],[1,'#34597f']],
  gunmetal: [[0,'#d9dde2'],[.22,'#8a929c'],[.46,'#3a4048'],[.5,'#15181c'],[.56,'#4b525c'],[.82,'#a3abb5'],[1,'#2a2f35']],
  holo:     [[0,'#ffc2ec'],[.2,'#ffe89a'],[.4,'#b5ffc9'],[.6,'#9fe3ff'],[.8,'#c9b0ff'],[1,'#ffc2ec']],
};

function parse(text){
  return text.split('\n').map(line => {
    const segs = []; let acc = false, buf = '';
    for(const ch of line){
      if(ch === '{' && !acc){ if(buf) segs.push({t:buf, a:false}); buf = ''; acc = true; }
      else if(ch === '}' && acc){ if(buf) segs.push({t:buf, a:true}); buf = ''; acc = false; }
      else buf += ch;
    }
    if(buf) segs.push({t:buf, a:acc});
    return segs;
  });
}
function layout(){
  mctx.font = fontStr(); mctx.letterSpacing = S.ls + 'px';
  const lines = parse(S.text).map(segs => {
    let w = 0; segs.forEach(s => { s.w = mctx.measureText(s.t).width; w += s.w; });
    return {segs, w};
  });
  const w = Math.max(1, ...lines.map(l => l.w));
  const lineH = S.size * S.lh;
  const h = lineH * (lines.length - 1) + S.size * 1.25;
  return {lines, w, h, lineH};
}
const baseY = (L, i) => S.size * 0.98 + i * L.lineH;
const lineTop = (L, i) => baseY(L, i) - S.size * 0.9;

/* 描画する文字の並び（ゆらぎONなら1文字ずつ） */
function glyphs(L){
  const items = [], R = rng(S.jitter.seed), J = S.jitter.on;
  mctx.font = fontStr(); mctx.letterSpacing = S.ls + 'px';
  L.lines.forEach((ln, i) => {
    let x = S.align === 'left' ? 0 : S.align === 'right' ? L.w - ln.w : (L.w - ln.w) / 2;
    const y = baseY(L, i);
    ln.segs.forEach(s => {
      if(!J){ items.push({t:s.t, x, y, a:s.a, line:i}); x += s.w; return; }
      for(const ch of s.t){
        const cw = mctx.measureText(ch).width;
        items.push({t:ch, x, y, a:s.a, line:i, cw,
          rot:(R()*2-1) * S.jitter.rot * PI / 180, dy:(R()*2-1) * S.jitter.y, sc:1 + (R()*2-1) * S.jitter.scale});
        x += cw;
      }
    });
  });
  return items;
}
function drawGlyphs(ctx, items, op){
  const mid = S.size * 0.38;
  for(const it of items){
    if(it.rot === undefined){ op(it, it.x, it.y); continue; }
    ctx.save(); ctx.translate(it.x + it.cw / 2, it.y - mid + it.dy); ctx.rotate(it.rot); ctx.scale(it.sc, it.sc);
    op(it, -it.cw / 2, mid); ctx.restore();
  }
}

/* 塗り */
function angGrad(ctx, L, stops, line, ang){
  const a = (ang ?? S.gradAngle) * PI / 180;
  const bx = 0, bw = L.w, by = line === undefined ? 0 : lineTop(L, line), bh = line === undefined ? L.h : S.size * 1.05;
  const cx = bx + bw / 2, cy = by + bh / 2, r = (Math.abs(Math.cos(a)) * bw + Math.abs(Math.sin(a)) * bh) / 2;
  const g = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
function vGrad(ctx, L, i, stops){
  const top = lineTop(L, i), g = ctx.createLinearGradient(0, top, 0, top + S.size * 1.02);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
function fillStyles(ctx, L){
  const n = L.lines.length, idx = [...Array(n).keys()];
  const two = (c1, c2, mid) => mid ? [[0,c1],[.5,mid],[1,c2]] : [[0,c1],[1,c2]];
  let main, acc;
  if(S.fillType === 'solid'){ main = () => S.fill1; acc = () => S.accent1; }
  else if(S.fillType === 'grad'){
    const ms = two(S.fill1, S.fill2, S.fill3on ? S.fill3 : null), as = two(S.accent1, S.accent2);
    if(S.gradScope === 'line'){
      const gm = idx.map(i => angGrad(ctx, L, ms, i)), ga = idx.map(i => angGrad(ctx, L, as, i));
      main = it => gm[it.line]; acc = it => ga[it.line];
    }else{
      const gm = angGrad(ctx, L, ms), ga = angGrad(ctx, L, as); main = () => gm; acc = () => ga;
    }
  }else if(S.fillType === 'split'){
    const p = S.splitPos, sp = (c1, c2) => [[0,c1],[p,c1],[Math.min(1, p + 0.002),c2],[1,c2]];
    if(S.splitDir === 'h'){
      const gm = idx.map(i => vGrad(ctx, L, i, sp(S.fill1, S.fill2))), ga = idx.map(i => vGrad(ctx, L, i, sp(S.accent1, S.accent2)));
      main = it => gm[it.line]; acc = it => ga[it.line];
    }else{
      const gm = angGrad(ctx, L, sp(S.fill1, S.fill2), undefined, 0), ga = angGrad(ctx, L, sp(S.accent1, S.accent2), undefined, 0);
      main = () => gm; acc = () => ga;
    }
  }else{
    const st = METALS[S.metal] || METALS.gold, as = two(S.accent1, S.accent2);
    const gm = idx.map(i => S.metal === 'holo' ? angGrad(ctx, L, st, i, 20) : vGrad(ctx, L, i, st));
    const ga = idx.map(i => vGrad(ctx, L, i, as));
    main = it => gm[it.line]; acc = it => ga[it.line];
  }
  return it => it.a ? acc(it) : main(it);
}

/* ピクセル処理 */
function bbox(c){
  const w = c.width, h = c.height, d = c.getContext('2d', {willReadFrequently:true}).getImageData(0, 0, w, h).data;
  let t = h, l = w, r = -1, b = -1;
  for(let y = 0; y < h; y++){
    const row = y * w * 4;
    for(let i = 0; i < w; i++){
      if(d[row + i * 4 + 3] > 2){ if(i < l) l = i; if(i > r) r = i; if(y < t) t = y; if(y > b) b = y; }
    }
  }
  return r < 0 ? null : {l, t, r, b};
}
function trim(c, pad){
  const bb = bbox(c); if(!bb) return mk(1, 1);
  const cw = bb.r - bb.l + 1, ch = bb.b - bb.t + 1, o = mk(cw + pad * 2, ch + pad * 2);
  o.getContext('2d').drawImage(c, bb.l, bb.t, cw, ch, pad, pad, cw, ch);
  return o;
}
function boxBlur(src, w, h, r){
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), div = 2 * r + 1;
  for(let y = 0; y < h; y++){
    const o = y * w; let acc = 0;
    for(let k = -r; k <= r; k++) acc += src[o + Math.min(w - 1, Math.max(0, k))];
    for(let x = 0; x < w; x++){ tmp[o + x] = acc / div; acc += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)]; }
  }
  for(let x = 0; x < w; x++){
    let acc = 0;
    for(let k = -r; k <= r; k++) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for(let y = 0; y < h; y++){ out[y * w + x] = acc / div; acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
  }
  return out;
}
/* ベベル：アルファから高さマップを作り、光の向きで陰影をつける（浮き出し／彫り込み） */
function bevel(c, sizePx, b){
  const bb = bbox(c); if(!bb) return;
  const W = c.width, H = c.height, r = Math.max(1, Math.round(sizePx / 2));
  const l = Math.max(0, bb.l - 2), t = Math.max(0, bb.t - 2), w = Math.min(W, bb.r + 3) - l, h = Math.min(H, bb.b + 3) - t;
  const ctx = c.getContext('2d', {willReadFrequently:true});
  const img = ctx.getImageData(l, t, w, h), d = img.data, n = w * h;
  const a = new Float32Array(n); for(let i = 0; i < n; i++) a[i] = d[i * 4 + 3] / 255;
  const hm = boxBlur(boxBlur(a, w, h, r), w, h, r);
  const la = b.angle * PI / 180, lx = Math.cos(la), ly = Math.sin(la);
  const k = r * 2 * b.depth * (b.style === 'deboss' ? -1 : 1);
  for(let y = 1; y < h - 1; y++){
    for(let x = 1; x < w - 1; x++){
      const i = y * w + x, p = i * 4; if(!d[p + 3]) continue;
      let s = (-(hm[i + 1] - hm[i - 1]) * lx - (hm[i + w] - hm[i - w]) * ly) * k;
      if(s > 1) s = 1; else if(s < -1) s = -1;
      if(s > 0){ const f = Math.pow(s, 0.8) * b.hl; d[p] += (255 - d[p]) * f; d[p+1] += (255 - d[p+1]) * f; d[p+2] += (255 - d[p+2]) * f; }
      else if(s < 0){ const f = 1 + s * b.sh; d[p] *= f; d[p+1] *= f; d[p+2] *= f; }
    }
  }
  ctx.putImageData(img, l, t);
}
/* 模様（文字の中だけ） */
function drawPattern(c, scale){
  const p = S.pattern, sz = Math.max(2, Math.round(p.size * scale));
  let tile, tr = new DOMMatrix().rotateSelf(p.angle);
  if(p.type === 'glitter'){
    tile = mk(96, 96); const x = tile.getContext('2d'), R = rng(11), [r, g, bl] = hex2rgb(p.c);
    for(let i = 0; i < 700; i++){
      const lv = R(), s2 = 1 + R() * 2.5;
      x.fillStyle = lv > 0.85 ? '#ffffff' : `rgba(${Math.min(255, r * (0.4 + lv)) | 0},${Math.min(255, g * (0.4 + lv)) | 0},${Math.min(255, bl * (0.4 + lv)) | 0},${0.5 + R() * 0.5})`;
      x.fillRect(R() * 96, R() * 96, s2, s2);
    }
    tr = tr.scaleSelf(Math.max(0.3, sz / 16));
  }else if(p.type === 'noise'){
    tile = mk(128, 128); const x = tile.getContext('2d'), id = x.createImageData(128, 128), R = rng(7), [r, g, bl] = hex2rgb(p.c);
    for(let i = 0; i < 128 * 128; i++){ id.data[i*4] = r; id.data[i*4+1] = g; id.data[i*4+2] = bl; id.data[i*4+3] = R() * 255; }
    x.putImageData(id, 0, 0); tr = tr.scaleSelf(Math.max(0.25, sz / 16));
  }else{
    tile = mk(sz, sz); const x = tile.getContext('2d'); x.fillStyle = p.c;
    if(p.type === 'stripe') x.fillRect(0, 0, sz / 2, sz);
    else if(p.type === 'dot'){ x.beginPath(); x.arc(sz / 2, sz / 2, sz * 0.28, 0, 7); x.fill(); }
    else if(p.type === 'check'){ x.fillRect(0, 0, sz / 2, sz / 2); x.fillRect(sz / 2, sz / 2, sz / 2, sz / 2); }
    else if(p.type === 'grid'){ const lw = Math.max(1, sz * 0.1); x.fillRect(0, 0, sz, lw); x.fillRect(0, 0, lw, sz); }
  }
  const cx = c.getContext('2d'), pat = cx.createPattern(tile, 'repeat');
  if(pat.setTransform) pat.setTransform(tr);
  cx.save(); cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalCompositeOperation = 'source-atop'; cx.globalAlpha = p.a;
  cx.fillStyle = pat; cx.fillRect(0, 0, c.width, c.height); cx.restore();
}
/* テカリ（行ごとの上半分ハイライト） */
function drawGloss(ctx, L){
  const g = S.gloss;
  ctx.save(); ctx.globalCompositeOperation = 'source-atop';
  L.lines.forEach((ln, i) => {
    const top = lineTop(L, i) - S.size * 0.15, bot = lineTop(L, i) + S.size * 1.02 * g.h;
    const x0 = -S.size, x1 = L.w + S.size;
    const gr = ctx.createLinearGradient(0, top, 0, bot);
    gr.addColorStop(0, `rgba(255,255,255,${g.a})`); gr.addColorStop(1, `rgba(255,255,255,${g.a * 0.35})`);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x0, top); ctx.lineTo(x1, top); ctx.lineTo(x1, bot);
    ctx.quadraticCurveTo((x0 + x1) / 2, bot + S.size * 0.35 * g.curve, x0, bot); ctx.closePath(); ctx.fill();
  });
  ctx.restore();
}
/* マーカー（文字の後ろの帯） */
function drawMarker(ctx, L){
  const m = S.marker;
  ctx.save(); ctx.fillStyle = rgba(m.c, m.a);
  L.lines.forEach((ln, i) => {
    if(!ln.segs.length) return;
    const x0 = S.align === 'left' ? 0 : S.align === 'right' ? L.w - ln.w : (L.w - ln.w) / 2;
    const over = S.size * m.over, hh = S.size * m.h, cy = lineTop(L, i) + S.size * 1.02 * m.pos;
    const x = x0 - over, w = ln.w + over * 2, y = cy - hh / 2, rr = Math.min(hh / 2, S.size * 0.08);
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, hh, rr) : ctx.rect(x, y, w, hh); ctx.fill();
  });
  ctx.restore();
}
/* かすれ */
function applyGrunge(c, scale){
  const g = S.grunge, bb = bbox(c); if(!bb) return;
  const R = rng(g.seed), sz = g.size * scale, bw = bb.r - bb.l, bh = bb.b - bb.t;
  const x = c.getContext('2d'); x.save(); x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000'; x.strokeStyle = '#000';
  const n = Math.min(40000, Math.round(g.amt * bw * bh / (sz * sz) * 0.06));
  for(let i = 0; i < n; i++){
    const px = bb.l + R() * bw, py = bb.t + R() * bh, rr = sz * (0.25 + Math.pow(R(), 3) * 2.2);
    x.globalAlpha = 0.5 + R() * 0.5; x.beginPath(); x.ellipse(px, py, rr, rr * (0.5 + R() * 0.8), R() * PI, 0, 7); x.fill();
  }
  x.lineCap = 'round';
  const m = Math.round(g.amt * 25);
  for(let i = 0; i < m; i++){
    x.globalAlpha = 0.6 + R() * 0.4; x.lineWidth = sz * (0.2 + R() * 0.6);
    const px = bb.l + R() * bw, py = bb.t + R() * bh, an = R() * PI, len = (0.05 + R() * 0.25) * bw;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(an) * len, py + Math.sin(an) * len * 0.3); x.stroke();
  }
  x.restore();
}
/* ワープ（列／行ごとにずらして変形） */
function warp(src){
  const w = S.warp; if(w.type === 'none' || !w.amt) return src;
  const bb = bbox(src); if(!bb) return src;
  const W = src.width, H = src.height, cw = bb.r - bb.l + 1, ch = bb.b - bb.t + 1, cx = bb.l + cw / 2, cy = bb.t + ch / 2, A = w.amt;
  if(w.type === 'trap'){
    const o = mk(W, H), x = o.getContext('2d');
    for(let y = 0; y < H; y++){
      const v = Math.min(1, Math.max(0, (y - bb.t) / ch));
      const s = A >= 0 ? 1 - A * 0.9 * (1 - v) : 1 + A * 0.9 * v;
      x.drawImage(src, 0, y, W, 1, cx - cx * s, y, W * s, 1);
    }
    return o;
  }
  const U = px => Math.min(1, Math.max(0, (px - bb.l) / cw)), amp = A * ch;
  const fn = {
    arch:  u => [-amp * 0.6 * (1 - (2*u - 1) ** 2), 1],
    wave:  u => [amp * 0.35 * Math.sin(2 * PI * w.freq * u), 1],
    bulge: u => [0, Math.max(0.1, 1 + A * 0.8 * (1 - (2*u - 1) ** 2))],
    persp: u => [0, Math.max(0.1, 1 + A * 0.8 * (2*u - 1))],
    rise:  u => [-amp * 0.5 * (2*u - 1), 1],
  }[w.type];
  if(!fn) return src;
  let minY = 0, maxY = H;
  for(let px = 0; px < W; px += 2){ const [dy, s] = fn(U(px)); minY = Math.min(minY, cy - cy * s + dy); maxY = Math.max(maxY, cy + (H - cy) * s + dy); }
  const off = -Math.floor(minY), o = mk(W, Math.ceil(maxY - minY) + 2), x = o.getContext('2d');
  for(let px = 0; px < W; px++){ const [dy, s] = fn(U(px + 0.5)); x.drawImage(src, px, 0, 1, H, px, off + cy - cy * s + dy, 1, H * s); }
  return o;
}
function effectOnly(src, ox, oy, blur, color, scale){
  const c = mk(src.width, src.height), x = c.getContext('2d'), OFF = src.width + 200;
  x.shadowColor = color; x.shadowBlur = blur * scale; x.shadowOffsetX = ox * scale + OFF; x.shadowOffsetY = oy * scale;
  x.drawImage(src, -OFF, 0);
  return c;
}
/* グリッチ */
function glitch(B, scale){
  const g = S.glitch, W = B.width, H = B.height, d = g.rgb * scale;
  const out = mk(W, H), o = out.getContext('2d');
  if(d > 0){
    const tint = col => { const c = mk(W, H), x = c.getContext('2d'); x.drawImage(B, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, W, H); return c; };
    o.globalAlpha = 0.9; o.drawImage(tint('#00e5ff'), -d, 0);
    o.globalCompositeOperation = 'lighter'; o.drawImage(tint('#ff0040'), d, 0);
    o.globalCompositeOperation = 'source-over'; o.globalAlpha = 1;
  }
  o.drawImage(B, 0, 0);
  if(g.slices > 0 && g.shift > 0){
    const bb = bbox(out) || {t:0, b:H}, R = rng(g.seed), span = bb.b - bb.t;
    for(let i = 0; i < g.slices; i++){
      const copy = mk(W, H); copy.getContext('2d').drawImage(out, 0, 0);
      const y = bb.t + R() * span, h = Math.max(2, (0.02 + R() * 0.09) * span), dx = (R() * 2 - 1) * g.shift * scale;
      o.clearRect(0, y, W, h); o.drawImage(copy, 0, y, W, h, dx, y, W, h);
    }
  }
  return out;
}

const blit = (dst, src) => { const c = dst.getContext('2d'); c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(src, 0, 0); c.restore(); };
const cut = (dst, src) => { const c = dst.getContext('2d'); c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'destination-out'; c.drawImage(src, 0, 0); c.restore(); };

/* 1文字ずつの位置（一文字囲み・傍点用） */
function charCells(items){
  if(S.jitter.on) return items.filter(it => it.t.trim());
  const out = []; mctx.font = fontStr(); mctx.letterSpacing = S.ls + 'px';
  items.forEach(it => {
    let x = it.x;
    for(const ch of it.t){ const cw = mctx.measureText(ch).width; if(ch.trim()) out.push({t:ch, x, y:it.y, a:it.a, line:it.line, cw}); x += cw; }
  });
  return out;
}
function withCell(ctx, c, fn){
  ctx.save(); ctx.translate(c.x + (c.cw - S.ls) / 2, c.y - S.size * 0.38 + (c.dy || 0));
  if(c.rot) ctx.rotate(c.rot); if(c.sc) ctx.scale(c.sc, c.sc);
  fn(); ctx.restore();
}
/* 一文字囲み */
const RANSOM = ['#e8132b', '#111111', '#1f5fd6', '#0f9d58', '#7b2cbf', '#ff6a00', '#c2185b'];
function boxPath(ctx, shape, h){
  ctx.beginPath();
  if(shape === 'circle') ctx.arc(0, 0, h * 1.08, 0, 7);
  else if(shape === 'diamond'){ const k = h * 1.4; ctx.moveTo(0, -k); ctx.lineTo(k, 0); ctx.lineTo(0, k); ctx.lineTo(-k, 0); ctx.closePath(); }
  else if(shape === 'round') ctx.roundRect(-h, -h, 2 * h, 2 * h, h * 0.3);
  else ctx.rect(-h, -h, 2 * h, 2 * h);
}
function drawBoxes(ctx, cells){
  const b = S.box, h = S.size * (0.5 + b.pad);
  cells.forEach((c, i) => withCell(ctx, c, () => {
    boxPath(ctx, b.shape, h);
    if(b.sw > 0){ ctx.lineWidth = b.sw * 2; ctx.strokeStyle = b.sc; ctx.lineJoin = 'round'; ctx.stroke(); }
    ctx.fillStyle = b.rand ? RANSOM[Math.floor(rng(i * 97 + 5)() * RANSOM.length)] : (b.alt && i % 2 ? b.c2 : b.c); ctx.fill();
  }));
}
/* 傍点 */
function dotPath(ctx){
  const d = S.dots, r = S.size * d.size * 0.5, y = -S.size * 0.5 - r * 1.3;
  ctx.beginPath();
  if(d.shape === 'ring'){ ctx.arc(0, y, r, 0, 7); ctx.moveTo(r * 0.5, y); ctx.arc(0, y, r * 0.5, 0, 7, true); }
  else if(d.shape === 'tri'){ ctx.moveTo(-r, y - r * 0.8); ctx.lineTo(r, y - r * 0.8); ctx.lineTo(0, y + r * 0.9); ctx.closePath(); }
  else ctx.arc(0, y, r, 0, 7);
}
/* 背景シェイプ（角丸・楕円・ギザギザ・吹き出し・斜め帯） */
function drawPlate(ctx, L, outer){
  const p = S.plate, pad = S.size * p.pad + outer;
  const x0 = -pad, y0 = lineTop(L, 0) - pad, x1 = L.w + pad, y1 = baseY(L, L.lines.length - 1) + S.size * 0.14 + pad;
  const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  ctx.save(); ctx.beginPath(); ctx.lineJoin = 'round';
  switch(p.shape){
    case 'ellipse': ctx.ellipse(cx, cy, w / 2 * 1.18, h / 2 * 1.3, 0, 0, 7); break;
    case 'burst': {
      const R = rng(p.seed), n = Math.max(12, Math.round((w + h) / (S.size * 0.45)));
      for(let i = 0; i <= n * 2; i++){
        const a = i / (n * 2) * 2 * PI, k = i % 2 === 0 ? 1.3 + R() * 0.14 : 1.06;
        const px = cx + Math.cos(a) * w / 2 * k, py = cy + Math.sin(a) * h / 2 * k * 1.08;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); break;
    }
    case 'bubble': {
      ctx.roundRect(x0, y0, w, h, Math.min(h / 2, S.size * 0.3));
      const right = p.tail === 'right', tx = right ? x1 - w * 0.22 : x0 + w * 0.22, dir = right ? 1 : -1;
      ctx.moveTo(tx - S.size * 0.25, y1 - 2); ctx.lineTo(tx + dir * S.size * 0.4, y1 + S.size * 0.55); ctx.lineTo(tx + S.size * 0.25, y1 - 2); ctx.closePath();
      break;
    }
    case 'para': { const k = h * 0.35; ctx.moveTo(x0 + k, y0); ctx.lineTo(x1 + k, y0); ctx.lineTo(x1 - k, y1); ctx.lineTo(x0 - k, y1); ctx.closePath(); break; }
    default: ctx.roundRect(x0, y0, w, h, Math.min(h / 2, S.size * 0.3));
  }
  if(p.sw > 0){ ctx.lineWidth = p.sw * 2; ctx.strokeStyle = p.sc; ctx.stroke(); }
  ctx.fillStyle = rgba(p.c, p.a); ctx.fill();
  ctx.restore();
}
/* 押し出し（ストライプ・奥のフェード対応） */
function drawExtrude(prep, W, H, items, outer, scale){
  const e = S.extrude, ex = e.depth, a = e.angle * PI / 180, step = Math.max(0.25, 1 / scale);
  const E = mk(W, H), x = prep(E), D = e.fade > 0 ? mk(W, H) : null, dx = D ? prep(D) : null;
  const pass = (c, col, d) => {
    c.save(); c.translate(Math.cos(a) * d, Math.sin(a) * d); c.fillStyle = c.strokeStyle = col; c.lineWidth = outer * 2;
    drawGlyphs(c, items, (it, px, py) => { if(outer > 0) c.strokeText(it.t, px, py); c.fillText(it.t, px, py); });
    c.restore();
  };
  for(let d = ex; d > 0; d -= step){
    const base = e.stripe && Math.floor(d / Math.max(0.5, e.stripeW)) % 2 ? e.c2 : e.c;
    pass(x, darken(base, e.shade * (d / ex)), d);
    if(dx){ const g = Math.round(255 * d / ex); pass(dx, `rgb(${g},${g},${g})`, d); }
  }
  if(D){
    const ec = E.getContext('2d', {willReadFrequently:true}), ei = ec.getImageData(0, 0, W, H), ed = ei.data;
    const dd = D.getContext('2d', {willReadFrequently:true}).getImageData(0, 0, W, H).data;
    for(let i = 3; i < ed.length; i += 4) if(ed[i]) ed[i] *= 1 - e.fade * (dd[i - 3] / 255);
    ec.putImageData(ei, 0, 0);
  }
  return E;
}
/* 板ずれ（ずらした影。中抜きにもできる） */
function drawOffsetLayer(prep, W, H, items, outer){
  const o = S.offset, O = mk(W, H), x = prep(O);
  x.translate(o.x, o.y); x.fillStyle = x.strokeStyle = o.c;
  const sil = lw => { x.lineWidth = lw; drawGlyphs(x, items, (it, px, py) => { if(lw > 0) x.strokeText(it.t, px, py); x.fillText(it.t, px, py); }); };
  if(o.hollow){ sil((outer + o.w) * 2); x.globalCompositeOperation = 'destination-out'; sil(outer * 2); }
  else sil(outer * 2);
  return O;
}
/* インナーシャドウ（文字の内側に落ちる影） */
function innerShadow(F, scale){
  const s = S.inner, W = F.width, H = F.height, inv = mk(W, H), ix = inv.getContext('2d');
  ix.fillStyle = '#000'; ix.fillRect(0, 0, W, H); ix.globalCompositeOperation = 'destination-out'; ix.drawImage(F, 0, 0);
  const sh = effectOnly(inv, s.x, s.y, s.blur, rgba(s.c, s.a), scale);
  const fx = F.getContext('2d'); fx.save(); fx.setTransform(1, 0, 0, 1, 0, 0); fx.globalCompositeOperation = 'source-atop'; fx.drawImage(sh, 0, 0); fx.restore();
}
/* 鏡面反射（下に反転して映す） */
function addReflection(B, body, scale){
  const r = S.reflect, bb = bbox(body); if(!bb) return B;
  const ch = bb.b - bb.t + 1, len = Math.max(1, Math.round(ch * r.len)), gap = Math.round(r.gap * scale), W = B.width;
  const R = mk(W, len), rx = R.getContext('2d');
  rx.save(); rx.scale(1, -1); rx.drawImage(body, 0, bb.b - len + 1, W, len, 0, -len, W, len); rx.restore();
  rx.globalCompositeOperation = 'destination-in';
  const g = rx.createLinearGradient(0, 0, 0, len); g.addColorStop(0, `rgba(0,0,0,${r.a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  rx.fillStyle = g; rx.fillRect(0, 0, W, len);
  const O = mk(W, Math.max(B.height, bb.b + 1 + gap + len + 2)), ox = O.getContext('2d');
  ox.drawImage(R, 0, bb.b + 1 + gap); ox.drawImage(B, 0, 0);
  return O;
}

/* ---------- 海外リファレンス由来の装飾 ---------- */
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function makeNoise(seed){
  const R = rng(seed), N = 256, tab = new Float32Array(N * N);
  for(let i = 0; i < tab.length; i++) tab[i] = R();
  const v = (x, y) => tab[((y & 255) << 8) + (x & 255)];
  const sm = t => t * t * (3 - 2 * t);
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  return (x, y) => (n(x, y) * 0.6 + n(x * 2.1 + 5.2, y * 2.1 + 1.3) * 0.3 + n(x * 4.3 + 9.1, y * 4.3 + 7.7) * 0.1) * 2 - 1;
}
/* ノイズでピクセルをずらす（ゆがみ・炎） */
function displace(c, amp, sc, seed, stretchY){
  const bb = bbox(c); if(!bb || amp <= 0) return;
  const W = c.width, H = c.height, pad = Math.ceil(amp) + 2;
  const l = Math.max(0, bb.l - pad), t = Math.max(0, bb.t - pad), r = Math.min(W - 1, bb.r + pad), b = Math.min(H - 1, bb.b + pad);
  const w = r - l + 1, h = b - t + 1, ctx = c.getContext('2d', {willReadFrequently:true});
  const src = ctx.getImageData(l, t, w, h).data, out = ctx.createImageData(w, h), od = out.data, nz = makeNoise(seed);
  const sy = sc * (stretchY || 1);
  for(let y = 0; y < h; y++){
    for(let x = 0; x < w; x++){
      const nx = (x + l) / sc, ny = (y + t) / sy;
      const sx = Math.round(x + nz(nx, ny) * amp), syy = Math.round(y + nz(nx + 31.7, ny + 17.3) * amp);
      if(sx < 0 || syy < 0 || sx >= w || syy >= h) continue;
      const si = (syy * w + sx) * 4, oi = (y * w + x) * 4;
      od[oi] = src[si]; od[oi+1] = src[si+1]; od[oi+2] = src[si+2]; od[oi+3] = src[si+3];
    }
  }
  ctx.putImageData(out, l, t);
}
/* 炎：文字の上端から炎の舌を立ちのぼらせる */
function makeFire(body, scale){
  const f = S.fire, W = body.width, H = body.height, bb = bbox(body), out = mk(W, H);
  if(!bb) return out;
  const d = body.getContext('2d', {willReadFrequently:true}).getImageData(0, 0, W, H).data;
  const R = rng(f.seed), sp = Math.max(3, S.size * 0.09 * scale), tops = [];
  for(let x = bb.l; x <= bb.r; x += sp){
    const xi = Math.round(x + (R() - 0.5) * sp * 0.6);
    for(let y = Math.max(1, bb.t); y <= bb.b; y++){
      const k = (y * W + xi) * 4 + 3;
      if(d[k] > 128 && d[k - W * 4] <= 128){ tops.push([xi, y]); y += Math.round(S.size * 0.25 * scale); }
    }
  }
  const o = out.getContext('2d');
  // 土台の赤い照り返し
  const sil = mk(W, H), sx = sil.getContext('2d');
  sx.drawImage(body, 0, 0); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = f.c3; sx.fillRect(0, 0, W, H);
  o.filter = `blur(${Math.max(2, S.size * 0.08 * scale)}px)`; o.globalAlpha = 0.9; o.drawImage(sil, 0, -S.size * 0.05 * scale); o.filter = 'none'; o.globalAlpha = 1;
  const T = mk(W, H), t = T.getContext('2d');
  const tongue = (x, y, h, w, sway, c0, c1, c2, a) => {
    const o = t, g = o.createLinearGradient(0, y, 0, y - h);
    g.addColorStop(0, rgba(c0, a)); g.addColorStop(0.45, rgba(c1, a * 0.9)); g.addColorStop(1, rgba(c2, 0));
    o.fillStyle = g; o.beginPath(); o.moveTo(x - w, y + w * 0.4);
    o.bezierCurveTo(x - w * 0.9, y - h * 0.35, x + sway - w * 0.35, y - h * 0.7, x + sway, y - h);
    o.bezierCurveTo(x + sway + w * 0.35, y - h * 0.7, x + w * 0.9, y - h * 0.35, x + w, y + w * 0.4);
    o.closePath(); o.fill();
  };
  const Hs = f.height * S.size * scale, wild = f.wild;
  t.globalCompositeOperation = 'lighter';
  for(const [x, y] of tops){   // 外炎
    const h = Hs * (0.35 + R() * 0.75), w = S.size * scale * (0.09 + R() * 0.08);
    tongue(x, y, h, w, (R() - 0.5) * w * 3 * wild, f.c2, f.c3, f.c3, 0.55);
  }
  for(const [x, y] of tops){   // 内炎（芯）
    if(R() < 0.35) continue;
    const h = Hs * (0.2 + R() * 0.4), w = S.size * scale * (0.05 + R() * 0.05);
    tongue(x, y, h, w, (R() - 0.5) * w * 2.5 * wild, f.c1, f.c2, f.c3, 0.65);
  }
  o.filter = `blur(${Math.max(1, S.size * 0.02 * scale)}px)`; o.drawImage(T, 0, 0); o.filter = 'none';
  return out;
}
/* ドリップ（とろ〜り／つらら）：塗りの下端から垂らす */
function drawDrips(F, K, outerPx, strokeColor, scale){
  const dr = S.drip, bb = bbox(F); if(!bb) return;
  const W = F.width, R = rng(dr.seed), fctx = F.getContext('2d', {willReadFrequently:true});
  const d = fctx.getImageData(0, 0, W, F.height).data;
  const wPx = Math.max(3, dr.w * S.size * scale), step = Math.max(2, Math.round(wPx * 1.4)), gapPx = S.size * 0.22 * scale;
  const list = [];
  for(let x = bb.l + step; x < bb.r - step; x += step){
    for(let y = bb.t; y < bb.b; y++){
      const i = (y * W + x) * 4 + 3;
      if(d[i] > 160 && d[i + W * 4] <= 160 && R() < dr.amt){
        let open = true; for(let k = 2; k <= gapPx && open; k += 2){ const yy = y + k; if(yy >= F.height || d[(yy * W + x) * 4 + 3] > 40) open = false; }
        if(!open) continue;
        const j = (Math.max(0, y - 3) * W + x) * 4;
        const col = dr.sample ? `rgb(${d[j]},${d[j+1]},${d[j+2]})` : dr.c;
        list.push({x, y, len:(0.25 + Math.pow(R(), 1.5) * 0.9) * dr.len * S.size * scale, w:wPx * (0.6 + R() * 0.6), col});
      }
    }
  }
  const path = (c, q) => {
    const w2 = q.w / 2, x = q.x, y = q.y; c.beginPath();
    if(dr.style === 'icicle'){ c.moveTo(x - w2, y - 2); c.lineTo(x, y + q.len); c.lineTo(x + w2, y - 2); c.closePath(); return; }
    c.moveTo(x - w2 * 1.6, y - 2); c.quadraticCurveTo(x - w2 * 0.8, y, x - w2 * 0.8, y + q.len * 0.5);
    c.lineTo(x - w2 * 0.8, y + q.len); c.arc(x, y + q.len, w2 * 1.05, PI, 0, true);
    c.lineTo(x + w2 * 0.8, y + q.len * 0.5); c.quadraticCurveTo(x + w2 * 0.8, y, x + w2 * 1.6, y - 2); c.closePath();
  };
  if(outerPx > 0 && strokeColor){
    const k = K.getContext('2d'); k.save(); k.setTransform(1, 0, 0, 1, 0, 0);
    k.strokeStyle = k.fillStyle = strokeColor; k.lineWidth = outerPx * 2; k.lineJoin = 'round';
    list.forEach(q => { path(k, q); k.stroke(); k.fill(); }); k.restore();
  }
  fctx.save(); fctx.setTransform(1, 0, 0, 1, 0, 0);
  list.forEach(q => { fctx.fillStyle = q.col; path(fctx, q); fctx.fill(); }); fctx.restore();
}
/* ハーフトーン（下ほど大きい網点） */
function drawHalftone(F, scale){
  const p = S.pattern, bb = bbox(F); if(!bb) return;
  const sz = Math.max(3, p.size * scale), x = F.getContext('2d');
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = p.a; x.fillStyle = p.c;
  const a = p.angle * PI / 180, ca = Math.cos(a), sa = Math.sin(a), cx = (bb.l + bb.r) / 2, cy = (bb.t + bb.b) / 2;
  const Rr = Math.hypot(bb.r - bb.l, bb.b - bb.t) / 2 + sz, hh = Math.max(1, bb.b - bb.t);
  x.beginPath();
  for(let u = -Rr; u <= Rr; u += sz) for(let v = -Rr; v <= Rr; v += sz){
    const px = cx + u * ca - v * sa, py = cy + u * sa + v * ca;
    if(px < bb.l - sz || px > bb.r + sz || py < bb.t - sz || py > bb.b + sz) continue;
    const r = sz * 0.62 * Math.max(0, Math.min(1, (py - bb.t) / hh));
    if(r < 0.4) continue;
    x.moveTo(px + r, py); x.arc(px, py, r, 0, 7);
  }
  x.fill(); x.restore();
}
/* 80年代のラインカット（下半分に切れ込み） */
function drawCutLines(ctx, L){
  const p = S.pattern, n = Math.max(2, Math.round(p.size / 3));
  ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000';
  L.lines.forEach((ln, i) => {
    const top = lineTop(L, i) + S.size * 0.48, bot = baseY(L, i) + S.size * 0.03, band = (bot - top) / n;
    for(let k = 0; k < n; k++){
      const th = band * (0.12 + 0.55 * (k / n)) * Math.max(0.2, p.a * 1.6);
      ctx.fillRect(-S.size, top + band * k + (band - th), L.w + S.size * 2, th);
    }
  });
  ctx.restore();
}
/* エッジ上の点を集める */
function edgePoints(c){
  const bb = bbox(c); if(!bb) return [];
  const W = c.width, d = c.getContext('2d', {willReadFrequently:true}).getImageData(0, 0, W, c.height).data, pts = [];
  for(let y = Math.max(1, bb.t); y <= Math.min(c.height - 2, bb.b); y++) for(let x = Math.max(1, bb.l); x <= Math.min(W - 2, bb.r); x++){
    const i = (y * W + x) * 4 + 3;
    if(d[i] > 128 && (d[i - 4] <= 128 || d[i + 4] <= 128 || d[i - W * 4] <= 128 || d[i + W * 4] <= 128)) pts.push([x, y]);
  }
  return pts;
}
/* 電球（マーキー）：塗りの少し内側の輪郭に等間隔で配置 */
function drawBulbs(F, scale){
  const b = S.bulbs, r = Math.max(1.5, b.size * S.size * scale), gap = Math.max(r * 2.4, b.gap * S.size * scale), bb = bbox(F); if(!bb) return;
  const W = F.width, H = F.height, pad = Math.ceil(r * 2) + 2;
  const l = Math.max(0, bb.l - pad), t = Math.max(0, bb.t - pad), w = Math.min(W, bb.r + pad) - l, h = Math.min(H, bb.b + pad) - t;
  const ctx = F.getContext('2d', {willReadFrequently:true}), d = ctx.getImageData(l, t, w, h).data;
  const a = new Float32Array(w * h); for(let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] / 255;
  const rr = Math.max(1, Math.round(r * 0.6)), hm = boxBlur(boxBlur(a, w, h, rr), w, h, rr), T = 0.62, pts = [];
  for(let y = 1; y < h - 1; y++) for(let x = 1; x < w - 1; x++){
    const i = y * w + x;
    if(hm[i] >= T && (hm[i - 1] < T || hm[i + 1] < T || hm[i - w] < T || hm[i + w] < T)) pts.push([x + l, y + t]);
  }
  const R = rng(5); for(let i = pts.length - 1; i > 0; i--){ const j = Math.floor(R() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
  const cell = gap / Math.SQRT2, grid = new Map(), ok = [];
  const key = (i, j) => i * 100003 + j;
  for(const [x, y] of pts){
    const gi = Math.floor(x / cell), gj = Math.floor(y / cell); let near = false;
    for(let di = -2; di <= 2 && !near; di++) for(let dj = -2; dj <= 2 && !near; dj++){
      const q = grid.get(key(gi + di, gj + dj)); if(q && (q[0] - x) ** 2 + (q[1] - y) ** 2 < gap * gap) near = true;
    }
    if(!near){ grid.set(key(gi, gj), [x, y]); ok.push([x, y]); }
  }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  for(const [x, y] of ok){
    ctx.shadowColor = rgba(b.c, b.glow); ctx.shadowBlur = r * 3;
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, b.c); g.addColorStop(1, darken(b.c, 0.35));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  ctx.restore();
}
/* キラキラ（4方向の星） */
function drawSparkles(B, body, scale){
  const s = S.sparkle; if(s.count <= 0) return;
  const pts = edgePoints(body), bb = bbox(body); if(!pts.length || !bb) return;
  const R = rng(s.seed), x = B.getContext('2d'), base = s.size * S.size * scale;
  x.save(); x.fillStyle = s.c;
  if(s.glow){ x.shadowColor = s.c; x.shadowBlur = base * 0.6; }
  for(let i = 0; i < s.count; i++){
    let px, py;
    if(R() < 0.75){ const p = pts[Math.floor(R() * pts.length)]; px = p[0]; py = p[1]; }
    else { px = bb.l + R() * (bb.r - bb.l); py = bb.t + R() * (bb.b - bb.t); }
    const r = base * (0.35 + R() * 0.65), k = r * 0.16;
    x.beginPath(); x.moveTo(px, py - r);
    x.quadraticCurveTo(px + k, py - k, px + r, py); x.quadraticCurveTo(px + k, py + k, px, py + r);
    x.quadraticCurveTo(px - k, py + k, px - r, py); x.quadraticCurveTo(px - k, py - k, px, py - r);
    x.fill();
  }
  x.restore();
}
/* 残像（スピード感） */
function addTrail(body, scale){
  const t = S.trail, W = body.width, H = body.height, a = t.angle * PI / 180, Lp = t.len * S.size * scale;
  let src = body;
  if(t.tint){ src = mk(W, H); const x = src.getContext('2d'); x.drawImage(body, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = t.c; x.fillRect(0, 0, W, H); }
  const out = mk(W, H), o = out.getContext('2d');
  for(let i = t.count; i >= 1; i--){ const k = i / t.count; o.globalAlpha = t.a * (1 - k * 0.85); o.drawImage(src, Math.cos(a) * Lp * k, Math.sin(a) * Lp * k); }
  o.globalAlpha = 1; o.drawImage(body, 0, 0);
  return out;
}

function render(scale){
  if(!plainText().trim()) return mk(1, 1);
  const L = layout(), items = glyphs(L);
  const cells = (S.box.on || S.dots.on) ? charCells(items) : [];
  const dotCells = S.dots.on ? cells.filter(c => c.a) : [];
  const t = Math.tan(S.skew * PI / 180);
  const on = S.strokes.filter(s => s.on && s.w > 0);
  let cum = 0; const layers = on.map(s => ({w: (cum += s.w), c: s.c}));
  const outer = cum;
  const ex = S.extrude.on ? S.extrude.depth : 0;
  const sh = S.shadow.on ? Math.max(Math.abs(S.shadow.x), Math.abs(S.shadow.y)) + S.shadow.blur * 1.5 : 0;
  const gl = S.glow.on ? S.glow.blur * (S.glow.dual ? 2.2 : 1.6) : 0;
  const jit = S.jitter.on ? S.jitter.y + S.size * (S.jitter.scale + Math.sin(S.jitter.rot * PI / 180)) : 0;
  const gli = S.glitch.on ? Math.max(S.glitch.rgb, S.glitch.shift) : 0;
  const mrk = S.marker.on ? S.size * S.marker.over : 0;
  const pl = S.plate.on ? S.size * (S.plate.pad + 0.9) + S.plate.sw + (['burst', 'ellipse'].includes(S.plate.shape) ? 0.3 * (L.w + L.h) : 0) : 0;
  const bxm = S.box.on ? S.size * (S.box.pad + 0.45) + S.box.sw : 0;
  const ofm = S.offset.on ? Math.max(Math.abs(S.offset.x), Math.abs(S.offset.y)) + S.offset.w : 0;
  const dtm = S.dots.on ? S.size * (S.dots.size * 2 + 0.3) : 0;
  const xtra = (S.fire.on ? S.fire.height * S.size + S.size * 0.25 : 0) + (S.drip.on ? S.drip.len * S.size * 1.2 : 0)
    + (S.trail.on ? S.trail.len * S.size : 0) + (S.distort.on ? S.distort.amt : 0)
    + (S.sparkle.on ? S.sparkle.size * S.size : 0) + (S.bulbs.on ? S.bulbs.size * S.size * 3 : 0);
  const m = S.size * 0.35 + outer + ex + sh + gl + jit + gli + mrk + pl + bxm + ofm + dtm + xtra + 10;
  const W = Math.ceil((L.w + 2 * m + Math.abs(t) * L.h) * scale), H = Math.ceil((L.h + 2 * m) * scale);
  const prep = c => {
    const x = c.getContext('2d');
    x.setTransform(scale, 0, -t * scale, scale, (m + Math.max(0, t) * L.h) * scale, m * scale);
    x.font = fontStr(); x.letterSpacing = S.ls + 'px'; x.lineJoin = 'round'; x.lineCap = 'round'; x.textBaseline = 'alphabetic';
    return x;
  };

  // 1) 背面：背景シェイプ → 一文字囲み → マーカー → 板ずれ → 押し出し
  const A = mk(W, H), ax = prep(A);
  if(S.plate.on) drawPlate(ax, L, outer);
  if(S.box.on) drawBoxes(ax, cells);
  if(S.marker.on) drawMarker(ax, L);
  if(S.offset.on) blit(A, drawOffsetLayer(prep, W, H, items, outer));
  if(ex > 0) blit(A, drawExtrude(prep, W, H, items, outer, scale));
  // 2) フチ（傍点にもフチ）
  const K = mk(W, H), kx = prep(K);
  for(let i = layers.length - 1; i >= 0; i--){
    kx.strokeStyle = layers[i].c; kx.lineWidth = layers[i].w * 2;
    drawGlyphs(kx, items, (it, px, py) => kx.strokeText(it.t, px, py));
    dotCells.forEach(c => withCell(kx, c, () => { dotPath(kx); kx.stroke(); }));
  }
  // 3) 文字の塗り → 模様 → ベベル → インナーシャドウ → テカリ
  const F = mk(W, H), fx = prep(F), fs = fillStyles(fx, L);
  drawGlyphs(fx, items, (it, px, py) => { fx.fillStyle = fs(it); fx.fillText(it.t, px, py); });
  if(dotCells.length){ fx.fillStyle = S.dots.c; dotCells.forEach(c => withCell(fx, c, () => { dotPath(fx); fx.fill(); })); }
  if(S.drip.on && S.drip.amt > 0) drawDrips(F, K, outer * scale, layers.length ? layers[layers.length - 1].c : null, scale);
  if(S.pattern.on && S.pattern.a > 0){
    if(S.pattern.type === 'halftone') drawHalftone(F, scale);
    else if(S.pattern.type === 'cutlines') drawCutLines(fx, L);
    else drawPattern(F, scale);
  }
  if(S.bevel.on){
    bevel(F, S.bevel.size * scale, S.bevel);
    if(S.bevel.target === 'both' && layers.length) bevel(K, Math.max(1, Math.min(S.bevel.size, outer)) * scale, S.bevel);
  }
  if(S.inner.on) innerShadow(F, scale);
  if(S.gloss.on) drawGloss(fx, L);
  if(S.bulbs.on) drawBulbs(F, scale);
  // 4) 合成（通常／中抜き／くり抜き）→ かすれ → ワープ
  if(S.fillMode === 'hollow'){ cut(K, F); blit(A, K); }
  else if(S.fillMode === 'knock'){ blit(A, K); cut(A, F); }
  else { blit(A, K); blit(A, F); }
  if(S.grunge.on && S.grunge.amt > 0) applyGrunge(A, scale);
  if(S.distort.on && S.distort.amt > 0) displace(A, S.distort.amt * scale, S.distort.scale * scale, S.distort.seed, 1);
  let body = warp(A);
  if(S.trail.on && S.trail.count > 0 && S.trail.len > 0) body = addTrail(body, scale);
  // 5) 光彩・影
  let B = mk(body.width, body.height); const bx = B.getContext('2d');
  if(S.fire.on) bx.drawImage(makeFire(body, scale), 0, 0);
  if(S.glow.on && S.glow.blur > 0){
    if(S.glow.dual){
      bx.drawImage(effectOnly(body, 0, 0, S.glow.blur * 1.4, rgba(S.glow.c2, S.glow.a), scale), 0, 0);
      const g = effectOnly(body, 0, 0, S.glow.blur * 0.5, rgba(S.glow.c, S.glow.a), scale);
      for(let i = 0; i < S.glow.str; i++) bx.drawImage(g, 0, 0);
    }else{
      const g = effectOnly(body, 0, 0, S.glow.blur, rgba(S.glow.c, S.glow.a), scale);
      for(let i = 0; i < S.glow.str; i++) bx.drawImage(g, 0, 0);
    }
  }
  if(S.shadow.on) bx.drawImage(effectOnly(body, S.shadow.x, S.shadow.y, S.shadow.blur, rgba(S.shadow.c, S.shadow.a), scale), 0, 0);
  bx.drawImage(body, 0, 0);
  if(S.sparkle.on) drawSparkles(B, body, scale);
  // 6) 鏡面反射 → グリッチ
  if(S.reflect.on) B = addReflection(B, body, scale);
  if(S.glitch.on) B = glitch(B, scale);
  // 7) 回転
  if(S.rotate){
    const a = S.rotate * PI / 180, cw = B.width, chh = B.height;
    const R = mk(Math.ceil(Math.abs(cw * Math.cos(a)) + Math.abs(chh * Math.sin(a))), Math.ceil(Math.abs(cw * Math.sin(a)) + Math.abs(chh * Math.cos(a))));
    const rx = R.getContext('2d'); rx.translate(R.width / 2, R.height / 2); rx.rotate(a); rx.drawImage(B, -cw / 2, -chh / 2);
    B = R;
  }
  // 8) 自動トリミング
  return trim(B, Math.round(S.pad * scale));
}

