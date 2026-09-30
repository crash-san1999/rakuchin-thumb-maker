"""画像の明度・彩度：スライダーで変わる、フチ・影は変わらない、切り抜きフレーム付きでも効く、元に戻す、古い保存データの読み込み"""
from helpers import *

# 画像レイヤーだけを描いた、キャンバス中央あたりの平均（明るさ・色の広がり）
STAT = """(() => { DOC.bg.hidden = true; DOC.layers.forEach(l => { l.hidden = l.type !== 'image'; }); prevCache.clear(); paintPreview(false);
  const c = document.querySelector('#tv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let b = 0, s = 0, n = 0;
  for(let i = 0; i < d.length; i += 20){ if(d[i + 3] < 250) continue; n++; b += d[i] + d[i + 1] + d[i + 2]; s += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]); }
  return [b / Math.max(1, n), s / Math.max(1, n), n]; })()"""

async def run(p):
    pg = await open_app(p)
    await pg.set_input_files('#imgfile', [IMG['synth.jpg']]); await settle(pg, 1800)
    await pg.evaluate("(() => { const L = DOC.layers.find(l => l.type === 'image'); Object.assign(L, {x:960, y:540, sc:1080 / ASSETS[L.asset].img.naturalHeight}); L.outline.on = false; L.shadow.on = false; selectLayer(L.id); docChanged(false); })()")
    assert await pg.evaluate("[selLayer().bright, selLayer().sat]") == [0, 0], '既定値が 0 になっていない'
    tabs = await pg.evaluate("[...document.querySelectorAll('#tabs [data-page]')].map(b => b.dataset.page)")
    assert 'lay-color' in tabs, f'「色」タブがない {tabs}'
    await page(pg, 'lay-color'); await settle(pg, 500)
    base = await pg.evaluate(STAT)

    async def slide(key, v):
        await pg.evaluate(f"""(() => {{ const el = [...document.querySelectorAll('[data-d="{key}"]')].find(e => e.offsetParent); el.value = {v}; el.dispatchEvent(new Event('input', {{bubbles:true}})); }})()""")
        await settle(pg, 500)
    await slide('@bright', -0.5)
    dark = await pg.evaluate(STAT); assert dark[0] < base[0] * 0.75, f'明度を下げても暗くならない {base} {dark}'
    await slide('@bright', 0.5)
    light = await pg.evaluate(STAT); assert light[0] > base[0] * 1.1, f'明度を上げても明るくならない {base} {light}'
    await slide('@bright', 0)
    await slide('@sat', -1)
    gray = await pg.evaluate(STAT); assert gray[1] < 4 and base[1] > 20, f'彩度を下げても白黒にならない {base} {gray}'
    await slide('@sat', 1)
    vivid = await pg.evaluate(STAT); assert vivid[1] > base[1] * 1.15, f'彩度を上げても鮮やかにならない {base} {vivid}'

    # 切り抜きフレーム付きでも効く
    await pg.evaluate("(() => { const L = selLayer(); L.frame.shape = 'circle'; L.sat = 0; L.bright = 0; docChanged(false); })()"); await settle(pg, 700)
    fb = await pg.evaluate(STAT)
    await slide('@bright', -0.5)
    fd = await pg.evaluate(STAT); assert fd[0] < fb[0] * 0.75, f'フレーム付きの画像で明度が効かない {fb} {fd}'

    # 元に戻す
    await pg.click('#imgColorReset'); await settle(pg, 500)
    assert await pg.evaluate("[selLayer().bright, selLayer().sat]") == [0, 0], '「元に戻す」が効かない'
    # 古い保存データ
    ok = await pg.evaluate("(() => { const d = JSON.parse(JSON.stringify(DOC)); d.layers.forEach(l => { delete l.bright; delete l.sat; }); return normalizeDoc(d).layers.filter(l => l.type === 'image').every(l => l.bright === 0 && l.sat === 0); })()")
    assert ok, '古い保存データを読み込めない'
    await close(pg)
