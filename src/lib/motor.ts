/** Cliente del motor de ruteo (FastAPI + OR-Tools). */

/**
 * El navegador habla siempre con el proxy interno (/api/motor), nunca con el
 * motor directamente: así no hay CORS y la URL real del motor se configura en
 * el servidor (variable MOTOR_API_URL) sin tener que recompilar.
 */
const BASE = "/api/motor";

export type TiendaMapa = {
  id: string;
  codigo: string;
  nombre: string;
  distrito: string | null;
  lat: number;
  lon: number;
  bultos: number;
  prioridad: number;
  ventana_ini: string | null;
  ventana_fin: string | null;
  /** La ficha del cliente, si el archivo la traía. No se usa para rutear. */
  direccion?: string | null;
  telefono?: string | null;
  email?: string | null;
  contacto?: string | null;
  /** Artículos y columnas propias del cliente, si el archivo los traía. */
  items?: { codigo: string | null; nombre: string; cantidad: number; precio: number | null }[];
  extra?: Record<string, string>;
};

export type Grupo = {
  indice: number;
  tiendas: string[];
  n_tiendas: number;
  bultos: number;
  prioritarias: number;
  capacidad_vehiculo: number | null;
  max_tiendas_vehiculo: number | null;
  vuelta: number;
  centro: { lat: number; lon: number };
};

export type Parada = {
  id: string;
  orden: number;
  codigo: string;
  nombre: string;
  distrito: string | null;
  bultos: number;
  prioridad: number;
  lat: number;
  lon: number;
  eta: string;
};

export type Ruta = {
  indice: number;
  paradas: Parada[];
  orden: string[];
  km: number;
  duracion_min: number;
  bultos: number;
  costo: number;
  salida: string;
  fin: string;
  motor: string;
  aviso: string | null;
  geometria: number[][];
  links_maps: string[];
  error?: string;
};

export type ConfigAgrupar = {
  modo: "capacidad" | "clasico";
  criterio: "tiendas" | "bultos" | "flota";
  capacidad: number;
  k: number;
  flota: { cantidad: number; capacidad: number; max_tiendas: number }[];
  vueltas: number;
  uso_flota: "compacto" | "minimo";
};

export type ConfigRutear = {
  cd_lat: number;
  cd_lon: number;
  motor: "osrm" | "haversine";
  cerrado: boolean;
  tiempo_tsp: number;
  hora_salida: string;
  servicio_min: number;
  servicio_min_bulto: number;
  jornada_h: number;
  costo_fijo: number;
  costo_km: number;
};

async function pedir<T>(ruta: string, cuerpo: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${BASE}${ruta}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
  } catch {
    throw new Error(
      "No se pudo contactar con la aplicación. Revisa tu conexión e inténtalo de nuevo.",
    );
  }
  if (!r.ok) {
    const txt = await r.text();
    let detalle = txt;
    try {
      detalle = JSON.parse(txt).detail ?? txt;
    } catch {}
    throw new Error(String(detalle).slice(0, 300));
  }
  return r.json();
}

export function agrupar(tiendas: TiendaMapa[], cfg: ConfigAgrupar, grupos_manuales?: string[][]) {
  return pedir<{
    grupos: Grupo[];
    sin_asignar: string[];
    sobrecupo: boolean;
    resumen: { tiendas: number; grupos: number; bultos: number; sin_asignar: number };
  }>("/agrupar", { tiendas, ...cfg, grupos_manuales: grupos_manuales ?? null });
}

export function rutear(tiendas: TiendaMapa[], grupos: string[][], cfg: ConfigRutear) {
  return pedir<{
    rutas: Ruta[];
    totales: { rutas: number; km: number; duracion_min: number; costo: number; paradas: number };
  }>("/rutear", { tiendas, grupos, ...cfg });
}

export type ConfigPlanificar = Omit<ConfigRutear, "tiempo_tsp"> & {
  flota: ConfigAgrupar["flota"];
  /** Segundos que se le dan al solver para mejorar la solución. */
  tiempo_s: number;
};

export type ResumenPlan = {
  tiendas: number;
  vehiculos_disponibles: number;
  vehiculos_usados: number;
  sin_asignar: number;
  /** Con qué distancias se decidió el reparto: por calles o estimadas. */
  matriz: "calles" | "recta";
  /** Si el solver partió de la agrupación de siempre o construyó la suya. */
  desde_agrupacion: boolean;
};

/**
 * Reparte y ordena en un solo cálculo.
 *
 * `agrupar` y luego `rutear` deciden por separado: primero se reparte por
 * cercanía sin mirar ninguna hora, y después se ordena cada grupo por su
 * cuenta. Si un grupo no puede cumplir sus ventanas horarias ya es tarde,
 * porque la tienda no puede cambiarse de vehículo. Aquí se decide todo a la
 * vez, con capacidad, ventanas y jornada como límites, y lo que no cabe
 * vuelve en `motivos` con la razón.
 *
 * Devuelve las mismas formas que las otras dos juntas, así que el resultado
 * se guarda igual.
 */
export function planificar(tiendas: TiendaMapa[], cfg: ConfigPlanificar) {
  return pedir<{
    grupos: Grupo[];
    rutas: Ruta[];
    sin_asignar: string[];
    motivos: Record<string, string>;
    totales: { rutas: number; km: number; duracion_min: number; costo: number; paradas: number };
    resumen: ResumenPlan;
  }>("/planificar", { tiendas, ...cfg });
}

export function tiendasEnSector(tiendas: TiendaMapa[], poligono: number[][]) {
  return pedir<{ ids: string[] }>("/tiendas-en-sector", { tiendas, poligono });
}
