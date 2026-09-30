/* 楽ちんサムネメーカー：サムネの書き出し・共有・プロジェクト読み込み */
/* ---------- 書き出し ---------- */
async function thumbBlob(fmt){
  for(const L of DOC.layers) if(L.type === 'text' && !L.hidden) await ensureFont(L.style);
  const W = DOC.exportW, H = Math.round(W * DOC.h / DOC.w), c = mk(W, H);
  if(fmt !== 'png'){ const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H); }
  exporting = true; try{ compose(c.getContext('2d'), W, H, false, new Map()); } finally { exporting = false; }
  const toB = (t, q) => new Promise(r => c.toBlob(r, t, q));
  if(fmt === 'png') return toB('image/png');
  let q = 0.93, b = await toB('image/jpeg', q);
  while(b && DOC.limit2mb && b.size > 2e6 && q > 0.45){ q -= 0.08; b = await toB('image/jpeg', q); }
  return b;
}
async function exportThumb(){
  toast('書き出し中…');
  let b; try{ b = await thumbBlob(DOC.fmt); }catch(err){ console.warn(err); }
  if(!b){ toast('書き出せませんでした。書き出しサイズを小さくしてもう一度お試しください', true); return; }
  const name = `thumbnail_${DOC.exportW}x${Math.round(DOC.exportW * DOC.h / DOC.w)}_${stamp()}.${DOC.fmt}`;
  if(await shareFile(b, name)) return;
  downloadBlob(b, name);
  toast(`サムネを保存しました（${DOC.exportW}×${Math.round(DOC.exportW * DOC.h / DOC.w)}・${(b.size / 1048576).toFixed(2)}MB）`);
}

function loadDocObj(d){
  DOC = normalizeDoc(d);
  const T = textLayer(); if(T) S = T.style;
  prevCache.clear(); dims.clear(); resetAdj();
  refreshTextUI(); syncDoc(); renderLayers(); setMode(DOC.mode); saveDoc(); pushHist();
}
/* 共有（スマホ：写真アプリに保存できる） */
async function shareFile(blob, name){
  if(!isMobile || !navigator.canShare) return false;
  const file = new File([blob], name, {type: blob.type});
  if(!navigator.canShare({files:[file]})) return false;
  try{ await navigator.share({files:[file], title:'サムネイル'}); toast('共有メニューから「画像を保存」で写真に保存できます'); return true; }
  catch(e){ if(e && e.name === 'AbortError') return true; return false; }
}
