"""描画キャッシュの整合：どのレイヤーのどの設定を変えても、画面（キャッシュを使い回す）と描き直し（キャッシュなし）が同じ絵になる
（新しい設定を足したのにキャッシュの印に入れ忘れると「設定を変えても画面が変わらない」になる。分割フレームの ttx で実際に起きた）"""
# レイヤーの保存データを再帰的にたどり、数値・真偽・色・選択肢（設定パネルの定義から集める）を1つずつ変えては
# 「paintPreview（キャッシュあり）」と「prevCache を消してから paintPreview」を比べる。項目は自動で集めるので、
# 新しい設定をレイヤーに足すと、このテストが自動的にその設定も確かめる（テストの書き足し忘れも防ぐ）。
from helpers import *
import base64
from pathlib import Path

CHECK = r"""async ([kind]) => {
  const skipKey = new Set(['id', 'gid', 'type', 'asset', 'label', 'name', 'strokes', 'auto', 'hidden', 'locked', 'open', 'text', 'font', 'fontLatin', 'key', 'tpre', 'wk', 'ac', 'msel', 'seed']);
  // 選択肢：設定パネル・文字パネルの seg/sel の定義から、キー（末尾の名前）→ 値の一覧
  const opts = new Map(); const addRows = rows => rows.forEach(r => { const k = r.seg || r.sel; if(k && r.opts) { const key = String(k).replace(/^@/, '').replace(/^cell\./, ''); const vs = r.opts.map(o => o[0]); opts.set(key, vs); opts.set(key.split('.').pop(), vs); } });
  addRows(SEL_ROWS); addRows(BG_ROWS); addRows(TEXT_ROWS); SECTIONS.forEach(s => addRows(s.rows || []));
  opts.set('layout', COLLAGE_LAYOUTS.map(l => l[0]));
  const shot = () => { paintPreview(false); return document.querySelector('#tv').toDataURL(); };
  const leaves = (o, path, out) => { for(const [k, v] of Object.entries(o)){ if(skipKey.has(k)) continue; const p = path ? path + '.' + k : k;
      if(v && typeof v === 'object' && !Array.isArray(v)) leaves(v, p, out); else if(Array.isArray(v)){ if(k === 'cells') [0, 2].forEach(i => v[i] && leaves(v[i], p + '.' + i, out)); /* マスは項目が同じなので、画像のマス（0）と文字だけのマス（2） */ else if(k === 'strokes' || v.length > 12) continue; else v.forEach((x, i) => { if(x && typeof x === 'object') leaves(x, p + '.' + i, out); }); }
      else out.push(p); } return out; };
  const get = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);
  const set = (o, p, v) => { const ks = p.split('.'), last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };
  const next = (p, v) => {
    if(typeof v === 'boolean') return !v;
    if(typeof v === 'number') return v === 0 ? 0.3 : Math.round(v * 1.37 * 1000) / 1000;
    if(typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase() === '#3a7bd5' ? '#d5503a' : '#3a7bd5';
    if(typeof v === 'string'){ const name = p.replace(/^(style|cells\.\d+)\./, ''), vs = opts.get(name) || opts.get(p.split('.').pop()); if(vs){ const alt = vs.filter(x => x !== v && typeof x === typeof v); return alt.length ? alt[Math.floor(alt.length / 2)] : undefined; } }
    return undefined;
  };
  const target = () => kind === 'bg' ? DOC.bg : DOC.layers.find(l => l.id === 'Tgt');
  // 1項目ずつ変えて確かめ、元に戻す（効果を全部重ねると描画が重くなりすぎるため）。その項目と同じ入れ子に on があれば、確かめる間だけオンにする
  //（例：fx.sil.c は fx.sil.on がオンのときだけ見た目に効く）。on そのものは、オンにした状態でも確かめる
  const all = leaves(target(), '', []), bad = [];
  let tried = 0; shot();
  for(const p of all){
    const v = get(target(), p), nv = next(p, v); if(nv === undefined) continue;
    const onP = p.replace(/[^.]+$/, 'on'), hasOn = onP !== p && typeof get(target(), onP) === 'boolean', on0 = hasOn ? get(target(), onP) : null;
    if(hasOn && !on0){ set(target(), onP, true); docChanged(false); shot(); }
    set(target(), p, nv); docChanged(false); tried++;
    let a, b; try{ a = shot(); prevCache.clear(); b = shot(); }catch(e){ bad.push(p + ' 例外:' + e.message); }
    if(a !== b) bad.push(p);
    set(target(), p, v); if(hasOn) set(target(), onP, on0); docChanged(false); shot();
  }
  return {tried, total: all.length, bad};
}"""

SETUP = r"""([kind]) => {
  DOC.layers.forEach(l => l.hidden = true); DOC.bg.hidden = kind !== 'bg';
  const add = L => { DOC.layers.unshift(L); return L; };
  if(kind === 'text') add(Object.assign(mkTextLayer(merged({text:'テスト{強調}ABC'}), 700, 400, 1), {id:'Tgt'}));
  if(kind === 'image'){ const L = add(Object.assign(LAYER_BASE(), IMAGE_BASE(), {id:'Tgt', type:'image', asset:'Acmp', x:900, y:500, sc:1.2})); }
  if(kind === 'collage'){ const L = add(Object.assign(COLLAGE_BASE(), {id:'Tgt', n:7, layout:'rows', x:960, y:540}));
    L.cells[0].asset = 'Acmp'; L.cells[1].asset = 'Acmp2'; L.wk.start = '2026-10-12'; collageFillWeek(L); L.ttx.on = true; }
  if(kind === 'group'){ const I = add(Object.assign(LAYER_BASE(), IMAGE_BASE(), {id:'Gi', type:'image', asset:'Acmp', x:800, y:500, gid:'Tgt'}));
    const T = add(Object.assign(mkTextLayer(merged({text:'中身'}), 1100, 500, 1), {id:'Gt', gid:'Tgt'})); DOC.layers.push(Object.assign(LAYER_BASE(), GROUP_BASE(), {id:'Tgt'})); }
  if(kind.startsWith('fx:')) add(Object.assign(mkFx(kind.slice(3)), {id:'Tgt'}));
  selectLayer(kind === 'bg' ? null : 'Tgt'); docChanged(false); return DOC.layers.length; }"""

async def run(p):
    pg = await open_app(p)
    src = 'data:image/jpeg;base64,' + base64.b64encode(Path(IMG['city.jpg']).read_bytes()).decode()
    await pg.evaluate("src => addAsset(src, 'cmp', 'Acmp', true)", src)
    src2 = 'data:image/jpeg;base64,' + base64.b64encode(Path(IMG['synth.jpg']).read_bytes()).decode()
    await pg.evaluate("src => addAsset(src, 'cmp2', 'Acmp2', true)", src2)
    base = await pg.evaluate("JSON.stringify(DOC)")
    kinds = ['text', 'image', 'collage', 'group', 'bg'] + ['fx:' + k for k in await pg.evaluate("Object.keys(FX_DEF)")]
    report, fails = [], []
    for kind in kinds:
        await pg.evaluate("b => { DOC = normalizeDoc(JSON.parse(b)); prevCache.clear(); }", base)
        await pg.evaluate(SETUP, [kind]); await settle(pg, 300)
        r = await pg.evaluate(CHECK, [kind])
        report.append(f"{kind}:{r['tried']}");
        if r['bad']: fails.append(f"{kind}: {r['bad'][:8]}")
        assert r['tried'] >= min(5, r['total']), f'{kind}: 確かめた設定が少なすぎる {r}'
    assert not fails, '設定を変えても画面が描き直されない（キャッシュの印に入っていない）: ' + ' / '.join(fails)
    assert not pg.errors, f'ページでエラー: {pg.errors[:3]}'
    await close(pg)
    return '確かめた設定の数 ' + ' '.join(report)
