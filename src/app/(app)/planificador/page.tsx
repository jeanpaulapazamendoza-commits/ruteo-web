import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraSuperior, Tarjeta, EstadoVacio } from "@/components/ui";
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

  const [{ data: importaciones }, { data: despachos }, { count: sinArchivo }] =
    await Promise.all([
      supabase
        .from("importaciones")
        .select("id, nombre_archivo, filas, creado_en, perfiles:creado_por(nombre), despachos(id)")
        .order("creado_en", { ascending: false })
        .limit(50),
      supabase
        .from("despachos")
        .select("id, nombre, fecha")
        .order("creado_en", { ascending: false })
        .limit(30),
      supabase
        .from("tiendas")
        .select("id", { count: "exact", head: true })
        .is("importacion_id", null)
        .eq("activo", true),
    ]);

  const cargas: Carga[] = (importaciones ?? []).map((i) => ({
    id: i.id,
    nombre: i.nombre_archivo,
    filas: i.filas ?? 0,
    creado_en: i.creado_en,
    autor: (i.perfiles as { nombre?: string } | null)?.nombre ?? null,
    ruteada: ((i.despachos as unknown[] | null)?.length ?? 0) > 0,
  }));

  // Qué se muestra en el mapa. Por defecto: la última carga, que es lo que
  // el usuario acaba de subir y quiere despachar.
  const seleccion =
    idDespacho ? null : (idCarga ?? cargas[0]?.id ?? (sinArchivo ? SIN_ARCHIVO : "todas"));

  let consulta = supabase
    .from("tiendas")
    .select("id, codigo, nombre, distrito, lat, lon, bultos_default, prioridad, ventana_ini, ventana_fin")
    .eq("activo", true)
    .order("codigo")
    .limit(5000);

  if (idDespacho) {
    // Continuar un despacho: hace falta el maestro para poder añadir puntos.
  } else if (seleccion === SIN_ARCHIVO) {
    consulta = consulta.is("importacion_id", null);
  } else if (seleccion && seleccion !== "todas") {
    consulta = consulta.eq("importacion_id", seleccion);
  }

  const { data: filas } = await consulta;

  const tiendas: TiendaMapa[] = (filas ?? []).map((t) => ({
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

  // Continuar sobre un despacho ya ruteado: sus rutas se cargan como grupos.
  let gruposIniciales: string[][] | null = null;
  let nombreDespacho: string | null = null;

  if (idDespacho) {
    const [{ data: cab }, { data: rutas }] = await Promise.all([
      supabase.from("despachos").select("nombre, fecha").eq("id", idDespacho).maybeSingle(),
      supabase
        .from("rutas")
        .select("indice, paradas(tienda_id)")
        .eq("despacho_id", idDespacho)
        .order("indice"),
    ]);
    if (cab) nombreDespacho = cab.nombre ?? cab.fecha;
    const validos = new Set(tiendas.map((t) => t.id));
    gruposIniciales = (rutas ?? []).map((r) =>
      (r.paradas ?? [])
        .map((p: { tienda_id: string | null }) => p.tienda_id)
        .filter((x): x is string => !!x && validos.has(x)),
    );
  }

  const cargaActiva = cargas.find((c) => c.id === seleccion) ?? null;
  const bultos = tiendas.reduce((a, t) => a + t.bultos, 0);
  const conVentana = tiendas.filter((t) => t.ventana_ini && t.ventana_fin).length;
  const prioritarias = tiendas.filter((t) => t.prioridad > 0).length;

  const migaja = nombreDespacho
    ? `Continuando · ${nombreDespacho}`
    : cargaActiva
      ? `Carga · ${cargaActiva.nombre}`
      : seleccion === SIN_ARCHIVO
        ? "Tiendas sin archivo asociado"
        : "Todas las tiendas activas";

  return (
    <>
      <BarraSuperior
        migaja={migaja}
        titulo="Planificación del día"
        acciones={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
            <span><b className="num text-ink">{tiendas.length.toLocaleString("es-PE")}</b> tiendas</span>
            <span><b className="num text-ink">{bultos.toLocaleString("es-PE")}</b> bultos</span>
            {conVentana > 0 && <span><b className="num text-ink">{conVentana}</b> con ventana</span>}
            {prioritarias > 0 && (
              <span className="text-amber-600">⭐ <b className="num">{prioritarias}</b> prioritarias</span>
            )}
          </div>
        }
      />

      {tiendas.length === 0 ? (
        <div className="p-4">
          <Tarjeta>
            <EstadoVacio
              icono="🗺️"
              titulo="No hay tiendas en esta selección"
              descripcion="Sube el archivo del día en Tiendas y aparecerá aquí listo para agrupar y rutear."
              accion={
                <Link
                  href="/tiendas"
                  className="inline-block rounded-[9px] border border-amber-600 bg-amber px-4 py-2.5 text-[13.5px] font-semibold text-[#231403] transition hover:bg-amber-600 hover:text-white"
                >
                  Ir a Tiendas
                </Link>
              }
            />
          </Tarjeta>
        </div>
      ) : (
        <Planificador
          tiendas={tiendas}
          cargas={cargas}
          haySinArchivo={(sinArchivo ?? 0) > 0}
          seleccion={idDespacho ? null : seleccion}
          despachos={despachos ?? []}
          idDespacho={idDespacho ?? null}
          gruposIniciales={gruposIniciales}
        />
      )}
    </>
  );
}
