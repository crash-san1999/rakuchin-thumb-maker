/* 楽ちんサムネメーカー：画像アセット（IndexedDBに保存）・画像や背景の追加 */
/*
  役割：読み込んだ画像の実体（ASSETS）を管理し、IndexedDB に永続化して、ページを開き直したときに復元する。
       画像レイヤー・背景への追加と、画像のトリミング（crop）→背景透過（cut）の描画元を作る処理もここ。
  主な公開：ASSETS / addAsset / idb・idbPut・idbRestore / fileToSrc / addImageLayers / setBgFromFile / newImageLayer /
           IMAGE_BASE / cropClamp・cropRect・cropSrc・layerSrc・applyCropChange
  データの持ち方：ASSETS[id] = {img:HTMLImageElement, src:dataURL, name, thumb:72px のdataURL}。
    DOC には id（layer.asset / bg.asset）しか入れない。DOC は localStorage（容量が小さい）、画像本体は IndexedDB（'ttm' の 'assets'）と分けているのはそのため。
    IndexedDB は DB 'ttm' を素材置き場（library.js の 'lib' ストア）と共用する。
  依存：uid（doc.js）、mk・clamp・toast（core.js）、cutCache・cutSrc・cutOn（cutout.js）、collageTakeFiles（collage.js）。
  呼び出し元：main.js（起動時 idbRestore）、events.js（ドロップ・貼り付け・プロジェクトを開く）、library.js、render.js（layerSrc）。
*/
/* ---------- 画像アセット（IndexedDBに保存） ---------- */
// 画像レイヤーの初期値（白フチ・影・切り抜きフレームなし）
const IMAGE_BASE = () => ({crop:{t:0, b:0, l:0, r:0}, key:KEY_BASE(), strokes:[], btool:'erase', bsz:60, flip:false, flipV:false, bright:0, sat:0, outline:{on:false, w:10, c:'#ffffff', style:'solid', c2:'#ffd400', w2:6, blur:0}, glow:{on:false, c:'#00e5ff', blur:24, a:0.9, str:1}, frame:FRAME_BASE(), shadow:{on:false, blur:30, y:14, a:0.45, x:0, c:'#000000', sp:0}});
// ASSETS：アセットid → 読み込み済み画像。画面上の全画像の実体で、DOC.layers / bg から id で引く
const ASSETS = {};
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const idbReq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
// DB は1回だけ開いて使い回す（Promise ごと保持）。upgrade は assets と lib のどちらのストアも無ければ作る
// （version 2：lib は素材置き場の追加で増えた。古い version 1 の DB でもデータを消さずに lib だけ増える）
let idbP = null;
function idb(){
  return idbP || (idbP = new Promise((res, rej) => {
    try{ const r = indexedDB.open('ttm', 2); r.onupgradeneeded = () => { const d = r.result; if(!d.objectStoreNames.contains('assets')) d.createObjectStore('assets'); if(!d.objectStoreNames.contains('lib')) d.createObjectStore('lib', {keyPath:'id'}); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }
    catch(e){ rej(e); }
  }));
}
// 保存は待たない（書き込み結果は tx のイベントで受ける）。容量不足などで失敗したら、画像が次回開いたときに消える旨を警告する
async function idbPut(id, v){
  const fail = () => saveWarn('画像をブラウザに保存できませんでした（容量がいっぱいの可能性）。このままだと、ページを開き直したときに画像が消えるので、「プロジェクト」から書き出して残してください');
  try{ const db = await idb(), tx = db.transaction('assets', 'readwrite'); tx.objectStore('assets').put(v, id); tx.onerror = tx.onabort = fail; }catch{ fail(); }
}
/* 画像を ASSETS に登録して id を返す。src は dataURL。
   id 省略で新規採番。skipPut=true は「すでに IndexedDB にある」ときの復元用（書き戻さない）。
   thumb は 72px 角に収めた小さな画像で、レイヤーパネルのサムネ用（本体を毎回縮小描画しないため） */
async function addAsset(src, name, id, skipPut){
  id = id || 'A' + uid();
  const img = await loadImg(src);
  const tc = mk(72, 72), tx = tc.getContext('2d'), s = Math.min(72 / img.naturalWidth, 72 / img.naturalHeight);
  tx.drawImage(img, (72 - img.naturalWidth * s) / 2, (72 - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
  ASSETS[id] = {img, src, name, thumb: tc.toDataURL()};
  if(!skipPut) idbPut(id, {src, name});
  return id;
}
// File → dataURL。長辺 3840px（4K）を超える画像は縮小する：キャンバス上限（5000px）に対して十分で、IndexedDB・メモリの節約になるため。JPEG は JPEG のまま再圧縮、それ以外は PNG（透過を守る）
async function fileToSrc(file){
  const src = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const img = await loadImg(src), mx = Math.max(img.naturalWidth, img.naturalHeight), LIM = 3840;
  if(mx <= LIM) return src;
  const k = LIM / mx, c = mk(img.naturalWidth * k, img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return file.type === 'image/jpeg' ? c.toDataURL('image/jpeg', 0.92) : c.toDataURL('image/png');
}
// 起動時：IndexedDB の画像を ASSETS に戻す。DOC が使っていない画像は、ここで削除して容量を回収する
// （使われているかは DOC の読み込みが先に終わっている前提。main.js が loadSavedDoc の後に呼ぶ）。
// 復元は非同期なので、終わってから描き直す
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
// 画像レイヤーを1枚作る（まだ DOC.layers には入れない）。初期の大きさ sc は「高さの85%・幅の半分」に収まる倍率、位置は右寄り（左に文字を置く想定のサムネ構図）
function newImageLayer(id, name){
  const A = ASSETS[id], sc = Math.min(DOC.h * 0.85 / A.img.naturalHeight, DOC.w * 0.5 / A.img.naturalWidth);
  return Object.assign(LAYER_BASE(), IMAGE_BASE(), {id:uid(), type:'image', name, asset:id, x:Math.round(DOC.w * 0.74), y:Math.round(DOC.h * 0.56), sc});
}
// 画像ファイルをレイヤーとして追加。skipCollage でなければ、先に分割フレームのマスへ入れる処理（collageTakeFiles）に渡し、残りだけをレイヤーにする
async function addImageLayers(files, skipCollage){
  if(!skipCollage){ files = await collageTakeFiles(files.filter(f => /^image\//.test(f.type))); if(!files.length) return; }
  let last = null;
  for(const f of files){
    if(!/^image\//.test(f.type)) continue;
    const id = await addAsset(await fileToSrc(f), f.name), A = ASSETS[id];
    const L = newImageLayer(id, f.name.replace(/\.[^.]+$/, ''));
    DOC.layers.push(L); last = L.id;
  }
  if(last){ openInspector(); selectLayer(last); docChanged(false); toast('画像を追加しました。ドラッグで移動、角で拡大、上の丸で回転できます'); }
}
// 背景画像に設定。位置・拡大は初期化する。wantBgPalette は「背景から配色を作る」操作の待ち状態で、画像が入った時点でパレット生成する
async function setBgFromFile(f){
  const id = await addAsset(await fileToSrc(f), f.name);
  Object.assign(DOC.bg, {asset:id, type:'image', zoom:1, ox:0, oy:0});
  syncDoc(); docChanged(false);
  if(wantBgPalette){ wantBgPalette = false; bgImg = ASSETS[id].img; paletteFromBg(); }
}

// 画像の表示範囲（上下左右のトリミング）。値は 0〜0.9、向かい合う辺の合計は 0.95 まで
// （全部切り落として画像が消えるのを防ぐ。値は元画像に対する割合なので、古い保存データや欠けたキーも 0 として扱う）
function cropClamp(c){
  const n = v => clamp(+v || 0, 0, 0.9), o = {t:n(c && c.t), b:n(c && c.b), l:n(c && c.l), r:n(c && c.r)};
  o.b = Math.min(o.b, 0.95 - o.t); o.r = Math.min(o.r, 0.95 - o.l); return o;
}
const cropOf = L => cropClamp(L.crop);
const cropOn = L => { const c = cropOf(L); return c.t > 0 || c.b > 0 || c.l > 0 || c.r > 0; };
// 元の画像のどこを使うか（ピクセル）。sw・sh を最低 8px にするのは、極端なトリミングで 0 幅の canvas ができるのを避けるため
function cropRect(L, iw, ih){
  const c = cropOf(L), sx = Math.round(c.l * iw), sy = Math.round(c.t * ih);
  return {sx, sy, sw: Math.max(8, Math.round(iw * (1 - c.l - c.r))), sh: Math.max(8, Math.round(ih * (1 - c.t - c.b)))};
}
// 切り取った絵を持つ、元の画像と同じ形の入れ物（{img, name}。img は canvas に naturalWidth/Height を足したもの）を返す。
// トリミングなしなら元の A をそのまま返す。レイヤーごとに1枚だけ持ち、アセット・範囲が変わったときだけ作り直す（キーは key）。
// 削除されたレイヤーの分は render.js の pruneLayerCaches で捨てる
const cropCache = new Map();
function cropSrc(L, A){
  if(!cropOn(L)) return A;
  const r = cropRect(L, A.img.naturalWidth, A.img.naturalHeight), key = [L.asset, r.sx, r.sy, r.sw, r.sh].join(',');
  const e = cropCache.get(L.id); if(e && e.key === key) return e.obj;
  const cv = mk(r.sw, r.sh); cv.getContext('2d').drawImage(A.img, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh);
  cv.naturalWidth = r.sw; cv.naturalHeight = r.sh;
  const obj = {img: cv, name: A.name}; cropCache.set(L.id, {key, obj}); return obj;
}
// 画像レイヤーの絵：トリミング → 背景透過 → ブラシ の順にかけたもの（どれも使っていなければ元の画像）。
// 透過・ブラシはトリミング後の絵に対して行う（無駄に切り落とす部分を処理しない）。ブラシの跡は元の画像基準の割合で持つので、トリミングを変えても跡の位置はずれない（cutout.js の cutSrc が元画像座標へ換算する）。
// 戻り値は {img, name}（ASSETS の要素と同じ形）。アセットが無い（読み込めない）ときは undefined
function layerSrc(L){
  const A = ASSETS[L.asset]; if(!A) return A;
  const S = cropSrc(L, A);
  if(!cutOn(L)){ cutCache.delete(L.id); return S; }
  return cutSrc(L, S, A);
}
// トリミングを変える（change はトリミング値を書き換える関数）。見えている部分が動かないように、レイヤーの位置（フレームがあるときはフレームの中心）を補正する
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
