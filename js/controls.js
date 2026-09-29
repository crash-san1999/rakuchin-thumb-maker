/* 楽ちんサムネメーカー：文字の操作パネル生成 */
/* ============ 操作パネル生成 ============ */
const TEXT_ROWS = [
  {r:'size', l:'サイズ', min:40, max:400, step:1},
  {r:'ls', l:'字間', min:-40, max:80, step:1},
  {r:'lh', l:'行間', min:0.6, max:2, step:0.01},
  {seg:'align', l:'揃え', opts:[['left','左'],['center','中央'],['right','右']]},
];
const SECTIONS = [
  {t:'文字の塗り', rows:[
    {seg:'fillType', l:'種類', opts:[['solid','単色'],['grad','グラデ'],['split','2色分割'],['metal','金属']]},
    {sel:'metal', l:'金属', show:'fillType=metal', opts:[['gold','ゴールド'],['silver','シルバー'],['chrome','クローム（映り込み）'],['copper','カッパー（銅）'],['rosegold','ローズゴールド'],['bluesteel','ブルースチール'],['gunmetal','ガンメタル'],['holo','ホログラム']]},
    {c:'fill1', l:'色1', show:'fillType=solid|grad|split'}, {c:'fill2', l:'色2', show:'fillType=grad|split'},
    {chk:'fill3on', l:'中間色を使う', show:'fillType=grad'}, {c:'fill3', l:'中間色', show:'fillType=grad'},
    {r:'gradAngle', l:'角度', min:0, max:360, step:1, show:'fillType=grad'},
    {seg:'gradScope', l:'範囲', show:'fillType=grad', opts:[['block','全体で1つ'],['line','行ごと']]},
    {seg:'splitDir', l:'分け方', show:'fillType=split', opts:[['h','上下'],['v','左右']]},
    {r:'splitPos', l:'境目', min:0.05, max:0.95, step:0.01, show:'fillType=split'},
    {seg:'fillMode', l:'中身', opts:[['normal','通常'],['hollow','中抜き'],['knock','くり抜き']]},
  ]},
  {t:'強調色', hint:'{ } で囲んだ部分', rows:[{c:'accent1', l:'色1'}, {c:'accent2', l:'色2'}]},
  {t:'傍点', on:'dots.on', hint:'強調部分の上に点', rows:[
    {sel:'dots.shape', l:'形', opts:[['dot','●'],['ring','○'],['tri','▼']]}, {c:'dots.c', l:'色'},
    {r:'dots.size', l:'大きさ', min:0.05, max:0.35, step:0.01},
  ]},
  {t:'フチ', hint:'内側→外側の順に重なります', strokes:true},
  {t:'ベベル（光沢・立体感）', on:'bevel.on', rows:[
    {seg:'bevel.style', l:'種類', opts:[['emboss','浮き出し'],['deboss','彫り込み']]},
    {sel:'bevel.target', l:'対象', opts:[['fill','文字のみ'],['both','文字とフチ']]},
    {r:'bevel.size', l:'幅', min:1, max:30, step:0.5}, {r:'bevel.depth', l:'深さ', min:0.1, max:3, step:0.05},
    {r:'bevel.angle', l:'光の向き', min:0, max:360, step:1},
    {r:'bevel.hl', l:'ハイライト', min:0, max:1, step:0.01}, {r:'bevel.sh', l:'陰', min:0, max:1, step:0.01},
  ]},
  {t:'インナーシャドウ', on:'inner.on', hint:'文字の内側に落ちる影', rows:[
    {r:'inner.x', l:'X', min:-30, max:30, step:1}, {r:'inner.y', l:'Y', min:-30, max:30, step:1},
    {r:'inner.blur', l:'ぼかし', min:0, max:40, step:1}, {c:'inner.c', l:'色'}, {r:'inner.a', l:'濃さ', min:0, max:1, step:0.01},
  ]},
  {t:'テカリ（アニメ風ハイライト）', on:'gloss.on', rows:[
    {r:'gloss.a', l:'濃さ', min:0, max:1, step:0.01}, {r:'gloss.h', l:'範囲', min:0.1, max:0.9, step:0.01},
    {r:'gloss.curve', l:'カーブ', min:-1, max:1, step:0.01},
  ]},
  {t:'模様', on:'pattern.on', hint:'文字の中だけに入ります', rows:[
    {sel:'pattern.type', l:'種類', opts:[['stripe','ストライプ'],['dot','ドット'],['check','チェック'],['grid','格子'],['noise','ノイズ（ザラザラ）'],['glitter','グリッター（ラメ）'],['halftone','ハーフトーン（網点）'],['cutlines','ラインカット（80年代）']]},
    {c:'pattern.c', l:'色'}, {r:'pattern.a', l:'濃さ', min:0, max:1, step:0.01},
    {r:'pattern.size', l:'大きさ', min:3, max:60, step:1}, {r:'pattern.angle', l:'角度', min:0, max:180, step:1},
  ]},
  {t:'背景シェイプ', on:'plate.on', hint:'文字全体の後ろに図形', rows:[
    {sel:'plate.shape', l:'形', opts:[['round','角丸'],['ellipse','楕円'],['burst','ギザギザ（爆発）'],['bubble','吹き出し'],['para','斜め帯']]},
    {seg:'plate.tail', l:'しっぽ', show:'plate.shape=bubble', opts:[['left','左'],['right','右']]},
    {seed:'plate.seed', l:'ギザギザ', show:'plate.shape=burst'},
    {c:'plate.c', l:'塗り'}, {r:'plate.a', l:'濃さ', min:0, max:1, step:0.01},
    {c:'plate.sc', l:'枠線'}, {r:'plate.sw', l:'枠の太さ', min:0, max:30, step:0.5},
    {r:'plate.pad', l:'余白', min:0, max:1, step:0.01},
  ]},
  {t:'一文字囲み', on:'box.on', hint:'1文字ずつ図形で囲む', rows:[
    {sel:'box.shape', l:'形', opts:[['square','四角'],['round','角丸'],['circle','丸'],['diamond','ひし形']]},
    {c:'box.c', l:'色'}, {chk:'box.rand', l:'ランダム配色（脅迫状風）'}, {chk:'box.alt', l:'交互に色を変える'}, {c:'box.c2', l:'交互色', show:'box.alt=true'},
    {r:'box.pad', l:'大きさ', min:-0.2, max:0.4, step:0.01},
    {c:'box.sc', l:'枠線'}, {r:'box.sw', l:'枠の太さ', min:0, max:20, step:0.5},
  ]},
  {t:'マーカー（帯）', on:'marker.on', hint:'蛍光ペン風に文字の後ろへ', rows:[
    {c:'marker.c', l:'色'}, {r:'marker.a', l:'濃さ', min:0, max:1, step:0.01},
    {r:'marker.h', l:'太さ', min:0.1, max:1.2, step:0.01}, {r:'marker.pos', l:'位置', min:0, max:1, step:0.01},
    {r:'marker.over', l:'はみ出し', min:0, max:1, step:0.01},
  ]},
  {t:'板ずれ（ずらし影）', on:'offset.on', hint:'ベタ色の影をずらす', rows:[
    {r:'offset.x', l:'X', min:-60, max:60, step:1}, {r:'offset.y', l:'Y', min:-60, max:60, step:1}, {c:'offset.c', l:'色'},
    {chk:'offset.hollow', l:'線だけにする（中抜き）'}, {r:'offset.w', l:'線の太さ', min:1, max:20, step:0.5, show:'offset.hollow=true'},
  ]},
  {t:'立体（押し出し）', on:'extrude.on', rows:[
    {r:'extrude.depth', l:'厚み', min:1, max:40, step:0.5}, {r:'extrude.angle', l:'方向', min:0, max:360, step:1},
    {c:'extrude.c', l:'色'}, {r:'extrude.shade', l:'奥の暗さ', min:0, max:1, step:0.01},
    {r:'extrude.fade', l:'奥を透明に', min:0, max:1, step:0.01},
    {chk:'extrude.stripe', l:'ストライプにする'}, {c:'extrude.c2', l:'縞の色', show:'extrude.stripe=true'},
    {r:'extrude.stripeW', l:'縞の幅', min:0.5, max:10, step:0.5, show:'extrude.stripe=true'},
  ]},
  {t:'ドロップシャドウ', on:'shadow.on', rows:[
    {r:'shadow.x', l:'X', min:-60, max:60, step:1}, {r:'shadow.y', l:'Y', min:-60, max:60, step:1},
    {r:'shadow.blur', l:'ぼかし', min:0, max:80, step:1}, {c:'shadow.c', l:'色'}, {r:'shadow.a', l:'濃さ', min:0, max:1, step:0.01},
  ]},
  {t:'光彩（グロー・ネオン）', on:'glow.on', rows:[
    {r:'glow.blur', l:'広がり', min:0, max:100, step:1}, {c:'glow.c', l:'色'},
    {r:'glow.a', l:'濃さ', min:0, max:1, step:0.01}, {r:'glow.str', l:'重ね', min:1, max:4, step:1},
    {chk:'glow.dual', l:'2色ネオンにする（外側の色）'}, {c:'glow.c2', l:'外側', show:'glow.dual=true'},
  ]},
  {t:'鏡面反射', on:'reflect.on', hint:'床に映り込み', rows:[
    {r:'reflect.a', l:'濃さ', min:0, max:1, step:0.01}, {r:'reflect.gap', l:'すき間', min:-20, max:60, step:1},
    {r:'reflect.len', l:'長さ', min:0.1, max:1, step:0.01},
  ]},
  {t:'ワープ変形', rows:[
    {sel:'warp.type', l:'形', opts:[['none','なし'],['arch','アーチ'],['wave','旗（波）'],['bulge','膨らみ'],['persp','遠近（左右）'],['rise','上昇'],['trap','台形']]},
    {r:'warp.amt', l:'強さ', min:-1, max:1, step:0.01, show:'warp.type=arch|wave|bulge|persp|rise|trap'},
    {r:'warp.freq', l:'波の数', min:0.5, max:3, step:0.05, show:'warp.type=wave'},
  ]},
  {t:'文字ゆらぎ', on:'jitter.on', hint:'1文字ずつランダムに', rows:[
    {r:'jitter.rot', l:'回転', min:0, max:30, step:0.5}, {r:'jitter.y', l:'上下', min:0, max:60, step:1},
    {r:'jitter.scale', l:'大小', min:0, max:0.4, step:0.01}, {seed:'jitter.seed', l:'ランダム'},
  ]},
  {t:'かすれ（グランジ）', on:'grunge.on', rows:[
    {r:'grunge.amt', l:'量', min:0, max:1, step:0.01}, {r:'grunge.size', l:'粒の大きさ', min:1, max:12, step:0.5},
    {seed:'grunge.seed', l:'ランダム'},
  ]},
  {t:'グリッチ', on:'glitch.on', rows:[
    {r:'glitch.rgb', l:'色ずれ', min:0, max:30, step:0.5}, {r:'glitch.slices', l:'切れ目', min:0, max:20, step:1},
    {r:'glitch.shift', l:'ずれ幅', min:0, max:80, step:1}, {seed:'glitch.seed', l:'ランダム'},
  ]},
  {t:'炎', on:'fire.on', hint:'文字から立ちのぼる炎', rows:[
    {r:'fire.height', l:'高さ', min:0.2, max:2.5, step:0.05}, {r:'fire.wild', l:'揺らぎ', min:0, max:1.5, step:0.01},
    {c:'fire.c1', l:'芯の色'}, {c:'fire.c2', l:'中の色'}, {c:'fire.c3', l:'先の色'}, {seed:'fire.seed', l:'ランダム'},
  ]},
  {t:'ドリップ', on:'drip.on', hint:'下に垂れる（とろ〜り／つらら）', rows:[
    {seg:'drip.style', l:'形', opts:[['round','とろ〜り'],['icicle','つらら']]},
    {r:'drip.amt', l:'量', min:0, max:1, step:0.01}, {r:'drip.len', l:'長さ', min:0.1, max:1.5, step:0.01},
    {r:'drip.w', l:'太さ', min:0.04, max:0.3, step:0.005},
    {chk:'drip.sample', l:'文字の色をそのまま使う'}, {c:'drip.c', l:'色', show:'drip.sample=false'}, {seed:'drip.seed', l:'ランダム'},
  ]},
  {t:'電球（マーキー）', on:'bulbs.on', hint:'看板の電飾風', rows:[
    {r:'bulbs.gap', l:'間隔', min:0.06, max:0.5, step:0.01}, {r:'bulbs.size', l:'大きさ', min:0.01, max:0.1, step:0.002},
    {c:'bulbs.c', l:'色'}, {r:'bulbs.glow', l:'光', min:0, max:1, step:0.01},
  ]},
  {t:'キラキラ', on:'sparkle.on', hint:'星のきらめきを散らす', rows:[
    {r:'sparkle.count', l:'数', min:0, max:60, step:1}, {r:'sparkle.size', l:'大きさ', min:0.05, max:0.6, step:0.01},
    {c:'sparkle.c', l:'色'}, {chk:'sparkle.glow', l:'光らせる'}, {seed:'sparkle.seed', l:'ランダム'},
  ]},
  {t:'ゆがみ', on:'distort.on', hint:'ノイズで輪郭をぐにゃっと', rows:[
    {r:'distort.amt', l:'強さ', min:0, max:40, step:0.5}, {r:'distort.scale', l:'細かさ', min:5, max:200, step:1},
    {seed:'distort.seed', l:'ランダム'},
  ]},
  {t:'残像', on:'trail.on', hint:'スピード感・モーション', rows:[
    {r:'trail.angle', l:'方向', min:0, max:360, step:1}, {r:'trail.len', l:'長さ', min:0.1, max:3, step:0.05},
    {r:'trail.count', l:'枚数', min:1, max:24, step:1}, {r:'trail.a', l:'濃さ', min:0, max:1, step:0.01},
    {chk:'trail.tint', l:'単色にする'}, {c:'trail.c', l:'色', show:'trail.tint=true'},
  ]},
  {t:'傾き・回転', rows:[{r:'skew', l:'斜体', min:-30, max:30, step:1}, {r:'rotate', l:'回転', min:-45, max:45, step:1}]},
];
// 文字スタイル（S）用の入力欄のつなぎ込み
const getK = k => k.split('.').reduce((o, p) => o?.[p], S);
function setK(k, v){ const ps = k.split('.'); const last = ps.pop(); ps.reduce((o, p) => o[p], S)[last] = v; }
const KB = makeBinder({val:'k', seg:'seg', show:'show', reroll:'reroll', get:getK,
  onInput(k, v, el){
    resetAdj(); setK(k, v); syncUI(el);
    if(k === 'text'){ clearTimeout(KB.st); KB.st = setTimeout(() => document.querySelectorAll('.fi .fs').forEach(x => x.textContent = sampleText()), 300); }
    schedule();
  },
  onSeg(k, v){ setK(k, v); syncUI(); schedule(); },
  onReroll(k){ setK(k, Math.floor(Math.random() * 1e6)); schedule(); },
});
const rowHTML = r => KB.row(r, true);
function strokeHTML(i){
  return `<div class="stroke-row"><label class="chk"><input type="checkbox" data-k="strokes.${i}.on"> フチ${i+1}</label>
    <input type="range" data-k="strokes.${i}.w" min="0" max="40" step="0.5"><input type="number" class="num" data-k="strokes.${i}.w" min="0" max="40" step="0.5">
    <input type="color" data-k="strokes.${i}.c"></div>`;
}
// 文字パネル（テキストの行・装飾のセクション）を組み立てる
function buildTextControls(){
  $('#textRows').innerHTML = TEXT_ROWS.map(rowHTML).join('');
  $('#genSections').innerHTML = SECTIONS.map(s => `
    <section ${s.on ? `data-on="${s.on}"` : ''}>
      <h3>${s.on ? `<label class="sw"><input type="checkbox" data-k="${s.on}"><span></span></label>` : ''}${s.t}${s.hint ? ` <span class="hint">${s.hint}</span>` : ''}</h3>
      <div class="rows">${s.strokes ? [0,1,2].map(strokeHTML).join('') : s.rows.map(rowHTML).join('')}</div>
    </section>`).join('');
  document.querySelectorAll('#genSections section[data-on]').forEach(sec => { if(!getK(sec.dataset.on)) sec.classList.add('collapsed'); });
}

function syncUI(except){
  KB.sync(except);
  document.querySelectorAll('section[data-on]').forEach(s => s.classList.toggle('off', !getK(s.dataset.on)));
}
document.addEventListener('click', e => {
  const h = e.target.closest('section > h3');
  if(h && !e.target.closest('.sw')) h.parentElement.classList.toggle('collapsed');
});
document.addEventListener('change', e => {
  const sw = e.target.closest('.sw');
  if(sw && e.target.checked) sw.closest('section').classList.remove('collapsed');
});
document.addEventListener('change', e => {
  if(e.target.id === 'weight'){ S.weight = parseFloat(e.target.value); schedule(); }
  if(e.target.id === 'fontLatin') renderFontList();
});
document.addEventListener('click', e => {
  const rb = e.target.closest('[data-rnd]');
  if(rb){ resetAdj(); setK(rb.dataset.rnd, randomLike(getK(rb.dataset.rnd))); syncUI(); schedule(); return; }
  const eb = e.target.closest('[data-eye]');
  if(eb){ new EyeDropper().open().then(r => { resetAdj(); setK(eb.dataset.eye, r.sRGBHex.slice(0, 7).toLowerCase()); syncUI(); schedule(); }).catch(() => {}); return; }
});
$('#pcats').addEventListener('click', e => {
  const b = e.target.closest('[data-pcat]'); if(!b) return;
  pcat = b.dataset.pcat; LS.set('ttm_pcat', pcat); renderPresets();
});
$('#savePreset').onclick = () => {
  const name = prompt('プリセット名', 'マイ設定'); if(!name) return;
  const s = clone(S); delete s.text; delete s.pad; delete s.scale; delete s.size;
  myPresets.push({name: name.slice(0, 12), s}); LS.set('ttm_mypresets', myPresets); renderPresets(); toast('保存しました');
};
// スタイルを初期状態に戻す。サムネ作成では S がレイヤーのスタイルそのものなので、入れ物は替えずに中身を戻す（文字はそのまま）
$('#resetAll').onclick = () => {
  if(!confirm('スタイルを初期状態に戻しますか？（文字はそのまま）')) return;
  const text = S.text; for(const k of Object.keys(S)) delete S[k]; Object.assign(S, clone(DEFAULT), {text});
  resetAdj(); refreshTextUI(); schedule(); if(DOC.mode === 'thumb') docChanged(false);
};

