"""分割フレームの効果：全部のマス／マスごと、ワンクリック効果、色調・ブラー・モザイク、全体の影、保存データの読み込み"""
from helpers import *

# 選択中の分割フレームだけを描いた、マスの中心の色（左・右）
PX = """(() => { DOC.bg.hidden = true; DOC.layers.forEach(l => { l.hidden = l.type !== 'collage'; }); prevCache.clear(); paintPreview(false);
  const c = document.querySelector('#tv'), x = c.getContext('2d'), g = (u, v) => Array.from(x.getImageData(Math.round(c.width * u), Math.round(c.height * v), 1, 1).data);
  return [g(0.25, 0.5), g(0.75, 0.5)]; })()"""
gray = lambda p: max(p[:3]) - min(p[:3]) <= 3

async def run(p):
    pg = await open_app(p)
    await pg.evaluate("addCollage()"); await pg.wait_for_timeout(500)
    await page(pg, 'lay-cells'); await pg.click('[data-cell="0"]')
    await pg.set_input_files('#cellfile', [IMG['synth.jpg'], IMG['night.jpg']]); await settle(pg, 2000)
    await pg.evaluate("(() => { selLayer().bstyle = 'none'; syncDoc(); docChanged(false); })()")
    before = await pg.evaluate(PX)

    await page(pg, 'lay-cfx')
    assert await pg.is_visible('[data-cfx="mono"]:visible'), '効果のページにワンクリック効果がない'
    assert not await pg.is_visible('.cellBox >> nth=1'), '全部のマスのときにマスの一覧が出ている'
    # 全部のマスにモノクロ
    await pg.click('[data-cfx="mono"]:visible'); await settle(pg, 600)
    assert await pg.evaluate("selLayer().fx.tone") == 'mono'
    l, r = await pg.evaluate(PX)
    assert gray(l) and gray(r), f'モノクロが両方のマスにかかっていない {l} {r}'

    # マスごと：マス2だけ効果なし・マス1はモノクロのまま（切り替え時に共通の効果が写る）
    await pg.click('.seg[data-dseg="@fxMode"] [data-v="cell"]'); await settle(pg, 400)
    assert await pg.evaluate("selLayer().cells.slice(0, 2).map(c => c.fx.tone)") == ['mono', 'mono'], 'マスごとに切り替えたとき共通の効果が写っていない'
    await pg.click('.cellBox:visible [data-cell="1"]'); await pg.click('[data-cfx="reset"]:visible'); await settle(pg, 600)
    l, r = await pg.evaluate(PX)
    assert gray(l) and not gray(r), f'マスごとの効果になっていない {l} {r}'
    assert r == before[1], '「なし」で元に戻らない'

    # スライダー（マスごと）：明るさ
    await pg.evaluate("""(() => { const el = [...document.querySelectorAll('[data-d="@cell.fx.bright"]')].find(e => e.offsetParent); el.value = 0.5; el.dispatchEvent(new Event('input', {bubbles:true})); })()""")
    await settle(pg, 600)
    assert await pg.evaluate("selLayer().cells[1].fx.bright") == 0.5
    l2, r2 = await pg.evaluate(PX)
    assert sum(r2[:3]) > sum(before[1][:3]), '明るさが効いていない'

    # 重い効果の組み合わせ・全体の影で落ちないこと
    await pg.evaluate("""(() => { const L = selLayer(); L.fxMode = 'all';
      Object.assign(L.fx, {blur:4, tone:'duotone', dim:0.2, vignette:0.5}); L.fx.zb.on = L.fx.mb.on = L.fx.mosaic.on = L.fx.tint.on = true;
      L.shadow.on = true; L.sc = 0.6; syncDoc(); docChanged(false); })()"""); await settle(pg, 1000)
    # 保存データの読み込み（効果のない古いデータ）
    ok = await pg.evaluate("""(() => { const d = JSON.parse(JSON.stringify(DOC)); const c = d.layers.find(l => l.type === 'collage'); delete c.fx; delete c.shadow; delete c.fxMode; c.cells.forEach(x => delete x.fx);
      const o = normalizeDoc(d).layers.find(l => l.type === 'collage'); return o.fxMode === 'all' && o.fx.zb.on === false && o.cells.every(x => x.fx && x.fx.tint) && o.shadow.on === false; })()""")
    assert ok, '古い保存データを読み込めない'
    await close(pg)
