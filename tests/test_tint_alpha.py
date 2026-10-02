"""「色を重ねる」は絵のある部分にだけかかる：切り抜き画像の周り・グループの外など、透明な部分を染めない（全部の重ね方で）"""
from helpers import *
import test_silhouette as sil

ALPHA = """(() => { prevCache.clear(); paintPreview(false); const c = document.querySelector('#tv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let a = 0, n = 0; for(let i = 3; i < d.length; i += 4){ a += d[i]; if(d[i]) n++; } return [a, n]; })()"""
MODES = ['overlay', 'multiply', 'screen', 'soft-light', 'color']

async def run(p):
    pg = await open_app(p)
    await pg.evaluate(sil.SETUP); await settle(pg, 600)   # 透明な背景の画像レイヤー（白フチ付き）
    base = await pg.evaluate(ALPHA)
    for mode in MODES:
        await pg.evaluate(f"(() => {{ DOC.layers.find(l => l.id === 'Lsil').fx.tint = {{on:true, c:'#2040ff', a:0.6, mode:'{mode}'}}; docChanged(false); }})()"); await settle(pg, 400)
        assert await pg.evaluate(ALPHA) == base, f'画像の「色を重ねる」（{mode}）で透明な部分が染まった'
    # 色はちゃんと変わっている（効いていないのに透明度だけ同じ、ではない）
    changed = await pg.evaluate("""(() => { const L = DOC.layers.find(l => l.id === 'Lsil'); L.fx.tint.on = false; prevCache.clear(); paintPreview(false);
      const g = () => { const c = document.querySelector('#tv'); return [...c.getContext('2d').getImageData(c.width / 2, c.height / 2 - 40, 1, 1).data]; };
      const a = g(); L.fx.tint = {on:true, c:'#2040ff', a:0.6, mode:'multiply'}; prevCache.clear(); paintPreview(false); return [a, g()]; })()""")
    assert changed[0] != changed[1], f'「色を重ねる」が効いていない {changed}'
    # グループ：グループの外（キャンバスの大部分）を染めない
    await pg.evaluate("""(() => { const I = DOC.layers.find(l => l.id === 'Lsil'); I.fx.tint.on = false;
      const G = Object.assign(LAYER_BASE(), GROUP_BASE(), {id:'Gt'}); I.gid = G.id; DOC.layers.push(G); docChanged(false); })()"""); await settle(pg, 400)
    gbase = await pg.evaluate(ALPHA)
    for mode in MODES:
        await pg.evaluate(f"(() => {{ DOC.layers.find(l => l.id === 'Gt').fx.tint = {{on:true, c:'#2040ff', a:0.6, mode:'{mode}'}}; docChanged(false); }})()"); await settle(pg, 400)
        assert await pg.evaluate(ALPHA) == gbase, f'グループの「色を重ねる」（{mode}）でグループの外が染まった'
    assert not pg.errors, f'ページでエラー: {pg.errors[:3]}'
    await close(pg)
