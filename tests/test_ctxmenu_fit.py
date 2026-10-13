"""レイヤーの右クリックメニューが画面からはみ出さない：下に入らなければ上に出す、低い画面ではスクロール、レイヤー一覧の「…」ボタンからも"""
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
