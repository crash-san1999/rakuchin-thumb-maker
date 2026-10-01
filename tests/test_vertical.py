"""縦書き：列は右から左・縦長になる、縦中横・横倒し・句読点の補正、UIの出し分け、プリセット・素材置き場、各種エフェクトが動く"""
from helpers import *

LAY = """(o) => { const prev = RS; RS = merged(Object.assign({}, clone(S), o)); try{ const L = layout(); return {w:L.w, h:L.h, v:!!L.v, cx:L.lines.map(l => l.cx), y0:L.lines.map(l => l.y0), len:L.lines.map(l => l.len),
  cells:L.lines.map(l => (l.cells || []).map(c => ({t:c.t, r90:c.r90, k:c.k, ox:c.ox, oy:c.oy, adv:c.adv})))}; } finally { RS = prev; } }"""
SIZE = "async (o) => { await ensureFont(S); const c = render(1, merged(Object.assign({}, clone(S), o))); return [c.width, c.height]; }"

async def run(p):
    pg = await open_app(p)
    await pg.evaluate("selectLayer(DOC.layers.find(l => l.type === 'text').id)"); await page(pg, 'txt-text')
    base = dict(size=100, ls=0, lh=1.2, skew=0, extrude=dict(on=False), shadow=dict(on=False))
    # 1) 横書きは横長・縦書きは縦長。列は右から左へ進む
    h = await pg.evaluate(SIZE, dict(base, text='あいうえお'));  v = await pg.evaluate(SIZE, dict(base, text='あいうえお', vertical=True))
    assert h[0] > h[1] and v[1] > v[0], f'縦書きで縦長にならない 横{h} 縦{v}'
    L = await pg.evaluate(LAY, dict(base, text='あいう\nえお', vertical=True))
    assert L['v'] and L['cx'][0] > L['cx'][1], f'1行目が右に来ない {L["cx"]}'
    assert abs(L['cx'][0] - L['cx'][1] - 120) < 0.5, '行間が列の間隔にならない'
    assert abs(L['h'] - 300) < 0.5 and abs(L['len'][1] - 200) < 0.5, f'列の長さが合わない {L["h"]} {L["len"]}'
    # 2) 揃え：左=上、中央、右=下
    ys = [(await pg.evaluate(LAY, dict(base, text='あいう\nえ', vertical=True, align=a)))['y0'][1] for a in ('left', 'center', 'right')]
    assert abs(ys[0]) < 0.5 and abs(ys[1] - 100) < 0.5 and abs(ys[2] - 200) < 0.5, f'上・中央・下揃えにならない {ys}'
    # 3) 字間は縦の文字送り
    L = await pg.evaluate(LAY, dict(base, text='あいう', vertical=True, ls=20)); assert abs(L['h'] - 340) < 0.5, f'字間が縦に効かない {L["h"]}'
    # 4) 縦中横・横倒し・正立
    c = (await pg.evaluate(LAY, dict(base, text='第20回!!', vertical=True)))['cells'][0]
    assert [x['t'] for x in c] == ['第', '20', '回', '!!'], f'縦中横で1マスにならない {[x["t"] for x in c]}'
    assert all(x['k'] <= 1 for x in c) and c[1]['k'] < 1, '縦中横が1マスに収まらない'
    c = (await pg.evaluate(LAY, dict(base, text='第20回', vertical=True, vtcy=False)))['cells'][0]
    assert [x['t'] for x in c] == ['第', '2', '0', '回'], '縦中横オフで1文字ずつにならない'
    c = (await pg.evaluate(LAY, dict(base, text='SF6 ABC', vertical=True, vlat='side')))['cells'][0]
    assert [x['t'] for x in c] == ['SF6', ' ', 'ABC'] and c[0]['r90'] and c[2]['r90'], f'英数字を横倒しにできない {c}'
    c = (await pg.evaluate(LAY, dict(base, text='SF6', vertical=True, vlat='up')))['cells'][0]
    assert [x['t'] for x in c] == ['S', 'F', '6'] and not any(x['r90'] for x in c), '英数字を立てられない'
    # 4b) 各文字の見えている部分がマスの中心に来る（句読点・小さい仮名は意図した位置）
    r = await pg.evaluate("""async () => { await ensureFont(S);
      const prev = RS; RS = merged(Object.assign({}, clone(S), {text:[...'あいーAg1!「」〜…W、ゃ'].join(''), vertical:true, size:100, lh:1.2, ls:0, vtcy:false}));
      const L = layout(), items = glyphs(L), res = [];
      for(const it of items){ const c = mk(L.w + 200, L.h + 200), x = c.getContext('2d'); x.translate(100, 100); x.font = fontStr(); x.letterSpacing = '0px'; x.fillStyle = '#000';
        drawGlyphs(x, [it], (q, px, py) => x.fillText(q.t, px, py)); const W = c.width, d = x.getImageData(0, 0, W, c.height).data, cx = it.bx + 100, cy = it.by + 100;
        let l = 1e9, r = -1, t = 1e9, b = -1;
        for(let y = Math.floor(cy - 50); y < cy + 50; y++) for(let xx = Math.floor(cx - 50); xx < cx + 50; xx++) if(d[(y * W + xx) * 4 + 3] > 128){ l = Math.min(l, xx); r = Math.max(r, xx); t = Math.min(t, y); b = Math.max(b, y); }
        res.push([it.t, (l + r) / 2 - cx, (t + b) / 2 - cy]); }
      RS = prev; return res; }""")
    for t, dx, dy in r:
        if t in '、ゃ': continue
        assert abs(dx) <= 2 and abs(dy) <= 2, f'「{t}」がマスの中心からずれている ({dx:.1f}, {dy:.1f})'
    # 5) 長音・括弧・波線は回転、句読点は右上、小さい仮名は少し右上
    c = {x['t']: x for x in (await pg.evaluate(LAY, dict(base, text='ー「」〜、。ゃあ', vertical=True)))['cells'][0]}
    assert all(c[t]['r90'] for t in 'ー「」〜'), '長音・括弧が回転しない'
    assert not c['あ']['r90'] and c['あ']['ox'] == 0 and c['あ']['oy'] == 0
    assert c['、']['ox'] > 0 and c['、']['oy'] < 0 and c['。']['ox'] > 0 and c['。']['oy'] < 0, f'句読点が右上に寄らない {c["、"]}'
    assert c['ゃ']['ox'] > 0 and c['ゃ']['oy'] < 0, '小さい仮名が右上に寄らない'
    # 6) 強調の {} は縦書きでも使える（記号は表示されない）
    c = (await pg.evaluate(LAY, dict(base, text='あ{いう}え', vertical=True)))['cells'][0]; assert [x['t'] for x in c] == list('あいうえ')
    # 7) 主要なエフェクトを全部入れても描ける（エラーなし・何か描かれる）
    fx = dict(base, text='縦書き20!!\nテスト、ゃ', vertical=True, fillType='grad', gloss=dict(on=True), marker=dict(on=True), plate=dict(on=True), box=dict(on=True),
              dots=dict(on=True), pattern=dict(on=True, type='cutlines'), bevel=dict(on=True), inner=dict(on=True), extrude=dict(on=True), offset=dict(on=True),
              reflect=dict(on=True), jitter=dict(on=True), warp=dict(type='arch'), glitch=dict(on=True), drip=dict(on=True), trail=dict(on=True), skew=8)
    sz = await pg.evaluate(SIZE, fx); assert sz[0] > 100 and sz[1] > 300, f'エフェクト全部入りで描けない {sz}'
    for t in ('grad', 'split', 'metal'):
        for scope in ('block', 'line'):
            sz = await pg.evaluate(SIZE, dict(base, text='あいう\nえお', vertical=True, fillType=t, gradScope=scope)); assert sz[1] > sz[0]
    # 8) 塗りが回転した文字でもずれない：グラデの上下色が列の上下に出る
    r = await pg.evaluate("""async () => { await ensureFont(S);
      const c = render(1, merged(Object.assign({}, clone(S), {text:'ーあー', vertical:true, size:120, fillType:'split', splitDir:'h', splitPos:0.5, fill1:'#ff0000', fill2:'#0000ff',
        strokes:[{on:false,w:0,c:'#000'},{on:false,w:0,c:'#000'},{on:false,w:0,c:'#000'}], extrude:{on:false}, shadow:{on:false}, skew:0, pad:0})));
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let top = 0, bot = 0, tr = 0, bb = 0;
      for(let y = 0; y < c.height; y++) for(let x = 0; x < c.width; x++){ const i = (y * c.width + x) * 4; if(d[i + 3] < 200) continue;
        if(y < c.height / 2){ top++; if(d[i] > d[i + 2]) tr++; } else { bot++; if(d[i + 2] > d[i]) bb++; } }
      return [tr / top, bb / bot]; }""")
    assert r[0] > 0.9 and r[1] > 0.9, f'縦書きで上下2色がずれる {r}'
    # 9) UI：チェックで縦書きに。揃えの文言が上/中央/下になり、縦書き用の項目が出る
    vis = "(sel) => [...document.querySelectorAll(sel)].some(e => e.offsetParent !== null)"
    assert not await pg.evaluate(vis, '[data-seg="vlat"]'), '縦書きでないのに縦書き用の項目が出ている'
    await pg.evaluate("document.querySelector('input[data-k=\"vertical\"]').click()"); await settle(pg, 400)
    assert await pg.evaluate("S.vertical") is True and await pg.evaluate(vis, '[data-seg="vlat"]') and await pg.evaluate(vis, 'input[data-k="vtcy"]')
    labels = await pg.evaluate("[...document.querySelectorAll('.seg[data-seg=\"align\"]')].filter(g => g.offsetParent).map(g => [...g.querySelectorAll('button')].map(b => b.textContent).join(''))")
    assert labels == ['上中央下'], f'揃えが上・中央・下にならない {labels}'
    await pg.click('.seg[data-seg="vlat"] button[data-v="side"]'); assert await pg.evaluate("S.vlat") == 'side'
    await settle(pg, 1500)
    d = await pg.evaluate("(() => { const L = selLayer(), g = dims.get(L.id); return [L.style.vertical, g.w, g.h]; })()")
    assert d[0] is True and d[2] > d[1], f'レイヤーが縦書きで描かれない {d}'
    # 10) プリセット：縦書きの指定のないスタイルを適用しても縦書きのまま。縦書きを保存したスタイルは縦書きで適用される
    await pg.evaluate("applyPreset(PRESETS[0] || PRESETS.find(Boolean))") if await pg.evaluate("typeof PRESETS !== 'undefined'") else None
    assert await pg.evaluate("S.vertical") is True, 'プリセットを当てたら横書きに戻った'
    await pg.evaluate("applyPreset(Object.assign(clone(DEFAULT), {vertical:false}))"); assert await pg.evaluate("S.vertical") is False
    await pg.evaluate("applyPreset(Object.assign(clone(DEFAULT), {vertical:true, vlat:'side'}))"); assert await pg.evaluate("[S.vertical, S.vlat]") == [True, 'side']
    # 11) 素材置き場：横書きのスタイルは向きを持たない／縦書きのスタイルは持つ
    await pg.evaluate("applyPreset(Object.assign(clone(DEFAULT), {vertical:false}))")
    await pg.evaluate("libAddStyle('よこ', S)"); await settle(pg, 600)
    await pg.evaluate("applyPreset(Object.assign(clone(DEFAULT), {vertical:true}))")
    await pg.evaluate("libAddStyle('たて', S)"); await settle(pg, 600)
    r = await pg.evaluate("LIB.filter(i => i.kind === 'style').map(i => [i.name, 'vertical' in i.s, i.s.vertical])")
    assert ['よこ', False, None] in [[a, b, c if b else None] for a, b, c in r] and ['たて', True, True] in r, f'素材置き場の向きの扱いが違う {r}'
    # 12) 古い保存データ（縦書きの項目がない）は横書きとして読める
    ok = await pg.evaluate("(() => { const d = JSON.parse(JSON.stringify(DOC)); d.layers.filter(l => l.type === 'text').forEach(l => { delete l.style.vertical; delete l.style.vlat; delete l.style.vtcy; }); const n = normalizeDoc(d).layers.find(l => l.type === 'text'); return [merged(n.style).vertical, merged(n.style).vtcy]; })()")
    assert ok == [False, True], f'古い保存データが横書きにならない {ok}'
    await close(pg)
