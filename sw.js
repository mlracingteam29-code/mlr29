/* Application ML Racing Team — fonctionnement hors connexion léger.
   - Pages, textes et fichiers de données : réseau d'abord (toujours à jour), copie de secours si pas de réseau.
   - Images, icônes, styles : copie locale d'abord (rapide), mise à jour en arrière-plan.
   - Rien n'est mis en cache pour les autres sites (GitHub API, Google, Facebook…). */
const VERSION = "mlrt-v1";
const SHELL = ["./", "index.html", "style.css", "manifest.webmanifest", "membres/membres.js", "membres/roulages.js",
  "images/banniere.jpg", "images/app/icon-192.png", "images/app/icon-512.png", "textes.txt", "partenaires.txt", "roulages.txt", "equipe.txt"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  const isStatic = /\.(png|jpe?g|webp|gif|svg|css|ico|woff2?)$/i.test(url.pathname) && !/\/medias\//.test(url.pathname);
  if (isStatic) {
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  /* réseau d'abord ; on ne garde en secours que les pages et petits fichiers (pas les vidéos ni les gros fichiers membres) */
  e.respondWith(fetch(req).then(r => {
    const small = !/\.(mp4|webm|mov|pdf|zip)$/i.test(url.pathname) && !/\/membres\/f-/.test(url.pathname);
    if (r.ok && small) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return r;
  }).catch(async () => (await caches.match(req, { ignoreSearch: true })) || (req.mode === "navigate" ? caches.match("index.html") : Response.error())));
});
