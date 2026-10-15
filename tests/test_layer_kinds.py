"""レイヤーの種類の登録表：全種類が登録され、どの種類でも名前・説明・サムネ・メニュー・画像・フォント・サイズ変更・描画・保存データの読み込みが動く。二重登録・必須項目の欠けは例外、未知の種類は画像扱い、書き出しも全種類のフォントを待つ"""
from helpers import *

# 各種類のレイヤーを 1 枚ずつ作り、登録された振る舞いを全部呼ぶ。結果を返して Python 側で確かめる
CHECK = r"""(async () => {
  const mk1 = {
    text: () => mkTextLayer(merged({text:'あいう'}), 500, 300, 1),
    image: () => normalizeLayer({id:'Ikind', type:'image', asset:'kindA', x:900, y:500, sc:0.5}),
    collage: () => { const L = Object.assign(COLLAGE_BASE(), {id:'Ckind', n:3}); L.cells[0].asset = 'kindA'; return normalizeLayer(L); },
    sched: () => { const L = Object.assign(SCHED_BASE(), {id:'Skind', start:'2026-10-12'}); L.rows[1].asset = 'kindA'; return normalizeLayer(L); },
    fx: () => Object.assign(mkFx('lines'), {id:'Fkind'}),
    group: () => Object.assign(LAYER_BASE(), GROUP_BASE(), {id:'Gkind'}),
  };
  const out = {kinds: Object.keys(LAYER_KINDS).sort(), each: {}};
  DOC.layers = Object.values(mk1).map(f => f());
  DOC.layers.find(l => l.id === 'Ikind').gid = 'Gkind';   // グループに中身を入れる（空のグループは名前・説明の数が 0 になる）
  for(const L of DOC.layers){
    const K = kindOf(L), c = mk(400, 300), x = c.getContext('2d');
    K.draw(x, L, 0.2, false, new Map());
    const before = {sc: L.sc, bw: L.bw, bh: L.bh};
    K.resize(L, 2, 1.5, 1.5);
    out.each[L.type] = {
      same: K === LAYER_KINDS[L.type], name: layerName(L), sub: layerSubText(L), thumb: K.thumb(L), menu: K.menu(L).length,
      assets: K.assets(L).filter(Boolean), fonts: typeof (await K.fonts(L)), keep: K.keep(L), before, after: {sc: L.sc, bw: L.bw, bh: L.bh},
      drawn: dims.has(L.id),
      // 保存データとして読み直しても同じ種類・同じ id のまま（normalize が種類を変えない）
      renorm: (n => n.type + ':' + n.id)(normalizeLayer(JSON.parse(JSON.stringify(L)))),
    };
  }
  // 未知の種類は画像として扱う／辞書の名前（toString など）でも落ちない
  out.unknown = [kindOf({type:'future'}) === LAYER_KINDS.image, kindOf({type:'toString'}) === LAYER_KINDS.image, kindOf(null) === LAYER_KINDS.image];
  // 二重登録・必須項目の欠けは例外
  const err = f => { try{ f(); return 'なし'; }catch(e){ return e.message; } };
  out.dup = err(() => defineLayerKind('text', LAYER_KINDS.text));
  out.missing = err(() => defineLayerKind('kind_test_missing', {normalize: L => L, draw: () => {}, name: () => ''}));
  out.leaked = hasKey(LAYER_KINDS, 'kind_test_missing');
  // 書き出し（thumbBlob）も、プレビューと同じく全種類のフォントを待つ（以前は週間予定表のフォントを待っていなかった）
  const called = [];
  const keep = {t: ensureFont, c: ensureCollageFonts, s: ensureSchedFonts};
  ensureFont = async st => { called.push('text'); };
  ensureCollageFonts = async L => { called.push('collage'); };
  ensureSchedFonts = async L => { called.push('sched'); };
  try{ await thumbBlob('png'); } finally { ensureFont = keep.t; ensureCollageFonts = keep.c; ensureSchedFonts = keep.s; }
  out.exportFonts = [...new Set(called)].sort();
  return out;
})()"""

async def run(p):
    pg = await open_app(p)
    await pg.set_input_files('#imgfile', [IMG['night.jpg']]); await settle(pg, 1200)
    # 画像アセットを決まった id でも登録しておく（kindA）
    await pg.evaluate("(() => { const A = Object.values(ASSETS)[0]; return addAsset(A.src, 'kindA', 'kindA', true); })()")
    r = await pg.evaluate(CHECK)
    want = ['collage', 'fx', 'group', 'image', 'sched', 'text']
    assert r['kinds'] == want, f"登録されている種類が違う：{r['kinds']}"
    e = r['each']
    for t in want:
        x = e[t]
        assert x['same'], f'{t}：kindOf が登録した種類を返さない'
        assert x['name'] and isinstance(x['name'], str), f'{t}：名前が空 {x}'
        assert x['sub'] and isinstance(x['sub'], str), f'{t}：パネルの説明が空 {x}'
        assert x['keep'] is True, f'{t}：ふつうのレイヤーが読み込み時に捨てられる'
        assert x['drawn'], f'{t}：描いても大きさ（dims）が記録されない'
        assert x['renorm'] == f"{t}:{x['renorm'].split(':')[1]}", f'{t}：読み直すと種類が変わる {x["renorm"]}'
    # 種類ごとの中身
    assert e['text']['name'] == 'あいう' and e['text']['sub'] == '文字' and e['text']['menu'] == 1 and e['text']['thumb'] is None, e['text']
    assert e['image']['menu'] == 3 and (e['image']['thumb'] or '').startswith('<img') and e['image']['assets'] == ['kindA'] and e['image']['sub'] == '画像', e['image']
    assert e['collage']['assets'] == ['kindA'] and e['collage']['name'] == '分割フレーム（3分割）' and e['collage']['sub'] == '1 / 3 枚', e['collage']
    assert e['sched']['assets'] == ['kindA'] and e['sched']['name'] == '週間予定表' and e['sched']['sub'] == '10/12〜10/18', e['sched']
    assert 'fxth' in (e['fx']['thumb'] or '') and e['fx']['sub'] == '動的エフェクト', e['fx']
    assert 'grpth' in (e['group']['thumb'] or '') and e['group']['name'] == 'グループ（1個）', e['group']
    # キャンバスのサイズ変更：既定は sc を s 倍、分割フレームは bw/bh を縦横別々（sc はそのまま）、集中線はそのまま
    assert e['text']['after']['sc'] == round(e['text']['before']['sc'] * 1.5, 3), e['text']
    c = e['collage']; assert c['after']['sc'] == c['before']['sc'] and c['after']['bw'] == round(c['before']['bw'] * 2) and c['after']['bh'] == round(c['before']['bh'] * 1.5), c
    assert e['fx']['after']['sc'] == e['fx']['before']['sc'], f"集中線の大きさがキャンバスに合わせて変わった {e['fx']}"
    assert r['unknown'] == [True, True, True], f"未知の種類が画像扱いにならない {r['unknown']}"
    assert '二重' in r['dup'], f"二重登録が例外にならない：{r['dup']}"
    assert 'sub' in r['missing'] and not r['leaked'], f"必須項目の欠けが例外にならない：{r['missing']} {r['leaked']}"
    assert r['exportFonts'] == ['collage', 'sched', 'text'], f"書き出しで待つフォントの種類が足りない {r['exportFonts']}"
    await close(pg)
    return f"{len(want)} 種類"
