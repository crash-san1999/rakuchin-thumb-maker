"""操作マニュアル（docs/manual.md）の画像を、今の画面で撮り直す：python3 tools/docs-screenshots.py
   テスト用の画像（tests/fixtures が作るオリジナルの絵）を使うので、何度撮っても同じ絵柄になる。
   撮ったままの画像は .docs-raw/ に置き、docs_decorate.py でポップな飾りを付けて docs/img/ に書き出す。
   見た目（飾り）だけ変えたいときは、撮り直さずに：python3 tools/docs-screenshots.py --decorate-only"""
import asyncio, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tests'))
from helpers import ROOT, IMG, open_app, close, settle, page, canvas_box
sys.path.insert(0, str(Path(__file__).resolve().parent))
from docs_decorate import decorate_file
from playwright.async_api import async_playwright
from PIL import Image

OUT = ROOT / '.docs-raw'          # 撮ったまま（Git には入れない）
FINAL = ROOT / 'docs' / 'img'      # 飾りを付けた、説明書に載せる画像
OUT.mkdir(exist_ok=True); FINAL.mkdir(parents=True, exist_ok=True)
SIDE = {'x': 0, 'y': 62, 'width': 400, 'height': 838}
SLUG = {'かわいい・ポップ': 'pop', 'カッコいい': 'cool', 'ゲーム・配信': 'game', 'ブラシ・手作り感': 'brush', 'レトロ・アート': 'retro'}

async def shot(pg, name, **kw): await pg.screenshot(path=str(OUT / name), **kw)

async def main_screens(p):
    pg = await open_app(p)
    await pg.evaluate("openHelp()"); await pg.wait_for_timeout(600); await shot(pg, 'help.png'); await pg.evaluate("closeHelp()")
    await pg.set_input_files('#bgimgfile', IMG['city.jpg']); await settle(pg, 1200)
    await pg.evaluate("applyBgFx('lines'); selectLayer(null)"); await settle(pg, 800)
    for pgn, name in [('bg-main', 'ins-bg.png'), ('bg-tone', 'ins-bg-tone.png'), ('bg-fx', 'bg-effects.png')]:
        await page(pg, pgn); await shot(pg, name, clip=SIDE)
    await pg.set_input_files('#imgfile', IMG['chara.jpg']); await settle(pg, 1500)
    await pg.evaluate("(() => { const L = selLayer(); L.x = 1440; L.y = 560; L.sc = 0.6; docChanged(false); })()"); await settle(pg, 800)
    await page(pg, 'lay-frame'); await pg.click('[data-frpre=icon]'); await settle(pg)
    await shot(pg, 'ins-frame.png', clip=SIDE)
    await page(pg, 'lay-base'); await shot(pg, 'ins-image.png', clip=SIDE)
    await page(pg, 'lay-edge'); await shot(pg, 'ins-edge.png', clip=SIDE)
    await pg.evaluate("selectLayer(DOC.layers.find(l => l.type === 'text').id)"); await settle(pg, 900)
    await page(pg, 'txt-text'); await shot(pg, 'overview.png'); await shot(pg, 'ins-text.png', clip=SIDE)
    for pgn, name in [('txt-style', 'tab-style.png'), ('txt-font', 'tab-font.png'), ('txt-deco', 'tab-design.png')]:
        await page(pg, pgn); await shot(pg, name, clip=SIDE)
    await shot(pg, 'layers.png', clip={'x': 1166, 'y': 62, 'width': 274, 'height': 420})
    await pg.evaluate("selectLayer(DOC.layers.find(l => l.type === 'fx').id)"); await settle(pg, 900); await shot(pg, 'fx-layer.png')
    # フレーム調整モード
    await pg.evaluate("(() => { const L = DOC.layers.find(l => l.type === 'image'); selectLayer(L.id); const g0 = frameGeom(L); L.frame.fs = 0.55; L.frame.cy = 0.32; frameCompensate(L, g0); syncDoc(); docChanged(false); })()")
    await page(pg, 'lay-frame'); await settle(pg, 1200); await pg.click('#frameEditBtn'); await settle(pg); await shot(pg, 'frame-edit.png')
    await pg.keyboard.press('Escape'); await pg.evaluate("selectLayer(null)"); await settle(pg, 600)
    await pg.click('#addBtn'); await pg.wait_for_timeout(500); await shot(pg, 'add-menu.png', clip={'x': 380, 'y': 0, 'width': 560, 'height': 420}); await pg.keyboard.press('Escape')
    await pg.click('#fileBtn'); await pg.wait_for_timeout(500)
    r = await pg.eval_on_selector('#fileMenu', 'e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }')
    await shot(pg, 'file-menu.png', clip={'x': r[0] - 10, 'y': 0, 'width': r[2] + 20, 'height': r[1] + r[3] + 12}); await pg.keyboard.press('Escape')
    await pg.evaluate("document.querySelector('#ddov').classList.add('show')"); await pg.wait_for_timeout(400); await shot(pg, 'dragdrop.png')
    await pg.evaluate("document.querySelector('#ddov').classList.remove('show')")
    # 分割フレーム
    await pg.evaluate("DOC.layers.filter(l => l.type !== 'text').forEach(l => l.hidden = true); addCollage()"); await settle(pg, 800)
    await pg.evaluate("(() => { Object.assign(selLayer(), {n:'2', layout:'cols', slant:0.35, edge:'zigzag', bstyle:'glow', lc:'#ffe600', lw:12}); syncDoc(); docChanged(false); })()")
    await page(pg, 'lay-cells'); await pg.click('[data-cell="0"]'); await pg.set_input_files('#cellfile', [IMG['synth.jpg'], IMG['night.jpg']]); await settle(pg, 2200)
    await page(pg, 'lay-split'); await settle(pg, 600); await shot(pg, 'collage.png')
    await page(pg, 'lay-cells'); await shot(pg, 'ins-cells.png', clip=SIDE)
    await page(pg, 'lay-cfx'); await pg.click('.seg[data-dseg="@fxMode"] [data-v="cell"]')
    await pg.click('.cellBox:visible [data-cell="0"]'); await pg.click('[data-cfx="red"]:visible')
    await pg.click('.cellBox:visible [data-cell="1"]'); await pg.click('[data-cfx="focus"]:visible'); await settle(pg, 1200); await shot(pg, 'collage-fx.png')
    # 1週間の予定表（7分割・日付の横に曜日）。背景色・文字タブ
    await pg.evaluate("DOC.layers.forEach(l => { if(l.type !== 'collage') l.hidden = true; })")
    await pg.evaluate("(() => { const L = selLayer(); Object.assign(L, {n:'7', layout:'wk43', slant:0, edge:'straight', bstyle:'line', lc:'#ffffff', lw:14, fxMode:'all'}); L.fx = mergeCellFx({}); L.cells.forEach(c => { c.asset = null; }); L.wk.start = '2026-10-07'; collageFillWeek(L); L.ac = 2; syncDoc(); docChanged(false); })()")
    await settle(pg, 7000)
    await page(pg, 'lay-ctext'); await settle(pg, 500); await shot(pg, 'week.png'); await shot(pg, 'ins-ctext.png', clip=SIDE)
    await pg.click('#modeSeg [data-mode=text]'); await settle(pg, 1400); await shot(pg, 'text-mode.png')
    # 新規作成の画面
    await pg.click('#modeSeg [data-mode=thumb]'); await settle(pg, 800); await pg.click('#newBtn'); await pg.wait_for_timeout(500); await shot(pg, 'new-project.png', clip={'x': 380, 'y': 230, 'width': 680, 'height': 440})
    await close(pg)

async def frame_groups(p):
    pg = await open_app(p)
    await pg.set_input_files('#bgimgfile', IMG['city.jpg']); await settle(pg, 1500)
    await pg.evaluate("applyBgFx('lines'); selectLayer(null)"); await settle(pg, 1200)
    await pg.set_input_files('#imgfile', IMG['chara.jpg']); await settle(pg, 1500)
    await page(pg, 'lay-frame')
    box = await canvas_box(pg)
    for name, keys in await pg.evaluate("FRAME_GROUPS"):
        tiles = []
        for k in keys:
            await pg.click(f'[data-frpre="{k}"]'); await settle(pg)
            path = OUT / f'_tile_{k}.png'
            await pg.screenshot(path=str(path), clip={'x': box[0] + box[2] * 0.45, 'y': box[1], 'width': box[2] * 0.55, 'height': box[3]}); tiles.append(path)
        ims = [Image.open(t) for t in tiles]; w, h = ims[0].size; w //= 2; h //= 2; cols = 4
        G = Image.new('RGB', (w * cols, h * ((len(ims) + cols - 1) // cols)), 'white')
        for i, im in enumerate(ims): G.paste(im.resize((w, h)), ((i % cols) * w, (i // cols) * h))
        G.save(OUT / f'frames-{SLUG[name]}.png', optimize=True)
        for t in tiles: t.unlink()
    await close(pg)

async def mobile(p):
    pg = await open_app(p, mobile=True)
    await pg.set_input_files('#bgimgfile', IMG['city.jpg']); await settle(pg, 1500)
    await pg.evaluate("selectLayer(null)"); await pg.wait_for_timeout(800)
    await shot(pg, 'mobile.png')
    await pg.click('#mbar [data-sheet=add]'); await pg.wait_for_timeout(600); await shot(pg, 'mobile-add.png')
    await pg.click('#mbar [data-sheet=ins]'); await pg.wait_for_timeout(900); await shot(pg, 'mobile-ins.png')
    await pg.click('#mbar [data-sheet=layers]'); await pg.wait_for_timeout(900); await shot(pg, 'mobile-layers.png')
    await close(pg)
    for n in ['mobile', 'mobile-add', 'mobile-ins', 'mobile-layers']:
        im = Image.open(OUT / f'{n}.png'); im.resize((390, int(im.height * 390 / im.width)), Image.LANCZOS).save(OUT / f'{n}.png', optimize=True)

def decorate_all():
    """撮ったまま（.docs-raw/）の画像すべてに飾りを付けて、docs/img/ に書き出す"""
    n = 0
    for f in sorted(OUT.glob('*.png')):
        if f.name.startswith('_'): continue
        decorate_file(f, FINAL / f.name); n += 1
    print(f'docs/img を更新しました（{n}枚）')

async def main():
    async with async_playwright() as p:
        await main_screens(p); await frame_groups(p); await mobile(p)
    decorate_all()

if __name__ == '__main__':
    if '--decorate-only' in sys.argv: decorate_all()
    else: asyncio.run(main())
