"""レイヤーパネルのドラッグ：一番上（最前面）・一番下へ持っていける。レイヤーが多くてリストがスクロールしていても同じ"""
from helpers import *

async def drag(pg, lid, to_y_fn, steps=14, hold_end=0):
    g = await pg.locator(f'#layerList .ly[data-lid="{lid}"] .grip').bounding_box()
    await pg.mouse.move(g['x'] + 6, g['y'] + 8); await pg.mouse.down()
    ty = await to_y_fn()
    await pg.mouse.move(g['x'] + 6, ty, steps=steps)
    if hold_end: await pg.wait_for_timeout(hold_end)
    await pg.mouse.up(); await settle(pg, 700)

async def run(p):
    pg = await open_app(p)
    await pg.evaluate("(() => { for(let i = 0; i < 16; i++){ const L = mkTextLayer(merged({text:'レイヤー' + i}), 500 + i * 20, 300 + i * 20, 1); DOC.layers.push(L); } docChanged(false); renderLayers(); })()"); await settle(pg, 1500)
    ids = await pg.evaluate("DOC.layers.map(l => l.id)")
    lb = lambda: pg.evaluate("(() => { const r = document.querySelector('#layerList').getBoundingClientRect(); return [r.top, r.bottom]; })()")
    # 1) スクロールしていない状態で、下のほうの行を一番上へ
    mid = ids[5]
    await pg.evaluate("document.querySelector('#layerList').scrollTop = 0")
    await pg.evaluate(f"document.querySelector('#layerList [data-lid=\"{mid}\"]').scrollIntoView({{block:'nearest'}})")
    async def top_y():
        t = await lb(); return t[0] + 4
    await drag(pg, mid, top_y, hold_end=600)
    assert (await pg.evaluate("DOC.layers.map(l => l.id)"))[-1] == mid, '一番上（最前面）へドラッグできない（スクロール前）'
    # 2) 下までスクロールした状態から、一番上へ（途中で自動スクロールする）
    low = ids[1]
    await pg.evaluate("document.querySelector('#layerList').scrollTop = 99999"); await settle(pg, 300)
    await drag(pg, low, top_y, steps=30, hold_end=2500)
    assert (await pg.evaluate("DOC.layers.map(l => l.id)"))[-1] == low, '下からスクロールしながら一番上へドラッグできない'
    # 3) 一番上の行を一番下（背面側）へ
    top = (await pg.evaluate("DOC.layers.map(l => l.id)"))[-1]
    await pg.evaluate("document.querySelector('#layerList').scrollTop = 0"); await settle(pg, 300)
    async def bot_y():
        t = await lb(); return t[1] - 4
    await drag(pg, top, bot_y, steps=30, hold_end=2500)
    assert (await pg.evaluate("DOC.layers.map(l => l.id)"))[0] == top, '一番下（最背面）へドラッグできない'
    await close(pg)
