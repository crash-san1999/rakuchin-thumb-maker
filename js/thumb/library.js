/* 楽ちんサムネメーカー：素材置き場（いつも使う画像と文字スタイルを、このブラウザの中にストックする）
   保存先は IndexedDB（'lib'）。使える量に上限を決めてあり、いっぱいになったら保存できない（理由を画面に出す）。
   別の端末へは「バックアップ（JSON）」の書き出し・読み込みで持ち運ぶ */
/*
  役割：素材置き場（画像・文字スタイルのストック）の保存・容量管理・一覧表示・バックアップ。
  主な公開：LIB（メモリ上の全素材）/ libInit / libAddFiles・libAddImageSrc・libAddStyle / libUseImage・libUseStyle /
           libDelete / libExport・libImport / renderLib / myStyles / fmtBytes・libUsed
  素材1件の形（IndexedDB 'lib' ストアに keyPath:'id' でそのまま保存。LIB はその写し）：
    画像  {id, kind:'img', name, blob, thumb(96px の dataURL), size(blob の byte), w, h, bytes, created}
    文字  {id, kind:'style', name, s(文字スタイル), bytes, created}
    bytes は容量計算用の見積もり（画像は blob+サムネ、文字スタイルは JSON 長×2+200）。
  保存先の使い分け：画像は大きいので IndexedDB（assets.js の idb() と同じ DB 'ttm'）。画像本体は Blob のまま入れる（dataURL より小さい）。
    小さな設定（開いているタブ ttm_libtab・最後のバックアップ日 ttm_libbackup）だけ localStorage。
    JSON にできないので、バックアップ（書き出し）のときだけ Blob を dataURL に変える。
  依存：idb（assets.js）、addAsset・newImageLayer・fileToSrc・loadImg（assets.js）、applyPreset・renderPresets・presetStyle（presets.js）、
       selLayer・textLayer・uid（doc.js）、downloadBlob・stamp・toast・LS（core.js）。読み込み順は assets.js より前だが、関数は呼ばれる時点で参照するので問題ない。
  呼び出し元：main.js（libInit）、layers.js（右クリック「素材に登録」）、events.js（ドロップ・プロジェクトを開くとき型が library なら libImport）。
*/
// 上限：全体 200MB・画像1枚 12MB・500 個。ブラウザの保存領域を使い切って他の保存（作業データ）まで失敗しないよう、こちらで先に止める。
// LIB_WARN は使用率がこの割合を超えたら「もうすぐいっぱい」と表示する閾値
const LIB_MAX_BYTES = 200 * 1048576, LIB_MAX_ITEM = 12 * 1048576, LIB_MAX_COUNT = 500, LIB_WARN = 0.8, LIB_NAME_MAX = 24;
// libOk：IndexedDB が使えるか（プライベートモードなどで false。false の間は保存系をすべて断る）
let LIB = [], libTab = LS.get('ttm_libtab', 'img'), libOk = true;
const fmtBytes = b => b >= 1048576 ? (b / 1048576).toFixed(b >= 10 * 1048576 ? 0 : 1) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB';
const libUsed = () => LIB.reduce((a, i) => a + (i.bytes || 0), 0);
const libItems = kind => LIB.filter(i => i.kind === kind);
// 保存済みの文字スタイル（「プリセット」の「マイ」に出るもの）
const myStyles = () => libItems('style');

// 'lib' ストアへのトランザクション。fn(store) の結果は「トランザクションが完了してから」返す（書き込みが確定する前に成功扱いにしない）
const libTx = (mode, fn) => idb().then(db => new Promise((res, rej) => {
  const tx = db.transaction('lib', mode), r = fn(tx.objectStore('lib'));
  tx.oncomplete = () => res(r && r.result); tx.onerror = tx.onabort = () => rej(tx.error || new Error('保存に失敗しました'));
}));
const blobToDataUrl = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
const dataUrlToBlob = u => { const [h, d] = u.split(','), mime = (h.match(/:(.*?);/) || [])[1] || 'image/png', bin = atob(d), a = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], {type: mime}); };
// 縦横比を保って n px 角の中央に収めたサムネ（dataURL）。一覧表示用で、本体を毎回デコードしないため
function makeThumb(img, n = 96){
  const c = mk(n, n), x = c.getContext('2d'), s = Math.min(n / img.naturalWidth, n / img.naturalHeight);
  x.drawImage(img, (n - img.naturalWidth * s) / 2, (n - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
  return c.toDataURL('image/png');
}

// 保存してよいか調べる。だめなときは理由（ユーザーに見せる文）を返し、よいときは空文字。
// 最後のブラウザ空き容量チェックは、estimate が使えない環境では黙って通す。20MB は「今回の保存 + 作業データ用」の余裕
async function libCheck(bytes, kind){
  if(!libOk) return 'このブラウザでは、素材置き場の保存領域が使えません（プライベートモードなど）';
  if(kind === 'img' && bytes > LIB_MAX_ITEM) return `1つの画像は ${fmtBytes(LIB_MAX_ITEM)} までです（この画像は ${fmtBytes(bytes)}）`;
  if(LIB.length >= LIB_MAX_COUNT) return `素材は ${LIB_MAX_COUNT} 個までです。不要なものを削除してください`;
  if(libUsed() + bytes > LIB_MAX_BYTES) return `素材置き場がいっぱいです（使用 ${fmtBytes(libUsed())} ／ 上限 ${fmtBytes(LIB_MAX_BYTES)}）。不要な素材を削除してください`;
  try{ const e = await navigator.storage.estimate(); if(e && e.quota && e.quota - e.usage < bytes + 20 * 1048576) return 'ブラウザの保存できる空き容量が足りません。ほかのサイトのデータを整理してください'; }catch{}
  return '';
}
function libFail(msg){ toast(msg, true); libFlash(msg); }
// 保存の順序：検査 → IndexedDB へ書き込み → 成功したら LIB（メモリ）に追加。先に LIB に入れると、保存失敗なのに画面に残ってしまう
async function libSave(item){
  const why = await libCheck(item.bytes, item.kind); if(why){ libFail(why); return false; }
  try{ await libTx('readwrite', st => st.put(item)); }
  catch(e){ libFail(e && e.name === 'QuotaExceededError' ? 'ブラウザの保存容量がいっぱいで保存できませんでした' : '保存できませんでした'); return false; }
  LIB.push(item); renderLib();
  // 一度でも保存できたら永続化を依頼する。許可されなくても動作には影響しない
  try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist(); }catch{}   // ブラウザに勝手に消されにくくする（許可されれば）
  return true;
}
async function libDelete(id){
  try{ await libTx('readwrite', st => st.delete(id)); }catch{ libFail('削除できませんでした'); return; }
  LIB = LIB.filter(i => i.id !== id); renderLib(); if(typeof renderPresets === 'function') renderPresets();
}
// 表示名：拡張子を除き、24 文字までに切る。空なら「無題」
const libName = s => String(s || '').replace(/\.[^.]+$/, '').trim().slice(0, LIB_NAME_MAX) || '無題';

// 同じ名前・同じバイト数の画像は重複とみなして登録しない（簡易判定。中身のハッシュは取らない）
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
// 文字スタイルの登録。文字内容（text）・余白・大きさ（scale/size）は、適用先ごとに違うので保存しない（スタイルだけを移す）
async function libAddStyle(name, style){
  const s = clone(style); for(const k of ['text', 'pad', 'scale', 'size']) delete s[k];
  if(!s.vertical) for(const k of ['vertical', 'vlat', 'vtcy']) delete s[k];   // 横書きのスタイルは向きを持たない（適用先の向きを変えない）
  const json = JSON.stringify(s);
  const item = {id:'M' + uid(), kind:'style', name:libName(name) || 'マイ設定', s, bytes:json.length * 2 + 200, created:Date.now()};
  if(await libSave(item)){ toast(`文字スタイル「${item.name}」を登録しました`); if(typeof renderPresets === 'function') renderPresets(); return true; }
  return false;
}
// 素材の画像をキャンバスに追加。素材置き場の Blob を dataURL にして新しいアセットとして登録する（DOC のアセットは素材置き場とは独立。素材を削除しても作成中のサムネの画像は消えない）
async function libUseImage(it){
  const id = await addAsset(await blobToDataUrl(it.blob), it.name), L = newImageLayer(id, it.name);
  DOC.layers.push(L); selectLayer(L.id); docChanged(false); toast(`「${it.name}」を追加しました`);
}
function libUseStyle(it){
  applyPreset(it.s); if(DOC.mode === 'thumb') docChanged(false); toast(`文字スタイル「${it.name}」を適用しました`);
}

/* ---------- バックアップ（書き出し・読み込み） ---------- */
// バックアップ形式：{app:'rakuchin-thumb-maker', type:'library', v:1, items:[…]}。画像は src（dataURL）で持つ。v は形式の版（将来変える場合に読み分ける）
async function libExport(){
  if(!LIB.length){ toast('書き出す素材がありません', true); return; }
  const items = [];
  for(const i of LIB) items.push(i.kind === 'img' ? {id:i.id, kind:'img', name:i.name, created:i.created, src:await blobToDataUrl(i.blob)} : {id:i.id, kind:'style', name:i.name, created:i.created, s:i.s});
  downloadBlob(new Blob([JSON.stringify({app:'rakuchin-thumb-maker', type:'library', v:1, items})], {type:'application/json'}), `素材置き場_${stamp().slice(0, 8)}.json`);
  LS.set('ttm_libbackup', Date.now()); renderLib(); toast(`${items.length}個の素材をバックアップしました`);
}
// 取り込み：id が同じものは登録済みとして飛ばす（二重取り込みの防止）。1件ずつ容量検査し、入らなかったものは数えて最後にまとめて知らせる（途中で止めない）
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
// 失敗理由を一覧の上の帯に 6 秒だけ出す（トーストは流れてしまうので、容量の理由は画面にも残す）。時間が来たら renderLib が通常表示へ戻す
let libFlashT = 0;
function libFlash(msg){ const el = $('#libFull'); if(!el) return; el.textContent = msg; el.hidden = false; clearTimeout(libFlashT); libFlashT = setTimeout(renderLib, 6000); }
// 一覧と容量表示を作り直す。使用率 80%（LIB_WARN）で警告、上限・個数満杯で「いっぱい」にして、追加系ボタンを無効にする
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
  // 「選択中の画像を登録」は、画像レイヤーを選んでいるときだけ押せる
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
// 起動時：素材を全部読み込む。IndexedDB が開けなければ libOk=false にして、以降の保存を断る（一覧は空）
async function libInit(){
  try{ await idb(); LIB = await libTx('readonly', st => st.getAll()) || []; }
  catch{ libOk = false; LIB = []; }
  // 旧データ互換：以前の「マイ」プリセット（localStorage の ttm_mypresets）を素材置き場へ移す。
  // 全件移せたときだけ元を空にする（一部失敗したら残して、次回の起動でやり直す）。created をずらすのは、一覧（新しい順）で元の並びを保つため
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
