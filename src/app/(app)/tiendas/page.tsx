import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { comoUsuario, unaFila } from "@/lib/db";
import { BarraSuperior, Tarjeta, EstadoVacio, Pastilla } from "@/components/ui";
import { fecha as fechaLima, hora as horaLima } from "@/lib/horas";

function fechaHora(iso: string) {
  return { fecha: fechaLima(iso), hora: horaLima(iso) };
}

export default async function PaginaTiendas() {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  // Pantalla de mantenimiento, no de operación: solo administradores.
  if (sesion.user.rol !== "admin") redirect("/planificador");

  // Las importaciones nuevas solo registran el nombre del archivo de un
  // despacho, sin dejar tiendas: aquí solo tienen sentido las del sistema
  // anterior, que son las que sí dejaron filas que consultar o borrar. El
  // cruce se hace en la base en vez de traer cinco mil ids para filtrarlos.
  const [archivos, totales] = await Promise.all([
    comoUsuario<{
      id: string;
      nombre_archivo: string;
      filas: number | null;
      creado_en: string;
      autor: string | null;
      despacho_id: string | null;
      despacho_nombre: string | null;
    }>(
      sesion.user.id,
      `select i.id, i.nombre_archivo, i.filas, i.creado_en,
              pf.nombre as autor,
              d.id as despacho_id, d.nombre as despacho_nombre
         from importaciones i
         left join perfiles pf on pf.id = i.creado_por
         left join lateral (
           select id, nombre from despachos
            where importacion_id = i.id order by creado_en limit 1
         ) d on true
        where exists (
          select 1 from tiendas t where t.importacion_id = i.id and t.activo
        )
        order by i.creado_en desc
        limit 60`,
    ),
    unaFila<{ total: number; sueltas: number }>(
      sesion.user.id,
      `select count(*)::int as total,
              count(*) filter (where importacion_id is null)::int as sueltas
         from tiendas where activo`,
    ),
  ]);

  const totalTiendas = totales?.total ?? 0;
  const sueltas = totales?.sueltas ?? 0;

  return (
    <>
      <BarraSuperior
        migaja="Administración"
        titulo="Tiendas guardadas"
        acciones={
          <span className="text-[12px] text-ink-3">
            <b className="num text-ink-2">{totalTiendas.toLocaleString("es-PE")}</b> tiendas en total
          </span>
        }
      />

      <div className="p-4">
        <p className="mb-4 rounded-[12px] border border-line bg-surface-2 px-3.5 py-3 text-[12.5px] text-ink-2">
          Esta pantalla es de <b>mantenimiento</b>, no del día a día. El archivo
          del día se sube ahora en el{" "}
          <Link href="/planificador" className="font-semibold text-amber-600 underline underline-offset-2">
            planificador
          </Link>{" "}
          y solo se guarda al guardar el despacho. Aquí quedan las tiendas
          cargadas con el sistema anterior, por si necesitas consultarlas,
          volver a rutearlas o borrarlas.
        </p>

        {archivos.length === 0 && sueltas === 0 ? (
          <Tarjeta>
            <EstadoVacio
              icono="✓"
              titulo="No queda nada guardado por aquí"
              descripcion="Todo tu histórico vive ahora en Despachos, que es donde se guardan los puntos junto con sus rutas."
            />
          </Tarjeta>
        ) : (
          <div className="grid gap-2.5 @xl:grid-cols-2 @4xl:grid-cols-3">
            {archivos.map((a) => {
              const { fecha, hora } = fechaHora(a.creado_en);
              const autor = a.autor;
              const desp = a.despacho_id ? [{ id: a.despacho_id, nombre: a.despacho_nombre }] : [];
              const ruteada = desp.length > 0;
              return (
                <div
                  key={a.id}
                  className="flex flex-col rounded-[14px] border border-line bg-surface p-3.5"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-canvas text-base">
                      {/\.xlsx?$/i.test(a.nombre_archivo) ? "📊" : "📄"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[14px] font-bold tracking-tight">
                        {a.nombre_archivo}
                      </h3>
                      <p className="num mt-0.5 text-[11.5px] text-ink-3">
                        {fecha} · {hora}
                      </p>
                    </div>
                    <Pastilla tono={ruteada ? "ok" : "warn"}>
                      {ruteada ? "ruteada" : "por rutear"}
                    </Pastilla>
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

                  <div className="mt-2.5 flex gap-1.5">
                    <Link
                      href={`/tiendas/${a.id}`}
                      className="flex-1 rounded-full border border-line-strong bg-surface px-2 py-1.5 text-center text-[12px] font-semibold text-ink-2 transition hover:bg-canvas"
                    >
                      Ver tiendas
                    </Link>
                    {ruteada ? (
                      <Link
                        href={`/despachos/${desp[0].id}`}
                        className="flex-1 rounded-full border border-line-strong bg-surface px-2 py-1.5 text-center text-[12px] font-semibold text-ink-2 transition hover:bg-canvas"
                      >
                        Ver despacho
                      </Link>
                    ) : (
                      <Link
                        href={`/planificador?carga=${a.id}`}
                        className="flex-1 rounded-full border border-amber-600 bg-amber px-2 py-1.5 text-center text-[12px] font-semibold text-white transition hover:bg-amber-600 hover:text-white"
                      >
                        Rutear
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}

            {sueltas > 0 && (
              <div className="flex flex-col rounded-[14px] border border-dashed border-line-strong bg-surface p-3.5">
                <div className="flex items-start gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-canvas text-base">
                    🗂️
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] font-bold tracking-tight">Sin archivo asociado</h3>
                    <p className="mt-0.5 text-[11.5px] text-ink-3">
                      Cargadas antes de que se registraran los archivos
                    </p>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center gap-2 border-t border-line pt-2.5">
                  <span className="num text-[18px] font-bold">
                    {sueltas.toLocaleString("es-PE")}
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-wide text-ink-3">
                    tiendas
                  </span>
                </div>
                <div className="mt-2.5 flex gap-1.5">
                  <Link
                    href="/tiendas/sin-archivo"
                    className="flex-1 rounded-full border border-line-strong bg-surface px-2 py-1.5 text-center text-[12px] font-semibold text-ink-2 transition hover:bg-canvas"
                  >
                    Ver tiendas
                  </Link>
                  <Link
                    href="/planificador?carga=sin-archivo"
                    className="flex-1 rounded-full border border-line-strong bg-surface px-2 py-1.5 text-center text-[12px] font-semibold text-ink-2 transition hover:bg-canvas"
                  >
                    Rutear
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="mt-4 text-[12px] text-ink-3">
          ¿Necesitas ver el acumulado de todo?{" "}
          <Link href="/tiendas/todas" className="font-semibold text-amber-600 underline underline-offset-2">
            Todas las tiendas activas
          </Link>
        </p>
      </div>
    </>
  );
}
