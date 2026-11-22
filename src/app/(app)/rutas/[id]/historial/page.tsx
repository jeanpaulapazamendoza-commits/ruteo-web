import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { detalleRuta, eventosDeRuta, type EventoRuta } from "@/app/acciones/rutas";
import { BarraSuperior, Pastilla } from "@/components/ui";
import { fechaLarga, hora } from "@/lib/horas";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TIPO: Record<string, { texto: string; tono: "ok" | "warn" | "bad" | "live" | "plan" }> = {
  entregado: { texto: "Entregado", tono: "ok" },
  parcial: { texto: "Entrega parcial", tono: "warn" },
  reprogramado: { texto: "Reprogramado", tono: "warn" },
  fallido: { texto: "No entregado", tono: "bad" },
  pendiente: { texto: "Devuelto a pendiente", tono: "plan" },
  ruta_iniciada: { texto: "Salió a ruta", tono: "live" },
  ruta_terminada: { texto: "Ruta terminada", tono: "ok" },
};

/**
 * Lo que ha pasado en una ruta, de lo último a lo primero.
 *
 * Es el «Historial de ruta» de la referencia: una tarjeta por cada cosa que
 * ocurrió —la salida, cada orden gestionada, el cierre—, con la hora y quién
 * lo hizo. Sale del registro de eventos, que no se reescribe.
 */
export default async function PaginaHistorialRuta({
  params,
}: {
  // En Next 16 los parámetros de ruta llegan como promesa.
  params: Promise<{ id: string }>;
}) {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const [ruta, eventos] = await Promise.all([detalleRuta(id), eventosDeRuta(id)]);
  if (!ruta) notFound();

  const nombre = ruta.placa ?? `R-${String(ruta.indice + 1).padStart(2, "0")}`;

  // Un grupo por día: una ruta que cruza la medianoche se lee mejor partida.
  const dias: { dia: string; eventos: EventoRuta[] }[] = [];
  for (const e of eventos) {
    const dia = fechaLarga(e.ocurrido_en);
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.eventos.push(e);
    else dias.push({ dia, eventos: [e] });
  }

  return (
    <>
      <BarraSuperior
        migaja={
          <Link href={`/rutas/${id}`} className="transition hover:text-ink">
            ← Detalle de ruta · {nombre}
          </Link>
        }
        titulo="Historial de ruta"
      />

      <div className="flex flex-col gap-5">
        {eventos.length === 0 ? (
          <p className="rounded-[10px] border border-line px-5 py-6 text-[14px] text-ink-2">
            Todavía no ha pasado nada en esta ruta: el conductor no la ha iniciado ni ha
            gestionado ninguna orden.
          </p>
        ) : (
          dias.map((g) => (
            <section key={g.dia}>
              <h3 className="mb-3 text-[14px] font-bold text-ink">{g.dia}</h3>
              <ol className="relative ml-2 border-l-2 border-line pl-6">
                {g.eventos.map((e) => {
                  const t = TIPO[e.tipo] ?? { texto: e.tipo, tono: "plan" as const };
                  const deRuta = e.tipo === "ruta_iniciada" || e.tipo === "ruta_terminada";
                  const detalle =
                    (typeof e.datos?.subestado === "string" && e.datos.subestado) ||
                    (typeof e.datos?.motivo === "string" && e.datos.motivo) ||
                    null;
                  return (
                    <li key={e.id} className="relative mb-3 last:mb-0">
                      <span className="absolute -left-[33px] top-4 h-4 w-4 rounded-full border-2 border-amber bg-surface" />
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[8px] border border-line px-4 py-3">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-bold text-ink">
                            {deRuta ? (
                              t.texto
                            ) : (
                              <>
                                Pedido{" "}
                                {e.parada_id ? (
                                  <Link
                                    href={`/paradas/${e.parada_id}`}
                                    className="num font-semibold text-amber-600 underline underline-offset-2"
                                  >
                                    #{e.codigo ?? e.parada ?? "orden"}
                                  </Link>
                                ) : (
                                  <span className="num">#{e.codigo ?? "orden"}</span>
                                )}
                                {e.parada && e.codigo && (
                                  <span className="ml-2 font-normal text-ink-2">{e.parada}</span>
                                )}
                              </>
                            )}
                          </span>
                          <span className="mt-0.5 block text-[12.5px] text-ink-2">
                            Sucedió: <span className="num">{hora(e.ocurrido_en)}</span>
                            {e.autor && <> · {e.autor}</>}
                            {detalle && <> · {detalle}</>}
                            {e.datos?.corregida === true && <> · corrección</>}
                          </span>
                        </span>
                        {!deRuta && <Pastilla tono={t.tono}>{t.texto}</Pastilla>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))
        )}
      </div>
    </>
  );
}
