import Link from "next/link";
import { notFound } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraSuperior, Pastilla } from "@/components/ui";
import VistaDespacho, { type RutaGuardada } from "@/components/VistaDespacho";

type Kpis = {
  rutas?: number; paradas?: number; bultos?: number;
  km?: number; duracion_min?: number; costo?: number;
};

const TONO: Record<string, "ok" | "live" | "warn" | "plan" | "bad"> = {
  borrador: "plan", planificado: "live", en_curso: "warn",
  cerrado: "ok", anulado: "bad",
};

const ETIQUETA: Record<string, string> = {
  modo: "Modo", criterio: "Criterio", capacidad: "Capacidad",
  k: "Grupos (K)", vueltas: "Vueltas", uso_flota: "Uso de flota",
  motor: "Motor", cerrado: "Recorrido cerrado", hora_salida: "Hora de salida",
  servicio_min: "Min. por parada", servicio_min_bulto: "Min. por bulto",
  jornada_h: "Jornada (h)", costo_fijo: "Costo fijo", costo_km: "Costo por km",
  tiempo_tsp: "Seg. de optimización",
};

export default async function PaginaDespacho({
  params,
}: {
  // En Next 16 los parámetros de ruta llegan como promesa.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await crearClienteServidor();

  const { data: despacho } = await supabase
    .from("despachos")
    .select("id, fecha, nombre, estado, cd_lat, cd_lon, parametros, kpis, creado_en, perfiles:creado_por(nombre)")
    .eq("id", id)
    .maybeSingle();

  if (!despacho) notFound();

  const { data: rutasRaw } = await supabase
    .from("rutas")
    .select(`id, indice, km, duracion_min, costo, salida_prog, fin_estimado, geometria,
             paradas(id, orden, codigo, nombre, distrito, lat, lon, bultos, prioridad, eta, estado_entrega)`)
    .eq("despacho_id", id)
    .order("indice");

  const rutas: RutaGuardada[] = (rutasRaw ?? []).map((r) => ({
    ...r,
    geometria: (r.geometria as number[][] | null) ?? [],
    paradas: [...(r.paradas ?? [])].sort((a, b) => a.orden - b.orden),
  })) as RutaGuardada[];

  const k = (despacho.kpis ?? {}) as Kpis;
  const params_ = (despacho.parametros ?? {}) as Record<string, unknown>;
  const autor = (despacho.perfiles as { nombre?: string } | null)?.nombre;

  return (
    <>
      <BarraSuperior
        migaja={
          <>
            <Link href="/despachos" className="hover:underline">Despachos</Link>
            {" / "}
            {despacho.fecha}
          </>
        }
        titulo={despacho.nombre ?? "Despacho"}
        acciones={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
            <Pastilla tono={TONO[despacho.estado] ?? "plan"}>{despacho.estado}</Pastilla>
            <span><b className="num text-ink">{k.rutas ?? rutas.length}</b> rutas</span>
            <span><b className="num text-ink">{k.paradas ?? 0}</b> paradas</span>
            <span><b className="num text-ink">{(k.km ?? 0).toFixed(1)}</b> km</span>
            {k.costo ? <span><b className="num text-ink">S/ {k.costo.toFixed(2)}</b></span> : null}
            {autor && <span className="text-ink-3">por {autor}</span>}
          </div>
        }
      />

      {Object.keys(params_).length > 0 && (
        <details className="border-b border-line bg-surface px-5 py-2.5">
          <summary className="cursor-pointer text-[12.5px] font-semibold text-ink-2">
            Configuración con la que se calculó
          </summary>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {Object.entries(params_)
              .filter(([, v]) => v !== null && v !== "" && typeof v !== "object")
              .map(([clave, valor]) => (
                <span
                  key={clave}
                  className="rounded-full border border-line bg-canvas px-2.5 py-1 text-[11.5px] text-ink-2"
                >
                  {ETIQUETA[clave] ?? clave}:{" "}
                  <b className="num text-ink">
                    {typeof valor === "boolean" ? (valor ? "sí" : "no") : String(valor)}
                  </b>
                </span>
              ))}
          </div>
        </details>
      )}

      {rutas.length === 0 ? (
        <div className="p-6 text-[13.5px] text-ink-2">
          Este despacho no tiene rutas guardadas.
        </div>
      ) : (
        <VistaDespacho
          rutas={rutas}
          cd={{
            lat: despacho.cd_lat ?? rutas[0]?.paradas[0]?.lat ?? -12.046374,
            lon: despacho.cd_lon ?? rutas[0]?.paradas[0]?.lon ?? -77.042793,
          }}
        />
      )}
    </>
  );
}
