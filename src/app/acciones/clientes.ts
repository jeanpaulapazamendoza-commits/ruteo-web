"use server";

import { auth } from "@/auth";
import { comoUsuario, unaFila } from "@/lib/db";
import { ZONA } from "@/lib/horas";

/**
 * Los clientes y lo que les ha pasado.
 *
 * Hasta ahora el destinatario solo existía dentro del despacho del día: cada
 * parada guardaba su copia del nombre y las coordenadas, y nada más. Con eso
 * no se puede contestar a «¿cuántas veces le hemos fallado a este cliente?»,
 * que es la pregunta que llega por teléfono.
 *
 * La identidad es el `codigo` del archivo y no un identificador nuestro: es
 * lo único que viene en todos los archivos y lo único con lo que el cliente
 * se reconoce a sí mismo.
 */
async function idSesion() {
  const sesion = await auth();
  if (!sesion?.user) throw new Error("Tu sesión caducó. Vuelve a entrar.");
  return sesion.user.id;
}

export type ClienteFila = {
  id: string;
  codigo: string;
  nombre: string;
  direccion: string | null;
  distrito: string | null;
  telefono: string | null;
  email: string | null;
  contacto: string | null;
  recurrente: boolean;
  /** Cuántas paradas se le han hecho, en toda la historia. */
  ordenes: number;
  entregadas: number;
  fallidas: number;
  parciales: number;
  /** Última vez que se le entregó algo. */
  ultima: string | null;
};

/**
 * Todos los clientes con su historial resumido.
 *
 * El recuento sale de `paradas` y no de un contador guardado en la ficha: un
 * contador hay que mantenerlo, y el día que una corrección no lo actualice la
 * pantalla miente sin que nadie se entere.
 */
export async function clientes() {
  const yo = await idSesion();
  return comoUsuario<ClienteFila>(
    yo,
    `select c.id, c.codigo, c.nombre, c.direccion, c.distrito, c.telefono,
            c.email, c.contacto, c.recurrente,
            count(p.id)::int as ordenes,
            count(*) filter (where p.estado_entrega = 'entregado')::int as entregadas,
            count(*) filter (where p.estado_entrega = 'fallido')::int as fallidas,
            count(*) filter (where p.estado_entrega = 'parcial')::int as parciales,
            max(p.hora_entrega) as ultima
       from clientes c
       left join paradas p on p.org_id = c.org_id and p.codigo = c.codigo
      group by c.id
      order by c.nombre`,
  );
}

export type ClienteFicha = ClienteFila & {
  lat: number | null;
  lon: number | null;
  notas: string | null;
  /** Minutos de desvío medio contra la hora estimada. Negativo es adelanto. */
  desvio_medio: number | null;
  bultos: number;
};

export async function fichaCliente(id: string) {
  const yo = await idSesion();
  return unaFila<ClienteFicha>(
    yo,
    `select c.id, c.codigo, c.nombre, c.direccion, c.distrito, c.telefono,
            c.email, c.contacto, c.recurrente, c.lat, c.lon, c.notas,
            count(p.id)::int as ordenes,
            count(*) filter (where p.estado_entrega = 'entregado')::int as entregadas,
            count(*) filter (where p.estado_entrega = 'fallido')::int as fallidas,
            count(*) filter (where p.estado_entrega = 'parcial')::int as parciales,
            coalesce(sum(p.bultos), 0)::int as bultos,
            max(p.hora_entrega) as ultima,
            round(avg(extract(epoch from
              (p.hora_entrega - ((d.fecha + p.eta) at time zone $2))) / 60))::int
              as desvio_medio
       from clientes c
       left join paradas p   on p.org_id = c.org_id and p.codigo = c.codigo
       left join rutas r     on r.id = p.ruta_id
       left join despachos d on d.id = r.despacho_id
      where c.id = $1
      group by c.id`,
    [id, ZONA],
  );
}

export type EntregaCliente = {
  parada_id: string;
  despacho_id: string;
  despacho: string | null;
  fecha: string;
  ruta_indice: number | null;
  conductor: string | null;
  bultos: number;
  eta: string | null;
  hora_entrega: string | null;
  estado_entrega: string;
  subestado: string | null;
  motivo: string | null;
  desvio_min: number | null;
};

/** Todo lo que se le ha repartido a un cliente, lo último primero. */
export async function historialCliente(id: string, limite = 300) {
  const yo = await idSesion();
  return comoUsuario<EntregaCliente>(
    yo,
    `select p.id as parada_id, d.id as despacho_id, d.nombre as despacho,
            d.fecha, r.indice as ruta_indice, cond.nombre as conductor,
            p.bultos, p.eta, p.hora_entrega, p.estado_entrega, p.subestado,
            p.motivo,
            round(extract(epoch from
              (p.hora_entrega - ((d.fecha + p.eta) at time zone $2))) / 60)::int
              as desvio_min
       from clientes c
       join paradas p    on p.org_id = c.org_id and p.codigo = c.codigo
       join rutas r      on r.id = p.ruta_id
       join despachos d  on d.id = r.despacho_id
       left join perfiles cond on cond.id = r.conductor_id
      where c.id = $1
      order by d.fecha desc, p.hora_entrega desc nulls last
      limit $3`,
    [id, ZONA, limite],
  );
}

/**
 * Guarda lo que se sabe del cliente y el archivo no trae.
 *
 * El nombre, la dirección y el teléfono los refresca cada carga, porque de
 * ahí vienen. El contacto escrito a mano, las notas y si es un punto fijo
 * solo existen aquí, y ninguna importación los toca.
 */
export async function guardarCliente(
  id: string,
  campos: {
    nombre?: string;
    direccion?: string | null;
    telefono?: string | null;
    email?: string | null;
    contacto?: string | null;
    notas?: string | null;
    recurrente?: boolean;
  },
) {
  const yo = await idSesion();
  const limpio = (v: string | null | undefined) =>
    v === undefined ? null : v?.trim() || null;

  const nombre = campos.nombre?.trim();
  if (campos.nombre !== undefined && !nombre) {
    throw new Error("El cliente necesita un nombre.");
  }

  // Cada campo vaciable lleva su propio interruptor. Con `coalesce` no se
  // podría borrar un teléfono: dejarlo vacío y no mandarlo llegarían los dos
  // como null y el valor viejo se quedaría pegado para siempre.
  const filas = await comoUsuario<{ id: string }>(
    yo,
    `update clientes
        set nombre     = coalesce($2, nombre),
            direccion  = case when $3  then $4  else direccion end,
            telefono   = case when $5  then $6  else telefono end,
            email      = case when $7  then $8  else email end,
            contacto   = case when $9  then $10 else contacto end,
            notas      = case when $11 then $12 else notas end,
            recurrente = coalesce($13, recurrente),
            actualizado_en = now()
      where id = $1
      returning id`,
    [
      id,
      nombre ?? null,
      campos.direccion !== undefined, limpio(campos.direccion),
      campos.telefono !== undefined, limpio(campos.telefono),
      campos.email !== undefined, limpio(campos.email),
      campos.contacto !== undefined, limpio(campos.contacto),
      campos.notas !== undefined, limpio(campos.notas),
      campos.recurrente ?? null,
    ],
  );

  if (!filas.length) throw new Error("Ese cliente no es tuyo.");
}
