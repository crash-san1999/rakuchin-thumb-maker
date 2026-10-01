"""エフェクトの追加：仕上げエフェクト（全体に一括）、背景の追加エフェクト（ポスタライズ・2値化・ミニチュア・柄・ワンクリック）、動的エフェクトの新しい種類、古い保存データ"""
from helpers import *

STAT = """() => { const c = mk(480, 270); compose(c.getContext('2d'), 480, 270, false, new Map()); const d = c.getContext('2d').getImageData(0, 0, 480, 270).data;
  let s = 0, sat = 0, h = 0; const cols = new Set(); for(let i = 0; i < d.length; i += 4){ s += d[i] + d[i + 1] + d[i + 2]; sat += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]); if(i % 40 === 0) cols.add(d[i] >> 4 << 8 | d[i + 1] >> 4 << 4 | d[i + 2] >> 4); h = (h * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) % 1e9; }
  const n = d.length / 4; return {b: s / n / 3, sat: sat / n, cols: cols.size, h}; }"""

async def run(p):
    pg = await open_app(p)
    await pg.set_input_files('#bgimgfile', [IMG['city.jpg']]); await settle(pg, 2000)
    await pg.evaluate("DOC.bg.type = 'image'; DOC.sel = null; docChanged(false)")
    st = lambda: pg.evaluate(STAT)
    base = await st()
    # 1) 仕上げ：ワンクリックで全体が変わる（文字も含めて）。なしに戻すと元どおり
    seen = set()
    for k in await pg.evaluate("Object.keys(FIN_PRESETS).filter(k => k !== 'reset')"):
        await pg.evaluate(f"applyFinPreset('{k}')"); r = await st()
        assert r['h'] != base['h'], f'仕上げ {k} で変わらない'
        seen.add(r['h'])
    assert len(seen) >= 9, '仕上げの結果が似すぎ'
    await pg.evaluate("applyFinPreset('horror')"); r = await st(); assert r['sat'] < base['sat'] * 0.8 and r['b'] < base['b'], f'ホラーで暗く・色が薄くならない {base} {r}'
    await pg.evaluate("applyFinPreset('reset')"); assert (await st())['h'] == base['h'], 'なしに戻しても元に戻らない'
    # 文字だけ（背景なし）のときは、透明な部分は透明のまま
    a = await pg.evaluate("""() => { DOC.bg.hidden = true; applyFinPreset('emo'); const c = mk(480, 270); compose(c.getContext('2d'), 480, 270, false, new Map()); const d = c.getContext('2d').getImageData(0, 0, 3, 3).data; DOC.bg.hidden = false; applyFinPreset('reset'); return d[3]; }""")
    assert a == 0, f'背景なしで透明が埋まった {a}'
    # 2) 背景の追加エフェクト
    await pg.evaluate("DOC.bg.posterize.on = true; DOC.bg.posterize.n = 2; docChanged(false)"); r = await st()
    assert r['cols'] < base['cols'] and r['h'] != base['h'], f'ポスタライズで色数が減らない {base} {r}'
    await pg.evaluate("DOC.bg.posterize.on = false; DOC.bg.thresh.on = true; docChanged(false)"); r = await st()
    assert r['h'] != base['h'], '2値化が効かない'
    for k in ['tilt', 'thresh']: await pg.evaluate(f"DOC.bg.{k}.on = false")
    await pg.evaluate("DOC.bg.tilt.on = true; docChanged(false)"); assert (await st())['h'] != base['h'], 'ミニチュアが効かない'
    await pg.evaluate("DOC.bg.tilt.on = false; DOC.bg.type = 'grad'; docChanged(false)"); g0 = await st()
    for t in ['dot', 'stripe', 'check', 'grid', 'sunburst', 'hline']:
        await pg.evaluate(f"Object.assign(DOC.bg.pat, {{on:true, type:'{t}', a:.5}}); docChanged(false)")
        assert (await st())['h'] != g0['h'], f'柄 {t} が出ない'
    await pg.evaluate("DOC.bg.pat.on = false; DOC.bg.type = 'image'; docChanged(false)")
    for k in ['horror', 'emo', 'game', 'news', 'manga', 'shock', 'mini', 'popart', 'illust', 'sunray', 'win', 'winter', 'rain']:
        await pg.evaluate(f"applyBgFx('{k}')"); assert (await st())['h'] != base['h'], f'ワンクリック {k} が効かない'
    await pg.evaluate("applyBgFx('reset')"); assert (await st())['h'] == base['h'], 'リセットで戻らない'
    # 3) 動的エフェクトの新しい種類：追加でき、描ける
    for k in ['rays', 'speed', 'gaan', 'confetti', 'snow', 'bolt', 'bokeh', 'scatter']:
        await pg.evaluate(f"addFx('{k}')"); await settle(pg, 200)
        assert await pg.evaluate(f"selLayer() && selLayer().kind === '{k}'"), f'{k} を追加できない'
        assert (await st())['h'] != base['h'], f'{k} が描かれない'
        await pg.evaluate("DOC.layers = DOC.layers.filter(l => l.type !== 'fx'); DOC.sel = null; docChanged(false)")
    # 画面：仕上げタブとワンクリックのボタン
    await pg.evaluate("selectLayer(null)"); await settle(pg, 300)
    assert 'bg-fin' in await pg.evaluate("[...document.querySelectorAll('#tabs [data-page]')].map(b => b.dataset.page)"), '仕上げタブがない'
    await page(pg, 'bg-fin'); await settle(pg, 300)
    await pg.evaluate("document.querySelector('[data-finfx=\"cinema\"]').click()"); await settle(pg, 300)
    assert await pg.evaluate("DOC.fin.look") == 'cinema', 'ワンクリック仕上げのボタンが効かない'
    assert await pg.evaluate("[...document.querySelectorAll('[data-d=\"fin.grain\"]')].some(e => e.offsetParent)"), '仕上げの項目が出ない'
    # 古い保存データ
    m = await pg.evaluate("(() => { const d = normalizeDoc({layers:[], bg:{type:'grad'}}); return [d.fin.look, d.bg.pat.on, d.bg.posterize.on, d.bg.tilt.on]; })()")
    assert m == ['none', False, False, False], m
    assert pg.errors == [], pg.errors
    await close(pg)
