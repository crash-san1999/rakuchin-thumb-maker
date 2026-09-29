"""切り抜きフレームの調整：画像は動かずフレームだけが動く"""
from helpers import *
IMGPOS = "(() => { const L = selLayer(), G = frameGeom(L); return [Math.round(L.x - G.cxp * L.sc), Math.round(L.y - G.cyp * L.sc), L.frame.fs, L.frame.cx, L.frame.cy]; })()"

async def run(p):
    pg = await open_app(p)
    await pg.set_input_files('#bgimgfile', IMG['city.jpg']); await settle(pg, 1000)
    await pg.set_input_files('#imgfile', IMG['chara.jpg']); await settle(pg, 1500)
    await page(pg, 'lay-frame'); await pg.click('[data-frpre=cyber]'); await settle(pg, 1200)
    start = await pg.evaluate(IMGPOS)
    await pg.click('#frameEditBtn'); await settle(pg, 800)
    assert await pg.evaluate("edit && edit.kind") == 'frame'
    box = await canvas_box(pg); k = box[2] / 1920; L = await pg.evaluate("[selLayer().x, selLayer().y]")
    cx, cy = box[0] + L[0] * k, box[1] + L[1] * k
    await pg.mouse.move(cx, cy)
    for _ in range(5): await pg.mouse.wheel(0, 120); await pg.wait_for_timeout(50)
    await pg.wait_for_timeout(300)
    after = await pg.evaluate(IMGPOS)
    assert after[2] < 0.6 and after[:2] == start[:2], f'ホイールで画像が動いた/縮まない {start} -> {after}'
    await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.mouse.move(cx - 30, cy - 60, steps=8); await pg.mouse.up(); await settle(pg, 800)
    moved = await pg.evaluate(IMGPOS)
    assert moved[:2] == start[:2] and moved[3:] != after[3:], f'ドラッグで画像が動いた/フレームが動かない {after} -> {moved}'
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
    assert await pg.evaluate("edit") is None and await pg.evaluate("DOC.sel !== null")
    await pg.evaluate("(() => { const el = document.querySelector('input[type=range][data-d=\"@frame.cx\"]'); el.value = 0.3; el.dispatchEvent(new Event('input', {bubbles:true})); })()")
    assert (await pg.evaluate(IMGPOS))[:2] == start[:2], 'スライダーで画像が動いた'
    for k2 in await pg.evaluate("FRAME_PRESETS.map(p => p[0])"):
        await pg.click(f'[data-frpre="{k2}"]')
    await settle(pg, 1200)
    await close(pg)
