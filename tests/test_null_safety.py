"""null の扱い：文字パネルとつながる文字レイヤー（textSel）が文字以外を指す保存データでも、文字パネルのスタイルが壊れない／catch で受けた Error 以外の値を、そのまま知らせる"""
# strictNullChecks を有効にしたときに直した所の確認。
from helpers import *

async def run(p):
    pg = await open_app(p)
    # 1) textSel が画像レイヤーを指す保存データ。以前は loadSavedDoc が S（文字パネルのスタイル）を画像レイヤーの style（無い）に差し替えて壊していた
    r = await pg.evaluate("""(() => {
      const d = JSON.parse(JSON.stringify(DOC)), img = normalizeLayer({id:'Inull', type:'image', asset:null});
      d.layers.push(img); d.textSel = 'Inull';
      LS.set('ttm_doc', d); const S0 = S; loadSavedDoc();
      return {textLayer: textLayer(), sOk: !!S && typeof S.text === 'string', same: S === S0};
    })()""")
    assert r['textLayer'] is None, f'文字以外を指す textSel で、文字レイヤーとして扱ってしまう {r}'
    assert r['sOk'], f'文字パネルのスタイルが壊れた {r}'
    # 文字パネルを操作しても止まらない（壊れた S だと、ここで例外になっていた）
    await pg.evaluate("syncUI && syncUI()")
    # 2) catch で受けた値の名前・説明：Error 以外（文字列・数値・名前だけのオブジェクト）でも undefined にならない
    r = await pg.evaluate("[errMsg(new Error('壊れた')), errMsg('文字列'), errMsg(0), errName(new DOMException('x', 'AbortError')), errName('x'), errName(null), errMsg({name:'A'})]")
    assert r == ['壊れた', '文字列', '0', 'AbortError', '', '', '[object Object]'], f'catch の値の扱いが想定と違う {r}'
    await close(pg)
    return 'textSel の種類違い・Error 以外の値'
