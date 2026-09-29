"""動的エフェクト：追加・ドラッグ移動・ワンクリックとの連動・旧データの集中線の移行"""
from helpers import *

async def run(p):
    pg = await open_app(p)
    await pg.set_input_files('#bgimgfile', IMG['city.jpg']); await settle(pg, 1000)
    await pg.evaluate("addFx('lines')"); await pg.wait_for_timeout(600)
    box = await canvas_box(pg); k = box[2] / 1920; sx, sy = box[0] + 660 * k, box[1] + 740 * k
    x0 = await pg.evaluate("DOC.layers.find(l => l.type === 'fx').x")
    await pg.mouse.move(sx, sy); await pg.mouse.down(); await pg.mouse.move(sx + 200, sy - 80, steps=10); await pg.mouse.up(); await pg.wait_for_timeout(400)
    assert await pg.evaluate("DOC.layers.find(l => l.type === 'fx').x") > x0, 'ドラッグで動かない'
    await pg.evaluate("addFx('burst'); addFx('sparkle'); addFx('light')")
    assert await pg.evaluate("DOC.layers.filter(l => l.type === 'fx').length") == 4
    await pg.evaluate("applyBgFx('spot')"); assert await pg.evaluate("DOC.layers.filter(l => l.auto).map(l => l.kind)") == ['light']
    await pg.evaluate("applyBgFx('lines')"); assert await pg.evaluate("DOC.layers.filter(l => l.auto).map(l => l.kind)") == ['lines']
    await pg.evaluate("""(() => { saveDoc.t && clearTimeout(saveDoc.t); const d = JSON.parse(JSON.stringify(DOC)); d.layers = d.layers.filter(l => l.type !== 'fx');
      d.bg.lines = {on:true, a:0.4, n:100, c:'#ffffff'}; d.bg.fcx = 0.3; d.bg.fcy = 0.4; localStorage.setItem('ttm_doc', JSON.stringify(d)); })()""")
    await pg.reload(wait_until='commit'); await pg.wait_for_timeout(4500)
    m = await pg.evaluate("DOC.layers.filter(l => l.type === 'fx').map(l => [l.kind, l.x, l.y, l.op])")
    assert m == [['lines', 576, 432, 0.4]], f'旧データの集中線が移行されない {m}'
    await close(pg)
