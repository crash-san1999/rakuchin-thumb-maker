/* 楽ちんサムネメーカー：グループ（複数のレイヤーを1つにまとめて、移動・拡大縮小・回転・効果をまとめて行う）
   しくみ：グループも DOC.layers の中の1枚のレイヤー（type:'group'）。中のレイヤーには gid（グループの id）が付き、
   グループが自分の重なり順の位置で、中のレイヤーをまとめて描く。効果は、中を1枚の絵に描いてからかける（分割フレームの効果と共通）
   主な公開関数：drawOne（レイヤー種別ごとの描画の振り分け）／drawGroup／groupLayers・ungroupLayers・ungroupOne（作成・解除）／xformSnap・xformApply（まとめて移動・拡大縮小・回転）
   依存：DOC・dims・prevCache・mk・postFx・toneFilter・cellFxOn・CELL_FX_BASE（fx.js／frames.js 側）、drawLayer・drawFx・drawCollage（各レイヤー描画）。
   グループの x/y/sc/rot は保存値ではなく、描画のたびに中身から計算し直す値（drawGroup 参照）。 */
const GROUP_BASE = () => ({type:'group', label:'', open:true, fxMode:'all', fx:CELL_FX_BASE(), shadow:{on:false, blur:30, y:10, a:0.5}});
/** @param {Layer} G */
const groupKids = G => DOC.layers.filter(l => l.gid === G.id);
// 同じ階層（同じグループの中、またはグループに入っていないもの）のレイヤー。重なり順の入れ替えはこの中で行う
/** @param {Layer} L */
const peersOf = L => DOC.layers.filter(l => (l.gid || '') === (L.gid || ''));
/** @param {Layer} L */
const isGroup = L => !!L && L.type === 'group';
const layerById = id => DOC.layers.find(l => l.id === id) || null;

// 1枚のレイヤーを種別で振り分けて描く。グループの中身の描画と、通常の描画ループの両方から使う（グループは入れ子の描画もここを通る）
/** @param {Layer} L */
function drawOne(ctx, L, f, live, cache){
  if(L.type === 'fx') drawFx(ctx, L, f);
  else if(L.type === 'collage') drawCollage(ctx, L, f, live, cache);
  else if(L.type === 'group') drawGroup(ctx, L, f, live, cache);
  else drawLayer(ctx, L, f, live, cache);
}
// 中のレイヤーをすべて含む四角（ドキュメント座標）。回転しているレイヤーはその角で数える
// dims（各レイヤーの描画後の大きさ）が未登録のレイヤーは数えない＝先に描画してから呼ぶ前提。1枚も数えられなければ null
function groupBox(kids){
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for(const k of kids){
    const d = dims.get(k.id); if(!d) continue;
    const a = (k.rot || 0) * PI / 180, c = Math.cos(a), s = Math.sin(a);
    for(const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]){
      const lx = u * d.w / 2, ly = v * d.h / 2, px = k.x + lx * c - ly * s, py = k.y + lx * s + ly * c;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
  }
  return x0 > x1 ? null : {x0, y0, x1, y1};
}
// 不透明度・合成モード・効果・影があるときだけ、中を別キャンバスに描いてから1枚として重ねる（何もなければ直接描いて軽くする）
/** @param {Layer} G */
const groupNeedsCanvas = G => (G.op ?? 1) < 1 || (G.blend && G.blend !== 'source-over') || cellFxOn(G.fx) || (G.shadow && G.shadow.on && G.shadow.a > 0);
/** @param {Layer} G */
function drawGroup(ctx, G, f, live, cache){
  const kids = groupKids(G).filter(k => !k.hidden);
  const W = Math.round(DOC.w * f), H = Math.round(DOC.h * f);
  const t = groupNeedsCanvas(G) ? mk(W, H) : null, tx = t ? t.getContext('2d') : ctx;
  kids.forEach(k => drawOne(tx, k, f, live, cache));
  // 中身を描いた後でないと dims が揃わないので、四角の計算は描画のあと。選択枠などがグループを1枚として扱えるよう、位置と大きさを毎回上書きする
  const b = groupBox(kids);
  if(!b){ dims.delete(G.id); return; }
  G.x = Math.round((b.x0 + b.x1) / 2); G.y = Math.round((b.y0 + b.y1) / 2); G.sc = 1; G.rot = 0;
  dims.set(G.id, {w: b.x1 - b.x0, h: b.y1 - b.y0});
  if(!t) return;
  let src = t, off = 0; const fx = G.fx;
  if(cellFxOn(fx)){
    // 効果：ぼかしなどではみ出すぶん少し広い別のキャンバスで作ってから重ねる（分割フレームのマスと同じ手順）
    // m は余白（ぼかしの広がり＋モーションブラーの半分）。余白ぶんずらして描くので、最後に off=-m で元の位置へ戻して重ねる
    // 暗さ・色かぶり・ビネットは source-atop で、すでに絵がある（透明でない）部分にだけかける
    const m = Math.ceil(fx.blur * f * 3 + (fx.mb.on ? fx.mb.dist * f / 2 : 0)), u = mk(W + m * 2, H + m * 2), ux = u.getContext('2d');
    ux.filter = toneFilter(fx, f); ux.drawImage(t, m, m); ux.filter = 'none';
    const cx = G.x * f + m, cy = G.y * f + m, o = postFx(u, fx, f, cx, cy), ox = o.getContext('2d');
    ox.save(); ox.globalCompositeOperation = 'source-atop';
    if(fx.dim > 0){ ox.fillStyle = `rgba(0,0,0,${fx.dim})`; ox.fillRect(0, 0, o.width, o.height); }
    if(fx.tint.on && fx.tint.a > 0) tintAtop(o, fx.tint);
    if(fx.vignette > 0){
      const w = (b.x1 - b.x0) * f, h = (b.y1 - b.y0) * f, g = ox.createRadialGradient(cx, cy, Math.min(w, h) * 0.3, cx, cy, Math.hypot(w, h) / 2);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${fx.vignette})`); ox.fillStyle = g; ox.fillRect(0, 0, o.width, o.height);
    }
    // シルエット：ほかの効果の後に、絵のある部分だけを 1 色で塗る（フチ・影は別に描くので塗られない）
    if(fx.sil && fx.sil.on && fx.sil.a > 0){ ox.globalCompositeOperation = 'source-atop'; ox.globalAlpha = fx.sil.a; ox.fillStyle = fx.sil.c; ox.fillRect(0, 0, o.width, o.height); ox.globalAlpha = 1; }
    ox.restore(); src = o; off = -m;
  }
  ctx.save(); ctx.globalAlpha = G.op ?? 1; ctx.globalCompositeOperation = G.blend || 'source-over';
  const sh = G.shadow; if(sh && sh.on && sh.a > 0){ ctx.shadowColor = `rgba(0,0,0,${sh.a})`; ctx.shadowBlur = sh.blur * f; ctx.shadowOffsetY = sh.y * f; }
  ctx.drawImage(src, off, off);
  ctx.restore();
}

/* ---------- まとめて動かす（グループ・複数選択） ---------- */
// 動かす対象（グループなら中のレイヤー）の今の状態を控える
// 操作中は「開始時の状態」から毎回計算し直す（累積すると丸めの誤差がたまるため）。ロック中のレイヤーは対象外。(cx, cy) は回転・拡大縮小の中心
/** @param {Layer[]} ls @param {number} cx @param {number} cy */
function xformSnap(ls, cx, cy){
  const kids = ls.flatMap(l => isGroup(l) ? groupKids(l) : [l]);
  return {cx, cy, kids: [...new Set(kids)].filter(L => !L.locked).map(L => ({L, x:L.x, y:L.y, sc:L.sc, rot:L.rot || 0}))};
}
// 中心 (cx, cy) を基準に、dx, dy だけ動かし・k 倍にし・dr 度回す
function xformApply(s, dx, dy, k = 1, dr = 0){
  const a = dr * PI / 180, c = Math.cos(a), sn = Math.sin(a);
  s.kids.forEach(o => {
    const rx = (o.x - s.cx) * k, ry = (o.y - s.cy) * k;
    o.L.x = Math.round(s.cx + dx + rx * c - ry * sn); o.L.y = Math.round(s.cy + dy + rx * sn + ry * c);
    // sc は 0.02〜20 に制限、小数3桁で丸める。rot は -180〜180 度の範囲に正規化（+540 は負の剰余を避けるため）、小数1桁
    if(k !== 1) o.L.sc = Math.round(clamp(o.sc * k, 0.02, 20) * 1000) / 1000;
    if(dr) o.L.rot = Math.round((((o.rot + dr + 540) % 360) - 180) * 10) / 10;
  });
}

/* ---------- グループの作成・解除 ---------- */
// ids：まとめたいレイヤーの id。グループは入れ子にしない（グループを選んだ場合は中身を取り出して1つに作り直す）。作れなければ null
function groupLayers(ids){
  const set = new Set(ids), src = DOC.layers.filter(l => set.has(l.id));
  if(src.length === 1 && isGroup(src[0])){ toast('すでにグループです。ほかのレイヤーも選んでから、まとめてください', true); return null; }
  // グループを選んでいれば、その中身を取り出して1つにまとめ直す
  const kidsIds = new Set(src.flatMap(l => isGroup(l) ? groupKids(l).map(k => k.id) : [l.id]));
  const kids = DOC.layers.filter(l => kidsIds.has(l.id) && !isGroup(l));
  if(kids.length < 2){ toast('グループにするには、2つ以上のレイヤーを選んでください（Ctrl／Shift＋クリック、スマホは長押し）', true); return null; }
  // 一番手前にあるレイヤー（選んだグループも含む）の位置にグループを置く
  const top = Math.max(...[...kids, ...src].map(l => DOC.layers.indexOf(l)));
  const G = Object.assign(LAYER_BASE(), GROUP_BASE(), {id: uid()});
  kids.forEach(k => { k.gid = G.id; });
  DOC.layers.splice(top + 1, 0, G);
  // 空になった元のグループは消す
  DOC.layers = DOC.layers.filter(l => !(isGroup(l) && l.id !== G.id && !groupKids(l).length));
  DOC.msel = []; selectLayer(G.id); renderLayers(); docChanged(false);
  toast(`${kids.length}個のレイヤーをグループにしました。ドラッグで移動、角で拡大縮小、上の○で回転。効果はまとめてかかります`);
  return G;
}
/** @param {Layer} G */
function ungroupLayers(G){
  if(!isGroup(G)) return;
  const kids = groupKids(G), i = DOC.layers.indexOf(G);
  kids.forEach(k => { delete k.gid; });
  // 見た目の重なり順を保つため、グループがあった位置に中身を並べ直す
  DOC.layers.splice(i, 1);
  const rest = DOC.layers.filter(l => !kids.includes(l)), before = DOC.layers.slice(0, i).filter(l => !kids.includes(l)).length;
  DOC.layers = [...rest.slice(0, before), ...kids, ...rest.slice(before)];
  prevCache.delete(G.id); dims.delete(G.id);
  DOC.msel = kids.map(k => k.id); DOC.sel = kids.length ? kids[kids.length - 1].id : null;
  renderLayers(); syncDoc(); docChanged(false);
  toast('グループを解除しました');
}
// 1枚だけグループから出す。出したレイヤーはグループの直前（＝1つ下）に置く。最後の1枚だったらグループ自体も消す
/** @param {Layer} L */
function ungroupOne(L){
  if(!L.gid) return;
  const G = layerById(L.gid); delete L.gid;
  if(G){ const j = DOC.layers.indexOf(L); DOC.layers.splice(j, 1); DOC.layers.splice(Math.max(0, DOC.layers.indexOf(G)), 0, L); if(!groupKids(G).length) DOC.layers.splice(DOC.layers.indexOf(G), 1); }
  renderLayers(); syncDoc(); docChanged(false);
}
