"""エフェクトの拡充：動的エフェクト17種（追加メニューの分類・設定・別パターン）、加工エフェクト（色収差・グラデーションマップ・色の置き換え・網点・線画・油絵・シャープ・ノイズ・ゆがみ）を
   背景・画像レイヤー・分割フレームのマスで、ワンクリック効果、仕上げのフィルター・紙の質感・傷、文字スタイルの追加、古い保存データ"""
from helpers import *

NEW_FX = ['uni', 'anger', 'sweat', 'gloom', 'mark', 'flare', 'cross', 'aura', 'fire', 'smoke', 'crack', 'glitch', 'petals', 'bubbles', 'shock', 'hit', 'shine']
# 加工エフェクト：[名前, 効果の差分]。背景・画像・マスの3か所で、それぞれ絵が変わることを確かめる
EXTRA = [['色収差', {'rgb': {'on': True, 'd': 14}}], ['グラデーションマップ', {'gmap': {'on': True}}], ['色の置き換え', {'rep': {'on': True, 'from': '#ff3d9a', 'to': '#2fff7a', 'tol': 0.2}}],
         ['網点', {'half': {'on': True}}], ['線画', {'edge': {'on': True, 'keep': False}}], ['油絵', {'paint': {'on': True, 'r': 8}}], ['シャープ', {'sharp': 2}], ['ノイズ', {'noise': 0.8}],
         ['波', {'warp': {'type': 'wave', 'amt': 0.8}}], ['渦巻き', {'warp': {'type': 'swirl', 'amt': 0.8}}], ['魚眼', {'warp': {'type': 'fisheye', 'amt': 0.8}}], ['すぼめる', {'warp': {'type': 'pinch', 'amt': 0.8}}],
         ['ポスタライズ', {'posterize': {'on': True, 'n': 2}}], ['2値化', {'thresh': {'on': True}}], ['ミニチュア', {'tilt': {'on': True, 'blur': 30}}],
         ['走査線', {'scan': {'on': True, 'a': 1, 'size': 6}}], ['ブラウン管', {'crt': {'on': True, 'curve': 0.6, 'mask': 0.8}}]]
# 画面と同じ経路（キャッシュを残したまま paintPreview）で描いた結果
SHOT = "(() => { paintPreview(false); return document.querySelector('#tv').toDataURL(); })()"
APPLY = """([path, diff]) => { const o = path.split('.').reduce((a, k) => a[k], {DOC, L: selLayer()});
  for(const k in diff){ const v = diff[k]; if(v && typeof v === 'object') Object.assign(o[k], v); else o[k] = v; } docChanged(false); syncDoc(); }"""
RESET = """(path) => { const o = path.split('.').reduce((a, k) => a[k], {DOC, L: selLayer()}), b = EXTRA_FX_BASE();
  for(const k in b) o[k] = typeof b[k] === 'object' ? Object.assign(o[k], b[k]) : b[k]; docChanged(false); syncDoc(); }"""

async def run(p):
    pg = await open_app(p)
    # 1) 追加メニュー：分類の見出しごとに、全種類のボタンがある。押すとレイヤーが増え、絵が描かれ、設定パネルに専用の項目が出る
    await pg.click('#addBtn'); await settle(pg, 300)
    grp = await pg.evaluate("[...document.querySelectorAll('#addFxChips .fxgrp')].map(g => [g.querySelector('.fxgrp-t').textContent, [...g.querySelectorAll('[data-addfx]')].map(b => b.dataset.addfx)])")
    assert [g[0] for g in grp] == ['定番', 'マンガ', '光', '演出', 'ゲーム・配信'], grp
    assert sorted(k for g in grp for k in g[1]) == sorted(await pg.evaluate("Object.keys(FX_DEF)")), f'追加メニューに無い種類がある {grp}'
    await pg.keyboard.press('Escape')
    await pg.evaluate("(() => { DOC.layers = DOC.layers.filter(l => l.type !== 'fx'); DOC.bg.type = 'color'; DOC.bg.color = '#336699'; selectLayer(null); docChanged(false); })()"); await settle(pg, 300)
    blank = await pg.evaluate(SHOT)
    for k in NEW_FX:
        await pg.click('#addBtn'); await settle(pg, 200); await pg.click(f'#addFxChips [data-addfx="{k}"]'); await settle(pg, 400)
        r = await pg.evaluate("(() => { const L = selLayer(); return [L && L.type, L && L.kind, [...document.querySelectorAll('[data-d^=\"@p.\"]')].filter(e => e.offsetParent).length]; })()")
        assert r[0] == 'fx' and r[1] == k and r[2] >= 1, f'{k} が追加されない・設定が出ない {r}'
        a = await pg.evaluate(SHOT); assert a != blank, f'{k} が何も描かれない'
        if await pg.evaluate("'seed' in selLayer().p"):
            await pg.evaluate("(() => { selLayer().p.seed += 7; docChanged(false); })()"); await settle(pg, 200)
            assert await pg.evaluate(SHOT) != a, f'{k} の「ランダム」で形が変わらない'
        await pg.evaluate("(() => { DOC.layers = DOC.layers.filter(l => l.type !== 'fx'); selectLayer(null); docChanged(false); })()"); await settle(pg, 150)
    # 種類ごとの選択肢：！？マークの文字・花びらの形・泡の種類・ベタフラッシュで絵が変わる
    for k, diff in [['mark', {'text': '♪'}], ['petals', {'shape': 'momiji'}], ['bubbles', {'type': 'splash'}], ['uni', {'fill': True}], ['cross', {'spikes': '8'}]]:
        await pg.evaluate(f"(() => {{ DOC.layers = [mkFx('{k}')]; selectLayer(DOC.layers[0].id); docChanged(false); }})()"); a = await pg.evaluate(SHOT)
        await pg.evaluate(f"(d => {{ Object.assign(selLayer().p, d); docChanged(false); }})", diff); b = await pg.evaluate(SHOT)
        assert a != b, f'{k} の {diff} で絵が変わらない'
    # 2) 加工エフェクト：背景画像・画像レイヤー・分割フレームのマスで、それぞれ絵が変わる（設定パネルにも項目がある）
    await pg.set_input_files('#imgfile', [IMG['synth.jpg']]); await settle(pg, 1800)
    aid = await pg.evaluate("DOC.layers.find(l => l.type === 'image').asset")
    targets = [
        ['背景', "(a => { DOC.layers = []; Object.assign(DOC.bg, {type:'image', asset:a}); selectLayer(null); docChanged(false); syncDoc(); })", 'DOC.bg', 'bg-fx', 'bg.'],
        ['画像', "(a => { const L = Object.assign(LAYER_BASE(), IMAGE_BASE(), {id:'Img1', type:'image', asset:a, x:960, y:540}); L.sc = 1080 / ASSETS[a].img.naturalHeight; DOC.layers = [L]; DOC.bg.type = 'color'; selectLayer('Img1'); docChanged(false); })", 'L.fx', 'lay-color', '@fx.'],
        ['マス', "(a => { const L = Object.assign(LAYER_BASE(), COLLAGE_BASE(), {id:'Col1', x:960, y:540}); L.cells[0].asset = a; L.cells[1].asset = a; DOC.layers = [L]; DOC.bg.type = 'color'; selectLayer('Col1'); docChanged(false); })", 'L.fx', 'lay-cfx', '@fx.'],
    ]
    for name, setup, path, tab, P in targets:
        await pg.evaluate(setup, aid); await settle(pg, 500)
        await page(pg, tab); await settle(pg, 300)
        keys = await pg.evaluate("[...document.querySelectorAll('[data-d], [data-dseg]')].filter(e => e.offsetParent).map(e => e.dataset.d || e.dataset.dseg)")
        for k in ['rgb.on', 'gmap.on', 'rep.on', 'half.on', 'edge.on', 'paint.on', 'sharp', 'noise', 'warp.type', 'scan.on', 'crt.on']:
            assert P + k in keys, f'{name}の設定に {k} がない'
        base = await pg.evaluate(SHOT)
        for label, diff in EXTRA:
            await pg.evaluate(APPLY, [path, diff]); await settle(pg, 120)
            assert await pg.evaluate(SHOT) != base, f'{name}：{label} で絵が変わらない'
            await pg.evaluate(RESET, path); await settle(pg, 80)
        assert await pg.evaluate(SHOT) == base, f'{name}：加工エフェクトを戻しても元の絵に戻らない'
    # マスごとの効果（fxMode=cell）でも効く
    await pg.evaluate("(() => { const L = selLayer(); L.fxMode = 'cell'; collageFxModeChanged(L); docChanged(false); })()"); base = await pg.evaluate(SHOT)
    await pg.evaluate("(() => { selLayer().cells[1].fx.edge.on = true; docChanged(false); })()")
    assert await pg.evaluate(SHOT) != base, 'マスごとの加工エフェクトが効かない'
    # 3) ワンクリック効果：マス（と画像）の新しいボタン・背景の新しいボタン
    await pg.evaluate("(() => { const L = selLayer(); L.fxMode = 'all'; docChanged(false); syncDoc(); })()"); await page(pg, 'lay-cfx'); await settle(pg, 300)
    for k, chk in [['dot', "L.fx.mosaic.on && L.fx.posterize.on"], ['crt', "L.fx.crt.on && L.fx.scan.on"], ['scan', "L.fx.scan.on && !L.fx.crt.on"], ['sketch', "L.fx.edge.on && !L.fx.edge.keep"], ['glitch', "L.fx.rgb.on && L.fx.noise > 0"], ['cyber', "L.fx.gmap.on"], ['wave', "L.fx.warp.type === 'wave'"], ['reset', "!cellFxOn(L.fx)"]]:
        await pg.evaluate(f"[...document.querySelectorAll('[data-cfx=\"{k}\"]')].find(e => e.offsetParent).click()"); await settle(pg, 200)
        assert await pg.evaluate(f"(L => {chk})(selLayer())"), f'マスのワンクリック効果 {k} が効かない'
    await pg.evaluate("(a => { DOC.layers = []; Object.assign(DOC.bg, {type:'image', asset:a}); selectLayer(null); docChanged(false); syncDoc(); })", aid)
    await page(pg, 'bg-fx'); await settle(pg, 300)
    for k, chk in [['crt', "b.crt.on && b.scan.on"], ['paint', "b.paint.on && !b.crt.on && !b.scan.on"], ['swirl', "b.warp.type === 'swirl' && !b.paint.on"], ['glitch', "b.rgb.on && DOC.layers.some(l => l.kind === 'glitch' && l.auto)"],
                   ['sakura', "DOC.layers.some(l => l.kind === 'petals') && !DOC.layers.some(l => l.kind === 'glitch')"], ['fire', "DOC.layers.some(l => l.kind === 'fire' && l.y > DOC.h / 2)"], ['reset', "!b.rgb.on && b.warp.type === 'none' && !b.paint.on"]]:
        await pg.evaluate(f"[...document.querySelectorAll('[data-bgfx=\"{k}\"]')].find(e => e.offsetParent).click()"); await settle(pg, 300)
        assert await pg.evaluate(f"(b => {chk})(DOC.bg)"), f'ワンクリック背景エフェクト {k} が効かない'
    # 4) 仕上げ：新しいフィルター・紙の質感・傷・ほこり、ワンクリック仕上げ
    base = await pg.evaluate(SHOT)
    for diff in [{'look': 'game'}, {'look': 'sunset'}, {'look': 'cyber'}, {'look': 'wafu'}, {'look': 'pastel'}, {'paper': 1}, {'dust': 1}]:
        await pg.evaluate("d => { DOC.fin = Object.assign(FIN_BASE(), d); docChanged(false); }", diff)
        assert await pg.evaluate("finOn(DOC.fin)") and await pg.evaluate(SHOT) != base, f'仕上げ {diff} が効かない'
    for k in ['game', 'sunset', 'cyber', 'pastel', 'wafu', 'oldfilm', 'crt']:
        assert await pg.evaluate(f"(() => {{ applyFinPreset('{k}'); return finOn(DOC.fin); }})()"), f'ワンクリック仕上げ {k} が効かない'
    await page(pg, 'bg-fin'); await settle(pg, 300)
    assert await pg.evaluate("['fin.paper', 'fin.dust'].every(k => [...document.querySelectorAll(`[data-d=\"${k}\"]`)].some(e => e.offsetParent))"), '仕上げに紙の質感・傷の項目がない'
    # 5) 文字スタイル：ダメージ数字・クリティカルがゲームの分類にある
    assert await pg.evaluate("['ダメージ数字', 'クリティカル'].every(n => PRESETS.some(p => p[0] === n) && PCATS['ゲーム'].includes(n))")
    # 6) 古い保存データ（新しい項目が無い）：既定値で補われ、効果は無効のまま
    r = await pg.evaluate("""(() => { const d = JSON.parse(JSON.stringify(DOC)); for(const k of ['rgb', 'gmap', 'rep', 'half', 'edge', 'paint', 'warp', 'sharp', 'noise']) delete d.bg[k]; delete d.fin.paper; delete d.fin.dust;
      d.layers = [{id:'c1', type:'collage', n:2, fx:{bright:0.2}, cells:[{fx:{contrast:0.1}}]}, {id:'i1', type:'image', asset:null, fx:{tone:'mono'}}];
      const o = normalizeDoc(d), c = o.layers[0], im = o.layers[1];
      return [o.bg.warp.type, o.bg.rgb.on, o.fin.paper, o.fin.dust, extraFxOn(o.bg), extraFxOn(c.fx), extraFxOn(c.cells[0].fx), extraFxOn(im.fx), c.fx.bright, im.fx.tone, c.fx.half.mix]; })()""")
    assert r == ['none', False, 0, 0, False, False, False, False, 0.2, 'mono', 0.6], f'古い保存データの読み込みが違う {r}'
    await close(pg)
    return f'動的エフェクト {len(NEW_FX)} 種・加工エフェクト {len(EXTRA)} 種×背景／画像／マス・ワンクリック・仕上げ・文字スタイル・古いデータ'
