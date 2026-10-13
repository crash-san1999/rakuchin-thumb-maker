"""レイヤーの右クリックメニューが画面からはみ出さない：下に入らなければ上に出す、低い画面ではスクロール、レイヤー一覧の「…」ボタンからも。
   スマホのキャンバス長押しでも、PC の右クリックと同じレイヤー（hitMenuLayer）のメニューが画面内に出て、指を離しても項目が勝手に押されない"""
from helpers import *

# メニューを出して表示アニメーションが終わるのを待ち、[上端, 下端, 左端, 右端, 画面の高さ, 画面の幅, 中身の高さ, 表示枠の高さ] を返す
MENU = """(async ([id, x, y, up]) => { showMenu(id, x, y, up === null ? undefined : up); await new Promise(r => setTimeout(r, 400));
  const m = document.querySelector('#ctxmenu'), b = m.getBoundingClientRect();
  return [b.top, b.bottom, b.left, b.right, innerHeight, innerWidth, m.scrollHeight, m.clientHeight]; })"""

def inside(r, label):
    t, btm, l, rt, H, W = r[:6]
    assert t >= 0 and btm <= H and l >= 0 and rt <= W, f'{label}: メニューが画面からはみ出している {r}'

async def run(p):
    # 普通の画面：画面の下端・右端近くで右クリック → 上に出て、全体が見える
    pg = await open_app(p)
    await pg.evaluate("(() => { for(let i = 0; i < 12; i++) addText(); })()" if await pg.evaluate("typeof addText === 'function'") else "0")
    lid = await pg.evaluate("(() => { const L = DOC.layers.find(l => l.type === 'image') || DOC.layers[DOC.layers.length - 1]; return L.id; })()")
    H = await pg.evaluate("innerHeight")
    r = await pg.evaluate(MENU, [lid, 1430, H - 10, None]); inside(r, '右下で右クリック')
    assert r[1] <= H - 10 + 1, f'右クリック位置より下にはみ出している {r}'
    r = await pg.evaluate(MENU, [lid, 200, 200, None]); inside(r, '上の方で右クリック')
    assert abs(r[0] - 200) <= 1, f'入る場所ではクリック位置から下に出るはず {r}'
    # レイヤー一覧の一番下の行の「…」ボタン
    await page(pg, 'lay-base') if await pg.is_visible('#tabs [data-page="lay-base"]') else None
    btns = await pg.query_selector_all('[data-la="menu"]')
    vis = [b for b in btns if await b.is_visible()]
    if vis:
        await vis[-1].click(); await pg.wait_for_timeout(450)
        inside(await pg.evaluate("(() => { const b = document.querySelector('#ctxmenu').getBoundingClientRect(); return [b.top, b.bottom, b.left, b.right, innerHeight, innerWidth]; })()"), '「…」ボタン')
        assert await pg.evaluate("document.querySelector('#ctxmenu').classList.contains('show')")
        await pg.mouse.click(5, 5)
    await close(pg)
    # 低い画面：メニューより画面が低ければ画面内に収めてスクロールでき、一番下の「削除」まで押せる
    pg = await open_app(p, viewport={'width': 1280, 'height': 360})
    lid = await pg.evaluate("DOC.layers[DOC.layers.length - 1].id")
    r = await pg.evaluate(MENU, [lid, 300, 340, None]); inside(r, '低い画面')
    assert r[6] > r[7], f'低い画面ではスクロールになるはず {r}'
    await pg.click('#ctxmenu [data-ma="del"]')   # Playwright がスクロールして押せる＝見切れて押せない項目がない
    assert not await pg.evaluate(f"DOC.layers.some(l => l.id === '{lid}')"), 'スクロールした先の「削除」が押せない'
    await close(pg)
    # スマホ：キャンバスの下の方を長押し → その位置のレイヤー（右クリックと同じ判定）のメニューが、画面内に出る
    pg = await open_app(p, mobile=True)
    await pg.evaluate("document.querySelectorAll('.sheet.show, .help.show').forEach(e => e.classList.remove('show'))")
    pt = await pg.evaluate("""(() => { const r = document.querySelector('#tv').getBoundingClientRect();
      for(let fy = 0.95; fy > 0.05; fy -= 0.05) for(let fx = 0.1; fx < 0.95; fx += 0.1){ const x = r.left + r.width * fx, y = r.top + r.height * fy;
        const L = hitMenuLayer((x - r.left) / r.width * DOC.w, (y - r.top) / r.height * DOC.h); if(L) return [x, y, L.id]; }
      return null; })()""")
    assert pt, '長押しできるレイヤーが見つからない'
    # 本物のタッチ（CDP）で長押しする：合成した PointerEvent では setPointerCapture が失敗するため
    n0 = await pg.evaluate("[DOC.layers.length, JSON.stringify(DOC.layers)]")
    cdp = await pg.context.new_cdp_session(pg)
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': pt[0], 'y': pt[1]}]})
    await pg.wait_for_timeout(1000)
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    await pg.wait_for_timeout(400)
    r = await pg.evaluate("(() => { const m = document.querySelector('#ctxmenu'), b = m.getBoundingClientRect(); return [m.classList.contains('show'), m.dataset.lid, b.top, b.bottom, b.left, b.right, innerHeight, innerWidth]; })()")
    assert r[0] and r[1] == pt[2], f'長押しで、その位置のレイヤーのメニューが出ない（指を離したときに項目が押されて閉じた？） {r} {pt}'
    assert r[2] >= 0 and r[3] <= r[6] and r[4] >= 0 and r[5] <= r[7], f'長押しのメニューが画面からはみ出している {r}'
    assert await pg.evaluate("[DOC.layers.length, JSON.stringify(DOC.layers)]") == n0, '指を離したときに、指の下のメニュー項目が実行された'
    # 指を離したあとは、ふつうに項目を押せる
    await pg.wait_for_timeout(400); await pg.click('#ctxmenu [data-ma="dup"]'); await settle(pg, 300)
    assert await pg.evaluate("DOC.layers.length") == n0[0] + 1, '長押しのあと、メニューの項目を押せない'
    await close(pg)
