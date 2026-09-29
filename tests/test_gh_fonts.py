"""GitHub 配布のフォント（jsDelivr 経由）を FontFace で読み込める。通信はこの PC のフォントファイルで代用する"""
from helpers import *

async def run(p):
    if not SYSTEM_TTF: return 'skip（代用に使う .ttf がこの PC に見つからない）'
    pg = await open_app(p, gh_font=SYSTEM_TTF)
    await pg.evaluate("selectLayer(DOC.layers.find(l => l.type === 'text').id)"); await page(pg, 'txt-font')
    await pg.select_option('#fcat', 'web'); await pg.wait_for_timeout(300)
    for fam in ['PixelMplus12', 'Tsukuhou Mincho']:
        await pg.click(f'#flist .fi[data-family="{fam}"]'); await settle(pg, 2500)
        ok = await pg.evaluate(f"[S.font, [...document.fonts].some(f => f.family.replace(/\"/g, '') === '{fam}' && f.status === 'loaded')]")
        assert ok == [fam, True], f'{fam} を読み込めない {ok}'
    await close(pg)
