"""グループのレイヤーパネル：行のドラッグで同じ階層だけ入れ替わる、Ctrl＋クリックで複数選択、スマホの長押しで複数選択"""
from helpers import *

async def setup(pg):
    await pg.set_input_files('#imgfile', [IMG['night.jpg'], IMG['synth.jpg']]); await settle(pg, 2000)
    return await pg.evaluate("DOC.layers.map(l => l.id)")

async def run(p):
    pg = await open_app(p)
    ids = await setup(pg)
    a, b, c = ids[-3:]
    await pg.evaluate(f"selectLayer('{a}'); toggleMulti('{b}')"); await pg.click('.lp-multi [data-multi="group"]'); await settle(pg, 500)
    gid = await pg.evaluate("DOC.layers.find(l => l.type === 'group').id")
    # 表示順：c、グループ、中身2つ。グループの行を一番上までドラッグ → グループが最前面になり、中身は付いていく
    rows = await pg.evaluate("[...document.querySelectorAll('#layerList .ly[data-lid]')].map(r => r.dataset.lid)")
    assert rows[0] == c and rows[1] == gid and len(rows) == 4, f'行の並びがおかしい {rows}'
    g = await pg.locator(f'#layerList .ly[data-lid="{gid}"] .grip').bounding_box(); t = await pg.locator(f'#layerList .ly[data-lid="{c}"]').bounding_box()
    await pg.mouse.move(g['x'] + 6, g['y'] + 8); await pg.mouse.down(); await pg.mouse.move(g['x'] + 6, t['y'] - 6, steps=8); await pg.mouse.up(); await settle(pg, 600)
    top = await pg.evaluate("DOC.layers.filter(l => !l.gid).map(l => l.id)")
    assert top[-1] == gid and top[-2] == c, f'グループを最前面へドラッグできない {top}'
    assert await pg.evaluate(f"DOC.layers.filter(l => l.gid === '{gid}').length") == 2, 'ドラッグで中身が外れた'
    # 中身の行は、同じグループの中でだけ入れ替わる（グループの外には出ない）
    kids = await pg.evaluate(f"[...document.querySelectorAll('#layerList .ly.kid')].map(r => r.dataset.lid)")
    k0 = await pg.locator(f'#layerList .ly[data-lid="{kids[0]}"] .grip').bounding_box(); k1 = await pg.locator(f'#layerList .ly[data-lid="{kids[1]}"]').bounding_box()
    before = await pg.evaluate("DOC.layers.map(l => l.id).join()")
    await pg.mouse.move(k0['x'] + 6, k0['y'] + 8); await pg.mouse.down(); await pg.mouse.move(k0['x'] + 6, k1['y'] + k1['height'] + 40, steps=8); await pg.mouse.up(); await settle(pg, 600)
    kids2 = await pg.evaluate(f"DOC.layers.filter(l => l.gid === '{gid}').map(l => l.id)")
    assert set(kids2) == set(kids) and await pg.evaluate(f"DOC.layers.filter(l => !l.gid).length") == 2, '中身のドラッグでグループの外に出た'
    # Ctrl＋クリックで複数選択
    await pg.evaluate("selectLayer(null)")
    await pg.click(f'#layerList .ly[data-lid="{c}"] .ly-name'); await pg.keyboard.down('Control'); await pg.click(f'#layerList .ly[data-lid="{gid}"] .ly-name'); await pg.keyboard.up('Control'); await settle(pg, 300)
    assert await pg.evaluate("DOC.msel.length") == 2, 'Ctrl＋クリックで複数選択できない'
    await close(pg)

    # スマホ：長押しで複数選択に入り、そのあとはタップで追加
    pg = await open_app(p, mobile=True)
    ids = await setup(pg)
    await pg.evaluate("openSheet('layers', true)"); await settle(pg, 600)
    a, b, c = ids[-3:]
    async def hold(lid, ms=700):
        await pg.evaluate(f"""(() => {{ const r = document.querySelector('#layerList .ly[data-lid="{lid}"]'), q = r.getBoundingClientRect(), o = {{bubbles:true, pointerType:'touch', pointerId:7, isPrimary:true, clientX:q.left + 60, clientY:q.top + q.height / 2, button:0}};
          r.querySelector('.ly-name').dispatchEvent(new PointerEvent('pointerdown', o)); window.__h = setTimeout(() => {{ const n = document.querySelector('#layerList .ly[data-lid="{lid}"] .ly-name'); n.dispatchEvent(new PointerEvent('pointerup', o)); n.dispatchEvent(new MouseEvent('click', {{bubbles:true}})); }}, {ms}); }})()""")
        await pg.wait_for_timeout(ms + 300)
    await pg.evaluate("selectLayer(null)")
    await hold(a)
    assert await pg.evaluate("DOC.msel.length") == 0 and await pg.evaluate("DOC.sel") == a, f'長押しで選ばれない {await pg.evaluate("[DOC.sel, DOC.msel]")}'
    await hold(b)
    assert await pg.evaluate("DOC.msel.length") == 2, f'長押しで複数選択に入れない {await pg.evaluate("[DOC.sel, DOC.msel]")}'
    await pg.evaluate(f"document.querySelector('#layerList .ly[data-lid=\"{c}\"] .ly-name').click()"); await settle(pg, 300)
    st = await pg.evaluate("[isMobile, DOC.sel, DOC.msel]")
    assert len(st[2]) == 3, f'複数選択中のタップで追加されない {st}'
    await close(pg)
