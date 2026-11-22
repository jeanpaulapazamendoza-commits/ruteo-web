"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { hora } from "@/lib/horas";
import { useCola } from "@/hooks/useCola";
import CabeceraConductor from "@/components/conductor/CabeceraConductor";
import FranjaCola from "@/components/conductor/FranjaCola";
import { IconoAdelante } from "@/components/conductor/iconos";

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
 * Las rutas del conductor.
 *
 * Una tarjeta por ruta, y tocarla la abre. Antes había que elegirla y luego
 * pulsar un botón abajo: dos toques para lo único que se puede hacer en esta
 * pantalla.
 *
 * Con una sola ruta no hay redirección automática: entrar solo para que el
 * botón de volver te devuelva a una pantalla que vuelve a entrar es una
 * trampa.
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
  const pila = nombre.trim().split(/\s+/)[0];

  return (
    <>
      <CabeceraConductor variante="lista" nombre={nombre} cola={cola} />

      <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-5">
        <h1 className="text-[24px] font-bold leading-tight tracking-tight text-ink">Hola, {pila}</h1>
        <p className="mt-1 text-[15px] text-ink-2">
          {rutas.length === 0
            ? "Hoy no tienes rutas asignadas."
            : rutas.length === 1
              ? "Tienes una ruta. Tócala para abrirla."
              : `Tienes ${rutas.length} rutas. Toca una para abrirla.`}
        </p>

        {/* Solo se ve si hay algo que decir: aquí no hay botones que empujar. */}
        {(cola.pendientes > 0 || cola.sincronizando) && (
          <div className="mt-3">
            <FranjaCola cola={cola} />
          </div>
        )}

        {rutas.length === 0 ? (
          <div className="mt-5 rounded-[16px] border border-line bg-surface p-5 text-center">
            <p className="text-[15px] leading-snug text-ink-2">
              Cuando el planificador te asigne una ruta, aparecerá aquí con todas sus paradas.
            </p>
            <button
              onClick={() => router.refresh()}
              className="mt-4 h-12 w-full rounded-full border border-line-strong bg-surface text-[15px] font-bold text-ink active:bg-canvas"
            >
              Actualizar
            </button>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-3">
            {rutas.map((r) => {
              const pct = r.total ? Math.round((r.cerradas / r.total) * 100) : 0;
              const hecha = r.total > 0 && r.cerradas === r.total;
              return (
                <Link
                  key={r.id}
                  href={`/conductor/${r.id}`}
                  className="block rounded-[16px] border border-line bg-surface p-4 shadow-[0_2px_10px_rgba(19,32,69,0.05)] active:bg-canvas"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[19px] font-bold text-ink">{r.etiqueta}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${
                        hecha
                          ? "bg-ok-bg text-ok"
                          : r.salidaReal
                            ? "bg-amber-050 text-amber-600"
                            : "bg-canvas text-ink-2"
                      }`}
                    >
                      {hecha ? "Terminada" : r.salidaReal ? "En ruta" : "Sin iniciar"}
                    </span>
                    <IconoAdelante tam={18} className="ml-auto text-ink-3" />
                  </div>
                  <p className="mt-0.5 truncate text-[14px] text-ink-2">{r.despacho}</p>

                  <p className="mt-3 text-[15px] text-ink-2">
                    <b className="num text-ink">{r.total}</b> {r.total === 1 ? "parada" : "paradas"} ·{" "}
                    <b className="num text-ink">{r.bultos}</b> bultos
                    {r.km ? (
                      <>
                        {" "}
                        · <b className="num text-ink">{Number(r.km).toFixed(0)}</b> km
                      </>
                    ) : null}
                  </p>

                  {r.salidaReal && (
                    <>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-canvas">
                        <div
                          className={`h-full rounded-full ${hecha ? "bg-ok" : "bg-amber"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-2 text-[13.5px] text-ink-2">
                        Salió a las <span className="num">{hora(r.salidaReal)}</span> ·{" "}
                        <span className="num">{r.cerradas}</span> de <span className="num">{r.total}</span>{" "}
                        hechas
                      </p>
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
