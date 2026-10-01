"""素材置き場：画像・文字スタイルの登録と使用、使用量と上限（いっぱいなら保存できない表示）、バックアップの書き出し／読み込み、以前の「マイ」プリセットの移行"""
from helpers import *

async def run(p):
    pg = await open_app(p)
    await pg.evaluate("localStorage.setItem('ttm_mypresets', JSON.stringify([{name:'旧マイ', s:{font:'Noto Sans JP', weight:900, fillType:'solid', fill1:'#00ff00'}}]))")
    await pg.reload(); await settle(pg, 4500); await pg.evaluate("document.querySelector('#help').classList.remove('show')")
    # 以前のマイプリセットが移る
    assert await pg.evaluate("myStyles().map(i => i.name)") == ['旧マイ'], '以前のマイプリセットが素材置き場に移らない'
    assert await pg.evaluate("JSON.parse(localStorage.getItem('ttm_mypresets') || '[]').length") == 0

    await pg.click('#libBtn'); await settle(pg, 400)
    assert await pg.evaluate("document.querySelector('#libMenu').classList.contains('show')")
    assert '上限 200MB' in await pg.inner_text('#libUse'), await pg.inner_text('#libUse')
    # 画像を追加（ファイル選択）
    await pg.set_input_files('#libFile', [IMG['synth.jpg']]); await settle(pg, 1500)
    assert await pg.evaluate("libItems('img').length") == 1, '画像が登録されない'
    assert await pg.evaluate("document.querySelectorAll('#libGrid .libcard').length") == 1
    assert await pg.evaluate("document.querySelector('#libMenu').classList.contains('show')"), '登録したらメニューが閉じた'
    # 同じ画像は二重に登録されない
    await pg.set_input_files('#libFile', [IMG['synth.jpg']]); await settle(pg, 1200)
    assert await pg.evaluate("libItems('img').length") == 1, '同じ画像が二重に登録された'
    # クリックでキャンバスに追加
    n0 = await pg.evaluate("DOC.layers.length")
    await pg.click('#libGrid .libcard'); await settle(pg, 1200)
    assert await pg.evaluate("DOC.layers.length") == n0 + 1 and await pg.evaluate("selLayer().type") == 'image', '素材から画像を追加できない'
    # 文字スタイルの登録と適用
    await pg.click('#libMenu [data-lt=style]'); await settle(pg, 300)
    await pg.fill('#libStyleName', 'テスト'); await pg.click('#libRegStyle'); await settle(pg, 800)
    assert await pg.evaluate("myStyles().map(i => i.name).includes('テスト')"), '文字スタイルが登録されない'
    assert await pg.evaluate("document.querySelectorAll('#libGrid .libst').length") == 2
    # 使用量が出る
    assert await pg.evaluate("libUsed() > 0")

    # 上限：いっぱいなら保存できない（理由が出る）
    await pg.evaluate("window.__max = LIB_MAX_BYTES; LIB.push({id:'dummy', kind:'img', name:'ダミー', thumb:'', bytes: LIB_MAX_BYTES - libUsed(), created:0, size:0}); renderLib()"); await settle(pg, 300)
    assert await pg.evaluate("document.querySelector('#libFull').hidden") is False, '満杯の表示が出ない'
    assert await pg.evaluate("document.querySelector('#libBar').dataset.lv") == 'full'
    assert await pg.evaluate("document.querySelector('#libAddImg').disabled") is True, '満杯なのに追加ボタンが押せる'
    before = await pg.evaluate("LIB.length")
    await pg.evaluate("libAddStyle('だめ', S)"); await settle(pg, 600)
    assert await pg.evaluate("LIB.length") == before, '上限を超えて保存された'
    assert 'いっぱい' in await pg.inner_text('#libFull'), await pg.inner_text('#libFull')
    # 80% で警告
    await pg.evaluate("LIB.pop(); LIB.push({id:'dummy', kind:'img', name:'ダミー', thumb:'', bytes: LIB_MAX_BYTES * 0.85 - libUsed(), created:0, size:0}); renderLib()"); await settle(pg, 300)
    assert await pg.evaluate("document.querySelector('#libBar').dataset.lv") == 'warn'
    await pg.evaluate("LIB = LIB.filter(i => i.id !== 'dummy'); renderLib()")
    # 1枚の上限
    why = await pg.evaluate("libCheck(LIB_MAX_ITEM + 1, 'img')"); assert '1つの画像' in why, why

    # バックアップ → 全削除 → 読み込み
    async with pg.expect_download() as dl: await pg.click('#libExport')
    path = await (await dl.value).path()
    ids = await pg.evaluate("LIB.map(i => i.id)")
    for i in ids: await pg.evaluate(f"libDelete('{i}')")
    await settle(pg, 500)
    assert await pg.evaluate("LIB.length") == 0
    await pg.set_input_files('#libImport', path); await settle(pg, 1500)
    assert await pg.evaluate("LIB.map(i => i.id).sort()") == sorted(ids), '読み込みで元に戻らない'
    # 再読み込みしても残る
    await pg.reload(); await settle(pg, 4500)
    assert await pg.evaluate("LIB.length") == len(ids), '再読み込みで素材が消えた'
    await close(pg)
    await drop_test(p)

async def drop_test(p):
    pg = await open_app(p)
    n0 = await pg.evaluate("DOC.layers.length")
    drop = """(zone) => { const c = document.createElement('canvas'); c.width = 60; c.height = 40; c.getContext('2d').fillRect(0, 0, 60, 40);
      return new Promise(res => c.toBlob(b => { const dt = new DataTransfer(); dt.items.add(new File([b], 'drop.png', {type:'image/png'}));
        const t = document.querySelector('#ddov [data-dz=' + zone + ']'); t.dispatchEvent(new DragEvent('drop', {dataTransfer:dt, bubbles:true, cancelable:true})); res(true); })); }"""
    await pg.evaluate(f"({drop})('lib')"); await settle(pg, 1500)
    assert await pg.evaluate("libItems('img').map(i => i.name)") == ['drop'], 'ドロップで素材置き場に登録されない'
    assert await pg.evaluate("DOC.layers.length") == n0, '素材置き場に落としたのにキャンバスにも追加された'
    await pg.evaluate(f"({drop})('layer')"); await settle(pg, 1500)
    assert await pg.evaluate("DOC.layers.length") == n0 + 1 and await pg.evaluate("libItems('img').length") == 1, '通常のドロップが変わってしまった'
    await close(pg)
