"use server";

import { auth } from "@/auth";
import { comoUsuario } from "@/lib/db";
import { hhmm } from "@/lib/horaZona";

export type Etiqueta = {
  id: string;
  codigo: string | null;
  nombre: string | null;
  distrito: string | null;
  direccion: string | null;
  telefono: string | null;
  bultos: number;
  /** Puesto en la ruta. Vacío si aún no está en ninguna. */
  orden: number | null;
  ruta: string | null;
  conductor: string | null;
  ventana: string | null;
  eta: string | null;
  despacho: string | null;
  fecha: string;
  empresa: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Los datos de las etiquetas que se van a imprimir: las de unas órdenes
 * sueltas o las de todas las órdenes de unas rutas, en el orden de reparto.
 *
 * La dirección y el teléfono son de la ficha del cliente, que se enlaza por
 * el código de la orden.
 */
export async function etiquetas(de: { rutas?: string[]; paradas?: string[] }): Promise<Etiqueta[]> {
  const sesion = await auth();
  if (!sesion?.user) throw new Error("Tu sesión caducó. Vuelve a entrar.");

  // Lo que llega de la barra de direcciones acaba en un `uuid[]` de Postgres.
  const rutas = (de.rutas ?? []).filter((x) => UUID.test(x)).slice(0, 50);
  const paradas = (de.paradas ?? []).filter((x) => UUID.test(x)).slice(0, 200);
  if (!rutas.length && !paradas.length) return [];

  const filas = await comoUsuario<
    Omit<Etiqueta, "ruta" | "ventana" | "eta"> & {
      indice: number; placa: string | null; sin_asignar: boolean;
      ventana_ini: string | null; ventana_fin: string | null; eta: string | null;
    }
  >(
    sesion.user.id,
    `select p.id, p.codigo, p.nombre, p.distrito, p.bultos,
            case when r.sin_asignar then null else p.orden end as orden,
            r.indice, r.sin_asignar, v.placa, c.nombre as conductor,
            p.ventana_ini, p.ventana_fin, p.eta,
            cl.direccion, cl.telefono,
            d.nombre as despacho, d.fecha, o.nombre as empresa
       from paradas p
       join rutas r on r.id = p.ruta_id
       join despachos d on d.id = r.despacho_id
       join organizaciones o on o.id = p.org_id
       left join vehiculos v on v.id = r.vehiculo_id
       left join perfiles c on c.id = r.conductor_id
       left join clientes cl on cl.org_id = p.org_id and cl.codigo = p.codigo
      where (p.ruta_id = any($1::uuid[]) and not r.sin_asignar) or p.id = any($2::uuid[])
      order by d.fecha, r.indice, p.orden`,
    [rutas, paradas],
  );

  return filas.map((f) => ({
    id: f.id, codigo: f.codigo, nombre: f.nombre, distrito: f.distrito,
    direccion: f.direccion, telefono: f.telefono, bultos: f.bultos, orden: f.orden,
    ruta: f.sin_asignar ? null : (f.placa ?? `R-${String(f.indice + 1).padStart(2, "0")}`),
    conductor: f.conductor,
    ventana: hhmm(f.ventana_ini) && hhmm(f.ventana_fin) ? `${hhmm(f.ventana_ini)}–${hhmm(f.ventana_fin)}` : null,
    eta: hhmm(f.eta),
    despacho: f.despacho, fecha: String(f.fecha).slice(0, 10), empresa: f.empresa,
  }));
}
