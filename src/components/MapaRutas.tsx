"use client";

import {
  MapContainer, CircleMarker, Polyline, Polygon,
  Tooltip, Marker, useMap,
} from "react-leaflet";
import FondoMapa from "@/components/FondoMapa";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import type { Grupo, Ruta, TiendaMapa } from "@/lib/motor";
import type { Zona } from "@/lib/zonas";

export const COLORES_RUTA = [
  "#E8833A", "#2E7DD1", "#0E8F9E", "#7A5AF8", "#C2439B", "#7C9A1F",
  "#D9534F", "#2F855A", "#B7791F", "#5A67D8", "#D53F8C", "#319795",
];

export function colorDe(i: number) {
  return COLORES_RUTA[i % COLORES_RUTA.length];
}

/** Envolvente convexa para dibujar la zona de cada grupo. */
function envolvente(puntos: [number, number][]): [number, number][] {
  if (puntos.length < 3) return puntos;
  const p = [...puntos].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const cruz = (o: number[], a: number[], b: number[]) =>
    (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);
  const mitad = (arr: [number, number][]) => {
    const r: [number, number][] = [];
    for (const x of arr) {
      while (r.length >= 2 && cruz(r[r.length - 2], r[r.length - 1], x) <= 0) r.pop();
      r.push(x);
    }
    r.pop();
    return r;
  };
  return [...mitad(p), ...mitad([...p].reverse())];
}

const iconoCD = L.divIcon({
  className: "",
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  html: `<div style="background:#101B2B;border:3px solid #fff;border-radius:50%;
    width:28px;height:28px;display:flex;align-items:center;justify-content:center;
    color:#fff;font:700 10px/1 Arial;box-shadow:0 1px 5px rgba(0,0,0,.6)">CD</div>`,
});

function iconoParada(n: number, color: string, prioritaria: boolean) {
  return L.divIcon({
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `<div style="background:${color};border:3px solid ${prioritaria ? "#FFD700" : "#fff"};
      border-radius:50%;width:22px;height:22px;display:flex;align-items:center;
      justify-content:center;color:#fff;font:700 10px/1 Arial;
      box-shadow:0 1px 4px rgba(0,0,0,.5)">${n}</div>`,
  });
}

/**
 * Captura los clics del mapa mientras se dibuja un sector.
 *
 * Se enlaza a mano con `useMap` + refs en vez de `useMapEvents` porque los
 * manejadores se registran una sola vez: con closures normales se quedarían
 * con el valor inicial de `activo` y el dibujo nunca reaccionaría.
 */
function CapturaDibujo({
  activo,
  onPunto,
  onCerrar,
}: {
  activo: boolean;
  onPunto: (p: [number, number]) => void;
  onCerrar: () => void;
}) {
  const mapa = useMap();
  const refActivo = useRef(activo);
  const refPunto = useRef(onPunto);
  const refCerrar = useRef(onCerrar);

  useEffect(() => {
    refActivo.current = activo;
    refPunto.current = onPunto;
    refCerrar.current = onCerrar;
    // El cursor y el zoom por doble clic dependen del modo de dibujo, y
    // MapContainer no reevalúa sus props: se ajustan aquí.
    mapa.getContainer().style.cursor = activo ? "crosshair" : "";
    if (activo) mapa.doubleClickZoom.disable();
    else mapa.doubleClickZoom.enable();
  }, [activo, onPunto, onCerrar, mapa]);

  useEffect(() => {
    const alClic = (e: L.LeafletMouseEvent) => {
      if (refActivo.current) refPunto.current([e.latlng.lat, e.latlng.lng]);
    };
    const alDoble = () => {
      if (refActivo.current) refCerrar.current();
    };
    mapa.on("click", alClic);
    mapa.on("dblclick", alDoble);
    return () => {
      mapa.off("click", alClic);
      mapa.off("dblclick", alDoble);
    };
  }, [mapa]);

  return null;
}

export default function MapaRutas({
  tiendas,
  grupos,
  rutas,
  cd,
  sinAsignar,
  mostrarZonas,
  mostrarTrazos,
  mostrarNumeros,
  grupoResaltado,
  onClicTienda,
  dibujando = false,
  puntosDibujo = [],
  onPuntoDibujo,
  onCerrarDibujo,
  colorDibujo = "#FFB42E",
  zonasFijas = [],
  onClicZona,
}: {
  tiendas: TiendaMapa[];
  grupos: Grupo[];
  rutas: Ruta[];
  cd: { lat: number; lon: number };
  sinAsignar: string[];
  mostrarZonas: boolean;
  mostrarTrazos: boolean;
  mostrarNumeros: boolean;
  grupoResaltado: number | null;
  onClicTienda?: (id: string) => void;
  dibujando?: boolean;
  puntosDibujo?: [number, number][];
  onPuntoDibujo?: (p: [number, number]) => void;
  onCerrarDibujo?: () => void;
  colorDibujo?: string;
  /** Zonas guardadas, dibujadas de fondo. */
  zonasFijas?: Zona[];
  onClicZona?: (id: string) => void;
}) {
  const centro = useMemo<[number, number]>(() => {
    if (!tiendas.length) return [cd.lat, cd.lon];
    const lat = tiendas.reduce((a, t) => a + t.lat, 0) / tiendas.length;
    const lon = tiendas.reduce((a, t) => a + t.lon, 0) / tiendas.length;
    return [lat, lon];
  }, [tiendas, cd]);

  const grupoDe = useMemo(() => {
    const m = new Map<string, number>();
    grupos.forEach((g) => g.tiendas.forEach((t) => m.set(t, g.indice)));
    return m;
  }, [grupos]);

  const libres = new Set(sinAsignar);
  const visible = (i: number) => grupoResaltado === null || grupoResaltado === i;

  return (
    <MapContainer
      center={centro}
      zoom={11}
      scrollWheelZoom
      doubleClickZoom={!dibujando}
      style={{
        height: "100%",
        width: "100%",
        background: "#EDF1F6",
        cursor: dibujando ? "crosshair" : undefined,
      }}
    >
      <FondoMapa />

      <CapturaDibujo
        activo={dibujando}
        onPunto={(p) => onPuntoDibujo?.(p)}
        onCerrar={() => onCerrarDibujo?.()}
      />

      {/* Zonas fijas guardadas: van debajo de todo, como plano de fondo */}
      {zonasFijas.map((z) => (
        <Polygon
          key={`zf${z.id}`}
          positions={z.poligono}
          eventHandlers={onClicZona ? { click: () => onClicZona(z.id) } : undefined}
          pathOptions={{
            color: z.color,
            weight: 2,
            fillColor: z.color,
            fillOpacity: 0.08,
            interactive: !!onClicZona,
          }}
        >
          <Tooltip sticky>{z.nombre}</Tooltip>
        </Polygon>
      ))}

      {/* Zonas de cobertura */}
      {mostrarZonas &&
        grupos.map((g) => {
          if (!visible(g.indice)) return null;
          const pts = g.tiendas
            .map((id) => tiendas.find((t) => t.id === id))
            .filter(Boolean)
            .map((t) => [t!.lat, t!.lon] as [number, number]);
          const hull = envolvente(pts);
          if (hull.length < 3) return null;
          return (
            <Polygon
              key={`z${g.indice}`}
              positions={hull}
              pathOptions={{
                color: colorDe(g.indice),
                weight: 1.5,
                fillColor: colorDe(g.indice),
                fillOpacity: 0.1,
                dashArray: "5 4",
              }}
            />
          );
        })}

      {/* Trazos de ruta */}
      {mostrarTrazos &&
        rutas.map((r) =>
          visible(r.indice) && r.geometria?.length > 1 ? (
            <Polyline
              key={`r${r.indice}`}
              positions={r.geometria as [number, number][]}
              pathOptions={{
                color: colorDe(r.indice),
                weight: grupoResaltado === r.indice ? 5 : 3.5,
                opacity: 0.9,
              }}
            />
          ) : null,
        )}

      {/* Paradas numeradas cuando ya hay ruta */}
      {mostrarNumeros &&
        rutas.map((r) =>
          visible(r.indice)
            ? r.paradas.map((p) => (
                <Marker
                  key={`p${r.indice}-${p.id}`}
                  position={[p.lat, p.lon]}
                  icon={iconoParada(p.orden, colorDe(r.indice), p.prioridad > 0)}
                >
                  <Tooltip>
                    <b>#{p.orden} {p.nombre}</b>
                    <br />
                    {p.bultos} bultos{p.eta && p.eta !== "—" ? ` · llega ${p.eta}` : ""}
                  </Tooltip>
                </Marker>
              ))
            : null,
        )}

      {/* Tiendas (círculos) cuando no hay números */}
      {!mostrarNumeros &&
        tiendas.map((t) => {
          const g = grupoDe.get(t.id);
          const libre = libres.has(t.id) || g === undefined;
          if (g !== undefined && !visible(g)) return null;
          return (
            <CircleMarker
              key={t.id}
              center={[t.lat, t.lon]}
              radius={libre ? 5 : 6}
              eventHandlers={
                onClicTienda ? { click: () => onClicTienda(t.id) } : undefined
              }
              pathOptions={{
                color: libre ? "#5a5a5a" : "#fff",
                weight: libre ? 1 : 1.5,
                fillColor: libre ? "#c9c9c9" : colorDe(g!),
                fillOpacity: 0.95,
              }}
            >
              <Tooltip>
                <b>{t.nombre}</b>
                <br />
                {t.bultos} bultos {libre ? "· sin asignar" : `· grupo ${g! + 1}`}
              </Tooltip>
            </CircleMarker>
          );
        })}

      {/* Sector que se está dibujando */}
      {puntosDibujo.length > 0 && (
        <>
          {puntosDibujo.length >= 3 ? (
            <Polygon
              positions={puntosDibujo}
              pathOptions={{
                color: colorDibujo,
                weight: 2,
                fillColor: colorDibujo,
                fillOpacity: 0.15,
                dashArray: "6 4",
              }}
            />
          ) : (
            <Polyline
              positions={puntosDibujo}
              pathOptions={{ color: colorDibujo, weight: 2, dashArray: "6 4" }}
            />
          )}
          {puntosDibujo.map((p, i) => (
            <CircleMarker
              key={`v${i}`}
              center={p}
              radius={4}
              pathOptions={{ color: "#fff", weight: 2, fillColor: colorDibujo, fillOpacity: 1 }}
            />
          ))}
        </>
      )}

      <Marker position={[cd.lat, cd.lon]} icon={iconoCD}>
        <Tooltip>Centro de distribución</Tooltip>
      </Marker>
    </MapContainer>
  );
}
