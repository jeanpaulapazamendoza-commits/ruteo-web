"use client";

import type { EstadoCola } from "@/hooks/useCola";
import FranjaCola from "@/components/conductor/FranjaCola";
import { IconoCheck, IconoIr } from "@/components/conductor/iconos";
import { enlaceNavegacion, type EstadoEntrega } from "@/lib/entregas";

export type ParadaConsola = {
  id: string;
  orden: number;
  nombre: string | null;
  codigo: string | null;
  lat: number;
  lon: number;
  bultos: number;
  estado_entrega: EstadoEntrega;
};

export type ResumenRuta = {
  total: number;
  cerradas: number;
  conformes: number;
  parciales: number;
  fallidas: number;
};

const PRIMARIO =
  "relative flex h-[58px] w-full flex-col items-center justify-center overflow-hidden rounded-full bg-amber text-white transition active:bg-amber-600 disabled:pointer-events-none disabled:opacity-60";
const SECUNDARIO =
  "flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface text-[15px] font-bold text-ink transition active:bg-canvas";

/**
 * La consola: lo único fijo de la pantalla del conductor.
 *
 * Arriba se lee; aquí abajo se decide, y se decide con un solo botón. Lo que
 * pasa nueve de cada diez veces —se entregó— es el botón grande, a todo el
 * ancho y al alcance del pulgar. Lo demás va debajo, más pequeño: cómo llegar
 * y la incidencia.
 *
 * El nombre de la parada va dentro del botón. La tarjeta de arriba puede
 * haberse ido con el scroll, y es lo que impide cerrar la tienda equivocada
 * cuando se mira el móvil de reojo desde la calle.
 */
export default function Consola({
  cola,
  errorLocal,
  onReintentarLocal,
  activa,
  appNav,
  bloqueado,
  guardando,
  onPrimario,
  onOtro,
  rutaIniciada,
  onConfirmarRuta,
  confirmando,
  sinParadas,
  resumen,
  cd,
}: {
  cola: EstadoCola;
  errorLocal: string | null;
  onReintentarLocal: () => void;
  activa: ParadaConsola | null;
  appNav: "maps" | "waze";
  /** Los 3 s posteriores a cerrar una parada: evita el doble toque. */
  bloqueado: boolean;
  /** La entrega está viajando al servidor ahora mismo. */
  guardando: boolean;
  onPrimario: () => void;
  onOtro: () => void;
  rutaIniciada: boolean;
  onConfirmarRuta: () => void;
  confirmando: boolean;
  sinParadas: boolean;
  resumen: ResumenRuta;
  cd: { lat: number; lon: number } | null;
}) {
  // La ruta terminada es lo que se ve cuando no hay ninguna parada elegida.
  // Si el conductor toca una de las cerradas, la consola vuelve a hablar de
  // ella: si no, al cerrar la última parada del día ya no habría forma de
  // corregir ninguna.
  const terminada = resumen.total > 0 && resumen.cerradas === resumen.total && !activa;
  const cerrada = !!activa && activa.estado_entrega !== "pendiente";
  const nombre = activa?.nombre ?? activa?.codigo ?? "";

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(19,32,69,0.06)]">
      <div className="mx-auto w-full max-w-[560px] px-4 pb-3 pt-1.5">
        <FranjaCola cola={cola} errorLocal={errorLocal} onReintentarLocal={onReintentarLocal} />

        <div className="mt-1.5 flex flex-col gap-2">
          {!rutaIniciada ? (
            <button
              onClick={onConfirmarRuta}
              disabled={confirmando || sinParadas}
              className={`${PRIMARIO} text-[17px] font-bold`}
            >
              {confirmando ? "Iniciando…" : "Iniciar ruta"}
            </button>
          ) : terminada ? (
            <>
              {cd ? (
                <a
                  href={enlaceNavegacion(cd.lat, cd.lon, appNav)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${PRIMARIO} flex-row gap-2 text-[17px] font-bold`}
                >
                  <IconoIr tam={18} /> Volver al centro
                </a>
              ) : null}
              <div className="flex gap-2">
                <button onClick={onPrimario} className={SECUNDARIO}>
                  Ver entregas del día
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={onPrimario}
                disabled={guardando || bloqueado || !activa}
                className={
                  cerrada
                    ? `${PRIMARIO} !bg-navy-800 active:!bg-navy-700`
                    : PRIMARIO
                }
              >
                <span className="flex items-center gap-2 text-[17px] font-bold leading-none">
                  {!cerrada && !guardando && <IconoCheck tam={18} />}
                  {guardando ? "Guardando…" : cerrada ? "Corregir entrega" : "Entregado"}
                </span>
                {activa && (
                  <span className="mt-1 max-w-full truncate px-6 text-[12.5px] font-medium leading-none text-white/85">
                    Parada {activa.orden} · {nombre}
                  </span>
                )}
                {bloqueado && (
                  <i className="cuenta absolute inset-x-0 bottom-0 h-[3px] bg-white/50" />
                )}
              </button>

              <div className="flex gap-2">
                <a
                  href={activa ? enlaceNavegacion(activa.lat, activa.lon, appNav) : "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={!activa}
                  className={`${SECUNDARIO} ${activa ? "" : "pointer-events-none opacity-40"}`}
                >
                  <IconoIr tam={16} /> Cómo llegar
                </a>
                {/* Una parada ya marcada no tiene incidencia que añadir: se
                    corrige con el botón grande. */}
                {!cerrada && (
                  <button onClick={onOtro} disabled={!activa} className={`${SECUNDARIO} disabled:opacity-40`}>
                    Incidencia
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
