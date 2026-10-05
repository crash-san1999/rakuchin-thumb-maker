/* 楽ちんサムネメーカー：画像の加工エフェクト（背景画像・分割フレームのマス・グループ・画像レイヤーで共通）
   色収差（RGBずれ）・グラデーションマップ・色の置き換え・シャープ・ノイズ・網点・線画・油絵風・ゆがみ（波・渦巻き・魚眼・すぼめる）。
   主な公開：EXTRA_FX_BASE（項目の既定値）／extraFxOn（どれか有効か）／fxColorsSafe（色の文字列を安全にそろえる）／extraFxColor・extraFxShape（postFx から呼ぶ本体）
   保存データ：背景は DOC.bg に、マス・グループ・画像レイヤーは L.fx（CELL_FX_BASE）に、同じ名前・同じ形で入る。
     ポスタライズ・2値化・ミニチュアは、もとは背景だけの効果（finish.js の posterize・threshold・tiltShift）。マスなどでも使えるよう既定値をここにも置く。
   依存：mk・clamp・rng・PI（core.js）、posterize・threshold（finish.js）。呼び出し元は render.js の postFx。
   単位：ずれ幅・網点の大きさ・筆の大きさは DOC 座標の px。描画先のピクセルに直すため、すべて f（倍率）を掛けて使う（プレビューと書き出しで見た目を揃える）。
   ピクセルを1つずつ読む処理なので、極端な値で固まらないよう、各関数の中で値の範囲を必ず丸めること。 */
const EXTRA_FX_BASE = () => ({
  posterize:{on:false, n:4}, thresh:{on:false, lvl:0.5, c1:'#111111', c2:'#ffffff'}, tilt:{on:false, pos:0.55, w:0.3, blur:14, sat:0.3},
  rgb:{on:false, d:8, angle:0},                                        // 色収差：赤と青を反対向きに d px ずらす（angle＝向き、度）
  gmap:{on:false, c1:'#1b0b3a', c2:'#ff3d7f', c3:'#ffe66b', a:1},      // グラデーションマップ：暗い所→c1、中間→c2、明るい所→c3（a＝濃さ）
  rep:{on:false, from:'#ff3030', to:'#2f8bff', tol:0.12},              // 色の置き換え：from に近い色合い（色相）を to の色合いへ（tol＝範囲。0.5 で半周）
  sharp:0, noise:0,                                                    // シャープ（0〜2）・ノイズ（0〜1）
  half:{on:false, size:10, c:'#111111', mix:0.6},                      // 網点：暗いほど大きい点（mix＝元の色を残す割合）
  edge:{on:false, amt:1, c:'#111111', keep:true},                      // 線画：輪郭を c の線にする（keep＝元の絵の上に線を重ねる／オフで白い紙に線だけ）
  paint:{on:false, r:4},                                               // 油絵風（Kuwahara フィルター。r＝筆の大きさ）
  warp:{type:'none', amt:0.5, n:6},                                    // ゆがみ：none / wave（波）/ swirl（渦巻き）/ fisheye（魚眼）/ pinch（すぼめる）。n＝波の数
});
const WARP_TYPES = [['none', 'なし'], ['wave', '波'], ['swirl', '渦巻き'], ['fisheye', '魚眼'], ['pinch', 'すぼめる']];
// どれか1つでも有効か（マス・画像レイヤーで、別キャンバスを作るかどうかの判定に使う）。古いデータで項目が無くても落ちないように ?. で見る
const extraFxOn = x => !!x && !!(x.posterize?.on || x.thresh?.on || x.tilt?.on || x.rgb?.on || x.gmap?.on || x.rep?.on || x.sharp > 0 || x.noise > 0 ||
  x.half?.on || x.edge?.on || x.paint?.on || (x.warp && x.warp.type !== 'none' && x.warp.amt > 0));
// 効果の中の色を、使える色の文字列にそろえる（細工された保存データ対策。不正な色は描画を止めたり HTML 属性を壊したりする）。x をその場で書き換えて返す
function fxColorsSafe(x){
  const fix = (o, k, d) => { if(o && typeof o === 'object') o[k] = safeColor(o[k], d); };
  fix(x, 'duo1', '#1b1464'); fix(x, 'duo2', '#ff9d5c'); fix(x.tint, 'c', '#ff7a50');
  fix(x.thresh, 'c1', '#111111'); fix(x.thresh, 'c2', '#ffffff');
  fix(x.gmap, 'c1', '#1b0b3a'); fix(x.gmap, 'c2', '#ff3d7f'); fix(x.gmap, 'c3', '#ffe66b');
  fix(x.rep, 'from', '#ff3030'); fix(x.rep, 'to', '#2f8bff'); fix(x.half, 'c', '#111111'); fix(x.edge, 'c', '#111111');
  if(x.warp && !WARP_TYPES.some(t => t[0] === x.warp.type)) x.warp.type = 'none';
  return x;
}
// 色の文字列 → [r, g, b]。#rgb と #rrggbb に対応（それ以外は黒）。hex2rgb は #rgb を読めないため、ここでは別に用意する
function rgbOf(c){
  let h = String(c || '').replace('#', '');
  if(/^[0-9a-f]{3,4}$/i.test(h)) h = h.split('').map(v => v + v).join('');
  return /^[0-9a-f]{6}/i.test(h) ? [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)) : [0, 0, 0];
}
const fxLum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
const fxImgData = c => c.getContext('2d', {willReadFrequently:true}).getImageData(0, 0, c.width, c.height);

// グラデーションマップ：明るさで c1→c2→c3 の色に置き換え、a の割合で元の色と混ぜる（アルファはそのまま）
function gradMap(c, g){
  const im = fxImgData(c), d = im.data, A = rgbOf(g.c1), B = rgbOf(g.c2), C = rgbOf(g.c3), a = clamp(+g.a || 0, 0, 1);
  for(let i = 0; i < d.length; i += 4){
    const l = fxLum(d, i) / 255, P = l < 0.5 ? A : B, Q = l < 0.5 ? B : C, t = l < 0.5 ? l * 2 : l * 2 - 1;
    for(let k = 0; k < 3; k++) d[i + k] = d[i + k] * (1 - a) + (P[k] + (Q[k] - P[k]) * t) * a;
  }
  c.getContext('2d').putImageData(im, 0, 0);
}
// 色の置き換え：色相が from に近い（tol の範囲。端はなめらかに弱める）画素の色相を、to の色相へ回す。鮮やかさ・明るさは元のまま
function hueOf(r, g, b){ const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dd = mx - mn; if(!dd) return 0;
  const h = mx === r ? (g - b) / dd % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; return (h * 60 + 360) % 360; }
function colorReplace(c, r){
  const im = fxImgData(c), d = im.data, F = rgbOf(r.from), T = rgbOf(r.to), hf = hueOf(...F), ht = hueOf(...T), tol = clamp(+r.tol || 0, 0.01, 0.5) * 360;
  // 回す量（度）を、回転行列（色相の回転）で RGB に直接かける。重み w で元の色と混ぜる
  for(let i = 0; i < d.length; i += 4){
    const R = d[i], G = d[i + 1], B = d[i + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    if(mx - mn < 24) continue;   // 灰色に近い色は色相が定まらないので触らない
    let dh = Math.abs(hueOf(R, G, B) - hf); if(dh > 180) dh = 360 - dh;
    if(dh > tol) continue;
    const w = dh < tol * 0.6 ? 1 : (tol - dh) / (tol * 0.4), a = (ht - hf) * w * PI / 180, cs = Math.cos(a), sn = Math.sin(a);
    // 色相回転の行列（CSS の hue-rotate と同じ係数）
    const m = [0.213 + cs * 0.787 - sn * 0.213, 0.715 - cs * 0.715 - sn * 0.715, 0.072 - cs * 0.072 + sn * 0.928,
               0.213 - cs * 0.213 + sn * 0.143, 0.715 + cs * 0.285 + sn * 0.140, 0.072 - cs * 0.072 - sn * 0.283,
               0.213 - cs * 0.213 - sn * 0.787, 0.715 - cs * 0.715 + sn * 0.715, 0.072 + cs * 0.928 + sn * 0.072];
    d[i] = m[0] * R + m[1] * G + m[2] * B; d[i + 1] = m[3] * R + m[4] * G + m[5] * B; d[i + 2] = m[6] * R + m[7] * G + m[8] * B;
  }
  c.getContext('2d').putImageData(im, 0, 0);
}
// シャープ（アンシャープマスク）：まわり 3×3 の平均との差を amt 倍して足す（平均は自前で計算する。1px 未満の canvas の blur は効かないことがあるため）
function sharpen(c, amt){
  const W = c.width, H = c.height, im = fxImgData(c), d = im.data, s = new Uint8ClampedArray(d), k = clamp(amt, 0, 3) * 1.6;
  for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
    const i = (y * W + x) * 4, x0 = x > 0 ? -4 : 0, x1 = x < W - 1 ? 4 : 0, y0 = y > 0 ? -W * 4 : 0, y1 = y < H - 1 ? W * 4 : 0;
    for(let j = 0; j < 3; j++){ const q = i + j, avg = (s[q + y0 + x0] + s[q + y0] + s[q + y0 + x1] + s[q + x0] + s[q] + s[q + x1] + s[q + y1 + x0] + s[q + y1] + s[q + y1 + x1]) / 9;
      d[q] = s[q] + (s[q] - avg) * k; }
  }
  c.getContext('2d').putImageData(im, 0, 0);
}
// ノイズ：白黒のざらつきを足す（固定シードなので、描き直しても同じ模様）
function addNoise(c, amt){
  const im = fxImgData(c), d = im.data, R = rng(11), a = clamp(amt, 0, 1) * 90;
  for(let i = 0; i < d.length; i += 4){ const v = (R() - 0.5) * 2 * a; d[i] += v; d[i + 1] += v; d[i + 2] += v; }
  c.getContext('2d').putImageData(im, 0, 0);
}
// 網点：縮小して読んだ1マスの明るさで点の大きさを決め、白い紙に c の点を打つ。mix の割合で元の色を乗算で戻す。透明な部分は透明のまま
function halftoneImg(c, h, f){
  const W = c.width, H = c.height, s = Math.max(3, clamp(+h.size || 10, 2, 80) * f), gw = Math.ceil(W / s), gh = Math.ceil(H / s);
  const sm = mk(gw, gh), sx = sm.getContext('2d', {willReadFrequently:true}); sx.drawImage(c, 0, 0, gw, gh);
  const d = sx.getImageData(0, 0, gw, gh).data, t = mk(W, H), tx = t.getContext('2d');
  tx.fillStyle = '#ffffff'; tx.fillRect(0, 0, W, H); tx.fillStyle = h.c;
  tx.beginPath();
  for(let j = 0; j < gh; j++) for(let i = 0; i < gw; i++){
    const k = (j * gw + i) * 4, l = fxLum(d, k) / 255, r = s * 0.7 * Math.sqrt(Math.max(0, 1 - l));
    if(r < 0.4) continue;
    const x = i * s + s / 2 + (j % 2 ? s / 2 : 0), y = j * s + s / 2; tx.moveTo(x + r, y); tx.arc(x, y, r, 0, 2 * PI);
  }
  tx.fill();
  const mx = clamp(+h.mix || 0, 0, 1); if(mx > 0){ tx.globalCompositeOperation = 'multiply'; tx.globalAlpha = mx; tx.drawImage(c, 0, 0); tx.globalAlpha = 1; }
  tx.globalCompositeOperation = 'destination-in'; tx.drawImage(c, 0, 0);
  const x = c.getContext('2d'); x.clearRect(0, 0, W, H); x.drawImage(t, 0, 0);
}
// 線画：明るさの勾配（ソーベル）が強い所を線にする。少しぼかしてから見るのは、細かいざらつきを線にしないため
function edgeLines(c, e, f){
  const W = c.width, H = c.height, b = mk(W, H), bx = b.getContext('2d', {willReadFrequently:true});
  bx.filter = `blur(${Math.max(0.5, 0.8 * f)}px)`; bx.drawImage(c, 0, 0); bx.filter = 'none';
  const s = bx.getImageData(0, 0, W, H).data, L = new Float32Array(W * H);
  for(let i = 0, p = 0; p < L.length; i += 4, p++) L[p] = fxLum(s, i);
  const im = fxImgData(c), d = im.data, C = rgbOf(e.c), k = clamp(+e.amt || 1, 0.1, 4) / 255 * 1.6, keep = e.keep !== false;
  for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
    const p = y * W + x, i = p * 4, xl = x > 0 ? p - 1 : p, xr = x < W - 1 ? p + 1 : p, yu = y > 0 ? p - W : p, yd = y < H - 1 ? p + W : p;
    const gx = L[yu - p + xr] - L[yu - p + xl] + 2 * (L[xr] - L[xl]) + L[yd - p + xr] - L[yd - p + xl];
    const gy = L[yd - p + xl] - L[yu - p + xl] + 2 * (L[yd] - L[yu]) + L[yd - p + xr] - L[yu - p + xr];
    const a = clamp(Math.hypot(gx, gy) * k - 0.12, 0, 1);
    const R = keep ? d[i] : 255, G = keep ? d[i + 1] : 255, B = keep ? d[i + 2] : 255;
    d[i] = R + (C[0] - R) * a; d[i + 1] = G + (C[1] - G) * a; d[i + 2] = B + (C[2] - B) * a;
  }
  c.getContext('2d').putImageData(im, 0, 0);
}
// 油絵風（Kuwahara フィルター）：各画素のまわり4つの四角のうち、色のばらつきが一番小さい四角の平均色にする（筆で塗ったような平らな面になる）。
// 四角の合計は積分画像（累積和）で O(1) に求める。大きい画像は 2.1MP 以下に縮めて処理してから戻す（メモリと時間を抑えるため）
function paintify(c, p, f){
  const W0 = c.width, H0 = c.height, sc = Math.min(1, Math.sqrt(2.1e6 / (W0 * H0)));
  const W = Math.max(1, Math.round(W0 * sc)), H = Math.max(1, Math.round(H0 * sc)), r = clamp(Math.round(clamp(+p.r || 4, 1, 16) * f * sc), 1, 24);
  const t = mk(W, H), tx = t.getContext('2d', {willReadFrequently:true}); tx.drawImage(c, 0, 0, W, H);
  const im = tx.getImageData(0, 0, W, H), d = im.data, W1 = W + 1, S = [0, 1, 2].map(() => new Float64Array(W1 * (H + 1))), Q = new Float64Array(W1 * (H + 1));
  for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
    const i = (y * W + x) * 4, a = (y + 1) * W1 + x + 1, b = y * W1 + x + 1, cc = (y + 1) * W1 + x, dd = y * W1 + x;
    for(let k = 0; k < 3; k++) S[k][a] = d[i + k] + S[k][b] + S[k][cc] - S[k][dd];
    Q[a] = d[i] * d[i] + d[i + 1] * d[i + 1] + d[i + 2] * d[i + 2] + Q[b] + Q[cc] - Q[dd];
  }
  const box = (A, x0, y0, x1, y1) => A[y1 * W1 + x1] - A[y0 * W1 + x1] - A[y1 * W1 + x0] + A[y0 * W1 + x0];
  const out = new Uint8ClampedArray(d);
  for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
    let best = Infinity, m0 = 0, m1 = 0, m2 = 0;
    for(const [ax, ay] of [[x - r, y - r], [x, y - r], [x - r, y], [x, y]]){
      const x0 = clamp(ax, 0, W), y0 = clamp(ay, 0, H), x1 = clamp(ax + r + 1, 0, W), y1 = clamp(ay + r + 1, 0, H), n = (x1 - x0) * (y1 - y0);
      if(n <= 0) continue;
      const s0 = box(S[0], x0, y0, x1, y1), s1 = box(S[1], x0, y0, x1, y1), s2 = box(S[2], x0, y0, x1, y1);
      const v = box(Q, x0, y0, x1, y1) / n - (s0 * s0 + s1 * s1 + s2 * s2) / (n * n);
      if(v < best){ best = v; m0 = s0 / n; m1 = s1 / n; m2 = s2 / n; }
    }
    const i = (y * W + x) * 4; out[i] = m0; out[i + 1] = m1; out[i + 2] = m2;
  }
  im.data.set(out); tx.putImageData(im, 0, 0);
  const x = c.getContext('2d'), mask = mk(W0, H0), mx = mask.getContext('2d'); mx.drawImage(c, 0, 0);
  x.save(); x.clearRect(0, 0, W0, H0); x.drawImage(t, 0, 0, W0, H0); x.globalCompositeOperation = 'destination-in'; x.drawImage(mask, 0, 0); x.restore();
}
// ゆがみ：出来上がりの各画素が、元の絵のどこから来るかを計算して拾う（逆写像・双線形補間）。中心 (cx,cy) は渦巻き・魚眼・すぼめるの中心
function warpImg(c, w, cx, cy){
  const W = c.width, H = c.height, src = fxImgData(c).data, x = c.getContext('2d'), im = x.createImageData(W, H), d = im.data;
  const amt = clamp(+w.amt || 0, 0, 1), R = Math.min(W, H) / 2, n = clamp(+w.n || 6, 1, 40), A = amt * Math.min(W, H) * 0.05, lam = Math.min(W, H) / n * 2;
  const sample = (sx, sy, o) => {
    sx = clamp(sx, 0, W - 1); sy = clamp(sy, 0, H - 1);   // 外側は端の色で埋める（透明の隙間が出ないように）
    const x0 = sx | 0, y0 = sy | 0, x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1), fx = sx - x0, fy = sy - y0;
    const a = (y0 * W + x0) * 4, b = (y0 * W + x1) * 4, cc = (y1 * W + x0) * 4, dd = (y1 * W + x1) * 4;
    for(let k = 0; k < 4; k++) d[o + k] = (src[a + k] * (1 - fx) + src[b + k] * fx) * (1 - fy) + (src[cc + k] * (1 - fx) + src[dd + k] * fx) * fy;
  };
  for(let y = 0; y < H; y++) for(let X = 0; X < W; X++){
    let sx = X, sy = y;
    if(w.type === 'wave'){ sx = X + A * Math.sin(2 * PI * y / lam); sy = y + A * Math.sin(2 * PI * X / lam); }
    else{
      const dx = X - cx, dy = y - cy, r = Math.hypot(dx, dy);
      if(r < R && r > 0){
        const t = r / R;
        if(w.type === 'swirl'){ const a = amt * 2 * PI * (1 - t) * (1 - t), cs = Math.cos(a), sn = Math.sin(a); sx = cx + dx * cs - dy * sn; sy = cy + dx * sn + dy * cs; }
        else{ const rs = R * Math.pow(t, w.type === 'fisheye' ? 1 + amt * 1.2 : 1 / (1 + amt * 1.2)); sx = cx + dx / r * rs; sy = cy + dy / r * rs; }
      }
    }
    sample(sx, sy, (y * W + X) * 4);
  }
  x.putImageData(im, 0, 0);
}
// 色収差：赤を +d、青を −d ずらす（緑はそのまま）。アルファは3色のずらした位置の最大値
function rgbShift(c, s, f){
  const W = c.width, H = c.height, src = fxImgData(c).data, x = c.getContext('2d'), im = x.createImageData(W, H), d = im.data;
  const a = (+s.angle || 0) * PI / 180, dist = clamp(+s.d || 0, 0, 80) * f, ox = Math.round(Math.cos(a) * dist), oy = Math.round(Math.sin(a) * dist);
  const at = (X, Y) => (X < 0 || Y < 0 || X >= W || Y >= H) ? -1 : (Y * W + X) * 4;
  for(let y = 0; y < H; y++) for(let X = 0; X < W; X++){
    const o = (y * W + X) * 4, r = at(X - ox, y - oy), b = at(X + ox, y + oy);
    const ar = r < 0 ? 0 : src[r + 3], ab = b < 0 ? 0 : src[b + 3], ag = src[o + 3], al = Math.max(ar, ag, ab);
    if(!al) continue;
    // 透明な画素の色は 0 なので、各色はそのアルファで重みを付けてから全体のアルファで割る（縁が黒ずまないように）
    d[o] = r < 0 ? 0 : src[r] * ar / al; d[o + 1] = src[o + 1] * ag / al; d[o + 2] = b < 0 ? 0 : src[b + 2] * ab / al; d[o + 3] = al;
  }
  x.putImageData(im, 0, 0);
}
// postFx から呼ぶ：色を変える系（形は変えない）。c をその場で書き換える。順番：色を置き換える → 塗りを平らに → 階調を減らす → 線・点 → くっきり
function extraFxColor(c, b, f){
  if(b.gmap?.on) gradMap(c, b.gmap);
  if(b.rep?.on) colorReplace(c, b.rep);
  if(b.paint?.on) paintify(c, b.paint, f);
  if(b.posterize?.on) posterize(c, b.posterize.n);
  if(b.thresh?.on) threshold(c, b.thresh);
  if(b.edge?.on) edgeLines(c, b.edge, f);
  if(b.half?.on) halftoneImg(c, b.half, f);
  if(b.sharp > 0) sharpen(c, b.sharp);
}
// postFx から呼ぶ：形を動かす系（モザイクのあと、ブラーの前）。c をその場で書き換える
function extraFxShape(c, b, f, cx, cy){
  if(b.warp && b.warp.type !== 'none' && b.warp.amt > 0) warpImg(c, b.warp, cx, cy);
  if(b.rgb?.on && b.rgb.d > 0) rgbShift(c, b.rgb, f);
}
