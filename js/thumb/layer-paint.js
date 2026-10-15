/* 楽ちんサムネメーカー：レイヤーを描くときの共通処理（描画キャッシュ・置き方） */
/*
  主な公開：cacheByScale / cacheBySize（描画キャッシュの再利用判定と作り直し）／ layerComposite / poseLayer（レイヤーの置き方）
  依存：PI（core.js）だけ。関数の中からしか使わないので、読み込み順は frames.js より前ならどこでもよい。
  呼び出し元：render.js（textCanvas・imageCanvas・drawLayer）、frames.js（framedCanvas）、collage-draw.js（drawCollage）、
             sched.js（drawSched）、fx-draw.js（drawFx）、group.js（drawGroup）。

  描画キャッシュ（cache）は Map<レイヤーid, {sk, k, c}>。
    sk … 見た目を決める値をすべて並べた印（呼び出し側が作る）。印に入れ忘れた値は、変えても画面が変わらない
          （tests/test_cache_consistency.py が全レイヤーの全項目で確かめる）。
    k  … そのとき描いた倍率。c … 描いた canvas。
  判定のしかたは 2 種類：
    cacheByScale：倍率で判定（文字・画像・切り抜きフレーム）。sk が同じで、操作中(live)なら倍率がずれていても使い回し、
                  確定時は倍率のずれが 2% 未満なら使い回す。呼び出し側は need / e.k で拡大縮小して貼る。
    cacheBySize ：ピクセル寸法で判定（分割フレーム・週間予定表）。操作中は幅のずれが半分未満なら使い回し、
                  確定時は幅・高さが完全に一致するときだけ使う。
  make() は作り直すときだけ呼ばれ、描いた canvas を返す。
*/
/** 倍率で判定する描画キャッシュ。@returns {{sk:string, k:number, c:HTMLCanvasElement}} */
function cacheByScale(cache, id, sk, need, live, make){
  const e = cache.get(id);
  if(e && e.sk === sk && (live || Math.abs(e.k - need) / need < 0.02)) return e;
  const n = {sk, k:need, c:make()}; cache.set(id, n);
  return n;
}
/** ピクセル寸法（W×H）で判定する描画キャッシュ。k を渡したときだけ記録する（分割フレームは k を使う）。 */
function cacheBySize(cache, id, sk, W, H, live, make, k){
  const e = cache.get(id);
  if(e && e.sk === sk && (live ? Math.abs(e.c.width - W) / W < 0.5 : e.c.width === W && e.c.height === H)) return e;
  const n = k === undefined ? {sk, c:make()} : {sk, k, c:make()}; cache.set(id, n);
  return n;
}
// レイヤーの不透明度と描画モードを ctx に設定する（呼ぶ側で ctx.save() / restore() する）
/** @param {Layer} L */
function layerComposite(ctx, L){
  ctx.globalAlpha = L.op ?? 1; ctx.globalCompositeOperation = L.blend || 'source-over';
}
// レイヤーの置き方：不透明度・描画モードを設定し、中心（DOC 座標 × f）へ移動して回転する。拡大縮小は呼ぶ側で行う
/** @param {Layer} L */
function poseLayer(ctx, L, f){
  layerComposite(ctx, L);
  ctx.translate(L.x * f, L.y * f); ctx.rotate((L.rot || 0) * PI / 180);
}
