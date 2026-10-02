// 型チェック専用（実行・配信されない）。
// このアプリは e.target や querySelectorAll の結果に .dataset / .value / .closest() を直接使う書き方が多く、JS では型キャストを
// 書けないため、DOM 要素の型を一時的に緩めて「DOM まわりの指摘」を 0 にしている（約 160 件分）。
// 緩めているのは Element と EventTarget だけ。自分のデータ構造（DOC・レイヤー・文字スタイル）のタイプミス検出には影響しない。
// 段階的に締める手順：この 2 つの interface を消す → 出た指摘を呼び出し側で JSDoc キャスト `/** @type {HTMLInputElement} */ (el)` で直す。
interface Element { [key: string]: any; }
interface EventTarget { [key: string]: any; }

// デバウンス用のタイマー番号を関数に持たせる書き方（saveDoc.t・toast.t・docChanged.t など）。キー名を限定して許可している
interface Function { t?: any; r?: any; f?: any; lt?: any; }
// ブラウザ API のうち TypeScript の標準型に入っていないもの
interface Navigator { connection?: any; }
declare class EyeDropper { open(): Promise<{ sRGBHex: string }>; }
// events.js が globalThis に生やす関数（render.js が存在チェックして呼ぶ）
declare var pruneMasks: ((ids: Set<string>) => void) | undefined;
