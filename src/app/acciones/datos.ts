"use server";

import { auth } from "@/auth";
import { comoUsuario, unaFila } from "@/lib/db";

/**
 * Escrituras sueltas que antes hacían los componentes del navegador con
 * `supabase.from(...)`.
 *
 * Cada una es una acción concreta en vez de un constructor de consultas
 * genérico: desde el navegador solo se puede pedir lo que está escrito aquí,
 * con las columnas que están aquí. Qué filas alcanza cada una lo sigue
 * decidiendo el RLS, que corre con la identidad de quien llama.
 */
async function idSesion() {
  const sesion = await auth();
  if (!sesion?.user) throw new Error("Tu sesión caducó. Vuelve a entrar.");
  return sesion.user.id;
}

/** Cambia el rol o el estado de un miembro del equipo. */
export async function actualizarPerfil(
  id: string,
  cambios: { rol?: "admin" | "planificador" | "conductor"; activo?: boolean },
) {
  const yo = await idSesion();
  await comoUsuario(
    yo,
    `update perfiles
        set rol = coalesce($2, rol),
            activo = coalesce($3, activo)
      where id = $1`,
    [id, cambios.rol ?? null, cambios.activo ?? null],
  );
}

/** Crea una zona nueva, o reemplaza el trazo de una existente. */
export async function guardarZona(
  zona: { id?: string | null; nombre: string; color: string; poligono: [number, number][] },
) {
  const yo = await idSesion();

  if (zona.id) {
    await comoUsuario(
      yo,
      `update zonas set nombre = $2, color = $3, poligono = $4,
              actualizado_en = now()
        where id = $1`,
      [zona.id, zona.nombre, zona.color, JSON.stringify(zona.poligono)],
    );
    return zona.id;
  }

  // `org_id` sale de la propia base y no del navegador: así no se puede
  // colar una zona en la empresa de otro aunque se manipule la petición.
  const filas = await comoUsuario<{ id: string }>(
    yo,
    `insert into zonas (org_id, nombre, color, poligono, creado_por)
     select private.mi_org(), $1, $2, $3, $4
     returning id`,
    [zona.nombre, zona.color, JSON.stringify(zona.poligono), yo],
  );
  return filas[0]?.id ?? null;
}

export async function renombrarZona(id: string, nombre: string) {
  const yo = await idSesion();
  await comoUsuario(
    yo,
    "update zonas set nombre = $2, actualizado_en = now() where id = $1",
    [id, nombre],
  );
}

export async function borrarZona(id: string) {
  const yo = await idSesion();
  await comoUsuario(yo, "delete from zonas where id = $1", [id]);
}

/** Nota interna del dueño del servicio sobre una empresa cliente. */
export async function guardarNotaEmpresa(orgId: string, nota: string | null) {
  const yo = await idSesion();
  await comoUsuario(yo, "update organizaciones set nota = $2 where id = $1", [
    orgId,
    nota,
  ]);
}

/**
 * La hora del negocio.
 *
 * Las horas planificadas (`eta`, `salida_prog`) se guardan como hora local
 * sin zona, y los hechos (`hora_entrega`, `ocurrido_en`) con zona. Para
 * restar una de otra hay que traer el instante a la misma hora local, y la
 * operación es de Lima. Si algún día hay clientes en otro huso, esto pasa a
 * ser una columna de la organización.
 */
const ZONA = "America/Lima";

export type RutaEnCalle = {
  ruta_id: string;
  indice: number;
  despacho_id: string;
  despacho: string | null;
  fecha: string;
  conductor: string | null;
  vehiculo: string | null;
  placa: string | null;
  salida_prog: string | null;
  salida_real: string | null;
  fin_real: string | null;
  km_plan: number | null;
  asignadas: number;
  gestionadas: number;
  entregadas: number;
  fallidas: number;
  /** Lo último que marcó, para saber si sigue vivo o lleva dos horas callado. */
  ultima_marca: string | null;
  /** Minutos de desfase medio contra la hora estimada. Negativo es adelanto. */
  desvio_min: number | null;
  /** Dónde estaba el móvil la última vez que marcó. */
  ultima_lat: number | null;
  ultima_lon: number | null;
  cd_lat: number | null;
  cd_lon: number | null;
  bateria: number | null;
  red: string | null;
};

/**
 * Las rutas de un día, con lo que se sabe de cada una ahora mismo.
 *
 * Todo sale de lo que ya se registra: no hace falta que el móvil mande su
 * posición cada minuto. La última posición conocida es el GPS que capturó al
 * marcar la última parada, y el silencio se mide desde su último evento.
 */
export async function estadoFlota(fecha?: string) {
  const yo = await idSesion();
  return comoUsuario<RutaEnCalle>(
    yo,
    `with marcas as (
       select p.ruta_id,
              count(*) filter (where p.estado_entrega <> 'pendiente') as gestionadas,
              count(*) filter (where p.estado_entrega = 'entregado')   as entregadas,
              count(*) filter (where p.estado_entrega = 'fallido')     as fallidas,
              count(*)                                                 as asignadas,
              -- El desvio se ancla al dia del despacho en vez de restar dos
              -- relojes sueltos: asi una entrega pasada la medianoche sale
              -- como «veinte minutos tarde» y no como «menos veintitres
              -- horas».
              avg(extract(epoch from
                    (p.hora_entrega - ((d2.fecha + p.eta) at time zone $2))) / 60)
                filter (where p.hora_entrega is not null and p.eta is not null)
                as desvio_min
         from paradas p
         join rutas r2 on r2.id = p.ruta_id
         join despachos d2 on d2.id = r2.despacho_id
        group by p.ruta_id),
     -- Lo último que se supo, en tres preguntas distintas. La más reciente
     -- sirve para medir el silencio, pero puede ser el arranque de la ruta,
     -- que no lleva ni posición ni batería: esas se buscan en el último
     -- evento que sí las traía.
     ultimo as (
       select distinct on (e.ruta_id) e.ruta_id, e.ocurrido_en
         from eventos e
        order by e.ruta_id, e.ocurrido_en desc, e.id desc),
     donde as (
       select distinct on (e.ruta_id)
              e.ruta_id,
              coalesce(p.gps_lat, p.lat) as lat,
              coalesce(p.gps_lon, p.lon) as lon
         from eventos e
         join paradas p on p.id = e.parada_id
        order by e.ruta_id, e.ocurrido_en desc, e.id desc),
     movil as (
       select distinct on (e.ruta_id) e.ruta_id, e.datos
         from eventos e
        where e.datos ? 'bateria' or e.datos ? 'red'
        order by e.ruta_id, e.ocurrido_en desc, e.id desc)
     select r.id as ruta_id, r.indice, r.despacho_id, d.nombre as despacho,
            d.fecha, c.nombre as conductor,
            v.nombre as vehiculo, v.placa,
            r.salida_prog, r.salida_real, r.fin_real, r.km as km_plan,
            coalesce(m.asignadas, 0)   as asignadas,
            coalesce(m.gestionadas, 0) as gestionadas,
            coalesce(m.entregadas, 0)  as entregadas,
            coalesce(m.fallidas, 0)    as fallidas,
            u.ocurrido_en as ultima_marca,
            round(m.desvio_min)::int as desvio_min,
            w.lat as ultima_lat, w.lon as ultima_lon,
            d.cd_lat, d.cd_lon,
            (t.datos->>'bateria')::int as bateria,
            t.datos->>'red' as red
       from rutas r
       join despachos d on d.id = r.despacho_id
       left join perfiles c on c.id = r.conductor_id
       left join vehiculos v on v.id = r.vehiculo_id
       left join marcas m on m.ruta_id = r.id
       left join ultimo u on u.ruta_id = r.id
       left join donde  w on w.ruta_id = r.id
       left join movil  t on t.ruta_id = r.id
      where not r.sin_asignar and d.fecha = coalesce($1::date, private.hoy())
      order by r.salida_real desc nulls last, d.creado_en desc, r.indice`,
    [fecha ?? null, ZONA],
  );
}

export type ParadaConDesvio = {
  id: string;
  orden: number;
  nombre: string | null;
  distrito: string | null;
  lat: number;
  lon: number;
  bultos: number;
  estado_entrega: string;
  eta: string | null;
  hora_entrega: string | null;
  motivo: string | null;
  /** Minutos de diferencia entre la hora real y la estimada. */
  desvio_min: number | null;
};

/** Las paradas de una ruta con su hora real al lado de la estimada. */
export async function paradasDeRuta(rutaId: string) {
  const yo = await idSesion();
  return comoUsuario<ParadaConDesvio>(
    yo,
    `select p.id, p.orden, p.nombre, p.distrito, p.lat, p.lon, p.bultos,
            p.estado_entrega, p.eta, p.hora_entrega, p.motivo,
            round(extract(epoch from
              (p.hora_entrega - ((d.fecha + p.eta) at time zone $2))) / 60)::int
              as desvio_min
       from paradas p
       join rutas r on r.id = p.ruta_id
       join despachos d on d.id = r.despacho_id
      where p.ruta_id = $1
      order by p.orden`,
    [rutaId, ZONA],
  );
}

/** Un paso de la historia de una ruta o de una de sus paradas. */
export type Evento = {
  id: number;
  ruta_indice: number;
  parada_id: string | null;
  parada: string | null;
  orden: number | null;
  tipo:
    | "ruta_iniciada"
    | "ruta_terminada"
    | "entregado"
    | "parcial"
    | "fallido"
    | "reprogramado"
    | "pendiente";
  ocurrido_en: string;
  autor: string | null;
  datos: Record<string, unknown>;
};

/**
 * Todo lo que ha pasado en un despacho, en orden.
 *
 * Es lo que alimenta la franja horaria de la torre: con solo la hora de
 * entrega de cada parada se sabe cuánto se avanzó, pero no cuándo, y el
 * cuándo es lo que delata dónde se atascó la ruta.
 *
 * La bandeja queda fuera, igual que en el resto de la torre: sus puntos no
 * salieron a reparto.
 */
export async function lineaTiempoDespacho(despachoId: string) {
  const yo = await idSesion();
  return comoUsuario<Evento>(
    yo,
    `select e.id, r.indice as ruta_indice, e.parada_id, p.nombre as parada,
            p.orden, e.tipo, e.ocurrido_en, a.nombre as autor, e.datos
       from eventos e
       join rutas r on r.id = e.ruta_id
       left join paradas p on p.id = e.parada_id
       left join perfiles a on a.id = e.autor
      where r.despacho_id = $1 and not r.sin_asignar
      order by e.ocurrido_en, e.id`,
    [despachoId],
  );
}

export type ParadaFicha = {
  id: string;
  codigo: string | null;
  nombre: string | null;
  distrito: string | null;
  lat: number;
  lon: number;
  bultos: number;
  bultos_entregados: number | null;
  prioridad: number;
  eta: string | null;
  ventana_ini: string | null;
  ventana_fin: string | null;
  estado_entrega: string;
  hora_entrega: string | null;
  motivo: string | null;
  observaciones: string | null;
  recibe: string | null;
  foto_url: string | null;
  gps_lat: number | null;
  gps_lon: number | null;
  orden: number;
  ruta_id: string;
  ruta_indice: number;
  conductor: string | null;
  placa: string | null;
  salida_real: string | null;
  despacho_id: string;
  despacho: string | null;
  fecha: string;
  archivo: string | null;
  cd_lat: number | null;
  cd_lon: number | null;
  /** Cuántas veces se marcó. Más de una es un reintento o una corrección. */
  intentos: number;
  /** Minutos entre la hora real y la estimada. Negativo es adelanto. */
  desvio_min: number | null;
};

/** Todo lo que se sabe de una parada, para su ficha. */
export async function fichaParada(paradaId: string) {
  const yo = await idSesion();
  return unaFila<ParadaFicha>(
    yo,
    `select p.id, p.codigo, p.nombre, p.distrito, p.lat, p.lon, p.bultos,
            p.bultos_entregados, p.prioridad, p.eta, p.ventana_ini,
            p.ventana_fin, p.estado_entrega, p.hora_entrega, p.motivo,
            p.observaciones, p.recibe, p.foto_url, p.gps_lat, p.gps_lon,
            p.orden, p.ruta_id, r.indice as ruta_indice,
            c.nombre as conductor, v.placa, r.salida_real,
            d.id as despacho_id, d.nombre as despacho, d.fecha,
            i.nombre_archivo as archivo, d.cd_lat, d.cd_lon,
            (select count(*) from eventos e
              where e.parada_id = p.id
                and e.tipo not in ('ruta_iniciada','ruta_terminada')) as intentos,
            round(extract(epoch from
              (p.hora_entrega - ((d.fecha + p.eta) at time zone $2))) / 60)::int
              as desvio_min
       from paradas p
       join rutas r on r.id = p.ruta_id
       join despachos d on d.id = r.despacho_id
       left join perfiles c on c.id = r.conductor_id
       left join vehiculos v on v.id = r.vehiculo_id
       left join importaciones i on i.id = d.importacion_id
      where p.id = $1`,
    [paradaId, ZONA],
  );
}

export type Comentario = {
  id: number;
  texto: string;
  autor: string | null;
  creado_en: string;
  mio: boolean;
};

/**
 * Las notas que el equipo deja sobre una parada.
 *
 * No hay distinción entre nota pública y privada, que es lo que hace el
 * sistema de referencia: allí la pública la ve el destinatario en su portal
 * de seguimiento. Aquí no hay tal portal, así que todas son internas y
 * fingir la diferencia solo confundiría.
 */
export async function comentarios(paradaId: string) {
  const yo = await idSesion();
  return comoUsuario<Comentario>(
    yo,
    `select c.id, c.texto, a.nombre as autor, c.creado_en,
            (c.autor = $2) as mio
       from comentarios c
       left join perfiles a on a.id = c.autor
      where c.parada_id = $1
      order by c.creado_en desc, c.id desc`,
    [paradaId, yo],
  );
}

export async function comentar(paradaId: string, texto: string) {
  const yo = await idSesion();
  const limpio = texto.trim();
  if (!limpio) throw new Error("El comentario está vacío.");

  // `org_id` sale de la propia parada y no del navegador; si el RLS no deja
  // ver esa parada, el insert no encuentra nada que copiar y no escribe.
  const filas = await comoUsuario<{ id: number }>(
    yo,
    `insert into comentarios (org_id, parada_id, texto, autor)
     select p.org_id, p.id, $2, $3 from paradas p where p.id = $1
     returning id`,
    [paradaId, limpio.slice(0, 2000), yo],
  );
  if (!filas.length) throw new Error("Esa parada no es tuya.");
}

/** Solo quien lo escribió puede retirarlo. Lo impone también el RLS. */
export async function borrarComentario(id: number) {
  const yo = await idSesion();
  await comoUsuario(yo, "delete from comentarios where id = $1", [id]);
}

export type Importacion = {
  id: string;
  nombre_archivo: string;
  filas: number | null;
  creado_en: string;
  autor: string | null;
  /** Cuántos despachos salieron de este archivo. Cero es un archivo huérfano. */
  despachos: number;
  despacho_id: string | null;
  despacho: string | null;
  estado: string | null;
};

/**
 * Qué se ha subido y en qué acabó.
 *
 * La tabla `importaciones` existía desde el principio y no había ninguna
 * pantalla que la mirase: no se podía responder quién subió el archivo de
 * ayer ni por qué un archivo cargado no llegó a rutearse nunca.
 */
export async function importaciones(limite = 60) {
  const yo = await idSesion();
  return comoUsuario<Importacion>(
    yo,
    `select i.id, i.nombre_archivo, i.filas, i.creado_en, a.nombre as autor,
            (select count(*) from despachos d where d.importacion_id = i.id) as despachos,
            u.id as despacho_id, u.nombre as despacho, u.estado
       from importaciones i
       left join perfiles a on a.id = i.creado_por
       left join lateral (
         select d.id, d.nombre, d.estado from despachos d
          where d.importacion_id = i.id
          order by d.creado_en desc limit 1) u on true
      order by i.creado_en desc
      limit $1`,
    [limite],
  );
}

export type Alerta = {
  clave: string;
  tipo: "retraso" | "silencio" | "sin_salir" | "jornada" | "bateria" | "fallida";
  severidad: "alta" | "media";
  ruta_id: string;
  indice: number;
  despacho_id: string;
  despacho: string | null;
  conductor: string | null;
  placa: string | null;
  parada_id: string | null;
  parada: string | null;
  detalle: string;
  minutos: number | null;
  desde: string | null;
  atendida: boolean;
  atendida_por: string | null;
  atendida_en: string | null;
};

/**
 * Lo que requiere una decisión ahora mismo.
 *
 * Las alertas no se guardan: se calculan de los eventos y las paradas cada
 * vez que se preguntan. Una alerta guardada hay que generarla con un proceso
 * aparte, y en cuanto ese proceso falla la pantalla miente en silencio. Así
 * no puede desincronizarse de los datos, al precio de una consulta.
 *
 * Lo único que sí se guarda es que alguien la atendió.
 */
export async function alertas(fecha?: string) {
  const yo = await idSesion();
  return comoUsuario<Alerta>(
    yo,
    "select * from public.alertas($1::date)",
    [fecha ?? null],
  );
}

/**
 * Da una alerta por atendida, o la devuelve a la lista.
 *
 * Atenderla la calla hasta que vuelva a pasar algo en esa ruta: si el
 * conductor marca otra vez y la condición sigue, el aviso reaparece. Así
 * «ya llamé al chofer» no entierra el problema para siempre.
 */
export async function atenderAlerta(
  clave: string,
  rutaId: string,
  atender: boolean,
  nota?: string,
) {
  const yo = await idSesion();

  if (!atender) {
    await comoUsuario(yo, "delete from alertas_atendidas where clave = $1", [clave]);
    return;
  }

  // `org_id` sale de la base y no del navegador, igual que en las zonas.
  await comoUsuario(
    yo,
    `insert into alertas_atendidas (org_id, ruta_id, clave, atendida_por, nota)
     select private.mi_org(), $1, $2, $3, $4
     on conflict (org_id, clave) do update
       set atendida_en = now(), atendida_por = excluded.atendida_por,
           nota = excluded.nota`,
    [rutaId, clave, yo, nota ?? null],
  );
}

/**
 * Todo lo que ha pasado en un día, de todas las rutas a la vez.
 *
 * Es lo que alimenta la pantalla de Actividad: la torre mira un despacho y
 * esto mira el turno entero, que es como se trabaja por la mañana cuando hay
 * cuatro archivos distintos en la calle.
 */
export async function eventosDelDia(fecha?: string) {
  const yo = await idSesion();
  return comoUsuario<Evento & { ruta_id: string }>(
    yo,
    `select e.id, e.ruta_id, r.indice as ruta_indice, e.parada_id,
            p.nombre as parada, p.orden, e.tipo, e.ocurrido_en,
            a.nombre as autor, e.datos
       from eventos e
       join rutas r on r.id = e.ruta_id
       join despachos d on d.id = r.despacho_id
       left join paradas p on p.id = e.parada_id
       left join perfiles a on a.id = e.autor
      where not r.sin_asignar and d.fecha = coalesce($1::date, private.hoy())
      order by e.ocurrido_en, e.id`,
    [fecha ?? null],
  );
}

/** La historia de una sola parada, de lo más reciente a lo más antiguo. */
export async function historialParada(paradaId: string) {
  const yo = await idSesion();
  return comoUsuario<Evento>(
    yo,
    `select e.id, r.indice as ruta_indice, e.parada_id, p.nombre as parada,
            p.orden, e.tipo, e.ocurrido_en, a.nombre as autor, e.datos
       from eventos e
       join rutas r on r.id = e.ruta_id
       left join paradas p on p.id = e.parada_id
       left join perfiles a on a.id = e.autor
      where e.parada_id = $1
      order by e.ocurrido_en desc, e.id desc`,
    [paradaId],
  );
}

export type ParadaSeguimiento = {
  id: string;
  orden: number;
  codigo: string | null;
  nombre: string | null;
  distrito: string | null;
  lat: number;
  lon: number;
  bultos: number;
  bultos_entregados: number | null;
  prioridad: number;
  eta: string | null;
  estado_entrega: string;
  hora_entrega: string | null;
  motivo: string | null;
  foto_url: string | null;
  observaciones: string | null;
  recibe: string | null;
  ruta_indice: number;
};

/**
 * Las paradas de un despacho, para el refresco de la torre de control.
 *
 * La bandeja se excluye: sus puntos no salieron a reparto y contarlos
 * hundiría el porcentaje de avance sin que nadie pueda hacer nada.
 */
export async function paradasDeDespacho(despachoId: string) {
  const yo = await idSesion();
  return comoUsuario<ParadaSeguimiento>(
    yo,
    `select p.id, p.orden, p.codigo, p.nombre, p.distrito, p.lat, p.lon,
            p.bultos, p.bultos_entregados, p.prioridad,
            p.eta, p.estado_entrega, p.hora_entrega, p.motivo, p.foto_url,
            p.observaciones, p.recibe, r.indice as ruta_indice
       from paradas p
       join rutas r on r.id = p.ruta_id
      where r.despacho_id = $1 and not r.sin_asignar
      order by r.indice, p.orden`,
    [despachoId],
  );
}
