"use client";

import type { EstadoCola } from "@/hooks/useCola";
import FranjaCola from "@/components/conductor/FranjaCola";
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

/**
 * La consola: lo único fijo de la pantalla del conductor.
 *
 * Arriba se lee y se elige; aquí abajo se decide. La fila de acción no cambia
 * nunca: las mismas tres celdas, con los mismos anchos y las mismas alturas,
 * en los cinco estados de la ruta. Es lo que el pulgar toca veinticinco veces
 * al día, y así aprende dónde está sin mirar.
 *
 * El nombre de la parada va dentro del botón principal. Es lo que impide
 * cerrar la tienda equivocada cuando se mira el móvil de reojo desde la calle,
 * y no cuesta nada.
 */
export default function Consola({
  cola,
  errorLocal,
  onReintentarLocal,
  activa,
  fueraDeSecuencia,
  appNav,
  bloqueado,
  onPrimario,
  onOtro,
  onFicha,
  rutaIniciada,
  onConfirmarRuta,
  confirmando,
  sinParadas,
  resumen,
  cd,
  salidaProg,
}: {
  cola: EstadoCola;
  errorLocal: string | null;
  onReintentarLocal: () => void;
  activa: ParadaConsola | null;
  fueraDeSecuencia: boolean;
  appNav: "maps" | "waze";
  /** Los 3 s posteriores a cerrar una parada: evita el doble toque. */
  bloqueado: boolean;
  onPrimario: () => void;
  onOtro: () => void;
  onFicha: () => void;
  rutaIniciada: boolean;
  onConfirmarRuta: () => void;
  confirmando: boolean;
  sinParadas: boolean;
  resumen: ResumenRuta;
  cd: { lat: number; lon: number } | null;
  salidaProg: string | null;
}) {
  // La ruta terminada es lo que se ve cuando no hay ninguna parada elegida.
  // Si el conductor toca una de las cerradas, la consola vuelve a hablar de
  // ella: si no, al cerrar la última parada del día ya no habría forma de
  // corregir ninguna.
  const terminada = resumen.total > 0 && resumen.cerradas === resumen.total && !activa;
  const cerrada = !!activa && activa.estado_entrega !== "pendiente";
  const nombre = activa?.nombre ?? activa?.codigo ?? "";

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-line-strong bg-surface pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto w-full max-w-[560px]">
        <FranjaCola
          cola={cola}
          errorLocal={errorLocal}
          onReintentarLocal={onReintentarLocal}
        />

        {/* D1 · ficha de la parada activa. El aire va fuera de la caja: si
            se lo come el relleno, los 64 px dejan de ser 64 px. */}
        <div className="px-3 pt-2">
          <div className="flex h-16 items-center gap-2.5">
            {!rutaIniciada ? (
              <>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy-800 text-[14px] font-extrabold text-white">
                  CD
                </span>
                <span className="min-w-0 flex-1 truncate text-[24px] font-extrabold leading-none tracking-tight text-ink">
                  Centro de distribución
                </span>
                {salidaProg && (
                  <span className="num shrink-0 text-[17px] font-bold text-ink-2">
                    salida {salidaProg.slice(0, 5)}
                  </span>
                )}
              </>
            ) : terminada ? (
              <span className="min-w-0 flex-1 text-[17px] font-bold leading-tight text-ink">
                <span className="num">
                  {resumen.cerradas}/{resumen.total}
                </span>{" "}
                paradas cerradas
                <span className="mt-0.5 block truncate text-[14px] font-semibold text-ink-2">
                  <span className="num">{resumen.conformes}</span> conformes ·{" "}
                  <span className="num">{resumen.parciales}</span> parciales ·{" "}
                  <span className="num">{resumen.fallidas}</span> no entregadas
                </span>
              </span>
            ) : (
              <>
                <span className="num grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber text-[17px] font-extrabold text-navy-900">
                  {activa?.orden ?? "—"}
                </span>
                <span className="min-w-0 flex-1">
                  {fueraDeSecuencia && (
                    <span className="block text-[13px] font-bold uppercase tracking-[0.1em] text-amber-600">
                      Fuera de secuencia
                    </span>
                  )}
                  {cerrada && (
                    <span className="block text-[13px] font-bold uppercase tracking-[0.1em] text-ink-2">
                      Ya marcada
                    </span>
                  )}
                  <span className="block truncate text-[24px] font-extrabold leading-none tracking-tight text-ink">
                    {nombre || "Sin paradas"}
                  </span>
                </span>
                {activa && (
                  <>
                    <span className="num shrink-0 text-[17px] font-bold text-ink-2">
                      {activa.bultos} blt
                    </span>
                    <button
                      onClick={onFicha}
                      aria-label="Ver la ficha del cliente"
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border border-line-strong bg-surface text-[17px] text-ink-2 active:bg-canvas"
                    >
                      ▾
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* D2 · fila de acción: tres celdas que nunca cambian de sitio */}
        <div className="px-3 pb-3 pt-2.5">
          <div className="flex h-[72px] items-stretch">
            {!rutaIniciada ? (
              <button
                onClick={onConfirmarRuta}
                disabled={confirmando || sinParadas}
                className="w-full rounded-[10px] border border-amber-600 bg-amber text-[17px] font-extrabold text-navy-900 active:bg-amber-600 disabled:pointer-events-none disabled:opacity-50"
              >
                {confirmando
                  ? "Confirmando…"
                  : "✓ CONFIRMAR RUTA Y SALIR DEL CD"}
              </button>
            ) : (
              <>
                <a
                  href={
                    terminada && cd
                      ? enlaceNavegacion(cd.lat, cd.lon, appNav)
                      : activa
                        ? enlaceNavegacion(activa.lat, activa.lon, appNav)
                        : "#"
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="grid w-[118px] shrink-0 place-items-center rounded-[10px] bg-navy-800 text-center text-[14px] font-bold leading-tight text-white active:bg-navy-700"
                >
                  {terminada ? (
                    <>
                      ▶ Volver
                      <br />
                      al CD
                    </>
                  ) : (
                    <>
                      ▶ Cómo
                      <br />
                      llegar
                    </>
                  )}
                </a>

                <div className="w-4" />

                <button
                  onClick={onPrimario}
                  disabled={bloqueado || (!activa && !terminada)}
                  className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 overflow-hidden rounded-[10px] ${
                    terminada || cerrada
                      ? "border border-navy-800 bg-navy-800 text-white active:bg-navy-700"
                      : "border border-amber-600 bg-amber text-navy-900 active:bg-amber-600"
                  } disabled:pointer-events-none`}
                >
                  {terminada ? (
                    <span className="text-[17px] font-extrabold leading-none">
                      RESUMEN DEL DÍA
                    </span>
                  ) : (
                    <>
                      <span className="text-[17px] font-extrabold leading-none">
                        {cerrada ? "✎ CORREGIR" : "✓ ENTREGADO"}
                      </span>
                      <span className="max-w-full truncate px-1 text-[13px] font-bold leading-none">
                        #{activa?.orden} · {nombre}
                      </span>
                    </>
                  )}
                  {bloqueado && (
                    <i className="cuenta absolute inset-x-0 bottom-0 h-[3px] bg-navy-900/35" />
                  )}
                </button>

                <div className="w-2.5" />

                <button
                  onClick={onOtro}
                  disabled={!activa}
                  className={`grid w-[77px] shrink-0 place-items-center rounded-[10px] border-2 border-line-strong bg-surface text-center text-[14px] font-bold leading-tight text-ink active:bg-canvas disabled:opacity-40 ${
                    terminada
                      ? "invisible"
                      : cerrada
                        ? "pointer-events-none opacity-40"
                        : ""
                  }`}
                >
                  ⋯
                  <br />
                  Otro
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
