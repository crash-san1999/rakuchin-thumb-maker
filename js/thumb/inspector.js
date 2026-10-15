/* 楽ちんサムネメーカー：操作パネル・モード・タブ */
/*
  役割：右側の操作パネル（インスペクタ）を「宣言的な行の表」から組み立てる。選んだもの（レイヤーの種類・背景・文字モード）に
       合わせてタブ（ページ）を切り替え、モード（サムネ／文字）を切り替える。
  主な公開：drowPg・drow（行→HTML）/ renderInspector / openInspector / setPage / setMode / insCtx / shapeIcon
  呼び出し元：main.js（起動時に SEL_ROWS・BG_ROWS を #selBox・#bgRows へ流し込む）、doc-sync.js の syncDoc（renderInspector）、
            layers.js・events.js（openInspector・setMode）。
  依存：DB（doc-sync.js の makeBinder。行の見た目の部品 DB.row と表示条件の評価）、COLLAGE_*・FRAME_*・FIN_*・FX_*（各機能ファイル）、selLayer・DOC。

  行の表（SEL_ROWS・BG_ROWS）と、行オブジェクトのキーの書き方は inspector-rows.js。
*/
/* ---------- パネル（行の表 → HTML） ---------- */
// ファイルの中だけで使う名前を外（ほかのファイルと共有の場所）に出さないよう、中身を関数で包んでいる。外から使う名前は最後の return で出す
// 外から読み書きする変数（ほかのファイルが今の値を読むので、外で宣言して中では代入だけにする）
let curPage;
var {drowPg, INS_INFO, insCtx, setPage, renderInspector, openInspector, setMode} = (() => {
const rowPg = (r, bg) => r.pg || (bg ? 'main' : 'base');
const drowPg = (r, bg) => `<div data-pg="${rowPg(r, bg)}">${drow(r)}</div>`;
// 行オブジェクト1つ → HTML。特殊部品（r.layouts など）を先に判定し、どれでもなければ DB.row（スライダー・色・選択など）に任せる。
// sa は表示条件の属性。部品の外側の枠にも付けて、条件で行ごと隠せるようにする
function drow(r){
  const sa = r.show ? ` data-dshow="${r.show}"` : '';
  if(r.layouts) return `<div class="row"${sa}><label>${r.l}</label><div class="seg shapes lays" data-dseg="@layout">${[2, 3, 4, 5, 6, 7, 8].flatMap(n => COLLAGE_LAYOUTS.filter(l => l[2](n)).map(([k, t]) => `<button data-v="${k}" data-dshow="@n=${n}" title="${t}"><img src="${collageIcon(k, n)}" alt="${t}"></button>`)).join('')}</div></div>`;
  if(r.flips) return `<div class="row"${sa}><label>${r.l}</label><div class="crow flips"><button class="btn sm" data-flip="flip" title="左右反転（H）">${ic('fliph')}左右</button><button class="btn sm" data-flip="flipV" title="上下反転（V）">${ic('flipv')}上下</button></div></div>`;
  if(r.cells) return `<div class="cellBox"${sa}></div>`;
  if(r.ctext) return `<div class="ctBox"${sa}></div>`;
  if(r.week) return `<div class="wkBox"${sa}></div>`;
  if(r.sched) return `<div class="schBox"${sa}></div>`;
  if(r.schedStyle) return `<div class="schStyleBox"${sa}></div>`;
  if(r.cfxchips) return `<div${sa}><div class="subhead" style="margin-top:18px">ワンクリック効果</div><div class="pcats fxchips">${CELL_FX_CHIPS.map(([k, t]) => `<button data-cfx="${k}">${t}</button>`).join('')}</div></div>`;
  if(r.frpre){ const nm = Object.fromEntries(FRAME_PRESETS.map(p => [p[0], p[1]]));
    return `<div${sa}>${FRAME_GROUPS.map(([g, ks]) => `<div class="frgrp">${g}</div><div class="pcats frpre">${ks.map(k => `<button data-frpre="${k}">${nm[k]}</button>`).join('')}</div>`).join('')}<div class="pcats frpre"><button data-frpre="off">フレームなし</button></div></div>`; }
  if(r.shapes) return `<div class="row"${sa}><label>${r.l}</label><div class="seg shapes" data-dseg="@frame.shape">${FRAME_SHAPES.map(([k, t]) => `<button data-v="${k}" title="${t}">${k === 'none' ? '<span>なし</span>' : `<img src="${shapeIcon(k)}" alt="${t}">`}</button>`).join('')}</div></div>`;
  if(r.sub) return `<div class="subhead" style="margin-top:24px"${sa}>${r.sub}${r.note ? `<span class="subnote">${r.note}</span>` : ''}</div>`;
  if(r.addfx) return `<div class="subhead" style="margin-top:26px">動的エフェクト<span class="subnote">レイヤーとして追加され、文字や画像と同じように移動・拡大縮小・回転できます</span></div><div class="fxgrps">${fxChipsHtml('btn sm')}</div>`;
  if(r.finchips) return `<div${sa}><div class="subhead" style="margin-top:18px">ワンクリック仕上げ<span class="subnote">サムネ全体の雰囲気を一発で変えます</span></div><div class="pcats fxchips">${Object.entries(FIN_PRESETS).map(([k, v]) => `<button data-finfx="${k}">${v[0]}</button>`).join('')}</div></div>`;
  if(r.fx) return `<div${sa}><div class="subhead" style="margin-top:18px">ワンクリック背景エフェクト</div><div class="pcats fxchips">${FX_CHIPS.map(([k, t]) => `<button data-bgfx="${k}">${t}</button>`).join('')}</div></div>`;
  if(r.place) return `<div class="row"${sa}><label>${r.l}</label><div class="place">${['t', 'm', 'b'].map(v => ['l', 'c', 'r'].map(h => `<button data-place="${h}${v}" title="この位置に配置"></button>`).join('')).join('')}</div></div>`;
  if(r.btns) return `<div class="crow"${sa}>${r.btns.map(([id, icn, t]) => `<button class="btn sm" id="${id}">${ic(icn)}${t}</button>`).join('')}</div>`;
  return DB.row(r);
}

// フレーム形状のアイコン（44px の canvas から作る dataURL）。形ごとに1回だけ作って使い回す
const shapeIconCache = {};
function shapeIcon(k){
  if(shapeIconCache[k]) return shapeIconCache[k];
  const c = mk(44, 44), x = ctx2d(c); x.translate(22, 22); x.beginPath(); framePath(x, k, 32, 32, 0.2); x.fillStyle = '#1f1b2d'; x.fill();
  return shapeIconCache[k] = c.toDataURL();
}
/* ---------- モード・タブ ---------- */
/* ---------- 選んだものに合わせた設定パネル ---------- */
// curPage：いま開いているページ id。insKey：前回パネルを組んだときの「文脈|レイヤーid」（同じなら組み直さない）。
// pendingPage：次に開くページの予約（openInspector が指定）。lastPage：文脈ごとに最後に開いたページ（localStorage に保存。選び直したときに同じタブへ戻すため）
curPage = null; let insKey = ''; let pendingPage = null;
const lastPage = LS.get('ttm_pages', {});
// 文脈（insCtx）ごとのタブ [ページid, 表示名]。ページid の接頭辞が表示領域を決める：
// txt-＝文字パネル / lay-＝選択中レイヤーの行（#selBox）/ bg-＝背景の行（#bgRows）。後半が行の pg に対応する（SEL_ROWS・BG_ROWS）
const INS_PAGES = {
  textmode:[['txt-text', 'テキスト'], ['txt-style', 'スタイル'], ['txt-font', 'フォント'], ['txt-deco', '装飾']],
  text:[['txt-text', 'テキスト'], ['txt-style', 'スタイル'], ['txt-font', 'フォント'], ['txt-deco', '装飾'], ['lay-base', '配置']],
  image:[['lay-base', '配置'], ['lay-frame', 'フレーム'], ['lay-edge', 'フチ・影'], ['lay-color', '色'], ['lay-cut', '背景透過']],
  collage:[['lay-split', '分割'], ['lay-cells', 'マスの画像'], ['lay-ctext', '背景色・文字'], ['lay-cfx', '効果'], ['lay-base', '配置']],
  fx:[['lay-fx', 'エフェクト'], ['lay-base', '配置']],
  group:[['lay-cfx', '効果'], ['lay-base', '配置']],
  sched:[['lay-sched', '予定'], ['lay-sdesign', 'デザイン'], ['lay-base', '配置']],
  bg:[['bg-main', '背景'], ['bg-tone', '色調'], ['bg-fx', '効果'], ['bg-fin', '仕上げ']],
};
// パネル上部の見出し [アイコン名, 種類の表示名]
const INS_INFO = {textmode:['text', '文字素材'], text:['text', '文字'], image:['image', '画像'], collage:['grid', '分割フレーム'], group:['group', 'グループ'], sched:['calendar', '週間予定表'], fx:['fxadd', '動的エフェクト'], bg:['sliders', '背景']};
// いま何の設定パネルを出すか：文字モード → 'textmode'、レイヤー選択中 → そのレイヤーの type、何も選んでいない → 'bg'（背景の設定）
function insCtx(){ if(!DOC || DOC.mode === 'text') return 'textmode'; const L = selLayer(); return L ? L.type : 'bg'; }
// ページを切り替える。文字パネルは3つのペイン（text / style / design）と、text ペイン内の2つの節（テキスト・フォント）の出し分け、
// それ以外は #selBox・#bgRows の中の行を pg で出し分ける。切り替えのたびにパネルの先頭へスクロールする
function setPage(page){
  const ctx = insCtx(); curPage = page; lastPage[ctx] = page; LS.set('ttm_pages', lastPage);
  const pane = {'txt-text':'text', 'txt-font':'text', 'txt-style':'style', 'txt-deco':'design'}[page] || 'thumb';
  $$('.pane').forEach(p => p.classList.toggle('on', p.dataset.pane === pane));
  const tp = $('.pane[data-pane=text]'), [ts, fs] = $$(':scope > section', tp);
  ts.classList.toggle('secoff', page !== 'txt-text'); fs.classList.toggle('secoff', page !== 'txt-font');
  $('#layerSec').classList.toggle('secoff', !page.startsWith('lay-')); $('#bgSec').classList.toggle('secoff', !page.startsWith('bg-'));
  const pg = page.split('-')[1];
  $$('#selBox [data-pg], #bgRows [data-pg]').forEach(el => el.classList.toggle('pgoff', !(el.dataset.pg ?? '').split('|').includes(pg)));
  $$('#tabs [data-page]').forEach(b => b.classList.toggle('on', b.dataset.page === page));
  const pn = $('.pane.on'); if(pn) pn.scrollTop = 0;
}
// パネルの組み直し。選択が変わったとき（insKey が変わったとき）だけタブを作り直す。force=true で必ず作り直す。
// 見出しの名前は毎回更新する（レイヤー名の変更・文字の編集に追従するため）が、内容が同じなら DOM を触らない。
// 開くページの優先順：予約（pendingPage）→ 前回その文脈で開いたページ → 先頭のタブ（どれも存在するときだけ）
function renderInspector(force){
  if(!DOC || !$('#insHead')) return;
  const ctx = insCtx(), L = selLayer(), key = ctx + '|' + (L ? L.id : ''), [icn, typ] = INS_INFO[ctx];
  const name = ctx === 'bg' ? '何も選んでいないときは背景の設定です' : ctx === 'textmode' ? '文字だけを透過PNGで作ります' : L ? layerName(L) : '';
  if($('#insName').textContent !== name) $('#insName').textContent = name;
  if(key === insKey && !force) return;
  $('#insIc').innerHTML = ic(icn); $('#insType').textContent = typ; $('#insDesel').style.display = ctx !== 'bg' && ctx !== 'textmode' ? '' : 'none';
  insKey = key;
  const pages = INS_PAGES[ctx];
  $('#tabs').innerHTML = pages.map(([p, t]) => `<button data-page="${p}">${t}</button>`).join('');
  const has = p => p && pages.some(q => q[0] === p);
  const want = has(pendingPage) ? pendingPage : has(lastPage[ctx]) ? lastPage[ctx] : pages[0][0];
  pendingPage = null; setPage(want);
  if(isMobile && sheet === 'ins') $('#sheetTitle').textContent = typ;
}
// ページを指定して設定パネルを開く（page 省略で、選んだものの既定のページ）
function openInspector(page){ pendingPage = page || null; renderInspector(true); if(isMobile) openSheet('ins', true); }
// モード（'thumb' サムネ作成／'text' 文字だけ透過PNG）の切り替え。silent=true は起動時用で、再描画の予約をしない（直後に初回描画があるため）。
// 文字モードに入るとき、スマホのシート（レイヤー・追加）は閉じる。ステージが画像背景表示のままサムネモードへ戻る場合は、背景を市松（checker）に戻す
function setMode(m, silent){
  DOC.mode = m;
  document.body.classList.toggle('mode-thumb', m === 'thumb'); document.body.classList.toggle('mode-text', m === 'text');
  $$('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  $('#dlLabel').textContent = isMobile ? '保存' : (m === 'thumb' ? 'サムネを保存' : '透過PNGを保存');
  if(m === 'text' && (sheet === 'layers' || sheet === 'add')) openSheet(null);
  renderInspector(true);
  if(m === 'thumb' && $('#stage').classList.contains('img')) setBg('checker');
  saveDoc();
  if(!silent){ clearTimeout(schT); schT = setTimeout(update, 10); }
}
return {drowPg, INS_INFO, insCtx, setPage, renderInspector, openInspector, setMode};
})();
