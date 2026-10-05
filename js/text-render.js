/* 楽ちんサムネメーカー：文字の描画エンジン・装飾 */
/*
  役割：文字スタイル（style オブジェクト）を受け取り、装飾込みの透過キャンバスを1枚返す。UI には触らない純粋な描画層。
  公開：render(scale, style=S)（唯一の入口）／METALS（金属グラデ定義）／BOX_PALETTES（一文字囲みのおまかせ配色）。
  呼ばれ方：preview.js の update()・exportBlob()（文字素材モード）、thumb/render.js の textCanvas()、thumb/collage.js から。
  依存：core.js の mk / rng / rgba / hex2rgb / clamp / PI、fonts.js の plainText()（{ } を除いた文字列）。S（グローバル）は直接読まず RS 経由。
  【RS（描画中スタイル）】render() の間だけ RS に style が入り、下の関数群はすべて RS を読む。画面の S を書き換えない・
    サムネ側が各レイヤーの style で並行して描ける・引数を引き回さなくてよい、のが狙い。そのため render() の外で
    個々の関数（layout, glyphs, drawPlate など）を直接呼ぶと RS が null で落ちる。呼ぶのは必ず render() 経由にすること。
  【座標系】描画は「論理座標（style の size を基準とした px）」で行い、prep() の setTransform で scale 倍・余白 m 分の平行移動・斜体(skew)を掛ける。
    ピクセル処理（bbox / bevel / grunge / displace など）は setTransform を使わない「実ピクセル」で動くので、
    長さの引数に scale を掛ける必要がある（関数ごとに scale を受け取っているのはこのため）。
  【全体の流れ】renderStyle() 内のコメント 1)〜8) の順（背面→フチ→塗り→合成→光彩・影→反射・グリッチ→回転→トリミング）。順序を変えると見た目が変わる。
*/
// mctx：文字幅の計測専用の小さな canvas。描画用 ctx とは別にして、font / letterSpacing を計測のたびに設定し直して使う
const mctx = mk(4, 4).getContext('2d');
// 押し出しの奥行き用に色を暗くする（t=0 で元の色、1 で黒）
const darken =(h, t) => { const [r, g, b] = hex2rgb(h); return `rgb(${r*(1-t)|0},${g*(1-t)|0},${b*(1-t)|0})`; };
// フォールバックの並び：英数字フォント → 日本語フォント → Noto Sans JP → sans-serif。未読込のフォントで寸法が変わるのを避けるため、描画前に ensureFont() で待つこと
const fontStr = () =>`${RS.weight} ${RS.size}px ${RS.fontLatin ? '"' + RS.fontLatin + '", ' : ''}"${RS.font}", "Noto Sans JP", sans-serif`;
/* 金属の色（上→下）。0.5付近の暗い帯が「映り込みの地平線」 */
const METALS = {
  gold:     [[0,'#fffbe0'],[.2,'#ffe07a'],[.44,'#c99212'],[.5,'#7a4d00'],[.56,'#d9a520'],[.8,'#fff1a6'],[1,'#b07a0c']],
  silver:   [[0,'#ffffff'],[.22,'#e3e7ec'],[.46,'#9aa3af'],[.5,'#4e5663'],[.56,'#bfc6cf'],[.82,'#f7f9fb'],[1,'#8d95a1']],
  chrome:   [[0,'#f4faff'],[.3,'#b9d8f5'],[.48,'#5d8fc4'],[.5,'#0f1a28'],[.53,'#4a3522'],[.7,'#c8a77c'],[1,'#fff6e6']],
  copper:   [[0,'#fff0e2'],[.22,'#f2a674'],[.46,'#a44a1c'],[.5,'#5e2206'],[.56,'#cf7440'],[.82,'#ffd1ad'],[1,'#8a3810']],
  rosegold: [[0,'#fff5f3'],[.22,'#f6c3bb'],[.46,'#c07f86'],[.5,'#7d3f4a'],[.56,'#e0a3a2'],[.82,'#ffe1dc'],[1,'#a8656e']],
  bluesteel:[[0,'#f0f8ff'],[.22,'#a9c8e6'],[.46,'#3f6b96'],[.5,'#132b45'],[.56,'#5f8db8'],[.82,'#d8ebfb'],[1,'#34597f']],
  gunmetal: [[0,'#d9dde2'],[.22,'#8a929c'],[.46,'#3a4048'],[.5,'#15181c'],[.56,'#4b525c'],[.82,'#a3abb5'],[1,'#2a2f35']],
  holo:     [[0,'#ffc2ec'],[.2,'#ffe89a'],[.4,'#b5ffc9'],[.6,'#9fe3ff'],[.8,'#c9b0ff'],[1,'#ffc2ec']],
};

// 文字列を行ごとの {t:文字列, a:強調か} の配列に分解する。{ } で囲んだ部分が強調（accent 色）。
// 閉じ忘れの { は行末まで強調、対応のない } は普通の文字として残す（acc の状態で判定）。強調は行をまたがない（行ごとに acc を初期化）
function parse(text){
  return text.split('\n').map(line => {
    const segs = []; let acc = false, buf = '';
    for(const ch of line){
      if(ch === '{' && !acc){ if(buf) segs.push({t:buf, a:false}); buf = ''; acc = true; }
      else if(ch === '}' && acc){ if(buf) segs.push({t:buf, a:true}); buf = ''; acc = false; }
      else buf += ch;
    }
    if(buf) segs.push({t:buf, a:acc});
    return segs;
  });
}
const lsx = () => RS.vertical ? 0 : RS.ls;   // 縦書きの字間は文字送り（縦方向）で使うので、フォント側の字間は0
/* 縦書き：回転させる文字／右上に寄せる句読点／小さい仮名 */
const V_ROT = /[ー−―—–…‥〜～（）〔〕［］｛｝〈〉《》「」『』【】＜＞()\[\]<>~_=-]/;
const V_PUNC = /[、。，．]/;
const V_SMALL = /[ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ]/;
/* 句読点を「文字の右上」に置くための補正量（フォントごとの実際のインクの位置から計算） */
// 前提：mctx.font が設定済み（layout() が先に設定する）。w は measureText の幅。戻り値 [dx, dy] は論理座標。
// 0.38 は drawGlyphs の mid（ベースラインからマス中央までの高さ）と同じ比率。0.24 は右上へ寄せる量。インク情報が取れない（空白等）場合は固定の寄せ量にフォールバック
function inkShift(ch, w){
  const m = mctx.measureText(ch), sz = RS.size;
  if(!(m.actualBoundingBoxRight || m.actualBoundingBoxLeft)) return [sz * 0.4, -sz * 0.4];
  const dx = (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2 - w / 2;
  const dy = sz * 0.38 - (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  return [sz * 0.24 - dx, -sz * 0.24 - dy];
}
/* 文字の「見えている部分」の中心をマスの中心に合わせるための補正量（フォント内の余白に左右されない） */
// 縦書きの1マスごとの見た目の位置ずれ（フォントごとに字面の位置が違う）を吸収する。戻り値 [gx, gy] は drawGlyphs でそのまま足される
function inkCenter(t, w){
  const m = mctx.measureText(t);
  if(!(m.actualBoundingBoxRight || m.actualBoundingBoxLeft)) return [0, 0];
  return [-((m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2 - w / 2), -(RS.size * 0.38 - (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2)];
}
/* 縦書きの「マス」に分ける（縦中横・横倒し・回転・補正をここで決める） */
// 戻り値の各マス：t=文字 a=強調か w=字幅 adv=縦方向の送り量 ox,oy=描画位置の補正 gx,gy=字面中央合わせの補正 k=縮小率 r90=90度回すか
// 英数字・記号の連続(\x21-\x7e)は1トークンにまとめ、vlat='side' なら横倒しで1マス、'up' なら1文字ずつ立てる（記号は V_ROT で回転）
function vCells(segs){
  const out = [], sz = RS.size, meas = t => mctx.measureText(t).width;
  const push = (t, a, o) => { const c = Object.assign({t, a, w:meas(t), adv:sz, ox:0, oy:0, k:1, r90:false}, o); [c.gx, c.gy] = (o && o.noCenter) ? [0, 0] : inkCenter(t, c.w); out.push(c); };
  for(const s of segs){
    for(const tok of (s.t.match(/[\x21-\x7e]+|[０-９]+|[！？]+|[\s\S]/gu) || [])){
      const tcy = RS.vtcy && /^([0-9!?]{2,4}|[０-９]{2,4}|[！？]{2,4})$/u.test(tok);   // 全角の「２０」「！！」も縦中横にする
      // 縦中横は半角に正規化して1マスに収める。幅がマスの92%を超える分だけ縮める（隣のマスにはみ出さないための余白8%）
      if(tcy){ const t = tok.normalize('NFKC'), w = meas(t); push(t, s.a, {w, k:Math.min(1, sz * 0.92 / w)}); }
      else if(/^[０-９！？]+$/u.test(tok)) for(const ch of tok) push(ch, s.a);
      else if(/^[\x21-\x7e]+$/.test(tok)){
        if(RS.vlat === 'side'){ const w = meas(tok); push(tok, s.a, {w, r90:true, adv:w}); }
        // 立てる英数字は字幅に応じて送り量を詰める（i や l を1マス分あけない）。送り量は size の 0.62〜1 倍の範囲に収める
        else for(const ch of tok){ const w = meas(ch), r = V_ROT.test(ch); push(ch, s.a, {w, r90:r, adv:r ? sz : clamp(w * 1.15, sz * 0.62, sz)}); }
      }else if(tok === ' ') push(tok, s.a, {adv:sz * 0.5});
      else if(V_PUNC.test(tok)){ const w = meas(tok), [ox, oy] = inkShift(tok, w); push(tok, s.a, {w, ox, oy, noCenter:true}); }
      // 小さい仮名は縦書きでは右上寄せが正しい字面なので、マス内で右上へ寄せる
      else if(V_SMALL.test(tok)) push(tok, s.a, {ox:sz * 0.12, oy:-sz * 0.12});
      else push(tok, s.a, {r90:V_ROT.test(tok)});
    }
  }
  return out;
}
// 縦書きのレイアウト。行（列）は右から左へ並ぶ（cx は列の中心x）。w=列の並びの幅、h=いちばん長い列の長さ。
// align は縦書きでは上/中央/下の意味（left=上詰め）。戻り値に v:true を付け、描画側が縦横を分岐する目印にする
function layoutV(){
  const sz = RS.size, step = sz * RS.lh;
  const lines = parse(RS.text).map(segs => {
    const cells = vCells(segs); let len = 0;
    cells.forEach((c, j) => { len += c.adv + (j ? RS.ls : 0); });
    return {cells, len, w:len, segs:cells};
  });
  const w = step * (lines.length - 1) + sz, h = Math.max(sz, ...lines.map(l => l.len));
  lines.forEach((ln, i) => {
    ln.cx = w - sz / 2 - i * step; ln.x0 = ln.cx - sz / 2;
    ln.y0 = RS.align === 'left' ? 0 : RS.align === 'right' ? h - ln.len : (h - ln.len) / 2;
  });
  return {v:true, lines, w, h, lineH:step, ty0:0, ty1:h};
}
// 文字列 → レイアウト L（{lines, w, h, lineH, ty0, ty1}）。論理座標で、原点は左上（ベースライン基準の y は baseY で出す）。
// 最初に mctx の font / letterSpacing を設定する。後続の glyphs / inkShift / charCells も mctx を使うので、フォント変更後はここを通ってから計測すること。
function layout(){
  mctx.font = fontStr(); mctx.letterSpacing = lsx() + 'px';
  if(RS.vertical) return layoutV();
  const lines = parse(RS.text).map(segs => {
    let w = 0; segs.forEach(s => { s.w = mctx.measureText(s.t).width; w += s.w; });
    return {segs, w};
  });
  const w = Math.max(1, ...lines.map(l => l.w));
  const lineH = RS.size * RS.lh;
  // 高さ：最終行はベースライン下のはみ出し（ディセンダ）分として size の 1.25 倍分を確保。ty0/ty1 は背景シェイプ用に「字の見える上端・下端」
  const h = lineH * (lines.length - 1) + RS.size * 1.25;
  const L = {lines, w, h, lineH};
  L.ty0 = lineTop(L, 0); L.ty1 = baseY(L, lines.length - 1) + RS.size * 0.14;
  return L;
}
// i 行目のベースラインy（1行目は上端から size×0.98 下）と、字の上端y（ベースラインの 0.9 size 上。1行目で上端から約 0.08 size の余白）。
// 塗りのグラデ・テカリ・マーカーなど「行の高さ」を基準にする処理はすべてこの2つを共有しているので、数値を変えるときは同時に見た目を確認すること
const baseY = (L, i) => RS.size * 0.98 + i * L.lineH;
const lineTop = (L, i) => baseY(L, i) - RS.size * 0.9;

/* 描画する文字の並び（ゆらぎONなら1文字ずつ。縦書きは常に1マスずつ） */
// 戻り値 items は drawGlyphs / charCells / 塗り・フチ・押し出し・板ずれすべてで共有される（全パスで同じ位置に描くため、1回だけ作って使い回す）。
// ゆらぎの乱数は rng(seed) の固定シードなので、再描画しても（プレビューと書き出しでも）同じ並びになる。items の生成順・乱数の消費順を変えるとゆらぎの出方が変わる。
function glyphs(L){
  const items = [], R = rng(RS.jitter.seed), J = RS.jitter.on;
  mctx.font = fontStr(); mctx.letterSpacing = lsx() + 'px';
  if(L.v){
    L.lines.forEach((ln, i) => {
      let y = ln.y0;
      ln.cells.forEach(c => {
        const by = y + c.adv / 2; y += c.adv + RS.ls;
        const it = {t:c.t, a:c.a, line:i, vt:true, cw:c.w, bx:ln.cx, by, cx:ln.cx + c.ox, cy:by + c.oy, r90:c.r90, k:c.k, gx:c.gx, gy:c.gy, x:0, y:0};
        if(J){ it.rot = (R()*2-1) * RS.jitter.rot * PI / 180; it.dy = (R()*2-1) * RS.jitter.y; it.sc = 1 + (R()*2-1) * RS.jitter.scale; }
        items.push(it);
      });
    });
    return items;
  }
  L.lines.forEach((ln, i) => {
    let x = RS.align === 'left' ? 0 : RS.align === 'right' ? L.w - ln.w : (L.w - ln.w) / 2;
    const y = baseY(L, i);
    ln.segs.forEach(s => {
      if(!J){ items.push({t:s.t, x, y, a:s.a, line:i}); x += s.w; return; }
      for(const ch of s.t){
        const cw = mctx.measureText(ch).width;
        items.push({t:ch, x, y, a:s.a, line:i, cw,
          rot:(R()*2-1) * RS.jitter.rot * PI / 180, dy:(R()*2-1) * RS.jitter.y, sc:1 + (R()*2-1) * RS.jitter.scale});
        x += cw;
      }
    });
  });
  return items;
}
// items を1つずつ ctx に描く共通ルーチン。実際の描画（fillText / strokeText 等）は op(it, x, y) として呼び出し側が渡す
// （塗り・フチ・押し出し・板ずれで同じ配置を共有するため）。ゆらぎ（rot あり）や縦書きは「文字の中心」を原点に回転・拡大してから描く。
// mid は文字の見た目の縦中心（ベースラインからの高さ）で、回転の中心をここに置くと文字が自然に傾く。斜体(skew)は縦書きのみここで1文字ずつ掛ける（横書きは prep の変換で全体に掛かる）
function drawGlyphs(ctx, items, op){
  const mid = RS.size * 0.38;
  for(const it of items){
    if(it.vt){
      ctx.save(); ctx.translate(it.cx, it.cy + (it.dy || 0));
      if(RS.skew) ctx.transform(1, 0, -Math.tan(RS.skew * PI / 180), 1, 0, 0);
      if(it.r90) ctx.rotate(PI / 2);
      if(it.rot) ctx.rotate(it.rot);
      const k = (it.sc || 1) * (it.k || 1); ctx.scale(k, k);
      op(it, -it.cw / 2 + it.gx, mid + it.gy); ctx.restore(); continue;
    }
    if(it.rot === undefined){ op(it, it.x, it.y); continue; }
    ctx.save(); ctx.translate(it.x + it.cw / 2, it.y - mid + it.dy); ctx.rotate(it.rot); ctx.scale(it.sc, it.sc);
    op(it, -it.cw / 2, mid); ctx.restore();
  }
}

/* 塗り */
// 角度つきグラデーション。line を省略すると全体（L.w × L.h）、指定すると その行（縦書きは列）の矩形を基準にする。
// 半径 r は「その角度で矩形の端から端まで届く長さ」（|cos|×幅 + |sin|×高さ の半分）なので、どの角度でも両端の色がちょうど端に来る
function angGrad(ctx, L, stops, line, ang){
  const a = (ang ?? RS.gradAngle) * PI / 180;
  let bx = 0, bw = L.w, by = line === undefined ? 0 : lineTop(L, line), bh = line === undefined ? L.h : RS.size * 1.05;
  if(L.v && line !== undefined){ const ln = L.lines[line]; bx = ln.x0; bw = RS.size; by = ln.y0; bh = Math.max(1, ln.len); }
  const cx = bx + bw / 2, cy = by + bh / 2, r = (Math.abs(Math.cos(a)) * bw + Math.abs(Math.sin(a)) * bh) / 2;
  const g = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
// 行 i の上→下の縦グラデ（金属・上下分割用）。縦書きは列の長さ方向に張る
function vGrad(ctx, L, i, stops){
  const ln = L.lines[i], top = L.v ? ln.y0 : lineTop(L, i), g = ctx.createLinearGradient(0, top, 0, top + (L.v ? Math.max(1, ln.len) : RS.size * 1.02));
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
// 塗り方（単色・グラデ・2色分割・金属）に応じた fillStyle を返す関数 it => style を作る。it.a（強調）なら強調色側を使う。
// グラデの座標は L（論理座標）で作り、使う時点の変換で解釈されるので、prep 済みの ctx（fx と同じ変換）で使うこと
function fillStyles(ctx, L){
  const n = L.lines.length, idx = [...Array(n).keys()];
  const two = (c1, c2, mid) => mid ? [[0,c1],[.5,mid],[1,c2]] : [[0,c1],[1,c2]];
  let main, acc;
  if(RS.fillType === 'solid'){ main = () => RS.fill1; acc = () => RS.accent1; }
  else if(RS.fillType === 'grad'){
    const ms = two(RS.fill1, RS.fill2, RS.fill3on ? RS.fill3 : null), as = two(RS.accent1, RS.accent2);
    if(RS.gradScope === 'line'){
      const gm = idx.map(i => angGrad(ctx, L, ms, i)), ga = idx.map(i => angGrad(ctx, L, as, i));
      main = it => gm[it.line]; acc = it => ga[it.line];
    }else{
      const gm = angGrad(ctx, L, ms), ga = angGrad(ctx, L, as); main = () => gm; acc = () => ga;
    }
  }else if(RS.fillType === 'split'){
    // 2色分割：色を切り替える境目に 0.002 だけ幅を持たせた、ほぼ段差のグラデにしている
    const p = RS.splitPos, sp = (c1, c2) => [[0,c1],[p,c1],[Math.min(1, p + 0.002),c2],[1,c2]];
    if(RS.splitDir === 'h'){
      const gm = idx.map(i => vGrad(ctx, L, i, sp(RS.fill1, RS.fill2))), ga = idx.map(i => vGrad(ctx, L, i, sp(RS.accent1, RS.accent2)));
      main = it => gm[it.line]; acc = it => ga[it.line];
    }else{
      const gm = angGrad(ctx, L, sp(RS.fill1, RS.fill2), undefined, 0), ga = angGrad(ctx, L, sp(RS.accent1, RS.accent2), undefined, 0);
      main = () => gm; acc = () => ga;
    }
  }else{
    const st = hasKey(METALS, RS.metal) ? METALS[RS.metal] : METALS.gold, as = two(RS.accent1, RS.accent2);
    // 金属は行ごとの縦グラデ（中央付近の暗い帯が映り込みの地平線になるので、行ごとに作る）。ホログラムだけ斜め20度。未知の metal 名は gold にフォールバック
    const gm = idx.map(i => RS.metal === 'holo' ? angGrad(ctx, L, st, i, 20) : vGrad(ctx, L, i, st));
    const ga = idx.map(i => vGrad(ctx, L, i, as));
    main = it => gm[it.line]; acc = it => ga[it.line];
  }
  return it => it.a ? acc(it) : main(it);
}

/* ピクセル処理 */
// ここから下の bbox / trim / boxBlur / bevel / drawPattern などは setTransform を使わない「実ピクセル」で動く（座標系は冒頭参照）。
// bbox：alpha が 2 を超える画素の外接矩形（l,t,r,b は端のピクセル含む）。何も無ければ null。getImageData で全画素を読むので重い。
// 呼び出し側は null を必ず考慮する（空文字・全透明のとき）。willReadFrequently は読み出し中心のキャンバスだと示してソフトウェア描画に寄せるヒント
function bbox(c){
  const w = c.width, h = c.height, d = c.getContext('2d', {willReadFrequently:true}).getImageData(0, 0, w, h).data;
  let t = h, l = w, r = -1, b = -1;
  for(let y = 0; y < h; y++){
    const row = y * w * 4;
    for(let i = 0; i < w; i++){
      if(d[row + i * 4 + 3] > 2){ if(i < l) l = i; if(i > r) r = i; if(y < t) t = y; if(y > b) b = y; }
    }
  }
  return r < 0 ? null : {l, t, r, b};
}
// 透明な余白を切り落とし、四方に pad px だけ余白を付けて返す（最終出力用）。全透明なら 1x1 を返す
let trimShift = [0, 0];
function trim(c, pad){
  const bb = bbox(c); if(!bb) return mk(1, 1);
  const cw = bb.r - bb.l + 1, ch = bb.b - bb.t + 1, o = mk(cw + pad * 2, ch + pad * 2);
  o.getContext('2d').drawImage(c, bb.l, bb.t, cw, ch, pad, pad, cw, ch);
  trimShift = [pad - bb.l, pad - bb.t];   // 切り取りで絵がずれた量（しっぽのつまみの位置合わせ用。renderStyle が読む）
  return o;
}
// 箱型ブラー（横→縦の2パス、端は最寄りの値で延長）。移動平均で走査するので半径 r によらず O(w×h)。bevel / drawBulbs が高さマップを作るのに使う。
// 戻り値は src と同じ大きさの Float32Array（0〜1 の濃度）。2回かけて近似ガウスにしている（呼び出し側）
function boxBlur(src, w, h, r){
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), div = 2 * r + 1;
  for(let y = 0; y < h; y++){
    const o = y * w; let acc = 0;
    for(let k = -r; k <= r; k++) acc += src[o + Math.min(w - 1, Math.max(0, k))];
    for(let x = 0; x < w; x++){ tmp[o + x] = acc / div; acc += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)]; }
  }
  for(let x = 0; x < w; x++){
    let acc = 0;
    for(let k = -r; k <= r; k++) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for(let y = 0; y < h; y++){ out[y * w + x] = acc / div; acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
  }
  return out;
}
/* ベベル：アルファから高さマップを作り、光の向きで陰影をつける（浮き出し／彫り込み） */
// c を直接書き換える（戻り値なし）。sizePx は実ピクセル（scale 掛け済み）、b は RS.bevel。
// 速度のため bbox の周囲 2px だけを切り出して処理する。傾き = 高さマップの勾配 × 光ベクトル。浮き出し/彫り込みは k の符号反転で表す。
// 傾き s>0 は白方向に、s<0 は黒方向に混ぜる（hl / sh が強さ）。pow(s,0.8) はハイライトの立ち上がりをやや強める調整値
function bevel(c, sizePx, b){
  const bb = bbox(c); if(!bb) return;
  const W = c.width, H = c.height, r = Math.max(1, Math.round(sizePx / 2));
  const l = Math.max(0, bb.l - 2), t = Math.max(0, bb.t - 2), w = Math.min(W, bb.r + 3) - l, h = Math.min(H, bb.b + 3) - t;
  const ctx = c.getContext('2d', {willReadFrequently:true});
  const img = ctx.getImageData(l, t, w, h), d = img.data, n = w * h;
  const a = new Float32Array(n); for(let i = 0; i < n; i++) a[i] = d[i * 4 + 3] / 255;
  const hm = boxBlur(boxBlur(a, w, h, r), w, h, r);
  const la = b.angle * PI / 180, lx = Math.cos(la), ly = Math.sin(la);
  const k = r * 2 * b.depth * (b.style === 'deboss' ? -1 : 1);
  for(let y = 1; y < h - 1; y++){
    for(let x = 1; x < w - 1; x++){
      const i = y * w + x, p = i * 4; if(!d[p + 3]) continue;
      let s = (-(hm[i + 1] - hm[i - 1]) * lx - (hm[i + w] - hm[i - w]) * ly) * k;
      if(s > 1) s = 1; else if(s < -1) s = -1;
      if(s > 0){ const f = Math.pow(s, 0.8) * b.hl; d[p] += (255 - d[p]) * f; d[p+1] += (255 - d[p+1]) * f; d[p+2] += (255 - d[p+2]) * f; }
      else if(s < 0){ const f = 1 + s * b.sh; d[p] *= f; d[p+1] *= f; d[p+2] *= f; }
    }
  }
  ctx.putImageData(img, l, t);
}
/* 模様（文字の中だけ） */
// c は塗り F。source-atop で「すでに描かれている画素の上にだけ」重ねるので、文字の外に模様が漏れない。
// setTransform を単位行列に戻しているのは、呼び出し時の変換（prep の scale・平行移動）が模様に掛からないようにするため（タイルは実ピクセル基準）。
// glitter / noise は固定シード（11 / 7）のタイルを作る＝再描画しても模様が変わらない。halftone / cutlines はここではなく別関数（renderStyle で振り分け）
function drawPattern(c, scale){
  const p = RS.pattern, sz = Math.max(2, Math.round(p.size * scale));
  let tile, tr = new DOMMatrix().rotateSelf(p.angle);
  if(p.type === 'glitter'){
    tile = mk(96, 96); const x = tile.getContext('2d'), R = rng(11), [r, g, bl] = hex2rgb(p.c);
    for(let i = 0; i < 700; i++){
      const lv = R(), s2 = 1 + R() * 2.5;
      x.fillStyle = lv > 0.85 ? '#ffffff' : `rgba(${Math.min(255, r * (0.4 + lv)) | 0},${Math.min(255, g * (0.4 + lv)) | 0},${Math.min(255, bl * (0.4 + lv)) | 0},${0.5 + R() * 0.5})`;
      x.fillRect(R() * 96, R() * 96, s2, s2);
    }
    tr = tr.scaleSelf(Math.max(0.3, sz / 16));
  }else if(p.type === 'noise'){
    tile = mk(128, 128); const x = tile.getContext('2d'), id = x.createImageData(128, 128), R = rng(7), [r, g, bl] = hex2rgb(p.c);
    for(let i = 0; i < 128 * 128; i++){ id.data[i*4] = r; id.data[i*4+1] = g; id.data[i*4+2] = bl; id.data[i*4+3] = R() * 255; }
    x.putImageData(id, 0, 0); tr = tr.scaleSelf(Math.max(0.25, sz / 16));
  }else{
    tile = mk(sz, sz); const x = tile.getContext('2d'); x.fillStyle = p.c;
    if(p.type === 'stripe') x.fillRect(0, 0, sz / 2, sz);
    else if(p.type === 'dot'){ x.beginPath(); x.arc(sz / 2, sz / 2, sz * 0.28, 0, 7); x.fill(); }
    else if(p.type === 'check'){ x.fillRect(0, 0, sz / 2, sz / 2); x.fillRect(sz / 2, sz / 2, sz / 2, sz / 2); }
    else if(p.type === 'grid'){ const lw = Math.max(1, sz * 0.1); x.fillRect(0, 0, sz, lw); x.fillRect(0, 0, lw, sz); }
  }
  const cx = c.getContext('2d'), pat = cx.createPattern(tile, 'repeat');
  if(pat.setTransform) pat.setTransform(tr);
  cx.save(); cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalCompositeOperation = 'source-atop'; cx.globalAlpha = p.a;
  cx.fillStyle = pat; cx.fillRect(0, 0, c.width, c.height); cx.restore();
}
/* テカリ（行ごとの上半分ハイライト） */
// fx（prep 済み＝論理座標）に直接描く。source-atop で文字の画素の上にだけ白を重ねる。bot の曲線（quadraticCurveTo）で下端をカーブさせてアニメ風の光沢にする。
// 横書きの帯の範囲（x0〜x1）は L.w より size 分ずつ広く取る（文字が L.w からはみ出しても帯が途切れないように）
function drawGloss(ctx, L){
  const g = RS.gloss;
  ctx.save(); ctx.globalCompositeOperation = 'source-atop';
  L.lines.forEach((ln, i) => {
    if(L.v){   // 縦書き：左から光が当たる帯（カラムごと）
      if(!ln.cells.length) return;
      const left = ln.x0 - RS.size * 0.15, right = ln.x0 + RS.size * 1.02 * g.h, y0 = ln.y0 - RS.size, y1 = ln.y0 + ln.len + RS.size;
      const gr = ctx.createLinearGradient(left, 0, right, 0);
      gr.addColorStop(0, `rgba(255,255,255,${g.a})`); gr.addColorStop(1, `rgba(255,255,255,${g.a * 0.35})`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(left, y0); ctx.lineTo(left, y1); ctx.lineTo(right, y1);
      ctx.quadraticCurveTo(right + RS.size * 0.35 * g.curve, (y0 + y1) / 2, right, y0); ctx.closePath(); ctx.fill();
      return;
    }
    const top = lineTop(L, i) - RS.size * 0.15, bot = lineTop(L, i) + RS.size * 1.02 * g.h;
    const x0 = -RS.size, x1 = L.w + RS.size;
    const gr = ctx.createLinearGradient(0, top, 0, bot);
    gr.addColorStop(0, `rgba(255,255,255,${g.a})`); gr.addColorStop(1, `rgba(255,255,255,${g.a * 0.35})`);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x0, top); ctx.lineTo(x1, top); ctx.lineTo(x1, bot);
    ctx.quadraticCurveTo((x0 + x1) / 2, bot + RS.size * 0.35 * g.curve, x0, bot); ctx.closePath(); ctx.fill();
  });
  ctx.restore();
}
/* マーカー（文字の後ろの帯） */
// 背面レイヤー A に描く。roundRect は古いブラウザに無いので、無ければ rect にフォールバックする。
// 帯の位置 pos は行の高さ基準（0=上端寄り、1=下端寄り）、over は左右（縦書きは上下）のはみ出し量
function drawMarker(ctx, L){
  const m = RS.marker;
  ctx.save(); ctx.fillStyle = rgba(m.c, m.a);
  L.lines.forEach((ln, i) => {
    if(!ln.segs.length) return;
    if(L.v){ const over = RS.size * m.over, hh = RS.size * m.h, cx = ln.x0 + RS.size * 1.02 * m.pos; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx - hh / 2, ln.y0 - over, hh, ln.len + over * 2, Math.min(hh / 2, RS.size * 0.08)) : ctx.rect(cx - hh / 2, ln.y0 - over, hh, ln.len + over * 2); ctx.fill(); return; }
    const x0 = RS.align === 'left' ? 0 : RS.align === 'right' ? L.w - ln.w : (L.w - ln.w) / 2;
    const over = RS.size * m.over, hh = RS.size * m.h, cy = lineTop(L, i) + RS.size * 1.02 * m.pos;
    const x = x0 - over, w = ln.w + over * 2, y = cy - hh / 2, rr = Math.min(hh / 2, RS.size * 0.08);
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, hh, rr) : ctx.rect(x, y, w, hh); ctx.fill();
  });
  ctx.restore();
}
/* かすれ */
// destination-out で、すでに描かれた画素を丸い斑点と細い線で削る（c を直接書き換え）。固定シード g.seed で毎回同じ削れ方。
// 個数は面積と粒の大きさから算出し、40000 で頭打ち（巨大キャンバスで重くならないように）。scale を掛けて実ピクセルの大きさにしている
function applyGrunge(c, scale){
  const g = RS.grunge, bb = bbox(c); if(!bb) return;
  const R = rng(g.seed), sz = g.size * scale, bw = bb.r - bb.l, bh = bb.b - bb.t;
  const x = c.getContext('2d'); x.save(); x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000'; x.strokeStyle = '#000';
  const n = Math.min(40000, Math.round(g.amt * bw * bh / (sz * sz) * 0.06));
  for(let i = 0; i < n; i++){
    const px = bb.l + R() * bw, py = bb.t + R() * bh, rr = sz * (0.25 + Math.pow(R(), 3) * 2.2);
    x.globalAlpha = 0.5 + R() * 0.5; x.beginPath(); x.ellipse(px, py, rr, rr * (0.5 + R() * 0.8), R() * PI, 0, 7); x.fill();
  }
  x.lineCap = 'round';
  const m = Math.round(g.amt * 25);
  for(let i = 0; i < m; i++){
    x.globalAlpha = 0.6 + R() * 0.4; x.lineWidth = sz * (0.2 + R() * 0.6);
    const px = bb.l + R() * bw, py = bb.t + R() * bh, an = R() * PI, len = (0.05 + R() * 0.25) * bw;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(an) * len, py + Math.sin(an) * len * 0.3); x.stroke();
  }
  x.restore();
}
/* ワープ（列／行ごとにずらして変形） */
// src を変形した新しいキャンバスを返す（type none・強さ0・空なら src をそのまま返すので、呼び出し側は同一かどうかを前提にしない）。
// 1px 幅の列（trap は1px高の行）ごとに縦位置 dy と縦倍率 s を変えて貼り直す方式。fn(u) は文字の横位置 u(0〜1) → [縦ずれ, 縦倍率]。
// 変形で縦にはみ出す量を先に走査（minY/maxY）して出力の高さと基準位置 off を決める。この走査は 2px 刻み（速度優先）、貼り付けは1px刻み
function warp(src){
  const w = RS.warp; if(w.type === 'none' || !w.amt) return src;
  const bb = bbox(src); if(!bb) return src;
  const W = src.width, H = src.height, cw = bb.r - bb.l + 1, ch = bb.b - bb.t + 1, cx = bb.l + cw / 2, cy = bb.t + ch / 2, A = w.amt;
  if(w.type === 'trap'){
    const o = mk(W, H), x = o.getContext('2d');
    for(let y = 0; y < H; y++){
      const v = Math.min(1, Math.max(0, (y - bb.t) / ch));
      const s = A >= 0 ? 1 - A * 0.9 * (1 - v) : 1 + A * 0.9 * v;
      x.drawImage(src, 0, y, W, 1, cx - cx * s, y, W * s, 1);
    }
    return o;
  }
  const U = px => Math.min(1, Math.max(0, (px - bb.l) / cw)), amp = A * ch;
  const WARPS = {
    arch:  u => [-amp * 0.6 * (1 - (2*u - 1) ** 2), 1],
    wave:  u => [amp * 0.35 * Math.sin(2 * PI * w.freq * u), 1],
    bulge: u => [0, Math.max(0.1, 1 + A * 0.8 * (1 - (2*u - 1) ** 2))],
    persp: u => [0, Math.max(0.1, 1 + A * 0.8 * (2*u - 1))],
    rise:  u => [-amp * 0.5 * (2*u - 1), 1],
  };
  if(!hasKey(WARPS, w.type)) return src;
  const fn = WARPS[w.type];
  let minY = 0, maxY = H;
  for(let px = 0; px < W; px += 2){ const [dy, s] = fn(U(px)); minY = Math.min(minY, cy - cy * s + dy); maxY = Math.max(maxY, cy + (H - cy) * s + dy); }
  const off = -Math.floor(minY), o = mk(W, Math.ceil(maxY - minY) + 2), x = o.getContext('2d');
  for(let px = 0; px < W; px++){ const [dy, s] = fn(U(px + 0.5)); x.drawImage(src, px, 0, 1, H, px, off + cy - cy * s + dy, 1, H * s); }
  return o;
}
// 影・光彩の「影の部分だけ」を取り出したキャンバスを返す（本体は描かれない）。canvas の shadow は本体と一緒にしか描けないので、
// 本体を画面外（左へ OFF だけずらした位置）に描き、shadowOffsetX に同じ OFF を足して影だけをキャンバス内に落とすトリックを使っている。
// ox,oy,blur は論理 px（scale を掛けて実ピクセルにする）。呼び出し時の変換には依存しない（setTransform 前提なし）
function effectOnly(src, ox, oy, blur, color, scale){
  const c = mk(src.width, src.height), x = c.getContext('2d'), OFF = src.width + 200;
  x.shadowColor = color; x.shadowBlur = blur * scale; x.shadowOffsetX = ox * scale + OFF; x.shadowOffsetY = oy * scale;
  x.drawImage(src, -OFF, 0);
  return c;
}
/* グリッチ */
// 最終段（反射の後）で B 全体に掛ける。シアン・赤の色ずれ（左右に d だけずらして lighter 合成）→ 本体 → 横帯のずらし、の順。
// 帯は out を毎回コピーしてから切り出す（ずらした結果を次の帯が拾って二重にならないように）。帯の位置・幅・量は固定シード
function glitch(B, scale){
  const g = RS.glitch, W = B.width, H = B.height, d = g.rgb * scale;
  const out = mk(W, H), o = out.getContext('2d');
  if(d > 0){
    const tint = col => { const c = mk(W, H), x = c.getContext('2d'); x.drawImage(B, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, W, H); return c; };
    o.globalAlpha = 0.9; o.drawImage(tint('#00e5ff'), -d, 0);
    o.globalCompositeOperation = 'lighter'; o.drawImage(tint('#ff0040'), d, 0);
    o.globalCompositeOperation = 'source-over'; o.globalAlpha = 1;
  }
  o.drawImage(B, 0, 0);
  if(g.slices > 0 && g.shift > 0){
    const bb = bbox(out) || {t:0, b:H}, R = rng(g.seed), span = bb.b - bb.t;
    for(let i = 0; i < g.slices; i++){
      const copy = mk(W, H); copy.getContext('2d').drawImage(out, 0, 0);
      const y = bb.t + R() * span, h = Math.max(2, (0.02 + R() * 0.09) * span), dx = (R() * 2 - 1) * g.shift * scale;
      o.clearRect(0, y, W, h); o.drawImage(copy, 0, y, W, h, dx, y, W, h);
    }
  }
  return out;
}

// 合成の小道具。どちらも dst の変換を一時的に単位行列にして、src を実ピクセルで重ねる（A/K/F はすべて同寸法のキャンバスなので位置は一致する）。
// blit=上に重ねる / cut=src の形で dst を抜く（destination-out）
const blit = (dst, src) => { const c = dst.getContext('2d'); c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(src, 0, 0); c.restore(); };
const cut = (dst, src) => { const c = dst.getContext('2d'); c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'destination-out'; c.drawImage(src, 0, 0); c.restore(); };

/* 1文字ずつの位置（一文字囲み・傍点用） */
// ゆらぎ・縦書きは glyphs() がすでに1文字単位なのでそのまま使う。通常の横書きは行の塊（セグメント）を文字ごとに分け、
// measureText で x を進めて位置を出す（字間 ls を含む幅）。空白は囲み・傍点の対象にしない
function charCells(items){
  if(RS.jitter.on || RS.vertical) return items.filter(it => it.t.trim());
  const out = []; mctx.font = fontStr(); mctx.letterSpacing = lsx() + 'px';
  items.forEach(it => {
    let x = it.x;
    for(const ch of it.t){ const cw = mctx.measureText(ch).width; if(ch.trim()) out.push({t:ch, x, y:it.y, a:it.a, line:it.line, cw}); x += cw; }
  });
  return out;
}
// 1文字ぶんの局所座標（原点＝その文字のマス中心、回転・拡大はゆらぎ分）に切り替えて fn を実行する。囲み・傍点がゆらぎや縦書きの文字に追従するための共通処理。
// 横書きの x に (cw - ls)/2 を使うのは、cw に字間 ls が含まれるため字面の中心に合わせるときに差し引く
function withCell(ctx, c, fn){
  if(c.vt){ ctx.save(); ctx.translate(c.bx, c.by + (c.dy || 0)); if(c.rot) ctx.rotate(c.rot); if(c.sc) ctx.scale(c.sc, c.sc); fn(); ctx.restore(); return; }
  ctx.save(); ctx.translate(c.x + (c.cw - RS.ls) / 2, c.y - RS.size * 0.38 + (c.dy || 0));
  if(c.rot) ctx.rotate(c.rot); if(c.sc) ctx.scale(c.sc, c.sc);
  fn(); ctx.restore();
}
/* 一文字囲み */
// RANSOM は色の取得に失敗した時の既定（脅迫状風の7色）。boxPal が使う
const RANSOM =['#e8132b', '#111111', '#1f5fd6', '#0f9d58', '#7b2cbf', '#ff6a00', '#c2185b'];
/* ランダム配色（脅迫状風）で使う色の組み合わせ（おまかせ）。[名前の key, 表示名, 色, 使う色数] */
// 色は常に8個で、使う数（4番目の値）は box.pn に入る。controls.js のおまかせチップが data-boxpal に key を載せて参照する
/** @type {Array<[string, string, string[], number]>} */
const BOX_PALETTES = [
  ['classic', '脅迫状', ['#e8132b', '#111111', '#1f5fd6', '#0f9d58', '#7b2cbf', '#ff6a00', '#c2185b', '#ffd500'], 7],
  ['pastel', 'パステル', ['#ffb3c7', '#ffd9a0', '#fff3a3', '#b9f0c4', '#a9dcff', '#d3bfff', '#ffc9f0', '#ffffff'], 7],
  ['pop', 'ポップ', ['#ff2d55', '#ffcc00', '#00c2ff', '#7cff4f', '#ff6a00', '#a855f7', '#111111', '#ffffff'], 7],
  ['mono', 'モノクロ', ['#111111', '#ffffff', '#666666', '#d9d9d9', '#333333', '#999999', '#000000', '#f2f2f2'], 4],
  ['redblack', '赤・黒・白', ['#e8132b', '#111111', '#ffffff', '#b00020', '#2b2b2b', '#f5f5f5', '#e8132b', '#111111'], 3],
  ['cool', '寒色', ['#1f5fd6', '#00a6d6', '#0f9d58', '#2b2f77', '#7b2cbf', '#6ee7f2', '#e8f1ff', '#111111'], 6],
  ['warm', '暖色', ['#e8132b', '#ff6a00', '#ffb000', '#ffd500', '#c2185b', '#ff8fa3', '#7a1f00', '#fff3d6'], 6],
  ['wa', '和風', ['#b7282e', '#1b1b1b', '#2b5d8a', '#d9a521', '#4f7a3a', '#f3e9d2', '#6b3a8f', '#8a6a4b'], 6],
];
// 使う色（色数ぶん）。壊れた値は脅迫状の色に戻す
function boxPal(b){
  const n = clamp(Math.round(b.pn) || 7, 2, 8), a = (Array.isArray(b.pal) ? b.pal : []).slice(0, n).filter(c => /^#[0-9a-f]{6}$/i.test(c));
  return a.length ? a : RANSOM;
}
// マス中心を原点に、半サイズ h の図形の経路を作る（塗り・線は呼び出し側）。円・ひし形は四角と見た目の大きさが揃うよう 1.08 / 1.4 倍にしている
function boxPath(ctx, shape, h){
  ctx.beginPath();
  if(shape === 'circle') ctx.arc(0, 0, h * 1.08, 0, 7);
  else if(shape === 'diamond'){ const k = h * 1.4; ctx.moveTo(0, -k); ctx.lineTo(k, 0); ctx.lineTo(0, k); ctx.lineTo(-k, 0); ctx.closePath(); }
  else if(shape === 'round') ctx.roundRect(-h, -h, 2 * h, 2 * h, h * 0.3);
  else ctx.rect(-h, -h, 2 * h, 2 * h);
}
// 色の決め方：rand ON＝パレットから（seq なら順番、そうでなければ文字の番号 i と seed から決まる乱数で固定）／OFF＝単色（alt なら交互）。
// 乱数は呼ぶたびに作り直す rng(i*97+5+seed*13) で、文字の並びが変わっても他の文字の色が連動して変わらない。枠線は塗りより先に描き、太さ×2 で内側が塗りに隠れて外側だけ残る
function drawBoxes(ctx, cells){
  const b = RS.box, h = RS.size * (0.5 + b.pad), pal = boxPal(b);
  cells.forEach((c, i) => withCell(ctx, c, () => {
    boxPath(ctx, b.shape, h);
    if(b.sw > 0){ ctx.lineWidth = b.sw * 2; ctx.strokeStyle = b.sc; ctx.lineJoin = 'round'; ctx.stroke(); }
    ctx.fillStyle = b.rand ? (b.seq ? pal[i % pal.length] : pal[Math.floor(rng(i * 97 + 5 + (b.seed || 0) * 13)() * pal.length)]) : (b.alt && i % 2 ? b.c2 : b.c); ctx.fill();
  }));
}
/* 傍点 */
// withCell の局所座標（文字のマス中心が原点）で、点の経路だけを作る（塗る／線を引くのは呼び出し側。経路は save/restore の外へ残る）
function dotPath(ctx){
  const d = RS.dots, r = RS.size * d.size * 0.5;
  ctx.save(); ctx.beginPath();
  if(RS.vertical){ ctx.translate(RS.size * 0.5 + r * 1.3, 0); ctx.rotate(PI / 2); }   // 縦書きは文字の右側に付ける
  else ctx.translate(0, -RS.size * 0.5 - r * 1.3);
  if(d.shape === 'ring'){ ctx.arc(0, 0, r, 0, 7); ctx.moveTo(r * 0.5, 0); ctx.arc(0, 0, r * 0.5, 0, 7, true); }
  else if(d.shape === 'tri'){ ctx.moveTo(-r, -r * 0.8); ctx.lineTo(r, -r * 0.8); ctx.lineTo(0, r * 0.9); ctx.closePath(); }
  else ctx.arc(0, 0, r, 0, 7);
  ctx.restore();   // 経路は作った時点の座標で残る（上の translate/rotate は経路に焼き込み済みで、restore しても動かない。変換だけ元に戻る）
}
/* 背景シェイプ（角丸・楕円・ギザギザ・吹き出し・斜め帯）と吹き出しのしっぽは text-plate.js（drawPlate） */
/* 押し出し（ストライプ・奥のフェード対応） */
// 文字を角度 e.angle の向きに、奥(d=厚み)から手前(d→0)へ step ずつ位置をずらして何枚も重ねて立体に見せる。奥ほど暗く(darken)する。
// step は 1/scale（実ピクセルで約1px。最小0.25）。1px 刻みなので隙間なく見え、描画回数はおおよそ 厚み×scale 回になるため厚みが大きいほど重い。
// fade（奥を透明に）は別キャンバス D に距離を灰色の濃淡で描き、最後に E の alpha へ掛けて消す（ピクセル処理なので E/D は実ピクセル）。
// prep は renderStyle の変換付き ctx 生成関数を受け取る（同じ座標系で描くため）。戻り値 E は A に blit される
function drawExtrude(prep, W, H, items, outer, scale){
  const e = RS.extrude, ex = e.depth, a = e.angle * PI / 180, step = Math.max(0.25, 1 / scale);
  const E = mk(W, H), x = prep(E), D = e.fade > 0 ? mk(W, H) : null, dx = D ? prep(D) : null;
  const pass = (c, col, d) => {
    c.save(); c.translate(Math.cos(a) * d, Math.sin(a) * d); c.fillStyle = c.strokeStyle = col; c.lineWidth = outer * 2;
    drawGlyphs(c, items, (it, px, py) => { if(outer > 0) c.strokeText(it.t, px, py); c.fillText(it.t, px, py); });
    c.restore();
  };
  for(let d = ex; d > 0; d -= step){
    const base = e.stripe && Math.floor(d / Math.max(0.5, e.stripeW)) % 2 ? e.c2 : e.c;
    pass(x, darken(base, e.shade * (d / ex)), d);
    if(dx){ const g = Math.round(255 * d / ex); pass(dx, `rgb(${g},${g},${g})`, d); }
  }
  if(D){
    const ec = E.getContext('2d', {willReadFrequently:true}), ei = ec.getImageData(0, 0, W, H), ed = ei.data;
    const dd = D.getContext('2d', {willReadFrequently:true}).getImageData(0, 0, W, H).data;
    for(let i = 3; i < ed.length; i += 4) if(ed[i]) ed[i] *= 1 - e.fade * (dd[i - 3] / 255);
    ec.putImageData(ei, 0, 0);
  }
  return E;
}
/* 板ずれ（ずらした影。中抜きにもできる） */
// ベタ色の文字（＋フチぶんの太り）を (o.x, o.y) ずらして描いたレイヤーを返す。hollow は「太らせた形」から「元の太さの形」を destination-out で抜いて線だけ残す。
// 背面側に置かれるので、実際の文字・フチは後から上に重なる
function drawOffsetLayer(prep, W, H, items, outer){
  const o = RS.offset, O = mk(W, H), x = prep(O);
  x.translate(o.x, o.y); x.fillStyle = x.strokeStyle = o.c;
  const sil = lw => { x.lineWidth = lw; drawGlyphs(x, items, (it, px, py) => { if(lw > 0) x.strokeText(it.t, px, py); x.fillText(it.t, px, py); }); };
  if(o.hollow){ sil((outer + o.w) * 2); x.globalCompositeOperation = 'destination-out'; sil(outer * 2); }
  else sil(outer * 2);
  return O;
}
/* インナーシャドウ（文字の内側に落ちる影） */
// F（塗りのキャンバス）を直接書き換える。「文字の外側（反転）」に影を落とし、それを source-atop で文字の内側にだけ重ねる、という反転トリック。
// 実ピクセルで処理（setTransform を単位行列にして貼る）
function innerShadow(F, scale){
  const s = RS.inner, W = F.width, H = F.height, inv = mk(W, H), ix = inv.getContext('2d');
  ix.fillStyle = '#000'; ix.fillRect(0, 0, W, H); ix.globalCompositeOperation = 'destination-out'; ix.drawImage(F, 0, 0);
  const sh = effectOnly(inv, s.x, s.y, s.blur, rgba(s.c, s.a), scale);
  const fx = F.getContext('2d'); fx.save(); fx.setTransform(1, 0, 0, 1, 0, 0); fx.globalCompositeOperation = 'source-atop'; fx.drawImage(sh, 0, 0); fx.restore();
}
/* 鏡面反射（下に反転して映す） */
// B（光彩・影込みの合成結果）の下に body の下端を上下反転して貼り足し、新しいキャンバスを返す（高さが伸びる）。
// 反転部分は destination-in のグラデで下へ向かって透明にする。反射元は影なしの body を使う（影・光彩まで反射しないため）。gap は scale 倍して実ピクセルに
function addReflection(B, body, scale){
  const r = RS.reflect, bb = bbox(body); if(!bb) return B;
  const ch = bb.b - bb.t + 1, len = Math.max(1, Math.round(ch * r.len)), gap = Math.round(r.gap * scale), W = B.width;
  const R = mk(W, len), rx = R.getContext('2d');
  rx.save(); rx.scale(1, -1); rx.drawImage(body, 0, bb.b - len + 1, W, len, 0, -len, W, len); rx.restore();
  rx.globalCompositeOperation = 'destination-in';
  const g = rx.createLinearGradient(0, 0, 0, len); g.addColorStop(0, `rgba(0,0,0,${r.a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  rx.fillStyle = g; rx.fillRect(0, 0, W, len);
  const O = mk(W, Math.max(B.height, bb.b + 1 + gap + len + 2)), ox = O.getContext('2d');
  ox.drawImage(R, 0, bb.b + 1 + gap); ox.drawImage(B, 0, 0);
  return O;
}

/* ---------- 海外リファレンス由来の装飾 ---------- */

// 値ノイズ（256x256 の乱数表を滑らかに補間し、周波数違いを 0.6/0.3/0.1 で重ねたもの）。戻り値は (x,y) → -1〜1 の関数。
// 乱数表は rng(seed) 由来なので、同じ seed なら毎回同じノイズ（再描画で形が変わらない）。表は 256 周期で繰り返す（& 255）
function makeNoise(seed){
  const R = rng(seed), N = 256, tab = new Float32Array(N * N);
  for(let i = 0; i < tab.length; i++) tab[i] = R();
  const v = (x, y) => tab[((y & 255) << 8) + (x & 255)];
  const sm = t => t * t * (3 - 2 * t);
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  return (x, y) => (n(x, y) * 0.6 + n(x * 2.1 + 5.2, y * 2.1 + 1.3) * 0.3 + n(x * 4.3 + 9.1, y * 4.3 + 7.7) * 0.1) * 2 - 1;
}
/* ノイズでピクセルをずらす（ゆがみ・炎） */
// c を直接書き換える。amp=ずらす最大量(px)、sc=ノイズの細かさ(px。大きいほどなだらか)、stretchY=縦方向にノイズを伸ばす倍率。いずれも実ピクセル（呼び出し側が scale 倍する）。
// 各出力画素は「ノイズでずらした位置の元画素」を取る逆引き方式（穴が空かない）。bbox ± (amp+2) の範囲だけ処理して速度を確保
function displace(c, amp, sc, seed, stretchY){
  const bb = bbox(c); if(!bb || amp <= 0) return;
  const W = c.width, H = c.height, pad = Math.ceil(amp) + 2;
  const l = Math.max(0, bb.l - pad), t = Math.max(0, bb.t - pad), r = Math.min(W - 1, bb.r + pad), b = Math.min(H - 1, bb.b + pad);
  const w = r - l + 1, h = b - t + 1, ctx = c.getContext('2d', {willReadFrequently:true});
  const src = ctx.getImageData(l, t, w, h).data, out = ctx.createImageData(w, h), od = out.data, nz = makeNoise(seed);
  const sy = sc * (stretchY || 1);
  for(let y = 0; y < h; y++){
    for(let x = 0; x < w; x++){
      const nx = (x + l) / sc, ny = (y + t) / sy;
      const sx = Math.round(x + nz(nx, ny) * amp), syy = Math.round(y + nz(nx + 31.7, ny + 17.3) * amp);
      if(sx < 0 || syy < 0 || sx >= w || syy >= h) continue;
      const si = (syy * w + sx) * 4, oi = (y * w + x) * 4;
      od[oi] = src[si]; od[oi+1] = src[si+1]; od[oi+2] = src[si+2]; od[oi+3] = src[si+3];
    }
  }
  ctx.putImageData(out, l, t);
}
/* 炎：文字の上端から炎の舌を立ちのぼらせる */
// 戻り値は炎だけを描いた同寸法のキャンバス（本体は含まない。呼び出し側が body より先に B へ重ねる）。
// 文字の「上側が空いている画素」（alpha>128 の真上が透明）を走査して炎の根元を探す。同じ根元の連続を避けるため、見つけたら size×0.25 だけ飛ばす。
// 外炎（c2→c3）と内炎＝芯（c1→c2）の2層を 'lighter' 合成で重ね、最後に軽くぼかして炎らしく馴染ませる。乱数は固定シード f.seed
function makeFire(body, scale){
  const f = RS.fire, W = body.width, H = body.height, bb = bbox(body), out = mk(W, H);
  if(!bb) return out;
  const d = body.getContext('2d', {willReadFrequently:true}).getImageData(0, 0, W, H).data;
  const R = rng(f.seed), sp = Math.max(3, RS.size * 0.09 * scale), tops = [];
  for(let x = bb.l; x <= bb.r; x += sp){
    const xi = Math.round(x + (R() - 0.5) * sp * 0.6);
    for(let y = Math.max(1, bb.t); y <= bb.b; y++){
      const k = (y * W + xi) * 4 + 3;
      if(d[k] > 128 && d[k - W * 4] <= 128){ tops.push([xi, y]); y += Math.round(RS.size * 0.25 * scale); }
    }
  }
  const o = out.getContext('2d');
  // 土台の赤い照り返し
  const sil = mk(W, H), sx = sil.getContext('2d');
  sx.drawImage(body, 0, 0); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = f.c3; sx.fillRect(0, 0, W, H);
  o.filter = `blur(${Math.max(2, RS.size * 0.08 * scale)}px)`; o.globalAlpha = 0.9; o.drawImage(sil, 0, -RS.size * 0.05 * scale); o.filter = 'none'; o.globalAlpha = 1;
  const T = mk(W, H), t = T.getContext('2d');
  const tongue = (x, y, h, w, sway, c0, c1, c2, a) => {
    const o = t, g = o.createLinearGradient(0, y, 0, y - h);
    g.addColorStop(0, rgba(c0, a)); g.addColorStop(0.45, rgba(c1, a * 0.9)); g.addColorStop(1, rgba(c2, 0));
    o.fillStyle = g; o.beginPath(); o.moveTo(x - w, y + w * 0.4);
    o.bezierCurveTo(x - w * 0.9, y - h * 0.35, x + sway - w * 0.35, y - h * 0.7, x + sway, y - h);
    o.bezierCurveTo(x + sway + w * 0.35, y - h * 0.7, x + w * 0.9, y - h * 0.35, x + w, y + w * 0.4);
    o.closePath(); o.fill();
  };
  const Hs = f.height * RS.size * scale, wild = f.wild;
  t.globalCompositeOperation = 'lighter';
  for(const [x, y] of tops){   // 外炎
    const h = Hs * (0.35 + R() * 0.75), w = RS.size * scale * (0.09 + R() * 0.08);
    tongue(x, y, h, w, (R() - 0.5) * w * 3 * wild, f.c2, f.c3, f.c3, 0.55);
  }
  for(const [x, y] of tops){   // 内炎（芯）
    if(R() < 0.35) continue;
    const h = Hs * (0.2 + R() * 0.4), w = RS.size * scale * (0.05 + R() * 0.05);
    tongue(x, y, h, w, (R() - 0.5) * w * 2.5 * wild, f.c1, f.c2, f.c3, 0.65);
  }
  o.filter = `blur(${Math.max(1, RS.size * 0.02 * scale)}px)`; o.drawImage(T, 0, 0); o.filter = 'none';
  return out;
}
/* ドリップ（とろ〜り／つらら）：塗りの下端から垂らす */
// F（塗り）と K（フチ）を直接書き換える。下端（alpha>160 の真下が透明）を走査して垂らす位置を決め、下に gapPx 以上の空きがある所だけ採用
// （他の文字・行に被さらないように）。色は sample ON なら根元の少し上(y-3)の画素色を拾う。外側にフチがあれば、K に同じ形を太らせて描いてフチの続きにする。
// 実ピクセル処理のため setTransform を単位行列に戻している。outerPx は呼び出し側で scale 掛け済みの最外フチ幅
function drawDrips(F, K, outerPx, strokeColor, scale){
  const dr = RS.drip, bb = bbox(F); if(!bb) return;
  const W = F.width, R = rng(dr.seed), fctx = F.getContext('2d', {willReadFrequently:true});
  const d = fctx.getImageData(0, 0, W, F.height).data;
  const wPx = Math.max(3, dr.w * RS.size * scale), step = Math.max(2, Math.round(wPx * 1.4)), gapPx = RS.size * 0.22 * scale;
  const list = [];
  for(let x = bb.l + step; x < bb.r - step; x += step){
    for(let y = bb.t; y < bb.b; y++){
      const i = (y * W + x) * 4 + 3;
      if(d[i] > 160 && d[i + W * 4] <= 160 && R() < dr.amt){
        let open = true; for(let k = 2; k <= gapPx && open; k += 2){ const yy = y + k; if(yy >= F.height || d[(yy * W + x) * 4 + 3] > 40) open = false; }
        if(!open) continue;
        const j = (Math.max(0, y - 3) * W + x) * 4;
        const col = dr.sample ? `rgb(${d[j]},${d[j+1]},${d[j+2]})` : dr.c;
        list.push({x, y, len:(0.25 + Math.pow(R(), 1.5) * 0.9) * dr.len * RS.size * scale, w:wPx * (0.6 + R() * 0.6), col});
      }
    }
  }
  const path = (c, q) => {
    const w2 = q.w / 2, x = q.x, y = q.y; c.beginPath();
    if(dr.style === 'icicle'){ c.moveTo(x - w2, y - 2); c.lineTo(x, y + q.len); c.lineTo(x + w2, y - 2); c.closePath(); return; }
    c.moveTo(x - w2 * 1.6, y - 2); c.quadraticCurveTo(x - w2 * 0.8, y, x - w2 * 0.8, y + q.len * 0.5);
    c.lineTo(x - w2 * 0.8, y + q.len); c.arc(x, y + q.len, w2 * 1.05, PI, 0, true);
    c.lineTo(x + w2 * 0.8, y + q.len * 0.5); c.quadraticCurveTo(x + w2 * 0.8, y, x + w2 * 1.6, y - 2); c.closePath();
  };
  if(outerPx > 0 && strokeColor){
    const k = K.getContext('2d'); k.save(); k.setTransform(1, 0, 0, 1, 0, 0);
    k.strokeStyle = k.fillStyle = strokeColor; k.lineWidth = outerPx * 2; k.lineJoin = 'round';
    list.forEach(q => { path(k, q); k.stroke(); k.fill(); }); k.restore();
  }
  fctx.save(); fctx.setTransform(1, 0, 0, 1, 0, 0);
  list.forEach(q => { fctx.fillStyle = q.col; path(fctx, q); fctx.fill(); }); fctx.restore();
}
/* ハーフトーン（下ほど大きい網点） */
// F を直接書き換え。bbox の中心を軸に角度 p.angle で回した格子に点を打ち、点の半径は上端 0 → 下端で最大になる（グラデーション状の網）。
// 半径 0.4px 未満は打たない。source-atop で文字の中にだけ描く。パターン種別 'halftone' のとき drawPattern の代わりに呼ばれる
function drawHalftone(F, scale){
  const p = RS.pattern, bb = bbox(F); if(!bb) return;
  const sz = Math.max(3, p.size * scale), x = F.getContext('2d');
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = p.a; x.fillStyle = p.c;
  const a = p.angle * PI / 180, ca = Math.cos(a), sa = Math.sin(a), cx = (bb.l + bb.r) / 2, cy = (bb.t + bb.b) / 2;
  const Rr = Math.hypot(bb.r - bb.l, bb.b - bb.t) / 2 + sz, hh = Math.max(1, bb.b - bb.t);
  x.beginPath();
  for(let u = -Rr; u <= Rr; u += sz) for(let v = -Rr; v <= Rr; v += sz){
    const px = cx + u * ca - v * sa, py = cy + u * sa + v * ca;
    if(px < bb.l - sz || px > bb.r + sz || py < bb.t - sz || py > bb.b + sz) continue;
    const r = sz * 0.62 * Math.max(0, Math.min(1, (py - bb.t) / hh));
    if(r < 0.4) continue;
    x.moveTo(px + r, py); x.arc(px, py, r, 0, 7);
  }
  x.fill(); x.restore();
}
/* 80年代のラインカット（下半分に切れ込み） */
// fx（論理座標）に destination-out で細い横帯を刻む。下に行くほど帯が太くなる。n（本数）は p.size、太さの強さは p.a から決まる。
// パターン種別 'cutlines' のとき drawPattern の代わりに呼ばれる。縦書きは1マスごとに刻む
function drawCutLines(ctx, L){
  const p = RS.pattern, n = Math.max(2, Math.round(p.size / 3));
  ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000';
  L.lines.forEach((ln, i) => {
    if(L.v){   // 縦書き：1マスごとに下半分へ切れ込み
      let y = ln.y0;
      ln.cells.forEach(c => {
        const by = y + c.adv / 2; y += c.adv + RS.ls;
        const top = by - RS.size * 0.04, bot = by + RS.size * 0.41, band = (bot - top) / n;
        for(let k = 0; k < n; k++){
          const th = band * (0.12 + 0.55 * (k / n)) * Math.max(0.2, p.a * 1.6);
          ctx.fillRect(ln.x0 - RS.size * 0.5, top + band * k + (band - th), RS.size * 2, th);
        }
      });
      return;
    }
    const top = lineTop(L, i) + RS.size * 0.48, bot = baseY(L, i) + RS.size * 0.03, band = (bot - top) / n;
    for(let k = 0; k < n; k++){
      const th = band * (0.12 + 0.55 * (k / n)) * Math.max(0.2, p.a * 1.6);
      ctx.fillRect(-RS.size, top + band * k + (band - th), L.w + RS.size * 2, th);
    }
  });
  ctx.restore();
}
/* エッジ上の点を集める */
// alpha>128 で、上下左右のどれかが透明な画素＝輪郭の画素を全部返す（実ピクセル座標の [x,y] 配列）。キラキラの置き場所の候補用。画像が大きいと配列も大きくなる
function edgePoints(c){
  const bb = bbox(c); if(!bb) return [];
  const W = c.width, d = c.getContext('2d', {willReadFrequently:true}).getImageData(0, 0, W, c.height).data, pts = [];
  for(let y = Math.max(1, bb.t); y <= Math.min(c.height - 2, bb.b); y++) for(let x = Math.max(1, bb.l); x <= Math.min(W - 2, bb.r); x++){
    const i = (y * W + x) * 4 + 3;
    if(d[i] > 128 && (d[i - 4] <= 128 || d[i + 4] <= 128 || d[i - W * 4] <= 128 || d[i + W * 4] <= 128)) pts.push([x, y]);
  }
  return pts;
}
/* 電球（マーキー）：塗りの少し内側の輪郭に等間隔で配置 */
// F に直接描く（実ピクセル）。高さマップを2回ぼかし、しきい値 T=0.62 を横切る画素＝塗りの輪郭の少し内側 を候補にする（ぼかした濃度の等高線を使うので、元の輪郭のギザつきや細部に左右されにくい）。
// 候補は固定シード(5)でシャッフルしたのち、グリッド(cell=gap/√2)で近傍だけ距離判定して間引き、gap 以上離れた点だけ採用（O(n) に近い間引き）。
// F 描画の後ろ・ベベル／インナーシャドウ／テカリより後に呼ぶ必要がある（既に描かれた塗りの形を読むため）
function drawBulbs(F, scale){
  const b = RS.bulbs, r = Math.max(1.5, b.size * RS.size * scale), gap = Math.max(r * 2.4, b.gap * RS.size * scale), bb = bbox(F); if(!bb) return;
  const W = F.width, H = F.height, pad = Math.ceil(r * 2) + 2;
  const l = Math.max(0, bb.l - pad), t = Math.max(0, bb.t - pad), w = Math.min(W, bb.r + pad) - l, h = Math.min(H, bb.b + pad) - t;
  const ctx = F.getContext('2d', {willReadFrequently:true}), d = ctx.getImageData(l, t, w, h).data;
  const a = new Float32Array(w * h); for(let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] / 255;
  const rr = Math.max(1, Math.round(r * 0.6)), hm = boxBlur(boxBlur(a, w, h, rr), w, h, rr), T = 0.62, pts = [];
  for(let y = 1; y < h - 1; y++) for(let x = 1; x < w - 1; x++){
    const i = y * w + x;
    if(hm[i] >= T && (hm[i - 1] < T || hm[i + 1] < T || hm[i - w] < T || hm[i + w] < T)) pts.push([x + l, y + t]);
  }
  const R = rng(5); for(let i = pts.length - 1; i > 0; i--){ const j = Math.floor(R() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
  const cell = gap / Math.SQRT2, grid = new Map(), ok = [];
  const key = (i, j) => i * 100003 + j;
  for(const [x, y] of pts){
    const gi = Math.floor(x / cell), gj = Math.floor(y / cell); let near = false;
    for(let di = -2; di <= 2 && !near; di++) for(let dj = -2; dj <= 2 && !near; dj++){
      const q = grid.get(key(gi + di, gj + dj)); if(q && (q[0] - x) ** 2 + (q[1] - y) ** 2 < gap * gap) near = true;
    }
    if(!near){ grid.set(key(gi, gj), [x, y]); ok.push([x, y]); }
  }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  for(const [x, y] of ok){
    ctx.shadowColor = rgba(b.c, b.glow); ctx.shadowBlur = r * 3;
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, b.c); g.addColorStop(1, darken(b.c, 0.35));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  ctx.restore();
}
/* キラキラ（4方向の星） */
// B（最終合成）の上に直接描く。位置は 75% が文字の輪郭上、残りが bbox 内のランダム。固定シードなので再描画しても位置は同じ。
// body から輪郭を取る（B は影・光彩を含み輪郭がぼやけるため）。ワープ・残像後の body と B は同寸法
function drawSparkles(B, body, scale){
  const s = RS.sparkle; if(s.count <= 0) return;
  const pts = edgePoints(body), bb = bbox(body); if(!pts.length || !bb) return;
  const R = rng(s.seed), x = B.getContext('2d'), base = s.size * RS.size * scale;
  x.save(); x.fillStyle = s.c;
  if(s.glow){ x.shadowColor = s.c; x.shadowBlur = base * 0.6; }
  for(let i = 0; i < s.count; i++){
    let px, py;
    if(R() < 0.75){ const p = pts[Math.floor(R() * pts.length)]; px = p[0]; py = p[1]; }
    else { px = bb.l + R() * (bb.r - bb.l); py = bb.t + R() * (bb.b - bb.t); }
    const r = base * (0.35 + R() * 0.65), k = r * 0.16;
    x.beginPath(); x.moveTo(px, py - r);
    x.quadraticCurveTo(px + k, py - k, px + r, py); x.quadraticCurveTo(px + k, py + k, px, py + r);
    x.quadraticCurveTo(px - k, py + k, px - r, py); x.quadraticCurveTo(px - k, py - k, px, py - r);
    x.fill();
  }
  x.restore();
}
/* 残像（スピード感） */
// body を角度 t.angle の向きに少しずつずらして count 枚重ね、遠いものほど薄くして、最後に本体を重ねた新キャンバスを返す。
// t.tint ON なら残像だけ単色にする（本体は元の色のまま最後に重ねる）。余白は renderStyle の xtra（trail.len）で確保済み
function addTrail(body, scale){
  const t = RS.trail, W = body.width, H = body.height, a = t.angle * PI / 180, Lp = t.len * RS.size * scale;
  let src = body;
  if(t.tint){ src = mk(W, H); const x = src.getContext('2d'); x.drawImage(body, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = t.c; x.fillRect(0, 0, W, H); }
  const out = mk(W, H), o = out.getContext('2d');
  for(let i = t.count; i >= 1; i--){ const k = i / t.count; o.globalAlpha = t.a * (1 - k * 0.85); o.drawImage(src, Math.cos(a) * Lp * k, Math.sin(a) * Lp * k); }
  o.globalAlpha = 1; o.drawImage(body, 0, 0);
  return out;
}

// 描画中のスタイル。render() の間だけ入り、描画用の関数はすべてこれを見る（画面の S は書き換えない）
let RS = null;
// style を scale 倍で描いたキャンバスを返す（style を省略すると、文字パネルで編集中のスタイル）
// 戻り値は透明余白をトリミング済みの canvas（文字が空なら 1x1）。同期処理で、フォントは読み込み済み前提（呼ぶ前に ensureFont を await）。
// 前の RS を退避して finally で戻すので、入れ子で呼ばれても（サムネ側が別 style で描く間など）RS が壊れない。例外が出ても必ず戻る
function render(scale, style = S){
  const prev = RS; RS = style;
  try{ return renderStyle(scale); } finally { RS = prev; }
}
// 描画本体。レイヤー（キャンバス）の役割：A=背面と最終合成の土台 / K=フチ / F=塗り。3枚とも同寸法(W×H)なので blit/cut が位置合わせなしで使える。
// plainText() は S を読む（fonts.js）。サムネ側が style を渡すときも空判定にはパネルの文字が使われる点に注意（実際の描画は RS.text）
// renderStyle の余白 m（装飾ごとのはみ出し量の合計）。L＝layout()、layers＝フチ（内側からの累積の太さ）、outer＝フチの総太さ、ex＝立体の厚み
function styleMargin(L, layers, outer, ex){
  // ここから m までは、装飾ごとの「はみ出し量」を足し合わせてキャンバスの余白を決める。足りないと装飾がキャンバス端で切れ、
  // 多すぎるとメモリ・時間が増える（最後に trim で切り落とすが、先に大きく確保される）。装飾を追加・拡大したら対応する項をここに足すこと
  const sh =RS.shadow.on ? Math.max(Math.abs(RS.shadow.x), Math.abs(RS.shadow.y)) + RS.shadow.blur * 1.5 : 0;
  const sgl = layers.length ? (RS.sglow.on ? RS.sglow.blur * 1.7 : 0) + RS.sblur * 1.6 : 0;
  const gl = RS.glow.on ? RS.glow.blur * (RS.glow.dual ? 2.2 : 1.6) : 0;
  const jit = RS.jitter.on ? RS.jitter.y + RS.size * (RS.jitter.scale + Math.sin(RS.jitter.rot * PI / 180)) : 0;
  const gli = RS.glitch.on ? Math.max(RS.glitch.rgb, RS.glitch.shift) : 0;
  const mrk = RS.marker.on ? RS.size * RS.marker.over : 0;
  const pl = RS.plate.on ? RS.size * (RS.plate.pad + 0.9) + RS.plate.sw + (['burst', 'ellipse', 'obubble', 'cloud', 'shout'].includes(RS.plate.shape) ? 0.3 * (L.w + L.h) : 0) : 0;
  // しっぽを長く・太く・曲げたときは、上の余白（0.9 文字ぶん）を超えるぶんだけ足す（初期値のしっぽは収まるので、余白は以前と同じ）
  const tailOver = RS.plate.on && ['bubble', 'sbubble', 'obubble', 'cloud', 'shout'].includes(RS.plate.shape) ? Math.max(0, RS.size * ((RS.plate.ts || 1) * (0.7 + Math.abs(+RS.plate.tbend || 0) * 0.4) * Math.max(1, (+RS.plate.tw || 1) * 0.6)) - RS.size * 0.9) : 0;
  const bxm = RS.box.on ? RS.size * (RS.box.pad + 0.45) + RS.box.sw : 0;
  const ofm = RS.offset.on ? Math.max(Math.abs(RS.offset.x), Math.abs(RS.offset.y)) + RS.offset.w : 0;
  const dtm = RS.dots.on ? RS.size * (RS.dots.size * 2 + 0.3) : 0;
  const xtra = (RS.fire.on ? RS.fire.height * RS.size + RS.size * 0.25 : 0) + (RS.drip.on ? RS.drip.len * RS.size * 1.2 : 0)
    + (RS.trail.on ? RS.trail.len * RS.size : 0) + (RS.distort.on ? RS.distort.amt : 0)
    + (RS.sparkle.on ? RS.sparkle.size * RS.size : 0) + (RS.bulbs.on ? RS.bulbs.size * RS.size * 3 : 0);
  const m = RS.size * 0.35 + outer + ex + sh + gl + sgl + jit + gli + mrk + pl + tailOver + bxm + ofm + dtm + xtra + 10;   // 最後の +10 は誤差・アンチエイリアス用の固定余白
  return m;
}
// renderStyle 1) 背面のキャンバス A を作って返す
function styleBack(sv){
  const {scale, L, items, cells, outer, ex, W, H, prep} = sv;
  const A = mk(W, H), ax = prep(A);
  if(RS.plate.on) drawPlate(ax, L, outer);
  if(RS.box.on) drawBoxes(ax, cells);
  if(RS.marker.on) drawMarker(ax, L);
  if(RS.offset.on) blit(A, drawOffsetLayer(prep, W, H, items, outer));
  if(ex > 0) blit(A, drawExtrude(prep, W, H, items, outer, scale));
  return A;
}
// renderStyle 2) フチのキャンバス K を作って返す
function styleStrokes(sv){
  const {items, dotCells, layers, W, H, prep} = sv;
  // 外側（太い）→内側（細い）の順に同じ文字を線で重ね描きする。K は後でぼかし等で作り直すことがあるので let
  let K = mk(W, H); const kx = prep(K);
  for(let i = layers.length - 1; i >= 0; i--){
    kx.strokeStyle = layers[i].c; kx.lineWidth = layers[i].w * 2;
    drawGlyphs(kx, items, (it, px, py) => kx.strokeText(it.t, px, py));
    dotCells.forEach(c => withCell(kx, c, () => { dotPath(kx); kx.stroke(); }));
  }
  return K;
}
// renderStyle 3) 塗りのキャンバス F を作って返す（ドリップ・ベベルは K も読む／書き換える）
function styleFill(sv, K){
  const {scale, L, items, dotCells, layers, outer, W, H, prep} = sv;
  // 順序が大事：ドリップ・模様・ベベルなどは「描かれた塗りの形」を読む／上から重ねるので、塗りの直後に、この順で行う
  const F = mk(W, H), fx = prep(F), fs = fillStyles(fx, L);
  if(L.v && RS.fillType !== 'solid'){
    // 縦書き：マスを回転させるとグラデーションも一緒に回ってしまうので、形を描いてから色を重ねる（行・強調ごと）
    const groups = new Map();
    for(const it of items){ const k = it.line * 2 + (it.a ? 1 : 0); if(!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
    for(const g of groups.values()){
      const T = mk(W, H), tx = prep(T);
      drawGlyphs(tx, g, (it, px, py) => { tx.fillStyle = '#000'; tx.fillText(it.t, px, py); });
      // source-in で、いま描いた形の中だけに色（グラデ）を塗る。fillRect は変換後でも全面に届くよう十分大きく取っている
      tx.globalCompositeOperation = 'source-in'; tx.fillStyle = fs(g[0]); tx.fillRect(-1e5, -1e5, 2e5, 2e5);
      blit(F, T);
    }
  }else drawGlyphs(fx, items, (it, px, py) => { fx.fillStyle = fs(it); fx.fillText(it.t, px, py); });
  if(dotCells.length){ fx.fillStyle = RS.dots.c; dotCells.forEach(c => withCell(fx, c, () => { dotPath(fx); fx.fill(); })); }
  if(RS.drip.on && RS.drip.amt > 0) drawDrips(F, K, outer * scale, layers.length ? layers[layers.length - 1].c : null, scale);
  if(RS.pattern.on && RS.pattern.a > 0){
    if(RS.pattern.type === 'halftone') drawHalftone(F, scale);
    else if(RS.pattern.type === 'cutlines') drawCutLines(fx, L);
    else drawPattern(F, scale);
  }
  if(RS.bevel.on){
    // target が 'both' ならフチ K にもベベルをかける（幅は size と最外フチ幅 outer の小さい方、最低1）
    bevel(F, RS.bevel.size * scale, RS.bevel);
    if(RS.bevel.target === 'both' && layers.length) bevel(K, Math.max(1, Math.min(RS.bevel.size, outer)) * scale, RS.bevel);
  }
  if(RS.inner.on) innerShadow(F, scale);
  if(RS.gloss.on) drawGloss(fx, L);
  if(RS.bulbs.on) drawBulbs(F, scale);
  return F;
}
// renderStyle 3) の続き：フチのぼかし（K を作り直す）・フチの光彩（A へ重ねる）。作り直した K を返す
function styleStrokeFx(sv, A, K){
  const {scale, layers, W, H} = sv;
  // フチのぼかし・フチの光彩（フチがあるときだけ）。ぼかしは K を作り直す（CSS blur の値は sblur×scale÷2）。光彩は str 回（最大4）重ねて濃くする。
  // 光彩は A（背面）へ先に重ねるので、フチ・文字がその上に乗る
  if(layers.length && RS.sblur > 0){ const B = mk(W, H), bx = B.getContext('2d'); bx.filter = `blur(${RS.sblur * scale / 2}px)`; bx.drawImage(K, 0, 0); K = B; }
  if(layers.length && RS.sglow.on && RS.sglow.a > 0){ const g = effectOnly(K, 0, 0, RS.sglow.blur, rgba(RS.sglow.c, RS.sglow.a), scale); for(let i = 0; i < Math.min(4, Math.max(1, Math.round(RS.sglow.str))); i++) blit(A, g); }
  return K;
}
// renderStyle 4) A・K・F を合成し、かすれ・ゆがみ・ワープ・残像まで済ませた本体 body を返す
function styleComposite(sv, A, K, F){
  const {scale} = sv;
  // 中抜き(hollow)=フチ K から塗り F の形を抜いて、フチだけ残す／くり抜き(knock)=背面 A ごと塗りの形で抜く（後ろが透ける）／通常=K の上に F
  // かすれ・ゆがみは合成後の A 全体に掛ける（背面・フチ・塗りが一緒に削れる）。ゆがみの量・細かさは実ピクセルなので scale 倍
  if(RS.fillMode === 'hollow'){ cut(K, F); blit(A, K); }
  else if(RS.fillMode === 'knock'){ blit(A, K); cut(A, F); }
  else { blit(A, K); blit(A, F); }
  if(RS.grunge.on && RS.grunge.amt > 0) applyGrunge(A, scale);
  if(RS.distort.on && RS.distort.amt > 0) displace(A, RS.distort.amt * scale, RS.distort.scale * scale, RS.distort.seed, 1);
  let body = warp(A);
  if(RS.trail.on && RS.trail.count > 0 && RS.trail.len > 0) body = addTrail(body, scale);
  return body;
}
// renderStyle 5) 炎・光彩・影の上に本体を重ね、キラキラを足した最終合成 B を返す
function styleGlowShadow(sv, body){
  const {scale} = sv;
  // B は最終合成用。炎 → 光彩 → 影 → 本体の順に重ねる（本体が最前面）。光彩・影は本体の形から作る（effectOnly）。以降、ワープ・残像後の body とは別に B を育てていく
  let B = mk(body.width, body.height); const bx = B.getContext('2d');
  if(RS.fire.on) bx.drawImage(makeFire(body, scale), 0, 0);
  if(RS.glow.on && RS.glow.blur > 0){
    if(RS.glow.dual){   // 2色ネオン：広い外側の光(c2)の上に、狭い内側の光(c)を str 回重ねる
      bx.drawImage(effectOnly(body, 0, 0, RS.glow.blur * 1.4, rgba(RS.glow.c2, RS.glow.a), scale), 0, 0);
      const g = effectOnly(body, 0, 0, RS.glow.blur * 0.5, rgba(RS.glow.c, RS.glow.a), scale);
      for(let i = 0; i < RS.glow.str; i++) bx.drawImage(g, 0, 0);
    }else{
      const g = effectOnly(body, 0, 0, RS.glow.blur, rgba(RS.glow.c, RS.glow.a), scale);
      for(let i = 0; i < RS.glow.str; i++) bx.drawImage(g, 0, 0);
    }
  }
  if(RS.shadow.on) bx.drawImage(effectOnly(body, RS.shadow.x, RS.shadow.y, RS.shadow.blur, rgba(RS.shadow.c, RS.shadow.a), scale), 0, 0);
  bx.drawImage(body, 0, 0);
  if(RS.sparkle.on) drawSparkles(B, body, scale);
  return B;
}
// renderStyle 7) 回転：回転後に収まる外接サイズのキャンバスを作り、中心を合わせて貼ったものを返す
function styleRotate(B){
  const a = RS.rotate * PI / 180, cw = B.width, chh = B.height;
  const R = mk(Math.ceil(Math.abs(cw * Math.cos(a)) + Math.abs(chh * Math.sin(a))), Math.ceil(Math.abs(cw * Math.sin(a)) + Math.abs(chh * Math.cos(a))));
  const rx = R.getContext('2d'); rx.translate(R.width / 2, R.height / 2); rx.rotate(a); rx.drawImage(B, -cw / 2, -chh / 2);
  return R;
}
function renderStyle(scale){
  platePlace = null;
  if(!plainText().trim()) return mk(1, 1);
  const L = layout(), items = glyphs(L);
  const cells = (RS.box.on || RS.dots.on) ? charCells(items) : [];
  const dotCells = RS.dots.on ? cells.filter(c => c.a) : [];
  const t = RS.vertical ? 0 : Math.tan(RS.skew * PI / 180);   // 縦書きは列全体ではなく、1文字ずつ傾ける（下の文字が横にずれないように）
  const on = RS.strokes.filter(s => s.on && s.w > 0);
  // フチは内側から累積した太さで描く（外側のフチほど太い線を先に描き、内側を上から重ねる。ループは逆順）。outer=最外周までの総太さ
  let cum = 0; const layers = on.map(s => ({w: (cum += s.w), c: s.c}));
  const outer = cum;
  const ex = RS.extrude.on ? RS.extrude.depth : 0;
  const m = styleMargin(L, layers, outer, ex);
  // 幅は斜体(skew)で横にはみ出す分（|t|×高さ）も足す。W/H は実ピクセル（scale 倍）
  const W =Math.ceil((L.w + 2 * m + Math.abs(t) * L.h) * scale), H = Math.ceil((L.h + 2 * m) * scale);
  // 描画用 ctx を作る関数。論理座標 → 実ピクセルの変換（scale 倍・余白 m 分のオフセット・斜体のせん断 -t）をここで一括して掛ける。
  // せん断 -t は下の行ほど x が左へずれる（t>0）ので、その分 t×L.h を左オフセットに足して切れないようにする（t<0 は右へはみ出すだけで W 側の |t|×L.h が吸収）。
  // font 等は canvas ごとに設定が必要（描画先を替えるたびに prep を通す）
  const prep = c => {
    const x = c.getContext('2d');
    x.setTransform(scale, 0, -t * scale, scale, (m + Math.max(0, t) * L.h) * scale, m * scale);
    x.font = fontStr(); x.letterSpacing = lsx() + 'px'; x.lineJoin = 'round'; x.lineCap = 'round'; x.textBaseline = 'alphabetic';
    return x;
  };

  // 段階ごとの関数（styleBack 〜 styleGlowShadow）に渡す値
  const sv = {scale, L, items, cells, dotCells, layers, outer, ex, W, H, prep};
  // 1) 背面：背景シェイプ → 一文字囲み → マーカー → 板ずれ → 押し出し
  const A = styleBack(sv);
  // 2) フチ（傍点にもフチ）
  let K = styleStrokes(sv);
  // 3) 文字の塗り → 模様 → ベベル → インナーシャドウ → テカリ
  const F = styleFill(sv, K);
  // 3) の続き：フチのぼかし・フチの光彩
  K = styleStrokeFx(sv, A, K);
  // 4) 合成（通常／中抜き／くり抜き）→ かすれ → ワープ
  const body = styleComposite(sv, A, K, F);
  // 5) 光彩・影
  let B = styleGlowShadow(sv, body);
  // 6) 鏡面反射 → グリッチ（反射もグリッチの対象にするため反射が先）
  if(RS.reflect.on) B = addReflection(B, body, scale);
  if(RS.glitch.on) B = glitch(B, scale);
  // 7) 回転（最後に画像全体を回す。回転後に収まる外接サイズのキャンバスを作り、中心を合わせて貼る）
  const rotM = RS.rotate ? rotateMatrix(B) : null;
  if(RS.rotate) B = styleRotate(B);
  // 8) 自動トリミング（余白 RS.pad は論理 px なので scale 倍。サムネ側の thumb/render.js は pad:2 を渡す）
  const out = trim(B, Math.round(RS.pad * scale));
  // 吹き出しのしっぽの位置を、この絵のピクセル座標に直して付ける（thumb/tailhandle.js のつまみ用）。ワープ・残像・反射・グリッチは絵の原点を動かさない
  if(platePlace) /** @type {any} */ (out).plate = plateOnCanvas(platePlace, rotM);
  return out;
}
// 回転（styleRotate）で、回転前の絵のピクセル → 回転後のピクセルへの変換
function rotateMatrix(B){
  const a = RS.rotate * PI / 180, cw = B.width, chh = B.height;
  const RW = Math.ceil(Math.abs(cw * Math.cos(a)) + Math.abs(chh * Math.sin(a))), RH = Math.ceil(Math.abs(cw * Math.sin(a)) + Math.abs(chh * Math.cos(a)));
  return new DOMMatrix().translate(RW / 2, RH / 2).rotate(RS.rotate).translate(-cw / 2, -chh / 2);
}
// platePlace（論理座標と、論理→背面の絵の変換 m）を、最終の絵（回転・トリミング後）のピクセル座標にまとめる
function plateOnCanvas(P, rotM){
  let M = new DOMMatrix().translate(trimShift[0], trimShift[1]);
  if(rotM) M = M.multiply(rotM);
  M = M.multiply(P.m);
  const at = ([x, y]) => { const q = M.transformPoint(new DOMPoint(x, y)); return [q.x, q.y]; };
  return {m:[M.a, M.b, M.c, M.d, M.e, M.f], tip:at(P.tip), base:at(P.base), center:at(P.lc), lc:P.lc, lbase:P.base, ltip:P.tip, rx:P.rx, ry:P.ry, kind:P.kind, size:P.size};
}
