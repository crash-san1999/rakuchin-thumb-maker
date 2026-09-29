"""文字パネル：ボタン選択・入力・色・スライダー・別パターン・表示条件・スイッチ・倍率"""
from helpers import *

async def run(p):
    pg = await open_app(p)
    await pg.evaluate("selectLayer(DOC.layers.find(l => l.type === 'text').id)"); await page(pg, 'txt-text')
    await pg.click('.seg[data-seg="align"] button[data-v="left"]'); assert await pg.evaluate('S.align') == 'left'
    await pg.fill('#text', 'テスト{強調}'); await pg.wait_for_timeout(200)
    assert await pg.evaluate("DOC.layers.find(l => l.type === 'text').style.text") == 'テスト{強調}', 'レイヤーに反映されない'
    await page(pg, 'txt-deco')
    await pg.fill('input.hex[data-k="fill1"]', '#12ab34'); await pg.wait_for_timeout(150); assert await pg.evaluate("S.fill1") == '#12ab34'
    await pg.evaluate("(() => { const el = document.querySelector('input[type=range][data-k=\"size\"]'); el.value = el.max; el.dispatchEvent(new Event('input', {bubbles:true})); })()")
    assert await pg.evaluate("[S.size, document.querySelector('input.num[data-k=\"size\"]').value]") == [400, '400']
    before = await pg.evaluate("S.plate.seed"); await pg.evaluate("document.querySelector('[data-reroll=\"plate.seed\"]').click()")
    assert await pg.evaluate("S.plate.seed") != before
    await pg.click('.seg[data-seg="fillType"] button[data-v="metal"]'); await pg.wait_for_timeout(150)
    assert await pg.evaluate("getComputedStyle(document.querySelector('[data-show=\"fillType=metal\"]')).display") != 'none', '表示条件が効かない'
    on = await pg.evaluate("S.dots.on"); await pg.evaluate("document.querySelector('section[data-on=\"dots.on\"] .sw input').click()")
    assert await pg.evaluate("S.dots.on") != on
    await pg.click('#modeSeg [data-mode=text]'); await pg.wait_for_timeout(600)
    await pg.click('.seg[data-seg="scale"] button[data-v="3"]'); assert await pg.evaluate('[S.scale, typeof S.scale]') == [3, 'number']
    await close(pg)
