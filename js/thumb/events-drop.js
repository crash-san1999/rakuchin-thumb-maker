/* 楽ちんサムネメーカー：ファイルのドラッグ＆ドロップ・貼り付け */
/*
  役割：画面のどこに落としても受け付ける。画像（レイヤー・背景・素材置き場・分割フレームのマス・予定表の行）、フォントファイル、プロジェクト .json。
  依存：openProjectFile（events.js）、addImageLayers・setBgFromFile（assets.js）、libAddFiles・renderLib（library.js）、addFontFiles（fonts.js）、
       schedTakeFiles（sched.js）、collageTakeFiles・collageFillFrom・collageCellsOf・cellDragFrom（collage-cells.js・collage-draw.js・collage-panel.js）、setMode・isTyping。
  読み込み順：events-layers.js の次。読み込み時にイベントを登録する（DOM は存在済み）。
*/
/* ドラッグ＆ドロップ（画面のどこに落としてもOK）・貼り付け。
   落とす先はオーバーレイ上の区画（data-dz）：背景（bg）／素材置き場（lib）／分割フレームのマス（cell。分割フレームがあるときだけ）／レイヤー（layer。既定）。
   フォントファイル・プロジェクト .json もここで受ける。 */
{
  const ov = $('#ddov'); let depth = 0;   // depth：dragenter/leave は子要素をまたぐたびに発火するので、入れ子の深さを数えて、本当に画面の外へ出たときだけ消す
  // 分割フレームのマス同士の入れ替えドラッグ（cellDragFrom>=0。collage-panel.js）は、ファイルのドロップとして扱わない
  const hasFiles = /** @param {DragEvent} e */ e => cellDragFrom < 0 && [...(e.dataTransfer?.types || [])].some(t => t === 'Files' || t === 'text/uri-list');
  /* 「分割フレームのマスに入れる」区画：分割フレームがあるときだけ、マスの形の図を出し、離したマスに入れる（キャンバスの上は案内で隠れて見えないため）。
     対象は、選んでいる分割フレーム。選んでいなければ、いちばん手前の（表示している）分割フレーム */
  const cellZone = $('[data-dz=cell]', ov), cellMap = $('#ddCellMap', ov);
  /** @type {CollageLayer|null} */ let cellL = null;
  const dropCollage = () => {
    if(!DOC || DOC.mode !== 'thumb') return null;
    const S = selLayer(); if(S && S.type === 'collage' && !S.hidden) return S;
    return /** @type {CollageLayer|undefined} */ ([...DOC.layers].reverse().find(l => l.type === 'collage' && !l.hidden)) || null;
  };
  const buildCellMap = () => {
    cellL = dropCollage(); ov.classList.toggle('hascell', !!cellL); cellZone.hidden = !cellL;
    if(!cellL){ cellMap.innerHTML = ''; return; }
    const L = cellL, W = 1000, H = Math.round(W * L.bh / L.bw), n = collageN(L), fs = Math.round(Math.min(W, H) * 0.11);
    cellMap.setAttribute('viewBox', `-8 -8 ${W + 16} ${H + 16}`);
    cellMap.innerHTML = `<rect class="cbg" width="${W}" height="${H}"/>` + collageCellsOf(L, W, H).slice(0, n).map((poly, i) => {
      const pts = poly.map(p => p.map(v => v.toFixed(1)).join(',')).join(' '), xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
      const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
      const A = assetOf(L.cells[i].asset);
      // 番号は多角形の頂点の平均の位置（扇状など細長いマスでも中に収まりやすい）
      const tx = xs.reduce((a, b) => a + b, 0) / xs.length, ty = ys.reduce((a, b) => a + b, 0) / ys.length;
      return `<g data-cell="${i}"><clipPath id="ddclip${i}"><polygon points="${pts}"/></clipPath>`
        + (A ? `<image class="cimg" href="${A.thumb}" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" preserveAspectRatio="xMidYMid slice" clip-path="url(#ddclip${i})"/>` : '')
        + `<polygon class="cpoly" points="${pts}"/><text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" font-size="${fs}">${i + 1}</text></g>`;
    }).join('');
  };
  // ドロップ先の案内を出す／消す（出すときはマスの図を作り直す。消すときは、強調していた区画も戻す）
  const show = /** @param {boolean} on */ on => {
    if(on && !ov.classList.contains('show')) buildCellMap();
    ov.classList.toggle('show', on);
    if(!on) $$('[data-dz], [data-cell]', ov).forEach(z => z.classList.remove('hot'));
  };
  window.addEventListener('dragenter', e => { if(!hasFiles(e)) return; e.preventDefault(); depth++; show(true); });
  window.addEventListener('dragleave', e => { if(!hasFiles(e)) return; depth = Math.max(0, depth - 1); if(!depth) show(false); });
  window.addEventListener('dragover', e => {
    if(!hasFiles(e)) return; e.preventDefault(); if(e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    const z = tgt(e).closest && tgt(e).closest('[data-dz]');
    const hot = z || $('[data-dz=layer]', ov);
    $$('[data-dz]', ov).forEach(x => x.classList.toggle('hot', x === hot));
    const c = tgt(e).closest && tgt(e).closest('[data-cell]');
    $$('[data-cell]', ov).forEach(x => x.classList.toggle('hot', x === c));
  });
  window.addEventListener('drop', async e => {
    if(!hasFiles(e)) return;
    e.preventDefault(); depth = 0;
    const z = tgt(e).closest && tgt(e).closest('[data-dz]'), zone = z ? z.dataset.dz : 'layer';
    const cellEl = tgt(e).closest && tgt(e).closest('[data-cell]'), cellI = cellEl ? +(cellEl.getAttribute('data-cell') ?? -1) : -1, toL = cellL;
    show(false);
    const dt = e.dataTransfer;
    let files = [...(dt && dt.files || [])];
    // ほかのタブからドラッグした画像（ファイルが付いていない場合）はURLから取得を試す。サイト側の制限（CORS）で取れないことがあるので、その場合は案内を出す
    if(!files.length){
      const url = (dt && dt.getData('text/uri-list') || '').split('\n').find(u => /^https?:/.test(u.trim()));
      if(url){
        try{ const r = await fetch(url.trim()); const b = await r.blob(); if(!/^image\//.test(b.type)) throw 0; files = [new File([b], (url.split('/').pop() ?? '').split('?')[0] || 'image', {type:b.type})]; }
        catch{ toast('この画像はサイトの制限で直接追加できません。一度PCに保存してからドラッグしてください', true); return; }
      }
    }
    const imgs = files.filter(f => /^image\//.test(f.type));
    const fontsF = files.filter(f => /\.(ttf|otf|woff2?)$/i.test(f.name));
    const proj = files.find(f => /\.json$/i.test(f.name));
    if(proj){ openProjectFile(proj); return; }
    if(fontsF.length) addFontFiles(fontsF);
    if(!imgs.length){ if(!fontsF.length) toast('画像（PNG / JPG / WebP など）かフォントファイルをドロップしてください', true); return; }
    // 画像は、まず選択中の週間予定表の行（schedTakeFiles）・分割フレームのマス（collageTakeFiles）に入れ、当たらなかった残りだけをレイヤーにする
    if(zone === 'lib'){ await libAddFiles(imgs); renderLib(); return; }   // 素材置き場へ登録だけする（キャンバスには追加しない）
    if(DOC.mode !== 'thumb'){ setMode('thumb'); }
    // マスの図の上で離した：そのマスから入れる（入りきらない分はレイヤーに）。図のマスの外（すき間）なら、どこにも入れずに案内だけ出す
    if(zone === 'cell'){
      const L = toL && DOC.layers.includes(toL) ? toL : null;
      if(!L || cellI < 0){ toast('入れたいマスの上で離してください', true); return; }
      const rest = await collageFillFrom(L, cellI, imgs); if(rest.length) addImageLayers(rest, true);
      return;
    }
    if(zone === 'bg'){ await setBgFromFile(imgs[0]); openInspector(); toast('背景に設定しました'); if(imgs.length > 1) addImageLayers(imgs.slice(1)); }
    else { const rest = await collageTakeFiles(await schedTakeFiles(imgs, e.clientX, e.clientY), e.clientX, e.clientY); if(rest.length) addImageLayers(rest, true); }
  });
  document.addEventListener('paste', e => {
    if(DOC.mode !== 'thumb') return;
    if(isTyping(e)) return;
    const files = [...(e.clipboardData?.files || [])].filter(f => /^image\//.test(f.type));
    if(files.length){ e.preventDefault(); addImageLayers(files); }
  });
}
