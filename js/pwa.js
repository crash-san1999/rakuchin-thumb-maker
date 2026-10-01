/* 楽ちんサムネメーカー：アプリとして使う（PWA）：Service Worker の登録、新しいバージョンのお知らせ、「アプリとして追加」ボタン */
let pwaReg = null, pwaPrompt = null;
function pwaRegister(){
  if(!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    pwaReg = reg;
    const watch = w => w && w.addEventListener('statechange', () => { if(w.state === 'installed' && navigator.serviceWorker.controller) pwaShowUpdate(); });
    if(reg.waiting && navigator.serviceWorker.controller) pwaShowUpdate();   // すでに待機中の新しい版がある
    reg.addEventListener('updatefound', () => watch(reg.installing));
    // 開きっぱなしでも気づけるように、画面に戻ったときと30分ごとに確認する
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60 * 1000);
  }).catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if(reloading || !pwaUpdating) return; reloading = true; location.reload(); });
}
let pwaUpdating = false;
function pwaShowUpdate(){
  const bar = $('#updBar'); if(!bar) return;
  bar.classList.add('show');
}
function pwaApplyUpdate(){
  const w = pwaReg && pwaReg.waiting; if(!w){ location.reload(); return; }
  pwaUpdating = true; w.postMessage('SKIP_WAITING');
}
document.addEventListener('click', e => {
  if(e.target.closest('#updNow')) pwaApplyUpdate();
  else if(e.target.closest('#updLater')) $('#updBar').classList.remove('show');
  else if(e.target.closest('#pwaInstall') && pwaPrompt){ pwaPrompt.prompt(); pwaPrompt.userChoice.finally(() => { pwaPrompt = null; $('#pwaInstall').hidden = true; }); }
});
// 「アプリとして追加」：ブラウザが追加できる状態になったときだけボタンを出す（iPhone は Safari の共有メニューから）
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pwaPrompt = e; const b = $('#pwaInstall'); if(b) b.hidden = false; });
window.addEventListener('appinstalled', () => { pwaPrompt = null; const b = $('#pwaInstall'); if(b) b.hidden = true; toast('アプリとして追加しました'); });
