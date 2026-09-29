/* 楽ちんサムネメーカー：入力欄と値をつなぐしくみ（文字スタイル用・サムネ用で共通） */
/*
  makeBinder(o) で、ある「値の入れ物」と画面の入力欄をつなぐ。属性名は入れ物ごとに変える。
    o.val    … 値を入れる入力欄（例 data-k="shadow.blur"）
    o.seg    … ボタンで選ぶ欄（例 data-seg="align"。data-num を付けると数値として扱う）
    o.show   … 表示条件（例 data-show="bg.type=image&bg.tone!=none"）
    o.reroll … 「別パターンにする」ボタン（乱数の種を振り直す）
    o.get(k) / o.onInput(k, v, el) / o.onSeg(k, v, btn) / o.onReroll(k) … 値の読み出しと、変更されたときの処理
*/
function readInput(el){
  if(el.type === 'checkbox') return el.checked;
  if(el.type === 'range' || el.type === 'number' || el.dataset.num){ const v = parseFloat(el.value); return isNaN(v) ? undefined : v; }
  if(el.classList.contains('hex')) return /^#[0-9a-f]{6}$/i.test(el.value) ? el.value.toLowerCase() : undefined;
  return el.value;
}
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
    // 基本の行（ボタン選択・プルダウン・別パターン・色・チェック・スライダー）の HTML
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
