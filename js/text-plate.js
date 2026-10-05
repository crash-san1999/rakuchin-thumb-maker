/* 楽ちんサムネメーカー：文字の背景シェイプ（角丸・楕円・ギザギザ・吹き出し・斜め帯）と、吹き出しのしっぽ */
/*
  text-render.js から分けたもの。文字の描画エンジンの一部で、render() の中（styleBack）からだけ呼ばれる（RS＝描画中のスタイルを読む）。
  主な公開：drawPlate（背景シェイプを描く）／TAIL_ANGLE・tailDeg（しっぽの位置の角度）／bubbleTail（しっぽの形）／rayToPolygon。
  しっぽのつまみ（thumb/tailhandle.js）のため、drawPlate は描いた吹き出しの位置（中心・半径・しっぽの付け根と先）を platePlace に残す。
  renderStyle が、その位置を最終的な絵（回転・トリミング後）の座標に直して、返す canvas の .plate に付ける。
  依存：RS・PI・clamp・rng・rgba（text-render.js / core.js）。読み込みは text-render.js の直後。
*/
// 直前の drawPlate が描いた吹き出しの位置（論理座標と、そのときの変換）。renderStyle が開始時に null に戻す
/** @type {any} */
let platePlace = null;
// 直前の bubbleTail が作ったしっぽの付け根・先と、吹き出しの中心・半径・種類（論理座標）。drawPlate が platePlace にまとめる
/** @type {any} */
let tailPts = null;
/* 吹き出しのしっぽ（中心から見た角度で位置を決める。tail: left=左下 center=下 right=右下 tl=左上 tr=右上 sl=左 sr=右 free=自由（tpos の角度） none=なし） */
const TAIL_ANGLE = {left:115, center:90, right:65, tl:245, tr:295, sl:180, sr:0};
// しっぽを付ける位置の角度（度。画面座標で下が正）。なし・未知の向きは undefined。free のときは p.tpos（0〜360）
const tailDeg = p => { const t = p.tail || 'left'; return t === 'free' ? ((+p.tpos || 0) % 360 + 360) % 360 : TAIL_ANGLE[t]; };
// 戻り値は本体とは別の Path2D。drawPlate が枠線→塗りの順に本体としっぽを別々に描くので、しっぽの付け根の枠線は塗りで隠れる。tail なし／未知の向きなら null。
// 第1引数 _c は未使用。rx,ry は図形の半径、kind: 'box'=四角の縁 / 'ellipse'=楕円の縁 / 'dots'=雲用の小さな丸の列 /
// 'ray'=縁までの距離を rx にそのまま渡す（ギザギザのように、縁が楕円で表せない形用。ry は使わない）。
// 角度は画面座標（下が正）で、tailDeg の度数＝中心から見た付け根の位置。
// 付け根の位置とは別に、先の向きを tdir（度。±）でずらし、tw で付け根の太さ、tbend で曲がり（−1〜1。先のほうが横へしなる）を変えられる。
// tdir・tbend が 0、tw が 1 のときは、以前と同じ形（同じ座標・同じ直線）になる（保存済みのサムネの見た目を変えないため）
function bubbleTail(_c, p, cx, cy, rx, ry, kind){
  const deg = tailDeg(p); if(deg === undefined) return null;
  const ctx = new Path2D();
  const S = RS.size * (p.ts || 1), a = deg * PI / 180, dx = Math.cos(a), dy = Math.sin(a);
  const tw = clamp(+p.tw || 1, 0.2, 3), bend = clamp(+p.tbend || 0, -1, 1), ta = a + clamp(+p.tdir || 0, -89, 89) * PI / 180, ux = Math.cos(ta), uy = Math.sin(ta);
  // 中心から角度の向きに進んで、図形の縁に当たる点
  const k = kind === 'ray' ? rx : kind === 'box' ? 1 / Math.max(Math.abs(dx) / rx, Math.abs(dy) / ry) : 1 / Math.hypot(dx / rx, dy / ry), bx = cx + dx * k, by = cy + dy * k;
  if(kind === 'dots'){   // 考え事の雲：小さな丸が3つ、外へ小さくなりながら並ぶ（向き ux,uy に並べ、曲がりのぶん横へずらす）
    let last = [bx, by];
    [[0.34, 0.26], [0.78, 0.17], [1.1, 0.1]].forEach(([d, r]) => { const sd = bend * S * d * d * 0.5, px = bx + ux * S * d - uy * sd, py = by + uy * S * d + ux * sd; ctx.moveTo(px + S * r * tw, py); ctx.arc(px, py, S * r * tw, 0, 7); last = [px, py]; });
    tailPts = {lc:[cx, cy], rx, ry, kind, base:[bx, by], tip:last};
    return ctx;
  }
  const nx = -dy, ny = dx, lean = (ux >= 0 ? 1 : -1) * S * 0.12;   // 先を外側へ少しはらう
  const tx = bx + ux * S * 0.62 + (Math.abs(uy) > 0.5 ? lean : 0), ty = by + uy * S * 0.62;
  const p1x = bx - dx * S * 0.2 + nx * S * 0.27 * tw, p1y = by - dy * S * 0.2 + ny * S * 0.27 * tw, p2x = bx - dx * S * 0.2 - nx * S * 0.27 * tw, p2y = by - dy * S * 0.2 - ny * S * 0.27 * tw;
  ctx.moveTo(p1x, p1y);
  if(bend){ const qx = -uy * bend * S * 0.35, qy = ux * bend * S * 0.35;   // 曲がり：両側の辺を、先の向きに直角な方向へふくらませる
    ctx.quadraticCurveTo((p1x + tx) / 2 + qx, (p1y + ty) / 2 + qy, tx, ty); ctx.quadraticCurveTo((p2x + tx) / 2 + qx, (p2y + ty) / 2 + qy, p2x, p2y); }
  else { ctx.lineTo(tx, ty); ctx.lineTo(p2x, p2y); }
  ctx.closePath();
  tailPts = {lc:[cx, cy], rx, ry, kind, base:[bx, by], tip:[tx, ty]};
  return ctx;
}
// 中心 (cx,cy) から角度 deg（画面座標・TAIL_ANGLE と同じ）の向きに進んで、折れ線 pts（閉じた多角形の頂点列）の縁に当たるまでの距離。当たらなければ 0。
// ギザギザの吹き出しは、とげの長さが向きごとに違う（半径の 1.04〜1.44 倍）ので、固定の楕円では縁に付けられない。実際の輪郭との交点を求めて、しっぽの付け根にする
function rayToPolygon(pts, cx, cy, deg){
  const a = deg * PI / 180, dx = Math.cos(a), dy = Math.sin(a); let best = 0;
  for(let i = 0; i < pts.length - 1; i++){
    const [x1, y1] = pts[i], ex = pts[i + 1][0] - x1, ey = pts[i + 1][1] - y1, den = dx * ey - dy * ex; if(Math.abs(den) < 1e-9) continue;
    const t = ((x1 - cx) * ey - (y1 - cy) * ex) / den, u = ((x1 - cx) * dy - (y1 - cy) * dx) / den;
    if(t > best && u >= 0 && u <= 1) best = t;
  }
  return best;
}
/* 背景シェイプ（角丸・楕円・ギザギザ・吹き出し・斜め帯） */
// 文字全体（L.ty0〜ty1 × 0〜L.w）の外側に pad＋フチの最大幅 outer を足した矩形を基準に描く。背面レイヤー A に最初に描かれる。
// 楕円系（ellipse / obubble / cloud）は矩形の角まで覆うよう半径を 1.1〜1.3 倍に広げている。その広がりぶんは renderStyle 側の余白 pl（['burst','ellipse',...] の 0.3*(L.w+L.h)）で確保しているので、
// 形を追加・拡大したら pl の対象リストも見直すこと（足りないとキャンバス端で切れる）。ギザギザは固定シード p.seed
function drawPlate(ctx, L, outer){
  const p = RS.plate, pad = RS.size * p.pad + outer;
  const x0 = -pad, y0 = L.ty0 - pad, x1 = L.w + pad, y1 = L.ty1 + pad;
  const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  let tail = null; tailPts = null;
  const m = ctx.getTransform();   // 論理座標 → この絵のピクセル（しっぽのつまみの位置合わせ用に残す）
  ctx.save(); ctx.beginPath(); ctx.lineJoin = 'round';
  switch(p.shape){
    case 'ellipse': ctx.ellipse(cx, cy, w / 2 * 1.18, h / 2 * 1.3, 0, 0, 7); break;
    case 'burst': {
      const R = rng(p.seed), n = Math.max(12, Math.round((w + h) / (RS.size * 0.45)));
      for(let i = 0; i <= n * 2; i++){
        const a = i / (n * 2) * 2 * PI, k = i % 2 === 0 ? 1.3 + R() * 0.14 : 1.06;
        const px = cx + Math.cos(a) * w / 2 * k, py = cy + Math.sin(a) * h / 2 * k * 1.08;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); break;
    }
    case 'bubble': case 'sbubble': {
      ctx.roundRect(x0, y0, w, h, p.shape === 'sbubble' ? RS.size * 0.04 : Math.min(h / 2, RS.size * 0.3));
      tail = bubbleTail(ctx, p, cx, cy, w / 2, h / 2, 'box'); break;
    }
    case 'obubble': {
      const rx = w / 2 * 1.18, ry = h / 2 * 1.3; ctx.ellipse(cx, cy, rx, ry, 0, 0, 7); tail = bubbleTail(ctx, p, cx, cy, rx, ry, 'ellipse'); break;
    }
    case 'cloud': {   // 雲（考え中）：丸いふくらみを並べ、しっぽは小さな丸の列
      const rx = w / 2 * 1.12, ry = h / 2 * 1.25, n = Math.max(8, Math.round((rx + ry) * 2 * PI / (RS.size * 0.62))), r = (rx + ry) * PI / n * 0.62;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, 7);
      for(let i = 0; i < n; i++){ const a = i / n * 2 * PI, px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * ry; ctx.moveTo(px + r, py); ctx.arc(px, py, r, 0, 7); }
      tail = bubbleTail(ctx, p, cx, cy, rx + r * 0.6, ry + r * 0.6, 'dots'); break;
    }
    case 'shout': {   // 叫び：ギザギザの吹き出し。しっぽは、実際の輪郭（とげの先・谷）との交点に付ける（固定の楕円に付けると、長いとげの下に隠れる）
      const R = rng(p.seed), n = Math.max(12, Math.round((w + h) / (RS.size * 0.4))), pts = [];
      for(let i = 0; i <= n * 2; i++){
        const a = i / (n * 2) * 2 * PI, k = i % 2 === 0 ? 1.28 + R() * 0.16 : 1.04, px = cx + Math.cos(a) * w / 2 * k, py = cy + Math.sin(a) * h / 2 * k * 1.08;
        pts.push([px, py]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      const deg = tailDeg(p), reach = deg === undefined ? 0 : rayToPolygon(pts, cx, cy, deg);
      tail = reach > 0 ? bubbleTail(ctx, p, cx, cy, reach, 0, 'ray') : bubbleTail(ctx, p, cx, cy, w / 2 * 1.04, h / 2 * 1.08, 'ellipse');
      if(tailPts){ tailPts.rx = w / 2 * 1.16; tailPts.ry = h / 2 * 1.25; tailPts.kind = 'ellipse'; }   // つまみで長さを決めるときは、とげの平均くらいの楕円で見る
      break;
    }
    case 'para': { const k = h * 0.35; ctx.moveTo(x0 + k, y0); ctx.lineTo(x1 + k, y0); ctx.lineTo(x1 - k, y1); ctx.lineTo(x0 - k, y1); ctx.closePath(); break; }
    default: ctx.roundRect(x0, y0, w, h, Math.min(h / 2, RS.size * 0.3));
  }
  if(tail && tailPts) platePlace = Object.assign({m, size:RS.size}, tailPts);
  if(p.sw > 0){ ctx.lineWidth = p.sw * 2; ctx.strokeStyle = p.sc; ctx.stroke(); if(tail) ctx.stroke(tail); }
  ctx.fillStyle = rgba(p.c, p.a); ctx.fill(); if(tail) ctx.fill(tail);
  ctx.restore();
}
