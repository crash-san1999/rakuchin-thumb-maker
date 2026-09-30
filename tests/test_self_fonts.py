"""同梱フォント（にくまるフォント）：一覧に出る、実ファイルが同梱されている、選ぶと外部通信なしで読み込まれる"""
import os
from helpers import *

async def run(p):
    pg = await open_app(p)
    f = await pg.evaluate("(() => { const f = findFont('にくまるフォント'); return f && [f.src, f.file, f.cat]; })()")
    assert f and f[0] == 'url' and f[2] == 'デザイン', f'一覧にない {f}'
    assert os.path.getsize(os.path.join(os.path.dirname(__file__), '..', f[1])) > 1_000_000, '同梱ファイルがない'
    await pg.evaluate("selectLayer(DOC.layers.find(l => l.type === 'text').id)"); await page(pg, 'txt-font')
    await pg.select_option('#fcat', 'web'); await pg.wait_for_timeout(400)
    await pg.click('#flist .fi[data-family="にくまるフォント"]'); await settle(pg, 2500)
    ok = await pg.evaluate("[S.font, [...document.fonts].some(x => x.family.replace(/\"/g, '') === 'にくまるフォント' && x.status === 'loaded')]")
    assert ok == ['にくまるフォント', True], f'読み込めない {ok}'
    await close(pg)
