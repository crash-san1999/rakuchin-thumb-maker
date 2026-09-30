"""画像の表示範囲（上下左右トリミング）：スライダーで切れる、見えている部分は動かない、フレーム付きでも効く、戻す、古い保存データ"""
from helpers import *

async def run(p):
    pg = await open_app(p)
    await pg.set_input_files('#imgfile', [IMG['synth.jpg']]); await settle(pg, 1800)
    await pg.evaluate("(() => { const L = DOC.layers.find(l => l.type === 'image'); Object.assign(L, {x:960, y:540, sc:0.5}); L.outline.on = false; L.shadow.on = false; selectLayer(L.id); docChanged(false); })()")
    assert await pg.evaluate("selLayer().crop") == {'t': 0, 'b': 0, 'l': 0, 'r': 0}
    await page(pg, 'lay-frame'); await settle(pg, 400)
    w0 = await pg.evaluate("dims.get(selLayer().id).w"); h0 = await pg.evaluate("dims.get(selLayer().id).h")
    left0 = await pg.evaluate("960 - 0") and await pg.evaluate("selLayer().x - dims.get(selLayer().id).w / 2")

    async def slide(key, v):
        await pg.evaluate(f"""(() => {{ const el = [...document.querySelectorAll('[data-d="{key}"]')].find(e => e.offsetParent); el.value = {v}; el.dispatchEvent(new Event('input', {{bubbles:true}})); }})()""")
        await settle(pg, 700)
    await slide('@crop.l', 0.25); await slide('@crop.t', 0.5)
    w1 = await pg.evaluate("dims.get(selLayer().id).w"); h1 = await pg.evaluate("dims.get(selLayer().id).h")
    assert abs(w1 / w0 - 0.75) < 0.03 and abs(h1 / h0 - 0.5) < 0.03, f'切った分だけ小さくならない {w0} {h0} {w1} {h1}'
    # 見えている部分は動かない：左上の端の位置は変わらない、下端も変わらない
    L = await pg.evaluate("(() => { const L = selLayer(), d = dims.get(L.id); return [L.x - d.w / 2, L.y - d.h / 2, L.y + d.h / 2]; })()")
    top0 = 540 - h0 / 2
    assert abs(L[1] - (top0 + h0 * 0.5)) < 8 and abs(L[2] - (540 + h0 / 2)) < 8, f'トリミングで見えている部分が動いた {L}'
    assert abs(L[0] - (960 - w0 / 2 + w0 * 0.25)) < 8, f'左の位置が動いた {L}'
    # 右・下も
    await slide('@crop.r', 0.25); await slide('@crop.b', 0.25)
    assert await pg.evaluate("Math.abs(dims.get(selLayer().id).w / %f - 0.5) < 0.03" % w0), '右を切っても小さくならない'
    # フレーム付きでも効く（絵が切り取った範囲になる）
    await pg.evaluate("(() => { const L = selLayer(); L.frame.shape = 'rect'; L.frame.style = 'none'; docChanged(false); })()"); await settle(pg, 700)
    ok = await pg.evaluate("(() => { const L = selLayer(), G = frameGeom(L); return Math.abs(G.iw - ASSETS[L.asset].img.naturalWidth * 0.5) < 3; })()")
    assert ok, 'フレーム付きで切り取りが効かない'
    await pg.evaluate("selLayer().frame.shape = 'none'; docChanged(false)"); await settle(pg, 500)
    # 戻す
    await pg.evaluate("syncDoc()"); await page(pg, 'lay-frame'); await pg.click('#cropReset'); await settle(pg, 1800)
    assert await pg.evaluate("selLayer().crop") == {'t': 0, 'b': 0, 'l': 0, 'r': 0}, '戻せない'
    w2 = await pg.evaluate("dims.get(selLayer().id).w"); assert abs(w2 - w0) < 2, f'戻しても元の大きさにならない {w0} {w2}'
    c = await pg.evaluate("[selLayer().x, selLayer().y]"); assert abs(c[0] - 960) < 2 and abs(c[1] - 540) < 2, f'戻しても元の位置にならない {c}'
    # 古い保存データ・不正値
    ok = await pg.evaluate("(() => { const d = JSON.parse(JSON.stringify(DOC)); d.layers.forEach(l => { delete l.crop; }); return normalizeDoc(d).layers.filter(l => l.type === 'image').every(l => l.crop.t === 0 && l.crop.r === 0); })()")
    assert ok, '古い保存データを読み込めない'
    await close(pg)
