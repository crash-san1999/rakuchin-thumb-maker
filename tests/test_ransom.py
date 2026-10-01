"""一文字囲み（脅迫状風）：ランダム配色の色を選べる（色数・おまかせ・順番／ランダム・パターン）、古い保存データ"""
from helpers import *

FILLS = """(o) => { const prev = RS; RS = merged(Object.assign({}, clone(S), {text:'あいうえおかきくけこ', box:Object.assign(clone(S.box), o)}));
  try{ const L = layout(), items = glyphs(L), cells = charCells(items), seen = [];
    const ctx = new Proxy({}, {get:(t, k) => k in t ? t[k] : () => {}, set:(t, k, v) => { if(k === 'fillStyle') seen.push(v); t[k] = v; return true; }});
    drawBoxes(ctx, cells); return seen; } finally { RS = prev; } }"""

async def run(p):
    pg = await open_app(p)
    await pg.evaluate("selectLayer(DOC.layers.find(l => l.type === 'text').id)"); await page(pg, 'txt-deco')
    # 1) 選んだ色だけが使われる（順番）
    pal = ['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000', '#111111', '#222222', '#333333']
    f = await pg.evaluate(FILLS, dict(on=True, rand=True, seq=True, pn=3, pal=pal))
    assert f == ['#ff0000', '#00ff00', '#0000ff'] * 3 + ['#ff0000'], f'順番に使えない {f}'
    # 2) ランダム：選んだ色（色数ぶん）の中だけから選ばれ、パターンを変えると並びが変わる
    a = await pg.evaluate(FILLS, dict(on=True, rand=True, seq=False, pn=3, pal=pal, seed=1)); b = await pg.evaluate(FILLS, dict(on=True, rand=True, seq=False, pn=3, pal=pal, seed=2))
    assert set(a) <= set(pal[:3]) and set(b) <= set(pal[:3]) and len(set(a)) >= 2, f'選んだ色の外が使われる／偏りすぎ {a}'
    assert a != b, 'パターンを変えても並びが変わらない'
    assert a == await pg.evaluate(FILLS, dict(on=True, rand=True, seq=False, pn=3, pal=pal, seed=1)), '同じパターンで結果が変わる'
    # 3) 以前と同じ見た目：色も数も初期のまま（脅迫状の7色・パターン0）
    old = await pg.evaluate(FILLS, dict(on=True, rand=True))
    assert set(old) <= {'#e8132b', '#111111', '#1f5fd6', '#0f9d58', '#7b2cbf', '#ff6a00', '#c2185b'}, f'初期の色が変わった {old}'
    # 4) 壊れた色は脅迫状の色に戻る／色数は 2〜8
    bad = await pg.evaluate(FILLS, dict(on=True, rand=True, pal=['zzz', 5], pn=99)); assert set(bad) <= {'#e8132b', '#111111', '#1f5fd6', '#0f9d58', '#7b2cbf', '#ff6a00', '#c2185b'}
    # 5) 画面：ランダム配色をオンにすると色の欄が出て、「おまかせ」で色が入れ替わり、色を直接変えられる
    vis = "(sel) => [...document.querySelectorAll(sel)].some(e => e.offsetParent !== null)"
    await pg.evaluate("S.box.on = true; S.box.rand = false; syncUI(); schedule(); document.querySelector('section[data-on=\"box.on\"]').classList.remove('collapsed')"); await settle(pg, 300)
    assert await pg.evaluate(vis, 'input[data-k="box.shape"], select[data-k="box.shape"]'), 'セクションが開いていない（テストの前提）'
    assert not await pg.evaluate(vis, '[data-boxpal]'), 'ランダムでないのにパレットが出ている'
    await pg.evaluate("document.querySelector('input[data-k=\"box.rand\"]').click()"); await settle(pg, 400)
    assert await pg.evaluate(vis, '[data-boxpal]') and await pg.evaluate(vis, 'input[data-k="box.pal.0"]') and await pg.evaluate(vis, 'input[data-k="box.pn"]')
    await pg.evaluate("document.querySelector('[data-boxpal=\"pastel\"]').click()"); await settle(pg, 300)
    assert await pg.evaluate("[S.box.pal[0], S.box.pn]") == ['#ffb3c7', 7], 'おまかせで色が入れ替わらない'
    await pg.evaluate("(() => { const el = document.querySelector('input[type=color][data-k=\"box.pal.1\"]'); el.value = '#123456'; el.dispatchEvent(new Event('input', {bubbles:true})); })()"); await settle(pg, 300)
    assert await pg.evaluate("S.box.pal[1]") == '#123456', '色を直接変えられない'
    await pg.evaluate("document.querySelector('input[data-k=\"box.seq\"]').click()"); await settle(pg, 300)
    assert await pg.evaluate("S.box.seq") is True and not await pg.evaluate(vis, '[data-reroll=\"box.seed\"]'), '順番に使うとき、パターンのボタンは隠れるはず'
    # 6) 古い保存データ（色の指定がない）は、初期の色で読める
    ok = await pg.evaluate("(() => { const m = merged({box:{on:true, rand:true}}); return [m.box.pn, m.box.pal.length, m.box.seed, m.box.seq]; })()")
    assert ok == [7, 8, 0, False], f'古い保存データが読めない {ok}'
    await close(pg)
