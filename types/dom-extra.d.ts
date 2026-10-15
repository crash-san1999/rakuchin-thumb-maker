// 型チェック専用（実行・配信されない）。DOM の型を、このアプリの実際の使い方に合わせて正確にする補い。
// 以前は Element と EventTarget を丸ごと any 扱いに緩めていたが、それをやめて次の形にした：
//   ・$ / $$ / tgt / inputOf（core.js）が、querySelector・querySelectorAll・イベントの対象を HTMLElement（入力欄なら HTMLInputElement）として返す
//   ・closest() は、文字列で探したとき HTMLElement を返す（下の重ね合わせ。このアプリの画面はすべて HTML の要素で、SVG の中は探さない）
//   ・入力欄・選択肢・canvas としての値（value・checked・options・getContext など）を使う所は、呼び出し側で
//     `/** @type {HTMLInputElement} */ (el)` のように、その要素の型を明示する
interface Element {
  closest<E extends HTMLElement = HTMLElement>(selectors: string): E | null;
}


// デバウンス用のタイマー番号を関数に持たせる書き方（saveDoc.t・toast.t・docChanged.t など）。キー名を限定して許可している
interface Function { t?: any; r?: any; f?: any; lt?: any; }
// ブラウザ API のうち TypeScript の標準型に入っていないもの
interface Navigator { connection?: any; }
declare class EyeDropper { open(): Promise<{ sRGBHex: string }>; }
// PC に入っているフォントの一覧（Local Font Access API。Chrome 系だけ）。使う前に有無を確かめる（fonts.js）
interface Window { queryLocalFonts?: () => Promise<Array<{family: string, fullName: string, postscriptName: string, style: string}>>; }
// アプリとして追加するときの案内（Chrome 系だけ。標準の型に入っていない）
interface BeforeInstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{outcome: string}>; }
