import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraSuperior, Tarjeta, EstadoVacio } from "@/components/ui";
import TorreControl, { type ParadaSeguimiento } from "@/components/TorreControl";

export default async function PaginaTorre({
  searchParams,
}: {
  // En Next 16 también searchParams llega como promesa.
  searchParams: Promise<{ despacho?: string }>;
}) {
  const { despacho: elegido } = await searchParams;
  const supabase = await crearClienteServidor();

  const { data: despachos } = await supabase
    .from("despachos")
    .select("id, nombre, fecha, estado")
    .order("creado_en", { ascending: false })
    .limit(30);

  const lista = despachos ?? [];
  const activo = lista.find((d) => d.id === elegido) ?? lista[0];

  if (!activo) {
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
        migaja="Operación"
        titulo="Torre de control"
        acciones={
          <div className="flex items-center gap-2">
            {/* Formulario GET: cambia el ?despacho= sin necesidad de JS */}
            {lista.length > 1 && (
              <form>
                <select
                  name="despacho"
                  defaultValue={activo.id}
                  className="rounded-[9px] border border-line-strong bg-surface px-2.5 py-1.5 text-[12.5px]"
                >
                  {lista.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.fecha} — {d.nombre ?? "Despacho"}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="ml-1.5 rounded-[9px] border border-line-strong bg-surface px-2.5 py-1.5 text-[12.5px] font-semibold transition hover:bg-canvas"
                >
                  Ver
                </button>
              </form>
            )}
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
