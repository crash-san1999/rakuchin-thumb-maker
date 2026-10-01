"""アプリとして使う（PWA）：manifest とアイコン、本体の保存とオフライン起動、新しいバージョンが出たらお知らせ→更新で切り替わる（http で配信して確認）"""
import functools, http.server, json, re, shutil, tempfile, threading
from helpers import *

IGN = shutil.ignore_patterns('.git', 'tests', 'docs', '__pycache__', 'fonts')

async def run(p):
    tmp = Path(tempfile.mkdtemp()); app = tmp / 'app'
    shutil.copytree(ROOT, app, ignore=IGN); (app / 'fonts').mkdir()
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(app)); h.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), h); threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{srv.server_address[1]}/'
    b = await p.chromium.launch(args=['--no-sandbox'])
    try:
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900})
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        async def route(r):
            await (r.continue_() if r.request.url.startswith('http://127.0.0.1') else r.abort())
        await pg.route('**/*', route)
        await pg.goto(base + 'index.html'); await pg.wait_for_timeout(3000)
        await pg.evaluate("document.querySelector('#help').classList.remove('show')")
        await pg.evaluate("navigator.serviceWorker.ready.then(() => 1)"); await pg.wait_for_timeout(1500)
        # manifest とアイコン
        mf = await pg.evaluate("fetch(document.querySelector('link[rel=manifest]').href).then(r => r.json())")
        assert mf['display'] == 'standalone' and mf['start_url'] and any(i['sizes'] == '512x512' for i in mf['icons']), mf
        for i in mf['icons']:
            ok = await pg.evaluate(f"fetch('{base}{i['src']}').then(r => r.ok && r.headers.get('content-type').includes('png'))"); assert ok, f'アイコンが読めない {i}'
        assert await pg.evaluate("!!document.querySelector('link[rel=apple-touch-icon]')")
        # 本体が保存される
        ver = await pg.evaluate("fetch('sw.js').then(r => r.text()).then(t => t.match(/APP_VER = '([^']+)'/)[1])")
        assert ver != 'dev', 'APP_VER が書き換わっていない（bump-version.sh）'
        keys = await pg.evaluate(f"caches.open('ttm-app-{ver}').then(c => c.keys()).then(k => k.map(r => new URL(r.url).pathname))")
        assert '/index.html' in keys and any(k.endswith('events.js') for k in keys) and any(k.endswith('app.css') for k in keys), f'本体が保存されていない {keys}'
        # オフラインでも起動できる
        await ctx.set_offline(True)
        await pg.goto(base + 'index.html'); await pg.wait_for_timeout(3000)
        assert await pg.evaluate("typeof DOC === 'object' && DOC.layers.length > 0"), 'オフラインで起動できない'
        await ctx.set_offline(False)
        # 新しいバージョン：sw.js が変わる → お知らせ → 更新
        await pg.goto(base + 'index.html'); await pg.wait_for_timeout(2500)
        assert not await pg.evaluate("document.querySelector('#updBar').classList.contains('show')"), '更新がないのにお知らせが出ている'
        sw = (app / 'sw.js'); sw.write_text(sw.read_text().replace(f"'{ver}'", "'v-next'"))
        await pg.evaluate("pwaReg.update()"); await pg.wait_for_function("document.querySelector('#updBar').classList.contains('show')", timeout=15000)
        assert await pg.evaluate("document.querySelector('#updBar').textContent.includes('新しいバージョン')")
        # まだ切り替わっていない（作業中に勝手に入れ替わらない）
        assert f'ttm-app-{ver}' in await pg.evaluate("caches.keys()")
        await pg.click('#updNow'); await pg.wait_for_timeout(3500)
        keys2 = await pg.evaluate("caches.keys()")
        assert 'ttm-app-v-next' in keys2 and f'ttm-app-{ver}' not in keys2, f'更新後にキャッシュが入れ替わっていない {keys2}'
        assert not errs, errs
    finally:
        await b.close(); srv.shutdown(); shutil.rmtree(tmp, ignore_errors=True)
