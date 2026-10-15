/* 楽ちんサムネメーカー：文字の描画エンジン ② ピクセル処理 */
/*
  役割：描いた文字の canvas に対するピクセル単位の処理（外接矩形・切り詰め・ぼかし・ベベル・模様・テカリ・マーカー・かすれ・ワープ・グリッチ）。
  本体（文字の並べ方・塗り・描画の手順 render / renderStyle）は text-render.js、装飾（炎・しずく・電球など）は text-deco.js。
  依存：RS（描画中の文字スタイル）・mctx・fontStr など text-render.js の共通部品、mk・rng・clamp（core.js）。どれも関数の中から使うだけ。
  読み込み順：text-render.js の次。
*/
/* ピクセル処理 */
// ここから下の bbox / trim / boxBlur / bevel / drawPattern などは setTransform を使わない「実ピクセル」で動く（座標系は冒頭参照）。
// bbox：alpha が 2 を超える画素の外接矩形（l,t,r,b は端のピクセル含む）。何も無ければ null。getImageData で全画素を読むので重い。
// 呼び出し側は null を必ず考慮する（空文字・全透明のとき）。willReadFrequently は読み出し中心のキャンバスだと示してソフトウェア描画に寄せるヒント
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
// 透明な余白を切り落とし、四方に pad px だけ余白を付けて返す（最終出力用）。全透明なら 1x1 を返す
let trimShift = [0, 0];
function trim(c, pad){
  const bb = bbox(c); if(!bb) return mk(1, 1);
  const cw = bb.r - bb.l + 1, ch = bb.b - bb.t + 1, o = mk(cw + pad * 2, ch + pad * 2);
  o.getContext('2d').drawImage(c, bb.l, bb.t, cw, ch, pad, pad, cw, ch);
  trimShift = [pad - bb.l, pad - bb.t];   // 切り取りで絵がずれた量（しっぽのつまみの位置合わせ用。renderStyle が読む）
  return o;
}
// 箱型ブラー（横→縦の2パス、端は最寄りの値で延長）。移動平均で走査するので半径 r によらず O(w×h)。bevel / drawBulbs が高さマップを作るのに使う。
// 戻り値は src と同じ大きさの Float32Array（0〜1 の濃度）。2回かけて近似ガウスにしている（呼び出し側）
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
// c を直接書き換える（戻り値なし）。sizePx は実ピクセル（scale 掛け済み）、b は RS.bevel。
// 速度のため bbox の周囲 2px だけを切り出して処理する。傾き = 高さマップの勾配 × 光ベクトル。浮き出し/彫り込みは k の符号反転で表す。
// 傾き s>0 は白方向に、s<0 は黒方向に混ぜる（hl / sh が強さ）。pow(s,0.8) はハイライトの立ち上がりをやや強める調整値
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
// c は塗り F。source-atop で「すでに描かれている画素の上にだけ」重ねるので、文字の外に模様が漏れない。
// setTransform を単位行列に戻しているのは、呼び出し時の変換（prep の scale・平行移動）が模様に掛からないようにするため（タイルは実ピクセル基準）。
// glitter / noise は固定シード（11 / 7）のタイルを作る＝再描画しても模様が変わらない。halftone / cutlines はここではなく別関数（renderStyle で振り分け）
function drawPattern(c, scale){
  const p = RS.pattern, sz = Math.max(2, Math.round(p.size * scale));
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
// fx（prep 済み＝論理座標）に直接描く。source-atop で文字の画素の上にだけ白を重ねる。bot の曲線（quadraticCurveTo）で下端をカーブさせてアニメ風の光沢にする。
// 横書きの帯の範囲（x0〜x1）は L.w より size 分ずつ広く取る（文字が L.w からはみ出しても帯が途切れないように）
function drawGloss(ctx, L){
  const g = RS.gloss;
  ctx.save(); ctx.globalCompositeOperation = 'source-atop';
  L.lines.forEach((ln, i) => {
    if(L.v){   // 縦書き：左から光が当たる帯（カラムごと）
      if(!ln.cells.length) return;
      const left = ln.x0 - RS.size * 0.15, right = ln.x0 + RS.size * 1.02 * g.h, y0 = ln.y0 - RS.size, y1 = ln.y0 + ln.len + RS.size;
      const gr = ctx.createLinearGradient(left, 0, right, 0);
      gr.addColorStop(0, `rgba(255,255,255,${g.a})`); gr.addColorStop(1, `rgba(255,255,255,${g.a * 0.35})`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(left, y0); ctx.lineTo(left, y1); ctx.lineTo(right, y1);
      ctx.quadraticCurveTo(right + RS.size * 0.35 * g.curve, (y0 + y1) / 2, right, y0); ctx.closePath(); ctx.fill();
      return;
    }
    const top = lineTop(L, i) - RS.size * 0.15, bot = lineTop(L, i) + RS.size * 1.02 * g.h;
    const x0 = -RS.size, x1 = L.w + RS.size;
    const gr = ctx.createLinearGradient(0, top, 0, bot);
    gr.addColorStop(0, `rgba(255,255,255,${g.a})`); gr.addColorStop(1, `rgba(255,255,255,${g.a * 0.35})`);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x0, top); ctx.lineTo(x1, top); ctx.lineTo(x1, bot);
    ctx.quadraticCurveTo((x0 + x1) / 2, bot + RS.size * 0.35 * g.curve, x0, bot); ctx.closePath(); ctx.fill();
  });
  ctx.restore();
}
/* マーカー（文字の後ろの帯） */
// 背面レイヤー A に描く。roundRect は古いブラウザに無いので、無ければ rect にフォールバックする。
// 帯の位置 pos は行の高さ基準（0=上端寄り、1=下端寄り）、over は左右（縦書きは上下）のはみ出し量
function drawMarker(ctx, L){
  const m = RS.marker;
  ctx.save(); ctx.fillStyle = rgba(m.c, m.a);
  L.lines.forEach((ln, i) => {
    if(!ln.segs.length) return;
    if(L.v){ const over = RS.size * m.over, hh = RS.size * m.h, cx = ln.x0 + RS.size * 1.02 * m.pos; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx - hh / 2, ln.y0 - over, hh, ln.len + over * 2, Math.min(hh / 2, RS.size * 0.08)) : ctx.rect(cx - hh / 2, ln.y0 - over, hh, ln.len + over * 2); ctx.fill(); return; }
    const x0 = RS.align === 'left' ? 0 : RS.align === 'right' ? L.w - ln.w : (L.w - ln.w) / 2;
    const over = RS.size * m.over, hh = RS.size * m.h, cy = lineTop(L, i) + RS.size * 1.02 * m.pos;
    const x = x0 - over, w = ln.w + over * 2, y = cy - hh / 2, rr = Math.min(hh / 2, RS.size * 0.08);
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, hh, rr) : ctx.rect(x, y, w, hh); ctx.fill();
  });
  ctx.restore();
}
/* かすれ */
// destination-out で、すでに描かれた画素を丸い斑点と細い線で削る（c を直接書き換え）。固定シード g.seed で毎回同じ削れ方。
// 個数は面積と粒の大きさから算出し、40000 で頭打ち（巨大キャンバスで重くならないように）。scale を掛けて実ピクセルの大きさにしている
function applyGrunge(c, scale){
  const g = RS.grunge, bb = bbox(c); if(!bb) return;
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
// src を変形した新しいキャンバスを返す（type none・強さ0・空なら src をそのまま返すので、呼び出し側は同一かどうかを前提にしない）。
// 1px 幅の列（trap は1px高の行）ごとに縦位置 dy と縦倍率 s を変えて貼り直す方式。fn(u) は文字の横位置 u(0〜1) → [縦ずれ, 縦倍率]。
// 変形で縦にはみ出す量を先に走査（minY/maxY）して出力の高さと基準位置 off を決める。この走査は 2px 刻み（速度優先）、貼り付けは1px刻み
function warp(src){
  const w = RS.warp; if(w.type === 'none' || !w.amt) return src;
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
  const WARPS = {
    arch:  u => [-amp * 0.6 * (1 - (2*u - 1) ** 2), 1],
    wave:  u => [amp * 0.35 * Math.sin(2 * PI * w.freq * u), 1],
    bulge: u => [0, Math.max(0.1, 1 + A * 0.8 * (1 - (2*u - 1) ** 2))],
    persp: u => [0, Math.max(0.1, 1 + A * 0.8 * (2*u - 1))],
    rise:  u => [-amp * 0.5 * (2*u - 1), 1],
  };
  if(!hasKey(WARPS, w.type)) return src;
  const fn = WARPS[w.type];
  let minY = 0, maxY = H;
  for(let px = 0; px < W; px += 2){ const [dy, s] = fn(U(px)); minY = Math.min(minY, cy - cy * s + dy); maxY = Math.max(maxY, cy + (H - cy) * s + dy); }
  const off = -Math.floor(minY), o = mk(W, Math.ceil(maxY - minY) + 2), x = o.getContext('2d');
  for(let px = 0; px < W; px++){ const [dy, s] = fn(U(px + 0.5)); x.drawImage(src, px, 0, 1, H, px, off + cy - cy * s + dy, 1, H * s); }
  return o;
}
// 影・光彩の「影の部分だけ」を取り出したキャンバスを返す（本体は描かれない）。canvas の shadow は本体と一緒にしか描けないので、
// 本体を画面外（左へ OFF だけずらした位置）に描き、shadowOffsetX に同じ OFF を足して影だけをキャンバス内に落とすトリックを使っている。
// ox,oy,blur は論理 px（scale を掛けて実ピクセルにする）。呼び出し時の変換には依存しない（setTransform 前提なし）
function effectOnly(src, ox, oy, blur, color, scale){
  const c = mk(src.width, src.height), x = c.getContext('2d'), OFF = src.width + 200;
  x.shadowColor = color; x.shadowBlur = blur * scale; x.shadowOffsetX = ox * scale + OFF; x.shadowOffsetY = oy * scale;
  x.drawImage(src, -OFF, 0);
  return c;
}
/* グリッチ */
// 最終段（反射の後）で B 全体に掛ける。シアン・赤の色ずれ（左右に d だけずらして lighter 合成）→ 本体 → 横帯のずらし、の順。
// 帯は out を毎回コピーしてから切り出す（ずらした結果を次の帯が拾って二重にならないように）。帯の位置・幅・量は固定シード
function glitch(B, scale){
  const g = RS.glitch, W = B.width, H = B.height, d = g.rgb * scale;
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

// 合成の小道具。どちらも dst の変換を一時的に単位行列にして、src を実ピクセルで重ねる（A/K/F はすべて同寸法のキャンバスなので位置は一致する）。
// blit=上に重ねる / cut=src の形で dst を抜く（destination-out）
const blit = (dst, src) => { const c = dst.getContext('2d'); c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(src, 0, 0); c.restore(); };
const cut = (dst, src) => { const c = dst.getContext('2d'); c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'destination-out'; c.drawImage(src, 0, 0); c.restore(); };
