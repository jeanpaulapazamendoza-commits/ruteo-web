"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { salir as cerrarSesion } from "@/app/acciones-sesion";
import type { EstadoCola } from "@/hooks/useCola";
import Logo from "@/components/Logo";
import { IconoAtras, IconoMenu } from "@/components/conductor/iconos";

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
        cola: EstadoCola;
      },
) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const pendientes = props.cola.pendientes;

  async function salir() {
    await cerrarSesion();
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
            <Logo variante="isotipo" alto={30} className="shrink-0" />
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
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white active:bg-white/10"
              >
                <IconoAtras />
              </Link>
              <span className="text-[17px] font-bold text-white">{props.etiqueta}</span>
              <span className="flex-1" />
              <span className="text-[14px] font-medium text-white/80">
                <b className="num text-[17px] font-bold text-white">{props.cerradas}</b> de{" "}
                <span className="num">{props.total}</span>
              </span>
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
            className="hoja absolute inset-x-0 bottom-0 mx-auto w-full max-w-[560px] rounded-t-[20px] bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line-strong" />
            {!confirmar ? (
              <div className="flex flex-col gap-2">
                <Link
                  href="/cuenta"
                  className="grid h-14 w-full place-items-center rounded-full border border-line-strong bg-surface text-[16px] font-bold text-ink active:bg-canvas"
                >
                  Mi cuenta y contraseña
                </Link>
                <button
                  onClick={() => setConfirmar(true)}
                  className="h-14 w-full rounded-full border border-line-strong bg-surface text-[16px] font-bold text-ink active:bg-canvas"
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
                      className="h-14 w-full rounded-full bg-amber text-[16px] font-bold text-white active:bg-amber-600"
                    >
                      Subir ahora
                    </button>
                  )}
                  <button
                    onClick={salir}
                    className="h-14 w-full rounded-full border border-bad bg-surface text-[16px] font-bold text-bad active:bg-bad-bg"
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
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white active:bg-white/10"
    >
      <IconoMenu />
    </button>
  );
}
