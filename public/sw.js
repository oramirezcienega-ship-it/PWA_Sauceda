/*
  Service worker básico (Incremento 1).
  Objetivo mínimo: que la app sea instalable y tenga un cacheo simple
  para el shell. NO implementa estrategias avanzadas todavía.

  FUTURO: precache de rutas, estrategia stale-while-revalidate para datos,
  y manejo offline de la capa de captación/portal del cliente.
*/

const CACHE = "sauceda-shell-v3";
// No se precachea "/" (es el panel privado): si se cacheara con sesión, luego
// se le mostraría a un usuario sin sesión. El respaldo offline es /login.
const RECURSOS = ["/login", "/manifest.json", "/icons/icon.svg"];

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
        () => caches.match(request).then((r) => r || caches.match("/login")),
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
      .catch(() => caches.match(request).then((r) => r || caches.match("/login"))),
  );
});

// Manejo de clic en notificaciones (PWA Persistente)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  
  const urlParaAbrir = event.notification.data?.enlace 
    ? new URL(event.notification.data.enlace, self.location.origin).href 
    : self.location.origin;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientes) => {
      // Buscar si ya hay una pestaña abierta de la app y enfocarla
      for (const cliente of clientes) {
        if (cliente.url.startsWith(self.location.origin)) {
          // Navegar a la URL del enlace y enfocar
          cliente.navigate(urlParaAbrir);
          return cliente.focus();
        }
      }
      // Si no, abrir una nueva pestaña
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlParaAbrir);
      }
    })
  );
});
