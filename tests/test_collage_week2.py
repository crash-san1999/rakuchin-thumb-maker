"""分割フレーム・1週間の予定表の追加機能：全部のマスの文字をまとめて動かす／マスごとの文字色・フチ色／8分割の MEMO の位置／
右に大きく・下に大きく／境界線ドラッグでマスの幅（両隣だけ変わる）／幅をそろえる／古い保存データ・不正な値"""
from helpers import *

WEEK = """([lay, n]) => { DOC.layers.forEach(l => l.hidden = true); addCollage(); const L = selLayer();
  Object.assign(L, {n, layout:lay, bstyle:'line', lw:6, lc:'#111111'}); L.wk.start = '2026-10-12'; collageFillWeek(L); syncDoc(); docChanged(false); return L.id; }"""
# 分割フレームだけを描いて、画素を数える（色を指定すればその色の数）
COUNT = """([col]) => { const L = selLayer(), c = mk(800, 450), x = c.getContext('2d'); prevCache.clear(); drawCollage(x, L, 0.5, false, new Map());
  const d = x.getImageData(0, 0, 800, 450).data, [r, g, b] = [1, 3, 5].map(i => parseInt(col.slice(i, i + 2), 16)); let k = 0;
  for(let i = 0; i < d.length; i += 4) if(Math.abs(d[i] - r) < 6 && Math.abs(d[i + 1] - g) < 6 && Math.abs(d[i + 2] - b) < 6) k++; return k; }"""
HASH = "(() => { const c = mk(800, 450); prevCache.clear(); drawCollage(c.getContext('2d'), selLayer(), 0.5, false, new Map()); return c.toDataURL(); })()"

async def run(p):
    pg = await open_app(p)
    vis = lambda: pg.evaluate("[...document.querySelectorAll('[data-d]')].filter(e => e.offsetParent).map(e => e.dataset.d)")
    async def setv(k, v):
        await pg.evaluate(f"""(() => {{ const el = [...document.querySelectorAll('[data-d="{k}"]')].find(e => e.offsetParent); if(!el) throw new Error('no {k}');
          if(el.type === 'checkbox'){{ el.checked = {str(bool(v)).lower()}; el.dispatchEvent(new Event('change', {{bubbles:true}})); el.dispatchEvent(new Event('input', {{bubbles:true}})); }} else {{ el.value = {v!r}; el.dispatchEvent(new Event('input', {{bubbles:true}})); }} }})()""")
        await settle(pg, 300)

    # 1) まとめて：全部のマスの文字の大きさ・左右・上下。既定では見た目は変わらない／マスごとの調整（tx.sc 等）は残る
    await pg.evaluate(WEEK, ['rows', 7]); await settle(pg, 1200)
    h0 = await pg.evaluate(HASH)
    await page(pg, 'lay-ctext'); await settle(pg, 300)
    keys = await vis()
    for k in ['@ttx.sc', '@ttx.ox', '@ttx.oy', '@cell.tx.fcOn', '@cell.tx.ecOn']: assert k in keys, f'{k} が出ない {keys}'
    assert '@cell.tx.fc' not in keys, 'オフなのに文字の色が出ている'
    await setv('@ttx.sc', 0.7); await setv('@ttx.ox', -0.3); await setv('@ttx.oy', 0.1)
    r = await pg.evaluate("(() => { const L = selLayer(); return [L.ttx, L.cells.slice(0, 7).map(c => [c.tx.sc, c.tx.ox, c.tx.oy])]; })()")
    assert r[0] == {'sc': 0.7, 'ox': -0.3, 'oy': 0.1}, f'まとめての値が入らない {r[0]}'
    assert all(c == [1, 0, 0] for c in r[1]), f'マスごとの値が書き換わった {r[1]}'
    assert await pg.evaluate(HASH) != h0, 'まとめての調整が見た目に効かない'
    await pg.click('#ttxReset'); await settle(pg, 400)
    assert await pg.evaluate("selLayer().ttx") == {'sc': 1, 'ox': 0, 'oy': 0}
    assert await pg.evaluate(HASH) == h0, '元に戻すで見た目が戻らない'

    # 2) マスごとの文字色・フチ色。選んだマスだけ変わる／「全部のマスに」でそろう
    white = await pg.evaluate(COUNT, ['#1e5bff'])
    await pg.click('[data-pg="ctext"] [data-cell="5"]'); await settle(pg, 300)
    await setv('@cell.tx.fcOn', True); await setv('@cell.tx.fc', '#1e5bff')
    assert '@cell.tx.fc' in await vis(), 'オンにしても文字の色が出ない'
    blue = await pg.evaluate(COUNT, ['#1e5bff'])
    assert blue > white + 300, f'文字の色が効かない {white} {blue}'
    others = await pg.evaluate("selLayer().cells.filter((c, i) => i !== 5).some(c => c.tx.fcOn)")
    assert others is False, 'ほかのマスまで色が変わった'
    await setv('@cell.tx.ecOn', True); await setv('@cell.tx.ec', '#00aa44')
    assert await pg.evaluate(COUNT, ['#00aa44']) > 300, 'フチの色が効かない'
    await pg.click('#ctColorAll'); await settle(pg, 400)
    r = await pg.evaluate("selLayer().cells.map(c => [c.tx.fcOn, c.tx.fc, c.tx.ecOn, c.tx.ec])")
    assert all(c == [True, '#1e5bff', True, '#00aa44'] for c in r), f'全部のマスにそろわない {r}'
    assert await pg.evaluate(COUNT, ['#1e5bff']) > blue * 4, '全部のマスの色が変わらない'

    # 3) 8分割：MEMO の位置。日付は MEMO 以外のマスに順に入る／自分で書いた文字は MEMO で消さない／古いデータ（目印なし）も直せる
    await pg.evaluate(WEEK, ['cols', 8]); await settle(pg, 600)
    await page(pg, 'lay-ctext'); await settle(pg, 200)
    txt = lambda: pg.evaluate("selLayer().cells.map(c => c.tx.text)")
    t = await txt()
    assert t[7] == 'MEMO' and t[0].startswith('10/12') and t[6].startswith('10/18'), f'既定（8番目）が違う {t}'
    shown = await pg.evaluate("(() => { const e = document.querySelector('[data-wkmemo]'); return !!e && !e.hidden && !!e.offsetParent; })()")
    if not shown:  # 1週間の設定が別ページにある場合
        await page(pg, 'lay-week'); await settle(pg, 200)
    await pg.select_option('[data-wk="memo"]', '3'); await settle(pg, 200)
    assert await pg.evaluate("selLayer().wk.memo") == 3
    await pg.click('#wkGo'); await settle(pg, 400)
    t = await txt()
    assert t[2] == 'MEMO' and t[1].startswith('10/13') and t[3].startswith('10/14') and t[7].startswith('10/18'), f'MEMO を3番目にできない {t}'
    # 自分で書いた MEMO（8番目以外の位置に移す前に書いたもの）は、MEMO の位置に戻しても消えない
    await pg.evaluate("(() => { const L = selLayer(); L.cells[2].tx.text = '配信おやすみ'; L.cells[2].tx.wk = false; collageFillWeek(L); })()")
    assert (await txt())[2] == '配信おやすみ', '自分で書いた MEMO が消えた'
    # 古いデータ：目印 wk が無く、日付の形の文字が入ったマスに MEMO を移すと、MEMO に置き換わる
    t = await pg.evaluate("(() => { const L = selLayer(); L.cells.forEach(c => delete c.tx.wk); L.wk.memo = 5; collageFillWeek(L); return L.cells.map(c => c.tx.text); })()")
    assert t[4] == 'MEMO' and '配信おやすみ' not in t[:2], f'古いデータで MEMO が入らない {t}'
    # 7分割以下では MEMO の位置の設定を出さない（日付は 1〜7 番目のまま）
    t = await pg.evaluate("(() => { const L = selLayer(); L.n = 7; L.wk.memo = 1; collageFillWeek(L); return L.cells.slice(0, 7).map(c => c.tx.text); })()")
    assert t[0].startswith('10/12') and 'MEMO' not in t, f'7分割で MEMO の位置が効いてしまう {t}'

    # 4) 右に大きく・下に大きく：大きいマスが 1番目（右・下）、小さいマスは左（上）に、左右（上下）反転ではなく元と同じ順で並ぶ
    r = await pg.evaluate("""(() => { const box = q => [Math.min(...q.map(p => p[0])), Math.min(...q.map(p => p[1])), Math.max(...q.map(p => p[0])), Math.max(...q.map(p => p[1]))].map(Math.round);
      const area = poly => Math.abs(poly.reduce((s, [x, y], i) => { const [x2, y2] = poly[(i + 1) % poly.length]; return s + x * y2 - x2 * y; }, 0) / 2);
      const o = {}; for(const l of ['bigL', 'bigR', 'bigT', 'bigB']) for(const n of [3, 4, 5, 7]){ const c = collageCells(l, n, 1600, 900, 0, 0.55);
        o[l + n] = {b:c.map(box), a:Math.round(c.reduce((s, q) => s + area(q), 0))}; } return o; })()""")
    for k, v in r.items():
        n = int(k[-1]); assert len(v['b']) == n and abs(v['a'] - 1600 * 900) < 50, f'{k}: マス数・面積が違う {v}'
    for n in [3, 4, 5, 7]:
        L, R, T, B = (r[f'{l}{n}']['b'] for l in ['bigL', 'bigR', 'bigT', 'bigB'])
        assert R[0][2] == 1600 and R[0][0] > 0 and L[0][0] == 0, f'右に大きく{n}: 大きいマスが右にない {R[0]}'
        assert B[0][3] == 900 and B[0][1] > 0 and T[0][1] == 0, f'下に大きく{n}: 大きいマスが下にない {B[0]}'
        # 小さいマスの並び：左に大きくと同じ並び（左右の位置だけずらしたもの）
        dl = [b[0] - L[1][0] for b in L[1:]]; dr = [b[0] - R[1][0] for b in R[1:]]
        assert dl == dr and [b[1] for b in L[1:]] == [b[1] for b in R[1:]], f'右に大きく{n}: 小さいマスの並びが違う {L} {R}'
        dt = [b[1] - T[1][1] for b in T[1:]]; db = [b[1] - B[1][1] for b in B[1:]]
        assert dt == db and [b[0] for b in T[1:]] == [b[0] for b in B[1:]], f'下に大きく{n}: 小さいマスの並びが違う {T} {B}'
    await pg.evaluate("(() => { const L = selLayer(); L.n = 7; syncDoc(); docChanged(false); })()")
    await page(pg, 'lay-split'); await settle(pg, 300)
    lays = await pg.evaluate("[...document.querySelectorAll('.lays button')].filter(b => b.offsetParent).map(b => b.dataset.v)")
    assert 'bigR' in lays and 'bigB' in lays, f'右に大きく・下に大きくが選べない {lays}'
    assert await pg.evaluate("collageLayoutOk('bigR', 2)") is False, '2分割で右に大きくが選べてしまう'

    # 5) マスの幅：境界線をマウスでドラッグ → 両隣のマスだけ変わる（合計は同じ）。マスの画像位置は動かない。取り消し・幅をそろえる
    await pg.evaluate(WEEK, ['rows', 7]); await settle(pg, 600)
    await pg.evaluate("(() => { const L = selLayer(); L.cells[0].ox = 0.15; L.rot = 0; syncDoc(); docChanged(false); })()")
    hw = await pg.evaluate(HASH)
    await page(pg, 'lay-split'); await settle(pg, 200)
    assert '@cell.w' in await vis(), '「選んでいるマスの幅」が出ない'
    await pg.evaluate("toggleEdit('cells')"); await settle(pg, 400)
    async def drag(j, du):
        b = await pg.evaluate(f"""(() => {{ const L = selLayer(), {{e}} = collageEdges(L), c = document.querySelector('#tv').getBoundingClientRect();
          const s = (x, y) => [c.left + x / DOC.w * c.width, c.top + y / DOC.h * c.height], top = L.y - L.bh * L.sc / 2;
          return [s(L.x + 50, top + e[{j}] * L.bh * L.sc), s(L.x + 50, top + (e[{j}] + {du}) * L.bh * L.sc)]; }})()""")
        (x0, y0), (x1, y1) = b
        await pg.mouse.move(x0, y0); await pg.mouse.down(); await pg.mouse.move(x1, (y0 + y1) / 2, steps=4); await pg.mouse.move(x1, y1, steps=4); await pg.mouse.up(); await settle(pg, 500)
    await drag(1, 0.06)
    w = await pg.evaluate("selLayer().cells.slice(0, 7).map(c => c.w)")
    assert w[0] > 1.2 and w[1] < 0.8 and w[2:] == [1] * 5 and abs(sum(w) - 7) < 0.01, f'両隣だけが変わっていない {w}'
    assert await pg.evaluate("selLayer().cells[0].ox") == 0.15, 'マスの画像の位置が動いた'
    assert await pg.evaluate(HASH) != hw, '幅を変えても見た目が変わらない'
    # 引っ張りすぎても、隣のマスが消えない（最小の幅で止まる）
    await drag(3, 0.5)
    w = await pg.evaluate("selLayer().cells.slice(0, 7).map(c => c.w)")
    assert min(w) > 0.2 and abs(sum(w) - 7) < 0.01, f'マスが潰れた {w}'
    await pg.keyboard.press('Escape'); await settle(pg, 300)
    await pg.keyboard.press('Control+z'); await settle(pg, 500)
    w2 = await pg.evaluate("selLayer().cells.slice(0, 7).map(c => c.w)")
    assert w2 != w and w2[2:3] == [1], f'取り消しで幅が戻らない {w} {w2}'
    await page(pg, 'lay-split'); await settle(pg, 200)
    await pg.click('#cwReset'); await settle(pg, 400)
    assert await pg.evaluate("selLayer().cells.map(c => c.w)") == [1] * 8
    assert await pg.evaluate(HASH) == hw, '幅をそろえると元の見た目に戻らない'
    # 幅がそろっているときは、以前とまったく同じ分け方（比率を使わない）
    same = await pg.evaluate("JSON.stringify(collageCells('rows', 7, 1600, 900, 0.1, 0.55)) === JSON.stringify(collageCells('rows', 7, 1600, 900, 0.1, 0.55, [1,1,1,1,1,1,1,1]))")
    assert same, '幅がそろっているのに分け方が変わった'
    # 縦に並べる・横に並べる以外のレイアウトでは境界線をつかまない
    assert await pg.evaluate("(() => { const L = selLayer(); L.layout = 'wk43'; return collageBorderAt(L, L.x, L.y); })()") == 0

    # 6) 古い保存データ（ttx・fc・w・memo が無い）・不正な値
    r = await pg.evaluate("""(() => { const d = JSON.parse(JSON.stringify(DOC)), L = d.layers.find(l => l.type === 'collage');
      delete L.ttx; delete L.wk.memo; L.cells.forEach(c => { delete c.w; delete c.tx.fc; delete c.tx.fcOn; delete c.tx.ec; delete c.tx.ecOn; delete c.tx.wk; });
      const a = normalizeDoc(JSON.parse(JSON.stringify(d))).layers.find(l => l.type === 'collage');
      L.ttx = {sc:99, ox:-9, oy:'x'}; L.wk.memo = 42; L.cells[0].w = -3; L.cells[1].w = 'abc'; L.cells[2].tx.fc = '"><img src=x onerror=alert(1)>'; L.cells[2].tx.ec = 'red;}';
      const b = normalizeDoc(JSON.parse(JSON.stringify(d))).layers.find(l => l.type === 'collage');
      return {a:[a.ttx, a.wk.memo, a.cells[0].w, a.cells[0].tx.fcOn, a.cells[0].tx.fc], b:[b.ttx, b.wk.memo, b.cells[0].w, b.cells[1].w, b.cells[2].tx.fc, b.cells[2].tx.ec]}; })()""")
    assert r['a'] == [{'sc': 1, 'ox': 0, 'oy': 0}, 8, 1, False, '#ffffff'], f'古いデータの既定値が違う {r["a"]}'
    b = r['b']
    assert b[0]['sc'] <= 3 and b[0]['ox'] >= -1 and b[0]['oy'] == 0, f'まとめての値が範囲外 {b[0]}'
    assert 1 <= b[1] <= 8 and 0.05 <= b[2] <= 20 and b[3] == 1, f'MEMO の位置・幅が範囲外 {b}'
    assert b[4] == '#ffffff' and b[5] == '#1f1b2d', f'不正な色がそのまま残った {b}'
    assert not pg.errors, f'ページでエラー: {pg.errors[:3]}'
    await close(pg)
