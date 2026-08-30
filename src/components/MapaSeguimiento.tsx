"use client";

import { MapContainer, TileLayer, Polyline, Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useMemo } from "react";

export type ParadaSeguida = {
  id: string;
  orden: number;
  nombre: string | null;
  lat: number;
  lon: number;
  bultos: number;
  estado_entrega: string;
  hora_entrega: string | null;
  motivo: string | null;
};

/** Verde lo entregado, gris lo pendiente, rojo lo fallido, ámbar lo dudoso. */
const COLOR_ESTADO: Record<string, string> = {
  entregado: "#2F855A",
  parcial: "#B7791F",
  reprogramado: "#B7791F",
  fallido: "#D9534F",
  pendiente: "#9AA5B1",
};

const TEXTO_ESTADO: Record<string, string> = {
  entregado: "Entregado",
  parcial: "Entrega parcial",
  reprogramado: "Reprogramado",
  fallido: "No entregado",
  pendiente: "Pendiente",
};

function iconoParada(n: number, fondo: string, siguiente = false) {
  const borde = siguiente ? "#F2A33C" : "#fff";
  const halo = siguiente ? "box-shadow:0 0 0 5px rgba(242,163,60,.45);" : "";
  return L.divIcon({
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `<div style="background:${fondo};border:2.5px solid ${borde};border-radius:50%;
      width:22px;height:22px;display:flex;align-items:center;justify-content:center;
      color:#fff;font:700 10px/1 Arial;box-shadow:0 1px 4px rgba(0,0,0,.45);${halo}">${n}</div>`,
  });
}

const iconoCD = L.divIcon({
  className: "",
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  html: `<div style="background:#101B2B;border:2.5px solid #fff;border-radius:50%;
    width:24px;height:24px;display:flex;align-items:center;justify-content:center;
    color:#fff;font:700 9px/1 Arial;box-shadow:0 1px 5px rgba(0,0,0,.6)">CD</div>`,
});

const hora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })
    : null;

/**
 * Mapa de una ruta en reparto: el trazado planificado de fondo y cada parada
 * coloreada por cómo terminó. De un vistazo se ve hasta dónde llegó el
 * conductor y qué le queda.
 */
export default function MapaSeguimiento({
  paradas,
  geometria,
  colorRuta,
  cd,
  siguienteId = null,
  onClicParada,
}: {
  paradas: ParadaSeguida[];
  geometria: number[][] | null;
  colorRuta: string;
  cd: { lat: number; lon: number } | null;
  /** La próxima parada pendiente: se resalta para encontrarla de un vistazo. */
  siguienteId?: string | null;
  /** En el móvil del conductor, tocar un punto abre esa parada. */
  onClicParada?: (id: string) => void;
}) {
  const limites = useMemo(() => {
    const pts: [number, number][] = paradas.map((p) => [p.lat, p.lon]);
    if (cd) pts.push([cd.lat, cd.lon]);
    if (!pts.length) return L.latLngBounds([[-12.05, -77.04], [-12.06, -77.03]]);
    return L.latLngBounds(pts).pad(0.12);
  }, [paradas, cd]);

  return (
    <MapContainer
      bounds={limites}
      scrollWheelZoom
      style={{ height: "100%", width: "100%", background: "#EDF1F6" }}
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap"
        maxZoom={19}
      />

      {geometria && geometria.length > 1 && (
        <Polyline
          positions={geometria as [number, number][]}
          pathOptions={{ color: colorRuta, weight: 3, opacity: 0.45 }}
        />
      )}

      {paradas.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lon]}
          icon={iconoParada(
            p.orden,
            COLOR_ESTADO[p.estado_entrega] ?? COLOR_ESTADO.pendiente,
            p.id === siguienteId,
          )}
          eventHandlers={onClicParada ? { click: () => onClicParada(p.id) } : undefined}
        >
          <Tooltip>
            <b>#{p.orden} {p.nombre}</b>
            <br />
            {TEXTO_ESTADO[p.estado_entrega] ?? p.estado_entrega}
            {hora(p.hora_entrega) ? ` · ${hora(p.hora_entrega)}` : ""}
            {p.motivo ? <><br />{p.motivo}</> : null}
          </Tooltip>
        </Marker>
      ))}

      {cd && (
        <Marker position={[cd.lat, cd.lon]} icon={iconoCD}>
          <Tooltip>Centro de distribución</Tooltip>
        </Marker>
      )}
    </MapContainer>
  );
}
