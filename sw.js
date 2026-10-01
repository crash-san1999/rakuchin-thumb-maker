/* 楽ちんサムネメーカー：Service Worker
   ① フォントのキャッシュ：一度読み込んだフォントを端末に保存し、次回からは通信せずに使う（フォントを差し替えたら FONT_CACHE の番号を上げる）
   ② アプリ本体（HTML・JS・CSS・アイコン）の保存：オフラインでも起動できるようにする。
      通信できるときは必ず最新を取りにいく（ネットワーク優先）。保存したものは、通信できないときだけ使う。
   APP_VER は tools/bump-version.sh が書き換える（中身が変わるたびに変わる）。変わると新しい Service Worker が「待機」になり、
   画面に「新しいバージョンがあります」と出る。「更新」を押す（pwa.js が SKIP_WAITING を送る）と切り替わる */
const APP_VER = '3b7bb950';
const FONT_CACHE = 'ttm-fonts-v1', APP_CACHE = 'ttm-app-' + APP_VER;
const isFont = u => u.origin === location.origin ? /\/fonts\/.+\.(woff2?|otf|ttf)$/i.test(u.pathname)
  : (u.hostname === 'cdn.jsdelivr.net' && /^\/(gh|npm)\//.test(u.pathname) && /\.(woff2?|otf|ttf|css)$/i.test(u.pathname)) || u.hostname === 'fonts.gstatic.com';
const isApp = u => u.origin === location.origin && !/\/fonts\//.test(u.pathname) && !/\/(docs|tests|tools)\//.test(u.pathname);

// 最初に、index.html から読み込んでいるファイルをまとめて保存する（これで、一度開けばオフラインでも動く）
async function precache(){
  const c = await caches.open(APP_CACHE), idx = await fetch('index.html', {cache: 'no-cache'});
  const html = await idx.clone().text();
  const urls = [...html.matchAll(/(?:src|href)="([^"#:]+\.(?:js|css|png|webmanifest)(?:\?[^"]*)?)"/g)].map(m => m[1]);
  await c.put('index.html', idx);
  await Promise.all([...new Set([...urls, 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'])].map(u => c.add(new Request(u, {cache: 'no-cache'})).catch(() => {})));
}
self.addEventListener('install', e => e.waitUntil(precache().catch(() => {})));   // skipWaiting はしない（作業中に勝手に入れ替わらないように）
self.addEventListener('message', e => { if(e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys()
  .then(ks => Promise.all(ks.filter(k => (k.startsWith('ttm-app-') && k !== APP_CACHE) || (k.startsWith('ttm-fonts-') && k !== FONT_CACHE)).map(k => caches.delete(k))))
  .then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if(r.method !== 'GET') return;
  if(isFont(u)){
    e.respondWith(caches.open(FONT_CACHE).then(async c => {
      const hit = await c.match(r); if(hit) return hit;
      const res = await fetch(r);
      if(res.ok && (res.type === 'basic' || res.type === 'cors')) c.put(r, res.clone()).catch(() => {});
      return res;
    }));
    return;
  }
  if(!isApp(u)) return;
  // アプリ本体：ネットワーク優先（常に最新）。失敗したら保存したものを使う
  e.respondWith((async () => {
    const c = await caches.open(APP_CACHE), key = r.mode === 'navigate' ? 'index.html' : r;
    try{
      const res = await fetch(r, {cache: 'no-cache'});
      if(res.ok && res.type === 'basic') c.put(key, res.clone()).catch(() => {});
      return res;
    }catch(err){
      const hit = await c.match(key, {ignoreSearch: r.mode === 'navigate'}) || await c.match(r, {ignoreSearch: true});
      if(hit) return hit;
      throw err;
    }
  })());
});
