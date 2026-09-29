"""分割フレーム：マスへの画像、分割のしかた・境界の組み合わせ、マスの調整、保存時の空きマス"""
from helpers import *

async def run(p):
    pg = await open_app(p)
    await pg.evaluate("addCollage()"); await pg.wait_for_timeout(500)
    await pg.click('.seg[data-dseg="@n"] [data-v="6"]')
    await page(pg, 'lay-cells'); await pg.click('[data-cell="0"]')
    await pg.set_input_files('#cellfile', [IMG[n] for n in ['city.jpg', 'synth.jpg', 'night.jpg', 'rings4.jpg', 'rings5.jpg', 'rings6.jpg']]); await settle(pg, 2500)
    assert await pg.evaluate("selLayer().cells.map(c => !!ASSETS[c.asset])") == [True] * 6
    combos = [('cols', 2, 0.35, 'zigzag', 'glow'), ('radial', 2, 0.3, 'straight', 'blur'), ('rows', 3, 0, 'wave', 'line'), ('bigL', 3, 0.2, 'straight', 'gap'),
              ('grid', 4, 0, 'straight', 'line'), ('radial', 4, 0.25, 'rough', 'line'), ('bigT', 5, 0, 'zigzag', 'shadow'), ('grid2', 6, 0, 'wave', 'line')]
    for lay, n, sl, edge, bs in combos:
        await pg.evaluate(f"(() => {{ Object.assign(selLayer(), {{n:'{n}', layout:'{lay}', slant:{sl}, edge:'{edge}', bstyle:'{bs}', lw:16}}); syncDoc(); paintPreview(false); }})()")
    await pg.evaluate("(() => { Object.assign(selLayer(), {n:'2', layout:'cols', slant:0, edge:'straight', bstyle:'line'}); syncDoc(); docChanged(false); })()"); await settle(pg, 1200)
    box = await canvas_box(pg)
    await pg.mouse.dblclick(box[0] + box[2] * 0.25, box[1] + box[3] * 0.85); await settle(pg, 800)
    assert await pg.evaluate("[edit && edit.kind, selLayer().ac]") == ['cells', 0]
    await pg.mouse.move(box[0] + box[2] * 0.25, box[1] + box[3] * 0.85); await pg.mouse.down(); await pg.mouse.move(box[0] + box[2] * 0.3, box[1] + box[3] * 0.8, steps=6); await pg.mouse.up()
    await pg.mouse.wheel(0, -240); await settle(pg, 800)
    c0 = await pg.evaluate("selLayer().cells[0]")
    assert c0['zoom'] > 1 and c0['ox'] > 0, f'マスの調整が効かない {c0}'
    await pg.keyboard.press('Escape'); assert await pg.evaluate('edit') is None
    px = await pg.evaluate("""(async () => { const L = selLayer(); L.n = '3'; L.cells[2].asset = null; DOC.bg.hidden = true; DOC.layers.forEach(l => { if(l.type !== 'collage') l.hidden = true; });
      const b = await thumbBlob('png'), bm = await createImageBitmap(b), c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
      const x = c.getContext('2d'); x.drawImage(bm, 0, 0); return Array.from(x.getImageData(1700, 200, 1, 1).data); })()""")
    assert px[3] == 0, '画像のないマスの案内が保存画像に入っている'
    await close(pg)
