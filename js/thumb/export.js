/* 楽ちんサムネメーカー：サムネの書き出し・共有・プロジェクト読み込み */
/*
  役割：DOC を書き出し解像度で描いて Blob にする／ファイルとして保存・共有する／DOC を丸ごと差し替える。
  主な公開：thumbBlob(fmt)（クリップボードコピーでも使う）/ exportThumb / loadDocObj / shareFile
  依存：compose（render.js）、ensureFont・ensureCollageFonts（フォント読み込み）、normalizeDoc・syncDoc（doc.js）、
       downloadBlob・stamp・toast・mk（core.js）。
  呼び出し元：preview.js（保存ボタン・コピー）、events.js（プロジェクトを開く・新規作成から loadDocObj）。
*/
/* ---------- 書き出し ---------- */
// fmt: 'png'（透過保持）または jpeg 系。戻り値は Blob（失敗時は null になりうる）
async function thumbBlob(fmt){
  // 描画の前に使うフォントを全部読み込む。未読み込みのまま描くと代替フォントで書き出されてしまう
  for(const L of DOC.layers) if(L.type === 'text' && !L.hidden) await ensureFont(L.style); else if(L.type === 'collage') await ensureCollageFonts(L);
  const W = DOC.exportW, H = Math.round(W * DOC.h / DOC.w), c = mk(W, H);
  // JPEG は透明を持てない（黒くなる）ので、先に白で塗っておく。PNG は背景非表示のとき透明のまま
  if(fmt !== 'png'){ const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H); }
  // 書き出し用の描画：live=false（高品質）、キャッシュは使い捨ての new Map()（プレビュー用 prevCache と倍率が違うので混ぜない）。
  // exporting は書き出し中だけ true にする目印（collage-draw.js が、画像の無い空きマスの目印表示を書き出しには出さないために見る）。例外でも必ず戻す
  exporting = true; try{ compose(c.getContext('2d'), W, H, false, new Map()); } finally { exporting = false; }
  const toB = (t, q) => new Promise(r => c.toBlob(r, t, q));
  if(fmt === 'png') return toB('image/png');
  // YouTube のサムネ上限は 2MB。limit2mb のときは、品質を 0.08 ずつ下げて収まるまで再圧縮する（下限 0.45。それ以下は画質劣化が目立つので諦める）
  let q = 0.93, b = await toB('image/jpeg', q);
  while(b && DOC.limit2mb && b.size > 2e6 && q > 0.45){ q -= 0.08; b = await toB('image/jpeg', q); }
  return b;
}
async function exportThumb(){
  toast('書き出し中…');
  let b; try{ b = await thumbBlob(DOC.fmt); }catch(err){ console.warn(err); }
  if(!b){ toast('書き出せませんでした。書き出しサイズを小さくしてもう一度お試しください', true); return; }
  // スマホは共有メニュー（写真アプリへ保存できる）を優先し、使えない・非対応ならダウンロードにフォールバック
  const name = `thumbnail_${DOC.exportW}x${Math.round(DOC.exportW * DOC.h / DOC.w)}_${stamp()}.${DOC.fmt}`;
  if(await shareFile(b, name)) return;
  downloadBlob(b, name);
  toast(`サムネを保存しました（${DOC.exportW}×${Math.round(DOC.exportW * DOC.h / DOC.w)}・${(b.size / 1048576).toFixed(2)}MB）`);
}

// DOC を丸ごと差し替える（プロジェクトを開く・新規作成）。呼ぶ前に、DOC が参照する画像アセットは addAsset 済みであること。
// 描画キャッシュ・寸法記録は前の DOC のレイヤーid のものなので捨て、最後に履歴へ積む（取り消しで元の DOC に戻せる）
function loadDocObj(d){
  DOC = normalizeDoc(d);
  const T = textLayer(); if(T) S = T.style;
  prevCache.clear(); dims.clear(); resetAdj();
  refreshTextUI(); syncDoc(); renderLayers(); setMode(DOC.mode); saveDoc(); pushHist();
}
/* 共有（スマホ：写真アプリに保存できる） */
// 戻り値 true＝共有で処理済み（共有をキャンセルした場合も true：ユーザーの意思なのでダウンロードに回さない）。false＝非対応・失敗なので呼び出し側でダウンロードする
async function shareFile(blob, name){
  if(!isMobile || !navigator.canShare) return false;
  const file = new File([blob], name, {type: blob.type});
  if(!navigator.canShare({files:[file]})) return false;
  try{ await navigator.share({files:[file], title:'サムネイル'}); toast('共有メニューから「画像を保存」で写真に保存できます'); return true; }
  catch(e){ if(e && e.name === 'AbortError') return true; return false; }
}
