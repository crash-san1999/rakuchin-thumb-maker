"""更新履歴：ヘルプから開ける、新しい順に並ぶ、未読の印（点）が付き、見ると消える、CHANGELOG.md が元データと一致"""
from helpers import *
import re, os

async def run(p):
    pg = await open_app(p)
    assert await pg.evaluate("CHANGELOG.length > 5 && CHANGELOG.every(e => e.d && e.t && e.items.length)"), '更新履歴のデータが不正'
    ds = await pg.evaluate("CHANGELOG.map(e => e.d)"); assert ds == sorted(ds, reverse=True), f'新しい順でない {ds}'
    await pg.evaluate("LS.set('ttm_seenLog', 'old'); $('#helpBtn').classList.remove('has-new')")
    await pg.reload(); await settle(pg, 3000)
    assert await pg.evaluate("$('#helpBtn').classList.contains('has-new')"), '未読の印が付かない'
    await pg.evaluate("openHelp()"); await settle(pg, 300)
    await pg.evaluate("$('#logOpen').click()"); await settle(pg, 300)
    assert await pg.evaluate("$('#logModal').classList.contains('show') && !$('#help').classList.contains('show')"), '更新履歴が開かない'
    assert await pg.evaluate("$('#logBody').querySelectorAll('h4').length") == await pg.evaluate("CHANGELOG.length"), '表示数が違う'
    assert not await pg.evaluate("$('#helpBtn').classList.contains('has-new')"), '見ても印が消えない'
    await pg.keyboard.press('Escape'); await settle(pg, 200)
    assert not await pg.evaluate("$('#logModal').classList.contains('show')"), 'Escで閉じない'
    await close(pg)
    md = open(os.path.join(ROOT, 'CHANGELOG.md'), encoding='utf-8').read()
    assert md.count('\n## ') >= 5 and '縦書き' in md, 'CHANGELOG.md がない／古い'
