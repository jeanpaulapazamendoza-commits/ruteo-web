import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraSuperior, Tarjeta, EstadoVacio, Pastilla } from "@/components/ui";
import { estado as infoEstado, ESTADOS } from "@/lib/despachos";

type Fila = {
  id: string;
  nombre: string | null;
  fecha: string;
  estado: string;
  creado_en: string;
  autor: string | null;
  archivo: string | null;
  rutas: number;
  paradas: number;
  entregadas: number;
  fallidas: number;
  reprogramadas: number;
  bultos: number;
  km: number;
  costo: number;
  sin_conductor: number;
};

function fechaCorta(f: string) {
  const [a, m, d] = f.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
  });
}

export default async function PaginaDespachos({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado: filtro } = await searchParams;
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase.rpc("resumen_despachos");
  const todos = (data ?? []) as Fila[];
  const despachos = filtro ? todos.filter((d) => d.estado === filtro) : todos;

  const cuenta = (e: string) => todos.filter((d) => d.estado === e).length;
  const conteos = (Object.keys(ESTADOS) as (keyof typeof ESTADOS)[])
    .map((e) => ({ clave: e, ...ESTADOS[e], n: cuenta(e) }))
    .filter((e) => e.n > 0);

  return (
    <>
      <BarraSuperior
        migaja="Operación"
        titulo="Despachos"
        acciones={
          <Link
            href="/planificador"
            className="rounded-[9px] border border-amber-600 bg-amber px-3.5 py-2 text-[13px] font-semibold text-[#231403] transition hover:bg-amber-600 hover:text-white"
          >
            ⇪ Subir archivo del día
          </Link>
        }
      />

      <div className="p-4">
        {error && (
          <div className="mb-4 rounded-[10px] border border-bad/30 bg-bad-bg px-4 py-3 text-[13.5px] text-bad">
            No se pudo leer el histórico: {error.message}
          </div>
        )}

        {todos.length === 0 ? (
          <Tarjeta>
            <EstadoVacio
              icono="📅"
              titulo="Todavía no hay despachos"
              descripcion="Sube el archivo del día en el planificador. Quedará aquí como «Cargado sin ruteo» y lo irás llevando por sus estados hasta el reparto."
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
            {/* Filtro por estado: el ciclo de vida a la vista */}
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <Filtro href="/despachos" activo={!filtro} texto="Todos" n={todos.length} />
              {conteos.map((e) => (
                <Filtro
                  key={e.clave}
                  href={`/despachos?estado=${e.clave}`}
                  activo={filtro === e.clave}
                  texto={e.texto}
                  n={e.n}
                />
              ))}
            </div>

            <Tarjeta className="overflow-hidden">
              {despachos.map((d, i) => {
                const info = infoEstado(d.estado);
                const cerradas = d.entregadas + d.fallidas + d.reprogramadas;
                const pct = d.paradas ? Math.round((cerradas / d.paradas) * 100) : 0;
                return (
                  <Link
                    key={d.id}
                    href={`/despachos/${d.id}`}
                    className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 transition hover:bg-canvas ${
                      i > 0 ? "border-t border-line" : ""
                    }`}
                  >
                    <span className="num w-[52px] shrink-0 text-[12px] font-semibold text-ink-3">
                      {fechaCorta(d.fecha)}
                    </span>

                    <span className="min-w-[200px] flex-1 truncate text-[13.5px] font-semibold">
                      {d.nombre ?? "Despacho"}
                      {d.archivo && (
                        <span className="num ml-2 text-[11.5px] font-normal text-ink-3">
                          📄 {d.archivo}
                        </span>
                      )}
                    </span>

                    <span className="w-[132px] shrink-0">
                      <Pastilla tono={info.tono}>{info.texto}</Pastilla>
                    </span>

                    {/* Un despacho sin rutear guarda sus puntos en una ruta
                        contenedora que no cuenta como ruta de reparto. */}
                    <span className="num w-[56px] shrink-0 text-right text-[12.5px]">
                      {d.estado === "cargado" ? (
                        <span className="text-ink-3">—</span>
                      ) : (
                        <>
                          {d.rutas}
                          <span className="ml-1 text-[10.5px] text-ink-3">rut</span>
                        </>
                      )}
                    </span>
                    <span className="num w-[76px] shrink-0 text-right text-[12.5px]">
                      {d.paradas.toLocaleString("es-PE")}
                      <span className="ml-1 text-[10.5px] text-ink-3">par</span>
                    </span>
                    <span className="num w-[76px] shrink-0 text-right text-[12.5px] text-ink-2">
                      {d.km > 0 ? `${Number(d.km).toFixed(0)} km` : "—"}
                    </span>

                    <span className="w-[104px] shrink-0 text-right text-[11.5px]">
                      {d.estado === "cargado" ? (
                        <span className="text-ink-3">sin rutear</span>
                      ) : cerradas > 0 ? (
                        <span className="num font-semibold">{pct}% entregado</span>
                      ) : d.sin_conductor > 0 && d.rutas > 0 ? (
                        <span className="num text-warn">
                          {d.sin_conductor} sin conductor
                        </span>
                      ) : (
                        <span className="text-ok">listo para salir</span>
                      )}
                    </span>

                    <span className="w-[104px] shrink-0 truncate text-right text-[11.5px] text-ink-3">
                      {d.autor ?? ""}
                    </span>
                  </Link>
                );
              })}

              {despachos.length === 0 && (
                <p className="px-4 py-6 text-center text-[13px] text-ink-3">
                  Ningún despacho en ese estado.
                </p>
              )}
            </Tarjeta>
          </>
        )}
      </div>
    </>
  );
}

function Filtro({
  href,
  activo,
  texto,
  n,
}: {
  href: string;
  activo: boolean;
  texto: string;
  n: number;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition ${
        activo
          ? "border-ink bg-ink text-surface"
          : "border-line-strong bg-surface text-ink-2 hover:bg-canvas"
      }`}
    >
      {texto} <span className="num opacity-70">{n}</span>
    </Link>
  );
}
