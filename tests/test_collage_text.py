"""分割フレームのマスに背景色・文字を入れる／1週間の日付・曜日を自動で入れる"""
from helpers import *

PIX = """([u, v]) => { prevCache.clear(); const c = mk(480, 270); compose(c.getContext('2d'), 480, 270, false, new Map());
  const d = c.getContext('2d').getImageData(Math.round(u * 480), Math.round(v * 270), 1, 1).data; return [d[0], d[1], d[2], d[3]]; }"""
HASH = """() => { prevCache.clear(); const c = mk(480, 270); compose(c.getContext('2d'), 480, 270, false, new Map()); const d = c.getContext('2d').getImageData(0, 0, 480, 270).data;
  let h = 0; for(let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) % 1e9; return h; }"""

async def run(p):
    pg = await open_app(p)
    # 1) 週の計算：選んだ日を含む週。週の始まりは月／日で変わる。表示のしかた
    r = await pg.evaluate("""(() => { const f = (s, first) => weekDates(s, first).map(d => d.getMonth() + 1 + '/' + d.getDate());
      const d = weekDates('2026-10-07', 'mon')[0]; // 2026-10-07 は水曜日
      return {mon: f('2026-10-07', 'mon'), sun: f('2026-10-07', 'sun'), onMon: f('2026-10-05', 'mon')[0], onSun: f('2026-10-04', 'mon')[0], year: f('2026-12-30', 'mon'),
        both: weekLabel(d, {show:'both', fmt:'ja1'}), date: weekLabel(d, {show:'date', fmt:'ja1'}), wd3: weekLabel(d, {show:'wd', fmt:'ja3'}), en: weekLabel(d, {show:'wd', fmt:'en'})}; })()""")
    assert r['mon'] == ['10/5', '10/6', '10/7', '10/8', '10/9', '10/10', '10/11'], r['mon']
    assert r['sun'][0] == '10/4' and r['sun'][6] == '10/10', r['sun']
    assert r['onMon'] == '10/5' and r['onSun'] == '9/28', (r['onMon'], r['onSun'])   # 日曜は、月曜始まりの前の週の最後
    assert r['year'] == ['12/28', '12/29', '12/30', '12/31', '1/1', '1/2', '1/3'], r['year']   # 年またぎ
    assert r['both'] == '10/5\n月' and r['date'] == '10/5' and r['wd3'] == '月曜日' and r['en'] == 'MON', r
    # 2) 画面から：7分割にして、日付を選んで「1週間を入れる」
    await pg.evaluate("DOC.layers = DOC.layers.filter(l => l.type !== 'text'); docChanged(false)")
    await pg.evaluate("addCollage()"); await pg.wait_for_timeout(400)
    await pg.evaluate("(() => { const L = selLayer(); Object.assign(L, {n:'7', layout:'wk43', lw:0, bstyle:'none', edge:'straight'}); syncDoc(); docChanged(false); })()")
    await page(pg, 'lay-ctext'); await settle(pg, 300)
    await pg.fill('#wkStart', '2026-10-07'); await pg.dispatch_event('#wkStart', 'change')
    await pg.click('#wkGo'); await settle(pg, 1500)
    cells = await pg.evaluate("selLayer().cells.slice(0, 7).map(c => [c.tx.on, c.tx.text, c.bg.on, c.bg.c])")
    assert [c[1] for c in cells] == ['10/5\n月', '10/6\n火', '10/7\n水', '10/8\n木', '10/9\n金', '10/10\n土', '10/11\n日'], cells
    assert all(c[0] and c[2] for c in cells), '文字・背景色がオンになっていない'
    assert cells[5][3] != cells[0][3] != cells[6][3] and cells[5][3] != cells[6][3], '土日が色分けされていない'
    assert await pg.evaluate("selLayer().tstyle !== null"), '文字スタイルが入っていない'
    # 3) 見た目：背景色（土＝青系、日＝赤系）。マスの左上の隅を見る
    await settle(pg, 6000)
    sat = await pg.evaluate(PIX, [0.338, 0.505])   # 下の段の2番目（土）の左上の隅（文字のない所）
    sun = await pg.evaluate(PIX, [0.672, 0.505])   # 3番目（日）の左上の隅
    assert sat[2] > sat[0], f'土曜が青系でない {sat}'
    assert sun[0] > sun[2] or sun[0] > 240, f'日曜が赤系でない {sun}'
    # 4) 画像なしでも書き出しでは灰色の空きマスの絵が出ず、背景色が出る
    ex = await pg.evaluate("(() => { exporting = true; try{ prevCache.clear(); const c = mk(480, 270); compose(c.getContext('2d'), 480, 270, false, new Map()); return Array.from(c.getContext('2d').getImageData(4, 4, 1, 1).data); } finally { exporting = false; } })()")
    assert ex[3] == 255 and abs(ex[0] - 255) < 6, f'書き出しで背景色が出ない {ex}'
    # 5) 文字を直す・スタイルを変える・位置・大きさ
    await pg.click('[data-pg="ctext"] [data-cell="2"]'); await settle(pg, 300)
    await pg.fill('#ctText', '会議\nお休み'); await settle(pg, 300)
    assert await pg.evaluate("selLayer().cells[2].tx.text") == '会議\nお休み', '文字が書き換わらない'
    h1 = await pg.evaluate(HASH)
    await pg.select_option('#ctPre', '激辛'); await settle(pg, 800)
    assert await pg.evaluate("selLayer().tpre") == '激辛' and await pg.evaluate(HASH) != h1, 'スタイルが変わらない'
    h2 = await pg.evaluate(HASH)
    await pg.evaluate("(() => { const c = selLayer().cells[2]; c.tx.pos = 'b'; c.tx.sc = 0.5; syncDoc(); docChanged(false); })()"); await settle(pg, 800)
    assert await pg.evaluate(HASH) != h2, '位置・大きさが効かない'
    # 6) 画像の上に文字だけ重ねる（背景色なし）
    await pg.click('[data-pg="ctext"] [data-cell="0"]')
    await pg.evaluate("(() => { const c = selLayer().cells[0]; c.bg.on = false; syncDoc(); docChanged(false); })()")
    await pg.set_input_files('#cellfile', [IMG['city.jpg']]); await settle(pg, 2500)
    assert await pg.evaluate("ASSETS[selLayer().cells[0].asset] != null && cellHasText(selLayer().cells[0])")
    a = await pg.evaluate(HASH)
    await pg.evaluate("(() => { selLayer().cells[0].tx.on = false; syncDoc(); docChanged(false); })()"); await settle(pg, 500)
    assert await pg.evaluate(HASH) != a, '画像の上の文字が描かれていない'
    # 7) 色分けなしで入れる／8分割は最後のマスがメモ／5分割は5日ぶん
    await pg.evaluate("(() => { const L = selLayer(); L.n = '8'; L.layout = 'wk53'; L.wk.color = false; L.cells.forEach(c => { c.bg.on = false; c.tx.on = false; c.tx.text = ''; }); collageFillWeek(L); })()")
    r = await pg.evaluate("(() => { const L = selLayer(); return [L.cells[7].tx.text, L.cells[7].tx.on, L.cells.slice(0, 7).every(c => !c.bg.on)]; })()")
    assert r == ['MEMO', True, True], r
    await pg.evaluate("(() => { const L = selLayer(); L.n = '5'; L.layout = 'cols'; L.cells.forEach(c => { c.tx.on = false; c.tx.text = ''; }); collageFillWeek(L); })()")
    assert await pg.evaluate("selLayer().cells.map(c => c.tx.text).filter(Boolean).length") == 5, '5分割なら5日ぶん'
    # 8) 古い保存データ（背景色・文字の項目がない）を読み込める。保存して読み直しても残る
    r = await pg.evaluate("""(() => { const L = JSON.parse(JSON.stringify(selLayer())); L.cells.forEach(c => { delete c.bg; delete c.tx; }); delete L.wk; delete L.tstyle;
      const d = normalizeDoc({layers:[L]}); const C = d.layers.find(l => l.type === 'collage'); return [C.cells[0].bg.on, C.cells[0].tx.text, C.wk.first, C.tstyle]; })()""")
    assert r == [False, '', 'mon', None], r
    r = await pg.evaluate("""(() => { const d = normalizeDoc(JSON.parse(JSON.stringify(DOC))); const C = d.layers.find(l => l.type === 'collage'); return [C.cells[1].tx.text, !!C.tstyle, C.tpre]; })()""")
    assert r[0].startswith('10/') and r[1] is True and r[2] == '激辛', r
    await close(pg)
    return '背景色・文字のマス、1週間の自動入力（週の計算・月／日始まり・年またぎ・7/8/5分割）、画像の上の文字、スタイル変更、古い保存データ'
