/* 楽ちんサムネメーカー：文字素材モードのプレビュー・書き出し */
/* ============ プレビュー・書き出し ============ */
let tok = 0, schT;
function schedule(){
  if(DOC){ const T = textLayer(); if(T && T.style !== S) T.style = S; }
  clearTimeout(schT); schT = setTimeout(update, 40); saveDoc(); clearTimeout(histT); histT = setTimeout(pushHist, 450);
  if(DOC){ clearTimeout(schedule.lt); schedule.lt = setTimeout(() => { renderLayers(); syncDoc(); }, 200); }
}
let histT;
async function update(){
  if(DOC && DOC.mode === 'thumb') return drawThumb();
  const my = ++tok; await ensureFont(); if(my !== tok) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = render(dpr), pv = $('#pv');
  pv.width = c.width; pv.height = c.height;
  const px = pv.getContext('2d'); px.clearRect(0, 0, c.width, c.height); px.drawImage(c, 0, 0);
  pv.style.width = (c.width / dpr) + 'px';
  updateVis(); updateTextTip();
  $('#info').textContent = `書き出しサイズ 約 ${Math.round(c.width / dpr * S.scale)} × ${Math.round(c.height / dpr * S.scale)} px`;
}
function fileName(){
  const base = plainText().split('\n').join('_').replace(/[\\/:*?"<>|\s]/g, '').slice(0, 20) || 'text';
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${base}_${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
}
async function exportBlob(){ await ensureFont(); const c = render(S.scale); return new Promise(r => c.toBlob(r, 'image/png')); }
$('#dlBtn').onclick = async () => {
  if(DOC.mode === 'thumb') return exportThumb();
  const b = await exportBlob();
  if(await shareFile(b, fileName())) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = fileName(); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  toast('透過PNGを保存しました');
};
$('#copyBtn').onclick = async () => {
  try{ const th = DOC.mode === 'thumb', b = th ? await thumbBlob('png') : await exportBlob(); await navigator.clipboard.write([new ClipboardItem({'image/png': b})]); toast(th ? 'サムネをクリップボードにコピーしました' : 'クリップボードにコピーしました（透過のまま貼れるソフトに貼り付けてください）'); }
  catch(e){ toast('コピーできませんでした: ' + e.message, true); }
};
document.addEventListener('keydown', e => { if((e.ctrlKey || e.metaKey) && e.key === 's'){ e.preventDefault(); $('#dlBtn').click(); } });

/* プレビュー背景 */
$('#bgSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b) return;
  if(b.dataset.bg === 'img'){ $('#bgfile').click(); return; }
  setBg(b.dataset.bg);
});
function setBg(bg){
  $('#stage').className = 'stage ' + bg + ($('#stage').classList.contains('small') ? ' small' : '');
  document.querySelectorAll('#bgSeg button').forEach(x => x.classList.toggle('on', x.dataset.bg === bg));
}
$('#bgfile').onchange = e => {
  const f = e.target.files[0]; if(!f) return;
  const url = URL.createObjectURL(f);
  $('#stage').style.backgroundImage = `url(${url})`; setBg('img');
  bgImg = new Image(); bgImg.onload = () => { if(wantBgPalette){ wantBgPalette = false; paletteFromBg(); } }; bgImg.src = url;
};
new MutationObserver(() => { if(!$('#stage').classList.contains('img')) $('#stage').style.backgroundImage = ''; })
  .observe($('#stage'), {attributes:true, attributeFilter:['class']});

