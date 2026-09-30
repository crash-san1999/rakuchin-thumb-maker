"""キャンバスのサイズ：縦配信(1080×1920)などのプリセット、自由指定、中身の置き直し、書き出しの縦横比、元に戻す、古い保存データ、スマホ"""
from helpers import *

async def run(p):
    pg = await open_app(p)
    assert await pg.evaluate("[DOC.w, DOC.h]") == [1920, 1080]
    await pg.evaluate("(() => { const L = DOC.layers[0]; L.x = 480; L.y = 270; L.sc = 1; docChanged(false); })()")
    before = await pg.evaluate("(() => { const L = DOC.layers[0]; return [L.x, L.y, L.sc]; })()")

    await pg.click('#canvasBtn'); await pg.wait_for_timeout(300)
    # プリセットで縦配信サイズへ
    await pg.select_option('#canvasPreset', '1080x1920'); await settle(pg, 900)
    assert await pg.evaluate("[DOC.w, DOC.h]") == [1080, 1920], 'プリセットが反映されない'
    after = await pg.evaluate("(() => { const L = DOC.layers[0]; return [L.x, L.y, L.sc]; })()")
    assert after[0] == round(before[0] * 1080 / 1920) and after[1] == round(before[1] * 1920 / 1080), f'位置が置き直されない {after}'
    assert abs(after[2] - before[2] * 0.5625) < 0.01, f'大きさが縮まない {after}'
    box = await canvas_box(pg); assert abs(box[2] / box[3] - 1080 / 1920) < 0.02, f'プレビューが縦長でない {box}'
    tv = await pg.evaluate("(() => { const c = document.querySelector('#tv'); return [c.width, c.height]; })()")
    assert abs(tv[0] / tv[1] - 1080 / 1920) < 0.02, f'プレビューの縦横比 {tv}'
    # 書き出しの縦横比
    ex = await pg.evaluate("(async () => { const b = await thumbBlob('png'); const im = await createImageBitmap(b); return [im.width, im.height]; })()")
    assert ex == [1080, 1920] or abs(ex[0] / ex[1] - 1080 / 1920) < 0.01, f'書き出しの縦横比 {ex}'
    opts = await pg.evaluate("[...document.querySelector('select[data-d=\"exportW\"]').options].map(o => o.textContent)")
    assert any('×1920' in o for o in opts), f'書き出しサイズの表示 {opts}'
    # 新しく足すレイヤーは新しい中心
    await pg.evaluate("addFx('light')") if await pg.evaluate("typeof addFx === 'function'") else None
    await pg.wait_for_timeout(300)

    # 元に戻す
    await pg.evaluate("pushHist()"); await pg.keyboard.press('Control+z'); await settle(pg, 600)

    # 自由指定
    await pg.fill('#cvW', '1500'); await pg.fill('#cvH', '600'); await pg.click('#cvApply'); await settle(pg, 900)
    assert await pg.evaluate("[DOC.w, DOC.h]") == [1500, 600], '自由指定が反映されない'
    assert await pg.evaluate("document.querySelector('#canvasPreset').value") == 'custom'
    # 範囲外は無視
    await pg.fill('#cvW', '90000'); await pg.click('#cvApply'); await settle(pg, 400)
    assert await pg.evaluate("[DOC.w, DOC.h]") == [1500, 600], '範囲外が通ってしまう'
    # 中身をそのままにする（置き直さない）
    await pg.evaluate("document.querySelector('#cvFit').checked = false")
    x0 = await pg.evaluate("DOC.layers[0].x")
    await pg.select_option('#canvasPreset', '1920x1080'); await settle(pg, 700)
    assert await pg.evaluate("DOC.layers[0].x") == x0, '置き直さない設定なのに動いた'

    # 古い保存データ・不正な値
    r = await pg.evaluate("(() => { const d = JSON.parse(JSON.stringify(DOC)); delete d.w; delete d.h; const a = normalizeDoc(d); const e = JSON.parse(JSON.stringify(DOC)); e.w = 99999; e.h = -5; const b = normalizeDoc(e); return [a.w, a.h, b.w, b.h]; })()")
    assert r == [1920, 1080, 5000, 200], f'読み込み時の補正 {r}'
    await close(pg)

    # スマホ（縦配信サイズ）
    pg = await open_app(p, mobile=True)
    await pg.evaluate("setCanvasSize(1080, 1920, true)"); await settle(pg, 900)
    box = await canvas_box(pg)
    vw = await pg.evaluate("innerWidth")
    assert box[0] >= -1 and box[0] + box[2] <= vw + 1 and box[3] > box[2], f'スマホで縦キャンバスが収まらない {box} {vw}'
    await close(pg)
