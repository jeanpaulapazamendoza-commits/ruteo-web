"use client";

import { MapContainer, Marker, Polyline, Tooltip } from "react-leaflet";
import FondoMapa from "@/components/FondoMapa";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useMemo } from "react";

export type PuntoEditor = {
  id: string;
  /** Su puesto en la ruta. Sin número en la bandeja. */
  n: number | null;
  lat: number;
  lon: number;
  rotulo: string;
};

export type TrazoEditor = {
  id: string;
  nombre: string;
  color: string;
  /** De dónde sale el vehículo. */
  base: [number, number] | null;
  puntos: PuntoEditor[];
};

const GRIS = "#8A94A0";

// Un icono por combinación: Leaflet rehace el marcador entero cada vez que
// recibe un icono nuevo, y al arrastrar se repinta todo el tablero.
const iconos = new Map<string, L.DivIcon>();
function icono(n: number | null, color: string, elegido: boolean) {
  const llave = `${n}|${color}|${elegido}`;
  let i = iconos.get(llave);
  if (!i) {
    const t = elegido ? 28 : 22;
    i = L.divIcon({
      className: "",
      iconSize: [t + 2, t + 2],
      iconAnchor: [(t + 2) / 2, (t + 2) / 2],
      html: `<div style="background:${color};border:2.5px solid ${elegido ? "#101B2B" : "#fff"};
        border-radius:50%;width:${t}px;height:${t}px;display:flex;align-items:center;
        justify-content:center;color:#fff;font:700 ${elegido ? 12 : 10}px/1 Arial;
        box-shadow:0 1px 4px rgba(0,0,0,.45)${elegido ? ",0 0 0 5px rgba(51,122,183,.35)" : ""}">${n ?? ""}</div>`,
    });
    iconos.set(llave, i);
  }
  return i;
}

const iconoBase = L.divIcon({
  className: "",
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  html: `<div style="background:#101B2B;border:2.5px solid #fff;border-radius:50%;
    width:24px;height:24px;display:flex;align-items:center;justify-content:center;
    color:#fff;font:700 9px/1 Arial;box-shadow:0 1px 5px rgba(0,0,0,.6)">CD</div>`,
});

/**
 * El mapa del editor de rutas.
 *
 * Pinta cada ruta en su color con las órdenes numeradas en el orden que hay
 * en pantalla, unidas en línea recta: mientras se edita no hay recorrido por
 * calles que valga, y la recta basta para ver un cruce o una orden que queda
 * a trasmano. Las de la bandeja van en gris.
 */
export default function MapaEditor({
  trazos,
  bandeja,
  elegida,
  onElegir,
}: {
  trazos: TrazoEditor[];
  bandeja: PuntoEditor[];
  elegida: string | null;
  onElegir: (id: string) => void;
}) {
  // El encuadre se calcula una vez, con lo que hay al abrir: mover una orden
  // de ruta no cambia dónde está, y que el mapa saltara a cada cambio marea.
  const limites = useMemo(() => {
    const pts: [number, number][] = [
      ...trazos.flatMap((t) => [
        ...(t.base ? [t.base] : []),
        ...t.puntos.map((p) => [p.lat, p.lon] as [number, number]),
      ]),
      ...bandeja.map((p) => [p.lat, p.lon] as [number, number]),
    ];
    return pts.length ? L.latLngBounds(pts).pad(0.08) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bases = useMemo(() => {
    const vistas = new Map<string, [number, number]>();
    for (const t of trazos) if (t.base) vistas.set(t.base.join(","), t.base);
    return [...vistas.values()];
  }, [trazos]);

  return (
    <MapContainer
      {...(limites ? { bounds: limites } : { center: [-12.0464, -77.0428] as [number, number], zoom: 12 })}
      scrollWheelZoom
      className="h-full w-full"
    >
      <FondoMapa compacto />

      {trazos.map((t) => (
        <Polyline
          key={t.id}
          positions={[
            ...(t.base ? [t.base] : []),
            ...t.puntos.map((p) => [p.lat, p.lon] as [number, number]),
          ]}
          pathOptions={{ color: t.color, weight: 3, opacity: 0.75 }}
        />
      ))}

      {bases.map((b) => (
        <Marker key={b.join(",")} position={b} icon={iconoBase} interactive={false} />
      ))}

      {bandeja.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lon]}
          icon={icono(null, GRIS, p.id === elegida)}
          zIndexOffset={p.id === elegida ? 1000 : 0}
          eventHandlers={{ click: () => onElegir(p.id) }}
        >
          <Tooltip direction="top" offset={[0, -10]}>Sin asignar · {p.rotulo}</Tooltip>
        </Marker>
      ))}

      {trazos.flatMap((t) =>
        t.puntos.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lon]}
            icon={icono(p.n, t.color, p.id === elegida)}
            zIndexOffset={p.id === elegida ? 1000 : 0}
            eventHandlers={{ click: () => onElegir(p.id) }}
          >
            <Tooltip direction="top" offset={[0, -10]}>{t.nombre} · {p.rotulo}</Tooltip>
          </Marker>
        )),
      )}
    </MapContainer>
  );
}
