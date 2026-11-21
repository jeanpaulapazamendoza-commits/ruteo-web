"use client";

import { useMemo } from "react";
import { CircleMarker, MapContainer, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import FondoMapa from "@/components/FondoMapa";
import { COLORES } from "@/components/graficos";
import type { PuntoMapa } from "@/app/acciones/estadisticas";

/**
 * El mapa del rango, con un deslizador de horas.
 *
 * Un mapa con mil quinientos puntos encima no dice nada: todos los días se
 * parecen. Lo que se ve al mover el deslizador es el orden en que se fue
 * cubriendo la ciudad, y sobre todo dónde se quedó la tarde. Esa es la forma
 * de encontrar una zona que siempre se reparte al final.
 *
 * Círculos y no alfileres: con muchos puntos, un alfiler de 24 px tapa a sus
 * vecinos y el mapa pasa a medir el tamaño del icono, no la densidad.
 */
export default function MapaEstadisticas({
  puntos,
  desde,
  hasta,
}: {
  puntos: PuntoMapa[];
  /** Hora inicial y final del filtro, 0 a 24. */
  desde: number;
  hasta: number;
}) {
  const limites = useMemo(() => {
    const pts: [number, number][] = puntos.map((p) => [p.lat, p.lon]);
    if (!pts.length) return L.latLngBounds([[-12.05, -77.04], [-12.06, -77.03]]);
    return L.latLngBounds(pts).pad(0.12);
  }, [puntos]);

  const visibles = puntos.filter((p) => {
    // Lo que no se marcó no tiene hora: aparece solo con el rango entero, o
    // desaparecería al primer movimiento del deslizador sin que se entienda.
    if (p.hora === null) return desde === 0 && hasta === 24;
    return p.hora >= desde && p.hora < hasta;
  });

  return (
    <MapContainer
      bounds={limites}
      className="h-full w-full"
      zoomControl
      preferCanvas
    >
      <FondoMapa />
      {visibles.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lon]}
          radius={5}
          pathOptions={{
            color: "#ffffff",
            weight: 1.5,
            fillColor: COLORES[p.estado as keyof typeof COLORES] ?? COLORES.pendiente,
            fillOpacity: 0.9,
          }}
        >
          <Tooltip direction="top" offset={[0, -6]}>
            <div className="text-[11.5px]">
              <b>{p.nombre ?? "Parada"}</b>
              <div className="text-[11px]">
                {p.hora === null
                  ? "Sin marcar"
                  : `Marcada a las ${String(p.hora).padStart(2, "0")}:00`}
                {p.conductor ? ` · ${p.conductor}` : ""}
              </div>
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
