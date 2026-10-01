/* 楽ちんサムネメーカー：起動 */
/*
  ほかのファイルは「定義」と「操作の受け付け」だけを持ち、起動時の処理はここにまとめる。
  ここは最後に読み込まれるので、すべてのファイルの関数・定数を使える。
  最後の boot() 呼び出しが唯一の起動点。index.html の <script> の並び順（core → bind → presets → … → main）に依存し、
  ここで呼ぶ関数はどれも先に読み込まれたファイルのもの。ファイルを足すときは main.js より前に置くこと。
  各ファイルが読み込み時点で行うこと（イベントの登録など）は、DOM がすでにある前提（<script> は body の末尾）。
*/
// サムネモード側の起動。boot() の中で、文字モード側の準備（フォント・プリセット）が済んだあとに呼ぶ
function thumbInit(){
  $('#selBox').innerHTML = `${SEL_ROWS.map(r => drowPg(r)).join('')}`;
  $('#bgRows').innerHTML = BG_ROWS.map(r => drowPg(r, true)).join('');
  $('#pickBg').onclick = () => $('#bgimgfile').click();
  $('#fxCenter').onclick = () => { DOC.bg.fcx = 0.5; DOC.bg.fcy = 0.5; syncDoc(); docChanged(false); };
  applyView(true);   // 最初にPC／スマホを決める（以降の setMode・描画がレイアウトに依存するため）
  setMode(DOC.mode, true);
  renderInspector(true);
  syncDoc(); renderLayers();
  idbRestore(); libInit();
  // 'first'（未設定）または true のときだけ起動時に操作ガイドを出す。「次から出さない」で false が保存される。少し遅らせるのは、画面が整ってから出すため
  if(LS.get('ttm_helpAuto', 'first') !== false) setTimeout(openHelp, 400);
  // 画面サイズが変わったら、プレビューの表示倍率を合わせ直す（連続イベントはまとめて 60ms 後に1回）
  window.addEventListener('resize', () => { clearTimeout(thumbInit.r); thumbInit.r = setTimeout(() => paintPreview(false), 60); });
  // Web フォントは読み込みが後から終わるので、終わったら描き直さないとプレビューが代替フォントのままになる
  document.fonts.addEventListener('loadingdone', () => { if(DOC.mode === 'thumb'){ clearTimeout(thumbInit.f); thumbInit.f = setTimeout(() => paintPreview(false), 150); } });
}
// 起動の順序は依存関係そのもの：アイコン置換 → 保存データ（DOC）の復元 → 文字パネルの部品 → フォント一覧 → UI 同期 → サムネ側 → 初回描画。
// 順番を入れ替えると、DOC が null のまま参照したり、まだ無い入力欄に値を入れたりする
function boot(){
  paintIcons();
  loadSavedDoc();
  buildTextControls();
  initFonts(); restoreLocalFonts(); fixWeight(); buildWeight(); syncUI(); renderPresets(); renderFontList();
  renderThemes();
  thumbInit();
  update(); pushHist();   // 初回描画のあとに、最初の状態を取り消し履歴の起点として積む
  // 以下は起動を遅くしないための後回し処理（どれも内部で少し待ってから動く）
  scheduleFontListCheck(); registerFontCache(); preloadFavFonts();
}
boot();
