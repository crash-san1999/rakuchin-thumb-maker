/* 楽ちんサムネメーカー：取り消し／やり直し */
/* 取り消し／やり直し */
let hist = [], hIdx = -1, restoring = false;
function pushHist(){
  if(restoring || !DOC) return;
  const j = JSON.stringify(DOC); if(hist[hIdx] === j) return;
  hist = hist.slice(0, hIdx + 1); hist.push(j); if(hist.length > 120) hist.shift(); hIdx = hist.length - 1;
}
function restoreHist(i){
  if(i < 0 || i >= hist.length) return;
  hIdx = i; restoring = true;
  DOC = JSON.parse(hist[i]); DOC.msel = [];
  const T = textLayer(); if(T) S = T.style;
  resetAdj(); refreshTextUI(); syncDoc(); renderLayers(); setMode(DOC.mode, true); saveDoc();
  pruneLayerCaches();
  update().then(() => { restoring = false; });
}
$('#undo').onclick = () => restoreHist(hIdx - 1);
$('#redo').onclick = () => restoreHist(hIdx + 1);
document.addEventListener('keydown', e => {
  const t = e.target, typing = t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && /text|search|number|password/.test(t.type));
  if(typing || !(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if(k === 'z' && !e.shiftKey){ e.preventDefault(); restoreHist(hIdx - 1); }
  else if((k === 'z' && e.shiftKey) || k === 'y'){ e.preventDefault(); restoreHist(hIdx + 1); }
});
