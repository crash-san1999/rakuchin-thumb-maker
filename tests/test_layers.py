"""集中線の最大サイズ・レイヤーパネルの不透明度・背景の非表示（透明PNG）"""
from helpers import *

async def run(p):
    pg = await open_app(p)
    await pg.set_input_files('#bgimgfile', IMG['city.jpg']); await settle(pg, 1000)
    await pg.evaluate("addFx('lines')"); await settle(pg, 1000)
    full = await pg.evaluate("dims.get(selLayer().id).w")
    await page(pg, 'lay-fx'); await pg.click('input[type=checkbox][data-d="@p.full"]'); await settle(pg, 1000)
    assert await pg.evaluate("selLayer().p.full") is False
    assert await pg.evaluate("dims.get(selLayer().id).w") > full, '最大サイズ指定で選択枠が広がらない'
    sl = await pg.query_selector('#layerList .ly.on .ly-op input'); bb = await sl.bounding_box()
    await pg.mouse.move(bb['x'] + bb['width'] * 0.95, bb['y'] + bb['height'] / 2); await pg.mouse.down()
    await pg.mouse.move(bb['x'] + bb['width'] * 0.3, bb['y'] + bb['height'] / 2, steps=8); await pg.wait_for_timeout(400); await pg.mouse.up()
    assert await pg.evaluate("selLayer().op") < 0.5, 'レイヤーパネルの不透明度が効かない'
    await pg.click('[data-bga=eye]'); await settle(pg, 1000)
    assert await pg.evaluate("[DOC.bg.hidden, document.querySelector('#tv').classList.contains('clearbg')]") == [True, True]
    px = await pg.evaluate("""(async () => { DOC.layers.forEach(l => l.hidden = true); const b = await thumbBlob('png'), bm = await createImageBitmap(b);
      const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const x = c.getContext('2d'); x.drawImage(bm, 0, 0); return Array.from(x.getImageData(5, 5, 1, 1).data); })()""")
    assert px[3] == 0, '背景を非表示にしても透明にならない'
    await close(pg)
