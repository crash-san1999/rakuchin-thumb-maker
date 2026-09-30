/* 楽ちんサムネメーカー：画像アセット（IndexedDBに保存）・画像や背景の追加 */
/* ---------- 画像アセット（IndexedDBに保存） ---------- */
// 画像レイヤーの初期値（白フチ・影・切り抜きフレームなし）
const IMAGE_BASE = () => ({flip:false, flipV:false, outline:{on:true, w:10, c:'#ffffff'}, frame:FRAME_BASE(), shadow:{on:true, blur:30, y:14, a:0.45}});
const ASSETS = {};
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const idbReq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
let idbP = null;
function idb(){
  return idbP || (idbP = new Promise((res, rej) => {
    try{ const r = indexedDB.open('ttm', 1); r.onupgradeneeded = () => r.result.createObjectStore('assets'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }
    catch(e){ rej(e); }
  }));
}
async function idbPut(id, v){ try{ const db = await idb(); db.transaction('assets', 'readwrite').objectStore('assets').put(v, id); }catch{} }
async function addAsset(src, name, id, skipPut){
  id = id || 'A' + uid();
  const img = await loadImg(src);
  const tc = mk(72, 72), tx = tc.getContext('2d'), s = Math.min(72 / img.naturalWidth, 72 / img.naturalHeight);
  tx.drawImage(img, (72 - img.naturalWidth * s) / 2, (72 - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
  ASSETS[id] = {img, src, name, thumb: tc.toDataURL()};
  if(!skipPut) idbPut(id, {src, name});
  return id;
}
async function fileToSrc(file){
  const src = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const img = await loadImg(src), mx = Math.max(img.naturalWidth, img.naturalHeight), LIM = 3840;
  if(mx <= LIM) return src;
  const k = LIM / mx, c = mk(img.naturalWidth * k, img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return file.type === 'image/jpeg' ? c.toDataURL('image/jpeg', 0.92) : c.toDataURL('image/png');
}
async function idbRestore(){
  try{
    const db = await idb(), st = db.transaction('assets').objectStore('assets');
    const [keys, vals] = await Promise.all([idbReq(st.getAllKeys()), idbReq(st.getAll())]);
    const used = usedAssets();
    for(let i = 0; i < keys.length; i++){
      if(used.has(keys[i])){ if(!ASSETS[keys[i]]) await addAsset(vals[i].src, vals[i].name, keys[i], true); }
      else db.transaction('assets', 'readwrite').objectStore('assets').delete(keys[i]);
    }
  }catch{}
  renderLayers(); paintPreview(false);
}
async function addImageLayers(files, skipCollage){
  if(!skipCollage){ files = await collageTakeFiles(files.filter(f => /^image\//.test(f.type))); if(!files.length) return; }
  let last = null;
  for(const f of files){
    if(!/^image\//.test(f.type)) continue;
    const id = await addAsset(await fileToSrc(f), f.name), A = ASSETS[id];
    const sc = Math.min(DOC.h * 0.85 / A.img.naturalHeight, DOC.w * 0.5 / A.img.naturalWidth);
    const L = Object.assign(LAYER_BASE(), IMAGE_BASE(), {id:uid(), type:'image', name:f.name.replace(/\.[^.]+$/, ''), asset:id, x:Math.round(DOC.w * 0.74), y:Math.round(DOC.h * 0.56), sc});
    DOC.layers.push(L); last = L.id;
  }
  if(last){ openInspector(); selectLayer(last); docChanged(false); toast('画像を追加しました。ドラッグで移動、角で拡大、上の丸で回転できます'); }
}
async function setBgFromFile(f){
  const id = await addAsset(await fileToSrc(f), f.name);
  Object.assign(DOC.bg, {asset:id, type:'image', zoom:1, ox:0, oy:0});
  syncDoc(); docChanged(false);
  if(wantBgPalette){ wantBgPalette = false; bgImg = ASSETS[id].img; paletteFromBg(); }
}
