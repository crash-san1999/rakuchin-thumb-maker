"""仕上げの「かける対象」：サムネ全体なら文字・画像にもかかり、背景だけなら背景にだけかかる（あとから足したレイヤーにもかからない）。
   ワンクリック仕上げを押しても対象は変わらない。画面のキャッシュでも正しく切り替わる。古い保存データ・不正な値は「サムネ全体」"""
from helpers import *

# 画像レイヤーの真ん中あたり（レイヤーだけの色）と、画像のない左上（背景の色）を、画面と同じ経路で描いて読む
PIX = """(() => { paintPreview(false); const c = document.querySelector('#tv'), x = c.getContext('2d'), L = DOC.layers.find(l => l.type === 'image'), k = c.width / DOC.w;
  const at = (px, py) => [...x.getImageData(Math.round(px * k), Math.round(py * k), 1, 1).data].slice(0, 3);
  return {layer: at(L.x, L.y + 120), bg: at(60, 60)}; })()"""

async def run(p):
    pg = await open_app(p)
    await pg.set_input_files('#bgimgfile', IMG['city.jpg']); await settle(pg, 1500)
    await pg.evaluate("(() => { DOC.layers = DOC.layers.filter(l => l.type !== 'text'); DOC.guides.badge = false; selectLayer(null); docChanged(false); })()")
    await pg.set_input_files('#imgfile', [IMG['chara.jpg']]); await settle(pg, 1500)
    await pg.evaluate("(() => { const L = DOC.layers.find(l => l.type === 'image'); Object.assign(L, {x:960, y:540}); L.sc = 700 / ASSETS[L.asset].img.naturalHeight; selectLayer(null); docChanged(false); })()"); await settle(pg, 500)
    base = await pg.evaluate(PIX)
    # 1) 初期値は「サムネ全体」（新しいサムネ・FIN_BASE）：モノクロにすると、画像レイヤーも灰色になる
    assert await pg.evaluate("[DOC.fin.target, FIN_BASE().target, normalizeDoc(null).fin.target]") == ['all', 'all', 'all'], '初期値が「サムネ全体」でない'
    await pg.evaluate("(() => { DOC.fin = Object.assign(FIN_BASE(), {look:'mono'}); docChanged(false); })()")
    r = await pg.evaluate(PIX); gray = lambda c: max(c) - min(c) < 12
    assert gray(r['layer']) and gray(r['bg']), f'サムネ全体にかからない {base} {r}'
    # 2) 「背景だけ」：背景は灰色、画像レイヤーは元の色のまま（パネルの切り替えから）
    await page(pg, 'bg-fin'); await settle(pg, 300)
    await pg.evaluate("[...document.querySelectorAll('[data-dseg=\"fin.target\"] [data-v=\"bg\"]')].find(e => e.offsetParent).click()"); await settle(pg, 400)
    r = await pg.evaluate(PIX)
    assert await pg.evaluate("DOC.fin.target") == 'bg' and gray(r['bg']) and r['layer'] == base['layer'], f'背景だけにならない {base} {r}'
    # 3) あとから足したレイヤーにもかからない
    await pg.set_input_files('#imgfile', [IMG['synth.jpg']]); await settle(pg, 1500)
    r2 = await pg.evaluate("""(() => { const L = selLayer(); Object.assign(L, {x:400, y:800}); L.sc = 300 / ASSETS[L.asset].img.naturalHeight; selectLayer(null); docChanged(false); paintPreview(false);
      const c = document.querySelector('#tv'), x = c.getContext('2d'), k = c.width / DOC.w; return [...x.getImageData(Math.round(400 * k), Math.round(800 * k), 1, 1).data].slice(0, 3); })()""")
    assert not gray(r2), f'あとから足したレイヤーにも仕上げがかかる {r2}'
    # 4) ワンクリック仕上げを押しても「背景だけ」のまま
    await pg.evaluate("[...document.querySelectorAll('[data-finfx=\"crt\"]')].find(e => e.offsetParent).click()"); await settle(pg, 400)
    assert await pg.evaluate("[DOC.fin.target, DOC.fin.scan > 0]") == ['bg', True], 'ワンクリック仕上げで対象が戻ってしまう'
    # 5) 「サムネ全体」に戻すと、画像レイヤーにもかかる（キャッシュが残っていても切り替わる）
    await pg.evaluate("(() => { DOC.fin = Object.assign(FIN_BASE(), {look:'mono', target:'all'}); docChanged(false); })()")
    r = await pg.evaluate(PIX); assert gray(r['layer']), '「サムネ全体」に戻しても画像にかからない'
    # 6) 古い保存データ（target なし）・不正な値は「サムネ全体」
    r = await pg.evaluate("(() => { const d = JSON.parse(JSON.stringify(DOC)); delete d.fin.target; const a = normalizeDoc(d).fin.target; d.fin.target = '<x>'; return [a, normalizeDoc(d).fin.target]; })()")
    assert r == ['all', 'all'], r
    await close(pg)
    return '既定は全体・背景だけ・あとから足したレイヤー・ワンクリックで対象が保たれる・全体へ戻す・古いデータ'
