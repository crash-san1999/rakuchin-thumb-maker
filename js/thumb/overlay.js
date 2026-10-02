/* 楽ちんサムネメーカー：選択枠・ハンドル・編集モードの表示（キャンバスの上に重ねる表示） */
/*
  役割：プレビュー canvas の最前面に、書き出しには入らない補助表示（三分割線・YouTube の再生時間バッジ・背景効果の中心 ◎・
       スナップ線・選択枠・拡大縮小/回転ハンドル）を描く。
  主な公開：drawOverlay（render.js の paintPreview の最後に呼ぶ）/ layerGeom（枠の四隅・回転ハンドル位置。events.js の当たり判定も使う）/
           fxHandleOn / showFxCenterBriefly
  依存：dims（render.js が描画時に記録した各レイヤーの見た目の大きさ）、drawEditOverlay（editmodes.js）、snapLines・tvCss（render.js）。
  座標系：枠・ハンドルの位置は DOC 座標（px）で計算し、描くときに f = プレビュー幅 / DOC.w を掛けてプレビュー canvas の座標に直す。
         dpr は線幅・ハンドルを画面上で同じ見た目の太さにするための係数。
*/
// 選択枠の四隅 pts（左上から時計回り）と回転ハンドル位置 rot を DOC 座標で返す。dims が無い（まだ描かれていない）ときは null。
// ハンドルまでの距離（30px・余白14px）は DOC 座標だと縮小プレビューで極端に小さくなるため px = DOC.w / tvCss（画面1pxあたりのDOC座標）を掛けて画面上の距離で決める
/** @param {Layer} L */
function layerGeom(L){
  const d = dims.get(L.id); if(!d) return null;
  const a = (L.rot || 0) * PI / 180, c = Math.cos(a), s = Math.sin(a);
  const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => { const lx = u * d.w / 2, ly = v * d.h / 2; return [L.x + lx * c - ly * s, L.y + lx * s + ly * c]; });
  const px = DOC.w / tvCss, off = d.h / 2 + 30 * px, m = 14 * px;
  let rot = [L.x + off * s, L.y - off * c];
  // 回転ハンドルは通常レイヤーの「上側」だが、キャンバスの端からはみ出して掴めなくなるときは反対側へ、それも無理なら端に寄せる
  const inside = q => q[0] > m && q[0] < DOC.w - m && q[1] > m && q[1] < DOC.h - m;
  if(!inside(rot)){ const alt = [L.x - off * s, L.y + off * c]; rot = inside(alt) ? alt : [clamp(rot[0], m, DOC.w - m), clamp(rot[1], m, DOC.h - m)]; }
  return {pts, d, a, rot};
}
// 背景効果の中心 ◎ を出す条件：DOC.guides.fx がオン、かつ中心を使う効果（ズームブラー・周辺減光）が有効、
// かつレイヤー未選択か、中心スライダー操作中（fxEditing）。レイヤー操作の邪魔をしないため
const fxHandleOn = () => DOC.guides.fx && (((DOC.bg.type === 'image' && DOC.bg.zb.on) || DOC.bg.vignette > 0) && (!DOC.sel || fxEditing));
let fxEditing = false, fxEditT = null;
// 中心のスライダーを動かしている間だけ、背景効果の中心 ◎ を表示する
function showFxCenterBriefly(){ fxEditing = true; clearTimeout(fxEditT); fxEditT = setTimeout(() => { fxEditing = false; paintPreview(false); }, 1500); }
// ヘッダー画像のセーフエリア：どの端末でも見える中央の枠の外を暗くし、端末ごとの見える範囲を枠で示す（プレビューだけ。書き出しには入らない）
function drawSafeArea(ctx, W, H, dpr, f){
  const sp = HEADER_SPECS[DOC.hdr]; if(!sp) return;
  const box = a => [(W - a.w * f) / 2, (H - a.h * f) / 2, a.w * f, a.h * f];
  const main = sp.areas.find(a => a.main), [mx, my, mw, mh] = box(main);
  ctx.save();
  ctx.fillStyle = 'rgba(20,16,40,.45)'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(mx, my, mw, mh); ctx.fill('evenodd');   // 外側を暗く
  ctx.font = `800 ${11 * dpr}px "M PLUS Rounded 1c", sans-serif`; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  sp.areas.forEach(a => {
    const [x, y, w, h] = box(a), isMain = !!a.main;
    ctx.setLineDash(isMain ? [] : [6 * dpr, 5 * dpr]); ctx.lineWidth = (isMain ? 2.5 : 1.5) * dpr; ctx.strokeStyle = isMain ? '#5cf08a' : 'rgba(255,255,255,.85)';
    ctx.strokeRect(x, y, w, h);
    // ラベルは枠の左上の内側に、白フチ付きで（背景が何色でも読める）
    const lx = x + 6 * dpr, ly = y + (isMain ? 5 : 5 + 14 * sp.areas.indexOf(a)) * dpr;
    if(w > 90 * dpr){ ctx.setLineDash([]); ctx.lineWidth = 3 * dpr; ctx.strokeStyle = '#1f1b2d'; ctx.strokeText(a.label, lx, ly); ctx.fillStyle = isMain ? '#5cf08a' : '#fff'; ctx.fillText(a.label, lx, ly); }
  });
  ctx.restore();
}
// 描く順：三分割線 → 再生時間バッジ → 背景効果の中心 → スナップ線 → 編集モードの表示 or 選択枠。
// 編集モード中（フレーム調整・ブラシ・マス調整）はそちらの表示だけにして、通常の選択枠は出さない
function drawOverlay(ctx, W, H, dpr){
  const f = W / DOC.w;
  ctx.save();
  if(DOC.guides.thirds){
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = dpr; ctx.setLineDash([5 * dpr, 5 * dpr]); ctx.beginPath();
    for(const t of [1 / 3, 2 / 3]){ ctx.moveTo(W * t, 0); ctx.lineTo(W * t, H); ctx.moveTo(0, H * t); ctx.lineTo(W, H * t); }
    ctx.stroke(); ctx.setLineDash([]);
  }
  if(DOC.hdr && DOC.guides.safe) drawSafeArea(ctx, W, H, dpr, f);
  if(DOC.guides.badge && !DOC.hdr){   // ヘッダー画像には再生時間は出ない
    // YouTube の動画一覧では右下に再生時間が重なるので、文字を置かない目安として表示する。
    // 大きさは 16:9 換算の u を基準にして、縦長・正方形キャンバスでも同じ比率に見えるようにしている
    const u = Math.min(W, H * 16 / 9), bw = u * 0.095, bh = u * 9 / 16 * 0.08, m = u * 0.012, x = W - m - bw, y = H - m - bh;
    ctx.fillStyle = 'rgba(0,0,0,.8)'; ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 5 * dpr); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `600 ${bh * 0.55}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('12:34', x + bw / 2, y + bh / 2 + dpr);
  }
  if(fxHandleOn()){
    const hx = DOC.bg.fcx * W, hy = DOC.bg.fcy * H, r = 13 * dpr;
    ctx.save(); ctx.lineWidth = 2.5 * dpr;
    ctx.strokeStyle = '#1f1b2d'; ctx.fillStyle = 'rgba(255,184,0,.9)';
    ctx.beginPath(); ctx.arc(hx, hy, r, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(hx, hy, r * 0.42, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx - r * 1.9, hy); ctx.lineTo(hx - r * 1.15, hy); ctx.moveTo(hx + r * 1.15, hy); ctx.lineTo(hx + r * 1.9, hy);
    ctx.moveTo(hx, hy - r * 1.9); ctx.lineTo(hx, hy - r * 1.15); ctx.moveTo(hx, hy + r * 1.15); ctx.lineTo(hx, hy + r * 1.9); ctx.stroke();
    ctx.font = `800 ${11 * dpr}px "M PLUS Rounded 1c", sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3 * dpr; ctx.strokeStyle = '#fff'; ctx.strokeText('背景効果の中心', hx + r * 1.6, hy - r * 1.4); ctx.fillStyle = '#1f1b2d'; ctx.fillText('背景効果の中心', hx + r * 1.6, hy - r * 1.4);
    ctx.restore();
  }
  // スナップ線は DOC 座標で保持している（events.js のドラッグ中だけ値が入る）。描画時に f を掛けてプレビュー座標へ
  if(snapLines.x != null || snapLines.y != null){
    ctx.strokeStyle = '#ff4f8b'; ctx.lineWidth = dpr; ctx.beginPath();
    if(snapLines.x != null){ ctx.moveTo(snapLines.x * f, 0); ctx.lineTo(snapLines.x * f, H); }
    if(snapLines.y != null){ ctx.moveTo(0, snapLines.y * f); ctx.lineTo(W, snapLines.y * f); }
    ctx.stroke();
  }
  if(drawEditOverlay(ctx, W, H, dpr)){ ctx.restore(); return; }
  // outline：レイヤー1枚の回転込みの輪郭を点線などでなぞる（枠だけ。ハンドルは付けない）
  const outline = (l, col, dash) => { const q = l && !l.hidden && layerGeom(l); if(!q) return; ctx.strokeStyle = col; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash(dash.map(v => v * dpr)); ctx.beginPath(); q.pts.forEach(([x, y], i) => i ? ctx.lineTo(x * f, y * f) : ctx.moveTo(x * f, y * f)); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]); };
  if((DOC.msel || []).length >= 2){   // 複数選択：選んだレイヤーそれぞれに枠（動かすだけ。まとめて拡大縮小するにはグループにする）
    DOC.msel.forEach(id => outline(layerById(id), '#ff4f8b', [6, 4]));
    ctx.restore(); return;
  }
  const L = selLayer(), g = L && !L.hidden && layerGeom(L);
  if(L && isGroup(L)) groupKids(L).forEach(k => outline(k, 'rgba(255,79,139,.55)', [3, 3]));   // グループ：中身の位置を薄く表示
  // ロック中は黄色の点線枠だけ（ハンドルなし＝動かせないことを示す）。通常は枠＋回転ハンドルへの線＋四隅の拡大縮小ハンドル
  // （ハンドルの当たり判定は events.js の handleAt。半径はここの見た目より少し大きく取ってある）
  if(g && L.locked){
    ctx.strokeStyle = '#ffb800'; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([6 * dpr, 5 * dpr]); ctx.beginPath();
    g.pts.forEach(([x, y], i) => i ? ctx.lineTo(x * f, y * f) : ctx.moveTo(x * f, y * f)); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
  }else if(g){
    ctx.strokeStyle = '#ff4f8b'; ctx.lineWidth = 1.5 * dpr; ctx.beginPath();
    g.pts.forEach(([x, y], i) => i ? ctx.lineTo(x * f, y * f) : ctx.moveTo(x * f, y * f)); ctx.closePath(); ctx.stroke();
    const tx = (g.pts[0][0] + g.pts[1][0]) / 2, ty = (g.pts[0][1] + g.pts[1][1]) / 2;
    ctx.beginPath(); ctx.moveTo(tx * f, ty * f); ctx.lineTo(g.rot[0] * f, g.rot[1] * f); ctx.stroke();
    const hs = 4.5 * dpr; ctx.fillStyle = '#fff';
    g.pts.forEach(([x, y]) => { ctx.beginPath(); ctx.rect(x * f - hs, y * f - hs, hs * 2, hs * 2); ctx.fill(); ctx.stroke(); });
    ctx.beginPath(); ctx.arc(g.rot[0] * f, g.rot[1] * f, 6 * dpr, 0, 7); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}
