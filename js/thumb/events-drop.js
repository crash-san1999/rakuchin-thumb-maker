/* 楽ちんサムネメーカー：ファイルのドラッグ＆ドロップ・貼り付け */
/*
  役割：画面のどこに落としても受け付ける。画像（レイヤー・背景・素材置き場・分割フレームのマス・予定表の行）、フォントファイル、プロジェクト .json。
  依存：openProjectFile（events.js）、addImageLayers・setBgFromFile（assets.js）、libAddFiles・renderLib（library.js）、addFontFiles（fonts.js）、
       schedTakeFiles（sched.js）、collageTakeFiles・cellDragFrom（collage-cells.js・collage-panel.js）、setMode・isTyping。
  読み込み順：events-layers.js の次。読み込み時にイベントを登録する（DOM は存在済み）。
*/
/* ドラッグ＆ドロップ（画面のどこに落としてもOK）・貼り付け。
   落とす先はオーバーレイ上の3か所（data-dz）：背景（bg）／素材置き場（lib）／レイヤー（layer。既定）。
   フォントファイル・プロジェクト .json もここで受ける。 */
{
  const ov = $('#ddov'); let depth = 0;   // depth：dragenter/leave は子要素をまたぐたびに発火するので、入れ子の深さを数えて、本当に画面の外へ出たときだけ消す
  // 分割フレームのマス同士の入れ替えドラッグ（cellDragFrom>=0。collage-panel.js）は、ファイルのドロップとして扱わない
  const hasFiles = /** @param {DragEvent} e */ e => cellDragFrom < 0 && [...(e.dataTransfer?.types || [])].some(t => t === 'Files' || t === 'text/uri-list');
  const show = /** @param {boolean} on */ on => { ov.classList.toggle('show', on); if(!on) $$('[data-dz]', ov).forEach(z => z.classList.remove('hot')); };
  window.addEventListener('dragenter', e => { if(!hasFiles(e)) return; e.preventDefault(); depth++; show(true); });
  window.addEventListener('dragleave', e => { if(!hasFiles(e)) return; depth = Math.max(0, depth - 1); if(!depth) show(false); });
  window.addEventListener('dragover', e => {
    if(!hasFiles(e)) return; e.preventDefault(); if(e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    const z = tgt(e).closest && tgt(e).closest('[data-dz]');
    const hot = z || $('[data-dz=layer]', ov);
    $$('[data-dz]', ov).forEach(x => x.classList.toggle('hot', x === hot));
  });
  window.addEventListener('drop', async e => {
    if(!hasFiles(e)) return;
    e.preventDefault(); depth = 0;
    const z = tgt(e).closest && tgt(e).closest('[data-dz]'), zone = z ? z.dataset.dz : 'layer';
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
