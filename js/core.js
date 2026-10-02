/* 楽ちんサムネメーカー：ユーティリティ・アイコン */
/*
  最初に読み込まれる土台のファイル。ほかのファイルはすべてここの定義に依存する（逆向きの依存はない）。
  主な中身：
    ・$ / clone / uid（レイヤー・素材のid）/ LS（localStorage の安全な読み書き）/ toast / downloadBlob などの小道具
    ・ICONS と ic()（SVG アイコン）
    ・DEFAULT / merged() / S … 「文字素材モード」の文字スタイルの初期値と、今の編集中の値（グローバル S）
    ・DOC … サムネモードの作品データ。ここでは宣言だけで、中身は thumb/doc.js の loadSavedDoc() が入れる
    ・hex2rgb / rgba / rng / mk など描画エンジン共通の小道具（text-render.js・thumb/*.js から使う）
  素の <script> の読み込みなので、ここで const/let/function にしたものはそのまま全ファイルのグローバルになる。
*/
/* ============ 基本 ============ */
const $ = s => document.querySelector(s);
const clone = o => JSON.parse(JSON.stringify(o));
// レイヤー・素材のid。時刻＋乱数なので、プロジェクトの読み込みや複製で衝突しにくい
const uid = () => 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
// localStorage の薄いラッパー。値は JSON で保存し、読み出し失敗（プライベートモード・壊れたデータ）は既定値 d を返す。
// 保存の失敗（容量オーバー・禁止設定）は握りつぶさず、利用者に知らせて false を返す。キーは ttm_ で始まる
const LS = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch{ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ saveWarn('自動保存できませんでした。ブラウザの保存容量がいっぱいか、保存が禁止されています。作業を残すには、「プロジェクト」から書き出してください'); return false; } }
};
// 保存の失敗を知らせる（続けて何度も出ないよう、30秒に1回まで）
let saveWarnAt = 0;
function saveWarn(msg){ const t = Date.now(); if(t - saveWarnAt < 30000) return; saveWarnAt = t; try{ toast(msg, true); }catch{} console.warn(msg); }
// 文字入力中かどうか。キーボードショートカットが入力操作を横取りしないための判定
const isTyping = e => { const t = e.target; return t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.isContentEditable; };
// サムネのレイヤーに共通の初期値（キャンバスの中央）。座標はキャンバス（DOC.w×DOC.h）の px で、原点は左上・x,y はレイヤー中心。
// DOC は後から宣言される let なので、起動前に呼ばれても落ちないよう typeof で守り、未確定なら 1920×1080 とみなす
const LAYER_BASE = () => ({x:Math.round(((typeof DOC === 'object' && DOC) ? DOC.w : 1920) / 2), y:Math.round(((typeof DOC === 'object' && DOC) ? DOC.h : 1080) / 2), sc:1, rot:0, op:1, hidden:false, locked:false, blend:'source-over'});
// 小数第3位までに丸める（保存データを読みやすく小さく保つ）
const r3 = v => Math.round(v * 1000) / 1000;
// 日時入りのファイル名用（例：20260929-213000）
const stamp = (d = new Date()) => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
// ファイルとしてダウンロードさせる。URL の解放は、ブラウザが保存を始める前に消えないよう少し遅らせる
function downloadBlob(blob, name){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }
// キャンバス上に出す案内の帯（編集モード中など）。W は描画先キャンバスの幅（実ピクセル）、dpr を掛けて表示サイズを画面の大きさに揃える
function drawBanner(ctx, W, dpr, msg){
  ctx.save(); ctx.font = `800 ${12 * dpr}px "M PLUS Rounded 1c", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const tw = ctx.measureText(msg).width + 24 * dpr; ctx.fillStyle = 'rgba(31,27,45,.88)'; ctx.beginPath(); ctx.roundRect(W / 2 - tw / 2, 8 * dpr, tw, 26 * dpr, 13 * dpr); ctx.fill();
  ctx.fillStyle = '#ffb800'; ctx.fillText(msg, W / 2, 14 * dpr); ctx.restore();
}
// 画面下の通知。err のときは読む時間を長めにする（6秒／通常 2.6秒）。連続して呼ばれたら前のタイマーを取り消して出し直す
function toast(msg, err){
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.className = 'toast', err ? 6000 : 2600);
}

/* ============ アイコン ============ */
// 24×24 の viewBox に収めた線画の中身（path など）だけを持つ。線の色・太さは CSS の .ic が決め、currentColor で文字色に追従する
const ICONS = {
  grid:'<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M12 4.5v15M3.5 12h8.5"/>',
  crop:'<path d="M7 3v14h14"/><path d="M3 7h14v14"/>',
  group:'<rect x="3.5" y="3.5" width="10" height="10" rx="2"/><rect x="10.5" y="10.5" width="10" height="10" rx="2"/>',
  ungroup:'<rect x="3.5" y="3.5" width="8" height="8" rx="2"/><rect x="12.5" y="12.5" width="8" height="8" rx="2"/><path d="M15 8.5h5M8.5 15v5"/>',
  fliph:'<path d="M12 3v18"/><path d="M9 7 4 12l5 5z"/><path d="m15 7 5 5-5 5"/>',
  flipv:'<path d="M3 12h18"/><path d="M7 9l5-5 5 5z"/><path d="m7 15 5 5 5-5"/>',
  dice:'<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><circle cx="8.6" cy="8.6" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.4" cy="15.4" r="1.2" fill="currentColor" stroke="none"/>',
  drop:'<path d="m14 7 3 3"/><path d="M16.4 4.2a2.2 2.2 0 0 1 3.2 3.2L17.5 9.5l-3-3z"/><path d="M14.5 6.5 6 15l-1 4 4-1 8.5-8.5"/>',
  image:'<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.7"/><path d="m20.5 15.5-4.8-4.8L6 19.5"/>',
  contrast:'<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/>',
  undo:'<path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5H15a4.5 4.5 0 0 1 0 9h-3"/>',
  redo:'<path d="m15 14 4.5-4.5L15 5"/><path d="M19.5 9.5H9a4.5 4.5 0 0 0 0 9h3"/>',
  phone:'<rect x="7" y="3" width="10" height="18" rx="2.6"/><path d="M11 17.5h2"/>',
  star:'<path d="m12 3.8 2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.8l-5.1 2.7 1-5.7-4.1-4 5.7-.8z"/>',
  download:'<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 19.5h14"/>',
  copy:'<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  dup:'<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/><path d="M14 12v4M12 14h4"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  reset:'<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>',
  text:'<path d="M5 6.5V5h14v1.5"/><path d="M12 5v14"/><path d="M9 19h6"/>',
  save:'<path d="M5 4.5h11l3.5 3.5V19a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5z"/><path d="M8 4.5v5h7v-5"/><path d="M8 19.5v-5h8v5"/>',
  newdoc:'<path d="M6.5 3.5h7L18.5 8.5V19a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M13.5 3.5v5h5M12 11.5v6M9 14.5h6"/>',
  folder:'<path d="M3.5 7A2.5 2.5 0 0 1 6 4.5h3.5l2 2.5H18A2.5 2.5 0 0 1 20.5 9.5V17a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 17z"/>',
  monitor:'<rect x="3.5" y="4.5" width="17" height="11.5" rx="2"/><path d="M9 20h6M12 16v4"/>',
  up:'<path d="M12 19V5"/><path d="m6.5 10.5 5.5-5.5 5.5 5.5"/>',
  down:'<path d="M12 5v14"/><path d="m6.5 13.5 5.5 5.5 5.5-5.5"/>',
  eye:'<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeoff:'<path d="M4 4l16 16"/><path d="M9.9 5.8A9.9 9.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4M6.3 7.3A15.6 15.6 0 0 0 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 4.1-1"/>',
  trash:'<path d="M4.5 7h15"/><path d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"/><path d="M6.5 7l1 12a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-12"/>',
  grip:'<circle cx="9" cy="6.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="17.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="17.5" r="1.3" fill="currentColor" stroke="none"/>',
  lock:'<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  unlock:'<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 7.6-1.7"/>',
  more:'<circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  front:'<path d="M12 20V9"/><path d="m7.5 13.5 4.5-4.5 4.5 4.5"/><path d="M5 4.5h14"/>',
  back:'<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 19.5h14"/>',
  pen:'<path d="M4.5 19.5l1-4L15.8 5.2a2 2 0 0 1 2.9 0l.1.1a2 2 0 0 1 0 2.9L8.5 18.5z"/><path d="M13.5 7.5l3 3"/>',
  layers:'<path d="m12 4 8.5 4.5L12 13 3.5 8.5z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5"/><path d="m3.5 16.5 8.5 4.5 8.5-4.5"/>',
  sparkle:'<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  sliders:'<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  close:'<path d="M6 6l12 12M18 6 6 18"/>',
  share:'<path d="M12 15V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M5 12.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5.5"/>',
  help:'<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/>',
  burst:'<path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5M5.3 5.3l3.5 3.5M15.2 15.2l3.5 3.5M5.3 18.7l3.5-3.5M15.2 8.8l3.5-3.5"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  rays:'<path d="M12 12 4 3.5h5zM12 12l8.5-8.5v5zM12 12l8 8.5h-5zM12 12l-8.5 8.5v-5z"/>',
  speed:'<path d="M3 7h12M6 12h15M3 17h10"/>',
  gaan:'<path d="M5 3v9M9.5 3v13M14.5 3v8M19 3v12"/>',
  confetti:'<path d="M5 5l3 1-1 3zM15 4h3v3h-3zM10 12l3 2-2 2zM17 13l3 1-1 3zM5 16h3v3H5z"/>',
  snow:'<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/>',
  bolt:'<path d="M13.5 2.5 5.5 13.5h6l-1.5 8 8-11h-6z"/>',
  bokeh:'<circle cx="8" cy="9" r="4.5"/><circle cx="16.5" cy="15" r="3.5"/><circle cx="17" cy="6" r="1.8"/>',
  heart:'<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  boom:'<path d="M12 2.8l1.9 4.6 4.4-2.4-1.3 4.8 4.9.9-4 3 3 3.9-4.9-.2.3 5-3.9-3-2.9 4.1-1-4.9-4.6 1.8 2-4.5-4.6-1.8 4.7-1.5L4.8 5.5l4.5 2.1z"/>',
  fxadd:'<path d="M11 3.5l1.6 4.3 4.3 1.6-4.3 1.6L11 15.3l-1.6-4.3-4.3-1.6 4.3-1.6z"/><path d="M18.5 14v6M15.5 17h6"/>',
  palette:'<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.4-1.3-1.7-1.3-3 0-.9.8-1.6 1.7-1.6h2.3a4 4 0 0 0 4-4c0-3.7-3.8-6.7-8.5-6.7z"/><circle cx="7.8" cy="11" r="1.1" fill="currentColor" stroke="none"/><circle cx="10.5" cy="7.4" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="7.8" r="1.1" fill="currentColor" stroke="none"/>',
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
// HTML に書いた <i data-ic="名前"> をアイコンの SVG に置き換える
const paintIcons = (root = document) => root.querySelectorAll('[data-ic]').forEach(el => { el.outerHTML = ic(el.dataset.ic); });
// スライダーの「つまみより左」を塗るため、CSS 変数 --p に進み具合（%）を渡す。値が変わるたびに呼ぶ必要がある（下の input リスナーと bind.js の sync）
function paintRange(el){ const mn = +el.min || 0, mx = +el.max || 100; el.style.setProperty('--p', clamp01((el.value - mn) / (mx - mn)) * 100 + '%'); }
function clamp01(v){ return Math.max(0, Math.min(1, v || 0)); }
document.addEventListener('input', e => { if(e.target.type === 'range') paintRange(e.target); });
// サムネモードの作品データ。null の間は「まだ読み込み前」。loadSavedDoc()（thumb/doc.js）が boot() の最初で埋める
/** @type {Doc | null} */
let DOC = null;

// 文字スタイルの完全な初期値。保存データ・プリセットはここからの差分だけを持ち、merged() で補う。
// 各キーの意味は text-render.js の描画処理を参照。新しい効果を足すときは、ここに on:false の既定値を置くのが約束
// （これがないと古い保存データ・プリセットで undefined になる）。単位：size/pad は px、角度は度、a は不透明度 0〜1
const DEFAULT = {
  text: '楽々サムネメーカー',
  font: 'Dela Gothic One', fontLatin: '', weight: 400, size: 160, ls: 0, lh: 1.15, align: 'center', vertical: false, vlat: 'up', vtcy: true,
  fillType: 'grad', fill1: '#ffffff', fill2: '#ffe14d', fill3on: false, fill3: '#ffffff', gradAngle: 90, gradScope: 'block',
  metal: 'gold', splitDir: 'h', splitPos: 0.55, fillMode: 'normal',
  accent1: '#ff3b3b', accent2: '#ffb000',
  sblur:0, sglow:{on:false, c:'#ffe600', blur:20, a:0.9, str:1},
  strokes: [ {on:true, w:9, c:'#141414'}, {on:true, w:11, c:'#ff2d55'}, {on:false, w:7, c:'#ffffff'} ],
  bevel:   {on:false, style:'emboss', target:'fill', size:8, depth:1, angle:225, hl:0.8, sh:0.5},
  gloss:   {on:false, a:0.45, h:0.45, curve:0.4},
  pattern: {on:false, type:'stripe', c:'#ffffff', a:0.2, size:12, angle:45},
  marker:  {on:false, c:'#fff200', a:0.9, h:0.38, pos:0.78, over:0.2},
  extrude: {on:true, depth:12, angle:60, c:'#6a0018', shade:0.45, fade:0, stripe:false, c2:'#ffffff', stripeW:3},
  shadow:  {on:true, x:6, y:10, blur:14, c:'#000000', a:0.55},
  glow:    {on:false, blur:30, c:'#00e5ff', a:0.9, str:2, dual:false, c2:'#ff2bd6'},
  warp:    {type:'none', amt:0.3, freq:1},
  jitter:  {on:false, rot:8, y:10, scale:0.08, seed:1},
  grunge:  {on:false, amt:0.4, size:3, seed:1},
  glitch:  {on:false, rgb:6, slices:6, shift:30, seed:1},
  inner:   {on:false, x:3, y:5, blur:6, c:'#000000', a:0.55},
  plate:   {on:false, shape:'round', c:'#ffffff', a:1, sc:'#111111', sw:6, pad:0.22, tail:'left', ts:1, seed:3},
  box:     {on:false, shape:'square', c:'#e8132b', rand:false, seq:false, seed:0, pn:7, pal:['#e8132b', '#111111', '#1f5fd6', '#0f9d58', '#7b2cbf', '#ff6a00', '#c2185b', '#ffd500'], alt:true, c2:'#111111', pad:0.06, sc:'#ffffff', sw:0},
  dots:    {on:false, shape:'dot', c:'#e8132b', size:0.14},
  offset:  {on:false, x:12, y:12, c:'#00c8ff', hollow:false, w:4},
  reflect: {on:false, a:0.35, gap:4, len:0.55},
  fire:    {on:false, height:1.0, wild:0.6, c1:'#fff3a0', c2:'#ff9a1f', c3:'#d7261e', seed:1},
  drip:    {on:false, style:'round', amt:0.35, len:0.6, w:0.12, sample:true, c:'#7cff4f', seed:1},
  sparkle: {on:false, count:14, size:0.22, c:'#ffffff', glow:true, seed:1},
  bulbs:   {on:false, gap:0.16, size:0.035, c:'#ffe27a', glow:0.9},
  distort: {on:false, amt:8, scale:40, seed:1},
  trail:   {on:false, angle:180, len:0.8, count:8, a:0.5, tint:false, c:'#ffffff'},
  skew: 6, rotate: 0, pad: 16, scale: 2
};
// DEFAULT に p を重ねた新しいスタイルを返す（p も DEFAULT も書き換えない）。
// オブジェクト値（shadow など）は 1 階層だけキーごとに上書きするので、p が一部のキーしか持たなくても残りは既定値になる。配列（strokes・pal）は丸ごと置き換え
function merged(p){
  const o = clone(DEFAULT);
  for(const k in p){
    const v = clone(p[k]);
    o[k] = (v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) ? Object.assign(o[k], v) : v;
  }
  return o;
}
// いま編集中の文字スタイル（グローバル）。applyPreset などで代入し直されるため、S を別変数に保持し続けないこと。
// 自動保存は preview.js の schedule() → saveDoc()（thumb/doc.js）が ttm_state に書く
/** @type {TextStyle} */
let S = merged(LS.get('ttm_state', {}));
/* ============ 配色 ============ */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/* ============ 描画エンジン ============ */
const PI = Math.PI;
// 作業用キャンバスを作る。幅・高さは四捨五入し、0 以下だと描画系が例外を出すので最低 1px にする
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const hex2rgb = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); };
const rgba = (h, a) => { const [r, g, b] = hex2rgb(h); return `rgba(${r},${g},${b},${a})`; };
// 種つきの乱数（mulberry32 系）。同じ seed なら毎回同じ並びになる。
// 「別パターンにする」で seed を変えるだけで見た目が変わり、再描画しても・保存して開き直しても形が動かないようにするため Math.random は使わない。
// seed=0 でも状態が 0 にならないよう || 1 で避けている
function rng(seed){
  let a = (Math.imul(seed | 0, 2654435761) >>> 0) || 1;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// innerHTML に利用者入力（フォント名など）を入れるときに通す。属性値にも使うので " も変換する（' は変換しない：属性は必ず "" で囲むこと）
// 色の文字列を、HTML 属性（style="…"）に入れても安全なものだけ通す（#rgb／#rrggbb(aa)／rgb()／hsl()）。細工されたプロジェクトファイルが属性を壊して
// スクリプトを差し込むのを防ぐ。合わなければ既定色 d を返す
const safeColor = (c, d = '#ffffff') => typeof c === 'string' && (/^#[0-9a-fA-F]{3,8}$/.test(c) || /^(rgb|hsl)a?\([\d\s.,%/-]+\)$/.test(c)) ? c : d;
// 読み込んだデータの id（レイヤー・画像）として使ってよい文字列か。HTML 属性や querySelector に入るので、英数字・_・- だけ許す
const okId = s => typeof s === 'string' && /^[\w-]{1,64}$/.test(s) && !/^(__proto__|constructor|prototype)$/.test(s);   // ASSETS[id] のようにオブジェクトのキーにもなるので、特別な名前も除く
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
