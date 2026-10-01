/* 楽ちんサムネメーカー：ポップアップ（操作ガイド・追加メニュー・ファイルメニュー） */
/*
  操作ガイド（#help）・更新履歴（#logModal）のモーダルと、ボタンの下に開く小さなメニュー（.pop）の開閉を担当する。
  公開関数：openHelp()（main.js が起動時に呼ぶ）/ closeHelp() / openLog() / togglePop(id, anchor)（mobile.js の下バーからも呼ぶ）。
  依存：LS・$・isTyping・clamp（core.js）、isMobile（mobile.js）、CHANGELOG（changelog.js）、renderLib（thumb/library.js）。
  ポップアップ関連のうち、新規作成モーダル（#newModal）の開閉は thumb/events.js にある。
  HTML は index.html。メニューの中身の操作（追加・保存など）は各機能のファイルが受け持ち、ここは開閉だけ。
  localStorage：ttm_helpAuto（起動時にガイドを出すか。未設定=初回は出す）/ ttm_seenLog（最後に見た更新履歴の識別子）。
*/
/* 操作ガイド */
// ttm_helpAuto は「次回も起動時に表示する」チェック（#helpNoAuto。id は名前と逆の意味なので注意）の値そのもの。
// 未設定（初回）は main.js が !== false で判定して表示し、ここではチェックなしで開く。一度閉じると false が保存され、チェックしない限り次回から出ない
function openHelp(){ $('#help').classList.add('show'); $('#helpNoAuto').checked = LS.get('ttm_helpAuto', false) === true; }
function closeHelp(){ $('#help').classList.remove('show'); LS.set('ttm_helpAuto', $('#helpNoAuto').checked); }
$('#helpBtn').onclick = openHelp;
/* 更新履歴：js/changelog.js の内容を表示。見ていない更新があるときは「？」ボタンに点を付ける */
// 最新の更新履歴の識別子（日付|題名）。ttm_seenLog と比べて「未読あり」を判定する
const logLatest = () => CHANGELOG[0].d + '|' + CHANGELOG[0].t;
// 履歴の文は HTML として差し込むので、< > & だけは変換してから入れる（履歴の本文にタグを書いても表示が崩れない）。開いた時点で既読にする
function openLog(){
  $('#logBody').innerHTML = CHANGELOG.map(e => `<h4>${e.d.replace(/-/g, '/')}　${e.t}</h4><ul class="loglist">${e.items.map(i => `<li>${i.replace(/[<>&]/g, c => ({'<':'&lt;', '>':'&gt;', '&':'&amp;'}[c]))}</li>`).join('')}</ul>`).join('');
  $('#logModal').classList.add('show'); LS.set('ttm_seenLog', logLatest()); $('#helpBtn').classList.remove('has-new');
}
const closeLog = () => $('#logModal').classList.remove('show');
$('#logOpen').onclick = () => { closeHelp(); openLog(); };
$('#logModal').addEventListener('click', e => { if(e.target.id === 'logModal' || e.target.closest('[data-log-close]')) closeLog(); });
if(LS.get('ttm_seenLog', null) !== logLatest()) $('#helpBtn').classList.add('has-new');
$('#help').addEventListener('click', e => { if(e.target.id === 'help' || e.target.closest('[data-help-close]')) closeHelp(); });
$('#helpNoAuto').addEventListener('change', e => LS.set('ttm_helpAuto', e.target.checked));
// Esc は「いちばん手前のモーダル」だけを閉じる（新規作成 → 更新履歴 → 操作ガイドの順）。ポップアップメニューの Esc は下の別リスナー。
// 入力欄に「?」を打ち込んでいるときにガイドが開かないよう、isTyping を除いてから ? を処理する（Esc は入力中でも効かせたいので isTyping より前）
document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && $('#newModal').classList.contains('show')){ $('#newModal').classList.remove('show'); return; }
  if(e.key === 'Escape' && $('#logModal').classList.contains('show')){ closeLog(); return; }
  if(e.key === 'Escape' && $('#help').classList.contains('show')){ closeHelp(); return; }
  if(isTyping(e)) return;
  if(e.key === '?' && !e.ctrlKey && !e.metaKey){ e.preventDefault(); openHelp(); }
});

/* ポップアップメニュー（追加・ファイル） */
// id のメニューを開閉する。同時に開くのは1つだけ（ほかは閉じる）。
// PC は anchor（ボタン）の下に、画面からはみ出さないよう clamp して置く（座標は position:fixed 前提のビューポート基準）。
// スマホはメニューを CSS で下に固定表示するので、前回の PC 用の位置指定だけ消す
function togglePop(id, anchor){
  const el = document.getElementById(id), open = !el.classList.contains('show');
  document.querySelectorAll('.pop.show').forEach(p => p.classList.remove('show'));
  if(!open) return;
  el.classList.add('show');
  if(isMobile){ el.style.left = ''; el.style.top = ''; return; }
  const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  el.style.left = clamp(r.left, 8, innerWidth - w - 8) + 'px'; el.style.top = clamp(r.bottom + 8, 8, innerHeight - h - 8) + 'px';
}
// メニューを開くボタンと「外をクリックで閉じる」を1か所で処理する。
// 各メニューのボタンの本来の処理は別のリスナーが受けるので、閉じるのは setTimeout(…, 0) で後回しにする（先に閉じると押したボタンの処理が走らない）。
// offsetParent が null＝そのボタンが非表示（スマホなど）なので、表示されている別のボタンを基準にする
document.addEventListener('click', e => {
  const a = e.target.closest('#addBtn, #lpAdd'); if(a){ togglePop('addMenu', a); return; }
  if(e.target.closest('#libBtn, #addLib')){ const b = $('#libBtn'); togglePop('libMenu', b.offsetParent ? b : $('#addBtn')); renderLib(); return; }
  const cv = e.target.closest('#canvasBtn, #openCanvasMenu'); if(cv){ togglePop('canvasMenu', $('#canvasBtn').offsetParent ? $('#canvasBtn') : $('#fileBtn')); return; }
  const f = e.target.closest('#fileBtn'); if(f){ togglePop('fileMenu', f); return; }
  if(e.target.closest('#addBgImg')){ $('#bgimgfile').click(); }
  if(e.target.closest('#mbar [data-sheet=add]')) return;   // 下バーの「追加」は mobile.js が togglePop を呼ぶので、ここで閉じない
  // 追加メニューは項目を選んだら閉じる（素材置き場へのボタンだけは続けて操作するので残す）
  const pop = e.target.closest('.pop');
  if(!pop || (pop.id === 'addMenu' && e.target.closest('button') && !e.target.closest('#addLib'))) setTimeout(() => document.querySelectorAll('.pop.show').forEach(p => p.classList.remove('show')), 0);
});
document.addEventListener('keydown', e => { if(e.key === 'Escape') document.querySelectorAll('.pop.show').forEach(p => p.classList.remove('show')); });
