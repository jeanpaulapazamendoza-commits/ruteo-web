import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraSuperior, Tarjeta, EstadoVacio } from "@/components/ui";
import ImportarTiendas from "@/components/ImportarTiendas";

function fechaHora(iso: string) {
  const d = new Date(iso);
  return {
    fecha: d.toLocaleDateString("es-PE", {
      weekday: "short", day: "2-digit", month: "short", year: "numeric",
    }),
    hora: d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }),
  };
}

export default async function PaginaTiendas() {
  const supabase = await crearClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: importaciones }, { count: totalTiendas }, { data: perfil }, { count: sueltas }] =
    await Promise.all([
      supabase
        .from("importaciones")
        .select("id, nombre_archivo, filas, creado_en, perfiles:creado_por(nombre)")
        .order("creado_en", { ascending: false })
        .limit(60),
      supabase.from("tiendas").select("id", { count: "exact", head: true }).eq("activo", true),
      supabase.from("perfiles").select("org_id").eq("id", user?.id ?? "").maybeSingle(),
      supabase
        .from("tiendas")
        .select("id", { count: "exact", head: true })
        .is("importacion_id", null),
    ]);

  const archivos = importaciones ?? [];

  return (
    <>
      <BarraSuperior migaja="Datos" titulo="Cargas de tiendas" />

      <div className="p-4">
        <div className="mb-4 flex flex-col items-start">
          <ImportarTiendas orgId={perfil?.org_id ?? null} />
        </div>

        {/* Acceso al maestro completo */}
        <Link
          href="/tiendas/todas"
          className="mb-3 flex items-center gap-3 rounded-[14px] border border-line bg-surface p-3.5 transition hover:border-line-strong hover:shadow-[0_2px_10px_rgba(16,27,43,0.07)]"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-amber-050 text-lg">
            🏪
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-bold">Todas las tiendas activas</span>
            <span className="block text-[12px] text-ink-2">
              El maestro completo que usa el planificador
            </span>
          </span>
          <span className="num ml-auto text-[20px] font-bold">
            {(totalTiendas ?? 0).toLocaleString("es-PE")}
          </span>
        </Link>

        <h2 className="mb-2 mt-5 text-[10.5px] font-bold uppercase tracking-[0.11em] text-ink-3">
          Archivos cargados
        </h2>

        {archivos.length === 0 ? (
          <Tarjeta>
            <EstadoVacio
              icono="⇪"
              titulo="Todavía no has cargado ningún archivo"
              descripcion="Sube tu Excel o CSV con el botón de arriba. Cada carga queda registrada aquí con su fecha y hora, y puedes abrirla para ver qué tiendas trajo."
            />
          </Tarjeta>
        ) : (
          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {archivos.map((a) => {
              const { fecha, hora } = fechaHora(a.creado_en);
              const autor = (a.perfiles as { nombre?: string } | null)?.nombre;
              return (
                <Link
                  key={a.id}
                  href={`/tiendas/${a.id}`}
                  className="rounded-[14px] border border-line bg-surface p-3.5 transition hover:border-line-strong hover:shadow-[0_2px_10px_rgba(16,27,43,0.07)]"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-canvas text-base">
                      {/\.xlsx?$/i.test(a.nombre_archivo) ? "📊" : "📄"}
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate text-[14px] font-bold tracking-tight">
                        {a.nombre_archivo}
                      </h3>
                      <p className="num mt-0.5 text-[11.5px] text-ink-3">
                        {fecha} · {hora}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2 border-t border-line pt-2.5">
                    <span className="num text-[18px] font-bold">
                      {(a.filas ?? 0).toLocaleString("es-PE")}
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-wide text-ink-3">
                      tiendas
                    </span>
                    {autor && (
                      <span className="ml-auto truncate text-[11.5px] text-ink-3">{autor}</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {(sueltas ?? 0) > 0 && (
          <p className="mt-3 text-[12px] text-ink-3">
            Hay <b className="num">{sueltas}</b> tiendas cargadas antes de que se
            registraran los archivos. Las ves en «Todas las tiendas activas».
          </p>
        )}
      </div>
    </>
  );
}
