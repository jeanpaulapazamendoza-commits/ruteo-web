"use server";

import { auth } from "@/auth";
import { comoUsuario } from "@/lib/db";

/**
 * Las bases: los centros de los que sale la flota.
 *
 * El centro de distribución era un par de coordenadas escrito a mano en cada
 * planificación. Guardadas con nombre sirven para dos cosas: no volver a
 * teclearlas, y poder decir de cuál sale cada tipo de vehículo cuando la
 * flota está repartida entre varias.
 */
async function idSesion() {
  const sesion = await auth();
  if (!sesion?.user) throw new Error("Tu sesión caducó. Vuelve a entrar.");
  return sesion.user.id;
}

export type Base = {
  id: string;
  nombre: string;
  lat: number;
  lon: number;
};

export async function bases() {
  const yo = await idSesion();
  return comoUsuario<Base>(
    yo,
    "select id, nombre, lat, lon from bases where activo order by nombre",
  );
}

function validar(b: { nombre: string; lat: number; lon: number }) {
  const nombre = b.nombre.trim();
  if (!nombre) throw new Error("La base necesita un nombre.");
  if (nombre.length > 80) throw new Error("El nombre es demasiado largo.");
  if (!isFinite(b.lat) || !isFinite(b.lon) || Math.abs(b.lat) > 90 || Math.abs(b.lon) > 180) {
    throw new Error("Las coordenadas no son válidas.");
  }
  return nombre;
}

/** Crea una base, o cambia el nombre y la posición de una que ya existe. */
export async function guardarBase(b: { id?: string | null; nombre: string; lat: number; lon: number }) {
  const yo = await idSesion();
  const nombre = validar(b);
  try {
    if (b.id) {
      await comoUsuario(
        yo,
        "update bases set nombre = $2, lat = $3, lon = $4 where id = $1",
        [b.id, nombre, b.lat, b.lon],
      );
      return b.id;
    }
    // `org_id` sale de la propia base de datos y no del navegador.
    const filas = await comoUsuario<{ id: string }>(
      yo,
      `insert into bases (org_id, nombre, lat, lon)
       select private.mi_org(), $1, $2, $3
       returning id`,
      [nombre, b.lat, b.lon],
    );
    if (!filas[0]) throw new Error("No tienes permiso para crear bases.");
    return filas[0].id;
  } catch (e) {
    if (e instanceof Error && e.message.includes("bases_nombre_unico")) {
      throw new Error("Ya hay una base con ese nombre.");
    }
    throw e;
  }
}

/**
 * Quita una base de la lista.
 *
 * Las rutas que salieron de ella no cambian: cada ruta guarda copia del
 * nombre y la posición de su base.
 */
export async function borrarBase(id: string) {
  const yo = await idSesion();
  await comoUsuario(yo, "delete from bases where id = $1", [id]);
}
