"""分割フレームのマス：キャンバスのボタンで調整、別のマスへドラッグで入れ替え、回転・反転・元に戻す、一覧のドラッグで入れ替え、古い保存データ"""
from helpers import *

async def run(p):
    pg = await open_app(p)
    # 分割フレームがないときは、起動直後でも「マスの画像を動かす」ボタンが見えない（hidden が CSS の display に負けないこと）
    assert await pg.evaluate("getComputedStyle($('#cellFab')).display") == 'none', '分割フレームがないのにボタンが出ている'
    await pg.evaluate("addCollage()"); await pg.wait_for_timeout(500)
    await pg.evaluate("(() => { const L = selLayer(); Object.assign(L, {n:'2', layout:'cols', slant:0, edge:'straight', bstyle:'line'}); syncDoc(); docChanged(false); })()")
    await page(pg, 'lay-cells'); await pg.click('[data-cell="0"]')
    await pg.set_input_files('#cellfile', [IMG['city.jpg'], IMG['synth.jpg']]); await settle(pg, 2000)
    a0, a1 = await pg.evaluate("selLayer().cells.slice(0, 2).map(c => c.asset)")
    # 1) キャンバスの「マスの画像を動かす」ボタン
    assert await pg.evaluate("!$('#cellFab').hidden"), 'ボタンが出ない'
    await pg.click('#cellFab'); await settle(pg, 300)
    assert await pg.evaluate("edit && edit.kind") == 'cells', 'ボタンで調整に入れない'
    assert ' 終える' in ' ' + await pg.evaluate("$('#cellFab').textContent") or '終える' in await pg.evaluate("$('#cellFab').textContent")
    box = await canvas_box(pg)
    P = lambda u, v: (box[0] + box[2] * u, box[1] + box[3] * v)
    # 2) 同じマスの中のドラッグは移動
    await pg.mouse.move(*P(0.25, 0.5)); await pg.mouse.down(); await pg.mouse.move(*P(0.3, 0.55), steps=5); await pg.mouse.up(); await settle(pg, 300)
    c = await pg.evaluate("selLayer().cells[0]"); assert c['ox'] > 0 and c['asset'] == a0, f'移動できない {c}'
    # 3) 別のマスまで持っていくと入れ替え（位置ごと入れ替わり、動かした分は元に戻る）
    await pg.mouse.move(*P(0.25, 0.5)); await pg.mouse.down(); await pg.mouse.move(*P(0.75, 0.5), steps=8)
    assert await pg.evaluate("swapTarget && swapTarget.j") == 1, '入れ替え先が出ない'
    await pg.mouse.up(); await settle(pg, 400)
    r = await pg.evaluate("[selLayer().cells[0].asset, selLayer().cells[1].asset, selLayer().ac, swapTarget]")
    assert r == [a1, a0, 1, None], f'入れ替わらない {r}'
    # 4) 回転・反転（Shift＋ホイール、パネルのボタン）と元に戻す
    await pg.keyboard.down('Shift'); await pg.mouse.move(*P(0.75, 0.5)); await pg.mouse.wheel(0, 120); await pg.keyboard.up('Shift'); await settle(pg, 300)
    assert await pg.evaluate("selLayer().cells[1].rot") != 0, 'Shift＋ホイールで回転しない'
    await pg.keyboard.press('Escape'); await settle(pg, 200)
    await pg.evaluate("document.querySelector('[data-cellact=\"flip\"]').click()"); await settle(pg, 200)
    assert await pg.evaluate("selLayer().cells[1].flip") is True, '左右反転できない'
    h1 = await pg.evaluate("(() => { prevCache.clear(); const c = mk(480, 270); compose(c.getContext('2d'), 480, 270, false, new Map()); return c.toDataURL(); })()")
    await pg.evaluate("document.querySelector('[data-cellact=\"reset\"]').click()"); await settle(pg, 200)
    assert await pg.evaluate("(() => { const c = selLayer().cells[1]; return [c.zoom, c.ox, c.oy, c.rot, c.flip, c.flipV]; })()") == [1, 0, 0, 0, False, False], '元に戻らない'
    h2 = await pg.evaluate("(() => { const c = mk(480, 270); compose(c.getContext('2d'), 480, 270, false, new Map()); return c.toDataURL(); })()")
    assert h1 != h2, '回転・反転が描画に効いていない'
    # 5) 一覧のマスのドラッグで入れ替え
    await page(pg, 'lay-cells'); await settle(pg, 200)
    await pg.drag_and_drop('.cellbtn[data-cell="0"]', '.cellbtn[data-cell="1"]'); await settle(pg, 300)
    assert await pg.evaluate("selLayer().cells.slice(0, 2).map(c => c.asset)") == [a0, a1], '一覧のドラッグで入れ替わらない'
    # 6) 古い保存データ（回転・反転なし）も読める
    m = await pg.evaluate("(() => { const d = normalizeDoc({layers:[{type:'collage', id:'c', cells:[{asset:null, zoom:2, ox:.1, oy:0}]}]}); const c = d.layers[0].cells[0]; return [c.zoom, c.rot, c.flip]; })()")
    assert m == [2, 0, False], m
    await pg.evaluate("selectLayer(null)"); await settle(pg, 200)
    assert await pg.evaluate("$('#cellFab').hidden"), '選択を外してもボタンが残る'
    assert pg.errors == [], pg.errors
    await close(pg)
