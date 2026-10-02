"""画像レイヤーの効果（分割フレームのマスと同じ）：コントラスト・色相・ぼかし・トーン・モザイク・暗く・周辺減光・色を重ねる・ズーム／モーションブラー、
   ワンクリック効果、切り抜きフレーム付きでも効く、元に戻す、古い保存データ・不正な色の読み込み"""
from helpers import *

STAT = """(() => { DOC.bg.hidden = true; DOC.layers.forEach(l => { l.hidden = l.type !== 'image'; }); prevCache.clear(); paintPreview(false);
  const c = document.querySelector('#tv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let b = 0, s = 0, n = 0, e = 0, pv = -1;
  for(let i = 0; i < d.length; i += 4){ if(d[i + 3] < 250) continue; n++; const v = d[i] + d[i + 1] + d[i + 2]; b += v; s += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]); if(pv >= 0) e += Math.abs(v - pv); pv = v; }
  return {b: b / Math.max(1, n), s: s / Math.max(1, n), e: e / Math.max(1, n), n}; })()"""

async def run(p):
    pg = await open_app(p)
    await pg.set_input_files('#imgfile', [IMG['synth.jpg']]); await settle(pg, 1800)
    await pg.evaluate("(() => { const L = DOC.layers.find(l => l.type === 'image'); Object.assign(L, {x:960, y:540, sc:1080 / ASSETS[L.asset].img.naturalHeight}); L.outline.on = false; L.shadow.on = false; selectLayer(L.id); docChanged(false); })()")
    assert await pg.evaluate("imgFxOn(selLayer())") is False, '既定で効果が有効になっている'
    await page(pg, 'lay-color'); await settle(pg, 500)
    # 画面に、効果の部品が並んでいる（分割フレームの効果タブと同じ）
    keys = await pg.evaluate("[...document.querySelectorAll('[data-d]')].filter(e => e.offsetParent).map(e => e.dataset.d)")
    for k in ['@bright', '@sat', '@fx.contrast', '@fx.hue', '@fx.blur', '@fx.dim', '@fx.vignette']:
        assert k in keys, f'色タブに {k} がない {keys}'
    assert await pg.evaluate("[...document.querySelectorAll('[data-cfx]')].filter(e => e.offsetParent).length") >= 8, 'ワンクリック効果が出ない'
    base = await pg.evaluate(STAT)

    async def slide(key, v):
        await pg.evaluate(f"""(() => {{ const el = [...document.querySelectorAll('[data-d="{key}"]')].find(e => e.offsetParent); el.value = {v}; el.dispatchEvent(new Event('input', {{bubbles:true}})); }})()""")
        await settle(pg, 500)
    async def reset():
        await pg.click('#imgColorReset'); await settle(pg, 500)

    await slide('@fx.dim', 0.6); r = await pg.evaluate(STAT)
    assert r['b'] < base['b'] * 0.6, f'暗くするが効かない {base} {r}'; await reset()
    await slide('@fx.blur', 12); r = await pg.evaluate(STAT)
    assert r['e'] < base['e'] * 0.8, f'ぼかしが効かない {base} {r}'; await reset()
    await slide('@fx.contrast', 1); r = await pg.evaluate(STAT)
    assert abs(r['b'] - base['b']) > 5 or abs(r['s'] - base['s']) > 3, f'コントラストが効かない {base} {r}'; await reset()
    await slide('@fx.hue', 120); r = await pg.evaluate(STAT)
    assert abs(r['b'] - base['b']) > 3, f'色相が効かない {base} {r}'; await reset()
    await slide('@fx.vignette', 1); r = await pg.evaluate(STAT)
    assert r['b'] < base['b'] * 0.92, f'周辺減光が効かない {base} {r}'; await reset()
    # トーン：モノクロで色の広がりが無くなる
    await pg.evaluate("(() => { selLayer().fx.tone = 'mono'; docChanged(false); syncDoc(); })()"); await settle(pg, 500)
    r = await pg.evaluate(STAT); assert r['s'] < 4 and base['s'] > 20, f'モノクロにならない {base} {r}'; await reset()
    # モザイク・モーション・ズームブラー・色を重ねる（描画が落ちず、見た目が変わる）
    for js in ["selLayer().fx.mosaic.on = true", "selLayer().fx.mb.on = true", "selLayer().fx.zb.on = true", "Object.assign(selLayer().fx.tint, {on:true, c:'#ff0000', a:0.8, mode:'multiply'})"]:
        await pg.evaluate(f"(() => {{ {js}; docChanged(false); }})()"); await settle(pg, 500)
        r = await pg.evaluate(STAT); assert r['n'] > 0 and (abs(r['b'] - base['b']) > 0.5 or abs(r['e'] - base['e']) > 0.5), f'{js} が効かない {base} {r}'
        await reset()
    assert await pg.evaluate("imgFxOn(selLayer())") is False, '「元に戻す」で効果が残る'
    # ワンクリック効果：明度・彩度は L.bright / L.sat へ、そのほかは L.fx へ
    await pg.evaluate("[...document.querySelectorAll('[data-cfx=\"vivid\"]')].find(e => e.offsetParent).click()"); await settle(pg, 500)
    assert await pg.evaluate("[selLayer().sat, selLayer().fx.contrast, selLayer().fx.sat]") == [0.45, 0.18, 0], 'ワンクリック効果の値が入らない'
    await pg.evaluate("[...document.querySelectorAll('[data-cfx=\"dark\"]')].find(e => e.offsetParent).click()"); await settle(pg, 500)
    assert await pg.evaluate("[selLayer().sat, selLayer().fx.dim > 0, imgFxOn(selLayer())]") == [0, True, True]
    await reset()
    # 切り抜きフレーム付きでも効く
    await pg.evaluate("(() => { const L = selLayer(); L.frame.shape = 'circle'; docChanged(false); })()"); await settle(pg, 700)
    fb = await pg.evaluate(STAT)
    await slide('@fx.dim', 0.6); r = await pg.evaluate(STAT)
    assert r['b'] < fb['b'] * 0.6, f'フレーム付きの画像で効果が効かない {fb} {r}'; await reset()
    # 古い保存データ（fx なし）と不正な色
    ok = await pg.evaluate("(() => { const d = JSON.parse(JSON.stringify(DOC)); d.layers.forEach(l => { delete l.fx; }); return normalizeDoc(d).layers.filter(l => l.type === 'image').every(l => l.fx && l.fx.tone === 'none' && l.fx.zb.on === false); })()")
    assert ok, '古い保存データを読み込めない'
    bad = await pg.evaluate("(() => { const d = JSON.parse(JSON.stringify(DOC)); d.layers.forEach(l => { if(l.type === 'image'){ l.fx.duo1 = 'url(x)'; l.fx.tint = {on:true, c:'</style><script>', a:1, mode:'overlay'}; } }); const L = normalizeDoc(d).layers.find(l => l.type === 'image'); return [L.fx.duo1, L.fx.tint.c]; })()")
    assert bad == ['#1b1464', '#ff7a50'], f'不正な色が残る {bad}'
    await close(pg)
    return '画像レイヤーの効果（暗く・ぼかし・コントラスト・色相・周辺減光・トーン・モザイク・ブラー・色を重ねる）／ワンクリック効果／フレーム付き／元に戻す／古いデータ・不正な色'
