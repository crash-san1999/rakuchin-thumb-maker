/* 楽ちんサムネメーカー：起動 */
/*
  ほかのファイルは「定義」と「操作の受け付け」だけを持ち、起動時の処理はここにまとめる。
  ここは最後に読み込まれるので、すべてのファイルの関数・定数を使える。
*/
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
function boot(){
  paintIcons();
  loadSavedDoc();
  buildTextControls();
  initFonts(); restoreLocalFonts(); fixWeight(); buildWeight(); syncUI(); renderPresets(); renderFontList();
  renderThemes();
  thumbInit();
  update(); pushHist();
  scheduleFontListCheck();
}
boot();
