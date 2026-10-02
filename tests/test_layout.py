"""見切れ防止：いろいろな画面サイズで、ページが横にはみ出さず、ヘッダーの右端（保存ボタン）まで画面に収まる。
   マス一覧の小さいボタンの日付は「10/7(」のように括弧で切れない"""
from helpers import *

SIZES = [(1920, 1080, False), (1600, 900, False), (1536, 864, False), (1440, 900, False), (1280, 720, False), (1024, 768, False), (860, 700, False),
         (768, 1024, True), (430, 932, True), (390, 844, True), (360, 640, True)]

async def run(p):
    for w, h, touch in SIZES:
        pg = await open_app(p, viewport={'width': w, 'height': h}, touch=touch, wait=2000)
        r = await pg.evaluate("""(() => {
            const vw = innerWidth, q = s => { const e = document.querySelector(s); if(!e || !e.offsetParent && getComputedStyle(e).position !== 'fixed') return null; return e.getBoundingClientRect(); };
            const dl = q('#dlBtn'), bad = [];
            for(const s of ['#dlBtn', '#undo', '#redo', '#viewBtn']){ const r = q(s); if(r && (r.right > vw + 1 || r.left < -1)) bad.push(s + ' ' + Math.round(r.left) + '-' + Math.round(r.right)); }
            return {vw, sw: document.documentElement.scrollWidth, bad, dl: !!dl};
        })()""")
        tag = f'{w}x{h}'
        assert r['dl'], f'{tag} 保存ボタンが見えない'
        assert not r['bad'], f'{tag} ヘッダーのボタンが画面の外 {r["bad"]}'
        assert r['sw'] <= r['vw'] + 1, f'{tag} ページが横にはみ出す {r["sw"]} > {r["vw"]}'
        await close(pg)
    # マス一覧の日付ラベル
    pg = await open_app(p, wait=2000)
    lab = await pg.evaluate("['10/7(月)', '10/7 (月)', '10/7\\n月', 'MEMO', 'とても長い文字列です', '(月)'].map(cellBtnLabel)")
    assert lab[0] == '10/7' and lab[1] == '10/7' and lab[2] == '10/7' and lab[3] == 'MEMO' and lab[4] == 'とても長い…', lab
    assert lab[5], lab
    await close(pg)
    return '12の画面サイズでヘッダー・横スクロール／マス一覧の日付ラベル'
