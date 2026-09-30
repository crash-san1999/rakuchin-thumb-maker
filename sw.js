/* フォントのキャッシュ用 Service Worker。一度読み込んだフォントを端末に保存し、次回からは通信せずに使えるようにする。
   アプリ本体（HTML・JS・CSS）は対象外なので、更新はこれまで通り反映される。フォントを差し替えたら CACHE の番号を上げる */
const CACHE = 'ttm-fonts-v1';
const isFont = u => u.origin === location.origin ? /\/fonts\/.+\.(woff2?|otf|ttf)$/i.test(u.pathname)
  : (u.hostname === 'cdn.jsdelivr.net' && /^\/(gh|npm)\//.test(u.pathname) && /\.(woff2?|otf|ttf|css)$/i.test(u.pathname)) || u.hostname === 'fonts.gstatic.com';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ttm-fonts-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request;
  if(r.method !== 'GET' || !isFont(new URL(r.url))) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(r); if(hit) return hit;
    const res = await fetch(r);
    if(res.ok && (res.type === 'basic' || res.type === 'cors')) c.put(r, res.clone()).catch(() => {});
    return res;
  }));
});
