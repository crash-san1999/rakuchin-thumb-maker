/* 楽ちんサムネメーカー：週間予定表 ② 操作パネル（「予定」タブの7行の入力・「デザイン」タブの文字スタイル）とイベント
   パネルの中身は syncDoc のたびに renderSched が更新する。入力欄は別の予定表に切り替わったときだけ作り直し、
   それ以外は値だけを入れ直す（入力中の欄＝activeElement は触らない。文字の入力中にカーソルが飛ばないように）。
   イベントは document に委譲する（パネルは作り直されるので、要素ごとには付けない）。データと描画は sched.js。 */
// ファイルの中だけで使う名前を外（ほかのファイルと共有の場所）に出さないよう、中身を関数で包んでいる。外から使う名前は最後の return で出す
var {renderSched} = (() => {

// プリセットの選択肢（分類ごと）と、フォントの選択肢（欧文と、ふだん出さない書体を除く。お気に入りを先頭に）
const schedPresetOpts = () => Object.entries(PCATS).map(([g, ns]) => `<optgroup label="${escapeHtml(g)}">${ns.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('')}</optgroup>`).join('');
/** @param {string} cur */
function schedFontOpts(cur){
  const ok = /** @param {FontEntry} f */ f => f.cat !== '欧文' && (!f.more || favs.has(f.family) || f.family === cur), /** @type {Record<string, FontEntry[]>} */ grp = {};
  fonts.filter(ok).forEach(f => { const g = favs.has(f.family) ? 'お気に入り' : f.cat; (grp[g] = grp[g] || []).push(f); });
  const keys = Object.keys(grp).sort((a, b) => (a === 'お気に入り' ? -1 : b === 'お気に入り' ? 1 : 0));
  return keys.map(g => `<optgroup label="${escapeHtml(g)}">${grp[g].map(f => `<option value="${escapeHtml(f.family)}">${escapeHtml(f.family)}</option>`).join('')}</optgroup>`).join('');
}
// 1行ぶんの入力欄（i＝行番号）。見出し（日付）と値は renderSched が入れる
const schedRowHtml = /** @param {number} i */ i => `<div class="schRow" data-srow="${i}">
  <b class="schDay"></b>
  <label class="schRest"><input type="checkbox" data-sf="rest"> おやすみ</label>
  <input type="text" class="schTime" data-sf="time" maxlength="12" aria-label="時刻">
  <input type="text" class="schTitle" data-sf="title" maxlength="60" placeholder="タイトル（ゲーム名・企画名など）" aria-label="タイトル">
  <span class="schImg"><button class="schThumb" data-simg="${i}" title="画像を選ぶ（キャンバスの行にドロップでも入ります）"></button><button class="schClr" data-sclr="${i}" title="画像を外す">${ic('close')}</button></span>
</div>`;
// 文字スタイルの1グループ（k＝'d' 日付・時刻／'t' タイトル・おやすみ）
const schedStyleHtml = /** @param {string} k @param {string} title */ (k, title) => `<div class="schSt" data-sst="${k}"><div class="frgrp">${title}</div>
  <div class="row"><label>スタイル</label><select data-ssp="${k}">${schedPresetOpts()}</select></div>
  <div class="row"><label>フォント</label><select data-ssf="${k}"></select></div>
  <div class="row"><label>太さ</label><select data-ssw="${k}"></select></div></div>`;
// 値を入れる（入力中の欄は除く）
const setVal = /** @param {HTMLElement|null} el @param {string} v */ (el, v) => { const f = /** @type {HTMLInputElement|null} */ (el); if(f && document.activeElement !== f && f.value !== v) f.value = v; };
function renderSched(){
  const L = selLayer(); if(!isSched(L)) return;
  const days = schedDays(L);
  $$('.schBox').forEach(box => {
    if(box.dataset.lid !== L.id){
      box.dataset.lid = L.id;
      box.innerHTML = `<div class="subhead" style="margin-top:6px">週<span class="subnote">その週のどの日を選んでも、週の始まりから7日ぶんの日付が入ります</span></div>
        <div class="row"><label>この日を含む週</label><input type="date" id="schStart"></div>
        <div class="row"><label>週の始まり</label><select id="schFirst"><option value="mon">月曜日</option><option value="sun">日曜日</option></select></div>
        <div class="row"><label>いつもの時刻</label><input type="text" id="schTime" maxlength="12" placeholder="例：20:00"></div>
        <div class="crow schWeekBtns"><button class="btn sm" data-sweek="-1" title="日付だけ前の週にする（中身はそのまま）">${ic('up')}前の週</button><button class="btn sm" data-sweek="1" title="日付だけ次の週にする（中身はそのまま）">${ic('down')}次の週</button><button class="btn sm pri" data-snext title="日付を次の週にして、時刻・タイトル・画像・おやすみを空にする">${ic('newdoc')}来週分を作る</button></div>
        <details class="schBulk"><summary>テキストでまとめて入力</summary>
          <p class="note">1行に1日ずつ書きます。例：<br>10/12 20:00 忍者八ッ島くん！<br>10/13 おやすみ<br>水 21時 コラボ配信<br>日付や曜日を書かない行は、前の行の次の日に入ります。時刻を書かない日は「いつもの時刻」。画像はそのまま残ります。</p>
          <textarea id="schBulkText" rows="7" placeholder="10/12 20:00 忍者八ッ島くん！&#10;10/13 おやすみ&#10;水 21時 コラボ配信"></textarea>
          <div class="crow"><button class="btn sm pri" id="schBulkGo">${ic('text')}予定に入れる</button></div>
        </details>
        <div class="subhead" style="margin-top:20px">1週間の予定<span class="subnote">時刻が空の日は「いつもの時刻」になります。画像は右の□か、キャンバスの行にドロップ</span></div>
        <div class="schRows">${[...Array(7).keys()].map(schedRowHtml).join('')}</div>`;
    }
    const today = (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date());
    setVal($('#schStart', box), L.start || today); setVal($('#schFirst', box), L.first); setVal($('#schTime', box), L.time);
    $$('.schRow', box).forEach(el => {
      const i = +(el.dataset.srow ?? 0), r = L.rows[i], A = assetOf(r.asset);
      const day = schedDayLabel(L, days[i]); if($('.schDay', el).textContent !== day) $('.schDay', el).textContent = day;
      el.classList.toggle('rest', r.rest);
      $as('[data-sf="rest"]', HTMLInputElement, el).checked = r.rest;
      setVal($as('[data-sf="time"]', HTMLInputElement, el), r.time); $as('[data-sf="time"]', HTMLInputElement, el).placeholder = L.time || '時刻';
      setVal($('[data-sf="title"]', el), r.title);
      const th = $('.schThumb', el), src = A ? A.thumb : '';
      if(th.dataset.src !== src){ th.dataset.src = src; th.innerHTML = A ? `<img src="${A.thumb}" alt="">` : ic('image'); }
      $('.schClr', el).hidden = !A;
    });
  });
  $$('.schStyleBox').forEach(box => {
    if(box.dataset.lid !== L.id){ box.dataset.lid = L.id; box.innerHTML = schedStyleHtml('d', '日付・時刻') + schedStyleHtml('t', 'タイトル・おやすみ'); }
    for(const k of ['d', 't']){
      const st = k === 'd' ? schedDStyle(L) : schedTStyle(L), pre = k === 'd' ? L.dpre : L.tpre;
      setVal($(`[data-ssp="${k}"]`, box), pre);
      const fs = $as(`[data-ssf="${k}"]`, HTMLSelectElement, box), ws = $as(`[data-ssw="${k}"]`, HTMLSelectElement, box);
      if(fs.dataset.built !== '1'){ fs.innerHTML = schedFontOpts(st.font); fs.dataset.built = '1'; }
      if(![...fs.options].some(o => o.value === st.font)) fs.insertAdjacentHTML('afterbegin', `<option value="${escapeHtml(st.font)}">${escapeHtml(st.font)}</option>`);
      fs.value = st.font;
      if(ws.dataset.f !== st.font){ ws.dataset.f = st.font; ws.innerHTML = weightsOf(findFont(st.font)).map(w => `<option value="${w}">${w}</option>`).join(''); }
      ws.value = String(st.weight);
    }
  });
}

/* ---------- イベント ---------- */
const schedLayer = () => { const L = selLayer(); return isSched(L) ? L : null; };
document.addEventListener('input', e => {
  const t = inputOf(e), L = schedLayer(); if(!L || !t.closest) return;
  const row = t.closest('.schRow');
  if(row && (t.dataset.sf === 'time' || t.dataset.sf === 'title')){ L.rows[+(row.dataset.srow ?? 0)][t.dataset.sf] = t.value; docChanged(false); return; }
  if(t.id === 'schTime'){ L.time = t.value; syncDoc(); docChanged(false); }
});
document.addEventListener('change', e => {
  const t = inputOf(e), L = schedLayer(); if(!L || !t.closest) return;
  const row = t.closest('.schRow');
  if(row && t.dataset.sf === 'rest'){ L.rows[+(row.dataset.srow ?? 0)].rest = t.checked; syncDoc(); docChanged(false); return; }
  if(t.id === 'schStart'){ if(/^\d{4}-\d{2}-\d{2}$/.test(t.value)){ L.start = t.value; syncDoc(); docChanged(false); } return; }
  if(t.id === 'schFirst'){ L.first = t.value === 'sun' ? 'sun' : 'mon'; syncDoc(); docChanged(false); return; }
  const k = t.dataset.ssp || t.dataset.ssf || t.dataset.ssw; if(!k) return;
  const sk = k === 'd' ? 'dstyle' : 'tstyle', pk = k === 'd' ? 'dpre' : 'tpre';
  if(t.dataset.ssp){ L[pk] = t.value; L[sk] = null; }   // プリセットを選び直したら、フォント・太さの変更は捨ててプリセットどおりに
  else {
    const st = L[sk] || (L[sk] = schedPreset(L[pk]));
    if(t.dataset.ssf){
      const f = findFont(t.value), w0 = st.weight, ws = weightsOf(f);
      st.font = t.value; st.weight = ws.reduce((a, b) => Math.abs(b - w0) < Math.abs(a - w0) ? b : a, ws[0]);
      if(f && (f.mb || 0) > 1 && !cssState.has(f.family)) toast(`「${f.family}」を読み込んでいます（約${f.mb}MB・初回のみ）`);
    } else st.weight = +t.value;
  }
  syncDoc(); docChanged(false);
});
// 行の画像：□で選ぶ（隠しファイル入力 #schedfile）／×で外す
let schedPickRow = -1;
document.addEventListener('click', e => {
  const b = tgt(e).closest && tgt(e).closest('[data-simg], [data-sclr]'), L = schedLayer(); if(!b || !L) return;
  if(b.dataset.sclr != null){ L.rows[+b.dataset.sclr].asset = null; syncDoc(); docChanged(false); return; }
  schedPickRow = +(b.dataset.simg ?? -1); $('#schedfile').click();
});
{
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.id = 'schedfile'; inp.hidden = true; inp.multiple = true; document.body.appendChild(inp);
  // 複数選んだときは、選んだ行から下へ、画像の無い（おやすみでない）行に順に入れる
  inp.onchange = async () => {
    const L = schedLayer(), files = [...(inp.files || [])].filter(f => /^image\//.test(f.type)); inp.value = ''; if(!L || !files.length || schedPickRow < 0) return;
    let i = schedPickRow; await schedSetImage(L, i, /** @type {File} */ (files.shift()));   // 上で 1 枚以上あることを確かめている
    for(const f of files){ i++; while(i < 7 && (assetOf(L.rows[i].asset) || L.rows[i].rest)) i++; if(i >= 7) break; await schedSetImage(L, i, f); }
    syncDoc(); docChanged(false);
  };
}
// 週を動かす（前の週・次の週）／来週分を作る（次の週にして中身を空に）。どちらも取り消し（Ctrl+Z）で戻せる
document.addEventListener('click', e => {
  const b = tgt(e).closest && tgt(e).closest('[data-sweek], [data-snext]'), L = schedLayer(); if(!b || !L) return;
  if(b.dataset.snext != null){ schedShiftWeek(L, 1, true); toast(`${schedDayLabel(L, schedDays(L)[0])} からの週にして、中身を空にしました（取り消しで戻せます）`); }
  else { schedShiftWeek(L, +(b.dataset.sweek ?? 0), false); toast(`${schedDayLabel(L, schedDays(L)[0])} からの週にしました`); }
  syncDoc(); docChanged(false);
});
// テキストでまとめて入力
document.addEventListener('click', e => {
  const b = tgt(e).closest && tgt(e).closest('#schBulkGo'), L = schedLayer(); if(!b || !L) return;
  const ta = $as('#schBulkText', HTMLTextAreaElement), text = ta ? ta.value : ''; if(!text.trim()){ toast('予定を1行に1日ずつ書いてください', true); return; }
  const {done, skipped} = schedApplyText(L, text);
  syncDoc(); docChanged(false);
  if(!done.length){ toast('入れられる行がありませんでした（日付がこの週に無いか、空の行だけです）', true); return; }
  toast(`${new Set(done).size}日ぶんの予定を入れました${skipped ? `（この週に無い日付・8日目以降の ${skipped} 行は使いませんでした）` : ''}`);
});
return {renderSched};
})();
