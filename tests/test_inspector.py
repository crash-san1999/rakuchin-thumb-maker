"""設定パネルが選んだものに合わせて切り替わる"""
from helpers import *

async def run(p):
    pg = await open_app(p)
    await pg.click('#addBtn'); await pg.wait_for_timeout(300)
    assert await pg.evaluate("document.querySelector('#addMenu').classList.contains('show')"), '追加メニューが開かない'
    await pg.click('#addImg'); await pg.set_input_files('#imgfile', IMG['chara.jpg']); await settle(pg, 1500)
    assert await pg.evaluate("insCtx()") == 'image'
    assert await pg.evaluate("[...document.querySelectorAll('#tabs [data-page]')].map(b => b.dataset.page)") == ['lay-base', 'lay-frame', 'lay-edge']
    await pg.evaluate("selectLayer(DOC.layers.find(l => l.type === 'text').id)")
    assert await pg.evaluate("[insCtx(), curPage]") == ['text', 'txt-text']
    for pgn in ['txt-style', 'txt-font', 'txt-deco', 'lay-base']:
        await page(pg, pgn); assert await pg.evaluate('curPage') == pgn
    await pg.evaluate("addCollage()"); await pg.wait_for_timeout(500)
    assert await pg.evaluate("[insCtx(), curPage]") == ['collage', 'lay-split']
    await pg.click('#addBtn'); await pg.click('#addMenu [data-addfx="lines"]'); await pg.wait_for_timeout(500)
    assert await pg.evaluate("[insCtx(), document.querySelector('#addMenu').classList.contains('show')]") == ['fx', False], '追加後にメニューが閉じない'
    await pg.click('#insDesel'); await pg.wait_for_timeout(300)
    assert await pg.evaluate('insCtx()') == 'bg'
    await pg.click('#fileBtn'); await pg.wait_for_timeout(300)
    assert await pg.evaluate("document.querySelector('#fileMenu').classList.contains('show')")
    await pg.keyboard.press('Escape')
    await pg.click('#modeSeg [data-mode=text]'); await pg.wait_for_timeout(800)
    assert await pg.evaluate("[insCtx(), getComputedStyle(document.querySelector('#insDesel')).display]") == ['textmode', 'none']
    await close(pg)
