import { crearClienteNavegador } from "@/lib/supabase/client";
import type { ConfigRutear, Ruta, TiendaMapa } from "@/lib/motor";

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

/**
 * Ciclo de vida del despacho. Es el hilo del proceso: se sube el archivo
 * (cargado), se arman las rutas (planificado), se reparte entre conductores
 * (asignado) y el reparto lo va cerrando.
 */
export const ESTADOS = {
  cargado: { texto: "Cargado sin ruteo", tono: "plan", orden: 1 },
  planificado: { texto: "Planificado", tono: "live", orden: 2 },
  asignado: { texto: "Asignado", tono: "warn", orden: 3 },
  en_curso: { texto: "En reparto", tono: "warn", orden: 4 },
  cerrado: { texto: "Cerrado", tono: "ok", orden: 5 },
  anulado: { texto: "Anulado", tono: "bad", orden: 6 },
} as const satisfies Record<
  string,
  { texto: string; tono: "ok" | "warn" | "bad" | "live" | "plan"; orden: number }
>;

export type EstadoDespacho = keyof typeof ESTADOS;

export function estado(valor: string) {
  return ESTADOS[valor as EstadoDespacho] ?? { texto: valor, tono: "plan" as const, orden: 0 };
}

/** Mientras no salga a reparto se le pueden añadir puntos y volver a rutear. */
export const editable = (valor: string) =>
  valor === "cargado" || valor === "planificado" || valor === "asignado";

const hora = (v: string | null | undefined) =>
  v && v !== "—" ? v : null;

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Los puntos que vienen de un archivo usan su código como identificador, no un
 * UUID: esos no apuntan a ninguna fila de `tiendas` y se guardan como parada
 * suelta (la parada ya lleva copia del código, nombre y coordenadas).
 */
const refTienda = (id: string) => (RE_UUID.test(id) ? id : null);

export type ResumenGuardado = {
  id: string;
  rutas: number;
  paradas: number;
  puntosOriginales: number;
  puntosGuardados: number;
};

/**
 * Registra el archivo recién subido como un despacho en estado «cargado».
 * Todavía no hay rutas: solo los puntos, para poder retomarlo más tarde.
 */
export async function crearDespachoCargado({
  archivo,
  nombre,
  puntos,
}: {
  archivo: string;
  /** Alias que le pone el usuario; si no pone ninguno, se usa el del archivo. */
  nombre?: string | null;
  puntos: TiendaMapa[];
}): Promise<string> {
  const supabase = crearClienteNavegador();
  const { data, error } = await supabase.rpc("crear_despacho_cargado", {
    p: {
      archivo,
      nombre: nombre?.trim() || `Despacho de ${archivo}`,
      puntos: puntos.map((p) => ({
        codigo: p.codigo,
        nombre: p.nombre,
        distrito: p.distrito,
        lat: p.lat,
        lon: p.lon,
        bultos: p.bultos,
        prioridad: p.prioridad,
        ventana_ini: p.ventana_ini,
        ventana_fin: p.ventana_fin,
      })),
    },
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Guarda las rutas calculadas sobre un despacho que ya existe. */
export async function guardarDespacho({
  despachoId,
  nombre,
  rutas,
  cfg,
  parametros,
  puntos = [],
}: {
  /** Despacho sobre el que se trabaja: sus rutas se reemplazan. */
  despachoId: string;
  nombre?: string | null;
  rutas: Ruta[];
  cfg: ConfigRutear;
  parametros: Record<string, unknown>;
  /** Puntos de trabajo: de aquí salen las ventanas horarias de cada parada. */
  puntos?: TiendaMapa[];
}): Promise<ResumenGuardado> {
  const supabase = crearClienteNavegador();

  const validas = rutas.filter((r) => !r.error && r.paradas.length > 0);
  if (!validas.length) throw new Error("No hay rutas calculadas para guardar.");

  // El motor no devuelve las ventanas; las recuperamos del punto original para
  // que el despacho guardado conserve el horario comprometido con el cliente.
  const porId = new Map(puntos.map((p) => [p.id, p]));

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
      paradas: r.paradas.map((p) => {
        const origen = porId.get(p.id);
        return {
          orden: p.orden,
          tienda_id: refTienda(p.id),
          codigo: p.codigo,
          nombre: p.nombre,
          distrito: p.distrito,
          lat: p.lat,
          lon: p.lon,
          bultos: p.bultos,
          prioridad: p.prioridad,
          eta: hora(p.eta),
          ventana_ini: hora(origen?.ventana_ini),
          ventana_fin: hora(origen?.ventana_fin),
        };
      }),
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

  const { error } = await supabase.rpc("replanificar_despacho", {
    p: {
      despacho_id: despachoId,
      nombre: nombre ?? null,
      cd_lat: cfg.cd_lat,
      cd_lon: cfg.cd_lon,
      parametros,
      kpis,
      rutas: rutasPayload,
    },
  });

  if (error) throw new Error(error.message);

  return {
    id: despachoId,
    rutas: validas.length,
    paradas: kpis.paradas,
    puntosOriginales,
    puntosGuardados,
  };
}

/**
 * Asigna conductor y vehículo a cada ruta. Devuelve el estado en que queda el
 * despacho: «asignado» si ninguna ruta se quedó sin conductor.
 */
export async function asignarRutas(
  despachoId: string,
  asignaciones: { ruta_id: string; conductor_id: string | null; vehiculo_id: string | null }[],
): Promise<string> {
  const supabase = crearClienteNavegador();
  const { data, error } = await supabase.rpc("asignar_rutas", {
    p: { despacho_id: despachoId, asignaciones },
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Borra un ruteo completo. Solo el admin, y solo si no salió a reparto. */
export async function eliminarDespacho(despachoId: string) {
  const supabase = crearClienteNavegador();
  const { error } = await supabase.rpc("eliminar_despacho", { p_despacho: despachoId });
  if (error) throw new Error(error.message);
}
