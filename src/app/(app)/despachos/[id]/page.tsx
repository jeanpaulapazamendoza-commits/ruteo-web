import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { comoUsuario, unaFila } from "@/lib/db";
import { BarraSuperior, Pastilla, Tarjeta } from "@/components/ui";
import { estado as infoEstado, editable, admiteOrdenes } from "@/lib/despachos";
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
import NuevaOrden from "@/components/NuevaOrden";
import HistorialPlanes from "@/components/HistorialPlanes";
import { planesDeDespacho } from "@/app/acciones/planes";
import { asegurarTrazados } from "@/lib/trazado";

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

  // Las rutas sin recorrido dibujado (paradas movidas a mano, despachos sin
  // planificar) se trazan por calles antes de leerlas.
  await asegurarTrazados(usuario, { despacho: id });

  type RutaCruda = RutaGuardada & {
    conductor_id: string | null;
    vehiculo_id: string | null;
    sin_asignar: boolean;
    base_nombre: string | null;
    base_lat: number | null;
    base_lon: number | null;
  };

  const [crudas, equipo, flota, yo, planes] = await Promise.all([
    // Las paradas vienen agregadas en JSON por ruta: una sola consulta en vez
    // de una por ruta, y ya ordenadas desde la base.
    comoUsuario<RutaCruda>(
      usuario,
      `select r.id, r.indice, r.km, r.duracion_min, r.costo, r.salida_prog,
              r.fin_estimado, r.geometria, r.conductor_id, r.vehiculo_id,
              r.sin_asignar, r.base_nombre, r.base_lat, r.base_lon,
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
      `select id, nombre, placa, capacidad_bultos, conductor_id
         from vehiculos where activo order by nombre`,
    ),
    unaFila<{ rol: string }>(usuario, "select rol from perfiles where id = $1", [
      usuario,
    ]),
    // Un conductor no ve el historial (el RLS no le devuelve nada); si la
    // consulta falla, la ficha se abre igual sin él.
    planesDeDespacho(id).catch(() => []),
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

  // Las bases de las que salen rutas de este despacho, sin repetir.
  const basesDespacho = [
    ...new Map(
      reales
        .filter((r) => r.base_lat != null && r.base_lon != null)
        .map((r) => [
          `${r.base_lat},${r.base_lon}`,
          { nombre: r.base_nombre ?? "Base", lat: r.base_lat!, lon: r.base_lon! },
        ]),
    ).values(),
  ];

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
    base: r.base_lat != null && r.base_lon != null ? (r.base_nombre ?? "Base") : null,
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
            {!sinRutear && admiteOrdenes(despacho.estado) && yo?.rol !== "conductor" && (
              <Link
                href={`/despachos/${despacho.id}/editar`}
                className="rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[12.5px] font-semibold transition hover:bg-canvas"
              >
                ✎ Editar rutas
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

      {/* Todo el cuerpo va en un solo bloque: el lienzo convierte cada hijo
          directo en una franja del panel y le quita el relleno vertical, y
          con una franja por sección quedaban todas pegadas. Dentro de este
          bloque los espacios son los de siempre. */}
      <div className="flex flex-col gap-5">
        {/* Resumen del documento */}
        <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
          <Cifra valor={sinRutear ? 0 : (k.rutas ?? rutas.length)} texto="rutas" />
          <Cifra valor={(k.paradas ?? totalPuntos).toLocaleString("es-PE")} texto="paradas" />
          {k.bultos ? <Cifra valor={k.bultos.toLocaleString("es-PE")} texto="bultos" /> : null}
          {!sinRutear && <Cifra valor={(k.km ?? 0).toFixed(1)} texto="km" />}
          {k.costo ? <Cifra valor={`S/ ${k.costo.toFixed(2)}`} texto="costo" /> : null}
        </div>

        {/* Una orden que llega con el reparto ya armado: entra en la bandeja
            y desde ahí se le busca hueco. Antes de rutear no hace falta: el
            planificador ya deja añadir puntos. */}
        {!sinRutear && admiteOrdenes(despacho.estado) && yo?.rol !== "conductor" && (
          <NuevaOrden despachoId={despacho.id} />
        )}

        {libres.length > 0 && (
          <PuntosSinAsignar
            despachoId={despacho.id}
            paradas={libres}
            rutas={destinos}
            editable={editable(despacho.estado)}
            insertable={!sinRutear && admiteOrdenes(despacho.estado) && destinos.length > 0}
          />
        )}

        {sinRutear ? (
          <Tarjeta className="p-5">
            <h3 className="text-[14px] font-bold tracking-tight">
              Archivo cargado, todavía sin rutear
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
              Los <b className="num">{(k.paradas ?? totalPuntos).toLocaleString("es-PE")}</b> puntos ya
              están guardados. Ábrelo en el planificador para agrupar, calcular
              las rutas y dejarlo <b>Planificado</b>.
            </p>
            <Link
              href={`/planificador?despacho=${despacho.id}`}
              className="mt-4 inline-block rounded-full border border-amber-600 bg-amber px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-amber-600 hover:text-white"
            >
              ◈ Rutear este despacho
            </Link>
          </Tarjeta>
        ) : (
          <>
            <details id="asignacion" className="scroll-mt-4 rounded-[10px] border border-line px-5 py-4" open>
              <summary className="cursor-pointer text-[13.5px] font-bold text-ink">
                Asignación de conductores y vehículos
              </summary>
              <div className="mt-4">
                <AsignarRutas
                  despachoId={despacho.id}
                  rutas={asignables}
                  conductores={equipo}
                  vehiculos={flota}
                />
              </div>
            </details>

            <HistorialPlanes planes={planes} restaurable={editable(despacho.estado)} />

            {Object.keys(params_).length > 0 && (
              <details className="rounded-[10px] border border-line px-5 py-4">
                <summary className="cursor-pointer text-[13.5px] font-bold text-ink">
                  Configuración con la que se calculó
                </summary>
                <div className="mt-4 flex flex-wrap gap-2">
                  {Object.entries(params_)
                    .filter(([, v]) => v !== null && v !== "" && typeof v !== "object")
                    .map(([clave, valor]) => (
                      <span
                        key={clave}
                        className="rounded-full border border-line bg-canvas px-3 py-1 text-[12px] text-ink-2"
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
          </>
        )}

        {rutas.length > 0 ? (
          <div className="overflow-hidden rounded-[10px] border border-line">
            <VistaDespacho
              rutas={rutas}
              cd={{
                lat: despacho.cd_lat ?? rutas[0]?.paradas[0]?.lat ?? -12.046374,
                lon: despacho.cd_lon ?? rutas[0]?.paradas[0]?.lon ?? -77.042793,
              }}
              bases={basesDespacho}
            />
          </div>
        ) : (
          !sinRutear && (
            <p className="rounded-[10px] border border-line px-5 py-6 text-[13.5px] text-ink-2">
              Este despacho no tiene rutas guardadas.
            </p>
          )
        )}
      </div>
    </>
  );
}

/** Una cifra del resumen: el número manda, la unidad acompaña. */
function Cifra({ valor, texto }: { valor: string | number; texto: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <b className="num text-[20px] leading-none text-ink">{valor}</b>
      <span className="text-[12.5px] text-ink-2">{texto}</span>
    </span>
  );
}
