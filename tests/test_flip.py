"""画像の反転：左右・上下のボタン、ショートカット（H／V）、右クリックメニュー、切り抜きフレーム付きでもその場で反転"""
from helpers import *

# 画像レイヤーだけを描いた、キャンバスの上下左右の色の合計（反転で入れ替わるかを見る）
QUAD = """(() => { DOC.bg.hidden = true; DOC.layers.forEach(l => { l.hidden = l.type !== 'image'; }); prevCache.clear(); paintPreview(false);
  const c = document.querySelector('#tv'), x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height, s = [0, 0, 0, 0];
  for(let y = 0; y < H; y += 3) for(let i = 0; i < W; i += 3){ const k = (y * W + i) * 4, v = d[k] + d[k + 1] * 2 + d[k + 2] * 3; s[(i < W / 2 ? 0 : 1) + (y < H / 2 ? 0 : 2)] += v * d[k + 3] / 255; }
  return s; })()"""
close_to = lambda a, b: abs(a - b) <= max(a, b) * 0.03 + 50

async def run(p):
    pg = await open_app(p)
    await pg.set_input_files('#imgfile', [IMG['night.jpg']]); await settle(pg, 1500)
    await pg.evaluate("(() => { const L = DOC.layers.find(l => l.type === 'image'); Object.assign(L, {x:960, y:540, sc:1080 / ASSETS[L.asset].img.naturalHeight}); L.outline.on = false; L.shadow.on = false; selectLayer(L.id); docChanged(false); })()")
    await page(pg, 'lay-base'); await settle(pg, 600)
    a = await pg.evaluate(QUAD)
    # 左右（ボタン）
    await pg.click('[data-flip="flip"]'); await settle(pg, 500)
    assert await pg.evaluate("selLayer().flip") is True and await pg.is_visible('[data-flip="flip"].on'), '左右反転ボタンが効かない'
    b = await pg.evaluate(QUAD)
    assert close_to(a[0], b[1]) and close_to(a[1], b[0]) and not close_to(a[0], a[1]), f'左右が入れ替わっていない {a} {b}'
    # 上下（キー V）
    await pg.keyboard.press('v'); await settle(pg, 500)
    assert await pg.evaluate("selLayer().flipV") is True, 'V キーで上下反転しない'
    c = await pg.evaluate(QUAD)
    assert close_to(b[0], c[2]) and close_to(b[2], c[0]), f'上下が入れ替わっていない {b} {c}'
    # H キーで左右を戻す・右クリックメニューで上下を戻す
    await pg.keyboard.press('h'); await settle(pg, 300)
    await pg.evaluate("showMenu(DOC.sel, 200, 200)"); await pg.click('#ctxmenu [data-ma="flipV"]'); await settle(pg, 500)
    assert await pg.evaluate("[selLayer().flip, selLayer().flipV]") == [False, False]
    assert all(close_to(x, y) for x, y in zip(a, await pg.evaluate(QUAD))), '元に戻らない'
    # 切り抜きフレーム付き：位置と大きさは変わらず中身だけ反転
    await pg.evaluate("(() => { Object.assign(selLayer().frame, {shape:'circle', style:'solid'}); docChanged(false); })()"); await settle(pg, 600)
    pos = await pg.evaluate("[selLayer().x, selLayer().y, JSON.stringify(selLayer().frame)]")
    await pg.click('[data-flip="flip"]'); await pg.click('[data-flip="flipV"]'); await settle(pg, 600)
    assert await pg.evaluate("[selLayer().x, selLayer().y, JSON.stringify(selLayer().frame)]") == pos, 'フレーム付きで反転すると位置やフレームが変わる'
    # フレーム調整モードでも落ちない
    await pg.evaluate("setEdit({kind:'frame', id:DOC.sel})"); await settle(pg, 400); await pg.evaluate("setEdit(null)")
    # 古い保存データ（flipV なし）
    assert await pg.evaluate("(() => { const d = JSON.parse(JSON.stringify(DOC)); d.layers.forEach(l => delete l.flipV); return normalizeDoc(d).layers.find(l => l.type === 'image').flipV === false; })()")
    await close(pg)
