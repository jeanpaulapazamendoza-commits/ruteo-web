import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraSuperior, Tarjeta, EstadoVacio } from "@/components/ui";
import Planificador from "@/components/Planificador";
import type { TiendaMapa } from "@/lib/motor";

export default async function PaginaPlanificador() {
  const supabase = await crearClienteServidor();

  const { data } = await supabase
    .from("tiendas")
    .select("id, codigo, nombre, distrito, lat, lon, bultos_default, prioridad, ventana_ini, ventana_fin")
    .eq("activo", true)
    .order("codigo")
    .limit(5000);

  const tiendas: TiendaMapa[] = (data ?? []).map((t) => ({
    id: t.id,
    codigo: t.codigo,
    nombre: t.nombre,
    distrito: t.distrito,
    lat: t.lat,
    lon: t.lon,
    bultos: t.bultos_default ?? 1,
    prioridad: t.prioridad ?? 0,
    ventana_ini: t.ventana_ini ? String(t.ventana_ini).slice(0, 5) : null,
    ventana_fin: t.ventana_fin ? String(t.ventana_fin).slice(0, 5) : null,
  }));

  const bultos = tiendas.reduce((a, t) => a + t.bultos, 0);
  const conVentana = tiendas.filter((t) => t.ventana_ini && t.ventana_fin).length;
  const prioritarias = tiendas.filter((t) => t.prioridad > 0).length;

  return (
    <>
      <BarraSuperior
        migaja="Despachos / Hoy"
        titulo="Planificación del día"
        acciones={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
            <span><b className="num text-ink">{tiendas.length.toLocaleString("es-PE")}</b> tiendas</span>
            <span><b className="num text-ink">{bultos.toLocaleString("es-PE")}</b> bultos</span>
            {conVentana > 0 && <span><b className="num text-ink">{conVentana}</b> con ventana</span>}
            {prioritarias > 0 && <span className="text-amber-600">⭐ <b className="num">{prioritarias}</b> prioritarias</span>}
          </div>
        }
      />

      {tiendas.length === 0 ? (
        <div className="p-4">
          <Tarjeta>
            <EstadoVacio
              icono="🗺️"
              titulo="Aún no hay tiendas cargadas"
              descripcion="Importa tu maestro una sola vez y quedará guardado. Después solo ajustas la carga del día y optimizas."
              accion={
                <Link
                  href="/tiendas"
                  className="inline-block rounded-[9px] border border-amber-600 bg-amber px-4 py-2.5 text-[13.5px] font-semibold text-[#231403] transition hover:bg-amber-600 hover:text-white"
                >
                  Importar tiendas
                </Link>
              }
            />
          </Tarjeta>
        </div>
      ) : (
        <Planificador tiendas={tiendas} />
      )}
    </>
  );
}
