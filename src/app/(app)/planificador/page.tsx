import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraSuperior, Tarjeta, EstadoVacio } from "@/components/ui";
import Planificador from "@/components/Planificador";
import type { TiendaMapa } from "@/lib/motor";

export default async function PaginaPlanificador({
  searchParams,
}: {
  searchParams: Promise<{ despacho?: string }>;
}) {
  const { despacho: idDespacho } = await searchParams;
  const supabase = await crearClienteServidor();

  const [{ data: filas }, { data: despachos }] = await Promise.all([
    supabase
      .from("tiendas")
      .select("id, codigo, nombre, distrito, lat, lon, bultos_default, prioridad, ventana_ini, ventana_fin")
      .eq("activo", true)
      .order("codigo")
      .limit(5000),
    supabase
      .from("despachos")
      .select("id, nombre, fecha")
      .order("creado_en", { ascending: false })
      .limit(30),
  ]);

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

  // Si se pide continuar sobre un despacho ya ruteado, se cargan sus grupos.
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

  const bultos = tiendas.reduce((a, t) => a + t.bultos, 0);
  const conVentana = tiendas.filter((t) => t.ventana_ini && t.ventana_fin).length;
  const prioritarias = tiendas.filter((t) => t.prioridad > 0).length;

  return (
    <>
      <BarraSuperior
        migaja={nombreDespacho ? `Continuando · ${nombreDespacho}` : "Despachos / Hoy"}
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
              titulo="Aún no hay tiendas cargadas"
              descripcion="Importa tu maestro una sola vez y quedará guardado. Después solo ajustas la carga del día y optimizas."
              accion={
                <Link
                  href="/tiendas"
                  className="inline-block rounded-[9px] border border-amber-600 bg-amber px-4 py-2.5 text-[13.5px] font-semibold text-[#231403] transition hover:bg-amber-600 hover:text-white"
                >
                  Importar tiendas
                </Link>
              }
            />
          </Tarjeta>
        </div>
      ) : (
        <Planificador
          tiendas={tiendas}
          despachos={despachos ?? []}
          idDespacho={idDespacho ?? null}
          gruposIniciales={gruposIniciales}
        />
      )}
    </>
  );
}
