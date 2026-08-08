/**
 * Service worker : contrôle du cache et fonctionnement hors ligne.
 *
 * Pourquoi il existe : ajoutée à l'écran d'accueil d'un iPhone, une page web est
 * mise en cache si agressivement qu'une modification publiée peut rester
 * invisible pendant des jours, même après avoir quitté et relancé l'application.
 * Versionner les URLs des fichiers ne suffit pas, puisque c'est index.html
 * lui-même — celui qui porte ces URLs — qui reste figé.
 *
 * Stratégie : réseau d'abord, cache en secours. Avec du réseau, on voit toujours
 * la dernière version ; sans réseau, le site reste consultable.
 */

const CACHE = "munich2026-v20";

// Les SDK Firebase pèsent ~700 Ko et leur URL contient déjà le numéro de
// version : une fois en cache, ils n'ont plus jamais besoin d'être retéléchargés.
const SDK_PREFIX = "https://www.gstatic.com/firebasejs/";

const PRECACHE = [
  "./",
  "./index.html",
  "./assets/app.js",
  "./assets/render.js",
  "./assets/styles.css",
  // Configuration Firebase chiffrée : sans elle, une première connexion hors
  // ligne échouerait alors que tout le reste du site est déjà en cache.
  "./config.enc.json"
];

self.addEventListener("install", (event) => {
  // Un fichier manquant ne doit pas faire échouer toute l'installation.
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Les SDK Firebase : cache d'abord, leur contenu ne change jamais pour une
  // version donnée.
  if (request.url.startsWith(SDK_PREFIX)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }))
    );
    return;
  }

  // Tout ce qui n'est pas à nous passe sans interception : les appels à
  // Firestore et à l'authentification ne doivent surtout pas être mis en cache.
  if (!sameOrigin) return;

  // Réseau d'abord, cache en secours.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match("./index.html")))
  );
});
