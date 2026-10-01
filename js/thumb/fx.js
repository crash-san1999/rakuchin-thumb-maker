/* 楽ちんサムネメーカー：動的エフェクト（集中線・光・キラキラ・爆発）とワンクリック背景エフェクト
   主な公開関数：mkFx（fx レイヤー生成）／addFx（レイヤー追加）／drawFx（描画）／applyBgFx（ワンクリック背景エフェクト）
   保存データ：type:'fx' のレイヤー。kind（FX_DEF のキー）と p（種類ごとのパラメータ）を持つ。
   依存：LAYER_BASE・DOC・dims・rng・rgba・clamp・PI・syncDoc・renderLayers・docChanged（共通側）。drawFx は group.js の drawOne から呼ばれる。
   乱数は p.seed の固定シードで毎回同じ並びになる（再描画・書き出しで形が変わらない）。描く順序を変えると乱数の消費順が変わり、保存済みの見た目が変わるので注意。 */
/* 動的エフェクト（レイヤーとして移動・拡大縮小・回転できる効果） */
// 種類ごとの既定パラメータ。mkFx で p に上書きされる。古い保存データに無い項目は既定値が補われる（p は Object.assign でマージ）
const FX_DEF = {
  lines:   () => ({c:'#ffffff', n:120, inner:0.55, w:1, len:1, seed:1, full:true, reach:1.8, fade:0.4}),
  light:   () => ({c:'#fff1a8', amt:0.9, r:0.45}),
  sparkle: () => ({c:'#ffffff', n:14, size:1, seed:3, glow:true}),
  burst:   () => ({c:'#ffe600', c2:'#1f1b2d', sw:10, spikes:16, depth:0.3, seed:2}),
  rays:    () => ({c:'#ffffff', n:18, r:1, fade:0.6, seed:1}),
  speed:   () => ({c:'#ffffff', n:40, len:1, w:1, seed:2}),
  gaan:    () => ({c:'#1a1a2e', n:70, len:0.55, w:1, seed:3}),
  confetti:() => ({c:'#ffd400', n:90, size:1, colorful:true, seed:4}),
  snow:    () => ({c:'#ffffff', type:'snow', n:140, size:1, seed:5}),
  bolt:    () => ({c:'#9fd8ff', w:1, branch:0.5, seed:6}),
  bokeh:   () => ({c:'#ffd27a', n:26, size:1, colorful:false, seed:7}),
  scatter: () => ({c:'#ff4f9a', shape:'heart', n:16, size:1, colorful:false, seed:8}),
};
const FX_NAMES = {lines:'集中線', light:'光（スポット）', sparkle:'キラキラ', burst:'爆発（ギザギザ）', rays:'放射光', speed:'スピード線', gaan:'効果線（ガーン）', confetti:'紙吹雪', snow:'雪・雨', bolt:'稲妻', bokeh:'ボケの光', scatter:'ハート・星'};
const FX_ICONS = {lines:'burst', light:'sun', sparkle:'sparkle', burst:'boom', rays:'rays', speed:'speed', gaan:'gaan', confetti:'confetti', snow:'snow', bolt:'bolt', bokeh:'bokeh', scatter:'heart'};
const FX_HINT = {lines:'放射状の線で視線を集める。中心の空きを動かして注目させたい所へ', light:'光が差しているように明るく（スクリーン合成）', sparkle:'星のきらめきを散らす', burst:'マンガ風の爆発。文字の後ろに敷いて「ドーン！」', rays:'中心から光の帯が広がる（優勝・登場シーンに）', speed:'横に流れる線で疾走感', gaan:'上から垂れる縦線で「ガーン…」', confetti:'お祝いの紙吹雪', snow:'雪や雨を降らせる', bolt:'稲妻（光る）', bokeh:'丸くぼけた光の粒', scatter:'ハートや星を散らす'};
// 種類ごとのレイヤー側の既定値（不透明度・合成・拡大率）。LAYER_BASE より優先して mkFx で重ねる
const FX_LAYER_DEF ={lines:{op:0.55}, light:{blend:'screen'}, burst:{sc:0.8}, rays:{op:0.4}, speed:{op:0.75}, gaan:{op:0.8}, bokeh:{blend:'screen'}, bolt:{sc:0.9}};
// 種類ごとの「描画の基準サイズ [幅, 高さ]」（sc=1 のときのドキュメント座標）。選択枠(dims)と、粒を散らす範囲の両方の基準になる
// 全面系は DOC のサイズ、局所系（キラキラ・爆発・稲妻など）は固定サイズ。集中線は中心の空き(inner)と届く範囲(reach)から決まる
const FX_BOX = L => { const p = L.p, W = DOC.w, H = DOC.h, M = Math.max(W, H); return {lines:p.full === false ? [W * p.inner * p.reach, H * p.inner * p.reach] : [W * p.inner, H * p.inner], light:[M * p.r * 1.1, M * p.r * 1.1], sparkle:[640, 400], burst:[780, 500], rays:[M * p.r * 1.2, M * p.r * 1.2], speed:[W, H], gaan:[W, H], confetti:[W, H], snow:[W, H], bolt:[420, 860], bokeh:[W, H], scatter:[1100, 640]}[L.kind] || [400, 400]; };
// 引数：kind＝種類、p＝パラメータの上書き、ex＝レイヤー側の上書き（位置など）。ライトだけは右上寄りの初期位置にする
const mkFx = (kind, p = {}, ex = {}) => Object.assign(LAYER_BASE(), {id:uid(), type:'fx', kind}, FX_LAYER_DEF[kind] || {}, kind === 'light' ? {x:Math.round(DOC.w * 0.72), y:Math.round(DOC.h * 0.3)} : {}, ex, {p:Object.assign(FX_DEF[kind](), p)});
// ワンクリック背景エフェクトの定義：bg＝DOC.bg に当てる差分、fx＝一緒に入れる動的エフェクト [種類, パラメータ, レイヤー上書き]
// bg の値がオブジェクトのものは DOC.bg の既存オブジェクトにマージ、それ以外は代入（applyBgFx）
const BG_FX = {
  reset:  {bg:{}, fx:[]},
  focus:  {bg:{zb:{on:true, amt:0.28}, contrast:0.1, vignette:0.5}, fx:[]},
  lines:  {bg:{zb:{on:true, amt:0.18}, vignette:0.45}, fx:[['lines', {}]]},
  speed:  {bg:{mb:{on:true, dist:140, angle:0}, contrast:0.1}, fx:[]},
  soft:   {bg:{blur:10, bright:0.04, vignette:0.3}, fx:[]},
  pop:    {bg:{dim:0.25, blur:5, vignette:0.5, shade:{on:true, amt:0.6, angle:90, cover:0.55}}, fx:[]},
  vivid:  {bg:{sat:0.45, contrast:0.18}, fx:[]},
  mono:   {bg:{tone:'mono', contrast:0.25, vignette:0.45}, fx:[]},
  retro:  {bg:{tone:'sepia', contrast:0.08, vignette:0.6}, fx:[]},
  duo:    {bg:{tone:'duotone', duo1:'#1b1464', duo2:'#ff9d5c', contrast:0.1}, fx:[]},
  red:    {bg:{tone:'mono', contrast:0.2, tint:{on:true, c:'#ff2d2d', a:0.45, mode:'multiply'}}, fx:[]},
  spot:   {bg:{dim:0.25, vignette:0.4}, fx:[['light', {}]]},
  mosaic: {bg:{mosaic:{on:true, size:32}}, fx:[]},
  horror: {bg:{tone:'mono', contrast:0.3, dim:0.2, vignette:0.7, tint:{on:true, c:'#5aff9a', a:0.18, mode:'multiply'}}, fx:[]},
  emo:    {bg:{sat:-0.25, bright:0.06, contrast:-0.1, blur:2, tint:{on:true, c:'#ffb3c7', a:0.35, mode:'soft-light'}}, fx:[['bokeh', {}]]},
  game:   {bg:{sat:0.3, contrast:0.15, vignette:0.4, pat:{on:true, type:'stripe', c:'#000000', a:0.18, size:16, mode:'source-over'}}, fx:[['speed', {}]]},
  news:   {bg:{contrast:0.1, shade:{on:true, c:'#001a4d', amt:0.75, angle:90, cover:0.45}}, fx:[]},
  manga:  {bg:{thresh:{on:true, lvl:0.5, c1:'#111111', c2:'#ffffff'}}, fx:[['lines', {c:'#000000'}]]},
  shock:  {bg:{tone:'mono', contrast:0.3, dim:0.15}, fx:[['gaan', {}]]},
  mini:   {bg:{tilt:{on:true, pos:0.55, w:0.3, blur:14, sat:0.35}}, fx:[]},
  popart: {bg:{posterize:{on:true, n:4}, sat:0.5, pat:{on:true, type:'dot', c:'#000000', a:0.25, size:14, mode:'multiply'}}, fx:[]},
  illust: {bg:{posterize:{on:true, n:5}, sat:0.25, contrast:0.1}, fx:[]},
  sunray: {bg:{dim:0.1, pat:{on:true, type:'sunburst', c:'#ffffff', a:0.18, size:24, mode:'overlay'}}, fx:[]},
  win:    {bg:{sat:0.3, bright:0.05}, fx:[['rays', {c:'#fff3b0'}], ['confetti', {}]]},
  winter: {bg:{sat:-0.2, tint:{on:true, c:'#9fd6ff', a:0.35, mode:'soft-light'}}, fx:[['snow', {}]]},
  rain:   {bg:{sat:-0.35, dim:0.2, tint:{on:true, c:'#3a5a8a', a:0.3, mode:'multiply'}}, fx:[['snow', {type:'rain', n:220, c:'#cfe3ff'}]]},
};
// 戻り値：動的エフェクトが入った、または前回分を消したか（呼び出し側の通知・表示更新の判断用）
function applyBgFx(name){
  const b = DOC.bg, P = BG_FX[name] || BG_FX.reset;
  // まず対象の項目を全部初期値に戻してから差分を当てる（前のエフェクトが残らないように）。on のオブジェクトは中身の設定値は残して on だけ切る
  Object.assign(b, {bright:0, contrast:0, sat:0, hue:0, blur:0, tone:'none', dim:0, vignette:0});
  b.zb.on = b.mb.on = b.mosaic.on = b.tint.on = b.shade.on = b.posterize.on = b.thresh.on = b.tilt.on = b.pat.on = false;
  for(const k in P.bg){ const v = P.bg[k]; if(v && typeof v === 'object') Object.assign(b[k], v); else b[k] = v; }
  // ワンクリックで作った動的エフェクトは入れ替え（自分で追加したものはそのまま）
  const had = DOC.layers.some(l => l.type === 'fx' && l.auto);
  DOC.layers = DOC.layers.filter(l => !(l.type === 'fx' && l.auto));
  // unshift＝一番下に入れる（背景のすぐ上）。auto フラグで次回の入れ替え対象を見分ける
  DOC.layers.unshift(...P.fx.map(([k, pp, ex]) => Object.assign(mkFx(k, pp, ex), {auto:true})));
  if(DOC.sel && !DOC.layers.find(l => l.id === DOC.sel)) DOC.sel = null;
  syncDoc(); renderLayers(); docChanged(false);
  return P.fx.length > 0 || had;
}
function addFx(kind){
  const L = mkFx(kind);
  // 選択中のレイヤーのすぐ下（なければ背景のすぐ上）に入れる
  const si = DOC.layers.findIndex(l => l.id === DOC.sel);
  DOC.layers.splice(si >= 0 ? si : 0, 0, L);
  selectLayer(L.id); renderLayers(); docChanged(false); openInspector();
  toast(`「${FX_NAMES[kind]}」を追加しました。ドラッグで移動、角で拡大縮小、上の○で回転。レイヤーパネルで前後も入れ替えられます`);
}
// ctx に fx レイヤー L を描く。f＝倍率（ドキュメント座標→ピクセル）。L.x/y はドキュメント座標の中心、rot は度
// 以降の座標は「L の中心が原点・sc=1 の局所座標」。translate→rotate→scale の順は変えない（回転・拡大の中心が中心点になる）
function drawFx(ctx, L, f){
  const p = L.p, [bw, bh] = FX_BOX(L);
  // 選択枠・グループの範囲計算のため、描画のたびに大きさを登録する
  dims.set(L.id, {w:bw * L.sc, h:bh * L.sc});
  ctx.save(); ctx.globalAlpha = L.op ?? 1; ctx.globalCompositeOperation = L.blend || 'source-over';
  ctx.translate(L.x * f, L.y * f); ctx.rotate((L.rot || 0) * PI / 180); ctx.scale(L.sc * f, L.sc * f);
  // 乱数は種類ごとに seed 固定。各ブロック内の R() を呼ぶ順番・回数が見た目そのものなので、順序を入れ替えない
  const R = rng(p.seed || 1);
  if(L.kind === 'lines'){
    const rx = DOC.w / 2 * p.inner, ry = DOC.h / 2 * p.inner, step = 2 * PI / p.n, full = p.full !== false;
    // 楕円を円として扱う（縦方向を縮めて描く）
    ctx.scale(1, ry / rx);
    // outer＝線の外端の半径。full（画面いっぱい）は画面の対角を十分に超える長さ（÷sc で縮小しても届くように）。
    // full でない場合は reach 倍の範囲まで届き、グラデーションで fade ぶん透明にする
    const outer =full ? Math.hypot(DOC.w, DOC.h) * 2.4 / Math.max(0.05, L.sc) * Math.max(1, rx / ry) : rx * Math.max(1.02, p.reach);
    if(full) ctx.fillStyle = p.c;
    else{ const g = ctx.createRadialGradient(0, 0, rx, 0, 0, outer), fd = clamp(p.fade ?? 0, 0, 1);
      g.addColorStop(0, rgba(p.c, 1)); g.addColorStop(1 - fd * 0.95, rgba(p.c, 1)); g.addColorStop(1, rgba(p.c, fd > 0 ? 0 : 1)); ctx.fillStyle = g; }
    ctx.beginPath();
    for(let i = 0; i < p.n; i++){
      const a = (i + R() * 0.9) * step, w = step * (0.12 + R() * 0.38) * p.w, k = 1 + (R() * 0.55 - 0.2) * p.len;
      const ok = full ? outer : outer * (1 - R() * 0.25 * p.len);
      ctx.moveTo(Math.cos(a) * rx * k, Math.sin(a) * rx * k);
      ctx.lineTo(Math.cos(a - w) * ok, Math.sin(a - w) * ok);
      ctx.lineTo(Math.cos(a + w) * ok, Math.sin(a + w) * ok);
      ctx.closePath();
    }
    ctx.fill();
  }else if(L.kind === 'light'){   // 光（スポット）：放射グラデーション。明るくするので、レイヤーの合成は screen が既定（FX_LAYER_DEF）
    const r = Math.max(DOC.w, DOC.h) * p.r * 0.55, g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, rgba(p.c, p.amt)); g.addColorStop(0.35, rgba(p.c, p.amt * 0.55)); g.addColorStop(1, rgba(p.c, 0));
    ctx.fillStyle = g; ctx.fillRect(-r, -r, r * 2, r * 2);
  }else if(L.kind === 'sparkle'){
    ctx.fillStyle = p.c;
    for(let i = 0; i < p.n; i++){
      const px = (R() - 0.5) * bw, py = (R() - 0.5) * bh, r = (0.35 + R() * 0.9) * 42 * p.size, k = r * 0.16;
      // 影のぼかしは座標変換(scale)の影響を受けないので、sc・f を掛けてピクセル量に直す（以降の shadowBlur も同じ）
      if(p.glow){ ctx.shadowColor = p.c; ctx.shadowBlur = r * 0.8 * L.sc * f; }
      ctx.beginPath(); ctx.moveTo(px, py - r);
      ctx.quadraticCurveTo(px + k, py - k, px + r, py); ctx.quadraticCurveTo(px + k, py + k, px, py + r);
      ctx.quadraticCurveTo(px - k, py + k, px - r, py); ctx.quadraticCurveTo(px - k, py - k, px, py - r);
      ctx.fill();
    }
  }else if(L.kind === 'rays'){   // 放射光：中心から広がる光の帯
    const n = Math.max(4, Math.round(p.n)), RR = Math.max(bw, bh) / 2, g = ctx.createRadialGradient(0, 0, 0, 0, 0, RR), fd = clamp(p.fade, 0, 1);
    g.addColorStop(0, rgba(p.c, 1)); g.addColorStop(1 - fd * 0.9, rgba(p.c, 0.9)); g.addColorStop(1, rgba(p.c, 0));
    ctx.fillStyle = g; ctx.beginPath();
    for(let i = 0; i < n; i++){ const a = i / n * 2 * PI + (R() - 0.5) * 0.15, w = PI / n * (0.55 + R() * 0.5);
      ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a - w / 2) * RR, Math.sin(a - w / 2) * RR); ctx.lineTo(Math.cos(a + w / 2) * RR, Math.sin(a + w / 2) * RR); ctx.closePath(); }
    ctx.fill();
  }else if(L.kind === 'speed'){   // スピード線：横に流れる細長い線
    ctx.fillStyle = p.c;
    for(let i = 0; i < p.n; i++){
      const y = (R() - 0.5) * bh, len = bw * (0.15 + R() * 0.45) * p.len, x0 = (R() - 0.5) * bw, t = (1.5 + R() * 5) * p.w;
      ctx.beginPath(); ctx.moveTo(x0 - len / 2, y); ctx.quadraticCurveTo(x0, y - t, x0 + len / 2, y); ctx.quadraticCurveTo(x0, y + t, x0 - len / 2, y); ctx.fill();
    }
  }else if(L.kind === 'gaan'){   // 効果線（ガーン）：上から垂れる縦線
    const g = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2); g.addColorStop(0, rgba(p.c, 1)); g.addColorStop(clamp(p.len, 0.05, 1), rgba(p.c, 0));
    ctx.fillStyle = g; ctx.beginPath();
    for(let i = 0; i < p.n; i++){
      const x = (i + R() * 0.8) / p.n * bw - bw / 2, len = bh * p.len * (0.5 + R() * 0.8), t = (2 + R() * 6) * p.w;
      ctx.moveTo(x - t, -bh / 2); ctx.lineTo(x + t, -bh / 2); ctx.lineTo(x, -bh / 2 + len); ctx.closePath();
    }
    ctx.fill();
  }else if(L.kind === 'confetti'){   // 紙吹雪
    const pal = ['#ff4f6d', '#ffd400', '#2fc7ff', '#5be37a', '#b46bff', '#ff8a2a', '#ffffff'];
    for(let i = 0; i < p.n; i++){
      const x = (R() - 0.5) * bw, y = (R() - 0.5) * bh, w = (22 + R() * 30) * p.size, h = w * (0.4 + R() * 0.5), a = R() * PI;
      ctx.fillStyle = p.colorful ? pal[Math.floor(R() * pal.length)] : p.c;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(1, 0.4 + Math.abs(Math.cos(a * 3)) * 0.6);
      if(R() < 0.3){ ctx.beginPath(); ctx.arc(0, 0, w * 0.4, 0, 7); ctx.fill(); } else ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }else if(L.kind === 'snow'){   // 雪・雨
    ctx.fillStyle = ctx.strokeStyle = p.c;
    // 粒ごとに globalAlpha を変えるので、レイヤーの不透明度 L.op を掛け直している（上で設定した値を上書きするため）
    if(p.type === 'rain'){ ctx.lineCap = 'round';
      for(let i = 0; i < p.n; i++){ const x = (R() - 0.5) * bw, y = (R() - 0.5) * bh, l = (30 + R() * 50) * p.size; ctx.globalAlpha = (L.op ?? 1) * (0.35 + R() * 0.5); ctx.lineWidth = (1.5 + R() * 2) * p.size; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - l * 0.25, y + l); ctx.stroke(); } }
    else for(let i = 0; i < p.n; i++){ const x = (R() - 0.5) * bw, y = (R() - 0.5) * bh, r = (2 + R() * R() * 9) * p.size;
      ctx.globalAlpha = (L.op ?? 1) * (0.5 + R() * 0.5); ctx.shadowColor = p.c; ctx.shadowBlur = r * L.sc * f; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
  }else if(L.kind === 'bolt'){   // 稲妻：上から下へジグザグに折れる線＋枝分かれ
    // 中点変位法：線分の中点を横にずらして再帰的に折る（depth 回）。ずれ幅 dev は再帰ごとに半分
    const path = (x0, y0, x1, y1, dev, depth, out) => {
      if(depth <= 0){ out.push([x1, y1]); return; }
      const mx = (x0 + x1) / 2 + (R() - 0.5) * dev, my = (y0 + y1) / 2 + (R() - 0.5) * dev * 0.3;
      path(x0, y0, mx, my, dev / 2, depth - 1, out); path(mx, my, x1, y1, dev / 2, depth - 1, out);
    };
    const main = [[(R() - 0.5) * bw * 0.3, -bh / 2]]; path(main[0][0], main[0][1], (R() - 0.5) * bw * 0.4, bh / 2, bw * 0.7, 6, main);
    const lines = [[main, 1]];
    for(let i = 4; i < main.length - 6; i += 6) if(R() < p.branch){ const [sx, sy] = main[i], br = [[sx, sy]], ex = sx + (R() - 0.5) * bw * 0.9, ey = sy + bh * (0.15 + R() * 0.25); path(sx, sy, ex, ey, bw * 0.3, 4, br); lines.push([br, 0.45]); }
    // 太い色の線（グロー）の上に細い白線を重ねて、芯が光って見えるようにする
    ctx.lineJoin = ctx.lineCap = 'round';
    for(const [w, col, blur] of [[22 * p.w, p.c, 30], [6 * p.w, '#ffffff', 10]])
      for(const [pts, k] of lines){ ctx.lineWidth = w * k; ctx.strokeStyle = col; ctx.shadowColor = p.c; ctx.shadowBlur = blur * L.sc * f; ctx.beginPath(); pts.forEach(([x, y], j) => j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
  }else if(L.kind === 'bokeh'){   // ボケの光
    const pal = ['#ffd27a', '#ff8ad8', '#7fd6ff', '#b9a3ff', '#9dffc8'];
    for(let i = 0; i < p.n; i++){
      const x = (R() - 0.5) * bw, y = (R() - 0.5) * bh, r = (20 + R() * 70) * p.size, col = p.colorful ? pal[Math.floor(R() * pal.length)] : p.c, a = 0.25 + R() * 0.5;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col, a * 0.7)); g.addColorStop(0.8, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  }else if(L.kind === 'scatter'){   // ハート・星・音符・しずく
    const pal = ['#ff4f9a', '#ffd400', '#2fc7ff', '#b46bff', '#ff7a2a'];
    for(let i = 0; i < p.n; i++){
      const x = (R() - 0.5) * bw, y = (R() - 0.5) * bh, r = (28 + R() * 46) * p.size;
      ctx.save(); ctx.translate(x, y); ctx.rotate((R() - 0.5) * 0.9); ctx.fillStyle = p.colorful ? pal[Math.floor(R() * pal.length)] : p.c;
      ctx.beginPath(); scatterShape(ctx, p.shape, r); ctx.fill(); ctx.restore();
    }
  }else if(L.kind === 'burst'){   // 爆発：山（外側）と谷（内側）を交互に結ぶギザギザ。偶数番が山、depth が谷の深さ
    const rx = bw / 2 * 0.92, ry = bh / 2 * 0.92, n = Math.max(5, Math.round(p.spikes));
    ctx.beginPath();
    for(let i = 0; i <= n * 2; i++){
      const a = i / (n * 2) * 2 * PI - PI / 2, k = i % 2 === 0 ? 1 + R() * 0.08 : 1 - p.depth * (0.65 + R() * 0.35);
      const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.lineJoin = 'round';
    if(p.sw > 0){ ctx.lineWidth = p.sw * 2; ctx.strokeStyle = p.c2; ctx.stroke(); }
    ctx.fillStyle = p.c; ctx.fill();
  }
  ctx.restore();
}
// ハート・星などの輪郭パスだけを作る（beginPath／fill は呼び出し側）。原点中心、r が大きさ。未知の shape はハートになる
function scatterShape(c, shape, r){
  if(shape === 'star'){ for(let i = 0; i < 10; i++){ const a = i / 10 * 2 * PI - PI / 2, k = i % 2 ? r * 0.45 : r; i ? c.lineTo(Math.cos(a) * k, Math.sin(a) * k) : c.moveTo(Math.cos(a) * k, Math.sin(a) * k); } c.closePath(); }
  else if(shape === 'note'){ c.ellipse(-r * 0.25, r * 0.55, r * 0.38, r * 0.28, -0.4, 0, 7); c.rect(r * 0.04, -r * 0.8, r * 0.14, r * 1.4); c.moveTo(r * 0.18, -r * 0.8); c.quadraticCurveTo(r * 0.75, -r * 0.5, r * 0.55, -r * 0.05); c.quadraticCurveTo(r * 0.6, -r * 0.45, r * 0.18, -r * 0.5); }
  else if(shape === 'drop'){ c.moveTo(0, -r); c.bezierCurveTo(r * 0.6, -r * 0.2, r * 0.75, r * 0.2, r * 0.6, r * 0.5); c.arc(0, r * 0.4, r * 0.6, 0.15, PI - 0.15); c.bezierCurveTo(-r * 0.75, r * 0.2, -r * 0.6, -r * 0.2, 0, -r); }
  else { c.moveTo(0, r * 0.85); c.bezierCurveTo(-r * 1.2, 0, -r * 0.7, -r * 1, 0, -r * 0.4); c.bezierCurveTo(r * 0.7, -r * 1, r * 1.2, 0, 0, r * 0.85); }
}
