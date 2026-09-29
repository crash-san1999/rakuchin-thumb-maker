/* 楽ちんサムネメーカー：レイヤーパネル・レイヤーの選択と操作 */
let lpSliding = false;
function renderLayers(){
  const box = $('#layerList'); if(!box) return;
  if(lpSliding){ clearTimeout(renderLayers.t); renderLayers.t = setTimeout(renderLayers, 300); return; }
  const arr = DOC.layers.slice().reverse();
  $('#lpCount').textContent = DOC.layers.length ? `${DOC.layers.length}枚` : '';
  const rows = arr.map(L => {
    const sub = L.type === 'text' ? '文字' : L.type === 'collage' ? `${L.cells.slice(0, collageN(L)).filter(c => ASSETS[c.asset]).length} / ${collageN(L)} 枚` : L.type === 'fx' ? '動的エフェクト' + (L.auto ? '（ワンクリック）' : '') : (ASSETS[L.asset] ? '画像' : '画像（読み込めません）');
    const mode = L.blend && L.blend !== 'source-over' ? ' ・ ' + (BLEND_NAMES[L.blend] || L.blend) : '';
    const th = L.type === 'fx' ? `<span class="fxth" style="--fxc:${L.p.c || '#fff'}">${ic(FX_ICONS[L.kind])}</span>` : L.type === 'image' && ASSETS[L.asset] ? `<img src="${ASSETS[L.asset].thumb}" alt="">` : `<canvas data-th="${L.id}" width="72" height="72"></canvas>`;
    return `<div class="ly${L.id === DOC.sel ? ' on' : ''}${L.hidden ? ' hid' : ''}${L.locked ? ' locked' : ''}" data-lid="${L.id}" title="ドラッグで重なり順を変更・ダブルクリックで名前を変更">
      <span class="grip">${ic('grip')}</span>
      <span class="ly-th">${th}</span>
      <span class="ly-name"><span class="nm">${escapeHtml(layerName(L))}</span><small>${sub}${mode}${L.op < 1 ? ` ・ ${Math.round(L.op * 100)}%` : ''}</small></span>
      <span class="ly-act">
        <button data-la="eye" class="${L.hidden ? 'act' : ''}" title="表示・非表示">${ic(L.hidden ? 'eyeoff' : 'eye')}</button>
        <button data-la="lock" class="${L.locked ? 'act' : ''}" title="ロック（キャンバス上で動かないように）">${ic(L.locked ? 'lock' : 'unlock')}</button>
        <button data-la="menu" title="メニュー">${ic('more')}</button>
      </span>${L.id === DOC.sel ? `<div class="ly-op" title="不透明度"><span>不透明度</span><input type="range" min="0" max="1" step="0.01" data-d="@op" value="${L.op ?? 1}"><b>${Math.round((L.op ?? 1) * 100)}%</b></div>` : ''}</div>`;
  }).join('');
  const bgName = {image:'背景画像', grad:'グラデーション', color:'単色'}[DOC.bg.type];
  box.innerHTML = (rows || '<p class="note" style="padding:0 8px">文字や画像を追加すると、ここに重なり順どおりに並びます。</p>') +
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
function moveLayer(id, to){
  const i = DOC.layers.findIndex(l => l.id === id); if(i < 0) return;
  to = clamp(to, 0, DOC.layers.length - 1); if(to === i) return;
  const [L] = DOC.layers.splice(i, 1); DOC.layers.splice(to, 0, L);
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
  const i = DOC.layers.indexOf(L), n = DOC.layers.length, m = $('#ctxmenu');
  const b = (act, icn, t, kbd = '', cls = '', dis = false) => `<button data-ma="${act}" class="${cls}"${dis ? ' disabled style="opacity:.35;pointer-events:none"' : ''}>${ic(icn)}${t}${kbd ? `<kbd>${kbd}</kbd>` : ''}</button>`;
  m.innerHTML = `<div class="ttl">${escapeHtml(layerName(L))}</div>` +
    b('front', 'front', '最前面へ', 'Ctrl+Shift+]', '', i === n - 1) + b('up', 'up', '前面へ', 'Ctrl+]', '', i === n - 1) +
    b('down', 'down', '背面へ', 'Ctrl+[', '', i === 0) + b('back', 'back', '最背面へ', 'Ctrl+Shift+[', '', i === 0) + '<hr>' +
    b('dup', 'dup', '複製', 'Ctrl+D') + b('rename', 'pen', '名前を変更') + b('lock', L.locked ? 'unlock' : 'lock', L.locked ? 'ロックを解除' : 'ロック') +
    b('eye', L.hidden ? 'eye' : 'eyeoff', L.hidden ? '表示する' : '隠す') + '<hr>' + b('del', 'trash', '削除', 'Delete', 'danger');
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
function selectLayer(id){
  if(edit && id !== edit.id) setEdit(null);
  DOC.sel = id;
  const L = selLayer();
  if(L && L.type === 'text'){
    DOC.textSel = id;
    if(L.style !== S){ S = L.style; resetAdj(); fixWeight(); buildWeight(); syncUI(); renderFontList(); }
  }
  syncDoc(); saveDoc();
  const rows = document.querySelectorAll('#layerList .ly[data-lid]');
  if(rows.length === DOC.layers.length) rows.forEach(r => r.classList.toggle('on', r.dataset.lid === id)); else renderLayers();
  requestAnimationFrame(() => paintPreview(false));
}
function layerAction(id, act){
  const i = DOC.layers.findIndex(l => l.id === id); if(i < 0) return;
  const L = DOC.layers[i];
  if(act === 'up' && i < DOC.layers.length - 1){ DOC.layers.splice(i, 1); DOC.layers.splice(i + 1, 0, L); }
  else if(act === 'down' && i > 0){ DOC.layers.splice(i, 1); DOC.layers.splice(i - 1, 0, L); }
  else if(act === 'front'){ DOC.layers.splice(i, 1); DOC.layers.push(L); }
  else if(act === 'back'){ DOC.layers.splice(i, 1); DOC.layers.unshift(L); }
  else if(act === 'eye') L.hidden = !L.hidden;
  else if(act === 'lock'){ L.locked = !L.locked; toast(L.locked ? `「${layerName(L)}」をロックしました（キャンバス上では選択されません）` : 'ロックを解除しました'); }
  else if(act === 'rename'){ startRename(id); return; }
  else if(act === 'dup'){
    const c = JSON.parse(JSON.stringify(L)); c.id = uid(); delete c.auto; c.x += 36; c.y += 36; if(c.label) c.label += ' のコピー';
    DOC.layers.splice(i + 1, 0, c); selectLayer(c.id);
  }else if(act === 'del'){
    DOC.layers.splice(i, 1); prevCache.delete(id); dims.delete(id);
    if(DOC.sel === id) DOC.sel = null;
    if(DOC.textSel === id){
      const T = DOC.layers.filter(l => l.type === 'text').pop();
      DOC.textSel = T ? T.id : null;
      if(T){ S = T.style; fixWeight(); buildWeight(); syncUI(); renderFontList(); }
    }
  }
  syncDoc(); renderLayers(); docChanged(false);
}
