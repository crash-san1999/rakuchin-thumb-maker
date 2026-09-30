"""クリックの当たり判定：上のレイヤーの透明な部分では下のレイヤーを掴める／絵の上なら上のレイヤー／ホイールは選択中を優先"""
from helpers import *

async def run(p):
    pg = await open_app(p)
    await pg.set_input_files('#imgfile', [IMG['night.jpg']]); await settle(pg, 1500)
    # 下：画像（キャンバス全体）。上：左右に離れた「あ」が2つある文字（間は枠の中だが透明）
    await pg.evaluate("""(() => { const L = DOC.layers.find(l => l.type === 'image'); Object.assign(L, {x:960, y:540, sc:1080 / ASSETS[L.asset].img.naturalHeight}); L.outline.on = false; L.shadow.on = false; window.IMGID = L.id;
      const T = DOC.layers.find(l => l.type === 'text'); S.text = 'あ　　　　　　　　あ'; syncDoc && 0; Object.assign(T, {x:960, y:540, sc:0.6}); window.TXTID = T.id; DOC.layers.sort((a, b) => (b.type === 'image') - (a.type === 'image')); selectLayer(null); docChanged(false); })()""")
    await settle(pg, 1500)
    info = await pg.evaluate("""(() => { const T = DOC.layers.find(l => l.id === TXTID), d = dims.get(T.id), r = document.querySelector('#tv').getBoundingClientRect();
      return {w: d.w, h: d.h, x: T.x, y: T.y, l: r.left, t: r.top, k: r.width / DOC.w, txt: T.type}; })()""")
    if info['txt'] != 'text' or info['w'] < 400: return f'skip（文字レイヤーの準備ができない {info}）'
    px = lambda x, y: (info['l'] + x * info['k'], info['t'] + y * info['k'])
    async def click_at(x, y):
        cx, cy = px(x, y); await pg.mouse.click(cx, cy); await pg.wait_for_timeout(200)
        return await pg.evaluate("DOC.sel === IMGID ? 'image' : DOC.sel === TXTID ? 'text' : DOC.sel")
    # 文字の枠の真ん中（透明）→ 下の画像
    got = await click_at(info['x'], info['y'])
    assert got == 'image', f'透明な部分で下の画像を掴めない {got}'
    # 左端の文字の上 → 文字
    got = await click_at(info['x'] - info['w'] / 2 + info['h'] * 0.45, info['y'])
    assert got == 'text', f'文字の上で文字を掴めない {got}'
    # 画像を選択中に文字の上でホイール → 選択中の画像が拡大縮小される
    await pg.evaluate("selectLayer(IMGID)"); sc0 = await pg.evaluate("[DOC.layers.find(l => l.id === IMGID).sc, DOC.layers.find(l => l.id === TXTID).sc]")
    cx, cy = px(info['x'] - info['w'] / 2 + info['h'] * 0.45, info['y']); await pg.mouse.move(cx, cy); await pg.mouse.wheel(0, -200); await pg.wait_for_timeout(300)
    sc1 = await pg.evaluate("[DOC.layers.find(l => l.id === IMGID).sc, DOC.layers.find(l => l.id === TXTID).sc]")
    assert sc1[0] > sc0[0] and sc1[1] == sc0[1], f'ホイールが選択中のレイヤーに効かない {sc0} {sc1}'
    await close(pg)
