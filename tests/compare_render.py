"""描画の厳密比較：指定したコミット（既定は直前のコミット）と今の作業中のファイルで、描画結果がピクセル単位で一致するか調べる
   python3 tests/compare_render.py [比べるコミット] [--suite=fx,frames]
   ・fx     … 動的エフェクト全種類 × 乱数の種・パラメータ・拡大率・回転・不透明度などの組み合わせ
   ・frames … 切り抜きフレームの全形状 × 全デザイン（枠の色・太さ・縦横比・乱数の種の違いも）
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

async def capture(p, root, suites):
    pg = await open_app(p, root=root)
    res = {}
    if 'fx' in suites: res['fx'] = await pg.evaluate('(() => {' + FX + '})()')
    if 'frames' in suites:
        # テスト用の画像を、決まった id の素材として登録する（変更前後とも同じ条件にする。IndexedDB には書かない）
        src = 'data:image/jpeg;base64,' + base64.b64encode(Path(IMG['city.jpg']).read_bytes()).decode()
        await pg.evaluate("src => addAsset(src, 'cmp', 'Acmp', true)", src)
        res['frames'] = await pg.evaluate('(() => {' + FRAMES + '})()')
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
    suites = next((a.split('=')[1].split(',') for a in sys.argv[1:] if a.startswith('--suite=')), ['fx', 'frames'])
    sys.exit(1 if asyncio.run(main(args[0] if args else 'HEAD', suites)) else 0)
