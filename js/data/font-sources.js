/* 楽ちんサムネメーカー：フォントの一覧データ（厳選リスト・用途の説明・Google 以外の配布元） */
/*
  データだけを持つ（読み込み処理は fonts.js）。フォントを足す・用途の説明を直すときはこのファイルだけを触ればよい。
  読み込み順：data/font-list.js の後、fonts.js の前。中身の使い方（buildBaseFonts で一覧にまとめる等）は fonts.js の冒頭を参照。
  公開：FEATURED_JP・LATIN（厳選）/ USAGE_JP・USE_KEYS（用途）/ CAT_MAP・GC・GC_USE・JP_CAT_OVR（分類の対応）/
       EA_FONTS・FS_FONTS・GH_FONTS（GH）・NPM_FONTS（NPM）・SELF_FONTS（Google 以外の配布元）
*/
// 太さの全段階（Google の可変フォント向けの既定）
const W9 = '100,200,300,400,500,600,700,800,900';
// 先頭に出す日本語フォントの厳選リスト。[family, 分類, 太さ]。
// 実際の太さは Google 側の一覧（GF_JP）にあればそちらを優先する（buildBaseFonts）ので、ここは一覧にない場合の保険
const FEATURED_JP = [
  ['Noto Sans JP','ゴシック',W9],['M PLUS 1p','ゴシック','100,300,400,500,700,800,900'],
  ['M PLUS Rounded 1c','ゴシック','100,300,400,500,700,800,900'],['M PLUS 1','ゴシック',W9],['M PLUS 2','ゴシック',W9],
  ['Zen Maru Gothic','ゴシック','300,400,500,700,900'],['Zen Kaku Gothic New','ゴシック','300,400,500,700,900'],
  ['Zen Kaku Gothic Antique','ゴシック','300,400,500,700,900'],['Murecho','ゴシック',W9],
  ['IBM Plex Sans JP','ゴシック','100,200,300,400,500,600,700'],['BIZ UDPGothic','ゴシック','400,700'],
  ['Kosugi','ゴシック','400'],['Kosugi Maru','ゴシック','400'],['Sawarabi Gothic','ゴシック','400'],
  ['Kiwi Maru','ゴシック','300,400,500'],['Tsukimi Rounded','ゴシック','300,400,500,600,700'],
  ['Noto Serif JP','明朝','200,300,400,500,600,700,800,900'],['Shippori Mincho','明朝','400,500,600,700,800'],
  ['Shippori Mincho B1','明朝','400,500,600,700,800'],['Zen Old Mincho','明朝','400,500,600,700,900'],
  ['Sawarabi Mincho','明朝','400'],['BIZ UDPMincho','明朝','400,700'],['Hina Mincho','明朝','400'],
  ['Kaisei Decol','明朝','400,500,700'],['Kaisei Opti','明朝','400,500,700'],['Kaisei Tokumin','明朝','400,500,700,800'],
  ['Kaisei HarunoUmi','明朝','400,500,700'],['New Tegomin','明朝','400'],['Zen Antique','明朝','400'],
  ['Zen Antique Soft','明朝','400'],['Shippori Antique','明朝','400'],['Shippori Antique B1','明朝','400'],
  ['Yuji Syuku','明朝','400'],['Yuji Boku','明朝','400'],['Yuji Mai','明朝','400'],
  ['Dela Gothic One','デザイン','400'],['Reggae One','デザイン','400'],['RocknRoll One','デザイン','400'],
  ['Rampart One','デザイン','400'],['Train One','デザイン','400'],['Stick','デザイン','400'],
  ['DotGothic16','デザイン','400'],['Potta One','デザイン','400'],['Mochiy Pop One','デザイン','400'],
  ['Mochiy Pop P One','デザイン','400'],['Darumadrop One','デザイン','400'],['Chokokutai','デザイン','400'],
  ['Cherry Bomb One','デザイン','400'],['Palette Mosaic','デザイン','400'],
  ['Yusei Magic','手書き','400'],['Hachi Maru Pop','手書き','400'],['Yomogi','手書き','400'],
  ['Klee One','手書き','400,600'],['Zen Kurenaido','手書き','400'],['Slackside One','手書き','400'],
].map(([family, cat, w]) => ({family, cat, weights: w.split(',').map(Number), src:'google'}));

// 欧文の厳選リスト。[family, 用途, 太さ]。ここに無い欧文は GF_LATIN から「more」として検索・欧文タブでだけ出す（一覧が数千件になるため）
const LATIN = [
  ['Bebas Neue','ゲーム・テック・モダン（大文字だけの細長い書体）','400'],
  ['Anton','スポーツ・ゲーム・インパクト（極太）','400'],
  ['Bangers','コミック・ゲーム・ポップ','400'],
  ['Jaro','スポーツ・インパクト・イベント','400'],
  ['Stint Ultra Expanded','スポーツ・インパクト（横に広い）','400'],
  ['Montserrat','万能・解説・ライフスタイル',W9],
  ['Poppins','解説・やさしい・教育',W9],
  ['Inter','解説・読みやすい・テック',W9],
  ['Lexend','解説・読みやすい',W9],
  ['Rethink Sans','解説・モダン','400,500,600,700,800'],
  ['Archivo','ニュース・解説・スポーツ',W9],
  ['Albert Sans','テック・モダン',W9],
  ['Geist','テック・モダン',W9],
  ['Unbounded','テック・インパクト・モダン','200,300,400,500,600,700,800,900'],
  ['IBM Plex Mono','テック・プログラミング（等幅）','100,200,300,400,500,600,700'],
  ['Rubik','ポップ・やさしい',  '300,400,500,600,700,800,900'],
  ['Nunito','かわいい・やさしい（丸み）','200,300,400,500,600,700,800,900'],
  ['Quicksand','かわいい・ポップ・やさしい','300,400,500,600,700'],
  ['Concert One','レトロ・ポップ（丸み）','400'],
  ['Holtwood One SC','レトロ・ビンテージ・ポスター','400'],
  ['Montagu Slab','レトロ・ビンテージ・物語','100,200,300,400,500,600,700'],
  ['Raleway','高級・エレガント・ミニマル',W9],
  ['Instrument Serif','高級・エレガント・エモ','400'],
  ['Newsreader','解説・ニュース・物語','200,300,400,500,600,700,800'],
].map(([family, usage, w]) => ({family, cat:'欧文', usage, weights:w.split(',').map(Number), src:'google'}));
// フォント名 → 用途の説明（一覧のタグ表示と、検索・用途絞り込みの対象）。日本語フォント用。後ろの Object.assign で追加分を足している
const USAGE_JP = {
  'Dela Gothic One':'ゲーム・インパクト（極太）', 'Noto Sans JP':'解説・読みやすい・万能', 'M PLUS 1p':'解説・読みやすい',
  'M PLUS Rounded 1c':'かわいい・やさしい（丸ゴ）', 'Zen Maru Gothic':'かわいい・やさしい（丸ゴ）', 'Kosugi Maru':'やさしい・かわいい',
  'Zen Kaku Gothic New':'解説・クール', 'BIZ UDPGothic':'解説・読みやすい', 'Murecho':'クール・モダン', 'Kiwi Maru':'やさしい・かわいい',
  'Mochiy Pop One':'かわいい・ポップ', 'Mochiy Pop P One':'かわいい・ポップ', 'RocknRoll One':'ポップ・元気・インパクト',
  'Reggae One':'インパクト・ゲーム', 'Rampart One':'レトロ・立体', 'Train One':'レトロ・昭和', 'DotGothic16':'ゲーム・レトロ（ドット）',
  'Potta One':'和風・元気・インパクト', 'Chokokutai':'インパクト・漫画', 'Darumadrop One':'かわいい・ポップ（丸）', 'Cherry Bomb One':'かわいい・ポップ',
  'Palette Mosaic':'レトロ・デザイン', 'Stick':'ポップ・細め',
  'Yuji Syuku':'和風・筆', 'Yuji Boku':'和風・筆・ホラー', 'Yuji Mai':'和風・筆・エモ', 'New Tegomin':'和風・レトロ・昭和',
  'Zen Antique':'和風・レトロ', 'Zen Antique Soft':'和風・やさしい', 'Shippori Mincho':'高級・和風', 'Shippori Mincho B1':'高級・和風',
  'Zen Old Mincho':'高級・物語', 'Noto Serif JP':'高級・物語', 'Kaisei Decol':'エモ・物語', 'Kaisei Opti':'高級・エモ',
  'Kaisei Tokumin':'高級・物語', 'Kaisei HarunoUmi':'エモ・やさしい', 'Hina Mincho':'エモ・やさしい', 'Shippori Antique':'レトロ・和風',
  'Yusei Magic':'手書き・ゆるい', 'Hachi Maru Pop':'手書き・かわいい', 'Yomogi':'手書き・日記', 'Klee One':'手書き・やさしい',
  'Zen Kurenaido':'手書き・ホラー', 'Slackside One':'手書き・ゆるい', 'Tsukimi Rounded':'やさしい・かわいい',
};
// 「用途」プルダウンの選択肢 → 用途文に含まれていればヒットとするキーワード（部分一致）。表記ゆれを吸収するための表
const USE_KEYS = {
  'ゲーム・インパクト':['ゲーム','インパクト','スポーツ','コミック','漫画'], '解説・読みやすい':['解説','読みやすい','万能','ニュース','テック'],
  'かわいい・ポップ':['かわいい','ポップ','やさしい','元気'], '和風・筆':['和風','筆'], '高級・エモ':['高級','エモ','物語','エレガント'],
  'ホラー':['ホラー'], 'レトロ':['レトロ','昭和','ビンテージ'], '手書き':['手書き'],
};

// 外部 API・一覧データの分類名 → このアプリの分類名。
// CAT_MAP は Fontsource API の category 用、GC は font-list.js の1文字コード（s/e/d/h/m）用、GC_USE は欧文の用途の既定文
const CAT_MAP = {'sans-serif':'ゴシック', serif:'明朝', display:'デザイン', handwriting:'手書き', monospace:'等幅'};
const GC = {s:'ゴシック', e:'明朝', d:'デザイン', h:'手書き', m:'等幅'};
const GC_USE = {s:'モダン', e:'セリフ・高級', d:'デザイン・インパクト', h:'手書き', m:'等幅・テック'};
// Google の一覧の分類が実態と合わないもの（デザイン書体なのにゴシック扱い等）の上書き
const JP_CAT_OVR = {'Aoboshi One':'デザイン', 'Kapakana':'手書き', 'M PLUS 1 Code':'等幅', 'Rock 3D':'デザイン', 'Shizuru':'デザイン', 'Monomaniac One':'デザイン', 'WDXL Lubrifont JP N':'デザイン', 'LINE Seed JP':'ゴシック', 'M PLUS U':'ゴシック', 'Yuji Hentaigana Akari':'手書き', 'Yuji Hentaigana Akebono':'手書き'};
Object.assign(USAGE_JP, {
  'Aoboshi One':'和風・レトロ・高級', 'BIZ UDGothic':'解説・読みやすい', 'BIZ UDMincho':'解説・物語', 'BIZ UDPMincho':'解説・物語',
  'IBM Plex Sans JP':'解説・テック', 'Kapakana':'かわいい・ゆるい（かなのみ）', 'LINE Seed JP':'解説・ポップ・モダン', 'M PLUS 1 Code':'テック・プログラミング',
  'M PLUS U':'解説・モダン', 'Monomaniac One':'インパクト・ゲーム', 'Rock 3D':'レトロ・立体・インパクト', 'Shizuru':'レトロ・デザイン',
  'WDXL Lubrifont JP N':'ポップ・元気・インパクト', 'Yuji Hentaigana Akari':'和風・筆（変体仮名）', 'Yuji Hentaigana Akebono':'和風・筆（変体仮名）',
  'M PLUS 1':'解説・読みやすい', 'M PLUS 2':'解説・モダン', 'Zen Kaku Gothic Antique':'解説・レトロ', 'Sawarabi Gothic':'解説・やさしい',
  'Sawarabi Mincho':'物語・やさしい', 'Kosugi':'解説・読みやすい', 'BIZ UDPGothic':'解説・読みやすい', 'Shippori Antique B1':'レトロ・和風',
});
/* Google Fonts の旧アーリーアクセス（一覧には出ないがまだ配信されている日本語書体） */
const EA_FONTS = [
  ['Nico Moji','nicomoji','デザイン','ポップ・かわいい・ゲーム（かな・英数字のみ）'],
  ['Nikukyu','nikukyu','デザイン','かわいい・ポップ（かなのみ）'],
  ['Hannari','hannari','明朝','和風・エモ・やさしい'],
  ['Kokoro','kokoro','明朝','エモ・やさしい・物語'],
].map(([family, slug, cat, usage]) => ({family, slug, cat, usage, weights:[400], src:'ea'}));
/* Fontsource（jsDelivr 配信）の Google 以外のオープンフォント。mb = 1書体あたりのおおよそのサイズ
   要素：[Fontsource の id, family, 分類, 用途, 太さの数字列（"47" → 400,700）, mb（省略可）] */
const FS_FONTS = /** @type {Array<[string, string, string, string, string, number?]>} */ ([
  ['genjyuu-gothic','Genjyuu Gothic','ゴシック','インパクト・ポップ・万能（源柔ゴシック）','1234579',3.5],
  ['fusion-pixel-12px-proportional-jp','Fusion Pixel 12px Proportional JP','デザイン','ゲーム・レトロ（ドット）','4',0.6],
  ['fusion-pixel-10px-proportional-jp','Fusion Pixel 10px Proportional JP','デザイン','ゲーム・レトロ（ドット）','4',0.5],
  ['fusion-kai-j','Fusion Kai J','手書き','和風・筆・物語（楷書）','4',5.7],
  ['norwester','Norwester','欧文','スポーツ・ゲーム・インパクト（大文字）','4'],
  ['peace-sans','Peace Sans','欧文','ポップ・インパクト（極太）','4'],
  ['chunk-five','Chunk Five','欧文','レトロ・ポスター・インパクト','8'],
  ['ostrich-sans','Ostrich Sans','欧文','クール・細長い','3479'],
  ['blackout-midnight','Blackout Midnight','欧文','インパクト・ポスター（極太）','4'],
  ['blackout-two-am','Blackout Two AM','欧文','インパクト・ポスター（細長い極太）','4'],
  ['bagnard','Bagnard','欧文','高級・物語・ビンテージ','4'],
  ['metropolis','Metropolis','欧文','解説・モダン','123456789'],
  ['open-sauce-one','Open Sauce One','欧文','解説・モダン','3456789'],
  ['argentum-sans','Argentum Sans','欧文','テック・モダン','123456789'],
  ['apfel-grotezk','Apfel Grotezk','欧文','モダン・エモ','47'],
  ['redaction','Redaction','欧文','高級・エモ・物語','47'],
  ['junction','Junction','欧文','やさしい・解説','347'],
  ['bluu-next','Bluu Next','欧文','高級・エレガント（極太セリフ）','7'],
  ['cooper-hewitt','Cooper Hewitt','欧文','解説・テック','12345678'],
  ['dseg7-classic','DSEG7 Classic','欧文','ゲーム・テック（デジタル時計の数字）','347'],
  ['dseg14-classic','DSEG14 Classic','欧文','ゲーム・テック（電光掲示板）','347'],
  ['league-mono','League Mono','欧文','テック・プログラミング（等幅）','12345678'],
  ['comic-mono','Comic Mono','欧文','ゆるい・手書き風（等幅）','47'],
]).map(([id, family, cat, usage, w, mb]) => ({id, family, cat, usage, weights:[...w].map(n => +n * 100), src:'fontsource', mb}));
/* GitHub で配布されている漢字入りフリーフォント（jsDelivr 経由で原本をそのまま読み込み）。files = 太さ→パス
   要素：[family, 分類, 用途（配布元・ライセンス名を含む）, files, mb]。パスの「@」のあとはコミットの ID で、
   配布元が更新・改名しても同じファイルを取れるよう固定している（差し替えるときは ID ごと更新する） */
const GH = 'https://cdn.jsdelivr.net/gh/';
const GH_FONTS = [
  ['PixelMplus12','デザイン','ゲーム・レトロ（ドット・漢字入り）PixelMplus／M+ FONT LICENSE',
    {400:'itouhiro/PixelMplus@d89b95f04eeb95bf98bb09cb9234a2f99d186df5/PixelMplus12-Regular.ttf', 700:'itouhiro/PixelMplus@d89b95f04eeb95bf98bb09cb9234a2f99d186df5/PixelMplus12-Bold.ttf'}, 1.3],
  ['PixelMplus10','デザイン','ゲーム・レトロ（ドット・漢字入り）PixelMplus／M+ FONT LICENSE',
    {400:'itouhiro/PixelMplus@d89b95f04eeb95bf98bb09cb9234a2f99d186df5/PixelMplus10-Regular.ttf', 700:'itouhiro/PixelMplus@d89b95f04eeb95bf98bb09cb9234a2f99d186df5/PixelMplus10-Bold.ttf'}, 1.1],
  ['x12y16pxMaruMonica','デザイン','ゲーム・レトロ・かわいい（ドット・漢字入り）マルモニカ／hicc',
    {400:'hicchicc/hicchicc.github.io@91451a311511ef023288f6efcdb95b72f2b43ef1/00ff/x12y16pxMaruMonica.ttf'}, 3.0],
  ['x12y12pxMaruMinya','デザイン','ゲーム・レトロ・かわいい（ドット・漢字入り）まるみーにゃ／hicc',
    {400:'hicchicc/hicchicc.github.io@91451a311511ef023288f6efcdb95b72f2b43ef1/00ff/x12y12pxMaruMinya.ttf'}, 2.7],
  ['Tsukuhou Mincho','明朝','レトロ・物語・エモ（築豊明朝）',
    {400:'iose-sakana/TsukuhouMIncho@b3be75d08f2681237e28d52606cfd0fa8f84c6ba/font/TsukuhouMincho-Regular.ttf'}, 7.4],
  ['GenSen Rounded 2 JP','ゴシック','かわいい・やさしい・ポップ（源泉丸ゴシック）',
    {400:'ButTaiwan/gensen-font@d347d3fffcb45e08857052433a0b432ed4f7ace8/otf/JP/GenSenRounded2JP-R.otf', 700:'ButTaiwan/gensen-font@d347d3fffcb45e08857052433a0b432ed4f7ace8/otf/JP/GenSenRounded2JP-B.otf', 900:'ButTaiwan/gensen-font@d347d3fffcb45e08857052433a0b432ed4f7ace8/otf/JP/GenSenRounded2JP-H.otf'}, 16],
  ['GenSeki Gothic 2 JP','ゴシック','解説・インパクト・レトロ（源石ゴシック）',
    {400:'ButTaiwan/genseki-font@a262f8b764078353bbfa4f1124c46dd585594601/otf/JP/GenSekiGothic2JP-R.otf', 700:'ButTaiwan/genseki-font@a262f8b764078353bbfa4f1124c46dd585594601/otf/JP/GenSekiGothic2JP-B.otf', 900:'ButTaiwan/genseki-font@a262f8b764078353bbfa4f1124c46dd585594601/otf/JP/GenSekiGothic2JP-H.otf'}, 16],
  ['GenRyuMin 2 JP','明朝','高級・物語・エモ（源流明朝）',
    {400:'ButTaiwan/genryu-font@030cd4fa3dd6b0607c5e7f35f13977a2e0a10522/otf/JP/GenRyuMin2JP-R.otf', 700:'ButTaiwan/genryu-font@030cd4fa3dd6b0607c5e7f35f13977a2e0a10522/otf/JP/GenRyuMin2JP-B.otf', 900:'ButTaiwan/genryu-font@030cd4fa3dd6b0607c5e7f35f13977a2e0a10522/otf/JP/GenRyuMin2JP-H.otf'}, 16],
  ['Harano Aji Gothic','ゴシック','解説・読みやすい・万能（原ノ味ゴシック）',
    {200:'trueroad/HaranoAjiFonts@f0f692c1e39593751a4796082fa5232185d91ecd/HaranoAjiGothic-ExtraLight.otf', 300:'trueroad/HaranoAjiFonts@f0f692c1e39593751a4796082fa5232185d91ecd/HaranoAjiGothic-Light.otf', 400:'trueroad/HaranoAjiFonts@f0f692c1e39593751a4796082fa5232185d91ecd/HaranoAjiGothic-Regular.otf', 500:'trueroad/HaranoAjiFonts@f0f692c1e39593751a4796082fa5232185d91ecd/HaranoAjiGothic-Medium.otf', 700:'trueroad/HaranoAjiFonts@f0f692c1e39593751a4796082fa5232185d91ecd/HaranoAjiGothic-Bold.otf', 900:'trueroad/HaranoAjiFonts@f0f692c1e39593751a4796082fa5232185d91ecd/HaranoAjiGothic-Heavy.otf'}, 4.6],
  ['Harano Aji Mincho','明朝','高級・物語・解説（原ノ味明朝）',
    {200:'trueroad/HaranoAjiFonts@f0f692c1e39593751a4796082fa5232185d91ecd/HaranoAjiMincho-ExtraLight.otf', 300:'trueroad/HaranoAjiFonts@f0f692c1e39593751a4796082fa5232185d91ecd/HaranoAjiMincho-Light.otf', 400:'trueroad/HaranoAjiFonts@f0f692c1e39593751a4796082fa5232185d91ecd/HaranoAjiMincho-Regular.otf', 500:'trueroad/HaranoAjiFonts@f0f692c1e39593751a4796082fa5232185d91ecd/HaranoAjiMincho-Medium.otf', 600:'trueroad/HaranoAjiFonts@f0f692c1e39593751a4796082fa5232185d91ecd/HaranoAjiMincho-SemiBold.otf', 700:'trueroad/HaranoAjiFonts@f0f692c1e39593751a4796082fa5232185d91ecd/HaranoAjiMincho-Bold.otf', 900:'trueroad/HaranoAjiFonts@f0f692c1e39593751a4796082fa5232185d91ecd/HaranoAjiMincho-Heavy.otf'}, 6.2],
  ['GenYoMin 2 PJP','明朝','高級・物語・エモ（源様明朝・かなが比例幅）',
    {200:'ButTaiwan/genyo-font@880b7c9721b62ae813b737cdeca23fccba7d665b/otf/PJP/GenYoMin2PJP-EL.otf', 300:'ButTaiwan/genyo-font@880b7c9721b62ae813b737cdeca23fccba7d665b/otf/PJP/GenYoMin2PJP-L.otf', 400:'ButTaiwan/genyo-font@880b7c9721b62ae813b737cdeca23fccba7d665b/otf/PJP/GenYoMin2PJP-R.otf', 500:'ButTaiwan/genyo-font@880b7c9721b62ae813b737cdeca23fccba7d665b/otf/PJP/GenYoMin2PJP-M.otf', 600:'ButTaiwan/genyo-font@880b7c9721b62ae813b737cdeca23fccba7d665b/otf/PJP/GenYoMin2PJP-SB.otf', 700:'ButTaiwan/genyo-font@880b7c9721b62ae813b737cdeca23fccba7d665b/otf/PJP/GenYoMin2PJP-B.otf', 900:'ButTaiwan/genyo-font@880b7c9721b62ae813b737cdeca23fccba7d665b/otf/PJP/GenYoMin2PJP-H.otf'}, 15.5],
  ['GenKiMin 2 PJP','明朝','高級・物語・エモ（源起明朝・かなが比例幅）',
    {200:'ButTaiwan/genyo-font@880b7c9721b62ae813b737cdeca23fccba7d665b/otf/PJP/GenKiMin2PJP-EL.otf', 300:'ButTaiwan/genyo-font@880b7c9721b62ae813b737cdeca23fccba7d665b/otf/PJP/GenKiMin2PJP-L.otf', 400:'ButTaiwan/genyo-font@880b7c9721b62ae813b737cdeca23fccba7d665b/otf/PJP/GenKiMin2PJP-R.otf', 500:'ButTaiwan/genyo-font@880b7c9721b62ae813b737cdeca23fccba7d665b/otf/PJP/GenKiMin2PJP-M.otf', 600:'ButTaiwan/genyo-font@880b7c9721b62ae813b737cdeca23fccba7d665b/otf/PJP/GenKiMin2PJP-SB.otf', 700:'ButTaiwan/genyo-font@880b7c9721b62ae813b737cdeca23fccba7d665b/otf/PJP/GenKiMin2PJP-B.otf', 900:'ButTaiwan/genyo-font@880b7c9721b62ae813b737cdeca23fccba7d665b/otf/PJP/GenKiMin2PJP-H.otf'}, 12.8],
].map(([family, cat, usage, files, mb]) => ({family, cat, usage, files, weights: Object.keys(files).map(Number), src:'gh', mb}));
/* npm 配布の日本語フォント（jsDelivr）。文字ごとに分割された woff2 を必要な分だけ読み込むので軽い。{w} は太さごとのCSS */
const NPM = 'https://cdn.jsdelivr.net/npm/';
const NPM_FONTS = [
  ['Gen Interface JP','ゴシック','解説・モダン・クール（Inter風の欧文＋Noto Sans JP）','gen-interface-jp@0.1.2/{w}.css','100,200,300,400,500,600,700,800'],
  ['Gen Interface JP Display','ゴシック','見出し・クール・モダン（大きい文字向けのGen Interface）','gen-interface-jp@0.1.2/display-{w}.css','100,200,300,400,500,600,700,800'],
  ['Notofit JP','ゴシック','モダン・解説・テック（Outfit風の欧文＋Noto Sans JP）','notofit-jp@0.2.0/{w}.css','100,200,300,400,500,600,700,800,900'],
  ['TJ Plus Sans','ゴシック','ポップ・モダン・解説（丸みのある欧文＋M PLUS/Noto Sans JP）','tj-plus-sans@0.2.1/index.css','300,400,500,600,700,800'],
].map(([family, cat, usage, css, w]) => ({family, cat, usage, css: NPM + css, weights: w.split(',').map(Number), src:'npm'}));
/* このリポジトリに同梱しているフォント（fonts/ 内・ライセンスも同梱）。読み込み方は URL 追加フォントと同じ */
const SELF_FONTS = [
  ['にくまるフォント','デザイン','かわいい・ポップ・やさしい（丸ゴシック／フロップデザイン・M+ FONT LICENSE）','nikumaru/Nikumaru.otf',3.1],
  ['ラノベPOPv2','デザイン','ポップ・ゲーム・元気（ラノベ風POP体／フロップデザイン・M+ FONT LICENSE）','lanobe-pop/LightNovelPOPv2.woff',1.6],
  ['07やさしさゴシック','ゴシック','やさしい・かわいい・解説（丸みのあるゴシック／フォントな・M+ FONT／IPA LICENSE）','yasashisa/Yasashisa.woff',2.9],
  ['07やさしさゴシックボールド','ゴシック','やさしい・かわいい・ポップ（太い丸ゴシック／フォントな・M+ FONT LICENSE）','yasashisa-bold/YasashisaBold.woff',1.3],
  ['どきどきファンタジア','ゴシック','かわいい・ポップ・ゲーム（極太の丸ゴシック／フロップデザイン・SIL OFL 1.1）','dokidoki/DokiDokiFantasia.woff',3.1],
  ['零ゴシック','ゴシック','クール・解説・ゲーム（源ノ角ゴシック派生／フロップデザイン・SIL OFL 1.1）','zero-gothic/ZeroGothic.woff',3.9],
  ['異世ゴ','ゴシック','ファンタジー・ゲーム・インパクト（源ノ角ゴシック派生／フロップデザイン・SIL OFL 1.1）','isego/Isego.woff',5.2],
  ['異世明','明朝','ファンタジー・物語・エモ（源ノ明朝派生／フロップデザイン・SIL OFL 1.1）','isemin/Isemin.woff',5.3],
  ['装甲明朝','明朝','ゲーム・ダーク・インパクト（源ノ明朝派生／フロップデザイン・SIL OFL 1.1）','soukou/SoukouMincho.woff',5.7],
  ['瞬きノ明朝','明朝','繊細・物語・エモ（源ノ明朝派生／フロップデザイン・SIL OFL 1.1）','matataki/MatatakiMincho.woff',26.4],
].map(([family, cat, usage, file, mb]) => ({family, cat, usage, weights:[400], src:'url', file:'fonts/' + file, mb}));
