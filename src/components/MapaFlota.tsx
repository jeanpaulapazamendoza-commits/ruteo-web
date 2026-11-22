"use client";

import { MapContainer, Marker, Tooltip } from "react-leaflet";
import FondoMapa from "@/components/FondoMapa";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useMemo } from "react";

export type VehiculoEnMapa = {
  id: string;
  rotulo: string;
  lat: number;
  lon: number;
  /** Verde si ya terminó, azul si sigue en la calle, gris si aún no sale. */
  estado: "en_ruta" | "finalizada" | "programado";
  detalle: string;
};

const COLOR = { en_ruta: "#1b4f8f", finalizada: "#2F855A", programado: "#8A94A0" };

const iconos = new Map<string, L.DivIcon>();
function icono(estado: VehiculoEnMapa["estado"]) {
  let i = iconos.get(estado);
  if (!i) {
    i = L.divIcon({
      className: "",
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      html: `<div style="background:${COLOR[estado]};border:2.5px solid #fff;border-radius:50%;
        width:28px;height:28px;display:flex;align-items:center;justify-content:center;
        box-shadow:0 1px 5px rgba(0,0,0,.45)">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="#fff"><path d="M2 6h11v9H2zM14 9h4l3 3v3h-7zM6 19a2 2 0 100-4 2 2 0 000 4zm11 0a2 2 0 100-4 2 2 0 000 4z"/></svg>
      </div>`,
    });
    iconos.set(estado, i);
  }
  return i;
}

const iconoCD = L.divIcon({
  className: "",
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  html: `<div style="background:#101B2B;border:2.5px solid #fff;border-radius:50%;
    width:24px;height:24px;display:flex;align-items:center;justify-content:center;
    color:#fff;font:700 9px/1 Arial;box-shadow:0 1px 5px rgba(0,0,0,.6)">CD</div>`,
});

/**
 * La flota entera en un mapa: un vehículo por ruta, donde se le vio por
 * última vez.
 *
 * No hay rastreo continuo: la posición es la de la última parada que marcó.
 * Quien todavía no ha marcado ninguna aparece en su centro de distribución,
 * que es donde está.
 */
export default function MapaFlota({
  vehiculos,
  centros,
  onElegir,
}: {
  vehiculos: VehiculoEnMapa[];
  /** Los centros de distribución, si la capa está encendida. */
  centros: { lat: number; lon: number }[];
  onElegir: (id: string) => void;
}) {
  // El encuadre se calcula al montar: que el mapa salte cada treinta
  // segundos, con cada refresco, marea. Para volver a ajustar está «Encuadrar».
  const limites = useMemo(() => {
    const pts: [number, number][] = [
      ...vehiculos.map((v) => [v.lat, v.lon] as [number, number]),
      ...centros.map((c) => [c.lat, c.lon] as [number, number]),
    ];
    return pts.length ? L.latLngBounds(pts).pad(0.25) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <MapContainer
      {...(limites
        ? { bounds: limites, boundsOptions: { maxZoom: 15 } }
        : { center: [-12.0464, -77.0428] as [number, number], zoom: 12 })}
      scrollWheelZoom
      style={{ height: "100%", width: "100%", background: "#EDF1F6" }}
    >
      <FondoMapa />

      {centros.map((c) => (
        <Marker key={`${c.lat},${c.lon}`} position={[c.lat, c.lon]} icon={iconoCD} interactive={false} />
      ))}

      {vehiculos.map((v) => (
        <Marker
          key={v.id}
          position={[v.lat, v.lon]}
          icon={icono(v.estado)}
          eventHandlers={{ click: () => onElegir(v.id) }}
        >
          <Tooltip permanent direction="right" offset={[14, 0]} className="!border-0 !bg-transparent !p-0 !shadow-none before:!hidden">
            {/* Un marcador de Leaflet solo admite un globo: el detalle va en
                el `title` de la etiqueta, que sale al dejar el ratón encima. */}
            <span
              title={v.detalle}
              className="rounded-[4px] bg-white/90 px-1.5 py-0.5 text-[12px] font-bold text-[#1b2c5a] shadow-sm"
            >
              {v.rotulo}
            </span>
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
