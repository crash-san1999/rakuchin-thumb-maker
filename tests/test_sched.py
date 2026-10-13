"""週間予定表：追加（いちばん手前）・描画（帯・おやすみ・画像）・予定タブの入力・行への画像（選ぶ・ドロップ）・テキストでまとめて入力・
来週分を作る／前後の週・保存と読み込み・細工した保存データ・複製と削除・既存のレイヤーへの影響なし"""
from helpers import *
import json

TITLES = ['忍者八ッ島くん！', '', 'コラボ配信', 'ヴァルクロス', '恐怖夜話 第二夜', 'ゼルダの伝説 SFC', '一週間お疲れ様ラジオ']
# 予定表の1行（i）の帯の中央あたりの色（キャンバスのピクセル）。帯の色が出ているかを見る
ROWPIX = """(i => { const L = DOC.layers.find(l => l.type === 'sched'), tv = document.querySelector('#tv'), k = tv.width / DOC.w;
  const w = L.bw * L.sc, h = L.bh * L.sc, x = (L.x - w / 2 + w * 0.95) * k, y = (L.y - h / 2 + h / 7 * (i + 0.5) + h / 7 * 0.3) * k;   // 帯の右端寄り・下寄り（文字が無い所）
  const d = tv.getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data; return [d[0], d[1], d[2]]; })"""

async def run(p):
    pg = await open_app(p)
    before = await pg.evaluate("JSON.stringify(DOC.layers)")
    # 追加メニューから追加 → いちばん手前・選択中・予定タブが開く。今あるレイヤーは変わらない
    await pg.click('#addBtn'); await settle(pg, 300); await pg.click('#addSchedBtn'); await settle(pg, 1500)
    r = await pg.evaluate("""(() => { const L = DOC.layers[DOC.layers.length - 1]; return [L.type, DOC.sel === L.id, L.rows.length,
      document.querySelector('#tabs [data-page="lay-sched"]').classList.contains('on'), document.querySelectorAll('.schRow').length, layerName(L)]; })()""")
    assert r == ['sched', True, 7, True, 7, '週間予定表'], f'追加したときの状態が違う {r}'
    assert await pg.evaluate("JSON.stringify(DOC.layers.slice(0, -1))") == before, '予定表を足したら、今あるレイヤーが変わった'
    sid = await pg.evaluate("DOC.sel")
    # 週と時刻：週の日付を選ぶと、月曜はじまりの7日が入る。いつもの時刻
    await pg.fill('#schStart', '2026-10-14'); await pg.dispatch_event('#schStart', 'change'); await settle(pg, 300)
    days = await pg.evaluate("[...document.querySelectorAll('.schDay')].map(e => e.textContent)")
    assert days == ['10/12(月)', '10/13(火)', '10/14(水)', '10/15(木)', '10/16(金)', '10/17(土)', '10/18(日)'], f'週の日付が違う {days}'
    await pg.fill('#schTime', '21:00'); await settle(pg, 300)
    assert await pg.evaluate("selLayer().time") == '21:00'
    # 行の入力：タイトル・時刻・おやすみ
    for i, t in enumerate(TITLES):
        if t: await pg.fill(f'.schRow[data-srow="{i}"] [data-sf="title"]', t)
    await pg.fill('.schRow[data-srow="3"] [data-sf="time"]', '19:30')
    await pg.check('.schRow[data-srow="1"] [data-sf="rest"]'); await settle(pg, 400)
    r = await pg.evaluate("selLayer().rows.map(r => [r.title, r.time, r.rest])")
    assert [x[0] for x in r] == TITLES and r[3][1] == '19:30' and r[1][2] is True and r[0][2] is False, f'行の入力が入らない {r}'
    # 描画：帯の色が出る（月＝黄、火＝おやすみの赤、土＝青）。dims（選択枠・当たり判定用）が入る
    await settle(pg, 6000)   # この環境ではフォントを読めず、待ち時間が過ぎてから描かれる
    await pg.evaluate("paintPreview(false)")
    mon, tue, sat = [await pg.evaluate(ROWPIX + f"({i})") for i in (0, 1, 5)]
    assert mon[0] > 200 and mon[1] > 150 and mon[2] < 120, f'月曜の帯が黄色くない {mon}'
    assert tue[0] > 200 and tue[1] < 110 and tue[2] < 110, f'おやすみの日の帯が赤くない {tue}'
    assert sat[2] > 160 and sat[0] < 110, f'土曜の帯が青くない {sat}'
    assert await pg.evaluate(f"!!dims.get('{sid}') && hitMenuLayer(selLayer().x, selLayer().y).id === '{sid}'"), '予定表がクリックで掴めない'
    # 行の画像：ドロップした行から入る（選んでいる予定表のときだけ）
    await pg.evaluate("window.mkFile = (c0) => { const c = document.createElement('canvas'); c.width = 160; c.height = 90; const x = c.getContext('2d'); x.fillStyle = c0; x.fillRect(0, 0, 160, 90); return new Promise(r => c.toBlob(b => r(new File([b], 'a.png', {type:'image/png'}))));}")
    pt = await pg.evaluate("""(() => { const L = selLayer(), r = document.querySelector('#tv').getBoundingClientRect(), w = L.bw * L.sc, h = L.bh * L.sc;
      const dx = L.x + w * 0.3, dy = L.y - h / 2 + h / 7 * 2.5; return [r.left + dx / DOC.w * r.width, r.top + dy / DOC.h * r.height]; })()""")
    n = await pg.evaluate("(async ([x, y]) => { const f = [await mkFile('#00ff00'), await mkFile('#0000ff')]; const rest = await schedTakeFiles(f, x, y); return rest.length; })", pt)
    r = await pg.evaluate("selLayer().rows.map(r => !!ASSETS[r.asset])")
    assert n == 0 and r == [False, False, True, True, False, False, False], f'ドロップした行（水曜）から順に入らない {n} {r}'
    await pg.evaluate("selectLayer(null)")
    n = await pg.evaluate("(async ([x, y]) => (await schedTakeFiles([await mkFile('#ff0000')], x, y)).length)", pt)
    assert n == 1, '選んでいない予定表に画像が入った'
    await pg.evaluate(f"selectLayer('{sid}'); syncDoc()"); await settle(pg, 300)
    assert await pg.evaluate("[...document.querySelectorAll('.schThumb img')].length") == 2, 'パネルに画像のサムネが出ない'
    await pg.click('[data-sclr="3"]'); await settle(pg, 200)
    assert await pg.evaluate("selLayer().rows[3].asset") is None, '×で画像を外せない'
    assert await pg.evaluate("usedAssets().has(selLayer().rows[2].asset)"), '使っている画像の一覧（保存・掃除）に行の画像が入っていない'
    # テキストでまとめて入力：日付・曜日・時刻・おやすみ・続きの行。この週に無い日付は使わない
    await pg.evaluate("document.querySelector('.schBulk').open = true")
    await pg.fill('#schBulkText', '10/12 20:00 マリカ\n10/13 おやすみ\n水 21時 コラボ配信\n24時間耐久\n10/20 来週の分\n日曜 雑談')
    await pg.click('#schBulkGo'); await settle(pg, 300)
    r = await pg.evaluate("selLayer().rows.map(r => [r.time, r.title, r.rest])")
    # 水曜の 21時 は「いつもの時刻」（21:00）と同じなので、空（＝いつもの時刻に従う）で入る
    assert r[0] == ['20:00', 'マリカ', False] and r[1][2] is True and r[2] == ['', 'コラボ配信', False], f'まとめて入力（日付・時刻・おやすみ）が違う {r}'
    assert r[3][1] == '24時間耐久' and r[3][0] == '19:30' and r[6][1] == '雑談' and r[4][1] == '恐怖夜話 第二夜', f'まとめて入力（続きの行・書かない日はそのまま）が違う {r}'
    assert await pg.evaluate("!!ASSETS[selLayer().rows[2].asset]"), 'まとめて入力で画像が消えた'
    # 前後の週（中身はそのまま）／来週分を作る（中身を空に）。取り消しで戻る
    await pg.click('[data-sweek="1"]'); await settle(pg, 200)
    assert await pg.evaluate("[document.querySelector('.schDay').textContent, selLayer().rows[0].title]") == ['10/19(月)', 'マリカ']
    await pg.click('[data-sweek="-1"]'); await settle(pg, 200)
    await pg.evaluate("pushHist()")   # 履歴は 450ms 以内の変更を1つにまとめるので、ここまでを1段として積んでおく
    await pg.click('[data-snext]'); await settle(pg, 700)
    r = await pg.evaluate("[document.querySelector('.schDay').textContent, selLayer().rows.every(r => !r.title && !r.time && !r.asset && !r.rest), selLayer().time]")
    assert r == ['10/19(月)', True, '21:00'], f'来週分を作るの結果が違う {r}'
    await pg.keyboard.press('Control+z'); await settle(pg, 700)
    assert await pg.evaluate("(L => L && L.rows[0].title === 'マリカ' && L.start <= '2026-10-18')(DOC.layers.find(l => l.type === 'sched'))"), '来週分を作るを取り消しで戻せない'
    # 保存と読み込み（プロジェクトの JSON をそのまま normalizeDoc に通す）で、中身・設定が変わらない
    await pg.evaluate(f"selectLayer('{sid}'); Object.assign(selLayer(), {{band:'tape', bandColor:'one', bandC:'#123456', gap:0.3, img:false, fmt:'en', paren:'none'}}); docChanged(false)")
    r = await pg.evaluate("(() => { const a = JSON.parse(JSON.stringify(DOC.layers.find(l => l.type === 'sched'))), b = normalizeDoc(JSON.parse(JSON.stringify(DOC))).layers.find(l => l.type === 'sched'); return JSON.stringify(a) === JSON.stringify(b); })()")
    assert r, '保存して読み込むと予定表の中身・設定が変わる'
    # 細工した保存データ：不正な値は既定値・範囲内に、画像の参照は安全な id だけ。描画が止まらない
    evil = {'type': 'sched', 'id': 'evil1', 'band': '<x>', 'bandColor': {'a': 1}, 'bandC': 'red"><img src=x onerror=alert(1)>', 'restC': 5, 'gap': 1e9, 'fmt': 'x', 'start': '"><b>',
            'rows': [{'title': '<img src=x onerror="window.__pwn=1">' * 3, 'time': 12345, 'asset': '__proto__', 'rest': 'yes'}, None, 'x'] + [{}] * 10,
            'dstyle': 'bad', 'tstyle': {'font': 'Noto Sans JP'}, 'restText': ['a']}
    await pg.evaluate("window.__pwn = 0")
    r = await pg.evaluate("e => { const d = JSON.parse(JSON.stringify(DOC)); d.layers.push(e); DOC = normalizeDoc(d); const L = DOC.layers.find(l => l.id === 'evil1'); selectLayer(L.id); syncDoc(); paintPreview(false); return [L.band, L.bandColor, L.bandC, L.restC, L.gap, L.fmt, L.start, L.rows.length, L.rows[0].title.length <= 60, L.rows[0].time, L.rows[0].asset, L.rows[0].rest, L.dstyle, typeof L.tstyle, L.restText]; }", evil)
    assert r == ['brush', 'rainbow', '#f5c33b', '#e8453c', 0.6, 'ja1', '', 7, True, '', None, False, None, 'object', 'おやすみ'], f'細工した保存データがそろわない {r}'
    await settle(pg, 400)
    assert await pg.evaluate("window.__pwn") == 0 and await pg.evaluate("document.querySelectorAll('[onerror]').length") == 0, '予定表のタイトルからスクリプトが動いた'
    # 複製は別のデータになる（片方を変えても、もう片方は変わらない）。削除できる
    await pg.evaluate("layerAction(DOC.sel, 'dup')"); await settle(pg, 300)
    r = await pg.evaluate("(() => { const s = DOC.layers.filter(l => l.type === 'sched' && l.id !== 'evil1' && l.id !== '%s'); if(!s.length) return 'nodup'; s[0].rows[0].title = 'X'; return DOC.layers.find(l => l.id === 'evil1').rows[0].title !== 'X'; })()" % sid)
    assert r is True, f'複製が元とデータを共有している {r}'
    await pg.evaluate("removeLayers(['evil1'])"); await settle(pg, 300)
    assert not await pg.evaluate("DOC.layers.some(l => l.id === 'evil1')"), '予定表を削除できない'
    await close(pg)
    return '追加・描画・行の入力・画像・まとめて入力・週の移動・来週分・保存・細工データ・複製と削除'
