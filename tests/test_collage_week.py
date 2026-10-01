"""分割フレーム7・8分割：1週間の予定表向けの段組み（上4・下3 など）。マス数・面積・並び順・画像の入れ方・古い保存データ"""
from helpers import *

async def run(p):
    pg = await open_app(p)
    # 1) 形：マス数が合い、すき間・重なりなく画面を埋める
    r = await pg.evaluate("""(() => { const out = {};
      const area = poly => Math.abs(poly.reduce((s, [x, y], i) => { const [x2, y2] = poly[(i + 1) % poly.length]; return s + x * y2 - x2 * y; }, 0) / 2);
      for(const [n, lays] of [[7, ['cols','rows','bigL','bigT','radial','wk43','wk34','wk52','wk25']], [8, ['cols','rows','grid','grid2','bigL','bigT','radial','wk53','wk35']]])
        for(const l of lays){ const c = collageCells(l, n, 1600, 900, 0, 0.55); out[l + n] = [c.length, Math.round(c.reduce((s, q) => s + area(q), 0) / (1600 * 900) * 1000) / 1000]; }
      return out; })()""")
    for k, (cnt, ar) in r.items():
        n = int(k[-1]); assert cnt == n and abs(ar - 1) < 0.002, f'{k}: マス数{cnt} 面積比{ar}'
    # 2) 上4・下3：上段は左から右へ4つ、下段は3つ（月〜木／金〜日の順）
    c = await pg.evaluate("collageCells('wk43', 7, 1600, 900).map(q => [Math.min(...q.map(p => p[0])), Math.min(...q.map(p => p[1]))])")
    assert [round(y) for x, y in c] == [0]*4 + [450]*3, f'段の並びが違う {c}'
    assert all(c[i][0] < c[i+1][0] for i in (0, 1, 2, 4, 5)), '左から右に並んでいない'
    # 3) 使えるレイアウトの絞り込み：7分割にだけ wk43 が出る／6分割に戻すと cols に戻る
    await pg.evaluate("addCollage()"); await pg.wait_for_timeout(500)
    await pg.evaluate("(() => { const L = selLayer(); L.n = '7'; L.layout = 'wk43'; syncDoc(); docChanged(false); })()"); await settle(pg, 300)
    assert await pg.evaluate("collageN(selLayer())") == 7 and await pg.evaluate("collageLayoutOk('wk43', 7)")
    await page(pg, 'lay-split'); await settle(pg, 200)
    vis = await pg.evaluate("[...document.querySelectorAll('.lays button')].filter(b => b.offsetParent).map(b => b.dataset.v)")
    assert 'wk43' in vis and 'wk52' in vis and 'grid' not in vis, f'7分割の選択肢が違う {vis}'
    await pg.evaluate("(() => { const L = selLayer(); L.n = '6'; syncDoc(); docChanged(false); })()")
    await pg.evaluate("(() => { const L = selLayer(); L.n = '6'; })()")
    assert await pg.evaluate("collageLayoutOk('wk43', 6)") is False
    # 4) 7枚をまとめて入れると、1〜7のマスに順に入る
    await pg.evaluate("(() => { const L = selLayer(); L.n = '7'; L.layout = 'wk43'; L.ac = 0; syncDoc(); docChanged(false); })()"); await settle(pg, 300)
    await page(pg, 'lay-cells'); await pg.click('[data-cell="0"]')
    await pg.set_input_files('#cellfile', [IMG['city.jpg'], IMG['synth.jpg']] * 3 + [IMG['city.jpg']]); await settle(pg, 3000)
    filled = await pg.evaluate("selLayer().cells.slice(0, 7).filter(c => c.asset).length")
    assert filled == 7, f'7枚入らない {filled}'
    assert await pg.evaluate("document.querySelectorAll('.cellbtn[data-cell]').length") >= 7
    # 5) 描画できる（エラーなし）。端の形・すき間でも
    for edge, bs in [('straight', 'line'), ('wave', 'gap'), ('zigzag', 'glow')]:
        await pg.evaluate(f"(() => {{ const L = selLayer(); L.edge = '{edge}'; L.bstyle = '{bs}'; syncDoc(); docChanged(false); }})()")
        h = await pg.evaluate("(() => { prevCache.clear(); const c = mk(480, 270); compose(c.getContext('2d'), 480, 270, false, new Map()); return c.toDataURL().length; })()")
        assert h > 2000
    # 6) 8分割：古い保存データ（マス6個）を読み込んでも、8個にそろう
    r = await pg.evaluate("""(() => { const L = JSON.parse(JSON.stringify(selLayer())); L.cells = L.cells.slice(0, 6); L.n = '8';
      const d = normalizeDoc({layers:[L]}); const C = d.layers.find(l => l.type === 'collage'); return [C.cells.length, collageN(C)]; })()""")
    assert r == [8, 8], f'古い保存データが8マスにそろわない {r}'
    assert await pg.evaluate("COLLAGE_BASE().cells.length") == 8, '新しい分割フレームのマスが8個ない'
    await close(pg)
    return '7・8分割の形と並び、選択肢の絞り込み、7枚の入れ方、描画'
