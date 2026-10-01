"""ドラッグ＆ドロップ：分割フレームがあっても、ふつうは画像レイヤーとして追加される（選んでいる分割フレームのマスに落としたときだけマスに入る）"""
from helpers import *

async def run(p):
    pg = await open_app(p)
    await pg.evaluate("addCollage && addCollage()") if await pg.evaluate("typeof addCollage === 'function'") else None
    if not await pg.evaluate("DOC.layers.some(l => l.type === 'collage')"):
        await pg.click('#addBtn'); await settle(pg, 300); await pg.click('#addCollageBtn'); await settle(pg, 800)
    cid = await pg.evaluate("DOC.layers.find(l => l.type === 'collage').id")
    await pg.evaluate("window.mkFile = () => { const c = document.createElement('canvas'); c.width = 80; c.height = 60; c.getContext('2d').fillRect(0, 0, 80, 60); return new Promise(r => c.toBlob(b => r(new File([b], 'a.png', {type:'image/png'})))); }")
    box = await pg.eval_on_selector('#tv', 'e => { const r = e.getBoundingClientRect(); return [r.left + r.width * 0.25, r.top + r.height * 0.5]; }')
    # 分割フレームを選んでいない → 落とした画像は、そのまま返される（＝画像レイヤーになる）
    await pg.evaluate("selectLayer(null)")
    r = await pg.evaluate("(async () => { const f = await mkFile(); const rest = await collageTakeFiles([f], %f, %f); return [rest.length, DOC.layers.find(l => l.type === 'collage').cells.filter(c => c.asset).length]; })()" % (box[0], box[1]))
    assert r == [1, 0], f'選んでいない分割フレームのマスに入ってしまった {r}'
    # 選んでいて、そのマスの上に落とす → マスに入る
    await pg.evaluate(f"selectLayer('{cid}')")
    r = await pg.evaluate("(async () => { const f = await mkFile(); const rest = await collageTakeFiles([f], %f, %f); return [rest.length, DOC.layers.find(l => l.type === 'collage').cells.filter(c => c.asset).length]; })()" % (box[0], box[1]))
    assert r == [0, 1], f'選んでいる分割フレームのマスに入らない {r}'
    # 選んでいても、マスの外（キャンバスの外）に落とした → 画像レイヤー
    r = await pg.evaluate("(async () => { const f = await mkFile(); const rest = await collageTakeFiles([f], 5, 5); return rest.length; })()")
    assert r == 1, '選んでいても、キャンバスの外のドロップが分割フレームに入った'
    await close(pg)
