"""文字スタイルのプリセット：名前の重複なし、すべてがどれかのカテゴリに入る、全部エラーなく描ける、カテゴリのタブで絞り込める"""
from helpers import *

async def run(p):
    pg = await open_app(p)
    names = await pg.evaluate("PRESETS.map(p => p[0])")
    assert len(names) >= 70 and len(set(names)) == len(names), f'プリセットの数／重複 {len(names)}'
    miss = await pg.evaluate("PRESETS.map(p => p[0]).filter(n => !Object.values(PCATS).flat().includes(n))"); assert not miss, f'カテゴリに入っていない {miss}'
    ghost = await pg.evaluate("Object.values(PCATS).flat().filter(n => !PRESETS.some(p => p[0] === n))"); assert not ghost, f'存在しない名前 {ghost}'
    bad = await pg.evaluate("""() => { const bad = []; for(const [n, p] of PRESETS){ try{ const c = render(0.25, merged(Object.assign({}, p, {text:'テスト'})));
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let k = 0; for(let i = 3; i < d.length; i += 16) if(d[i] > 30) k++; if(k < 50) bad.push(n + ':empty'); }catch(e){ bad.push(n + ':' + e.message); } } return bad; }""")
    assert not bad, f'描けないプリセット {bad}'
    for cat in ['ニュース・バラエティ', 'ゲーム', 'おしゃれ・大人', '季節・イベント']:
        assert cat in await pg.evaluate("Object.keys(PCATS)"), f'{cat} がない'
    assert pg.errors == [], pg.errors
    await close(pg)
