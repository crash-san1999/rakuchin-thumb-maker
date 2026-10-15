"""すべてのテストを実行する：python3 tests/run_all.py [テスト名の一部 ...] [--timeout=秒] [-j 数 | --jobs=数] [-v]
1件が止まっても全体が止まらないよう、1件ごとに制限時間（既定 150 秒。テストのモジュールに TIMEOUT＝秒 があればそれ以上）を設け、超えたら失敗として次へ進む。失敗・時間切れで残ったブラウザも閉じる。

並列実行：-j（--jobs）の数だけ、テストを同時に別々のプロセスで動かす（既定は CPU の数の 2 倍・最大 6。環境変数 TEST_JOBS でも指定できる）。
  ・1 件ごとに別プロセスなので、ブラウザ・保存データ（localStorage・IndexedDB は 1 件ごとに新しいブラウザ）・後片付けが互いに干渉しない
  ・時間のかかるテストから先に始める（前回の所要時間を tests/.durations.json に記録して使う。無ければモジュールの TIMEOUT の大きい順）
  ・結果は終わった順に 1 行ずつ出し、最後に失敗したテストをまとめて出す
  ・並列で失敗したテストは最後に 1 件ずつ単独で動かし直し、単独なら通るものは「並列のときだけ失敗」と知らせる
  -j 1 のときは、これまでどおり 1 つのプロセスで順に実行する。
  --one 名前 は内部用（並列実行の子プロセスが 1 件だけ動かす）。"""
import asyncio, importlib, json, os, sys, time, traceback
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import helpers
from playwright.async_api import async_playwright

DURATIONS = HERE / '.durations.json'   # 前回の所要時間（秒）。並べる順番にだけ使う（git には入れない）

def doc_of(n):
    return (importlib.import_module(n).__doc__ or '').strip().split('\n')[0]

def limit_of(n, limit):
    return max(limit, getattr(importlib.import_module(n), 'TIMEOUT', 0))   # 項目が多くて時間のかかるテストは、モジュールの TIMEOUT で長くできる

async def run_one(p, n, limit):
    """1 件を実行して結果の行を出す。成功なら True"""
    doc = doc_of(n); t = time.time()
    try:
        mod = importlib.import_module(n)
        r = await asyncio.wait_for(mod.run(p), limit_of(n, limit))
        print(f"{'－' if r else '✔'} {n}  {doc}  ({time.time() - t:.0f}s){'  ' + r if r else ''}", flush=True)
        return True
    except BaseException as e:
        if isinstance(e, (KeyboardInterrupt, SystemExit)): raise
        msg = f'時間切れ（{limit_of(n, limit):.0f} 秒を超えました）' if isinstance(e, asyncio.TimeoutError) else f'{type(e).__name__}: {e}'
        print(f"✘ {n}  {doc}\n   {msg}", flush=True)
        # GitHub Actions では、失敗をまとめ（annotations）にも出す。ログを開かなくても、API や画面の一覧でどのテストが落ちたか分かる
        if os.environ.get('GITHUB_ACTIONS'): print(f"::error title={n}::{msg[:900].replace(chr(10), ' ')}", flush=True)
        if '-v' in sys.argv: traceback.print_exc()
        return False
    finally:
        for b in list(helpers.OPEN_BROWSERS):   # 失敗・時間切れで閉じられなかったブラウザを片付ける
            try: await b.close()
            except Exception: pass
            helpers.OPEN_BROWSERS.remove(b)

async def serial(names, limit):
    failed = 0
    async with async_playwright() as p:
        for n in names:
            if not await run_one(p, n, limit): failed += 1
    print(f"\n{len(names) - failed} / {len(names)} 件成功")
    return failed

async def parallel(names, limit, jobs):
    try: past = json.loads(DURATIONS.read_text(encoding='utf-8'))
    except Exception: past = {}
    # 時間のかかるものから始めると、最後に 1 件だけ長く残るのを避けられる
    order = sorted(names, key=lambda n: (-past.get(n, limit_of(n, limit) / 10), n))
    gate = {'sem': asyncio.Semaphore(jobs)}; results = {}; took = dict(past)
    passthru = [a for a in sys.argv[1:] if a.startswith('--timeout=') or a == '-v']

    async def one(n):
        async with gate['sem']:
            t = time.time()
            pr = await asyncio.create_subprocess_exec(sys.executable, '-u', str(HERE / 'run_all.py'), '--one', n, *passthru,
                                                      stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT, cwd=str(HERE.parent))
            try:
                out, _ = await asyncio.wait_for(pr.communicate(), limit_of(n, limit) + 90)   # 子が自分の制限時間で止まらなかったときの歯止め
            except asyncio.TimeoutError:
                pr.kill(); await pr.wait(); out = f'✘ {n}  {doc_of(n)}\n   時間切れ（子プロセスが応答しない）'.encode()
            text = out.decode('utf-8', 'replace')
            # 結果の行（✔ － ✘ とその下の説明）だけを出す。テスト中のサーバーのログなどは、失敗したときと -v のときだけ
            lines = text.splitlines()
            keep = [l for i, l in enumerate(lines) if l[:1] in '✔－✘' or l.startswith('::error') or (i and lines[i - 1].startswith('✘') and l.startswith('   '))]
            ok = pr.returncode == 0 and any(l[:1] in '✔－' for l in keep)
            if not keep: keep = [f'✘ {n}  {doc_of(n)}', '   結果の行がありません（子プロセスが途中で終了）']
            print('\n'.join(lines if (not ok or '-v' in sys.argv) and len(lines) <= 200 else keep), flush=True)
            results[n] = ok; took[n] = round(time.time() - t)

    t0 = time.time()
    await asyncio.gather(*(one(n) for n in order))
    try: DURATIONS.write_text(json.dumps(took, ensure_ascii=False, indent=0, sort_keys=True), encoding='utf-8')
    except Exception: pass
    # 並列で失敗したものは、最後に 1 件ずつ単独で動かし直す。単独なら通るものは「並列のときだけ失敗」として、隠さずに知らせる
    # （同時に動くほかのテストの負荷で待ち時間が足りなくなった可能性が高い。テストの待ち方を、状態を確かめて待つ形に直すきっかけにする）
    again = [n for n in names if not results.get(n)]; flaky = []
    if again:
        print('\n並列で失敗したテストを、1 件ずつ単独で動かし直します：' + '、'.join(again), flush=True)
        gate['sem'] = asyncio.Semaphore(1)
        for n in again:
            await one(n)
            if results.get(n): flaky.append(n)
    bad = [n for n in names if not results.get(n)]
    if flaky:
        print('\n⚠ 並列のときだけ失敗（単独では成功）：' + '、'.join(flaky), flush=True)
        if os.environ.get('GITHUB_ACTIONS'): print(f"::warning title=並列のときだけ失敗::{'、'.join(flaky)}", flush=True)
    if bad: print('\n失敗：' + '、'.join(bad))
    print(f"\n{len(names) - len(bad)} / {len(names)} 件成功（{jobs} 並列・{time.time() - t0:.0f} 秒）")
    return len(bad)

def jobs_arg():
    a = sys.argv[1:]
    for i, x in enumerate(a):
        if x.startswith('--jobs='): return int(x.split('=')[1])
        if x == '-j' and i + 1 < len(a): return int(a[i + 1])
        if x.startswith('-j') and x[2:].isdigit(): return int(x[2:])
    # 既定は CPU の数の 2 倍（最大 6）。テストの多くは描画を待っている時間で CPU を使い切らないため、CPU の数より多く並べると速い
    return int(os.environ.get('TEST_JOBS') or min(6, 2 * (os.cpu_count() or 1)))

if __name__ == '__main__':
    lim = next((float(a.split('=')[1]) for a in sys.argv if a.startswith('--timeout=')), 150.0)
    if '--one' in sys.argv:
        n = sys.argv[sys.argv.index('--one') + 1]
        async def _one():
            async with async_playwright() as p: return await run_one(p, n, lim)
        sys.exit(0 if asyncio.run(_one()) else 1)
    args = sys.argv[1:]
    skip = {i + 1 for i, x in enumerate(args) if x == '-j'}   # -j の次の数はテスト名ではない
    filters = [a for i, a in enumerate(args) if not a.startswith('-') and i not in skip]
    names = sorted(f.stem for f in HERE.glob('test_*.py'))
    if filters: names = [n for n in names if any(f in n for f in filters)]
    helpers.ensure()   # テスト用の画像を先に 1 回だけ作る（並列の子プロセスが同時に作って取り合わないように）
    jobs = max(1, min(jobs_arg(), len(names) or 1))
    sys.exit(1 if asyncio.run(serial(names, lim) if jobs == 1 else parallel(names, lim, jobs)) else 0)
