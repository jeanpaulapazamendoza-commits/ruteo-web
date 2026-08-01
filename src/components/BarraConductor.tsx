"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { EVENTO_COLA, listarPendientes, sincronizar } from "@/lib/cola";

/**
 * Cabecera fija de la app de reparto.
 *
 * Además del nombre, lleva el aviso de entregas guardadas en el móvil que
 * todavía no han llegado al servidor. Es lo primero que mira un conductor que
 * estuvo sin señal, y en iPhone es imprescindible: allí la cola no puede
 * subirse sola en segundo plano, así que el aviso es el que le dice que
 * abra la app en cuanto tenga cobertura.
 */
export default function BarraConductor({ nombre }: { nombre: string }) {
  const router = useRouter();
  const [pendientes, setPendientes] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  const [enLinea, setEnLinea] = useState(true);

  const revisar = useCallback(async () => {
    try {
      setPendientes((await listarPendientes()).length);
    } catch {
      /* sin IndexedDB no hay cola que mostrar */
    }
  }, []);

  const subir = useCallback(async () => {
    setSincronizando(true);
    try {
      const r = await sincronizar();
      setPendientes(r.quedan);
      if (r.subidas > 0) router.refresh();
    } finally {
      setSincronizando(false);
    }
  }, [router]);

  useEffect(() => {
    // `navigator.onLine` solo existe en el navegador, así que no puede leerse
    // en el estado inicial sin romper la hidratación: se sincroniza al montar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnLinea(navigator.onLine);
    revisar();

    const alVolver = () => {
      setEnLinea(true);
      subir();
    };
    const alCaer = () => setEnLinea(false);
    // En iPhone no hay sincronización en segundo plano: se reintenta cada vez
    // que la app vuelve a primer plano.
    const alMostrar = () => {
      if (document.visibilityState === "visible") {
        revisar();
        if (navigator.onLine) subir();
      }
    };

    window.addEventListener("online", alVolver);
    window.addEventListener("offline", alCaer);
    document.addEventListener("visibilitychange", alMostrar);
    // Cada entrega que se guarda sin señal actualiza el contador al instante.
    window.addEventListener(EVENTO_COLA, revisar);
    return () => {
      window.removeEventListener("online", alVolver);
      window.removeEventListener("offline", alCaer);
      document.removeEventListener("visibilitychange", alMostrar);
      window.removeEventListener(EVENTO_COLA, revisar);
    };
  }, [revisar, subir]);

  async function salir() {
    const supabase = crearClienteNavegador();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-navy-900 text-white">
      <div className="mx-auto flex w-full max-w-[560px] items-center gap-2.5 px-3 py-2.5">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-gradient-to-br from-amber to-amber-600 text-[13px] font-extrabold text-[#231403]">
          R
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold leading-tight">{nombre}</div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[#7e90a8]">
            Reparto
          </div>
        </div>
        {!enLinea && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[#ffd7a1]">
            Sin señal
          </span>
        )}
        <button
          onClick={salir}
          className="rounded-[8px] px-2 py-1 text-[12px] font-medium text-[#b4c2d6] transition hover:bg-white/10"
        >
          Salir
        </button>
      </div>

      {pendientes > 0 && (
        <button
          onClick={subir}
          disabled={sincronizando || !enLinea}
          className="w-full bg-amber px-3 py-2 text-[12.5px] font-bold text-[#231403] transition disabled:opacity-70"
        >
          {sincronizando
            ? "Subiendo…"
            : enLinea
              ? `↑ ${pendientes} entrega(s) sin subir · toca para subirlas`
              : `${pendientes} entrega(s) guardadas · se subirán al volver la señal`}
        </button>
      )}
    </header>
  );
}
