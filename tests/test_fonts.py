"""フォント一覧：件数・絞り込み・検索・URL追加・再読み込み後も残る"""
from helpers import *

async def run(p):
    pg = await open_app(p)
    await pg.evaluate("selectLayer(DOC.layers.find(l => l.type === 'text').id)"); await page(pg, 'txt-font')
    counts = await pg.evaluate("[fonts.length, fonts.filter(f => f.cat !== '欧文' && f.src === 'google').length]")
    assert counts[0] > 1900 and counts[1] >= 68, counts
    await pg.select_option('#fcat', 'web'); await pg.wait_for_timeout(300)
    assert int((await pg.evaluate("$('#fcount').textContent")).split('/')[0]) >= 35
    await pg.select_option('#fcat', ''); await pg.fill('#fq', 'lobster'); await pg.wait_for_timeout(400)
    assert int((await pg.evaluate("$('#fcount').textContent")).split('/')[0]) >= 1, '欧文の検索で見つからない'
    await pg.fill('#fq', ''); await pg.select_option('#fcat', 'web'); await pg.wait_for_timeout(300)
    await pg.click('#flist .fi[data-family="Nico Moji"]'); await pg.wait_for_timeout(300)
    assert await pg.evaluate('S.font') == 'Nico Moji'
    await pg.fill('#webUrl', 'https://fonts.google.com/specimen/Totally+New+Font'); await pg.click('#addWebUrl'); await pg.wait_for_timeout(500)
    assert await pg.evaluate("!!findFont('Totally New Font')")
    await pg.reload(wait_until='commit'); await pg.wait_for_timeout(4500)
    assert await pg.evaluate("[!!findFont('Totally New Font'), S.font]") == [True, 'Nico Moji'], '再読み込みで消えた'
    await close(pg)
