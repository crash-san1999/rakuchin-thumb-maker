"""分割フレームの扇状：形（すき間なく埋まる・左から右の順・要は下の辺）、要の左右の位置（slant）、
3分割以上でだけ選べること、設定パネルの出方、画面への反映とマスの当たり判定"""
from helpers import *

AREA = """const cross = (poly, f) => poly.reduce((s, [x, y], i) => { const [x2, y2] = poly[(i + 1) % poly.length]; return s + f(x, y, x2, y2) * (x * y2 - x2 * y); }, 0);
  const area = poly => Math.abs(cross(poly, () => 1) / 2);
  const cenx = poly => cross(poly, (x, y, x2) => (x + x2) / 3) / cross(poly, () => 1);"""
# 画面のプレビューそのもの（キャッシュは消さない）。設定がキャッシュの印（drawCollage の sk）に入っていない不具合も見つけられるように
HASH = "(() => { paintPreview(false); return document.querySelector('#tv').toDataURL(); })()"

async def run(p):
    pg = await open_app(p)
    # 1) 形：3〜8分割・要の位置を変えても、マス数が合い、すき間・重なりなく画面を埋め、どのマスもつぶれない
    r = await pg.evaluate("""(() => { %s const out = {};
      for(let n = 3; n <= 8; n++) for(const sl of [0, -1, 1, 0.4]){
        const c = collageCells('fan', n, 1600, 900, sl, 0.55);
        out[n + ':' + sl] = {cnt:c.length, sum:c.reduce((s, q) => s + area(q), 0) / (1600 * 900), min:Math.min(...c.map(q => area(q))) / (1600 * 900),
          apex:c.map(q => q[0]), cx:c.map(cenx)};
      } return out; })()""" % AREA)
    assert len(r) == 24, f'組み合わせが足りない {len(r)}'
    for k, v in r.items():
        n = int(k.split(':')[0])
        assert v['cnt'] == n, f'{k}: マス数が {v["cnt"]}'
        assert abs(v['sum'] - 1) < 0.002, f'{k}: すき間か重なりがある（面積比 {v["sum"]}）'
        assert v['min'] > 0.01, f'{k}: つぶれたマスがある（最小の面積比 {v["min"]}）'   # 要を端に寄せると端のマスは細くなるが、無くなってはいけない
        assert all(a == v['apex'][0] for a in v['apex']), f'{k}: 要が 1 点に集まっていない {v["apex"]}'
        assert abs(v['apex'][0][1] - 900) < 0.01, f'{k}: 要が下の辺にない {v["apex"][0]}'
        # マスは左から右の順（要を端に寄せると、端のマスは細くて重心がほぼ同じ位置になるので 1px の誤差は許す）
        assert all(a <= b + 1 for a, b in zip(v['cx'], v['cx'][1:])), f'{k}: マスが左から右の順に並んでいない {v["cx"]}'
    for n in range(3, 9):
        cx = r[f'{n}:0']['cx']   # 要が中央なら、1 枚目は左半分・最後は右半分で、左右対称に並ぶ
        assert cx[0] < 800 < cx[-1], f'{n}分割（要は中央）で1枚目が左・最後が右になっていない {cx}'
        assert all(abs(a + b - 1600) < 1 for a, b in zip(cx, cx[::-1])), f'{n}分割（要は中央）で左右対称に並んでいない {cx}'
    # 要の左右の位置は slant で動く（0 で中央。端に寄せても画面の 10%〜90% の中に収める）
    ax = {k.split(':')[1]: v['apex'][0][0] for k, v in r.items() if k.startswith('3:')}
    assert abs(ax['0'] - 800) < 0.01, f'slant 0 で要が中央にない {ax}'
    assert ax['-1'] < ax['0'] < ax['0.4'] < ax['1'], f'要が slant で動かない {ax}'
    assert 1600 * 0.19 < ax['-1'] and ax['1'] < 1600 * 0.81, f'要が端に寄りすぎる {ax}'
    # 2) 3分割以上でだけ選べる（2分割に戻すと縦に並べるに戻る）
    assert await pg.evaluate("[collageLayoutOk('fan', 2), collageLayoutOk('fan', 3), collageLayoutOk('fan', 8)]") == [False, True, True]
    await pg.evaluate("addCollage()"); await pg.wait_for_timeout(500)
    await pg.evaluate("(() => { const L = selLayer(); Object.assign(L, {n:'3', layout:'cols', slant:0, edge:'straight', bstyle:'line', lw:10}); syncDoc(); docChanged(false); })()"); await settle(pg, 1000)
    h0 = await pg.evaluate(HASH)
    await page(pg, 'lay-split'); await settle(pg, 300)
    lays = await pg.evaluate("[...document.querySelectorAll('.lays button')].filter(b => b.offsetParent).map(b => b.dataset.v)")
    assert 'fan' in lays, f'3分割で扇状が選べない {lays}'
    # 3) 選ぶ：ボタンを押すと扇状になり、画面にもすぐ出る
    await pg.click('.lays button[data-v="fan"]'); await settle(pg, 600)
    assert await pg.evaluate("selLayer().layout") == 'fan', '扇状にならない'
    h1 = await pg.evaluate(HASH)
    assert h1 != h0, '扇状にしても画面が変わらない'
    # 設定パネル：扇状では「扇の要の位置（左右）」として出て、「傾き・回転」は出ない
    lab = await pg.evaluate("""(() => { const el = [...document.querySelectorAll('[data-d="@slant"]')].find(e => e.offsetParent);
      const row = el && el.closest('.row'), l = row && row.querySelector('label'); return l ? l.textContent.trim() : null; })()""")
    assert lab == '扇の要の位置（左右）', f'扇状の設定の名前が違う {lab}'
    assert '@main' not in await pg.evaluate("[...document.querySelectorAll('[data-d]')].filter(e => e.offsetParent).map(e => e.dataset.d)"), '扇状で「大きいマスの大きさ」が出ている'
    # 要を動かすと画面が変わる（キャッシュの印に slant が入っていること）
    await pg.evaluate("(() => { selLayer().slant = 0.6; syncDoc(); docChanged(false); })()"); await settle(pg, 500)
    assert await pg.evaluate(HASH) != h1, '要を動かしても画面が変わらない'
    # 2分割に戻すと使えない配置なので縦に並べるに戻る
    await pg.click('.seg[data-dseg="@n"] [data-v="2"]'); await settle(pg, 500)
    assert await pg.evaluate("selLayer().layout") == 'cols', '2分割にしても扇状のまま'
    # 4) マスの当たり判定：左・真ん中・右をクリックすると、マス 1・2・3 になる
    await pg.evaluate("(() => { const L = selLayer(); Object.assign(L, {n:'3', layout:'fan', slant:0}); syncDoc(); docChanged(false); })()"); await settle(pg, 600)
    hit = await pg.evaluate("""(() => { const L = selLayer(), x = DOC.w / 2, y = DOC.h / 2;
      return [collageCellAt(L, DOC.w * 0.08, y), collageCellAt(L, x, DOC.h * 0.08), collageCellAt(L, DOC.w * 0.92, y), collageCellAt(L, -50, y)]; })()""")
    assert hit == [0, 1, 2, -1], f'マスの判定が違う {hit}'
    assert pg.errors == [], pg.errors
    await close(pg)
