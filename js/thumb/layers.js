/* 楽ちんサムネメーカー：レイヤーパネル・レイヤーの選択と操作 */
/*
  役割：レイヤーパネルの描画（renderLayers）、レイヤーの選択・複数選択・重なり順の入れ替え・複製・削除・名前変更・右クリックメニュー。
  主な公開：renderLayers / refreshThumbs / selectLayer / toggleMulti / layerAction(id, act) / removeLayers / placeLayer / movePeer /
           startRename / showMenu・hideMenu / flipLayer
  重なり順の持ち方：DOC.layers は配列の「先頭が最背面、末尾が最前面」。パネルは手前が上なので、表示時に reverse する。
    グループの中身（gid 付き）も DOC.layers に平らに入っていて、パネル上でだけグループの直下に並べる。
    「同じ階層（peers）」＝同じ gid のレイヤー。重なり順の入れ替えは peers の中だけで行う（group.js の peersOf）。
  選択の持ち方：DOC.sel（主選択）と DOC.msel（複数選択。2個以上のときだけ有効で、保存しない）。文字レイヤーを選ぶと
    DOC.textSel と、文字パネルのスタイル S（その文字レイヤーの style と同じ参照）も切り替わる。
  依存：DOC・docChanged・syncDoc・saveDoc（doc.js）、prevCache（render.js）、groupLayers 等（group.js）、libAddImageSrc・libAddStyle（library.js）、
       setEdit（editmodes.js）。呼び出し元：events.js（パネル・キャンバスの操作）、inspector.js・doc.js（renderLayers）。
*/
// lpSliding：パネル内の不透明度スライダーをつかんでいる間 true。再描画でスライダー自体が作り直されて、ドラッグが途切れるのを防ぐ（renderLayers が先送りする）
let lpSliding = false;
// パネルに並べる順（手前が先）。グループのすぐ下に、中のレイヤーを並べる（閉じていれば出さない）
/** @returns {Layer[]} */
function layerRowsOrder(){
  /** @type {Layer[]} */
  const out = [];
  DOC.layers.filter(l => !l.gid).reverse().forEach(L => { out.push(L); if(isGroup(L) && L.open !== false) groupKids(L).reverse().forEach(k => out.push(k)); });
  return out;
}
// パネルの2行目（種別などの説明）。画像が ASSETS に無いときは「読み込めません」（IndexedDB の復元前・保存失敗のとき）
/** @param {Layer} L */
function layerSubText(L){
  return L.type === 'text' ? '文字' : L.type === 'group' ? `${groupKids(L).length}個のレイヤー${cellFxOn(L.fx) ? ' ・ 効果あり' : ''}` : L.type === 'collage' ? `${L.cells.slice(0, collageN(L)).filter(c => ASSETS[c.asset]).length} / ${collageN(L)} 枚` : L.type === 'fx' ? '動的エフェクト' + (L.auto ? '（ワンクリック）' : '') : (ASSETS[L.asset] ? '画像' : '画像（読み込めません）');
}
// 毎回 innerHTML で作り直す。行のサムネは <canvas data-th> で、描き終わったあと refreshThumbs が prevCache の絵を縮小して入れる。
// 背景の行は固定（並べ替え・選択の対象外）で、data-th='__bg' のサムネは背景キャッシュを使う
function renderLayers(){
  const box = $('#layerList'); if(!box) return;
  if(lpSliding){ clearTimeout(renderLayers.t); renderLayers.t = setTimeout(renderLayers, 300); return; }
  const arr = layerRowsOrder(), ms = new Set(DOC.msel || []);
  const nLay = DOC.layers.filter(l => !isGroup(l)).length;
  $('#lpCount').textContent = nLay ? `${nLay}枚` : '';
  const rows = arr.map(L => {
    const sub = layerSubText(L);
    const mode = L.blend && L.blend !== 'source-over' ? ' ・ ' + (BLEND_NAMES[L.blend] || L.blend) : '';
    const th = L.type === 'group' ? `<span class="fxth grpth">${ic('group')}</span>` : L.type === 'fx' ? `<span class="fxth" style="--fxc:${safeColor(L.p.c)}">${ic(FX_ICONS[L.kind])}</span>` : L.type === 'image' && ASSETS[L.asset] ? `<img src="${ASSETS[L.asset].thumb}" alt="">` : `<canvas data-th="${escapeHtml(L.id)}" width="72" height="72"></canvas>`;
    const fold = isGroup(L) ? `<button data-la="fold" title="${L.open === false ? '開く' : '閉じる'}">${L.open === false ? '▸' : '▾'}</button>` : '';
    return `<div class="ly${L.id === DOC.sel ? ' on' : ''}${ms.has(L.id) ? ' multi' : ''}${L.hidden ? ' hid' : ''}${L.locked ? ' locked' : ''}${isGroup(L) ? ' grp' : ''}${L.gid ? ' kid' : ''}" data-lid="${escapeHtml(L.id)}"${L.gid ? ` data-gid="${escapeHtml(L.gid)}"` : ''} title="ドラッグで重なり順を変更・ダブルクリックで名前を変更・Ctrl／Shift＋クリックで複数選択（スマホは長押し）">
      <span class="grip">${ic('grip')}</span>
      <span class="ly-th">${th}</span>
      <span class="ly-name"><span class="nm">${escapeHtml(layerName(L))}</span><small>${sub}${mode}${L.op < 1 ? ` ・ ${Math.round(L.op * 100)}%` : ''}</small></span>
      <span class="ly-act">${fold}
        <button data-la="eye" class="${L.hidden ? 'act' : ''}" title="表示・非表示">${ic(L.hidden ? 'eyeoff' : 'eye')}</button>
        <button data-la="lock" class="${L.locked ? 'act' : ''}" title="ロック（キャンバス上で動かないように）">${ic(L.locked ? 'lock' : 'unlock')}</button>
        <button data-la="menu" title="メニュー">${ic('more')}</button>
      </span>${L.id === DOC.sel ? `<div class="ly-op" title="不透明度"><span>不透明度</span><input type="range" min="0" max="1" step="0.01" data-d="@op" value="${+L.op || 1}"><b>${Math.round((L.op ?? 1) * 100)}%</b></div>` : ''}</div>`;
  }).join('');
  // 未知の種類は、描画側（drawBackground）と同じく画像として扱う
  const BG_NAMES = {image:'背景画像', grad:'グラデーション', color:'単色'}, bgName = hasKey(BG_NAMES, DOC.bg.type) ? BG_NAMES[DOC.bg.type] : '背景画像';
  const multi = ms.size >= 2 ? `<div class="lp-multi"><b>${ms.size}個を選択中</b><button class="btn sm" data-multi="group">${ic('group')}グループにする</button><button class="btn sm" data-multi="clear">選択を解除</button></div>` : '';
  box.innerHTML = multi + (rows || '<p class="note" style="padding:0 8px">文字や画像を追加すると、ここに重なり順どおりに並びます。</p>') +
    `<div class="ly bgrow${DOC.bg.hidden ? ' hid' : ''}" data-bgrow="1" title="クリックで背景の設定を開く"><span class="grip">${ic('grip')}</span><span class="ly-th"><canvas data-th="__bg" width="72" height="72"></canvas></span>
     <span class="ly-name"><span class="nm">背景</span><small>${DOC.bg.hidden ? '非表示（透明）' : bgName}${(DOC.bg.op ?? 1) < 1 && !DOC.bg.hidden ? ` ・ ${Math.round(DOC.bg.op * 100)}%` : ''} ・ 固定</small></span>
     <span class="ly-act"><button data-bga="eye" class="${DOC.bg.hidden ? 'act' : ''}" title="背景の表示・非表示（非表示にすると透明。PNGで保存すると背景が透明になります）">${ic(DOC.bg.hidden ? 'eyeoff' : 'eye')}</button></span>
     <div class="ly-op" title="背景の不透明度"><span>不透明度</span><input type="range" min="0" max="1" step="0.01" data-d="bg.op" value="${DOC.bg.op ?? 1}"><b>${Math.round((DOC.bg.op ?? 1) * 100)}%</b></div></div>`;
  refreshThumbs();
}
// レイヤーのサムネを prevCache から描く。背景は cover（全面に敷く）、レイヤーは contain（0.94 倍で余白を残す）
function refreshThumbs(){
  document.querySelectorAll('#layerList canvas[data-th]').forEach(cv => {
    const id = cv.dataset.th, e = prevCache.get(id), src = e && e.c, x = cv.getContext('2d');
    x.clearRect(0, 0, cv.width, cv.height); if(!src) return;
    const k = id === '__bg' ? Math.max(cv.width / src.width, cv.height / src.height) : Math.min(cv.width / src.width, cv.height / src.height) * 0.94;
    x.drawImage(src, (cv.width - src.width * k) / 2, (cv.height - src.height * k) / 2, src.width * k, src.height * k);
  });
}
const BLEND_NAMES = {'source-over':'通常', multiply:'乗算', screen:'スクリーン', overlay:'オーバーレイ', 'soft-light':'ソフトライト', 'hard-light':'ハードライト',
  'color-dodge':'覆い焼き', lighter:'加算', difference:'差の絶対値', luminosity:'輝度'};
// 同じ階層のレイヤーの中で重なり順を入れ替える。ref の手前（after=true＝配列で後ろ）または奥に置く。
// L を先に取り除いてから ref の位置を引く（取り除くと添字がずれるため、順序を入れ替えないこと）
/** @param {Layer} L */
function placeLayer(L, ref, after){
  if(!ref || ref === L) return;
  DOC.layers.splice(DOC.layers.indexOf(L), 1);
  DOC.layers.splice(DOC.layers.indexOf(ref) + (after ? 1 : 0), 0, L);
}
// パネルの上から to 番目（同じ階層のなかで）へ移す。disp は表示順（手前が先）の peers。
function movePeer(id, to){
  const L = layerById(id); if(!L) return;
  const peers = peersOf(L), disp = peers.slice().reverse(), ref = disp[clamp(to, 0, disp.length - 1)];
  if(!ref || ref === L) return;
  const from = disp.indexOf(L);
  placeLayer(L, ref, from > to);   // 上へ動かすときは ref の手前、下へ動かすときは奥
  renderLayers(); docChanged(false);
}
// 名前の変更。label が空なら自動の名前（文字なら本文）に戻る。入力が自動名と同じときも空にして、あとで本文を変えたとき名前が追従するようにする。
// Enter／blur で確定、Esc で取り消し。キー・ポインタ操作はキャンバスのショートカットに渡さない（stopPropagation）
function startRename(id){
  const row = document.querySelector(`#layerList [data-lid="${id}"]`), L = DOC.layers.find(l => l.id === id); if(!row || !L) return;
  const nm = row.querySelector('.nm'), inp = document.createElement('input');
  inp.type = 'text'; inp.value = layerName(L); nm.replaceWith(inp); inp.focus(); inp.select(); setTimeout(() => { inp.focus(); inp.select(); }, 30);
  let done = false;
  const fin = ok => { if(done) return; done = true; if(ok){ const v = inp.value.trim(); L.label = v && v !== layerName(Object.assign({}, L, {label:''})) ? v : ''; saveDoc(); } renderLayers(); syncDoc(); };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if(e.key === 'Enter') fin(true); if(e.key === 'Escape') fin(false); });
  inp.addEventListener('blur', () => fin(true));
  inp.addEventListener('pointerdown', e => e.stopPropagation());
}
/* 右クリックメニュー */
// 複数選択中のレイヤーを右クリックしたときは、まとめて操作するメニュー。重なり順の端（最前面・最背面）では該当項目を無効にする。
// メニューは画面外にはみ出さないよう、位置を画面内に収める
function showMenu(id, cx, cy){
  const L = DOC.layers.find(l => l.id === id); if(!L) return;
  const peers = peersOf(L), pi = peers.indexOf(L), top = pi === peers.length - 1, bottom = pi === 0, m = $('#ctxmenu');
  const b = (act, icn, t, kbd = '', cls = '', dis = false) => `<button data-ma="${act}" class="${cls}"${dis ? ' disabled style="opacity:.35;pointer-events:none"' : ''}>${ic(icn)}${t}${kbd ? `<kbd>${kbd}</kbd>` : ''}</button>`;
  const ms = DOC.msel || [];
  if(ms.length >= 2 && ms.includes(id)){
    // 複数選択中：まとめて操作
    m.innerHTML = `<div class="ttl">${ms.length}個を選択中</div>` + b('group', 'group', 'グループにする', 'Ctrl+G') + b('clearMulti', 'eyeoff', '選択を解除') + '<hr>' + b('del', 'trash', `${ms.length}個を削除`, 'Delete', 'danger');
  }else{
    m.innerHTML = `<div class="ttl">${escapeHtml(layerName(L))}</div>` +
      b('front', 'front', '最前面へ', 'Ctrl+Shift+]', '', top) + b('up', 'up', '前面へ', 'Ctrl+]', '', top) +
      b('down', 'down', '背面へ', 'Ctrl+[', '', bottom) + b('back', 'back', '最背面へ', 'Ctrl+Shift+[', '', bottom) + '<hr>' +
      b('dup', 'dup', '複製', 'Ctrl+D') + b('rename', 'pen', '名前を変更') + b('lock', L.locked ? 'unlock' : 'lock', L.locked ? 'ロックを解除' : 'ロック') +
      b('eye', L.hidden ? 'eye' : 'eyeoff', L.hidden ? '表示する' : '隠す') +
      (L.type === 'image' ? '<hr>' + b('flip', 'fliph', '左右反転', 'H') + b('flipV', 'flipv', '上下反転', 'V') + b('toLib', 'star', '素材置き場に登録') : '') + (L.type === 'text' ? '<hr>' + b('toLib', 'star', '文字スタイルを素材置き場に登録') : '') +
      '<hr>' + (isGroup(L) ? b('ungroup', 'ungroup', 'グループを解除', 'Ctrl+Shift+G') : L.gid ? b('ungroupOne', 'ungroup', 'グループから出す') : '') +
      (isGroup(L) ? '' : b('multi', 'group', '選択に追加（まとめて動かす・グループにする）')) + '<hr>' + b('del', 'trash', isGroup(L) ? 'グループごと削除' : '削除', 'Delete', 'danger');
  }
  m.dataset.lid = id; m.classList.add('show');
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(cx, innerWidth - r.width - 8) + 'px'; m.style.top = Math.min(cy, innerHeight - r.height - 8) + 'px';
}
const hideMenu = () => $('#ctxmenu').classList.remove('show');
$('#ctxmenu').addEventListener('click', e => {
  const b = e.target.closest('[data-ma]'); if(!b) return;
  const id = $('#ctxmenu').dataset.lid; hideMenu();
  if(b.dataset.ma === 'rename'){ setTimeout(() => startRename(id), 0); return; }
  layerAction(id, b.dataset.ma);
});
document.addEventListener('pointerdown', e => { if(!e.target.closest('#ctxmenu')) hideMenu(); }, true);
window.addEventListener('blur', hideMenu);
// レイヤーを選ぶ（id=null で選択解除）。keepMulti は複数選択を保ったまま主選択だけ変えるとき（toggleMulti から）。
// 別のレイヤーを選ぶと、キャンバス上の編集モード（フレーム調整など）は終了する。
// 行の見た目だけ更新すれば済む場合（行数が DOC.layers と同じ＝折りたたまれたグループが無く、複数選択の表示も無い）は
// パネルを作り直さない（無駄な再生成を避ける）。
// paintPreview は次のフレームに回し、パネル・入力欄の更新を先に済ませる
function selectLayer(id, keepMulti){
  if(edit && id !== edit.id) setEdit(null);
  const hadMulti = !!(DOC.msel && DOC.msel.length);
  DOC.sel = id;
  if(!keepMulti) DOC.msel = [];
  const L = selLayer();
  if(L && L.type === 'text'){
    DOC.textSel = id;
    if(L.style !== S){ S = L.style; resetAdj(); refreshTextUI(); }
  }
  syncDoc(); saveDoc();
  const rows = document.querySelectorAll('#layerList .ly[data-lid]');
  if(rows.length === DOC.layers.length && !hadMulti && !keepMulti) rows.forEach(r => r.classList.toggle('on', r.dataset.lid === id)); else renderLayers();
  requestAnimationFrame(() => paintPreview(false));
}
// 複数選択に入れる／外す（Ctrl・Shift＋クリック、スマホは長押し）。単独のレイヤーを選んでいる状態から始めたときは、そのレイヤーも仲間に数える。
// 残りが1個以下になったら通常の単独選択に戻す
function toggleMulti(id){
  let m = (DOC.msel && DOC.msel.length ? DOC.msel : DOC.sel ? [DOC.sel] : []).slice();
  const i = m.indexOf(id); if(i >= 0) m.splice(i, 1); else m.push(id);
  if(m.length <= 1){ selectLayer(m[0] || null); return; }
  selectLayer(m.includes(id) ? id : m[m.length - 1], true); DOC.msel = m; renderLayers(); requestAnimationFrame(() => paintPreview(false));
}
// 指定したレイヤー（と、グループなら中身）を消す。表示・保存の更新は呼び出し側（layerAction）が行う。
// 描画キャッシュ・大きさの記録も、ここで消す（残ると選択枠や当たり判定に古い値が出る）
function removeLayers(ids){
  const gone = new Set();
  ids.forEach(id => { const L = layerById(id); if(!L) return; gone.add(id); if(isGroup(L)) groupKids(L).forEach(k => gone.add(k.id)); });
  DOC.layers = DOC.layers.filter(l => !gone.has(l.id));
  gone.forEach(id => { prevCache.delete(id); dims.delete(id); });
  // 中身がなくなったグループも消す（グループだけ残ると、描画・選択ができない空の行になる）
  DOC.layers = DOC.layers.filter(l => !isGroup(l) || groupKids(l).length);
  if(gone.has(DOC.sel) || !layerById(DOC.sel)) DOC.sel = null;
  DOC.msel = [];
  // 文字パネルとつながっていた文字レイヤーが消えたら、残りの文字レイヤーのうち一番手前のものにつなぎ直す
  if(!layerById(DOC.textSel)){
    const T = DOC.layers.filter(l => l.type === 'text').pop();
    DOC.textSel = T ? T.id : null;
    if(T){ S = T.style; refreshTextUI(); }
  }
}
// レイヤー操作の入口（右クリックメニュー・行のボタン・ショートカットから共通で呼ぶ）。act は menu の data-ma / 行の data-la の値。
// 重なり順・表示・ロックなどの単純な操作は、最後にまとめて同期・再描画・保存する。複雑な操作（group など）は専用関数に任せて早期 return する
function layerAction(id, act){
  const L = layerById(id); if(!L) return;
  const peers = peersOf(L), pi = peers.indexOf(L);
  if(act === 'toLib'){ if(L.type === 'image' && ASSETS[L.asset]) libAddImageSrc(ASSETS[L.asset].src, L.name || '画像').then(ok => { if(ok) toast(`素材置き場に登録しました（使用 ${fmtBytes(libUsed())} ／ ${fmtBytes(LIB_MAX_BYTES)}）`); }); else if(L.type === 'text') libAddStyle(layerName(L), L.style); return; }
  if(act === 'group'){ groupLayers(DOC.msel && DOC.msel.length >= 2 ? DOC.msel : [id]); return; }
  if(act === 'ungroup'){ ungroupLayers(L); return; }
  if(act === 'ungroupOne'){ ungroupOne(L); return; }
  if(act === 'multi'){ toggleMulti(id); return; }
  if(act === 'clearMulti'){ selectLayer(DOC.sel); return; }
  if(act === 'fold'){ L.open = L.open === false; renderLayers(); saveDoc(); return; }
  if(act === 'up') placeLayer(L, peers[pi + 1], true);
  else if(act === 'down') placeLayer(L, peers[pi - 1], false);
  else if(act === 'front') placeLayer(L, peers[peers.length - 1], true);
  else if(act === 'back') placeLayer(L, peers[0], false);
  else if(act === 'eye') L.hidden = !L.hidden;
  else if(act === 'flip' || act === 'flipV'){ if(L.type !== 'image') return; flipLayer(L, act); }
  else if(act === 'lock'){ L.locked = !L.locked; toast(L.locked ? `「${layerName(L)}」をロックしました（キャンバス上では選択されません）` : 'ロックを解除しました'); }
  else if(act === 'rename'){ startRename(id); return; }
  else if(act === 'dup'){
    // 複製：位置を 36px ずらし、名前に「のコピー」を付ける。auto（ワンクリック背景エフェクトが作った印）は外す：
    // 残すと、次にワンクリック効果を適用したとき、コピーまで入れ替え対象として消えてしまう
    const cp = l => { const c = JSON.parse(JSON.stringify(l)); c.id = uid(); delete c.auto; c.x += 36; c.y += 36; if(c.label) c.label += ' のコピー'; return c; };
    if(isGroup(L)){
      // グループは、中身を複製して新しいグループの gid に付け替える（配列では「中身 → グループ本体」の順。groupLayers と同じ並び）
      const G = cp(L), kids = groupKids(L).map(k => { const c = cp(k); c.gid = G.id; return c; });
      DOC.layers.splice(DOC.layers.indexOf(L) + 1, 0, ...kids, G); selectLayer(G.id);
    }else{ const c = cp(L); DOC.layers.splice(DOC.layers.indexOf(L) + 1, 0, c); selectLayer(c.id); }
  }else if(act === 'del'){
    removeLayers(DOC.msel && DOC.msel.length >= 2 && DOC.msel.includes(id) ? DOC.msel : [id]);
  }
  syncDoc(); renderLayers(); docChanged(false);
}

// 画像の反転（key = 'flip' 左右／'flipV' 上下）。切り抜きフレームがあるときは、フレームの中の絵がその場で反転する
/** @param {Layer} L */
function flipLayer(L, key){ L[key] = !L[key]; }
document.addEventListener('click', e => {
  const b = e.target.closest('[data-flip]'); const L = selLayer(); if(!b || !L || L.type !== 'image') return;
  flipLayer(L, b.dataset.flip); syncDoc(); docChanged(false);
});
