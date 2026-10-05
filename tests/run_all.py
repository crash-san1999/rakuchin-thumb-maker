"""すべてのテストを順に実行する：python3 tests/run_all.py [テスト名の一部 ...] [--timeout=秒]
1件が止まっても全体が止まらないよう、1件ごとに制限時間（既定 150 秒。テストのモジュールに TIMEOUT＝秒 があればそれ以上）を設け、超えたら失敗として次へ進む。失敗・時間切れで残ったブラウザも閉じる"""
import asyncio, importlib, sys, time, traceback
import helpers
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from playwright.async_api import async_playwright

async def main(filters, limit):
    names = sorted(f.stem for f in Path(__file__).resolve().parent.glob('test_*.py'))
    if filters: names = [n for n in names if any(f in n for f in filters)]
    failed = 0
    async with async_playwright() as p:
        for n in names:
            doc = (importlib.import_module(n).__doc__ or '').strip().split('\n')[0]
            t = time.time()
            try:
                mod = importlib.import_module(n); lim = max(limit, getattr(mod, 'TIMEOUT', 0))   # 項目が多くて時間のかかるテストは、モジュールの TIMEOUT で長くできる
                r = await asyncio.wait_for(mod.run(p), lim)
                print(f"{'－' if r else '✔'} {n}  {doc}  ({time.time() - t:.0f}s){'  ' + r if r else ''}", flush=True)
            except BaseException as e:
                if isinstance(e, (KeyboardInterrupt, SystemExit)): raise
                failed += 1; msg = f'時間切れ（{max(limit, getattr(importlib.import_module(n), "TIMEOUT", 0)):.0f} 秒を超えました）' if isinstance(e, asyncio.TimeoutError) else f'{type(e).__name__}: {e}'
                print(f"✘ {n}  {doc}\n   {msg}", flush=True)
                if '-v' in sys.argv: traceback.print_exc()
            finally:
                for b in list(helpers.OPEN_BROWSERS):   # 失敗・時間切れで閉じられなかったブラウザを片付ける
                    try: await b.close()
                    except Exception: pass
                    helpers.OPEN_BROWSERS.remove(b)
    print(f"\n{len(names) - failed} / {len(names)} 件成功")
    return failed

if __name__ == '__main__':
    lim = next((float(a.split('=')[1]) for a in sys.argv if a.startswith('--timeout=')), 150.0)
    sys.exit(1 if asyncio.run(main([a for a in sys.argv[1:] if not a.startswith('-')], lim)) else 0)
