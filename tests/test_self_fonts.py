"""同梱フォント（fonts/ 内）：一覧に出る、実ファイルとライセンスが同梱されている、選ぶと外部通信なしで読み込まれる"""
import os
from helpers import *

ROOT = os.path.join(os.path.dirname(__file__), '..')

async def run(p):
    pg = await open_app(p)
    items = await pg.evaluate("SELF_FONTS.map(f => [f.family, f.file, f.cat, f.src])")
    assert len(items) == 10, f'同梱フォントが10書体ない {len(items)}'
    for fam, file, cat, src in items:
        assert src == 'url' and cat in ('ゴシック', '明朝', 'デザイン'), f'{fam} の種類がおかしい'
        assert os.path.getsize(os.path.join(ROOT, file)) > 500_000, f'{fam} の同梱ファイルがない'
        names = os.listdir(os.path.join(ROOT, os.path.dirname(file)))
        assert any(n.startswith(('LICENSE', 'OFL')) for n in names), f'{fam} のライセンスが同梱されていない'
    await pg.evaluate("selectLayer(DOC.layers.find(l => l.type === 'text').id)"); await page(pg, 'txt-font')
    await pg.select_option('#fcat', 'web'); await pg.wait_for_timeout(400)
    for fam, file, *_ in items:
        if 'Matataki' in file: continue  # 26MB：ここでは読み込まず、登録だけ確認
        await pg.click(f'#flist .fi[data-family="{fam}"]'); await settle(pg, 2500)
        ok = await pg.evaluate(f"[S.font, [...document.fonts].some(x => x.family.replace(/\"/g, '') === {fam!r} && x.status === 'loaded')]")
        assert ok == [fam, True], f'{fam} を読み込めない {ok}'
    await close(pg)
