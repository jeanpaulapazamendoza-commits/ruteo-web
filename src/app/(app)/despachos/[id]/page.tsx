import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { comoUsuario, unaFila } from "@/lib/db";
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
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");
  const usuario = sesion.user.id;

  const despacho = await unaFila<{
    id: string;
    fecha: string;
    nombre: string | null;
    estado: string;
    cd_lat: number | null;
    cd_lon: number | null;
    parametros: Record<string, unknown> | null;
    kpis: Kpis | null;
    creado_en: string;
    autor: string | null;
    archivo: string | null;
  }>(
    usuario,
    `select d.id, d.fecha, d.nombre, d.estado, d.cd_lat, d.cd_lon,
            d.parametros, d.kpis, d.creado_en,
            a.nombre as autor, i.nombre_archivo as archivo
       from despachos d
       left join perfiles a on a.id = d.creado_por
       left join importaciones i on i.id = d.importacion_id
      where d.id = $1`,
    [id],
  );

  if (!despacho) notFound();

  const sinRutear = despacho.estado === "cargado";

  type RutaCruda = RutaGuardada & {
    conductor_id: string | null;
    vehiculo_id: string | null;
    sin_asignar: boolean;
  };

  const [crudas, equipo, flota, yo] = await Promise.all([
    // Las paradas vienen agregadas en JSON por ruta: una sola consulta en vez
    // de una por ruta, y ya ordenadas desde la base.
    comoUsuario<RutaCruda>(
      usuario,
      `select r.id, r.indice, r.km, r.duracion_min, r.costo, r.salida_prog,
              r.fin_estimado, r.geometria, r.conductor_id, r.vehiculo_id,
              r.sin_asignar,
              coalesce(
                (select json_agg(x order by x.orden)
                   from (select p.id, p.orden, p.codigo, p.nombre, p.distrito,
                                p.lat, p.lon, p.bultos, p.prioridad, p.eta,
                                p.estado_entrega
                           from paradas p
                          where p.ruta_id = r.id) x),
                '[]'::json
              ) as paradas
         from rutas r
        where r.despacho_id = $1
        order by r.indice`,
      [id],
    ),
    comoUsuario<Conductor>(
      usuario,
      `select id, nombre from perfiles
        where rol = 'conductor' and activo
        order by nombre`,
    ),
    comoUsuario<Vehiculo>(
      usuario,
      "select id, nombre, placa from vehiculos where activo order by nombre",
    ),
    unaFila<{ rol: string }>(usuario, "select rol from perfiles where id = $1", [
      usuario,
    ]),
  ]);

  // La bandeja de puntos sin asignar no es una ruta de reparto: no se dibuja
  // en el mapa, no se asigna a nadie y no cuenta en los totales.
  const bandeja = crudas.find((r) => r.sin_asignar);
  const reales = crudas.filter((r) => !r.sin_asignar);

  const libres: ParadaLibre[] = (bandeja?.paradas ?? []).map((p) => ({
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
    geometria: r.geometria ?? [],
    paradas: r.paradas ?? [],
  }));

  const asignables: RutaAsignable[] = reales.map((r) => ({
    id: r.id,
    indice: r.indice,
    paradas: (r.paradas ?? []).length,
    bultos: (r.paradas ?? []).reduce((a, p) => a + (p.bultos ?? 0), 0),
    km: r.km,
    conductor_id: r.conductor_id,
    vehiculo_id: r.vehiculo_id,
  }));

  const k = despacho.kpis ?? {};
  const params_ = despacho.parametros ?? {};
  const autor = despacho.autor;
  const archivo = despacho.archivo;
  const info = infoEstado(despacho.estado);
  const totalParadas = rutas.reduce((a, r) => a + r.paradas.length, 0);
  // Un despacho recién cargado tiene todos sus puntos en la bandeja y ninguna
  // ruta de reparto: contar solo las rutas diría «0 puntos» con el archivo
  // entero guardado.
  const totalPuntos = totalParadas + libres.length;

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
                className="rounded-full border border-amber-600 bg-amber px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-amber-600 hover:text-white"
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
                className="rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[12.5px] font-semibold transition hover:bg-canvas"
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
          <b className="num text-ink">{(k.paradas ?? totalPuntos).toLocaleString("es-PE")}</b> paradas
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
              Los <b className="num">{(k.paradas ?? totalPuntos).toLocaleString("es-PE")}</b> puntos ya
              están guardados. Ábrelo en el planificador para agrupar, calcular
              las rutas y dejarlo <b>Planificado</b>.
            </p>
            <Link
              href={`/planificador?despacho=${despacho.id}`}
              className="mt-3 inline-block rounded-full border border-amber-600 bg-amber px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-amber-600 hover:text-white"
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
                conductores={equipo}
                vehiculos={flota}
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
