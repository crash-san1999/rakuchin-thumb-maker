"""背景透過：背景色を透明に（自動・許容値・範囲・縁）、スポイト、消す／戻すブラシ、トリミングや保存との組み合わせ"""
from helpers import *

MAKE = """async () => {
  const c = mk(400, 300), x = c.getContext('2d'); x.fillStyle = '#00b140'; x.fillRect(0, 0, 400, 300);
  x.fillStyle = '#d01818'; x.beginPath(); x.arc(200, 150, 100, 0, 7); x.fill();             // 被写体（赤い円）
  x.fillStyle = '#00b140'; x.beginPath(); x.arc(200, 150, 25, 0, 7); x.fill();              // 被写体の中の穴（背景と同じ色）
  x.fillStyle = '#10c050'; x.fillRect(0, 0, 30, 30);                                         // 背景に近い別の緑（許容値の確認用）
  const id = await addAsset(c.toDataURL(), 'テスト'), L = newImageLayer(id, 'テスト');
  Object.assign(L, {x:960, y:540, sc:1}); L.outline.on = false; L.shadow.on = false; DOC.layers.push(L); selectLayer(L.id); docChanged(false); return L.id; }"""
PX = """([x, y]) => { const L = selLayer(), im = layerSrc(L).img, c = mk(im.naturalWidth, im.naturalHeight), t = c.getContext('2d', {willReadFrequently:true}); t.drawImage(im, 0, 0);
  const d = t.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2], d[3]]; }"""

async def run(p):
    pg = await open_app(p)
    await pg.evaluate(MAKE); await settle(pg, 1200)
    px = lambda x, y: pg.evaluate(PX, [x, y])
    assert (await px(5, 140))[3] == 255, '何もしていないのに透明になっている'
    # 1) オンにすると、四隅の色が背景色になり、外側の背景が透明になる（中の穴は残る）
    await pg.evaluate("openInspector('lay-cut')"); await settle(pg, 400)
    await pg.evaluate("document.querySelector('input[data-d=\"@key.on\"]').click()"); await settle(pg, 900)
    assert await pg.evaluate("selLayer().key.c") == '#00b140', '四隅から背景色を拾えない'
    assert (await px(5, 140))[3] == 0 and (await px(395, 295))[3] == 0, '外側の背景が透明にならない'
    assert (await px(130, 150)) == [208, 24, 24, 255], '被写体が消えた／色が変わった'
    assert (await px(200, 150)) == [0, 177, 64, 255], '穴は「外側から」では残るはず'
    # 2) 範囲「全体」：中の穴も透明になる
    await pg.click('.seg[data-dseg="@key.mode"] button[data-v="all"]'); await settle(pg, 900)
    assert (await px(200, 150))[3] == 0, '「全体」で中の穴が透明にならない'
    await pg.click('.seg[data-dseg="@key.mode"] button[data-v="edge"]'); await settle(pg, 600)
    # 3) 許容値：近い別の緑は、許容値が小さいと残り、大きいと消える
    async def tol(v):
        await pg.evaluate(f"(() => {{ const el = document.querySelector('input[type=range][data-d=\"@key.tol\"]'); el.value = {v}; el.dispatchEvent(new Event('input', {{bubbles:true}})); }})()"); await settle(pg, 900)
    await tol(0); assert (await px(10, 10))[3] > 200, '許容値0なのに近い色が消えた'
    await tol(25); assert (await px(10, 10))[3] == 0, '許容値25で近い色が残る'
    # 4) 境界のぼかし・縁を削る：縁が半透明になる／内側へ削れる
    assert (await px(280, 150))[3] == 255
    await pg.evaluate("(() => { const L = selLayer(); L.key.shrink = 6; docChanged(false); })()"); await settle(pg, 900)
    assert (await px(104, 150))[3] < 255 and (await px(280, 150))[3] == 255, '縁を削れない'
    await pg.evaluate("(() => { const L = selLayer(); L.key.shrink = 0; L.key.smooth = 4; docChanged(false); })()"); await settle(pg, 900)
    assert 0 < (await px(100, 150))[3] < 255 or 0 < (await px(101, 150))[3] < 255 or 0 < (await px(99, 150))[3] < 255, '縁がなめらかにならない'
    await pg.evaluate("(() => { const L = selLayer(); L.key.smooth = 1; docChanged(false); })()"); await settle(pg, 700)
    # 5) 画像から色を拾う（スポイト）：赤い被写体をクリック → 赤が背景色になり、モードは終わる
    await pg.click('#cutPickBtn'); await settle(pg, 500)
    assert await pg.evaluate("[edit && edit.kind, selLayer().btool]") == ['cut', 'pick']
    box = await pg.evaluate("(() => { const r = document.querySelector('#tv').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()")
    def at(dx, dy):   # 画像の左上から (dx, dy) ピクセルの位置（レイヤー: 中心 (960,540)、倍率 1、画像 400×300）
        return box[0] + (960 - 200 + dx) / 1920 * box[2], box[1] + (540 - 150 + dy) / 1080 * box[3]
    await pg.mouse.click(*at(130, 150)); await settle(pg, 900)
    assert await pg.evaluate("selLayer().key.c") == '#d01818' and await pg.evaluate("edit") is None, 'スポイトで色を拾えない／モードが終わらない'
    await pg.evaluate("(() => { selLayer().key.mode = 'all'; docChanged(false); })()"); await settle(pg, 900)   # 「外側から」は画像の縁につながる色だけなので、全体にして確かめる
    assert (await px(130, 150))[3] == 0 and (await px(5, 140))[3] == 255, '拾った色で透明になっていない'
    await pg.evaluate("(() => { const L = selLayer(); L.key.c = '#00b140'; docChanged(false); })()"); await settle(pg, 800)
    # 6) ブラシで消す
    await pg.click('.seg[data-dseg="@btool"] button[data-v="erase"]'); await pg.click('#cutBrushBtn'); await settle(pg, 400)
    assert await pg.evaluate("edit && edit.kind") == 'cut'
    await pg.evaluate("(() => { const L = selLayer(); L.bsz = 40; docChanged(false); })()")
    await pg.mouse.move(*at(270, 150)); await pg.mouse.down()
    for k in range(1, 7): await pg.mouse.move(*at(270 - k * 4, 150)); await pg.wait_for_timeout(30)
    await pg.mouse.up(); await settle(pg, 900)
    assert await pg.evaluate("selLayer().strokes.length") == 1 and await pg.evaluate("selLayer().strokes[0].m") == 'e'
    assert (await px(258, 150))[3] == 0 and (await px(150, 150))[3] == 255, 'ブラシで消せない（なぞった所だけ消えるはず）'
    # 7) ブラシで戻す（元の絵＝赤が戻る）
    await pg.evaluate("(() => { selLayer().btool = 'restore'; syncDoc(); })()")
    await pg.mouse.move(*at(262, 150)); await pg.mouse.down(); await pg.mouse.move(*at(256, 150)); await pg.mouse.move(*at(250, 150)); await pg.mouse.up(); await settle(pg, 900)
    assert await pg.evaluate("selLayer().strokes.length") == 2 and (await px(256, 150))[3] == 255, 'ブラシで戻せない'
    # 8) 1つ戻す・すべて消す
    await pg.click('#cutUndoStroke'); await settle(pg, 700)
    assert await pg.evaluate("selLayer().strokes.length") == 1 and (await px(256, 150))[3] == 0, '1つ戻せない'
    # 9) トリミングを変えても、ブラシの跡は絵の同じ場所にある
    await pg.evaluate("(() => { const L = selLayer(); applyCropChange(L, () => { L.crop.l = 0.25; }); docChanged(false); })()"); await settle(pg, 900)
    assert (await px(258 - 100, 150))[3] == 0 and (await px(150 - 100, 150))[3] == 255, 'トリミングでブラシの跡がずれる'
    await pg.evaluate("(() => { const L = selLayer(); applyCropChange(L, () => { L.crop.l = 0; }); docChanged(false); })()"); await settle(pg, 700)
    # 10) 保存・読み込み・複製で、設定とブラシの跡が残る。壊れた値は直る
    r = await pg.evaluate("""(() => { const d = JSON.parse(JSON.stringify(DOC)), n = normalizeDoc(d).layers.find(l => l.type === 'image');
      const e = JSON.parse(JSON.stringify(DOC)); const I = e.layers.find(l => l.type === 'image'); I.key = {on:'x', tol:999, c:'zzz', mode:'??'}; I.strokes = [{m:'e', p:[[0.5, 0.5]]}, {m:'x', p:[[1, 1]]}, 5]; I.bsz = -3;
      const f = normalizeDoc(e).layers.find(l => l.type === 'image'); const old = JSON.parse(JSON.stringify(DOC)); old.layers.forEach(l => { delete l.key; delete l.strokes; });
      const g = normalizeDoc(old).layers.find(l => l.type === 'image');
      return [n.key.on, n.strokes.length, f.key.tol, f.key.c, f.key.mode, f.strokes.length, f.bsz, g.key.on, g.strokes.length]; })()""")
    assert r == [True, 1, 100, '#00b140', 'edge', 1, 4, False, 0], f'保存データの読み込み・補正が合わない {r}'
    # 11) フチ・影・反転と組み合わせても描ける（フチは透明にした輪郭に沿う）
    await pg.evaluate("(() => { const L = selLayer(); L.outline.on = true; L.outline.w = 8; L.flip = true; docChanged(false); })()"); await settle(pg, 1200)
    d = await pg.evaluate("dims.get(selLayer().id)"); assert d['w'] > 400, 'フチ付きで描けない'
    # 12) 切り抜きフレーム付きでも背景透過は効く（ブラシは使えない）
    await pg.evaluate("(() => { const L = selLayer(); L.frame.shape = 'rect'; L.frame.style = 'none'; docChanged(false); })()"); await settle(pg, 900)
    assert not await pg.evaluate("EDIT_MODES.cut.ok(selLayer())") and (await px(5, 140))[3] == 0
    await close(pg)
