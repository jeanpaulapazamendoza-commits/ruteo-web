"use server";

import { auth } from "@/auth";
import { comoUsuario } from "@/lib/db";

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
