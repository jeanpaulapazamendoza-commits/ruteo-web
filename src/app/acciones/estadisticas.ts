"use server";

import { auth } from "@/auth";
import { unaFila } from "@/lib/db";
import { ZONA } from "@/lib/horas";

/**
 * Los informes.
 *
 * Todo se calcula al preguntarlo, contra las tablas de siempre. No hay tabla
 * de resumen ni proceso nocturno: un número guardado hay que regenerarlo, y
 * el día que el proceso falle el informe seguirá mostrando el de ayer sin
 * decir que está viejo. Un informe que miente en silencio es peor que no
 * tenerlo.
 *
 * Las sumas excluyen la bandeja de puntos sin asignar: esos no salieron a
 * reparto y nadie los iba a marcar, así que contarlos hunde el cumplimiento
 * sin que haya nada que corregir.
 *
 * El margen de puntualidad son quince minutos a cada lado de la hora
 * estimada. Es una decisión, no una ley: por debajo, el ruido del tráfico
 * convierte en «atrasado» a quien llegó bien.
 */
const MARGEN_MIN = 15;

/** Radio alrededor del punto dentro del cual se da por hecho que se llegó. */
const RADIO_M = 500;

async function idSesion() {
  const sesion = await auth();
  if (!sesion?.user) throw new Error("Tu sesión caducó. Vuelve a entrar.");
  return sesion.user.id;
}

export type Cuenta = { texto: string; n: number };

export type PuntoMapa = {
  id: string;
  nombre: string | null;
  lat: number;
  lon: number;
  estado: string;
  hora: number | null;
  conductor: string | null;
};

export type InformeEnvios = {
  total: number;
  entregadas: number;
  bultos: number;
  desvio_medio: number | null;
  desvio_max: number | null;
  estados: Cuenta[];
  subestados: Cuenta[];
  por_hora: number[];
  por_dia_semana: number[];
  por_conductor: Cuenta[];
  por_vehiculo: Cuenta[];
  por_cliente: Cuenta[];
  cumplimiento: Cuenta[];
  en_el_punto: Cuenta[];
  ultimas: {
    parada_id: string;
    codigo: string | null;
    nombre: string | null;
    fecha: string;
    conductor: string | null;
    hora_entrega: string | null;
    desvio_min: number | null;
    estado_entrega: string;
  }[];
  puntos: PuntoMapa[];
};

/** El cuerpo común: las paradas del rango, con lo que haga falta calculado. */
const BASE = `
  with base as (
    select p.id, p.codigo, p.nombre, p.lat, p.lon, p.bultos, p.eta,
           p.estado_entrega, p.subestado, p.hora_entrega,
           p.gps_lat, p.gps_lon,
           d.fecha, cond.nombre as conductor, v.placa
      from paradas p
      join rutas r      on r.id = p.ruta_id and not r.sin_asignar
      join despachos d  on d.id = r.despacho_id
      left join perfiles cond on cond.id = r.conductor_id
      left join vehiculos v   on v.id = r.vehiculo_id
     where d.fecha between $1 and $2
  ),
  calc as (
    select b.*,
           round(extract(epoch from
             (b.hora_entrega - ((b.fecha + b.eta) at time zone $3))) / 60)::int as desvio_min,
           private.metros(b.lat, b.lon, b.gps_lat, b.gps_lon) as metros_gps,
           extract(hour from (b.hora_entrega at time zone $3))::int as h,
           extract(dow  from (b.hora_entrega at time zone $3))::int as dow
      from base b
  )`;

export async function informeEnvios(desde: string, hasta: string) {
  const yo = await idSesion();
  return unaFila<InformeEnvios>(
    yo,
    `${BASE}
     select
       (select count(*) from calc)::int as total,
       (select count(*) from calc where estado_entrega = 'entregado')::int as entregadas,
       (select coalesce(sum(bultos), 0) from calc)::int as bultos,
       (select round(avg(desvio_min)) from calc where desvio_min is not null)::int as desvio_medio,
       (select max(desvio_min) from calc)::int as desvio_max,

       (select coalesce(json_agg(json_build_object('texto', estado_entrega, 'n', n)
                                 order by n desc), '[]'::json)
          from (select estado_entrega, count(*)::int as n from calc group by 1) e) as estados,

       -- Sin motivo tipificado no se cuenta como «otro»: se dice que no lo
       -- tiene, que es distinto y es lo que hay que corregir.
       (select coalesce(json_agg(json_build_object('texto', texto, 'n', n)
                                 order by n desc), '[]'::json)
          from (select coalesce(subestado, 'Sin motivo') as texto, count(*)::int as n
                  from calc where estado_entrega not in ('pendiente','entregado')
                 group by 1) sb) as subestados,

       (select coalesce(json_agg(n order by h), '[]'::json)
          from (select g.h, (select count(*) from calc c where c.h = g.h)::int as n
                  from generate_series(0, 23) as g(h)) ph) as por_hora,

       (select coalesce(json_agg(n order by d), '[]'::json)
          from (select g.d, (select count(*) from calc c where c.dow = g.d)::int as n
                  from generate_series(0, 6) as g(d)) pd) as por_dia_semana,

       (select coalesce(json_agg(json_build_object('texto', texto, 'n', n)
                                 order by n desc), '[]'::json)
          from (select coalesce(conductor, 'Sin conductor') as texto, count(*)::int as n
                  from calc group by 1) pc) as por_conductor,

       (select coalesce(json_agg(json_build_object('texto', texto, 'n', n)
                                 order by n desc), '[]'::json)
          from (select coalesce(placa, 'Sin vehículo') as texto, count(*)::int as n
                  from calc group by 1) pv) as por_vehiculo,

       (select coalesce(json_agg(json_build_object('texto', texto, 'n', n)
                                 order by n desc), '[]'::json)
          from (select coalesce(nombre, codigo, 'Sin nombre') as texto, count(*)::int as n
                  from calc group by 1 order by 2 desc limit 20) pcl) as por_cliente,

       (select coalesce(json_agg(json_build_object('texto', texto, 'n', n)), '[]'::json)
          from (select clase as texto, count(*)::int as n
                  from (select case
                          when desvio_min is null then 'No definido'
                          when desvio_min < -${MARGEN_MIN} then 'Adelantado'
                          when desvio_min >  ${MARGEN_MIN} then 'Atrasado'
                          else 'A tiempo' end as clase
                          from calc) z
                 group by 1) cu) as cumplimiento,

       -- Dónde estaba el móvil al marcar. Solo cuenta lo ya marcado: una
       -- parada pendiente no tiene por qué tener posición y la llenaría de
       -- «sin GPS» sin que eso signifique nada.
       (select coalesce(json_agg(json_build_object('texto', texto, 'n', n)), '[]'::json)
          from (select clase as texto, count(*)::int as n
                  from (select case
                          when metros_gps is null then 'Sin GPS'
                          when metros_gps <= ${RADIO_M} then 'En el punto'
                          else 'Lejos del punto' end as clase
                          from calc where estado_entrega <> 'pendiente') z
                 group by 1) ep) as en_el_punto,

       (select coalesce(json_agg(json_build_object(
                 'parada_id', id, 'codigo', codigo, 'nombre', nombre,
                 'fecha', fecha, 'conductor', conductor,
                 'hora_entrega', hora_entrega, 'desvio_min', desvio_min,
                 'estado_entrega', estado_entrega)), '[]'::json)
          from (select * from calc order by hora_entrega desc nulls last limit 25) u) as ultimas,

       (select coalesce(json_agg(json_build_object(
                 'id', id, 'nombre', nombre, 'lat', lat, 'lon', lon,
                 'estado', estado_entrega, 'hora', h, 'conductor', conductor)), '[]'::json)
          from calc) as puntos`,
    [desde, hasta, ZONA],
  );
}

export type InformeRutas = {
  rutas: number;
  paradas: number;
  prom_paradas: number | null;
  min_paradas: number | null;
  max_paradas: number | null;
  completadas: number;
  km: number | null;
  costo: number | null;
  min_en_ruta: number | null;
  primera_media: number | null;
  ultima_media: number | null;
  por_conductor: Cuenta[];
  por_vehiculo: Cuenta[];
  inicio_por_hora: number[];
  salida: Cuenta[];
  paradas_por_ruta: Cuenta[];
  ultimas: {
    ruta_id: string;
    despacho_id: string;
    fecha: string;
    indice: number;
    conductor: string | null;
    placa: string | null;
    paradas: number;
    salida_real: string | null;
    fin_real: string | null;
  }[];
};

export async function informeRutas(desde: string, hasta: string) {
  const yo = await idSesion();
  return unaFila<InformeRutas>(
    yo,
    `with ru as (
       select r.id, r.indice, r.km, r.costo, r.estado, r.salida_real, r.fin_real,
              r.salida_prog, d.fecha, d.id as despacho_id,
              cond.nombre as conductor, v.placa,
              (select count(*) from paradas p where p.ruta_id = r.id)::int as paradas,
              (select min(p.hora_entrega) from paradas p where p.ruta_id = r.id) as primera,
              (select max(p.hora_entrega) from paradas p where p.ruta_id = r.id) as ultima
         from rutas r
         join despachos d on d.id = r.despacho_id
         left join perfiles cond on cond.id = r.conductor_id
         left join vehiculos v   on v.id = r.vehiculo_id
        where d.fecha between $1 and $2 and not r.sin_asignar
     )
     select
       (select count(*) from ru)::int as rutas,
       (select coalesce(sum(paradas), 0) from ru)::int as paradas,
       (select round(avg(paradas), 1) from ru)::numeric as prom_paradas,
       (select min(paradas) from ru)::int as min_paradas,
       (select max(paradas) from ru)::int as max_paradas,
       (select count(*) from ru where estado = 'completada')::int as completadas,
       (select round(sum(km), 1) from ru)::numeric as km,
       (select round(sum(costo), 2) from ru)::numeric as costo,

       -- Solo las duraciones que tienen sentido. Una ruta cuyo fin precede a
       -- su salida tiene un reloj mal puesto o una marca corregida a mano, y
       -- promediarla arrastra el número de todas las demás.
       (select round(avg(extract(epoch from (fin_real - salida_real)) / 60))
          from ru where fin_real > salida_real)::int as min_en_ruta,

       -- La hora media de la primera y la última entrega, en minutos desde
       -- medianoche: promediar horas con vuelta de día daría disparates.
       (select round(avg(extract(hour from (primera at time zone $3)) * 60
                       + extract(minute from (primera at time zone $3))))
          from ru where primera is not null)::int as primera_media,
       (select round(avg(extract(hour from (ultima at time zone $3)) * 60
                       + extract(minute from (ultima at time zone $3))))
          from ru where ultima is not null)::int as ultima_media,

       (select coalesce(json_agg(json_build_object('texto', texto, 'n', n)
                                 order by n desc), '[]'::json)
          from (select coalesce(conductor, 'Sin conductor') as texto, count(*)::int as n
                  from ru group by 1) pc) as por_conductor,

       (select coalesce(json_agg(json_build_object('texto', texto, 'n', n)
                                 order by n desc), '[]'::json)
          from (select coalesce(placa, 'Sin vehículo') as texto, count(*)::int as n
                  from ru group by 1) pv) as por_vehiculo,

       (select coalesce(json_agg(n order by h), '[]'::json)
          from (select g.h,
                  (select count(*) from ru
                    where extract(hour from (salida_real at time zone $3))::int = g.h)::int as n
                  from generate_series(0, 23) as g(h)) ih) as inicio_por_hora,

       -- Puntualidad de la salida del centro. No se puede decir desde dónde
       -- salió —el evento de inicio no guarda posición— pero sí cuándo.
       (select coalesce(json_agg(json_build_object('texto', texto, 'n', n)), '[]'::json)
          from (select clase as texto, count(*)::int as n
                  from (select case
                          when salida_real is null or salida_prog is null then 'Sin referencia'
                          when extract(epoch from (salida_real
                               - ((fecha + salida_prog) at time zone $3))) / 60 < -${MARGEN_MIN}
                            then 'Salió antes'
                          when extract(epoch from (salida_real
                               - ((fecha + salida_prog) at time zone $3))) / 60 > ${MARGEN_MIN}
                            then 'Salió tarde'
                          else 'A la hora' end as clase
                          from ru) z
                 group by 1) sa) as salida,

       (select coalesce(json_agg(json_build_object('texto', texto, 'n', n)
                                 order by texto), '[]'::json)
          from (select paradas::text as texto, count(*)::int as n
                  from ru group by 1) pr) as paradas_por_ruta,

       (select coalesce(json_agg(json_build_object(
                 'ruta_id', id, 'despacho_id', despacho_id, 'fecha', fecha,
                 'indice', indice, 'conductor', conductor, 'placa', placa,
                 'paradas', paradas, 'salida_real', salida_real,
                 'fin_real', fin_real)), '[]'::json)
          from (select * from ru order by fecha desc, indice limit 25) u) as ultimas`,
    [desde, hasta, ZONA],
  );
}

export type InformeArticulos = {
  total: number;
  entregados: number;
  rechazados: number;
  pendientes: number;
  lineas: number;
  valor: number | null;
  top: Cuenta[];
  peores: Cuenta[];
};

export async function informeArticulos(desde: string, hasta: string) {
  const yo = await idSesion();
  return unaFila<InformeArticulos>(
    yo,
    `with it as (
       select i.nombre, i.cantidad, i.entregados, i.precio, p.estado_entrega
         from items i
         join paradas p    on p.id = i.parada_id
         join rutas r      on r.id = p.ruta_id and not r.sin_asignar
         join despachos d  on d.id = r.despacho_id
        where d.fecha between $1 and $2
     )
     select
       (select coalesce(sum(cantidad), 0) from it)::int as total,
       (select count(*) from it)::int as lineas,
       (select coalesce(sum(entregados), 0) from it)::int as entregados,
       -- Rechazado es lo que salió y no se quedó: solo cuenta sobre paradas
       -- ya marcadas, porque lo pendiente todavía puede entregarse.
       (select coalesce(sum(cantidad - coalesce(entregados, 0)), 0)
          from it where estado_entrega <> 'pendiente')::int as rechazados,
       (select coalesce(sum(cantidad), 0)
          from it where estado_entrega = 'pendiente')::int as pendientes,
       (select round(sum(coalesce(entregados, 0) * precio), 2)
          from it where precio is not null)::numeric as valor,

       (select coalesce(json_agg(json_build_object('texto', nombre, 'n', n)
                                 order by n desc), '[]'::json)
          from (select nombre, sum(cantidad)::int as n
                  from it group by 1 order by 2 desc limit 20) t) as top,

       -- Lo que más se queda sin entregar. Un artículo que falla siempre es
       -- un problema de embalaje o de stock, no del conductor que lo llevaba.
       (select coalesce(json_agg(json_build_object('texto', nombre, 'n', n)
                                 order by n desc), '[]'::json)
          from (select nombre, sum(cantidad - coalesce(entregados, 0))::int as n
                  from it where estado_entrega <> 'pendiente'
                 group by 1 having sum(cantidad - coalesce(entregados, 0)) > 0
                 order by 2 desc limit 10) pe) as peores`,
    [desde, hasta],
  );
}
