/* 楽ちんサムネメーカー：文字スタイルのプリセット */
/*
  文字素材モードの「スタイル」ボタン（#presets）の定義と、その一覧表示・適用。
  公開：PRESETS（データ）/ PCATS（分類）/ renderPresets()（boot と素材置き場の変更時に呼ぶ）/ applyPreset(p)。
  データの形：PRESETS = [[表示名, スタイル], …]。スタイルは core.js の DEFAULT との「差分」だけを書く
  （例：extrude:{on:false} のように、変えたい効果のキーだけ。書かなかった項目は merged() が DEFAULT で補う）。
  キーの意味と単位は DEFAULT と text-render.js を参照。一部だけ書いたオブジェクト値は、キー単位で DEFAULT に重なる。
  ・strokes は 3 本まとめて置き換わる（[内側, 中, 外側] の順で、on:false のものは描かれない）。配列は部分指定できない。
    w は「その線の太さ」で、外側ほど内側の太さを足した位置に重ねて描かれる（text-render.js の cum）。
  ・a / hl / sh などの 0〜1 の値は .45 のように先頭の 0 を省いて書いてある。
  ・表示名は PCATS の分類リストからも参照される。名前を変えるときは PCATS も直さないと、その分類に出なくなる（「すべて」には出る）。
  依存：merged・LS・hex2rgb（core.js）、METALS（text-render.js）、myStyles・libDelete（thumb/library.js）、findFont・ensureCss（fonts.js）、
  resetAdj（colors.js）、refreshTextUI・schedule、toast。
*/
/* ============ プリセット ============ */
const P = (o) => o;
const PRESETS = [
  ['対戦格闘', {font:'Dela Gothic One',weight:400,fillType:'grad',fill1:'#ffffff',fill2:'#ffe14d',accent1:'#ff3b3b',accent2:'#ffb000',
    strokes:[{on:true,w:9,c:'#141414'},{on:true,w:11,c:'#ff2d55'},{on:false,w:7,c:'#ffffff'}],
    extrude:{on:true,depth:12,angle:60,c:'#6a0018',shade:.45},shadow:{on:true,x:6,y:10,blur:14,c:'#000000',a:.55},skew:6}],
  ['メタル金', {font:'Dela Gothic One',weight:400,fillType:'metal',metal:'gold',accent1:'#ffffff',accent2:'#ffe9a0',
    strokes:[{on:true,w:5,c:'#3a2500'},{on:true,w:6,c:'#ffe9a0'},{on:true,w:4,c:'#241600'}],
    bevel:{on:true,style:'emboss',target:'both',size:8,depth:1.2,angle:225,hl:.85,sh:.55},gloss:{on:true,a:.35,h:.42,curve:.4},
    extrude:{on:true,depth:10,angle:70,c:'#2a1a00',shade:.5},shadow:{on:true,x:4,y:12,blur:18,c:'#000000',a:.6},skew:0}],
  ['クローム', {font:'Dela Gothic One',weight:400,fillType:'metal',metal:'chrome',accent1:'#ffd84d',accent2:'#ff8a00',
    strokes:[{on:true,w:4,c:'#10151c'},{on:true,w:6,c:'#e6ecf2'},{on:true,w:3,c:'#0b0f14'}],
    bevel:{on:true,style:'emboss',target:'both',size:6,depth:1.4,angle:225,hl:.9,sh:.6},
    extrude:{on:true,depth:9,angle:65,c:'#1a2230',shade:.5},shadow:{on:true,x:4,y:12,blur:16,c:'#000000',a:.6},skew:8}],
  ['シルバー', {font:'Zen Kaku Gothic New',weight:900,fillType:'metal',metal:'silver',accent1:'#6fd3ff',accent2:'#1e7bd6',
    strokes:[{on:true,w:5,c:'#1c2026'},{on:true,w:4,c:'#ffffff'},{on:false,w:4,c:'#1c2026'}],
    bevel:{on:true,style:'emboss',target:'fill',size:6,depth:1.1,angle:225,hl:.8,sh:.5},gloss:{on:true,a:.3,h:.4,curve:.3},
    extrude:{on:false},shadow:{on:true,x:0,y:10,blur:18,c:'#000000',a:.55},skew:0}],
  ['ホログラム', {font:'M PLUS Rounded 1c',weight:900,fillType:'metal',metal:'holo',accent1:'#ffffff',accent2:'#fff3a0',
    strokes:[{on:true,w:6,c:'#ffffff'},{on:true,w:5,c:'#7a5cff'},{on:false,w:4,c:'#ffffff'}],
    bevel:{on:true,style:'emboss',target:'fill',size:7,depth:.9,angle:225,hl:.7,sh:.3},gloss:{on:true,a:.4,h:.45,curve:.5},
    extrude:{on:false},shadow:{on:false},glow:{on:true,blur:30,c:'#c9b0ff',a:.8,str:2}}],
  ['ガンメタ', {font:'Dela Gothic One',weight:400,fillType:'metal',metal:'gunmetal',accent1:'#ff3b3b',accent2:'#8a0000',
    strokes:[{on:true,w:4,c:'#000000'},{on:true,w:4,c:'#9aa3ad'},{on:true,w:3,c:'#000000'}],
    pattern:{on:true,type:'stripe',c:'#ffffff',a:.1,size:10,angle:45},
    bevel:{on:true,style:'emboss',target:'both',size:6,depth:1.2,angle:225,hl:.7,sh:.6},
    extrude:{on:true,depth:8,angle:60,c:'#0c0e11',shade:.3},shadow:{on:true,x:4,y:10,blur:14,c:'#000000',a:.6},skew:6}],
  ['白フチ', {font:'Noto Sans JP',weight:900,fillType:'solid',fill1:'#1b1b1b',accent1:'#e8132b',accent2:'#e8132b',
    strokes:[{on:true,w:12,c:'#ffffff'},{on:false,w:6,c:'#000000'},{on:false,w:6,c:'#ffffff'}],
    extrude:{on:false},shadow:{on:true,x:0,y:6,blur:16,c:'#000000',a:.45},skew:0}],
  ['ネオン', {font:'M PLUS Rounded 1c',weight:800,fillType:'solid',fill1:'#ffffff',accent1:'#fff38a',accent2:'#fff38a',
    strokes:[{on:true,w:4,c:'#ff3df0'},{on:true,w:3,c:'#ffffff'},{on:false,w:4,c:'#ff3df0'}],
    extrude:{on:false},shadow:{on:false},glow:{on:true,blur:38,c:'#ff3df0',a:1,str:3},skew:0}],
  ['2色ネオン', {font:'M PLUS Rounded 1c',weight:800,fillType:'solid',fill1:'#ffffff',accent1:'#fff38a',accent2:'#fff38a',
    strokes:[{on:true,w:4,c:'#00e5ff'},{on:true,w:3,c:'#ffffff'},{on:false,w:4,c:'#00e5ff'}],
    extrude:{on:false},shadow:{on:false},glow:{on:true,blur:40,c:'#00e5ff',a:1,str:2,dual:true,c2:'#ff2bd6'},skew:0}],
  ['ポップ', {font:'Mochiy Pop One',weight:400,fillType:'solid',fill1:'#ffffff',accent1:'#fff200',accent2:'#fff200',
    strokes:[{on:true,w:10,c:'#ff4f9a'},{on:true,w:8,c:'#ffffff'},{on:false,w:6,c:'#ff4f9a'}],
    extrude:{on:true,depth:10,angle:55,c:'#c2185b',shade:.35},shadow:{on:false},skew:0,rotate:-3}],
  ['ぷるぷる', {font:'Mochiy Pop One',weight:400,fillType:'grad',fill1:'#ffffff',fill2:'#ffe3f1',accent1:'#fff36b',accent2:'#ffb300',
    strokes:[{on:true,w:9,c:'#ff4f9a'},{on:true,w:8,c:'#ffffff'},{on:false,w:6,c:'#ff4f9a'}],
    gloss:{on:true,a:.5,h:.4,curve:.5},jitter:{on:true,rot:9,y:12,scale:.1,seed:3},warp:{type:'bulge',amt:.22},
    extrude:{on:true,depth:9,angle:70,c:'#c2185b',shade:.3},shadow:{on:false},skew:0}],
  ['アーチ', {font:'RocknRoll One',weight:400,fillType:'grad',fill1:'#ffffff',fill2:'#9fe7ff',accent1:'#fff36b',accent2:'#ffb300',
    strokes:[{on:true,w:8,c:'#0b3d91'},{on:true,w:7,c:'#ffffff'},{on:false,w:6,c:'#0b3d91'}],
    warp:{type:'arch',amt:.35},extrude:{on:true,depth:9,angle:75,c:'#0b3d91',shade:.3},shadow:{on:true,x:0,y:10,blur:14,c:'#000000',a:.45},skew:0}],
  ['マーカー', {font:'Zen Maru Gothic',weight:900,fillType:'solid',fill1:'#1b1b1b',accent1:'#e8132b',accent2:'#e8132b',
    strokes:[{on:true,w:6,c:'#ffffff'},{on:false,w:6,c:'#000000'},{on:false,w:6,c:'#ffffff'}],
    marker:{on:true,c:'#fff200',a:.9,h:.38,pos:.78,over:.2},extrude:{on:false},shadow:{on:true,x:0,y:6,blur:12,c:'#000000',a:.3},skew:0}],
  ['彫り込み', {font:'Shippori Mincho',weight:800,fillType:'solid',fill1:'#c9b18a',accent1:'#b33a2b',accent2:'#b33a2b',
    strokes:[{on:true,w:6,c:'#3a2a18'},{on:false,w:6,c:'#000000'},{on:false,w:6,c:'#ffffff'}],
    pattern:{on:true,type:'noise',c:'#3a2a18',a:.25,size:10,angle:0},
    bevel:{on:true,style:'deboss',target:'fill',size:9,depth:1.3,angle:225,hl:.6,sh:.7},
    extrude:{on:false},shadow:{on:true,x:0,y:6,blur:10,c:'#000000',a:.45},skew:0}],
  ['ホラー', {font:'Yuji Boku',weight:400,fillType:'grad',fill1:'#e8e8e8',fill2:'#7a0000',accent1:'#ff1a1a',accent2:'#5a0000',
    strokes:[{on:true,w:6,c:'#000000'},{on:false,w:4,c:'#300000'},{on:false,w:4,c:'#000000'}],
    grunge:{on:true,amt:.35,size:3,seed:2},
    extrude:{on:false},shadow:{on:true,x:0,y:8,blur:10,c:'#000000',a:.8},glow:{on:true,blur:26,c:'#ff0000',a:.55,str:2},skew:0,rotate:-2}],
  ['ボロボロ', {font:'Dela Gothic One',weight:400,fillType:'solid',fill1:'#ece4d0',accent1:'#d62828',accent2:'#d62828',
    strokes:[{on:true,w:7,c:'#1a1410'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],
    grunge:{on:true,amt:.7,size:4,seed:5},extrude:{on:true,depth:7,angle:60,c:'#1a1410',shade:0},shadow:{on:false},skew:0,rotate:-3}],
  ['グリッチ', {font:'DotGothic16',weight:400,fillType:'solid',fill1:'#ffffff',accent1:'#00ffc6',accent2:'#00ffc6',
    strokes:[{on:true,w:3,c:'#0a0a12'},{on:false,w:3,c:'#000000'},{on:false,w:3,c:'#000000'}],
    glitch:{on:true,rgb:8,slices:8,shift:34,seed:4},extrude:{on:false},shadow:{on:false},skew:0}],
  ['サイバー', {font:'DotGothic16',weight:400,fillType:'grad',fill1:'#00f0ff',fill2:'#a855f7',gradAngle:0,accent1:'#ffffff',accent2:'#fff94d',
    strokes:[{on:true,w:5,c:'#0a0a1a'},{on:true,w:3,c:'#00f0ff'},{on:false,w:4,c:'#0a0a1a'}],
    extrude:{on:true,depth:6,angle:45,c:'#1a0033',shade:.3},shadow:{on:false},glow:{on:true,blur:24,c:'#00f0ff',a:.8,str:2},skew:-6}],
  ['激辛', {font:'Dela Gothic One',weight:400,fillType:'grad',fill1:'#fff200',fill2:'#ff3d00',accent1:'#ffffff',accent2:'#ffe0b2',
    strokes:[{on:true,w:8,c:'#2a0000'},{on:true,w:10,c:'#ffffff'},{on:false,w:6,c:'#2a0000'}],
    extrude:{on:true,depth:14,angle:65,c:'#7a0000',shade:.5},shadow:{on:true,x:6,y:12,blur:12,c:'#000000',a:.5},skew:10,rotate:-4}],
  ['クール', {font:'Zen Kaku Gothic New',weight:900,fillType:'grad',fill1:'#ffffff',fill2:'#6fcbff',accent1:'#ffe066',accent2:'#ffb700',
    strokes:[{on:true,w:8,c:'#0a2a5c'},{on:true,w:6,c:'#ffffff'},{on:false,w:6,c:'#0a2a5c'}],
    extrude:{on:true,depth:10,angle:60,c:'#06183a',shade:.4},shadow:{on:true,x:4,y:10,blur:16,c:'#000000',a:.5},skew:0}],
  ['手書きゆる', {font:'Yusei Magic',weight:400,fillType:'solid',fill1:'#3b2a1a',accent1:'#e8505b',accent2:'#e8505b',
    strokes:[{on:true,w:10,c:'#ffffff'},{on:false,w:4,c:'#3b2a1a'},{on:false,w:4,c:'#ffffff'}],
    jitter:{on:true,rot:5,y:6,scale:.05,seed:2},extrude:{on:false},shadow:{on:true,x:0,y:5,blur:12,c:'#000000',a:.35},skew:0,rotate:-2}],
  ['昭和レトロ', {font:'Rampart One',weight:400,fillType:'solid',fill1:'#fff4d6',accent1:'#ff5a36',accent2:'#ff5a36',
    strokes:[{on:true,w:6,c:'#1f3b73'},{on:true,w:5,c:'#fff4d6'},{on:true,w:5,c:'#1f3b73'}],
    extrude:{on:true,depth:10,angle:45,c:'#1f3b73',shade:0},shadow:{on:false},skew:0}],
  ['墨・和風', {font:'Yuji Syuku',weight:400,fillType:'solid',fill1:'#111111',accent1:'#c1121f',accent2:'#c1121f',
    strokes:[{on:true,w:8,c:'#f5efe0'},{on:false,w:4,c:'#111111'},{on:false,w:4,c:'#f5efe0'}],
    grunge:{on:true,amt:.2,size:2,seed:1},extrude:{on:false},shadow:{on:true,x:3,y:6,blur:10,c:'#000000',a:.4},skew:0}],
  ['2色分割', {font:'Dela Gothic One',weight:400,fillType:'split',splitDir:'h',splitPos:.56,fill1:'#ffffff',fill2:'#ffd400',accent1:'#ffffff',accent2:'#ff3b3b',
    strokes:[{on:true,w:8,c:'#111111'},{on:true,w:6,c:'#ffffff'},{on:false,w:4,c:'#000000'}],
    extrude:{on:true,depth:8,angle:60,c:'#111111',shade:0},shadow:{on:false},skew:6}],
  ['板ずれ', {font:'Dela Gothic One',weight:400,fillType:'solid',fill1:'#ffffff',accent1:'#ffe600',accent2:'#ffe600',
    strokes:[{on:true,w:5,c:'#111111'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],
    offset:{on:true,x:12,y:12,c:'#00c8ff',hollow:true,w:5},extrude:{on:false},shadow:{on:false},skew:0}],
  ['中抜き', {font:'Dela Gothic One',weight:400,fillType:'solid',fill1:'#ffffff',fillMode:'hollow',accent1:'#ff3b3b',accent2:'#ff3b3b',
    strokes:[{on:true,w:5,c:'#ffffff'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],
    offset:{on:true,x:10,y:10,c:'#ff2d55',hollow:false,w:4},extrude:{on:false},shadow:{on:false},skew:8}],
  ['吹き出し', {font:'Zen Maru Gothic',weight:900,fillType:'solid',fill1:'#111111',accent1:'#e8132b',accent2:'#e8132b',
    strokes:[{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],
    plate:{on:true,shape:'bubble',c:'#ffffff',a:1,sc:'#111111',sw:7,pad:.22,tail:'left'},dots:{on:true,shape:'dot',c:'#e8132b',size:.14},
    extrude:{on:false},shadow:{on:true,x:0,y:8,blur:14,c:'#000000',a:.35},skew:0}],
  ['ギザギザ', {font:'Dela Gothic One',weight:400,fillType:'solid',fill1:'#e8132b',accent1:'#111111',accent2:'#111111',
    strokes:[{on:true,w:6,c:'#ffffff'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],
    plate:{on:true,shape:'burst',c:'#ffe600',a:1,sc:'#111111',sw:6,pad:.18,seed:3},
    extrude:{on:false},shadow:{on:true,x:8,y:10,blur:0,c:'#000000',a:.9},skew:0,rotate:-4}],
  ['一文字囲み', {font:'Noto Sans JP',weight:900,fillType:'solid',fill1:'#ffffff',accent1:'#ffffff',accent2:'#ffffff',ls:14,
    strokes:[{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],
    box:{on:true,shape:'square',c:'#e8132b',alt:true,c2:'#111111',pad:.06,sc:'#ffffff',sw:0},
    extrude:{on:false},shadow:{on:true,x:6,y:8,blur:0,c:'#000000',a:.35},skew:0}],
  ['丸囲み', {font:'Mochiy Pop One',weight:400,fillType:'solid',fill1:'#ffffff',accent1:'#fff36b',accent2:'#fff36b',ls:10,
    strokes:[{on:true,w:3,c:'#1b1b1b'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],
    box:{on:true,shape:'circle',c:'#ff8a00',alt:true,c2:'#2a9df4',pad:.04,sc:'#ffffff',sw:4},jitter:{on:true,rot:8,y:6,scale:0,seed:2},
    extrude:{on:false},shadow:{on:true,x:0,y:8,blur:12,c:'#000000',a:.3},skew:0}],
  ['ロングシャドウ', {font:'Dela Gothic One',weight:400,fillType:'solid',fill1:'#ffffff',accent1:'#ffe600',accent2:'#ffe600',
    strokes:[{on:true,w:3,c:'#111111'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],
    extrude:{on:true,depth:48,angle:45,c:'#1b1b2f',shade:0,fade:.8},shadow:{on:false},skew:0}],
  ['ストライプ立体', {font:'Dela Gothic One',weight:400,fillType:'solid',fill1:'#fff4d6',accent1:'#ffd23f',accent2:'#ffd23f',
    strokes:[{on:true,w:4,c:'#2b2d42'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],
    extrude:{on:true,depth:18,angle:45,c:'#ef476f',shade:0,stripe:true,c2:'#2b2d42',stripeW:2},shadow:{on:false},skew:0}],
  ['鏡面', {font:'Zen Kaku Gothic New',weight:900,fillType:'metal',metal:'chrome',accent1:'#ffd84d',accent2:'#ff8a00',
    strokes:[{on:true,w:3,c:'#0b0f14'},{on:true,w:3,c:'#e6ecf2'},{on:false,w:4,c:'#000000'}],
    bevel:{on:true,style:'emboss',target:'fill',size:6,depth:1.2,angle:225,hl:.85,sh:.55},reflect:{on:true,a:.4,gap:6,len:.6},
    extrude:{on:false},shadow:{on:false},skew:0}],
  ['レタープレス', {font:'Shippori Mincho',weight:800,fillType:'solid',fill1:'#2f3542',accent1:'#c0392b',accent2:'#c0392b',
    strokes:[{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],
    inner:{on:true,x:3,y:5,blur:5,c:'#000000',a:.7},bevel:{on:true,style:'deboss',target:'fill',size:5,depth:.8,angle:225,hl:.35,sh:.3},
    extrude:{on:false},shadow:{on:true,x:0,y:2,blur:0,c:'#ffffff',a:.5},skew:0}],
  ['炎上', {font:'Dela Gothic One',weight:400,fillType:'grad',fill1:'#fff7b0',fill2:'#ff5a1f',accent1:'#ffffff',accent2:'#ffd400',
    strokes:[{on:true,w:6,c:'#3a0000'},{on:true,w:5,c:'#ffb000'},{on:false,w:4,c:'#000000'}],fire:{on:true,height:1.1,wild:.65,seed:2},
    glow:{on:true,blur:22,c:'#ff6a00',a:.6,str:1},extrude:{on:true,depth:8,angle:70,c:'#5a0000',shade:.3},shadow:{on:false},skew:6}],
  ['スライム', {font:'Mochiy Pop One',weight:400,fillType:'grad',fill1:'#c6ff7a',fill2:'#2dbd2d',accent1:'#fff36b',accent2:'#ffb300',
    strokes:[{on:true,w:6,c:'#0b3d0b'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],drip:{on:true,style:'round',amt:.45,len:.7,w:.13,sample:true,seed:3},
    gloss:{on:true,a:.45,h:.4,curve:.4},bevel:{on:true,style:'emboss',target:'fill',size:8,depth:.8,angle:225,hl:.6,sh:.3},
    extrude:{on:false},shadow:{on:true,x:0,y:10,blur:14,c:'#000000',a:.4},skew:0}],
  ['氷', {font:'Dela Gothic One',weight:400,fillType:'grad',fill1:'#ffffff',fill2:'#8fdcff',accent1:'#ffffff',accent2:'#c9f1ff',
    strokes:[{on:true,w:5,c:'#0b3d91'},{on:true,w:4,c:'#e6f7ff'},{on:false,w:4,c:'#000000'}],drip:{on:true,style:'icicle',amt:.5,len:.45,w:.1,sample:true,seed:4},
    pattern:{on:true,type:'noise',c:'#ffffff',a:.35,size:8,angle:0},bevel:{on:true,style:'emboss',target:'fill',size:6,depth:1,angle:225,hl:.8,sh:.35},
    sparkle:{on:true,count:10,size:.18,c:'#ffffff',glow:true,seed:2},extrude:{on:false},shadow:{on:true,x:0,y:8,blur:14,c:'#06183a',a:.45},skew:0}],
  ['キラキラ', {font:'M PLUS Rounded 1c',weight:900,fillType:'metal',metal:'rosegold',accent1:'#ffffff',accent2:'#ffe3ef',
    strokes:[{on:true,w:5,c:'#ffffff'},{on:true,w:5,c:'#d6589b'},{on:false,w:4,c:'#000000'}],pattern:{on:true,type:'glitter',c:'#ffd1e8',a:.7,size:10,angle:0},
    bevel:{on:true,style:'emboss',target:'fill',size:6,depth:.9,angle:225,hl:.7,sh:.35},sparkle:{on:true,count:18,size:.24,c:'#ffffff',glow:true,seed:5},
    extrude:{on:false},shadow:{on:true,x:0,y:8,blur:16,c:'#6a0036',a:.35},skew:0}],
  ['アメコミ', {font:'Dela Gothic One',weight:400,fillType:'solid',fill1:'#ffe600',accent1:'#ff2d2d',accent2:'#ff2d2d',
    strokes:[{on:true,w:7,c:'#111111'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],pattern:{on:true,type:'halftone',c:'#ff5a1f',a:.9,size:14,angle:45},
    offset:{on:true,x:12,y:12,c:'#111111',hollow:false,w:4},extrude:{on:false},shadow:{on:false},skew:-8,rotate:-3}],
  ['アウトラン', {font:'Dela Gothic One',weight:400,fillType:'metal',metal:'chrome',accent1:'#ff7ad9',accent2:'#7a2bff',
    strokes:[{on:true,w:3,c:'#1a0033'},{on:true,w:4,c:'#ff2bd6'},{on:false,w:4,c:'#000000'}],pattern:{on:true,type:'cutlines',c:'#000000',a:.5,size:15,angle:0},
    glow:{on:true,blur:30,c:'#ff2bd6',a:.8,str:2},bevel:{on:true,style:'emboss',target:'fill',size:5,depth:1.1,angle:225,hl:.8,sh:.5},
    extrude:{on:false},shadow:{on:false},skew:-10}],
  ['ステッカー', {font:'Mochiy Pop One',weight:400,fillType:'grad',fill1:'#ff6b6b',fill2:'#ff2d8a',accent1:'#fff36b',accent2:'#ffb300',
    strokes:[{on:true,w:3,c:'#1b1b1b'},{on:true,w:16,c:'#ffffff'},{on:false,w:4,c:'#000000'}],extrude:{on:false},shadow:{on:true,x:0,y:10,blur:14,c:'#000000',a:.35},skew:0,rotate:-4}],
  ['バブル', {font:'Potta One',weight:400,fillType:'grad',fill1:'#9ff3ff',fill2:'#2f7dff',accent1:'#fff36b',accent2:'#ff9a1f',
    strokes:[{on:true,w:10,c:'#0b1f4d'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],bevel:{on:true,style:'emboss',target:'fill',size:16,depth:1.1,angle:225,hl:.8,sh:.35},
    gloss:{on:true,a:.6,h:.35,curve:.6},extrude:{on:true,depth:8,angle:80,c:'#0b1f4d',shade:0},shadow:{on:false},
    jitter:{on:true,rot:5,y:6,scale:.05,seed:4},skew:0}],
  ['スピード', {font:'Dela Gothic One',weight:400,fillType:'grad',fill1:'#ffffff',fill2:'#ffe14d',accent1:'#ff3b3b',accent2:'#ffb000',
    strokes:[{on:true,w:6,c:'#111111'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],trail:{on:true,angle:180,len:1.1,count:10,a:.55,tint:true,c:'#ff2d55'},
    extrude:{on:false},shadow:{on:false},skew:14}],
  ['電飾', {font:'Dela Gothic One',weight:400,fillType:'solid',fill1:'#b3001b',accent1:'#1f3b73',accent2:'#1f3b73',
    strokes:[{on:true,w:5,c:'#ffd166'},{on:true,w:5,c:'#3a0008'},{on:false,w:4,c:'#000000'}],bulbs:{on:true,gap:.16,size:.035,c:'#ffe27a',glow:.9},
    extrude:{on:true,depth:10,angle:65,c:'#2a0006',shade:.3},shadow:{on:true,x:0,y:10,blur:16,c:'#000000',a:.5},skew:0}],
  ['ぐにゃぐにゃ', {font:'Mochiy Pop One',weight:400,fillType:'grad',fill1:'#ffb3f0',fill2:'#8a7dff',accent1:'#fff36b',accent2:'#3ddc97',
    strokes:[{on:true,w:6,c:'#2b1055'},{on:true,w:6,c:'#ffffff'},{on:false,w:4,c:'#000000'}],distort:{on:true,amt:9,scale:45,seed:3},
    extrude:{on:true,depth:8,angle:70,c:'#2b1055',shade:0},shadow:{on:false},skew:0}],
  ['ランサム', {font:'Noto Sans JP',weight:900,fillType:'solid',fill1:'#ffffff',accent1:'#ffffff',accent2:'#ffffff',ls:18,
    strokes:[{on:true,w:3,c:'#111111'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],box:{on:true,shape:'square',c:'#e8132b',alt:false,rand:true,c2:'#111111',pad:.02,sc:'#ffffff',sw:0},
    jitter:{on:true,rot:10,y:10,scale:.1,seed:6},extrude:{on:false},shadow:{on:true,x:4,y:6,blur:0,c:'#000000',a:.5},skew:0}],
  // ---- ニュース・バラエティ ----
  ['速報', {font:'Noto Sans JP',weight:900,fillType:'solid',fill1:'#ffffff',accent1:'#ffe600',accent2:'#ffe600',
    strokes:[{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],
    plate:{on:true,shape:'round',c:'#e8132b',a:1,sc:'#ffffff',sw:5,pad:.2},extrude:{on:false},shadow:{on:true,x:0,y:8,blur:14,c:'#000000',a:.45},skew:0}],
  ['衝撃', {font:'Dela Gothic One',weight:400,fillType:'grad',fill1:'#fff7a0',fill2:'#ffb000',accent1:'#ffffff',accent2:'#ff3b3b',
    strokes:[{on:true,w:7,c:'#111111'},{on:true,w:9,c:'#e8132b'},{on:true,w:6,c:'#ffffff'}],
    extrude:{on:true,depth:10,angle:70,c:'#5a0000',shade:.3},shadow:{on:true,x:0,y:10,blur:16,c:'#000000',a:.55},skew:8,rotate:-3,
    jitter:{on:true,rot:4,y:8,scale:.06,seed:7}}],
  ['テロップ黄', {font:'Noto Sans JP',weight:900,fillType:'solid',fill1:'#ffe600',accent1:'#ffffff',accent2:'#ffffff',
    strokes:[{on:true,w:10,c:'#111111'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],
    extrude:{on:false},shadow:{on:true,x:4,y:6,blur:0,c:'#000000',a:.6},skew:0}],
  ['3色フチ', {font:'RocknRoll One',weight:400,fillType:'solid',fill1:'#ffffff',accent1:'#fff200',accent2:'#fff200',
    strokes:[{on:true,w:7,c:'#ff3d8b'},{on:true,w:7,c:'#ffe600'},{on:true,w:7,c:'#1b1b1b'}],
    extrude:{on:true,depth:8,angle:65,c:'#1b1b1b',shade:0},shadow:{on:false},skew:0,rotate:-2}],
  ['クイズ', {font:'Zen Kaku Gothic New',weight:900,fillType:'grad',fill1:'#ffffff',fill2:'#d8f0ff',accent1:'#ff3b3b',accent2:'#ff3b3b',
    strokes:[{on:true,w:8,c:'#0047c2'},{on:true,w:8,c:'#ffd400'},{on:true,w:4,c:'#0a1f4d'}],
    extrude:{on:true,depth:8,angle:70,c:'#0a1f4d',shade:.2},shadow:{on:false},skew:0}],
  ['号外', {font:'Shippori Antique B1',weight:400,fillType:'solid',fill1:'#111111',accent1:'#c1121f',accent2:'#c1121f',
    strokes:[{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],
    plate:{on:true,shape:'para',c:'#f4ecd8',a:1,sc:'#111111',sw:4,pad:.24},grunge:{on:true,amt:.18,size:2,seed:3},
    extrude:{on:false},shadow:{on:true,x:6,y:8,blur:0,c:'#000000',a:.5},skew:0}],
  // ---- ゲーム ----
  ['勝利', {font:'Dela Gothic One',weight:400,fillType:'metal',metal:'gold',accent1:'#ffffff',accent2:'#fff1a6',
    strokes:[{on:true,w:4,c:'#3a2500'},{on:true,w:8,c:'#c1121f'},{on:true,w:4,c:'#ffe9a0'}],
    bevel:{on:true,style:'emboss',target:'fill',size:7,depth:1.2,angle:225,hl:.85,sh:.5},sparkle:{on:true,count:12,size:.22,c:'#ffffff',glow:true,seed:3},
    glow:{on:true,blur:34,c:'#ffd400',a:.7,str:2},extrude:{on:true,depth:10,angle:75,c:'#3a0008',shade:.3},shadow:{on:false},skew:0}],
  ['敗北', {font:'Dela Gothic One',weight:400,fillType:'grad',fill1:'#ffffff',fill2:'#8a93a0',accent1:'#6fa8ff',accent2:'#6fa8ff',
    strokes:[{on:true,w:7,c:'#0d1117'},{on:true,w:4,c:'#5b7bb0'},{on:false,w:4,c:'#000000'}],grunge:{on:true,amt:.3,size:3,seed:9},
    glow:{on:true,blur:26,c:'#3a5a9a',a:.6,str:1},extrude:{on:false},shadow:{on:true,x:0,y:10,blur:18,c:'#000000',a:.7},skew:0,rotate:4}],
  ['レトロゲーム', {font:'DotGothic16',weight:400,fillType:'split',splitDir:'h',splitPos:.5,fill1:'#ffffff',fill2:'#ffd400',accent1:'#ff3b3b',accent2:'#ff3b3b',
    strokes:[{on:true,w:6,c:'#1a1aa6'},{on:true,w:4,c:'#ffffff'},{on:false,w:4,c:'#000000'}],
    extrude:{on:true,depth:8,angle:45,c:'#0a0a40',shade:0},shadow:{on:false},skew:0}],
  ['RPG', {font:'Zen Antique',weight:400,fillType:'grad',fill1:'#fffbe8',fill2:'#ffcf5a',accent1:'#7fe3ff',accent2:'#7fe3ff',
    strokes:[{on:true,w:4,c:'#3a2500'},{on:true,w:5,c:'#fff1c2'},{on:true,w:5,c:'#1a2a5c'}],
    bevel:{on:true,style:'emboss',target:'fill',size:5,depth:1,angle:225,hl:.7,sh:.4},
    extrude:{on:false},shadow:{on:true,x:0,y:8,blur:18,c:'#000000',a:.6},glow:{on:true,blur:26,c:'#ffd56b',a:.45,str:1},skew:0}],
  ['eスポーツ', {font:'Dela Gothic One',weight:400,fillType:'grad',fill1:'#ffffff',fill2:'#3de0ff',gradAngle:90,accent1:'#ffe600',accent2:'#ffe600',
    strokes:[{on:true,w:3,c:'#ffffff'},{on:true,w:6,c:'#0a1a3a'},{on:false,w:4,c:'#000000'}],
    trail:{on:true,angle:180,len:.9,count:8,a:.5,tint:true,c:'#2f5bff'},pattern:{on:true,type:'stripe',c:'#0a1a3a',a:.12,size:8,angle:60},
    extrude:{on:false},shadow:{on:false},glow:{on:true,blur:22,c:'#2f9bff',a:.7,str:1},skew:-14}],
  ['必殺技', {font:'Dela Gothic One',weight:400,fillType:'grad',fill1:'#ffffff',fill2:'#ff5a1f',fill3on:true,fill3:'#ffe14d',accent1:'#ffffff',accent2:'#00e5ff',
    strokes:[{on:true,w:6,c:'#1a0000'},{on:true,w:6,c:'#ffffff'},{on:true,w:4,c:'#1a0000'}],warp:{type:'rise',amt:.3,freq:1},
    glow:{on:true,blur:30,c:'#ff2d00',a:.75,str:2},extrude:{on:true,depth:10,angle:60,c:'#5a0000',shade:.4},shadow:{on:false},skew:12}],
  ['ボス', {font:'Reggae One',weight:400,fillType:'grad',fill1:'#e9d6ff',fill2:'#5a1a9a',accent1:'#ff3b3b',accent2:'#ff3b3b',
    strokes:[{on:true,w:5,c:'#0b0014'},{on:true,w:4,c:'#b46bff'},{on:false,w:4,c:'#000000'}],grunge:{on:true,amt:.2,size:3,seed:4},
    glow:{on:true,blur:36,c:'#8a2bff',a:.85,str:2},extrude:{on:true,depth:8,angle:80,c:'#0b0014',shade:0},shadow:{on:false},skew:0}],
  // ---- おしゃれ・大人 ----
  ['シンプル白', {font:'Zen Kaku Gothic New',weight:900,fillType:'solid',fill1:'#ffffff',accent1:'#ffd84d',accent2:'#ffd84d',
    strokes:[{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],
    extrude:{on:false},shadow:{on:true,x:0,y:6,blur:24,c:'#000000',a:.55},skew:0}],
  ['明朝エレガント', {font:'Shippori Mincho B1',weight:800,fillType:'solid',fill1:'#fffaf0',accent1:'#e0b65a',accent2:'#e0b65a',
    strokes:[{on:true,w:2,c:'#b8913d'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],ls:8,
    extrude:{on:false},shadow:{on:true,x:0,y:6,blur:22,c:'#000000',a:.5},skew:0}],
  ['金の明朝', {font:'Shippori Mincho B1',weight:800,fillType:'metal',metal:'gold',accent1:'#ffffff',accent2:'#ffffff',
    strokes:[{on:true,w:3,c:'#2a1a00'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],gloss:{on:true,a:.3,h:.42,curve:.3},
    bevel:{on:true,style:'emboss',target:'fill',size:4,depth:1,angle:225,hl:.8,sh:.5},extrude:{on:false},shadow:{on:true,x:0,y:8,blur:18,c:'#000000',a:.6},skew:0}],
  ['くすみカラー', {font:'Zen Maru Gothic',weight:900,fillType:'solid',fill1:'#f2d5cf',accent1:'#9db4a5',accent2:'#9db4a5',
    strokes:[{on:true,w:4,c:'#6b5457'},{on:true,w:8,c:'#fbf6ef'},{on:false,w:4,c:'#000000'}],
    extrude:{on:false},shadow:{on:true,x:6,y:6,blur:0,c:'#6b5457',a:.35},skew:0}],
  ['モノクロ', {font:'Noto Sans JP',weight:900,fillType:'solid',fill1:'#111111',accent1:'#e8132b',accent2:'#e8132b',
    strokes:[{on:true,w:6,c:'#ffffff'},{on:true,w:3,c:'#111111'},{on:false,w:4,c:'#000000'}],
    offset:{on:true,x:10,y:10,c:'#9a9a9a',hollow:false,w:4},extrude:{on:false},shadow:{on:false},skew:0}],
  ['チョーク', {font:'Yomogi',weight:400,fillType:'solid',fill1:'#f4f4ec',accent1:'#ffd84d',accent2:'#ff9ab0',
    strokes:[{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],grunge:{on:true,amt:.45,size:2,seed:3},
    plate:{on:true,shape:'round',c:'#1f4a3a',a:1,sc:'#8a5a2b',sw:10,pad:.3},extrude:{on:false},shadow:{on:false},skew:0}],
  // ---- かわいい ----
  ['いちごミルク', {font:'Hachi Maru Pop',weight:400,fillType:'grad',fill1:'#ffffff',fill2:'#ffc2dc',accent1:'#ff4f9a',accent2:'#ff4f9a',
    strokes:[{on:true,w:6,c:'#ff6fae'},{on:true,w:9,c:'#ffffff'},{on:true,w:3,c:'#ffb3d1'}],sparkle:{on:true,count:10,size:.18,c:'#ffffff',glow:true,seed:4},
    extrude:{on:false},shadow:{on:true,x:0,y:8,blur:14,c:'#c2185b',a:.3},skew:0}],
  ['ゆめかわ', {font:'Kiwi Maru',weight:500,fillType:'metal',metal:'holo',accent1:'#ffffff',accent2:'#ffffff',
    strokes:[{on:true,w:5,c:'#ffffff'},{on:true,w:5,c:'#b9a3ff'},{on:false,w:4,c:'#000000'}],pattern:{on:true,type:'glitter',c:'#ffffff',a:.5,size:8,angle:0},
    glow:{on:true,blur:28,c:'#ffc2ec',a:.8,str:1},extrude:{on:false},shadow:{on:false},skew:0}],
  ['もちもち', {font:'Darumadrop One',weight:400,fillType:'solid',fill1:'#ffe36b',accent1:'#ff7a59',accent2:'#ff7a59',
    strokes:[{on:true,w:6,c:'#5a3a1a'},{on:true,w:6,c:'#ffffff'},{on:false,w:4,c:'#000000'}],warp:{type:'bulge',amt:.18,freq:1},
    jitter:{on:true,rot:7,y:8,scale:.08,seed:5},gloss:{on:true,a:.45,h:.4,curve:.5},extrude:{on:true,depth:8,angle:80,c:'#5a3a1a',shade:0},shadow:{on:false},skew:0}],
  ['考え中', {font:'Zen Maru Gothic',weight:900,fillType:'solid',fill1:'#333333',accent1:'#2a9df4',accent2:'#2a9df4',
    strokes:[{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],
    plate:{on:true,shape:'cloud',c:'#ffffff',a:1,sc:'#333333',sw:5,pad:.22,tail:'left',ts:1},extrude:{on:false},shadow:{on:true,x:0,y:8,blur:14,c:'#000000',a:.3},skew:0}],
  ['叫び', {font:'Dela Gothic One',weight:400,fillType:'solid',fill1:'#e8132b',accent1:'#111111',accent2:'#111111',
    strokes:[{on:true,w:5,c:'#ffffff'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],
    plate:{on:true,shape:'shout',c:'#ffffff',a:1,sc:'#111111',sw:7,pad:.2,tail:'right',ts:1,seed:4},jitter:{on:true,rot:6,y:8,scale:.08,seed:3},
    extrude:{on:false},shadow:{on:true,x:8,y:10,blur:0,c:'#000000',a:.6},skew:0,rotate:-3}],
  // ---- 季節・イベント ----
  ['夏・海', {font:'RocknRoll One',weight:400,fillType:'grad',fill1:'#ffffff',fill2:'#3fd2ff',accent1:'#ffe600',accent2:'#ff7a00',
    strokes:[{on:true,w:7,c:'#0057b8'},{on:true,w:7,c:'#ffffff'},{on:false,w:4,c:'#000000'}],warp:{type:'wave',amt:.2,freq:1},
    sparkle:{on:true,count:8,size:.18,c:'#ffffff',glow:true,seed:6},extrude:{on:true,depth:8,angle:75,c:'#003a7a',shade:0},shadow:{on:false},skew:0}],
  ['桜・春', {font:'Zen Maru Gothic',weight:900,fillType:'grad',fill1:'#ffffff',fill2:'#ffb7d0',accent1:'#7cc96a',accent2:'#7cc96a',
    strokes:[{on:true,w:5,c:'#e0507f'},{on:true,w:8,c:'#ffffff'},{on:false,w:4,c:'#000000'}],sparkle:{on:true,count:10,size:.16,c:'#ffe3ef',glow:true,seed:2},
    extrude:{on:false},shadow:{on:true,x:0,y:8,blur:16,c:'#8a2048',a:.3},skew:0}],
  ['ハロウィン', {font:'Reggae One',weight:400,fillType:'grad',fill1:'#ffb000',fill2:'#ff5a00',accent1:'#b46bff',accent2:'#b46bff',
    strokes:[{on:true,w:6,c:'#1a0026'},{on:true,w:5,c:'#7b2cbf'},{on:false,w:4,c:'#000000'}],drip:{on:true,style:'round',amt:.25,len:.45,w:.1,sample:true,seed:5},
    glow:{on:true,blur:28,c:'#ff7a00',a:.5,str:1},extrude:{on:false},shadow:{on:true,x:0,y:8,blur:12,c:'#000000',a:.6},skew:0,rotate:-2}],
  ['クリスマス', {font:'Mochiy Pop One',weight:400,fillType:'grad',fill1:'#ff5a5a',fill2:'#b3001b',accent1:'#2e9e4f',accent2:'#2e9e4f',
    strokes:[{on:true,w:6,c:'#ffffff'},{on:true,w:6,c:'#1d6b36'},{on:false,w:4,c:'#000000'}],sparkle:{on:true,count:14,size:.2,c:'#fff6c2',glow:true,seed:8},
    gloss:{on:true,a:.35,h:.4,curve:.4},extrude:{on:false},shadow:{on:true,x:0,y:8,blur:14,c:'#000000',a:.4},skew:0}],
  ['お正月', {font:'Yuji Syuku',weight:400,fillType:'metal',metal:'gold',accent1:'#ffffff',accent2:'#ffffff',
    strokes:[{on:true,w:4,c:'#2a1a00'},{on:true,w:8,c:'#c1121f'},{on:false,w:4,c:'#000000'}],
    bevel:{on:true,style:'emboss',target:'fill',size:5,depth:1,angle:225,hl:.8,sh:.5},extrude:{on:false},shadow:{on:true,x:0,y:8,blur:16,c:'#000000',a:.5},skew:0}],
  // ---- ミステリー・ホラー ----
  ['心霊', {font:'Yuji Mai',weight:400,fillType:'solid',fill1:'#eef7f2',accent1:'#ff3b3b',accent2:'#ff3b3b',
    strokes:[{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],glitch:{on:true,rgb:3,slices:4,shift:10,seed:3},
    grunge:{on:true,amt:.3,size:3,seed:6},glow:{on:true,blur:30,c:'#7affc8',a:.5,str:1},extrude:{on:false},shadow:{on:true,x:0,y:10,blur:20,c:'#000000',a:.8},skew:0}],
  ['ミステリー', {font:'Shippori Mincho B1',weight:800,fillType:'grad',fill1:'#ffffff',fill2:'#9aa3af',accent1:'#e8132b',accent2:'#e8132b',
    strokes:[{on:true,w:3,c:'#000000'},{on:false,w:4,c:'#000000'},{on:false,w:4,c:'#000000'}],ls:6,
    reflect:{on:true,a:.3,gap:4,len:.5},extrude:{on:false},shadow:{on:true,x:0,y:10,blur:24,c:'#000000',a:.8},skew:0}],
];
// 分類タブ → そこに出すプリセット名の一覧（PRESETS の表示名と完全一致で参照）。順番がそのまま表示順。
// 「すべて」「マイ」は固定のタブなのでここには置かない（renderPresets が足す）
const PCATS = {
  '定番':   ['対戦格闘','白フチ','激辛','クール','ポップ','2色分割','ステッカー','スピード'],
  '金属':   ['メタル金','クローム','シルバー','ガンメタ','ホログラム','鏡面','アウトラン','キラキラ'],
  '光・炎': ['ネオン','2色ネオン','サイバー','電飾','炎上'],
  'ニュース・バラエティ': ['速報','衝撃','テロップ黄','3色フチ','クイズ','号外'],
  'ゲーム': ['勝利','敗北','レトロゲーム','RPG','eスポーツ','必殺技','ボス'],
  'おしゃれ・大人': ['シンプル白','明朝エレガント','金の明朝','くすみカラー','モノクロ','チョーク'],
  'かわいい': ['ぷるぷる','手書きゆる','丸囲み','バブル','マーカー','吹き出し','いちごミルク','ゆめかわ','もちもち','考え中','叫び'],
  '季節・イベント': ['夏・海','桜・春','ハロウィン','クリスマス','お正月'],
  '立体・影': ['ロングシャドウ','ストライプ立体','板ずれ','中抜き','昭和レトロ','アーチ'],
  '質感・雰囲気': ['ホラー','ボロボロ','グリッチ','墨・和風','彫り込み','レタープレス','スライム','氷','ぐにゃぐにゃ','心霊','ミステリー'],
  '囲み・背景': ['ギザギザ','一文字囲み','ランサム','アメコミ'],
};
// 選択中の分類タブ（ttm_pcat に保存）。タブの切り替え処理は controls.js 側
let pcat = LS.get('ttm_pcat', 'すべて');

// プリセットボタン自体に付ける見た目（インラインの CSS 文字列）。そのスタイルの塗り色・フォント・最初の有効なフチ色で「文字の見本」にする。
// 金属塗りは単色がないので、金属定義 METALS の2番目の色停止（明るい側）を代表色にする。
// 文字色が暗い（輝度 < 90）のにフチがないと、暗いタイルで読めなくなるので明るいフチを足す。輝度は一般的な 0.299R+0.587G+0.114B
function presetStyle(p){
  const q = merged(p);
  const st = q.strokes.find(s => s.on);
  const col = q.fillType === 'metal' ? (METALS[q.metal] || METALS.gold)[1][1] : q.fill1;
  const [r, g, b] = hex2rgb(col), dark = (0.299 * r + 0.587 * g + 0.114 * b) < 90;
  const stroke = st ? st.c : (dark ? '#e9ebf1' : null);
  return `background:var(--tile);color:${col};font-family:"${String(q.font).replace(/["\\;{}<>]/g, '')}","Noto Sans JP";paint-order:stroke fill;` +
    (stroke ? `-webkit-text-stroke:2px ${stroke};` : '');
}
// 分類タブとボタン一覧を作り直す。「マイ」は素材置き場に保存した自作スタイルで、1件以上あるときだけタブを出す。
// 自作スタイルは「すべて」と「マイ」にだけ並べる（ビルトインの分類には混ぜない）。各ボタンの × は素材置き場からの削除。
// 見本の文字をそのフォントで見せるため、表示するプリセットのフォントはここで先に読み込みを始める（描画側の待ちは不要）
function renderPresets(){
  const cats = ['すべて', ...Object.keys(PCATS), ...(myStyles().length ? ['マイ'] : [])];
  if(!cats.includes(pcat)) pcat = 'すべて';
  $('#pcats').innerHTML = cats.map(c => `<button data-pcat="${c}" class="${c === pcat ? 'on' : ''}">${c}</button>`).join('');
  const box = $('#presets'); box.innerHTML = '';
  const shown = pcat === 'すべて' ? PRESETS : pcat === 'マイ' ? [] : PRESETS.filter(([n]) => PCATS[pcat].includes(n));
  shown.forEach(([name, p]) => {
    const b = document.createElement('button'); b.textContent = name; b.style.cssText = presetStyle(p);
    b.onclick = () => applyPreset(p); box.appendChild(b);
    ensureCss(findFont(p.font));
  });
  if(pcat === 'すべて' || pcat === 'マイ') myStyles().forEach(mp => {
    const b = document.createElement('button'); b.textContent = mp.name; b.style.cssText = presetStyle(mp.s);
    const x = document.createElement('span'); x.className = 'x'; x.textContent = '×'; x.title = '削除';
    x.onclick = e => { e.stopPropagation(); if(confirm(`「${mp.name}」を素材置き場から削除しますか？`)) libDelete(mp.id); };
    b.appendChild(x); b.onclick = () => applyPreset(mp.s); box.appendChild(b);
  });
}
// スタイルを適用する。文字内容・サイズ・余白・書き出し倍率・英数字フォントは「内容」側の設定なので、プリセットで消さずに引き継ぐ。
// S を丸ごと差し替える（Object.assign で新しいオブジェクトを作る）ため、S を保持している箇所があれば古いままになる点に注意
function applyPreset(p){
  const keep = {text:S.text, size:S.size, pad:S.pad, scale:S.scale, fontLatin:S.fontLatin};
  for(const k of ['vertical', 'vlat', 'vtcy']) if(!(k in p)) keep[k] = S[k];   // 縦書きの指定がないスタイルでは今の向きを保つ
  S = Object.assign(merged(p), keep); resetAdj();
  if(!findFont(S.font)) toast(`フォント「${S.font}」が一覧にないため代替表示になります`, true);
  refreshTextUI(); schedule();
}

