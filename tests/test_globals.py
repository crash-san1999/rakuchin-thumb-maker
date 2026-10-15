"""共有の名前の重なり：index.html が読み込む全 js で、ファイルの一番外側の関数・変数・クラスの名前が重ならない（後のファイルの関数が前のものを黙って上書きするのを防ぐ）"""
# このアプリは <script> を順に読み込み、一番外側の名前をすべてのファイルで共有している（README「ファイル構成」）。
# 同じ名前の function が 2 つあると、エラーにならずに後から読み込んだ方で上書きされ、前の方を呼んでいた所が別の関数を呼んでしまう
# （型チェックの tsc --checkJs でも見つからない）。const / let の重なりは読み込み時のエラーになる。どちらもここで見つける。
# 名前の取り出しは TypeScript のパーサ（tsc と同じ typescript パッケージ）で行う。ブラウザは使わない。
# typescript が見つからないときは、test_typecheck と同じく失敗ではなく「省略」として結果に書く。
import asyncio, json, re
from pathlib import Path
from test_typecheck import sh, TS_VERSION

ROOT = Path(__file__).resolve().parents[1]

# 一番外側の宣言の名前を「ファイル:行」と一緒に JSON で出す。{ } のブロックの中（ファイル内だけで使うもの）は数えない
NODE = r"""
const path = require('path'), fs = require('fs'), {execSync} = require('child_process');
let ts; for(const p of [process.env.TS_PATH, 'typescript', path.join(execSync('npm root -g').toString().trim(), 'typescript')]){
  if(!p) continue; try{ ts = require(p); break; }catch{} }
if(!ts){ console.log(JSON.stringify({skip:'typescript が見つからない'})); process.exit(0); }
const out = {}, add = (n, f, sf, node) => (out[n] = out[n] || []).push(f + ':' + (sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1));
for(const f of JSON.parse(process.argv[1])){
  const sf = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  for(const st of sf.statements){
    if((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) add(st.name.text, f, sf, st);
    if(ts.isVariableStatement(st)) for(const d of st.declarationList.declarations){
      const walk = b => { if(ts.isIdentifier(b)) add(b.text, f, sf, d); else b.elements.forEach(e => e.name && walk(e.name)); };
      walk(d.name);
    }
  }
}
console.log(JSON.stringify({names:out}));
"""

async def run(p):
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    files = re.findall(r'<script src="(js/[^"?]+)', html)
    assert len(files) > 30, f'読み込む js が少なすぎる（{len(files)} 件）。index.html の書き方が変わった？'
    code, out = await sh('node', '-e', NODE, json.dumps(files))
    if code is None: return '省略：Node.js が見つからない'
    assert code == 0, '名前の取り出しに失敗：\n' + out[-2000:]
    r = json.loads(out.strip().splitlines()[-1])
    if 'skip' in r: return f"省略：{r['skip']}（typescript@{TS_VERSION} を入れると確かめられる）"
    names = r['names']
    dup = {n: locs for n, locs in names.items() if len(locs) > 1}
    assert not dup, '同じ名前が複数のファイル（または同じファイル）の一番外側にある：\n      ' + '\n      '.join(f'{n}: {", ".join(l)}' for n, l in sorted(dup.items()))
    return f'{len(files)} ファイル・{len(names)} 個の名前：重なりなし'
