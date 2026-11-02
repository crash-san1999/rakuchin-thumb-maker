"""ドラッグ＆ドロップ：分割フレームがあっても、ふつうは画像レイヤーとして追加される（選んでいる分割フレームのマスに落としたときだけマスに入る）。案内の「マスに入れる」図の上で離すと、選んだマスに入る"""
from helpers import *

async def run(p):
    pg = await open_app(p)
    await pg.evaluate("addCollage && addCollage()") if await pg.evaluate("typeof addCollage === 'function'") else None
    if not await pg.evaluate("DOC.layers.some(l => l.type === 'collage')"):
        await pg.click('#addBtn'); await settle(pg, 300); await pg.click('#addCollageBtn'); await settle(pg, 800)
    cid = await pg.evaluate("DOC.layers.find(l => l.type === 'collage').id")
    await pg.evaluate("window.mkFile = () => { const c = document.createElement('canvas'); c.width = 80; c.height = 60; c.getContext('2d').fillRect(0, 0, 80, 60); return new Promise(r => c.toBlob(b => r(new File([b], 'a.png', {type:'image/png'})))); }")
    box = await pg.eval_on_selector('#tv', 'e => { const r = e.getBoundingClientRect(); return [r.left + r.width * 0.25, r.top + r.height * 0.5]; }')
    # 分割フレームを選んでいない → 落とした画像は、そのまま返される（＝画像レイヤーになる）
    await pg.evaluate("selectLayer(null)")
    r = await pg.evaluate("(async () => { const f = await mkFile(); const rest = await collageTakeFiles([f], %f, %f); return [rest.length, DOC.layers.find(l => l.type === 'collage').cells.filter(c => c.asset).length]; })()" % (box[0], box[1]))
    assert r == [1, 0], f'選んでいない分割フレームのマスに入ってしまった {r}'
    # 選んでいて、そのマスの上に落とす → マスに入る
    await pg.evaluate(f"selectLayer('{cid}')")
    r = await pg.evaluate("(async () => { const f = await mkFile(); const rest = await collageTakeFiles([f], %f, %f); return [rest.length, DOC.layers.find(l => l.type === 'collage').cells.filter(c => c.asset).length]; })()" % (box[0], box[1]))
    assert r == [0, 1], f'選んでいる分割フレームのマスに入らない {r}'
    # 選んでいても、マスの外（キャンバスの外）に落とした → 画像レイヤー
    r = await pg.evaluate("(async () => { const f = await mkFile(); const rest = await collageTakeFiles([f], 5, 5); return rest.length; })()")
    assert r == 1, '選んでいても、キャンバスの外のドロップが分割フレームに入った'
    await close(pg)
    await close(pg)
    await picker_test(p)

async def check_aligned(pg, what):
    """図の各マスの番号の位置を画面上で確かめる：そこにある図のマスと、同じ画面位置をキャンバス上の位置に直したときのマス（collageCellAt）が一致する"""
    r = await pg.evaluate("""(() => { const L = DOC.layers.find(l => l.type === 'collage'), tv = $('#tv'), a = tv.getBoundingClientRect();
      return [...$$('#ddCellMap [data-cell]')].map(g => { const t = g.querySelector('text').getBoundingClientRect(), cx = t.left + t.width / 2, cy = t.top + t.height / 2;
        const e = document.elementFromPoint(cx, cy), hit = e && e.closest('[data-cell]') ? +e.closest('[data-cell]').dataset.cell : -1;
        const x = (cx - a.left - tv.clientLeft) / tv.clientWidth * DOC.w, y = (cy - a.top - tv.clientTop) / tv.clientHeight * DOC.h;
        return [+g.dataset.cell, hit, collageCellAt(L, x, y)]; }); })()""")
    assert r and all(i == h == c for i, h, c in r), f'図のマスとキャンバス上のマスがずれている（{what}）：[図の番号, 画面で当たるマス, キャンバスのマス] {r}'

# ドロップの案内に出る「マスに入れる」図：分割フレームがあるときだけ出て、離したマス（図の上の多角形）に入る。選んでいなくても使える
async def picker_test(p):
    pg = await open_app(p)
    # 画面に入ってきたファイルのドラッグ（dragenter）で案内を出す・ある区画（またはマス）の上で離す、を作る
    await pg.evaluate("""window.mkDT = async (k = 1) => { const dt = new DataTransfer(); for(let j = 0; j < k; j++){ const c = document.createElement('canvas'); c.width = 80; c.height = 60; c.getContext('2d').fillRect(0, 0, 80, 60);
        const b = await new Promise(r => c.toBlob(r)); dt.items.add(new File([/** @type {Blob} */ (b)], 'p' + j + '.png', {type:'image/png'})); } return dt; };
      window.enter = dt => document.body.dispatchEvent(new DragEvent('dragenter', {dataTransfer:dt, bubbles:true, cancelable:true}));
      window.dropOn = (sel, dt) => document.querySelector(sel).dispatchEvent(new DragEvent('drop', {dataTransfer:dt, bubbles:true, cancelable:true})); true""")   # 最後を true にする（関数を返すと、Playwright がそれを呼んでしまう）
    # 分割フレームが無い → 区画は出ない
    await pg.evaluate("(async () => enter(await mkDT()))()")
    assert await pg.evaluate("$('#ddov').classList.contains('show') && $('#ddCanvas').hidden"), '分割フレームが無いのにマスの図が出た'
    await pg.evaluate("(async () => dropOn('#ddov [data-dz=layer]', await mkDT()))()"); await settle(pg, 1200)
    # 4 マスのグリッドを作り、選んでいない状態にする
    await pg.evaluate("addCollage()"); await pg.wait_for_timeout(500)
    await pg.evaluate("(() => { const L = selLayer(); Object.assign(L, {n:'4', layout:'grid'}); syncDoc(); docChanged(false); selectLayer(null); })()"); await settle(pg, 500)
    n0 = await pg.evaluate("DOC.layers.length")
    filled = "DOC.layers.find(l => l.type === 'collage').cells.slice(0, 4).map(c => !!assetOf(c.asset))"
    # 案内に 4 つのマスが番号付きで出る。図はキャンバス（枠線の内側）とぴったり同じ位置・大きさ
    await pg.evaluate("(async () => enter(await mkDT()))()")
    r = await pg.evaluate("[!$('#ddCanvas').hidden, [...$$('#ddCellMap [data-cell]')].map(g => g.textContent)]")
    assert r == [True, ['1', '2', '3', '4']], f'マスの図が出ない {r}'
    d = await pg.evaluate("""(() => { const tv = $('#tv'), a = tv.getBoundingClientRect(), b = $('#ddCanvas').getBoundingClientRect();
        return Math.max(Math.abs(a.left + tv.clientLeft - b.left), Math.abs(a.top + tv.clientTop - b.top), Math.abs(tv.clientWidth - b.width), Math.abs(tv.clientHeight - b.height)); })()""")
    assert d < 1.5, f'図の位置・大きさがキャンバスとずれている（{d}px）'
    await check_aligned(pg, '回転なし')
    # マス3の上で離す → マス3 に入る（マス1 には入らない）。レイヤーは増えない
    await pg.evaluate("(async () => dropOn('#ddCellMap [data-cell=\"2\"] .cpoly', await mkDT()))()"); await settle(pg, 1200)
    assert await pg.evaluate(filled) == [False, False, True, False], f'選んだマスに入らない {await pg.evaluate(filled)}'
    assert await pg.evaluate("DOC.layers.length") == n0, 'マスに入れたのにレイヤーも増えた'
    assert await pg.evaluate("selLayer() && selLayer().type === 'collage' && selLayer().ac") == 2, '入れたマスが選択にならない'
    assert not await pg.evaluate("$('#ddov').classList.contains('show')"), '離したあとも案内が残っている'
    # 2 枚をマス2 で離す → マス2 と、その後ろの空いているマス4 に入る（画像のあるマス3 は飛ばす）
    await pg.evaluate("(async () => { const dt = await mkDT(2); enter(dt); dropOn('#ddCellMap [data-cell=\"1\"] .cpoly', dt); })()"); await settle(pg, 1500)
    assert await pg.evaluate(filled) == [False, True, True, True], f'2 枚目が後ろの空きマスに入らない {await pg.evaluate(filled)}'
    # 図の下にはキャンバスの写しが出る（何か描かれている）
    await pg.evaluate("(async () => enter(await mkDT()))()")
    assert await pg.evaluate("(() => { const c = $('#ddShot'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for(let i = 3; i < d.length; i += 4) if(d[i]) return true; return false; })()"), 'キャンバスの写しが出ない'
    # 分割フレームを回転・縮小・移動しても、図はキャンバス上の位置に重なる
    await pg.evaluate("(() => { const L = DOC.layers.find(l => l.type === 'collage'); Object.assign(L, {rot:20, sc:0.6, x:800, y:500}); syncDoc(); docChanged(false); })()"); await settle(pg, 500)
    await pg.evaluate("(async () => { $('#ddov').classList.remove('show'); enter(await mkDT()); })()")
    await check_aligned(pg, '回転・縮小・移動')
    # 分割フレームを隠す → 図は出ない
    await pg.evaluate("(() => { DOC.layers.find(l => l.type === 'collage').hidden = true; })()")
    await pg.evaluate("(async () => { $('#ddov').classList.remove('show'); enter(await mkDT()); })()")
    assert await pg.evaluate("$('#ddCanvas').hidden"), '隠した分割フレームでマスの図が出た'
    await close(pg)
