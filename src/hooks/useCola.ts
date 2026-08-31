"use client";

import { useCallback, useEffect, useState } from "react";
import { EVENTO_COLA, contarAtascadas, idsPendientes, sincronizar } from "@/lib/cola";

export type EstadoCola = {
  /** Entregas que ya son un problema: fallaron o llevan demasiado esperando. */
  pendientes: number;
  /** Qué paradas siguen sin llegar al servidor. Lo local manda sobre ellas. */
  ids: Set<string>;
  enLinea: boolean;
  sincronizando: boolean;
  subir: () => Promise<void>;
};

/**
 * Estado de las entregas que todavía no llegaron al servidor.
 *
 * Vive en un hook y no en la cabecera porque lo consumen dos pantallas —la
 * lista de rutas y la ruta abierta— y duplicar los escuchadores acabaría con
 * dos sincronizaciones peleándose por las mismas filas.
 *
 * En iPhone Safari no sincroniza en segundo plano, así que reintentar al
 * volver a primer plano (`visibilitychange`) no es un adorno: es la única
 * oportunidad real de que suba lo que se guardó sin cobertura.
 */
export function useCola(alSubir?: () => void): EstadoCola {
  const [pendientes, setPendientes] = useState(0);
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [enLinea, setEnLinea] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);

  const revisar = useCallback(async () => {
    try {
      const [n, s] = await Promise.all([contarAtascadas(), idsPendientes()]);
      setPendientes(n);
      setIds(s);
    } catch {
      /* sin IndexedDB no hay cola que mostrar */
    }
  }, []);

  const subir = useCallback(async () => {
    setSincronizando(true);
    try {
      const r = await sincronizar();
      await revisar();
      // Si algo llegó al servidor, la página tiene datos viejos: una parada
      // que ya está cerrada allí se seguiría enseñando como pendiente.
      if (r.subidas > 0) alSubir?.();
    } finally {
      setSincronizando(false);
    }
  }, [alSubir, revisar]);

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

    // Repaso periódico: una entrega que falló por un bache de cobertura no
    // debe esperar a que el conductor cambie de app para volver a intentarlo.
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

  return { pendientes, ids, enLinea, sincronizando, subir };
}
