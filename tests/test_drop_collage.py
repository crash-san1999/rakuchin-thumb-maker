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
    assert await pg.evaluate("$('#ddov').classList.contains('show') && $('[data-dz=cell]').hidden && !$('#ddov').classList.contains('hascell')"), '分割フレームが無いのにマスの区画が出た'
    await pg.evaluate("(async () => dropOn('#ddov [data-dz=layer]', await mkDT()))()"); await settle(pg, 1200)
    # 4 マスのグリッドを作り、選んでいない状態にする
    await pg.evaluate("addCollage()"); await pg.wait_for_timeout(500)
    await pg.evaluate("(() => { const L = selLayer(); Object.assign(L, {n:'4', layout:'grid'}); syncDoc(); docChanged(false); selectLayer(null); })()"); await settle(pg, 500)
    n0 = await pg.evaluate("DOC.layers.length")
    filled = "DOC.layers.find(l => l.type === 'collage').cells.slice(0, 4).map(c => !!assetOf(c.asset))"
    # 案内に 4 つのマスが番号付きで出る
    await pg.evaluate("(async () => enter(await mkDT()))()")
    r = await pg.evaluate("[!$('[data-dz=cell]').hidden, $('#ddov').classList.contains('hascell'), [...$$('#ddCellMap [data-cell]')].map(g => g.textContent)]")
    assert r == [True, True, ['1', '2', '3', '4']], f'マスの図が出ない {r}'
    # マス3の上で離す → マス3 に入る（マス1 には入らない）。レイヤーは増えない
    await pg.evaluate("(async () => dropOn('#ddCellMap [data-cell=\"2\"] .cpoly', await mkDT()))()"); await settle(pg, 1200)
    assert await pg.evaluate(filled) == [False, False, True, False], f'選んだマスに入らない {await pg.evaluate(filled)}'
    assert await pg.evaluate("DOC.layers.length") == n0, 'マスに入れたのにレイヤーも増えた'
    assert await pg.evaluate("selLayer() && selLayer().type === 'collage' && selLayer().ac") == 2, '入れたマスが選択にならない'
    assert not await pg.evaluate("$('#ddov').classList.contains('show')"), '離したあとも案内が残っている'
    # 2 枚をマス2 で離す → マス2 と、その後ろの空いているマス4 に入る（画像のあるマス3 は飛ばす）
    await pg.evaluate("(async () => { const dt = await mkDT(2); enter(dt); dropOn('#ddCellMap [data-cell=\"1\"] .cpoly', dt); })()"); await settle(pg, 1500)
    assert await pg.evaluate(filled) == [False, True, True, True], f'2 枚目が後ろの空きマスに入らない {await pg.evaluate(filled)}'
    # 画像のあるマスは、案内の図にも縮小画像が出る
    await pg.evaluate("(async () => enter(await mkDT()))()")
    assert await pg.evaluate("[...$$('#ddCellMap [data-cell]')].map(g => !!g.querySelector('image'))") == [False, True, True, True], '図に画像の有無が出ない'
    # 区画の中でもマスの外（すき間）で離す → どこにも入れない
    await pg.evaluate("(async () => dropOn('#ddov [data-dz=cell]', await mkDT()))()"); await settle(pg, 800)
    assert await pg.evaluate(filled) == [False, True, True, True] and await pg.evaluate("DOC.layers.length") == n0, 'マスの外で離したのにどこかに入った'
    # 分割フレームを隠す → 区画は出ない
    await pg.evaluate("(() => { DOC.layers.find(l => l.type === 'collage').hidden = true; })()")
    await pg.evaluate("(async () => { $('#ddov').classList.remove('show'); enter(await mkDT()); })()")
    assert await pg.evaluate("$('[data-dz=cell]').hidden"), '隠した分割フレームでマスの区画が出た'
    await close(pg)
