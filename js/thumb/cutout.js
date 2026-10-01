/* 楽ちんサムネメーカー：背景の透明化（色指定）と、消す／戻すブラシ */
/*
  画像レイヤーに対して、元の画像は変えずに「透明にした絵」を作る。
    1) L.key  … 指定した背景色に近い部分を透明にする（スポイト・許容値・範囲・境界のぼかし・縁を削る・なめらかさ・にじみ除去）
    2) L.strokes … ブラシの跡（消す／戻す）。画像の割合の座標で持つので、トリミングや拡大縮小をしてもずれない
  できた絵は layerSrc(L) が返す（トリミング → 背景透過 → ブラシ の順）。結果は cutCache にレイヤーごとに1つだけ持つ。
  主な公開関数：cutSrc（layerSrc から呼ばれ、透過・ブラシ済みの絵を返す）／cutOn・cutKeyOn（有効判定）／cutSig（描画キャッシュ用の印）／
    keyNormalize・strokesNormalize（保存データの読み込み時の補正）／cutAutoColor・cutPixelColor（背景色の取得、UI から）
  依存：mk・clamp・hex2rgb・boxBlur・uid・cropOn・cropRect（共通側）。frames.js の framedCanvas は cutSig をキャッシュキーに含める。
  ブラシの座標 L.strokes[].p は「元の画像（トリミング前）の幅に対する割合」。半径 r も元画像の幅に対する割合（strokeApply で iw0 を掛ける）。
*/
const KEY_BASE = () => ({on:false, c:'#00b140', tol:25, soft:10, shrink:0, smooth:1, mode:'edge', fringe:true});
const cutKeyOn = L => !!(L.key && L.key.on);
const cutOn = L => cutKeyOn(L) || !!(L.strokes && L.strokes.length);
const cutCache = new Map();

// 保存データの読み込み：範囲外・型違いの値を直す
// KEY_BASE とマージするので、項目が増える前の古い保存データでも既定値で補われる
function keyNormalize(k){
  const o = Object.assign(KEY_BASE(), k && typeof k === 'object' ? k : {}), n = (v, a, b, d) => clamp(isFinite(+v) ? +v : d, a, b);
  o.on = !!o.on; o.c = /^#[0-9a-f]{6}$/i.test(o.c) ? o.c.toLowerCase() : '#00b140';
  o.tol = n(o.tol, 0, 100, 25); o.soft = n(o.soft, 0, 100, 10); o.shrink = n(o.shrink, 0, 8, 0); o.smooth = n(o.smooth, 0, 6, 1);
  o.mode = o.mode === 'all' ? 'all' : 'edge'; o.fringe = o.fringe !== false;
  return o;
}
// 跡の形：{id, m:'e'(消す)|'r'(戻す), r:半径(画像幅比), p:[[x,y]…](画像幅・高さ比)}。
// 壊れたデータや肥大化への備えで、本数 2000・1本あたり 20000 点まで。座標は画像の少し外（-0.5〜1.5）まで許す（縁をはみ出して塗るため）
function strokesNormalize(a){
  if(!Array.isArray(a)) return [];
  const f = v => clamp(+v || 0, -0.5, 1.5);
  return a.filter(s => s && (s.m === 'e' || s.m === 'r') && Array.isArray(s.p) && s.p.length).slice(0, 2000)
    .map(s => ({id:String(s.id || uid()), m:s.m, r:clamp(+s.r || 0.01, 0.0005, 1), p:s.p.slice(0, 20000).filter(q => Array.isArray(q) && q.length >= 2).map(q => [f(q[0]), f(q[1])])}))
    .filter(s => s.p.length);
}
// 絵が変わったかを見分ける印（キャッシュのキーに使う）
// ブラシは跡の本数と点の総数だけで見る（点の中身までは比べない）。描画中は点が増えるだけなので、これで変化を検知できる
function cutSig(L){
  if(!cutOn(L)) return '';
  let n = 0, m = 0; for(const s of L.strokes || []){ n++; m += s.p.length; }
  return (cutKeyOn(L) ? JSON.stringify(L.key) : '') + '#' + n + ':' + m;
}

/* ---------- 背景色を透明にする ---------- */
// 画像の四隅から背景色を推定する（中央値）
function cutAutoColor(img){
  const w = img.naturalWidth, h = img.naturalHeight, c = mk(w, h), x = c.getContext('2d', {willReadFrequently:true}); x.drawImage(img, 0, 0);
  const s = Math.max(1, Math.min(6, Math.floor(Math.min(w, h) / 20))), ch = [[], [], []];
  for(const [px, py] of [[0, 0], [w - s, 0], [0, h - s], [w - s, h - s]]){
    const d = x.getImageData(px, py, s, s).data;
    for(let i = 0; i < d.length; i += 4){ if(d[i + 3] < 128) continue; ch[0].push(d[i]); ch[1].push(d[i + 1]); ch[2].push(d[i + 2]); }
  }
  if(!ch[0].length) return null;
  const med = a => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
  return '#' + ch.map(a => med(a).toString(16).padStart(2, '0')).join('');
}
// 画像上の1点の色（元の絵のまま）
function cutPixelColor(img, px, py){
  const w = img.naturalWidth, h = img.naturalHeight, X = clamp(Math.round(px), 0, w - 1), Y = clamp(Math.round(py), 0, h - 1);
  const c = mk(1, 1), x = c.getContext('2d', {willReadFrequently:true}); x.drawImage(img, X, Y, 1, 1, 0, 0, 1, 1);
  const d = x.getImageData(0, 0, 1, 1).data; return d[3] < 8 ? null : '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
}
// 色指定の透過だけをかけた絵（キャンバス）を作る。img は元の絵を変えず、読み出し専用で使う
// 処理の順：色の近さ → 透明にする範囲 → 縁を削る → ぼかす → にじみ除去 → アルファ反映。1 画素ずつの処理なので大きい画像では重い（結果は cutSrc でキャッシュ）
function keyCanvas(img, k){
  const w = img.naturalWidth, h = img.naturalHeight, n = w * h, c = mk(w, h), x = c.getContext('2d', {willReadFrequently:true});
  x.drawImage(img, 0, 0);
  const im = x.getImageData(0, 0, w, h), d = im.data, [kr, kg, kb] = hex2rgb(k.c);
  // 距離は RGB 空間の最大距離（255*√3 ≒ 441.673）で 0〜1 に正規化。tol は 0〜100 を 0〜0.5、soft は 0〜0.25 に割り当てる（これ以上は大きすぎて絵が消えるため）
  // T 以下は完全に透明、T〜T+S は徐々に不透明（ramp）
  const T = k.tol / 100 * 0.5, S = k.soft / 100 * 0.25, TS = T + S, SCALE = 1 / 441.673;
  // 1) 背景色との近さ（0〜1）。もともと透明なところは背景とみなす
  const dist = new Float32Array(n);
  for(let i = 0, p = 0; i < n; i++, p += 4){
    if(d[p + 3] < 8){ dist[i] = 0; continue; }
    const dr = d[p] - kr, dg = d[p + 1] - kg, db = d[p + 2] - kb; dist[i] = Math.sqrt(dr * dr + dg * dg + db * db) * SCALE;
  }
  const ramp = v => v <= T ? 0 : (S > 0 ? (v >= TS ? 1 : (v - T) / S) : 1);
  let a = new Float32Array(n).fill(1);
  // 2) 透明にする範囲：「外側から」は画像の縁につながっている背景だけ、「全体」は同じ色すべて
  if(k.mode === 'all'){ for(let i = 0; i < n; i++) a[i] = ramp(dist[i]); }
  else{
    // 画像の四辺から塗りつぶし（再帰を使わず自前のスタックで。大きい画像でも呼び出しの深さで落ちない）。seen で同じ画素を2度積まない
    const seen = new Uint8Array(n), stack = new Int32Array(n); let sp = 0;
    const seed = i => { if(!seen[i] && dist[i] <= TS){ seen[i] = 1; stack[sp++] = i; } };
    for(let X = 0; X < w; X++){ seed(X); seed((h - 1) * w + X); }
    for(let Y = 0; Y < h; Y++){ seed(Y * w); seed(Y * w + w - 1); }
    while(sp){
      const i = stack[--sp], X = i % w; a[i] = ramp(dist[i]);
      if(X > 0) seed(i - 1); if(X < w - 1) seed(i + 1); if(i >= w) seed(i - w); if(i < n - w) seed(i + w);
    }
  }
  // 3) 縁を削る（周りの最小値）→ なめらかに（ぼかし）
  // 最小値フィルタを横→縦の2回に分けて行う（四角い範囲の最小値と同じ結果で、計算量が半径の2乗でなく1乗で済む）
  const r = Math.round(k.shrink);
  if(r > 0){
    const t = new Float32Array(n);
    for(let Y = 0; Y < h; Y++){ const o = Y * w; for(let X = 0; X < w; X++){ let m = 1; for(let q = Math.max(0, X - r), e = Math.min(w - 1, X + r); q <= e; q++){ const v = a[o + q]; if(v < m) m = v; } t[o + X] = m; } }
    for(let X = 0; X < w; X++) for(let Y = 0; Y < h; Y++){ let m = 1; for(let q = Math.max(0, Y - r), e = Math.min(h - 1, Y + r); q <= e; q++){ const v = t[q * w + X]; if(v < m) m = v; } a[Y * w + X] = m; }
  }
  if(k.smooth > 0){ const rr = Math.max(1, Math.round(k.smooth)); a = boxBlur(a, w, h, rr); }
  // 4) にじみ除去：半透明の縁の色を、すぐ内側の（不透明な）色で置き換えて、背景色の縁を消す
  if(k.fringe){
    // 探す範囲 R は、縁を削った量・ぼかした量に合わせて広げる（半透明の帯の幅がその分広がるため）。2〜6 に制限して重くなりすぎないようにする
    const R = Math.max(2, Math.min(6, Math.round(k.shrink + k.smooth + 2)));
    for(let Y = 0; Y < h; Y++) for(let X = 0; X < w; X++){
      const i = Y * w + X, v = a[i]; if(v >= 0.98 || v <= 0.004) continue;
      let sr = 0, sg = 0, sb = 0, cnt = 0;
      for(let yy = Math.max(0, Y - R), ye = Math.min(h - 1, Y + R); yy <= ye; yy++) for(let xx = Math.max(0, X - R), xe = Math.min(w - 1, X + R); xx <= xe; xx++){
        const j = yy * w + xx; if(a[j] < 0.98) continue; const p = j * 4; sr += d[p]; sg += d[p + 1]; sb += d[p + 2]; cnt++;
      }
      if(cnt){ const p = i * 4; d[p] = sr / cnt; d[p + 1] = sg / cnt; d[p + 2] = sb / cnt; }
    }
  }
  // アルファは最後に掛ける（にじみ除去は d の色を読み書きするので、アルファを先に変えると色の平均が崩れる。a は別配列で持っている）
  for(let i = 0, p = 3; i < n; i++, p += 4) d[p] = Math.round(d[p] * a[i]);
  x.putImageData(im, 0, 0);
  return c;
}

/* ---------- ブラシ（消す／戻す） ---------- */
// 1本分の跡を、まだ描いていない点から先だけ描き足す。src は元の絵（戻すとき用）、geo は元の画像のどこを使っているか
function strokeApply(F, src, st, from, geo){
  // from-1 から始めるのは、前回の最後の点と線をつなぐため（続きの線が途切れない）
  const pts = from > 0 ? st.p.slice(from - 1) : st.p; if(!pts.length) return;
  const r = Math.max(0.5, st.r * geo.iw0), P = pts.map(q => [q[0] * geo.iw0 - geo.sx, q[1] * geo.ih0 - geo.sy]);
  const path = c => {
    c.lineCap = c.lineJoin = 'round'; c.lineWidth = r * 2; c.beginPath();
    if(P.length === 1) c.arc(P[0][0], P[0][1], r, 0, 7); else { c.moveTo(P[0][0], P[0][1]); for(let i = 1; i < P.length; i++) c.lineTo(P[i][0], P[i][1]); }
  };
  const paint = c => { path(c); if(P.length === 1) c.fill(); else c.stroke(); };
  const x = F.getContext('2d');
  if(st.m === 'e'){ x.save(); x.globalCompositeOperation = 'destination-out'; x.fillStyle = x.strokeStyle = '#000'; paint(x); x.restore(); return; }
  // 戻す：跡の範囲だけ、元の絵を取り出して重ねる
  // 範囲(bx,by,bw,bh)は半径＋2px の余白付きで、画像の外にはみ出さないよう切り詰める。いったん跡を消してから重ねるので、半透明の縁が二重に濃くならない
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for(const [px, py] of P){ x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
  const bx = Math.max(0, Math.floor(x0 - r - 2)), by = Math.max(0, Math.floor(y0 - r - 2)), bw = Math.min(F.width, Math.ceil(x1 + r + 2)) - bx, bh = Math.min(F.height, Math.ceil(y1 + r + 2)) - by;
  if(bw < 1 || bh < 1) return;
  const T = mk(bw, bh), t = T.getContext('2d'); t.translate(-bx, -by); t.fillStyle = t.strokeStyle = '#fff'; paint(t);
  t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-in'; t.drawImage(src, bx, by, bw, bh, 0, 0, bw, bh);
  x.save(); x.globalCompositeOperation = 'destination-out'; x.fillStyle = x.strokeStyle = '#000'; paint(x); x.restore();
  x.drawImage(T, bx, by);
}

/* ---------- 切り取り・背景透過・ブラシをかけた絵 ---------- */
// S：トリミング済みの絵（{img}）、A：元の画像。トリミングの位置は元の画像の座標に直して使う
function cutSrc(L, S, A){
  const iw = S.img.naturalWidth, ih = S.img.naturalHeight, iw0 = A.img.naturalWidth, ih0 = A.img.naturalHeight;
  const rc = cropOn(L) ? cropRect(L, iw0, ih0) : {sx:0, sy:0}, geo = {sx:rc.sx, sy:rc.sy, iw0, ih0};
  const kon = cutKeyOn(L), bk = [L.asset, iw, ih, rc.sx, rc.sy, kon ? JSON.stringify(L.key) : ''].join('|');
  // bk：背景透過（base）を作り直すかの印。ブラシの本数・点数は含めない（ブラシだけの変更で重い色透過をやり直さないため）。sig は bk＋ブラシで、最終結果の印
  let e = cutCache.get(L.id);
  if(!e || e.bk !== bk){ e = {bk, base:kon ? keyCanvas(S.img, L.key) : null, fin:null, applied:[], obj:null, sig:''}; cutCache.set(L.id, e); }
  const strokes = L.strokes || [], sig = bk + '#' + strokes.length + ':' + strokes.reduce((n, s) => n + s.p.length, 0);
  if(e.obj && e.sig === sig) return e.obj;
  let fin = e.base;
  if(strokes.length){
    // これまでの続きから描き足せるか（先頭から同じ跡で、点が増えただけなら描き足す）
    const ok = e.fin && e.applied.length <= strokes.length && e.applied.every((q, i) => strokes[i].id === q.id && strokes[i].p.length >= q.n);
    if(!ok){ const c = mk(iw, ih); c.getContext('2d').drawImage(e.base || S.img, 0, 0); e.fin = c; e.applied = []; }
    strokes.forEach((st, i) => {
      const done = e.applied[i] ? e.applied[i].n : 0;
      if(done < st.p.length){ strokeApply(e.fin, S.img, st, done, geo); e.applied[i] = {id:st.id, n:st.p.length}; }
    });
    fin = e.fin;
  }else{ e.fin = null; e.applied = []; }
  // キャンバスに naturalWidth/Height を生やして、<img> と同じ形で扱えるようにする（後続の描画コードは img.naturalWidth を読むため）
  // 注意：fin は e.base／e.fin そのもの（コピーしない）ので、返した絵を呼び出し側で書き換えないこと
  const cv = fin; cv.naturalWidth = iw; cv.naturalHeight = ih;
  e.sig = sig; e.obj = {img:cv, name:A.name};
  return e.obj;
}
