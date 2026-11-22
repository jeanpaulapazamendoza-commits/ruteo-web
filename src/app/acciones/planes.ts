"use server";

import { auth } from "@/auth";
import { comoUsuario } from "@/lib/db";

/**
 * El historial de planes de un despacho.
 *
 * Volver a rutear reemplaza las rutas. Cada plan guardado queda además en
 * `planes`, entero, y aquí se listan sus cifras para compararlos; el
 * contenido no viaja al navegador, solo se usa al restaurar.
 */
async function idSesion() {
  const sesion = await auth();
  if (!sesion?.user) throw new Error("Tu sesión caducó. Vuelve a entrar.");
  return sesion.user.id;
}

export type PlanFila = {
  id: number;
  creado_en: string;
  autor: string | null;
  /** Cómo se calculó: «Planificar flota», «Agrupar y rutear», «Manual». */
  metodo: string | null;
  /** Si es una vuelta atrás, el plan del que salió. */
  restaurado_de: number | null;
  resumen: {
    rutas?: number;
    paradas?: number;
    bultos?: number;
    km?: number;
    duracion_min?: number;
    costo?: number;
    sin_asignar?: number;
  };
};

/** Los planes guardados de un despacho, del más reciente al más antiguo. */
export async function planesDeDespacho(despachoId: string) {
  const yo = await idSesion();
  return comoUsuario<PlanFila>(
    yo,
    `select p.id, p.creado_en, a.nombre as autor, p.metodo, p.restaurado_de, p.resumen
       from planes p
       left join perfiles a on a.id = p.creado_por
      where p.despacho_id = $1
      order by p.id desc
      limit 10`,
    [despachoId],
  );
}
