"""テストの共通処理：アプリを開く・待つ・画像の場所など"""
import asyncio, glob, os
from pathlib import Path
from fixtures.make_fixtures import ensure

ROOT = Path(__file__).resolve().parents[1]
FIX = ensure()
IMG = {n: str(FIX / n) for n in os.listdir(FIX) if n.endswith('.jpg')}

def app_url(root=ROOT):
    return (Path(root) / 'index.html').as_uri()

# GitHub 配布フォントのテスト用：jsDelivr への通信を、この PC にある TrueType フォントで代用する
SYSTEM_TTF = next(iter(sorted(glob.glob('/usr/share/fonts/**/*.ttf', recursive=True) + glob.glob('/Library/Fonts/*.ttf') + glob.glob('C:/Windows/Fonts/*.ttf'))), None)

OPEN_BROWSERS = []   # 開いたまま残ったブラウザを、run_all が片付けるための一覧

async def open_app(p, mobile=False, root=ROOT, gh_font=None, wait=4500):
    """アプリを開いて操作ガイドを閉じた状態のページを返す。外部への通信はすべて止める（結果を安定させるため）"""
    b = await p.chromium.launch(args=['--no-sandbox']); OPEN_BROWSERS.append(b)
    ctx = await (b.new_context(**p.devices['iPhone 13']) if mobile else b.new_context(viewport={'width': 1440, 'height': 900}))
    pg = await ctx.new_page(); pg.errors = []
    pg.on('pageerror', lambda e: pg.errors.append(str(e)))
    async def route(r):
        u = r.request.url
        if u.startswith('file:'): return await r.continue_()
        if gh_font and 'cdn.jsdelivr.net/gh/' in u:
            return await r.fulfill(path=gh_font, headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'font/ttf'})
        await r.abort()
    await pg.route('**/*', route)
    await pg.goto(app_url(root), wait_until='commit'); await pg.wait_for_timeout(wait)
    await pg.evaluate("document.querySelector('#help').classList.remove('show')")
    pg.browser_ = b
    return pg

async def close(pg):
    errs = pg.errors; await pg.browser_.close()
    if pg.browser_ in OPEN_BROWSERS: OPEN_BROWSERS.remove(pg.browser_)
    assert not errs, f'ページでエラー: {errs}'

async def settle(pg, ms=1800):
    """描画の反映を待つ（フォントを読み込めない環境では描画の前に少し待たされるため）"""
    await pg.wait_for_timeout(ms)

async def canvas_box(pg):
    return await pg.eval_on_selector('#tv', 'e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }')

async def page(pg, name):
    await pg.click(f'#tabs [data-page="{name}"]'); await pg.wait_for_timeout(300)
