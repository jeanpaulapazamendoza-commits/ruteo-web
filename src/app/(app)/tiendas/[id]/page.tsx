import Link from "next/link";
import { notFound } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraSuperior, Tarjeta, EstadoVacio } from "@/components/ui";
import TablaTiendas, { type TiendaFila } from "@/components/TablaTiendas";

export default async function DetalleCarga({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await crearClienteServidor();

  const esTodas = id === "todas";
  const esSinArchivo = id === "sin-archivo";

  let titulo = esSinArchivo ? "Tiendas sin archivo asociado" : "Todas las tiendas activas";
  let subtitulo = esSinArchivo
    ? "Cargadas antes de que se registraran los archivos"
    : "Acumulado de todas las cargas";

  if (!esTodas && !esSinArchivo) {
    const { data: imp } = await supabase
      .from("importaciones")
      .select("nombre_archivo, filas, creado_en, perfiles:creado_por(nombre)")
      .eq("id", id)
      .maybeSingle();
    if (!imp) notFound();
    const d = new Date(imp.creado_en);
    titulo = imp.nombre_archivo;
    const autor = (imp.perfiles as { nombre?: string } | null)?.nombre;
    subtitulo =
      `${d.toLocaleDateString("es-PE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}` +
      ` · ${d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}` +
      (autor ? ` · ${autor}` : "");
  }

  const consulta = supabase
    .from("tiendas")
    .select("*", { count: "exact" })
    .order("codigo")
    .limit(1000);

  const { data, count } = esTodas
    ? await consulta.eq("activo", true)
    : esSinArchivo
      ? await consulta.is("importacion_id", null).eq("activo", true)
      : await consulta.eq("importacion_id", id);

  const tiendas = (data ?? []) as TiendaFila[];
  const bultos = tiendas.reduce((a, t) => a + t.bultos_default, 0);
  const conVentana = tiendas.filter((t) => t.ventana_ini && t.ventana_fin).length;
  const prioritarias = tiendas.filter((t) => t.prioridad > 0).length;

  return (
    <>
      <BarraSuperior
        migaja={
          <>
            <Link href="/tiendas" className="hover:underline">
              Cargas de tiendas
            </Link>
            {" / "}
            {subtitulo}
          </>
        }
        titulo={titulo}
        acciones={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
            <span><b className="num text-ink">{(count ?? 0).toLocaleString("es-PE")}</b> tiendas</span>
            <span><b className="num text-ink">{bultos.toLocaleString("es-PE")}</b> bultos</span>
            {conVentana > 0 && <span><b className="num text-ink">{conVentana}</b> con ventana</span>}
            {prioritarias > 0 && (
              <span className="text-amber-600">⭐ <b className="num">{prioritarias}</b> prioritarias</span>
            )}
          </div>
        }
      />

      <div className="p-4">
        {tiendas.length === 0 ? (
          <Tarjeta>
            <EstadoVacio
              icono="🏪"
              titulo="Esta carga no tiene tiendas"
              descripcion="Puede que ya las hayas eliminado, o que un archivo posterior volviera a cargarlas y ahora pertenezcan a esa carga."
            />
          </Tarjeta>
        ) : (
          <Tarjeta className="p-3.5">
            <TablaTiendas
              tiendas={tiendas}
              total={count ?? tiendas.length}
              cargaId={esTodas || esSinArchivo ? null : id}
              esSinArchivo={esSinArchivo}
              nombreCarga={titulo}
            />
          </Tarjeta>
        )}
        {(count ?? 0) > 1000 && (
          <p className="mt-2 text-[12px] text-ink-3">
            Mostrando las primeras 1000 de {count?.toLocaleString("es-PE")}.
          </p>
        )}
      </div>
    </>
  );
}
