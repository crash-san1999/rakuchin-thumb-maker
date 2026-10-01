/* 楽ちんサムネメーカー：PC／スマホの自動判定・下のバーとシート・タッチ操作 */
/*
  役割：①PC／スマホ表示の判定（isMobile）と body.is-mobile の切り替え ②スマホの下バー（#mbar）と、レイヤー／設定の
  ボトムシートの開閉（openSheet）③キャンバス（#tv）のタッチ操作（ピンチ・長押し・ダブルタップ）。
  公開：isMobile / applyView(first)（main.js が起動時に呼ぶ）/ openSheet(name)（thumb 側の選択処理などからも呼ばれる）。
  依存：LS・$・ic・clamp・toast（core.js）、DOC・selLayer・drag・snapLines・paintPreview・livePaint・syncDocSoon・docChanged 等（thumb/*.js）、
  togglePop（popups.js）。スマホ向けのレイアウト自体は css 側（body.is-mobile / .sheet-on）で、ここは状態を切り替えるだけ。
  マウス操作はここでは扱わない（thumb/events.js）。タッチは capture 段階で先に受け、2本指のときだけ events.js 側へ渡さない。
*/
/* ============ PC／スマホの自動判定 ============ */
// isMobile：今スマホ表示か。sheet：開いているシート名（'layers' | 'ins' | null）
let isMobile = false, sheet = null;
// 表示の決め方：利用者が固定した設定（ttm_view = 'pc' | 'mobile'）を最優先し、'auto' のときだけ端末から推測する。
// 推測は誤判定しやすい（折りたたみ・タブレット・PCの狭いウィンドウ）ので、UA・タッチ主体（粗いポインタでホバー不可）・画面の狭さを組み合わせる。
// 狭い PC ウィンドウは 600px 未満だけスマホ扱いにし、それ以上は PC 表示のまま
function detectMobile(){
  const pref = LS.get('ttm_view', 'auto');
  if(pref === 'pc') return false;
  if(pref === 'mobile') return true;
  const coarse = matchMedia('(pointer: coarse)').matches, hover = matchMedia('(hover: hover)').matches;
  const shortSide = Math.min(screen.width, screen.height), narrow = innerWidth < 820 || shortSide < 700;
  const ua = /Android.+Mobile|iPhone|iPod|Windows Phone|Mobile Safari/i.test(navigator.userAgent);
  return (ua && narrow) || (coarse && !hover && narrow) || innerWidth < 600;
}
// 判定結果を画面に反映する。first=true は「結果が同じでも反映し直す」（起動時・設定ボタンの操作時）。
// リサイズでは first=false で呼ばれ、スマホ⇔PC が実際に変わったときだけ動く（変わらないのに毎回やり直さない）
function applyView(first){
  const m = detectMobile();
  if(m === isMobile && !first) return;
  isMobile = m;
  document.body.classList.toggle('is-mobile', m);
  if(!m){ openSheet(null); }   // PC に戻ったときシートが開きっぱなしにならないよう閉じる
  const vb = $('#viewBtn'); if(vb){ vb.innerHTML = ic(m ? 'phone' : 'monitor'); vb.title = (m ? 'スマホ表示中' : 'PC表示中') + '（タップで切り替え）'; }
  document.querySelectorAll('#viewSeg button').forEach(b => b.classList.toggle('on', b.dataset.view === LS.get('ttm_view', 'auto')));
  // DOC は起動のごく初期には null の可能性があるため守る
  if(DOC) $('#dlLabel').textContent = m ? '保存' : (DOC.mode === 'thumb' ? 'サムネを保存' : '透過PNGを保存');
  if(!first) setTimeout(() => paintPreview(false), 60);   // レイアウトが変わるとキャンバスの表示サイズも変わるので、CSS が落ち着いてから描き直す
}
// シートの見出し。'layers' 以外は、今選んでいるもの（insCtx）に合わせたインスペクターの名前
function sheetTitle(n){ return n === 'layers' ? 'レイヤー' : (INS_INFO[insCtx()] || [])[1] || '設定'; }
// name = 'layers'（レイヤー）| 'ins'（インスペクター）| null（閉じる）。
// 開いているシートと同じ名前を渡すと閉じる（下バーのボタンが開閉トグルになる）。force=true はトグルせず必ず開く（背景選択からの呼び出し用）。
// PC では常に閉じる扱い（シートは存在しない）
function openSheet(name, force){
  if(!isMobile) name = null;
  if(!force && name && sheet === name) name = null;
  sheet = name;
  document.body.classList.toggle('sheet-open', !!name);
  $('#lpanel').classList.toggle('sheet-on', name === 'layers');
  $('#side').classList.toggle('sheet-on', name === 'ins');
  if(name && name !== 'layers') $('#sheetTitle').textContent = sheetTitle(name);
  document.querySelectorAll('#mbar [data-sheet]').forEach(b => b.classList.toggle('on', b.dataset.sheet === name));
  // シートの開閉アニメーション（CSS 約 0.3 秒）が終わってから描き直す。キャンバスの見える面積が変わるため。340 は CSS の長さに合わせた値
  clearTimeout(openSheet.t); openSheet.t = setTimeout(() => paintPreview(false), 340);
}
// 下バー。'add' はシートではなく追加メニュー（ポップアップ）、'bg' は「レイヤー未選択＝背景の設定」としてインスペクターを開く
$('#mbar').addEventListener('click', e => { const b = e.target.closest('[data-sheet]'); if(!b) return; const n = b.dataset.sheet;
  if(n === 'add'){ openSheet(null); togglePop('addMenu', b); return; }
  if(n === 'bg'){ selectLayer(null); openSheet('ins', true); return; }
  openSheet(n); });
document.addEventListener('click', e => {
  if(e.target.closest('button[data-close-sheet]')){ openSheet(null); return; }
  const vb = e.target.closest('#viewSeg [data-view]');
  if(vb){ LS.set('ttm_view', vb.dataset.view); applyView(true); setTimeout(() => paintPreview(false), 60); toast(vb.dataset.view === 'auto' ? '画面を自動判定に戻しました' : vb.dataset.view === 'pc' ? 'PC表示に固定しました' : 'スマホ表示に固定しました'); }
});
$('#viewBtn').onclick = () => { LS.set('ttm_view', isMobile ? 'pc' : 'mobile'); applyView(true); setTimeout(() => paintPreview(false), 60); toast(isMobile ? 'スマホ表示に切り替えました（ファイルメニュー で「自動判定」に戻せます）' : 'PC表示に切り替えました'); };
/* シートは下へスワイプで閉じる：つまみ（.sheet-grip）をドラッグ中はシート自体を指に追従させ（transition を一時的に切る）、
   70px 以上下げたら閉じる。ほぼ動かさず離した（4px 未満）ときはタップ扱いで閉じる。それ以外は元の位置へ戻る。
   pointer capture で、指がつまみの外に出てもイベントを受け続ける */
document.querySelectorAll('.sheet-grip').forEach(g => {
  let y0 = null;
  g.addEventListener('pointerdown', e => { if(e.target.closest('button')) return; y0 = e.clientY; g.setPointerCapture(e.pointerId); });
  g.addEventListener('pointermove', e => { if(y0 == null) return; const dy = Math.max(0, e.clientY - y0); g.parentElement.style.transform = `translateY(${dy}px)`; g.parentElement.style.transition = 'none'; });
  const up = e => { if(y0 == null) return; const dy = e.clientY - y0; y0 = null; const el = g.parentElement; el.style.transform = ''; el.style.transition = ''; if(dy > 70 || Math.abs(dy) < 4) openSheet(null); };
  g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
});
// 画面の回転・ウィンドウ変更で判定し直す（連続イベントは 150ms にまとめる）。固定設定のときは detectMobile が同じ結果を返すので何も変わらない
window.addEventListener('resize', () => { clearTimeout(applyView.t); applyView.t = setTimeout(() => applyView(false), 150); });

/* キャンバスのタッチ操作：2本指でピンチ（拡大縮小・回転・移動）、長押しでメニュー、ダブルタップで文字編集 */
/* ブロックで囲んでいるのは、pts・pinch などの作業用変数をほかのファイルのグローバルと混ぜないため。
   pts：いま触れている指（pointerId → 画面座標）。マウスは対象外（e.pointerType === 'mouse' は無視し、thumb/events.js が受ける）。
   pinch：ピンチ開始時の「元の値」の控え（i＝開始時の2本指の距離・角度・中心）。動かすたびに「開始時の値＋差分」を計算するので、誤差が積もらない。
   kind：'edit'（編集モード中の部品）／'layer'（選択レイヤー。ロック中は対象外）／'bg'（背景画像）の優先順で決まる */
{
  const tv = $('#tv'), pts = new Map();
  let pinch = null, lp = null, lastTap = {t:0, x:0, y:0};
  // 画面座標 → ドキュメント座標（DOC.w×DOC.h の px）。表示サイズは CSS で縮んでいるため、表示幅に対する比で換算する
  const toDoc = (cx, cy) => { const r = tv.getBoundingClientRect(); return [(cx - r.left) / r.width * DOC.w, (cy - r.top) / r.height * DOC.h]; };
  // 2本指の距離 d・角度 a（ラジアン）・中心 cx,cy。pts の先頭2本だけを見る（3本目以降は無視）
  const pairInfo = () => { const [a, b] = [...pts.values()]; return {d:Math.hypot(b.x - a.x, b.y - a.y), a:Math.atan2(b.y - a.y, b.x - a.x), cx:(a.x + b.x) / 2, cy:(a.y + b.y) / 2}; };
  tv.addEventListener('pointerdown', e => {
    if(DOC.mode !== 'thumb' || e.pointerType === 'mouse') return;
    pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if(pts.size === 2){
      // 1本目で events.js がドラッグを始めている可能性があるので、取り消してピンチに切り替える。
      // stopImmediatePropagation で2本目を events.js に渡さない（capture 段階で登録しているのはこのため）
      e.stopImmediatePropagation(); clearTimeout(lp); drag = null; snapLines = {x:null, y:null};
      const I = pairInfo(), L = selLayer();
      const EP = editPinchStart(I);
      if(EP) pinch = EP;
      else if(L && !L.locked) pinch = {kind:'layer', L, i:I, sc:L.sc, rot:L.rot || 0, x:L.x, y:L.y, snap: isGroup(L) ? xformSnap([L], L.x, L.y) : null};
      else if(DOC.bg.type === 'image' && ASSETS[DOC.bg.asset]) pinch = {kind:'bg', i:I, zoom:DOC.bg.zoom, ox:DOC.bg.ox, oy:DOC.bg.oy};
      return;
    }
    // 長押し：520ms 動かさず1本のまま触れていたら、その位置のいちばん上のレイヤーのメニューを出す
    // （重なり順は後ろ→前なので reverse で前面から探す。回転しているレイヤーは、逆回転した座標で当たり判定する。
    //  グループの子は、そのグループが選択中でない限り対象外）
    const x0 = e.clientX, y0 = e.clientY;
    clearTimeout(lp);
    lp = setTimeout(() => {
      if(pts.size !== 1) return;
      const [dx, dy] = toDoc(x0, y0);
      const L = [...DOC.layers].reverse().find(l => { if(l.hidden || (l.gid && l.id !== DOC.sel)) return false; const d = dims.get(l.id); if(!d) return false; const a = -(l.rot || 0) * PI / 180, X = dx - l.x, Y = dy - l.y; return Math.abs(X * Math.cos(a) - Y * Math.sin(a)) <= d.w / 2 && Math.abs(X * Math.sin(a) + Y * Math.cos(a)) <= d.h / 2; });
      if(!L) return;
      if(drag && drag.L){ drag.L.x = drag.lx; drag.L.y = drag.ly; }   // 長押しの間に少し動いていても、ドラッグ開始時の位置へ戻してからメニューを出す
      drag = null; if(L.id !== DOC.sel && !(DOC.msel || []).includes(L.id)) selectLayer(L.id);
      if(navigator.vibrate) navigator.vibrate(12);
      showMenu(L.id, x0 - 100, y0 + 12);
    }, 520);
    // ダブルタップ：320ms 以内・30px 以内の2回目のタップ。文字レイヤーは文字入力へ、そのほかは編集モード（切り抜き等）へ入る
    const now = Date.now();
    if(now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30){
      const [dx, dy] = toDoc(e.clientX, e.clientY), L = selLayer();
      if(L && L.type === 'text'){ clearTimeout(lp); setTimeout(() => openInspector('txt-text'), 30); }
      else if(L && enterEditAt(L, dx, dy)) clearTimeout(lp);
    }
    lastTap = {t:now, x:e.clientX, y:e.clientY};
  }, true);
  tv.addEventListener('pointermove', e => {
    if(!pts.has(e.pointerId)) return;
    const p0 = pts.get(e.pointerId);
    if(Math.hypot(e.clientX - p0.x, e.clientY - p0.y) > 8) clearTimeout(lp);   // 8px 以上動いたら長押しではなくドラッグ
    pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if(!pinch || pts.size < 2) return;
    e.stopImmediatePropagation();
    // k：開始時からの拡大率。u：画面1pxあたりのドキュメント px（指の移動量を座標に換算する係数）
    const I = pairInfo(), k = I.d / Math.max(1, pinch.i.d), r = tv.getBoundingClientRect(), u = DOC.w / r.width;
    if(pinch.kind === 'edit') editPinch(pinch, k);
    else if(pinch.kind === 'layer'){
      const L = pinch.L;
      if(pinch.snap){   // グループ：中のレイヤーをまとめて拡大縮小・回転・移動
        let dr = (I.a - pinch.i.a) * 180 / PI; if(Math.abs(dr) < 4) dr = 0;
        xformApply(pinch.snap, (I.cx - pinch.i.cx) * u, (I.cy - pinch.i.cy) * u, clamp(k, 0.05, 10), dr);
        syncDocSoon(); livePaint(); return;
      }
      L.sc = Math.round(clamp(pinch.sc * k, 0.05, 10) * 1000) / 1000;
      // 角度は -180〜180 度に正規化（+540 は負の剰余を避けるため）。0/90/180 度の 4 度以内は吸着させ、まっすぐに戻しやすくする。
      // グループの dr も同じ 4 度の吸着
      let rot = pinch.rot + (I.a - pinch.i.a) * 180 / PI; rot = ((rot + 540) % 360) - 180;
      for(const s of [0, 90, -90, 180, -180]) if(Math.abs(rot - s) < 4) rot = s;
      L.rot = Math.round(rot * 10) / 10;
      L.x = Math.round(pinch.x + (I.cx - pinch.i.cx) * u); L.y = Math.round(pinch.y + (I.cy - pinch.i.cy) * u);
    }else{
      // 背景の位置 ox,oy は「キャンバス半分の幅・高さを 1 とした」比率（px ではない）なので、換算してから足す
      const b = DOC.bg; b.zoom = clamp(pinch.zoom * k, 0.2, 4);
      b.ox = pinch.ox + (I.cx - pinch.i.cx) * u / (DOC.w / 2); b.oy = pinch.oy + (I.cy - pinch.i.cy) * u / (DOC.h / 2);
    }
    // 動かしている間は軽い描画（livePaint）だけ。値の確定・履歴への記録は、指を離したとき（下の up の docChanged）にまとめて行う
    syncDocSoon(); livePaint();
  }, true);
  const up = e => {
    if(!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId); clearTimeout(lp);
    if(pinch && pts.size < 2){ pinch = null; drag = null; docChanged(false); }
  };
  tv.addEventListener('pointerup', up, true); tv.addEventListener('pointercancel', up, true);
}
