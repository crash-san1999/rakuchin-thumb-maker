/* 楽ちんサムネメーカー：ポップアップ（操作ガイド・追加メニュー・ファイルメニュー） */
/* 操作ガイド */
function openHelp(){ $('#help').classList.add('show'); $('#helpNoAuto').checked = LS.get('ttm_helpAuto', false) === true; }
function closeHelp(){ $('#help').classList.remove('show'); LS.set('ttm_helpAuto', $('#helpNoAuto').checked); }
$('#helpBtn').onclick = openHelp;
$('#help').addEventListener('click', e => { if(e.target.id === 'help' || e.target.closest('[data-help-close]')) closeHelp(); });
$('#helpNoAuto').addEventListener('change', e => LS.set('ttm_helpAuto', e.target.checked));
document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && $('#help').classList.contains('show')){ closeHelp(); return; }
  if(isTyping(e)) return;
  if(e.key === '?' && !e.ctrlKey && !e.metaKey){ e.preventDefault(); openHelp(); }
});

/* ポップアップメニュー（追加・ファイル） */
function togglePop(id, anchor){
  const el = document.getElementById(id), open = !el.classList.contains('show');
  document.querySelectorAll('.pop.show').forEach(p => p.classList.remove('show'));
  if(!open) return;
  el.classList.add('show');
  if(isMobile){ el.style.left = ''; el.style.top = ''; return; }
  const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  el.style.left = clamp(r.left, 8, innerWidth - w - 8) + 'px'; el.style.top = clamp(r.bottom + 8, 8, innerHeight - h - 8) + 'px';
}
document.addEventListener('click', e => {
  const a = e.target.closest('#addBtn, #lpAdd'); if(a){ togglePop('addMenu', a); return; }
  if(e.target.closest('#libBtn, #addLib')){ const b = $('#libBtn'); togglePop('libMenu', b.offsetParent ? b : $('#addBtn')); renderLib(); return; }
  const cv = e.target.closest('#canvasBtn, #openCanvasMenu'); if(cv){ togglePop('canvasMenu', $('#canvasBtn').offsetParent ? $('#canvasBtn') : $('#fileBtn')); return; }
  const f = e.target.closest('#fileBtn'); if(f){ togglePop('fileMenu', f); return; }
  if(e.target.closest('#addBgImg')){ $('#bgimgfile').click(); }
  if(e.target.closest('#mbar [data-sheet=add]')) return;
  const pop = e.target.closest('.pop');
  if(!pop || (pop.id === 'addMenu' && e.target.closest('button') && !e.target.closest('#addLib'))) setTimeout(() => document.querySelectorAll('.pop.show').forEach(p => p.classList.remove('show')), 0);
});
document.addEventListener('keydown', e => { if(e.key === 'Escape') document.querySelectorAll('.pop.show').forEach(p => p.classList.remove('show')); });
