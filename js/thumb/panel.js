/* 楽ちんサムネメーカー：操作パネル・モード・タブ */
/* ---------- パネル ---------- */
const SEL_ROWS = [
  {r:'@sc', l:'大きさ', min:0.05, max:10, step:0.01},
  {r:'@rot', l:'回転', min:-180, max:180, step:1},
  {c:'@p.c', l:'色', show:'@type=fx'},
  {r:'@p.n', l:'本数', min:20, max:300, step:1, show:'@kind=lines'},
  {r:'@p.inner', l:'中心の空き', min:0.02, max:1.5, step:0.01, show:'@kind=lines'},
  {r:'@p.w', l:'線の太さ', min:0.2, max:3, step:0.05, show:'@kind=lines'},
  {chk:'@p.full', l:'画面の端まで伸ばす（オフにすると最大サイズを指定できます）', show:'@kind=lines'},
  {r:'@p.reach', l:'最大サイズ', min:1.05, max:5, step:0.01, show:'@kind=lines&@p.full=false'},
  {r:'@p.fade', l:'外側をぼかす', min:0, max:1, step:0.01, show:'@kind=lines&@p.full=false'},
  {r:'@p.len', l:'長さのばらつき', min:0, max:2, step:0.05, show:'@kind=lines'},
  {r:'@p.amt', l:'強さ', min:0, max:1, step:0.01, show:'@kind=light'},
  {r:'@p.r', l:'光の広がり', min:0.05, max:1.5, step:0.01, show:'@kind=light'},
  {r:'@p.n', l:'数', min:1, max:60, step:1, show:'@kind=sparkle'},
  {r:'@p.size', l:'星の大きさ', min:0.2, max:3, step:0.05, show:'@kind=sparkle'},
  {chk:'@p.glow', l:'光らせる', show:'@kind=sparkle'},
  {r:'@p.spikes', l:'トゲの数', min:5, max:40, step:1, show:'@kind=burst'},
  {r:'@p.depth', l:'トゲの深さ', min:0.05, max:0.7, step:0.01, show:'@kind=burst'},
  {c:'@p.c2', l:'フチの色', show:'@kind=burst'},
  {r:'@p.sw', l:'フチの太さ', min:0, max:40, step:0.5, show:'@kind=burst'},
  {seed:'@p.seed', l:'ランダム', show:'@kind=lines|sparkle|burst'},
  {r:'@op', l:'不透明度', min:0.05, max:1, step:0.01},
  {sel:'@blend', l:'描画モード', opts:Object.entries({'source-over':'通常', multiply:'乗算（暗く重ねる）', screen:'スクリーン（明るく重ねる）', overlay:'オーバーレイ', 'soft-light':'ソフトライト', 'hard-light':'ハードライト', 'color-dodge':'覆い焼き（光る）', lighter:'加算（発光）', difference:'差の絶対値', luminosity:'輝度'})},
  {chk:'@locked', l:'ロック（キャンバス上で選択・移動しない）'},
  {place:true, l:'配置'},
  {sub:'分割フレーム', note:'複数の画像を並べます。マスに画像をドロップするか、下の一覧から選んでください', show:'@type=collage'},
  {seg:'@n', l:'分割数', opts:[['2','2'],['3','3'],['4','4'],['5','5'],['6','6']], show:'@type=collage'},
  {layouts:true, l:'分割のしかた', show:'@type=collage'},
  {r:'@slant', l:'傾き・回転', min:-1, max:1, step:0.01, show:'@type=collage&@layout=cols|rows|bigL|bigT|radial'},
  {r:'@main', l:'大きいマスの大きさ', min:0.25, max:0.8, step:0.01, show:'@type=collage&@layout=bigL|bigT'},
  {seg:'@edge', l:'境界の形', opts:COLLAGE_EDGES, show:'@type=collage'},
  {r:'@amp', l:'形の大きさ', min:4, max:90, step:1, show:'@type=collage&@edge=zigzag|wave|rough'},
  {sel:'@bstyle', l:'境界線', opts:COLLAGE_BSTYLES, show:'@type=collage'},
  {r:'@lw', l:'太さ・ぼかし幅', min:0, max:120, step:1, show:'@type=collage&@bstyle=line|gap|glow|blur|shadow'},
  {c:'@lc', l:'線の色', show:'@type=collage&@bstyle=line|glow'},
  {chk:'@outer', l:'外枠も付ける（線の色・太さ）', show:'@type=collage'},
  {r:'@radius', l:'角の丸み', min:0, max:300, step:1, show:'@type=collage'},
  {sub:'マスの画像', note:'マスをクリックで選択。画像のないマスは画像を選べます', show:'@type=collage'},
  {cells:true, show:'@type=collage'},
  {r:'@cell.zoom', l:'画像の大きさ', min:0.2, max:5, step:0.01, show:'@type=collage'},
  {r:'@cell.ox', l:'画像 左右', min:-1, max:1, step:0.005, show:'@type=collage'},
  {r:'@cell.oy', l:'画像 上下', min:-1, max:1, step:0.005, show:'@type=collage'},
  {btns:[['collageEditBtn', 'crop', 'キャンバスでマスの画像を調整']], show:'@type=collage'},
  {sub:'全体の大きさ', show:'@type=collage'},
  {r:'@bw', l:'横幅', min:100, max:1920, step:1, show:'@type=collage'},
  {r:'@bh', l:'高さ', min:100, max:1080, step:1, show:'@type=collage'},
  {btns:[['collageFill', 'monitor', '画面いっぱいにする']], show:'@type=collage'},
  {chk:'@flip', l:'左右反転', show:'@type=image'},
  {sub:'切り抜きフレーム', note:'図形で切り抜いて枠を付けます。形と枠のデザインは自由に組み合わせOK', show:'@type=image'},
  {frpre:true, show:'@type=image'},
  {shapes:true, l:'形', show:'@type=image'},
  {sel:'@frame.style', l:'枠のデザイン', opts:FRAME_STYLES, show:'@type=image&@frame.shape=rect|circle|arch|hex|oct|diamond|tri|slant|shield|star|kira|heart|burst|cloud|flower|bubble|torn|cut|notch|blade|trap|shard|chevron|pill|squircle|penta|hexv|cross|drop|ticket|wave|splash|swipe|drybrush|brushbox|rip|brushtri|brushcircle'},
  {seg:'@frame.ar', l:'縦横比', opts:[['auto','自動'],['1','1:1'],['1.333','4:3'],['0.75','3:4'],['1.778','16:9']], show:'@type=image&@frame.shape=rect|circle|arch|hex|oct|diamond|tri|slant|shield|star|kira|heart|burst|cloud|flower|bubble|torn|cut|notch|blade|trap|shard|chevron|pill|squircle|penta|hexv|cross|drop|ticket|wave|splash|swipe|drybrush|brushbox|rip|brushtri|brushcircle'},
  {r:'@frame.r', l:'角の丸み', min:0, max:0.5, step:0.01, show:'@type=image&@frame.shape=rect|bubble'},
  {btns:[['frameEditBtn', 'crop', 'キャンバスでフレームを調整']], show:'@type=image&@frame.shape=rect|circle|arch|hex|oct|diamond|tri|slant|shield|star|kira|heart|burst|cloud|flower|bubble|torn|cut|notch|blade|trap|shard|chevron|pill|squircle|penta|hexv|cross|drop|ticket|wave|splash|swipe|drybrush|brushbox|rip|brushtri|brushcircle'},
  {seed:'@frame.seed', l:'筆のかすれ', show:'@type=image&@frame.shape=swipe|drybrush|brushbox|rip|brushtri|brushcircle|torn|splash|burst'},
  {r:'@frame.fs', l:'フレームの大きさ', min:0.1, max:1, step:0.005, show:'@type=image&@frame.shape=rect|circle|arch|hex|oct|diamond|tri|slant|shield|star|kira|heart|burst|cloud|flower|bubble|torn|cut|notch|blade|trap|shard|chevron|pill|squircle|penta|hexv|cross|drop|ticket|wave|splash|swipe|drybrush|brushbox|rip|brushtri|brushcircle'},
  {r:'@frame.cx', l:'フレームの位置 左右', min:0, max:1, step:0.002, show:'@type=image&@frame.shape=rect|circle|arch|hex|oct|diamond|tri|slant|shield|star|kira|heart|burst|cloud|flower|bubble|torn|cut|notch|blade|trap|shard|chevron|pill|squircle|penta|hexv|cross|drop|ticket|wave|splash|swipe|drybrush|brushbox|rip|brushtri|brushcircle'},
  {r:'@frame.cy', l:'フレームの位置 上下', min:0, max:1, step:0.002, show:'@type=image&@frame.shape=rect|circle|arch|hex|oct|diamond|tri|slant|shield|star|kira|heart|burst|cloud|flower|bubble|torn|cut|notch|blade|trap|shard|chevron|pill|squircle|penta|hexv|cross|drop|ticket|wave|splash|swipe|drybrush|brushbox|rip|brushtri|brushcircle'},
  {chk:'@outline.on', l:'フチを付ける（切り抜き画像向け）', show:'@type=image&@frame.shape=none'},
  {r:'@outline.w', l:'フチ太さ', min:1, max:50, step:0.5, show:'@type=image'},
  {c:'@outline.c', l:'フチ色', show:'@type=image'},
  {c:'@frame.c2', l:'2色目', show:'@type=image&@frame.style=pop|grad|tape|neon2|block|triple|stitch|halftone|pixel'},
  {chk:'@shadow.on', l:'影を付ける', show:'@type=image'},
  {r:'@shadow.blur', l:'影ぼかし', min:0, max:120, step:1, show:'@type=image'},
  {r:'@shadow.y', l:'影の位置', min:-60, max:90, step:1, show:'@type=image'},
  {r:'@shadow.a', l:'影の濃さ', min:0, max:1, step:0.01, show:'@type=image'},
  {btns:[['editText', 'text', '文字を編集'], ['editStyle', 'palette', 'スタイルを選ぶ']], show:'@type=text'},
];
const BG_ROWS = [
  {chk:'bg.hidden', l:'背景を非表示にする（PNGで保存すると透明に）'},
  {r:'bg.op', l:'背景の不透明度', min:0, max:1, step:0.01, show:'bg.hidden=false'},
  {seg:'bg.type', l:'種類', opts:[['image', '画像'], ['grad', 'グラデ'], ['color', '単色']]},
  {btns:[['pickBg', 'image', '背景画像を選ぶ']], show:'bg.type=image'},
  {fx:true},
  {sub:'位置と大きさ', show:'bg.type=image', note:'キャンバスの何もないところをドラッグで移動・ホイールで拡大縮小'},
  {seg:'bg.fit', l:'基準', opts:[['cover', '全面'], ['contain', '全体を表示']], show:'bg.type=image'},
  {r:'bg.zoom', l:'拡大縮小', min:0.2, max:4, step:0.01, show:'bg.type=image'},
  {r:'bg.ox', l:'左右', min:-1.5, max:1.5, step:0.005, show:'bg.type=image'},
  {r:'bg.oy', l:'上下', min:-1.5, max:1.5, step:0.005, show:'bg.type=image'},
  {r:'bg.rot', l:'回転', min:-180, max:180, step:0.5, show:'bg.type=image'},
  {chk:'bg.flip', l:'左右反転', show:'bg.type=image'},
  {seg:'bg.gap', l:'余白', opts:[['blur', '画像のぼかし'], ['color', '単色']], show:'bg.type=image'},
  {c:'bg.gapColor', l:'余白の色', show:'bg.type=image&bg.gap=color'},
  {sub:'色調', show:'bg.type=image'},
  {r:'bg.bright', l:'明るさ', min:-0.6, max:0.6, step:0.01, show:'bg.type=image'},
  {r:'bg.contrast', l:'コントラスト', min:-0.8, max:1, step:0.01, show:'bg.type=image'},
  {r:'bg.sat', l:'彩度', min:-1, max:1, step:0.01, show:'bg.type=image'},
  {r:'bg.hue', l:'色相', min:-180, max:180, step:1, show:'bg.type=image'},
  {r:'bg.blur', l:'ぼかし', min:0, max:40, step:0.5, show:'bg.type=image'},
  {seg:'bg.tone', l:'トーン', opts:[['none', 'なし'], ['mono', 'モノクロ'], ['sepia', 'セピア'], ['duotone', '2色']], show:'bg.type=image'},
  {c:'bg.duo1', l:'暗い色', show:'bg.type=image&bg.tone=duotone'}, {c:'bg.duo2', l:'明るい色', show:'bg.type=image&bg.tone=duotone'},
  {sub:'エフェクト', show:'bg.type=image'},
  {chk:'bg.zb.on', l:'ズームブラー（中心へ吸い込まれる）', show:'bg.type=image'},
  {r:'bg.zb.amt', l:'強さ', min:0.02, max:0.8, step:0.01, show:'bg.type=image&bg.zb.on=true'},
  {chk:'bg.mb.on', l:'モーションブラー（流れる）', show:'bg.type=image'},
  {r:'bg.mb.dist', l:'距離', min:5, max:400, step:1, show:'bg.type=image&bg.mb.on=true'},
  {r:'bg.mb.angle', l:'方向', min:-90, max:90, step:1, show:'bg.type=image&bg.mb.on=true'},
  {chk:'bg.mosaic.on', l:'モザイク', show:'bg.type=image'},
  {r:'bg.mosaic.size', l:'粗さ', min:4, max:120, step:1, show:'bg.type=image&bg.mosaic.on=true'},
  {c:'bg.color', l:'色', show:'bg.type=color'},
  {c:'bg.c1', l:'色1', show:'bg.type=grad'}, {c:'bg.c2', l:'色2', show:'bg.type=grad'},
  {r:'bg.angle', l:'角度', min:0, max:360, step:1, show:'bg.type=grad'},
  {sub:'背景エフェクト', note:'背景全体にかかる効果です（レイヤーにはなりません）'},
  {r:'bg.dim', l:'暗くする', min:0, max:0.85, step:0.01},
  {r:'bg.vignette', l:'周辺減光', min:0, max:1, step:0.01},
  {chk:'bg.shade.on', l:'グラデーション影（下を暗くして文字を読みやすく）'},
  {c:'bg.shade.c', l:'影の色', show:'bg.shade.on=true'},
  {r:'bg.shade.amt', l:'濃さ', min:0, max:1, step:0.01, show:'bg.shade.on=true'},
  {r:'bg.shade.angle', l:'向き', min:0, max:360, step:1, show:'bg.shade.on=true'},
  {r:'bg.shade.cover', l:'かかる範囲', min:0.05, max:1, step:0.01, show:'bg.shade.on=true'},
  {chk:'bg.tint.on', l:'色を重ねる'},
  {c:'bg.tint.c', l:'色', show:'bg.tint.on=true'},
  {r:'bg.tint.a', l:'濃さ', min:0, max:1, step:0.01, show:'bg.tint.on=true'},
  {sel:'bg.tint.mode', l:'重ね方', opts:[['overlay', 'オーバーレイ'], ['multiply', '乗算（暗く）'], ['screen', 'スクリーン（明るく）'], ['soft-light', 'ソフトライト'], ['color', 'カラー（単色化）']], show:'bg.tint.on=true'},
  {r:'bg.fcx', l:'中心 左右', min:-0.2, max:1.2, step:0.005, note:'周辺減光・ズームブラーの中心'},
  {r:'bg.fcy', l:'中心 上下', min:-0.2, max:1.2, step:0.005},
  {btns:[['fxCenter', 'reset', '中心を真ん中に']]},
  {addfx:true},
];
const FX_CHIPS = [['focus', '集中'], ['lines', '集中線'], ['speed', '疾走'], ['soft', 'ふんわり'], ['pop', '文字を目立たせる'], ['vivid', '鮮やか'],
  ['mono', 'モノクロ'], ['retro', 'レトロ'], ['duo', 'デュオトーン'], ['red', 'モノクロ＋赤'], ['spot', 'スポットライト'], ['mosaic', 'モザイク'], ['reset', 'リセット']];
function drow(r){
  const sa = r.show ? ` data-dshow="${r.show}"` : '';
  if(r.layouts) return `<div class="row"${sa}><label>${r.l}</label><div class="seg shapes lays" data-dseg="@layout">${[2, 3, 4, 5, 6].flatMap(n => COLLAGE_LAYOUTS.filter(l => l[2](n)).map(([k, t]) => `<button data-v="${k}" data-dshow="@n=${n}" title="${t}"><img src="${collageIcon(k, n)}" alt="${t}"></button>`)).join('')}</div></div>`;
  if(r.cells) return `<div id="cellBox"${sa}></div>`;
  if(r.frpre){ const nm = Object.fromEntries(FRAME_PRESETS.map(p => [p[0], p[1]]));
    return `<div${sa}>${FRAME_GROUPS.map(([g, ks]) => `<div class="frgrp">${g}</div><div class="pcats frpre">${ks.map(k => `<button data-frpre="${k}">${nm[k]}</button>`).join('')}</div>`).join('')}<div class="pcats frpre"><button data-frpre="off">フレームなし</button></div></div>`; }
  if(r.shapes) return `<div class="row"${sa}><label>${r.l}</label><div class="seg shapes" data-dseg="@frame.shape">${FRAME_SHAPES.map(([k, t]) => `<button data-v="${k}" title="${t}">${k === 'none' ? '<span>なし</span>' : `<img src="${shapeIcon(k)}" alt="${t}">`}</button>`).join('')}</div></div>`;
  if(r.sub) return `<div class="subhead" style="margin-top:24px"${sa}>${r.sub}${r.note ? `<span class="subnote">${r.note}</span>` : ''}</div>`;
  if(r.addfx) return `<div class="subhead" style="margin-top:26px">動的エフェクト<span class="subnote">レイヤーとして追加され、文字や画像と同じように移動・拡大縮小・回転できます</span></div><div class="crow">${Object.keys(FX_DEF).map(k => `<button class="btn sm" data-addfx="${k}">${ic(FX_ICONS[k])}${FX_NAMES[k]}</button>`).join('')}</div>`;
  if(r.fx) return `<div${sa}><div class="subhead" style="margin-top:18px">ワンクリック背景エフェクト</div><div class="pcats fxchips">${FX_CHIPS.map(([k, t]) => `<button data-bgfx="${k}">${t}</button>`).join('')}</div></div>`;
  if(r.sel) return `<div class="row"${sa}><label>${r.l}</label><select data-d="${r.sel}">${r.opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>`;
  if(r.place) return `<div class="row"${sa}><label>${r.l}</label><div class="place">${['t', 'm', 'b'].map(v => ['l', 'c', 'r'].map(h => `<button data-place="${h}${v}" title="この位置に配置"></button>`).join('')).join('')}</div></div>`;
  if(r.btns) return `<div class="crow"${sa}>${r.btns.map(([id, icn, t]) => `<button class="btn sm" id="${id}">${ic(icn)}${t}</button>`).join('')}</div>`;
  if(r.seg) return `<div class="row"${sa}><label>${r.l}</label><div class="seg" data-dseg="${r.seg}">${r.opts.map(([v, t]) => `<button data-v="${v}">${t}</button>`).join('')}</div></div>`;
  if(r.seed) return `<div class="row"${sa}><label>${r.l}</label><button class="btn sm reroll" data-dreroll="${r.seed}">${ic('dice')}別パターンにする</button></div>`;
  if(r.c) return `<div class="row"${sa}><label>${r.l}</label><div class="cpick"><input type="color" data-d="${r.c}"><input type="text" class="hex" data-d="${r.c}" maxlength="7" spellcheck="false"></div></div>`;
  if(r.chk) return `<div class="row"${sa}><label></label><label class="chk"><input type="checkbox" data-d="${r.chk}"> ${r.l}</label></div>`;
  const a = `min="${r.min}" max="${r.max}" step="${r.step}"`;
  return `<div class="row"${sa}><label>${r.l}</label><input type="range" data-d="${r.r}" ${a}><input type="number" class="num" data-d="${r.r}" ${a}></div>`;
}

const shapeIconCache = {};
function shapeIcon(k){
  if(shapeIconCache[k]) return shapeIconCache[k];
  const c = mk(44, 44), x = c.getContext('2d'); x.translate(22, 22); x.beginPath(); framePath(x, k, 32, 32, 0.2); x.fillStyle = '#1f1b2d'; x.fill();
  return shapeIconCache[k] = c.toDataURL();
}
/* ---------- モード・タブ ---------- */
let curTab = 'thumb';
function setTab(t){
  if(DOC.mode === 'text' && t === 'thumb') t = 'style';
  curTab = t; document.body.dataset.tab = t;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.dataset.pane === t));
  LS.set('ttm_tab', t);
}
function setMode(m, silent){
  DOC.mode = m;
  document.body.classList.toggle('mode-thumb', m === 'thumb'); document.body.classList.toggle('mode-text', m === 'text');
  document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  $('#dlLabel').textContent = isMobile ? '保存' : (m === 'thumb' ? 'サムネを保存' : '透過PNGを保存');
  if(m === 'text' && curTab === 'thumb') setTab('style');
  if(m === 'text' && (sheet === 'layers' || sheet === 'thumb')) openSheet(null);
  if(m === 'thumb' && $('#stage').classList.contains('img')) setBg('checker');
  saveDoc();
  if(!silent){ clearTimeout(schT); schT = setTimeout(update, 10); }
}

