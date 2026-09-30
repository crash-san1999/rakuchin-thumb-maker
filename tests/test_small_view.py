"""「小さく表示」ボタン：押すと「大きく表示」に切り替わり、もう一度押すと元に戻る"""
from helpers import *

async def run(p):
    pg = await open_app(p)
    st = "[$('#stage').classList.contains('small'), $('#smallBtn').textContent.trim(), $('#smallBtn').classList.contains('on'), !!$('#smallBtn svg')]"
    assert await pg.evaluate(st) == [False, '小さく表示', False, True]
    w0 = (await canvas_box(pg))[2]
    await pg.click('#smallBtn'); await settle(pg, 600)
    assert await pg.evaluate(st) == [True, '大きく表示', True, True], '押した後にボタンが「大きく表示」にならない'
    assert (await canvas_box(pg))[2] < w0 * 0.6, 'プレビューが小さくならない'
    # 背景の切り替えなどでプレビューの状態が更新されても表示は保たれる
    await pg.evaluate("paintPreview(false)")
    assert await pg.evaluate(st) == [True, '大きく表示', True, True]
    await pg.click('#smallBtn'); await settle(pg, 600)
    assert await pg.evaluate(st) == [False, '小さく表示', False, True], '2回目で元に戻らない'
    assert abs((await canvas_box(pg))[2] - w0) < 2, '元の大きさに戻らない'
    await close(pg)
