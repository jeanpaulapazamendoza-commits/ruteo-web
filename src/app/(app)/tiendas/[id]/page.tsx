import Link from "next/link";
import { notFound } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraSuperior, Tarjeta, Pastilla, EstadoVacio } from "@/components/ui";

type Tienda = {
  id: string;
  codigo: string;
  nombre: string;
  distrito: string | null;
  lat: number;
  lon: number;
  bultos_default: number;
  prioridad: number;
  ventana_ini: string | null;
  ventana_fin: string | null;
  activo: boolean;
};

const hhmm = (h: string | null) => (h ? h.slice(0, 5) : null);

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

  const tiendas = (data ?? []) as Tienda[];
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
        <Tarjeta className="overflow-hidden">
          {tiendas.length === 0 ? (
            <EstadoVacio
              icono="🏪"
              titulo="Esta carga no tiene tiendas visibles"
              descripcion="Puede que las tiendas de este archivo se hayan vuelto a cargar con otro archivo posterior, que es el que ahora las reclama."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
                <thead>
                  <tr>
                    {["Código", "Tienda", "Distrito", "Bultos", "Ventana", "Coordenadas", "Estado"].map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap border-b border-line bg-surface-2 px-3 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tiendas.map((t) => (
                    <tr key={t.id} className="hover:bg-surface-2">
                      <td className="num border-b border-line px-3 py-2.5 font-semibold">{t.codigo}</td>
                      <td className="border-b border-line px-3 py-2.5 font-semibold text-ink">
                        {t.nombre}
                        {t.prioridad > 0 && <span className="ml-2 text-amber-600">⭐ P{t.prioridad}</span>}
                      </td>
                      <td className="border-b border-line px-3 py-2.5 text-ink-2">{t.distrito ?? "—"}</td>
                      <td className="num border-b border-line px-3 py-2.5 text-ink-2">{t.bultos_default}</td>
                      <td className="num border-b border-line px-3 py-2.5 text-ink-2">
                        {hhmm(t.ventana_ini) && hhmm(t.ventana_fin)
                          ? `${hhmm(t.ventana_ini)}–${hhmm(t.ventana_fin)}`
                          : "—"}
                      </td>
                      <td className="num border-b border-line px-3 py-2.5 text-ink-3">
                        {t.lat.toFixed(5)}, {t.lon.toFixed(5)}
                      </td>
                      <td className="border-b border-line px-3 py-2.5">
                        <Pastilla tono={t.activo ? "ok" : "plan"}>
                          {t.activo ? "Activa" : "Inactiva"}
                        </Pastilla>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>
        {(count ?? 0) > 1000 && (
          <p className="mt-2 text-[12px] text-ink-3">
            Mostrando las primeras 1000 de {count?.toLocaleString("es-PE")}.
          </p>
        )}
      </div>
    </>
  );
}
