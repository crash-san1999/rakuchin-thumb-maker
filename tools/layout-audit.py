"""画面の見切れ・はみ出しの点検：python3 tools/layout-audit.py [--quick]
   いろいろな画面サイズ（広い画面〜スマホ）で、設定パネルの全タブ・ポップアップ・各種レイヤーを順に開き、
   ① 文字が枠からはみ出して切れている ② 画面の外にはみ出している ③ ページが横にスクロールしてしまう
   を自動で探して一覧にする（見つかった箇所は、要素の名前・文字・幅をそのまま表示）。--quick は画面サイズを減らして短時間で。
   意図して「…」にしている所（レイヤー名など）は INTENDED で除外している。"""
import asyncio, sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tests'))
from helpers import IMG, open_app, settle, page
from playwright.async_api import async_playwright

# (名前, 幅, 高さ, タッチ端末か)。タッチ端末は、幅 820 未満でスマホ表示になる
VIEWS = [('広い 1920x1080', 1920, 1080, False), ('標準 1440x900', 1440, 900, False), ('ノート 1280x720', 1280, 720, False), ('小さめ 1024x768', 1024, 768, False),
         ('狭い 860x700', 860, 700, False), ('とても狭い 700x800（PCのブラウザ）', 700, 800, False), ('タブレット縦 768x1024', 768, 1024, True),
         ('スマホ 390x844', 390, 844, True), ('小さいスマホ 360x640', 360, 640, True), ('最小 320x568', 320, 568, True)]
QUICK = ['標準 1440x900', 'ノート 1280x720', '狭い 860x700', 'スマホ 390x844', '小さいスマホ 360x640']
# 意図して「…」で省略している要素（セレクタ）
INTENDED = ['.ly-name .nm', '.ly-name small', '.fi .fn', '#curFont', '.libcard b', '.libst button', '.cellbtn span', '.ttl']

DETECT = """(intended) => {
  const out = [], vw = innerWidth, vh = innerHeight;
  const desc = e => { let s = e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''); const t = (e.innerText || e.value || e.title || '').trim().replace(/\\s+/g, ' ').slice(0, 24); return s + (t ? ` 「${t}」` : ''); };
  const visible = e => { const r = e.getBoundingClientRect(); if(r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; };
  const inScroller = e => { for(let p = e.parentElement; p && p !== document.body; p = p.parentElement){ const cs = getComputedStyle(p); if(/(auto|scroll)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
  const skip = e => e.closest('canvas, svg, #tv, #stage canvas, .ddov, [hidden]') && e.tagName !== 'svg';
  if(document.documentElement.scrollWidth > vw + 1) out.push({k: 'page-hscroll', d: `ページ全体が横にスクロール（中身 ${document.documentElement.scrollWidth}px / 画面 ${vw}px）`});
  for(const e of document.body.querySelectorAll('*')){
    if(skip(e) || !visible(e)) continue;
    const cs = getComputedStyle(e), r = e.getBoundingClientRect(), hasText = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    // ① 文字が枠で切れている
    if(hasText && e.scrollWidth > e.clientWidth + 2 && /(hidden|clip)/.test(cs.overflowX) && !intended.some(s => e.matches(s))) out.push({k: 'clip-x', d: `${desc(e)}  文字 ${e.scrollWidth}px > 枠 ${e.clientWidth}px`});
    if(hasText && e.scrollHeight > e.clientHeight + 3 && /(hidden|clip)/.test(cs.overflowY) && e.clientHeight > 0 && !intended.some(s => e.matches(s))) out.push({k: 'clip-y', d: `${desc(e)}  高さ ${e.scrollHeight}px > 枠 ${e.clientHeight}px`});
    // ② 画面の外にはみ出している（スクロールできる入れ物の中は除く）
    if(!inScroller(e) && (r.right > vw + 2 || r.left < -2) && r.width < vw * 1.5 && !e.closest('.pop:not(.show), .help:not(.show), .toast:not(.show), #ddov')) out.push({k: 'offscreen-x', d: `${desc(e)}  左${Math.round(r.left)} 右${Math.round(r.right)} / 画面 ${vw}px`});
    if(cs.position === 'fixed' && r.bottom > vh + 2 && !e.closest('.toast, .ddov') && !(e.matches('aside#side, .lpanel') && !e.classList.contains('sheet-on'))) out.push({k: 'offscreen-y', d: `${desc(e)}  下 ${Math.round(r.bottom)} / 画面 ${vh}px`});
    // ③ 子が親の幅を超えて突き出している（親が overflow: visible のとき）
    if(e.parentElement && e.parentElement !== document.body && !inScroller(e)){
      const pr = e.parentElement.getBoundingClientRect(), pcs = getComputedStyle(e.parentElement);
      if(pcs.overflowX === 'visible' && r.right > pr.right + 3 && pr.width > 20 && cs.position !== 'absolute' && cs.position !== 'fixed' && hasText) out.push({k: 'overflow-parent', d: `${desc(e)}  右が親より ${Math.round(r.right - pr.right)}px 突き出し（親 ${desc(e.parentElement)}）`});
    }
  }
  return out;
}"""

async def scan(pg, view, label, found):
    for f in await pg.evaluate(DETECT, INTENDED):
        key = (f['k'], f['d'])
        if key not in found: found[key] = []
        if (view, label) not in found[key]: found[key].append((view, label))

async def tabs(pg, view, ctx, found, mobile):
    names = await pg.evaluate("[...document.querySelectorAll('#tabs [data-page]')].map(b => b.dataset.page)")
    for n in names:
        try:
            if mobile: await pg.evaluate("document.querySelector('#mbar [data-sheet=ins]').click()"); await pg.wait_for_timeout(250)
            await pg.evaluate(f"document.querySelector('#tabs [data-page=\"{n}\"]').click()"); await pg.wait_for_timeout(250)
        except Exception: continue
        await scan(pg, view, f'{ctx} / タブ {n}', found)

async def popups(pg, view, found, mobile):
    # ポップアップ・画面：開いて点検して閉じる
    js = {'追加メニュー': "document.querySelector('#addBtn') && document.querySelector('#addBtn').click()", 'ファイルメニュー': "document.querySelector('#fileBtn').click()",
          'キャンバスのサイズ': "(document.querySelector('#canvasBtn') || document.querySelector('#fileBtn')).click(); document.querySelector('#openCanvasMenu') && document.querySelector('#openCanvasMenu').click()",
          '操作ガイド': "openHelp()", '更新履歴': "closeHelp(); openLog()", '新規作成': "document.querySelector('#newModal').classList.add('show')",
          '素材置き場': "document.querySelector('#libBtn').click()"}
    for name, code in js.items():
        try:
            await pg.evaluate(code); await pg.wait_for_timeout(500); await scan(pg, view, f'画面 {name}', found)
        except Exception: pass
        await pg.evaluate("document.querySelectorAll('.pop.show, .help.show').forEach(e => e.classList.remove('show')); document.querySelector('#newModal').classList.remove('show'); try{ closeLib && closeLib(); }catch(e){}")
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150)

async def run_view(p, view, w, h, touch, found):
    pg = await open_app(p, viewport={'width': w, 'height': h}, touch=touch, wait=3000)
    mobile = await pg.evaluate("isMobile")
    await pg.set_input_files('#bgimgfile', [IMG['city.jpg']]); await pg.wait_for_timeout(1200)
    await pg.evaluate("selectLayer(null)"); await pg.wait_for_timeout(300)
    await scan(pg, view, '起動直後', found)
    await tabs(pg, view, '背景', found, mobile)
    # 文字レイヤー（長い文字・英数字）
    await pg.evaluate("(() => { const T = DOC.layers.find(l => l.type === 'text'); T.style.text = '楽々サムネメーカー ABC'; selectLayer(T.id); syncDoc(); })()"); await pg.wait_for_timeout(500)
    await scan(pg, view, '文字', found); await tabs(pg, view, '文字', found, mobile)
    # 画像
    await pg.set_input_files('#imgfile', [IMG['chara.jpg']]); await pg.wait_for_timeout(1500)
    await scan(pg, view, '画像', found); await tabs(pg, view, '画像', found, mobile)
    # 分割フレーム（7分割・週の予定表・文字入り）
    await pg.evaluate("addCollage()"); await pg.wait_for_timeout(500)
    await pg.evaluate("(() => { const L = selLayer(); Object.assign(L, {n:'7', layout:'wk43'}); L.wk.start = '2026-10-07'; collageFillWeek(L); L.ac = 2; syncDoc(); docChanged(false); })()"); await pg.wait_for_timeout(1500)
    await scan(pg, view, '分割フレーム', found); await tabs(pg, view, '分割フレーム', found, mobile)
    # 動的エフェクト・グループ
    await pg.evaluate("addFx('confetti')"); await pg.wait_for_timeout(500)
    await scan(pg, view, '動的エフェクト', found); await tabs(pg, view, '動的エフェクト', found, mobile)
    await pg.evaluate("(() => { const ids = DOC.layers.filter(l => l.type === 'text' || l.type === 'image').map(l => l.id); DOC.msel = ids; try{ groupLayers(ids); }catch(e){} syncDoc(); renderLayers(); })()"); await pg.wait_for_timeout(500)
    await scan(pg, view, 'レイヤー一覧', found)
    if mobile:
        for sh in ['add', 'layers', 'ins', 'bg']:
            try: await pg.evaluate(f"document.querySelector('#mbar [data-sheet={sh}]').click()"); await pg.wait_for_timeout(500); await scan(pg, view, f'スマホのシート {sh}', found)
            except Exception: pass
    await popups(pg, view, found, mobile)
    # 文字素材モード
    await pg.evaluate("setMode('text')"); await pg.wait_for_timeout(800); await scan(pg, view, '文字素材モード', found)
    if mobile: await tabs(pg, view, '文字素材', found, mobile)
    await pg.browser_.close()

async def main():
    quick = '--quick' in sys.argv; found = {}
    async with async_playwright() as p:
        for name, w, h, touch in VIEWS:
            if quick and name not in QUICK: continue
            try: await run_view(p, name, w, h, touch, found); print('✔', name, flush=True)
            except Exception as e: print('✘', name, str(e)[:120], flush=True)
    order = ['page-hscroll', 'offscreen-x', 'offscreen-y', 'clip-x', 'clip-y', 'overflow-parent']
    print(f'\n見つかった箇所：{len(found)} 件')
    for (k, d), where in sorted(found.items(), key=lambda kv: (order.index(kv[0][0]), -len(kv[1]))):
        vs = sorted({v for v, _ in where}); ls = sorted({l for _, l in where})
        print(f'[{k}] {d}\n    画面: {" / ".join(vs)}\n    場所: {" / ".join(ls[:4])}{" ほか" if len(ls) > 4 else ""}')
    json.dump([{'kind': k, 'detail': d, 'views': sorted({v for v, _ in w}), 'where': sorted({l for _, l in w})} for (k, d), w in found.items()], open('/tmp/layout-audit.json', 'w'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    asyncio.run(main())
