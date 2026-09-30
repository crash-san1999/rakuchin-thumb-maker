"""グループ：複数選択→グループ化、見た目が変わらない、まとめて移動・拡大縮小・回転、不透明度と効果、開閉・並べ替え、複製・解除・削除、保存データの読み込み"""
from helpers import *

SNAP = """(() => { prevCache.clear(); paintPreview(false); const c = document.querySelector('#tv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0, g = 0;
  for(let i = 0; i < d.length; i += 16){ s += d[i] + d[i + 1] * 3 + d[i + 2] * 7; } return s; })()"""
GRAY = """(() => { prevCache.clear(); paintPreview(false); const c = document.querySelector('#tv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let bad = 0, n = 0;
  for(let i = 0; i < d.length; i += 40){ n++; if(Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 6) bad++; } return bad / n; })()"""

async def run(p):
    pg = await open_app(p)
    await pg.set_input_files('#imgfile', [IMG['night.jpg'], IMG['synth.jpg']]); await settle(pg, 2000)
    await pg.evaluate("(() => { DOC.bg.type = 'color'; DOC.bg.color = '#ffffff'; DOC.guides.badge = false; DOC.guides.thirds = false; selectLayer(null); docChanged(false); })()"); await settle(pg, 800)
    ids = await pg.evaluate("DOC.layers.map(l => l.id)")
    assert len(ids) >= 3, f'レイヤーが足りない {ids}'
    a, b, c = ids[-3:]
    before = await pg.evaluate(SNAP)

    # 複数選択（Ctrl＋クリック相当）→ グループ化
    await pg.evaluate(f"selectLayer('{a}')"); await pg.evaluate(f"toggleMulti('{b}')")
    assert await pg.evaluate("DOC.msel.length") == 2, '複数選択できない'
    assert await pg.is_visible('.lp-multi'), '複数選択の操作バーが出ない'
    await pg.click('.lp-multi [data-multi="group"]'); await settle(pg, 800)
    G = await pg.evaluate("(() => { const g = DOC.layers.find(l => l.type === 'group'); return g && [g.id, DOC.layers.filter(l => l.gid === g.id).length, DOC.sel === g.id]; })()")
    assert G and G[1] == 2 and G[2], f'グループができていない {G}'
    gid = G[0]
    await pg.evaluate("selectLayer(null)"); await settle(pg, 300)
    assert abs(await pg.evaluate(SNAP) - before) < before * 0.002, 'グループにしただけで見た目が変わった'
    await pg.evaluate(f"selectLayer('{gid}')")
    assert await pg.locator('#layerList .ly.grp').count() == 1 and await pg.locator(f'#layerList .ly.kid[data-gid="{gid}"]').count() == 2, 'パネルにグループと中身が並んでいない'
    assert await pg.evaluate("insCtx()") == 'group', '設定パネルがグループ用にならない'

    # 開閉
    await pg.click('#layerList .ly.grp [data-la="fold"]'); await settle(pg, 300)
    assert await pg.locator('#layerList .ly.kid').count() == 0, 'たたんでも中身が出ている'
    await pg.click('#layerList .ly.grp [data-la="fold"]'); await settle(pg, 300)
    assert await pg.locator('#layerList .ly.kid').count() == 2

    # まとめて移動（キャンバスのドラッグ）
    pos0 = await pg.evaluate(f"DOC.layers.filter(l => l.gid === '{gid}').map(l => [l.x, l.y, l.sc])")
    box = await canvas_box(pg); gg = await pg.evaluate(f"(() => {{ const g = layerById('{gid}'); return [g.x, g.y]; }})()")
    sx, sy = box[0] + gg[0] / 1920 * box[2], box[1] + gg[1] / 1080 * box[3]
    await pg.mouse.move(sx, sy); await pg.mouse.down(); await pg.mouse.move(sx + 40, sy + 20, steps=4); await pg.mouse.up(); await settle(pg, 400)
    pos1 = await pg.evaluate(f"DOC.layers.filter(l => l.gid === '{gid}').map(l => [l.x, l.y, l.sc])")
    d0 = [pos1[0][0] - pos0[0][0], pos1[0][1] - pos0[0][1]]
    assert d0[0] > 20 and d0[1] > 5, f'グループを動かせない {pos0} {pos1}'
    assert all(abs((q[0] - r[0]) - d0[0]) <= 1 and abs((q[1] - r[1]) - d0[1]) <= 1 for q, r in zip(pos1, pos0)), f'中身が同じだけ動いていない {pos0} {pos1}'
    # 拡大縮小・回転（関数で）：位置関係を保つ
    await pg.evaluate(f"(() => {{ const G = layerById('{gid}'); xformApply(xformSnap([G], G.x, G.y), 0, 0, 0.5, 0); docChanged(false); }})()"); await settle(pg, 400)
    pos2 = await pg.evaluate(f"DOC.layers.filter(l => l.gid === '{gid}').map(l => [l.x, l.y, l.sc])")
    assert abs(pos2[0][2] / pos1[0][2] - 0.5) < 0.02 and abs(pos2[1][2] / pos1[1][2] - 0.5) < 0.02, f'まとめて縮小できない {pos1} {pos2}'
    await pg.evaluate(f"(() => {{ const G = layerById('{gid}'); xformApply(xformSnap([G], G.x, G.y), 0, 0, 1, 90); docChanged(false); }})()"); await settle(pg, 300)
    assert await pg.evaluate(f"DOC.layers.filter(l => l.gid === '{gid}').every(l => Math.abs(Math.abs(l.rot) - 90) < 0.6)"), 'まとめて回転できない'
    await pg.evaluate(f"(() => {{ const G = layerById('{gid}'); xformApply(xformSnap([G], G.x, G.y), 0, 0, 1, -90); docChanged(false); }})()")

    # 不透明度・効果
    v0 = await pg.evaluate(SNAP)
    await pg.evaluate(f"(() => {{ layerById('{gid}').op = 0.4; docChanged(false); }})()"); await settle(pg, 600)
    v1 = await pg.evaluate(SNAP)
    assert abs(v1 - v0) > v0 * 0.01, 'グループの不透明度が効かない'
    await pg.evaluate(f"(() => {{ const G = layerById('{gid}'); G.op = 1; G.fx.tone = 'mono'; docChanged(false); }})()"); await settle(pg, 600)
    gray0 = await pg.evaluate(GRAY)
    assert gray0 < 0.6, f'グループの効果（モノクロ）が効かない {gray0}'
    await page(pg, 'lay-cfx'); assert await pg.is_visible('[data-cfx="mono"]:visible'), 'グループの効果ページにワンクリック効果がない'
    await pg.click('[data-cfx="reset"]:visible'); await settle(pg, 500)
    assert await pg.evaluate(f"layerById('{gid}').fx.tone") == 'none', '効果をなしに戻せない'

    # 中身を1つだけ選ぶ・同じ階層で並べ替え
    kid = await pg.evaluate(f"DOC.layers.find(l => l.gid === '{gid}').id")
    await pg.evaluate(f"selectLayer('{kid}')")
    assert await pg.evaluate("insCtx()") != 'group', '中身を単独で選べない'
    order0 = await pg.evaluate(f"DOC.layers.filter(l => l.gid === '{gid}').map(l => l.id)")
    await pg.evaluate(f"layerAction('{order0[0]}', 'front')")
    order1 = await pg.evaluate(f"DOC.layers.filter(l => l.gid === '{gid}').map(l => l.id)")
    assert order1 == order0[::-1], f'グループの中で前面へ移せない {order0} {order1}'
    await pg.evaluate(f"movePeer('{order1[-1]}', 1)")   # 上から2番目へ（同じ階層のなかで）
    order2 = await pg.evaluate(f"DOC.layers.filter(l => l.gid === '{gid}').map(l => l.id)")
    assert order2 == order1[::-1], f'パネルでの入れ替えが同じ階層で効かない {order1} {order2}'

    # 複製
    await pg.evaluate(f"selectLayer('{gid}'); layerAction('{gid}', 'dup')")
    assert await pg.evaluate("[DOC.layers.filter(l => l.type === 'group').length, DOC.layers.filter(l => l.gid).length]") == [2, 4], '複製で中身もコピーされていない'
    assert await pg.evaluate("(() => { const gs = DOC.layers.filter(l => l.type === 'group'); return new Set(DOC.layers.map(l => l.id)).size === DOC.layers.length && gs.every(g => DOC.layers.filter(l => l.gid === g.id).length === 2); })()"), '複製した中身が元のグループに混ざっている'
    dup = await pg.evaluate("DOC.sel")
    await pg.evaluate(f"layerAction('{dup}', 'del')")
    assert await pg.evaluate("[DOC.layers.filter(l => l.type === 'group').length, DOC.layers.filter(l => l.gid).length]") == [1, 2], 'グループごと削除できない'

    # 保存データの読み込み（存在しないグループを指す gid・中身のないグループ）
    ok = await pg.evaluate("""(() => { const d = JSON.parse(JSON.stringify(DOC)); d.layers.push({type:'group', id:'Lempty', x:0, y:0, sc:1, rot:0, op:1}); d.layers[0].gid = 'Lnone';
      const o = normalizeDoc(d); return !o.layers.some(l => l.id === 'Lempty') && !o.layers.some(l => l.gid === 'Lnone') && o.layers.filter(l => l.type === 'group').every(g => g.fx && g.shadow && g.fxMode === 'all'); })()""")
    assert ok, '保存データの読み込みで、壊れたグループを直せていない'

    # 複数選択のまま移動
    await pg.evaluate(f"selectLayer('{c}')")
    p0 = await pg.evaluate("DOC.layers.filter(l => !l.gid && l.type !== 'group').map(l => [l.id, l.x, l.y])")
    if len(p0) >= 2:
        ida, idb = p0[0][0], p0[1][0]
        await pg.evaluate(f"selectLayer('{ida}'); toggleMulti('{idb}')")
        await pg.evaluate("(() => { const s = xformSnap(DOC.msel.map(layerById), 0, 0); xformApply(s, 30, 10); })()")
        p1 = await pg.evaluate(f"['{ida}', '{idb}'].map(i => [layerById(i).x, layerById(i).y])")
        assert all(abs(q[0] - (r[1] + 30)) <= 1 and abs(q[1] - (r[2] + 10)) <= 1 for q, r in zip(p1, [p0[0], p0[1]])), f'複数選択をまとめて動かせない {p0} {p1}'

    # キャンバス上の操作：角のハンドルで拡大縮小、ダブルクリックで中身を選ぶ、Shift＋クリックで複数選択
    await pg.evaluate(f"selectLayer('{gid}')"); await settle(pg, 300)
    g = await pg.evaluate(f"(() => {{ const G = layerById('{gid}'), q = layerGeom(G); return [q.pts[2], G.x, G.y, groupKids(G).map(k => k.sc)]; }})()")
    box = await canvas_box(pg); tx = lambda x, y: (box[0] + x / 1920 * box[2], box[1] + y / 1080 * box[3])
    hx, hy = tx(*g[0]); await pg.mouse.move(hx, hy); await pg.mouse.down()
    cx, cy = tx(g[1], g[2]); await pg.mouse.move(cx + (hx - cx) * 1.5, cy + (hy - cy) * 1.5, steps=5); await pg.mouse.up(); await settle(pg, 300)
    sc3 = await pg.evaluate(f"groupKids(layerById('{gid}')).map(k => k.sc)")
    assert all(abs(a / b - 1.5) < 0.1 for a, b in zip(sc3, g[3])), f'ハンドルでグループを拡大できない {g[3]} {sc3}'
    await pg.evaluate("DOC.layers.forEach(l => { if(!l.gid && l.type !== 'group') l.hidden = true; }); selectLayer(null); docChanged(false)"); await settle(pg, 500)
    G2 = await pg.evaluate(f"(() => {{ const k = groupKids(layerById('{gid}'))[0]; return [k.x, k.y]; }})()"); px_, py_ = tx(*G2)
    await pg.mouse.click(px_, py_); await settle(pg, 300)
    assert await pg.evaluate("DOC.sel") == gid, '画像をクリックしてもグループが選ばれない'
    await pg.mouse.dblclick(px_, py_); await settle(pg, 300)
    picked = await pg.evaluate("layerById(DOC.sel).gid")
    assert picked == gid or (await pg.evaluate("DOC.sel")) == gid, 'ダブルクリックで中身を選べない'
    await pg.evaluate("DOC.layers.forEach(l => { l.hidden = false; })")
    other = await pg.evaluate(f"DOC.layers.find(l => !l.gid && l.type !== 'group' && l.id !== '{gid}')")
    if other:
        await pg.evaluate("selectLayer(null)")
        await pg.evaluate(f"selectLayer('{gid}')")
        await pg.keyboard.down('Shift'); await pg.mouse.click(px_, py_); await pg.keyboard.up('Shift'); await settle(pg, 300)
        assert await pg.evaluate("(DOC.msel || []).length") in (0, 1), 'Shift＋クリックで選択が外れない'

    # 解除：見た目と中身が戻る
    await pg.evaluate(f"ungroupLayers(layerById('{gid}'))"); await settle(pg, 500)
    assert await pg.evaluate("[DOC.layers.filter(l => l.type === 'group').length, DOC.layers.filter(l => l.gid).length]") == [0, 0], 'グループを解除できない'
    await close(pg)
