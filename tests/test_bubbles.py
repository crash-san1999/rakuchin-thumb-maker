"""背景シェイプの吹き出し系：各形が描けて、しっぽの向き・なしが効く。しっぽの位置（自由な角度）・先の向き・太さ・曲がりが全部の吹き出しで効く。
   切り抜きフレームの吹き出しも、しっぽの辺・位置・先の向き・太さ・曲がりを変えられる"""
from helpers import *
TIMEOUT = 300   # 吹き出し5種 × しっぽの設定を1つずつ描き比べるので時間がかかる（run_all.py がこの値まで待つ）

R = """async ([sh, tail, ex]) => { await ensureFont(S); const c = render(0.5, merged(Object.assign({}, clone(S), {text:'こんにちは', size:100, skew:0, shadow:{on:false}, plate:Object.assign(clone(S.plate), {on:true, shape:sh, tail, sw:6}, ex || {})})));
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for(let i = 3; i < d.length; i += 4) if(d[i] > 20) n++; let hsh = 2166136261; for(let i = 0; i < d.length; i += 3) hsh = Math.imul(hsh ^ d[i], 16777619); return [c.width, c.height, n, c.width + 'x' + c.height + ':' + (hsh >>> 0)]; }"""

async def run(p):
    pg = await open_app(p)
    for sh in ['bubble', 'sbubble', 'obubble', 'cloud', 'shout']:
        none = await pg.evaluate(R, [sh, 'none'])
        assert none[2] > 500, f'{sh} が描けない {none}'
        for t in ['left', 'center', 'right', 'tl', 'tr', 'sl', 'sr']:
            r = await pg.evaluate(R, [sh, t])
            assert r[2] > none[2] or r[:2] != none[:2], f'{sh}/{t} のしっぽが出ない {r} {none}'
    old = await pg.evaluate(R, ['bubble', 'left']); assert old[2] > 500
    # しっぽの自由な位置・先の向き・太さ・曲がり：どの吹き出しでも絵が変わる。初期値（0・1）のままなら以前の形と同じ
    for sh in ['bubble', 'sbubble', 'obubble', 'cloud', 'shout']:
        base = await pg.evaluate(R, [sh, 'left', {}])
        assert (await pg.evaluate(R, [sh, 'free', {'tpos': 115}]))[3] == base[3], f'{sh}：自由の 115° が「左下」と同じにならない'
        assert (await pg.evaluate(R, [sh, 'left', {'tdir': 0, 'tw': 1, 'tbend': 0}]))[3] == base[3]
        for ex in [{'tpos': 20}, {'tpos': 200}, {'tpos': 300}]:
            assert (await pg.evaluate(R, [sh, 'free', ex]))[3] != base[3], f'{sh}：しっぽの位置 {ex} が効かない'
        for ex in [{'tdir': 50}, {'tdir': -50}, {'tw': 2}, {'tbend': 0.8}, {'tbend': -0.8}]:
            r = await pg.evaluate(R, [sh, 'left', ex]); assert r[3] != base[3], f'{sh}：{ex} が効かない'
        # 長く・太く・曲げても、しっぽがキャンバスの端で切れない（いちばん外側の列・行に絵がない）
        edge = await pg.evaluate("""async ([sh]) => { const c = render(0.5, merged(Object.assign({}, clone(S), {text:'あ', size:100, skew:0, shadow:{on:false}, plate:Object.assign(clone(S.plate), {on:true, shape:sh, tail:'free', tpos:300, ts:2, tw:2.5, tbend:1, tdir:60, sw:6})})));
          const x = c.getContext('2d'), W = c.width, H = c.height, a = [x.getImageData(0, 0, W, 1), x.getImageData(0, H - 1, W, 1), x.getImageData(0, 0, 1, H), x.getImageData(W - 1, 0, 1, H)];
          return a.some(im => { for(let i = 3; i < im.data.length; i += 4) if(im.data[i] > 10) return true; return false; }); }""", [sh])
        assert not edge, f'{sh}：大きなしっぽがキャンバスの端で切れる'
    # 切り抜きフレームの吹き出し：初期値は以前の固定のしっぽと同じ。辺・位置・先・太さ・曲がりで形が変わる
    F = """(o) => { const c = mk(200, 200), x = c.getContext('2d'); x.translate(100, 100); x.beginPath(); framePath(x, 'bubble', 160, 160, 0.2, 1, Object.assign(FRAME_BASE(), o)); x.fill(); return c.toDataURL(); }"""
    old_f = await pg.evaluate("""() => { const c = mk(200, 200), x = c.getContext('2d'); x.translate(100, 100); x.beginPath(); const a = 80, b = 80, w = 160, h = 160, bh = h * 0.8, rr = Math.min(w, bh) * 0.2;
      x.roundRect(-a, -b, w, bh, rr); x.moveTo(-a + w * 0.2, -b + bh - 1); x.lineTo(-a + w * 0.14, b); x.lineTo(-a + w * 0.4, -b + bh - 1); x.closePath(); x.fill(); return c.toDataURL(); }""")
    fb = await pg.evaluate(F, {})
    assert fb == old_f, 'フレームの吹き出しの初期の形が以前と変わった'
    for o in [{'tside': 't'}, {'tside': 'l'}, {'tside': 'r'}, {'tp': 0.7}, {'tt': 0.3}, {'tw': 0.45}, {'tb': 0.8}, {'tside': 'zzz', 'tp': 0.7}]:
        assert await pg.evaluate(F, o) != fb, f'フレームの吹き出し {o} が効かない'
    assert await pg.evaluate(F, {'tside': 'toString'}) == fb, '不正な辺の名前は「下」として描く'
    vis = "(sel) => [...document.querySelectorAll(sel)].some(e => e.offsetParent !== null)"
    await pg.evaluate("selectLayer(DOC.layers.find(l => l.type === 'text').id)"); await page(pg, 'txt-deco')
    await pg.evaluate("S.plate.on = true; S.plate.shape = 'cloud'; syncUI(); schedule(); document.querySelector('section[data-on=\"plate.on\"]').classList.remove('collapsed')"); await settle(pg, 300)
    assert await pg.evaluate(vis, '[data-k="plate.tail"]') and await pg.evaluate(vis, '[data-k="plate.ts"]'), 'しっぽの設定が出ない'
    assert all([await pg.evaluate(vis, f'[data-k="plate.{k}"]') for k in ['tdir', 'tw', 'tbend']]) and not await pg.evaluate(vis, '[data-k="plate.tpos"]'), 'しっぽの向き・太さ・曲がりの設定が出ない'
    await pg.evaluate("S.plate.tail = 'free'; syncUI(); schedule()"); await settle(pg, 300)
    assert await pg.evaluate(vis, '[data-k="plate.tpos"]'), '「自由」でしっぽの位置（角度）が出ない'
    # 切り抜きフレーム：吹き出しの形を選んだときだけ、しっぽの設定が出る
    await pg.set_input_files('#imgfile', [IMG['chara.jpg']]); await settle(pg, 1500)
    await pg.evaluate("(() => { const L = DOC.layers.find(l => l.type === 'image'); L.frame.shape = 'bubble'; selectLayer(L.id); docChanged(false); syncDoc(); })()"); await page(pg, 'lay-frame'); await settle(pg, 500)
    keys = await pg.evaluate("[...document.querySelectorAll('[data-d], [data-dseg]')].filter(e => e.offsetParent).map(e => e.dataset.d || e.dataset.dseg)")
    assert all(k in keys for k in ['@frame.tside', '@frame.tp', '@frame.tt', '@frame.tw', '@frame.tb']), f'フレームのしっぽの設定が出ない {keys}'
    a = await pg.evaluate("(() => { paintPreview(false); return document.querySelector('#tv').toDataURL(); })()")
    await pg.evaluate("(() => { selLayer().frame.tside = 'r'; docChanged(false); })()")
    assert await pg.evaluate("(() => { paintPreview(false); return document.querySelector('#tv').toDataURL(); })()") != a, 'フレームのしっぽの辺を変えても画面が変わらない'
    await close(pg)
