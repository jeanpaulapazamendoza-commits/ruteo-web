import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraSuperior, Tarjeta, EstadoVacio, Pastilla } from "@/components/ui";
import ImportarTiendas from "@/components/ImportarTiendas";

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

function horaCorta(h: string | null) {
  return h ? h.slice(0, 5) : null;
}

export default async function PaginaTiendas() {
  const supabase = await crearClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data, error, count }, { data: perfil }] = await Promise.all([
    supabase.from("tiendas").select("*", { count: "exact" }).order("codigo").limit(200),
    supabase.from("perfiles").select("org_id").eq("id", user?.id ?? "").maybeSingle(),
  ]);

  const tiendas = (data ?? []) as Tienda[];

  return (
    <>
      <BarraSuperior migaja="Datos" titulo="Maestro de tiendas" />

      <div className="p-4">
        <div className="mb-4 flex flex-col items-start">
          <ImportarTiendas orgId={perfil?.org_id ?? null} />
        </div>
        {error && (
          <div className="mb-4 rounded-[10px] border border-bad/30 bg-bad-bg px-4 py-3 text-[13.5px] text-bad">
            No se pudieron leer las tiendas: {error.message}
          </div>
        )}

        <Tarjeta className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <h2 className="text-[13.5px] font-bold">Tiendas registradas</h2>
            <span className="rounded-full bg-amber-050 px-2.5 py-0.5 text-[11px] font-bold text-amber-600">
              {count ?? 0}
            </span>
            <p className="ml-auto text-[12px] text-ink-3">
              Se cargan una vez; dejas de re-subir el archivo en cada sesión.
            </p>
          </div>

          {tiendas.length === 0 ? (
            <EstadoVacio
              icono="🏪"
              titulo="Tu maestro está vacío"
              descripcion="Aquí vivirán tus puntos de entrega con sus coordenadas, ventana horaria y bultos habituales. Al importarlos quedan guardados para siempre."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
                <thead>
                  <tr>
                    {[
                      "Código",
                      "Tienda",
                      "Distrito",
                      "Bultos",
                      "Ventana",
                      "Coordenadas",
                      "Estado",
                    ].map((h) => (
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
                      <td className="num border-b border-line px-3 py-2.5 font-semibold">
                        {t.codigo}
                      </td>
                      <td className="border-b border-line px-3 py-2.5 font-semibold text-ink">
                        {t.nombre}
                        {t.prioridad > 0 && (
                          <span className="ml-2 text-amber-600">
                            ⭐ P{t.prioridad}
                          </span>
                        )}
                      </td>
                      <td className="border-b border-line px-3 py-2.5 text-ink-2">
                        {t.distrito ?? "—"}
                      </td>
                      <td className="num border-b border-line px-3 py-2.5 text-ink-2">
                        {t.bultos_default}
                      </td>
                      <td className="num border-b border-line px-3 py-2.5 text-ink-2">
                        {horaCorta(t.ventana_ini) && horaCorta(t.ventana_fin)
                          ? `${horaCorta(t.ventana_ini)}–${horaCorta(t.ventana_fin)}`
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
      </div>
    </>
  );
}
