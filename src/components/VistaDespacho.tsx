"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Grupo, Parada, Ruta } from "@/lib/motor";

const MapaRutas = dynamic(() => import("@/components/MapaRutas"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-[13px] text-ink-3">
      Cargando mapa…
    </div>
  ),
});

const COLORES = [
  "#E8833A", "#2E7DD1", "#0E8F9E", "#7A5AF8", "#C2439B", "#7C9A1F",
  "#D9534F", "#2F855A", "#B7791F", "#5A67D8", "#D53F8C", "#319795",
];
const color = (i: number) => COLORES[i % COLORES.length];

export type RutaGuardada = {
  id: string;
  indice: number;
  km: number | null;
  duracion_min: number | null;
  costo: number | null;
  salida_prog: string | null;
  fin_estimado: string | null;
  geometria: number[][] | null;
  paradas: {
    id: string;
    orden: number;
    codigo: string | null;
    nombre: string | null;
    distrito: string | null;
    lat: number;
    lon: number;
    bultos: number;
    prioridad: number;
    eta: string | null;
    estado_entrega: string;
  }[];
};

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "—");

export default function VistaDespacho({
  rutas,
  cd,
}: {
  rutas: RutaGuardada[];
  cd: { lat: number; lon: number };
}) {
  const [resaltado, setResaltado] = useState<number | null>(null);
  const [verTrazos, setVerTrazos] = useState(true);
  const [verNumeros, setVerNumeros] = useState(true);

  // Adaptamos lo guardado a la forma que ya entiende el mapa.
  const { rutasMapa, gruposMapa, tiendasMapa } = useMemo(() => {
    const rutasMapa: Ruta[] = rutas.map((r) => ({
      indice: r.indice,
      paradas: r.paradas.map<Parada>((p) => ({
        id: p.id,
        orden: p.orden,
        codigo: p.codigo ?? "",
        nombre: p.nombre ?? "",
        distrito: p.distrito,
        bultos: p.bultos,
        prioridad: p.prioridad,
        lat: p.lat,
        lon: p.lon,
        eta: hhmm(p.eta),
      })),
      orden: r.paradas.map((p) => p.id),
      km: r.km ?? 0,
      duracion_min: r.duracion_min ?? 0,
      bultos: r.paradas.reduce((a, p) => a + p.bultos, 0),
      costo: r.costo ?? 0,
      salida: hhmm(r.salida_prog),
      fin: hhmm(r.fin_estimado),
      motor: "",
      aviso: null,
      geometria: r.geometria ?? [],
      links_maps: [],
    }));

    const gruposMapa: Grupo[] = rutas.map((r) => ({
      indice: r.indice,
      tiendas: r.paradas.map((p) => p.id),
      n_tiendas: r.paradas.length,
      bultos: r.paradas.reduce((a, p) => a + p.bultos, 0),
      prioritarias: r.paradas.filter((p) => p.prioridad > 0).length,
      capacidad_vehiculo: null,
      max_tiendas_vehiculo: null,
      vuelta: 1,
      centro: {
        lat: r.paradas.reduce((a, p) => a + p.lat, 0) / (r.paradas.length || 1),
        lon: r.paradas.reduce((a, p) => a + p.lon, 0) / (r.paradas.length || 1),
      },
    }));

    const tiendasMapa = rutas.flatMap((r) =>
      r.paradas.map((p) => ({
        id: p.id,
        codigo: p.codigo ?? "",
        nombre: p.nombre ?? "",
        distrito: p.distrito,
        lat: p.lat,
        lon: p.lon,
        bultos: p.bultos,
        prioridad: p.prioridad,
        ventana_ini: null,
        ventana_fin: null,
      })),
    );

    return { rutasMapa, gruposMapa, tiendasMapa };
  }, [rutas]);

  const rutaAbierta = resaltado !== null ? rutas.find((r) => r.indice === resaltado) : null;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 @3xl:grid-cols-[1fr_330px] @5xl:grid-cols-[1fr_360px]">
      <section className="relative min-h-[420px] min-w-0">
        <MapaRutas
          tiendas={tiendasMapa}
          grupos={gruposMapa}
          rutas={rutasMapa}
          cd={cd}
          sinAsignar={[]}
          mostrarZonas={false}
          mostrarTrazos={verTrazos}
          mostrarNumeros={verNumeros}
          grupoResaltado={resaltado}
        />
        <div className="absolute right-3 top-3 z-[500] flex flex-col gap-1 rounded-[10px] border border-line bg-surface/95 p-2 text-[12px] shadow">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={verTrazos}
              onChange={(e) => setVerTrazos(e.target.checked)} />
            Trazos
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={verNumeros}
              onChange={(e) => setVerNumeros(e.target.checked)} />
            Orden
          </label>
        </div>
        {resaltado !== null && (
          <button
            onClick={() => setResaltado(null)}
            className="absolute bottom-3 left-3 z-[500] rounded-[9px] border border-line bg-surface px-3 py-1.5 text-[12px] font-semibold shadow"
          >
            Ver todas las rutas
          </button>
        )}
      </section>

      <aside className="min-w-0 overflow-y-auto border-l border-line bg-surface p-4">
        <h3 className="mb-2 text-[13px] font-bold">
          Rutas <span className="num text-ink-3">{rutas.length}</span>
        </h3>

        <div className="flex flex-col gap-2">
          {rutas.map((r) => {
            const bultos = r.paradas.reduce((a, p) => a + p.bultos, 0);
            const abierta = resaltado === r.indice;
            return (
              <div
                key={r.id}
                style={{ ["--c" as string]: color(r.indice) }}
                className={`relative rounded-[10px] border transition ${
                  abierta ? "border-[var(--c)] shadow-[0_0_0_1px_var(--c)]" : "border-line"
                }`}
              >
                <span className="absolute inset-y-0 left-0 w-[3px] rounded-l-[10px] bg-[var(--c)]" />
                <button
                  onClick={() => setResaltado(abierta ? null : r.indice)}
                  className="w-full p-2.5 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="num rounded px-1.5 py-0.5 text-[10.5px] font-bold text-white"
                      style={{ background: color(r.indice) }}>
                      R-{String(r.indice + 1).padStart(2, "0")}
                    </span>
                    <span className="num text-[11.5px] text-ink-2">
                      {hhmm(r.salida_prog)} → {hhmm(r.fin_estimado)}
                    </span>
                    <span className="ml-auto text-[11px] text-ink-3">
                      {abierta ? "▴" : "▾"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex gap-3 text-[11px] text-ink-3">
                    <span><b className="num text-[13px] text-ink">{r.paradas.length}</b> paradas</span>
                    <span><b className="num text-[13px] text-ink">{bultos}</b> bultos</span>
                    <span><b className="num text-[13px] text-ink">{(r.km ?? 0).toFixed(1)}</b> km</span>
                  </div>
                  {r.costo ? (
                    <div className="num mt-1 text-[11.5px] text-ink-2">
                      S/ {r.costo.toFixed(2)}
                    </div>
                  ) : null}
                </button>

                {abierta && (
                  <ol className="border-t border-line px-2.5 py-2">
                    {r.paradas.map((p) => (
                      <li key={p.id} className="flex items-baseline gap-2 py-1 text-[12px]">
                        <span className="num w-5 shrink-0 text-ink-3">{p.orden}.</span>
                        <span className="min-w-0 flex-1 truncate">
                          {p.nombre}
                          {p.prioridad > 0 && <span className="text-amber-600"> ⭐</span>}
                        </span>
                        <span className="num shrink-0 text-ink-3">{hhmm(p.eta)}</span>
                        <span className="num shrink-0 text-ink-3">{p.bultos}b</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            );
          })}
        </div>

        {rutaAbierta && (
          <p className="mt-3 text-[11.5px] text-ink-3">
            Mostrando solo la ruta R-{String(rutaAbierta.indice + 1).padStart(2, "0")} en el mapa.
          </p>
        )}
      </aside>
    </div>
  );
}
