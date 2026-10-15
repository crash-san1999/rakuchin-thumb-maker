/* 楽ちんサムネメーカー：文字の描画エンジン ① 本体 */
/*
  役割：文字スタイル（style オブジェクト）を受け取り、装飾込みの透過キャンバスを1枚返す。UI には触らない純粋な描画層。
  公開：render(scale, style=S)（唯一の入口）／METALS（金属グラデ定義）／BOX_PALETTES（一文字囲みのおまかせ配色）。
  ファイルの分け方：この本体（文字の並べ方・縦書き・塗り・描画の手順）／text-pixel.js（ピクセル処理）／text-deco.js（装飾。BOX_PALETTES もここ）。
     3つは同じ RS と部品を共有し、互いの関数は関数の中から呼ぶだけなので、読み込みは text-render → text-pixel → text-deco の順ならよい。
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
// ファイルの中だけで使う名前を外（ほかのファイルと共有の場所）に出さないよう、中身を関数で包んでいる。外から使う名前は最後の return で出す
// 外から読み書きする変数（ほかのファイルが今の値を読むので、外で宣言して中では代入だけにする）
let RS;
var {mctx, darken, fontStr, METALS, parse, lsx, layout, baseY, lineTop, glyphs, drawGlyphs, render} = (() => {
// mctx：文字幅の計測専用の小さな canvas。描画用 ctx とは別にして、font / letterSpacing を計測のたびに設定し直して使う
const mctx = ctx2d(mk(4, 4));
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

RS = null;
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
  if(layers.length && RS.sblur > 0){ const B = mk(W, H), bx = ctx2d(B); bx.filter = `blur(${RS.sblur * scale / 2}px)`; bx.drawImage(K, 0, 0); K = B; }
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
  let B = mk(body.width, body.height); const bx = ctx2d(B);
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
  const rx = ctx2d(R); rx.translate(R.width / 2, R.height / 2); rx.rotate(a); rx.drawImage(B, -cw / 2, -chh / 2);
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
    const x = ctx2d(c);
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
return {mctx, darken, fontStr, METALS, parse, lsx, layout, baseY, lineTop, glyphs, drawGlyphs, render};
})();
