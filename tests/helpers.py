"""テストの共通処理：アプリを開く・待つ・画像の場所など"""
import asyncio, glob, os, time
from pathlib import Path
from fixtures.make_fixtures import ensure

ROOT = Path(__file__).resolve().parents[1]
FIX = ensure()
IMG = {n: str(FIX / n) for n in os.listdir(FIX) if n.endswith('.jpg')}

def app_url(root=ROOT):
    return (Path(root) / 'index.html').as_uri()

# GitHub 配布フォントのテスト用：jsDelivr への通信を、この PC にある TrueType フォントで代用する
SYSTEM_TTF = next(iter(sorted(glob.glob('/usr/share/fonts/**/*.ttf', recursive=True) + glob.glob('/Library/Fonts/*.ttf') + glob.glob('C:/Windows/Fonts/*.ttf'))), None)

async def wait_until(pg, expr, timeout=15000):
    """式が真になるまで待つ。Playwright の wait_for_function は式を文字列として評価するので、CSP（script-src 'self'）に止められる。
    evaluate で繰り返し確認する形にして、CSP の影響を受けないようにする"""
    end = asyncio.get_event_loop().time() + timeout / 1000
    while True:
        if await pg.evaluate(expr): return
        if asyncio.get_event_loop().time() > end: raise TimeoutError(f'待っても条件を満たさない: {expr}')
        await pg.wait_for_timeout(100)

OPEN_BROWSERS = []   # 開いたまま残ったブラウザを、run_all が片付けるための一覧

async def app_ready(pg):
    """アプリの起動（main.js の boot：保存データの復元・最初の描画・取り消し履歴の起点）が終わるまで待つ。ページを開いた・読み込み直した直後に呼ぶ。
    決まった時間を待つだけだと、並列実行で重いときに起動が間に合わず、DOC が null のままテストが始まることがあった"""
    # wait_for_function は文字列を eval するので、アプリの CSP（unsafe-eval なし）で止められる。evaluate で確かめながら待つ
    for _ in range(900):
        try:
            if await pg.evaluate("typeof DOC === 'object' && DOC !== null && typeof hist !== 'undefined' && hist.length > 0"): return
        except Exception: pass   # 読み込みの途中（ページの切り替わり中）は evaluate が失敗することがある
        await pg.wait_for_timeout(100)
    raise TimeoutError('アプリの起動が 90 秒たっても終わらない')

async def open_app(p, mobile=False, root=ROOT, gh_font=None, wait=4500, viewport=None, touch=False):
    """アプリを開いて、起動が終わってから wait ミリ秒待ち、操作ガイドを閉じた状態のページを返す。外部への通信はすべて止める（結果を安定させるため）"""
    b = await p.chromium.launch(args=['--no-sandbox']); OPEN_BROWSERS.append(b)
    ctx = await (b.new_context(**p.devices['iPhone 13']) if mobile else b.new_context(viewport=viewport or {'width': 1440, 'height': 900}, **({'is_mobile': True, 'has_touch': True} if touch else {})))
    pg = await ctx.new_page(); pg.errors = []
    pg.on('pageerror', lambda e: pg.errors.append(str(e)))
    async def route(r):
        u = r.request.url
        if u.startswith('file:'): return await r.continue_()
        if gh_font and 'cdn.jsdelivr.net/gh/' in u:
            return await r.fulfill(path=gh_font, headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'font/ttf'})
        await r.abort()
    await pg.route('**/*', route)
    t0 = time.monotonic(); await pg.goto(app_url(root), wait_until='commit')
    # 起動が終わってから、開いたときから数えて wait ミリ秒になるまで待つ（起動が速ければ、これまでと同じ待ち時間）。
    # 起動が遅かったときも、起動のあとのフォント・画像の読み込みのために最低 1.5 秒は待つ
    await app_ready(pg)
    await pg.wait_for_timeout(max(1500, wait - (time.monotonic() - t0) * 1000))
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

async def hist_settled(pg, timeout=8000, strict=True):
    """取り消しの履歴が、今の DOC まで積み終わるのを待つ（history.js は 450ms まとめてから積む）。
    決まった時間だけ待つと、並列実行などで重いときに積み終わる前に次の操作・取り消しをしてしまうので、実際に積まれたことを確かめる。
    strict=False は、履歴に積まない変更（テストが DOC を直接書き換えたなど）のあとでも止まらないよう、時間内に揃わなければそのまま進む"""
    try: await wait_until(pg, "!restoring && hist[hIdx] === JSON.stringify(DOC)", timeout)
    except TimeoutError:
        if strict: raise

async def undo_settled(pg, timeout=8000):
    """取り消し・やり直しの復元（描き直しまで）が終わるのを待つ"""
    await pg.wait_for_timeout(50); await wait_until(pg, "!restoring", timeout)

async def canvas_box(pg):
    return await pg.eval_on_selector('#tv', 'e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }')

async def page(pg, name):
    await pg.click(f'#tabs [data-page="{name}"]'); await pg.wait_for_timeout(300)
