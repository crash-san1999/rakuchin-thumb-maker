"""型チェック：TypeScript（tsc --checkJs）で js/ の型の指摘が 0 件（プロパティ名のタイプミス・存在しない項目の参照などを見つける）"""
# 設定は tsconfig.json、型の定義は types/（types.js・dom-loose.d.ts）。ブラウザは使わない。
# tsc の探し方：① PATH にある tsc ② プロジェクトの node_modules（npx --no-install）③ npx で版を固定して取得（通信が必要。CI はこれ）。
# どれも使えない（Node.js が無い・通信できない）ときは、失敗ではなく「省略」として結果に書く。
# 版を固定するのは、TypeScript の更新で指摘の基準が変わり、コードを変えていないのにテストが落ちるのを防ぐため。上げるときは TS_VERSION を変えて 0 件を確認する。
import asyncio, re, shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TS_VERSION = '6.0.3'

async def sh(*cmd, timeout=240):
    """コマンドを実行して (終了コード, 出力) を返す。コマンドが無いときは (None, '')"""
    try:
        pr = await asyncio.create_subprocess_exec(*cmd, cwd=ROOT, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    except FileNotFoundError:
        return None, ''
    try:
        out, _ = await asyncio.wait_for(pr.communicate(), timeout)
    except asyncio.TimeoutError:
        pr.kill(); return None, '時間切れ'
    return pr.returncode, out.decode('utf-8', 'replace')

async def find_tsc():
    """使える tsc のコマンドと版を返す。無ければ (None, 理由)"""
    cands = []
    if shutil.which('tsc'): cands.append(['tsc'])
    if shutil.which('npx'):
        cands.append(['npx', '--no-install', 'tsc'])
        cands.append(['npx', '-y', '-p', f'typescript@{TS_VERSION}', 'tsc'])
    for c in cands:
        code, out = await sh(*c, '-v')
        m = re.search(r'Version (\S+)', out or '')
        if code == 0 and m: return c, m.group(1)
    return None, 'Node.js（npx）か TypeScript が見つからない' if not cands else 'TypeScript を取得できなかった（通信できない？）'

async def run(p):
    tsc, ver = await find_tsc()
    if not tsc: return f'省略：{ver}'
    code, out = await sh(*tsc, '-p', '.')
    errs = [l for l in out.splitlines() if 'error TS' in l]
    assert code == 0 and not errs, f'型の指摘が {len(errs)} 件（tsc {ver}）。例：\n      ' + '\n      '.join(errs[:20] or out.splitlines()[:20])
    return f'tsc {ver}：指摘 0 件'
