/* 楽ちんサムネメーカー：入力欄と値をつなぐしくみ（文字スタイル用・サムネ用で共通） */
/*
  makeBinder(o) で、ある「値の入れ物」と画面の入力欄をつなぐ。属性名は入れ物ごとに変える。
    o.val    … 値を入れる入力欄（例 data-k="shadow.blur"）
    o.seg    … ボタンで選ぶ欄（例 data-seg="align"。data-num を付けると数値として扱う）
    o.show   … 表示条件（例 data-show="bg.type=image&bg.tone!=none"）
    o.reroll … 「別パターンにする」ボタン（乱数の種を振り直す）
    o.get(k) / o.onInput(k, v, el) / o.onSeg(k, v, btn) / o.onReroll(k) … 値の読み出しと、変更されたときの処理
  キー k は "shadow.blur" のようなドット区切りの道筋。それを実際のオブジェクトにたどる処理は呼び出し側（o.get / o.onInput）の仕事で、ここは知らない。
  使い手：controls.js の KB（文字スタイル S 用）と thumb/doc.js の DB（サムネ DOC 用）が、それぞれ属性名を変えて makeBinder を1回ずつ呼ぶ。
  読み込み順：core.js の次（paintRange・ic に依存）。イベントは document に委譲で登録するので、あとから作った入力欄にも効く。
  戻り値：{cond, sync, row}。sync() は値→画面、row() は設定行の HTML 作成で、onInput などの画面→値と対になる。
*/
// 入力欄の値を型に直す。読めない値は undefined を返し、呼び出し側はそれを「変更なし」として無視する
// （例：数値欄を空にした途中の状態や、#rrggbb でない途中の色文字列で、値を壊さないため）
function readInput(el){
  if(el.type === 'checkbox') return el.checked;
  if(el.type === 'range' || el.type === 'number' || el.dataset.num){ const v = parseFloat(el.value); return isNaN(v) ? undefined : v; }
  if(el.classList.contains('hex')) return /^#[0-9a-f]{6}$/i.test(el.value) ? el.value.toLowerCase() : undefined;
  return el.value;
}
// 注意：document に直接リスナーを足すので、makeBinder を呼ぶたびにリスナーが増える（属性名が違えば互いに干渉しない）。同じ o を複数回作らないこと
function makeBinder(o){
  const sel = a => `[data-${a}]`;
  document.addEventListener('input', e => {
    const el = e.target, k = el.dataset && el.dataset[o.val]; if(!k) return;
    const v = readInput(el); if(v !== undefined) o.onInput(k, v, el);
  });
  document.addEventListener('click', e => {
    const rr = e.target.closest(sel(o.reroll)); if(rr){ o.onReroll(rr.dataset[o.reroll]); return; }
    const b = e.target.closest(`${sel(o.seg)} button`); if(!b) return;
    const g = b.parentElement; o.onSeg(g.dataset[o.seg], g.dataset.num ? parseFloat(b.dataset.v) : b.dataset.v, b);
  });
  // 表示条件：「キー=値1|値2」または「キー!=値1|値2」を & でつなぐ
  const cond = c => { const neg = c.includes('!='), [k, vs] = c.split(neg ? '!=' : '='), hit = vs.split('|').includes(String(o.get(k))); return neg ? !hit : hit; };
  return {
    cond,
    // 値 → 画面。except は今まさに入力中の欄（値を書き戻すとカーソルや入力途中の文字が壊れるので飛ばす）。
    // get が undefined/null を返すキーは触らない（その欄は別の仕組みで管理されている）
    sync(except){
      document.querySelectorAll(sel(o.val)).forEach(el => {
        if(el === except) return;
        const v = o.get(el.dataset[o.val]);
        if(el.type === 'checkbox') el.checked = !!v; else if(v !== undefined && v !== null) el.value = v;
        if(el.type === 'range') paintRange(el);
      });
      document.querySelectorAll(sel(o.seg)).forEach(g => { const v = String(o.get(g.dataset[o.seg])); g.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); });
      document.querySelectorAll(sel(o.show)).forEach(el => { el.style.display = el.dataset[o.show].split('&').every(cond) ? '' : 'none'; });
    },
    // 基本の行（ボタン選択・プルダウン・別パターン・色・チェック・スライダー）の HTML。
    // r のキーで種類が決まる：seg / sel / seed / c / chk、どれでもなければスライダー（r.r＝キー、min/max/step 必須）。
    // 色は <input type=color> と hex 文字欄を同じキーで2つ並べる。colorTools が真のとき、ランダム色とスポイト（対応ブラウザのみ）も付ける
    row(r, colorTools){
      const sa = r.show ? ` data-${o.show}="${r.show}"` : '', V = o.val;
      if(r.seg) return `<div class="row"${sa}><label>${r.l || ''}</label><div class="seg" data-${o.seg}="${r.seg}">${r.opts.map(([v, t]) => `<button data-v="${v}">${t}</button>`).join('')}</div></div>`;
      if(r.sel) return `<div class="row"${sa}><label>${r.l}</label><select data-${V}="${r.sel}">${r.opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>`;
      if(r.seed) return `<div class="row"${sa}><label>${r.l}</label><button class="btn sm reroll" data-${o.reroll}="${r.seed}">${ic('dice')}別パターンにする</button></div>`;
      if(r.c) return `<div class="row"${sa}><label>${r.l}</label><div class="cpick"><input type="color" data-${V}="${r.c}"><input type="text" class="hex" data-${V}="${r.c}" maxlength="7" spellcheck="false">` +
        (colorTools ? `<button class="mini" data-rnd="${r.c}" title="この色だけランダム（明るさはそのまま）">${ic('dice')}</button>${'EyeDropper' in window ? `<button class="mini" data-eye="${r.c}" title="スポイト：画面上の色を拾う">${ic('drop')}</button>` : ''}` : '') + `</div></div>`;
      if(r.chk) return `<div class="row"${sa}><label></label><label class="chk"><input type="checkbox" data-${V}="${r.chk}"> ${r.l}</label></div>`;
      const a = `min="${r.min}" max="${r.max}" step="${r.step}"`;
      return `<div class="row"${sa}><label>${r.l}</label><input type="range" data-${V}="${r.r}" ${a}><input type="number" class="num" data-${V}="${r.r}" ${a}></div>`;
    },
  };
}
