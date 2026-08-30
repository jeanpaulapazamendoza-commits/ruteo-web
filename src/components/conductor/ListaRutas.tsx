"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCola } from "@/hooks/useCola";
import CabeceraConductor from "@/components/conductor/CabeceraConductor";
import FranjaCola from "@/components/conductor/FranjaCola";

export type RutaResumen = {
  id: string;
  etiqueta: string;
  despacho: string;
  fecha: string;
  total: number;
  cerradas: number;
  bultos: number;
  km: number | null;
  salidaReal: string | null;
};

/**
 * Las rutas del día.
 *
 * Tocar una tarjeta la selecciona; abrirla es el botón grande de abajo. Con
 * una sola ruta no hay redirección automática: entrar solo para que el botón
 * de volver te devuelva a una pantalla que vuelve a entrar es una trampa, y
 * un toque sobre un objetivo de 72 px al alcance del pulgar cuesta menos.
 */
export default function ListaRutas({
  nombre,
  rutas,
}: {
  nombre: string;
  rutas: RutaResumen[];
}) {
  const router = useRouter();
  const cola = useCola();
  const [elegida, setElegida] = useState<string | null>(rutas.length === 1 ? rutas[0].id : null);

  const ruta = rutas.find((r) => r.id === elegida) ?? null;

  return (
    <>
      <CabeceraConductor variante="lista" nombre={nombre} cola={cola} />

      <div className="px-3 pb-[calc(138px+env(safe-area-inset-bottom)+12px)] pt-3">
        {rutas.length === 0 ? (
          <div className="rounded-[14px] border border-line bg-surface p-6 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-[14px] bg-amber-050 text-2xl">
              🚚
            </div>
            <h2 className="text-[17px] font-extrabold tracking-tight text-ink">
              No tienes rutas asignadas
            </h2>
            <p className="mt-1.5 text-[14px] font-medium text-ink-2">
              Cuando el planificador te asigne una ruta, aparecerá aquí con todas sus paradas.
            </p>
          </div>
        ) : (
          <>
            <h1 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-[0.1em] text-ink-2">
              Tus rutas de hoy
            </h1>
            <div className="flex flex-col gap-2.5">
              {rutas.map((r) => {
                const pct = r.total ? Math.round((r.cerradas / r.total) * 100) : 0;
                return (
                  <button
                    key={r.id}
                    onClick={() => setElegida(r.id)}
                    className={`w-full rounded-[14px] border-2 p-3 text-left ${
                      elegida === r.id ? "border-amber-600 bg-amber-050" : "border-line bg-surface"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded-[7px] bg-navy-800 px-2 py-1 text-[13px] font-bold text-white">
                        {r.etiqueta}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[17px] font-bold text-ink">
                        {r.despacho}
                      </span>
                      <span className="num shrink-0 text-[14px] font-semibold text-ink-2">
                        {r.fecha}
                      </span>
                    </div>

                    <div className="mt-2 text-[17px] font-bold text-ink-2">
                      <span className="num text-ink">{r.total}</span> paradas ·{" "}
                      <span className="num text-ink">{r.bultos}</span> bultos
                      {r.km ? (
                        <>
                          {" "}
                          · <span className="num text-ink">{Number(r.km).toFixed(0)}</span> km
                        </>
                      ) : null}
                    </div>

                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-canvas">
                      <div
                        className={`h-full rounded-full ${pct === 100 ? "bg-ok" : "bg-live"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="mt-2 text-[14px] font-semibold">
                      {r.salidaReal ? (
                        <span className="text-ink-2">
                          Salió{" "}
                          <b className="num">
                            {new Date(r.salidaReal).toLocaleTimeString("es-PE", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </b>{" "}
                          · <span className="num">{r.cerradas}</span> de{" "}
                          <span className="num">{r.total}</span> hechas
                        </span>
                      ) : (
                        <span className="text-ink">Sin iniciar</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Consola de lista: la misma franja y el mismo botón grande de siempre */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-line-strong bg-surface pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto w-full max-w-[560px]">
          <FranjaCola cola={cola} />
          <div className="px-3 pb-3 pt-2.5">
            {rutas.length === 0 ? (
              <button
                onClick={() => router.refresh()}
                className="h-[72px] w-full rounded-[10px] border-2 border-line-strong bg-surface text-[17px] font-extrabold text-ink active:bg-canvas"
              >
                Actualizar
              </button>
            ) : ruta ? (
              <button
                onClick={() => router.push(`/conductor/${ruta.id}`)}
                className="h-[72px] w-full rounded-[10px] border border-amber-600 bg-amber text-[17px] font-extrabold text-navy-900 active:bg-amber-600"
              >
                Abrir {ruta.etiqueta} ▶
              </button>
            ) : (
              <div className="grid h-[72px] w-full place-items-center rounded-[10px] border-2 border-line-strong bg-surface-2 text-[17px] font-extrabold text-ink-2">
                Toca una ruta para abrirla
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
