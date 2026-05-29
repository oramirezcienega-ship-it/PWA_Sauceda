/*
  Service worker básico (Incremento 1).
  Objetivo mínimo: que la app sea instalable y tenga un cacheo simple
  para el shell. NO implementa estrategias avanzadas todavía.

  FUTURO: precache de rutas, estrategia stale-while-revalidate para datos,
  y manejo offline de la capa de captación/portal del cliente.
*/

const CACHE = "sauceda-shell-v2";
const RECURSOS = ["/", "/manifest.json", "/icons/icon.svg"];

// Instala y precachea el shell mínimo.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(RECURSOS)),
  );
  self.skipWaiting();
});

// Limpia caches viejos al activar.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c))),
      ),
  );
  self.clients.claim();
});

// Estrategia: red primero, con respaldo al cache si no hay conexión.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Las navegaciones (páginas) y las rutas dinámicas NO se cachean: siempre
  // van a la red para que los datos estén frescos (ej. portal del cliente).
  const url = new URL(request.url);
  const esDinamica =
    request.mode === "navigate" ||
    url.pathname.startsWith("/seguimiento") ||
    url.pathname.startsWith("/api");
  if (esDinamica) {
    event.respondWith(
      fetch(request).catch(
        () => caches.match(request).then((r) => r || caches.match("/")),
      ),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((respuesta) => {
        const copia = respuesta.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copia));
        return respuesta;
      })
      .catch(() => caches.match(request).then((r) => r || caches.match("/"))),
  );
});
