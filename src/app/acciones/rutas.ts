"use server";

import { auth } from "@/auth";
import { comoUsuario, unaFila } from "@/lib/db";
import { ZONA } from "@/lib/horas";

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
