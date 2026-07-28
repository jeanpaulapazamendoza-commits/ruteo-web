import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraSuperior, Tarjeta, EstadoVacio, Pastilla } from "@/components/ui";

type Kpis = {
  rutas?: number;
  paradas?: number;
  bultos?: number;
  km?: number;
  duracion_min?: number;
  costo?: number;
};

const TONO: Record<string, "ok" | "live" | "warn" | "plan" | "bad"> = {
  borrador: "plan",
  planificado: "live",
  en_curso: "warn",
  cerrado: "ok",
  anulado: "bad",
};

function fechaLarga(f: string) {
  const [a, m, d] = f.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-PE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function PaginaDespachos() {
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .from("despachos")
    .select("id, fecha, nombre, estado, kpis, creado_en, perfiles:creado_por(nombre)")
    .order("creado_en", { ascending: false })
    .limit(100);

  const despachos = data ?? [];

  const acumulado = despachos.reduce(
    (a, d) => {
      const k = (d.kpis ?? {}) as Kpis;
      return {
        km: a.km + (k.km ?? 0),
        paradas: a.paradas + (k.paradas ?? 0),
        costo: a.costo + (k.costo ?? 0),
      };
    },
    { km: 0, paradas: 0, costo: 0 },
  );

  return (
    <>
      <BarraSuperior
        migaja="Operación"
        titulo="Despachos guardados"
        acciones={
          <Link
            href="/planificador"
            className="rounded-[9px] border border-amber-600 bg-amber px-3.5 py-2 text-[13px] font-semibold text-[#231403] transition hover:bg-amber-600 hover:text-white"
          >
            ◈ Planificar uno nuevo
          </Link>
        }
      />

      <div className="p-4">
        {error && (
          <div className="mb-4 rounded-[10px] border border-bad/30 bg-bad-bg px-4 py-3 text-[13.5px] text-bad">
            No se pudo leer el histórico: {error.message}
          </div>
        )}

        {despachos.length === 0 ? (
          <Tarjeta>
            <EstadoVacio
              icono="📅"
              titulo="Todavía no has guardado ningún despacho"
              descripcion="Cuando optimices las rutas del día y pulses «Guardar despacho», quedará aquí con su mapa, sus paradas y la configuración con la que se calculó."
              accion={
                <Link
                  href="/planificador"
                  className="inline-block rounded-[9px] border border-amber-600 bg-amber px-4 py-2.5 text-[13.5px] font-semibold text-[#231403] transition hover:bg-amber-600 hover:text-white"
                >
                  Ir al planificador
                </Link>
              }
            />
          </Tarjeta>
        ) : (
          <>
            <p className="mb-3 text-[12.5px] text-ink-2">
              <b className="num">{despachos.length}</b> despachos ·{" "}
              <b className="num">{acumulado.paradas.toLocaleString("es-PE")}</b> paradas ·{" "}
              <b className="num">{acumulado.km.toFixed(0)}</b> km acumulados
              {acumulado.costo > 0 && (
                <>
                  {" "}
                  · <b className="num">S/ {acumulado.costo.toFixed(2)}</b>
                </>
              )}
            </p>

            <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              {despachos.map((d) => {
                const k = (d.kpis ?? {}) as Kpis;
                const autor = (d.perfiles as { nombre?: string } | null)?.nombre;
                return (
                  <Link
                    key={d.id}
                    href={`/despachos/${d.id}`}
                    className="rounded-[14px] border border-line bg-surface p-3.5 transition hover:border-line-strong hover:shadow-[0_2px_10px_rgba(16,27,43,0.07)]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="num text-[12px] font-bold text-ink-2">
                        {fechaLarga(d.fecha)}
                      </span>
                      <span className="ml-auto">
                        <Pastilla tono={TONO[d.estado] ?? "plan"}>{d.estado}</Pastilla>
                      </span>
                    </div>

                    <h3 className="mt-1.5 text-[14.5px] font-bold tracking-tight">
                      {d.nombre ?? "Despacho sin nombre"}
                    </h3>

                    <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-line pt-2.5">
                      <Mini etiqueta="Rutas" valor={k.rutas ?? 0} />
                      <Mini etiqueta="Paradas" valor={k.paradas ?? 0} />
                      <Mini etiqueta="Km" valor={Number((k.km ?? 0).toFixed(1))} />
                    </div>

                    <div className="mt-2 flex items-center gap-2 text-[11.5px] text-ink-3">
                      {k.bultos ? <span className="num">{k.bultos} bultos</span> : null}
                      {k.costo ? (
                        <span className="num">· S/ {k.costo.toFixed(2)}</span>
                      ) : null}
                      {autor && <span className="ml-auto truncate">{autor}</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Mini({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div>
      <div className="num text-[16px] font-bold leading-none">
        {valor.toLocaleString("es-PE")}
      </div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-3">
        {etiqueta}
      </div>
    </div>
  );
}
