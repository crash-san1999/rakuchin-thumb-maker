"""フォントの先読み・端末への保存：★を付けると先に読み込む／お気に入りは起動後に自動で読み込む／Service Worker がフォントを保存する（http で配信して確認）"""
import functools, http.server, threading
from helpers import *

async def run(p):
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    h.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), h); threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{srv.server_address[1]}/index.html'
    b = await p.chromium.launch(args=['--no-sandbox'])
    try:
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900})
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        async def route(r):
            u = r.request.url
            await (r.continue_() if u.startswith('http://127.0.0.1') else r.abort())
        await pg.route('**/*', route)
        await pg.goto(url); await pg.wait_for_timeout(3000)
        await pg.evaluate("document.querySelector('#help').classList.remove('show')")
        await wait_until(pg, "!!navigator.serviceWorker.controller")
        await pg.evaluate("navigator.serviceWorker.ready.then(() => 1)")
        # ★を付けると、選ばなくても先に読み込まれる（1MB以下の同梱フォント）
        await pg.evaluate("selectLayer(DOC.layers.find(l => l.type === 'text').id)"); await page(pg, 'txt-font')
        await pg.select_option('#fcat', 'web'); await pg.wait_for_timeout(400)
        await pg.click('#flist .fi[data-family="ラノベPOPv2"] .fav'); await settle(pg, 2500)
        assert await pg.evaluate("[...document.fonts].some(x => x.family.replace(/\"/g, '') === 'ラノベPOPv2' && x.status === 'loaded')"), '★を付けても先読みされない'
        assert await pg.evaluate("S.font") != 'ラノベPOPv2', '★でフォントが選ばれてしまった'
        # 保存：Service Worker が有効なら、フォントが Cache Storage に入る
        await pg.reload(); await pg.wait_for_timeout(2500)
        n = await pg.evaluate("caches.open('ttm-fonts-v1').then(c => c.keys()).then(k => k.map(r => r.url))")
        assert any('lanobe-pop' in u for u in n), f'フォントが端末に保存されていない {n}'
        # お気に入りは、次の起動後に自動で読み込まれる
        await pg.wait_for_timeout(5000)
        assert await pg.evaluate("[...document.fonts].some(x => x.family.replace(/\"/g, '') === 'ラノベPOPv2' && x.status === 'loaded')"), 'お気に入りが起動後に読み込まれない'
        assert not errs, errs
    finally:
        await b.close(); srv.shutdown()
