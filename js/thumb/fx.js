/* 楽ちんサムネメーカー：動的エフェクト（集中線・光・キラキラ・爆発）とワンクリック背景エフェクト
   主な公開関数：mkFx（fx レイヤー生成）／addFx（レイヤー追加）／applyBgFx（ワンクリック背景エフェクト）。描画（drawFx）は fx-draw.js
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
// 描画（drawFx・FX_DRAW・形のパス）は fx-draw.js
