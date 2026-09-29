/* 楽ちんサムネメーカー：起動 */
/* ============ 起動 ============ */
initFonts(); restoreLocalFonts(); fixWeight(); buildWeight(); syncUI(); renderPresets(); renderFontList();
document.querySelectorAll('#genSections section[data-on]').forEach(sec => { if(!getK(sec.dataset.on)) sec.classList.add('collapsed'); });
thumbInit();
update(); pushHist();
