"""背景シェイプの吹き出し系：各形が描けて、しっぽの向き・なしが効く"""
from helpers import *

R = """async ([sh, tail]) => { await ensureFont(S); const c = render(0.5, merged(Object.assign({}, clone(S), {text:'こんにちは', size:100, skew:0, shadow:{on:false}, plate:Object.assign(clone(S.plate), {on:true, shape:sh, tail, sw:6})})));
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for(let i = 3; i < d.length; i += 4) if(d[i] > 20) n++; return [c.width, c.height, n]; }"""

async def run(p):
    pg = await open_app(p)
    for sh in ['bubble', 'sbubble', 'obubble', 'cloud', 'shout']:
        none = await pg.evaluate(R, [sh, 'none'])
        assert none[2] > 500, f'{sh} が描けない {none}'
        for t in ['left', 'center', 'right', 'tl', 'tr', 'sl', 'sr']:
            r = await pg.evaluate(R, [sh, t])
            assert r[2] > none[2] or r[:2] != none[:2], f'{sh}/{t} のしっぽが出ない {r} {none}'
    old = await pg.evaluate(R, ['bubble', 'left']); assert old[2] > 500
    vis = "(sel) => [...document.querySelectorAll(sel)].some(e => e.offsetParent !== null)"
    await pg.evaluate("selectLayer(DOC.layers.find(l => l.type === 'text').id)"); await page(pg, 'txt-deco')
    await pg.evaluate("S.plate.on = true; S.plate.shape = 'cloud'; syncUI(); schedule(); document.querySelector('section[data-on=\"plate.on\"]').classList.remove('collapsed')"); await settle(pg, 300)
    assert await pg.evaluate(vis, '[data-k="plate.tail"]') and await pg.evaluate(vis, '[data-k="plate.ts"]'), 'しっぽの設定が出ない'
    await close(pg)
