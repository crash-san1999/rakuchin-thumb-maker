/* 楽ちんサムネメーカー：キャンバス上の当たり判定（クリック・ホイール・右クリックでどのレイヤーを掴むか） */
/*
  events-canvas.js（キャンバスの操作）・mobile.js（長押し）から使う。座標はすべて DOC 座標（キャンバスの px ではない）。
  公開：hitLayers（枠の中のレイヤー一覧）/ hitRanked（一覧＋絵の濃さの段階）/ hitLayer（掴む1つ）/ hitForWheel（ホイールで拡大縮小する1つ）/ hitMenuLayer（メニューを出す1つ）/ pruneMasks（消えたレイヤーのマスクを捨てる）
*/
// 当たり判定用のマスク（layerMask が作る）。レイヤーid → マスク。maskFx は描画中の効果キャッシュ
const maskCache = new Map(), maskFx = new Map();
// 消えたレイヤーのマスクを捨てる。render.js の pruneLayerCaches（取り消しで復元したとき）から呼ばれる
/** @param {Set<string>} ids 今あるレイヤーの id */
function pruneMasks(ids){ for(const m of [maskCache, maskFx]) for(const k of [...m.keys()]) if(!k.startsWith('__') && !ids.has(k)) m.delete(k); }
/* 当たり判定：枠（四角）の中でも、透明な部分は「当たり」にしない。
   レイヤーを単独で小さく描いた透明度マスクを作って調べる（変更がなければ使い回す）。
   2 = その位置に絵がある／1 = すぐ近く（細い文字を掴みやすくするための余裕）／0 = 枠の中だけ */
// MASK_K：当たり判定用の絵の縮小率（DOC 座標の 1/4 で描く＝軽くする）。NEAR：その絵の上で「すぐ近く」とみなす範囲（px。DOC 座標では約 16px）
const MASK_K = 0.25, NEAR = 4;
// マスクは、レイヤーの内容・キャンバス寸法・フォント数・画像の読み込み状況のどれかが変わらない限り使い回す（キーに全部入れてある）。
// 影・光彩は当たり判定に含めない（見えている本体だけを掴めるように）
/** @param {Layer} L */
const layerMask = L => {
  const key = DOC.w + 'x' + DOC.h + '|' + JSON.stringify(L) + '|' + document.fonts.size + '|' + (L.asset && ASSETS[L.asset] ? 1 : 0) + (isGroup(L) ? groupKids(L).map(k => JSON.stringify(k)).join() : '');
  let m = maskCache.get(L.id);
  if(m && m.key === key) return m;
  const W = Math.round(DOC.w * MASK_K), H = Math.round(DOC.h * MASK_K), c = mk(W, H), x = c.getContext('2d', {willReadFrequently:true});
  const keep = new Map(dims);   // 小さく描くと選択枠の大きさ（dims）も書き換わるので、終わったら戻す
  try{ drawOne(x, /** @type {Layer} */ ({...L, op:1, blend:'source-over', shadow:{...(L.shadow || {}), on:false}, glow:{...(L.glow || {}), on:false}}), MASK_K, false, maskFx); }catch(err){ console.warn('当たり判定用の絵を作れませんでした', err); }
  finally{ dims.clear(); keep.forEach((v, k) => dims.set(k, v)); }
  m = {key, W, H, a: x.getImageData(0, 0, W, H).data};
  maskCache.set(L.id, m);
  return m;
};
// その位置の「絵の濃さ」の段階：2＝絵がある（アルファ>24）／1＝すぐ近く／0＝無い。マスクを作れなかったら 0
/** @param {Layer} L */
const pixelRank = (L, x, y) => {
  let m; try{ m = layerMask(L); }catch{ return 0; }
  const cx = Math.round(x * MASK_K), cy = Math.round(y * MASK_K);
  const at = (px, py) => px >= 0 && py >= 0 && px < m.W && py < m.H && m.a[(py * m.W + px) * 4 + 3] > 24;
  if(at(cx, cy)) return 2;
  for(let dy = -NEAR; dy <= NEAR; dy++) for(let dx = -NEAR; dx <= NEAR; dx++) if(at(cx + dx, cy + dy)) return 1;
  return 0;
};
// 枠の中にある重なり順（手前が先）。rank 付き
const hitLayers = (x, y, all) => {
  const out = [];
  for(let i = DOC.layers.length - 1; i >= 0; i--){
    const L = DOC.layers[i]; if(L.hidden || (L.locked && !all)) continue;
    if(L.gid){ const G = layerById(L.gid); if(!G || G.hidden || L.id !== DOC.sel) continue; }   // グループの中身は、単独で選んでいるときだけ
    const d = dims.get(L.id); if(!d) continue;
    const a = -(L.rot || 0) * PI / 180, dx = x - L.x, dy = y - L.y;
    const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
    if(Math.abs(lx) <= d.w / 2 && Math.abs(ly) <= d.h / 2) out.push(L);
  }
  return out;
};
// 実際に絵がある（または近い）レイヤーだけ。なければ枠の中のレイヤー全部
const hitRanked = (x, y, all) => {
  const hs = hitLayers(x, y, all), r = new Map(hs.map(l => [l.id, pixelRank(l, x, y)]));
  return {hs, r};
};
// クリック位置で掴むレイヤー 1 つを決める。枠の中のレイヤーが複数あるときの優先順位は、コード内のコメントのとおり
const hitLayer = (x, y) => {
  const {hs, r} = hitRanked(x, y);
  if(hs.length < 2) return hs[0] || null;
  const cur = hs.find(l => l.id === DOC.sel);
  // 見えている一番手前の絵を優先。絵に当たっていなければ、選択中→近いもの→枠の手前、の順
  if(cur && r.get(cur.id) === 2) return cur;   // 選択中のレイヤーの絵の上なら、手前に別の絵が重なっていても選択中を優先
  const exact = hs.find(l => r.get(l.id) === 2);
  if(exact) return exact;
  if(cur && r.get(cur.id) === 1) return cur;
  return hs.find(l => r.get(l.id) === 1) || (cur || hs[0]);
};
// ホイールの拡大縮小は、選択中のレイヤーの絵の上（または近く）なら、手前に別のレイヤーがあっても選択中のほうを優先
const hitForWheel = (x, y) => {
  const {hs, r} = hitRanked(x, y), cur = hs.find(l => l.id === DOC.sel);
  return cur && r.get(cur.id) > 0 ? cur : hitLayer(x, y);
};
// メニュー（PC の右クリック・スマホの長押し）を出すレイヤー：ロック中も含め、枠の中のいちばん手前。無ければ null
const hitMenuLayer = (x, y) => hitLayers(x, y, true)[0] || null;
