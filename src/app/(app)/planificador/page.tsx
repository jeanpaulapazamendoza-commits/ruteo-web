import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { comoUsuario, unaFila } from "@/lib/db";
import { BarraSuperior } from "@/components/ui";
import Planificador, { type Carga } from "@/components/Planificador";
import type { TiendaMapa } from "@/lib/motor";
import type { Zona } from "@/lib/zonas";

export const SIN_ARCHIVO = "sin-archivo";

export default async function PaginaPlanificador({
  searchParams,
}: {
  searchParams: Promise<{ carga?: string; despacho?: string }>;
}) {
  const { carga: idCarga, despacho: idDespacho } = await searchParams;
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");
  const yo = sesion.user.id;

  // De entrada no se consulta nada del archivo del día: ese vive en el
  // navegador hasta que se guarda el despacho. Solo se va a la base para
  // ofrecer lo que ya está guardado.
  //
  // Solo interesan las cargas que dejaron tiendas guardadas (las del sistema
  // anterior). Las de ahora solo registran el nombre del archivo del despacho,
  // y ofrecerlas como origen abriría el planificador sin un solo punto. El
  // filtro va como `exists` en la base: antes se traían 5000 filas de tiendas
  // solo para cruzar identificadores aquí.
  const [cargas, pendientes, zonas] = await Promise.all([
    comoUsuario<Carga>(
      yo,
      `select i.id, i.nombre_archivo as nombre, coalesce(i.filas, 0) as filas,
              i.creado_en, a.nombre as autor,
              exists (select 1 from despachos d where d.importacion_id = i.id)
                as ruteada
         from importaciones i
         left join perfiles a on a.id = i.creado_por
        where exists (select 1 from tiendas t
                       where t.importacion_id = i.id and t.activo)
        order by i.creado_en desc
        limit 50`,
    ),
    // Lo que se ofrece para retomar: el alias que le puso el usuario, quién lo
    // subió y de qué archivo salió. Sin eso, «Despacho» a secas no distingue
    // dos cargas del mismo día. Solo lo pendiente de rutear: un despacho ya
    // planificado se retoma desde su ficha, no desde aquí.
    comoUsuario<{
      id: string;
      nombre: string | null;
      fecha: string;
      autor: string | null;
      archivo: string | null;
    }>(
      yo,
      `select d.id, d.nombre, d.fecha, a.nombre as autor,
              i.nombre_archivo as archivo
         from despachos d
         left join perfiles a on a.id = d.creado_por
         left join importaciones i on i.id = d.importacion_id
        where d.estado = 'cargado'
        order by d.creado_en desc
        limit 30`,
    ),
    comoUsuario<Zona>(
      yo,
      "select id, nombre, color, poligono from zonas where activo order by nombre",
    ),
  ]);

  const seleccion = idDespacho ? null : (idCarga ?? null);

  let puntos: TiendaMapa[] = [];
  let gruposIniciales: string[][] | null = null;
  let origenServidor: string | null = null;
  let estadoDespacho: string | null = null;

  if (idDespacho) {
    // Trabajar sobre un despacho: sus paradas son los puntos, y sus rutas los
    // grupos. El despacho guarda copia completa de cada parada, así que no hace
    // falta cruzarlo con ninguna otra tabla.
    type ParadaFila = {
      orden: number;
      tienda_id: string | null;
      codigo: string | null;
      nombre: string | null;
      distrito: string | null;
      lat: number;
      lon: number;
      bultos: number;
      prioridad: number;
      ventana_ini: string | null;
      ventana_fin: string | null;
    };

    const [cab, rutas] = await Promise.all([
      unaFila<{ nombre: string | null; fecha: string; estado: string }>(
        yo,
        "select nombre, fecha, estado from despachos where id = $1",
        [idDespacho],
      ),
      comoUsuario<{ indice: number; paradas: ParadaFila[] }>(
        yo,
        `select r.indice,
                coalesce(
                  (select json_agg(x order by x.orden)
                     from (select p.orden, p.tienda_id, p.codigo, p.nombre,
                                  p.distrito, p.lat, p.lon, p.bultos,
                                  p.prioridad, p.ventana_ini, p.ventana_fin
                             from paradas p
                            where p.ruta_id = r.id) x),
                  '[]'::json
                ) as paradas
           from rutas r
          where r.despacho_id = $1
          order by r.indice`,
        [idDespacho],
      ),
    ]);

    origenServidor = cab ? (cab.nombre ?? cab.fecha) : "Despacho";
    estadoDespacho = cab?.estado ?? null;

    const vistos = new Set<string>();
    gruposIniciales = rutas.map((r) => {
      const ids: string[] = [];
      for (const p of r.paradas ?? []) {
        // El identificador de trabajo es el de la tienda si la parada apunta a
        // una, y si no su código: en ambos casos es único dentro del despacho.
        const id = p.tienda_id ?? p.codigo ?? `${p.lat},${p.lon}`;
        if (vistos.has(id)) continue;
        vistos.add(id);
        ids.push(id);
        puntos.push({
          id,
          codigo: p.codigo ?? id,
          nombre: p.nombre ?? p.codigo ?? "Punto",
          distrito: p.distrito,
          lat: p.lat,
          lon: p.lon,
          bultos: p.bultos ?? 1,
          prioridad: p.prioridad ?? 0,
          ventana_ini: p.ventana_ini ? String(p.ventana_ini).slice(0, 5) : null,
          ventana_fin: p.ventana_fin ? String(p.ventana_fin).slice(0, 5) : null,
        });
      }
      return ids;
    });

    // Un despacho recién cargado guarda sus puntos en una ruta contenedora
    // que no es un agrupamiento real: se empieza de cero.
    if (estadoDespacho === "cargado") gruposIniciales = null;
  } else if (seleccion) {
    // Tiendas guardadas de antes (histórico). Se mantiene por compatibilidad.
    const filtro =
      seleccion === SIN_ARCHIVO
        ? "and importacion_id is null"
        : seleccion === "todas"
          ? ""
          : "and importacion_id = $1";

    const filas = await comoUsuario<{
      id: string;
      codigo: string;
      nombre: string;
      distrito: string | null;
      lat: number;
      lon: number;
      bultos_default: number | null;
      prioridad: number | null;
      ventana_ini: string | null;
      ventana_fin: string | null;
    }>(
      yo,
      `select id, codigo, nombre, distrito, lat, lon, bultos_default,
              prioridad, ventana_ini, ventana_fin
         from tiendas
        where activo ${filtro}
        order by codigo
        limit 5000`,
      filtro.includes("$1") ? [seleccion] : [],
    );

    puntos = filas.map((t) => ({
      id: t.id,
      codigo: t.codigo,
      nombre: t.nombre,
      distrito: t.distrito,
      lat: t.lat,
      lon: t.lon,
      bultos: t.bultos_default ?? 1,
      prioridad: t.prioridad ?? 0,
      ventana_ini: t.ventana_ini ? String(t.ventana_ini).slice(0, 5) : null,
      ventana_fin: t.ventana_fin ? String(t.ventana_fin).slice(0, 5) : null,
    }));

    const carga = cargas.find((c) => c.id === seleccion);
    origenServidor =
      carga?.nombre ??
      (seleccion === SIN_ARCHIVO ? "Tiendas sin archivo" : "Todas las tiendas guardadas");
  }

  return (
    <>
      {/* El recuento en vivo vive en el panel lateral: aquí solo el contexto,
          porque los puntos del archivo se cargan ya en el navegador. */}
      <BarraSuperior
        migaja={
          idDespacho ? (
            <Link href="/despachos" className="transition hover:text-ink">
              Despachos
            </Link>
          ) : (
            (origenServidor ?? "Operación")
          )
        }
        titulo={idDespacho ? (origenServidor ?? "Despacho") : "Planificador"}
      />

      {/* La `key` ata el planificador a su origen: al cambiar de despacho (o al
          volver a la mesa en blanco) se monta de nuevo con esos puntos, en vez
          de conservar los del origen anterior. */}
      <Planificador
        key={idDespacho ?? seleccion ?? "archivo"}
        puntosServidor={puntos}
        origenServidor={origenServidor}
        estadoDespacho={estadoDespacho}
        cargas={cargas}
        seleccion={seleccion}
        despachos={pendientes}
        idDespacho={idDespacho ?? null}
        gruposIniciales={gruposIniciales}
        zonas={zonas}
      />
    </>
  );
}
