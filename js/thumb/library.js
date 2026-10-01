/* 楽ちんサムネメーカー：素材置き場（いつも使う画像と文字スタイルを、このブラウザの中にストックする）
   保存先は IndexedDB（'lib'）。使える量に上限を決めてあり、いっぱいになったら保存できない（理由を画面に出す）。
   別の端末へは「バックアップ（JSON）」の書き出し・読み込みで持ち運ぶ */
const LIB_MAX_BYTES = 200 * 1048576, LIB_MAX_ITEM = 12 * 1048576, LIB_MAX_COUNT = 500, LIB_WARN = 0.8, LIB_NAME_MAX = 24;
let LIB = [], libTab = LS.get('ttm_libtab', 'img'), libOk = true;
const fmtBytes = b => b >= 1048576 ? (b / 1048576).toFixed(b >= 10 * 1048576 ? 0 : 1) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB';
const libUsed = () => LIB.reduce((a, i) => a + (i.bytes || 0), 0);
const libItems = kind => LIB.filter(i => i.kind === kind);
// 保存済みの文字スタイル（「プリセット」の「マイ」に出るもの）
const myStyles = () => libItems('style');

const libTx = (mode, fn) => idb().then(db => new Promise((res, rej) => {
  const tx = db.transaction('lib', mode), r = fn(tx.objectStore('lib'));
  tx.oncomplete = () => res(r && r.result); tx.onerror = tx.onabort = () => rej(tx.error || new Error('保存に失敗しました'));
}));
const blobToDataUrl = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
const dataUrlToBlob = u => { const [h, d] = u.split(','), mime = (h.match(/:(.*?);/) || [])[1] || 'image/png', bin = atob(d), a = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], {type: mime}); };
function makeThumb(img, n = 96){
  const c = mk(n, n), x = c.getContext('2d'), s = Math.min(n / img.naturalWidth, n / img.naturalHeight);
  x.drawImage(img, (n - img.naturalWidth * s) / 2, (n - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
  return c.toDataURL('image/png');
}

// 保存してよいか調べる。だめなときは理由（ユーザーに見せる文）を返す
async function libCheck(bytes, kind){
  if(!libOk) return 'このブラウザでは、素材置き場の保存領域が使えません（プライベートモードなど）';
  if(kind === 'img' && bytes > LIB_MAX_ITEM) return `1つの画像は ${fmtBytes(LIB_MAX_ITEM)} までです（この画像は ${fmtBytes(bytes)}）`;
  if(LIB.length >= LIB_MAX_COUNT) return `素材は ${LIB_MAX_COUNT} 個までです。不要なものを削除してください`;
  if(libUsed() + bytes > LIB_MAX_BYTES) return `素材置き場がいっぱいです（使用 ${fmtBytes(libUsed())} ／ 上限 ${fmtBytes(LIB_MAX_BYTES)}）。不要な素材を削除してください`;
  try{ const e = await navigator.storage.estimate(); if(e && e.quota && e.quota - e.usage < bytes + 20 * 1048576) return 'ブラウザの保存できる空き容量が足りません。ほかのサイトのデータを整理してください'; }catch{}
  return '';
}
function libFail(msg){ toast(msg, true); libFlash(msg); }
async function libSave(item){
  const why = await libCheck(item.bytes, item.kind); if(why){ libFail(why); return false; }
  try{ await libTx('readwrite', st => st.put(item)); }
  catch(e){ libFail(e && e.name === 'QuotaExceededError' ? 'ブラウザの保存容量がいっぱいで保存できませんでした' : '保存できませんでした'); return false; }
  LIB.push(item); renderLib();
  try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist(); }catch{}   // ブラウザに勝手に消されにくくする（許可されれば）
  return true;
}
async function libDelete(id){
  try{ await libTx('readwrite', st => st.delete(id)); }catch{ libFail('削除できませんでした'); return; }
  LIB = LIB.filter(i => i.id !== id); renderLib(); if(typeof renderPresets === 'function') renderPresets();
}
const libName = s => String(s || '').replace(/\.[^.]+$/, '').trim().slice(0, LIB_NAME_MAX) || '無題';

async function libAddImageSrc(src, name){
  const img = await loadImg(src), blob = dataUrlToBlob(src), thumb = makeThumb(img);
  if(LIB.some(i => i.kind === 'img' && i.name === libName(name) && i.size === blob.size)){ toast('同じ画像がすでに登録されています', true); return false; }
  const item = {id:'M' + uid(), kind:'img', name:libName(name), blob, thumb, size:blob.size, w:img.naturalWidth, h:img.naturalHeight, bytes:blob.size + thumb.length, created:Date.now()};
  return libSave(item);
}
async function libAddFiles(files){
  let ok = 0;
  for(const f of files){
    if(!/^image\//.test(f.type)) continue;
    try{ if(await libAddImageSrc(await fileToSrc(f), f.name)) ok++; else if(!libOk || libUsed() >= LIB_MAX_BYTES) break; }catch{ toast(`「${f.name}」を読み込めませんでした`, true); }
  }
  if(ok) toast(`${ok}枚を素材に登録しました（使用 ${fmtBytes(libUsed())} ／ ${fmtBytes(LIB_MAX_BYTES)}）`);
}
async function libAddStyle(name, style){
  const s = clone(style); for(const k of ['text', 'pad', 'scale', 'size']) delete s[k];
  if(!s.vertical) for(const k of ['vertical', 'vlat', 'vtcy']) delete s[k];   // 横書きのスタイルは向きを持たない（適用先の向きを変えない）
  const json = JSON.stringify(s);
  const item = {id:'M' + uid(), kind:'style', name:libName(name) || 'マイ設定', s, bytes:json.length * 2 + 200, created:Date.now()};
  if(await libSave(item)){ toast(`文字スタイル「${item.name}」を登録しました`); if(typeof renderPresets === 'function') renderPresets(); return true; }
  return false;
}
async function libUseImage(it){
  const id = await addAsset(await blobToDataUrl(it.blob), it.name), L = newImageLayer(id, it.name);
  DOC.layers.push(L); selectLayer(L.id); docChanged(false); toast(`「${it.name}」を追加しました`);
}
function libUseStyle(it){
  applyPreset(it.s); if(DOC.mode === 'thumb') docChanged(false); toast(`文字スタイル「${it.name}」を適用しました`);
}

/* ---------- バックアップ（書き出し・読み込み） ---------- */
async function libExport(){
  if(!LIB.length){ toast('書き出す素材がありません', true); return; }
  const items = [];
  for(const i of LIB) items.push(i.kind === 'img' ? {id:i.id, kind:'img', name:i.name, created:i.created, src:await blobToDataUrl(i.blob)} : {id:i.id, kind:'style', name:i.name, created:i.created, s:i.s});
  downloadBlob(new Blob([JSON.stringify({app:'rakuchin-thumb-maker', type:'library', v:1, items})], {type:'application/json'}), `素材置き場_${stamp().slice(0, 8)}.json`);
  LS.set('ttm_libbackup', Date.now()); renderLib(); toast(`${items.length}個の素材をバックアップしました`);
}
async function libImport(file){
  let j; try{ j = JSON.parse(await file.text()); }catch{ toast('読み込めませんでした（素材置き場のバックアップではありません）', true); return; }
  if(!j || j.type !== 'library' || !Array.isArray(j.items)){ toast('素材置き場のバックアップではありません', true); return; }
  let ok = 0, dup = 0, skip = 0, reason = '';
  for(const it of j.items){
    if(!it || LIB.some(l => l.id === it.id)){ dup++; continue; }
    if(it.kind === 'img' && typeof it.src === 'string'){
      try{
        const img = await loadImg(it.src), blob = dataUrlToBlob(it.src), thumb = makeThumb(img);
        const item = {id:it.id, kind:'img', name:libName(it.name), blob, thumb, size:blob.size, w:img.naturalWidth, h:img.naturalHeight, bytes:blob.size + thumb.length, created:it.created || Date.now()};
        const why = await libCheck(item.bytes, 'img'); if(why){ skip++; reason = why; continue; }
        await libTx('readwrite', st => st.put(item)); LIB.push(item); ok++;
      }catch{ skip++; }
    }else if(it.kind === 'style' && it.s && typeof it.s === 'object'){
      const item = {id:it.id, kind:'style', name:libName(it.name), s:it.s, bytes:JSON.stringify(it.s).length * 2 + 200, created:it.created || Date.now()};
      const why = await libCheck(item.bytes, 'style'); if(why){ skip++; reason = why; continue; }
      try{ await libTx('readwrite', st => st.put(item)); LIB.push(item); ok++; }catch{ skip++; }
    }
  }
  renderLib(); if(typeof renderPresets === 'function') renderPresets();
  const msg = `${ok}個を読み込みました` + (dup ? `（登録済み ${dup}個はそのまま）` : '') + (skip ? `。${skip}個は保存できませんでした：${reason}` : '');
  toast(msg, skip > 0); if(skip) libFlash(reason);
}

/* ---------- 画面 ---------- */
let libFlashT = 0;
function libFlash(msg){ const el = $('#libFull'); if(!el) return; el.textContent = msg; el.hidden = false; clearTimeout(libFlashT); libFlashT = setTimeout(renderLib, 6000); }
function renderLib(){
  const el = $('#libGrid'); if(!el) return;
  const used = libUsed(), pct = Math.min(100, used / LIB_MAX_BYTES * 100), full = used >= LIB_MAX_BYTES || LIB.length >= LIB_MAX_COUNT, warn = used / LIB_MAX_BYTES >= LIB_WARN;
  $('#libBar').style.width = pct + '%'; $('#libBar').dataset.lv = full ? 'full' : warn ? 'warn' : 'ok';
  $('#libUse').textContent = `使用 ${fmtBytes(used)} ／ 上限 ${fmtBytes(LIB_MAX_BYTES)}（${pct < 1 && used ? '1未満' : Math.round(pct)}%）`;
  $('#libCount').textContent = `画像 ${libItems('img').length}個・文字スタイル ${libItems('style').length}個（最大 ${LIB_MAX_COUNT}個）`;
  const fl = $('#libFull'); clearTimeout(libFlashT);
  fl.hidden = !(full || warn || !libOk);
  fl.dataset.lv = full || !libOk ? 'full' : 'warn';
  fl.textContent = !libOk ? 'このブラウザでは、素材置き場の保存領域が使えません（プライベートモードなど）。' : full ? '素材置き場がいっぱいです。これ以上は保存できません。不要な素材を削除するか、バックアップを書き出して整理してください。' : `もうすぐいっぱいです（残り ${fmtBytes(LIB_MAX_BYTES - used)}）。`;
  document.querySelectorAll('#libMenu [data-lt]').forEach(b => b.classList.toggle('on', b.dataset.lt === libTab));
  document.querySelectorAll('#libMenu [data-lpane]').forEach(p => { p.hidden = p.dataset.lpane !== libTab; });
  document.querySelectorAll('#libAddImg, #libRegImg, #libRegStyle').forEach(b => { b.disabled = full || !libOk; b.title = full ? 'いっぱいで保存できません' : ''; });
  const L = selLayer(); $('#libRegImg').disabled = full || !libOk || !(L && L.type === 'image');
  const bk = LS.get('ttm_libbackup', 0); $('#libBackup').textContent = bk ? `最後のバックアップ：${new Date(bk).toLocaleDateString('ja-JP')}` : 'バックアップはまだありません';
  if(libTab === 'img'){
    const it = libItems('img').sort((a, b) => b.created - a.created);
    el.className = 'libgrid';
    el.innerHTML = it.length ? it.map(i => `<div class="libcard" data-lid="${i.id}" title="クリックでキャンバスに追加"><span class="th"><img src="${i.thumb}" alt=""></span><b>${escapeHtml(i.name)}</b><small>${fmtBytes(i.size)}</small><span class="x" data-ldel="${i.id}" title="削除">×</span></div>`).join('') : '<p class="libempty">まだ画像がありません。「画像を追加」か、レイヤーを右クリック →「素材に登録」で入れられます。</p>';
  }else{
    const it = libItems('style').sort((a, b) => b.created - a.created);
    el.className = 'libstyles';
    el.innerHTML = it.length ? it.map(i => `<div class="libst" data-lid="${i.id}" title="クリックで今の文字に適用"><button style="${presetStyle(i.s).replace(/"/g, '&quot;')}">${escapeHtml(i.name)}</button><span class="x" data-ldel="${i.id}" title="削除">×</span></div>`).join('') : '<p class="libempty">まだ文字スタイルがありません。文字を整えてから「今の文字スタイルを登録」を押してください。</p>';
    it.forEach(i => { const f = findFont(i.s.font); if(f) ensureCss(f); });
  }
}
async function libInit(){
  try{ await idb(); LIB = await libTx('readonly', st => st.getAll()) || []; }
  catch{ libOk = false; LIB = []; }
  // 以前の「マイ」プリセット（このブラウザの小さな保存領域）を素材置き場へ移す
  const old = LS.get('ttm_mypresets', []);
  if(libOk && old.length){
    let moved = 0; for(const mp of old){ if(mp && mp.s && await libSave({id:'M' + uid(), kind:'style', name:libName(mp.name), s:mp.s, bytes:JSON.stringify(mp.s).length * 2 + 200, created:Date.now() - moved})) moved++; }
    if(moved === old.length) LS.set('ttm_mypresets', []);
  }
  renderLib(); renderPresets();
}
{
  const menu = $('#libMenu');
  menu.addEventListener('click', e => {
    e.stopPropagation();   // 一覧を描き直しても、メニューが閉じないようにする
    const t = e.target, lt = t.closest('[data-lt]'), del = t.closest('[data-ldel]'), card = t.closest('[data-lid]');
    if(lt){ libTab = lt.dataset.lt; LS.set('ttm_libtab', libTab); renderLib(); return; }
    if(del){ const it = LIB.find(i => i.id === del.dataset.ldel); if(it && confirm(`「${it.name}」を素材置き場から削除しますか？（作成中のサムネの画像は消えません）`)) libDelete(it.id); return; }
    if(card){ const it = LIB.find(i => i.id === card.dataset.lid); if(it) it.kind === 'img' ? libUseImage(it) : libUseStyle(it); return; }
    if(t.closest('#libAddImg')) $('#libFile').click();
    else if(t.closest('#libRegImg')){ const L = selLayer(), A = L && L.type === 'image' && ASSETS[L.asset]; if(A) libAddImageSrc(A.src, L.name || A.name || '画像').then(ok => { if(ok) toast(`素材に登録しました（使用 ${fmtBytes(libUsed())} ／ ${fmtBytes(LIB_MAX_BYTES)}）`); }); }
    else if(t.closest('#libRegStyle')){ const T = textLayer(); libAddStyle($('#libStyleName').value || 'マイ設定', T ? T.style : S); }
    else if(t.closest('#libExport')) libExport();
    else if(t.closest('#libImportBtn')) $('#libImport').click();
  });
  $('#libFile').onchange = e => { const fs = [...e.target.files]; e.target.value = ''; if(fs.length) libAddFiles(fs); };
  $('#libImport').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if(f) libImport(f); };
}
