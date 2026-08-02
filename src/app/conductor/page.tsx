import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";

type RutaFila = {
  id: string;
  indice: number;
  km: number | null;
  salida_prog: string | null;
  salida_real: string | null;
  estado: string;
  despachos: { nombre: string | null; fecha: string; cd_lat: number | null; cd_lon: number | null } | null;
  paradas: { estado_entrega: string; bultos: number }[];
};

export default async function PaginaConductor() {
  const supabase = await crearClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // El RLS ya limita a las rutas del conductor; el filtro explícito deja
  // claro qué se pide y sirve también a un admin que quiera echar un vistazo.
  const { data } = await supabase
    .from("rutas")
    .select(
      `id, indice, km, salida_prog, salida_real, estado,
       despachos(nombre, fecha, cd_lat, cd_lon),
       paradas(estado_entrega, bultos)`,
    )
    .eq("conductor_id", user?.id ?? "")
    .eq("sin_asignar", false)
    .order("indice");

  // Una ruta pendiente se muestra siempre, tenga la fecha que tenga: un
  // reparto atrasado sigue siendo trabajo por hacer. Solo las ya terminadas
  // dejan de estorbar a los dos días.
  const rutas = ((data ?? []) as unknown as RutaFila[]).filter((r) => {
    const terminada = r.estado === "completada" || r.estado === "cancelada";
    return !terminada || (r.despachos?.fecha ?? "") >= hoyMenos(2);
  });

  if (!rutas.length) {
    return (
      <div className="rounded-[14px] border border-line bg-surface p-6 text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-[14px] bg-amber-050 text-2xl">
          🚚
        </div>
        <h2 className="text-[16px] font-bold tracking-tight">No tienes rutas asignadas</h2>
        <p className="mt-1.5 text-[13.5px] text-ink-2">
          Cuando el planificador te asigne una ruta, aparecerá aquí con todas
          sus paradas.
        </p>
      </div>
    );
  }

  return (
    <>
      <h1 className="mb-3 px-1 text-[17px] font-bold tracking-tight">Tus rutas</h1>
      <div className="flex flex-col gap-2.5">
        {rutas.map((r) => {
          const total = r.paradas.length;
          const cerradas = r.paradas.filter((p) => p.estado_entrega !== "pendiente").length;
          const bultos = r.paradas.reduce((a, p) => a + (p.bultos ?? 0), 0);
          const pct = total ? Math.round((cerradas / total) * 100) : 0;
          const terminada = total > 0 && cerradas === total;

          return (
            <Link
              key={r.id}
              href={`/conductor/${r.id}`}
              className="rounded-[14px] border border-line bg-surface p-3.5 transition active:bg-canvas"
            >
              <div className="flex items-center gap-2">
                <span className="rounded-[7px] bg-navy-800 px-2 py-1 text-[12px] font-bold text-white">
                  R-{String(r.indice + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                  {r.despachos?.nombre ?? "Despacho"}
                </span>
                <span className="num text-[12px] text-ink-3">{r.despachos?.fecha}</span>
              </div>

              <div className="mt-2 flex items-baseline gap-4">
                <div>
                  <div className="num text-[20px] font-bold leading-none">{total}</div>
                  <div className="text-[10.5px] font-bold uppercase tracking-wide text-ink-3">
                    paradas
                  </div>
                </div>
                <div>
                  <div className="num text-[20px] font-bold leading-none">{bultos}</div>
                  <div className="text-[10.5px] font-bold uppercase tracking-wide text-ink-3">
                    bultos
                  </div>
                </div>
                {r.km ? (
                  <div>
                    <div className="num text-[20px] font-bold leading-none">
                      {Number(r.km).toFixed(0)}
                    </div>
                    <div className="text-[10.5px] font-bold uppercase tracking-wide text-ink-3">
                      km
                    </div>
                  </div>
                ) : null}
                <div className="ml-auto text-right">
                  <div className={`num text-[20px] font-bold leading-none ${terminada ? "text-ok" : ""}`}>
                    {pct}%
                  </div>
                  <div className="num text-[10.5px] text-ink-3">
                    {cerradas}/{total}
                  </div>
                </div>
              </div>

              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas">
                <div
                  className={`h-full rounded-full ${terminada ? "bg-ok" : "bg-live"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div className="mt-2 text-[12px] text-ink-2">
                {r.salida_real ? (
                  <>
                    Salida marcada a las{" "}
                    <b className="num">
                      {new Date(r.salida_real).toLocaleTimeString("es-PE", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </b>
                  </>
                ) : (
                  <span className="font-semibold text-amber-600">
                    Sin iniciar · toca para confirmar tu ruta
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

/** Las rutas de días anteriores dejan de estorbar en la pantalla del móvil. */
function hoyMenos(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}
