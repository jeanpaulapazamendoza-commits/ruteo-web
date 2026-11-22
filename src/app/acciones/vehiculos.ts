"use server";

import { auth } from "@/auth";
import { comoUsuario } from "@/lib/db";

/**
 * Los vehículos de la empresa.
 *
 * La tabla existía desde el principio y las rutas ya podían llevar uno, pero
 * no había pantalla donde crearlos: la asignación solo enseñaba el conductor
 * y nadie sabía dónde se ponía el transporte. Un vehículo es la placa que
 * sale a la calle; el conductor habitual es solo una ayuda para asignar más
 * rápido, y se puede cambiar ruta a ruta.
 */
async function idSesion() {
  const sesion = await auth();
  if (!sesion?.user) throw new Error("Tu sesión caducó. Vuelve a entrar.");
  return sesion.user.id;
}

export type VehiculoFila = {
  id: string;
  nombre: string;
  placa: string | null;
  capacidad_bultos: number;
  max_tiendas: number;
  conductor_id: string | null;
  conductor: string | null;
  /** Grupo al que pertenece, para filtrar la flota. */
  grupo: string | null;
  activo: boolean;
  /** En cuántas rutas ha salido. Con alguna, no se borra: se retira. */
  rutas: number;
};

export async function vehiculosLista() {
  const yo = await idSesion();
  return comoUsuario<VehiculoFila>(
    yo,
    `select v.id, v.nombre, v.placa, v.capacidad_bultos, v.max_tiendas,
            v.conductor_id, c.nombre as conductor, v.grupo, v.activo,
            (select count(*) from rutas r where r.vehiculo_id = v.id)::int as rutas
       from vehiculos v
       left join perfiles c on c.id = v.conductor_id
      order by v.activo desc, v.nombre`,
  );
}

/** Los conductores a los que se les puede dar un vehículo habitual. */
export async function conductoresActivos() {
  const yo = await idSesion();
  return comoUsuario<{ id: string; nombre: string | null }>(
    yo,
    "select id, nombre from perfiles where rol = 'conductor' and activo order by nombre",
  );
}

export async function guardarVehiculo(v: {
  id?: string | null;
  nombre: string;
  placa: string | null;
  capacidad_bultos: number;
  max_tiendas: number;
  conductor_id: string | null;
  grupo?: string | null;
}) {
  const yo = await idSesion();
  const nombre = v.nombre.trim();
  const grupo = v.grupo?.trim() || null;
  const placa = v.placa?.trim().toUpperCase() || null;
  if (!nombre) throw new Error("El vehículo necesita un nombre.");
  if (!Number.isFinite(v.capacidad_bultos) || v.capacidad_bultos <= 0) {
    throw new Error("La capacidad en bultos tiene que ser mayor que cero.");
  }
  const cap = Math.round(v.capacidad_bultos);
  const max = Math.max(0, Math.round(v.max_tiendas || 0));

  if (v.id) {
    const filas = await comoUsuario<{ id: string }>(
      yo,
      `update vehiculos
          set nombre = $2, placa = $3, capacidad_bultos = $4, max_tiendas = $5,
              conductor_id = $6, grupo = $7, actualizado_en = now()
        where id = $1 returning id`,
      [v.id, nombre, placa, cap, max, v.conductor_id, grupo],
    );
    if (!filas[0]) throw new Error("No tienes permiso para cambiar vehículos.");
    return v.id;
  }
  // `org_id` sale de la propia base y no del navegador.
  const filas = await comoUsuario<{ id: string }>(
    yo,
    `insert into vehiculos (org_id, nombre, placa, capacidad_bultos, max_tiendas, conductor_id, grupo)
     select private.mi_org(), $1, $2, $3, $4, $5, $6
     returning id`,
    [nombre, placa, cap, max, v.conductor_id, grupo],
  );
  if (!filas[0]) throw new Error("No tienes permiso para crear vehículos.");
  return filas[0].id;
}

/** Retira un vehículo de la lista de asignables, o lo vuelve a poner. */
export async function activarVehiculo(id: string, activo: boolean) {
  const yo = await idSesion();
  await comoUsuario(
    yo,
    "update vehiculos set activo = $2, actualizado_en = now() where id = $1",
    [id, activo],
  );
}

/**
 * Borra un vehículo que nunca salió en una ruta.
 *
 * Con rutas no se borra: se perdería qué placa hizo cada reparto. Para eso
 * está retirarlo.
 */
export async function borrarVehiculo(id: string) {
  const yo = await idSesion();
  const filas = await comoUsuario<{ id: string }>(
    yo,
    `delete from vehiculos v
      where v.id = $1
        and not exists (select 1 from rutas r where r.vehiculo_id = v.id)
      returning v.id`,
    [id],
  );
  if (!filas[0]) {
    throw new Error("Ese vehículo ya salió en alguna ruta: retíralo en lugar de borrarlo.");
  }
}
