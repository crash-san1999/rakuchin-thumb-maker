/* 楽ちんサムネメーカー：アプリとして使う（PWA）：Service Worker の登録、新しいバージョンのお知らせ、「アプリとして追加」ボタン */
/*
  Service Worker 本体は /sw.js。ここは「登録」と、画面側（更新バー #updBar・追加ボタン #pwaInstall）の制御だけを持つ。
  pwaRegister() は fonts.js の registerFontCache() 経由で boot()（main.js）から呼ばれる。
  更新の流れ：新しい sw.js が見つかる → install 済みで「待機」→ pwaShowUpdate() で更新バーを出す
    → 利用者が「更新」→ pwaApplyUpdate() が SKIP_WAITING を送る → controllerchange で location.reload()。
  自動で切り替えないのは、作業中に画面が勝手に再読み込みされて編集内容を失わないようにするため。
  依存：$ / toast（core.js）。#updBar など対応する HTML は index.html。
*/
let pwaReg = null, pwaPrompt = null;
function pwaRegister(){
  // file:// などでは Service Worker を登録できない（エラーになる）ので、http(s) のときだけ登録する
  if(!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    pwaReg = reg;
    // controller がある＝すでに旧版で動いている。初回インストール（controller なし）のときは「更新」ではないので知らせない
    const watch = w => w && w.addEventListener('statechange', () => { if(w.state === 'installed' && navigator.serviceWorker.controller) pwaShowUpdate(); });
    if(reg.waiting && navigator.serviceWorker.controller) pwaShowUpdate();   // すでに待機中の新しい版がある
    reg.addEventListener('updatefound', () => watch(reg.installing));
    // 開きっぱなしでも気づけるように、画面に戻ったときと30分ごとに確認する
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60 * 1000);
  }).catch(() => {});
  // 再読み込みするのは、利用者が「更新」を押した（pwaUpdating）ときだけ。初回の clients.claim() による controllerchange では再読み込みしない。reloading は二重実行の防止
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if(reloading || !pwaUpdating) return; reloading = true; location.reload(); });
}
let pwaUpdating = false;
function pwaShowUpdate(){
  const bar = $('#updBar'); if(!bar) return;
  bar.classList.add('show');
}
// 待機中の版がなければ（すでに切り替わっている等）、ただ再読み込みして最新を取りにいく
function pwaApplyUpdate(){
  const w = pwaReg && pwaReg.waiting; if(!w){ location.reload(); return; }
  pwaUpdating = true; w.postMessage('SKIP_WAITING');
}
// ボタンは委譲で受ける（更新バー・追加ボタンの HTML がいつ作られても動くように）。
// pwaPrompt.prompt() は利用者のクリック操作の中でしか呼べないので、beforeinstallprompt で受け取ったイベントを保持しておく
document.addEventListener('click', e => {
  if(e.target.closest('#updNow')) pwaApplyUpdate();
  else if(e.target.closest('#updLater')) $('#updBar').classList.remove('show');
  else if(e.target.closest('#pwaInstall') && pwaPrompt){ pwaPrompt.prompt(); pwaPrompt.userChoice.finally(() => { pwaPrompt = null; $('#pwaInstall').hidden = true; }); }
});
// 「アプリとして追加」：ブラウザが追加できる状態になったときだけボタンを出す（iPhone は Safari の共有メニューから）
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pwaPrompt = e; const b = $('#pwaInstall'); if(b) b.hidden = false; });
window.addEventListener('appinstalled', () => { pwaPrompt = null; const b = $('#pwaInstall'); if(b) b.hidden = true; toast('アプリとして追加しました'); });
