/* 楽ちんサムネメーカー：レイヤーの種類の登録表 */
/*
  役割：レイヤーの種類（text / image / collage / sched / fx / group）ごとの「振る舞い」を 1 か所に集める表。
       種類ごとの処理は、それぞれの種類のファイルが defineLayerKind で登録する（中身はそのファイルにある）：
         text … render.js        image … assets.js（描画は render.js の drawLayer）
         collage     … collage.js        sched … sched.js        fx … fx.js        group … group.js
       ほかのファイルは L.type で枝分かれせず、kindOf(L).〇〇 を呼ぶ。新しい種類を足すときは、その種類のファイルで登録すれば、
       保存データの読み込み・描画・レイヤーパネル・メニュー・フォントの先読み・画像の掃除・キャンバスのサイズ変更に自動で乗る。
       （「選んでいるのが分割フレームのときだけ出すパネル」のように、特定の種類かを確かめるだけの判定はこの表に入れない）
  主な公開：defineLayerKind / kindOf / LAYER_KINDS / ensureLayerFonts
  依存：hasKey（core.js）。読み込みは layer-paint.js の次、各種類のファイルより前（登録はそれらの読み込み時に行う）。

  登録する項目（必須は normalize と draw。ほかは省略すると既定の振る舞い）：
    normalize(L)                    保存データ 1 枚を、その種類の既定値と混ぜ直して返す（normalizeDoc から）
    keep(L)                         false なら読み込み時に捨てる（未対応の動的エフェクトの種類など）。既定は残す
    sanitize(L)                     読み込み時に、その種類だけが持つ値を安全な範囲・色へそろえる（sanitizeDocRefs から）
    draw(ctx, L, f, live, cache)    1 枚を描く（drawOne から。f＝倍率、live＝操作中、cache＝描画キャッシュ）
    fonts(L)                        描く前に読み込んでおくフォント（Promise）。プレビューと書き出しの両方で待つ
    assets(L)                       使っている画像アセットの id の配列（usedAssets：保存・IndexedDB の掃除）。既定は []
    name(L)                         レイヤーの既定の名前（ユーザーが名前を付けていないとき）
    sub(L)                          レイヤーパネルの 2 行目（種類などの説明）。HTML として入るので、外から来た文字は escapeHtml を通す
    thumb(L)                        レイヤーパネルのサムネの HTML。null なら <canvas> に描画キャッシュの絵を縮小して入れる。既定は null
    menu(L)                         右クリック／長押しメニューに足す項目（menuItem の配列）。既定は []
    resize(L, rx, ry, s)            キャンバスの大きさを変えて中身を置き直すとき、大きさを合わせる（位置は呼び出し側が直す）。
                                    rx・ry は縦横の拡大率、s はその小さいほう。既定は sc を s 倍
  未知の種類（新しい版で作った保存データを古い版で開いたなど）は、これまでどおり画像として扱う。
*/
/** @typedef {{normalize: (L: any) => Layer, draw: (ctx: CanvasRenderingContext2D, L: Layer, f: number, live?: boolean, cache?: Map<string, any>) => void,
 *   keep?: (L: any) => boolean, sanitize?: (L: Layer) => void, fonts?: (L: Layer) => Promise<void>|void, assets?: (L: Layer) => (string|null)[],
 *   name: (L: Layer) => string, sub: (L: Layer) => string, thumb?: (L: Layer) => string|null, menu?: (L: Layer) => string[],
 *   resize?: (L: Layer, rx: number, ry: number, s: number) => void}} LayerKind */
/** @type {Record<string, LayerKind>} */
const LAYER_KINDS = {};
// 既定の振る舞い（登録で省略した項目）
const LAYER_KIND_DEFAULT = {
  keep: () => true, sanitize: () => {}, fonts: () => {}, assets: () => [], thumb: () => null, menu: () => [],
  resize: (L, rx, ry, s) => { L.sc = Math.round(clamp(L.sc * s, 0.02, 20) * 1000) / 1000; },
};
/** 種類を登録する。同じ名前を 2 回登録するのは間違いなので例外にする（後から読み込んだ方が黙って勝つのを防ぐ） */
function defineLayerKind(type, spec){
  if(hasKey(LAYER_KINDS, type)) throw new Error(`レイヤーの種類「${type}」が二重に登録されています`);
  for(const k of ['normalize', 'draw', 'name', 'sub']) if(typeof spec[k] !== 'function') throw new Error(`レイヤーの種類「${type}」に ${k} がありません`);
  LAYER_KINDS[type] = Object.assign({}, LAYER_KIND_DEFAULT, spec);
}
/** レイヤー（または保存データ 1 枚）の種類の振る舞い。表に無い種類は画像として扱う
 * @returns {LayerKind} */
function kindOf(L){ return hasKey(LAYER_KINDS, L && L.type) ? LAYER_KINDS[L.type] : LAYER_KINDS.image; }
// 描く前に、すべてのレイヤーが使うフォントを順に読み込む（プレビューの drawThumb と書き出しの thumbBlob が待つ）
async function ensureLayerFonts(){
  for(const L of DOC.layers) await kindOf(L).fonts(L);
}
