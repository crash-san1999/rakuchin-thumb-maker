/* 楽ちんサムネメーカー：分割フレーム ③ マスの操作（collage.js の続き。4 ファイルの分担は collage.js の先頭を参照）
   キャンバス上の位置 → どのマスか（collageCellAt・collageCellSize）／マスの文字のスタイルとフォント読み込み／1週間を自動で入れる（collageFillWeek）／
   分割フレームの追加と画像の割り当て（addCollage・collageSetCell・collageTakeFiles）／マスの入れ替え・元に戻す（swapCells・resetCell）。 */
/* キャンバス上の位置 → どのマスか */
// x, y はドキュメント座標。レイヤーの回転を逆に戻してレイヤー内の割合(u,v)にし、1000 幅の仮想キャンバスで多角形の内外判定をする。
// 戻り値はマス番号、どのマスでもなければ -1。境界の加工（ギザギザ等）は無視した、元の分割線で判定する
/** @param {Layer} L */
function collageCellAt(L, x, y){
  const a = -(L.rot || 0) * PI / 180, dx = x - L.x, dy = y - L.y;
  const w = L.bw * L.sc, h = L.bh * L.sc, u = (dx * Math.cos(a) - dy * Math.sin(a)) / w + 0.5, v = (dx * Math.sin(a) + dy * Math.cos(a)) / h + 0.5;
  if(u < 0 || u > 1 || v < 0 || v > 1) return -1;
  const cells = collageCells(L.layout, collageN(L), 1000, 1000 * h / w, L.slant, L.main), px = u * 1000, py = v * 1000 * h / w;
  const inside = poly => { let c = false; for(let i = 0, j = poly.length - 1; i < poly.length; j = i++){ const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c; } return c; };
  const i = cells.findIndex(inside); return i;
}
/** @param {Layer} L */
function collageCellSize(L, i){ // マスの大きさ（ドキュメント座標）
  const w = L.bw * L.sc, h = L.bh * L.sc, p = collageCells(L.layout, collageN(L), w, h, L.slant, L.main)[i] || [[0, 0], [w, h]];
  const xs = p.map(q => clamp(q[0], 0, w)), ys = p.map(q => clamp(q[1], 0, h));
  return [Math.max(1, Math.max(...xs) - Math.min(...xs)), Math.max(1, Math.max(...ys) - Math.min(...ys))];
}

/* マスの文字：スタイル・使う文字・フォント読み込み */
// フォント読み込みは、全マスの文字を連結した文字列で行う（使う字だけ読み込む方式のため。空なら 'あ' でフォント自体は読み込む）
/** @param {Layer} L */
const collageAllText = L => L.cells.map(c => c.tx && c.tx.text || '').join('') || 'あ';
function collageDefaultStyle(){ const p = PRESETS.find(q => q[0] === 'ポップ') || PRESETS[0]; return merged(p[1]); }
/** @param {Layer} L */
function collageSetStyle(L, name){
  const p = PRESETS.find(q => q[0] === name); if(!p) return;
  L.tpre = name; L.tstyle = merged(p[1]);
}
/** @param {Layer} L */
async function ensureCollageFonts(L){ if(L.type === 'collage' && !L.hidden && L.cells.some(cellHasText)) await ensureFont(Object.assign({}, L.tstyle || collageDefaultStyle(), {text: collageAllText(L)})); }

/* 1週間を自動で入れる：選んだ日を含む週を、週の始まり（月／日）から7日ぶん、上のマスから順に入れる */
const WK_JA = ['日', '月', '火', '水', '木', '金', '土'], WK_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const WK_BG = {wd:['#fff6dd', '#ffe9b8'], sat:['#d8ecff', '#a9d2ff'], sun:['#ffdbe3', '#ffb3c4']};
// startStr は 'YYYY-MM-DD'（形式が違う・空なら今日）。first は 'sun' なら日曜始まり、それ以外は月曜始まり。
// ローカル時間で日付だけを扱う（new Date('YYYY-MM-DD') は UTC 扱いで日がずれるので、年月日を分解して作る）
function weekDates(startStr, first){   // 戻り値：7日ぶんの Date
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startStr || ''), t = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(), d0 = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const back = first === 'sun' ? d0.getDay() : (d0.getDay() + 6) % 7;
  return [...Array(7)].map((_, i) => new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - back + i));
}
function weekLabel(d, wk){
  let w = wk.fmt === 'en' ? WK_EN[d.getDay()] : wk.fmt === 'ja3' ? WK_JA[d.getDay()] + '曜日' : WK_JA[d.getDay()];
  const dt = `${d.getMonth() + 1}/${d.getDate()}`;
  if(wk.paren === 'full') w = `（${w}）`; else if(wk.paren === 'half') w = `(${w})`;
  if(wk.show === 'date') return dt; if(wk.show === 'wd') return w;
  return wk.layout === 'side' ? dt + (wk.paren && wk.paren !== 'none' ? '' : ' ') + w : `${dt}\n${w}`;   // 日付の横（括弧があればくっつける）／日付の下
}
/** マス一覧の小さいボタンに出す文字：1行目だけ。「10/7(月)」のような日付は括弧の手前までを出して、途中で（の前で切れないようにする */
function cellBtnLabel(text){
  const first = String(text || '').split('\n')[0].trim();
  const m = first.match(/^[^(（]+/);                    // 括弧より前（日付そのもの）
  const head = (m ? m[0] : first).trim() || first;
  return head.length > 6 ? head.slice(0, 5) + '…' : head;
}
// 7日ぶんをマス0から順に入れる（マスが少なければそこまで）。画像のあるマスは文字を上寄せ('t')にして絵を隠さない。
// 8分割のときは最後のマスを「MEMO」にする（ただし文字が入っていれば上書きしない）
/** @param {Layer} L */
function collageFillWeek(L){
  const wk = L.wk, days = weekDates(wk.start, wk.first), n = collageN(L);
  if(!L.tstyle) collageSetStyle(L, 'ポップ');
  days.slice(0, n).forEach((d, i) => {
    const c = L.cells[i], k = d.getDay() === 6 ? 'sat' : d.getDay() === 0 ? 'sun' : 'wd';
    c.tx = Object.assign(c.tx, {on:true, text:weekLabel(d, wk), pos: ASSETS[c.asset] ? 't' : 'c', sc:1, ox:0, oy:0});
    if(wk.color) c.bg = Object.assign(c.bg, {on:true, c:WK_BG[k][0], c2:WK_BG[k][1], grad:true});
  });
  if(n >= 8 && !cellHasText(L.cells[7])) L.cells[7].tx = Object.assign(L.cells[7].tx, {on:true, text:'MEMO', pos:'c', sc:0.6});
}

/* 追加・画像の割り当て */
function addCollage(){
  const L = Object.assign(COLLAGE_BASE(), {id: uid()});
  DOC.layers.unshift(L); if(DOC.mode !== 'thumb') setMode('thumb');
  openInspector(); selectLayer(L.id); docChanged(false);
  toast('分割フレームを追加しました。マスに画像をドロップするか、左の「マスの画像」から選んでください');
}
// マスに画像を入れる。位置・大きさ・回転・反転は初期化し、背景・文字・効果は残す（古い保存データのマスに fx が無くても補う）
/** @param {Layer} L */
async function collageSetCell(L, i, file){
  const id = await addAsset(await fileToSrc(file), file.name);
  L.cells[i] = Object.assign({zoom:1, ox:0, oy:0, fx:CELL_FX_BASE()}, L.cells[i], {asset:id, zoom:1, ox:0, oy:0, rot:0, flip:false, flipV:false});
}
// ドロップ位置のマス、なければ選択中の分割フレームの空いているマスに順に入れる。残りを返す
async function collageTakeFiles(files, cx, cy){
  let rest = files.slice();
  if(DOC.mode === 'thumb' && cx != null){
    const r = $('#tv').getBoundingClientRect();
    if(cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom){
      const x = (cx - r.left) / r.width * DOC.w, y = (cy - r.top) / r.height * DOC.h;
      // ドロップでマスに入れるのは、いま選んでいる分割フレームの上に落としたときだけ（それ以外は、ふつうに画像レイヤーとして追加）
      const L = [selLayer()].find(l => l && l.type === 'collage' && !l.hidden && collageCellAt(l, x, y) >= 0);
      if(L){
        let i = collageCellAt(L, x, y); const n = collageN(L);
        while(rest.length && i < n){ await collageSetCell(L, i, rest.shift()); L.ac = i; i++; while(i < n && ASSETS[L.cells[i].asset]) i++; }
        selectLayer(L.id); docChanged(false); toast('分割フレームのマスに画像を入れました');
        return rest;
      }
    }
  }
  const C = cx == null ? selLayer() : null;   // ドロップのときは、ここでは入れない（選んでいても、落とした位置がマスの外なら画像レイヤーにする）
  if(C && C.type === 'collage'){
    const n = collageN(C); let filled = 0;
    for(let i = 0; i < n && rest.length; i++) if(!ASSETS[C.cells[i].asset]){ await collageSetCell(C, i, rest.shift()); C.ac = i; filled++; }
    if(filled){ docChanged(false); toast(`分割フレームの空いているマスに ${filled} 枚入れました`); }
  }
  return rest;
}

// マスの中の画像を、回転・反転して描く
function cellImg(x, img, cx, cy, dw, dh, cell){
  if(!cell.rot && !cell.flip && !cell.flipV){ x.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh); return; }
  x.save(); x.translate(cx, cy); x.rotate((cell.rot || 0) * PI / 180); x.scale(cell.flip ? -1 : 1, cell.flipV ? -1 : 1); x.drawImage(img, -dw / 2, -dh / 2, dw, dh); x.restore();
}
// マスの画像を入れ替える（画像・位置・大きさ・回転・反転。効果はマスに残す）
// 入れ替えるのは画像に付随する項目だけ（背景色・文字・効果は「マスの場所」に属するので動かさない）
const CELL_IMG_KEYS = ['asset', 'zoom', 'ox', 'oy', 'rot', 'flip', 'flipV'];
/** @param {Layer} L */
function swapCells(L, i, j){
  if(i === j || i < 0 || j < 0) return;
  const a = L.cells[i], b = L.cells[j];
  for(const k of CELL_IMG_KEYS){ const t = a[k]; a[k] = b[k]; b[k] = t; }
  L.ac = j;
}
/** @param {Layer} L */
function resetCell(L, i){ Object.assign(L.cells[i], {zoom:1, ox:0, oy:0, rot:0, flip:false, flipV:false}); }
