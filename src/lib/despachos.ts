import { crearClienteNavegador } from "@/lib/supabase/client";
import type { ConfigRutear, Ruta } from "@/lib/motor";

/**
 * Simplifica una polilínea (Ramer–Douglas–Peucker).
 *
 * OSRM devuelve ~1200 puntos por ruta, que ocupan ~47 KB en la base. A la
 * escala de una ciudad el trazado se ve idéntico con una fracción de ellos,
 * así que guardamos la versión simplificada: mismo dibujo, ~10x menos espacio.
 */
export function simplificar(puntos: number[][], tolerancia = 0.00012): number[][] {
  if (puntos.length <= 2) return puntos;

  const distancia = (p: number[], a: number[], b: number[]) => {
    const [x, y] = p;
    const [x1, y1] = a;
    const [x2, y2] = b;
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
  };

  const rdp = (pts: number[][]): number[][] => {
    if (pts.length <= 2) return pts;
    let iMax = 0;
    let dMax = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = distancia(pts[i], pts[0], pts[pts.length - 1]);
      if (d > dMax) { dMax = d; iMax = i; }
    }
    if (dMax <= tolerancia) return [pts[0], pts[pts.length - 1]];
    return [...rdp(pts.slice(0, iMax + 1)).slice(0, -1), ...rdp(pts.slice(iMax))];
  };

  return rdp(puntos).map((p) => [
    Math.round(p[0] * 1e5) / 1e5,   // 5 decimales ≈ 1 m de precisión
    Math.round(p[1] * 1e5) / 1e5,
  ]);
}

const hora = (v: string | null | undefined) =>
  v && v !== "—" ? v : null;

export type ResumenGuardado = {
  id: string;
  rutas: number;
  paradas: number;
  puntosOriginales: number;
  puntosGuardados: number;
};

/** Guarda el despacho completo en Supabase (una sola transacción). */
export async function guardarDespacho({
  nombre,
  rutas,
  cfg,
  parametros,
  importacionId,
}: {
  nombre: string;
  rutas: Ruta[];
  cfg: ConfigRutear;
  parametros: Record<string, unknown>;
  /** Carga de tiendas de la que salió este despacho, si aplica. */
  importacionId?: string | null;
}): Promise<ResumenGuardado> {
  const supabase = crearClienteNavegador();

  const validas = rutas.filter((r) => !r.error && r.paradas.length > 0);
  if (!validas.length) throw new Error("No hay rutas calculadas para guardar.");

  let puntosOriginales = 0;
  let puntosGuardados = 0;

  const rutasPayload = validas.map((r) => {
    const geo = simplificar(r.geometria ?? []);
    puntosOriginales += r.geometria?.length ?? 0;
    puntosGuardados += geo.length;
    return {
      indice: r.indice,
      vuelta: 1,
      km: r.km,
      duracion_min: r.duracion_min,
      costo: r.costo,
      salida: hora(r.salida),
      fin: hora(r.fin),
      geometria: geo,
      paradas: r.paradas.map((p) => ({
        orden: p.orden,
        tienda_id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        distrito: p.distrito,
        lat: p.lat,
        lon: p.lon,
        bultos: p.bultos,
        prioridad: p.prioridad,
        eta: hora(p.eta),
      })),
    };
  });

  const kpis = {
    rutas: validas.length,
    paradas: validas.reduce((a, r) => a + r.paradas.length, 0),
    bultos: validas.reduce((a, r) => a + r.bultos, 0),
    km: Number(validas.reduce((a, r) => a + r.km, 0).toFixed(2)),
    duracion_min: Number(validas.reduce((a, r) => a + r.duracion_min, 0).toFixed(1)),
    costo: Number(validas.reduce((a, r) => a + (r.costo ?? 0), 0).toFixed(2)),
  };

  const { data, error } = await supabase.rpc("guardar_despacho", {
    p: {
      nombre,
      estado: "planificado",
      cd_lat: cfg.cd_lat,
      cd_lon: cfg.cd_lon,
      importacion_id: importacionId ?? null,
      parametros,
      kpis,
      rutas: rutasPayload,
    },
  });

  if (error) throw new Error(error.message);

  return {
    id: data as string,
    rutas: validas.length,
    paradas: kpis.paradas,
    puntosOriginales,
    puntosGuardados,
  };
}
