"""シルエット（絵を1色で塗る）：画像レイヤー・分割フレームのマス・グループで効く／縁取り・透明部分は塗らない／濃さ／古いデータ・不正な色"""
from helpers import *

# 透明な背景に丸と四角を描いた画像（キャラの切り抜きの代わり）を、決まった id の素材として登録して画像レイヤーを置く
SETUP = """async () => {
  const c = mk(200, 260), x = c.getContext('2d');
  x.fillStyle = '#ffb000'; x.beginPath(); x.arc(100, 80, 70, 0, 7); x.fill(); x.fillStyle = '#3c8cff'; x.fillRect(50, 150, 100, 100); x.fillStyle = '#ffffff'; x.fillRect(80, 170, 40, 20);
  await addAsset(c.toDataURL('image/png'), 'sil', 'Asil', true);
  DOC.bg.hidden = true; DOC.layers.forEach(l => l.hidden = true);
  const L = Object.assign(LAYER_BASE(), IMAGE_BASE(), {id:'Lsil', type:'image', asset:'Asil', x:960, y:540, sc:3});
  L.outline.on = true; L.outline.w = 12; L.outline.c = '#ffffff'; DOC.layers.push(L); selectLayer(L.id); docChanged(false); }"""
# プレビュー全体の画素を数える：不透明の数・指定色（#ff0066）の数・白の数・透明度の合計
STAT = """(() => { prevCache.clear(); paintPreview(false); const c = document.querySelector('#tv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let op = 0, sil = 0, white = 0, alpha = 0; for(let i = 0; i < d.length; i += 4){ alpha += d[i + 3]; if(d[i + 3] < 255) continue; op++;
    if(d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) white++; else if(d[i] > 250 && d[i + 1] < 5 && Math.abs(d[i + 2] - 102) < 4) sil++; }
  return {op, sil, white, alpha}; })()"""

async def run(p):
    pg = await open_app(p)
    await pg.evaluate(SETUP); await settle(pg, 800)
    assert await pg.evaluate("selLayer().fx.sil.on") is False, '既定でシルエットがオンになっている'
    base = await pg.evaluate(STAT)
    # 画面の「色」タブから操作する
    await page(pg, 'lay-color'); await settle(pg, 400)
    vis = lambda: pg.evaluate("[...document.querySelectorAll('[data-d]')].filter(e => e.offsetParent).map(e => e.dataset.d)")
    keys = await vis()
    assert '@fx.sil.on' in keys and '@fx.sil.c' not in keys, f'シルエットのスイッチが出ない／オフなのに色が出ている {keys}'
    await pg.evaluate("[...document.querySelectorAll('[data-d=\"@fx.sil.on\"]')].find(e => e.offsetParent).click()"); await settle(pg, 400)
    keys = await vis()
    assert '@fx.sil.c' in keys and '@fx.sil.a' in keys, 'オンにしても色・濃さが出ない'
    async def setv(k, v):
        await pg.evaluate(f"(() => {{ const el = [...document.querySelectorAll('[data-d=\"{k}\"]')].find(e => e.offsetParent); el.value = {v!r}; el.dispatchEvent(new Event('input', {{bubbles:true}})); }})()")
        await settle(pg, 600)
    await setv('@fx.sil.c', '#ff0066')
    r = await pg.evaluate(STAT)
    assert r['alpha'] == base['alpha'] and r['op'] == base['op'], f'透明な部分まで塗られた（または絵が欠けた） {base} {r}'
    assert r['sil'] > base['op'] * 0.7, f'絵が指定の色にならない {base} {r}'
    assert r['white'] > 1000, f'白い縁取りが残っていない {r}'
    await setv('@fx.sil.a', 0.5)
    h = await pg.evaluate(STAT)
    assert h['sil'] < r['sil'] * 0.05 and h['alpha'] == base['alpha'], f'濃さ 0.5 で元の絵が透けない {h}'
    # 取り消し：直前の変更（濃さ 0.5）を取り消すと、濃さ 1（完全に 1 色）に戻る
    await pg.keyboard.press('Control+z'); await settle(pg, 700)
    assert await pg.evaluate("DOC.layers.find(l => l.id === 'Lsil').fx.sil.a") == 1, '取り消しで濃さが戻らない'
    u = await pg.evaluate(STAT)
    assert u['sil'] == r['sil'], f'取り消し後の見た目が戻らない {r} {u}'

    # 分割フレームのマス：画像を入れたマスにシルエット（マスごと）
    r2 = await pg.evaluate("""(() => { DOC.layers.forEach(l => l.hidden = true);
      const L = Object.assign(COLLAGE_BASE(), {id:'Csil', n:2, layout:'cols', bstyle:'none'}); L.cells[0].asset = 'Asil'; L.cells[1].asset = 'Asil';
      DOC.layers.push(L); docChanged(false);
      const draw = () => { const c = mk(960, 540), x = c.getContext('2d'); drawCollage(x, L, 0.5, false, new Map()); const d = x.getImageData(0, 0, 960, 540).data; let s = 0, a = 0; for(let i = 0; i < d.length; i += 4){ a += d[i + 3]; if(d[i + 3] === 255 && d[i] > 250 && d[i + 1] < 5 && Math.abs(d[i + 2] - 102) < 4) s++; } return {s, a}; };
      const b = draw(); L.fxMode = 'cell'; L.cells[0].fx = mergeCellFx({sil:{on:true, c:'#ff0066', a:1}}); const o = draw(); return {b, o}; })()""")
    assert r2['b']['s'] == 0 and r2['o']['s'] > 1000 and r2['o']['a'] == r2['b']['a'], f'マスのシルエットが効かない／透明な部分が塗られた {r2}'
    # グループ：中身全体が 1 色に。グループの外（透明）は塗らない
    r3 = await pg.evaluate("""(() => { DOC.layers.forEach(l => l.hidden = true); const I = DOC.layers.find(l => l.id === 'Lsil'); I.hidden = false; I.fx = CELL_FX_BASE();
      const G = Object.assign(LAYER_BASE(), GROUP_BASE(), {id:'Gsil'}); I.gid = G.id; DOC.layers.push(G); docChanged(false); return 1; })()""")
    before = await pg.evaluate(STAT)
    await pg.evaluate("(() => { const G = DOC.layers.find(l => l.id === 'Gsil'); G.fx.sil = {on:true, c:'#ff0066', a:1}; docChanged(false); })()"); await settle(pg, 500)
    after = await pg.evaluate(STAT)
    assert after['alpha'] == before['alpha'] and after['sil'] > before['op'] * 0.9, f'グループのシルエットが効かない／外が塗られた {before} {after}'
    # 古い保存データ（sil が無い）・不正な色
    r4 = await pg.evaluate("""(() => { const d = JSON.parse(JSON.stringify(DOC)); const I = d.layers.find(l => l.id === 'Lsil'); delete I.fx.sil;
      const G = d.layers.find(l => l.id === 'Gsil'); G.fx.sil = {on:true, c:'"><img src=x onerror=alert(1)>', a:1};
      const n = normalizeDoc(d); return [n.layers.find(l => l.id === 'Lsil').fx.sil, n.layers.find(l => l.id === 'Gsil').fx.sil.c]; })()""")
    assert r4[0] == {'on': False, 'c': '#111111', 'a': 1}, f'古いデータでシルエットの既定値が入らない {r4}'
    assert r4[1] == '#111111', f'不正な色がそのまま残った {r4}'
    assert not pg.errors, f'ページでエラー: {pg.errors[:3]}'
    await close(pg)
