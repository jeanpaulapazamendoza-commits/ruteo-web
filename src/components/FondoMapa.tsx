"use client";

import { useEffect, useState } from "react";
import L from "leaflet";
import { TileLayer, useMap } from "react-leaflet";
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

      <ControlesVista />
    </>
  );
}

const BOTON_VISTA =
  "grid h-[30px] w-[30px] place-items-center bg-surface text-ink transition hover:bg-canvas";

/**
 * «Encuadrar» y pantalla completa, bajo el zoom.
 *
 * En la referencia los lleva el mapa de Flota. Aquí van en el fondo, que es
 * lo que montan todos los mapas: así los tiene cualquiera sin que cada
 * pantalla tenga que acordarse.
 *
 * Encuadrar no necesita saber qué se está pintando: mira las capas que hay
 * en el mapa —marcadores y trazados— y ajusta la vista a todas.
 */
function ControlesVista() {
  const mapa = useMap();
  const [completa, setCompleta] = useState(false);
  const [puede, setPuede] = useState(false);

  useEffect(() => {
    const caja = mapa.getContainer();
    // En el iPhone no existe la pantalla completa para un elemento: el botón
    // no se enseña en vez de enseñarse y no hacer nada.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPuede(Boolean(document.fullscreenEnabled && caja.requestFullscreen));
    const alCambiar = () => {
      setCompleta(document.fullscreenElement === caja);
      // El mapa cambia de tamaño sin que Leaflet se entere.
      setTimeout(() => mapa.invalidateSize(), 80);
    };
    document.addEventListener("fullscreenchange", alCambiar);
    return () => document.removeEventListener("fullscreenchange", alCambiar);
  }, [mapa]);

  function encuadrar() {
    const limites = L.latLngBounds([]);
    mapa.eachLayer((capa) => {
      if (capa instanceof L.Marker || capa instanceof L.CircleMarker) {
        limites.extend(capa.getLatLng());
      } else if (capa instanceof L.Polyline) {
        const b = capa.getBounds();
        if (b.isValid()) limites.extend(b);
      }
    });
    if (limites.isValid()) mapa.fitBounds(limites.pad(0.1));
  }

  function alternar() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void mapa.getContainer().requestFullscreen().catch(() => {});
  }

  return (
    <div
      // Sin esto, un clic en el botón es también un clic en el mapa, y en el
      // planificador eso pone un vértice del sector que se está dibujando.
      ref={(el) => {
        if (el) {
          L.DomEvent.disableClickPropagation(el);
          L.DomEvent.disableScrollPropagation(el);
        }
      }}
      className="absolute left-[10px] top-[80px] z-[800] flex flex-col overflow-hidden rounded-[4px] border-2 border-black/20 bg-clip-padding"
    >
      <button onClick={encuadrar} title="Encuadrar" aria-label="Encuadrar todo en el mapa" className={BOTON_VISTA}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      </button>
      {puede && (
        <button
          onClick={alternar}
          title={completa ? "Salir de pantalla completa" : "Pantalla completa"}
          aria-label={completa ? "Salir de pantalla completa" : "Ver el mapa a pantalla completa"}
          aria-pressed={completa}
          className={`${BOTON_VISTA} border-t border-black/15`}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {completa ? (
              <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
            ) : (
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            )}
          </svg>
        </button>
      )}
    </div>
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
