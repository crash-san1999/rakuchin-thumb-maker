"""描画の厳密比較：指定したコミット（既定は直前のコミット）と今の作業中のファイルで、描画結果がピクセル単位で一致するか調べる
   python3 tests/compare_render.py [比べるコミット] [--suite=fx,frames]
   ・fx     … 動的エフェクト全種類 × 乱数の種・パラメータ・拡大率・回転・不透明度などの組み合わせ
   ・frames … 切り抜きフレームの全形状 × 全デザイン（枠の色・太さ・縦横比・乱数の種の違いも）
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
  L.cells.forEach((c, i) => { c.asset = i % 3 === 2 ? null : (i % 2 ? 'Acmp2' : 'Acmp'); c.zoom = 1 + (i % 3) * 0.2; c.ox = (i % 2) * 30; c.rot = i * 7; c.flip = i === 1; });
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

async def capture(p, root, suites):
    pg = await open_app(p, root=root)
    res = {}
    if 'fx' in suites: res['fx'] = await pg.evaluate('(() => {' + FX + '})()')
    if 'frames' in suites or 'collage' in suites:
        # テスト用の画像を、決まった id の素材として登録する（変更前後とも同じ条件にする。IndexedDB には書かない）
        src = 'data:image/jpeg;base64,' + base64.b64encode(Path(IMG['city.jpg']).read_bytes()).decode()
        await pg.evaluate("src => addAsset(src, 'cmp', 'Acmp', true)", src)
        src2 = 'data:image/jpeg;base64,' + base64.b64encode(Path(IMG['synth.jpg']).read_bytes()).decode()
        await pg.evaluate("src => addAsset(src, 'cmp2', 'Acmp2', true)", src2)
        if 'frames' in suites: res['frames'] = await pg.evaluate('(() => {' + FRAMES + '})()')
        if 'collage' in suites: res['collage'] = await pg.evaluate('(() => {' + COLLAGE + '})()')
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
    suites = next((a.split('=')[1].split(',') for a in sys.argv[1:] if a.startswith('--suite=')), ['fx', 'frames', 'collage'])
    sys.exit(1 if asyncio.run(main(args[0] if args else 'HEAD', suites)) else 0)
