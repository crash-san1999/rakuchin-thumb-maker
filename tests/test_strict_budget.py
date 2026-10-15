"""型の厳しさの段階的な引き上げ：まだ有効にしていない厳しい設定（strictNullChecks・noImplicitAny）で出る指摘の数が、ファイルごとに記録（tests/strict-budget.json）より増えない"""
# 目標は tsconfig.json の strict: true。指摘が多いので一度には直さず、少しずつ減らしていく。その途中で新しい指摘が混ざらないよう、
# ファイルごと・設定ごとの「いまの件数」を上限として記録し、それを超えたら失敗にする（新しく書くコードは、最初から型と null の扱いを書く）。
# 減ったら上限を下げる：python3 tests/test_strict_budget.py --update（減っただけのときは、このテストは成功のまま「下げられる」と知らせる）
# ある設定の件数が全ファイルで 0 になったら、tsconfig.json でその設定を有効にし、strict-budget.json からその設定を消す。
# tsc の探し方・省略の扱いは test_typecheck と同じ。
import asyncio, json, re, sys
from pathlib import Path
from test_typecheck import sh, find_tsc

ROOT = Path(__file__).resolve().parents[1]
BUDGET = ROOT / 'tests' / 'strict-budget.json'

async def counts(tsc, flag):
    """flag を足して tsc を動かし、ファイルごとの指摘の数を返す"""
    code, out = await sh(*tsc, '-p', '.', f'--{flag}')
    c = {}
    for m in re.finditer(r'^(\S+?\.(?:js|ts))\(\d+,\d+\): error TS\d+', out, re.M): c[m.group(1)] = c.get(m.group(1), 0) + 1
    return c

async def measure(tsc, flags):
    return {f: dict(sorted((await counts(tsc, f)).items())) for f in flags}

async def run(p):
    tsc, ver = await find_tsc()
    if not tsc: return f'省略：{ver}'
    budget = json.loads(BUDGET.read_text(encoding='utf-8'))
    now = await measure(tsc, list(budget))
    over, under = [], 0
    for flag, files in now.items():
        for f, n in files.items():
            lim = budget[flag].get(f, 0)
            if n > lim: over.append(f'{flag} {f}: {n} 件（上限 {lim}）')
            under += max(0, lim - n)
        under += sum(v for f, v in budget[flag].items() if f not in files)
    assert not over, '型の指摘が上限より増えた（新しいコードに型・null の扱いを書く）：\n      ' + '\n      '.join(over)
    total = {f: sum(v.values()) for f, v in now.items()}
    return '残り ' + '・'.join(f'{f} {n} 件' for f, n in total.items()) + (f'（上限より {under} 件減った：--update で下げられる）' if under else '')

if __name__ == '__main__' and '--update' in sys.argv:
    async def _up():
        tsc, ver = await find_tsc(); assert tsc, ver
        flags = list(json.loads(BUDGET.read_text(encoding='utf-8'))) if BUDGET.exists() else ['strictNullChecks', 'noImplicitAny']
        now = await measure(tsc, flags)
        BUDGET.write_text(json.dumps(now, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        print('更新しました：' + '・'.join(f'{f} {sum(v.values())} 件' for f, v in now.items()))
    asyncio.run(_up())
