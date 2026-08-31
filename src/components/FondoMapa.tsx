"use client";

import { useEffect, useState } from "react";
import { TileLayer } from "react-leaflet";
import { FONDOS, buscarFondo, guardarFondo, leerFondo } from "@/lib/mapas";

/**
 * El fondo del mapa, y el botón para cambiarlo.
 *
 * Va dentro del `MapContainer` porque son dos cosas que no se pueden separar:
 * las teselas y el control que las elige. Cualquier mapa de la aplicación lo
 * monta igual y hereda el mismo catálogo y la misma preferencia.
 *
 * El selector se ancla abajo a la izquierda: arriba a la izquierda está el
 * zoom de Leaflet, arriba a la derecha los controles de cada pantalla y abajo
 * a la derecha la atribución, que es obligatoria y no se toca.
 */
export default function FondoMapa({ compacto = false }: { compacto?: boolean }) {
  // Arranca en el fondo por defecto y lee la preferencia al montar:
  // `localStorage` no existe en el servidor y leerlo antes rompe la
  // hidratación.
  const [id, setId] = useState(FONDOS[0].id);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setId(leerFondo());
  }, []);

  const fondo = buscarFondo(id);

  function elegir(nuevo: string) {
    setId(nuevo);
    guardarFondo(nuevo);
    setAbierto(false);
  }

  return (
    <>
      {/* `key` obliga a Leaflet a rehacer la capa: cambiar la url de un
          TileLayer vivo deja teselas del fondo anterior mezcladas. */}
      <TileLayer
        key={fondo.id}
        url={fondo.url}
        attribution={fondo.atribucion}
        maxZoom={fondo.maxZoom}
      />
      {fondo.rotulos && (
        <TileLayer key={`${fondo.id}-rotulos`} url={fondo.rotulos} maxZoom={fondo.maxZoom} />
      )}

      <div className="absolute bottom-3 left-3 z-[800]">
        {abierto && (
          <div className="mb-1.5 w-[210px] overflow-hidden rounded-[10px] border border-line bg-surface shadow-lg">
            {FONDOS.map((f) => (
              <button
                key={f.id}
                onClick={() => elegir(f.id)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-canvas ${
                  f.id === id ? "bg-amber-050" : ""
                }`}
              >
                <Muestra id={f.id} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold text-ink">{f.nombre}</span>
                  <span className="block truncate text-[11.5px] text-ink-2">{f.para}</span>
                </span>
                {f.id === id && <span className="text-[13px] text-amber-600">✓</span>}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => setAbierto((v) => !v)}
          aria-label="Cambiar el fondo del mapa"
          aria-expanded={abierto}
          className={`flex items-center gap-2 rounded-[9px] border border-line bg-surface/95 font-semibold text-ink shadow transition hover:bg-canvas ${
            compacto ? "h-11 px-2.5 text-[13px]" : "px-2.5 py-1.5 text-[12px]"
          }`}
        >
          <Muestra id={fondo.id} />
          {!compacto && <span>{fondo.nombre}</span>}
        </button>
      </div>
    </>
  );
}

/** Cuadradito que enseña de qué color es cada fondo, sin cargar una tesela. */
function Muestra({ id }: { id: string }) {
  const estilo: Record<string, string> = {
    gris: "bg-[#e8e8e6] border-[#cfcfcc]",
    calle: "bg-[#e9e4dc] border-[#d6cec1]",
    satelite: "bg-[#4a5a3e] border-[#3a4731]",
    noche: "bg-[#3b3b3b] border-[#2a2a2a]",
  };
  return (
    <i
      className={`block h-4 w-4 shrink-0 rounded-[4px] border not-italic ${estilo[id] ?? estilo.gris}`}
    />
  );
}
