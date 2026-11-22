"use server";

import { auth } from "@/auth";
import { comoUsuario, unaFila } from "@/lib/db";
import { ahoraEnZona, hhmm } from "@/lib/horaZona";
import { etiquetasDe, type CuerpoReordenar } from "@/lib/motor";

/**
 * El editor de rutas: ordenar a mano, mover órdenes entre rutas, anclarlas.
 *
 * El planificador decide el reparto y «Reordenar ruta» lo afina, pero hay
 * cosas que solo sabe quien conoce la calle: que a tal cliente hay que ir
 * primero, que esta orden le viene mejor al otro conductor. Aquí se mueve a
 * mano, y el motor solo hace la cuenta —horas y kilómetros del orden que se
 * le da— o, si se le pide, optimiza una ruta respetando lo anclado.
 */
async function idSesion() {
  const sesion = await auth();
  if (!sesion?.user) throw new Error("Tu sesión caducó. Vuelve a entrar.");
  return sesion.user.id;
}

export type OrdenEditor = {
  id: string;
  codigo: string | null;
  nombre: string | null;
  distrito: string | null;
  lat: number;
  lon: number;
  bultos: number;
  prioridad: number;
  ventana_ini: string | null;
  ventana_fin: string | null;
  eta: string | null;
  fija: boolean;
};

export type RutaEditor = {
  id: string;
  indice: number;
  placa: string | null;
  conductor: string | null;
  base_nombre: string | null;
  /** De dónde sale: su base o, si no tiene, el centro del despacho. */
  base_lat: number | null;
  base_lon: number | null;
  /** Lo que le cabe al vehículo, si tiene uno asignado. */
  capacidad: number | null;
  max_paradas: number | null;
  salida: string | null;
  fin: string | null;
  km: number | null;
  /** Ya salió o tiene entregas: su primera pendiente no se mueve. */
  en_calle: boolean;
  cerrada: boolean;
  gestionadas: number;
  pendientes: OrdenEditor[];
};

export type DatosEditor = {
  despacho: { id: string; nombre: string | null; estado: string; fecha: string; fin_jornada: string | null };
  rutas: RutaEditor[];
  bandeja: OrdenEditor[];
};

type Cruda = OrdenEditor & {
  ruta_id: string; estado_entrega: string; orden: number; bloqueada: boolean;
};

export async function datosEditor(despachoId: string): Promise<DatosEditor | null> {
  const yo = await idSesion();
  const d = await unaFila<{
    id: string; nombre: string | null; estado: string; fecha: string;
    parametros: Record<string, unknown> | null;
  }>(
    yo,
    "select id, nombre, estado, fecha, parametros from despachos where id = $1",
    [despachoId],
  );
  if (!d) return null;

  const [rutas, paradas] = await Promise.all([
    comoUsuario<{
      id: string; indice: number; estado: string; sin_asignar: boolean;
      salida_prog: string | null; salida_real: string | null; fin_estimado: string | null;
      km: number | null; placa: string | null; conductor: string | null;
      base_nombre: string | null; base_lat: number | null; base_lon: number | null;
      capacidad_bultos: number | null; max_tiendas: number | null;
    }>(
      yo,
      `select r.id, r.indice, r.estado, r.sin_asignar, r.salida_prog, r.salida_real,
              r.fin_estimado, r.km, v.placa, c.nombre as conductor,
              case when r.base_lat is not null then r.base_nombre end as base_nombre,
              coalesce(r.base_lat, d.cd_lat) as base_lat,
              coalesce(r.base_lon, d.cd_lon) as base_lon,
              v.capacidad_bultos, v.max_tiendas
         from rutas r
         join despachos d on d.id = r.despacho_id
         left join vehiculos v on v.id = r.vehiculo_id
         left join perfiles c on c.id = r.conductor_id
        where r.despacho_id = $1 and r.estado <> 'cancelada'
        order by r.indice`,
      [despachoId],
    ),
    comoUsuario<Cruda>(
      yo,
      `select p.id, p.ruta_id, p.orden, p.codigo, p.nombre, p.distrito, p.lat, p.lon, p.bultos,
              p.prioridad, p.ventana_ini, p.ventana_fin, p.eta, p.fija, p.estado_entrega,
              p.bloqueada
         from paradas p join rutas r on r.id = p.ruta_id
        where r.despacho_id = $1
        order by p.orden`,
      [despachoId],
    ),
  ]);

  const limpia = (p: Cruda): OrdenEditor => ({
    id: p.id, codigo: p.codigo, nombre: p.nombre, distrito: p.distrito,
    lat: p.lat, lon: p.lon, bultos: p.bultos,
    prioridad: p.prioridad, ventana_ini: hhmm(p.ventana_ini), ventana_fin: hhmm(p.ventana_fin),
    eta: hhmm(p.eta), fija: p.fija,
  });

  const par = d.parametros ?? {};
  let finJornada: string | null = null;
  const salidaPlan = typeof par.hora_salida === "string" ? hhmm(par.hora_salida) : null;
  const jornada = typeof par.jornada_h === "number" ? par.jornada_h : 0;
  if (salidaPlan && jornada > 0) {
    const [h, m] = salidaPlan.split(":").map(Number);
    const min = Math.min(h * 60 + m + Math.round(jornada * 60), 23 * 60 + 59);
    finJornada = `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  }

  // Una orden bloqueada no se mueve: cuenta con las gestionadas.
  const movible = (p: Cruda) => p.estado_entrega === "pendiente" && !p.bloqueada;
  const bandejaId = rutas.find((r) => r.sin_asignar)?.id;
  return {
    despacho: { id: d.id, nombre: d.nombre, estado: d.estado, fecha: d.fecha, fin_jornada: finJornada },
    bandeja: paradas
      .filter((p) => p.ruta_id === bandejaId && movible(p))
      .map(limpia),
    rutas: rutas
      .filter((r) => !r.sin_asignar)
      .map((r) => {
        const suyas = paradas.filter((p) => p.ruta_id === r.id);
        const gestionadas = suyas.filter((p) => !movible(p)).length;
        const marcadas = suyas.some((p) => p.estado_entrega !== "pendiente");
        return {
          id: r.id, indice: r.indice, placa: r.placa, conductor: r.conductor,
          base_nombre: r.base_nombre, base_lat: r.base_lat, base_lon: r.base_lon,
          capacidad: r.capacidad_bultos,
          max_paradas: r.max_tiendas && r.max_tiendas > 0 ? r.max_tiendas : null,
          salida: hhmm(r.salida_prog), fin: hhmm(r.fin_estimado), km: r.km,
          en_calle: Boolean(r.salida_real) || marcadas,
          cerrada: r.estado === "completada",
          gestionadas,
          pendientes: suyas.filter(movible).map(limpia),
        };
      }),
  };
}

export type CalculoRuta = {
  id: string;
  /** Vacío si la ruta se queda sin órdenes pendientes: no hay nada que calcular. */
  cuerpo: CuerpoReordenar | null;
  enCalle: boolean;
  salida: string;
};

/**
 * Lo que el motor necesita para hacer la cuenta de cada ruta tocada.
 *
 * Recibe el orden que hay en pantalla —que puede traer órdenes que todavía
 * están en otra ruta o en la bandeja— y lo arma con lo que dice la base:
 * coordenadas, ventanas, de dónde parte cada vehículo y a qué hora.
 *
 * `optimizar` es para «Optimizar» de una ruta: el motor puede cambiar el
 * orden, salvo las ancladas, que conservan su puesto.
 */
export async function prepararCalculo(
  despachoId: string,
  rutas: { id: string; orden: string[] }[],
  opciones: { optimizar?: boolean; ancladas?: string[] } = {},
): Promise<CalculoRuta[]> {
  const yo = await idSesion();
  const ids = rutas.flatMap((r) => r.orden);

  const [cab, paradas, hechas] = await Promise.all([
    comoUsuario<{
      id: string; estado: string; salida_prog: string | null; salida_real: string | null;
      cd_lat: number | null; cd_lon: number | null; parametros: Record<string, unknown> | null;
    }>(
      yo,
      `select r.id, r.estado, r.salida_prog, r.salida_real,
              coalesce(r.base_lat, d.cd_lat) as cd_lat,
              coalesce(r.base_lon, d.cd_lon) as cd_lon, d.parametros
         from rutas r join despachos d on d.id = r.despacho_id
        where r.despacho_id = $1 and not r.sin_asignar and r.id = any($2::uuid[])`,
      [despachoId, rutas.map((r) => r.id)],
    ),
    comoUsuario<{
      id: string; codigo: string | null; nombre: string | null; lat: number; lon: number;
      bultos: number; prioridad: number; ventana_ini: string | null; ventana_fin: string | null;
      extra: Record<string, string> | null;
    }>(
      yo,
      `select p.id, p.codigo, p.nombre, p.lat, p.lon, p.bultos, p.prioridad,
              p.ventana_ini, p.ventana_fin, p.extra
         from paradas p join rutas r on r.id = p.ruta_id
        where r.despacho_id = $1 and p.estado_entrega = 'pendiente' and not p.bloqueada
          and p.id = any($2::uuid[])`,
      [despachoId, ids],
    ),
    // La última gestionada de cada ruta: de ahí parte el vehículo en la calle.
    comoUsuario<{ ruta_id: string; lat: number; lon: number; n: number }>(
      yo,
      `select distinct on (p.ruta_id) p.ruta_id,
              coalesce(p.gps_lat, p.lat) as lat, coalesce(p.gps_lon, p.lon) as lon,
              count(*) over (partition by p.ruta_id)::int as n
         from paradas p
        where p.ruta_id = any($1::uuid[]) and p.estado_entrega <> 'pendiente'
        order by p.ruta_id, p.hora_entrega desc nulls last`,
      [rutas.map((r) => r.id)],
    ),
  ]);

  const porId = new Map(paradas.map((p) => [p.id, p]));
  if (ids.some((id) => !porId.has(id))) {
    throw new Error("Alguna orden ya se gestionó o se bloqueó mientras editabas. Vuelve a abrir el editor.");
  }
  const ahora = ahoraEnZona();

  return rutas.map((r) => {
    const c = cab.find((x) => x.id === r.id);
    if (!c) throw new Error("Alguna ruta ya no existe. Vuelve a abrir el editor.");
    if (c.estado === "completada") throw new Error("Una de las rutas está cerrada: ábrela antes de cambiarla.");
    if (c.cd_lat == null || c.cd_lon == null) {
      throw new Error("Este despacho no tiene centro de salida: ábrelo en el planificador.");
    }
    const ultima = hechas.find((h) => h.ruta_id === r.id);
    const enCalle = Boolean(c.salida_real) || Boolean(ultima);
    const par = c.parametros ?? {};
    const numero = (v: unknown, defecto: number) =>
      typeof v === "number" && isFinite(v) ? v : defecto;
    const salida =
      hhmm(c.salida_prog) ??
      (typeof par.hora_salida === "string" ? hhmm(par.hora_salida) : null) ??
      "08:00";

    if (!r.orden.length) return { id: r.id, cuerpo: null, enCalle, salida };
    return {
      id: r.id,
      enCalle,
      salida,
      cuerpo: {
        paradas: r.orden.map((id) => {
          const p = porId.get(id)!;
          return {
            id: p.id, codigo: p.codigo ?? "", nombre: p.nombre ?? "", distrito: null,
            lat: p.lat, lon: p.lon, bultos: p.bultos, prioridad: p.prioridad,
            ventana_ini: hhmm(p.ventana_ini), ventana_fin: hhmm(p.ventana_fin),
            etiquetas: etiquetasDe({
              id: p.id, codigo: "", nombre: "", distrito: null, lat: p.lat, lon: p.lon,
              bultos: p.bultos, prioridad: p.prioridad, ventana_ini: null, ventana_fin: null,
              extra: p.extra ?? {},
            }),
          };
        }),
        lat: ultima ? ultima.lat : c.cd_lat,
        lon: ultima ? ultima.lon : c.cd_lon,
        // En la calle manda el reloj; antes de salir, la hora de inicio.
        hora: enCalle ? ahora : salida,
        centro_lat: c.cd_lat,
        centro_lon: c.cd_lon,
        final: par.cerrado === false ? "libre" : "centro",
        final_id: null,
        fijas: enCalle ? 1 : 0,
        ancladas: opciones.ancladas ?? [],
        motor: "osrm",
        servicio_min: numero(par.servicio_min, 10),
        servicio_min_bulto: numero(par.servicio_min_bulto, 0),
        optimizar: Boolean(opciones.optimizar),
        tiempo_s: 6,
      },
    };
  });
}

/** Guarda de una vez todo lo que se movió en el editor. */
export async function guardarEdicion(cambios: {
  despacho_id: string;
  rutas: {
    ruta_id: string;
    orden: string[];
    etas: Record<string, string>;
    km: number | null;
    duracion_min: number | null;
    fin: string | null;
    /** null = no se tocó el orden: se queda como estaba. */
    personalizada: boolean | null;
  }[];
  bandeja: string[];
  fijas: string[];
}) {
  const yo = await idSesion();
  const filas = await comoUsuario<{ n: number }>(
    yo,
    "select guardar_edicion($1::jsonb) as n",
    [JSON.stringify(cambios)],
  );
  return filas[0]?.n ?? 0;
}
