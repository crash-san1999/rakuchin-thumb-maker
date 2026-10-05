"""吹き出しのしっぽのつまみ（キャンバス上で直接ドラッグ）：つまみが実際のしっぽの先に出る（回転・斜体・文字の回転・縦書き・5種類の吹き出し・フレーム）、
   ドラッグで位置と長さ、Shift で先の向き、文字が動かない、取り消しで戻る、出ない条件（ワープ・ロック・しっぽなし・吹き出しでない・複数選択）、
   スマホの長押し、パネルのスライダーとのつながり"""
from helpers import *

# 選んでいる文字レイヤーを吹き出しにして描く。style・レイヤーの差分を渡す
SETUP = """([plate, st, lay]) => { const L = DOC.layers.find(l => l.type === 'text'); DOC.layers = [L]; DOC.bg.type = 'color'; DOC.bg.color = '#336699';
  Object.assign(L, {x:960, y:540, sc:1, rot:0, locked:false, hidden:false}, lay); L.style = merged(Object.assign(clone(L.style), {text:'テスト', size:120, skew:0, rotate:0, vertical:false, shadow:{on:false}, warp:{type:'none', amt:0, freq:1}}, st));
  L.style.plate = Object.assign(clone(L.style.plate), {on:true, shape:'bubble', tail:'left', ts:1, tdir:0, tw:1, tbend:0, sw:6, c:'#ffffff'}, plate);
  DOC.msel = []; selectLayer(L.id); prevCache.clear(); docChanged(false); paintPreview(false); }"""
# しっぽの先（つまみ）から付け根へ少し戻った点に、実際に絵があるか（その文字レイヤーだけを DOC の大きさで描いて調べる）
ON_TAIL = """(() => { const t = tailInfo(); if(!t) return null; const L = selLayer(), c = mk(DOC.w, DOC.h), x = c.getContext('2d'); drawOne(x, L, 1, false, new Map());
  const at = k => [t.base[0] + (t.tip[0] - t.base[0]) * k, t.base[1] + (t.tip[1] - t.base[1]) * k];
  const a = ([px, py]) => x.getImageData(Math.round(px), Math.round(py), 1, 1).data[3];
  // 先より外側（付け根→先の延長 1.2・1.5 倍）には絵がない＝つまみが本当にしっぽの「先」にある（本体の上にずれていない）
  // 絵から独立に求めたしっぽの先：絵のある画素の重心から見て、つまみの向き（±10° の範囲）でいちばん遠い画素（つまみの計算を使わずに確かめる）
  const d = x.getImageData(0, 0, DOC.w, DOC.h).data; let sx = 0, sy = 0, n = 0;
  for(let y = 0; y < DOC.h; y += 2) for(let X = 0; X < DOC.w; X += 2) if(d[(y * DOC.w + X) * 4 + 3] > 128){ sx += X; sy += y; n++; }
  const gx = sx / n, gy = sy / n, ux = t.tip[0] - gx, uy = t.tip[1] - gy, ul = Math.hypot(ux, uy) || 1; let best = -1e9, far = null;
  for(let y = 0; y < DOC.h; y += 2) for(let X = 0; X < DOC.w; X += 2) if(d[(y * DOC.w + X) * 4 + 3] > 128){ const px = X - gx, py = y - gy, r = Math.hypot(px, py) || 1; if((px * ux + py * uy) / (r * ul) > 0.985 && r > best){ best = r; far = [X, y]; } }
  return {tip:t.tip, base:t.base, center:t.center, alpha:[0.85, 0.7].map(k => a(at(k))), beyond:Math.max(a(at(1.2)), a(at(1.5))), far, farDist:Math.hypot(far[0] - t.tip[0], far[1] - t.tip[1]),
    len:Math.hypot(t.tip[0] - t.base[0], t.tip[1] - t.base[1])}; })()"""

async def to_screen(pg, x, y):
    return await pg.evaluate("([x, y]) => { const r = document.querySelector('#tv').getBoundingClientRect(); return [r.left + x / DOC.w * r.width, r.top + y / DOC.h * r.height]; }", [x, y])

async def drag(pg, frm, to, shift=False):
    a = await to_screen(pg, *frm); b = await to_screen(pg, *to)
    if shift: await pg.keyboard.down('Shift')
    await pg.mouse.move(*a); await pg.mouse.down()
    for i in range(1, 7): await pg.mouse.move(a[0] + (b[0] - a[0]) * i / 6, a[1] + (b[1] - a[1]) * i / 6)
    await pg.mouse.up()
    if shift: await pg.keyboard.up('Shift')
    await settle(pg, 300)

async def run(p):
    pg = await open_app(p)
    # 1) つまみの位置：5種類の吹き出し × レイヤーの回転・拡大、文字の斜体・回転、縦書き、しっぽの位置・向き・曲がり。どれもしっぽの上に出る
    cases = [({}, {}, {}), ({}, {}, {'rot': 35, 'sc': 1.4}), ({}, {'skew': 15}, {}), ({}, {'rotate': 25}, {'rot': -20}), ({}, {'vertical': True}, {}),
             ({'tail': 'free', 'tpos': 300}, {}, {}), ({'tail': 'tr', 'tdir': 40, 'ts': 1.6}, {}, {}), ({'tail': 'sr', 'tbend': 0.7}, {'skew': -10}, {'rot': 15})]
    for shape in ['bubble', 'sbubble', 'obubble', 'cloud', 'shout']:
        for plate, st, lay in cases:
            await pg.evaluate(SETUP, [dict(plate, shape=shape), st, lay])
            r = await pg.evaluate(ON_TAIL)
            assert r, f'{shape} {plate} {st} {lay}：つまみが出ない'
            assert max(r['alpha']) > 100, f'{shape} {plate} {st} {lay}：つまみがしっぽの上にない {r}'
            assert r['len'] > 10, f'{shape}：付け根と先が同じ位置 {r}'
            assert r['farDist'] < max(22, r['len'] * 0.18), f'{shape} {plate} {st} {lay}：つまみが、絵でいちばん突き出たしっぽの先から離れている {r}'
            assert r['beyond'] < 40, f'{shape} {plate} {st} {lay}：つまみの外側にも絵がある（先からずれている） {r}'
    # 2) 出ない条件：ワープ・ロック・しっぽなし・吹き出しでない・背景シェイプなし・複数選択・非表示
    for plate, st, lay, why in [({}, {'warp': {'type': 'arc', 'amt': 0.3, 'freq': 1}}, {}, 'ワープ'), ({}, {}, {'locked': True}, 'ロック'), ({'tail': 'none'}, {}, {}, 'しっぽなし'),
                                ({'shape': 'round'}, {}, {}, '角丸（吹き出しでない）'), ({'on': False}, {}, {}, '背景シェイプなし'), ({}, {}, {'hidden': True}, '非表示')]:
        await pg.evaluate(SETUP, [plate, st, lay])
        assert await pg.evaluate("tailInfo()") is None, f'{why}のときにつまみが出る'
    await pg.evaluate(SETUP, [{}, {}, {}])
    await pg.evaluate("(() => { const L = selLayer(); const M = Object.assign(mkFx('sparkle'), {id:'Msel'}); DOC.layers.push(M); DOC.msel = [L.id, 'Msel']; paintPreview(false); })()")
    assert await pg.evaluate("tailInfo()") is None, '複数選択のときにつまみが出る'
    # 3) ドラッグ：先がポインタに付いてくる（位置＝自由の角度、長さ）。吹き出しの中心（文字）は動かない。パネルにも反映
    await pg.evaluate(SETUP, [{}, {}, {'rot': 20}])
    t0 = await pg.evaluate("tailInfo()")
    # 目標：今のしっぽの先を、中心のまわりに 120° 回して、少し遠くへ（左下 → 右上あたり）
    import math
    vx, vy = t0['tip'][0] - t0['center'][0], t0['tip'][1] - t0['center'][1]; a = math.radians(-120)
    target = [t0['center'][0] + (vx * math.cos(a) - vy * math.sin(a)) * 1.15, t0['center'][1] + (vx * math.sin(a) + vy * math.cos(a)) * 1.15]
    await drag(pg, t0['tip'], target)
    r = await pg.evaluate("(() => { const p = selLayer().style.plate, t = tailInfo(); return {tail:p.tail, tpos:p.tpos, ts:p.ts, tip:t.tip, center:t.center}; })()")
    assert r['tail'] == 'free', f'ドラッグで「自由」にならない {r}'
    assert abs(r['center'][0] - t0['center'][0]) < 2 and abs(r['center'][1] - t0['center'][1]) < 2, f'しっぽを動かすと文字が動いてしまう {t0["center"]} → {r["center"]}'
    d = ((r['tip'][0] - target[0]) ** 2 + (r['tip'][1] - target[1]) ** 2) ** 0.5
    assert d < 45, f'しっぽの先がポインタの位置に来ない（{d:.0f}px ずれ）{r} {target}'
    await pg.evaluate("syncUI()")
    assert await pg.evaluate("[+document.querySelector('[data-k=\"plate.tpos\"]').value, document.querySelector('[data-k=\"plate.tail\"]').value]") == [r['tpos'], 'free'], 'パネルに反映されない'
    # 4) Shift＋ドラッグ：付け根（位置の角度）はそのまま、先の向きだけ変わる
    t1 = await pg.evaluate("tailInfo()")
    await drag(pg, t1['tip'], [t1['tip'][0] + 120, t1['tip'][1] + 140], shift=True)
    r2 = await pg.evaluate("(() => { const p = selLayer().style.plate, t = tailInfo(); return {tpos:p.tpos, tdir:p.tdir, base:t.base}; })()")
    assert r2['tpos'] == r['tpos'] and r2['tdir'] != 0, f'Shift＋ドラッグで先の向きだけ変わらない {r} {r2}'
    assert abs(r2['base'][0] - t1['base'][0]) < 3 and abs(r2['base'][1] - t1['base'][1]) < 3, '付け根が動いてしまう'
    # 5) 取り消しで、ドラッグ前のしっぽと位置に戻る（ドラッグ1回が取り消し1回）
    await pg.keyboard.press('Control+z'); await settle(pg, 500)
    assert await pg.evaluate("selLayer().style.plate.tdir") == 0, '取り消しで先の向きが戻らない'
    await pg.keyboard.press('Control+z'); await settle(pg, 500)
    assert await pg.evaluate("[selLayer().style.plate.tail, selLayer().x, selLayer().y]") == ['left', 960, 540], '取り消しでしっぽと文字の位置が戻らない'
    # 6) つまみの外をドラッグすると、ふつうの移動（しっぽは変わらない）
    await pg.evaluate(SETUP, [{}, {}, {}])
    c = await pg.evaluate("tailInfo().center")
    await drag(pg, c, [c[0] + 100, c[1]])
    assert await pg.evaluate("[selLayer().style.plate.tail, selLayer().x]") == ['left', 1060], 'つまみの外のドラッグが移動にならない'
    # 7) スマホ：長押ししてから動かすと先の向き、すぐ動かすと位置
    await pg.evaluate(SETUP, [{}, {}, {}])
    r = await pg.evaluate("""(() => { const L = selLayer(), t = tailInfo(); const st = tailDragStart(L, t, {pointerType:'touch'}); st.t0 -= 1000;
      tailDragMove(st, t.tip[0] + 80, t.tip[1] + 60, {shiftKey:false}); const a = [st.mode, L.style.plate.tail, L.style.plate.tdir];
      const t2 = tailInfo(), st2 = tailDragStart(L, t2, {pointerType:'touch'}); tailDragMove(st2, t2.tip[0] - 80, t2.tip[1] + 60, {shiftKey:false}); return a.concat([st2.mode, L.style.plate.tail]); })()""")
    assert r[0] == 'dir' and r[1] == 'left' and r[2] != 0 and r[3] == 'pos' and r[4] == 'free', f'スマホの長押しの切り替えが違う {r}'
    # 8) 切り抜きフレームの吹き出し：つまみが先に出る。外側へ動かすと辺が変わり、Shift で付け根の位置だけ変わる
    await pg.set_input_files('#imgfile', [IMG['chara.jpg']]); await settle(pg, 1500)
    await pg.evaluate("(() => { const L = DOC.layers.find(l => l.type === 'image'); DOC.layers = [L]; Object.assign(L, {x:960, y:540, rot:25}); L.sc = 700 / ASSETS[L.asset].img.naturalHeight; L.frame.shape = 'bubble'; selectLayer(L.id); prevCache.clear(); docChanged(false); paintPreview(false); })()"); await settle(pg, 500)
    r = await pg.evaluate(ON_TAIL); assert r and max(r['alpha']) > 100, f'フレームのつまみがしっぽの上にない {r}'
    g = await pg.evaluate("(() => { const L = selLayer(), G = frameGeom(L), a = 25 * Math.PI / 180, u = G.fw / 2 * 1.03 * L.sc, v = G.fh * 0.1 * L.sc; return [L.x + u * Math.cos(a) - v * Math.sin(a), L.y + u * Math.sin(a) + v * Math.cos(a)]; })()")
    await drag(pg, r['tip'], g)
    fr = await pg.evaluate("selLayer().frame")
    assert fr['tside'] == 'r', f'右へ動かしても、しっぽが右の辺に移らない {fr}'
    tip = await pg.evaluate("tailInfo().tip"); assert ((tip[0] - g[0]) ** 2 + (tip[1] - g[1]) ** 2) ** 0.5 < 60, f'フレームのしっぽの先がポインタに来ない {tip} {g}'
    await drag(pg, tip, [tip[0] - 40, tip[1] + 90], shift=True)
    fr2 = await pg.evaluate("selLayer().frame")
    assert fr2['tside'] == 'r' and fr2['tp'] != fr['tp'] and fr2['tt'] == fr['tt'], f'Shift＋ドラッグで付け根の位置だけ変わらない {fr} {fr2}'
    await close(pg)
    return 'つまみの位置（吹き出し5種×回転・斜体・文字の回転・縦書き・各設定）・出ない条件・ドラッグ・Shift・文字が動かない・取り消し・移動との区別・スマホ長押し・フレーム'
