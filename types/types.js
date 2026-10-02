/* 楽ちんサムネメーカー：型定義（JSDoc の @typedef だけを置くファイル）
   ・実行されない／配信されない（index.html から読み込まない。js/ の外に置くのは bump-version.sh が js/ 配下をハッシュするため）。
   ・目的は `npm run typecheck`（tsc --checkJs）で、プロパティ名の取り違えや undefined 参照をコードを動かす前に見つけること。
   ・既存のファクトリ関数（LAYER_BASE・IMAGE_BASE・DEFAULT など）から ReturnType / typeof で型を引いているので、
     ファクトリにキーを足せば型にも自動で反映される（二重管理にならない）。ファクトリで表せない所（type・union・nullable）だけ手で書く。
   ・import / export を書かないこと。書くとファイルがモジュール扱いになり、typedef がグローバルに見えなくなる。 */

/** 描画の合成モード（Canvas の globalCompositeOperation） @typedef {'source-over'|'multiply'|'screen'|'overlay'|'darken'|'lighten'|'color-dodge'|'color-burn'|'hard-light'|'soft-light'|'difference'|'exclusion'|'hue'|'saturation'|'color'|'luminosity'} BlendMode */

/** 文字スタイル（S と text レイヤーの style）。DEFAULT そのもの */
/** @typedef {typeof DEFAULT} TextStyle */

/** 全レイヤー共通：位置は DOC 座標でレイヤーの中心。gid はグループ所属、label はユーザーが付けた名前
 * @typedef {Omit<ReturnType<typeof LAYER_BASE>, 'blend'> & {id: string, blend: string, gid?: string, label?: string}} LayerBase */

/* ---- 種類ごとに追加で持つ項目（共通項目 LayerBase は含まない） ---- */
/** @typedef {{style: TextStyle}} TextExtra */
/** 画像レイヤー。asset は ASSETS / IndexedDB の id（本体は DOC に入れない）
 * 影の x・c・sp は画像だけが持つ（分割フレーム・グループの影は on・blur・y・a のみ）ので任意にしている
 * @typedef {Omit<ReturnType<typeof IMAGE_BASE>, 'shadow'> & {asset: string|null, name?: string, shadow: {on: boolean, blur: number, y: number, a: number, x?: number, c?: string, sp?: number}}} ImageExtra */
/** 分割フレームの 1 マス */
/** @typedef {ReturnType<typeof CELL_BASE>} CollageCell */
/** @typedef {Omit<ReturnType<typeof COLLAGE_BASE>, 'type'|keyof LayerBase|'tstyle'|'cells'> & {tstyle: TextStyle|null, cells: CollageCell[]}} CollageExtra */
/** @typedef {Omit<ReturnType<typeof GROUP_BASE>, 'type'|'label'>} GroupExtra */
/** 動的エフェクト。kind は FX_DEF のキー、p は種類ごとのパラメータ（種類によってキーが違う）
 * auto は、ワンクリック背景エフェクトが自動で作ったレイヤーの目印（切り替え時に入れ替える対象）
 * @typedef {{kind: string, p: Record<string, any>, auto?: boolean}} FxExtra */

/** 種類を絞り込んだ厳密な型（必要な所で使う） */
/** @typedef {LayerBase & {type: 'text'} & TextExtra} TextLayer */
/** @typedef {LayerBase & {type: 'image'} & ImageExtra} ImageLayer */
/** @typedef {LayerBase & {type: 'collage'} & CollageExtra} CollageLayer */
/** @typedef {LayerBase & {type: 'group'} & GroupExtra} GroupLayer */
/** @typedef {LayerBase & {type: 'fx'} & FxExtra} FxLayer */

/** DOC.layers の要素（コードが実際に扱う型）。
 * このアプリは `L.cells ? … : …`・`l.type === 'image' ? l.asset : …` のように、種類ごとの項目を存在確認で使い分けている。
 * そこで「どの種類かの既知の項目」はすべて任意項目（?）として許可し、未知の名前（タイプミス）だけを検出する。
 * type は文字列（'text' | 'image' | 'collage' | 'group' | 'fx'）。厳密に絞りたい所は TextLayer などを使う。
 * @typedef {LayerBase & {type: string} & Partial<TextExtra> & Partial<ImageExtra> & Partial<CollageExtra> & Partial<GroupExtra> & Partial<FxExtra>} Layer */

/** 背景・仕上げ・色効果 */
/** @typedef {ReturnType<typeof DOC_BASE>['bg']} DocBg */
/** @typedef {ReturnType<typeof FIN_BASE>} DocFin */
/** @typedef {ReturnType<typeof CELL_FX_BASE>} CellFx */
/** @typedef {ReturnType<typeof FRAME_BASE>} Frame */
/** @typedef {ReturnType<typeof KEY_BASE>} ChromaKey */

/** サムネの保存データ（localStorage 'ttm_doc'・プロジェクト JSON・取り消し履歴）。normalizeDoc が唯一の入口
 * @typedef {Omit<ReturnType<typeof DOC_BASE>, 'layers'|'sel'|'textSel'|'msel'|'mode'|'fmt'|'hdr'> & {
 *   mode: string, fmt: string, hdr: string,
 *   layers: Layer[], sel: string|null, textSel: string|null, msel: string[]}} Doc */

/** @typedef {{x: number, y: number, w: number, h: number}} Rect */

/** 編集モード（フレーム調整・背景透過のブラシ・マスの調整）の定義。editmodes.js の EDIT_MODES の各値。
 * x,y は DOC 座標、d は down が返したドラッグ中の状態、st は pinchStart が返した開始時の値、k は拡大率
 * @typedef {{
 *   btn: string, label: string, hint: () => string, banner: (L: Layer) => string,
 *   ok: (L: Layer) => boolean,
 *   enter?: (L: Layer, x: number, y: number) => void,
 *   down: (L: Layer, x: number, y: number) => any,
 *   move?: (L: Layer, x: number, y: number, d: any) => void,
 *   up?: (L: Layer, d: any) => void,
 *   zoom?: (L: Layer, k: number, x: number, y: number, e: any) => any,
 *   pinchStart?: (L: Layer) => any,
 *   pinch?: (L: Layer, st: any, k: number) => void,
 *   overlay?: (ctx: CanvasRenderingContext2D, L: Layer, f: number, dpr: number) => void}} EditMode */
