"""編集モード（フレーム調整・マスの調整）のピンチ、初期化、取り消し後のキャッシュ掃除（スマホ表示）"""
from helpers import *

async def run(p):
    pg = await open_app(p, mobile=True)
    await pg.set_input_files('#imgfile', IMG['chara.jpg']); await settle(pg, 1500)
    r = await pg.evaluate("""(() => { const L = selLayer(); L.frame.shape = 'circle'; setEdit('frame', L); const P = editPinchStart({d:100}); editPinch(P, 0.5); const a = L.frame.fs;
      setEdit(null); addCollage(); const C = selLayer(); setEdit('cells', C, C.x, C.y); const Q = editPinchStart({d:100}); editPinch(Q, 2); return [P.kind, a, Q.kind, C.cells[C.ac].zoom, edit.kind]; })()""")
    assert r == ['edit', 0.5, 'edit', 2, 'cells'], r
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await pg.evaluate("(() => { const L = DOC.layers.find(l => l.type === 'text'); selectLayer(L.id); L.style.fill1 = '#123456'; L.style.text = 'のこす'; })()")
    await pg.evaluate("document.querySelector('#resetAll').click()"); await pg.wait_for_timeout(300)
    assert await pg.evaluate("(() => { const L = DOC.layers.find(l => l.type === 'text'); return [S === L.style, L.style.fill1 === DEFAULT.fill1, L.style.text]; })()") == [True, True, 'のこす']
    await pg.wait_for_timeout(800)  # 取り消し履歴は操作が 0.45 秒以内に続くとまとめて記録されるので、記録を待つ
    n = await pg.evaluate("DOC.layers.length"); await pg.evaluate("addFx('lines')"); await settle(pg, 1200)
    await pg.evaluate("restoreHist(hIdx - 1)"); await settle(pg, 1200)
    assert await pg.evaluate("[DOC.layers.length, [...prevCache.keys()].every(k => k === '__bg' || DOC.layers.some(l => l.id === k))]") == [n, True]
    await close(pg)
