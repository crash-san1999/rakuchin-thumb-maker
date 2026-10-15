/* 楽ちんサムネメーカー：週間予定表（7日ぶんの「日付｜時刻｜タイトル｜画像」を、帯つきの行で並べる）① データの形・描画・追加
   1つの予定表＝DOC.layers の1枚のレイヤー（type:'sched'）。L.rows[0..6] に1日ぶんの時刻・タイトル・画像・おやすみを持つ。
   日付は保存せず、L.start（その週の任意の日）と L.first（週の始まり）から毎回計算する（weekDates・weekLabel は collage-cells.js と共通）。
   操作パネルは sched-panel.js。描画は分割フレームと同じく、レイヤー全体を1枚のキャンバスに描いてキャッシュし、drawSched が位置・回転を付けて貼る。
   座標系：行・列の位置は W×H（描画先キャンバスのピクセル）。レイヤー自体の位置・大きさはドキュメント座標（L.bw×L.bh を L.sc 倍）。 */
// ファイルの中だけで使う名前を外（ほかのファイルと共有の場所）に出さないよう、中身を関数で包んでいる。外から使う名前は最後の return で出す
// 型の定義（types/types.js）が typeof で型を引く既定値は、包みの外に置く（中に入れると型が循環するため）
// 1日ぶん。time が空なら共通の時刻（L.time）を使う。rest＝おやすみ（時刻・画像を出さず、おやすみの文字と色にする）。asset＝右端の画像（ASSETS の id）
const SCHED_ROW = () => ({time:'', title:'', asset:null, rest:false});
// bw/bh は作った時点の大きさ（以後 DOC のサイズ変更とは独立。表示の大きさは bw/bh × sc）。
// dstyle＝日付・時刻の文字スタイル、tstyle＝タイトル・おやすみの文字スタイル（null なら dpre/tpre の名前のプリセット）
function SCHED_BASE(){
  const W = typeof DOC === 'object' && DOC ? DOC.w : 1920, H = typeof DOC === 'object' && DOC ? DOC.h : 1080;
  return Object.assign(LAYER_BASE(), {type:/** @type {'sched'} */ ('sched'), bw:Math.round(W * 0.66), bh:Math.round(H * 0.8), x:Math.round(W * 0.64), y:Math.round(H * 0.56),
    start:'', first:'mon', fmt:'ja1', paren:'half', time:'20:00',
    band:'brush', bandColor:'rainbow', bandC:'#f5c33b', restText:'おやすみ', restC:'#e8453c', gap:0.16, img:true, seed:7,
    dpre:'白フチ', dstyle:null, tpre:'白フチ', tstyle:null,
    rows:[...Array(7)].map(() => SCHED_ROW())});
}
var {SCHED_BANDS, SCHED_COLORS, isSched, schedPreset, schedDStyle, schedTStyle, schedDays, schedDayLabel, ensureSchedFonts, addSched, schedSetImage, schedTakeFiles, schedApplyText, schedShiftWeek} = (() => {
// 帯の形・帯の色の選択肢（設定パネルとキャッシュのテストが使う）
const SCHED_BANDS = [['brush', '筆'], ['tape', 'テープ'], ['round', '角丸'], ['flat', '四角'], ['none', 'なし']];
const SCHED_COLORS = [['rainbow', '曜日ごと'], ['week', '平日・土・日'], ['one', '1色']];
// 曜日ごとの帯の色（getDay() の順：日〜土）。平日・土・日の3色は WK3
const SCHED_RAINBOW = ['#f490bd', '#f5b93a', '#e8453c', '#3d9be0', '#2fb457', '#f2cf37', '#2f5bd3'];
const SCHED_WK3 = {wd:'#f5c33b', sat:'#3d7be0', sun:'#f06b8f'};
const isSched = /** @param {Layer|null|undefined} L @returns {L is SchedLayer} */ L => !!L && L.type === 'sched';
// プリセット名 → 文字スタイル（見つからなければ「ポップ」）
/** @param {string} name */ function schedPreset(name){ const p = PRESETS.find(q => q[0] === name) || PRESETS.find(q => q[0] === 'ポップ') || PRESETS[0]; return merged(p[1]); }
const schedDStyle = L => L.dstyle || schedPreset(L.dpre);
const schedTStyle = L => L.tstyle || schedPreset(L.tpre);
// 7日ぶんの Date（L.start を含む週）と、その日の見出し（例：10/12(月)）
const schedDays = L => weekDates(L.start, L.first);
const schedDayLabel = (L, d) => weekLabel(d, {fmt:L.fmt, paren:L.paren, show:'both', layout:'side'});
const schedTime = (L, r) => String((r.time || '').trim() || L.time || '');
// 行 i の帯の色
function schedBandColor(L, d, r){
  if(r.rest) return L.restC;
  if(L.bandColor === 'one') return L.bandC;
  if(L.bandColor === 'week'){ const g = d.getDay(); return g === 6 ? SCHED_WK3.sat : g === 0 ? SCHED_WK3.sun : SCHED_WK3.wd; }
  return SCHED_RAINBOW[d.getDay()];
}
// 行・列の位置（キャンバスのピクセル）。日付の列は左、帯は日付の右から端まで。画像の列は帯の右端（16:9）。
// 戻り値：rows[i] = {y, h（帯の高さ）, date:[x, w], time:[x, w], title:[x, w], img:[x, w] | null, band:[x, w]}
/** @param {SchedLayer} L @param {number} W @param {number} H */ function schedLayout(L, W, H){
  const rh = H / 7, bh = rh * (1 - clamp(+L.gap || 0, 0, 0.6)), dateW = W * 0.3, timeW = W * 0.16;
  const imgW = L.img ? Math.min(W * 0.24, bh * 16 / 9) : 0, bandX = dateW - W * 0.01, bandW = W - bandX;
  return [...Array(7)].map((_, i) => {
    const y = rh * i + (rh - bh) / 2, pad = bh * 0.12;
    const titleX = dateW + timeW, titleW = Math.max(1, W - titleX - (imgW ? imgW + pad : pad));
    return {y, h:bh, date:[0, dateW - pad], time:[dateW + pad * 0.3, timeW - pad * 0.3], title:[titleX, titleW],
      img: imgW ? [W - imgW - pad * 0.5, imgW] : null, band:[bandX, bandW], rest:[dateW + pad, W - dateW - pad * 2]};
  });
}
// 帯の形を描くパス。brush は乱数（L.seed と行番号）で上下の辺と両端をがたつかせた筆の跡、tape は両端を斜めに切った帯
/** @param {CanvasRenderingContext2D} x @param {string} kind @param {number} bx @param {number} by @param {number} bw @param {number} bh @param {number} seed */ function schedBandPath(x, kind, bx, by, bw, bh, seed){
  x.beginPath();
  if(kind === 'round'){ x.roundRect(bx, by, bw, bh, bh / 2); return; }
  if(kind === 'flat'){ x.rect(bx, by, bw, bh); return; }
  if(kind === 'tape'){ const s = bh * 0.35; x.moveTo(bx + s, by); x.lineTo(bx + bw, by); x.lineTo(bx + bw - s, by + bh); x.lineTo(bx, by + bh); x.closePath(); return; }
  // brush：上辺は左→右、右端はギザギザ、下辺は右→左、左端は丸みのあるかすれ
  const R = rng(seed), n = Math.max(8, Math.round(bw / (bh * 0.35))), jy = bh * 0.07, je = bh * 0.22;
  x.moveTo(bx + R() * je, by + R() * jy);
  for(let k = 1; k <= n; k++) x.lineTo(bx + bw * k / n - (k === n ? R() * je : 0), by + (R() - 0.5) * jy * 2);
  for(let k = 1; k < 6; k++) x.lineTo(bx + bw - R() * je * (k % 2 ? 1.6 : 0.4), by + bh * k / 6);
  for(let k = n; k >= 0; k--) x.lineTo(bx + bw * k / n + (k === 0 ? R() * je : 0), by + bh + (R() - 0.5) * jy * 2);
  for(let k = 5; k > 0; k--) x.lineTo(bx + R() * je * (k % 2 ? 1.4 : 0.3), by + bh * k / 6);
  x.closePath();
}
// 文字を [x, w]×行の高さ h の枠に収めて描く。al＝'l'（左寄せ）／'c'（中央）。fill＝枠の高さのうち文字に使う割合
function schedText(x, st, text, bx, bw, by, bh, al, fill){
  if(!String(text).trim()) return;
  const s = Object.assign({}, st, {text:String(text), pad:2, vertical:false}), c0 = render(0.25, s); if(c0.width <= 2) return;
  const k = clamp(Math.min(bw / (c0.width / 0.25), bh * fill / (c0.height / 0.25)), 0.03, 8), c = render(k, s);
  const cx = al === 'l' ? bx + c.width / 2 : bx + bw / 2;
  x.drawImage(c, cx - c.width / 2, by + bh / 2 - c.height / 2);
}
// 画像を [x, w]×帯の高さに、はみ出す分を切り取って（cover）白フチつきで描く
function schedImage(x, A, ix, iw, by, bh){
  const ih = bh * 1.06, iy = by + (bh - ih) / 2, r = Math.min(iw, ih) * 0.06, img = A.img, s = Math.max(iw / img.naturalWidth, ih / img.naturalHeight);
  x.save(); x.beginPath(); x.roundRect(ix, iy, iw, ih, r); x.clip();
  x.drawImage(img, ix + (iw - img.naturalWidth * s) / 2, iy + (ih - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
  x.restore();
  x.lineWidth = Math.max(1, bh * 0.045); x.strokeStyle = '#ffffff'; x.beginPath(); x.roundRect(ix, iy, iw, ih, r); x.stroke();
}
// 予定表全体を W×H の1枚のキャンバスに描く。描く順序：行ごとに 帯 → 日付 → 時刻・タイトル（おやすみなら おやすみの文字）→ 画像
/** @param {SchedLayer} L @param {number} W @param {number} H */ function schedCanvas(L, W, H){
  const c = mk(W, H), x = ctx2d(c), days = schedDays(L), lay = schedLayout(L, W, H), ds = schedDStyle(L), ts = schedTStyle(L);
  lay.forEach((g, i) => {
    const r = L.rows[i] || SCHED_ROW(), d = days[i];
    if(L.band !== 'none'){ x.fillStyle = schedBandColor(L, d, r); schedBandPath(x, L.band, g.band[0], g.y, g.band[1], g.h, (L.seed | 0) * 31 + i * 7 + 1); x.fill(); }
    schedText(x, ds, schedDayLabel(L, d), g.date[0], g.date[1], g.y, g.h, 'l', 1);
    if(r.rest){ schedText(x, ts, L.restText, g.rest[0], g.rest[1], g.y, g.h, 'c', 0.95); return; }
    schedText(x, ds, schedTime(L, r), g.time[0], g.time[1], g.y, g.h, 'c', 0.95);
    schedText(x, ts, r.title, g.title[0], g.title[1], g.y, g.h, 'c', 0.9);
    const A = assetOf(r.asset); if(g.img && A) schedImage(x, A, g.img[0], g.img[1], g.y, g.h);
  });
  return c;
}
// ctx に予定表を描く。絵は schedCanvas で作ってレイヤーごとにキャッシュし、ここでは位置・回転・影・不透明度を付けて貼るだけ（drawCollage と同じ手順）。
// sk：見た目が変わる設定すべての印。描画に効く項目を足したら、ここにも必ず足す（日付は今日によって変わるので、計算した見出しも入れる）
/** @param {SchedLayer} L */
function drawSched(ctx, L, f, live, cache){
  const w = L.bw * L.sc, h = L.bh * L.sc, W = Math.max(2, Math.round(w * f)), H = Math.max(2, Math.round(h * f));
  dims.set(L.id, {w, h});
  const ds = schedDStyle(L), ts = schedTStyle(L);
  const sk = JSON.stringify([L.bw, L.bh, L.start, L.first, L.fmt, L.paren, L.time, L.band, L.bandColor, L.bandC, L.restText, L.restC, L.gap, L.img, L.seed,
    ds, ts, fontKey(ds), fontKey(ts), schedDays(L).map(d => schedDayLabel(L, d)), L.rows, L.rows.map(r => !!assetOf(r.asset))]);
  const e = cacheBySize(cache, L.id, sk, W, H, live, () => schedCanvas(L, W, H));
  ctx.save(); poseLayer(ctx, L, f);
  ctx.drawImage(e.c, -w * f / 2, -h * f / 2, w * f, h * f);
  ctx.restore();
}
// 予定表の文字に使うフォントを読み込む（drawThumb が描く前に待つ）。実際に描く文字を渡して、分割されたフォントの必要な分だけ読む
/** @param {Layer} L */
async function ensureSchedFonts(L){
  if(!isSched(L) || L.hidden) return;
  const days = schedDays(L), dtx = days.map(d => schedDayLabel(L, d)).join('') + L.rows.map(r => schedTime(L, r)).join(''), ttx = L.rows.map(r => r.title).join('') + L.restText;
  await ensureFont(Object.assign({}, schedDStyle(L), {text: dtx || '0'}));
  await ensureFont(Object.assign({}, schedTStyle(L), {text: ttx || 'あ'}));
}
// ドキュメント座標 (x, y) が予定表 L の何行目か（回転・拡大縮小を考慮）。外なら -1
/** @param {SchedLayer} L @param {number} x @param {number} y */ function schedRowAt(L, x, y){
  const a = -(L.rot || 0) * PI / 180, dx = x - L.x, dy = y - L.y, w = L.bw * L.sc, h = L.bh * L.sc;
  const lx = dx * Math.cos(a) - dy * Math.sin(a) + w / 2, ly = dx * Math.sin(a) + dy * Math.cos(a) + h / 2;
  return lx < 0 || ly < 0 || lx > w || ly > h ? -1 : clamp(Math.floor(ly / (h / 7)), 0, 6);
}
// 保存データを既定値と混ぜ、外から来た値（プロジェクトファイル）を安全な範囲にそろえる。種類の登録（下の defineLayerKind の normalize）から呼ぶ
function normalizeSched(L){
  const b = SCHED_BASE(), o = Object.assign(b, L);
  const pick = (v, list, d) => list.some(q => q[0] === v) ? v : d, str = (v, n, d = '') => typeof v === 'string' ? v.slice(0, n) : d;
  o.start = /^\d{4}-\d{2}-\d{2}$/.test(o.start) ? o.start : ''; o.first = o.first === 'sun' ? 'sun' : 'mon';
  o.fmt = ['ja1', 'ja3', 'en'].includes(o.fmt) ? o.fmt : 'ja1'; o.paren = ['none', 'full', 'half'].includes(o.paren) ? o.paren : 'half';
  o.time = str(o.time, 12, '20:00'); o.restText = str(o.restText, 30, 'おやすみ');
  o.band = pick(o.band, SCHED_BANDS, 'brush'); o.bandColor = pick(o.bandColor, SCHED_COLORS, 'rainbow');
  o.bandC = safeColor(o.bandC, '#f5c33b'); o.restC = safeColor(o.restC, '#e8453c');
  o.gap = clamp(+o.gap || 0, 0, 0.6); o.img = o.img !== false; o.seed = Math.round(+o.seed) || 7;
  o.bw = clamp(+o.bw || 1200, 100, 6000); o.bh = clamp(+o.bh || 800, 100, 6000);
  o.dpre = str(o.dpre, 40, '白フチ'); o.tpre = str(o.tpre, 40, '白フチ');
  o.dstyle = L.dstyle && typeof L.dstyle === 'object' ? merged(L.dstyle) : null; o.tstyle = L.tstyle && typeof L.tstyle === 'object' ? merged(L.tstyle) : null;
  const rows = Array.isArray(L.rows) ? L.rows : [];
  o.rows = [...Array(7)].map((_, i) => { const s = rows[i] && typeof rows[i] === 'object' ? rows[i] : {};   // 必ず7日ぶん（多い分は捨て、足りない分は空の日）
    return {time:str(s.time, 12), title:str(s.title, 60), asset: okId(s.asset) ? s.asset : null, rest: s.rest === true}; });
  return o;
}

/* 追加・画像の割り当て */
function addSched(){
  const L = Object.assign(SCHED_BASE(), {id: uid()});
  DOC.layers.push(L); if(DOC.mode !== 'thumb') setMode('thumb');   // 予定表は主役なので、いちばん手前に置く（分割フレームは背景向けなので奥）
  openInspector('lay-sched'); selectLayer(L.id); docChanged(false);
  toast('週間予定表を追加しました。設定の「予定」タブで時刻・タイトルを入れ、行に画像をドロップできます');
}
// 行 i に画像を入れる
/** @param {SchedLayer} L */
async function schedSetImage(L, i, file){
  const id = await addAsset(await fileToSrc(file), file.name);
  L.rows[i].asset = id; if(!L.img) L.img = true;
}
// ドロップ位置（画面の座標 cx, cy）が、いま選んでいる予定表の行の上なら、その行から下へ順に空いている行へ入れる（残りは返す）。
// 分割フレームと同じく、選んでいない予定表の上に落としたときは、ふつうに画像レイヤーとして追加する
async function schedTakeFiles(files, cx, cy){
  const L = selLayer(); if(!files.length || !isSched(L) || L.hidden || DOC.mode !== 'thumb' || cx == null) return files;
  const r = $('#tv').getBoundingClientRect(); if(cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return files;
  let i = schedRowAt(L, (cx - r.left) / r.width * DOC.w, (cy - r.top) / r.height * DOC.h); if(i < 0) return files;
  const rest = files.slice(), first = i;
  while(rest.length && i < 7){ await schedSetImage(L, i, rest.shift()); i++; while(i < 7 && (assetOf(L.rows[i].asset) || L.rows[i].rest)) i++; }
  syncDoc(); docChanged(false); toast(`${schedDayLabel(L, schedDays(L)[first])} の行に画像を入れました`);
  return rest;
}

/* テキストで一括入力：1行＝1日。「10/12 20:00 忍者八ッ島くん」「10/13 おやすみ」「水 21時 コラボ配信」のように書く。
   ・行の先頭の日付（10/12・10月12日）か曜日（月・月曜・(月)）で、その日の行に入れる。どちらも無い行は、前の行の次の日に入れる（最初は1日目）
   ・その週に無い日付の行は使わない（skipped に数える）
   ・時刻（20:00・20時・20時30分）があれば、その日の時刻にする。「24時間耐久」のように「時」の後ろに文字が続くものはタイトルの一部
   ・おやすみ・休み・休止・OFF だけの行は、おやすみの日にする
   ・残りの文字がタイトル（区切りの - ｜ ： などは取る）。画像はそのまま
   戻り値：{done：入れた行の番号の配列（同じ日が2回あれば後の行が勝つ）, skipped：使わなかった行の数} */
const SCHED_REST_RE = /^(お?やすみ|お?休み|休止|休養日?|配信なし|off|OFF|Off)$/;
const SCHED_SEP = '\\s\\-–—:：|｜/／~〜・,、';
function schedParseLine(L, line, days){
  let s = String(line).replace(/　/g, ' ').trim(), day = -1, time = null, outside = false;
  const dm = /^(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?/.exec(s);
  if(dm){ const mo = +dm[1], da = +dm[2]; day = days.findIndex(d => d.getMonth() + 1 === mo && d.getDate() === da); outside = day < 0; s = s.slice(dm[0].length); }
  const wm = /^[\s(（]*([日月火水木金土])(?:曜日?)?[)）]?/.exec(s.trim());
  if(wm){ const g = WK_JA.indexOf(wm[1]), j = days.findIndex(d => d.getDay() === g); if(day < 0 || day === j){ day = j; s = s.trim().slice(wm[0].length); } }
  const tm = /(\d{1,2})\s*[:：]\s*(\d{2})/.exec(s) || new RegExp(`(\\d{1,2})\\s*時(?:\\s*(\\d{1,2})\\s*分)?(?=$|[${SCHED_SEP}]|から|より|開始|スタート)`).exec(s);
  if(tm && +tm[1] <= 30){ time = `${+tm[1]}:${String(tm[2] ? +tm[2] : 0).padStart(2, '0')}`; s = s.slice(0, tm.index) + s.slice(tm.index + tm[0].length).replace(/^\s*(から|より|開始|スタート)/, ''); }
  const title = s.replace(new RegExp(`^[${SCHED_SEP}]+|[${SCHED_SEP}]+$`, 'g'), '').trim();
  return {day, outside, time, rest: SCHED_REST_RE.test(title), title: SCHED_REST_RE.test(title) ? '' : title.slice(0, 60)};
}
/** @param {SchedLayer} L @param {string} text */
function schedApplyText(L, text){
  const days = schedDays(L), done = [];
  let next = 0, skipped = 0;
  for(const raw of String(text).split(/\r?\n/)){
    if(!raw.trim()) continue;
    const p = schedParseLine(L, raw, days), i = p.day >= 0 ? p.day : next;
    if(p.outside || i > 6){ skipped++; continue; }
    const r = L.rows[i];
    r.rest = p.rest; if(p.time != null) r.time = p.time === L.time ? '' : p.time; else if(p.rest) r.time = '';
    if(!p.rest) r.title = p.title;
    done.push(i); next = i + 1;
  }
  return {done, skipped};
}

/* 週を動かす：dw 週ぶん日付を進める（-1 で前の週）。clear なら中身（時刻・タイトル・画像・おやすみ）を空にする＝「来週分を作る」 */
/** @param {SchedLayer} L */
function schedShiftWeek(L, dw, clear){
  const d0 = schedDays(L)[0], d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + 7 * dw);
  L.start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if(clear) L.rows = L.rows.map(() => SCHED_ROW());
}

/* ---------- 週間予定表の種類の登録（layer-kinds.js） ---------- */
defineLayerKind('sched', {
  normalize: L => normalizeSched(L),
  draw: (ctx, L, f, live, cache) => drawSched(ctx, L, f, live, cache),
  fonts: L => ensureSchedFonts(L),
  assets: L => L.rows.map(r => r.asset),
  name: () => '週間予定表',
  sub: L => `${schedDays(L).map(d => `${d.getMonth() + 1}/${d.getDate()}`).filter((_, i) => i === 0 || i === 6).join('〜')}`,
});
return {SCHED_BANDS, SCHED_COLORS, isSched, schedPreset, schedDStyle, schedTStyle, schedDays, schedDayLabel, ensureSchedFonts, addSched, schedSetImage, schedTakeFiles, schedApplyText, schedShiftWeek};
})();
