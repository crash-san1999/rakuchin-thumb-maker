"""セキュリティ：細工されたプロジェクトファイル・素材バックアップで、HTMLやスクリプトを差し込まれない／外部URLの画像を読み込まない／CSP が効いている"""
from helpers import *
import json

EVIL = '"><img src=x onerror="window.__pwn=1">'

async def run(p):
    pg = await open_app(p)
    # 1) CSP：HTMLに差し込まれたインラインのスクリプトは動かない（保険）
    await pg.evaluate("window.__pwn = 0; const d = document.createElement('div'); d.innerHTML = '<img src=x onerror=\"window.__pwn=1\">'; document.body.appendChild(d)"); await settle(pg, 600)
    assert await pg.evaluate("window.__pwn") == 0, 'CSP が効いておらず、インラインのスクリプトが動いた'
    await pg.evaluate("document.querySelectorAll('[onerror]').forEach(e => e.parentElement.remove())")   # 手順1でテストが作った要素は片付ける
    assert await pg.evaluate("document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]') !== null")
    # 1b) CSP で外部から読めるスクリプトは、アクセス計測（Cloudflare Web Analytics）の配信元だけ。外部スクリプトの読み込みもその1本だけ
    csp = await pg.evaluate("document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]').content")
    ss = next(d.split()[1:] for d in csp.split(';') if d.split() and d.split()[0] == 'script-src')
    assert ss == ["'self'", 'https://static.cloudflareinsights.com'], f'script-src に想定外の許可がある {ss}'
    ext = await pg.evaluate("[...document.scripts].filter(s => s.src && !s.src.startsWith(location.origin) && !s.src.startsWith('file:')).map(s => ({src: s.src, defer: s.defer, cfg: s.dataset.cfBeacon}))")
    assert len(ext) == 1 and ext[0]['src'] == 'https://static.cloudflareinsights.com/beacon.min.js' and ext[0]['defer'], f'外部スクリプトが想定と違う {ext}'
    assert json.loads(ext[0]['cfg']).get('token'), f'計測タグのトークンが読めない {ext}'
    # 2) 細工したプロジェクト：レイヤーの id・gid・色・マスの文字や色に、属性を壊す文字列を入れる
    doc = await pg.evaluate("JSON.parse(JSON.stringify(DOC))")
    doc['layers'] = [
        {'id': EVIL, 'type': 'fx', 'kind': 'confetti', 'p': {'c': EVIL}},
        {'id': 'ok1', 'type': 'collage', 'n': 2, 'gid': EVIL, 'asset': EVIL,
         'ttx': {'sc': EVIL, 'ox': 1e9, '__proto__': {'polluted': 1}}, 'wk': {'memo': EVIL, 'start': EVIL},
         'cells': [{'asset': EVIL, 'w': EVIL, 'bg': {'on': True, 'c': EVIL, 'c2': EVIL, 'grad': True},
                    'tx': {'on': True, 'text': '<img src=x onerror="window.__pwn=1">', 'fcOn': True, 'fc': EVIL, 'ecOn': True, 'ec': EVIL}}, {'w': -5}]},
    ]
    doc['bg']['asset'] = EVIL
    await pg.evaluate("d => { loadDocObj(d); }", doc); await settle(pg, 1500)
    await pg.evaluate("renderLayers(); selectLayer(DOC.layers[DOC.layers.length - 1].id); syncDoc()"); await settle(pg, 800)
    assert await pg.evaluate("window.__pwn") == 0, '細工したプロジェクトでスクリプトが動いた'
    r = await pg.evaluate("""({ids: DOC.layers.map(l => l.id), bad: [...document.querySelectorAll('img[onerror], [onerror]')].length,
      okIds: DOC.layers.every(l => okId(l.id)), asset: [DOC.bg.asset, DOC.layers[1].asset, DOC.layers[1].cells[0].asset], gid: DOC.layers[1].gid})""")
    assert r['bad'] == 0, f'画面に onerror 付きの要素が出来た {r}'
    assert r['okIds'] and r['asset'] == [None, None, None] and r['gid'] is None, f'id・画像参照が安全な形にそろっていない {r}'
    # 分割フレームのマスの文字色・フチ色・幅・まとめての調整・MEMO の位置：不正な値は既定値・範囲内にそろい、ほかのオブジェクトを汚さない
    r = await pg.evaluate("""(() => { const L = DOC.layers[1], c = L.cells[0]; return [c.tx.fc, c.tx.ec, c.w, L.cells[1].w, L.ttx.sc, L.ttx.ox, L.wk.memo, ({}).polluted === undefined, Object.prototype.polluted === undefined]; })()""")
    assert r == ['#ffffff', '#1f1b2d', 1, 0.05, 1, 1, 8, True, True], f'分割フレームの新しい項目が安全な値にそろっていない {r}'
    await page(pg, 'lay-ctext'); await settle(pg, 400)
    assert await pg.evaluate("window.__pwn") == 0 and await pg.evaluate("document.querySelectorAll('[onerror]').length") == 0
    # 3) 色の検査
    r = await pg.evaluate("[safeColor('#ff00aa'), safeColor('rgba(1,2,3,.5)'), safeColor('red\"><x>', '#111'), safeColor(null, '#222'), okId('A1b-_'), okId('a b'), okId('__proto__'), okId('')]")
    assert r == ['#ff00aa', 'rgba(1,2,3,.5)', '#111', '#222', True, False, False, False], r
    # 4) プロジェクトを開く：外部URLの画像・不正な id は取り込まない
    net = []
    pg.on('request', lambda q: net.append(q.url) if q.url.startswith('http') else None)
    proj = {'doc': json.loads(json.dumps(doc)), 'assets': {'good': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'ext': 'https://evil.example/track.png', EVIL: 'data:image/png;base64,AAAA', '__proto__': 'data:image/png;base64,AAAA'}}
    open('/tmp/_proj.json', 'w').write(json.dumps(proj))
    await pg.evaluate("window.__f = null")
    await pg.set_input_files('#projfile', '/tmp/_proj.json'); await settle(pg, 2000)
    keys = await pg.evaluate("Object.keys(ASSETS)")
    assert 'good' in keys and 'ext' not in keys and EVIL not in keys and '__proto__' not in keys, f'画像の取り込み条件が違う {keys}'
    assert not [u for u in net if 'evil.example' in u], f'外部URLに接続した {net}'
    assert await pg.evaluate("Object.getPrototypeOf(ASSETS) === Object.prototype"), 'ASSETS の中身が書き換わった'
    # 5) 素材置き場のバックアップ：不正な id は読み込まない／正しい id は読み込める
    png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    lib = {'type': 'library', 'items': [{'id': EVIL, 'kind': 'img', 'name': 'x', 'src': png}, {'id': 'goodlib1', 'kind': 'img', 'name': 'ok', 'src': png}]}
    open('/tmp/_lib.json', 'w').write(json.dumps(lib))
    await pg.evaluate("window.__pwn = 0")
    await pg.set_input_files('#projfile', '/tmp/_lib.json'); await settle(pg, 2500)
    ids = await pg.evaluate("LIB.map(i => i.id)")
    assert 'goodlib1' in ids and EVIL not in ids, f'素材バックアップの id 検査が違う {ids}'
    assert await pg.evaluate("window.__pwn") == 0 and await pg.evaluate("document.querySelectorAll('[onerror]').length") == 0
    await close(pg)
    return 'CSP、細工したプロジェクトの id・色・文字、画像の取り込み条件、素材バックアップの id'
