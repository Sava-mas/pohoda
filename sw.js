// Службовий працівник: сторінка відкривається без мережі й показує останній завантажений прогноз.
// Стратегія: спершу мережа (щоб оновлення приходили одразу), якщо її немає — збережена копія.
"use strict";
const SHELL = "pohoda-shell-v1", DATA = "pohoda-data-v1";
const SHELL_FILES = ["./", "index.html", "css/style.css", "js/config.js", "js/app.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"];
const API_HOSTS = ["api.open-meteo.com", "ensemble-api.open-meteo.com", "previous-runs-api.open-meteo.com"];
const API_TIMEOUT = 12000;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== DATA).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function timeout(ms){ return new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)); }

async function apiFetch(req){
  const cache = await caches.open(DATA);
  try{
    const res = await Promise.race([fetch(req), timeout(API_TIMEOUT)]);
    if(res.ok){
      // зберігаємо копію з позначкою часу отримання
      const body = await res.clone().blob();
      const h = new Headers({"content-type": res.headers.get("content-type") || "application/json", "x-fetched-at": String(Date.now())});
      await cache.put(req, new Response(body, {status: 200, headers: h}));
    }
    return res;
  }catch(err){
    const hit = await cache.match(req);
    if(hit){ const h = new Headers(hit.headers); h.set("x-from-cache", "1"); return new Response(await hit.blob(), {status: 200, headers: h}); }
    throw err;
  }
}
async function shellFetch(req){
  const cache = await caches.open(SHELL);
  try{
    const res = await fetch(req);
    if(res.ok) cache.put(req, res.clone());
    return res;
  }catch(err){
    const hit = await cache.match(req, {ignoreSearch: true}) || (req.mode === "navigate" ? await cache.match("index.html") : null);
    if(hit) return hit;
    throw err;
  }
}
self.addEventListener("fetch", e => {
  const req = e.request; if(req.method !== "GET") return;
  const url = new URL(req.url);
  if(API_HOSTS.includes(url.hostname)) e.respondWith(apiFetch(req));
  else if(url.origin === self.location.origin) e.respondWith(shellFetch(req));
});
