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
  /** De qué base sale, si la flota está repartida entre varias. */
  base?: { id: string; nombre: string; lat: number; lon: number } | null;
};

export type ConfigAgrupar = {
  modo: "capacidad" | "clasico";
  criterio: "tiendas" | "bultos" | "flota";
  capacidad: number;
  k: number;
  flota: {
    cantidad: number;
    capacidad: number;
    max_tiendas: number;
    /** Lo que tiene este tipo de vehículo. Solo lo usa «Planificar flota». */
    etiquetas?: string[];
    /** De qué base sale. Vacío = del centro del despacho. */
    base?: string | null;
  }[];
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
  /** Cuánto se adelanta a las prioritarias: 0 nada, 1 normal, 3 con empeño. */
  peso_prioridad: number;
  balanceo: "ninguno" | "tiempo" | "paradas";
  /** Las bases de las que sale la flota. Vacío = todos del centro. */
  bases?: { id: string; nombre: string; lat: number; lon: number }[];
};

/** El centro del despacho, cuando convive con bases con nombre. */
export const BASE_CENTRO = "centro";

/**
 * Lo que un punto exige del vehículo: refrigerado, moto, rampa…
 *
 * No es una columna fija del archivo: se lee de una columna propia del cliente
 * que se llame «etiquetas» (o «requisitos», «requiere», «tipo_vehiculo»), con
 * los valores separados por coma, punto y coma o barra. Así no hay que tocar
 * la base de datos para empezar a usarlas, y quedan a la vista en la ficha de
 * la orden como cualquier otro campo del cliente.
 */
const COLUMNAS_ETIQUETA = ["etiquetas", "etiqueta", "requisitos", "requiere", "tipo_vehiculo", "tags"];

const sinTildes = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Parte un texto de etiquetas y las deja comparables: minúsculas, sin tildes. */
export function partirEtiquetas(texto: string | null | undefined): string[] {
  if (!texto) return [];
  const limpias = sinTildes(texto)
    .toLowerCase()
    .split(/[,;|/]/)
    .map((e) => e.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  return [...new Set(limpias)];
}

export function etiquetasDe(t: TiendaMapa): string[] {
  for (const [columna, valor] of Object.entries(t.extra ?? {})) {
    const nombre = sinTildes(columna).toLowerCase().trim().replace(/\s+/g, "_");
    if (COLUMNAS_ETIQUETA.includes(nombre)) return partirEtiquetas(valor);
  }
  return [];
}

export type ResumenPlan = {
  tiendas: number;
  vehiculos_disponibles: number;
  vehiculos_usados: number;
  sin_asignar: number;
  /** Con qué distancias se decidió el reparto: por calles o estimadas. */
  matriz: "calles" | "recta";
  /** Si el solver partió de la agrupación de siempre o construyó la suya. */
  desde_agrupacion: boolean;
  balanceo: ConfigPlanificar["balanceo"];
  peso_prioridad: number;
  /** Cuántos puntos pedían alguna etiqueta. */
  con_etiquetas: number;
  /** De cuántas bases podía salir la flota, y de cuántas salió. */
  bases?: number;
  bases_usadas?: number;
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
  }>("/planificar", {
    ...cfg,
    // El motor solo necesita lo que rutea: la ficha del cliente, los
    // artículos y las columnas propias se quedan aquí.
    tiendas: tiendas.map((t) => ({
      id: t.id, codigo: t.codigo, nombre: t.nombre, distrito: t.distrito,
      lat: t.lat, lon: t.lon, bultos: t.bultos, prioridad: t.prioridad,
      ventana_ini: t.ventana_ini, ventana_fin: t.ventana_fin,
      etiquetas: etiquetasDe(t),
    })),
  });
}

/** Una parada tal como la quiere el motor: solo lo que rutea. */
export type ParadaMotor = {
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
  etiquetas: string[];
};

/** Lo que se le manda a `/insertar`. Lo arma el servidor: ver acciones/insertar. */
export type CuerpoInsertar = {
  rutas: {
    id: string;
    /** Dónde está el vehículo. Vacío = en el centro. */
    lat: number | null;
    lon: number | null;
    /** Su base, si no es el centro del despacho. */
    base_lat: number | null;
    base_lon: number | null;
    /** Desde cuándo está libre ahí. Vacío = la hora de la petición. */
    hora: string | null;
    pendientes: ParadaMotor[];
    fijas: number;
    capacidad_libre: number | null;
    paradas_libres: number | null;
    etiquetas: string[] | null;
  }[];
  nuevas: ParadaMotor[];
  cd_lat: number;
  cd_lon: number;
  motor: "osrm" | "haversine";
  cerrado: boolean;
  hora_actual: string;
  servicio_min: number;
  servicio_min_bulto: number;
  fin_jornada: string | null;
  reordenar: boolean;
  peso_prioridad: number;
};

export type PropuestaInsercion = {
  /** Solo las rutas que reciben algo, con su orden completo de pendientes. */
  rutas: {
    id: string;
    orden: string[];
    etas: Record<string, string>;
    fin: string;
    fin_antes: string;
    min_extra: number;
    km_extra: number;
    nuevas: string[];
    reordenada: boolean;
  }[];
  inserciones: Record<string, {
    ruta: string;
    posicion: number;
    despues_de: string | null;
    eta: string;
    km_extra: number;
    /** Etiquetas que pide y que no se pudieron comprobar en el vehículo. */
    sin_comprobar: string[];
  }>;
  sin_asignar: string[];
  motivos: Record<string, string>;
  resumen: {
    pedidos: number;
    colocados: number;
    sin_asignar: number;
    rutas_tocadas: number;
    matriz: "calles" | "recta";
  };
};

/**
 * Busca el mejor hueco para órdenes nuevas en rutas que ya están en marcha.
 *
 * No reparte el día otra vez: cada vehículo parte de donde está, lo ya
 * gestionado no cuenta y el orden de lo pendiente se respeta. Solo propone;
 * guardar es otro paso (`insertar_paradas` en la base).
 */
export function insertar(cuerpo: CuerpoInsertar) {
  return pedir<PropuestaInsercion>("/insertar", cuerpo);
}

/** Lo que se le manda a `/reordenar`. Lo arma el servidor: ver acciones/rutas. */
export type CuerpoReordenar = {
  /** Las pendientes, en su orden actual (o en el que se quiere evaluar). */
  paradas: ParadaMotor[];
  /** De dónde parte el vehículo y a qué hora. */
  lat: number;
  lon: number;
  hora: string;
  centro_lat: number | null;
  centro_lon: number | null;
  /** Dónde termina: de vuelta en el centro, en una parada, o donde caiga. */
  final: "centro" | "parada" | "libre";
  final_id: string | null;
  fijas: number;
  /** Paradas que conservan su puesto al optimizar. */
  ancladas?: string[];
  motor: "osrm" | "haversine";
  servicio_min: number;
  servicio_min_bulto: number;
  /** false = no cambia el orden, solo lo evalúa. */
  optimizar: boolean;
  tiempo_s: number;
};

export type OrdenEvaluado = {
  orden: string[];
  etas: Record<string, string>;
  fin: string;
  min: number;
  km: number;
  /** Las que llegarían fuera de su ventana horaria. */
  tarde: string[];
};

export type PropuestaOrden = {
  antes: OrdenEvaluado;
  despues: OrdenEvaluado;
  /** Falso si el orden que había ya era el mejor. */
  cambio: boolean;
  matriz: "calles" | "recta";
};

/**
 * Ordena lo que le queda a una ruta, o evalúa el orden que se le da.
 *
 * Solo propone: guardar es otro paso (`reordenar_ruta` en la base).
 */
export function reordenar(cuerpo: CuerpoReordenar) {
  return pedir<PropuestaOrden>("/reordenar", cuerpo);
}

export function tiendasEnSector(tiendas: TiendaMapa[], poligono: number[][]) {
  return pedir<{ ids: string[] }>("/tiendas-en-sector", { tiendas, poligono });
}
