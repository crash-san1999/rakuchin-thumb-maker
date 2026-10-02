/* 楽ちんサムネメーカー：キャンバスのサイズ（サムネ・縦配信・正方形など。自由に指定もできる） */
/*
  役割：キャンバス寸法（DOC.w / DOC.h）と書き出し寸法（DOC.exportW）の変更・上限チェック・選択肢UIの更新。
  主な公開：setCanvasSize / refreshSizeUI / exportSizes / CANVAS_MIN・CANVAS_MAX / EXPORT_MAX_PX
  依存：DOC・docChanged・syncDoc（doc.js）、renderLayers（layers.js）、paintPreview・prevCache・dims（render.js）。
  呼び出し元：doc.js の normalizeDoc（EXPORT_MAX_PX で書き出し幅を丸める）、doc.js の syncDoc（refreshSizeUI）。
  単位：DOC.w/h は作業座標系の px。exportW は実際に書き出す横幅 px（縦は縦横比から計算）。描画倍率 f = exportW / DOC.w。
*/
// キャンバス寸法のプリセット（[値 'WxH', 表示名]）
const CANVAS_PRESETS = [
  ['1920x1080', '横 16:9（1920×1080）YouTubeサムネ・配信'],
  ['1080x1920', '縦 9:16（1080×1920）縦配信・ショート・TikTok・リール'],
  ['1080x1080', '正方形 1:1（1080×1080）'],
  ['1080x1350', '縦 4:5（1080×1350）Instagram'],
  ['1200x630', '横（1200×630）X・Facebook のリンク画像'],
  ['1280x720', '横 16:9（1280×720）'],
  ['2560x1440', '横 16:9（2560×1440）'],
  ['yt-header', 'YouTube チャンネルアート（2560×1440）セーフエリア付き'],
  ['tw-header', 'Twitch バナー（1200×480）セーフエリア付き'],
];
// ヘッダー画像の規定サイズとセーフエリア。areas は中央に置く枠（w×h）で、main が「どの端末でも必ず見える範囲」。
// YouTube は公式の数値（TV=全体 / PC=2560×423 / タブレット=1855×423 / スマホ=1546×423）。Twitch は公式の数値がなく「中央に置く」が目安なので、中央 2/3 を目安にしている
const HEADER_SPECS = {
  yt:{w:2560, h:1440, name:'YouTube チャンネルアート', areas:[
    {w:2560, h:423, label:'PC 2560×423'}, {w:1855, h:423, label:'タブレット 1855×423'}, {w:1546, h:423, label:'スマホ・全端末 1546×423', main:true}]},
  tw:{w:1200, h:480, name:'Twitch バナー', areas:[{w:800, h:480, label:'中央の目安 800×480', main:true}]},
};
// プリセットの値（'yt-header' など）から、ヘッダーの種類を取り出す（ふつうのサイズなら ''）
const headerOfPreset = v => String(v).endsWith('-header') ? String(v).slice(0, -7) : '';
// EXPORT_MAX_PX は書き出しキャンバスの面積上限（36MP）。ブラウザの canvas 面積の上限を超えると書き出しに失敗するため、
// normalizeDoc と setCanvasSize の両方で、超える書き出し幅は 0.9 倍ずつ縮めて収める
const CANVAS_MIN = 200, CANVAS_MAX = 5000, EXPORT_MAX_PX = 36e6;
// キャンバスのサイズを変える。fit のときは、今ある文字・画像などの位置と大きさも新しいサイズに合わせて置き直す
function setCanvasSize(w, h, fit = true, hdr = ''){
  w = Math.round(+w); h = Math.round(+h);
  if(!(w >= CANVAS_MIN && h >= CANVAS_MIN && w <= CANVAS_MAX && h <= CANVAS_MAX)){ toast(`サイズは ${CANVAS_MIN}〜${CANVAS_MAX} px の間で指定してください`, true); return false; }
  // ヘッダーのサイズを選んだときだけセーフエリアのガイドを自動でオン、それ以外のサイズではオフにする
  const setHdr = () => { DOC.hdr = hdr; DOC.guides.safe = !!hdr; };
  if(w === DOC.w && h === DOC.h){ if(DOC.hdr !== hdr){ setHdr(); syncDoc(); docChanged(false); paintPreview(false); } return true; }
  // rx・ry は縦横それぞれの拡大率（位置用）、s は小さいほう（大きさ用。縦横比が変わっても絵がはみ出さないように等倍で縮尺）、k は書き出し倍率
  const ow = DOC.w, oh = DOC.h, rx = w / ow, ry = h / oh, s = Math.min(rx, ry), k = DOC.exportW / ow;
  if(fit) DOC.layers.forEach(L => {
    L.x = Math.round(L.x * rx); L.y = Math.round(L.y * ry);
    // 分割フレームは枠の横幅・高さ（bw/bh）そのものが DOC 座標なので縦横別々に伸ばす。それ以外は sc（倍率）を s で縮尺
    if(L.type === 'collage'){ L.bw = Math.max(100, Math.round(L.bw * rx)); L.bh = Math.max(100, Math.round(L.bh * ry)); }
    else if(!(L.type === 'fx' && (L.kind === 'lines' || L.kind === 'light'))) L.sc = Math.round(clamp(L.sc * s, 0.02, 20) * 1000) / 1000;   // 集中線・光は、もともとキャンバスに対する大きさ
  });
  DOC.w = w; DOC.h = h; setHdr();
  // 書き出しの大きさは、これまでと同じ倍率で。大きすぎるときは小さくする
  let ex = Math.max(100, Math.round(w * k)); while(ex * ex * h / w > EXPORT_MAX_PX && ex > 200) ex = Math.floor(ex * 0.9);
  DOC.exportW = ex;
  // 描画キャッシュ・レイヤー寸法の記録は旧キャンバスの大きさ前提なので捨てる（残すと選択枠・当たり判定がずれる）
  prevCache.clear(); dims.clear();
  syncDoc(); renderLayers(); docChanged(false); paintPreview(false);
  return true;
}
// 書き出しサイズの選択肢は、キャンバスの縦横比に合わせて作る（倍率 2/3・1・4/3・2）
const exportSizes = () => [...new Set([2 / 3, 1, 4 / 3, 2].map(k => Math.round(DOC.w * k)).concat([DOC.exportW]))].sort((a, b) => a - b).filter(W => W * W * DOC.h / DOC.w <= EXPORT_MAX_PX * 1.05);
// sizeUiKey：前回UIを組んだときの「寸法の組」。syncDoc のたびに呼ばれるが、変わっていなければ選択肢の再生成（select の選択が飛ぶ）を避ける
let sizeUiKey = '';
// 入力欄（#cvW / #cvH）は、入力中（フォーカス中）なら上書きしない。打ちかけの数字が消えるため
function refreshSizeUI(force){
  if(!DOC) return;
  const key = `${DOC.w}x${DOC.h}|${DOC.exportW}|${DOC.hdr}`; if(key === sizeUiKey && !force) return; sizeUiKey = key;
  const opts = exportSizes().map(W => { const H = Math.round(W * DOC.h / DOC.w); return `<option value="${W}">${W}×${H}${W === DOC.w ? '（等倍）' : W === 3840 || H === 3840 ? '（4K）' : ''}</option>`; }).join('');
  document.querySelectorAll('select[data-d="exportW"]').forEach(sel => { sel.innerHTML = opts; sel.value = String(DOC.exportW); });
  const cur = `${DOC.w}x${DOC.h}`, ps = $('#canvasPreset');
  if(ps){ ps.innerHTML = CANVAS_PRESETS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('') + '<option value="custom">自由に指定…</option>'; const hv = DOC.hdr ? DOC.hdr + '-header' : cur; ps.value = CANVAS_PRESETS.some(p => p[0] === hv) ? hv : 'custom'; }
  if($('#cvW') && document.activeElement !== $('#cvW')) $('#cvW').value = DOC.w;
  if($('#cvH') && document.activeElement !== $('#cvH')) $('#cvH').value = DOC.h;
  $('#cvNow') && ($('#cvNow').textContent = `${DOC.w}×${DOC.h}（${(DOC.w / DOC.h).toFixed(2)}:1）`);
  // キャンバスのサイズに合わせて、分割フレームの横幅・高さの上限を変える
  document.querySelectorAll('[data-d="@bw"]').forEach(el => { el.max = DOC.w; });
  document.querySelectorAll('[data-d="@bh"]').forEach(el => { el.max = DOC.h; });
}
// 以降はイベント委譲（要素が動的に作り直されても効くよう document に付ける）。プリセットは即適用、「自由に指定…」は入力欄へ誘導、適用ボタン・Enter で #cvW/#cvH の値を適用
document.addEventListener('change', e => {
  if(e.target.id === 'canvasPreset'){
    const v = e.target.value; if(v === 'custom'){ $('#cvW').focus(); $('#cvW').select(); return; }
    const hd = headerOfPreset(v), sp = HEADER_SPECS[hd];
    const [w, h] = sp ? [sp.w, sp.h] : v.split('x').map(Number); setCanvasSize(w, h, $('#cvFit').checked, hd);
  }
});
document.addEventListener('click', e => {
  if(e.target.closest('#cvApply')){ if(!setCanvasSize($('#cvW').value, $('#cvH').value, $('#cvFit').checked)) refreshSizeUI(true); }
});
document.addEventListener('keydown', e => { if((e.target.id === 'cvW' || e.target.id === 'cvH') && e.key === 'Enter'){ e.preventDefault(); $('#cvApply').click(); } });
