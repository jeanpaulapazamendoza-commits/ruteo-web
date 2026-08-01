import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraSuperior } from "@/components/ui";
import Planificador, { type Carga } from "@/components/Planificador";
import type { TiendaMapa } from "@/lib/motor";

export const SIN_ARCHIVO = "sin-archivo";

export default async function PaginaPlanificador({
  searchParams,
}: {
  searchParams: Promise<{ carga?: string; despacho?: string }>;
}) {
  const { carga: idCarga, despacho: idDespacho } = await searchParams;
  const supabase = await crearClienteServidor();

  // De entrada no se consulta nada: el día empieza subiendo el archivo, que
  // vive en el navegador hasta que se guarda el despacho. Solo se va a la base
  // cuando el usuario pide continuar algo ya guardado.
  const [{ data: importaciones }, { data: despachos }] =
    await Promise.all([
      supabase
        .from("importaciones")
        .select("id, nombre_archivo, filas, creado_en, perfiles:creado_por(nombre), despachos(id)")
        .order("creado_en", { ascending: false })
        .limit(50),
      // Solo lo que está pendiente de rutear: un despacho ya planificado se
      // retoma desde su ficha, no desde aquí.
      supabase
        .from("despachos")
        .select("id, nombre, fecha")
        .eq("estado", "cargado")
        .order("creado_en", { ascending: false })
        .limit(30),
    ]);

  // Solo interesan las cargas que dejaron tiendas guardadas (las del sistema
  // anterior). Las de ahora solo registran el nombre del archivo del despacho,
  // y ofrecerlas como origen abriría el planificador sin un solo punto.
  const { data: conTiendas } = await supabase
    .from("tiendas")
    .select("importacion_id")
    .not("importacion_id", "is", null)
    .eq("activo", true)
    .limit(5000);

  const conPuntos = new Set((conTiendas ?? []).map((t) => t.importacion_id));

  const cargas: Carga[] = (importaciones ?? [])
    .filter((i) => conPuntos.has(i.id))
    .map((i) => ({
      id: i.id,
      nombre: i.nombre_archivo,
      filas: i.filas ?? 0,
      creado_en: i.creado_en,
      autor: (i.perfiles as { nombre?: string } | null)?.nombre ?? null,
      ruteada: ((i.despachos as unknown[] | null)?.length ?? 0) > 0,
    }));

  const seleccion = idDespacho ? null : (idCarga ?? null);

  let puntos: TiendaMapa[] = [];
  let gruposIniciales: string[][] | null = null;
  let origenServidor: string | null = null;
  let estadoDespacho: string | null = null;

  if (idDespacho) {
    // Trabajar sobre un despacho: sus paradas son los puntos, y sus rutas los
    // grupos. El despacho guarda copia completa de cada parada, así que no hace
    // falta cruzarlo con ninguna otra tabla.
    const [{ data: cab }, { data: rutas }] = await Promise.all([
      supabase.from("despachos").select("nombre, fecha, estado").eq("id", idDespacho).maybeSingle(),
      supabase
        .from("rutas")
        .select(
          "indice, paradas(orden, tienda_id, codigo, nombre, distrito, lat, lon, bultos, prioridad, ventana_ini, ventana_fin)",
        )
        .eq("despacho_id", idDespacho)
        .order("indice"),
    ]);

    origenServidor = cab ? (cab.nombre ?? cab.fecha) : "Despacho";
    estadoDespacho = cab?.estado ?? null;

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

    const vistos = new Set<string>();
    gruposIniciales = (rutas ?? []).map((r) => {
      const ids: string[] = [];
      for (const p of ((r.paradas ?? []) as ParadaFila[]).sort((a, b) => a.orden - b.orden)) {
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
    let consulta = supabase
      .from("tiendas")
      .select("id, codigo, nombre, distrito, lat, lon, bultos_default, prioridad, ventana_ini, ventana_fin")
      .eq("activo", true)
      .order("codigo")
      .limit(5000);

    if (seleccion === SIN_ARCHIVO) consulta = consulta.is("importacion_id", null);
    else if (seleccion !== "todas") consulta = consulta.eq("importacion_id", seleccion);

    const { data: filas } = await consulta;

    puntos = (filas ?? []).map((t) => ({
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
        titulo={idDespacho ? (origenServidor ?? "Despacho") : "Planificación del día"}
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
        despachos={despachos ?? []}
        idDespacho={idDespacho ?? null}
        gruposIniciales={gruposIniciales}
      />
    </>
  );
}
