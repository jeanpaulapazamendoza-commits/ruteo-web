"use client";

import { useEffect } from "react";

/** Registra el service worker para que la app se pueda instalar y abrir sin señal. */
export default function RegistrarSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // En desarrollo estorba: cachearía páginas que cambian a cada guardado.
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* sin service worker la app sigue funcionando, solo no se instala */
    });
  }, []);
  return null;
}
