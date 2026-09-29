"""すべてのテストを順に実行する：python3 tests/run_all.py [テスト名の一部 ...]"""
import asyncio, importlib, sys, time, traceback
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from playwright.async_api import async_playwright

async def main(filters):
    names = sorted(f.stem for f in Path(__file__).resolve().parent.glob('test_*.py'))
    if filters: names = [n for n in names if any(f in n for f in filters)]
    failed = 0
    async with async_playwright() as p:
        for n in names:
            doc = (importlib.import_module(n).__doc__ or '').strip().split('\n')[0]
            t = time.time()
            try:
                r = await importlib.import_module(n).run(p)
                print(f"{'－' if r else '✔'} {n}  {doc}  ({time.time() - t:.0f}s){'  ' + r if r else ''}", flush=True)
            except Exception as e:
                failed += 1; print(f"✘ {n}  {doc}\n   {type(e).__name__}: {e}", flush=True)
                if '-v' in sys.argv: traceback.print_exc()
    print(f"\n{len(names) - failed} / {len(names)} 件成功")
    return failed

if __name__ == '__main__':
    sys.exit(1 if asyncio.run(main([a for a in sys.argv[1:] if not a.startswith('-')])) else 0)
