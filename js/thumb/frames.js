/* 楽ちんサムネメーカー：画像の切り抜きフレーム */
/* ---------- 画像の切り抜きフレーム ---------- */
// 「筆のかすれ（別パターンにする）」で形が変わる、乱数を使う形
const FRAME_SEEDED = ['swipe', 'drybrush', 'brushbox', 'rip', 'brushtri', 'brushcircle', 'torn', 'splash', 'burst'];
function FRAME_BASE(){ return {shape:'none', ar:'auto', fs:1, cx:0.5, cy:0.5, r:0.12, style:'solid', c2:'#1f1b2d', seed:1}; }
const FRAME_SHAPES = [
  ['none','なし'], ['rect','四角（角丸）'], ['circle','丸'], ['arch','アーチ'], ['hex','六角形'], ['oct','八角形'], ['diamond','ひし形'], ['tri','三角'],
  ['slant','平行四辺形'], ['shield','盾'], ['star','星'], ['kira','キラッ'], ['heart','ハート'], ['burst','バクハツ'], ['cloud','もこもこ'], ['flower','花'],
  ['bubble','吹き出し'], ['torn','ラフな切り口'], ['cut','サイバーカット'], ['notch','HUD（角カット）'], ['blade','ブレード'], ['trap','台形'],
  ['shard','クリスタル'], ['chevron','矢印'], ['pill','カプセル'], ['squircle','スクワークル'], ['penta','五角形'], ['hexv','縦六角形'], ['cross','十字'],
  ['drop','しずく'], ['ticket','チケット'], ['wave','なみなみ'], ['splash','スプラッシュ'],
  ['swipe','筆のひと塗り'], ['drybrush','かすれ筆'], ['brushbox','筆の四角'], ['rip','破れ紙'], ['brushtri','筆の三角'], ['brushcircle','筆の丸'],
];
const FRAME_AUTO = new Set(['rect', 'arch', 'slant', 'shield', 'torn', 'bubble', 'cloud', 'cut', 'notch', 'blade', 'trap', 'chevron', 'pill', 'squircle', 'ticket', 'wave', 'swipe', 'drybrush', 'brushbox', 'rip']);
const FRAME_STYLES = [['none','枠なし（切り抜きだけ）'], ['solid','単色のフチ'], ['double','二重線'], ['pop','2色フチ（ポップ）'], ['grad','グラデーション'],
  ['neon','ネオン（光る）'], ['neon2','2色ネオン'], ['dash','点線'], ['photo','ポラロイド風'], ['tape','マスキングテープ'],
  ['hud','サイバーHUD'], ['bracket','ファインダー（四隅だけ）'], ['glitch','グリッチ'], ['metal','メタル'], ['block','立体影'],
  ['rgb','ゲーミングRGB'], ['aura','オーラ（後光）'], ['triple','三重線'], ['sticker','ステッカー'], ['stitch','ステッチ（ワッペン）'],
  ['halftone','アメコミドット'], ['brush','墨・筆'], ['film','フィルム'], ['crt','ブラウン管'], ['pixel','ドット絵'], ['book','本（ページ）']];
const FRAME_PRESETS = [
  ['icon','アイコン', {shape:'circle', style:'pop', c2:'#1f1b2d'}, {w:12, c:'#ffffff'}],
  ['wipe','ワイプ', {shape:'rect', r:0.08, style:'double', ar:'1.778'}, {w:12, c:'#ffffff'}],
  ['photo','ポラロイド', {shape:'rect', r:0.01, style:'photo', ar:'1'}, {w:22, c:'#ffffff'}],
  ['neon','ネオン', {shape:'hex', style:'neon'}, {w:10, c:'#34d2ff'}],
  ['heart','ハート', {shape:'heart', style:'grad', c2:'#ffb000'}, {w:12, c:'#ff4f8b'}],
  ['boom','バクハツ', {shape:'burst', style:'pop', c2:'#1f1b2d'}, {w:12, c:'#ffe600'}],
  ['bubble','吹き出し', {shape:'bubble', r:0.18, style:'pop', c2:'#1f1b2d'}, {w:8, c:'#ffffff'}],
  ['game','ゲーム風', {shape:'slant', style:'pop', c2:'#ff4f8b'}, {w:8, c:'#ffffff'}],
  ['tape','マステ', {shape:'torn', style:'tape', c2:'#ffb6d0'}, {w:6, c:'#ffffff'}],
  ['star','スター', {shape:'star', style:'grad', c2:'#ff4f8b'}, {w:12, c:'#ffe600'}],
  ['cloud','もこもこ', {shape:'cloud', style:'dash'}, {w:9, c:'#ffffff'}],
  ['cyber','サイバー', {shape:'notch', style:'hud'}, {w:10, c:'#34d2ff'}],
  ['glitch','グリッチ', {shape:'cut', style:'glitch'}, {w:10, c:'#ffffff'}],
  ['metal','メタル', {shape:'cut', style:'metal'}, {w:18, c:'#d8dde6'}],
  ['gold','ゴールド', {shape:'hex', style:'metal'}, {w:18, c:'#ffc83d'}],
  ['vs','VS', {shape:'blade', style:'block', c2:'#ff2d55'}, {w:11, c:'#ffffff'}],
  ['finder','ファインダー', {shape:'rect', r:0.02, style:'bracket', ar:'1.778'}, {w:8, c:'#ffffff'}],
  ['twin','ツインネオン', {shape:'circle', style:'neon2', c2:'#34d2ff'}, {w:14, c:'#ff4f8b'}],
  ['crystal','クリスタル', {shape:'shard', style:'grad', c2:'#b388ff'}, {w:14, c:'#8ff3ff'}],
  ['arrow','アロー', {shape:'chevron', style:'block', c2:'#1f1b2d'}, {w:11, c:'#ffe600'}],
  ['gaming','ゲーミング', {shape:'squircle', style:'rgb'}, {w:12, c:'#ffffff'}],
  ['8bit','8bit', {shape:'rect', r:0, style:'pixel', c2:'#1f1b2d'}, {w:14, c:'#ffffff'}],
  ['tv','レトロTV', {shape:'squircle', style:'crt', ar:'1.333'}, {w:18, c:'#2b2b33'}],
  ['aura','オーラ', {shape:'circle', style:'aura'}, {w:16, c:'#ffe600'}],
  ['comic','アメコミ', {shape:'rect', r:0, style:'halftone', c2:'#ff4f8b'}, {w:10, c:'#1f1b2d'}],
  ['sumi','墨・筆', {shape:'circle', style:'brush'}, {w:14, c:'#1a1a1a'}],
  ['film','フィルム', {shape:'rect', r:0.01, style:'film', ar:'1.333'}, {w:12, c:'#151515'}],
  ['patch','ワッペン', {shape:'rect', r:0.2, style:'stitch', c2:'#ff8fb1'}, {w:12, c:'#ffffff'}],
  ['sticker','ステッカー', {shape:'splash', style:'sticker'}, {w:14, c:'#ffffff'}],
  ['ticket','チケット', {shape:'ticket', style:'triple', c2:'#ffb000'}, {w:6, c:'#1f1b2d'}],
  ['drop','しずく', {shape:'drop', style:'grad', c2:'#b388ff'}, {w:12, c:'#34d2ff'}],
  ['pill','カプセル', {shape:'pill', style:'pop', c2:'#1f1b2d', ar:'1.778'}, {w:10, c:'#ffe600'}],
  ['wave','なみなみ', {shape:'wave', style:'solid'}, {w:10, c:'#ffffff'}],
  ['swipe','筆ひと塗り', {shape:'swipe', style:'none', ar:'1.778'}, null],
  ['dry','かすれ筆', {shape:'drybrush', style:'none', ar:'1.778'}, null],
  ['rip','破れ紙', {shape:'rip', style:'solid'}, {w:6, c:'#ffffff'}],
  ['bbox','筆の四角', {shape:'brushbox', style:'none'}, null],
  ['btri','筆の三角', {shape:'brushtri', style:'none'}, null],
  ['bcircle','筆の丸', {shape:'brushcircle', style:'none'}, null],
  ['book','本', {shape:'rect', r:0.01, style:'book', ar:'0.75'}, {w:6, c:'#fdfaf2'}],
  ['off','フレームなし', {shape:'none'}, null],
];
const FRAME_GROUPS = [
  ['かわいい・ポップ', ['icon', 'photo', 'heart', 'bubble', 'tape', 'star', 'cloud', 'sticker', 'patch', 'drop', 'pill', 'wave']],
  ['カッコいい', ['cyber', 'glitch', 'metal', 'gold', 'vs', 'twin', 'crystal', 'arrow', 'aura']],
  ['ゲーム・配信', ['wipe', 'finder', 'game', 'boom', 'neon', 'gaming', '8bit', 'tv']],
  ['ブラシ・手作り感', ['swipe', 'dry', 'rip', 'bbox', 'btri', 'bcircle', 'book', 'sumi']],
  ['レトロ・アート', ['comic', 'film', 'ticket']],
];
function framePath(x, shape, w, h, r = 0.12, seed = 1){
  const a = w / 2, b = h / 2, mn = Math.min(w, h);
  const R = rng((seed || 1) * 97 + shape.length * 13);
  // なめらかなゆらぎ（knots個の乱数を補間）＋トゲ
  const noise = (n, knots, spike) => { const k = [...Array(knots + 1)].map(() => R()); return [...Array(n)].map((_, i) => { const t = i / n * knots, j = Math.floor(t), f = (1 - Math.cos((t - j) * PI)) / 2;
    const sm = k[j] * (1 - f) + k[j + 1] * f; return Math.min(1, sm * (1 - spike) + (spike ? R() ** 2.2 * spike * 1.7 : 0)); }); };
  const rough = (sides) => { const p = [], [T, Rt, B, L] = sides.map(([n, amp, knots, spike]) => noise(n, knots, spike).map(v => v * amp));
    T.forEach((v, i) => p.push([-a + w * i / T.length, -b + v])); Rt.forEach((v, i) => p.push([a - v, -b + h * i / Rt.length]));
    B.forEach((v, i) => p.push([a - w * i / B.length, b - v])); L.forEach((v, i) => p.push([-a + v, b - h * i / L.length])); return p; };
  const poly = pts => { pts.forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py)); x.closePath(); };
  const ring = (n, rot, inner) => { const p = []; for(let i = 0; i < n * (inner ? 2 : 1); i++){ const t = rot + i * PI / (inner ? n : n / 2), k = inner && i % 2 ? inner : 1; p.push([Math.cos(t) * a * k, Math.sin(t) * b * k]); } poly(p); };
  const scallop = (n, base, depth) => { for(let i = 0; i < n; i++){ const t0 = -PI / 2 + i * 2 * PI / n, t1 = t0 + 2 * PI / n, tm = (t0 + t1) / 2;
    const p0 = [Math.cos(t0) * a * base, Math.sin(t0) * b * base], p1 = [Math.cos(t1) * a * base, Math.sin(t1) * b * base];
    if(!i) x.moveTo(...p0); x.bezierCurveTo(Math.cos(tm - 0.5 * PI / n) * a * depth, Math.sin(tm - 0.5 * PI / n) * b * depth, Math.cos(tm + 0.5 * PI / n) * a * depth, Math.sin(tm + 0.5 * PI / n) * b * depth, ...p1); } x.closePath(); };
  switch(shape){
    case 'circle': x.ellipse(0, 0, a, b, 0, 0, 2 * PI); break;
    case 'arch': { const ry = Math.min(a, b); x.moveTo(-a, b); x.lineTo(-a, -b + ry); x.ellipse(0, -b + ry, a, ry, 0, PI, 2 * PI); x.lineTo(a, b); x.closePath(); break; }
    case 'hex': ring(6, 0); break;
    case 'oct': ring(8, PI / 8); break;
    case 'diamond': poly([[0, -b], [a, 0], [0, b], [-a, 0]]); break;
    case 'tri': poly([[0, -b], [a, b], [-a, b]]); break;
    case 'slant': { const k = w * 0.14; poly([[-a + k, -b], [a, -b], [a - k, b], [-a, b]]); break; }
    case 'shield': x.moveTo(-a, -b); x.lineTo(a, -b); x.lineTo(a, -b * 0.1); x.quadraticCurveTo(a * 0.9, b * 0.7, 0, b); x.quadraticCurveTo(-a * 0.9, b * 0.7, -a, -b * 0.1); x.closePath(); break;
    case 'star': ring(5, -PI / 2, 0.48); break;
    case 'kira': ring(4, -PI / 2, 0.3); break;
    case 'heart': x.moveTo(0, b); x.bezierCurveTo(-a * 0.2, b * 0.62, -a, b * 0.2, -a, -b * 0.36); x.bezierCurveTo(-a, -b * 0.9, -a * 0.28, -b * 1.08, 0, -b * 0.56);
      x.bezierCurveTo(a * 0.28, -b * 1.08, a, -b * 0.9, a, -b * 0.36); x.bezierCurveTo(a, b * 0.2, a * 0.2, b * 0.62, 0, b); x.closePath(); break;
    case 'burst': { const R = rng((seed || 1) * 5), p = []; for(let i = 0; i < 36; i++){ const t = -PI / 2 + i * PI / 18, k = i % 2 ? 0.74 + R() * 0.08 : 0.96 + R() * 0.04; p.push([Math.cos(t) * a * k, Math.sin(t) * b * k]); } poly(p); break; }
    case 'cloud': scallop(11, 0.84, 1.13); break;
    case 'flower': scallop(8, 0.6, 1.25); break;
    case 'bubble': { const bh = h * 0.8, rr = Math.min(w, bh) * Math.min(0.5, r); x.roundRect(-a, -b, w, bh, rr); x.moveTo(-a + w * 0.2, -b + bh - 1); x.lineTo(-a + w * 0.14, b); x.lineTo(-a + w * 0.4, -b + bh - 1); x.closePath(); break; }
    case 'torn': { const R = rng((seed || 1) * 11), p = [], n = 26, j = Math.min(w, h) * 0.025;
      for(let i = 0; i < n; i++) p.push([-a + w * i / n, -b + R() * j]); for(let i = 0; i < n; i++) p.push([a - R() * j, -b + h * i / n]);
      for(let i = 0; i < n; i++) p.push([a - w * i / n, b - R() * j]); for(let i = 0; i < n; i++) p.push([-a + R() * j, b - h * i / n]); poly(p); break; }
    case 'cut': { const k = Math.min(w, h) * 0.16; poly([[-a + k, -b], [a, -b], [a, b - k], [a - k, b], [-a, b], [-a, -b + k]]); break; }
    case 'notch': { const k = Math.min(w, h) * 0.12; poly([[-a + k, -b], [a - k, -b], [a, -b + k], [a, b - k], [a - k, b], [-a + k, b], [-a, b - k], [-a, -b + k]]); break; }
    case 'blade': { const k = w * 0.28; poly([[-a + k, -b], [a, -b], [a - k, b], [-a, b]]); break; }
    case 'trap': poly([[-a + w * 0.12, -b], [a - w * 0.12, -b], [a, b], [-a, b]]); break;
    case 'shard': poly([[-a * 0.7, -b], [a * 0.35, -b * 0.92], [a, -b * 0.3], [a * 0.82, b * 0.55], [a * 0.2, b], [-a * 0.6, b * 0.82], [-a, b * 0.1], [-a * 0.92, -b * 0.55]]); break;
    case 'chevron': poly([[-a, -b], [a * 0.55, -b], [a, 0], [a * 0.55, b], [-a, b], [-a * 0.55, 0]]); break;
    case 'pill': x.roundRect(-a, -b, w, h, Math.min(w, h) / 2); break;
    case 'swipe': poly(rough([[70, h * 0.07, 5, 0.25], [50, w * 0.2, 3, 0.85], [70, h * 0.07, 5, 0.25], [50, w * 0.2, 3, 0.85]])); break;
    case 'brushbox': poly(rough([[70, mn * 0.07, 7, 0.6], [60, mn * 0.07, 7, 0.6], [70, mn * 0.07, 7, 0.6], [60, mn * 0.07, 7, 0.6]])); break;
    case 'rip': poly(rough([[110, h * 0.09, 14, 0.55], [30, w * 0.012, 4, 0], [110, h * 0.09, 14, 0.55], [30, w * 0.012, 4, 0]])); break;
    case 'drybrush': { const nb = 6 + Math.floor(R() * 3), bh = h / nb;
      for(let i = 0; i < nb; i++){ const cy = -b + (i + 0.5) * bh, hh = Math.min(bh * (0.38 + R() * 0.34), b - Math.abs(cy)), x0 = -a + w * R() * 0.16, x1 = a - w * R() * 0.18, bw = x1 - x0;
        const top = noise(30, 4, 0.2), bot = noise(30, 4, 0.2), lft = noise(14, 2, 0.9), rgt = noise(14, 2, 0.9), p = [];
        top.forEach((v, j) => p.push([x0 + bw * j / 30, cy - hh + v * hh * 0.35])); rgt.forEach((v, j) => p.push([x1 - v * w * 0.1, cy - hh + 2 * hh * j / 14]));
        bot.forEach((v, j) => p.push([x1 - bw * j / 30, cy + hh - v * hh * 0.35])); lft.forEach((v, j) => p.push([x0 + v * w * 0.1, cy + hh - 2 * hh * j / 14])); poly(p); }
      break; }
    case 'brushtri': { const V = [[0, -b], [a, b], [-a, b]], C = [0, b / 3], p = [];
      for(let e = 0; e < 3; e++){ const [p0, p1] = [V[e], V[(e + 1) % 3]], nz = noise(50, 6, 0.6);
        nz.forEach((v, i) => { const t = i / 50, px = p0[0] + (p1[0] - p0[0]) * t, py = p0[1] + (p1[1] - p0[1]) * t, dx = C[0] - px, dy = C[1] - py, d = Math.hypot(dx, dy) || 1, k = v * mn * 0.06; p.push([px + dx / d * k, py + dy / d * k]); }); }
      poly(p); break; }
    case 'brushcircle': { const nz = noise(140, 16, 0.5), p = nz.map((v, i) => { const t = i / 140 * 2 * PI, k = 1 - v * 0.13; return [Math.cos(t) * a * k, Math.sin(t) * b * k]; }); poly(p); break; }
    case 'squircle': { const p = []; for(let i = 0; i < 72; i++){ const t = i / 72 * 2 * PI, c = Math.cos(t), sn = Math.sin(t); p.push([a * Math.sign(c) * Math.abs(c) ** 0.5, b * Math.sign(sn) * Math.abs(sn) ** 0.5]); } poly(p); break; }
    case 'penta': ring(5, -PI / 2); break;
    case 'hexv': ring(6, -PI / 2); break;
    case 'cross': { const t = 0.36; poly([[-a * t, -b], [a * t, -b], [a * t, -b * t], [a, -b * t], [a, b * t], [a * t, b * t], [a * t, b], [-a * t, b], [-a * t, b * t], [-a, b * t], [-a, -b * t], [-a * t, -b * t]]); break; }
    case 'drop': x.moveTo(0, -b); x.bezierCurveTo(a * 0.35, -b * 0.55, a, -b * 0.05, a, b * 0.3); x.bezierCurveTo(a, b * 0.75, a * 0.55, b, 0, b);
      x.bezierCurveTo(-a * 0.55, b, -a, b * 0.75, -a, b * 0.3); x.bezierCurveTo(-a, -b * 0.05, -a * 0.35, -b * 0.55, 0, -b); x.closePath(); break;
    case 'ticket': { const nr = Math.min(w, h) * 0.1; x.moveTo(-a, -b); x.lineTo(a, -b); x.lineTo(a, -nr); x.arc(a, 0, nr, -PI / 2, PI / 2, true); x.lineTo(a, b); x.lineTo(-a, b); x.lineTo(-a, nr); x.arc(-a, 0, nr, PI / 2, -PI / 2, true); x.closePath(); break; }
    case 'wave': { const j = Math.min(w, h) * 0.03, per = Math.min(w, h) / 7, p = [], n = 48, wv = t => j * (1 + Math.sin(t / per * 2 * PI)) / 2;
      for(let i = 0; i < n; i++){ const t = w * i / n; p.push([-a + t, -b + wv(t)]); } for(let i = 0; i < n; i++){ const t = h * i / n; p.push([a - wv(t), -b + t]); }
      for(let i = 0; i < n; i++){ const t = w * i / n; p.push([a - t, b - wv(t)]); } for(let i = 0; i < n; i++){ const t = h * i / n; p.push([-a + wv(t), b - t]); } poly(p); break; }
    case 'splash': { const R = rng((seed || 1) * 21), n = 30, pts = [];
      for(let i = 0; i < n; i++){ const t = i / n * 2 * PI, k = i % 5 === 2 ? 0.97 + R() * 0.03 : 0.74 + R() * 0.12; pts.push([Math.cos(t) * a * k, Math.sin(t) * b * k]); }
      const m = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; x.moveTo(...m(pts[n - 1], pts[0]));
      for(let i = 0; i < n; i++) x.quadraticCurveTo(...pts[i], ...m(pts[i], pts[(i + 1) % n])); x.closePath(); break; }
    default: x.roundRect(-a, -b, w, h, Math.min(w, h) * Math.min(0.5, Math.max(0, r)));
  }
}
function mixc(h1, h2, t){ const A = hex2rgb(h1), B = hex2rgb(h2); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }
/* フレームの形の位置（画像のピクセル座標）：fs=大きさ、cx/cy=画像のどこを中心に切り抜くか */
function frameGeom(L){
  const A = layerSrc(L); if(!A) return null;
  const fr = L.frame, iw = A.img.naturalWidth, ih = A.img.naturalHeight;
  const ar = fr.ar && fr.ar !== 'auto' ? parseFloat(fr.ar) || 1 : (FRAME_AUTO.has(fr.shape) ? iw / ih : 1);
  const fw0 = Math.min(iw, ih * ar), fs = clamp(fr.fs ?? 1, 0.05, 1), fw = fw0 * fs, fh = fw / ar;
  const cxp = clamp((fr.cx ?? 0.5) * iw, fw / 2, iw - fw / 2), cyp = clamp((fr.cy ?? 0.5) * ih, fh / 2, ih - fh / 2);
  return {A, iw, ih, ar, fw0, fw, fh, cxp, cyp};
}
/* フレームを動かしても、画像がキャンバス上で動かないようにレイヤーの位置を補正 */
function frameCompensate(L, g0, base){
  const g1 = frameGeom(L); if(!g0 || !g1) return;
  const dx = (g1.cxp - g0.cxp) * (L.flip ? -1 : 1) * L.sc, dy = (g1.cyp - g0.cyp) * (L.flipV ? -1 : 1) * L.sc, a = (L.rot || 0) * PI / 180;
  const bx = base ? base.x : L.x, by = base ? base.y : L.y;
  L.x = bx + dx * Math.cos(a) - dy * Math.sin(a); L.y = by + dx * Math.sin(a) + dy * Math.cos(a);
}
function framedCanvas(L, f, live, cache){
  const A = layerSrc(L), fr = L.frame, o = L.outline, need = L.sc * f;
  const sk = JSON.stringify([L.asset, cropOf(L), fr, o.w, o.c, L.flip, L.flipV, L.bright, L.sat, cutSig(L)]);
  let e = cache.get(L.id);
  if(e && e.sk === sk && (live || Math.abs(e.k - need) / need < 0.02)) return e;
  const G = frameGeom(L), iw = G.iw, ih = G.ih;
  const FW = Math.max(2, G.fw * need), FH = Math.max(2, G.fh * need);
  const st = fr.style || 'solid', E = st === 'none' ? 0 : Math.max(0.05, o.w * f);
  const tw = Math.min(FW, FH) * 0.36;
  const pad = Math.ceil(E * ({photo:4.6, neon:3.4, book:2.8, neon2:5.5, pop:2, hud:3.4, bracket:2.6, glitch:2.4, metal:1.6, block:4, rgb:3.2, halftone:5.4, brush:2.8, film:4, stitch:1.4, sticker:2, crt:1.8, pixel:1.8, aura:8, triple:2.4}[st] || 1.4) + (st === 'tape' ? tw * 0.5 : 0)) + 4;
  const c = mk(FW + pad * 2, FH + pad * 2), x = c.getContext('2d');
  x.translate(c.width / 2, c.height / 2); x.lineJoin = 'round'; x.lineCap = 'round';
  const P = () => { x.beginPath(); framePath(x, fr.shape, FW, FH, fr.r, fr.seed); };
  const stroke = (lw, col) => { P(); x.lineWidth = lw; x.strokeStyle = col; x.stroke(); };
  if(E > 0){
    if(st === 'double'){ stroke(2 * E, o.c); x.globalCompositeOperation = 'destination-out'; stroke(2 * E * 0.62, '#000'); x.globalCompositeOperation = 'source-over'; stroke(2 * E * 0.28, o.c); }
    else if(st === 'pop'){ stroke(2 * E + 2 * Math.max(3 * f, E * 0.6), fr.c2); stroke(2 * E, o.c); }
    else if(st === 'grad'){ const g = x.createLinearGradient(-FW / 2, -FH / 2, FW / 2, FH / 2); g.addColorStop(0, o.c); g.addColorStop(1, fr.c2); stroke(2 * E, g); }
    else if(st === 'neon'){ x.shadowColor = o.c; x.shadowBlur = E * 2.6; stroke(E * 1.2, o.c); stroke(E * 1.2, o.c); x.shadowBlur = 0; stroke(E * 0.4, '#ffffff'); }
    else if(st === 'dash'){ x.setLineDash([E * 0.01, E * 3]); stroke(2 * E, o.c); x.setLineDash([]); }
    else if(st === 'neon2'){ x.shadowColor = fr.c2; x.shadowBlur = E * 4; stroke(E * 2.6, fr.c2); stroke(E * 2.6, fr.c2); x.shadowColor = o.c; x.shadowBlur = E * 2; stroke(E * 1.3, o.c); x.shadowBlur = 0; stroke(E * 0.45, '#ffffff'); }
    else if(st === 'hud'){ x.shadowColor = o.c; x.shadowBlur = E * 1.2; stroke(E * 0.55, o.c); x.shadowBlur = 0; }
    else if(st === 'glitch'){ x.save(); x.translate(-E * 0.8, -E * 0.2); stroke(2 * E, '#ff2d55'); x.restore(); x.save(); x.translate(E * 0.8, E * 0.2); stroke(2 * E, '#00e5ff'); x.restore(); stroke(1.3 * E, o.c); }
    else if(st === 'metal'){ stroke(2 * E + 3 * f, 'rgba(0,0,0,.55)'); const g = x.createLinearGradient(0, -FH / 2 - E, 0, FH / 2 + E);
      [[0, mixc(o.c, '#ffffff', 0.75)], [0.22, o.c], [0.48, mixc(o.c, '#000000', 0.5)], [0.52, mixc(o.c, '#ffffff', 0.45)], [0.78, o.c], [1, mixc(o.c, '#000000', 0.55)]].forEach(([t, cc]) => g.addColorStop(t, cc));
      stroke(2 * E, g); stroke(Math.max(1, f * 1.2), 'rgba(255,255,255,.55)'); }
    else if(st === 'block'){ x.save(); x.translate(E * 2.4, E * 2.4); P(); x.fillStyle = fr.c2; x.fill(); x.lineWidth = 2 * E; x.strokeStyle = fr.c2; x.stroke(); x.restore(); stroke(2 * E, o.c); }
    else if(st === 'bracket'){ }
    else if(st === 'book'){ for(let i = 3; i >= 1; i--){ x.fillStyle = mixc(o.c, '#c9c2b4', i * 0.12); x.strokeStyle = 'rgba(0,0,0,.2)'; x.lineWidth = Math.max(1, f); x.beginPath(); x.rect(-FW / 2 + i * E * 0.7, -FH / 2 + i * E * 0.55, FW, FH); x.fill(); x.stroke(); } }
    else if(st === 'rgb'){ const g = x.createConicGradient(0, 0, 0); for(let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${i * 60},100%,58%)`);
      x.save(); x.filter = `blur(${Math.max(1, E * 1.2)}px)`; x.globalAlpha = 0.85; stroke(2 * E * 1.7, g); x.restore(); stroke(2 * E, g); stroke(Math.max(1, E * 0.35), 'rgba(255,255,255,.8)'); }
    else if(st === 'aura'){ x.save(); x.shadowColor = o.c; x.shadowBlur = E * 5; x.fillStyle = o.c; P(); x.fill(); x.fill(); x.shadowBlur = E * 2; x.fill(); x.restore(); }
    else if(st === 'triple'){ stroke(2 * E * 2.2, o.c); stroke(2 * E * 1.5, fr.c2); stroke(2 * E * 0.8, o.c); }
    else if(st === 'sticker'){ stroke(2 * E * 1.5 + 3 * f, 'rgba(0,0,0,.2)'); stroke(2 * E * 1.5, o.c); }
    else if(st === 'stitch'){ stroke(2 * E * 1.2, fr.c2); }
    else if(st === 'halftone'){
      const p2 = new Path2D(); framePath(p2, fr.shape, FW, FH, fr.r, fr.seed); const cw = c.width, ch = c.height, ox = cw / 2, oy = ch / 2;
      const step = Math.max(E * 1.15, Math.max(cw, ch) / 150, 3), bands = [2 * E * 2.1, 2 * E * 3.1, 2 * E * 4.2], rs = [0.5, 0.36, 0.22];
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = fr.c2;
      for(let py = step / 2; py < ch; py += step) for(let px = step / 2 + ((py / step | 0) % 2) * step / 2; px < cw; px += step){
        const qx = px - ox, qy = py - oy; if(Math.abs(qx) > FW / 2 + bands[2] || Math.abs(qy) > FH / 2 + bands[2]) continue;
        if(x.isPointInPath(p2, qx, qy)) continue;
        for(let bi = 0; bi < 3; bi++){ x.lineWidth = bands[bi]; if(x.isPointInStroke(p2, qx, qy)){ x.beginPath(); x.arc(px, py, step * rs[bi], 0, 7); x.fill(); break; } }
      }
      x.restore(); stroke(2 * E, o.c);
    }
    else if(st === 'brush'){ const R = rng(9);
      for(let i = 0; i < 9; i++){ x.save(); x.translate((R() - 0.5) * E * 2.2, (R() - 0.5) * E * 2.2); x.globalAlpha = 0.3 + R() * 0.5; x.setLineDash([E * (4 + R() * 10), E * (0.3 + R() * 1.6)]); x.lineDashOffset = R() * E * 20; stroke(2 * E * (0.4 + R() * 1.1), o.c); x.restore(); }
      x.setLineDash([E * 7, E * 0.7, E * 2.5, E * 0.5]); stroke(2 * E * 0.9, o.c); x.setLineDash([]); }
    else if(st === 'film'){ x.fillStyle = o.c; x.beginPath(); x.roundRect(-FW / 2 - E * 0.7, -FH / 2 - E * 3.4, FW + E * 1.4, FH + E * 6.8, E * 0.4); x.fill();
      x.globalCompositeOperation = 'destination-out'; const hw = E * 1.3, hh = E * 1.1, gap = E * 2.6;
      for(let hx = -FW / 2 + gap / 2; hx < FW / 2 - hw / 2; hx += gap) for(const hy of [-FH / 2 - E * 1.7, FH / 2 + E * 1.7]){ x.beginPath(); x.roundRect(hx - hw / 2, hy - hh / 2, hw, hh, E * 0.25); x.fill(); }
      x.globalCompositeOperation = 'source-over'; }
    else if(st === 'crt'){ stroke(2 * E * 1.6, o.c); stroke(Math.max(1, E * 0.3), 'rgba(255,255,255,.25)'); }
    else if(st === 'pixel'){ const pz = Math.max(2, Math.round(E * 0.6)), tmp = mk(c.width / pz, c.height / pz), t = tmp.getContext('2d');
      t.translate(tmp.width / 2, tmp.height / 2); t.scale(1 / pz, 1 / pz); t.lineJoin = 'miter';
      const TP = () => { t.beginPath(); framePath(t, fr.shape, FW, FH, fr.r, fr.seed); };
      t.save(); t.translate(pz * 1.5, pz * 1.5); TP(); t.lineWidth = 2 * E; t.strokeStyle = fr.c2; t.stroke(); t.restore(); TP(); t.lineWidth = 2 * E; t.strokeStyle = o.c; t.stroke();
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.imageSmoothingEnabled = false; x.drawImage(tmp, 0, 0, tmp.width * pz, tmp.height * pz); x.restore(); }
    else if(st === 'photo'){ x.fillStyle = o.c; x.beginPath(); x.roundRect(-FW / 2 - E, -FH / 2 - E, FW + 2 * E, FH + E * 4.4, E * 0.18); x.fill(); }
    else stroke(2 * E, o.c);
  }
  x.save(); P(); x.clip();
  if(L.flip || L.flipV) x.scale(L.flip ? -1 : 1, L.flipV ? -1 : 1);
  x.filter = imgFilter(L); x.drawImage(A.img, -G.cxp * need, -G.cyp * need, iw * need, ih * need); x.filter = 'none';
  x.restore();
  if(st === 'sticker' && E > 0){ x.save(); P(); x.clip(); const g = x.createLinearGradient(-FW / 2, -FH / 2, FW * 0.1, FH * 0.1); g.addColorStop(0, 'rgba(255,255,255,.38)'); g.addColorStop(0.55, 'rgba(255,255,255,.08)'); g.addColorStop(0.56, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(-FW / 2, -FH / 2, FW, FH); x.restore(); }
  if(st === 'stitch' && E > 0){ x.save(); const sx = Math.max(0.1, (FW - E * 3.2) / FW), sy = Math.max(0.1, (FH - E * 3.2) / FH); x.scale(sx, sy); P(); x.lineWidth = E * 0.55 / Math.min(sx, sy); x.setLineDash([E * 1.5 / sx, E * 1.1 / sx]); x.strokeStyle = o.c; x.stroke(); x.restore(); }
  if(st === 'crt' && E > 0){ x.save(); P(); x.clip(); const sl = Math.max(2, FH / 150); x.fillStyle = 'rgba(0,0,0,.2)'; for(let yy = -FH / 2; yy < FH / 2; yy += sl * 2) x.fillRect(-FW / 2, yy, FW, sl);
    const g = x.createRadialGradient(0, 0, Math.min(FW, FH) * 0.3, 0, 0, Math.hypot(FW, FH) / 2); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.5)'); x.fillStyle = g; x.fillRect(-FW / 2, -FH / 2, FW, FH);
    x.fillStyle = 'rgba(255,255,255,.1)'; x.beginPath(); x.ellipse(-FW * 0.18, -FH * 0.26, FW * 0.36, FH * 0.16, -0.25, 0, 7); x.fill(); x.restore(); }
  if(st === 'book' && E > 0){ x.save(); P(); x.clip(); const g = x.createLinearGradient(-FW / 2, 0, -FW / 2 + FW * 0.09, 0); g.addColorStop(0, 'rgba(0,0,0,.5)'); g.addColorStop(0.35, 'rgba(0,0,0,.18)'); g.addColorStop(0.42, 'rgba(255,255,255,.3)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(-FW / 2, -FH / 2, FW * 0.09, FH); x.restore(); }
  if(st === 'glitch' && E > 0){
    const R = rng(3), tmp = mk(c.width, c.height); tmp.getContext('2d').drawImage(c, 0, 0);
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0);
    for(let i = 0; i < 4; i++){ const hy = R() * c.height, hh = Math.max(2, c.height * (0.02 + R() * 0.05)), sh = (R() - 0.5) * E * 4;
      x.clearRect(0, hy, c.width, hh); x.drawImage(tmp, 0, hy, c.width, hh, sh, hy, c.width, hh); }
    x.restore();
  }
  if((st === 'hud' || st === 'bracket') && E > 0){
    const off = st === 'hud' ? E * 1.8 : E * 0.9, lb = Math.min(FW, FH) * (st === 'hud' ? 0.13 : 0.2), X = FW / 2 + off, Y = FH / 2 + off;
    x.strokeStyle = o.c; x.lineWidth = st === 'hud' ? E * 0.9 : E; x.lineCap = 'square'; x.shadowColor = o.c; x.shadowBlur = st === 'hud' ? E : 0;
    x.beginPath(); [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => { x.moveTo(sx * X, sy * (Y - lb)); x.lineTo(sx * X, sy * Y); x.lineTo(sx * (X - lb), sy * Y); }); x.stroke();
    if(st === 'hud'){ x.lineWidth = E * 0.45; x.beginPath(); for(const sy of [-1, 1]) for(let i = -2; i <= 2; i++){ x.moveTo(i * FW * 0.06, sy * Y); x.lineTo(i * FW * 0.06, sy * (Y - E * (i ? 0.8 : 1.6))); } x.stroke();
      x.fillStyle = o.c; for(const [sx, sy] of [[-1, -1], [1, 1]]){ x.beginPath(); x.arc(sx * (X + E * 1.1), sy * (Y + E * 1.1), E * 0.35, 0, 7); x.fill(); } }
    x.shadowBlur = 0;
  }
  if(st === 'photo' && E > 0){ x.strokeStyle = 'rgba(0,0,0,.12)'; x.lineWidth = Math.max(1, f); x.strokeRect(-FW / 2, -FH / 2, FW, FH); }
  if(st === 'tape' && E >= 0){
    const [r, g, b] = hex2rgb(fr.c2);
    [[-1, -38], [1, 38]].forEach(([sx, deg]) => {
      x.save(); x.translate(sx * (FW / 2 - tw * 0.12), -FH / 2 + tw * 0.06); x.rotate(deg * PI / 180);
      x.fillStyle = `rgba(${r},${g},${b},0.82)`; x.fillRect(-tw / 2, -tw * 0.16, tw, tw * 0.32);
      x.fillStyle = 'rgba(255,255,255,.22)'; for(let i = -tw / 2 + tw * 0.08; i < tw / 2; i += tw * 0.16) x.fillRect(i, -tw * 0.16, tw * 0.05, tw * 0.32);
      x.restore();
    });
  }
  e = {sk, k:need, c}; cache.set(L.id, e);
  return e;
}
