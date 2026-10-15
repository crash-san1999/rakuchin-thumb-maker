/* 楽ちんサムネメーカー：フォント管理（Google Fonts・Webフリー・PC内・URL追加） */
/*
  フォントの「一覧（fonts 配列）」と「読み込み（CSS・FontFace）」を持つ。文字を描く側（text-render.js・thumb/render.js）は、
  描く前に ensureFont()／ensureCss() を待ってから Canvas に描く（読み込み前だと代替フォントで描かれてしまうため）。
  一覧の要素：{family, cat, usage, weights:[数値], src, ...}
    family … CSS の font-family 名（一覧内で一意。選択・お気に入り・保存データのキーにもなる）
    cat    … 分類（ゴシック／明朝／デザイン／手書き／等幅／欧文／PC内／ファイル）。UI の絞り込みに使う
    usage  … 用途の説明文（検索・「用途」絞り込みの対象。USAGE_JP や各表の値）
    weights… 使える太さ。無いものを指定してもブラウザが近い太さで描くだけなので、fixWeight() で近い値に寄せる
    src    … 読み込み方：google / ea（旧アーリーアクセス）/ fontsource / gh（GitHub の原本）/ npm / url（同梱・URL追加）/ local（PC内）/ file（ドロップ）
    mb     … おおよその容量(MB)。大きいものは「選んだときだけ読み込む」。1 を超えると重い扱い
  読み込み順：data/font-list.js（GF_JP・GF_LATIN）・data/font-sources.js（厳選・用途・Google 以外の配布元の一覧）の後。起動は main.js の boot() が initFonts() などを呼ぶ。
  依存：LS・$・ic・escapeHtml・toast（core.js）、S・schedule・syncUI・buildWeight 等（controls.js・preview.js）、pwaRegister（pwa.js）。
  localStorage：ttm_favs（お気に入り）/ ttm_fsupd（取得した新フォントと時刻）/ ttm_webfonts（URL追加）/ ttm_localfonts（検出したPC内フォント名）。
*/
/* ============ フォント管理 ============ */
// ファイルの中だけで使う名前を外（ほかのファイルと共有の場所）に出さないよう、中身を関数で包んでいる。外から使う名前は最後の return で出す
// 外から読み書きする変数（ほかのファイルが今の値を読むので、外で宣言して中では代入だけにする）
/** @type {FontEntry[]} */
let fonts;
/** @type {Set<string>} */
let favs;
var {WEB_SRC, initFonts, findFont, cssState, ensureCss, plainText, ensureFont, io, sampleText, renderFontList, updateTextTip, weightsOf, refreshTextUI, fixWeight, buildWeight, updateFontList, preloadFavFonts, registerFontCache, scheduleFontListCheck, addWebFontUrl, restoreLocalFonts, addFontFiles, drop} = (() => {
// 一覧のデータ（FEATURED_JP・USAGE_JP・EA_FONTS・FS_FONTS・GH_FONTS・NPM_FONTS・SELF_FONTS など）は data/font-sources.js
// フォントの用途の説明（一覧にあればそれ、無ければ USAGE_JP）
const usageOf = f => f.usage || USAGE_JP[f.family] || '';
// font-list.js の圧縮形式 "名前|分類コード|太さの数字列;…" を展開する。太さは百の位だけ（"479" → 400,700,900）
const decodeGF = str => str.split(';').map(x => { const [family, c, w] = x.split('|'); return {family, c, weights: [...w].map(n => +n * 100)}; });
// 読み込み済み／読み込み中の記録（同じものを二重に読み込まないための Promise のキャッシュ）。npmState は CSS の URL、ghState は 'family|太さ' が鍵
const npmState = new Map();
// 太さ w にいちばん近い提供済みの太さの CSS を読み込む（npm 版は太さごとに別 CSS。文字ごとに分割された woff2 を必要分だけ取る）
function ensureNpm(f, w = 400){
  const ws = f.weights, ww = ws.reduce((a, b) => Math.abs(b - w) < Math.abs(a - w) ? b : a, ws[0]), url = f.css.replace('{w}', ww);
  if(!npmState.has(url)) npmState.set(url, addCss(url).then(ok => ok ? document.fonts.load(`${ww} 20px "${f.family}"`, 'あ').catch(() => {}) : null));
  return npmState.get(url);
}
const ghState = new Map();
// GitHub 版は太さごとに別ファイルを FontFace で直接読む。近い太さに寄せるのは ensureNpm と同じ理由（無い太さを要求されても落とさない）
function ensureGh(f, w = 400){
  const ws = f.weights, ww = ws.reduce((a, b) => Math.abs(b - w) < Math.abs(a - w) ? b : a, ws[0]);
  const k = f.family + '|' + ww;
  if(!ghState.has(k)) ghState.set(k, new FontFace(f.family, `url("${GH + f.files[ww]}")`, {weight: String(ww)}).load().then(ff => { document.fonts.add(ff); }).catch(() => { ghState.delete(k); }));   // 失敗したら、次に選んだときにもう一度読む
  return ghState.get(k);
}

// fonts：一覧の全体（下の initFonts が作る）。URL 追加・PC内・ファイルのフォントは実行中にここへ足される。favs：お気に入りの family 名
fonts = [];
favs = new Set(LS.get('ttm_favs', []));
// 一覧の並び＝表示順。日本語（厳選 → Google の残り → 追加分 → Webフリー各種）→ 欧文（厳選 → Fontsource の欧文）→ 残りの Google 欧文（more）。
// push は family で重複を弾く（先に入れたものが勝つ＝厳選の分類・用途が一覧由来のものより優先）。
// extraJp は updateFontList が見つけて保存しておいた新しい日本語フォント
function buildBaseFonts(extraJp = []){
  const gjp = decodeGF(GF_JP), have = new Set();
  const wOf = new Map(gjp.map(f => [f.family, f.weights]));
  const jpList = [];
  const push = f => { if(!have.has(f.family)){ have.add(f.family); jpList.push(f); } };
  FEATURED_JP.forEach(f => push({...f, weights: wOf.get(f.family) || f.weights, src:'google'}));
  gjp.forEach(f => push({family: f.family, cat: JP_CAT_OVR[f.family] || GC[f.c] || 'デザイン', weights: f.weights, src:'google'}));
  extraJp.forEach(f => push(f));
  FS_FONTS.filter(f => f.cat !== '欧文').forEach(push);
  GH_FONTS.forEach(push);
  NPM_FONTS.forEach(push);
  SELF_FONTS.forEach(push);
  EA_FONTS.forEach(push);
  const lat = LATIN.concat(FS_FONTS.filter(f => f.cat === '欧文').map(f => ({...f, cat:'欧文'})));
  lat.forEach(f => have.add(f.family));
  const more = decodeGF(GF_LATIN).filter(f => !have.has(f.family)).map(f => ({family: f.family, cat:'欧文', usage: GC_USE[f.c] || '', weights: f.weights, src:'google', more:true}));
  return jpList.concat(lat, more);
}
// 「Web フリー」扱いの src（Google 以外でネットから読む書体）。一覧のバッジ・絞り込み・先読み対象の判定に使う
const WEB_SRC = ['fontsource', 'ea', 'url', 'gh', 'npm'];
function fontInfoText(){
  const n = src => fonts.filter(f => f.src === src).length;
  const jp = fonts.filter(f => f.src === 'google' && f.cat !== '欧文').length, lat = fonts.filter(f => f.cat === '欧文').length;
  const web = fonts.filter(f => WEB_SRC.includes(f.src)).length;
  return `日本語 ${jp}・欧文 ${lat.toLocaleString()}・Webフリー ${web}${n('local') ? '・PC内 ' + n('local') : ''}`;
}
// boot() から1回だけ。以下を順に行う：旧バージョンが残した保存キーの掃除 → 基本の一覧作成 → URL追加フォントの復元。
// PC内フォントの復元（restoreLocalFonts）は、この後に boot() が呼ぶ
function initFonts(){
  localStorage.removeItem('ttm_gfonts'); localStorage.removeItem('ttm_apikey');   // 旧版の Google Fonts API 方式の名残（今は不要）
  const upd = LS.get('ttm_fsupd', null);
  fonts = buildBaseFonts(upd && Array.isArray(upd.items) ? upd.items.map(cleanFontEntry).filter(Boolean) : []);
  restoreWebFonts();
  $('#fsrcinfo').textContent = fontInfoText();
}
const findFont = fam => fonts.find(f => f.family === fam);

/* 外から来るフォント情報の検査（Fontsource API の応答・URL 追加・それらを保存した localStorage）。
   family は CSS の font 指定や "…" の中に入るので、引用符・\・<>・制御文字を含むものは使わない。id・slug は読み込み URL のパスに入るので英小文字・数字・ハイフンだけ。
   file・css は https の URL だけ（CSP でも止まるが、壊れた登録を保存しないため）。合わないものは null（一覧に入れない） */
const FAMILY_OK = s => typeof s === 'string' && s.length >= 1 && s.length <= 100 && !/["'\\<>\u0000-\u001f\u007f]/.test(s);
const FS_ID_OK = s => typeof s === 'string' && /^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
const httpsUrl = s => { try{ const u = new URL(s); return u.protocol === 'https:' ? u.href : null; }catch{ return null; } };
const FONT_CATS = ['ゴシック', '明朝', 'デザイン', '手書き', '等幅', '欧文'];
function cleanFontEntry(f){
  if(!f || typeof f !== 'object' || !FAMILY_OK(f.family) || !['google', 'fontsource', 'ea', 'url'].includes(f.src)) return null;
  const ws = (Array.isArray(f.weights) ? f.weights : []).map(Number).filter(/** @param {number} n */ n => Number.isInteger(n) && n >= 100 && n <= 900 && n % 100 === 0);
  const e = {family: f.family, cat: FONT_CATS.includes(f.cat) ? f.cat : 'デザイン', usage: typeof f.usage === 'string' ? f.usage.slice(0, 200) : '',
    weights: ws.length ? [...new Set(ws)].sort((a, b) => a - b) : [400], src: f.src};
  if(f.src === 'fontsource'){ if(!FS_ID_OK(f.id)) return null; e.id = f.id; }
  if(f.src === 'ea'){ if(typeof f.slug !== 'string' || !/^[a-z0-9]{1,60}$/.test(f.slug)) return null; e.slug = f.slug; }
  if(f.src === 'url'){
    const file = f.file != null ? httpsUrl(f.file) : null, css = f.css != null ? httpsUrl(f.css) : null;
    if(!file && !css) return null;
    if(file) e.file = file; else e.css = css;
  }
  return e;
}

// cssState：family → 読み込みの Promise。「読み込みを始めたか／終わったか」の記録で、重複読み込みの防止と、
// 一覧での「選ぶと読込」表示の判定（cssState に無い＝まだ）に使う
const cssState = new Map();
// <link rel=stylesheet> を足して、読めたら true・失敗なら false で解決する（失敗しても例外にしない）
const addCss = /** @param {string} href */ href => new Promise(res => {
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href;
  link.onload = () => res(true); link.onerror = () => res(false); document.head.appendChild(link);
});
// f のフォントを使える状態にする Promise を返す（既に始まっていればそれを返す）。f が無い・PC内・ファイルのように読み込み不要なら即解決。
// 戻りを待たなくても例外は出ない。実際に描けるかは、呼び出し側が document.fonts.load で確認する（ensureFont）。
// 太さ w は gh・npm だけが使う（太さごとに別ファイル）。そのほかは全太さをまとめて読む
/** @param {FontEntry} [f] @param {number} [w] */ function ensureCss(f, w){
  if(f && f.src === 'gh'){ const p = ensureGh(f, w); if(!cssState.has(f.family)) cssState.set(f.family, p); return p; }
  if(f && f.src === 'npm'){ const p = ensureNpm(f, w); if(!cssState.has(f.family)) cssState.set(f.family, p); return p; }
  if(!f || !['google', 'ea', 'fontsource', 'url'].includes(f.src)) return Promise.resolve();
  if(cssState.has(f.family)) return cssState.get(f.family);
  if(f.src !== 'google'){
    let p;
    if(f.src === 'ea') p = addCss(`https://fonts.googleapis.com/earlyaccess/${f.slug}.css`);
    else if(f.src === 'fontsource') p = Promise.all((f.weights || [400]).map(w => addCss(`https://cdn.jsdelivr.net/npm/@fontsource/${f.id}@5/${w}.css`)));
    else p = f.css ? addCss(f.css) : f.file ? new FontFace(f.family, `url("${f.file}")`).load().then(ff => { document.fonts.add(ff); }).catch(() => { cssState.delete(f.family); }) : Promise.resolve();
    cssState.set(f.family, p); return p;
  }
  // Google Fonts：太さを列挙した URL（:wght@…）で読む。太さの指定が配信側と合わず失敗した場合に備え、
  // 太さ指定なしの URL でもう一度だけ試す（plain=true）。それでも失敗なら諦めて解決する（待たせ続けない）
  const p = /** @type {Promise<void>} */ (new Promise(res => {
    const enc = f.family.replace(/ /g, '+');
    const ws = f.weights || [400];
    const url = plain => `https://fonts.googleapis.com/css2?family=${enc}` +
      (!plain && !(ws.length === 1 && ws[0] === 400) ? ':wght@' + ws.join(';') : '') + '&display=swap';
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = url(false);
    link.onload = () => res();
    link.onerror = () => { if(!link.dataset.retry){ link.dataset.retry = '1'; link.href = url(true); } else res(); };
    document.head.appendChild(link);
  }));
  cssState.set(f.family, p);
  return p;
}
// 描画する文字そのもの。{ } は文字素材の装飾記法の記号（描画側が解釈する）なので、フォントの確認や見本には含めない
const plainText = () => S.text.replace(/[{}]/g, '');
// 一度読み込めたフォント（太さ込み）の記録。2回目以降は待ち時間を短くする（下の wait）
const fontSeen = new Set();
// st のフォント（と英数字用フォント）を、Canvas に描ける状態にして待つ。文字素材の描画（preview.js・thumb/render.js）が描く前に呼ぶ。
// 待ち時間の上限：既読 800ms／初回は通常 5 秒、重い書体（mb>1）は数十MBの可能性があるので 60 秒。上限に達したら諦めて描く（代替フォントになる）。
// 250ms 以上かかったときだけ「読み込み中」表示を出し、短い待ちでちらつかせない。
// document.fonts.load には実際に描く文字を渡す：unicode-range で分割された書体は、その文字を含む分割だけが読まれるため
async function ensureFont(st = S){
  const f = findFont(st.font), txt = st.text.replace(/[{}]/g, '');
  const t = setTimeout(() => $('#loading').classList.add('show'), 250);
  const limit = ms => new Promise(r => setTimeout(r, ms));
  const key = st.font + '|' + st.weight, wait = fontSeen.has(key) ? 800 : (f && (f.mb || 0) > 1 ? 60000 : 5000);
  try{
    await Promise.race([ensureCss(f, st.weight), limit(wait)]);
    await Promise.race([document.fonts.load(`${st.weight} 100px "${st.font}"`, txt || 'あ'), limit(wait)]);
  }catch{}
  if(st.fontLatin){
    const lf = findFont(st.fontLatin), lk = 'L|' + st.fontLatin, lw = fontSeen.has(lk) ? 800 : 5000;
    // 英数字用フォントで実際に描かれる部分（英数字と一部の記号）だけを渡す。無ければ仮の 'A1'
    const ls = (txt.match(/[A-Za-z0-9!?#%&+\-.:/ ]+/g) || []).join('').trim() || 'A1';
    try{
      await Promise.race([ensureCss(lf), limit(lw)]);
      await Promise.race([document.fonts.load(`${st.weight} 100px "${st.fontLatin}"`, ls), limit(lw)]);
    }catch{}
    fontSeen.add(lk);
  }
  fontSeen.add(key);
  clearTimeout(t); $('#loading').classList.remove('show');
}

/* フォント一覧 */
// 一覧の見本を、画面に近づいた（上下 200px）ものから順に読み込む。数千書体を一度に読み込まないための遅延読み込み。読み込みを始めたら監視をやめる
const io = new IntersectionObserver(ents => {
  ents.forEach(e => { if(e.isIntersecting){ ensureCss(findFont(/** @type {HTMLElement} */ (e.target).dataset.family)); io.unobserve(e.target); } });
}, {root: null, rootMargin: '200px'});
function sampleText(){
  const s = plainText().split('\n').find(l => l.trim()) || '';
  return (s.trim() || 'サンプル文字あア亜').slice(0, 14);
}
// 一覧の絞り込み条件（検索語・分類・用途）を画面から読む
const fontQuery = () => ({q: $as('#fq', HTMLInputElement).value.trim().toLowerCase(), cat: $as('#fcat', HTMLSelectElement).value, use: $as('#fuse', HTMLSelectElement).value});
// 絞り込み：「お気に入り」「web」は分類より優先。more（Google の残りの欧文）は、検索中か「欧文」タブのときだけ出す
function filterFonts({q, cat, use}){
  return fonts.filter(f => {
    const u = usageOf(f);
    if(q && !f.family.toLowerCase().includes(q) && !u.includes(q)) return false;
    if(use && !USE_KEYS[use].some(k => u.includes(k))) return false;
    if(cat === 'お気に入り') return favs.has(f.family);
    if(cat === 'web') return WEB_SRC.includes(f.src);
    if(cat && f.cat !== cat) return false;
    if(f.more && !q && cat !== '欧文') return false;
    return true;
  });
}
// 書体名の横の小さな札（PC 内・ファイル・Web の取得元・分類）
const fontBadge = f => f.src === 'local' ? 'PC' : f.src === 'file' ? 'FILE' : WEB_SRC.includes(f.src) ? 'WEB・' + f.cat : f.cat;
// 見本を遅延読み込みする取得元（Google と Web 系）
const LAZY_SRC = ['google', ...WEB_SRC];
// 一覧の1行。smp＝和文の見本、lsmp＝欧文の見本。重い書体（mb>1）は見本を自動で読み込まず「選ぶと読込」と出す（一覧を見ただけで数十MB取得しないため）。
// 戻り値の watch＝見本を画面に近づいたら読み込む行か
function fontRow(f, smp, lsmp){
  const d = document.createElement('div'), u = usageOf(f), lazy = (f.mb || 0) > 1 && !cssState.has(f.family);
  d.className = 'fi' + (f.family === S.font ? ' on' : ''); d.dataset.family = f.family;
  const latBtn = f.cat === '欧文' ? `<button class="lat${S.fontLatin === f.family ? ' on' : ''}" title="英字・数字だけこのフォントにする">英数字</button>` : '';
  const name = `${escapeHtml(f.family)}<b>${escapeHtml(fontBadge(f))}</b>${u ? `<span class="tag">${escapeHtml(u)}</span>` : ''}${lazy ? `<span class="tag">選ぶと読込（約${f.mb}MB）</span>` : ''}`;
  d.innerHTML = `<div class="fn"><span>${name}</span><span>${latBtn}<button class="fav${favs.has(f.family) ? ' on' : ''}" title="お気に入り">${ic('star')}</button></span></div><div class="fs"></div>`;
  const fs = $('.fs', d); fs.style.fontFamily = `"${f.family}", "Noto Sans JP", sans-serif`;
  fs.textContent = f.cat === '欧文' ? lsmp : smp;
  return {d, watch: !lazy && LAZY_SRC.includes(f.src) && !cssState.has(f.family)};
}
// フォント一覧を作り直す（検索・分類・用途・お気に入り・選択状態が変わるたびに呼ぶ。毎回 DOM を作り直す）
function renderFontList(){
  const fq = fontQuery(), {q, cat} = fq, list = filterFonts(fq);
  const box = $('#flist'), frag = document.createDocumentFragment(), smp = sampleText(), lsmp = latinSample() || 'RANK UP 1000';
  list.forEach(f => { const {d, watch} = fontRow(f, smp, lsmp); frag.appendChild(d); if(watch) io.observe(d); });
  box.innerHTML = ''; box.appendChild(frag);
  $('#fcount').textContent = `${list.length.toLocaleString()} / ${fonts.length.toLocaleString()} 書体` + (!q && cat !== '欧文' && cat !== 'web' && !cat ? '（欧文の全書体は「欧文」か検索で）' : '');
  $('#curFont').textContent = `使用中: ${S.font}`;
}
// 一覧のクリックは委譲で1か所に集める（行は renderFontList のたびに作り直されるため）。
// 行の中のボタンで動作が分かれる：英数字ボタン＝英字だけ別フォント／★＝お気に入り／それ以外＝そのフォントを選ぶ
$('#flist').addEventListener('click', e => {
  const it = tgt(e).closest('.fi'); if(!it) return;
  const fam = it.dataset.family ?? '';
  if(tgt(e).closest('.lat')){
    S.fontLatin = S.fontLatin === fam ? '' : fam; buildLatin(); renderFontList(); schedule(); return;
  }
  const fb = tgt(e).closest('.fav');
  if(fb){
    favs.has(fam) ? favs.delete(fam) : favs.add(fam); LS.set('ttm_favs', [...favs]);
    fb.classList.toggle('on');
    const ff = favs.has(fam) && findFont(fam); if(ff && WEB_SRC.includes(ff.src) && !cssState.has(fam)){ if((ff.mb || 0) > 1) toast(`「${fam}」を先に読み込んでおきます（約${ff.mb}MB）`); ensureCss(ff, 400); }
    return;
  }
  S.font = fam ?? S.font; fixWeight(); buildWeight();
  const ff = findFont(fam);
  if(ff && (ff.mb || 0) > 1 && !cssState.has(fam)){ toast(`「${fam}」を読み込んでいます（約${ff.mb}MB・初回のみ）`); ensureCss(ff, S.weight).then(() => { const t = $$('.tag', it); t.length > 1 && t[t.length - 1].remove(); }); }
  $$('.fi.on').forEach(x => x.classList.remove('on')); it.classList.add('on');
  $('#curFont').textContent = `使用中: ${S.font}`; schedule();
});
// 検索欄は入力のたびに再描画すると重いので 120ms 待つ
/** @type {number | undefined} */ let fqT; $as('#fq', HTMLInputElement).addEventListener('input', () => { clearTimeout(fqT); fqT = setTimeout(renderFontList, 120); });
$as('#fcat', HTMLSelectElement).addEventListener('change', renderFontList);
$as('#fuse', HTMLSelectElement).addEventListener('change', renderFontList);
// 欧文フォントの見本文字：本文の英数字部分を優先し、無ければ呼び出し側が既定文に差し替える（空文字を返す）
const latinSample = () => (plainText().match(/[A-Za-z0-9!?#%&+\-.:/ ]+/g) || []).map(x => x.trim()).filter(Boolean).join(' ').slice(0, 16);
// 「英数字だけ別フォント」のプルダウンを作る。候補はお気に入りと使用中だけ（more の数千件を入れると選べないため）
function buildLatin(){
  const sel = $as('#fontLatin', HTMLSelectElement);
  const lat = fonts.filter(f => f.cat === '欧文' && (!f.more || f.family === S.fontLatin || favs.has(f.family)));
  sel.innerHTML = '<option value="">（日本語フォントのまま）</option>' + lat.map(f => `<option value="${escapeHtml(f.family)}">${escapeHtml(f.family)} ― ${escapeHtml((f.usage || '').split('（')[0])}</option>`).join('');
  sel.value = S.fontLatin || '';
}
// 文字数の目安表示。jp は非 ASCII の文字数。日本語 16 文字超、または英語のみで 7 語以上だと警告（サムネでは短いほど読めるため）
function updateTextTip(){
  const t = plainText().replace(/\n/g, ''), n = [...t].length, words = (t.match(/[A-Za-z0-9]+/g) || []).length;
  const jp = [...t].filter(c => /[^\x00-\x7F]/.test(c)).length;
  const over = jp > 16 || (jp === 0 && words > 6);
  const el = $('#textTip');
  el.textContent = `${n}文字` + (over ? '　⚠ サムネの文字は短いほど効きます（日本語10〜13文字／英語3〜5語が目安）' : '　サムネの文字は短く：日本語10〜13文字／英語3〜5語が目安');
  el.className = 'note' + (over ? ' warn' : '');
}

// そのフォントで選べる太さ。PC内・ファイルは実際の太さが分からないので全段階を出す。フォントが見つからなければ最低限の3種
/** @param {FontEntry} [f] */ function weightsOf(f){ return f ? (f.weights && f.weights.length && f.src !== 'local' && f.src !== 'file' ? f.weights : W9.split(',').map(Number)) : [400,700,900]; }
// 文字パネル全体（太さの選択肢・入力欄・フォント一覧）を、今の S に合わせて表示し直す
function refreshTextUI(){ fixWeight(); buildWeight(); syncUI(); renderFontList(); }
// フォントを替えたとき、今の太さがそのフォントに無ければ、いちばん近い太さへ寄せる（S.weight を書き換える）。buildWeight の前に呼ぶ
function fixWeight(){
  const ws = weightsOf(findFont(S.font));
  if(!ws.includes(S.weight)) S.weight = ws.reduce((a, b) => Math.abs(b - S.weight) < Math.abs(a - S.weight) ? b : a, ws[0]);
}
const WN = {100:'Thin',200:'ExtraLight',300:'Light',400:'Regular',500:'Medium',600:'SemiBold',700:'Bold',800:'ExtraBold',900:'Black'};
// 太さのプルダウンを作り直す。英数字フォントの欄が空（初回）なら、こちらもここで作る
function buildWeight(){
  if($as('#fontLatin', HTMLSelectElement).options.length === 0) buildLatin(); else $as('#fontLatin', HTMLSelectElement).value = S.fontLatin || '';
  const sel = $as('#weight', HTMLSelectElement); sel.innerHTML = weightsOf(findFont(S.font)).map(w => `<option value="${w}">${w} ${WN[w]||''}</option>`).join('');
  sel.value = String(S.weight);
}

/* 最新のフォント一覧（Fontsource API・キー不要）。新しく増えた日本語フォントを追加 */
// 新しく見つかった分（fresh）は ttm_fsupd に保存し、次回起動時に buildBaseFonts が取り込む。
// 追加位置は「最初の欧文」の直前＝日本語の並びの末尾。manual=false（自動確認）は失敗しても黙って終わる（通信できない環境で毎回エラーを出さない）
/** @param {boolean} manual */ async function updateFontList(manual){
  const btn = $as('#fetchG', HTMLButtonElement); if(manual){ btn.disabled = true; }
  try{
    const r = await fetch('https://api.fontsource.org/v1/fonts?subsets=japanese');
    if(!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const have = new Set(fonts.map(f => f.family));
    // 応答は外から来るデータなので cleanFontEntry で検査し、合わないものは捨てる
    const items = (Array.isArray(j) ? j : []).filter(x => x && typeof x.id === 'string' && !/icons?$/i.test(x.id)).map(x => cleanFontEntry({
      family: x.family, cat: CAT_MAP[x.category] || 'デザイン', weights: x.weights,
      ...(x.type === 'google' ? {src:'google'} : {src:'fontsource', id: x.id})
    })).filter(x => x !== null);
    const fresh = items.filter(x => !have.has(x.family));
    LS.set('ttm_fsupd', {at: Date.now(), items: fresh});
    fresh.forEach(f => fonts.splice(fonts.findIndex(x => x.cat === '欧文'), 0, f));
    $('#fsrcinfo').textContent = fontInfoText();
    if(fresh.length) renderFontList();
    if(manual) toast(fresh.length ? `新しい日本語フォントを ${fresh.length} 書体追加しました` : `フォント一覧は最新です（日本語 ${items.length} 書体を確認）`);
  }catch(e){ if(manual) toast('一覧を取得できませんでした（通信を確認してください）', true); }
  if(manual) btn.disabled = false;
}
$as('#fetchG', HTMLButtonElement).onclick = () => updateFontList(true);
/* お気に入りのフォントを、起動後のひまな時間に先に読み込んでおく（通信量を抑える設定・モバイル回線のときはしない）。
   Service Worker が端末に保存するので、次の起動からはすぐ使える。
   3MB 超の重い書体は先読みしない。残りも 1.5 秒ずつずらして読む（一度に通信を集中させない） */
function preloadFavFonts(){
  const c = navigator.connection; if(c && (c.saveData || c.type === 'cellular')) return;
  setTimeout(() => { [...favs].map(findFont).filter(f => f && WEB_SRC.includes(f.src) && !((f.mb || 0) > 3) && !cssState.has(f.family)).forEach((f, i) => setTimeout(() => ensureCss(f, 400), i * 1500)); }, 3000);
}
function registerFontCache(){ pwaRegister(); }   // Service Worker（フォントとアプリ本体の保存）の登録は pwa.js
// 起動して少したってから、週に1回だけフォント一覧の更新を確認する（4秒待つのは、起動直後の描画・読み込みと競合させないため）
function scheduleFontListCheck(){ setTimeout(() => { const u = LS.get('ttm_fsupd', null); if(!u || Date.now() - u.at > 7 * 864e5) updateFontList(false); }, 4000); }

/* WebフォントのURLから追加 */
// 追加したフォントの「定義」だけを ttm_webfonts に保存し（フォント本体は保存しない）、起動時に一覧の先頭へ戻す。読み込みは使うときに ensureCss が行う
function restoreWebFonts(){
  const saved = LS.get('ttm_webfonts', []);
  (Array.isArray(saved) ? saved : []).map(f => cleanFontEntry(f && {...f, src: f.src || 'url'})).forEach(f => { if(f && !fonts.some(x => x.family === f.family)) fonts.unshift(f); });
}
function saveWebFont(f){
  const list = (LS.get('ttm_webfonts', []) || []).filter(x => x.family !== f.family); list.push(f); LS.set('ttm_webfonts', list);
}
// 一覧に無ければ追加して保存し、あるものはそのまま返す（同名 family の二重登録を防ぐ）。戻り値は一覧上の要素
function addWebEntry(raw){
  const f = cleanFontEntry(raw); if(!f) return null;
  if(!fonts.some(x => x.family === f.family)){ fonts.unshift(f); saveWebFont(f); }
  return findFont(f.family);
}
// 貼られた URL の種類を見分けて追加する：Google Fonts のページ／CSS（family=…）／Fontsource／フォントファイル直リンク／その他の CSS。
// 判定は上から順で、先に当てはまった方法で処理する。フォントファイルは追加前に実際に読み込んで確かめる
// （配布元が外部サイトからの読み込みを許可していないと失敗するため）。失敗は toast で知らせて何も追加しない
/** @param {string} raw */ async function addWebFontUrl(raw){
  let url; try{ url = new URL(raw.trim()); }catch{ toast('URLの形式が正しくありません', true); return; }
  if(url.protocol !== 'https:'){ toast('https:// で始まるURLを貼ってください', true); return; }
  const h = url.hostname, added = [];
  if(h === 'fonts.google.com'){
    const m = url.pathname.match(/\/specimen\/([^/?#]+)/); if(!m){ toast('Google Fonts のフォントのページ（…/specimen/名前）のURLを貼ってください', true); return; }
    const fam = decodeURIComponent(m[1]).replace(/\+/g, ' ');
    added.push(findFont(fam) || addWebEntry({family: fam, cat:'欧文', usage:'', weights:[400,700], src:'google'}));
  }else if(h === 'fonts.googleapis.com'){
    url.searchParams.getAll('family').forEach(v => {
      const [name, spec] = v.split(':'); const fam = name.replace(/\+/g, ' ');
      const ws = spec && spec.includes('@') ? [...new Set((spec.split('@')[1] ?? '').split(';').map(x => +(x.split(',').pop() ?? '')).filter(Boolean))] : [400];
      added.push(findFont(fam) || addWebEntry({family: fam, cat:'欧文', usage:'', weights: ws, src:'google'}));
    });
    if(!added.length && url.pathname.includes('earlyaccess')) added.push(await addCssFamilies(url.href));
  }else if(/(^|\.)fontsource\.org$/.test(h) || /@fontsource\//.test(url.pathname)){
    const m = url.pathname.match(/fonts\/([a-z0-9-]+)/) || url.pathname.match(/@fontsource\/([a-z0-9-]+)/);
    if(!m){ toast('Fontsource のフォントのページURLを貼ってください', true); return; }
    let meta = null; try{ const r = await fetch(`https://api.fontsource.org/v1/fonts/${m[1]}`); if(r.ok) meta = await r.json(); }catch{}
    const fam = meta && meta.family || m[1].split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
    const jpOk = meta && (meta.subsets || []).includes('japanese');
    added.push(findFont(fam) || addWebEntry({family: fam, id: m[1], cat: jpOk ? (CAT_MAP[meta.category] || 'デザイン') : '欧文', usage:'', weights: meta && meta.weights || [400], src:'fontsource'}));
  }else if(/\.(woff2?|ttf|otf)$/i.test(url.pathname)){
    let fam = url.pathname.split('/').pop() ?? ''; try{ fam = decodeURIComponent(fam); }catch{}
    fam = fam.replace(/\.(woff2?|ttf|otf)$/i, '').replace(/[-_]?(Regular|regular|400)$/, '').replace(/["'\\<>\u0000-\u001f\u007f]/g, '').slice(0, 100);
    if(!FAMILY_OK(fam)){ toast('フォントの名前を読み取れませんでした', true); return; }
    try{ const ff = new FontFace(fam, `url("${url.href}")`); await ff.load(); document.fonts.add(ff); }
    catch{ toast('フォントファイルを読み込めませんでした（配布元が外部サイトからの利用を許可していない可能性があります）', true); return; }
    const e = addWebEntry({family: fam, cat:'デザイン', usage:'', weights:[400], src:'url', file: url.href}); cssState.set(fam, Promise.resolve()); added.push(e);
  }else{
    added.push(await addCssFamilies(url.href));
  }
  const ok = added.filter(/** @returns {x is FontEntry} */ x => !!x);
  if(!ok.length){ toast('フォントが見つかりませんでした。@font-face を含むCSSか、フォントファイルのURLか確認してください', true); return; }
  $('#fsrcinfo').textContent = fontInfoText(); $as('#webUrl', HTMLInputElement).value = '';
  $as('#fcat', HTMLSelectElement).value = ''; $as('#fq', HTMLInputElement).value = ok[0].family; renderFontList();
  toast(`「${ok.map(f => f.family).join('」「')}」を追加しました。一覧から選んでください`);
}
// 任意の CSS を読み込み、その前後で document.fonts に増えた family を新しいフォントとして登録する
// （CSS の中身を自分で解析せず、ブラウザが認識した @font-face の差分から取る）。最初の1件を返し、読み込み失敗や増えなかった場合は null/undefined
/** @param {string} href */ async function addCssFamilies(href){
  const before = new Set([...document.fonts].map(f => f.family.replace(/["']/g, '')));
  const ok = await addCss(href); if(!ok) return null;
  const fams = [...new Set([...document.fonts].map(f => f.family.replace(/["']/g, '')).filter(f => !before.has(f)))];
  /** @type {FontEntry | null | undefined} */ let first = null;
  fams.forEach(fam => { const e = findFont(fam) || addWebEntry({family: fam, cat:'デザイン', usage:'', weights:[400,700], src:'url', css: href}); cssState.set(fam, Promise.resolve()); first = first || e; });
  return first;
}
$('#addWebUrl').onclick = () => { const v = $as('#webUrl', HTMLInputElement).value.trim(); if(v) addWebFontUrl(v); };
$as('#webUrl', HTMLInputElement).addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); $('#addWebUrl').click(); } });

/* PC内フォント */
/* ---------- PC内フォント ----------
   ① Local Font Access API（Chrome/Edge・許可が必要）で全件取得
   ② 使えない・拒否された環境では、よく使われるフォント名を実際に描画幅で判定して検出
   ③ 名前を直接入力して追加
   見つけたフォント名はブラウザに保存し、次回起動時も自動で一覧に戻す */
const LOCAL_CANDIDATES = [
  // Windows
  'Meiryo','Meiryo UI','Yu Gothic','Yu Gothic UI','Yu Mincho','MS Gothic','MS PGothic','MS Mincho','MS PMincho',
  'BIZ UDGothic','BIZ UDPGothic','BIZ UDMincho','BIZ UDPMincho','UD Digi Kyokasho N-R','UD Digi Kyokasho NK-B',
  'HGSoeiKakupoptai','HGPSoeiKakupoptai','HGSoeiKakugothicUB','HGPSoeiKakugothicUB','HGMaruGothicMPRO','HGGyoshotai',
  'HGSeikaishotaiPRO','HGKyokashotai','HGMinchoE','HGGothicE','HGSoeiPresenceEB',
  'Impact','Arial Black','Segoe UI Black','Bahnschrift','Franklin Gothic Heavy','Cooper Black','Showcard Gothic',
  // Mac
  'Hiragino Sans','Hiragino Kaku Gothic ProN','Hiragino Maru Gothic ProN','Hiragino Mincho ProN','Osaka','Klee',
  'Tsukushi A Round Gothic','Tsukushi B Round Gothic','Toppan Bunkyu Gothic','Toppan Bunkyu Midashi Gothic',
  // 人気のフリーフォント
  'けいふぉんと','KeiFont','ラノベPOP','ラノベPOP v2','LightNovelPOP','にくまるフォント','やさしさゴシック','やさしさアンチック',
  '源柔ゴシック','源柔ゴシックP','源柔ゴシックX','源柔ゴシックL','GenJyuuGothic','GenJyuuGothicX','源真ゴシック','源真ゴシックP',
  '源ノ角ゴシック JP','Source Han Sans JP','Noto Sans CJK JP','Noto Serif CJK JP','源暎ゴシック','源暎アンチック','源暎ラテゴ',
  'コーポレート・ロゴ','コーポレート・ロゴ ver2','Corporate Logo','Corporate Logo Rounded','ロゴたいぷゴシック','LogoTypeGothic',
  'Rounded M+ 1c','Rounded Mplus 1c','Rounded Mgen+ 1c','Mgen+ 1c','Koruri','ほのかアンティーク丸','ほのかアンティーク角','ほのか明朝',
  'しねきゃぷしょん','チェックポイント★リベンジ','たぬき油性マジック','851マカポップ','851チカラヅヨク','851ゴチカクット',
  'マキナス','Makinas 4 Square','Makinas 4 Flat','Makinas Scrap 5','ふい字','x8y12pxTheStrongGamer','PixelMplus10','PixelMplus12',
  'JKゴシックM','JKゴシックL','JK丸ゴシックM','刻明朝','装甲明朝','はんなり明朝','アプリ明朝','黒薔薇シンデレラ','黒薔薇ゴシック',
  'にくきゅう','マメロン','Mamelon','ニコモジ','ニコカ','自由の翼フォント','怨霊','g_コミックホラー恐怖-教漢','フロップデザイン',
  'ときめきゴシック','あずきフォント','ちはやゴシック','まるもじフォント','こども丸ゴシック','Nikumaru','チェックポイントリベンジ',
  'FOT-ロダン Pro','FOT-スーラ Pro','FOT-セザンヌ Pro','FOT-マティス Pro','FOT-ニューシネマA Std','FOT-筑紫A丸ゴシック Std',
  'A-OTF 新ゴ Pro','A-OTF UD新ゴ Pr6N','A-OTF 見出ゴMB31 Pr6N','Rounded-X M+ 1c',
];
const fontProbe = ctx2d(document.createElement('canvas'));
// そのフォントが端末に入っているかの判定。ブラウザは未インストールの名前を黙って代替フォントにするので、
// 汎用3種（monospace/serif/sans-serif）を代替先にして描画幅を比べ、どれか1つでも幅が変われば入っていると判断する
// （代替先と偶然同じ幅になる誤判定を避けるため3種で確かめる）。見本は、かな・漢字・英数字・記号が混ざった文字列
/** @param {string} name */ function fontInstalled(name){
  const t = 'あいうアイウ永愛Ag1@';
  return ['monospace', 'serif', 'sans-serif'].some(b => {
    fontProbe.font = `72px ${b}`; const w0 = fontProbe.measureText(t).width;
    fontProbe.font = `72px "${name}", ${b}`; return Math.abs(fontProbe.measureText(t).width - w0) > 0.5;
  });
}
// 名前の一覧を PC内フォントとして追加する。戻り値は新しく増えた件数。保存（ttm_localfonts）は既存の分に足していく
function addLocalFonts(names){
  const have = new Set(fonts.map(f => f.family)); let n = 0;
  names.forEach(/** @param {string} fam */ fam => { if(fam && !have.has(fam)){ fonts.push({family: fam, cat:'PC内', src:'local'}); have.add(fam); n++; } });
  const saved = new Set(LS.get('ttm_localfonts', [])); names.forEach(x => saved.add(x)); LS.set('ttm_localfonts', [...saved]);
  return n;
}
// 保存した名前のうち、今もこの端末に入っているものだけを戻す（別の PC で開いたとき、無いフォントを一覧に出さないため。保存データ自体は消さない）
function restoreLocalFonts(){
  const names = LS.get('ttm_localfonts', []).filter(fontInstalled);
  if(names.length) addLocalFonts(names);
}
$('#loadLocal').onclick = async () => {
  let names = [], why = '';
  const qlf = window.queryLocalFonts;
  if(qlf){
    try{
      const data = await qlf.call(window);
      names = [...new Set(data.map(d => d.family))].sort((a, b) => a.localeCompare(b, 'ja'));
      if(!names.length) why = '許可されなかったため';
    }catch(e){ why = errName(e) === 'NotAllowedError' ? '許可されなかったため' : 'この開き方では一覧を取得できないため'; }
  }else why = 'このブラウザでは一覧を取得できないため';
  let n;
  if(names.length){
    n = addLocalFonts(names);
    toast(`PC内のフォント ${names.length} 書体を読み込みました（新規 ${n}）`);
  }else{
    const found = LOCAL_CANDIDATES.filter(fontInstalled);
    n = addLocalFonts(found);
    toast(`${why}、よく使われるフォント${LOCAL_CANDIDATES.length}種から検出しました：${found.length}書体。ほかのフォントは下の欄に名前を入れて追加できます`);
  }
  $as('#fcat', HTMLSelectElement).value = 'PC内'; renderFontList();
};
$('#addLocalName').onclick = () => {
  const name = $as('#localName', HTMLInputElement).value.trim().replace(/^["']|["']$/g, ''); if(!name) return;
  if(!fontInstalled(name)){ toast(`「${name}」が見つかりません。フォント設定に表示される正式な名前か、英語名で試してください`, true); return; }
  addLocalFonts([name]); $as('#localName', HTMLInputElement).value = '';
  S.font = name; fixWeight(); buildWeight(); $as('#fcat', HTMLSelectElement).value = 'PC内'; renderFontList(); schedule();
  toast(`「${name}」を追加して適用しました`);
};
$as('#localName', HTMLInputElement).addEventListener('keydown', e => { if(e.key === 'Enter') $('#addLocalName').click(); });

/* フォントファイル */
// ドロップ・選択されたフォントファイルをその場で読み込む。フォント名はファイル名から決める（中身の名前は読まない）。
// ブラウザ内にしか置かないので保存されず、再読み込みで消える（ファイルは大きく localStorage の容量に収まらないため保存しない）
async function addFontFiles(files){
  let n = 0;
  for(const file of files){
    if(!/\.(ttf|otf|woff2?)$/i.test(file.name)) continue;
    const fam = file.name.replace(/\.[^.]+$/, '');
    try{
      const face = new FontFace(fam, await file.arrayBuffer());
      await face.load(); document.fonts.add(face);
      if(!findFont(fam)) fonts.unshift({family: fam, cat:'ファイル', src:'file'});
      S.font = fam; n++;
    }catch(e){ toast(`${file.name} を読み込めませんでした`, true); }
  }
  if(n){ fixWeight(); buildWeight(); $as('#fcat', HTMLSelectElement).value = 'ファイル'; renderFontList(); schedule(); toast(`${n} 個のフォントを追加しました（再読み込みで消えます）`); }
}
const drop = $('#drop');
drop.onclick = () => $('#ffile').click();
$('#ffile').onchange = e => { addFontFiles(inputOf(e).files); inputOf(e).value = ''; };
// ドロップは画面全体のドロップ処理（thumb/events-drop.js）が受け取る
return {WEB_SRC, initFonts, findFont, cssState, ensureCss, plainText, ensureFont, io, sampleText, renderFontList, updateTextTip, weightsOf, refreshTextUI, fixWeight, buildWeight, updateFontList, preloadFavFonts, registerFontCache, scheduleFontListCheck, addWebFontUrl, restoreLocalFonts, addFontFiles, drop};
})();
