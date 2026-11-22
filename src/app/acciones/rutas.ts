"use server";

import { auth } from "@/auth";
import { comoUsuario, unaFila } from "@/lib/db";
import { ahoraEnZona, hhmm } from "@/lib/horaZona";
import { ZONA } from "@/lib/horas";
import { etiquetasDe, type CuerpoReordenar, type OrdenEvaluado } from "@/lib/motor";

/**
 * La lista de rutas, con su huella.
 *
 * Una fila por vehículo y salida, de todos los despachos: lo que en la
 * referencia es el módulo «Rutas». Los despachos siguen existiendo como el
 * documento que las agrupa; esto es la vista por ruta.
 *
 * El CO2 es una estimación, y conviene saber de dónde sale: kilómetros
 * planificados por un factor fijo. No hay odómetro ni consumo real, así que
 * no mide lo que se emitió sino lo que se planificó emitir. El factor,
 * 0,25 kg por kilómetro, es el de una furgoneta diésel ligera de reparto; el
 * día que cada vehículo declare el suyo, este número pasa a ser una columna
 * de `vehiculos` y la fórmula no cambia.
 */
const KG_CO2_POR_KM = 0.25;

/** Margen de puntualidad, el mismo que usan los informes. */
const MARGEN_MIN = 15;

async function idSesion() {
  const sesion = await auth();
  if (!sesion?.user) throw new Error("Tu sesión caducó. Vuelve a entrar.");
  return sesion.user.id;
}

export type RutaFila = {
  id: string;
  despacho_id: string;
  despacho: string | null;
  indice: number;
  placa: string | null;
  vehiculo: string | null;
  conductor: string | null;
  paradas: number;
  gestionadas: number;
  fecha: string;
  salida_prog: string | null;
  salida_real: string | null;
  creado_en: string;
  km: number | null;
  co2: number | null;
  estado: string;
  personalizada: boolean;
};

export async function rutasLista(desde: string, hasta: string) {
  const yo = await idSesion();
  return comoUsuario<RutaFila>(
    yo,
    `select r.id, d.id as despacho_id, d.nombre as despacho, r.indice,
            v.placa, v.nombre as vehiculo, c.nombre as conductor,
            (select count(*) from paradas p where p.ruta_id = r.id)::int as paradas,
            (select count(*) from paradas p
              where p.ruta_id = r.id and p.estado_entrega <> 'pendiente')::int as gestionadas,
            d.fecha, r.salida_prog, r.salida_real, r.creado_en, r.km,
            round(r.km * ${KG_CO2_POR_KM}, 1) as co2,
            r.estado, r.personalizada
       from rutas r
       join despachos d on d.id = r.despacho_id
       left join perfiles c  on c.id = r.conductor_id
       left join vehiculos v on v.id = r.vehiculo_id
      where d.fecha between $1 and $2 and not r.sin_asignar
      order by d.fecha desc, r.creado_en desc, r.indice
      limit 1000`,
    [desde, hasta],
  );
}

/**
 * Cierra una ruta —sus órdenes quedan bloqueadas— o la vuelve a abrir.
 * Abrir, solo un administrador: lo decide la función de la base.
 */
export async function cerrarRuta(rutaId: string, cerrar: boolean) {
  const yo = await idSesion();
  await comoUsuario(yo, "select cerrar_ruta($1, $2)", [rutaId, cerrar]);
}

/** Quita una ruta que aún no salió. Sus órdenes vuelven a la bandeja. */
export async function eliminarRuta(rutaId: string) {
  const yo = await idSesion();
  const filas = await comoUsuario<{ n: number }>(yo, "select eliminar_ruta($1) as n", [rutaId]);
  return filas[0]?.n ?? 0;
}

export type ResumenRutas = {
  km: number | null;
  co2: number | null;
  marcadas: number;
  a_tiempo: number;
  min_por_parada: number | null;
  rutas: number;
  reordenadas: number;
};

/** Las cuatro cifras de arriba, sobre el mes en curso. */
export async function resumenRutasDelMes() {
  const yo = await idSesion();
  return unaFila<ResumenRutas>(
    yo,
    `with ru as (
       select r.id, r.km, r.personalizada, d.fecha
         from rutas r join despachos d on d.id = r.despacho_id
        where not r.sin_asignar
          and d.fecha >= date_trunc('month', (now() at time zone $1))::date
          and d.fecha <  (date_trunc('month', (now() at time zone $1)) + interval '1 month')::date
     ),
     pa as (
       select p.ruta_id, p.hora_entrega,
              extract(epoch from
                (p.hora_entrega - ((ru.fecha + p.eta) at time zone $1))) / 60 as desvio
         from paradas p join ru on ru.id = p.ruta_id
        where p.estado_entrega <> 'pendiente' and p.hora_entrega is not null
     ),
     ritmo as (
       -- Minutos entre una marca y la siguiente, ruta por ruta. Con una sola
       -- marca no hay intervalo que medir y la ruta no entra.
       select extract(epoch from (max(hora_entrega) - min(hora_entrega))) / 60
                / nullif(count(*) - 1, 0) as min_parada
         from pa group by ruta_id having count(*) > 1
     )
     select
       (select round(sum(km), 1) from ru)::numeric as km,
       (select round(sum(km) * ${KG_CO2_POR_KM}, 1) from ru)::numeric as co2,
       (select count(*) from pa)::int as marcadas,
       (select count(*) from pa where abs(desvio) <= ${MARGEN_MIN})::int as a_tiempo,
       (select round(avg(min_parada)::numeric, 1) from ritmo)::numeric as min_por_parada,
       (select count(*) from ru)::int as rutas,
       (select count(*) from ru where personalizada)::int as reordenadas`,
    [ZONA],
  );
}

/* ── El detalle de una ruta ───────────────────────────────────────── */

export type ParadaDeRuta = {
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
  ventana_ini: string | null;
  ventana_fin: string | null;
  estado_entrega: string;
  subestado: string | null;
  motivo: string | null;
  hora_entrega: string | null;
  bloqueada: boolean;
  telefono: string | null;
  direccion: string | null;
  items: number;
};

export type RutaDetalle = {
  id: string;
  indice: number;
  estado: string;
  km: number | null;
  duracion_min: number | null;
  salida_prog: string | null;
  salida_real: string | null;
  fin_estimado: string | null;
  fin_real: string | null;
  geometria: number[][] | null;
  personalizada: boolean;
  conductor_id: string | null;
  conductor: string | null;
  vehiculo_id: string | null;
  placa: string | null;
  vehiculo: string | null;
  /** De qué base sale, si no es el centro del despacho. */
  base_nombre: string | null;
  cd_lat: number | null;
  cd_lon: number | null;
  despacho_id: string;
  despacho: string | null;
  fecha: string;
  despacho_estado: string;
  paradas: ParadaDeRuta[];
  /** Órdenes del mismo despacho que no están en ninguna ruta. */
  bandeja: { id: string; codigo: string | null; nombre: string | null; distrito: string | null; bultos: number }[];
};

/**
 * Una ruta con todo lo suyo: quién la lleva, cuándo sale y sus órdenes.
 *
 * Es la pantalla «Rutas › detalle» de la referencia. Hasta ahora una ruta
 * solo se podía mirar dentro de la torre de su despacho, mezclada con las
 * demás; aquí es el documento, y desde aquí se reordena y se edita.
 */
export async function detalleRuta(id: string): Promise<RutaDetalle | null> {
  const yo = await idSesion();
  const cab = await unaFila<Omit<RutaDetalle, "paradas" | "bandeja">>(
    yo,
    `select r.id, r.indice, r.estado, r.km, r.duracion_min, r.salida_prog, r.salida_real,
            r.fin_estimado, r.fin_real, r.geometria, r.personalizada,
            r.conductor_id, c.nombre as conductor,
            r.vehiculo_id, v.placa, v.nombre as vehiculo,
            case when r.base_lat is not null then r.base_nombre end as base_nombre,
            coalesce(r.base_lat, d.cd_lat) as cd_lat,
            coalesce(r.base_lon, d.cd_lon) as cd_lon,
            d.id as despacho_id, d.nombre as despacho, d.fecha, d.estado as despacho_estado
       from rutas r
       join despachos d on d.id = r.despacho_id
       left join perfiles c on c.id = r.conductor_id
       left join vehiculos v on v.id = r.vehiculo_id
      where r.id = $1 and not r.sin_asignar`,
    [id],
  );
  if (!cab) return null;

  const [paradas, bandeja] = await Promise.all([
    comoUsuario<ParadaDeRuta>(
      yo,
      `select p.id, p.orden, p.codigo, p.nombre, p.distrito, p.lat, p.lon, p.bultos,
              p.prioridad, p.eta, p.ventana_ini, p.ventana_fin, p.estado_entrega,
              p.subestado, p.motivo, p.hora_entrega, p.bloqueada,
              cl.telefono, cl.direccion,
              (select count(*) from items it where it.parada_id = p.id)::int as items
         from paradas p
         left join clientes cl on cl.org_id = p.org_id and cl.codigo = p.codigo
        where p.ruta_id = $1
        order by p.orden`,
      [id],
    ),
    comoUsuario<RutaDetalle["bandeja"][number]>(
      yo,
      `select p.id, p.codigo, p.nombre, p.distrito, p.bultos
         from paradas p join rutas b on b.id = p.ruta_id
        where b.despacho_id = $1 and b.sin_asignar and p.estado_entrega = 'pendiente'
        order by p.orden`,
      [cab.despacho_id],
    ),
  ]);
  return { ...cab, paradas, bandeja };
}

export type EventoRuta = {
  id: number;
  tipo: string;
  ocurrido_en: string;
  autor: string | null;
  parada_id: string | null;
  codigo: string | null;
  parada: string | null;
  datos: Record<string, unknown>;
};

/** Lo que ha pasado en una ruta, de lo más reciente a lo más antiguo. */
export async function eventosDeRuta(rutaId: string) {
  const yo = await idSesion();
  return comoUsuario<EventoRuta>(
    yo,
    `select e.id, e.tipo, e.ocurrido_en, a.nombre as autor, e.parada_id,
            p.codigo, p.nombre as parada, e.datos
       from eventos e
       left join paradas p on p.id = e.parada_id
       left join perfiles a on a.id = e.autor
      where e.ruta_id = $1
      order by e.ocurrido_en desc, e.id desc
      limit 500`,
    [rutaId],
  );
}

export type PreparacionOrden = {
  cuerpo: CuerpoReordenar;
  /** La ruta ya tiene entregas: sus kilómetros totales no se reescriben. */
  enCalle: boolean;
  /** A qué hora sale, para calcular la duración de una ruta que aún no salió. */
  salida: string;
};

/**
 * Lo que el motor necesita para ordenar lo que le queda a una ruta.
 *
 * Como en la búsqueda de hueco, se arma en el servidor y en el momento: de
 * dónde parte el vehículo y qué le queda salen de la base, no de la pantalla.
 * Con la ruta en la calle, parte de su última parada gestionada, a la hora
 * que es, y la siguiente pendiente no se mueve: el conductor ya va hacia ella.
 *
 * `orden`, si se da, es el orden que se quiere evaluar o tomar como partida:
 * sirve para el orden puesto a mano.
 */
export async function prepararOrden(
  rutaId: string,
  opciones: {
    final: "centro" | "parada" | "libre";
    finalId?: string | null;
    optimizar: boolean;
    orden?: string[];
  },
): Promise<PreparacionOrden> {
  const yo = await idSesion();
  const ruta = await unaFila<{
    estado: string;
    salida_prog: string | null;
    salida_real: string | null;
    cd_lat: number | null;
    cd_lon: number | null;
    parametros: Record<string, unknown> | null;
  }>(
    yo,
    `select r.estado, r.salida_prog, r.salida_real,
            coalesce(r.base_lat, d.cd_lat) as cd_lat,
            coalesce(r.base_lon, d.cd_lon) as cd_lon,
            d.parametros
       from rutas r join despachos d on d.id = r.despacho_id
      where r.id = $1 and not r.sin_asignar`,
    [rutaId],
  );
  if (!ruta) throw new Error("Esa ruta no existe.");
  if (ruta.estado === "completada" || ruta.estado === "cancelada") {
    throw new Error("Esta ruta está cerrada: ábrela antes de cambiar su orden.");
  }
  if (ruta.cd_lat == null || ruta.cd_lon == null) {
    throw new Error("Esta ruta no tiene centro de salida: ábrela en el planificador.");
  }

  const paradas = await comoUsuario<{
    id: string; orden: number; codigo: string | null; nombre: string | null;
    lat: number; lon: number; bultos: number; prioridad: number;
    ventana_ini: string | null; ventana_fin: string | null;
    estado_entrega: string; hora_entrega: string | null;
    gps_lat: number | null; gps_lon: number | null;
    extra: Record<string, string> | null;
  }>(
    yo,
    `select id, orden, codigo, nombre, lat, lon, bultos, prioridad, ventana_ini,
            ventana_fin, estado_entrega, hora_entrega, gps_lat, gps_lon, extra
       from paradas where ruta_id = $1 order by orden`,
    [rutaId],
  );
  let pendientes = paradas.filter((p) => p.estado_entrega === "pendiente");
  const gestionadas = paradas.filter((p) => p.estado_entrega !== "pendiente");
  if (!pendientes.length) throw new Error("Esta ruta no tiene órdenes pendientes.");

  if (opciones.orden) {
    const lugar = new Map(opciones.orden.map((id, i) => [id, i]));
    if (pendientes.some((p) => !lugar.has(p.id)) || lugar.size !== pendientes.length) {
      throw new Error("La ruta cambió mientras la ordenabas. Vuelve a abrirla.");
    }
    pendientes = [...pendientes].sort((a, b) => lugar.get(a.id)! - lugar.get(b.id)!);
  }

  const enCalle = Boolean(ruta.salida_real) || gestionadas.length > 0;
  const ultima = gestionadas
    .filter((p) => p.hora_entrega)
    .sort((a, b) => (a.hora_entrega! < b.hora_entrega! ? 1 : -1))[0];

  const par = ruta.parametros ?? {};
  const numero = (v: unknown, defecto: number) =>
    typeof v === "number" && isFinite(v) ? v : defecto;
  const ahora = ahoraEnZona();
  const salida =
    hhmm(ruta.salida_prog) ??
    (typeof par.hora_salida === "string" ? hhmm(par.hora_salida) : null) ??
    "08:00";
  // En la calle manda el reloj. Antes de salir manda la hora de inicio de la
  // ruta, aunque ya haya pasado: las horas estimadas son las del plan, y así
  // siguen cuadrando si después se le cambia esa hora de inicio.
  const hora = enCalle ? ahora : salida;

  return {
    enCalle,
    salida,
    cuerpo: {
      paradas: pendientes.map((p) => ({
        id: p.id, codigo: p.codigo ?? "", nombre: p.nombre ?? "", distrito: null,
        lat: p.lat, lon: p.lon, bultos: p.bultos, prioridad: p.prioridad,
        ventana_ini: hhmm(p.ventana_ini), ventana_fin: hhmm(p.ventana_fin),
        etiquetas: etiquetasDe({
          id: p.id, codigo: "", nombre: "", distrito: null, lat: p.lat, lon: p.lon,
          bultos: p.bultos, prioridad: p.prioridad, ventana_ini: null, ventana_fin: null,
          extra: p.extra ?? {},
        }),
      })),
      lat: ultima ? (ultima.gps_lat ?? ultima.lat) : ruta.cd_lat,
      lon: ultima ? (ultima.gps_lon ?? ultima.lon) : ruta.cd_lon,
      hora,
      centro_lat: ruta.cd_lat,
      centro_lon: ruta.cd_lon,
      final: opciones.final,
      final_id: opciones.final === "parada" ? (opciones.finalId ?? null) : null,
      // El conductor ya va hacia su siguiente parada: esa no se mueve.
      fijas: enCalle ? 1 : 0,
      motor: "osrm",
      servicio_min: numero(par.servicio_min, 10),
      servicio_min_bulto: numero(par.servicio_min_bulto, 0),
      optimizar: opciones.optimizar,
      tiempo_s: 6,
    },
  };
}

/**
 * Guarda el orden que devolvió el motor.
 *
 * Los kilómetros y la duración de la ruta solo se reescriben si aún no salió:
 * con entregas hechas, el motor solo sabe lo que le queda, no el total.
 */
export async function guardarOrden(
  rutaId: string,
  plan: OrdenEvaluado,
  datos: { enCalle: boolean; salida: string; aMano: boolean },
) {
  const yo = await idSesion();
  const [h, m] = datos.salida.split(":").map(Number);
  const [fh, fm] = plan.fin.split(":").map(Number);
  let duracion = fh * 60 + fm - (h * 60 + m);
  if (duracion < 0) duracion += 24 * 60;
  await comoUsuario(yo, "select reordenar_ruta($1::jsonb)", [
    JSON.stringify({
      ruta_id: rutaId,
      orden: plan.orden,
      etas: plan.etas,
      fin: plan.fin,
      km: datos.enCalle ? null : plan.km,
      duracion_min: datos.enCalle ? null : duracion,
      personalizada: datos.aMano ? true : null,
    }),
  ]);
}

/** Cambia el conductor, el vehículo y la hora de inicio de una ruta. */
export async function editarRuta(cambios: {
  ruta_id: string;
  conductor_id: string | null;
  vehiculo_id: string | null;
  salida: string | null;
}) {
  const yo = await idSesion();
  await comoUsuario(yo, "select editar_ruta($1::jsonb)", [JSON.stringify(cambios)]);
}
