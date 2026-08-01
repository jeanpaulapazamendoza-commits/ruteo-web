/**
 * Service worker de la app de reparto.
 *
 * Hace dos cosas y ninguna más:
 *  1. Permite instalar la app en la pantalla de inicio del móvil.
 *  2. Deja abrir la app sin señal, sirviendo lo último que se vio.
 *
 * Lo que el conductor marca NO pasa por aquí: eso vive en IndexedDB (ver
 * src/lib/cola.ts), que sobrevive a cerrar la app y a quedarse sin batería.
 * Un service worker que intentase reenviar peticiones añadiría una segunda
 * fuente de verdad sobre las entregas, y con eso se duplican o se pierden.
 */
const CACHE = "reparto-v1";

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(["/conductor", "/manifest.json"]).catch(() => {})),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;

  // Solo navegación: los datos van siempre a la red, nunca servimos entregas viejas.
  if (peticion.method !== "GET" || peticion.mode !== "navigate") return;

  evento.respondWith(
    fetch(peticion)
      .then((respuesta) => {
        const copia = respuesta.clone();
        caches.open(CACHE).then((c) => c.put(peticion, copia)).catch(() => {});
        return respuesta;
      })
      .catch(() => caches.match(peticion).then((r) => r || caches.match("/conductor"))),
  );
});
