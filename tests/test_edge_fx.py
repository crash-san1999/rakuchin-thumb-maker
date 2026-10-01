"""画像の縁・影：影の色／大きさ／横位置、フチの二重・グラデ・ぼかし、光彩、古い保存データ"""
from helpers import *

MAKE = """async () => {
  const c = mk(200, 200), x = c.getContext('2d'); x.fillStyle = '#d01818'; x.beginPath(); x.arc(100, 100, 100, 0, 7); x.fill();
  const id = await addAsset(c.toDataURL(), 'テスト'), L = newImageLayer(id, 'テスト');
  Object.assign(L, {x:960, y:540, sc:1}); L.outline.on = false; L.shadow.on = false; DOC.bg.hidden = true; DOC.layers.forEach(l => { if(l !== L) l.hidden = true; });
  DOC.layers.push(L); selectLayer(L.id); docChanged(false); return L.id; }"""
# 円の中心から (dx, dy)（1920x1080 座標）の色
PX = """async ([dx, dy, patch]) => { const L = DOC.layers[DOC.layers.length - 1], sel = DOC.sel; for(const k in patch) Object.assign(L[k], patch[k]); prevCache.clear(); DOC.sel = null; paintPreview(false);
  const c = document.querySelector('#tv'), k = c.width / 1920, d = c.getContext('2d').getImageData(Math.round((960 + dx) * k), Math.round((540 + dy) * k), 1, 1).data; DOC.sel = sel; return [d[0], d[1], d[2], d[3]]; }"""
RESET = "(() => { const L = DOC.layers[DOC.layers.length - 1]; Object.assign(L, {outline:IMAGE_BASE().outline, shadow:IMAGE_BASE().shadow, glow:IMAGE_BASE().glow}); })()"

async def run(p):
    pg = await open_app(p)
    await pg.evaluate(MAKE); await settle(pg, 1200)
    px = lambda dx, dy, patch={}: pg.evaluate(PX, [dx, dy, patch])
    r = lambda: pg.evaluate(RESET)
    # 影：色・横位置・大きさ
    a = await px(150, 0); assert a[3] == 0, f'何もしていないのに色がある {a}'
    a = await px(150, 0, dict(shadow=dict(on=True, c='#0000ff', blur=0, y=0, x=100, a=1, sp=0)))
    assert a[2] > 200 and a[0] < 60 and a[3] > 200, f'影の色／横位置が効かない {a}'
    await r(); a = await px(125, 0, dict(shadow=dict(on=True, c='#00ff00', blur=0, y=0, x=0, a=1, sp=0)))
    assert a[3] == 0, f'大きさ0なのに影がはみ出す {a}'
    a = await px(125, 0, dict(shadow=dict(on=True, sp=40))); assert a[1] > 200 and a[3] > 200, f'影の大きさが効かない {a}'
    # 光彩
    await r(); a = await px(110, 0, dict(glow=dict(on=True, c='#00ff00', blur=30, a=1, str=3)))
    assert a[1] > a[0] and a[3] > 60, f'光彩が出ない {a}'
    # フチ：二重・グラデ・ぼかし
    await r(); a = await px(110, 0, dict(outline=dict(on=True, w=20, c='#ffffff')))
    assert a[:3] == [255, 255, 255], f'フチが出ない {a}'
    a = await px(130, 0, dict(outline=dict(style='double', c2='#0000ff', w2=20))); b = await px(110, 0)
    assert a[2] > 200 and a[0] < 60 and b[:3] == [255, 255, 255], f'二重フチ {a} {b}'
    t = await px(0, -110, dict(outline=dict(style='grad', c='#ff0000', c2='#0000ff'))); u = await px(0, 110)
    assert t[0] > u[0] + 100 and u[2] > t[2] + 100, f'グラデのフチ {t} {u}'
    await r(); a = await px(125, 0, dict(outline=dict(on=True, w=20, c='#ffffff')))
    assert a[3] == 0, f'フチの外が透明でない {a}'
    a = await px(115, 0, dict(outline=dict(blur=20))); assert 0 < a[3] < 255, f'フチのぼかしが効かない {a}'
    # 枠付きの画像にも影・光彩が効く
    await r(); a = await px(150, 0, dict(frame=dict(shape='circle'), shadow=dict(on=True, c='#0000ff', blur=0, y=0, x=100, a=1, sp=0)))
    assert a[2] > 200 and a[3] > 200, f'枠付きで影が出ない {a}'
    # 画面：項目が出る
    await pg.evaluate("selLayer().frame.shape = 'none'; selLayer().outline.on = true; selLayer().shadow.on = true; selLayer().glow.on = true; docChanged(false); const id = DOC.sel; selectLayer(null); selectLayer(id); openInspector('lay-edge')"); await settle(pg, 600)
    vis = "(k) => [...document.querySelectorAll(`[data-d=\"${k}\"], [data-dseg=\"${k}\"]`)].some(e => e.offsetParent !== null)"
    for k in ['@outline.style', '@outline.blur', '@glow.c', '@glow.blur', '@shadow.c', '@shadow.sp', '@shadow.x']:
        assert await pg.evaluate(vis, k), f'{k} の項目が出ない'
    # 古い保存データ
    m = await pg.evaluate("(() => { const L = normalizeDoc({layers:[{type:'image', id:'z', asset:'x', outline:{on:true, w:5, c:'#fff'}, shadow:{on:true, blur:9, y:3, a:.5}}]}).layers[0]; return [L.glow.on, L.shadow.c, L.shadow.x, L.shadow.sp, L.outline.style, L.outline.blur]; })()")
    assert m == [False, '#000000', 0, 0, 'solid', 0], f'古い保存データ {m}'
    # 文字のフチ：光彩・ぼかし
    T = """async (o) => { await ensureFont(S); const c = render(0.5, merged(Object.assign({}, clone(S), {text:'あ', size:160, skew:0, shadow:{on:false}, glow:{on:false}}, o)));
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0, soft = 0; for(let i = 3; i < d.length; i += 4){ if(d[i] > 8) n++; if(d[i] > 8 && d[i] < 200) soft++; } return [n, soft]; }"""
    base = await pg.evaluate(T, {}); gl = await pg.evaluate(T, dict(sglow=dict(on=True, c='#00ff00', blur=30, a=1, str=2))); bl = await pg.evaluate(T, dict(sblur=10))
    assert gl[0] > base[0] * 1.15, f'フチの光彩が出ない {base} {gl}'
    assert bl[1] > base[1] * 1.5, f'フチのぼかしが効かない {base} {bl}'
    old = await pg.evaluate("(() => { const m = merged({}); return [m.sblur, m.sglow.on, m.sglow.str]; })()"); assert old == [0, False, 1], old
    await pg.evaluate("selectLayer(null); selectLayer(DOC.layers.find(l => l.type === 'text').id)"); await page(pg, 'txt-deco'); await settle(pg, 500)
    assert await pg.evaluate("[...document.querySelectorAll('[data-k=\"sblur\"], [data-k=\"sglow.on\"]')].some(e => e.offsetParent !== null || e.closest('section'))"), 'フチの項目がない'
    await close(pg)
