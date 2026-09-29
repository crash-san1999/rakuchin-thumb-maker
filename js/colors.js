/* 楽ちんサムネメーカー：配色（パレット・色調整・背景画像からの配色） */
function hexToHsl(hex){
  let [r, g, b] = hex2rgb(hex).map(v => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if(mx !== mn){
    const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
  }
  return [h, s * 100, l * 100];
}
function hsl(h, s, l){
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
}
const mixHex = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
function lum(hex){ const c = hex2rgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

/* パレット = [塗り, 塗り2, 強調, 強調2, 濃い色(フチ), 明るい色(2本目フチ), 深い色(立体), 光, 背景図形] */
const THUMB_PALETTES = [
  ['注目度MAX', 'どんな背景でも目立つ黄×黒', ['#ffe600','#ffc400','#ffffff','#fff3a0','#111111','#ffffff','#2a2a2a','#ffe600','#111111']],
  ['警告・緊急', '事件・注意喚起・ヤバい', ['#ffffff','#ffe0e0','#ff1f3d','#ff6a00','#111111','#ff1f3d','#5a0010','#ff1f3d','#ff1f3d']],
  ['勝利・達成', 'ランク到達・優勝・記録', ['#fff6c2','#ffc400','#ff2d2d','#ff8a00','#3a1a00','#ffffff','#5a2a00','#ffb000','#c1121f']],
  ['驚き・衝撃', 'まさかの展開・神回', ['#fff200','#ffb000','#ff2d2d','#ffffff','#1a0000','#ff2d2d','#7a0000','#ff6a00','#ff2d2d']],
  ['解説・攻略', '信頼感・わかりやすさ', ['#ffffff','#dff1ff','#ffe066','#ffb700','#0a2a5c','#1e88ff','#06183a','#4fc3ff','#1e7bd6']],
  ['雑談・ゆるい', 'やわらかい雰囲気・日常', ['#ffffff','#ffe3f1','#ff7ab6','#7ad7ff','#5b3a6e','#ffc2dc','#8e5a9e','#ffb3d9','#fff0f6']],
  ['夜配信・ネオン', '深夜・まったり・ゲーム', ['#ffffff','#c9f7ff','#ff2bd6','#00e5ff','#12002b','#00e5ff','#2b0050','#b000ff','#1a0033']],
  ['感動・エモ', '泣ける・卒業・記念日', ['#ffffff','#cfefff','#ffd1e8','#ffe7a3','#1e3a5f','#a8dcff','#2b4c7e','#bfe6ff','#e6f5ff']],
  ['ホラー・恐怖', 'ホラゲ実況・心霊', ['#f0f0f0','#ff3b3b','#ff1a1a','#7a0000','#000000','#3a0000','#120000','#ff0000','#1a0000']],
  ['お祭り・企画', '大会・コラボ・記念配信', ['#ffffff','#fff3a0','#ff3b8d','#3bd6ff','#2b0a4d','#ffd400','#4a0a7a','#ff3b8d','#ffd400']],
  ['初見歓迎', '初心者向け・爽やか', ['#ffffff','#c9ffe9','#00c897','#ffd166','#004d40','#ffffff','#00695c','#55efc4','#00c897']],
  ['高級・限定', 'プレミア・特別回', ['#fff6c2','#d4a017','#ffffff','#ffe9a0','#0b0b0b','#d4a017','#1a1200','#ffd24d','#0b0b0b']],
];
const THEME_PALETTES = [
  ['格ゲー熱血', '', ['#ffffff','#ffe14d','#ff3b3b','#ffb000','#141414','#ff2d55','#6a0018','#ff6a00','#ffe600']],
  ['クールブルー', '', ['#ffffff','#6fcbff','#ffe066','#ffb700','#0a2a5c','#ffffff','#06183a','#4fc3ff','#1e7bd6']],
  ['夕焼け', '', ['#fff3d6','#ff8a3d','#ff3d7f','#ffd23f','#2b0f2e','#ffffff','#5a1a3a','#ff7a3d','#ff5e62']],
  ['桜', '', ['#ffffff','#ffc2dc','#ff5c9a','#ffd6e8','#7a1f4a','#ffffff','#a8325e','#ff8fc2','#ffe3ef']],
  ['サイバー', '', ['#00f0ff','#a855f7','#ffffff','#fff94d','#0a0a1a','#00f0ff','#1a0033','#00f0ff','#0a0a1a']],
  ['ミント', '', ['#ffffff','#b5ffe1','#00b894','#fdcb6e','#004d40','#ffffff','#00695c','#55efc4','#00b894']],
  ['和・紅白', '', ['#ffffff','#f5efe0','#c1121f','#e85d04','#111111','#c1121f','#3a0a0a','#ff4d4d','#c1121f']],
  ['レトロ', '', ['#fff4d6','#ffd23f','#ef476f','#06d6a0','#2b2d42','#ef476f','#1f3b73','#ffd23f','#118ab2']],
  ['キャンディ', '', ['#ffffff','#ffd1f7','#ff6ec7','#7afcff','#5b2a86','#ffffff','#8e44ad','#ff9ff3','#feff9c']],
  ['フォレスト', '', ['#f1ffe0','#8bd450','#ffd166','#ff9f1c','#1b3b1b','#ffffff','#2d5a27','#a6ff4d','#3a7d44']],
  ['オーシャン', '', ['#e6fbff','#48cae4','#ffb703','#fb8500','#023e8a','#ffffff','#03045e','#00b4d8','#0077b6']],
  ['ロイヤル紫', '', ['#ffffff','#d4b3ff','#ffd24d','#ffae00','#2b0a4d','#ffffff','#3c096c','#b983ff','#7b2cbf']],
  ['モノクロ＋赤', '', ['#ffffff','#d9d9d9','#e8132b','#ff5a5a','#111111','#ffffff','#333333','#e8132b','#111111']],
  ['チョコミント', '', ['#c9ffef','#7ee8c8','#6b3e26','#a0673c','#3b2314','#ffffff','#2a170c','#7ee8c8','#6b3e26']],
  ['ビタミン', '', ['#fff36b','#ffb300','#ff5a1f','#3ddc97','#3a1a00','#ffffff','#6a2a00','#ffd400','#ff5a1f']],
  ['スモーキー', '', ['#f2ede4','#c9b8a6','#8fa3a6','#d9a5a0','#3b3a38','#ffffff','#55504a','#e6d5c3','#8fa3a6']],
];
const toP = a => ({base:a[0], base2:a[1], accent:a[2], accent2:a[3], dark:a[4], light:a[5], deep:a[6], glow:a[7], bg:a[8]});

function genPalette(mode){
  const R = Math.random, j = a => (R() * 2 - 1) * a;
  if(mode === 'auto'){ const ms = ['comp','analog','triad','mono','vivid','pastel','dark','mono_accent','comp','vivid']; mode = ms[Math.floor(R() * ms.length)]; }
  const h = R() * 360;
  const hA = {comp:h + 180, analog:h + 35, triad:h + 120, mono:h, vivid:h + 150 + j(40), pastel:h + 180 + j(40), dark:h + 160 + j(40), mono_accent:h}[mode];
  const s = 85 + j(10);
  if(mode === 'pastel') return {base:hsl(h,70,88), base2:hsl(h+20,75,74), accent:hsl(hA,85,68), accent2:hsl(hA+20,85,58), dark:hsl(h,55,28), light:'#ffffff', deep:hsl(h,50,40), glow:hsl(hA,90,75), bg:hsl(hA,80,85)};
  if(mode === 'dark') return {base:'#ffffff', base2:hsl(h,100,80), accent:hsl(hA,100,62), accent2:hsl(hA+25,100,55), dark:hsl(h,70,8), light:hsl(h,100,60), deep:hsl(h,70,18), glow:hsl(h,100,60), bg:hsl(h,60,12)};
  if(mode === 'mono_accent') return {base:'#ffffff', base2:'#d9d9d9', accent:hsl(h,95,52), accent2:hsl(h+15,95,45), dark:'#111111', light:hsl(h,95,52), deep:'#2a2a2a', glow:hsl(h,95,55), bg:'#111111'};
  const lb = 70 + R() * 25;
  const P = {base: R() < 0.35 ? '#ffffff' : hsl(h, s, lb), base2:hsl(h + (mode === 'mono' ? 0 : 20), s, Math.max(45, lb - 25)),
    accent:hsl(hA, s, 55 + j(5)), accent2:hsl(hA + 20, s, 47), dark:hsl(mode === 'mono' ? h : hA, 60, 8 + R() * 8),
    light: R() < 0.5 ? '#ffffff' : hsl(hA, s, 58), deep:hsl(h, 70, 20 + j(5)), glow:hsl(hA, 100, 60), bg:hsl(hA, s, 55)};
  if(mode === 'triad') P.light = hsl(h + 240, s, 60);
  return P;
}
function applyPalette(P){
  resetAdj();
  if(!$('#lockFill').checked){ S.fill1 = P.base; S.fill2 = P.base2; S.fill3 = mixHex(P.base, '#ffffff', 0.5); S.accent1 = P.accent; S.accent2 = P.accent2; }
  const seq = [P.dark, P.light, P.dark]; S.strokes.forEach((st, i) => st.c = seq[i]);
  Object.assign(S.extrude, {c:P.deep, c2:P.accent}); Object.assign(S.glow, {c:P.glow, c2:P.accent});
  S.shadow.c = mixHex(P.deep, '#000000', 0.6); S.offset.c = P.accent;
  Object.assign(S.plate, {c:P.bg, sc:P.dark}); Object.assign(S.box, {c:P.accent, c2:P.dark, sc:P.light});
  S.marker.c = P.glow; S.dots.c = P.accent; S.pattern.c = P.light; S.bulbs.c = mixHex(P.glow, '#ffffff', 0.4);
  S.trail.c = P.accent; S.drip.c = P.base;
  syncUI(); schedule();
}
function randomLike(hex){
  const [, s, l] = hexToHsl(hex);
  return hsl(Math.random() * 360, s < 12 ? 75 : Math.max(55, s), l < 4 || l > 97 ? 55 : l);
}
function colorPaths(o = S, pre = '', out = []){
  for(const k in o){
    const v = o[k], p = pre ? pre + '.' + k : k;
    if(typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) out.push(p);
    else if(v && typeof v === 'object') colorPaths(v, p, out);
  }
  return out;
}
/* 色相・彩度・明るさの一括調整（動かし始めた時点の色を基準にする） */
let adjBase = null;
function resetAdj(){
  if(!adjBase) return; adjBase = null;
  ['H','S','L'].forEach(k => { $('#adj' + k).value = 0; }); showAdj();
}
function showAdj(){ $('#oH').textContent = $('#adjH').value + '°'; $('#oS').textContent = $('#adjS').value; $('#oL').textContent = $('#adjL').value; ['H','S','L'].forEach(k => paintRange($('#adj' + k))); }
['H','S','L'].forEach(k => $('#adj' + k).addEventListener('input', () => {
  if(!adjBase) adjBase = colorPaths().map(p => [p, getK(p)]);
  const dh = +$('#adjH').value, ds = +$('#adjS').value, dl = +$('#adjL').value;
  adjBase.forEach(([p, c]) => { const [h, s, l] = hexToHsl(c); setK(p, hsl(h + dh, s + ds * (ds > 0 ? (100 - s) / 100 : s / 100), l + dl)); });
  showAdj(); syncUI(); clearTimeout(schT); schT = setTimeout(update, 40); saveDoc(); clearTimeout(histT); histT = setTimeout(pushHist, 450);
}));
$('#invertL').onclick = () => { resetAdj(); colorPaths().forEach(p => { const [h, s, l] = hexToHsl(getK(p)); setK(p, hsl(h, s, 100 - l)); }); syncUI(); schedule(); };
$('#shuffle').onclick = () => {
  // 読みやすさ（文字の塗り・強調色 ⇔ フチ）が足りない配色は引き直す
  let best = null, bestScore = -1;
  for(let i = 0; i < 24; i++){
    const P = genPalette($('#harm').value);
    const sc = Math.min(contrast(P.base, P.dark), contrast(P.base2, P.dark), contrast(P.accent, P.dark));
    if(sc > bestScore){ best = P; bestScore = sc; }
    if(sc >= 5) break;
  }
  applyPalette(best);
};

/* パレット一覧 */
let ttab = 'thumb';
function renderThemes(){
  const list = ttab === 'thumb' ? THUMB_PALETTES : THEME_PALETTES;
  $('#themes').innerHTML = list.map(([n, hint, a], i) =>
    `<button class="theme" data-ti="${i}" title="${hint || n}"><div class="bars">${[a[0], a[1], a[2], a[4], a[7]].map(c => `<i style="background:${c}"></i>`).join('')}</div><b>${n}</b>${hint ? `<small>${hint}</small>` : ''}</button>`).join('');
}
$('#themes').addEventListener('click', e => {
  const b = e.target.closest('[data-ti]'); if(!b) return;
  applyPalette(toP((ttab === 'thumb' ? THUMB_PALETTES : THEME_PALETTES)[+b.dataset.ti][2]));
});
$('#ttabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tt]'); if(!b) return;
  ttab = b.dataset.tt; document.querySelectorAll('#ttabs button').forEach(x => x.classList.toggle('on', x === b)); renderThemes();
});

/* 背景画像から配色：代表色をk-meansで抽出し、背景から浮く色を組み立てる */
let bgImg = null, wantBgPalette = false;
function extractColors(img, k = 6){
  const c = mk(72, 72), x = c.getContext('2d', {willReadFrequently:true}); x.drawImage(img, 0, 0, 72, 72);
  const d = x.getImageData(0, 0, 72, 72).data, px = [];
  for(let i = 0; i < d.length; i += 4) if(d[i + 3] > 200) px.push([d[i], d[i+1], d[i+2]]);
  if(!px.length) return [];
  const R = rng(9); let cent = [...Array(k)].map(() => px[Math.floor(R() * px.length)].slice());
  let asg = new Array(px.length).fill(0);
  for(let it = 0; it < 10; it++){
    px.forEach((p, i) => { let bi = 0, bd = 1e9; cent.forEach((c2, ci) => { const dd = (p[0]-c2[0])**2 + (p[1]-c2[1])**2 + (p[2]-c2[2])**2; if(dd < bd){ bd = dd; bi = ci; } }); asg[i] = bi; });
    const sum = cent.map(() => [0, 0, 0, 0]);
    px.forEach((p, i) => { const s2 = sum[asg[i]]; s2[0] += p[0]; s2[1] += p[1]; s2[2] += p[2]; s2[3]++; });
    cent = sum.map((s2, ci) => s2[3] ? [s2[0]/s2[3], s2[1]/s2[3], s2[2]/s2[3]] : cent[ci]);
  }
  const cnt = cent.map(() => 0); asg.forEach(a => cnt[a]++);
  return cent.map((c2, i) => ({hex:'#' + c2.map(v => Math.round(v).toString(16).padStart(2, '0')).join(''), n:cnt[i]})).filter(c2 => c2.n > 0).sort((a, b) => b.n - a.n);
}
function paletteFromBg(){
  const cl = extractColors(bgImg); if(!cl.length) return;
  const [dh, , dl] = hexToHsl(cl[0].hex);
  const vivid = cl.slice().sort((a, b) => hexToHsl(b.hex)[1] * Math.sqrt(b.n) - hexToHsl(a.hex)[1] * Math.sqrt(a.n))[0];
  let [ah, as] = hexToHsl(vivid.hex);
  const hueDist = Math.min(Math.abs(ah - dh), 360 - Math.abs(ah - dh));
  if(hueDist < 35 || as < 25) ah = dh + 180;           // 背景と同じ色味なら反対色にして浮かせる
  const P = {base:'#ffffff', base2:hsl(ah, 90, dl < 50 ? 82 : 72), accent:hsl(ah, Math.max(as, 85), 55), accent2:hsl(ah + 20, 90, 47),
    dark:hsl(dh, 55, 8), light:hsl(ah, 90, 55), deep:hsl(dh, 60, 15), glow:hsl(ah, 100, 60), bg:hsl(ah, 85, 55)};
  applyPalette(P);
  $('#bgsw').innerHTML = '画像の色：' + cl.map(c2 => `<i style="background:${c2.hex}" title="${c2.hex}"></i>`).join('') + ' → 反対側の色で文字を浮かせました';
}
$('#fromBg').onclick = () => {
  const th = DOC.mode === 'thumb', A = th && DOC.bg.type === 'image' && ASSETS[DOC.bg.asset];
  if(A){ bgImg = A.img; paletteFromBg(); return; }
  if(!th && bgImg && bgImg.complete){ paletteFromBg(); return; }
  wantBgPalette = true; toast('サムネに使う背景画像を選んでください'); (th ? $('#bgimgfile') : $('#bgfile')).click();
};

renderThemes();
