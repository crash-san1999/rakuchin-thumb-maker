/* 楽ちんサムネメーカー：画像アセット（IndexedDBに保存）・画像や背景の追加 */
/* ---------- 画像アセット（IndexedDBに保存） ---------- */
// 画像レイヤーの初期値（白フチ・影・切り抜きフレームなし）
const IMAGE_BASE = () => ({crop:{t:0, b:0, l:0, r:0}, flip:false, flipV:false, bright:0, sat:0, outline:{on:true, w:10, c:'#ffffff'}, frame:FRAME_BASE(), shadow:{on:true, blur:30, y:14, a:0.45}});
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

// 画像の表示範囲（上下左右のトリミング）。値は 0〜0.9、向かい合う辺の合計は 0.95 まで
function cropClamp(c){
  const n = v => clamp(+v || 0, 0, 0.9), o = {t:n(c && c.t), b:n(c && c.b), l:n(c && c.l), r:n(c && c.r)};
  o.b = Math.min(o.b, 0.95 - o.t); o.r = Math.min(o.r, 0.95 - o.l); return o;
}
const cropOf = L => cropClamp(L.crop);
const cropOn = L => { const c = cropOf(L); return c.t > 0 || c.b > 0 || c.l > 0 || c.r > 0; };
// 元の画像のどこを使うか（ピクセル）
function cropRect(L, iw, ih){
  const c = cropOf(L), sx = Math.round(c.l * iw), sy = Math.round(c.t * ih);
  return {sx, sy, sw: Math.max(8, Math.round(iw * (1 - c.l - c.r))), sh: Math.max(8, Math.round(ih * (1 - c.t - c.b)))};
}
// 切り取った絵を持つ、元の画像と同じ形の入れ物を返す（トリミングなしなら元のまま）。レイヤーごとに1枚だけ持つ
const cropCache = new Map();
function layerSrc(L){
  const A = ASSETS[L.asset]; if(!A || !cropOn(L)) return A;
  const r = cropRect(L, A.img.naturalWidth, A.img.naturalHeight), key = [L.asset, r.sx, r.sy, r.sw, r.sh].join(',');
  const e = cropCache.get(L.id); if(e && e.key === key) return e.obj;
  const cv = mk(r.sw, r.sh); cv.getContext('2d').drawImage(A.img, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh);
  cv.naturalWidth = r.sw; cv.naturalHeight = r.sh;
  const obj = {img: cv, name: A.name}; cropCache.set(L.id, {key, obj}); return obj;
}
// トリミングを変える。見えている部分が動かないように、レイヤーの位置（フレームがあるときはフレームの中心）を補正する
function applyCropChange(L, change){
  const A = ASSETS[L.asset], iw = A ? A.img.naturalWidth : 1, ih = A ? A.img.naturalHeight : 1;
  const r0 = cropRect(L, iw, ih), fr = L.frame && L.frame.shape !== 'none' ? L.frame : null;
  const P = fr ? [r0.sx + (fr.cx ?? 0.5) * r0.sw, r0.sy + (fr.cy ?? 0.5) * r0.sh] : null;
  change(); L.crop = cropClamp(L.crop);
  const r1 = cropRect(L, iw, ih);
  if(fr){ fr.cx = Math.round(clamp((P[0] - r1.sx) / r1.sw, 0, 1) * 1000) / 1000; fr.cy = Math.round(clamp((P[1] - r1.sy) / r1.sh, 0, 1) * 1000) / 1000; return; }
  const u = (r1.sx + r1.sw / 2 - r0.sx - r0.sw / 2) * (L.flip ? -1 : 1), v = (r1.sy + r1.sh / 2 - r0.sy - r0.sh / 2) * (L.flipV ? -1 : 1);
  const a = (L.rot || 0) * PI / 180, dx = u * L.sc, dy = v * L.sc;
  L.x += dx * Math.cos(a) - dy * Math.sin(a); L.y += dx * Math.sin(a) + dy * Math.cos(a);
}
