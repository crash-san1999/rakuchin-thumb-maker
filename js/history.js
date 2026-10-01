/* 楽ちんサムネメーカー：取り消し／やり直し */
/*
  役割：作業中のドキュメント（グローバル DOC）全体を JSON 文字列のスナップショットとして積み、Ctrl+Z / Ctrl+Y で行き来する。
  公開：pushHist()（変更後に積む）／restoreHist(i)（i 番目に戻す）。#undo / #redo ボタンとキーボードショートカットもここで結ぶ。
  関係：pushHist は preview.js の schedule()・colors.js の色調整・thumb/doc.js の docChanged()・thumb/export.js・main.js の起動時から
        450ms のデバウンス付きで呼ばれる。復元時は DOC / S（グローバル）を差し替え、fonts.js・thumb/ 側の UI 同期関数と update()（preview.js）を呼ぶ。
        スクリプトの読み込み順は preview.js・colors.js より後（これらの関数は実行時に参照されるだけなので問題ない）。
*/
/* 取り消し／やり直し */
// hist: DOC の JSON 文字列の履歴 / hIdx: 今表示している位置 / restoring: 復元中は pushHist を止める（復元自体が履歴を積まないように）
let hist = [], hIdx = -1, restoring = false;
function pushHist(){
  if(restoring || !DOC) return;
  // 直前と同じ内容なら積まない（変更のない操作や、デバウンス後の重複呼び出しで同じ状態が来うるため）
  const j = JSON.stringify(DOC); if(hist[hIdx] === j) return;
  // 取り消した後に新しい操作をしたら、やり直し側（hIdx より後）の履歴は捨てる。上限120件で古いものから捨てる
  hist = hist.slice(0, hIdx + 1); hist.push(j); if(hist.length > 120) hist.shift(); hIdx = hist.length - 1;
}
// i 番目のスナップショットで DOC を丸ごと置き換える。範囲外は何もしない（先頭／末尾で押しても無害）
function restoreHist(i){
  if(i < 0 || i >= hist.length) return;
  hIdx = i; restoring = true;
  DOC = JSON.parse(hist[i]); DOC.msel = [];   // 複数選択（msel）の状態は復元時に空へ戻す
  // S は「選択中の文字レイヤーのスタイル」への参照。DOC を作り直したので取り直さないと古いオブジェクトを編集してしまう
  const T = textLayer(); if(T) S = T.style;
  // 以下の同期は順序依存：色調整の基準をリセット → 文字パネル → レイヤー一覧 → モード切替 → 保存
  resetAdj(); refreshTextUI(); syncDoc(); renderLayers(); setMode(DOC.mode, true); saveDoc();
  pruneLayerCaches();   // 復元で消えたレイヤーの描画キャッシュを掃除
  // 描画が終わるまで restoring を保つ（復元に伴う UI 更新から pushHist が呼ばれても、履歴を積まないため）
  update().then(() => { restoring = false; });
}
$('#undo').onclick = () => restoreHist(hIdx - 1);
$('#redo').onclick = () => restoreHist(hIdx + 1);
// 文字入力中はブラウザ標準の Ctrl+Z（入力欄内の取り消し）に任せる。それ以外でだけアプリの履歴を動かす
document.addEventListener('keydown', e => {
  const t = e.target, typing = t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && /text|search|number|password/.test(t.type));
  if(typing || !(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if(k === 'z' && !e.shiftKey){ e.preventDefault(); restoreHist(hIdx - 1); }
  else if((k === 'z' && e.shiftKey) || k === 'y'){ e.preventDefault(); restoreHist(hIdx + 1); }
});
