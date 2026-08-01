import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraSuperior, Tarjeta, EstadoVacio, Pastilla } from "@/components/ui";
import TorreControl, { type ParadaSeguimiento } from "@/components/TorreControl";

/** Una línea por despacho, tal como la devuelve `resumen_despachos()`. */
type ResumenDespacho = {
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
};

function fechaLarga(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function PaginaTorre({
  searchParams,
}: {
  // En Next 16 también searchParams llega como promesa.
  searchParams: Promise<{ despacho?: string }>;
}) {
  const { despacho: elegido } = await searchParams;
  const supabase = await crearClienteServidor();

  const { data } = await supabase.rpc("resumen_despachos");
  const lista = (data ?? []) as ResumenDespacho[];

  if (!lista.length) {
    return (
      <>
        <BarraSuperior migaja="Operación" titulo="Torre de control" />
        <div className="p-4">
          <Tarjeta>
            <EstadoVacio
              icono="◉"
              titulo="No hay despachos que seguir"
              descripcion="La torre de control muestra en vivo lo que tus conductores van marcando. Primero planifica y guarda un despacho."
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
        </div>
      </>
    );
  }

  const activo = elegido ? lista.find((d) => d.id === elegido) : null;

  // ── Listado: una línea por despacho, sin desplegar nada ──────────────────
  if (!activo) {
    const enCurso = lista.filter((d) => d.entregadas + d.fallidas + d.reprogramadas > 0);

    return (
      <>
        <BarraSuperior
          migaja="Operación"
          titulo="Torre de control"
          acciones={
            <span className="text-[12px] text-ink-2">
              <b className="num text-ink">{lista.length}</b> despachos
              {enCurso.length > 0 && (
                <>
                  {" · "}
                  <b className="num text-live">{enCurso.length}</b> con movimiento
                </>
              )}
            </span>
          }
        />

        <div className="p-4">
          <p className="mb-3 text-[12.5px] text-ink-2">
            Elige un despacho para seguir sus rutas en vivo.
          </p>

          <div className="flex flex-col gap-2">
            {lista.map((d) => {
              const cerradas = d.entregadas + d.fallidas + d.reprogramadas;
              const pct = d.paradas ? Math.round((cerradas / d.paradas) * 100) : 0;
              const terminado = d.paradas > 0 && cerradas === d.paradas;
              return (
                <Link
                  key={d.id}
                  href={`/torre?despacho=${d.id}`}
                  className="group flex flex-wrap items-center gap-x-5 gap-y-2.5 rounded-[14px] border border-line bg-surface px-4 py-3 transition hover:border-line-strong hover:bg-canvas"
                >
                  {/* Identidad: qué es, de cuándo, de quién y de qué archivo */}
                  <div className="min-w-[220px] flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-bold tracking-tight">
                        {d.nombre ?? "Despacho"}
                      </span>
                      {cerradas === 0 ? (
                        <Pastilla tono="plan">sin iniciar</Pastilla>
                      ) : terminado ? (
                        <Pastilla tono="ok">completado</Pastilla>
                      ) : (
                        <Pastilla tono="live">en ruta</Pastilla>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-ink-3">
                      <span className="num">{fechaLarga(d.fecha)}</span>
                      {d.autor && <> · {d.autor}</>}
                      {d.archivo && <> · 📄 <span className="num">{d.archivo}</span></>}
                    </div>
                  </div>

                  {/* Tamaño del despacho */}
                  <div className="flex shrink-0 gap-5 text-[11px] uppercase tracking-wide text-ink-3">
                    <div>
                      <div className="num text-[16px] font-bold normal-case tracking-tight text-ink">
                        {d.rutas}
                      </div>
                      rutas
                    </div>
                    <div>
                      <div className="num text-[16px] font-bold normal-case tracking-tight text-ink">
                        {d.paradas.toLocaleString("es-PE")}
                      </div>
                      paradas
                    </div>
                    <div>
                      <div className="num text-[16px] font-bold normal-case tracking-tight text-ink">
                        {d.bultos.toLocaleString("es-PE")}
                      </div>
                      bultos
                    </div>
                  </div>

                  {/* Avance */}
                  <div className="w-[168px] shrink-0">
                    <div className="flex items-baseline justify-between text-[11.5px] text-ink-3">
                      <span className="num font-bold text-ink">{pct}%</span>
                      <span className="num">
                        {cerradas}/{d.paradas} cerradas
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas group-hover:bg-surface-2">
                      <div
                        className={`h-full rounded-full ${terminado ? "bg-ok" : "bg-live"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {d.fallidas > 0 && (
                      <div className="num mt-1 text-[11px] font-semibold text-bad">
                        {d.fallidas} fallidas
                      </div>
                    )}
                  </div>

                  <span className="shrink-0 text-[13px] text-ink-3 transition group-hover:text-ink">
                    →
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  // ── Detalle: seguimiento en vivo del despacho elegido ────────────────────
  const { data: paradas } = await supabase
    .from("paradas")
    .select(
      `id, orden, codigo, nombre, distrito, bultos, prioridad, eta,
       estado_entrega, hora_entrega, motivo, foto_url, observaciones, recibe,
       rutas!inner(indice, despacho_id)`,
    )
    .eq("rutas.despacho_id", activo.id)
    .order("orden");

  return (
    <>
      <BarraSuperior
        migaja={
          <Link href="/torre" className="transition hover:text-ink">
            ← Todos los despachos
          </Link>
        }
        titulo={activo.nombre ?? "Despacho"}
        acciones={
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-ink-3">
              {fechaLarga(activo.fecha)}
              {activo.autor && <> · {activo.autor}</>}
              {activo.archivo && <> · 📄 {activo.archivo}</>}
            </span>
            <Link
              href={`/despachos/${activo.id}`}
              className="rounded-[9px] border border-line-strong bg-surface px-3 py-1.5 text-[12.5px] font-semibold transition hover:bg-canvas"
            >
              Ver planificación
            </Link>
          </div>
        }
      />

      <TorreControl
        despachoId={activo.id}
        inicial={(paradas ?? []) as unknown as ParadaSeguimiento[]}
      />
    </>
  );
}
