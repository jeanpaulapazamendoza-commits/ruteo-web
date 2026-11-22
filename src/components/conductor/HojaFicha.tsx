"use client";

import { useEffect } from "react";
import { enlaceNavegacion } from "@/lib/entregas";
import { IconoIr, IconoTelefono } from "@/components/conductor/iconos";

const BOTON =
  "flex h-12 w-full items-center justify-center gap-2 rounded-full border border-line-strong bg-surface text-[15px] font-bold text-ink active:bg-canvas";

/**
 * Los detalles de la parada: lo que no cabe en la tarjeta y la elección de
 * navegador.
 *
 * Waze y Google Maps conviven porque cada conductor tiene el suyo, y la
 * preferencia se guarda en el móvil: elegirla una vez basta para que «Cómo
 * llegar» abra siempre la app correcta durante toda la jornada.
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
    direccion: string | null;
    telefono: string | null;
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

  const filas: [string, string | null][] = [
    ["Código", parada.codigo],
    // El distrito solo se añade si la dirección no lo trae ya escrito.
    [
      "Dirección",
      parada.direccion && parada.distrito &&
      !parada.direccion.toLowerCase().includes(parada.distrito.toLowerCase())
        ? `${parada.direccion} · ${parada.distrito}`
        : parada.direccion || parada.distrito,
    ],
    ["Teléfono", parada.telefono],
    ["Bultos", String(parada.bultos)],
  ];

  return (
    <div className="fixed inset-0 z-50 bg-navy-900/45" onClick={onCerrar}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="hoja absolute inset-x-0 bottom-0 mx-auto w-full max-w-[560px] rounded-t-[20px] bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line-strong" />

        <p className="text-[13px] font-bold text-ink-2">
          Parada <span className="num">{parada.orden}</span>
        </p>
        <h2 className="mt-1 text-[22px] font-bold leading-tight tracking-tight text-ink">
          {parada.nombre ?? parada.codigo}
        </h2>

        <dl className="mt-3 divide-y divide-line border-y border-line text-[15px]">
          {filas
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="flex gap-3 py-2.5">
                <dt className="w-[84px] shrink-0 text-ink-2">{k}</dt>
                <dd className="num min-w-0 flex-1 font-medium text-ink">{v}</dd>
              </div>
            ))}
        </dl>

        <div className="mt-4 flex flex-col gap-2">
          {parada.telefono && (
            <a href={`tel:${parada.telefono.replace(/[^\d+]/g, "")}`} className={BOTON}>
              <IconoTelefono tam={16} /> Llamar al cliente
            </a>
          )}
          <a
            href={enlaceNavegacion(parada.lat, parada.lon, "maps")}
            target="_blank"
            rel="noopener noreferrer"
            className={BOTON}
          >
            <IconoIr tam={16} /> Abrir en Google Maps
          </a>
          <a
            href={enlaceNavegacion(parada.lat, parada.lon, "waze")}
            target="_blank"
            rel="noopener noreferrer"
            className={BOTON}
          >
            <IconoIr tam={16} /> Abrir en Waze
          </a>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <span className="flex-1 text-[14px] text-ink-2">«Cómo llegar» abre siempre</span>
          <div className="inline-flex rounded-full border border-line bg-canvas p-[3px]">
            {(["maps", "waze"] as const).map((a) => (
              <button
                key={a}
                onClick={() => onApp(a)}
                aria-pressed={app === a}
                className={`h-9 rounded-full px-4 text-[14px] font-bold ${
                  app === a ? "bg-surface text-ink shadow-sm" : "text-ink-2"
                }`}
              >
                {a === "maps" ? "Maps" : "Waze"}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onCerrar}
          className="mt-3 h-12 w-full rounded-full text-[15px] font-bold text-ink-2 active:bg-canvas"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
