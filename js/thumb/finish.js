/* 楽ちんサムネメーカー：仕上げエフェクト（文字・画像も含めたサムネ全体に最後にかける）と、背景の追加エフェクト（ポスタライズ・2値化・ミニチュア・柄）
   主な公開関数：applyFinish（仕上げ本体）／finOn（仕上げが何か有効か）／applyFinPreset／posterize・threshold・tiltShift・drawBgPattern（背景用）
   保存データ：DOC.fin（FIN_BASE の形）。項目が増えても古い保存データは FIN_BASE と Object.assign で合わせる前提なので、項目追加時は FIN_BASE に既定値（0＝無効）を入れる
   依存：mk・clamp・rgba・hex2rgb・rng・PI・DOC・syncDoc・docChanged（共通ユーティリティ側）。呼び出し側は描画の最後（全レイヤーを描き終えたあと）。 */
const FIN_BASE = () => ({look:'none', amt:1, bloom:0, leak:0, leakPos:'tr', leakC:'#ff8a3d', vig:0, grain:0, rgb:0, scan:0, half:0, halfSize:10});
// 色フィルター：f は CSS フィルター、o は [重ね方, 色, 濃さ] の色の重ね
// 配列は [表示名, CSSフィルター, 色の重ね]。キー名は DOC.fin.look に保存されるので、名前を変えると古い保存データが「なし」扱いになる
const FIN_LOOKS = {
  none:   ['なし'],
  cinema: ['シネマ', 'contrast(1.12) saturate(.88)', [['soft-light', '#0b7a8a', 0.45], ['soft-light', '#ff9a50', 0.18]]],
  emo:    ['エモい（くすみ）', 'contrast(.88) saturate(.8) brightness(1.06)', [['screen', '#3a2a4a', 0.35], ['soft-light', '#ffb3c7', 0.45]]],
  film:   ['フィルム', 'sepia(.25) contrast(1.06) saturate(.9)', [['screen', '#1e140a', 0.4], ['soft-light', '#ffcf8a', 0.3]]],
  neon:   ['夜のネオン', 'saturate(1.5) contrast(1.15)', [['soft-light', '#5a2bff', 0.55], ['soft-light', '#ff2bd6', 0.25]]],
  summer: ['真夏の鮮やか', 'saturate(1.5) brightness(1.06) contrast(1.06)', [['soft-light', '#ffe08a', 0.35]]],
  cool:   ['冷たい青', 'saturate(.9) contrast(1.05)', [['soft-light', '#2f6bff', 0.55]]],
  warm:   ['あたたかい', 'saturate(1.1)', [['soft-light', '#ff8a2a', 0.5]]],
  dream:  ['ゆめかわ', 'brightness(1.08) saturate(1.15) contrast(.92)', [['soft-light', '#ff9ad5', 0.35], ['screen', '#4a3a8a', 0.2]]],
  horror: ['ホラー', 'saturate(.35) contrast(1.3) brightness(.88)', [['multiply', '#7fa58a', 0.45]]],
  bleach: ['銀残し', 'saturate(.4) contrast(1.35)'],
  mono:   ['モノクロ', 'grayscale(1) contrast(1.25)'],
  retro:  ['レトロ（VHS）', 'saturate(1.25) contrast(.95)', [['screen', '#1a0a2a', 0.3], ['soft-light', '#ff6ad5', 0.15]]],
};
// プリセットは FIN_BASE に上書きする差分だけを書く（書かなかった項目は既定値に戻る）
const FIN_PRESETS = {
  cinema: ['シネマ', {look:'cinema', vig:0.35, grain:0.15}],
  emo:    ['エモい', {look:'emo', bloom:0.35, leak:0.4, grain:0.12}],
  film:   ['フィルム写真', {look:'film', grain:0.35, vig:0.4, leak:0.25}],
  vhs:    ['VHS', {look:'retro', rgb:5, scan:0.5, grain:0.25}],
  neon:   ['ネオン', {look:'neon', bloom:0.55, vig:0.3}],
  summer: ['夏', {look:'summer', leak:0.3, bloom:0.2, leakC:'#ffb03d'}],
  comic:  ['アメコミ', {half:0.85, halfSize:12, look:'summer', amt:0.7, vig:0.2}],
  horror: ['ホラー', {look:'horror', vig:0.6, grain:0.3, rgb:2}],
  dream:  ['ゆめかわ', {look:'dream', bloom:0.5, leak:0.3, leakC:'#ff9ad5'}],
  glitch: ['グリッチ', {rgb:12, scan:0.35, look:'neon', amt:0.5}],
  reset:  ['なし', {}],
};
const hexMix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
// 無効なときに applyFinish を丸ごと飛ばすための判定（コピー用キャンバスを何枚も作るので重い）。applyFinish の各分岐の条件と合わせること
const finOn = F => !!F && ((F.look !== 'none' && FIN_LOOKS[F.look] && F.amt > 0) || F.bloom > 0 || F.leak > 0 || F.vig > 0 || F.grain > 0 || F.rgb > 0 || F.scan > 0 || F.half > 0);
function applyFinPreset(name){ DOC.fin = Object.assign(FIN_BASE(), (FIN_PRESETS[name] || FIN_PRESETS.reset)[1]); syncDoc(); docChanged(false); }

// 粒子の柄は 256px の1枚をキャッシュして繰り返す。乱数は固定シード(7)なので、書き出しのたびにノイズが変わらない（プレビューと出力が一致）
let grainTile = null;
function grainPattern(x){
  if(!grainTile){ grainTile = mk(256, 256); const g = grainTile.getContext('2d'), im = g.createImageData(256, 256), d = im.data, R = rng(7);
    for(let i = 0; i < d.length; i += 4){ const v = 128 + (R() - 0.5) * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } g.putImageData(im, 0, 0); }
  return x.createPattern(grainTile, 'repeat');
}
// 仕上げ：c（描き終えたサムネ）をそのまま書き換える。透明な部分は透明のまま
// f：キャンバスの倍率（ドキュメント座標→ピクセル）。ぼかし・ずれ・粒などのピクセル量は f を掛けて、プレビューと書き出しで見た目を揃える
// 順序依存：ルック→網点→ブルーム→光漏れ→RGBずれ→走査線→粒子→ビネット。最後に元の透明部分で切り抜く（mask は処理前のコピー）
function applyFinish(c, F, f){
  const W = c.width, H = c.height, x = c.getContext('2d'), mask = mk(W, H); mask.getContext('2d').drawImage(c, 0, 0);
  const copy = (filter) => { const t = mk(W, H), tx = t.getContext('2d'); if(filter) tx.filter = filter; tx.drawImage(c, 0, 0); tx.filter = 'none'; return t; };
  x.save();
  const L = FIN_LOOKS[F.look];
  if(L && L[1] !== undefined && F.amt > 0){
    const t = copy(L[1]), tx = t.getContext('2d');
    for(const [m, col, a] of L[2] || []){ tx.globalCompositeOperation = m; tx.globalAlpha = a; tx.fillStyle = col; tx.fillRect(0, 0, W, H); }
    x.globalAlpha = clamp(F.amt, 0, 1); x.drawImage(t, 0, 0); x.globalAlpha = 1;
  }
  if(F.half > 0) halftoneOver(c, x, F, f);
  if(F.bloom > 0){
    // 明るい部分だけを残してぼかし、screen で2回重ねて光のにじみにする（2回は1回だと弱いため）
    const t = copy(`brightness(.8) contrast(2.4) blur(${Math.max(2, 28 * f)}px)`);
    x.globalCompositeOperation = 'screen'; x.globalAlpha = clamp(F.bloom, 0, 1); x.drawImage(t, 0, 0); x.drawImage(t, 0, 0);
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
  }
  if(F.leak > 0){
    // 光漏れ：P は光源の位置（画面に対する割合）。2つ目の光はずらした位置に、色を赤みへ寄せて重ねる
    const LP = {tl:[0, 0], tr:[1, 0], bl:[0, 1], br:[1, 1], l:[0, 0.5], r:[1, 0.5]}, P = hasKey(LP, F.leakPos) ? LP[F.leakPos] : [1, 0], M = Math.max(W, H);
    x.globalCompositeOperation = 'screen'; x.globalAlpha = clamp(F.leak, 0, 1);
    for(const [k, col, rr] of [[0, F.leakC, 0.8], [0.12, hexMix(F.leakC, '#ff2d6e', 0.5), 0.45]]){
      const px = (P[0] + (P[0] < 0.5 ? k : -k)) * W, py = P[1] * H, g = x.createRadialGradient(px, py, 0, px, py, M * rr);
      g.addColorStop(0, rgba(col, 1)); g.addColorStop(0.35, rgba(col, 0.55)); g.addColorStop(1, rgba(col, 0)); x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
  }
  if(F.rgb > 0){
    // RGBずれ：R・G・B の各チャンネルだけを残した3枚を左右にずらして加算合成する。黒で塗り直すのは加算の土台のため（透明は最後に mask で戻る）
    const d = F.rgb * f, ch = col => { const t = copy(), tx = t.getContext('2d'); tx.globalCompositeOperation = 'multiply'; tx.fillStyle = col; tx.fillRect(0, 0, W, H); return t; };
    const r = ch('#ff0000'), g = ch('#00ff00'), b = ch('#0000ff');
    x.clearRect(0, 0, W, H); x.fillStyle = '#000'; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'lighter';
    x.drawImage(r, -d, 0); x.drawImage(g, 0, 0); x.drawImage(b, d, 0); x.globalCompositeOperation = 'source-over';
  }
  if(F.scan > 0){
    // 走査線：高さ per px（最低2）の1列タイルの上半分を黒にして縦に繰り返す
    const per = Math.max(2, Math.round(4 * f * 2)), t = mk(1, per), tx = t.getContext('2d'); tx.fillStyle = '#000'; tx.fillRect(0, 0, 1, Math.max(1, per / 2));
    x.globalAlpha = clamp(F.scan, 0, 1) * 0.55; x.fillStyle = x.createPattern(t, 'repeat'); x.fillRect(0, 0, W, H); x.globalAlpha = 1;
  }
  if(F.grain > 0){
    x.globalCompositeOperation = 'overlay'; x.globalAlpha = clamp(F.grain, 0, 1) * 0.6;
    // 柄タイルは固定サイズなので、キャンバスを拡大してから塗って倍率 f に合わせる（塗る範囲は逆数で広げる）
    const p = grainPattern(x), s = Math.max(0.5, f * 1.2); x.save(); x.scale(s, s); x.fillStyle = p; x.fillRect(0, 0, W / s, H / s); x.restore();
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
  }
  if(F.vig > 0){
    const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.hypot(W, H) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${clamp(F.vig, 0, 1)})`); x.fillStyle = g; x.fillRect(0, 0, W, H);
  }
  x.globalCompositeOperation = 'destination-in'; x.drawImage(mask, 0, 0);
  x.restore();
}
// アメコミ風の網点：マスごとの色で、暗いほど大きい点を打つ
// 縮小して読み取った1ピクセル＝1マスの色を使う（全画素を読むより速い）。奇数行は半マスずらして千鳥配置。半径 0.4px 未満の点は打たない
function halftoneOver(c, x, F, f){
  const W = c.width, H = c.height, s = Math.max(3, F.halfSize * f), gw = Math.ceil(W / s), gh = Math.ceil(H / s);
  const sm = mk(gw, gh), sx = sm.getContext('2d', {willReadFrequently:true}); sx.drawImage(c, 0, 0, gw, gh);
  const d = sx.getImageData(0, 0, gw, gh).data, t = mk(W, H), tx = t.getContext('2d');
  tx.filter = 'brightness(1.3) saturate(.7)'; tx.drawImage(c, 0, 0); tx.filter = 'none';
  for(let j = 0; j < gh; j++) for(let i = 0; i < gw; i++){
    const k = (j * gw + i) * 4, l = (0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]) / 255, r = s * 0.62 * Math.sqrt(Math.max(0, 1 - l * 0.92));
    if(r < 0.4) continue;
    tx.fillStyle = `rgb(${d[k] * 0.7 | 0},${d[k + 1] * 0.7 | 0},${d[k + 2] * 0.7 | 0})`;
    tx.beginPath(); tx.arc(i * s + s / 2 + (j % 2 ? s / 2 : 0), j * s + s / 2, r, 0, 7); tx.fill();
  }
  x.globalAlpha = clamp(F.half, 0, 1); x.drawImage(t, 0, 0); x.globalAlpha = 1;
}

/* ---------- 背景の追加エフェクト ---------- */
// 以下は背景だけの画像 c をその場で書き換える（背景を描いたあと、他のレイヤーを重ねる前に呼ばれる想定）
// n 階調に減らす（最低2）
function posterize(c, n){
  const x = c.getContext('2d', {willReadFrequently:true}), im = x.getImageData(0, 0, c.width, c.height), d = im.data, k = Math.max(2, Math.round(n)) - 1;
  for(let i = 0; i < d.length; i += 4){ d[i] = Math.round(d[i] / 255 * k) / k * 255; d[i + 1] = Math.round(d[i + 1] / 255 * k) / k * 255; d[i + 2] = Math.round(d[i + 2] / 255 * k) / k * 255; }
  x.putImageData(im, 0, 0);
}
// 2値化：明るさ（輝度）が t.lvl（0〜1）を超えたら c2、以下なら c1 の単色にする。アルファは触らない
function threshold(c, t){
  const x = c.getContext('2d', {willReadFrequently:true}), im = x.getImageData(0, 0, c.width, c.height), d = im.data, A = hex2rgb(t.c1), B = hex2rgb(t.c2), lv = t.lvl * 255;
  for(let i = 0; i < d.length; i += 4){ const C = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) > lv ? B : A; d[i] = C[0]; d[i + 1] = C[1]; d[i + 2] = C[2]; }
  x.putImageData(im, 0, 0);
}
// ミニチュア風：上下をぼかして色を濃く
// t.pos：ピントを合わせる帯の中心（高さの割合）、t.w：帯の幅（割合）。ぼかした絵の帯の部分を透明に抜いて、くっきりした元絵の上に重ねる
function tiltShift(c, t, f){
  const W = c.width, H = c.height, x = c.getContext('2d');
  const base = mk(W, H), bx0 = base.getContext('2d'); bx0.filter = `saturate(${1 + t.sat}) contrast(1.06)`; bx0.drawImage(c, 0, 0);
  const B = mk(W, H), bx = B.getContext('2d'); bx.filter = `blur(${Math.max(1, t.blur * f)}px)`; bx.drawImage(base, 0, 0); bx.filter = 'none';
  const p = clamp(t.pos, 0, 1), w = clamp(t.w, 0.02, 1) / 2, g = bx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#000'); g.addColorStop(clamp(p - w, 0, 1), 'rgba(0,0,0,0)'); g.addColorStop(clamp(p + w, 0, 1), 'rgba(0,0,0,0)'); g.addColorStop(1, '#000');
  bx.globalCompositeOperation = 'destination-in'; bx.fillStyle = g; bx.fillRect(0, 0, W, H);
  x.clearRect(0, 0, W, H); x.drawImage(base, 0, 0); x.drawImage(B, 0, 0);
}
const BG_PATTERNS = [['dot', 'ドット'], ['stripe', 'ストライプ'], ['check', 'チェック'], ['grid', '方眼'], ['sunburst', '放射ライン'], ['hline', '横じま']];
// 柄を1枚のキャンバスに単色で描いてから、不透明度・合成モードを付けて重ねる（柄の重なりで濃さがムラにならないように）。
// cx, cy は放射ラインの中心（ピクセル座標）。他の柄では使わない。size は柄の大きさ（放射ラインだけは本数）
function drawBgPattern(ctx, W, H, f, p, cx, cy){
  const s = Math.max(3, p.size * f), t = mk(W, H), x = t.getContext('2d'); x.fillStyle = x.strokeStyle = p.c;
  if(p.type === 'dot'){ for(let j = 0, y = s / 2; y < H + s; y += s, j++) for(let X = (j % 2) * s / 2; X < W + s; X += s){ x.beginPath(); x.arc(X, y, s * 0.28, 0, 7); x.fill(); } }
  else if(p.type === 'stripe'){ x.lineWidth = s * 0.45; x.beginPath(); for(let X = -H; X < W + H; X += s){ x.moveTo(X, 0); x.lineTo(X + H, H); } x.stroke(); }
  else if(p.type === 'check'){ for(let j = 0; j * s < H; j++) for(let i = j % 2; i * s < W; i += 2) x.fillRect(i * s, j * s, s, s); }
  else if(p.type === 'grid'){ x.lineWidth = Math.max(1, s * 0.08); x.beginPath(); for(let X = 0; X < W; X += s){ x.moveTo(X, 0); x.lineTo(X, H); } for(let y = 0; y < H; y += s){ x.moveTo(0, y); x.lineTo(W, y); } x.stroke(); }
  else if(p.type === 'hline'){ for(let y = 0; y < H; y += s) x.fillRect(0, y, W, s * 0.4); }
  else if(p.type === 'sunburst'){ const n = Math.max(6, Math.round(p.size)), R = Math.hypot(W, H) * 2; x.beginPath();
    for(let i = 0; i < n; i++){ const a0 = i / n * 2 * PI, a1 = a0 + PI / n; x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R); x.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R); x.closePath(); } x.fill(); }
  ctx.save(); ctx.globalAlpha = clamp(p.a, 0, 1); ctx.globalCompositeOperation = p.mode || 'source-over'; ctx.drawImage(t, 0, 0); ctx.restore();
}
