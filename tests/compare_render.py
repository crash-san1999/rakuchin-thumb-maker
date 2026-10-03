"""描画の厳密比較：指定したコミット（既定は直前のコミット）と今の作業中のファイルで、描画結果がピクセル単位で一致するか調べる
   python3 tests/compare_render.py [比べるコミット] [--suite=fx,frames]
   ・fx     … 動的エフェクト全種類 × 乱数の種・パラメータ・拡大率・回転・不透明度などの組み合わせ
   ・frames … 切り抜きフレームの全形状 × 全デザイン（枠の色・太さ・縦横比・乱数の種の違いも）
   ・text   … 文字の装飾：文字パネルの定義から作る全装飾 × 全選択肢・スライダーの最小／最大、全装飾の重ね合わせ、プリセットの縦書き
   ・normalize … 保存データの読み込み（normalizeDoc）：古い形式・壊れた値・細工された値の入力に対する出力の JSON
   ・layers … レイヤーパネルの HTML（種類・選択・複数選択・非表示・ロック・グループ・背景などの状態ごと。1 文字の違いも検出）
   ・fontlist … フォント一覧（renderFontList）の HTML・件数表示・見本の遅延読み込みの対象（検索語 × 分類 × 用途 × 選択中・英数字用・お気に入り・本文の状態ごと）
   ・collage … 分割フレームの全レイアウト × 分割数・境界・効果・背景色と文字・1週間の自動入力・位置→マスの判定・アイコン
   compare.py と違い、1 ピクセルの違いも許さない（同じブラウザで描くので、描画内容が同じなら結果も完全に同じになる）。
   「描き方を整理しただけで、見た目は変えない」リファクタリングの確認に使う。違いがあれば、その組み合わせの名前を表示する"""
import asyncio, base64, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from helpers import ROOT, IMG, open_app, close
from playwright.async_api import async_playwright

# 画素データのハッシュ（FNV-1a 32bit を 2 系統）。同じ絵なら同じ値になる
HASH = """const H = c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let a = 2166136261, b = 5381;
  for(let i = 0; i < d.length; i++){ a = Math.imul(a ^ d[i], 16777619); b = (Math.imul(b, 33) + d[i]) | 0; }
  return c.width + 'x' + c.height + ':' + (a >>> 0).toString(16) + (b >>> 0).toString(16); };"""

FX = HASH + """
const out = [], variants = {
  lines: [{}, {full:false, reach:1.5, fade:0.3}, {full:false, reach:2.2, fade:0}, {n:40, w:2, len:0.3, inner:0.3}],
  light: [{}, {amt:0.4, r:0.8}],
  sparkle: [{}, {glow:false, n:30, size:1.6}],
  burst: [{}, {sw:0, spikes:9, depth:0.6}],
  rays: [{}, {fade:0, n:7, r:1.4}],
  speed: [{}, {n:80, len:1.8, w:2}],
  gaan: [{}, {len:1, n:20, w:2}],
  confetti: [{}, {colorful:false, size:1.7}],
  snow: [{}, {type:'rain'}, {type:'rain', size:2, n:60}],
  bolt: [{}, {branch:1, w:2}, {branch:0}],
  bokeh: [{}, {colorful:true, size:0.6}],
  scatter: [{}, {shape:'star', colorful:true}, {shape:'note'}, {shape:'drop', size:1.5}],
};
const layer = [{}, {sc:0.6, rot:30}, {op:0.5, blend:'screen'}, {sc:1.4, rot:-120, x:300, y:900}];
for(const kind of Object.keys(FX_DEF)) for(const [vi, v] of (variants[kind] || [{}]).entries()) for(const seed of [1, 2, 9]) for(const [li, ex] of layer.entries()) for(const f of [0.5, 1]){
  if(li && seed !== 1) continue;   // 組み合わせが多くなりすぎないよう、レイヤー側の違いは seed 1 だけで見る
  const L = Object.assign(mkFx(kind, Object.assign({seed}, v), ex), {id:'cmp'});
  const c = mk(Math.round(DOC.w * f), Math.round(DOC.h * f)), x = c.getContext('2d');
  dims.delete('cmp'); drawFx(x, L, f);
  out.push([`${kind} v${vi} seed${seed} layer${li} f${f}`, H(c) + ' dims=' + JSON.stringify(dims.get('cmp'))]);
}
return out;"""

# 切り抜きフレーム：画像レイヤーに形・デザインを付けて framedCanvas で描く（テスト用の画像を、決まった id の素材として登録して使う）
FRAMES = HASH + """
const out = [], shapes = FRAME_SHAPES.map(s => s[0]), styles = FRAME_STYLES.map(s => s[0]);
const draw = (name, fr, ol = {}, ex = {}, f = 0.5) => {
  const L = Object.assign(LAYER_BASE(), IMAGE_BASE(), {id:'cmpF', type:'image', asset:'Acmp'}, ex);
  L.frame = Object.assign(FRAME_BASE(), fr); L.outline = Object.assign(L.outline, {w:12, c:'#33ccff'}, ol);
  let e; try{ e = framedCanvas(L, f, false, new Map()); }catch(err){ out.push([name, 'ERROR ' + err.message]); return; }
  out.push([name, H(e.c) + ' k=' + e.k]); };
for(const sh of shapes) for(const st of ['solid', 'none', 'double']) draw(`shape ${sh} / ${st}`, {shape:sh, style:st});
for(const st of styles) for(const sh of ['rect', 'circle', 'heart', 'swipe', 'star']) draw(`style ${st} / ${sh}`, {shape:sh, style:st});
for(const st of styles) draw(`style ${st} / 細いフチ・別の色`, {shape:'rect', style:st, c2:'#ff0066'}, {w:3, c:'#ffcc00'}, {}, 1);
for(const st of styles) draw(`style ${st} / 反転・明るさ`, {shape:'hex', style:st}, {w:20}, {flip:true, flipV:true, bright:0.3, sat:-0.4});
for(const sh of FRAME_SEEDED) for(const seed of [1, 4, 17]) draw(`seed ${sh} ${seed}`, {shape:sh, style:'solid', seed});
for(const sh of ['rect', 'star', 'bubble', 'arch']) for(const ar of ['auto', '1', '1.778', '0.75']) for(const r of [0, 0.3, 0.5])
  draw(`geom ${sh} ar${ar} r${r}`, {shape:sh, style:'pop', ar, r, fs:0.7, cx:0.4, cy:0.6, c2:'#ff0066'}, {}, {}, 1);
draw('未知の形', {shape:'unknown-shape', style:'solid'}); draw('未知のデザイン', {shape:'rect', style:'unknown-style'});
return out;"""

# 分割フレーム：素材 Acmp・Acmp2 をマスに入れて drawCollage で描く。あわせて、位置→マスの判定・1週間の文字・レイアウトのアイコンも比べる
COLLAGE = HASH + """
const out = [];
const mkC = (o = {}) => { const L = Object.assign(COLLAGE_BASE(), {id:'cmpC'}, o);
  L.cells.forEach((c, i) => { c.asset = i % 3 === 2 ? null : (i % 2 ? 'Acmp2' : 'Acmp'); c.zoom = 1 + (i % 3) * 0.2; c.ox = (i % 2) * 0.15; c.oy = -(i % 3) * 0.1; /* ox・oy はマスの幅・高さに対する割合（-1〜1） */ c.rot = i * 7; c.flip = i === 1; });
  return L; };
const draw = (name, L, f = 0.4, live = false) => { const c = mk(Math.round(DOC.w * f), Math.round(DOC.h * f)), x = c.getContext('2d');
  try{ drawCollage(x, L, f, live, new Map()); }catch(e){ out.push([name, 'ERROR ' + e.message]); return; } out.push([name, H(c)]); };
// 全レイアウト × 分割数（使える組み合わせだけ）
for(const [lay, , ok] of COLLAGE_LAYOUTS) for(let n = 2; n <= 8; n++) if(ok(n)) draw(`layout ${lay} n${n}`, mkC({layout:lay, n}));
// 境界の形・線の種類・傾き・大きい側の大きさ
for(const [edge] of COLLAGE_EDGES) for(const [bs] of COLLAGE_BSTYLES) draw(`edge ${edge} / ${bs}`, mkC({layout:'cols', n:3, edge, bstyle:bs, amp:30, lw:14, lc:'#ffcc00'}));
for(const slant of [-20, 12]) for(const lay of ['cols', 'rows', 'grid', 'radial']) draw(`slant ${slant} ${lay}`, mkC({layout:lay, n:lay === 'grid' ? 4 : 3, slant, main:0.65}));
for(const lay of ['bigL', 'bigT']) for(const main of [0.4, 0.7]) draw(`main ${lay} ${main}`, mkC({layout:lay, n:5, main}));
// 外枠・角丸・影・不透明度・回転・拡大
draw('outer radius shadow', mkC({layout:'grid', n:4, outer:true, radius:40, shadow:{on:true, blur:20, y:14, a:0.6}}));
draw('op rot sc', mkC({layout:'cols', n:2, op:0.6, rot:15, sc:0.8, blend:'multiply'}));
// 効果：全部のマス／マスごと、ワンクリック効果
for(const name of Object.keys(CELL_FX_PRESETS)) draw(`fx all ${name}`, mkC({layout:'cols', n:3, fx:mergeCellFx(JSON.parse(JSON.stringify(CELL_FX_PRESETS[name])))}));
{ const L = mkC({layout:'grid', n:4, fxMode:'cell'}); const names = Object.keys(CELL_FX_PRESETS); L.cells.forEach((c, i) => c.fx = mergeCellFx(JSON.parse(JSON.stringify(CELL_FX_PRESETS[names[i % names.length]])))); draw('fx per cell', L); }
// 背景色・文字（画像あり／なし、位置、グラデ）
{ const L = mkC({layout:'cols', n:4}); L.cells.forEach((c, i) => { c.bg = {on:true, c:'#ffeeaa', c2:'#aaccff', grad:i % 2 === 0}; c.tx = {on:true, text:'マス' + i + (i === 2 ? '\\n2行目' : ''), pos:['c', 't', 'b', 'c'][i], sc:1 + i * 0.1, ox:i * 3, oy:-i * 2}; }); draw('bg text', L); collageSetStyle(L, 'ネオン'); draw('bg text style', L); }
// 1週間の自動入力（月始まり・日始まり、7・8分割、表記の違い）
for(const [first, n, show, fmt, paren, layout] of [['mon', 7, 'both', 'ja1', 'half', 'side'], ['sun', 8, 'date', 'ja2', 'full', 'below'], ['mon', 7, 'dow', 'en', 'none', 'side'], ['mon', 8, 'both', 'ja1', 'full', 'below']]){
  const L = mkC({layout:n === 7 ? 'wk43' : 'wk53', n, wk:{start:'2026-12-30', first, show, fmt, paren, layout, color:true}}); collageFillWeek(L);
  out.push([`week ${first} ${n} ${show} ${fmt} ${paren} ${layout} texts`, JSON.stringify(L.cells.map(c => [c.tx.text, c.tx.pos, c.bg.on && c.bg.c]))]);
  draw(`week ${first} ${n} ${show} ${fmt} ${paren} ${layout}`, L); }
// 空のマスの「画像をドロップ」表示（書き出し中は描かない）、操作中（live）
{ const L = mkC({layout:'cols', n:3}); L.cells.forEach(c => c.asset = null); draw('empty', L); exporting = true; draw('empty exporting', L); exporting = false; draw('live', mkC({layout:'grid', n:6}), 0.4, true); }
// 位置 → マス、マスの大きさ
{ const L = mkC({layout:'radial', n:5, slant:10, x:900, y:500, sc:0.7, rot:20}); const r = [];
  for(let y = 100; y < 1000; y += 150) for(let x = 100; x < 1800; x += 200) r.push(collageCellAt(L, x, y));
  out.push(['cellAt', JSON.stringify(r)]); out.push(['cellSize', JSON.stringify([0, 1, 2, 3, 4].map(i => collageCellSize(L, i)))]); }
// レイアウト選択用のアイコン
for(const [lay, , ok] of COLLAGE_LAYOUTS) for(let n = 2; n <= 8; n++) if(ok(n)) out.push([`icon ${lay} ${n}`, collageIcon(lay, n).length + ':' + collageIcon(lay, n).slice(-40)]);
return out;"""

# 文字の装飾：文字パネルの定義（SECTIONS・TEXT_ROWS）から、全装飾 × 全選択肢・スライダーの最小／最大・色・乱数のケースを自動で作り、render で描く
TEXT = HASH + """
const out = [], T = 'テスト{強調}ABC\\n2行目!!20ー（括弧）';
const setP = (o, path, v) => { const ks = path.split('.'); let x = o; for(let i = 0; i < ks.length - 1; i++){ if(x[ks[i]] == null) x[ks[i]] = {}; x = x[ks[i]]; } x[ks[ks.length - 1]] = v; };
const draw = (name, st, scale = 0.5) => { let c; try{ c = render(scale, st); }catch(e){ out.push([name, 'ERROR ' + e.message]); return; } out.push([name, H(c)]); };
const base = (ov = {}) => merged(Object.assign({text:T, size:110}, ov));
const vals = row => row.opts ? row.opts.map(o => o[0]) : row.r ? [row.min, Math.round((row.min + row.max) / 2 / (row.step || 1)) * (row.step || 1), row.max] : row.chk ? [true, false] : row.c ? ['#13c4a3'] : row.seed ? [7] : [];
// 表示条件（show：'キー=値|値&キー!=値'）を満たすように st を書き換える。条件付きの設定（金属の種類・しっぽの向きなど）を実際に効かせるため
const ROWS = [...TEXT_ROWS, ...SECTIONS.flatMap(s => s.rows)];
const getP = (o, path) => path.split('.').reduce((x, k) => x == null ? x : x[k], o);
const lit = v => v === 'true' ? true : v === 'false' ? false : (v !== '' && !isNaN(+v) ? +v : v);
const satisfy = (st, show) => { if(!show) return; for(const c of show.split('&')){ const neg = c.includes('!='), [k, vs] = c.split(neg ? '!=' : '='), list = vs.split('|');
  if(!neg){ if(!list.includes(String(getP(st, k)))) setP(st, k, lit(list[0])); continue; }
  if(!list.includes(String(getP(st, k)))) continue;
  const r = ROWS.find(r => (r.seg || r.sel || r.chk) === k), cand = r && r.opts ? r.opts.map(o => o[0]) : r && r.chk ? [true, false] : [];
  const v = cand.find(x => !list.includes(String(x))); if(v !== undefined) setP(st, k, v); } };
// 1) 装飾のセクションごと（セクションの ON キーを入れて、行の値を 1 つずつ変える）
for(const sec of SECTIONS){
  const on = sec.on ? {[sec.on.split('.')[0]]: Object.assign({}, DEFAULT[sec.on.split('.')[0]], {[sec.on.split('.')[1]]: true})} : {};
  draw(`[${sec.t}] 既定`, base(on), 1);
  for(const row of sec.rows){ const k = row.r || row.seg || row.sel || row.c || row.chk || row.seed; if(!k) continue;
    for(const v of vals(row)){ const st = base(on); satisfy(st, row.show); setP(st, k, v); draw(`[${sec.t}] ${k}=${v}`, st, 1); } }
}
// 2) 文字の基本（サイズ・字間・行間・縦書き・揃え・英数字の向き・縦中横）
for(const row of TEXT_ROWS){ const k = row.r || row.seg || row.chk; for(const v of vals(row)) for(const vert of [false, true]){ const st = base({vertical:vert}); satisfy(st, row.show); setP(st, k, v); draw(`[基本] ${k}=${v} 縦${vert} ${row.show || ''}`, st); } }
// 3) 全装飾を同時に ON（重ね合わせの順序の確認）。横書き／縦書き × 倍率
const all = base(); for(const sec of SECTIONS) if(sec.on){ const [a, b] = sec.on.split('.'); all[a] = Object.assign({}, all[a], {[b]: true}); }
all.strokes = [{on:true, w:8, c:'#111'}, {on:true, w:10, c:'#ff2d55'}, {on:true, w:6, c:'#fff'}]; all.sblur = 3; all.skew = 8; all.rotate = 7;
for(const fm of ['normal', 'hollow', 'knock']) for(const vert of [false, true]) for(const sc of [0.5, 1, 2.4]){ const st = clone(all); st.fillMode = fm; st.vertical = vert; draw(`[全部] ${fm} 縦${vert} x${sc}`, st, sc); }
// 4) 文字プリセット全種の縦書き版（横書き版は compare.py で比べている）
for(const [name, p] of PRESETS){ draw(`[プリセット縦] ${name}`, merged(Object.assign(clone(p), {text:T, vertical:true}))); }
// 5) 文字が空・空白だけ
draw('[空] 空文字', base({text:''})); draw('[空] 空白', base({text:'  '}));
return out;"""

# レイヤーパネル：いろいろな状態の DOC で renderLayers を呼び、#layerList の HTML を比べる（文字列が 1 文字でも違えば検出）
LAYERS = """
const out = [], keep = DOC;
const T = (o = {}) => Object.assign(mkTextLayer(merged({text:'テスト{強調}'}), 500, 300, 1), {id:'Lt'}, o);
const I = (o = {}) => Object.assign(LAYER_BASE(), IMAGE_BASE(), {id:'Li', type:'image', asset:'Acmp', name:'city'}, o);
const C = (o = {}) => Object.assign(COLLAGE_BASE(), {id:'Lc', n:4, layout:'grid'}, o);
const FXL = (k, o = {}) => Object.assign(mkFx(k), {id:'Lf' + k}, o);
const snap = (name, layers, sel = null, msel = [], bg = {}) => {
  DOC = normalizeDoc(Object.assign(JSON.parse(JSON.stringify(keep)), {layers:JSON.parse(JSON.stringify(layers)), sel, msel:[]}));
  DOC.msel = msel; Object.assign(DOC.bg, bg); lpSliding = false; renderLayers(); out.push([name, document.querySelector('#layerList').innerHTML]); };
snap('空', []);
snap('1枚ずつ 文字', [T()]); snap('1枚ずつ 画像', [I()]); snap('1枚ずつ 画像なし', [I({asset:'missing'})]); snap('1枚ずつ 分割', [C()]);
for(const k of Object.keys(FX_DEF)) snap('エフェクト ' + k, [FXL(k)]);
const all = [T(), I(), C(), FXL('lines')];
for(const sel of [null, 'Lt', 'Li', 'Lc', 'Lflines']) snap('選択 ' + sel, all, sel);
snap('複数選択', all, 'Lt', ['Lt', 'Li']);
snap('状態 非表示・ロック・不透明度・合成', [T({hidden:true}), I({locked:true, op:0.4}), C({blend:'multiply', op:0.75}), FXL('light', {label:'<b>名前</b> "引用"'})], 'Li');
snap('名前', [T({label:'自分で付けた名前'}), I({label:'&<>"特殊文字'})]);
for(const open of [true, false]){ const G = Object.assign(LAYER_BASE(), GROUP_BASE(), {id:'Lg', open}); snap('グループ open=' + open, [Object.assign(T(), {gid:'Lg'}), Object.assign(I(), {gid:'Lg'}), G, C()], 'Lg'); }
{ const G = Object.assign(LAYER_BASE(), GROUP_BASE(), {id:'Lg'}); G.fx.tint.on = true; snap('グループ 効果あり 中を選択', [Object.assign(T(), {gid:'Lg'}), G], 'Lt'); }
{ const c = C(); c.fx.sil.on = true; snap('分割 効果あり', [c]); }
for(const bg of [{type:'image'}, {type:'grad'}, {type:'color'}, {hidden:true}, {op:0.5}, {type:'toString'}]) snap('背景 ' + JSON.stringify(bg), [T()], null, [], bg);
DOC = keep; renderLayers();
return out;"""

# 保存データの読み込み（normalizeDoc）：古い形式・壊れた値・細工された値の入力を通し、出力の JSON を 1 文字単位で比べる。
# id の作り直し（uid）が乱数と時刻を使うので、比べる間だけ固定する
NORMALIZE = """
const out = [], R0 = Math.random, D0 = Date.now;
const J = o => JSON.parse(JSON.stringify(o));
const base = J(DOC); base.layers.forEach((l, i) => l.id = 'Lb' + i); base.sel = base.textSel = base.layers.length ? 'Lb0' : null;   // 起動時に作られる id は毎回違うので固定する
const T = (o = {}) => Object.assign(mkTextLayer(merged({text:'テスト'}), 500, 300, 1), {id:'Lt'}, o);
const I = (o = {}) => Object.assign(LAYER_BASE(), IMAGE_BASE(), {id:'Li', type:'image', asset:'Acmp'}, o);
const C = (o = {}) => Object.assign(COLLAGE_BASE(), {id:'Lc'}, o);
const G = (o = {}) => Object.assign(LAYER_BASE(), GROUP_BASE(), {id:'Lg'}, o);
const F = (k, o = {}) => Object.assign(mkFx(k), {id:'Lf'}, o);
const run = (name, d) => { let seed = 7; Math.random = () => (seed = seed * 16807 % 2147483647) / 2147483647; Date.now = () => 1700000000000;
  let r; try{ r = JSON.stringify(normalizeDoc(d === undefined ? d : J(d))); }catch(e){ r = 'ERROR ' + e.message; } finally { Math.random = R0; Date.now = D0; }
  out.push([name, r]); };
const D = (layers, ov = {}) => Object.assign(J(base), {layers}, ov);
// 1) 新規・壊れたデータ
run('null', null); run('undefined', undefined); run('空', {}); run('layers が文字列', {layers:'x'}); run('layers 空', {layers:[]});
run('今の DOC', base);
// 2) 全種類を既定のまま
run('全種類', D([T(), I(), C(), F('lines'), Object.assign(T({id:'Lk'}), {gid:'Lg'}), G()], {sel:'Li', textSel:'Lt'}));
// 3) 種類ごとに最小限の項目だけ（既定値で埋まるか）
for(const t of ['text', 'image', 'collage', 'group', 'fx', 'weird', 'toString']) run('最小 ' + t, D([{id:'Lm', type:t, kind:'sparkle'}, {id:'Lk', type:'text', gid:'Lm'}]));
// 4) 画像：旧形式のフレーム・範囲外・壊れた値
run('画像 いろいろ', D([I({frame:{shape:'heart', zoom:2, ox:0.1, oy:-0.2}}), I({id:'L2', frame:{shape:'star', zoom:3, fs:0.5}}), I({id:'L3', crop:{t:-1, b:2, l:'x', r:0.95}, key:{on:true, tol:'a', c:'zzz'}, strokes:[null, {m:1, pts:'x'}, {m:0, r:5, pts:[[1, 2], [3, 'a']]}], btool:'??', bsz:99999}),
  I({id:'L4', bsz:'abc', outline:{w:5}, shadow:{on:true}, glow:{c:'red'}, fx:{duo1:'javascript:', tint:{c:'"><b>', on:true}, sil:{c:'bad', on:true}}}), I({id:'L5', asset:'bad id!'})]));
// 境界の値（丸めの上限・下限のすぐ内側と外側）
run('画像 境界', D([I({bsz:1}), I({id:'L2', bsz:4}), I({id:'L3', bsz:4.5}), I({id:'L4', bsz:600}), I({id:'L5', bsz:601}), I({id:'L6', bsz:0}), I({id:'L7', bsz:-3}),
  I({id:'L8', frame:{zoom:20}}), I({id:'L9', frame:{zoom:0.5}}), I({id:'La', frame:{zoom:0}}), I({id:'Lb', crop:{t:0.9, b:0.9}}), I({id:'Lc', btool:'restore'}), I({id:'Ld', btool:'pick'})]));
// 5) 分割フレーム：一部のマスだけ・壊れた色・週の設定
run('分割 いろいろ', D([C({cells:[{asset:'Acmp', bg:{c:'nope', on:true}}, {tx:{text:'a'}, fx:{blur:3}}, null, {asset:'<x>'}], wk:{first:'sun'}, tstyle:{size:99}, fx:{tint:{on:true}}, shadow:{blur:3}})]));
// 6) グループ：空のグループ・自分を指す gid・存在しないグループへの gid
run('グループ いろいろ', D([Object.assign(T(), {gid:'Lg'}), G(), G({id:'Lempty'}), Object.assign(I(), {gid:'Lnone'}), Object.assign(G({id:'Lself'}), {gid:'Lself'}), Object.assign(T({id:'Lk2'}), {gid:'Lself'})]));
// 7) 動的エフェクト：未対応の種類・特殊な名前・壊れた色
run('fx いろいろ', D([F('burst', {p:{c:'xx', spikes:3}}), {id:'Lu', type:'fx', kind:'unknown'}, {id:'Lp', type:'fx', kind:'toString'}, {id:'Lq', type:'fx', kind:'__proto__'}]));
// 8) 使えない id（作り直し、gid の付け替え）
run('id いろいろ', D([Object.assign(T({id:'a b'}), {gid:'<g>'}), G({id:'<g>'}), I({id:'ok1'}), {id:'"', type:'text'}], {sel:'a b', textSel:'"'}));
// 9) 配列の中の壊れた要素
run('壊れた要素', D([null, 5, 'str', [], T(), true]));
// 10) 背景・仕上げ・ガイド・ヘッダー・大きさ
run('背景 入れ子なし', D([T()], {bg:{type:'image', asset:'Acmp'}}));
run('背景 旧ズームブラーの中心', D([T()], {bg:{zb:{on:true, cx:0.2, cy:0.8}}}));
run('背景 旧集中線', D([T()], {bg:{lines:{on:true, c:'#fff', n:90, inner:0.4, seed:3, a:0.5}, fcx:0.3, fcy:0.6}}));
run('背景 旧集中線 off', D([T()], {bg:{lines:{on:false}}}));
run('背景 不正な asset', D([T()], {bg:{asset:'../x'}}));
for(const look of ['cinema', 'zzz', 'toString', undefined]) run('仕上げ ' + look, D([T()], {fin:{look, amt:0.5}}));
run('ガイド 一部', D([T()], {guides:{thirds:true}}));
for(const [hdr, w, h] of [['yt', 2560, 1440], ['yt', 1920, 1080], ['tw', 1200, 480], ['toString', 1920, 1080], ['', 1920, 1080]]) run(`ヘッダー ${hdr} ${w}x${h}`, D([T()], {hdr, w, h, guides:{safe:true}}));
for(const [w, h, ex] of [[10, 99999, 'abc'], ['x', 'y', 50], [5000, 5000, 100000], [1920, 1080, 3840], [1080, 1920, 1080], [199, 201, 99], [200, 5000, 100], [5001, 200.4, 101], [1920.6, 1079.5, 0]]) run(`大きさ ${w}x${h} 書き出し ${ex}`, D([T()], {w, h, exportW:ex}));
// 11) 選択が存在しないレイヤーを指す
run('選択 なし', D([I()], {sel:'Lnone', textSel:'Lnone'}));
run('選択 文字あり', D([I(), T({id:'Lt2'})], {sel:'Li', textSel:'Lnone'}));
return out;"""

# フォント一覧：検索語・分類・用途・選択中のフォント・英数字用フォント・お気に入り・本文を変えて renderFontList を呼び、
# #flist の HTML（長いのでハッシュ）・件数表示・使用中表示・遅延読み込みに登録された書体を比べる。
# 読み込み済みの書体（cssState）で表示が変わるので、比べる間は決まった中身にし、遅延読み込みは実際には始めない（登録された名前だけ記録）
FONTLIST = """
const out = [], hs = s => { let a = 2166136261, b = 5381; for(let i = 0; i < s.length; i++){ const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = (b * 33 + c) | 0; } return s.length + ':' + (a >>> 0).toString(16) + (b >>> 0).toString(16); };
const keepCss = new Map(cssState), keepFav = new Set(favs), keepS = JSON.parse(JSON.stringify(S)), obs0 = io.observe; let obs = [];
io.observe = el => { obs.push(el.dataset.family); };
const fake = [{family:'テストPC書体', src:'local', cat:'ゴシック'}, {family:'テストファイル書体 <b>', src:'file', cat:'手書き', usage:'ポップ・<i>'}]; fonts.push(...fake);   // PC 内・ファイルの書体（テスト環境には無いので足す）
cssState.clear(); const heavy = fonts.filter(f => f.mb > 1); if(heavy[0]) cssState.set(heavy[0].family, Promise.resolve());
const g = fonts.find(f => f.src === 'google' && !f.more), w = fonts.find(f => WEB_SRC.includes(f.src)); if(g) cssState.set(g.family, Promise.resolve());
const lat = fonts.find(f => f.cat === '欧文');
const opt = sel => [...document.querySelectorAll(sel + ' option')].map(o => o.value);
const shot = name => { obs = []; renderFontList(); out.push([name, hs(document.querySelector('#flist').innerHTML) + '|' + document.querySelector('#fcount').textContent + '|' + document.querySelector('#curFont').textContent + '|' + hs(obs.join(','))]); };
const set = (q, cat, use) => { document.querySelector('#fq').value = q; document.querySelector('#fcat').value = cat; document.querySelector('#fuse').value = use; };
favs.clear(); [fonts[0], heavy[0], w, lat].filter(Boolean).forEach(f => favs.add(f.family));
for(const q of ['', 'noto', 'ポップ', 'A', 'zzzz', '  Gothic  ']) for(const cat of opt('#fcat')) for(const use of ['', ...opt('#fuse').filter(Boolean).slice(0, 2)]){ set(q, cat, use); shot(`検索「${q}」 分類 ${cat} 用途 ${use}`); }
for(const use of opt('#fuse')){ set('', '', use); shot('用途だけ ' + use); }
set('', '', ''); 
for(const [t, f, fl] of [['RANK UP 99', fonts[3].family, lat ? lat.family : ''], ['あいう\\n\\n2行目', heavy[0] ? heavy[0].family : fonts[1].family, ''], ['{強調}だけ', 'ない書体', ''], ['', fonts[0].family, ''], ['ABCDEFGHIJKLMNOPQRSTUV xyz', fonts[2].family, '']])
  for(const cat of ['', '欧文', 'お気に入り']){ S.text = t; S.font = f; S.fontLatin = fl; set('', cat, ''); shot(`本文「${t}」 使用中 ${f} 英数字 ${fl} 分類 ${cat}`); }
fonts.splice(fonts.length - fake.length, fake.length); io.observe = obs0; cssState.clear(); keepCss.forEach((v, k) => cssState.set(k, v)); favs.clear(); keepFav.forEach(f => favs.add(f)); Object.assign(S, keepS); set('', '', ''); renderFontList();
return out;"""

async def capture(p, root, suites):
    pg = await open_app(p, root=root)
    res = {}
    if 'fx' in suites: res['fx'] = await pg.evaluate('(() => {' + FX + '})()')
    if 'text' in suites: res['text'] = await pg.evaluate('(() => {' + TEXT + '})()')
    if 'fontlist' in suites: res['fontlist'] = await pg.evaluate('(() => {' + FONTLIST + '})()')
    if 'normalize' in suites: res['normalize'] = await pg.evaluate('(() => {' + NORMALIZE + '})()')
    if 'frames' in suites or 'collage' in suites or 'layers' in suites:
        # テスト用の画像を、決まった id の素材として登録する（変更前後とも同じ条件にする。IndexedDB には書かない）
        src = 'data:image/jpeg;base64,' + base64.b64encode(Path(IMG['city.jpg']).read_bytes()).decode()
        await pg.evaluate("src => addAsset(src, 'cmp', 'Acmp', true)", src)
        src2 = 'data:image/jpeg;base64,' + base64.b64encode(Path(IMG['synth.jpg']).read_bytes()).decode()
        await pg.evaluate("src => addAsset(src, 'cmp2', 'Acmp2', true)", src2)
        if 'frames' in suites: res['frames'] = await pg.evaluate('(() => {' + FRAMES + '})()')
        if 'collage' in suites: res['collage'] = await pg.evaluate('(() => {' + COLLAGE + '})()')
        if 'layers' in suites: res['layers'] = await pg.evaluate('(() => {' + LAYERS + '})()')
    errs = list(pg.errors); await close(pg)
    return res, errs

async def main(ref, suites):
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(f'git -C "{ROOT}" archive {ref} | tar -x -C "{d}"', shell=True, check=True)
        async with async_playwright() as p:
            old, e1 = await capture(p, d, suites)
            new, e2 = await capture(p, ROOT, suites)
    bad = 0
    for s in suites:
        o, n = dict(old.get(s, [])), dict(new.get(s, []))
        diff = [k for k in o if o[k] != n.get(k)] + [k for k in n if k not in o]
        errs = [k for k, v in n.items() if v.startswith('ERROR')]
        print(f'[{s}] {len(n)} 通り：一致 {len(n) - len(diff)}／違い {len(diff)}' + (f'／エラー {len(errs)}' if errs else ''))
        for k in diff[:30]: print(f'   違い: {k}\n      前: {o.get(k)}\n      後: {n.get(k)}')
        for k in errs[:10]: print(f'   エラー: {k} {n[k]}')
        bad += len(diff) + len(errs)
    for label, e in (('変更前', e1), ('変更後', e2)):
        if e: print(f'{label}のページでエラー: {e[:5]}'); bad += len(e)
    print('結果：' + ('すべて一致' if not bad else f'{bad} 件の問題'))
    return bad

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    suites = next((a.split('=')[1].split(',') for a in sys.argv[1:] if a.startswith('--suite=')), ['fx', 'frames', 'collage', 'text', 'layers', 'normalize', 'fontlist'])
    sys.exit(1 if asyncio.run(main(args[0] if args else 'HEAD', suites)) else 0)
