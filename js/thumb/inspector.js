/* 楽ちんサムネメーカー：操作パネル・モード・タブ */
/* ---------- パネル ---------- */
// 分割フレームの「効果」ページ。共通（@fx.）とマスごと（@cell.fx.）で同じ行を作り、切り替えで出し分ける
const CFX_ROWS = (P, S) => [
  {pg:'cfx', cfxchips:true, show:S},
  {pg:'cfx', sub:'色調', show:S},
  {pg:'cfx', r:P + 'bright', l:'明るさ', min:-0.6, max:0.6, step:0.01, show:S},
  {pg:'cfx', r:P + 'contrast', l:'コントラスト', min:-0.8, max:1, step:0.01, show:S},
  {pg:'cfx', r:P + 'sat', l:'彩度', min:-1, max:1, step:0.01, show:S},
  {pg:'cfx', r:P + 'hue', l:'色相', min:-180, max:180, step:1, show:S},
  {pg:'cfx', r:P + 'blur', l:'ぼかし', min:0, max:40, step:0.5, show:S},
  {pg:'cfx', seg:P + 'tone', l:'トーン', opts:[['none', 'なし'], ['mono', 'モノクロ'], ['sepia', 'セピア'], ['duotone', '2色']], show:S},
  {pg:'cfx', c:P + 'duo1', l:'暗い色', show:S + '&' + P + 'tone=duotone'}, {pg:'cfx', c:P + 'duo2', l:'明るい色', show:S + '&' + P + 'tone=duotone'},
  {pg:'cfx', sub:'エフェクト', show:S},
  {pg:'cfx', chk:P + 'zb.on', l:'ズームブラー（マスの中心へ吸い込まれる）', show:S},
  {pg:'cfx', r:P + 'zb.amt', l:'強さ', min:0.02, max:0.8, step:0.01, show:S + '&' + P + 'zb.on=true'},
  {pg:'cfx', chk:P + 'mb.on', l:'モーションブラー（流れる）', show:S},
  {pg:'cfx', r:P + 'mb.dist', l:'距離', min:5, max:400, step:1, show:S + '&' + P + 'mb.on=true'},
  {pg:'cfx', r:P + 'mb.angle', l:'方向', min:-90, max:90, step:1, show:S + '&' + P + 'mb.on=true'},
  {pg:'cfx', chk:P + 'mosaic.on', l:'モザイク', show:S},
  {pg:'cfx', r:P + 'mosaic.size', l:'粗さ', min:4, max:120, step:1, show:S + '&' + P + 'mosaic.on=true'},
  {pg:'cfx', r:P + 'dim', l:'暗くする', min:0, max:0.85, step:0.01, show:S},
  {pg:'cfx', r:P + 'vignette', l:'周辺減光', min:0, max:1, step:0.01, show:S},
  {pg:'cfx', chk:P + 'tint.on', l:'色を重ねる', show:S},
  {pg:'cfx', c:P + 'tint.c', l:'色', show:S + '&' + P + 'tint.on=true'},
  {pg:'cfx', r:P + 'tint.a', l:'濃さ', min:0, max:1, step:0.01, show:S + '&' + P + 'tint.on=true'},
  {pg:'cfx', sel:P + 'tint.mode', l:'重ね方', opts:[['overlay', 'オーバーレイ'], ['multiply', '乗算（暗く）'], ['screen', 'スクリーン（明るく）'], ['soft-light', 'ソフトライト'], ['color', 'カラー（単色化）']], show:S + '&' + P + 'tint.on=true'},
];
const SEL_ROWS = [
  {pg:'base', sub:'グループ', note:'中のレイヤーをまとめて動かします。ダブルクリックで中のレイヤーを1つだけ選べます。効果は「効果」タブから', show:'@type=group'},
  {pg:'base', btns:[['ungroupBtn', 'ungroup', 'グループを解除']], show:'@type=group'},
  {pg:'base', r:'@sc', l:'大きさ', min:0.05, max:10, step:0.01, show:'@type!=group'},
  {pg:'base', r:'@rot', l:'回転', min:-180, max:180, step:1, show:'@type!=group'},
  {pg:'base', flips:true, l:'反転', show:'@type=image'},
  {pg:'fx', c:'@p.c', l:'色', show:'@type=fx'},
  {pg:'fx', r:'@p.n', l:'本数', min:20, max:300, step:1, show:'@kind=lines'},
  {pg:'fx', r:'@p.inner', l:'中心の空き', min:0.02, max:1.5, step:0.01, show:'@kind=lines'},
  {pg:'fx', r:'@p.w', l:'線の太さ', min:0.2, max:3, step:0.05, show:'@kind=lines'},
  {pg:'fx', chk:'@p.full', l:'画面の端まで伸ばす（オフで下の最大サイズが効きます）', show:'@kind=lines'},
  {pg:'fx', r:'@p.reach', l:'最大サイズ（動かすと自動で有効）', min:1.05, max:5, step:0.01, show:'@kind=lines'},
  {pg:'fx', r:'@p.fade', l:'外側をぼかす', min:0, max:1, step:0.01, show:'@kind=lines&@p.full=false'},
  {pg:'fx', r:'@p.len', l:'長さのばらつき', min:0, max:2, step:0.05, show:'@kind=lines'},
  {pg:'fx', r:'@p.amt', l:'強さ', min:0, max:1, step:0.01, show:'@kind=light'},
  {pg:'fx', r:'@p.r', l:'光の広がり', min:0.05, max:1.5, step:0.01, show:'@kind=light'},
  {pg:'fx', r:'@p.n', l:'数', min:1, max:60, step:1, show:'@kind=sparkle'},
  {pg:'fx', r:'@p.size', l:'星の大きさ', min:0.2, max:3, step:0.05, show:'@kind=sparkle'},
  {pg:'fx', chk:'@p.glow', l:'光らせる', show:'@kind=sparkle'},
  {pg:'fx', r:'@p.spikes', l:'トゲの数', min:5, max:40, step:1, show:'@kind=burst'},
  {pg:'fx', r:'@p.depth', l:'トゲの深さ', min:0.05, max:0.7, step:0.01, show:'@kind=burst'},
  {pg:'fx', c:'@p.c2', l:'フチの色', show:'@kind=burst'},
  {pg:'fx', r:'@p.sw', l:'フチの太さ', min:0, max:40, step:0.5, show:'@kind=burst'},
  {pg:'fx', r:'@p.n', l:'数', min:4, max:60, step:1, show:'@kind=rays'},
  {pg:'fx', r:'@p.r', l:'大きさ', min:0.3, max:3, step:0.01, show:'@kind=rays'},
  {pg:'fx', r:'@p.fade', l:'外側のぼかし', min:0, max:1, step:0.01, show:'@kind=rays'},
  {pg:'fx', r:'@p.n', l:'本数', min:5, max:200, step:1, show:'@kind=speed|gaan'},
  {pg:'fx', r:'@p.len', l:'長さ', min:0.1, max:2, step:0.01, show:'@kind=speed|gaan'},
  {pg:'fx', r:'@p.w', l:'太さ', min:0.2, max:4, step:0.05, show:'@kind=speed|gaan|bolt'},
  {pg:'fx', seg:'@p.type', l:'種類', opts:[['snow', '雪'], ['rain', '雨']], show:'@kind=snow'},
  {pg:'fx', sel:'@p.shape', l:'形', opts:[['heart', 'ハート'], ['star', '星'], ['note', '音符'], ['drop', 'しずく']], show:'@kind=scatter'},
  {pg:'fx', r:'@p.n', l:'数', min:5, max:400, step:1, show:'@kind=confetti|snow|bokeh|scatter'},
  {pg:'fx', r:'@p.size', l:'粒の大きさ', min:0.2, max:4, step:0.05, show:'@kind=confetti|snow|bokeh|scatter'},
  {pg:'fx', chk:'@p.colorful', l:'カラフルにする', show:'@kind=confetti|bokeh|scatter'},
  {pg:'fx', r:'@p.branch', l:'枝分かれ', min:0, max:1, step:0.01, show:'@kind=bolt'},
  {pg:'fx', seed:'@p.seed', l:'ランダム', show:'@kind=lines|sparkle|burst|rays|speed|gaan|confetti|snow|bolt|bokeh|scatter'},
  {pg:'base', r:'@op', l:'不透明度', min:0.05, max:1, step:0.01},
  {pg:'base', sel:'@blend', l:'描画モード', opts:Object.entries({'source-over':'通常', multiply:'乗算（暗く重ねる）', screen:'スクリーン（明るく重ねる）', overlay:'オーバーレイ', 'soft-light':'ソフトライト', 'hard-light':'ハードライト', 'color-dodge':'覆い焼き（光る）', lighter:'加算（発光）', difference:'差の絶対値', luminosity:'輝度'})},
  {pg:'base', chk:'@locked', l:'ロック（キャンバス上で選択・移動しない）'},
  {pg:'base', place:true, l:'配置', show:'@type!=group'},
  {pg:'split', sub:'分割フレーム', note:'複数の画像を並べます。マスに画像をドロップするか、下の一覧から選んでください', show:'@type=collage'},
  {pg:'split', seg:'@n', l:'分割数', opts:[['2','2'],['3','3'],['4','4'],['5','5'],['6','6']], show:'@type=collage'},
  {pg:'split', layouts:true, l:'分割のしかた', show:'@type=collage'},
  {pg:'split', r:'@slant', l:'傾き・回転', min:-1, max:1, step:0.01, show:'@type=collage&@layout=cols|rows|bigL|bigT|radial'},
  {pg:'split', r:'@main', l:'大きいマスの大きさ', min:0.25, max:0.8, step:0.01, show:'@type=collage&@layout=bigL|bigT'},
  {pg:'split', seg:'@edge', l:'境界の形', opts:COLLAGE_EDGES, show:'@type=collage'},
  {pg:'split', r:'@amp', l:'形の大きさ', min:4, max:90, step:1, show:'@type=collage&@edge=zigzag|wave|rough'},
  {pg:'split', sel:'@bstyle', l:'境界線', opts:COLLAGE_BSTYLES, show:'@type=collage'},
  {pg:'split', r:'@lw', l:'太さ・ぼかし', min:0, max:120, step:1, show:'@type=collage&@bstyle=line|gap|glow|blur|shadow'},
  {pg:'split', c:'@lc', l:'線の色', show:'@type=collage&@bstyle=line|glow'},
  {pg:'split', chk:'@outer', l:'外枠も付ける（線の色・太さ）', show:'@type=collage'},
  {pg:'split', r:'@radius', l:'角の丸み', min:0, max:300, step:1, show:'@type=collage'},
  {pg:'cells', sub:'マスの画像', note:'マスをクリックで選択。画像のないマスは画像を選べます。ドラッグで別のマスと入れ替えられます', show:'@type=collage'},
  {pg:'cells', cells:true, show:'@type=collage'},
  {pg:'cells', r:'@cell.zoom', l:'画像の大きさ', min:0.2, max:5, step:0.01, show:'@type=collage'},
  {pg:'cells', r:'@cell.ox', l:'画像 左右', min:-1, max:1, step:0.005, show:'@type=collage'},
  {pg:'cells', r:'@cell.oy', l:'画像 上下', min:-1, max:1, step:0.005, show:'@type=collage'},
  {pg:'cells', r:'@cell.rot', l:'画像の回転', min:-180, max:180, step:0.5, show:'@type=collage'},
  {pg:'cells', btns:[['collageEditBtn', 'crop', 'キャンバスでマスの画像を調整']], show:'@type=collage'},
  {pg:'cfx', sub:'効果', note:'マスの画像に色調やエフェクトをかけます', show:'@type=collage'},
  {pg:'cfx', sub:'グループの効果', note:'中のレイヤーを1枚の絵にまとめて、色調やエフェクトをかけます', show:'@type=group'},
  {pg:'cfx', seg:'@fxMode', l:'かける対象', opts:[['all', '全部のマス'], ['cell', 'マスごと']], show:'@type=collage'},
  {pg:'cfx', cells:true, show:'@type=collage&@fxMode=cell'},
  ...CFX_ROWS('@fx.', '@type=collage|group&@fxMode=all'),
  ...CFX_ROWS('@cell.fx.', '@type=collage&@fxMode=cell'),
  {pg:'cfx', sub:'全体の影', show:'@type=collage|group'},
  {pg:'cfx', chk:'@shadow.on', l:'影を付ける', show:'@type=collage|group'},
  {pg:'cfx', r:'@shadow.blur', l:'影ぼかし', min:0, max:120, step:1, show:'@type=collage|group&@shadow.on=true'},
  {pg:'cfx', r:'@shadow.y', l:'影の位置', min:-60, max:90, step:1, show:'@type=collage|group&@shadow.on=true'},
  {pg:'cfx', r:'@shadow.a', l:'影の濃さ', min:0, max:1, step:0.01, show:'@type=collage|group&@shadow.on=true'},
  {pg:'base', sub:'全体の大きさ', show:'@type=collage'},
  {pg:'base', r:'@bw', l:'横幅', min:100, max:5000, step:1, show:'@type=collage'},
  {pg:'base', r:'@bh', l:'高さ', min:100, max:5000, step:1, show:'@type=collage'},
  {pg:'base', btns:[['collageFill', 'monitor', '画面いっぱいにする']], show:'@type=collage'},
  {pg:'frame', sub:'表示する範囲（トリミング）', note:'画像の上・下・左・右を切り落とします。見えている部分は動きません', show:'@type=image'},
  {pg:'frame', r:'@crop.t', l:'上を切る', min:0, max:0.9, step:0.005, show:'@type=image'},
  {pg:'frame', r:'@crop.b', l:'下を切る', min:0, max:0.9, step:0.005, show:'@type=image'},
  {pg:'frame', r:'@crop.l', l:'左を切る', min:0, max:0.9, step:0.005, show:'@type=image'},
  {pg:'frame', r:'@crop.r', l:'右を切る', min:0, max:0.9, step:0.005, show:'@type=image'},
  {pg:'frame', btns:[['cropReset', 'reset', 'トリミングを戻す']], show:'@type=image'},
  {pg:'frame', sub:'切り抜きフレーム', note:'図形で切り抜いて枠を付けます。形と枠のデザインは自由に組み合わせOK', show:'@type=image'},
  {pg:'frame', frpre:true, show:'@type=image'},
  {pg:'frame', shapes:true, l:'形', show:'@type=image'},
  {pg:'frame', sel:'@frame.style', l:'枠のデザイン', opts:FRAME_STYLES, show:'@type=image&@frame.shape!=none'},
  {pg:'frame', seg:'@frame.ar', l:'縦横比', opts:[['auto','自動'],['1','1:1'],['1.333','4:3'],['0.75','3:4'],['1.778','16:9']], show:'@type=image&@frame.shape!=none'},
  {pg:'frame', r:'@frame.r', l:'角の丸み', min:0, max:0.5, step:0.01, show:'@type=image&@frame.shape=rect|bubble'},
  {pg:'frame', btns:[['frameEditBtn', 'crop', 'キャンバスでフレームを調整']], show:'@type=image&@frame.shape!=none'},
  {pg:'frame', seed:'@frame.seed', l:'筆のかすれ', show:'@type=image&@frame.shape=' + FRAME_SEEDED.join('|')},
  {pg:'frame', r:'@frame.fs', l:'大きさ', min:0.1, max:1, step:0.005, show:'@type=image&@frame.shape!=none'},
  {pg:'frame', r:'@frame.cx', l:'位置 左右', min:0, max:1, step:0.002, show:'@type=image&@frame.shape!=none'},
  {pg:'frame', r:'@frame.cy', l:'位置 上下', min:0, max:1, step:0.002, show:'@type=image&@frame.shape!=none'},
  {pg:'color', sub:'明るさ・鮮やかさ', note:'画像の絵だけに効きます（フチ・影は変わりません）', show:'@type=image'},
  {pg:'color', r:'@bright', l:'明度', min:-0.8, max:0.8, step:0.01, show:'@type=image'},
  {pg:'color', r:'@sat', l:'彩度', min:-1, max:1, step:0.01, show:'@type=image'},
  {pg:'color', btns:[['imgColorReset', 'reset', '元に戻す']], show:'@type=image'},
  {pg:'edge', chk:'@outline.on', l:'フチを付ける（切り抜き画像向け）', show:'@type=image&@frame.shape=none'},
  {pg:'frame|edge', r:'@outline.w', l:'フチ太さ', min:0.05, max:50, step:0.01, show:'@type=image'},
  {pg:'frame|edge', c:'@outline.c', l:'フチ色', show:'@type=image'},
  {pg:'frame', c:'@frame.c2', l:'2色目', show:'@type=image&@frame.style=pop|grad|tape|neon2|block|triple|stitch|halftone|pixel'},
  {pg:'edge', sel:'@outline.style', l:'フチの種類', opts:[['solid', 'ふつう'], ['double', '二重'], ['grad', 'グラデ']], show:'@type=image&@frame.shape=none&@outline.on=true'},
  {pg:'edge', c:'@outline.c2', l:'フチ 2色目', show:'@type=image&@frame.shape=none&@outline.on=true&@outline.style=double|grad'},
  {pg:'edge', r:'@outline.w2', l:'二重の外側の太さ', min:0.5, max:40, step:0.5, show:'@type=image&@frame.shape=none&@outline.on=true&@outline.style=double'},
  {pg:'edge', r:'@outline.blur', l:'フチのぼかし', min:0, max:40, step:0.5, show:'@type=image&@frame.shape=none&@outline.on=true'},
  {pg:'edge', sub:'光彩（絵とフチの外側が光る）', show:'@type=image'},
  {pg:'edge', chk:'@glow.on', l:'光彩を付ける', show:'@type=image'},
  {pg:'edge', c:'@glow.c', l:'光彩の色', show:'@type=image&@glow.on=true'},
  {pg:'edge', r:'@glow.blur', l:'光彩の広がり', min:1, max:120, step:1, show:'@type=image&@glow.on=true'},
  {pg:'edge', r:'@glow.a', l:'光彩の濃さ', min:0, max:1, step:0.01, show:'@type=image&@glow.on=true'},
  {pg:'edge', r:'@glow.str', l:'光彩の強さ', min:1, max:4, step:1, show:'@type=image&@glow.on=true'},
  {pg:'edge', sub:'影', show:'@type=image'},
  {pg:'edge', chk:'@shadow.on', l:'影を付ける', show:'@type=image'},
  {pg:'edge', c:'@shadow.c', l:'影の色', show:'@type=image&@shadow.on=true'},
  {pg:'edge', r:'@shadow.sp', l:'影の大きさ（ふくらみ）', min:0, max:80, step:1, show:'@type=image&@shadow.on=true'},
  {pg:'edge', r:'@shadow.blur', l:'影ぼかし', min:0, max:120, step:1, show:'@type=image&@shadow.on=true'},
  {pg:'edge', r:'@shadow.x', l:'影の位置 横', min:-90, max:90, step:1, show:'@type=image&@shadow.on=true'},
  {pg:'edge', r:'@shadow.y', l:'影の位置 縦', min:-60, max:90, step:1, show:'@type=image&@shadow.on=true'},
  {pg:'edge', r:'@shadow.a', l:'影の濃さ', min:0, max:1, step:0.01, show:'@type=image&@shadow.on=true'},
  {pg:'cut', sub:'背景を透明にする', note:'指定した色に近い部分を透明にします。元の画像は変わりません', show:'@type=image'},
  {pg:'cut', chk:'@key.on', l:'背景色を透明にする', show:'@type=image'},
  {pg:'cut', btns:[['cutPickBtn', 'drop', '画像から色を拾う'], ['cutAutoBtn', 'sparkle', '四隅から自動で拾う']], show:'@type=image'},
  {pg:'cut', c:'@key.c', l:'背景色', show:'@type=image&@key.on=true'},
  {pg:'cut', seg:'@key.mode', l:'範囲', opts:[['edge', '外側から'], ['all', '全体']], show:'@type=image&@key.on=true'},
  {pg:'cut', r:'@key.tol', l:'許容値', min:0, max:100, step:1, show:'@type=image&@key.on=true'},
  {pg:'cut', r:'@key.soft', l:'境界のぼかし', min:0, max:100, step:1, show:'@type=image&@key.on=true'},
  {pg:'cut', r:'@key.shrink', l:'縁を削る', min:0, max:8, step:1, show:'@type=image&@key.on=true'},
  {pg:'cut', r:'@key.smooth', l:'なめらかさ', min:0, max:6, step:1, show:'@type=image&@key.on=true'},
  {pg:'cut', chk:'@key.fringe', l:'にじみ除去（縁に残る背景色を消す）', show:'@type=image&@key.on=true'},
  {pg:'cut', sub:'ブラシで仕上げる', note:'キャンバスをなぞって、消したり戻したりします（ホイールで太さ）', show:'@type=image'},
  {pg:'cut', seg:'@btool', l:'道具', opts:[['erase', '消す'], ['restore', '戻す'], ['pick', '色を拾う']], show:'@type=image'},
  {pg:'cut', r:'@bsz', l:'ブラシの太さ', min:4, max:400, step:1, show:'@type=image'},
  {pg:'cut', btns:[['cutBrushBtn', 'pen', 'キャンバスでブラシを使う']], show:'@type=image&@frame.shape=none'},
  {pg:'cut', sub:'切り抜きフレームを使っている画像では、ブラシは使えません（背景色の透明化は使えます）', show:'@type=image&@frame.shape!=none'},
  {pg:'cut', btns:[['cutUndoStroke', 'undo', 'ブラシを1つ戻す'], ['cutClearStrokes', 'reset', 'ブラシの跡をすべて消す']], show:'@type=image'},
];
const BG_ROWS = [
  {pg:'tone', sub:'色調は、背景が「画像」のときに使えます', tonenote:true, show:'bg.type=grad|color'},
  {pg:'main', chk:'bg.hidden', l:'背景を非表示にする（PNGで保存すると透明に）'},
  {pg:'main', r:'bg.op', l:'背景の不透明度', min:0, max:1, step:0.01, show:'bg.hidden=false'},
  {pg:'main', seg:'bg.type', l:'種類', opts:[['image', '画像'], ['grad', 'グラデ'], ['color', '単色']]},
  {pg:'main', btns:[['pickBg', 'image', '背景画像を選ぶ']], show:'bg.type=image'},
  {pg:'fx', fx:true},
  {pg:'main', sub:'位置と大きさ', show:'bg.type=image', note:'キャンバスの何もないところをドラッグで移動・ホイールで拡大縮小'},
  {pg:'main', seg:'bg.fit', l:'基準', opts:[['cover', '全面'], ['contain', '全体を表示']], show:'bg.type=image'},
  {pg:'main', r:'bg.zoom', l:'拡大縮小', min:0.2, max:4, step:0.01, show:'bg.type=image'},
  {pg:'main', r:'bg.ox', l:'左右', min:-1.5, max:1.5, step:0.005, show:'bg.type=image'},
  {pg:'main', r:'bg.oy', l:'上下', min:-1.5, max:1.5, step:0.005, show:'bg.type=image'},
  {pg:'main', r:'bg.rot', l:'回転', min:-180, max:180, step:0.5, show:'bg.type=image'},
  {pg:'main', chk:'bg.flip', l:'左右反転', show:'bg.type=image'},
  {pg:'main', seg:'bg.gap', l:'余白', opts:[['blur', '画像のぼかし'], ['color', '単色']], show:'bg.type=image'},
  {pg:'main', c:'bg.gapColor', l:'余白の色', show:'bg.type=image&bg.gap=color'},
  {pg:'tone', sub:'色調', show:'bg.type=image'},
  {pg:'tone', r:'bg.bright', l:'明るさ', min:-0.6, max:0.6, step:0.01, show:'bg.type=image'},
  {pg:'tone', r:'bg.contrast', l:'コントラスト', min:-0.8, max:1, step:0.01, show:'bg.type=image'},
  {pg:'tone', r:'bg.sat', l:'彩度', min:-1, max:1, step:0.01, show:'bg.type=image'},
  {pg:'tone', r:'bg.hue', l:'色相', min:-180, max:180, step:1, show:'bg.type=image'},
  {pg:'tone', r:'bg.blur', l:'ぼかし', min:0, max:40, step:0.5, show:'bg.type=image'},
  {pg:'tone', seg:'bg.tone', l:'トーン', opts:[['none', 'なし'], ['mono', 'モノクロ'], ['sepia', 'セピア'], ['duotone', '2色']], show:'bg.type=image'},
  {pg:'tone', c:'bg.duo1', l:'暗い色', show:'bg.type=image&bg.tone=duotone'}, {pg:'tone', c:'bg.duo2', l:'明るい色', show:'bg.type=image&bg.tone=duotone'},
  {pg:'fx', sub:'エフェクト', show:'bg.type=image'},
  {pg:'fx', chk:'bg.zb.on', l:'ズームブラー（中心へ吸い込まれる）', show:'bg.type=image'},
  {pg:'fx', r:'bg.zb.amt', l:'強さ', min:0.02, max:0.8, step:0.01, show:'bg.type=image&bg.zb.on=true'},
  {pg:'fx', chk:'bg.mb.on', l:'モーションブラー（流れる）', show:'bg.type=image'},
  {pg:'fx', r:'bg.mb.dist', l:'距離', min:5, max:400, step:1, show:'bg.type=image&bg.mb.on=true'},
  {pg:'fx', r:'bg.mb.angle', l:'方向', min:-90, max:90, step:1, show:'bg.type=image&bg.mb.on=true'},
  {pg:'fx', chk:'bg.mosaic.on', l:'モザイク', show:'bg.type=image'},
  {pg:'fx', r:'bg.mosaic.size', l:'粗さ', min:4, max:120, step:1, show:'bg.type=image&bg.mosaic.on=true'},
  {pg:'fx', chk:'bg.posterize.on', l:'ポスタライズ（イラスト風）', show:'bg.type=image'},
  {pg:'fx', r:'bg.posterize.n', l:'色の段階', min:2, max:10, step:1, show:'bg.type=image&bg.posterize.on=true'},
  {pg:'fx', chk:'bg.thresh.on', l:'2値化（マンガ・版画風）', show:'bg.type=image'},
  {pg:'fx', r:'bg.thresh.lvl', l:'しきい値', min:0.05, max:0.95, step:0.01, show:'bg.type=image&bg.thresh.on=true'},
  {pg:'fx', c:'bg.thresh.c1', l:'暗い色', show:'bg.type=image&bg.thresh.on=true'}, {pg:'fx', c:'bg.thresh.c2', l:'明るい色', show:'bg.type=image&bg.thresh.on=true'},
  {pg:'fx', chk:'bg.tilt.on', l:'ミニチュア風（上下をぼかす）', show:'bg.type=image'},
  {pg:'fx', r:'bg.tilt.pos', l:'くっきりの位置', min:0, max:1, step:0.01, show:'bg.type=image&bg.tilt.on=true'},
  {pg:'fx', r:'bg.tilt.w', l:'くっきりの幅', min:0.05, max:0.9, step:0.01, show:'bg.type=image&bg.tilt.on=true'},
  {pg:'fx', r:'bg.tilt.blur', l:'ぼかし', min:2, max:40, step:0.5, show:'bg.type=image&bg.tilt.on=true'},
  {pg:'fx', r:'bg.tilt.sat', l:'色の濃さ', min:0, max:1, step:0.01, show:'bg.type=image&bg.tilt.on=true'},
  {pg:'main', c:'bg.color', l:'色', show:'bg.type=color'},
  {pg:'main', c:'bg.c1', l:'色1', show:'bg.type=grad'}, {pg:'main', c:'bg.c2', l:'色2', show:'bg.type=grad'},
  {pg:'main', r:'bg.angle', l:'角度', min:0, max:360, step:1, show:'bg.type=grad'},
  {pg:'fx', sub:'背景エフェクト', note:'背景全体にかかる効果です（レイヤーにはなりません）'},
  {pg:'fx', r:'bg.dim', l:'暗くする', min:0, max:0.85, step:0.01},
  {pg:'fx', r:'bg.vignette', l:'周辺減光', min:0, max:1, step:0.01},
  {pg:'fx', chk:'bg.shade.on', l:'グラデーション影（下を暗くして文字を読みやすく）'},
  {pg:'fx', c:'bg.shade.c', l:'影の色', show:'bg.shade.on=true'},
  {pg:'fx', r:'bg.shade.amt', l:'濃さ', min:0, max:1, step:0.01, show:'bg.shade.on=true'},
  {pg:'fx', r:'bg.shade.angle', l:'向き', min:0, max:360, step:1, show:'bg.shade.on=true'},
  {pg:'fx', r:'bg.shade.cover', l:'かかる範囲', min:0.05, max:1, step:0.01, show:'bg.shade.on=true'},
  {pg:'fx', chk:'bg.tint.on', l:'色を重ねる'},
  {pg:'fx', c:'bg.tint.c', l:'色', show:'bg.tint.on=true'},
  {pg:'fx', r:'bg.tint.a', l:'濃さ', min:0, max:1, step:0.01, show:'bg.tint.on=true'},
  {pg:'fx', sel:'bg.tint.mode', l:'重ね方', opts:[['overlay', 'オーバーレイ'], ['multiply', '乗算（暗く）'], ['screen', 'スクリーン（明るく）'], ['soft-light', 'ソフトライト'], ['color', 'カラー（単色化）']], show:'bg.tint.on=true'},
  {pg:'fx', r:'bg.fcx', l:'中心 左右', min:-0.2, max:1.2, step:0.005, note:'周辺減光・ズームブラーの中心'},
  {pg:'fx', r:'bg.fcy', l:'中心 上下', min:-0.2, max:1.2, step:0.005},
  {pg:'fx', btns:[['fxCenter', 'reset', '中心を真ん中に']]},
  {pg:'fx', sub:'柄を重ねる', show:'bg.hidden=false'},
  {pg:'fx', chk:'bg.pat.on', l:'柄を重ねる'},
  {pg:'fx', sel:'bg.pat.type', l:'柄', opts:BG_PATTERNS, show:'bg.pat.on=true'},
  {pg:'fx', c:'bg.pat.c', l:'柄の色', show:'bg.pat.on=true'},
  {pg:'fx', r:'bg.pat.a', l:'濃さ', min:0, max:1, step:0.01, show:'bg.pat.on=true'},
  {pg:'fx', r:'bg.pat.size', l:'大きさ（放射は本数）', min:4, max:80, step:1, show:'bg.pat.on=true'},
  {pg:'fx', sel:'bg.pat.mode', l:'重ね方', opts:[['source-over', '通常'], ['multiply', '乗算（暗く）'], ['screen', 'スクリーン（明るく）'], ['overlay', 'オーバーレイ']], show:'bg.pat.on=true'},
  {pg:'fx', addfx:true},
  {pg:'fin', finchips:true},
  {pg:'fin', sub:'色フィルター', note:'文字・画像も含めたサムネ全体に、最後にまとめてかかります'},
  {pg:'fin', sel:'fin.look', l:'フィルター', opts:Object.entries(FIN_LOOKS).map(([k, v]) => [k, v[0]])},
  {pg:'fin', r:'fin.amt', l:'かかり具合', min:0, max:1, step:0.01, show:'fin.look!=none'},
  {pg:'fin', sub:'光'},
  {pg:'fin', r:'fin.bloom', l:'ブルーム（明るい所がにじむ）', min:0, max:1, step:0.01},
  {pg:'fin', r:'fin.leak', l:'光漏れ', min:0, max:1, step:0.01},
  {pg:'fin', sel:'fin.leakPos', l:'光漏れの位置', opts:[['tl', '左上'], ['tr', '右上'], ['bl', '左下'], ['br', '右下'], ['l', '左'], ['r', '右']]},
  {pg:'fin', c:'fin.leakC', l:'光漏れの色'},
  {pg:'fin', r:'fin.vig', l:'周辺減光', min:0, max:1, step:0.01},
  {pg:'fin', sub:'質感'},
  {pg:'fin', r:'fin.grain', l:'フィルムの粒子', min:0, max:1, step:0.01},
  {pg:'fin', r:'fin.rgb', l:'色ずれ（RGB）', min:0, max:30, step:0.5},
  {pg:'fin', r:'fin.scan', l:'走査線（VHS風）', min:0, max:1, step:0.01},
  {pg:'fin', r:'fin.half', l:'網点（アメコミ風）', min:0, max:1, step:0.01},
  {pg:'fin', r:'fin.halfSize', l:'網点の大きさ', min:4, max:40, step:1},
];
const FX_CHIPS = [['focus', '集中'], ['lines', '集中線'], ['speed', '疾走'], ['soft', 'ふんわり'], ['pop', '文字を目立たせる'], ['vivid', '鮮やか'],
  ['mono', 'モノクロ'], ['retro', 'レトロ'], ['duo', 'デュオトーン'], ['red', 'モノクロ＋赤'], ['spot', 'スポットライト'], ['mosaic', 'モザイク'],
  ['horror', 'ホラー'], ['emo', 'エモい'], ['game', 'ゲーム実況'], ['news', 'ニュース'], ['manga', 'マンガ'], ['shock', 'ガーン'], ['mini', 'ミニチュア'],
  ['popart', 'ポップアート'], ['illust', 'イラスト風'], ['sunray', '放射ライン'], ['win', '優勝・お祝い'], ['winter', '冬・雪'], ['rain', '雨'], ['reset', 'リセット']];
// 行がどのページ（タブ）に出るか。行の定義の pg（"frame|edge" のように複数可）で決める
const rowPg = (r, bg) => r.pg || (bg ? 'main' : 'base');
const drowPg = (r, bg) => `<div data-pg="${rowPg(r, bg)}">${drow(r)}</div>`;
function drow(r){
  const sa = r.show ? ` data-dshow="${r.show}"` : '';
  if(r.layouts) return `<div class="row"${sa}><label>${r.l}</label><div class="seg shapes lays" data-dseg="@layout">${[2, 3, 4, 5, 6].flatMap(n => COLLAGE_LAYOUTS.filter(l => l[2](n)).map(([k, t]) => `<button data-v="${k}" data-dshow="@n=${n}" title="${t}"><img src="${collageIcon(k, n)}" alt="${t}"></button>`)).join('')}</div></div>`;
  if(r.flips) return `<div class="row"${sa}><label>${r.l}</label><div class="crow flips"><button class="btn sm" data-flip="flip" title="左右反転（H）">${ic('fliph')}左右</button><button class="btn sm" data-flip="flipV" title="上下反転（V）">${ic('flipv')}上下</button></div></div>`;
  if(r.cells) return `<div class="cellBox"${sa}></div>`;
  if(r.cfxchips) return `<div${sa}><div class="subhead" style="margin-top:18px">ワンクリック効果</div><div class="pcats fxchips">${CELL_FX_CHIPS.map(([k, t]) => `<button data-cfx="${k}">${t}</button>`).join('')}</div></div>`;
  if(r.frpre){ const nm = Object.fromEntries(FRAME_PRESETS.map(p => [p[0], p[1]]));
    return `<div${sa}>${FRAME_GROUPS.map(([g, ks]) => `<div class="frgrp">${g}</div><div class="pcats frpre">${ks.map(k => `<button data-frpre="${k}">${nm[k]}</button>`).join('')}</div>`).join('')}<div class="pcats frpre"><button data-frpre="off">フレームなし</button></div></div>`; }
  if(r.shapes) return `<div class="row"${sa}><label>${r.l}</label><div class="seg shapes" data-dseg="@frame.shape">${FRAME_SHAPES.map(([k, t]) => `<button data-v="${k}" title="${t}">${k === 'none' ? '<span>なし</span>' : `<img src="${shapeIcon(k)}" alt="${t}">`}</button>`).join('')}</div></div>`;
  if(r.sub) return `<div class="subhead" style="margin-top:24px"${sa}>${r.sub}${r.note ? `<span class="subnote">${r.note}</span>` : ''}</div>`;
  if(r.addfx) return `<div class="subhead" style="margin-top:26px">動的エフェクト<span class="subnote">レイヤーとして追加され、文字や画像と同じように移動・拡大縮小・回転できます</span></div><div class="crow">${Object.keys(FX_DEF).map(k => `<button class="btn sm" data-addfx="${k}">${ic(FX_ICONS[k])}${FX_NAMES[k]}</button>`).join('')}</div>`;
  if(r.finchips) return `<div${sa}><div class="subhead" style="margin-top:18px">ワンクリック仕上げ<span class="subnote">サムネ全体の雰囲気を一発で変えます</span></div><div class="pcats fxchips">${Object.entries(FIN_PRESETS).map(([k, v]) => `<button data-finfx="${k}">${v[0]}</button>`).join('')}</div></div>`;
  if(r.fx) return `<div${sa}><div class="subhead" style="margin-top:18px">ワンクリック背景エフェクト</div><div class="pcats fxchips">${FX_CHIPS.map(([k, t]) => `<button data-bgfx="${k}">${t}</button>`).join('')}</div></div>`;
  if(r.place) return `<div class="row"${sa}><label>${r.l}</label><div class="place">${['t', 'm', 'b'].map(v => ['l', 'c', 'r'].map(h => `<button data-place="${h}${v}" title="この位置に配置"></button>`).join('')).join('')}</div></div>`;
  if(r.btns) return `<div class="crow"${sa}>${r.btns.map(([id, icn, t]) => `<button class="btn sm" id="${id}">${ic(icn)}${t}</button>`).join('')}</div>`;
  return DB.row(r);
}

const shapeIconCache = {};
function shapeIcon(k){
  if(shapeIconCache[k]) return shapeIconCache[k];
  const c = mk(44, 44), x = c.getContext('2d'); x.translate(22, 22); x.beginPath(); framePath(x, k, 32, 32, 0.2); x.fillStyle = '#1f1b2d'; x.fill();
  return shapeIconCache[k] = c.toDataURL();
}
/* ---------- モード・タブ ---------- */
/* ---------- 選んだものに合わせた設定パネル ---------- */
let curPage = null, insKey = '', pendingPage = null;
const lastPage = LS.get('ttm_pages', {});
const INS_PAGES = {
  textmode:[['txt-text', 'テキスト'], ['txt-style', 'スタイル'], ['txt-font', 'フォント'], ['txt-deco', '装飾']],
  text:[['txt-text', 'テキスト'], ['txt-style', 'スタイル'], ['txt-font', 'フォント'], ['txt-deco', '装飾'], ['lay-base', '配置']],
  image:[['lay-base', '配置'], ['lay-frame', 'フレーム'], ['lay-edge', 'フチ・影'], ['lay-color', '色'], ['lay-cut', '背景透過']],
  collage:[['lay-split', '分割'], ['lay-cells', 'マスの画像'], ['lay-cfx', '効果'], ['lay-base', '配置']],
  fx:[['lay-fx', 'エフェクト'], ['lay-base', '配置']],
  group:[['lay-cfx', '効果'], ['lay-base', '配置']],
  bg:[['bg-main', '背景'], ['bg-tone', '色調'], ['bg-fx', '効果'], ['bg-fin', '仕上げ']],
};
const INS_INFO = {textmode:['text', '文字素材'], text:['text', '文字'], image:['image', '画像'], collage:['grid', '分割フレーム'], group:['group', 'グループ'], fx:['fxadd', '動的エフェクト'], bg:['sliders', '背景']};
function insCtx(){ if(!DOC || DOC.mode === 'text') return 'textmode'; const L = selLayer(); return L ? L.type : 'bg'; }
function setPage(page){
  const ctx = insCtx(); curPage = page; lastPage[ctx] = page; LS.set('ttm_pages', lastPage);
  const pane = {'txt-text':'text', 'txt-font':'text', 'txt-style':'style', 'txt-deco':'design'}[page] || 'thumb';
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.dataset.pane === pane));
  const tp = document.querySelector('.pane[data-pane=text]'), [ts, fs] = tp.querySelectorAll(':scope > section');
  ts.classList.toggle('secoff', page !== 'txt-text'); fs.classList.toggle('secoff', page !== 'txt-font');
  $('#layerSec').classList.toggle('secoff', !page.startsWith('lay-')); $('#bgSec').classList.toggle('secoff', !page.startsWith('bg-'));
  const pg = page.split('-')[1];
  document.querySelectorAll('#selBox [data-pg], #bgRows [data-pg]').forEach(el => el.classList.toggle('pgoff', !el.dataset.pg.split('|').includes(pg)));
  document.querySelectorAll('#tabs [data-page]').forEach(b => b.classList.toggle('on', b.dataset.page === page));
  const pn = document.querySelector('.pane.on'); if(pn) pn.scrollTop = 0;
}
function renderInspector(force){
  if(!DOC || !$('#insHead')) return;
  const ctx = insCtx(), L = selLayer(), key = ctx + '|' + (L ? L.id : ''), [icn, typ] = INS_INFO[ctx];
  const name = ctx === 'bg' ? '何も選んでいないときは背景の設定です' : ctx === 'textmode' ? '文字だけを透過PNGで作ります' : layerName(L);
  if($('#insName').textContent !== name) $('#insName').textContent = name;
  if(key === insKey && !force) return;
  $('#insIc').innerHTML = ic(icn); $('#insType').textContent = typ; $('#insDesel').style.display = ctx !== 'bg' && ctx !== 'textmode' ? '' : 'none';
  insKey = key;
  const pages = INS_PAGES[ctx];
  $('#tabs').innerHTML = pages.map(([p, t]) => `<button data-page="${p}">${t}</button>`).join('');
  const has = p => p && pages.some(q => q[0] === p);
  const want = has(pendingPage) ? pendingPage : has(lastPage[ctx]) ? lastPage[ctx] : pages[0][0];
  pendingPage = null; setPage(want);
  if(isMobile && sheet === 'ins') $('#sheetTitle').textContent = typ;
}
// ページを指定して設定パネルを開く（page 省略で、選んだものの既定のページ）
function openInspector(page){ pendingPage = page || null; renderInspector(true); if(isMobile) openSheet('ins', true); }
function setMode(m, silent){
  DOC.mode = m;
  document.body.classList.toggle('mode-thumb', m === 'thumb'); document.body.classList.toggle('mode-text', m === 'text');
  document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  $('#dlLabel').textContent = isMobile ? '保存' : (m === 'thumb' ? 'サムネを保存' : '透過PNGを保存');
  if(m === 'text' && (sheet === 'layers' || sheet === 'add')) openSheet(null);
  renderInspector(true);
  if(m === 'thumb' && $('#stage').classList.contains('img')) setBg('checker');
  saveDoc();
  if(!silent){ clearTimeout(schT); schT = setTimeout(update, 10); }
}

