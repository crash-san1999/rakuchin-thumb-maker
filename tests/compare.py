"""指定したコミット（既定は直前のコミット）と今の作業中のファイルで、見た目と結果が変わっていないか比べる
   python3 tests/compare.py [比べるコミット]   例：python3 tests/compare.py HEAD~3
   ・画面（PC：通常／操作ガイド／文字素材モード、スマホ：通常／操作ガイド／設定シート）のスクリーンショット
   ・文字スタイルの全プリセットの描画結果
   ・設定パネルの各ページに出る項目
   リファクタリングのように「見た目を変えないはずの変更」の確認に使う"""
import asyncio, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from helpers import ROOT, open_app, close
from playwright.async_api import async_playwright
from PIL import Image, ImageChops

NOISE_PX = 40  # これ以下の数のピクセルの違いは描画の揺れとして無視する
PRESETS = """(() => { const keep = clone(S), out = [];
  for(const p of PRESETS){ S = merged(Object.assign(clone(keep), clone(p[1]))); S.text = 'テスト{強調}ABC'; const c = render(1); out.push(c.width + 'x' + c.height + ':' + c.toDataURL()); }
  S = keep; return out; })()"""
PAGES = """(() => { const res = {}; for(const el of document.querySelectorAll('#selBox > [data-pg], #bgRows > [data-pg]')){
  const d = (el.querySelector('[data-d],[data-dseg],[data-dreroll]') || {dataset:{}}).dataset; (res[el.dataset.pg] = res[el.dataset.pg] || []).push(d.d || d.dseg || d.dreroll || el.textContent.trim().slice(0, 12)); }
  return res; })()"""

async def fresh(pg):
    # 描画キャッシュを使い回すかどうかのタイミング差で輪郭が揺れないよう、撮る前にキャッシュを捨てて描き直す
    await pg.evaluate("(() => { if(DOC && DOC.mode === 'thumb'){ prevCache.clear(); paintPreview(false); } })()"); await pg.wait_for_timeout(300)

async def capture(p, root, out):
    shots, data = {}, {}
    pg = await open_app(p, root=root)
    await fresh(pg); await pg.screenshot(path=f'{out}/pc.png'); await pg.evaluate("openHelp()"); await pg.wait_for_timeout(600); await pg.screenshot(path=f'{out}/pc_help.png')
    await pg.evaluate("closeHelp()"); data['presets'] = await pg.evaluate(PRESETS); data['pages'] = await pg.evaluate(PAGES)
    await pg.click('#modeSeg [data-mode=text]'); await pg.wait_for_timeout(1500); await pg.mouse.move(700, 700); await pg.wait_for_timeout(500)
    await pg.screenshot(path=f'{out}/pc_text.png'); await close(pg)
    pg = await open_app(p, root=root, mobile=True)
    await fresh(pg); await pg.screenshot(path=f'{out}/sp.png'); await pg.click('#mbar [data-sheet=ins]'); await pg.wait_for_timeout(3000); await fresh(pg); await pg.screenshot(path=f'{out}/sp_sheet.png')
    await close(pg)
    return data

async def main(ref):
    with tempfile.TemporaryDirectory() as tmp:
        old = Path(tmp) / 'old'
        subprocess.run(['git', '-C', str(ROOT), 'worktree', 'add', '--detach', str(old), ref], check=True, capture_output=True)
        try:
            (Path(tmp) / 'a').mkdir(); (Path(tmp) / 'b').mkdir()
            async with async_playwright() as p:
                A = await capture(p, old, f'{tmp}/a'); B = await capture(p, ROOT, f'{tmp}/b')
            ok = True
            for n in ['pc', 'pc_help', 'pc_text', 'sp', 'sp_sheet']:
                diff = ImageChops.difference(Image.open(f'{tmp}/a/{n}.png').convert('RGB'), Image.open(f'{tmp}/b/{n}.png').convert('RGB'))
                # 輪郭のにじみなど、数ピクセルの描画の揺れは差とみなさない
                count = sum(diff.convert('L').histogram()[41:])
                bad = count > NOISE_PX
                print(f"{'✘' if bad else '✔'} 画面 {n}{'  違うピクセル ' + str(count) + ' 個（範囲 ' + str(diff.getbbox()) + '）' if bad else ('  （' + str(count) + ' ピクセルの描画の揺れは無視）' if count else '')}"); ok &= not bad
            pd = [i for i, (x, y) in enumerate(zip(A['presets'], B['presets'])) if x != y]
            same = len(A['presets']) == len(B['presets']) and not pd
            print(f"{'✔' if same else '✘'} プリセットの描画 {len(B['presets'])} 件{'' if same else '  違う番号 ' + str(pd)}"); ok &= same
            print(f"{'✔' if A['pages'] == B['pages'] else '✘'} 設定パネルのページごとの項目"); ok &= A['pages'] == B['pages']
            print('\n変化なし' if ok else '\n違いがあります（意図した変更か確認してください）')
            return 0 if ok else 1
        finally:
            subprocess.run(['git', '-C', str(ROOT), 'worktree', 'remove', '--force', str(old)], capture_output=True)

if __name__ == '__main__':
    sys.exit(asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else 'HEAD')))
