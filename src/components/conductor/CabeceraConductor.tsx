"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { EstadoCola } from "@/hooks/useCola";

/**
 * Cabecera de la app de reparto, en sus dos formas: la lista de rutas y una
 * ruta abierta.
 *
 * Ya no lleva el aviso de la cola. Ese aviso vivía aquí, aparecía y
 * desaparecía, y empujaba la página entera hacia abajo justo cuando el dedo
 * iba a tocar un botón; ahora ocupa un sitio fijo en la consola, a un palmo
 * del pulgar en vez de en la esquina más lejana de la pantalla.
 */
export default function CabeceraConductor(
  props:
    | { variante: "lista"; nombre: string; cola: EstadoCola }
    | {
        variante: "ruta";
        etiqueta: string;
        cerradas: number;
        total: number;
        mapaVisible: boolean;
        onPlegarMapa: () => void;
        cola: EstadoCola;
      },
) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const pendientes = props.cola.pendientes;

  async function salir() {
    const supabase = crearClienteNavegador();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const pct = props.variante === "ruta" && props.total ? (props.cerradas / props.total) * 100 : 0;

  return (
    <>
      <div className="h-[env(safe-area-inset-top)] bg-navy-900" />
      <header className="sticky top-0 z-30 bg-navy-900">
        {props.variante === "lista" ? (
          <div className="mx-auto flex h-14 w-full max-w-[560px] items-center gap-2.5 border-b border-line/20 px-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-amber text-[17px] font-extrabold text-navy-900">
              R
            </span>
            <span className="min-w-0 flex-1 truncate text-[17px] font-bold text-white">
              {props.nombre}
            </span>
            <BotonMenu onClick={() => setMenu(true)} />
          </div>
        ) : (
          <>
            <div className="mx-auto flex h-14 w-full max-w-[560px] items-center gap-1 px-1.5">
              <Link
                href="/conductor"
                aria-label="Volver a tus rutas"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-[17px] text-white active:bg-white/10"
              >
                ‹
              </Link>
              <span className="shrink-0 rounded-[7px] bg-navy-700 px-2 py-1 text-[13px] font-bold text-white">
                {props.etiqueta}
              </span>
              <span className="num ml-2 text-[17px] font-extrabold text-white">
                {props.cerradas}/{props.total}
              </span>
              <span className="flex-1" />
              <button
                onClick={props.onPlegarMapa}
                aria-label="Mostrar u ocultar el mapa"
                aria-pressed={props.mapaVisible}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-[17px] text-white active:bg-white/10"
              >
                🗺
              </button>
              <BotonMenu onClick={() => setMenu(true)} />
            </div>
            {/* Regla de avance: el único sitio donde el progreso es continuo */}
            <div className="h-1 w-full bg-navy-700">
              <div
                className={`h-full transition-[width] duration-200 ${pct === 100 ? "bg-ok" : "bg-live"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        )}
      </header>

      {menu && (
        <div className="fixed inset-0 z-50 bg-navy-900/45" onClick={() => setMenu(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="hoja absolute inset-x-0 bottom-0 mx-auto w-full max-w-[560px] rounded-t-[14px] bg-surface p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" />
            {!confirmar ? (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setConfirmar(true)}
                  className="h-16 w-full rounded-[12px] border-2 border-line-strong bg-surface text-[17px] font-bold text-ink active:bg-canvas"
                >
                  Cerrar sesión
                </button>
                <button
                  onClick={() => setMenu(false)}
                  className="h-14 w-full rounded-[12px] text-[14px] font-bold text-ink-2"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div>
                <h2 className="text-[17px] font-extrabold tracking-tight text-ink">
                  {pendientes > 0 ? (
                    <>
                      Tienes <span className="num">{pendientes}</span> entregas sin subir
                    </>
                  ) : (
                    "¿Cerrar sesión?"
                  )}
                </h2>
                {pendientes > 0 && (
                  <p className="mt-1.5 text-[14px] font-medium text-ink-2">
                    Si cierras sesión ahora podrías perderlas. Conéctate y súbelas primero.
                  </p>
                )}
                <div className="mt-3 flex flex-col gap-2">
                  {pendientes > 0 && (
                    <button
                      onClick={() => props.cola.subir()}
                      className="h-16 w-full rounded-[12px] border border-amber-600 bg-amber text-[17px] font-extrabold text-navy-900 active:bg-amber-600"
                    >
                      Subir ahora
                    </button>
                  )}
                  <button
                    onClick={salir}
                    className="h-16 w-full rounded-[12px] border-2 border-bad bg-surface text-[17px] font-bold text-ink active:bg-canvas"
                  >
                    {pendientes > 0 ? "Cerrar sesión igualmente" : "Cerrar sesión"}
                  </button>
                  <button
                    onClick={() => { setConfirmar(false); setMenu(false); }}
                    className="h-14 w-full rounded-[12px] text-[14px] font-bold text-ink-2"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function BotonMenu({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Menú"
      className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-[17px] text-white active:bg-white/10"
    >
      ⋯
    </button>
  );
}
