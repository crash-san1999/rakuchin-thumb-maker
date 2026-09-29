/* 楽ちんサムネメーカー：起動 */
/* ============ 起動 ============ */
initFonts(); restoreLocalFonts(); fixWeight(); buildWeight(); syncUI(); renderPresets(); renderFontList();
function thumbInit(){
  $('#selBox').innerHTML = `${SEL_ROWS.map(r => drowPg(r)).join('')}`;
  $('#bgRows').innerHTML = BG_ROWS.map(r => drowPg(r, true)).join('');
  $('#pickBg').onclick = () => $('#bgimgfile').click();
  $('#fxCenter').onclick = () => { DOC.bg.fcx = 0.5; DOC.bg.fcy = 0.5; syncDoc(); docChanged(false); };
  applyView(true);
  setMode(DOC.mode, true);
  renderInspector(true);
  syncDoc(); renderLayers();
  idbRestore();
  if(LS.get('ttm_helpAuto', 'first') !== false) setTimeout(openHelp, 400);
  window.addEventListener('resize', () => { clearTimeout(thumbInit.r); thumbInit.r = setTimeout(() => paintPreview(false), 60); });
  document.fonts.addEventListener('loadingdone', () => { if(DOC.mode === 'thumb'){ clearTimeout(thumbInit.f); thumbInit.f = setTimeout(() => paintPreview(false), 150); } });
}
document.querySelectorAll('#genSections section[data-on]').forEach(sec => { if(!getK(sec.dataset.on)) sec.classList.add('collapsed'); });
thumbInit();
update(); pushHist();
