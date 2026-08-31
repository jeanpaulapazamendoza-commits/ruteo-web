import Link from "next/link";
import { notFound } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraSuperior, Pastilla, Tarjeta } from "@/components/ui";
import { estado as infoEstado, editable } from "@/lib/despachos";
import VistaDespacho, { type RutaGuardada } from "@/components/VistaDespacho";
import BorrarDespacho from "@/components/BorrarDespacho";
import PuntosSinAsignar, {
  type ParadaLibre,
  type RutaDestino,
} from "@/components/PuntosSinAsignar";
import AsignarRutas, {
  type RutaAsignable,
  type Conductor,
  type Vehiculo,
} from "@/components/AsignarRutas";

type Kpis = {
  rutas?: number; paradas?: number; bultos?: number;
  km?: number; duracion_min?: number; costo?: number;
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
    .select(
      "id, fecha, nombre, estado, cd_lat, cd_lon, parametros, kpis, creado_en, perfiles:creado_por(nombre), importaciones(nombre_archivo)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!despacho) notFound();

  const sinRutear = despacho.estado === "cargado";

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: rutasRaw }, { data: equipo }, { data: flota }, { data: yo }] = await Promise.all([
    supabase
      .from("rutas")
      .select(`id, indice, km, duracion_min, costo, salida_prog, fin_estimado, geometria,
               conductor_id, vehiculo_id, sin_asignar,
               paradas(id, orden, codigo, nombre, distrito, lat, lon, bultos, prioridad, eta, estado_entrega)`)
      .eq("despacho_id", id)
      .order("indice"),
    supabase
      .from("perfiles")
      .select("id, nombre")
      .eq("rol", "conductor")
      .eq("activo", true)
      .order("nombre"),
    supabase.from("vehiculos").select("id, nombre, placa").eq("activo", true).order("nombre"),
    supabase.from("perfiles").select("rol").eq("id", user?.id ?? "").maybeSingle(),
  ]);

  // La bandeja de puntos sin asignar no es una ruta de reparto: no se dibuja
  // en el mapa, no se asigna a nadie y no cuenta en los totales.
  const crudas = rutasRaw ?? [];
  const bandeja = crudas.find((r) => r.sin_asignar);
  const reales = crudas.filter((r) => !r.sin_asignar);

  const libres: ParadaLibre[] = [...(bandeja?.paradas ?? [])]
    .sort((a, b) => a.orden - b.orden)
    .map((p) => ({
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      distrito: p.distrito,
      bultos: p.bultos ?? 0,
    }));

  const destinos: RutaDestino[] = reales.map((r) => ({
    id: r.id,
    indice: r.indice,
    paradas: (r.paradas ?? []).length,
    bultos: (r.paradas ?? []).reduce((a, p) => a + (p.bultos ?? 0), 0),
  }));

  const rutas: RutaGuardada[] = reales.map((r) => ({
    ...r,
    geometria: (r.geometria as number[][] | null) ?? [],
    paradas: [...(r.paradas ?? [])].sort((a, b) => a.orden - b.orden),
  })) as RutaGuardada[];

  const asignables: RutaAsignable[] = reales.map((r) => ({
    id: r.id,
    indice: r.indice,
    paradas: (r.paradas ?? []).length,
    bultos: (r.paradas ?? []).reduce((a, p) => a + (p.bultos ?? 0), 0),
    km: r.km,
    conductor_id: r.conductor_id,
    vehiculo_id: r.vehiculo_id,
  }));

  const k = (despacho.kpis ?? {}) as Kpis;
  const params_ = (despacho.parametros ?? {}) as Record<string, unknown>;
  const autor = (despacho.perfiles as { nombre?: string } | null)?.nombre;
  const archivo = (despacho.importaciones as { nombre_archivo?: string } | null)?.nombre_archivo;
  const info = infoEstado(despacho.estado);
  const totalParadas = rutas.reduce((a, r) => a + r.paradas.length, 0);

  return (
    <>
      <BarraSuperior
        migaja={
          <Link href="/despachos" className="transition hover:text-ink">
            ← Despachos
          </Link>
        }
        titulo={despacho.nombre ?? "Despacho"}
        acciones={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-2">
            <Pastilla tono={info.tono}>{info.texto}</Pastilla>
            <span className="num">{despacho.fecha}</span>
            {archivo && <span className="num text-ink-3">📄 {archivo}</span>}
            {autor && <span className="text-ink-3">por {autor}</span>}
            {editable(despacho.estado) && (
              <Link
                href={`/planificador?despacho=${despacho.id}`}
                className="rounded-[9px] border border-amber-600 bg-amber px-3 py-1.5 text-[12.5px] font-semibold text-navy-900 transition hover:bg-amber-600 hover:text-white"
              >
                {sinRutear ? "◈ Rutear" : "◈ Añadir puntos o recalcular"}
              </Link>
            )}
            {yo?.rol === "admin" && (
              <BorrarDespacho
                despachoId={despacho.id}
                nombre={despacho.nombre ?? "Despacho"}
              />
            )}
            {!sinRutear && (
              <Link
                href={`/torre?despacho=${despacho.id}`}
                className="rounded-[9px] border border-line-strong bg-surface px-3 py-1.5 text-[12.5px] font-semibold transition hover:bg-canvas"
              >
                ◉ Seguir en vivo
              </Link>
            )}
          </div>
        }
      />

      {/* Resumen del documento */}
      <div className="flex flex-wrap gap-x-6 gap-y-1.5 border-b border-line bg-surface px-5 py-2.5 text-[12px] text-ink-2">
        <span>
          <b className="num text-ink">{sinRutear ? 0 : (k.rutas ?? rutas.length)}</b> rutas
        </span>
        <span>
          <b className="num text-ink">{(k.paradas ?? totalParadas).toLocaleString("es-PE")}</b> paradas
        </span>
        {k.bultos ? (
          <span>
            <b className="num text-ink">{k.bultos.toLocaleString("es-PE")}</b> bultos
          </span>
        ) : null}
        {!sinRutear && (
          <span>
            <b className="num text-ink">{(k.km ?? 0).toFixed(1)}</b> km
          </span>
        )}
        {k.costo ? (
          <span>
            <b className="num text-ink">S/ {k.costo.toFixed(2)}</b>
          </span>
        ) : null}
      </div>

      {libres.length > 0 && (
        <div className="px-4 pt-4">
          <PuntosSinAsignar
            despachoId={despacho.id}
            paradas={libres}
            rutas={destinos}
            editable={editable(despacho.estado)}
          />
        </div>
      )}

      {sinRutear ? (
        <div className="p-4">
          <Tarjeta className="mb-3 p-4">
            <h3 className="text-[14px] font-bold tracking-tight">
              Archivo cargado, todavía sin rutear
            </h3>
            <p className="mt-1 text-[13px] text-ink-2">
              Los <b className="num">{totalParadas.toLocaleString("es-PE")}</b> puntos ya
              están guardados. Ábrelo en el planificador para agrupar, calcular
              las rutas y dejarlo <b>Planificado</b>.
            </p>
            <Link
              href={`/planificador?despacho=${despacho.id}`}
              className="mt-3 inline-block rounded-[9px] border border-amber-600 bg-amber px-4 py-2 text-[13px] font-semibold text-navy-900 transition hover:bg-amber-600 hover:text-white"
            >
              ◈ Rutear este despacho
            </Link>
          </Tarjeta>

          {rutas.length > 0 && (
            <VistaDespacho
              rutas={rutas}
              cd={{
                lat: despacho.cd_lat ?? rutas[0]?.paradas[0]?.lat ?? -12.046374,
                lon: despacho.cd_lon ?? rutas[0]?.paradas[0]?.lon ?? -77.042793,
              }}
            />
          )}
        </div>
      ) : (
        <>
          <details className="border-b border-line bg-surface px-5 py-2.5" open>
            <summary className="cursor-pointer text-[12.5px] font-semibold text-ink-2">
              Asignación de conductores
            </summary>
            <div className="mt-3">
              <AsignarRutas
                despachoId={despacho.id}
                rutas={asignables}
                conductores={(equipo ?? []) as Conductor[]}
                vehiculos={(flota ?? []) as Vehiculo[]}
              />
            </div>
          </details>

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
      )}
    </>
  );
}
