"""npm 配布（jsDelivr・分割 woff2）の日本語フォント：一覧に出る、選ぶと CSS と文字ぶんのフォントを読み込む、太さを変えると太さごとの CSS を読む。
通信は、CSS を自前で返し、フォントはこの PC の .ttf で代用する"""
import re
from helpers import *

FAMS = ['Gen Interface JP', 'Gen Interface JP Display', 'Notofit JP', 'TJ Plus Sans']

async def run(p):
    if not SYSTEM_TTF: return 'skip（代用に使う .ttf がこの PC に見つからない）'
    pg = await open_app(p)
    seen = []
    async def route(r):
        u = r.request.url; seen.append(u)
        if u.endswith('.css'):
            w = re.search(r'(\d{3})\.css$', u)
            name = 'Gen Interface JP Display' if '/display-' in u else 'Gen Interface JP' if 'gen-interface-jp' in u else 'Notofit JP' if 'notofit-jp' in u else 'TJ Plus Sans'
            weight = w.group(1) if w else '300 800'
            css = f'@font-face{{font-family:"{name}";font-weight:{weight};src:url("./w/x.woff2");unicode-range:U+0000-FFFF}}'
            return await r.fulfill(body=css, headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/css'})
        return await r.fulfill(path=SYSTEM_TTF, headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'font/ttf'})
    await pg.route('**/cdn.jsdelivr.net/npm/**', route)
    await pg.evaluate("selectLayer(DOC.layers.find(l => l.type === 'text').id)"); await page(pg, 'txt-font')
    assert await pg.evaluate(f"{FAMS!r}.every(f => findFont(f) && findFont(f).src === 'npm' && findFont(f).cat === 'ゴシック')"), '一覧に4書体が入っていない'
    await pg.select_option('#fcat', 'web'); await pg.wait_for_timeout(400)
    for fam in FAMS:
        await pg.click(f'#flist .fi[data-family="{fam}"]'); await settle(pg, 1800)
        ok = await pg.evaluate(f"[S.font, [...document.fonts].some(f => f.family.replace(/\"/g, '') === '{fam}' && f.status === 'loaded')]")
        assert ok == [fam, True], f'{fam} を読み込めない {ok}'
    # 太さの切り替え：Notofit JP は太さごとのCSS
    await pg.evaluate("S.font = 'Notofit JP'; fixWeight(); buildWeight()"); n0 = len(seen)
    await pg.evaluate("S.weight = 700; schedule()"); await settle(pg, 1800)
    assert any(u.endswith('notofit-jp@0.2.0/700.css') for u in seen[n0:]), f'700 のCSSを読んでいない {seen[n0:]}'
    # 選べる太さは、そのフォントにある太さだけ
    assert await pg.evaluate("weightsOf(findFont('TJ Plus Sans'))") == [300, 400, 500, 600, 700, 800]
    await close(pg)
