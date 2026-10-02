/* 楽ちんサムネメーカー：サムネの描画（文字・画像レイヤー・背景・合成） */
/*
  役割：DOC を canvas に描く中心部。文字・画像レイヤー（フチ・影・光彩つき）、背景（単色・グラデ・画像＋色調/効果）、
       全体の合成（compose）、プレビュー表示（paintPreview）を持つ。分割フレーム・グループ・動的エフェクト・切り抜きフレーム・
       仕上げは別ファイルで、ここの compose / drawOne から呼ばれる。
  主な公開：compose(ctx,W,H,live,cache) / paintPreview(live) / livePaint / drawThumb / drawLayer / drawBackground /
           postFx・toneFilter（背景と分割フレームで共用）/ prevCache・dims / pruneLayerCaches / tvCss・snapLines・drag
  依存：DOC・ASSETS・layerSrc（assets.js）、render（text-render.js：文字を canvas に描く）、drawOne（group.js）、
       framedCanvas（frames.js）、applyFinish・finOn・drawBgPattern・posterize 等（finish.js）、drawOverlay（overlay.js）。
  呼び出し元：preview.js（update → drawThumb）、doc.js の docChanged、export.js（compose を書き出し解像度で呼ぶ）。
  描画の前提：
    - f = 描画先の幅 / DOC.w（DOC 座標 → canvas の px への倍率）。プレビューは小さい f、書き出しは exportW / DOC.w。
    - L.x・L.y は DOC 座標でのレイヤー中心。描くときは「中心へ translate → rotate → scale」の順。
    - live=true はドラッグ・スライダー操作中の軽い描画。キャッシュの拡大率が多少ずれていても作り直さない。
    - キャッシュ（cache）は Map<レイヤーid, {sk, k, c…}>。sk は「見た目を決める値の印」、k はそのとき描いた倍率、c は描いた canvas。
      sk が同じで k のずれが 2% 未満なら使い回し、c は拡大縮小して描く（s = need / k）。
*/
/* ---------- 描画 ---------- */
// prevCache：プレビュー用の描画キャッシュ（'__bg' に背景も入る）。dims：レイヤーid → 描画した絵の大きさ（DOC 座標。フチ込み・回転前）。
// dims は「描画のたびに」更新され、選択枠（overlay.js）・当たり判定（events.js）・グループの外枠（group.js）が読む。
// そのため、まだ描かれていないレイヤーや、キャンバス寸法を変えた直後は未登録・古い値になりうる（canvas.js で clear している）
const prevCache = new Map(), dims = new Map();
// 消えたレイヤーの描画キャッシュ・大きさの記録を捨てる（取り消し・削除のあと）。キャッシュは画像1枚ぶんの canvas を持つのでメモリ解放が目的。
// '__bg' はレイヤーではなく背景のキャッシュなので残す
function pruneLayerCaches(){ const ids = new Set(DOC.layers.map(l => l.id)); pruneMasks(ids); for(const m of [prevCache, dims, cropCache, cutCache]) for(const k of [...m.keys()]) if(k !== '__bg' && !ids.has(k)) m.delete(k); }
// tvCss：プレビュー canvas の画面上の表示幅（CSS px）。画面上の px を DOC 座標に直す（DOC.w / tvCss）ときに使う。
// snapLines：ドラッグ中のスナップ線（DOC 座標）。drag：キャンバス上のドラッグ状態（events.js が設定）
let tvCss = 800, snapLines = {x:null, y:null}, drag = null;
// 文字キャッシュの印に使う「フォントが読み込み済みか」。Web フォントは後から読み込み完了するので、
// これを印に含めないと、代替フォントで描いた古い絵がキャッシュに残ったままになる（読み込み前後で '0'→'1' に変わる）。
// 先頭の1文字は日本語フォント、2文字目は英数字用フォント（fontLatin があるとき）の状態
function fontKey(st){
  const t = st.text.replace(/[{}\n]/g, '').slice(0, 24) || 'あ';
  let k = document.fonts.check(`${st.weight} 20px "${st.font}"`, t) ? '1' : '0';
  if(st.fontLatin) k += document.fonts.check(`${st.weight} 20px "${st.fontLatin}"`, 'A1') ? '1' : '0';
  return k;
}
// 文字レイヤーの絵（{sk, k, c}）。実際の描画は text-render.js の render(倍率, スタイル)。
// pad:2 は、描いた文字を外接矩形に切り詰めたあとに残す余白（px）。レイヤーの絵が文字ぴったりになるので、dims（選択枠）もそのサイズになる
/** @param {Layer} L */
function textCanvas(L, need, live, cache){
  const sk = JSON.stringify(L.style) + fontKey(L.style);
  let e = cache.get(L.id);
  if(!(e && e.sk === sk && (live || Math.abs(e.k - need) / need < 0.02))){
    const c = render(need, Object.assign({}, L.style, {pad: 2}));
    e = {sk, k:need, c}; cache.set(L.id, e);
  }
  return e;
}
// 画像の形のまま color で塗りつぶした canvas（フチ・影の元絵）。source-in で、不透明部分だけが color になる
function tinted(A, color){
  // フチ色ごとに作ると色を動かすたびにメモリが増えるので、最後の1色だけ持つ
  if(A.tintColor === color && A.tintCanvas) return A.tintCanvas;
  const c = mk(A.img.naturalWidth, A.img.naturalHeight), x = c.getContext('2d');
  x.drawImage(A.img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  A.tintColor = color; return A.tintCanvas = c;
}
// 画像の明度・彩度（0 で元のまま）。フチ・影にはかけず、絵だけにかける
/** @param {Layer} L */
const imgFilter = L => { const f = []; if(L.bright) f.push(`brightness(${Math.max(0, 1 + L.bright)})`); if(L.sat) f.push(`saturate(${Math.max(0, 1 + L.sat)})`); return f.join(' ') || 'none'; };
// 画像レイヤーの「効果」（コントラスト・色相・ぼかし・トーン・ズーム／モーションブラー・モザイク・暗く・周辺減光・色を重ねる。分割フレームのマスと同じ L.fx）。
// 明度・彩度だけは従来どおり L.bright / L.sat に持つ（imgFilter）ので、ここでは数えない
/** @param {Layer} L */
const imgFxOn = L => { const x = L.fx; return !!x && !!(x.contrast || x.hue || x.blur > 0 || x.tone !== 'none' || x.zb.on || x.mb.on || x.mosaic.on || x.dim > 0 || x.vignette > 0 || x.tint.on); };
/* 画像の絵を ctx の (dx,dy,dw,dh) に描く。効果が無ければ従来どおり明度・彩度のフィルターだけで直接描く。
   効果があるときは、絵だけを別キャンバス（ぼかし・ブラーのぶん余白付き）に描いて効果をかけてから置く（フチ・影にはかけない）。
   f＝DOC 座標→描画先ピクセルの倍率（効果の量は DOC 座標で持っているため）。暗く・色かぶり・周辺減光は source-atop で、絵のある部分にだけかける。
   作る canvas が大きすぎる（極端に拡大した画像）ときは、効果を省いて直接描く */
/** @param {Layer} L */
function imgPicture(x, A, L, f, dx, dy, dw, dh){
  if(!imgFxOn(L)){ x.filter = imgFilter(L); x.drawImage(A.img, dx, dy, dw, dh); x.filter = 'none'; return; }
  const fx = Object.assign({}, L.fx, {bright: L.bright || 0, sat: L.sat || 0});
  const m = Math.ceil(fx.blur * f * 3 + (fx.mb.on ? fx.mb.dist * f / 2 : 0)), tw = Math.ceil(dw) + m * 2, th = Math.ceil(dh) + m * 2;
  if(tw * th > 3e7){ x.filter = imgFilter(L); x.drawImage(A.img, dx, dy, dw, dh); x.filter = 'none'; return; }
  const t = mk(tw, th), tx = t.getContext('2d');
  tx.filter = toneFilter(fx, f); tx.drawImage(A.img, m, m, dw, dh); tx.filter = 'none';
  const o = postFx(t, fx, f, m + dw / 2, m + dh / 2), ox = o.getContext('2d');
  ox.save(); ox.globalCompositeOperation = 'source-atop';
  if(fx.dim > 0){ ox.fillStyle = `rgba(0,0,0,${fx.dim})`; ox.fillRect(0, 0, o.width, o.height); }
  if(fx.tint.on && fx.tint.a > 0){ ox.globalCompositeOperation = fx.tint.mode; ox.globalAlpha = fx.tint.a; ox.fillStyle = fx.tint.c; ox.fillRect(0, 0, o.width, o.height); ox.globalAlpha = 1; ox.globalCompositeOperation = 'source-atop'; }
  if(fx.vignette > 0){
    const vx = m + dw / 2, vy = m + dh / 2, g = ox.createRadialGradient(vx, vy, Math.min(dw, dh) * 0.3, vx, vy, Math.hypot(dw, dh) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${fx.vignette})`); ox.fillStyle = g; ox.fillRect(0, 0, o.width, o.height);
  }
  ox.restore();
  x.drawImage(o, dx - m, dy - m);
}
/* 画像レイヤーの絵（フチ・色調込み）を作ってキャッシュする。戻り値は cache のエントリ {sk, k, c}。
   c は「画像本体 + 四方に pad」の canvas で、中心が画像の中心。pad はフチ・ぼかしがはみ出すぶん。
   フレーム形状があるときは framedCanvas（frames.js）に任せる。
   sk の中身が、この絵の見た目に効く値の全部（トリミング・フチ・反転・明度彩度・背景透過/ブラシ）。ここに無い値を変えても再描画されない。
   明度・彩度（imgFilter）は絵だけにかけて、フチ・影にはかけない。 */
/** @param {Layer} L */
function imageCanvas(L, f, live, cache){
  const A = layerSrc(L); if(!A) return null;
  if(L.frame && L.frame.shape && L.frame.shape !== 'none') return framedCanvas(L, f, live, cache);
  const need = L.sc * f, o = L.outline, ow = o.on ? o.w : 0;
  const sk = [L.asset, JSON.stringify(cropOf(L)), o.on, o.w, o.c, o.style, o.c2, o.w2, o.blur, L.flip, L.flipV, L.bright, L.sat, JSON.stringify(L.fx), cutSig(L)].join('|');
  let e = cache.get(L.id);
  if(!(e && e.sk === sk && (live || Math.abs(e.k - need) / need < 0.02))){
    const iw = A.img.naturalWidth, ih = A.img.naturalHeight, r = ow * f, st = o.style === 'double' || o.style === 'grad' ? o.style : 'solid';
    const r2 = st === 'double' ? (ow + Math.max(0, o.w2 || 0)) * f : r, ob = r > 0 ? Math.max(0, o.blur || 0) * f : 0;
    const pad = Math.ceil(Math.max(r, r2) + ob * 1.6) + 2;
    const cw = Math.max(1, Math.round(iw * need)), ch = Math.max(1, Math.round(ih * need));
    const c = mk(cw + pad * 2, ch + pad * 2), x = c.getContext('2d');
    const flipTo = y => { if(L.flip){ y.translate(c.width, 0); y.scale(-1, 1); } if(L.flipV){ y.translate(0, c.height); y.scale(1, -1); } };
    if(r > 0){
      // フチ：canvas にはパスの太らせ（stroke 的な処理）が無いので、フチ色に塗った絵を円周上に少しずつずらして貼る方法で太らせる。
      // 半径 rad と rad*0.55 の2周にして、細い隙間ができにくくする。貼る数 n は半径に比例（16〜56）
      const O = mk(c.width, c.height), y = O.getContext('2d'); flipTo(y);
      const stamp = (t, rad) => { const n = Math.max(16, Math.min(56, Math.round(rad * 1.5)));
        for(const rr of [rad, rad * 0.55]) for(let i = 0; i < n; i++){ const a = i / n * 2 * PI; y.drawImage(t, pad + Math.cos(a) * rr, pad + Math.sin(a) * rr, cw, ch); } };
      if(st === 'double') stamp(tinted(A, o.c2), r2);
      stamp(tinted(A, o.c), r);
      // 'grad'：太らせた形を上下グラデの色で塗り直す（source-in で形だけ残す）。setTransform で反転を解いてから塗る
      if(st === 'grad'){ y.setTransform(1, 0, 0, 1, 0, 0); y.globalCompositeOperation = 'source-in'; const g = y.createLinearGradient(0, pad, 0, c.height - pad); g.addColorStop(0, o.c); g.addColorStop(1, o.c2); y.fillStyle = g; y.fillRect(0, 0, c.width, c.height); }
      // blur() の値は標準偏差なので、見た目の広がり（ob）の半分を渡す
      if(ob > 0){ x.filter = `blur(${ob / 2}px)`; x.drawImage(O, 0, 0); x.filter = 'none'; } else x.drawImage(O, 0, 0);
    }
    flipTo(x);
    imgPicture(x, A, L, f, pad, pad, cw, ch);
    e = {sk, k:need, c}; cache.set(L.id, e);
  }
  return e;
}
/* 影・光彩：絵の形（フチ込み）から作ったぼかし画像。画像のキャッシュ(e)にくっつけて使い回す。大きさは e.c の座標。
   q は e.c の座標へ直す倍率（影・光彩の px 指定は DOC 座標なので）。spread で形を太らせ（フチと同じ円周スタンプ）、blur でぼかす。
   str>1 は同じ絵を重ねて濃くする（光彩の「強さ」。最大4回）。キーが変わるたびに作るので、スライダー操作中のメモリ増加を抑えるため6個を超えたら捨てる。
   pad の上限 700px は、極端な設定で巨大な canvas を作らないための歯止め */
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
// 文字・画像レイヤー1枚を描く（グループの中身からも呼ばれる）。
// need = 今の描画先で必要な倍率、e.k = キャッシュ絵を描いたときの倍率。差があれば s = need / e.k で拡大縮小して貼る（live 中のごまかし）。
// dims には「回転前・DOC 座標」の大きさを記録する（e.c の寸法 ÷ e.k = 倍率1のときの寸法、× L.sc = DOC 座標）
/** @param {Layer} L */
function drawLayer(ctx, L, f, live, cache){
  const need = L.sc * f;
  const e = L.type === 'text' ? textCanvas(L, need, live, cache) : imageCanvas(L, f, live, cache);
  if(!e) return;
  const s = need / e.k;
  dims.set(L.id, {w: e.c.width / e.k * L.sc, h: e.c.height / e.k * L.sc});
  ctx.save(); ctx.globalAlpha = L.op ?? 1; ctx.globalCompositeOperation = L.blend || 'source-over';
  // 影・光彩は本体より先（奥）に描く。drawH は本体と同じ変換（位置・回転・拡大）で、ずらし dx,dy だけ足して halo を貼る。
  // q は halo を e.c の座標で作るための倍率（f / s）
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
/* ここから下の duotone・mosaic・zoomBlur・motionBlur は、背景画像（と分割フレームのマス）の効果。c を直接書き換えるものと、新しい canvas を返すものがある。
   duotone：輝度（0.299/0.587/0.114 の標準的な加重）を 0〜1 にして、暗い色 c1 → 明るい色 c2 の間を補間する */
function duotone(c, c1, c2){
  const x = c.getContext('2d', {willReadFrequently:true}), im = x.getImageData(0, 0, c.width, c.height), d = im.data;
  const A = hex2rgb(c1), B = hex2rgb(c2);
  for(let i = 0; i < d.length; i += 4){
    const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    d[i] = A[0] + (B[0] - A[0]) * l; d[i + 1] = A[1] + (B[1] - A[1]) * l; d[i + 2] = A[2] + (B[2] - A[2]) * l;
  }
  x.putImageData(im, 0, 0);
}
// モザイク：いったん縮小して、補間なし（imageSmoothingEnabled=false）で拡大し直す。c を直接書き換える
function mosaic(c, size){
  const W = c.width, H = c.height, sw = Math.max(1, Math.round(W / Math.max(2, size))), sh = Math.max(1, Math.round(H / Math.max(2, size)));
  const t = mk(sw, sh); t.getContext('2d').drawImage(c, 0, 0, sw, sh);
  const x = c.getContext('2d'); x.save(); x.imageSmoothingEnabled = false; x.clearRect(0, 0, W, H); x.drawImage(t, 0, 0, W, H); x.restore();
}
// ズームブラー：中心 (cx,cy) を基準に少しずつ拡大した絵を、alpha 1/(i+1) で重ねる（＝全枚数の平均になる）。枚数 n は強さに応じて 10〜32 で負荷を抑える。新しい canvas を返す
function zoomBlur(src, amt, cx, cy){
  const W = src.width, H = src.height, o = mk(W, H), x = o.getContext('2d'), n = Math.max(10, Math.min(32, Math.round(amt * 70)));
  for(let i = 0; i < n; i++){
    const s = 1 + amt * i / (n - 1);
    x.globalAlpha = 1 / (i + 1); x.setTransform(s, 0, 0, s, cx - cx * s, cy - cy * s); x.drawImage(src, 0, 0);
  }
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1;
  return o;
}
// モーションブラー：角度方向に ±dist/2 の範囲でずらして重ねる。新しい canvas を返す
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
/* 画像の色調・効果（背景と分割フレームのマスで共通。b は bright/contrast/sat/hue/blur/tone/duo1/duo2/mosaic/mb/zb を持つ）。
   canvas の CSS filter 文字列を返す（何も無ければ 'none'）。ぼかしは DOC 座標の px なので f を掛けて描画先の px にする。
   'duotone' は filter では表せないので、ここでは何もせず postFx 側で後処理する */
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
// 描き終えた画像にかける効果（2色・ポスタライズ・2値化・ミニチュア・モザイク・モーションブラー・ズームブラー）。cx, cy はズームブラーの中心。
// 順序依存：色を減らす系（2色・ポスタライズ・2値化）→ ぼかし系（ミニチュア）→ モザイク →（新しい canvas を作る）モーション → ズーム。
// 前半は c を直接書き換え、後半は新しい canvas を返すので、必ず戻り値を使うこと
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
// 背景画像を W×H の canvas に描いて効果までかけて返す。余白（画像が画面より小さい／contain のとき）は、
// 'blur' なら同じ画像を cover で拡大して暗くぼかしたものを敷く、'color' なら単色。
// ぼかし画像を m=80px ぶん大きく描くのは、ぼかしで端が透けて黒い縁が出るのを防ぐため。
// 画像が未読み込み（ASSETS に無い）ときは暗い単色を返す（読み込み完了後に compose のキャッシュキーが変わって描き直される）
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
// 背景の描画順：（単色／グラデ／画像）→ 暗くする → グラデ影 → 色を重ねる → 柄 → 周辺減光。
// 周辺減光・柄・ズームブラーの中心は bg.fcx/fcy（0〜1 の比率。-0.2〜1.2 まで画面外も可）。
// グラデの r は、角度 a 方向に画面を覆いきる長さ（四隅まで色が届くように |cos|W + |sin|H の半分）
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
/* 全体の合成：背景 → レイヤー（DOC.layers の配列順＝奥から手前）→ 仕上げエフェクト。
   背景は重い（画像・ぼかし）ので cache の '__bg' に持ち、キーが同じなら使い回す。キーは背景設定・描画サイズ・キャンバス寸法・
   背景画像が読み込めているか（IndexedDB からの復元が遅れて終わったときに描き直すため）。
   gid 付きのレイヤー（グループの中身）は、ここでは描かずグループが自分の位置で描く。
   仕上げ（fin）がオンのときは、いったん別 canvas T に全部描いてから applyFinish をかけて ctx に重ねる：
   仕上げは背景・全レイヤーを描き終えた1枚に対してまとめてかけるため。 */
function compose(ctx, W, H, live, cache){
  const f = W / DOC.w, key = JSON.stringify(DOC.bg) + '|' + W + 'x' + H + '|' + DOC.w + 'x' + DOC.h + '|' + (ASSETS[DOC.bg.asset] ? 1 : 0);
  let b = cache.get('__bg');
  if(!b || b.key !== key){ const c = mk(W, H); drawBackground(c.getContext('2d'), W, H, f); b = {key, c}; cache.set('__bg', b); }
  const fo = finOn(DOC.fin), T = fo ? mk(W, H) : null, x = fo ? T.getContext('2d') : ctx;
  if(!DOC.bg.hidden){ x.save(); x.globalAlpha = clamp(DOC.bg.op ?? 1, 0, 1); x.drawImage(b.c, 0, 0); x.restore(); }
  for(const L of DOC.layers) if(!L.hidden && !L.gid) drawOne(x, L, f, live, cache);
  // 仕上げエフェクト：全部描いてから、まとめてかける（レイヤーごとではなく全体にかかる）
  if(fo){ applyFinish(T, DOC.fin, f); ctx.drawImage(T, 0, 0); }
}
/* プレビュー canvas（#tv）に描く。表示幅 w は、ステージの余白を除いた幅・高さに収まる最大値（縦横比 DOC.w:DOC.h を保つ）。
   canvas 内部の解像度は w × dpr（最大2：高密度画面でも重くしすぎない）。small は縮小表示モード（幅 246 固定）で、補助表示を出さない。
   サイズが変わったときだけ width/height を代入する（代入すると canvas が消えてちらつくため）。
   live=false のときだけレイヤーパネルのサムネを更新する（ドラッグ中は重いので省く） */
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
  // 背景が透明・半透明のときは、CSS 側で市松模様を下に見せる（書き出しには入らない）
  tv.classList.toggle('clearbg', !!DOC.bg.hidden || (DOC.bg.op ?? 1) < 1);
  compose(ctx, W, H, live, prevCache);
  if(!small) drawOverlay(ctx, W, H, dpr);
  updateCellFab();
  if(!live) refreshThumbs();
  $('#info').textContent = `${DOC.exportW} × ${Math.round(DOC.exportW * DOC.h / DOC.w)} px ・ ${DOC.fmt.toUpperCase()}`;
}
// ドラッグ中の描画要求を 1 フレームに 1 回にまとめる（直前の予約は取り消す）
function livePaint(){ cancelAnimationFrame(livePaint.r); livePaint.r = requestAnimationFrame(() => paintPreview(true)); }
// 通常（高品質）の再描画。先にフォントを読み込んでから描く。tok は preview.js の世代番号で、待っている間に次の更新が来たら古いほうを捨てる
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
