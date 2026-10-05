/* 楽ちんサムネメーカー：キャンバス上の「しっぽのつまみ」（吹き出しのしっぽを直接ドラッグして動かす） */
/*
  対象：文字の背景シェイプが吹き出し（角丸・四角・楕円・雲・叫び）のとき／画像の切り抜きフレームが「吹き出し」のとき。
  選んでいるレイヤーのしっぽの先に、丸いつまみを出す（overlay.js の drawOverlay → drawTailHandle）。
  ドラッグ（events.js が tailHandleAt でつかんだかを調べ、tailDragStart・tailDragMove を呼ぶ）：
    ・ふつうにドラッグ … しっぽの先がつまみに付いてくる。文字は「位置（角度）と長さ」、フレームは「辺と先の位置」が変わる
    ・Shift を押しながら（スマホは長押ししてから）… 付け根は動かさず、文字は「先の向き」と長さ、フレームは「付け根の位置」が変わる
  結果は保存データ（文字：style.plate の tail='free'・tpos・ts・tdir／フレーム：frame.tside・tp・tt）に入るので、パネルのスライダーにも
  そのまま出る。確定・取り消しの記録は、ドラッグの終わりに events.js が docChanged で行う。
  座標の対応：
    ・文字 … 描いた絵（text-render の render が返す canvas）に、吹き出しの中心・しっぽの付け根と先（絵のピクセル）と、
      論理座標→絵のピクセルの変換 m が付いている（.plate。text-plate.js の drawPlate が記録し、renderStyle が回転・トリミング後に直す）。
      絵のピクセル → DOC 座標は、drawLayer と同じ「中心合わせ・÷倍率 k × L.sc・L.rot 回転」。
      ワープ（アーチなど）はピクセル単位で絵を曲げるので位置が合わない。ワープ中はつまみを出さない（スライダーで調整する）
    ・フレーム … frames.js の frameBubbleGeom（形と同じ計算）と、editmodes.js の frameLocal（DOC → フレームの局所座標）
  文字は、しっぽの長さで絵の大きさが変わると中心がずれて文字が動いてしまうので、ドラッグ中は吹き出しの中心が同じ場所に留まるよう
  レイヤーの位置を補正する（keepCenter）。
  依存：DOC・selLayer（doc.js）、prevCache・textCanvas・tvCss（render.js）、frameGeom・frameBubbleGeom（frames.js）、frameLocal（editmodes.js）、
       editLayer（editmodes.js）、TAIL_ANGLE（text-plate.js）、ASSETS、clamp・PI。
*/
const BUBBLE_SHAPES = ['bubble', 'sbubble', 'obubble', 'cloud', 'shout'];
const TAIL_HIT_PX = 14;          // つまみの当たり半径（画面上の px）
const TAIL_LONG_PRESS = 400;     // スマホで「向きを変える」に切り替わる長押しの時間（ms）

// 文字レイヤー L のしっぽの情報（DOC 座標の先・付け根・吹き出しの中心と、変換に使う値）。出せないときは null
/** @param {Layer} L */
function textTailInfo(L){
  const st = /** @type {any} */ (L.style || {}), p = st.plate;
  if(!p || !p.on || !BUBBLE_SHAPES.includes(p.shape) || (p.tail || 'left') === 'none') return null;
  if(st.warp && st.warp.type !== 'none' && st.warp.amt) return null;   // ワープ中は位置が合わないので出さない
  const e = prevCache.get(L.id), P = e && e.c && /** @type {any} */ (e.c).plate; if(!P) return null;
  const k = L.sc / e.k, a = (L.rot || 0) * PI / 180, c = Math.cos(a), s = Math.sin(a), W = e.c.width, H = e.c.height;
  /** @param {number[]} q */
  const toDoc = q => { const [px, py] = q; const dx = (px - W / 2) * k, dy = (py - H / 2) * k; return [L.x + dx * c - dy * s, L.y + dx * s + dy * c]; };
  // DOC 座標 → 描いた吹き出しの論理座標（しっぽの角度・長さを決めるのに使う）
  const toLocal = (x, y) => { const dx = x - L.x, dy = y - L.y, u = (dx * c + dy * s) / k + W / 2, v = (-dx * s + dy * c) / k + H / 2;
    const q = new DOMMatrix(P.m).inverse().transformPoint(new DOMPoint(u, v)); return [q.x, q.y]; };
  return {type:'text', tip:toDoc(P.tip), base:toDoc(P.base), center:toDoc(P.center), P, toLocal};
}
// 画像レイヤー L（切り抜きフレームが吹き出し）のしっぽの情報。出せないときは null
/** @param {Layer} L */
function frameTailInfo(L){
  if(!L.frame || L.frame.shape !== 'bubble' || !ASSETS[L.asset]) return null;
  const G = frameGeom(L); if(!G) return null;
  const g = frameBubbleGeom(G.fw, G.fh, L.frame.r, L.frame), a = (L.rot || 0) * PI / 180, c = Math.cos(a), s = Math.sin(a);
  /** @param {number[]} q */
  const toDoc = q => [L.x + (q[0] * c - q[1] * s) * L.sc, L.y + (q[0] * s + q[1] * c) * L.sc];
  return {type:'frame', tip:toDoc(g.tip), base:toDoc(g.at(g.len * g.tp, 0)), center:[L.x, L.y], G, g};
}
// 選んでいるレイヤーのしっぽの情報（つまみを出してよいときだけ）
function tailInfo(){
  if(DOC.mode !== 'thumb' || (DOC.msel && DOC.msel.length >= 2) || editLayer()) return null;
  const L = selLayer(); if(!L || L.hidden || L.locked) return null;
  try{ return L.type === 'text' ? textTailInfo(L) : L.type === 'image' ? frameTailInfo(L) : null; }catch{ return null; }
}
// (x,y)（DOC 座標）がつまみの上なら、そのしっぽの情報を返す
function tailHandleAt(x, y){
  const t = tailInfo(); if(!t) return null;
  return Math.hypot(x - t.tip[0], y - t.tip[1]) < TAIL_HIT_PX * DOC.w / tvCss ? t : null;
}
// ドラッグの開始。戻り値はドラッグ中の状態（events.js の drag.st に入る）
/** @param {Layer} L @param {PointerEvent} e */
function tailDragStart(L, t, e){
  return {L, t, mode:null, t0:performance.now(), touch:e.pointerType === 'touch', x0:t.tip[0], y0:t.tip[1], center:t.center};
}
// ドラッグ中。x,y はポインタの DOC 座標。最初に 4px 以上動いたときに「位置」か「向き」かを決める（Shift か、スマホの長押し）
/** @param {PointerEvent} e */
function tailDragMove(st, x, y, e){
  if(!st.mode){
    if(Math.hypot(x - st.x0, y - st.y0) < 4 * DOC.w / tvCss) return;
    st.mode = e.shiftKey || (st.touch && performance.now() - st.t0 > TAIL_LONG_PRESS) ? 'dir' : 'pos';
  }
  if(st.L.type === 'text') moveTextTail(st, x, y); else moveFrameTail(st, x, y);
}
// 文字の吹き出し：ポインタの位置を吹き出しの論理座標に直し、中心からの角度＝しっぽの位置、縁からの距離＝長さにする。
// 「向き」モードは付け根からの角度を、位置の角度との差（先の向きのずれ）にする
function moveTextTail(st, x, y){
  const L = st.L, p = L.style.plate, P = st.t.P, [lx, ly] = st.t.toLocal(x, y), size = P.size || L.style.size || 100;
  const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
  if(st.mode === 'dir'){
    const ang = Math.atan2(ly - P.lbase[1], lx - P.lbase[0]) * 180 / PI, deg = tailDegOf(p);
    p.tdir = r1(clamp(((ang - deg + 540) % 360) - 180, -80, 80));
    p.ts = r2(clamp(Math.hypot(lx - P.lbase[0], ly - P.lbase[1]) / (size * (P.kind === 'dots' ? 1.1 : 0.62)), 0.3, 3));
  }else{
    const vx = lx - P.lc[0], vy = ly - P.lc[1], deg = (Math.atan2(vy, vx) * 180 / PI + 360) % 360, a = deg * PI / 180, dx = Math.cos(a), dy = Math.sin(a);
    // 縁までの距離：四角は辺、それ以外は楕円で近似（叫びのギザギザも楕円で見る。長さが少し違うだけで、位置は正しい）
    const edge = P.kind === 'box' ? 1 / Math.max(Math.abs(dx) / P.rx, Math.abs(dy) / P.ry) : 1 / Math.hypot(dx / P.rx, dy / P.ry);
    p.tail = 'free'; p.tpos = Math.round(deg) % 360;
    p.ts = r2(clamp((Math.hypot(vx, vy) - edge) / (size * (P.kind === 'dots' ? 1.1 : 0.62)), 0.3, 3));
  }
  keepCenter(st);
}
// しっぽの位置の角度（自由なら tpos、それ以外は決まった向き）
const tailDegOf = p => (p.tail || 'left') === 'free' ? +p.tpos || 0 : (TAIL_ANGLE[p.tail || 'left'] ?? 115);
// 文字の絵を描き直し、吹き出しの中心がドラッグ前と同じ DOC 座標に来るようにレイヤーを動かす（しっぽで絵の大きさが変わっても文字が動かない）
function keepCenter(st){
  const L = st.L, e = prevCache.get(L.id); if(!e) return;
  textCanvas(L, e.k, false, prevCache);
  const t = textTailInfo(L); if(!t) return;
  L.x = Math.round((L.x + st.center[0] - t.center[0]) * 100) / 100; L.y = Math.round((L.y + st.center[1] - t.center[1]) * 100) / 100;
}
// フレームの吹き出し：ポインタの位置がどの辺の外側かで、しっぽの辺を決め、辺に沿った位置で先（または付け根）を動かす
function moveFrameTail(st, x, y){
  const L = st.L, fr = L.frame, G = st.t.G, [u, v] = frameLocal(L, x, y), a = G.fw / 2, b = G.fh / 2;
  const nx = u / a, ny = v / b, side = Math.abs(ny) >= Math.abs(nx) ? (ny > 0 ? 'b' : 't') : (nx > 0 ? 'r' : 'l');
  const along = side === 'b' || side === 't' ? (u + a) / G.fw : (v + b) / G.fh, r2 = q => Math.round(q * 1000) / 1000;
  if(st.mode === 'dir'){ fr.tp = r2(clamp(along, 0.05, 0.95)); return; }
  fr.tside = side;
  const tp = clamp(fr.tp ?? 0.3, 0.05, 0.95), tt = along - tp;
  // 先が届かない（付け根から 0.6 以上離れた）ときは、付け根もいっしょに寄せる
  if(Math.abs(tt) > 0.6) fr.tp = r2(clamp(along - Math.sign(tt) * 0.6, 0.05, 0.95));
  fr.tt = r2(clamp(along - fr.tp, -0.6, 0.6));
}
// つまみを描く（overlay.js から。f はプレビュー倍率）。付け根から先へ細い線、先に丸いつまみ
function drawTailHandle(ctx, f, dpr){
  const t = tailInfo(); if(!t) return;
  ctx.save(); ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.strokeStyle = 'rgba(31,27,45,.65)'; ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath(); ctx.moveTo(t.base[0] * f, t.base[1] * f); ctx.lineTo(t.tip[0] * f, t.tip[1] * f); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#5cf08a'; ctx.strokeStyle = '#1f1b2d'; ctx.lineWidth = 2 * dpr;
  ctx.beginPath(); ctx.arc(t.tip[0] * f, t.tip[1] * f, 7 * dpr, 0, 2 * PI); ctx.fill(); ctx.stroke();
  ctx.restore();
}
