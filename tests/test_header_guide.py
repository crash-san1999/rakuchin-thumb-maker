"""ヘッダー画像（YouTubeチャンネルアート／Twitchバナー）：プリセットで規定サイズになり、セーフエリアのガイドが自動オン。
   ほかのサイズに変えるとオフ。ガイドは書き出しに入らない。保存・復元でも保たれる"""
from helpers import *

async def pick(pg, v):
    # キャンバスのメニューを開いてからプリセットを選ぶ（選ぶとメニューは閉じる）
    if not await pg.evaluate("$('#canvasMenu').classList.contains('show')"): await pg.click('#canvasBtn')
    await pg.select_option('#canvasPreset', v); await settle(pg, 800)

async def run(p):
    pg = await open_app(p)
    st = "[DOC.w, DOC.h, DOC.hdr, DOC.guides.safe, $('#safeChip').hidden, $('#safeChip').classList.contains('on'), $('#canvasPreset').value]"
    assert await pg.evaluate(st) == [1920, 1080, '', False, True, False, '1920x1080'], '初期状態が違う'
    # 1) YouTube：2560×1440 になり、ガイドがオン・ボタンが出る
    await pick(pg, 'yt-header')
    assert await pg.evaluate(st) == [2560, 1440, 'yt', True, False, True, 'yt-header'], await pg.evaluate(st)
    # 2) ボタンでオフ／オン
    await pg.click('#safeChip'); await settle(pg, 300)
    assert await pg.evaluate("DOC.guides.safe") is False
    await pg.click('#safeChip'); await settle(pg, 300)
    assert await pg.evaluate("DOC.guides.safe") is True
    # 3) Twitch：1200×480
    await pick(pg, 'tw-header')
    assert await pg.evaluate(st) == [1200, 480, 'tw', True, False, True, 'tw-header'], await pg.evaluate(st)
    # 5) 保存→復元でも保たれる。規定サイズと食い違うデータでは無効
    d = await pg.evaluate("JSON.parse(JSON.stringify(DOC))")
    r = await pg.evaluate("(() => { const a = normalizeDoc({...JSON.parse(JSON.stringify(DOC))}); const b = normalizeDoc({...JSON.parse(JSON.stringify(DOC)), w: 1000}); const c = normalizeDoc({...JSON.parse(JSON.stringify(DOC)), hdr: 'constructor'}); return [a.hdr, a.guides.safe, b.hdr, b.guides.safe, c.hdr]; })()")
    assert r == ['tw', True, '', False, ''], r
    # 6) ふつうのサイズ（プリセット・自由指定）に変えるとオフ・ボタンも消える
    await pick(pg, '1920x1080')
    assert await pg.evaluate(st) == [1920, 1080, '', False, True, False, '1920x1080'], await pg.evaluate(st)
    await pick(pg, 'yt-header')
    await pg.fill('#cvW', '2000'); await pg.fill('#cvH', '1000'); await pg.click('#cvApply'); await settle(pg, 700)
    assert await pg.evaluate("[DOC.hdr, DOC.guides.safe, $('#safeChip').hidden]") == ['', False, True], '自由指定でオフにならない'
    # 7) すでに 2560×1440 のときにヘッダーを選んでもオンになる
    await pick(pg, '2560x1440')
    assert await pg.evaluate("[DOC.w, DOC.hdr]") == [2560, '']
    await pick(pg, 'yt-header')
    assert await pg.evaluate("[DOC.hdr, DOC.guides.safe]") == ['yt', True], '同じサイズからヘッダーに切り替えられない'
    # 8) 取り消しで戻る
    await pg.keyboard.press('Escape'); await pg.keyboard.press('Control+z'); await settle(pg, 700)
    assert await pg.evaluate("[DOC.hdr, DOC.guides.safe]") == ['', False], '取り消しで戻らない'
    await close(pg)
    return 'YouTube／Twitch のサイズ選択でセーフエリア自動オン・他のサイズでオフ・ボタンで切替・保存復元・取り消し'
