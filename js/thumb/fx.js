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
  // 漫画の表現
  uni:     () => ({c:'#111111', n:150, inner:0.38, len:1, w:1, fill:false, seed:9}),   // ウニフラッシュ（fill でベタフラッシュ）
  anger:   () => ({c:'#ff2a3a', c2:'#ffffff', sw:8}),                                   // 怒りマーク
  sweat:   () => ({c:'#7fd0ff', c2:'#1f1b2d', n:3, size:1, seed:10}),                   // 汗
  gloom:   () => ({c:'#3a2a5a', n:24, len:0.6, w:1, amt:0.55, seed:11}),                // どんより（縦線）
  mark:    () => ({text:'!?', c:'#ffd400', c2:'#1f1b2d', sw:10}),                        // ！？マーク
  // 光
  flare:   () => ({c:'#ffd9a0', amt:1, n:6, angle:-35, seed:12}),                        // レンズフレア
  cross:   () => ({c:'#ffffff', n:5, size:1, spikes:'4', seed:13}),                     // 十字の光
  aura:    () => ({c:'#8a5cff', c2:'#ffffff', n:36, h:1, rise:0.6, seed:14}),            // オーラ
  // 演出
  fire:    () => ({c:'#ff4a14', c2:'#ffe14a', n:14, h:1, seed:15}),                      // 炎
  smoke:   () => ({c:'#d4d4dc', n:28, size:1, seed:16}),                                 // 煙
  crack:   () => ({c:'#ffffff', n:12, w:1, ring:0.5, seed:17}),                          // ヒビ割れ
  glitch:  () => ({c:'#38f6ff', n:18, amt:0.7, colorful:true, seed:18}),                 // グリッチの帯
  petals:  () => ({c:'#ffb7d0', shape:'sakura', n:40, size:1, colorful:true, seed:19}),  // 桜・葉っぱ・もみじ
  bubbles: () => ({c:'#bfe9ff', type:'bubble', n:40, size:1, seed:20}),                  // 泡・水しぶき
  // ゲーム・配信
  shock:   () => ({c:'#ffffff', n:3, w:1, tilt:0.4, seed:21}),                           // 衝撃波の輪
  hit:     () => ({c:'#ffd400', c2:'#ff3d00', n:14, size:1, seed:22}),                    // ヒットエフェクト
  shine:   () => ({c:'#ffffff', angle:-30, w:1, n:2, seed:23}),                           // ピカピカ（光沢の帯）
};
const FX_NAMES = {lines:'集中線', light:'光（スポット）', sparkle:'キラキラ', burst:'爆発（ギザギザ）', rays:'放射光', speed:'スピード線', gaan:'効果線（ガーン）', confetti:'紙吹雪', snow:'雪・雨', bolt:'稲妻', bokeh:'ボケの光', scatter:'ハート・星',
  uni:'ウニフラ・ベタフラ', anger:'怒りマーク', sweat:'汗', gloom:'どんより', mark:'！？マーク', flare:'レンズフレア', cross:'十字の光', aura:'オーラ',
  fire:'炎', smoke:'煙', crack:'ヒビ割れ', glitch:'グリッチ', petals:'桜・葉っぱ', bubbles:'泡・しぶき', shock:'衝撃波', hit:'ヒット', shine:'ピカピカ'};
const FX_ICONS = {lines:'burst', light:'sun', sparkle:'sparkle', burst:'boom', rays:'rays', speed:'speed', gaan:'gaan', confetti:'confetti', snow:'snow', bolt:'bolt', bokeh:'bokeh', scatter:'heart',
  uni:'uni', anger:'anger', sweat:'sweat', gloom:'gloom', mark:'mark', flare:'flare', cross:'cross', aura:'aura', fire:'fire', smoke:'smoke', crack:'crack',
  glitch:'glitch', petals:'petal', bubbles:'bubbles', shock:'shock', hit:'boom', shine:'shine'};
// 追加ボタンの並び（[見出し, 種類の一覧]）。追加メニュー（index.html の #addFxChips）と、背景の「効果」タブの両方がこの順で並べる
/** @type {Array<[string, string[]]>} */
const FX_GROUPS = [['定番', ['lines', 'light', 'sparkle', 'burst', 'rays', 'speed', 'gaan', 'confetti', 'snow', 'bolt', 'bokeh', 'scatter']],
  ['マンガ', ['uni', 'anger', 'sweat', 'gloom', 'mark']], ['光', ['flare', 'cross', 'aura']],
  ['演出', ['fire', 'smoke', 'crack', 'glitch', 'petals', 'bubbles']], ['ゲーム・配信', ['shock', 'hit', 'shine']]];
// 追加ボタンの HTML（cls＝ボタンの class）。見出しごとに1行にまとめる
const fxChipsHtml = cls => FX_GROUPS.map(([t, ks]) => `<div class="fxgrp"><span class="fxgrp-t">${t}</span>${ks.map(k => `<button class="${cls}" data-addfx="${k}">${ic(FX_ICONS[k])}${FX_NAMES[k]}</button>`).join('')}</div>`).join('');
// 種類ごとのレイヤー側の既定値（不透明度・合成・拡大率）。LAYER_BASE より優先して mkFx で重ねる
const FX_LAYER_DEF ={lines:{op:0.55}, light:{blend:'screen'}, burst:{sc:0.8}, rays:{op:0.4}, speed:{op:0.75}, gaan:{op:0.8}, bokeh:{blend:'screen'}, bolt:{sc:0.9},
  flare:{blend:'screen'}, aura:{blend:'screen'}, smoke:{op:0.85}, glitch:{op:0.8}, shine:{blend:'screen', op:0.8}, gloom:{op:0.9}, shock:{op:0.9}};
// 種類ごとの「描画の基準サイズ [幅, 高さ]」（sc=1 のときのドキュメント座標）。選択枠(dims)と、粒を散らす範囲の両方の基準になる
// 全面系は DOC のサイズ、局所系（キラキラ・爆発・稲妻など）は固定サイズ。集中線は中心の空き(inner)と届く範囲(reach)から決まる
/** @param {Layer} L */
const FX_BOX = L => { const p = L.p, W = DOC.w, H = DOC.h, M = Math.max(W, H); return {lines:p.full === false ? [W * p.inner * p.reach, H * p.inner * p.reach] : [W * p.inner, H * p.inner], light:[M * p.r * 1.1, M * p.r * 1.1], sparkle:[640, 400], burst:[780, 500], rays:[M * p.r * 1.2, M * p.r * 1.2], speed:[W, H], gaan:[W, H], confetti:[W, H], snow:[W, H], bolt:[420, 860], bokeh:[W, H], scatter:[1100, 640],
  uni:[W, H], anger:[260, 260], sweat:[320, 320], gloom:[800, 500], mark:[300, 380], flare:[W, H], cross:[640, 400], aura:[700, 900],
  fire:[W, 560], smoke:[900, 700], crack:[1000, 700], glitch:[W, H], petals:[W, H], bubbles:p.type === 'splash' ? [900, 600] : [W, H], shock:[900, 560], hit:[520, 520], shine:[800, 450]}[L.kind] || [400, 400]; };
// 引数：kind＝種類、p＝パラメータの上書き、ex＝レイヤー側の上書き（位置など）
// 初期位置：ライト・レンズフレアは右上寄り、炎は下の端（画面の下から燃え上がる）。それ以外は LAYER_BASE の中央
const FX_START = kind => kind === 'light' || kind === 'flare' ? {x:Math.round(DOC.w * 0.72), y:Math.round(DOC.h * 0.3)} : kind === 'fire' ? {x:Math.round(DOC.w / 2), y:Math.round(DOC.h - 280)} : {};
const mkFx = (kind, p = {}, ex = {}) => Object.assign(LAYER_BASE(), {id:uid(), type:'fx', kind}, FX_LAYER_DEF[kind] || {}, FX_START(kind), ex, {p:Object.assign(FX_DEF[kind](), p)});
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
  // 加工エフェクト（imgfx.js）を使うもの
  dot:    {bg:{mosaic:{on:true, size:14}, posterize:{on:true, n:5}, sat:0.3}, fx:[]},
  tone:   {bg:{half:{on:true, size:9, c:'#111111', mix:0.35}, contrast:0.2, edge:{on:true, amt:1.2, c:'#111111', keep:true}}, fx:[]},
  sketch: {bg:{edge:{on:true, amt:1.4, c:'#2a2a2a', keep:false}}, fx:[]},
  paint:  {bg:{paint:{on:true, r:5}, sat:0.2}, fx:[]},
  glitch: {bg:{rgb:{on:true, d:10, angle:0}, noise:0.25, contrast:0.15}, fx:[['glitch', {}]]},
  cyber:  {bg:{gmap:{on:true, c1:'#12002e', c2:'#ff2bd6', c3:'#38f6ff', a:0.9}, contrast:0.15}, fx:[]},
  wave:   {bg:{warp:{type:'wave', amt:0.4, n:6}}, fx:[]},
  swirl:  {bg:{warp:{type:'swirl', amt:0.45, n:6}, zb:{on:true, amt:0.12}}, fx:[]},
  fisheye:{bg:{warp:{type:'fisheye', amt:0.55, n:6}, vignette:0.4}, fx:[]},
  sakura: {bg:{bright:0.05, tint:{on:true, c:'#ffb3d0', a:0.3, mode:'soft-light'}}, fx:[['petals', {}]]},
  fire:   {bg:{dim:0.2, contrast:0.15, tint:{on:true, c:'#ff5a1f', a:0.35, mode:'overlay'}}, fx:[['fire', {}]]},
};
// 戻り値：動的エフェクトが入った、または前回分を消したか（呼び出し側の通知・表示更新の判断用）
function applyBgFx(name){
  const b = DOC.bg, P = BG_FX[name] || BG_FX.reset;
  // まず対象の項目を全部初期値に戻してから差分を当てる（前のエフェクトが残らないように）。on のオブジェクトは中身の設定値は残して on だけ切る
  Object.assign(b, {bright:0, contrast:0, sat:0, hue:0, blur:0, tone:'none', dim:0, vignette:0});
  b.zb.on = b.mb.on = b.mosaic.on = b.tint.on = b.shade.on = b.posterize.on = b.thresh.on = b.tilt.on = b.pat.on = false;
  b.rgb.on = b.gmap.on = b.rep.on = b.half.on = b.edge.on = b.paint.on = false; b.sharp = 0; b.noise = 0; b.warp.type = 'none';   // 加工エフェクト（imgfx.js）
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
/** @param {Layer} L */
// 種類ごとの描画（drawFx から呼ぶ）。キーは FX_DEF と同じ。座標の原点はエフェクトの中心で、位置・回転・拡大・不透明度・合成は drawFx が設定済み。
// 引数：p＝パラメータ（L.p）、R＝この種類の seed で作った乱数、bw・bh＝基準サイズ（FX_BOX）、f＝プレビュー倍率（shadowBlur を px に直すのに使う）。
// 乱数 R() を呼ぶ順番・回数が見た目そのもの（保存済みのサムネの見た目が変わる）なので、各関数の中の順序を入れ替えないこと
/** @type {Record<string, (ctx: CanvasRenderingContext2D, L: Layer, p: Record<string, any>, R: () => number, bw: number, bh: number, f: number) => void>} */
const FX_DRAW = {
  lines(ctx, L, p, R, bw, bh, f){
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
  },
  // 光（スポット）：放射グラデーション。明るくするので、レイヤーの合成は screen が既定（FX_LAYER_DEF）
  light(ctx, L, p, R, bw, bh, f){
    const r = Math.max(DOC.w, DOC.h) * p.r * 0.55, g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, rgba(p.c, p.amt)); g.addColorStop(0.35, rgba(p.c, p.amt * 0.55)); g.addColorStop(1, rgba(p.c, 0));
    ctx.fillStyle = g; ctx.fillRect(-r, -r, r * 2, r * 2);
  },
  sparkle(ctx, L, p, R, bw, bh, f){
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
  },
  // 放射光：中心から広がる光の帯
  rays(ctx, L, p, R, bw, bh, f){
    const n = Math.max(4, Math.round(p.n)), RR = Math.max(bw, bh) / 2, g = ctx.createRadialGradient(0, 0, 0, 0, 0, RR), fd = clamp(p.fade, 0, 1);
    g.addColorStop(0, rgba(p.c, 1)); g.addColorStop(1 - fd * 0.9, rgba(p.c, 0.9)); g.addColorStop(1, rgba(p.c, 0));
    ctx.fillStyle = g; ctx.beginPath();
    for(let i = 0; i < n; i++){ const a = i / n * 2 * PI + (R() - 0.5) * 0.15, w = PI / n * (0.55 + R() * 0.5);
      ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a - w / 2) * RR, Math.sin(a - w / 2) * RR); ctx.lineTo(Math.cos(a + w / 2) * RR, Math.sin(a + w / 2) * RR); ctx.closePath(); }
    ctx.fill();
  },
  // スピード線：横に流れる細長い線
  speed(ctx, L, p, R, bw, bh, f){
    ctx.fillStyle = p.c;
    for(let i = 0; i < p.n; i++){
      const y = (R() - 0.5) * bh, len = bw * (0.15 + R() * 0.45) * p.len, x0 = (R() - 0.5) * bw, t = (1.5 + R() * 5) * p.w;
      ctx.beginPath(); ctx.moveTo(x0 - len / 2, y); ctx.quadraticCurveTo(x0, y - t, x0 + len / 2, y); ctx.quadraticCurveTo(x0, y + t, x0 - len / 2, y); ctx.fill();
    }
  },
  // 効果線（ガーン）：上から垂れる縦線
  gaan(ctx, L, p, R, bw, bh, f){
    const g = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2); g.addColorStop(0, rgba(p.c, 1)); g.addColorStop(clamp(p.len, 0.05, 1), rgba(p.c, 0));
    ctx.fillStyle = g; ctx.beginPath();
    for(let i = 0; i < p.n; i++){
      const x = (i + R() * 0.8) / p.n * bw - bw / 2, len = bh * p.len * (0.5 + R() * 0.8), t = (2 + R() * 6) * p.w;
      ctx.moveTo(x - t, -bh / 2); ctx.lineTo(x + t, -bh / 2); ctx.lineTo(x, -bh / 2 + len); ctx.closePath();
    }
    ctx.fill();
  },
  // 紙吹雪
  confetti(ctx, L, p, R, bw, bh, f){
    const pal = ['#ff4f6d', '#ffd400', '#2fc7ff', '#5be37a', '#b46bff', '#ff8a2a', '#ffffff'];
    for(let i = 0; i < p.n; i++){
      const x = (R() - 0.5) * bw, y = (R() - 0.5) * bh, w = (22 + R() * 30) * p.size, h = w * (0.4 + R() * 0.5), a = R() * PI;
      ctx.fillStyle = p.colorful ? pal[Math.floor(R() * pal.length)] : p.c;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(1, 0.4 + Math.abs(Math.cos(a * 3)) * 0.6);
      if(R() < 0.3){ ctx.beginPath(); ctx.arc(0, 0, w * 0.4, 0, 7); ctx.fill(); } else ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }
  },
  // 雪・雨
  snow(ctx, L, p, R, bw, bh, f){
    ctx.fillStyle = ctx.strokeStyle = p.c;
    // 粒ごとに globalAlpha を変えるので、レイヤーの不透明度 L.op を掛け直している（上で設定した値を上書きするため）
    if(p.type === 'rain'){ ctx.lineCap = 'round';
      for(let i = 0; i < p.n; i++){ const x = (R() - 0.5) * bw, y = (R() - 0.5) * bh, l = (30 + R() * 50) * p.size; ctx.globalAlpha = (L.op ?? 1) * (0.35 + R() * 0.5); ctx.lineWidth = (1.5 + R() * 2) * p.size; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - l * 0.25, y + l); ctx.stroke(); } }
    else for(let i = 0; i < p.n; i++){ const x = (R() - 0.5) * bw, y = (R() - 0.5) * bh, r = (2 + R() * R() * 9) * p.size;
      ctx.globalAlpha = (L.op ?? 1) * (0.5 + R() * 0.5); ctx.shadowColor = p.c; ctx.shadowBlur = r * L.sc * f; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
  },
  // 稲妻：上から下へジグザグに折れる線＋枝分かれ
  bolt(ctx, L, p, R, bw, bh, f){
    // 中点変位法：線分の中点を横にずらして再帰的に折る（depth 回）。ずれ幅 dev は再帰ごとに半分
    const path = (x0, y0, x1, y1, dev, depth, out) => {
      if(depth <= 0){ out.push([x1, y1]); return; }
      const mx = (x0 + x1) / 2 + (R() - 0.5) * dev, my = (y0 + y1) / 2 + (R() - 0.5) * dev * 0.3;
      path(x0, y0, mx, my, dev / 2, depth - 1, out); path(mx, my, x1, y1, dev / 2, depth - 1, out);
    };
    const main = [[(R() - 0.5) * bw * 0.3, -bh / 2]]; path(main[0][0], main[0][1], (R() - 0.5) * bw * 0.4, bh / 2, bw * 0.7, 6, main);
    /** @type {Array<[number[][], number]>} */
    const lines = [[main, 1]];
    for(let i = 4; i < main.length - 6; i += 6) if(R() < p.branch){ const [sx, sy] = main[i], br = [[sx, sy]], ex = sx + (R() - 0.5) * bw * 0.9, ey = sy + bh * (0.15 + R() * 0.25); path(sx, sy, ex, ey, bw * 0.3, 4, br); lines.push([br, 0.45]); }
    // 太い色の線（グロー）の上に細い白線を重ねて、芯が光って見えるようにする
    ctx.lineJoin = ctx.lineCap = 'round';
    for(const [w, col, blur] of [[22 * p.w, p.c, 30], [6 * p.w, '#ffffff', 10]])
      for(const [pts, k] of lines){ ctx.lineWidth = w * k; ctx.strokeStyle = col; ctx.shadowColor = p.c; ctx.shadowBlur = blur * L.sc * f; ctx.beginPath(); pts.forEach(([x, y], j) => j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
  },
  // ボケの光
  bokeh(ctx, L, p, R, bw, bh, f){
    const pal = ['#ffd27a', '#ff8ad8', '#7fd6ff', '#b9a3ff', '#9dffc8'];
    for(let i = 0; i < p.n; i++){
      const x = (R() - 0.5) * bw, y = (R() - 0.5) * bh, r = (20 + R() * 70) * p.size, col = p.colorful ? pal[Math.floor(R() * pal.length)] : p.c, a = 0.25 + R() * 0.5;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col, a * 0.7)); g.addColorStop(0.8, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  },
  // ハート・星・音符・しずく
  scatter(ctx, L, p, R, bw, bh, f){
    const pal = ['#ff4f9a', '#ffd400', '#2fc7ff', '#b46bff', '#ff7a2a'];
    for(let i = 0; i < p.n; i++){
      const x = (R() - 0.5) * bw, y = (R() - 0.5) * bh, r = (28 + R() * 46) * p.size;
      ctx.save(); ctx.translate(x, y); ctx.rotate((R() - 0.5) * 0.9); ctx.fillStyle = p.colorful ? pal[Math.floor(R() * pal.length)] : p.c;
      ctx.beginPath(); scatterShape(ctx, p.shape, r); ctx.fill(); ctx.restore();
    }
  },
  // 爆発：山（外側）と谷（内側）を交互に結ぶギザギザ。偶数番が山、depth が谷の深さ
  burst(ctx, L, p, R, bw, bh, f){
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
  },
  /* ---------- 漫画の表現 ---------- */
  // ウニフラッシュ：中心の輪から外へ、細い紡錘形の線をたくさん。fill（ベタフラッシュ）のときは、外側を塗りつぶして、内側へ向かう細いトゲにする
  uni(ctx, L, p, R, bw, bh, f){
    const n = clamp(Math.round(p.n), 8, 400), r0 = Math.min(bw, bh) / 2 * clamp(p.inner, 0.05, 1.5), Lm = Math.max(bw, bh) / 2 * 0.9 * p.len;
    ctx.fillStyle = p.c; ctx.beginPath();
    if(p.fill){
      // 外枠の四角（レイヤーの範囲）から、トゲの付いた星形を偶奇規則で抜く。星形の内側の頂点＝トゲの先（中心寄り）、外側の頂点＝トゲの付け根
      const big = Math.hypot(bw, bh); ctx.rect(-big, -big, big * 2, big * 2);
      for(let i = 0; i < n; i++){
        const a = (i + R() * 0.6) / n * 2 * PI, tip = r0 * (1 + R() * 0.3), root = r0 + Lm * (0.25 + R() * 0.35) * p.w, a2 = a + PI / n;
        const x0 = Math.cos(a) * tip, y0 = Math.sin(a) * tip, x1 = Math.cos(a2) * root, y1 = Math.sin(a2) * root;
        i ? ctx.lineTo(x0, y0) : ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      }
      ctx.closePath(); ctx.fill('evenodd'); return;
    }
    for(let i = 0; i < n; i++){
      const a = (i + R() * 0.8) / n * 2 * PI, rs = r0 * (1 + R() * 0.25), re = rs + Lm * (0.35 + R() * 0.65), wd = (2 + R() * 4) * p.w, rm = rs + (re - rs) * 0.35;
      const cs = Math.cos(a), sn = Math.sin(a);
      ctx.moveTo(cs * rs, sn * rs); ctx.lineTo(cs * rm - sn * wd, sn * rm + cs * wd); ctx.lineTo(cs * re, sn * re); ctx.lineTo(cs * rm + sn * wd, sn * rm - cs * wd); ctx.closePath();
    }
    ctx.fill();
  },
  // 怒りマーク：角を中心に向けた L 字のカーブを4つ。フチ（c2）を太く描いてから本体（c）を重ねる
  anger(ctx, L, p, R, bw, bh, f){
    const r = Math.min(bw, bh) / 2 * 0.9, T = r * 0.22;
    const arms = () => { ctx.beginPath(); for(let q = 0; q < 4; q++){ const c = Math.cos(q * PI / 2), s = Math.sin(q * PI / 2), P = (x, y) => [x * c - y * s, x * s + y * c];
      const [ax, ay] = P(r * 0.2, r * 0.95), [bx, by] = P(r * 0.2, r * 0.2), [cx, cy] = P(r * 0.95, r * 0.2); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(bx, by, cx, cy); } };
    ctx.lineCap = ctx.lineJoin = 'round';
    if(p.sw > 0){ arms(); ctx.lineWidth = T + p.sw * 2; ctx.strokeStyle = p.c2; ctx.stroke(); }
    arms(); ctx.lineWidth = T; ctx.strokeStyle = p.c; ctx.stroke();
  },
  // 汗：しずくを中心のまわりに並べる。しずくの先は中心（顔）のほうを向く
  sweat(ctx, L, p, R, bw, bh, f){
    const n = clamp(Math.round(p.n), 1, 8), rr = Math.min(bw, bh) * 0.3;
    for(let i = 0; i < n; i++){
      const a = -PI * 0.85 + (n === 1 ? 0.35 : i / (n - 1) * 0.7) * PI + (R() - 0.5) * 0.2, px = Math.cos(a) * rr, py = Math.sin(a) * rr, s = (52 + R() * 30) * p.size;
      ctx.save(); ctx.translate(px, py); ctx.rotate(Math.atan2(-py, -px) + PI / 2 + PI);
      ctx.beginPath(); scatterShape(ctx, 'drop', s); ctx.fillStyle = p.c; ctx.fill(); ctx.lineWidth = s * 0.12; ctx.strokeStyle = p.c2; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.ellipse(-s * 0.22, s * 0.25, s * 0.12, s * 0.2, 0.4, 0, 2 * PI); ctx.fill();
      ctx.restore();
    }
  },
  // どんより：上から暗い色をかぶせて、細い縦線を等間隔に垂らす（下に行くほど消える）
  gloom(ctx, L, p, R, bw, bh, f){
    const g = ctx.createLinearGradient(0, -bh / 2, 0, -bh / 2 + bh * clamp(p.len, 0.1, 1)); g.addColorStop(0, rgba(p.c, 1)); g.addColorStop(1, rgba(p.c, 0));
    ctx.save(); ctx.globalAlpha *= clamp(p.amt, 0, 1); ctx.fillStyle = g; ctx.fillRect(-bw / 2, -bh / 2, bw, bh); ctx.restore();
    const n = clamp(Math.round(p.n), 2, 120); ctx.strokeStyle = g; ctx.lineCap = 'round';
    for(let i = 0; i < n; i++){ const x = -bw / 2 + (i + 0.5) / n * bw + (R() - 0.5) * bw / n * 0.3, len = bh * clamp(p.len, 0.1, 1) * (0.6 + R() * 0.4);
      ctx.lineWidth = (2 + R() * 2) * p.w; ctx.beginPath(); ctx.moveTo(x, -bh / 2); ctx.lineTo(x, -bh / 2 + len); ctx.stroke(); }
  },
  // ！？マーク：太い文字にフチ（c2）と、右下にずらした影を付ける。文字は選択肢（FX_MARKS）からだけ選ぶ
  mark(ctx, L, p, R, bw, bh, f){
    const t = FX_MARKS.some(m => m[0] === p.text) ? p.text : '!?';
    let fs = bh * 0.82; ctx.font = `900 ${fs}px "M PLUS Rounded 1c", "Noto Sans JP", sans-serif`;
    const w = ctx.measureText(t).width; if(w > bw * 0.92){ fs *= bw * 0.92 / w; ctx.font = `900 ${fs}px "M PLUS Rounded 1c", "Noto Sans JP", sans-serif`; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const sw = Math.max(0, p.sw), d = fs * 0.05 + sw * 0.4;
    if(sw > 0){ ctx.lineWidth = sw * 2; ctx.strokeStyle = p.c2; ctx.fillStyle = p.c2; ctx.strokeText(t, d, d); ctx.fillText(t, d, d); ctx.strokeText(t, 0, 0); }
    ctx.fillStyle = p.c; ctx.fillText(t, 0, 0);
  },
  /* ---------- 光 ---------- */
  // レンズフレア：光源（中心）のにじみと横の光の筋、angle の向きへ並ぶゴースト（色の付いた丸・六角形・輪）
  flare(ctx, L, p, R, bw, bh, f){
    const M = Math.max(bw, bh), a = clamp(p.amt, 0, 2), r0 = M * 0.13;
    let g = ctx.createRadialGradient(0, 0, 0, 0, 0, r0); g.addColorStop(0, `rgba(255,255,255,${Math.min(1, a)})`); g.addColorStop(0.25, rgba(p.c, 0.8 * Math.min(1, a))); g.addColorStop(1, rgba(p.c, 0));
    ctx.fillStyle = g; ctx.fillRect(-r0, -r0, r0 * 2, r0 * 2);
    // 横の光の筋（アナモルフィック）
    ctx.save(); ctx.scale(1, 0.025); g = ctx.createRadialGradient(0, 0, 0, 0, 0, M * 0.45); g.addColorStop(0, `rgba(255,255,255,${0.9 * Math.min(1, a)})`); g.addColorStop(1, rgba(p.c, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, M * 0.45, 0, 2 * PI); ctx.fill(); ctx.restore();
    const ang = (p.angle || 0) * PI / 180, dx = Math.cos(ang), dy = Math.sin(ang), pal = [p.c, '#7fd6ff', '#b4ff9a', '#ff9ad5', '#ffffff'];
    for(let i = 0; i < clamp(Math.round(p.n), 0, 16); i++){
      const t = 0.25 + R() * 1.3, x = dx * t * M * 0.6, y = dy * t * M * 0.6, r = M * (0.015 + R() * 0.06), col = pal[Math.floor(R() * pal.length)], al = (0.18 + R() * 0.3) * Math.min(1, a), kind = R();
      ctx.fillStyle = rgba(col, al); ctx.strokeStyle = rgba(col, al * 1.6); ctx.lineWidth = r * 0.12; ctx.beginPath();
      if(kind < 0.4) ctx.arc(x, y, r, 0, 2 * PI);
      else if(kind < 0.75){ for(let k = 0; k < 6; k++){ const b = k / 6 * 2 * PI; k ? ctx.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r) : ctx.moveTo(x + Math.cos(b) * r, y + Math.sin(b) * r); } ctx.closePath(); }
      else { ctx.arc(x, y, r * 1.6, 0, 2 * PI); ctx.stroke(); continue; }
      ctx.fill();
    }
  },
  // 十字の光：細く尖った光のトゲ（4・6・8本。8本のときは斜めを短く）と、中心の光
  cross(ctx, L, p, R, bw, bh, f){
    const k = [4, 6, 8].includes(+p.spikes) ? +p.spikes : 4;
    for(let i = 0; i < clamp(Math.round(p.n), 1, 40); i++){
      const x = (R() - 0.5) * bw * 0.9, y = (R() - 0.5) * bh * 0.9, Lr = (30 + R() * 70) * p.size, rot = (R() - 0.5) * 0.3;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = p.c; ctx.shadowColor = p.c; ctx.shadowBlur = Lr * 0.25 * L.sc * f;
      ctx.beginPath();
      for(let j = 0; j < k; j++){ const a = j / k * 2 * PI, l = k === 8 && j % 2 ? Lr * 0.45 : Lr, w = Lr * 0.06, c = Math.cos(a), s = Math.sin(a);
        ctx.moveTo(-s * w, c * w); ctx.lineTo(c * l, s * l); ctx.lineTo(s * w, -c * w); ctx.lineTo(-c * w * 0.5, -s * w * 0.5); ctx.closePath(); }
      ctx.fill();
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Lr * 0.3); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, rgba(p.c, 0));
      ctx.shadowBlur = 0; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, Lr * 0.3, 0, 2 * PI); ctx.fill();
      ctx.restore();
    }
  },
  // オーラ：楕円のまわりから、外向き＋上向き（rise）にゆらめく炎の舌。中心の楕円は空けて、縁を光らせる
  aura(ctx, L, p, R, bw, bh, f){
    const rx = bw * 0.3, ry = bh * 0.34, cy = bh * 0.06, n = clamp(Math.round(p.n), 6, 120), rise = clamp(p.rise, 0, 1);
    for(let i = 0; i < n; i++){
      const a = (i + R() * 0.7) / n * 2 * PI, bx = Math.cos(a) * rx, by = cy + Math.sin(a) * ry;
      let nx = Math.cos(a) * (1 - rise), ny = Math.sin(a) * (1 - rise) - rise; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const len = bh * (0.12 + R() * 0.22) * p.h * (Math.sin(a) < 0 ? 1.3 : 0.8), w = rx * (0.18 + R() * 0.16), sway = (R() - 0.5) * len * 0.5;
      const tx = bx + nx * len - ny * sway, ty = by + ny * len + nx * sway, px = -ny * w, py = nx * w;
      const g = ctx.createLinearGradient(bx, by, tx, ty); g.addColorStop(0, rgba(p.c, 0.85)); g.addColorStop(0.6, rgba(p.c, 0.35)); g.addColorStop(1, rgba(p.c, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bx + px, by + py);
      ctx.quadraticCurveTo(bx + nx * len * 0.5 + px * 0.9 + sway * 0.3, by + ny * len * 0.5 + py * 0.9, tx, ty);
      ctx.quadraticCurveTo(bx + nx * len * 0.5 - px * 0.9 - sway * 0.3, by + ny * len * 0.5 - py * 0.9, bx - px, by - py); ctx.closePath(); ctx.fill();
    }
    ctx.shadowColor = p.c; ctx.shadowBlur = rx * 0.25 * L.sc * f; ctx.strokeStyle = rgba(p.c2, 0.8); ctx.lineWidth = rx * 0.05;
    ctx.beginPath(); ctx.ellipse(0, cy, rx, ry, 0, 0, 2 * PI); ctx.stroke(); ctx.stroke();
  },
  /* ---------- 演出 ---------- */
  // 炎：下の端から燃え上がる舌を横に並べる。奥に長い赤い炎、手前に短い黄色い芯
  fire(ctx, L, p, R, bw, bh, f){
    const n = clamp(Math.round(p.n), 3, 60), base = bh / 2;
    const tongue = (x, wd, H, sway, c0, c1) => {
      const g = ctx.createLinearGradient(0, base, 0, base - H); g.addColorStop(0, rgba(c0, 1)); g.addColorStop(0.55, rgba(c1, 0.85)); g.addColorStop(1, rgba(c1, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - wd / 2, base);
      ctx.bezierCurveTo(x - wd / 2, base - H * 0.4, x - wd * 0.1 + sway, base - H * 0.7, x + sway, base - H);
      ctx.bezierCurveTo(x + wd * 0.2 + sway, base - H * 0.6, x + wd / 2, base - H * 0.35, x + wd / 2, base); ctx.closePath(); ctx.fill();
    };
    for(let pass = 0; pass < 2; pass++) for(let i = 0; i < n; i++){
      const x = -bw / 2 + (i + 0.5 + (R() - 0.5) * 0.6) / n * bw, wd = bw / n * (1.4 + R() * 0.8) * (pass ? 0.7 : 1);
      const H = bh * (0.45 + R() * 0.55) * clamp(p.h, 0.1, 2) * (pass ? 0.55 : 1), sway = (R() - 0.5) * wd * 0.8;
      tongue(x, wd, H, sway, pass ? '#ffffff' : p.c2, pass ? p.c2 : p.c);
    }
    const g = ctx.createLinearGradient(0, base, 0, base - bh * 0.25); g.addColorStop(0, rgba(p.c2, 0.6)); g.addColorStop(1, rgba(p.c, 0));
    ctx.fillStyle = g; ctx.fillRect(-bw / 2, base - bh * 0.25, bw, bh * 0.25);
  },
  // 煙：ふわっとした丸（中心が濃く外が透明）を、下から上へ広がるように重ねる
  smoke(ctx, L, p, R, bw, bh, f){
    for(let i = 0; i < clamp(Math.round(p.n), 1, 120); i++){
      const t = R(), y = bh / 2 - t * bh * 0.9, x = (R() - 0.5) * bw * (0.25 + t * 0.6), r = (50 + R() * 90) * p.size * (0.6 + t * 0.9), a = 0.1 + R() * 0.16;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(p.c, a)); g.addColorStop(0.6, rgba(p.c, a * 0.6)); g.addColorStop(1, rgba(p.c, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * PI); ctx.fill();
    }
  },
  // ヒビ割れ：中心から外へ折れ曲がりながら伸びる線と、それをつなぐ輪の線。黒い影を少しずらして描き、ガラスの割れ目らしくする
  crack(ctx, L, p, R, bw, bh, f){
    const n = clamp(Math.round(p.n), 3, 40), Rx = bw / 2 * 0.95, Ry = bh / 2 * 0.95, rays = [];
    for(let i = 0; i < n; i++){
      const a0 = (i + R() * 0.6) / n * 2 * PI, k = 0.6 + R() * 0.4, pts = [[0, 0]]; let a = a0;
      for(let s = 1; s <= 8; s++){ a += (R() - 0.5) * 0.35; const t = s / 8 * k; pts.push([Math.cos(a) * Rx * t, Math.sin(a) * Ry * t]); }
      rays.push(pts);
    }
    const segs = [];
    rays.forEach(pts => { for(let s = 1; s < pts.length; s++) segs.push([pts[s - 1], pts[s], (1 - s / pts.length) * 3 + 0.8]); });
    // 輪：ring の割合の半径あたりで、となりの線どうしを（ときどき途切れさせて）つなぐ
    for(const t of [0.25, 0.5, 0.8].map(v => Math.round(v * 8 * clamp(p.ring, 0.1, 1.2)))) if(t >= 1 && t <= 8)
      rays.forEach((pts, i) => { const q = rays[(i + 1) % n]; if(R() < 0.75 && pts[t] && q[t]) segs.push([pts[t], q[t], 1]); });
    ctx.lineCap = ctx.lineJoin = 'round';
    for(const [col, off] of [['rgba(0,0,0,.45)', 2], [p.c, 0]]){
      ctx.strokeStyle = col;
      for(const [a, b, w] of segs){ ctx.lineWidth = w * 1.6 * p.w; ctx.beginPath(); ctx.moveTo(a[0] + off, a[1] + off); ctx.lineTo(b[0] + off, b[1] + off); ctx.stroke(); }
    }
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.min(Rx, Ry) * 0.12); g.addColorStop(0, rgba(p.c, 0.9)); g.addColorStop(1, rgba(p.c, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, Math.min(Rx, Ry) * 0.12, 0, 2 * PI); ctx.fill();
  },
  // グリッチ：横長の色の帯と、小さな四角いノイズ。colorful ならシアン・マゼンタ・黄・白から選ぶ
  glitch(ctx, L, p, R, bw, bh, f){
    const pal = ['#38f6ff', '#ff2bd6', '#fff14a', '#ffffff', '#4a5cff'], n = clamp(Math.round(p.n), 1, 120), a = clamp(p.amt, 0, 1);
    for(let i = 0; i < n; i++){
      const y = (R() - 0.5) * bh, h = bh * (0.004 + R() * R() * 0.05), w = bw * (0.15 + R() * 0.85) * (0.4 + a * 0.6), x = (R() - 0.5) * bw - w / 2;
      ctx.fillStyle = rgba(p.colorful ? pal[Math.floor(R() * pal.length)] : p.c, 0.35 + R() * 0.55); ctx.fillRect(x, y, w, h);
    }
    for(let i = 0; i < n * 2; i++){ const s = (6 + R() * 22) * (0.5 + a), x = (R() - 0.5) * bw, y = (R() - 0.5) * bh;
      ctx.fillStyle = rgba(p.colorful ? pal[Math.floor(R() * pal.length)] : p.c, 0.3 + R() * 0.5); ctx.fillRect(x, y, s * (1 + R() * 3), s * 0.6); }
  },
  // 桜の花びら・葉っぱ・もみじ：ひらひら（横に縮めて裏返り）しながら散らばる
  petals(ctx, L, p, R, bw, bh, f){
    const pals = {sakura:['#ffc2d6', '#ffb0cb', '#ffd9e6', '#ff9ec0'], leaf:['#7bd66a', '#4fbf5a', '#a9e36b', '#3fa66a'], momiji:['#ff5a2e', '#ff8a2a', '#ffc23d', '#e8322a']};
    const shape = hasKey(pals, p.shape) ? p.shape : 'sakura', pal = pals[shape];
    for(let i = 0; i < clamp(Math.round(p.n), 1, 300); i++){
      const x = (R() - 0.5) * bw, y = (R() - 0.5) * bh, r = (22 + R() * 24) * p.size;
      ctx.save(); ctx.translate(x, y); ctx.rotate(R() * 2 * PI); ctx.scale(0.35 + Math.abs(Math.cos(R() * PI)) * 0.65, 1);
      ctx.fillStyle = p.colorful ? pal[Math.floor(R() * pal.length)] : p.c; ctx.beginPath(); petalShape(ctx, shape, r); ctx.fill();
      if(shape === 'leaf'){ ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = r * 0.08; ctx.beginPath(); ctx.moveTo(0, -r * 0.85); ctx.lineTo(0, r * 0.85); ctx.stroke(); }
      ctx.restore();
    }
  },
  // 泡（画面に散らばる丸い泡）・水しぶき（中心から上へ飛び散るしずく）
  bubbles(ctx, L, p, R, bw, bh, f){
    if(p.type === 'splash'){
      for(let i = 0; i < clamp(Math.round(p.n), 1, 200); i++){
        const a = -PI * (0.08 + R() * 0.84), d = Math.min(bw, bh) * (0.15 + R() * 0.8), x = Math.cos(a) * d * (bw / bh), y = bh * 0.35 + Math.sin(a) * d, s = (6 + R() * 18) * p.size * (1.2 - d / Math.min(bw, bh));
        ctx.save(); ctx.translate(x, y); ctx.rotate(a + PI / 2 + PI); ctx.fillStyle = p.c; ctx.beginPath(); scatterShape(ctx, 'drop', s); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(-s * 0.2, s * 0.25, s * 0.16, 0, 2 * PI); ctx.fill(); ctx.restore();
      }
      return;
    }
    for(let i = 0; i < clamp(Math.round(p.n), 1, 300); i++){
      const x = (R() - 0.5) * bw, y = (R() - 0.5) * bh, r = (10 + R() * R() * 60) * p.size;
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.8, rgba(p.c, 0.12)); g.addColorStop(1, rgba(p.c, 0.35));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * PI); ctx.fill();
      ctx.strokeStyle = rgba(p.c, 0.8); ctx.lineWidth = Math.max(1, r * 0.07); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = Math.max(1, r * 0.1); ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, y, r * 0.68, PI * 1.1, PI * 1.45); ctx.stroke();
    }
  },
  /* ---------- ゲーム・配信 ---------- */
  // 衝撃波：横に平たい輪（tilt＝縦の比率）を外ほど薄く・細く。中心の光と、外へ飛ぶ短い線
  shock(ctx, L, p, R, bw, bh, f){
    const n = clamp(Math.round(p.n), 1, 8), rx = bw / 2 * 0.95, k = clamp(p.tilt, 0.1, 1) * (bh / bw) / 0.62;
    ctx.save(); ctx.scale(1, k);
    let g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 0.35); g.addColorStop(0, rgba(p.c, 0.9)); g.addColorStop(1, rgba(p.c, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx * 0.35, 0, 2 * PI); ctx.fill();
    for(let i = 0; i < n; i++){ const t = (i + 1) / n, r = rx * (0.3 + 0.7 * t);
      ctx.strokeStyle = rgba(p.c, 1 - t * 0.7); ctx.lineWidth = (16 - 10 * t) * p.w / k; ctx.beginPath(); ctx.arc(0, 0, r, 0, 2 * PI); ctx.stroke(); }
    ctx.strokeStyle = rgba(p.c, 0.8); ctx.lineCap = 'round';
    for(let i = 0; i < 24; i++){ const a = R() * 2 * PI, r0 = rx * (0.5 + R() * 0.4), r1 = r0 + rx * (0.08 + R() * 0.12);
      ctx.lineWidth = (2 + R() * 3) * p.w / k; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke(); }
    ctx.restore();
  },
  // ヒット：中心の白い光と、細く鋭いトゲ（外側 c2 → 内側 c → 白い芯の3重）
  hit(ctx, L, p, R, bw, bh, f){
    const n = clamp(Math.round(p.n), 4, 40), RR = Math.min(bw, bh) / 2 * 0.95 * p.size, sp = [];
    for(let i = 0; i < n; i++) sp.push([(i + R() * 0.7) / n * 2 * PI, RR * (0.45 + R() * 0.55), 0.05 + R() * 0.06]);
    ctx.shadowColor = p.c2; ctx.shadowBlur = RR * 0.15 * L.sc * f;
    for(const [col, k] of [[p.c2, 1], [p.c, 0.72], ['#ffffff', 0.4]]){
      ctx.fillStyle = col; ctx.beginPath();
      for(const [a, l, w] of sp){ const c = Math.cos(a), s = Math.sin(a), ww = l * w * k;
        ctx.moveTo(-s * ww, c * ww); ctx.lineTo(c * l * k, s * l * k); ctx.lineTo(s * ww, -c * ww); ctx.closePath(); }
      ctx.fill(); ctx.beginPath(); ctx.arc(0, 0, RR * 0.2 * k, 0, 2 * PI); ctx.fill();
    }
  },
  // ピカピカ：ななめの光の帯（n 本。2本目からは細く）と、小さなキラッ
  shine(ctx, L, p, R, bw, bh, f){
    ctx.save(); ctx.beginPath(); ctx.rect(-bw / 2, -bh / 2, bw, bh); ctx.clip();
    ctx.rotate((p.angle || 0) * PI / 180);
    const D = Math.hypot(bw, bh);
    for(let i = 0; i < clamp(Math.round(p.n), 1, 6); i++){
      const w = bw * 0.14 * p.w * (i ? 0.45 : 1), x = -bw * 0.12 + i * bw * 0.16, g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      g.addColorStop(0, rgba(p.c, 0)); g.addColorStop(0.5, rgba(p.c, 0.9)); g.addColorStop(1, rgba(p.c, 0)); ctx.fillStyle = g; ctx.fillRect(x - w / 2, -D / 2, w, D);
    }
    ctx.restore();
    ctx.fillStyle = p.c; ctx.shadowColor = p.c; ctx.shadowBlur = 12 * L.sc * f;
    for(let i = 0; i < 3; i++){ const x = (R() - 0.5) * bw * 0.85, y = (R() - 0.5) * bh * 0.85, r = 16 + R() * 22, k = r * 0.16;
      ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + k, y - k, x + r, y); ctx.quadraticCurveTo(x + k, y + k, x, y + r);
      ctx.quadraticCurveTo(x - k, y + k, x - r, y); ctx.quadraticCurveTo(x - k, y - k, x, y - r); ctx.fill(); }
  },
};
function drawFx(ctx, L, f){
  const p = L.p, [bw, bh] = FX_BOX(L);
  // 選択枠・グループの範囲計算のため、描画のたびに大きさを登録する
  dims.set(L.id, {w:bw * L.sc, h:bh * L.sc});
  ctx.save(); ctx.globalAlpha = L.op ?? 1; ctx.globalCompositeOperation = L.blend || 'source-over';
  ctx.translate(L.x * f, L.y * f); ctx.rotate((L.rot || 0) * PI / 180); ctx.scale(L.sc * f, L.sc * f);
  // 乱数は種類ごとに seed 固定（R() を呼ぶ順番・回数は FX_DRAW の各関数の中で決まる）
  const R = rng(p.seed || 1);
  if(hasKey(FX_DRAW, L.kind)) FX_DRAW[L.kind](ctx, L, p, R, bw, bh, f);
  ctx.restore();
}
// ！？マークで選べる文字（[値, 表示]）。描くのはこの中の文字だけ（保存データの細工で長い文字列を描かせないため）
const FX_MARKS = [['!?', '！？'], ['!', '！'], ['?', '？'], ['!!', '！！'], ['?!', '？！'], ['…', '…'], ['♪', '♪']];
// 花びら・葉っぱ・もみじの輪郭パス（beginPath／fill は呼び出し側）。原点中心、r が大きさ
function petalShape(c, shape, r){
  if(shape === 'leaf'){ c.moveTo(0, -r); c.quadraticCurveTo(r * 0.7, 0, 0, r); c.quadraticCurveTo(-r * 0.7, 0, 0, -r); c.closePath(); }
  else if(shape === 'momiji'){ for(let i = 0; i < 14; i++){ const a = i / 14 * 2 * PI - PI / 2, k = i % 2 ? r * 0.42 : r * (i === 0 ? 1 : 0.88); i ? c.lineTo(Math.cos(a) * k, Math.sin(a) * k) : c.moveTo(Math.cos(a) * k, Math.sin(a) * k); } c.closePath(); c.rect(-r * 0.05, 0, r * 0.1, r * 1.1); }
  else { c.moveTo(-r * 0.18, -r); c.lineTo(0, -r * 0.78); c.lineTo(r * 0.18, -r); c.bezierCurveTo(r * 0.8, -r * 0.75, r * 0.55, r * 0.55, 0, r); c.bezierCurveTo(-r * 0.55, r * 0.55, -r * 0.8, -r * 0.75, -r * 0.18, -r); c.closePath(); }
}
// ハート・星などの輪郭パスだけを作る（beginPath／fill は呼び出し側）。原点中心、r が大きさ。未知の shape はハートになる
function scatterShape(c, shape, r){
  if(shape === 'star'){ for(let i = 0; i < 10; i++){ const a = i / 10 * 2 * PI - PI / 2, k = i % 2 ? r * 0.45 : r; i ? c.lineTo(Math.cos(a) * k, Math.sin(a) * k) : c.moveTo(Math.cos(a) * k, Math.sin(a) * k); } c.closePath(); }
  else if(shape === 'note'){ c.ellipse(-r * 0.25, r * 0.55, r * 0.38, r * 0.28, -0.4, 0, 7); c.rect(r * 0.04, -r * 0.8, r * 0.14, r * 1.4); c.moveTo(r * 0.18, -r * 0.8); c.quadraticCurveTo(r * 0.75, -r * 0.5, r * 0.55, -r * 0.05); c.quadraticCurveTo(r * 0.6, -r * 0.45, r * 0.18, -r * 0.5); }
  else if(shape === 'drop'){ c.moveTo(0, -r); c.bezierCurveTo(r * 0.6, -r * 0.2, r * 0.75, r * 0.2, r * 0.6, r * 0.5); c.arc(0, r * 0.4, r * 0.6, 0.15, PI - 0.15); c.bezierCurveTo(-r * 0.75, r * 0.2, -r * 0.6, -r * 0.2, 0, -r); }
  else { c.moveTo(0, r * 0.85); c.bezierCurveTo(-r * 1.2, 0, -r * 0.7, -r * 1, 0, -r * 0.4); c.bezierCurveTo(r * 0.7, -r * 1, r * 1.2, 0, 0, r * 0.85); }
}
