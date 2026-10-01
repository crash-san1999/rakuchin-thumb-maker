"""新規作成：ボタン→確認の画面→（保存してから／保存せずに）まっさらにする。サイズは残せる。取り消しで戻せる"""
from helpers import *

async def run(p):
    pg = await open_app(p)
    pg.on('dialog', lambda d: asyncio.ensure_future(d.dismiss()))
    # 作業中の状態をつくる：サイズ変更・文字を追加・背景を変える
    await pg.evaluate("(() => { DOC.w = 1080; DOC.h = 1920; DOC.exportW = 1080; DOC.fmt = 'jpg'; DOC.bg.type = 'solid'; DOC.bg.color = '#123456'; addFx('confetti'); docChanged(false); })()"); await settle(pg, 300)
    n0 = await pg.evaluate("DOC.layers.length"); assert n0 >= 2
    # 1) ボタンで確認の画面が出る。やめる／Escで閉じて、何も変わらない
    await pg.click('#newBtn'); await settle(pg, 200)
    assert await pg.evaluate("$('#newModal').classList.contains('show')"), '確認の画面が出ない'
    await pg.click('#newModal [data-new-close].btn'); await settle(pg, 200)
    assert not await pg.evaluate("$('#newModal').classList.contains('show')") and await pg.evaluate("DOC.layers.length") == n0
    await pg.click('#newBtn'); await pg.keyboard.press('Escape'); await settle(pg, 200)
    assert not await pg.evaluate("$('#newModal').classList.contains('show')"), 'Escで閉じない'
    # 2) 保存せずに新規作成：中身はまっさら、サイズ・形式は今のまま
    await pg.click('#newBtn'); await pg.click('#newNoSave'); await settle(pg, 500)
    r = await pg.evaluate("[DOC.w, DOC.h, DOC.exportW, DOC.fmt, DOC.bg.type, DOC.layers.some(l => l.type === 'fx'), DOC.mode, $('#newModal').classList.contains('show')]")
    assert r[:3] == [1080, 1920, 1080] and r[3] == 'jpg', f'サイズ・形式が残らない {r}'
    assert r[4] != 'solid' and r[5] is False and r[6] == 'thumb' and r[7] is False, f'まっさらになっていない {r}'
    # 3) 取り消しで元に戻る
    await pg.keyboard.press('Control+z'); await settle(pg, 800)
    assert await pg.evaluate("[DOC.bg.type, DOC.layers.some(l => l.type === 'fx')]") == ['solid', True], '取り消しで戻らない'
    # 4) 保存してから新規作成：ファイルがダウンロードされ、そのあとまっさらになる。サイズも初期に戻せる
    await pg.click('#newBtn'); await pg.uncheck('#newKeepSize')
    async with pg.expect_download() as dl:
        await pg.click('#newSave')
    d = await dl.value; assert d.suggested_filename.startswith('rakuchin-thumb-project_') and d.suggested_filename.endswith('.json'), d.suggested_filename
    import json; j = json.load(open(await d.path()))
    assert j['doc']['bg']['color'] == '#123456' and j['doc']['w'] == 1080, '保存された内容が、新規作成前の状態でない'
    await settle(pg, 500)
    r = await pg.evaluate("[DOC.w, DOC.h, DOC.bg.type, DOC.layers.some(l => l.type === 'fx')]")
    assert r[0] == 1920 and r[1] == 1080 and r[2] != 'solid' and r[3] is False, f'初期の状態に戻らない {r}'
    # 5) ファイルメニューからも開ける
    await pg.click('#fileBtn'); await pg.click('#newBtn2'); await settle(pg, 200)
    assert await pg.evaluate("$('#newModal').classList.contains('show') && !$('#fileMenu').classList.contains('show')"), 'ファイルメニューから開けない'
    await close(pg)
    return '確認の画面・保存せずに／保存してから新規作成・サイズを残す／戻す・Escで閉じる・ファイルメニューからも'
