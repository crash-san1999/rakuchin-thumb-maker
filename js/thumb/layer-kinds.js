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
/** 種類の振る舞い。T はその種類のレイヤーの型（登録した関数には、その種類のレイヤーだけが渡る）
 * @template {Layer} [T=Layer]
 * @typedef {{normalize: (L: any) => T, draw: (ctx: CanvasRenderingContext2D, L: T, f: number, live?: boolean, cache?: Map<string, any>) => void,
 *   keep: (L: any) => boolean, sanitize: (L: T) => void, fonts: (L: T) => Promise<void>|void, assets: (L: T) => (string|null)[],
 *   name: (L: T) => string, sub: (L: T) => string, thumb: (L: T) => string|null, menu: (L: T) => string[],
 *   resize: (L: T, rx: number, ry: number, s: number) => void}} LayerKind */
/** 登録するときに書く項目（必須は normalize・draw・name・sub。ほかは省略すると既定の振る舞い）
 * @template {Layer} T
 * @typedef {Pick<LayerKind<T>, 'normalize'|'draw'|'name'|'sub'> & Partial<LayerKind<T>>} LayerKindSpec */
/** @type {Record<string, LayerKind<Layer>>} */
const LAYER_KINDS = {};
// 既定の振る舞い（登録で省略した項目）
const LAYER_KIND_DEFAULT = {
  keep: () => true, sanitize: () => {}, fonts: () => {}, assets: () => [], thumb: () => null, menu: () => [],
  resize: (L, rx, ry, s) => { L.sc = Math.round(clamp(L.sc * s, 0.02, 20) * 1000) / 1000; },
};
/** 種類を登録する。同じ名前を 2 回登録するのは間違いなので例外にする（後から読み込んだ方が黙って勝つのを防ぐ）。
 * spec の関数が受け取る L は、その種類のレイヤーの型（例：'collage' なら CollageLayer）になる
 * @template {Layer['type']} K @param {K} type @param {LayerKindSpec<Extract<Layer, {type: K}>>} spec */
function defineLayerKind(type, spec){
  if(hasKey(LAYER_KINDS, type)) throw new Error(`レイヤーの種類「${type}」が二重に登録されています`);
  for(const k of ['normalize', 'draw', 'name', 'sub']) if(typeof spec[k] !== 'function') throw new Error(`レイヤーの種類「${type}」に ${k} がありません`);
  // 表には「どの種類でも受け取る」型で入れる。表を引くのは kindOf だけで、kindOf(L) は L の種類の登録を返すので、関数にはその種類のレイヤーだけが渡る
  // （未知の種類は画像の登録を返すが、読み込み時に画像として整えてあるので、画像の項目は揃っている）
  LAYER_KINDS[type] = /** @type {LayerKind<any>} */ (Object.assign({}, LAYER_KIND_DEFAULT, spec));
}
/** レイヤー（または保存データ 1 枚）の種類の振る舞い。表に無い種類は画像として扱う
 * @param {any} L @returns {LayerKind<any>} */
function kindOf(L){ return hasKey(LAYER_KINDS, L && L.type) ? LAYER_KINDS[L.type] : LAYER_KINDS.image; }
// 描く前に、すべてのレイヤーが使うフォントを順に読み込む（プレビューの drawThumb と書き出しの thumbBlob が待つ）
async function ensureLayerFonts(){
  for(const L of DOC.layers) await kindOf(L).fonts(L);
}
