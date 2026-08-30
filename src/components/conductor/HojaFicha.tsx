"use client";

import { useEffect } from "react";
import { enlaceNavegacion } from "@/lib/entregas";

/**
 * Ficha del cliente: el dato que no cabe en la consola y la elección de
 * navegador.
 *
 * Waze y Google Maps conviven porque cada conductor tiene el suyo, y la
 * preferencia se guarda en el móvil: elegirla una vez basta para que el botón
 * grande de la consola abra siempre la app correcta durante toda la jornada.
 */
export default function HojaFicha({
  parada,
  app,
  onApp,
  onCerrar,
}: {
  parada: {
    orden: number;
    codigo: string | null;
    nombre: string | null;
    distrito: string | null;
    lat: number;
    lon: number;
    bultos: number;
  };
  app: "maps" | "waze";
  onApp: (a: "maps" | "waze") => void;
  onCerrar: () => void;
}) {
  useEffect(() => {
    history.pushState({ ficha: true }, "");
    const atras = () => onCerrar();
    window.addEventListener("popstate", atras);
    return () => window.removeEventListener("popstate", atras);
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-50 bg-navy-900/45" onClick={onCerrar}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="hoja absolute inset-x-0 bottom-0 mx-auto w-full max-w-[560px] rounded-t-[14px] bg-surface p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" />

        <h2 className="truncate px-1 text-[24px] font-extrabold leading-none tracking-tight text-ink">
          #{parada.orden} · {parada.nombre ?? parada.codigo}
        </h2>
        <p className="mt-2 px-1 text-[14px] font-medium text-ink-2">
          <span className="num">{parada.bultos}</span> bultos
          {parada.distrito ? ` · ${parada.distrito}` : ""}
        </p>
        {parada.codigo && (
          <p className="num mt-1 px-1 text-[14px] font-semibold text-ink-2">{parada.codigo}</p>
        )}
        <p className="num mt-1 px-1 text-[14px] text-ink-2">
          {parada.lat.toFixed(5)}, {parada.lon.toFixed(5)}
        </p>

        <div className="mt-3 flex flex-col gap-2">
          <a
            href={enlaceNavegacion(parada.lat, parada.lon, "maps")}
            target="_blank"
            rel="noopener noreferrer"
            className="grid h-14 w-full place-items-center rounded-[12px] border-2 border-line-strong bg-surface text-[17px] font-bold text-ink active:bg-canvas"
          >
            ▶ Abrir en Google Maps
          </a>
          <a
            href={enlaceNavegacion(parada.lat, parada.lon, "waze")}
            target="_blank"
            rel="noopener noreferrer"
            className="grid h-14 w-full place-items-center rounded-[12px] border-2 border-line-strong bg-surface text-[17px] font-bold text-ink active:bg-canvas"
          >
            ▶ Abrir en Waze
          </a>
        </div>

        <div className="mt-3 flex h-11 items-center gap-2 px-1">
          <span className="flex-1 text-[14px] font-semibold text-ink-2">
            El botón grande abre siempre
          </span>
          <div className="flex overflow-hidden rounded-[9px] border-2 border-line-strong">
            {(["maps", "waze"] as const).map((a) => (
              <button
                key={a}
                onClick={() => onApp(a)}
                className={`h-10 px-3 text-[14px] font-bold ${
                  app === a ? "bg-amber text-navy-900" : "bg-surface text-ink-2"
                }`}
              >
                {a === "maps" ? "Maps" : "Waze"}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onCerrar}
          className="mt-2 h-14 w-full rounded-[12px] text-[14px] font-bold text-ink-2"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
