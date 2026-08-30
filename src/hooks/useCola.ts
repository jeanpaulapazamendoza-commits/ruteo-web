"use client";

import { useCallback, useEffect, useState } from "react";
import { EVENTO_COLA, contarAtascadas, sincronizar } from "@/lib/cola";

export type EstadoCola = {
  /** Entregas que ya son un problema: fallaron o llevan demasiado esperando. */
  pendientes: number;
  enLinea: boolean;
  sincronizando: boolean;
  subir: () => Promise<void>;
};

/**
 * Estado de la cola de entregas sin subir.
 *
 * Vive en un hook y no en la cabecera porque lo consumen dos pantallas —la
 * lista de rutas y la ruta abierta— y duplicar los escuchadores acabaría con
 * dos sincronizaciones simultáneas peleándose por las mismas filas.
 *
 * En iPhone Safari no sincroniza en segundo plano, así que reintentar al
 * volver a primer plano (`visibilitychange`) no es un adorno: es la única
 * oportunidad real de que suba lo guardado sin señal.
 */
export function useCola(): EstadoCola {
  const [pendientes, setPendientes] = useState(0);
  const [enLinea, setEnLinea] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);

  const revisar = useCallback(async () => {
    try {
      setPendientes(await contarAtascadas());
    } catch {
      /* sin IndexedDB no hay cola que mostrar */
    }
  }, []);

  const subir = useCallback(async () => {
    setSincronizando(true);
    try {
      const r = await sincronizar();
      setPendientes(r.quedan);
    } finally {
      setSincronizando(false);
    }
  }, []);

  useEffect(() => {
    // `navigator.onLine` no existe en el servidor: se sincroniza al montar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnLinea(navigator.onLine);
    revisar();

    const alVolver = () => { setEnLinea(true); subir(); };
    const alCaer = () => setEnLinea(false);
    const alMostrar = () => {
      if (document.visibilityState !== "visible") return;
      revisar();
      if (navigator.onLine) subir();
    };

    window.addEventListener("online", alVolver);
    window.addEventListener("offline", alCaer);
    document.addEventListener("visibilitychange", alMostrar);
    window.addEventListener(EVENTO_COLA, revisar);

    // Lo retenido por el deshacer deja de estarlo sin que nadie lo toque:
    // hace falta un repaso periódico o se quedaría en el móvil hasta que el
    // conductor cambiara de app.
    const t = setInterval(() => {
      revisar();
      if (navigator.onLine) subir();
    }, 15000);

    return () => {
      window.removeEventListener("online", alVolver);
      window.removeEventListener("offline", alCaer);
      document.removeEventListener("visibilitychange", alMostrar);
      window.removeEventListener(EVENTO_COLA, revisar);
      clearInterval(t);
    };
  }, [revisar, subir]);

  return { pendientes, enLinea, sincronizando, subir };
}
