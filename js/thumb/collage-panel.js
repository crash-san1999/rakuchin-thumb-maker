/* 楽ちんサムネメーカー：分割フレーム ④ 操作パネル（collage.js の続き。4 ファイルの分担は collage.js の先頭を参照）
   マスの一覧（renderCells）・「背景色・文字」タブ（renderCellText）と、そのイベント（document に委譲）、マスへの画像の読み込み用 input、
   レイアウト選択ボタンのアイコン（collageIcon。inspector.js から使う）。このファイルは読み込み時に document へイベントを登録する。 */
/* マスの一覧（操作パネル） */
function renderCells(){
  const L = selLayer(); if(!L || L.type !== 'collage') return;
  const n = collageN(L); L.ac = clamp(L.ac || 0, 0, n - 1);
  // key：一覧の見た目が変わる要素（選択マス・画像・背景色・文字の先頭3字）だけの印。同じなら innerHTML の作り直しを省く（再描画のたびに作り直すと、ドラッグ中のボタンが消えて操作が途切れるため）
  const key = [L.id, n, L.ac, ...L.cells.slice(0, n).map(c => (ASSETS[c.asset] ? c.asset : '') + (c.bg.on ? c.bg.c : '') + (cellHasText(c) ? c.tx.text.slice(0, 3) : ''))].join('|');
  document.querySelectorAll('.cellBox').forEach(box => {
  if(box.dataset.key === key) return; box.dataset.key = key;
  box.innerHTML = `<div class="cellgrid">${[...Array(n)].map((_, i) => { const A = ASSETS[L.cells[i].asset];
    const c = L.cells[i], bgs = c.bg.on ? ` style="background:${c.bg.grad ? `linear-gradient(${safeColor(c.bg.c)},${safeColor(c.bg.c2)})` : safeColor(c.bg.c)}"` : '';
    return `<button class="cellbtn${i === L.ac ? ' on' : ''}" data-cell="${i}" draggable="${A ? 'true' : 'false'}"${bgs} title="マス${i + 1}（ドラッグで別のマスと入れ替え）">${A ? `<img src="${A.thumb}" alt="" draggable="false">` : `<span>${cellHasText(c) ? escapeHtml(cellBtnLabel(c.tx.text)) : i + 1}</span>`}<em>${i + 1}</em></button>`; }).join('')}</div>
    <div class="crow" style="margin-top:8px"><button class="btn sm" data-cellact="pick">${ic('image')}マス${L.ac + 1}に画像を入れる</button>${ASSETS[L.cells[L.ac].asset] ? `<button class="btn sm ghost" data-cellact="clear">${ic('trash')}外す</button>` : ''}</div>${ASSETS[L.cells[L.ac].asset] ? `<div class="crow"><button class="btn sm ghost" data-cellact="flip">${ic('fliph')}左右反転</button><button class="btn sm ghost" data-cellact="flipV">${ic('flipv')}上下反転</button><button class="btn sm ghost" data-cellact="reset">${ic('reset')}位置・大きさを元に戻す</button></div>` : ''}`;
  });
}
/* 「背景色・文字」タブ：文字の入力・文字スタイル・1週間の自動入力 */
function renderCellText(){
  const L = selLayer(); if(!L || L.type !== 'collage') return;
  L.ac = clamp(L.ac || 0, 0, collageN(L) - 1);
  const c = L.cells[L.ac], today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const opts = (arr, v) => arr.map(([k, t]) => `<option value="${k}"${k === v ? ' selected' : ''}>${t}</option>`).join('');
  document.querySelectorAll('.ctBox').forEach(box => {
    // 入力欄は別レイヤーに切り替わったときだけ作り直す（入力中のフォーカスや選択を壊さないため）。以降の値の反映は、編集中の欄(activeElement)を避けて行う
    if(box.dataset.lid !== L.id){
      box.dataset.lid = L.id;
      box.innerHTML = `<div class="row"><label>文字（改行できます）</label><textarea id="ctText" rows="2" placeholder="例：10/5 月"></textarea></div>
        <div class="row"><label>フォント</label><select id="ctFont"></select></div>
        <div class="row"><label>太さ</label><select id="ctWeight"></select></div>
        <div class="row"><label>文字スタイル</label><select id="ctPre"><option value="">標準（ポップ）</option>${Object.entries(PCATS).map(([g, ns]) => `<optgroup label="${g}">${ns.map(n => `<option value="${n}">${n}</option>`).join('')}</optgroup>`).join('')}</select></div>`;
    }
    const ta = box.querySelector('#ctText'); if(document.activeElement !== ta) ta.value = c.tx.text || '';
    ta.dataset.cell = L.ac; box.querySelector('#ctPre').value = L.tpre || '';
    const st = L.tstyle || collageDefaultStyle(), fs = box.querySelector('#ctFont'), wsel = box.querySelector('#ctWeight');
    if(fs.dataset.built !== '1'){   // フォント一覧（欧文と、ふだん出さない書体を除く）。お気に入りを先頭に
      const ok = f => f.cat !== '欧文' && (!f.more || favs.has(f.family) || f.family === st.font), grp = {};
      fonts.filter(ok).forEach(f => (grp[favs.has(f.family) ? 'お気に入り' : f.cat] = grp[favs.has(f.family) ? 'お気に入り' : f.cat] || []).push(f));
      const keys = Object.keys(grp).sort((a, b) => (a === 'お気に入り' ? -1 : b === 'お気に入り' ? 1 : 0));
      fs.innerHTML = keys.map(g => `<optgroup label="${escapeHtml(g)}">${grp[g].map(f => `<option value="${escapeHtml(f.family)}">${escapeHtml(f.family)}</option>`).join('')}</optgroup>`).join(''); fs.dataset.built = '1';
    }
    if(![...fs.options].some(o => o.value === st.font)) fs.insertAdjacentHTML('afterbegin', `<option value="${escapeHtml(st.font)}">${escapeHtml(st.font)}</option>`);
    fs.value = st.font;
    if(wsel.dataset.f !== st.font){ wsel.dataset.f = st.font; wsel.innerHTML = weightsOf(findFont(st.font)).map(w => `<option value="${w}">${w}</option>`).join(''); }
    wsel.value = String(st.weight);
    if(wsel.value !== String(st.weight)){ const ws = [...wsel.options].map(o => +o.value); wsel.value = String(ws.reduce((a, b) => Math.abs(b - st.weight) < Math.abs(a - st.weight) ? b : a, ws[0])); }
  });
  document.querySelectorAll('.wkBox').forEach(box => {
    if(box.dataset.lid !== L.id){
      box.dataset.lid = L.id;
      box.innerHTML = `<div class="row"><label>この日を含む週</label><input type="date" id="wkStart" data-wk="start"></div>
        <div class="row"><label>週の始まり</label><select data-wk="first">${opts([['mon', '月曜日'], ['sun', '日曜日']], L.wk.first)}</select></div>
        <div class="row"><label>表示</label><select data-wk="show">${opts([['both', '日付＋曜日'], ['date', '日付だけ'], ['wd', '曜日だけ']], L.wk.show)}</select></div>
        <div class="row"><label>曜日の位置</label><select data-wk="layout">${opts([['below', '日付の下'], ['side', '日付の横']], L.wk.layout)}</select></div>
        <div class="row"><label>曜日の括弧</label><select data-wk="paren">${opts([['none', 'なし'], ['full', '（月）全角'], ['half', '(月) 半角']], L.wk.paren)}</select></div>
        <div class="row"><label>曜日の書き方</label><select data-wk="fmt">${opts([['ja1', '月'], ['ja3', '月曜日'], ['en', 'MON']], L.wk.fmt)}</select></div>
        <div class="row"><label class="chk"><input type="checkbox" data-wk="color"> 平日・土・日で背景色を分ける</label></div>
        <div class="crow"><button class="btn sm" id="wkGo">${ic('grid')}1週間を入れる</button></div>`;
    }
    const st = box.querySelector('#wkStart'); if(document.activeElement !== st) st.value = L.wk.start || today;
    box.querySelector('[data-wk="color"]').checked = !!L.wk.color;
  });
}
/* ---------- 操作パネルのイベント（document に委譲。パネルは再描画されるので、要素ごとには付けない） ---------- */
document.addEventListener('input', e => {
  const t = e.target, L = selLayer(); if(!L || L.type !== 'collage' || !t.closest) return;
  if(t.id === 'ctText'){ const c = L.cells[L.ac || 0]; c.tx.text = t.value; c.tx.on = t.value.trim() !== ''; syncDoc(); docChanged(false); }
});
document.addEventListener('change', e => {
  const t = e.target, L = selLayer(); if(!L || L.type !== 'collage' || !t.closest) return;
  if(t.id === 'ctPre'){ if(t.value) collageSetStyle(L, t.value); else { L.tpre = ''; L.tstyle = null; } syncDoc(); docChanged(false); }
  else if(t.id === 'ctFont' || t.id === 'ctWeight'){
    if(!L.tstyle) L.tstyle = collageDefaultStyle();
    if(t.id === 'ctFont'){
      L.tstyle.font = t.value; const f = findFont(t.value), ws = weightsOf(f), w0 = L.tstyle.weight;
      L.tstyle.weight = ws.reduce((a, b) => Math.abs(b - w0) < Math.abs(a - w0) ? b : a, ws[0]);   // 選んだフォントにある、いちばん近い太さに
      if(f && f.mb > 1 && !cssState.has(f.family)) toast(`「${f.family}」を読み込んでいます（約${f.mb}MB・初回のみ）`);
    } else L.tstyle.weight = +t.value;
    syncDoc(); docChanged(false);
  }
  else if(t.dataset && t.dataset.wk){ L.wk[t.dataset.wk] = t.type === 'checkbox' ? t.checked : t.value; }
});
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('#wkGo'), L = selLayer(); if(!b || !L || L.type !== 'collage') return;
  const st = b.closest('.wkBox').querySelector('#wkStart'); if(st && st.value) L.wk.start = st.value;
  collageFillWeek(L); syncDoc(); docChanged(false); toast('1週間を入れました。マスをクリックして、文字や色を直せます');
});
document.addEventListener('click', e => { const b = e.target.closest('[data-cfx]'); if(b) applyCellFx(b.dataset.cfx); });
// 一覧のマスをドラッグして、別のマスに落とすと入れ替え
// dragover／drop はキャプチャ段階で受けて stopPropagation する（ファイルのドロップで画像を追加する側の処理に渡さないため）。cellDragFrom<0 のときは何もしない
let cellDragFrom = -1;
document.addEventListener('dragstart', e => { const b = e.target.closest && e.target.closest('.cellbtn[data-cell]'); if(!b) return; cellDragFrom = +b.dataset.cell; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'cell'); });
document.addEventListener('dragover', e => { if(cellDragFrom < 0) return; const b = e.target.closest && e.target.closest('.cellbtn[data-cell]'); if(b){ e.preventDefault(); e.stopPropagation(); document.querySelectorAll('.cellbtn.dropto').forEach(x => x.classList.toggle('dropto', x === b)); b.classList.add('dropto'); } }, true);
document.addEventListener('drop', e => {
  if(cellDragFrom < 0) return; const b = e.target.closest && e.target.closest('.cellbtn[data-cell]'), L = selLayer(), from = cellDragFrom; cellDragFrom = -1;
  document.querySelectorAll('.cellbtn.dropto').forEach(x => x.classList.remove('dropto'));
  e.preventDefault(); e.stopPropagation();
  if(b && L && L.type === 'collage' && +b.dataset.cell !== from){ swapCells(L, from, +b.dataset.cell); syncDoc(); docChanged(false); toast(`マス${from + 1}とマス${+b.dataset.cell + 1}の画像を入れ替えました`); }
}, true);
document.addEventListener('dragend', () => { cellDragFrom = -1; document.querySelectorAll('.cellbtn.dropto').forEach(x => x.classList.remove('dropto')); });
document.addEventListener('click', e => {
  const cb = e.target.closest('[data-cell]'), ca = e.target.closest('[data-cellact]'), L = selLayer();
  if(!L || L.type !== 'collage' || (!cb && !ca)) return;
  if(cb){ L.ac = +cb.dataset.cell; if(!ASSETS[L.cells[L.ac].asset] && cb.closest('[data-pg="cells"]')) $('#cellfile').click(); syncDoc(); paintPreview(false); return; }   // 画像を選ぶ画面が開くのは「マスの画像」タブだけ（背景色・文字、効果のタブでは開かない）
  if(ca.dataset.cellact === 'pick') $('#cellfile').click();
  else if(ca.dataset.cellact === 'reset'){ resetCell(L, L.ac); syncDoc(); docChanged(false); }
  else if(ca.dataset.cellact === 'flip' || ca.dataset.cellact === 'flipV'){ const c = L.cells[L.ac]; c[ca.dataset.cellact] = !c[ca.dataset.cellact]; syncDoc(); docChanged(false); }
  else { L.cells[L.ac].asset = null; syncDoc(); docChanged(false); }
});
{
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.id = 'cellfile'; inp.hidden = true; inp.multiple = true; document.body.appendChild(inp);
  inp.onchange = async () => {
    const L = selLayer(), files = [...inp.files]; inp.value = ''; if(!L || L.type !== 'collage' || !files.length) return;
    const n = collageN(L); let i = L.ac || 0;
    await collageSetCell(L, i, files.shift());
    for(const f of files){ i++; while(i < n && ASSETS[L.cells[i].asset]) i++; if(i >= n) break; await collageSetCell(L, i, f); }
    syncDoc(); docChanged(false);
  };
}

// レイアウト選択ボタン用の小さなアイコン（48×28 の data URL）。キー＝レイアウト名＋分割数でキャッシュ。傾き・境界の形は付けない
const collageIconCache = {};
function collageIcon(lay, n){
  const k = lay + n; if(collageIconCache[k]) return collageIconCache[k];
  const c = mk(48, 28), x = c.getContext('2d'), cols = ['#ff4f8b', '#ffb800', '#34d2ff', '#7cd67c', '#b388ff', '#ff8a4c', '#2bb5a0', '#e0e04a'];
  collageCells(lay, n, 48, 28, 0, 0.55).forEach((p, i) => { collagePath(x, p); x.fillStyle = cols[i % 8]; x.fill(); x.lineWidth = 1.5; x.strokeStyle = '#1f1b2d'; x.stroke(); });
  return collageIconCache[k] = c.toDataURL();
}
