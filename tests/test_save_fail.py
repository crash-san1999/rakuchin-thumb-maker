"""保存の失敗：自動保存や画像の保存に失敗したら、黙って消さずに知らせる（続けて何度も出さない）"""
from helpers import *

async def run(p):
    pg = await open_app(p)
    await pg.evaluate("(() => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; })()")
    await pg.evaluate("saveWarnAt = 0; LS.set('x', {a:1})"); await settle(pg, 200)
    t = await pg.evaluate("[$('#toast').textContent, $('#toast').className]")
    assert '自動保存できませんでした' in t[0] and 'err' in t[1], f'失敗が知らされない {t}'
    # 30秒以内に続けても、もう一度は出ない
    await pg.evaluate("$('#toast').textContent = ''; $('#toast').className = 'toast'; LS.set('y', 1)")
    assert await pg.evaluate("$('#toast').textContent") == '', '続けて何度も出ている'
    # 画像の保存（IndexedDB）の失敗
    await pg.evaluate("saveWarnAt = 0; $('#toast').textContent = ''; (() => { idbP = Promise.resolve({transaction(){ throw new Error('quota'); }}); })()")
    await pg.evaluate("idbPut('Ztest', {src:'x', name:'n'})"); await settle(pg, 300)
    assert '画像をブラウザに保存できませんでした' in await pg.evaluate("$('#toast').textContent"), '画像の保存失敗が知らされない'
    await close(pg)
    return '自動保存・画像保存の失敗を知らせる、続けて出さない'
