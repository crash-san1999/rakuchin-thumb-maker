/* 楽ちんサムネメーカー：文字の描画エンジン ③ 装飾 */
/*
  役割：文字の装飾の描き方（一文字囲み・傍点・押し出し・板ずれ・内側の影・鏡面反射・炎・しずく・網点・ラインカット・電球・キラキラ・残像）。
  本体（render / renderStyle）は text-render.js、ピクセル処理（ぼかし・ベベル・ワープなど）は text-pixel.js。背景シェイプと吹き出しは text-plate.js。
  依存：RS・glyphs・drawGlyphs・fillStyles など text-render.js の部品、boxBlur・bbox・blit・cut など text-pixel.js の部品。どれも関数の中から使うだけ。
  読み込み順：text-pixel.js の次（RANSOM・BOX_PALETTES は読み込み時に作るデータで、controls.js などは関数の中から参照する）。
*/
/* 1文字ずつの位置（一文字囲み・傍点用） */
// ファイルの中だけで使う名前を外（ほかのファイルと共有の場所）に出さないよう、中身を関数で包んでいる。外から使う名前は最後の return で出す
var {charCells, withCell, BOX_PALETTES, drawBoxes, dotPath, drawExtrude, drawOffsetLayer, innerShadow, addReflection, displace, makeFire, drawDrips, drawHalftone, drawCutLines, drawBulbs, drawSparkles, addTrail} = (() => {
// ゆらぎ・縦書きは glyphs() がすでに1文字単位なのでそのまま使う。通常の横書きは行の塊（セグメント）を文字ごとに分け、
// measureText で x を進めて位置を出す（字間 ls を含む幅）。空白は囲み・傍点の対象にしない
function charCells(items){
  if(RS.jitter.on || RS.vertical) return items.filter(it => it.t.trim());
  const out = []; mctx.font = fontStr(); mctx.letterSpacing = lsx() + 'px';
  items.forEach(it => {
    let x = it.x;
    for(const ch of it.t){ const cw = mctx.measureText(ch).width; if(ch.trim()) out.push({t:ch, x, y:it.y, a:it.a, line:it.line, cw}); x += cw; }
  });
  return out;
}
// 1文字ぶんの局所座標（原点＝その文字のマス中心、回転・拡大はゆらぎ分）に切り替えて fn を実行する。囲み・傍点がゆらぎや縦書きの文字に追従するための共通処理。
// 横書きの x に (cw - ls)/2 を使うのは、cw に字間 ls が含まれるため字面の中心に合わせるときに差し引く
function withCell(ctx, c, fn){
  if(c.vt){ ctx.save(); ctx.translate(c.bx, c.by + (c.dy || 0)); if(c.rot) ctx.rotate(c.rot); if(c.sc) ctx.scale(c.sc, c.sc); fn(); ctx.restore(); return; }
  ctx.save(); ctx.translate(c.x + (c.cw - RS.ls) / 2, c.y - RS.size * 0.38 + (c.dy || 0));
  if(c.rot) ctx.rotate(c.rot); if(c.sc) ctx.scale(c.sc, c.sc);
  fn(); ctx.restore();
}
/* 一文字囲み */
// RANSOM は色の取得に失敗した時の既定（脅迫状風の7色）。boxPal が使う
const RANSOM =['#e8132b', '#111111', '#1f5fd6', '#0f9d58', '#7b2cbf', '#ff6a00', '#c2185b'];
/* ランダム配色（脅迫状風）で使う色の組み合わせ（おまかせ）。[名前の key, 表示名, 色, 使う色数] */
// 色は常に8個で、使う数（4番目の値）は box.pn に入る。controls.js のおまかせチップが data-boxpal に key を載せて参照する
/** @type {Array<[string, string, string[], number]>} */
const BOX_PALETTES = [
  ['classic', '脅迫状', ['#e8132b', '#111111', '#1f5fd6', '#0f9d58', '#7b2cbf', '#ff6a00', '#c2185b', '#ffd500'], 7],
  ['pastel', 'パステル', ['#ffb3c7', '#ffd9a0', '#fff3a3', '#b9f0c4', '#a9dcff', '#d3bfff', '#ffc9f0', '#ffffff'], 7],
  ['pop', 'ポップ', ['#ff2d55', '#ffcc00', '#00c2ff', '#7cff4f', '#ff6a00', '#a855f7', '#111111', '#ffffff'], 7],
  ['mono', 'モノクロ', ['#111111', '#ffffff', '#666666', '#d9d9d9', '#333333', '#999999', '#000000', '#f2f2f2'], 4],
  ['redblack', '赤・黒・白', ['#e8132b', '#111111', '#ffffff', '#b00020', '#2b2b2b', '#f5f5f5', '#e8132b', '#111111'], 3],
  ['cool', '寒色', ['#1f5fd6', '#00a6d6', '#0f9d58', '#2b2f77', '#7b2cbf', '#6ee7f2', '#e8f1ff', '#111111'], 6],
  ['warm', '暖色', ['#e8132b', '#ff6a00', '#ffb000', '#ffd500', '#c2185b', '#ff8fa3', '#7a1f00', '#fff3d6'], 6],
  ['wa', '和風', ['#b7282e', '#1b1b1b', '#2b5d8a', '#d9a521', '#4f7a3a', '#f3e9d2', '#6b3a8f', '#8a6a4b'], 6],
];
// 使う色（色数ぶん）。壊れた値は脅迫状の色に戻す
function boxPal(b){
  const n = clamp(Math.round(b.pn) || 7, 2, 8), a = (Array.isArray(b.pal) ? b.pal : []).slice(0, n).filter(c => /^#[0-9a-f]{6}$/i.test(c));
  return a.length ? a : RANSOM;
}
// マス中心を原点に、半サイズ h の図形の経路を作る（塗り・線は呼び出し側）。円・ひし形は四角と見た目の大きさが揃うよう 1.08 / 1.4 倍にしている
function boxPath(ctx, shape, h){
  ctx.beginPath();
  if(shape === 'circle') ctx.arc(0, 0, h * 1.08, 0, 7);
  else if(shape === 'diamond'){ const k = h * 1.4; ctx.moveTo(0, -k); ctx.lineTo(k, 0); ctx.lineTo(0, k); ctx.lineTo(-k, 0); ctx.closePath(); }
  else if(shape === 'round') ctx.roundRect(-h, -h, 2 * h, 2 * h, h * 0.3);
  else ctx.rect(-h, -h, 2 * h, 2 * h);
}
// 色の決め方：rand ON＝パレットから（seq なら順番、そうでなければ文字の番号 i と seed から決まる乱数で固定）／OFF＝単色（alt なら交互）。
// 乱数は呼ぶたびに作り直す rng(i*97+5+seed*13) で、文字の並びが変わっても他の文字の色が連動して変わらない。枠線は塗りより先に描き、太さ×2 で内側が塗りに隠れて外側だけ残る
function drawBoxes(ctx, cells){
  const b = RS.box, h = RS.size * (0.5 + b.pad), pal = boxPal(b);
  cells.forEach((c, i) => withCell(ctx, c, () => {
    boxPath(ctx, b.shape, h);
    if(b.sw > 0){ ctx.lineWidth = b.sw * 2; ctx.strokeStyle = b.sc; ctx.lineJoin = 'round'; ctx.stroke(); }
    ctx.fillStyle = b.rand ? (b.seq ? pal[i % pal.length] : pal[Math.floor(rng(i * 97 + 5 + (b.seed || 0) * 13)() * pal.length)]) : (b.alt && i % 2 ? b.c2 : b.c); ctx.fill();
  }));
}
/* 傍点 */
// withCell の局所座標（文字のマス中心が原点）で、点の経路だけを作る（塗る／線を引くのは呼び出し側。経路は save/restore の外へ残る）
function dotPath(ctx){
  const d = RS.dots, r = RS.size * d.size * 0.5;
  ctx.save(); ctx.beginPath();
  if(RS.vertical){ ctx.translate(RS.size * 0.5 + r * 1.3, 0); ctx.rotate(PI / 2); }   // 縦書きは文字の右側に付ける
  else ctx.translate(0, -RS.size * 0.5 - r * 1.3);
  if(d.shape === 'ring'){ ctx.arc(0, 0, r, 0, 7); ctx.moveTo(r * 0.5, 0); ctx.arc(0, 0, r * 0.5, 0, 7, true); }
  else if(d.shape === 'tri'){ ctx.moveTo(-r, -r * 0.8); ctx.lineTo(r, -r * 0.8); ctx.lineTo(0, r * 0.9); ctx.closePath(); }
  else ctx.arc(0, 0, r, 0, 7);
  ctx.restore();   // 経路は作った時点の座標で残る（上の translate/rotate は経路に焼き込み済みで、restore しても動かない。変換だけ元に戻る）
}
/* 背景シェイプ（角丸・楕円・ギザギザ・吹き出し・斜め帯）と吹き出しのしっぽは text-plate.js（drawPlate） */
/* 押し出し（ストライプ・奥のフェード対応） */
// 文字を角度 e.angle の向きに、奥(d=厚み)から手前(d→0)へ step ずつ位置をずらして何枚も重ねて立体に見せる。奥ほど暗く(darken)する。
// step は 1/scale（実ピクセルで約1px。最小0.25）。1px 刻みなので隙間なく見え、描画回数はおおよそ 厚み×scale 回になるため厚みが大きいほど重い。
// fade（奥を透明に）は別キャンバス D に距離を灰色の濃淡で描き、最後に E の alpha へ掛けて消す（ピクセル処理なので E/D は実ピクセル）。
// prep は renderStyle の変換付き ctx 生成関数を受け取る（同じ座標系で描くため）。戻り値 E は A に blit される
function drawExtrude(prep, W, H, items, outer, scale){
  const e = RS.extrude, ex = e.depth, a = e.angle * PI / 180, step = Math.max(0.25, 1 / scale);
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
// ベタ色の文字（＋フチぶんの太り）を (o.x, o.y) ずらして描いたレイヤーを返す。hollow は「太らせた形」から「元の太さの形」を destination-out で抜いて線だけ残す。
// 背面側に置かれるので、実際の文字・フチは後から上に重なる
function drawOffsetLayer(prep, W, H, items, outer){
  const o = RS.offset, O = mk(W, H), x = prep(O);
  x.translate(o.x, o.y); x.fillStyle = x.strokeStyle = o.c;
  const sil = lw => { x.lineWidth = lw; drawGlyphs(x, items, (it, px, py) => { if(lw > 0) x.strokeText(it.t, px, py); x.fillText(it.t, px, py); }); };
  if(o.hollow){ sil((outer + o.w) * 2); x.globalCompositeOperation = 'destination-out'; sil(outer * 2); }
  else sil(outer * 2);
  return O;
}
/* インナーシャドウ（文字の内側に落ちる影） */
// F（塗りのキャンバス）を直接書き換える。「文字の外側（反転）」に影を落とし、それを source-atop で文字の内側にだけ重ねる、という反転トリック。
// 実ピクセルで処理（setTransform を単位行列にして貼る）
function innerShadow(F, scale){
  const s = RS.inner, W = F.width, H = F.height, inv = mk(W, H), ix = inv.getContext('2d');
  ix.fillStyle = '#000'; ix.fillRect(0, 0, W, H); ix.globalCompositeOperation = 'destination-out'; ix.drawImage(F, 0, 0);
  const sh = effectOnly(inv, s.x, s.y, s.blur, rgba(s.c, s.a), scale);
  const fx = F.getContext('2d'); fx.save(); fx.setTransform(1, 0, 0, 1, 0, 0); fx.globalCompositeOperation = 'source-atop'; fx.drawImage(sh, 0, 0); fx.restore();
}
/* 鏡面反射（下に反転して映す） */
// B（光彩・影込みの合成結果）の下に body の下端を上下反転して貼り足し、新しいキャンバスを返す（高さが伸びる）。
// 反転部分は destination-in のグラデで下へ向かって透明にする。反射元は影なしの body を使う（影・光彩まで反射しないため）。gap は scale 倍して実ピクセルに
function addReflection(B, body, scale){
  const r = RS.reflect, bb = bbox(body); if(!bb) return B;
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

// 値ノイズ（256x256 の乱数表を滑らかに補間し、周波数違いを 0.6/0.3/0.1 で重ねたもの）。戻り値は (x,y) → -1〜1 の関数。
// 乱数表は rng(seed) 由来なので、同じ seed なら毎回同じノイズ（再描画で形が変わらない）。表は 256 周期で繰り返す（& 255）
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
// c を直接書き換える。amp=ずらす最大量(px)、sc=ノイズの細かさ(px。大きいほどなだらか)、stretchY=縦方向にノイズを伸ばす倍率。いずれも実ピクセル（呼び出し側が scale 倍する）。
// 各出力画素は「ノイズでずらした位置の元画素」を取る逆引き方式（穴が空かない）。bbox ± (amp+2) の範囲だけ処理して速度を確保
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
// 戻り値は炎だけを描いた同寸法のキャンバス（本体は含まない。呼び出し側が body より先に B へ重ねる）。
// 文字の「上側が空いている画素」（alpha>128 の真上が透明）を走査して炎の根元を探す。同じ根元の連続を避けるため、見つけたら size×0.25 だけ飛ばす。
// 外炎（c2→c3）と内炎＝芯（c1→c2）の2層を 'lighter' 合成で重ね、最後に軽くぼかして炎らしく馴染ませる。乱数は固定シード f.seed
function makeFire(body, scale){
  const f = RS.fire, W = body.width, H = body.height, bb = bbox(body), out = mk(W, H);
  if(!bb) return out;
  const d = body.getContext('2d', {willReadFrequently:true}).getImageData(0, 0, W, H).data;
  const R = rng(f.seed), sp = Math.max(3, RS.size * 0.09 * scale), tops = [];
  for(let x = bb.l; x <= bb.r; x += sp){
    const xi = Math.round(x + (R() - 0.5) * sp * 0.6);
    for(let y = Math.max(1, bb.t); y <= bb.b; y++){
      const k = (y * W + xi) * 4 + 3;
      if(d[k] > 128 && d[k - W * 4] <= 128){ tops.push([xi, y]); y += Math.round(RS.size * 0.25 * scale); }
    }
  }
  const o = out.getContext('2d');
  // 土台の赤い照り返し
  const sil = mk(W, H), sx = sil.getContext('2d');
  sx.drawImage(body, 0, 0); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = f.c3; sx.fillRect(0, 0, W, H);
  o.filter = `blur(${Math.max(2, RS.size * 0.08 * scale)}px)`; o.globalAlpha = 0.9; o.drawImage(sil, 0, -RS.size * 0.05 * scale); o.filter = 'none'; o.globalAlpha = 1;
  const T = mk(W, H), t = T.getContext('2d');
  const tongue = (x, y, h, w, sway, c0, c1, c2, a) => {
    const o = t, g = o.createLinearGradient(0, y, 0, y - h);
    g.addColorStop(0, rgba(c0, a)); g.addColorStop(0.45, rgba(c1, a * 0.9)); g.addColorStop(1, rgba(c2, 0));
    o.fillStyle = g; o.beginPath(); o.moveTo(x - w, y + w * 0.4);
    o.bezierCurveTo(x - w * 0.9, y - h * 0.35, x + sway - w * 0.35, y - h * 0.7, x + sway, y - h);
    o.bezierCurveTo(x + sway + w * 0.35, y - h * 0.7, x + w * 0.9, y - h * 0.35, x + w, y + w * 0.4);
    o.closePath(); o.fill();
  };
  const Hs = f.height * RS.size * scale, wild = f.wild;
  t.globalCompositeOperation = 'lighter';
  for(const [x, y] of tops){   // 外炎
    const h = Hs * (0.35 + R() * 0.75), w = RS.size * scale * (0.09 + R() * 0.08);
    tongue(x, y, h, w, (R() - 0.5) * w * 3 * wild, f.c2, f.c3, f.c3, 0.55);
  }
  for(const [x, y] of tops){   // 内炎（芯）
    if(R() < 0.35) continue;
    const h = Hs * (0.2 + R() * 0.4), w = RS.size * scale * (0.05 + R() * 0.05);
    tongue(x, y, h, w, (R() - 0.5) * w * 2.5 * wild, f.c1, f.c2, f.c3, 0.65);
  }
  o.filter = `blur(${Math.max(1, RS.size * 0.02 * scale)}px)`; o.drawImage(T, 0, 0); o.filter = 'none';
  return out;
}
/* ドリップ（とろ〜り／つらら）：塗りの下端から垂らす */
// F（塗り）と K（フチ）を直接書き換える。下端（alpha>160 の真下が透明）を走査して垂らす位置を決め、下に gapPx 以上の空きがある所だけ採用
// （他の文字・行に被さらないように）。色は sample ON なら根元の少し上(y-3)の画素色を拾う。外側にフチがあれば、K に同じ形を太らせて描いてフチの続きにする。
// 実ピクセル処理のため setTransform を単位行列に戻している。outerPx は呼び出し側で scale 掛け済みの最外フチ幅
function drawDrips(F, K, outerPx, strokeColor, scale){
  const dr = RS.drip, bb = bbox(F); if(!bb) return;
  const W = F.width, R = rng(dr.seed), fctx = F.getContext('2d', {willReadFrequently:true});
  const d = fctx.getImageData(0, 0, W, F.height).data;
  const wPx = Math.max(3, dr.w * RS.size * scale), step = Math.max(2, Math.round(wPx * 1.4)), gapPx = RS.size * 0.22 * scale;
  const list = [];
  for(let x = bb.l + step; x < bb.r - step; x += step){
    for(let y = bb.t; y < bb.b; y++){
      const i = (y * W + x) * 4 + 3;
      if(d[i] > 160 && d[i + W * 4] <= 160 && R() < dr.amt){
        let open = true; for(let k = 2; k <= gapPx && open; k += 2){ const yy = y + k; if(yy >= F.height || d[(yy * W + x) * 4 + 3] > 40) open = false; }
        if(!open) continue;
        const j = (Math.max(0, y - 3) * W + x) * 4;
        const col = dr.sample ? `rgb(${d[j]},${d[j+1]},${d[j+2]})` : dr.c;
        list.push({x, y, len:(0.25 + Math.pow(R(), 1.5) * 0.9) * dr.len * RS.size * scale, w:wPx * (0.6 + R() * 0.6), col});
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
// F を直接書き換え。bbox の中心を軸に角度 p.angle で回した格子に点を打ち、点の半径は上端 0 → 下端で最大になる（グラデーション状の網）。
// 半径 0.4px 未満は打たない。source-atop で文字の中にだけ描く。パターン種別 'halftone' のとき drawPattern の代わりに呼ばれる
function drawHalftone(F, scale){
  const p = RS.pattern, bb = bbox(F); if(!bb) return;
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
// fx（論理座標）に destination-out で細い横帯を刻む。下に行くほど帯が太くなる。n（本数）は p.size、太さの強さは p.a から決まる。
// パターン種別 'cutlines' のとき drawPattern の代わりに呼ばれる。縦書きは1マスごとに刻む
function drawCutLines(ctx, L){
  const p = RS.pattern, n = Math.max(2, Math.round(p.size / 3));
  ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000';
  L.lines.forEach((ln, i) => {
    if(L.v){   // 縦書き：1マスごとに下半分へ切れ込み
      let y = ln.y0;
      ln.cells.forEach(c => {
        const by = y + c.adv / 2; y += c.adv + RS.ls;
        const top = by - RS.size * 0.04, bot = by + RS.size * 0.41, band = (bot - top) / n;
        for(let k = 0; k < n; k++){
          const th = band * (0.12 + 0.55 * (k / n)) * Math.max(0.2, p.a * 1.6);
          ctx.fillRect(ln.x0 - RS.size * 0.5, top + band * k + (band - th), RS.size * 2, th);
        }
      });
      return;
    }
    const top = lineTop(L, i) + RS.size * 0.48, bot = baseY(L, i) + RS.size * 0.03, band = (bot - top) / n;
    for(let k = 0; k < n; k++){
      const th = band * (0.12 + 0.55 * (k / n)) * Math.max(0.2, p.a * 1.6);
      ctx.fillRect(-RS.size, top + band * k + (band - th), L.w + RS.size * 2, th);
    }
  });
  ctx.restore();
}
/* エッジ上の点を集める */
// alpha>128 で、上下左右のどれかが透明な画素＝輪郭の画素を全部返す（実ピクセル座標の [x,y] 配列）。キラキラの置き場所の候補用。画像が大きいと配列も大きくなる
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
// F に直接描く（実ピクセル）。高さマップを2回ぼかし、しきい値 T=0.62 を横切る画素＝塗りの輪郭の少し内側 を候補にする（ぼかした濃度の等高線を使うので、元の輪郭のギザつきや細部に左右されにくい）。
// 候補は固定シード(5)でシャッフルしたのち、グリッド(cell=gap/√2)で近傍だけ距離判定して間引き、gap 以上離れた点だけ採用（O(n) に近い間引き）。
// F 描画の後ろ・ベベル／インナーシャドウ／テカリより後に呼ぶ必要がある（既に描かれた塗りの形を読むため）
function drawBulbs(F, scale){
  const b = RS.bulbs, r = Math.max(1.5, b.size * RS.size * scale), gap = Math.max(r * 2.4, b.gap * RS.size * scale), bb = bbox(F); if(!bb) return;
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
// B（最終合成）の上に直接描く。位置は 75% が文字の輪郭上、残りが bbox 内のランダム。固定シードなので再描画しても位置は同じ。
// body から輪郭を取る（B は影・光彩を含み輪郭がぼやけるため）。ワープ・残像後の body と B は同寸法
function drawSparkles(B, body, scale){
  const s = RS.sparkle; if(s.count <= 0) return;
  const pts = edgePoints(body), bb = bbox(body); if(!pts.length || !bb) return;
  const R = rng(s.seed), x = B.getContext('2d'), base = s.size * RS.size * scale;
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
// body を角度 t.angle の向きに少しずつずらして count 枚重ね、遠いものほど薄くして、最後に本体を重ねた新キャンバスを返す。
// t.tint ON なら残像だけ単色にする（本体は元の色のまま最後に重ねる）。余白は renderStyle の xtra（trail.len）で確保済み
function addTrail(body, scale){
  const t = RS.trail, W = body.width, H = body.height, a = t.angle * PI / 180, Lp = t.len * RS.size * scale;
  let src = body;
  if(t.tint){ src = mk(W, H); const x = src.getContext('2d'); x.drawImage(body, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = t.c; x.fillRect(0, 0, W, H); }
  const out = mk(W, H), o = out.getContext('2d');
  for(let i = t.count; i >= 1; i--){ const k = i / t.count; o.globalAlpha = t.a * (1 - k * 0.85); o.drawImage(src, Math.cos(a) * Lp * k, Math.sin(a) * Lp * k); }
  o.globalAlpha = 1; o.drawImage(body, 0, 0);
  return out;
}

// 描画中のスタイル。render() の間だけ入り、描画用の関数はすべてこれを見る（画面の S は書き換えない）
return {charCells, withCell, BOX_PALETTES, drawBoxes, dotPath, drawExtrude, drawOffsetLayer, innerShadow, addReflection, displace, makeFire, drawDrips, drawHalftone, drawCutLines, drawBulbs, drawSparkles, addTrail};
})();
