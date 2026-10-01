/* 楽ちんサムネメーカー：レイヤーパネル・レイヤーの選択と操作 */
let lpSliding = false;
// パネルに並べる順（手前が先）。グループのすぐ下に、中のレイヤーを並べる（閉じていれば出さない）
function layerRowsOrder(){
  const out = [];
  DOC.layers.filter(l => !l.gid).reverse().forEach(L => { out.push(L); if(isGroup(L) && L.open !== false) groupKids(L).reverse().forEach(k => out.push(k)); });
  return out;
}
function layerSubText(L){
  return L.type === 'text' ? '文字' : L.type === 'group' ? `${groupKids(L).length}個のレイヤー${cellFxOn(L.fx) ? ' ・ 効果あり' : ''}` : L.type === 'collage' ? `${L.cells.slice(0, collageN(L)).filter(c => ASSETS[c.asset]).length} / ${collageN(L)} 枚` : L.type === 'fx' ? '動的エフェクト' + (L.auto ? '（ワンクリック）' : '') : (ASSETS[L.asset] ? '画像' : '画像（読み込めません）');
}
function renderLayers(){
  const box = $('#layerList'); if(!box) return;
  if(lpSliding){ clearTimeout(renderLayers.t); renderLayers.t = setTimeout(renderLayers, 300); return; }
  const arr = layerRowsOrder(), ms = new Set(DOC.msel || []);
  const nLay = DOC.layers.filter(l => !isGroup(l)).length;
  $('#lpCount').textContent = nLay ? `${nLay}枚` : '';
  const rows = arr.map(L => {
    const sub = layerSubText(L);
    const mode = L.blend && L.blend !== 'source-over' ? ' ・ ' + (BLEND_NAMES[L.blend] || L.blend) : '';
    const th = L.type === 'group' ? `<span class="fxth grpth">${ic('group')}</span>` : L.type === 'fx' ? `<span class="fxth" style="--fxc:${L.p.c || '#fff'}">${ic(FX_ICONS[L.kind])}</span>` : L.type === 'image' && ASSETS[L.asset] ? `<img src="${ASSETS[L.asset].thumb}" alt="">` : `<canvas data-th="${L.id}" width="72" height="72"></canvas>`;
    const fold = isGroup(L) ? `<button data-la="fold" title="${L.open === false ? '開く' : '閉じる'}">${L.open === false ? '▸' : '▾'}</button>` : '';
    return `<div class="ly${L.id === DOC.sel ? ' on' : ''}${ms.has(L.id) ? ' multi' : ''}${L.hidden ? ' hid' : ''}${L.locked ? ' locked' : ''}${isGroup(L) ? ' grp' : ''}${L.gid ? ' kid' : ''}" data-lid="${L.id}"${L.gid ? ` data-gid="${L.gid}"` : ''} title="ドラッグで重なり順を変更・ダブルクリックで名前を変更・Ctrl／Shift＋クリックで複数選択（スマホは長押し）">
      <span class="grip">${ic('grip')}</span>
      <span class="ly-th">${th}</span>
      <span class="ly-name"><span class="nm">${escapeHtml(layerName(L))}</span><small>${sub}${mode}${L.op < 1 ? ` ・ ${Math.round(L.op * 100)}%` : ''}</small></span>
      <span class="ly-act">${fold}
        <button data-la="eye" class="${L.hidden ? 'act' : ''}" title="表示・非表示">${ic(L.hidden ? 'eyeoff' : 'eye')}</button>
        <button data-la="lock" class="${L.locked ? 'act' : ''}" title="ロック（キャンバス上で動かないように）">${ic(L.locked ? 'lock' : 'unlock')}</button>
        <button data-la="menu" title="メニュー">${ic('more')}</button>
      </span>${L.id === DOC.sel ? `<div class="ly-op" title="不透明度"><span>不透明度</span><input type="range" min="0" max="1" step="0.01" data-d="@op" value="${L.op ?? 1}"><b>${Math.round((L.op ?? 1) * 100)}%</b></div>` : ''}</div>`;
  }).join('');
  const bgName = {image:'背景画像', grad:'グラデーション', color:'単色'}[DOC.bg.type];
  const multi = ms.size >= 2 ? `<div class="lp-multi"><b>${ms.size}個を選択中</b><button class="btn sm" data-multi="group">${ic('group')}グループにする</button><button class="btn sm" data-multi="clear">選択を解除</button></div>` : '';
  box.innerHTML = multi + (rows || '<p class="note" style="padding:0 8px">文字や画像を追加すると、ここに重なり順どおりに並びます。</p>') +
    `<div class="ly bgrow${DOC.bg.hidden ? ' hid' : ''}" data-bgrow="1" title="クリックで背景の設定を開く"><span class="grip">${ic('grip')}</span><span class="ly-th"><canvas data-th="__bg" width="72" height="72"></canvas></span>
     <span class="ly-name"><span class="nm">背景</span><small>${DOC.bg.hidden ? '非表示（透明）' : bgName}${(DOC.bg.op ?? 1) < 1 && !DOC.bg.hidden ? ` ・ ${Math.round(DOC.bg.op * 100)}%` : ''} ・ 固定</small></span>
     <span class="ly-act"><button data-bga="eye" class="${DOC.bg.hidden ? 'act' : ''}" title="背景の表示・非表示（非表示にすると透明。PNGで保存すると背景が透明になります）">${ic(DOC.bg.hidden ? 'eyeoff' : 'eye')}</button></span>
     <div class="ly-op" title="背景の不透明度"><span>不透明度</span><input type="range" min="0" max="1" step="0.01" data-d="bg.op" value="${DOC.bg.op ?? 1}"><b>${Math.round((DOC.bg.op ?? 1) * 100)}%</b></div></div>`;
  refreshThumbs();
}
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
// 同じ階層のレイヤーの中で重なり順を入れ替える。ref の手前（after=true）または奥に置く
function placeLayer(L, ref, after){
  if(!ref || ref === L) return;
  DOC.layers.splice(DOC.layers.indexOf(L), 1);
  DOC.layers.splice(DOC.layers.indexOf(ref) + (after ? 1 : 0), 0, L);
}
// パネルの上から to 番目（同じ階層のなかで）へ移す
function movePeer(id, to){
  const L = layerById(id); if(!L) return;
  const peers = peersOf(L), disp = peers.slice().reverse(), ref = disp[clamp(to, 0, disp.length - 1)];
  if(!ref || ref === L) return;
  const from = disp.indexOf(L);
  placeLayer(L, ref, from > to);   // 上へ動かすときは ref の手前、下へ動かすときは奥
  renderLayers(); docChanged(false);
}
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
// 複数選択に入れる／外す（Ctrl・Shift＋クリック、スマホは長押し）
function toggleMulti(id){
  let m = (DOC.msel && DOC.msel.length ? DOC.msel : DOC.sel ? [DOC.sel] : []).slice();
  const i = m.indexOf(id); if(i >= 0) m.splice(i, 1); else m.push(id);
  if(m.length <= 1){ selectLayer(m[0] || null); return; }
  selectLayer(m.includes(id) ? id : m[m.length - 1], true); DOC.msel = m; renderLayers(); requestAnimationFrame(() => paintPreview(false));
}
// 指定したレイヤー（と、グループなら中身）を消す
function removeLayers(ids){
  const gone = new Set();
  ids.forEach(id => { const L = layerById(id); if(!L) return; gone.add(id); if(isGroup(L)) groupKids(L).forEach(k => gone.add(k.id)); });
  DOC.layers = DOC.layers.filter(l => !gone.has(l.id));
  gone.forEach(id => { prevCache.delete(id); dims.delete(id); });
  // 中身がなくなったグループも消す
  DOC.layers = DOC.layers.filter(l => !isGroup(l) || groupKids(l).length);
  if(gone.has(DOC.sel) || !layerById(DOC.sel)) DOC.sel = null;
  DOC.msel = [];
  if(!layerById(DOC.textSel)){
    const T = DOC.layers.filter(l => l.type === 'text').pop();
    DOC.textSel = T ? T.id : null;
    if(T){ S = T.style; refreshTextUI(); }
  }
}
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
    const cp = l => { const c = JSON.parse(JSON.stringify(l)); c.id = uid(); delete c.auto; c.x += 36; c.y += 36; if(c.label) c.label += ' のコピー'; return c; };
    if(isGroup(L)){
      const G = cp(L), kids = groupKids(L).map(k => { const c = cp(k); c.gid = G.id; return c; });
      DOC.layers.splice(DOC.layers.indexOf(L) + 1, 0, ...kids, G); selectLayer(G.id);
    }else{ const c = cp(L); DOC.layers.splice(DOC.layers.indexOf(L) + 1, 0, c); selectLayer(c.id); }
  }else if(act === 'del'){
    removeLayers(DOC.msel && DOC.msel.length >= 2 && DOC.msel.includes(id) ? DOC.msel : [id]);
  }
  syncDoc(); renderLayers(); docChanged(false);
}

// 画像の反転（key = 'flip' 左右／'flipV' 上下）。切り抜きフレームがあるときは、フレームの中の絵がその場で反転する
function flipLayer(L, key){ L[key] = !L[key]; }
document.addEventListener('click', e => {
  const b = e.target.closest('[data-flip]'); const L = selLayer(); if(!b || !L || L.type !== 'image') return;
  flipLayer(L, b.dataset.flip); syncDoc(); docChanged(false);
});
