/* 楽ちんサムネメーカー：文字素材モードのプレビュー・書き出し */
/*
  役割：文字パネルの変更を受けて「再描画の予約」「保存」「履歴追加」をまとめて行い、プレビュー（#pv）への描画と
        透過PNGの保存・コピー・共有、プレビュー背景の切り替え、視認性（コントラスト）表示までを担当する。
  公開：schedule()（UI から変更があったら必ずこれ）／update()（実際の再描画）／render() の呼び出し口／exportBlob()／setBg()／setSmallView()。
  関係：文字そのものの描画は text-render.js の render()。フォント読み込みは fonts.js の ensureFont()。
        保存・レイヤー同期は thumb/doc.js（saveDoc / syncDoc）、履歴は history.js（pushHist）。
        thumb モード（DOC.mode === 'thumb'）のときは描画・書き出しを thumb/ 側（drawThumb / exportThumb / thumbBlob）へ委ねる。
        colors.js の bgImg / wantBgPalette / paletteFromBg はこのファイルのイベントから参照される（読み込み順は colors.js が後だが、実行時に参照されるので問題ない）。
*/
/* ============ プレビュー・書き出し ============ */
// tok: update() の世代番号（フォント待ちの間に新しい update が走ったら古い方を捨てる）/ schT: 再描画の遅延タイマー
let tok = 0, schT;
// 入力のたびに呼ばれる窓口。描画(40ms)・履歴(450ms)・レイヤー一覧(200ms)をそれぞれデバウンスし、スライダーを動かし続けても重くならないようにする
function schedule(){
  // S（文字パネルが編集している入れ物）と選択中テキストレイヤーの style がずれていたら S 側に揃える
  if(DOC){ const T = textLayer(); if(T && T.style !== S) T.style = S; }
  clearTimeout(schT); schT = setTimeout(update, 40); saveDoc(); clearTimeout(histT); histT = setTimeout(pushHist, 450);
  if(DOC){ clearTimeout(schedule.lt); schedule.lt = setTimeout(() => { renderLayers(); syncDoc(); }, 200); }
}
// histT は schedule() より後ろで宣言しているが、呼ばれるのは読み込み完了後なので問題ない（thumb/doc.js・colors.js からも共有される）
let histT;
// プレビューを描き直す。thumb モードなら thumb/render.js の drawThumb に任せ、ここは文字素材モード専用
async function update(){
  if(DOC && DOC.mode === 'thumb') return drawThumb();
  const my = ++tok; await ensureFont(); if(my !== tok) return;   // フォント読み込み中に次の update が来たら、こちらは描かずに終わる
  const dpr = Math.min(2, window.devicePixelRatio || 1);   // 高解像度画面でも2倍まで（メモリ・描画時間の上限）
  const c = render(dpr), pv = $('#pv');
  // canvas の幅を変えると内容が消えるので、必ず width/height を設定してから描く。CSS 幅は dpr で割って見た目の大きさに戻す
  pv.width = c.width; pv.height = c.height;
  const px = pv.getContext('2d'); px.clearRect(0, 0, c.width, c.height); px.drawImage(c, 0, 0);
  pv.style.width = (c.width / dpr) + 'px';
  updateVis(); updateTextTip();
  // 表示用は dpr 倍で描いているので、dpr で割って「1倍の大きさ」に戻し、書き出し倍率 S.scale を掛けて実際の書き出し px を出す
  $('#info').textContent = `書き出しサイズ 約 ${Math.round(c.width / dpr * S.scale)} × ${Math.round(c.height / dpr * S.scale)} px`;
}
// 保存名：文字（改行は _ でつなぎ、ファイル名に使えない記号と空白は除く。先頭20文字）＋日時。文字が空なら text
function fileName(){
  const base = plainText().split('\n').join('_').replace(/[\\/:*?"<>|\s]/g, '').slice(0, 20) || 'text';
  return `${base}_${stamp()}.png`;
}
// 書き出し用 PNG。プレビューと違い dpr ではなく S.scale 倍で描く（トリミング済みの透過PNG）。フォント未読込だと代替フォントで出てしまうので先に待つ
async function exportBlob(){ await ensureFont(); const c = render(S.scale); return new Promise(r => c.toBlob(r, 'image/png')); }
$('#dlBtn').onclick = async () => {
  if(DOC.mode === 'thumb') return exportThumb();
  const b = await exportBlob();
  const name = fileName();
  if(await shareFile(b, name)) return;   // 共有シートが使える環境（主にスマホ）ではそちらを優先し、使えなければ通常のダウンロード
  downloadBlob(b, name);
  toast('透過PNGを保存しました');
};
// クリップボードには PNG だけ書ける（ClipboardItem）。権限なし・非対応ブラウザでは例外になるので toast で知らせる
$('#copyBtn').onclick = async () => {
  try{ const th = DOC.mode === 'thumb', b = th ? await thumbBlob('png') : await exportBlob(); await navigator.clipboard.write([new ClipboardItem({'image/png': b})]); toast(th ? 'サムネをクリップボードにコピーしました' : 'クリップボードにコピーしました（透過のまま貼れるソフトに貼り付けてください）'); }
  catch(e){ toast('コピーできませんでした: ' + e.message, true); }
};
// Ctrl/⌘+S はブラウザの「ページを保存」を止めて、保存ボタンと同じ処理にする
document.addEventListener('keydown', e => { if((e.ctrlKey || e.metaKey) && e.key === 's'){ e.preventDefault(); $('#dlBtn').click(); } });

/* プレビュー背景 */
$('#bgSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b) return;
  if(b.dataset.bg === 'img'){ $('#bgfile').click(); return; }   // 「画像」は選択ダイアログを開くだけ。実際の切り替えは #bgfile の onchange 側
  setBg(b.dataset.bg);
});
// className を作り直すので、'small'（小さく表示）の状態だけは引き継ぐ
function setBg(bg){
  $('#stage').className = 'stage ' + bg + ($('#stage').classList.contains('small') ? ' small' : '');
  document.querySelectorAll('#bgSeg button').forEach(x => x.classList.toggle('on', x.dataset.bg === bg));
}
$('#bgfile').onchange = e => {
  const f = e.target.files[0]; if(!f) return;
  const url = URL.createObjectURL(f);   // 注意：この URL は revokeObjectURL していない（背景として表示し続けるので、選び直すたびに増える）
  $('#stage').style.backgroundImage = `url(${url})`; setBg('img');
  // 「背景画像から配色」を押して画像を選んだ場合（wantBgPalette）は、読み込み完了を待ってから配色を作る（colors.js）
  bgImg = new Image(); bgImg.onload = () => { if(wantBgPalette){ wantBgPalette = false; paletteFromBg(); } }; bgImg.src = url;
};
// 他の背景に切り替わったら、残っている背景画像の指定を消す（class 変更を監視して一箇所で後始末する）
new MutationObserver(() => { if(!$('#stage').classList.contains('img')) $('#stage').style.backgroundImage = ''; })
  .observe($('#stage'), {attributes:true, attributeFilter:['class']});
/* 視認性チェック（文字の塗り ⇔ すぐ外側の色） */
// 比較相手は「最初の有効なフチ → 背景シェイプ → 影」の順で最初に見つかった色。複数色の塗り（グラデ・金属）は最も低いコントラストで判定する。
// 金属は METALS（text-render.js）の stops のうち index 1 と 5（上下の明るい帯）の色で代表させる。中抜き・くり抜き（fillMode が normal 以外）は塗りの色で見え方が決まらないので判定しない。
// 基準値は WCAG の 7 / 4.5 / 3（colors.js の contrast()）。update() から毎回呼ばれる。
function updateVis(){
  const mt = hasKey(METALS, S.metal) ? METALS[S.metal] : METALS.gold;
  const fills = S.fillType === 'metal' ? [mt[1][1], mt[5][1]]
    : S.fillType === 'solid' ? [S.fill1] : [S.fill1, S.fill2];
  const st = S.strokes.find(x => x.on && x.w > 0);
  const edge = st ? st.c : S.plate.on ? S.plate.c : S.shadow.on ? S.shadow.c : null;
  const el = $('#vis');
  if(!edge || S.fillMode !== 'normal'){ el.textContent = '視認性：—'; el.className = 'vis'; return; }
  const cr = Math.min(...fills.map(f => contrast(f, edge)));
  const [mark, cls] = cr >= 7 ? ['◎ とても読みやすい', 'good'] : cr >= 4.5 ? ['○ 読みやすい', 'ok'] : cr >= 3 ? ['△ 小さいと読みにくい', 'warn'] : ['× フチの色を変えましょう', 'bad'];
  el.textContent = `視認性 ${cr.toFixed(1)}:1 ${mark}`; el.className = 'vis ' + cls;
}
// 小さく表示 ⇄ 大きく表示。今の状態に合わせてボタンの文字・アイコン・説明も切り替える
function setSmallView(on){
  $('#stage').classList.toggle('small', on);
  const b = $('#smallBtn'); b.classList.toggle('on', on);
  b.innerHTML = `${ic(on ? 'monitor' : 'phone')}${on ? '大きく表示' : '小さく表示'}`;
  b.title = on ? '元の大きさに戻す' : 'YouTubeのおすすめ欄くらいの大きさで確認';
  if(DOC && DOC.mode === 'thumb') paintPreview(false);   // thumb モードの表示幅は paintPreview() が 'small' クラスを見て決める（小さい時は 246px 固定）ので、クラス切替後に呼び直す
}
$('#smallBtn').onclick = () => setSmallView(!$('#stage').classList.contains('small'));
