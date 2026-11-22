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
            -- El centro de esta ruta: su base, si sale de una.
            coalesce(r.base_lat, d.cd_lat) as cd_lat,
            coalesce(r.base_lon, d.cd_lon) as cd_lon,
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
  codigo: string | null;
  nombre: string | null;
  subestado: string | null;
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
    `select p.id, p.orden, p.codigo, p.nombre, p.subestado, p.distrito,
            p.lat, p.lon, p.bultos,
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

/** El recorrido dibujado de una ruta, para pintarlo en un mapa suelto. */
export async function geometriaDeRuta(rutaId: string) {
  const yo = await idSesion();
  const fila = await unaFila<{ geometria: number[][] | null }>(
    yo,
    "select geometria from rutas where id = $1",
    [rutaId],
  );
  return fila?.geometria ?? null;
}

/** Un paso de la historia de una ruta o de una de sus paradas. */
export type Evento = {
  id: number;
  ruta_indice: number;
  parada_id: string | null;
  parada: string | null;
  /** El código de la orden. Solo lo trae la consulta del día entero. */
  codigo?: string | null;
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

export type Orden = {
  id: string;
  codigo: string | null;
  nombre: string | null;
  distrito: string | null;
  estado_entrega: string;
  subestado: string | null;
  motivo: string | null;
  bultos: number;
  bultos_entregados: number | null;
  eta: string | null;
  hora_entrega: string | null;
  desvio_min: number | null;
  ruta_indice: number | null;
  conductor: string | null;
  placa: string | null;
  despacho_id: string;
  despacho: string | null;
  fecha: string;
  en_bandeja: boolean;
  intentos: number;
  /** Cerrada: no admite cambios hasta que un administrador la abra. */
  bloqueada: boolean;
};

export type FiltroOrdenes = {
  desde?: string;
  hasta?: string;
  texto?: string;
  estado?: string;
  conductor?: string;
};

/**
 * Las paradas de un rango de días, todas juntas y filtrables.
 *
 * Hasta ahora una parada solo existía dentro de su despacho: para encontrar
 * un pedido había que acordarse de en qué archivo venía. Esta es la vista
 * por la que se busca cuando llama un cliente y solo dice su dirección.
 */
export async function ordenes(f: FiltroOrdenes = {}, limite = 500) {
  const yo = await idSesion();
  return comoUsuario<Orden>(
    yo,
    `select p.id, p.codigo, p.nombre, p.distrito, p.estado_entrega, p.motivo,
            p.bultos, p.bultos_entregados, p.eta, p.hora_entrega,
            round(extract(epoch from
              (p.hora_entrega - ((d.fecha + p.eta) at time zone $6))) / 60)::int
              as desvio_min,
            case when r.sin_asignar then null else r.indice end as ruta_indice,
            c.nombre as conductor, v.placa,
            d.id as despacho_id, d.nombre as despacho, d.fecha,
            r.sin_asignar as en_bandeja, p.bloqueada,
            (select count(*) from eventos e
              where e.parada_id = p.id
                and e.tipo not in ('ruta_iniciada','ruta_terminada')) as intentos
       from paradas p
       join rutas r on r.id = p.ruta_id
       join despachos d on d.id = r.despacho_id
       left join perfiles c on c.id = r.conductor_id
       left join vehiculos v on v.id = r.vehiculo_id
      where d.fecha >= coalesce($1::date, private.hoy() - 7)
        and d.fecha <= coalesce($2::date, private.hoy())
        and ($3::text is null or
             p.codigo ilike '%' || $3 || '%' or
             p.nombre ilike '%' || $3 || '%' or
             p.distrito ilike '%' || $3 || '%' or
             v.placa ilike '%' || $3 || '%' or
             d.nombre ilike '%' || $3 || '%')
        and ($4::text is null or p.estado_entrega = $4)
        and ($5::text is null or c.nombre = $5)
      order by d.fecha desc, r.indice, p.orden
      limit $7`,
    [
      f.desde ?? null,
      f.hasta ?? null,
      f.texto?.trim() || null,
      f.estado || null,
      f.conductor || null,
      ZONA,
      limite,
    ],
  );
}

/** Los conductores que aparecen en el periodo, para el desplegable. */
export async function conductoresConRuta(desde?: string, hasta?: string) {
  const yo = await idSesion();
  const filas = await comoUsuario<{ nombre: string }>(
    yo,
    `select distinct c.nombre
       from rutas r
       join despachos d on d.id = r.despacho_id
       join perfiles c on c.id = r.conductor_id
      where d.fecha >= coalesce($1::date, private.hoy() - 7)
        and d.fecha <= coalesce($2::date, private.hoy())
        and c.nombre is not null
      order by 1`,
    [desde ?? null, hasta ?? null],
  );
  return filas.map((f) => f.nombre);
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
  subestado: string | null;
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
  /** Las columnas del archivo del cliente que la aplicación no interpreta. */
  extra: Record<string, string>;
  /** Cerrada: no admite más marcas hasta que un administrador la abra. */
  bloqueada: boolean;
  /** La ficha del cliente con ese código, si existe: de ahí salen el
   *  teléfono y la dirección escrita, que la parada no guarda. */
  cliente_id: string | null;
  cliente_telefono: string | null;
  cliente_direccion: string | null;
  /** Cuándo se cargó el archivo que trajo esta orden, y quién lo cargó. */
  ingresado_en: string;
  ingresado_por: string | null;
};

/** Todo lo que se sabe de una parada, para su ficha. */
export async function fichaParada(paradaId: string) {
  const yo = await idSesion();
  return unaFila<ParadaFicha>(
    yo,
    `select p.id, p.codigo, p.nombre, p.distrito, p.lat, p.lon, p.bultos,
            p.bultos_entregados, p.prioridad, p.eta, p.ventana_ini,
            p.ventana_fin, p.estado_entrega, p.subestado, p.hora_entrega, p.motivo,
            p.observaciones, p.recibe, p.foto_url, p.gps_lat, p.gps_lon,
            p.orden, p.extra, p.bloqueada, p.ruta_id, r.indice as ruta_indice,
            c.nombre as conductor, v.placa, r.salida_real,
            d.id as despacho_id, d.nombre as despacho, d.fecha,
            i.nombre_archivo as archivo,
            coalesce(r.base_lat, d.cd_lat) as cd_lat,
            coalesce(r.base_lon, d.cd_lon) as cd_lon,
            cl.id as cliente_id, cl.telefono as cliente_telefono,
            cl.direccion as cliente_direccion,
            d.creado_en as ingresado_en, cr.nombre as ingresado_por,
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
       left join clientes cl on cl.org_id = p.org_id and cl.codigo = p.codigo
       left join perfiles cr on cr.id = d.creado_por
      where p.id = $1`,
    [paradaId, ZONA],
  );
}

export type Item = {
  id: number;
  codigo: string | null;
  nombre: string;
  cantidad: number;
  entregados: number | null;
  precio: number | null;
};

/** Los artículos de una parada, con lo que se entregó de cada uno. */
export async function itemsDeParada(paradaId: string) {
  const yo = await idSesion();
  return comoUsuario<Item>(
    yo,
    `select id, codigo, nombre, cantidad, entregados, precio
       from items where parada_id = $1 order by id`,
    [paradaId],
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

/**
 * El rol de quien está mirando.
 *
 * Lo piden las pantallas que esconden un botón según el rol. Se lee de la
 * base y no del token: si un administrador degrada a alguien, surte efecto en
 * la siguiente carga y no cuando caduque su sesión treinta días después.
 */
export async function miRol() {
  const yo = await idSesion();
  const fila = await unaFila<{ rol: "admin" | "planificador" | "conductor" }>(
    yo,
    "select rol from perfiles where id = $1",
    [yo],
  );
  return fila?.rol ?? "conductor";
}

/**
 * Cierra o reabre una parada.
 *
 * Quién puede hacer qué lo decide la función de la base, no esta llamada:
 * bloquear, cualquiera de la oficina; desbloquear, solo un administrador. El
 * cambio queda en la bitácora con nombre y hora, porque desbloquear es dar
 * permiso para reescribir un resultado que el cliente ya vio.
 */
export async function bloquearParada(paradaId: string, bloquear: boolean) {
  const yo = await idSesion();
  await comoUsuario(yo, "select bloquear_parada($1, $2)", [paradaId, bloquear]);
}

/**
 * Cambia los datos de una orden que todavía no se ha gestionado.
 *
 * Qué se puede y qué no lo decide la función de la base: una orden ya
 * marcada o bloqueada no se edita.
 */
export async function editarParada(cambios: {
  parada_id: string;
  nombre: string;
  distrito: string | null;
  bultos: number;
  prioridad: number;
  ventana_ini: string | null;
  ventana_fin: string | null;
}) {
  const yo = await idSesion();
  await comoUsuario(yo, "select editar_parada($1::jsonb)", [JSON.stringify(cambios)]);
}

/** Borra una orden pendiente. No hay vuelta atrás. */
export async function eliminarParada(paradaId: string) {
  const yo = await idSesion();
  await comoUsuario(yo, "select eliminar_parada($1)", [paradaId]);
}

export type Cambio = {
  id: number;
  tabla: string;
  registro_id: string;
  campo: string;
  antes: string | null;
  despues: string | null;
  autor: string | null;
  cuando: string;
  /** Para poder decir de qué parada o despacho se habla. */
  etiqueta: string | null;
};

/**
 * Qué se ha cambiado, campo por campo.
 *
 * Lo escribe un disparador de la base, no la aplicación: así queda
 * registrado cualquier cambio, venga de una pantalla, de una funcion o de
 * alguien conectado a la base a mano. Un registro que solo anota lo que la
 * aplicación quiere anotar no sirve para auditar.
 */
export async function bitacora(filtro: { texto?: string; desde?: string } = {}, limite = 300) {
  const yo = await idSesion();
  return comoUsuario<Cambio>(
    yo,
    `select c.id, c.tabla, c.registro_id, c.campo, c.antes, c.despues,
            a.nombre as autor, c.cuando,
            coalesce(p.nombre, d.nombre, pe.nombre,
                     case when c.tabla = 'rutas'
                          then 'R-' || lpad((r.indice + 1)::text, 2, '0') end) as etiqueta
       from cambios c
       left join perfiles a  on a.id = c.autor
       left join paradas p   on c.tabla = 'paradas'   and p.id = c.registro_id
       left join despachos d on c.tabla = 'despachos' and d.id = c.registro_id
       left join rutas r     on c.tabla = 'rutas'     and r.id = c.registro_id
       left join perfiles pe on c.tabla = 'perfiles'  and pe.id = c.registro_id
      where ($1::text is null or
             p.codigo ilike '%' || $1 || '%' or
             p.nombre ilike '%' || $1 || '%' or
             d.nombre ilike '%' || $1 || '%' or
             c.campo  ilike '%' || $1 || '%')
        and ($2::date is null or c.cuando >= $2::date)
      order by c.cuando desc, c.id desc
      limit $3`,
    [filtro.texto?.trim() || null, filtro.desde || null, limite],
  );
}

/** Los cambios de un solo registro, para su ficha. */
export async function cambiosDe(registroId: string) {
  const yo = await idSesion();
  return comoUsuario<Cambio>(
    yo,
    `select c.id, c.tabla, c.registro_id, c.campo, c.antes, c.despues,
            a.nombre as autor, c.cuando, null::text as etiqueta
       from cambios c
       left join perfiles a on a.id = c.autor
      where c.registro_id = $1
      order by c.cuando desc, c.id desc
      limit 100`,
    [registroId],
  );
}

export type Subestado = {
  id: number;
  estado: string;
  texto: string;
  orden: number;
  activo: boolean;
};

/**
 * Los motivos tipificados que configura cada empresa.
 *
 * El campo libre seguía existiendo y seguirá: hay cosas que no caben en una
 * lista. Pero sin lista no se puede contar cuántas entregas fallaron por
 * «local cerrado», porque cada conductor lo escribe distinto.
 */
export async function subestados(soloActivos = true) {
  const yo = await idSesion();
  return comoUsuario<Subestado>(
    yo,
    `select id, estado, texto, orden, activo
       from subestados
      where ($1::boolean is false or activo)
      order by estado, orden, texto`,
    [soloActivos],
  );
}

export async function guardarSubestado(s: {
  id?: number;
  estado: string;
  texto: string;
  orden?: number;
  activo?: boolean;
}) {
  const yo = await idSesion();
  const texto = s.texto.trim();
  if (!texto) throw new Error("Escribe el texto del motivo.");

  if (s.id) {
    await comoUsuario(
      yo,
      `update subestados set texto = $2, orden = coalesce($3, orden),
              activo = coalesce($4, activo)
        where id = $1`,
      [s.id, texto, s.orden ?? null, s.activo ?? null],
    );
    return;
  }

  // `org_id` sale de la base y no del navegador.
  await comoUsuario(
    yo,
    `insert into subestados (org_id, estado, texto, orden)
     select private.mi_org(), $1, $2, coalesce($3, 0)
     on conflict (org_id, estado, texto) do update set activo = true`,
    [s.estado, texto, s.orden ?? null],
  );
}

export async function borrarSubestado(id: number) {
  const yo = await idSesion();
  // No se borra: se desactiva. Las paradas ya marcadas con ese motivo
  // seguirían nombrándolo, y un informe de hace un mes dejaría de cuadrar.
  await comoUsuario(yo, "update subestados set activo = false where id = $1", [id]);
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
            p.nombre as parada, p.codigo, p.orden, e.tipo, e.ocurrido_en,
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

export type PendienteDia = {
  id: string;
  ruta_id: string;
  codigo: string | null;
  nombre: string | null;
  orden: number;
  /** La hora a la que estaba prevista, ya como instante. */
  previsto: string;
};

/**
 * Las órdenes del día que siguen sin gestionar, con su hora prevista.
 *
 * Son los círculos grises de Actividad: una ruta que no ha salido no tiene
 * ningún evento, y sin esto su franja quedaba vacía cuando lo que interesa
 * ver es justo lo que tiene por delante.
 */
export async function pendientesDelDia(fecha?: string) {
  const yo = await idSesion();
  return comoUsuario<PendienteDia>(
    yo,
    `select p.id, p.ruta_id, p.codigo, p.nombre, p.orden,
            ((d.fecha + p.eta) at time zone $2) as previsto
       from paradas p
       join rutas r on r.id = p.ruta_id
       join despachos d on d.id = r.despacho_id
      where not r.sin_asignar and d.fecha = coalesce($1::date, private.hoy())
        and p.estado_entrega = 'pendiente' and p.eta is not null
      order by p.ruta_id, p.orden
      limit 5000`,
    [fecha ?? null, ZONA],
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
