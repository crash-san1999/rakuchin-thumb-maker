"""細工・破損した保存データ：種類名に 'toString'・'constructor' などが入っていても、読み込み・描画が止まらない"""
# 種類名で表（FX_DEF・METALS・ワープ・切り抜きフレームなど）を引く箇所は、どのオブジェクトにもある 'toString' などの名前で
# 関数を拾ってしまうと例外で描画が止まり、自動保存されて開き直しても直らなくなる。hasKey（core.js）で確認してから引くことを確かめる
from helpers import *

NAMES = ['toString', 'constructor', 'hasOwnProperty', '__proto__', 'valueOf']
CASES = {
    '動的エフェクトの種類': "d.layers.push({id:'Lx', type:'fx', kind:K, p:{}, x:100, y:100, sc:1, rot:0, op:1})",
    '文字の金属': "d.layers.filter(l => l.type === 'text').forEach(l => { l.style.fillType = 'metal'; l.style.metal = K; })",
    '文字のワープ': "d.layers.filter(l => l.type === 'text').forEach(l => { l.style.warp = {type:K, amt:0.3, freq:1}; })",
    '背景シェイプ': "d.layers.filter(l => l.type === 'text').forEach(l => { l.style.plate = {on:true, shape:K}; })",
    '仕上げの色フィルター': "d.fin = {look:K, amt:1}",
    '背景のトーン': "d.bg.tone = K",
    '仕上げの光漏れの位置': "d.fin = {look:'none', amt:1, leak:0.6, leakPos:K}",
    '背景の種類': "d.bg.type = K",
    '分割の配置': "d.layers.push({id:'Lc', type:'collage', layout:K, edge:K, bstyle:K, n:3, x:500, y:500, sc:1, rot:0, op:1})",
}
# 切り抜きフレームは画像が要るので、決まった id の素材を登録して framedCanvas を直接呼ぶ
FRAME = """K => { const L = Object.assign(LAYER_BASE(), IMAGE_BASE(), {id:'Lf', type:'image', asset:'Acmp'});
  L.frame = Object.assign(FRAME_BASE(), {shape:K, style:K}); return framedCanvas(L, 0.5, false, new Map()).c.width > 0; }"""

async def run(p):
    pg = await open_app(p)
    base = await pg.evaluate("JSON.stringify(DOC)")
    for name, mut in CASES.items():
        for k in NAMES:
            r = await pg.evaluate("""([base, K]) => { const d = JSON.parse(base); """ + mut + """;
              let n; try{ n = normalizeDoc(JSON.parse(JSON.stringify(d))); }catch(e){ return '読み込みで例外: ' + e.message; }
              DOC = n; const T = textLayer(); if(T) S = T.style;
              try{ prevCache.clear(); paintPreview(false); updateVis(); }catch(e){ return '描画で例外: ' + e.message; }
              return 'ok'; }""", [base, k])
            assert r == 'ok', f'{name}に {k!r}：{r}'
    src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7TZnAAAAAElFTkSuQmCC'
    await pg.evaluate("src => addAsset(src, 'cmp', 'Acmp', true)", src)
    for k in NAMES:
        ok = await pg.evaluate(FRAME, k)
        assert ok, f'切り抜きフレームの形・デザインに {k!r} で描けない'
    # 背景の種類名がレイヤーパネルにそのまま（関数のソースとして）出ないこと
    await pg.evaluate("([base, K]) => { const d = JSON.parse(base); d.bg.type = K; DOC = normalizeDoc(d); renderLayers(); }", [base, 'toString'])
    await pg.wait_for_timeout(300)
    txt = await pg.evaluate("document.querySelector('#layerList').textContent")
    assert 'native code' not in txt and 'function' not in txt, 'レイヤーパネルに関数のソースが表示された'
    await pg.evaluate(f"DOC = normalizeDoc(JSON.parse({base!r})); prevCache.clear(); paintPreview(false)")
    await pg.wait_for_timeout(300)
    assert not pg.errors, f'ページでエラー: {pg.errors[:3]}'
    await close(pg)
