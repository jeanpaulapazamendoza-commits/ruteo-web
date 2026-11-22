"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  estadoFlota,
  geometriaDeRuta,
  paradasDeRuta,
  type ParadaConDesvio,
  type RutaEnCalle,
} from "@/app/acciones/datos";
import { AccionesPagina, BOTON_SECUNDARIO } from "@/components/Paginacion";
import type { VehiculoEnMapa } from "@/components/MapaFlota";
import { hora, hoy } from "@/lib/horas";
import { colorDe } from "@/lib/coloresRuta";

const cargando = () => (
  <div className="grid h-full place-items-center text-[13px] text-ink-3">Cargando mapa…</div>
);
const MapaSeguimiento = dynamic(() => import("@/components/MapaSeguimiento"), { ssr: false, loading: cargando });
const MapaFlota = dynamic(() => import("@/components/MapaFlota"), { ssr: false, loading: cargando });

/** Un vehículo de la empresa, para saber cuáles no salieron hoy. */
export type VehiculoFlota = {
  id: string;
  nombre: string;
  placa: string | null;
  conductor: string | null;
  grupo: string | null;
  activo: boolean;
};

const hhmm = hora;

/** Una hora planificada llega como «08:22:00»: sobra el resto. */
const corta = (t: string | null) => (t ? t.slice(0, 5) : "—");

/** «2 h 15 min» a partir de milisegundos. Lo que se lee de un vistazo. */
function duracion(ms: number) {
  const min = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(min / 60);
  return h > 0 ? `${h} h ${min % 60} min` : `${min} min`;
}

/**
 * El estado de una ruta leído del reloj, no de una columna.
 *
 * Una ruta «en curso» que lleva dos horas sin una sola marca no está en
 * curso: está parada, y es lo único que el planificador necesita ver para
 * levantar el teléfono.
 */
const SILENCIO_MIN = 90;

type ClaveEstado = "en_ruta" | "programado" | "finalizada";

function estadoDe(r: RutaEnCalle, ahora: number): { clave: ClaveEstado; texto: string; callada: boolean } {
  if (r.fin_real || (r.asignadas > 0 && r.gestionadas === r.asignadas)) {
    return { clave: "finalizada", texto: "Finalizada", callada: false };
  }
  if (!r.salida_real) return { clave: "programado", texto: "Programado", callada: false };
  const desde = r.ultima_marca ?? r.salida_real;
  const ms = ahora - new Date(desde).getTime();
  return ms / 60000 >= SILENCIO_MIN
    ? { clave: "en_ruta", texto: `Sin marcar ${duracion(ms)}`, callada: true }
    : { clave: "en_ruta", texto: "En ruta", callada: false };
}

/** La píldora de estado de una fila, con su punto. */
const PINTA: Record<string, string> = {
  en_ruta: "bg-live-bg text-live",
  programado: "bg-canvas text-ink-2",
  finalizada: "bg-ok-bg text-ok",
  callada: "bg-bad-bg text-bad",
  disponible: "bg-ok-bg text-ok",
  no_disponible: "bg-canvas text-ink-3",
};

function Estado({ clave, texto }: { clave: string; texto: string }) {
  return (
    <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${PINTA[clave]}`}>
      <i className="h-1.5 w-1.5 rounded-full bg-current" />
      {texto}
    </span>
  );
}

const iniciales = (n: string) =>
  n.trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "—";

/**
 * La flota del día, como en la referencia: a la izquierda los conductores, a
 * la derecha el mapa.
 *
 * Sin nadie elegido el mapa es el de toda la flota —un vehículo por ruta,
 * donde se le vio por última vez—. Al elegir un conductor su fila se abre con
 * las cifras de su ruta y la línea de sus órdenes, y el mapa pasa a ser el
 * de esa ruta.
 */
export default function PanelFlota({
  inicial,
  vehiculos = [],
  dia = null,
}: {
  inicial: RutaEnCalle[];
  vehiculos?: VehiculoFlota[];
  /** El día que se está mirando. Null es hoy. */
  dia?: string | null;
}) {
  const router = useRouter();
  const [rutas, setRutas] = useState(inicial);
  // Nadie elegido al entrar: lo primero que se ve es la flota entera.
  const [elegida, setElegida] = useState<string | null>(null);
  // Las órdenes cargadas llevan apuntado de qué ruta son: al cambiar de
  // conductor las del anterior dejan de valer sin tener que borrarlas.
  const [cargadas, setCargadas] = useState<{
    ruta: string; lista: ParadaConDesvio[]; trazo: number[][] | null;
  } | null>(null);
  const [auto, setAuto] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [soloEstado, setSoloEstado] = useState("");
  const [grupo, setGrupo] = useState("");
  const [menuVer, setMenuVer] = useState(false);
  // Las capas del mapa, con los valores de la referencia.
  const [capas, setCapas] = useState({ enRuta: true, finalizadas: true, centros: false });
  // La hora se guarda en estado y no se lee en cada pintado: así el servidor
  // y el navegador coinciden en el primer render y React no se queja.
  const [ahora, setAhora] = useState<number | null>(null);
  const montado = useRef(true);

  useEffect(() => () => { montado.current = false; }, []);
  useEffect(() => setAhora(Date.now()), [rutas]);

  // Al cambiar de día, el servidor vuelve a cargar la página con esa fecha.
  useEffect(() => { setRutas(inicial); setElegida(null); }, [inicial]);

  const refrescar = useCallback(async () => {
    setRefrescando(true);
    try {
      const datos = await estadoFlota(dia ?? undefined);
      if (!montado.current) return;
      setRutas(datos);
      setError(null);
    } catch (e) {
      if (montado.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (montado.current) setRefrescando(false);
    }
  }, [dia]);

  // Un día pasado ya no cambia: el sondeo solo tiene sentido sobre hoy.
  useEffect(() => {
    if (!auto || dia) return;
    const t = setInterval(refrescar, 30000);
    return () => clearInterval(t);
  }, [auto, dia, refrescar]);

  // Las paradas de la ruta abierta se piden aparte: traerlas todas de golpe
  // sería mover cientos de filas que nadie está mirando.
  useEffect(() => {
    if (!elegida) return;
    let vigente = true;
    // El recorrido por calles viene con las órdenes: si aún no está
    // dibujado, el mapa enseña solo los puntos.
    Promise.all([paradasDeRuta(elegida), geometriaDeRuta(elegida).catch(() => null)])
      .then(([d, trazo]) => { if (vigente) setCargadas({ ruta: elegida, lista: d, trazo }); })
      .catch(() => { if (vigente) setCargadas({ ruta: elegida, lista: [], trazo: null }); });
    return () => { vigente = false; };
  }, [elegida, rutas]);

  const paradas = useMemo(
    () => (cargadas && cargadas.ruta === elegida ? cargadas.lista : []),
    [cargadas, elegida],
  );

  // Hasta que el navegador pone la hora, cero: el primer pintado no sabe
  // cuánto lleva callada una ruta y la da por viva.
  const t0 = ahora ?? 0;
  const activa = useMemo(() => rutas.find((r) => r.ruta_id === elegida) ?? null, [rutas, elegida]);

  const grupos = useMemo(
    () =>
      [...new Set([...vehiculos.map((v) => v.grupo), ...rutas.map((r) => r.grupo)].filter(Boolean) as string[])].sort(),
    [vehiculos, rutas],
  );

  // Los vehículos que hoy no tienen ruta: disponibles si están activos.
  const sinRuta = useMemo(() => {
    const conRuta = new Set(rutas.map((r) => r.vehiculo_id).filter(Boolean));
    return vehiculos.filter((v) => !conRuta.has(v.id));
  }, [vehiculos, rutas]);

  const q = busca.trim().toLowerCase();
  const deVehiculos = soloEstado === "disponible" || soloEstado === "no_disponible";

  const listadas = deVehiculos
    ? []
    : rutas.filter((r) => {
        if (grupo && r.grupo !== grupo) return false;
        if (q && !`${r.conductor ?? ""} ${r.placa ?? ""} ${r.vehiculo ?? ""}`.toLowerCase().includes(q)) return false;
        return !soloEstado || estadoDe(r, t0).clave === soloEstado;
      });

  const libres = !deVehiculos
    ? []
    : sinRuta.filter((v) => {
        if (v.activo !== (soloEstado === "disponible")) return false;
        if (grupo && v.grupo !== grupo) return false;
        return !q || `${v.nombre} ${v.placa ?? ""} ${v.conductor ?? ""}`.toLowerCase().includes(q);
      });

  // Lo que se pinta en el mapa de la flota: las rutas listadas, según capas.
  const enMapa: VehiculoEnMapa[] = listadas.flatMap((r) => {
    const est = estadoDe(r, t0);
    if (est.clave === "finalizada" && !capas.finalizadas) return [];
    if (est.clave !== "finalizada" && !capas.enRuta) return [];
    const lat = r.ultima_lat ?? r.cd_lat;
    const lon = r.ultima_lon ?? r.cd_lon;
    if (lat == null || lon == null) return [];
    return [{
      id: r.ruta_id,
      rotulo: r.conductor ?? r.placa ?? `R-${String(r.indice + 1).padStart(2, "0")}`,
      lat, lon,
      estado: est.clave,
      detalle: `${est.texto} · ${r.gestionadas}/${r.asignadas} órdenes${
        r.ultima_marca ? ` · última marca ${hhmm(r.ultima_marca)}` : ""
      }`,
    }];
  });

  const centros = useMemo(() => {
    if (!capas.centros) return [];
    const vistos = new Map<string, { lat: number; lon: number }>();
    for (const r of rutas) {
      if (r.cd_lat != null && r.cd_lon != null) vistos.set(`${r.cd_lat},${r.cd_lon}`, { lat: r.cd_lat, lon: r.cd_lon });
    }
    return [...vistos.values()];
  }, [rutas, capas.centros]);

  const total = deVehiculos ? libres.length : listadas.length;
  const universo = deVehiculos ? sinRuta.length : rutas.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AccionesPagina>
        {!dia && (
          <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-ink-3">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            <span className="h-1.5 w-1.5 rounded-full bg-ok" /> se actualiza cada 30 s
          </label>
        )}
        <button onClick={refrescar} disabled={refrescando} className={BOTON_SECUNDARIO}>
          {refrescando ? "…" : "↻ Actualizar"}
        </button>
      </AccionesPagina>

      {/* Filtros, a todo el ancho como en la referencia */}
      <div className="grid grid-cols-1 gap-2 pb-3 @xl:grid-cols-2 @4xl:grid-cols-[1fr_1fr_1fr_1.4fr]">
        <input
          type="date"
          value={dia ?? hoy()}
          onChange={(e) => router.push(e.target.value ? `/flota?fecha=${e.target.value}` : "/flota")}
          className="num w-full outline-none"
        />
        <select value={grupo} onChange={(e) => setGrupo(e.target.value)} className="w-full outline-none">
          <option value="">Todos los grupos</option>
          {grupos.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <select
          value={soloEstado}
          onChange={(e) => { setSoloEstado(e.target.value); setElegida(null); }}
          className="w-full outline-none"
        >
          <option value="">Todas las rutas del día</option>
          <option value="en_ruta">En ruta</option>
          <option value="programado">Programado</option>
          <option value="finalizada">Rutas finalizadas</option>
          <option value="disponible">Disponible</option>
          <option value="no_disponible">No disponible</option>
        </select>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nombre o patente"
          className="w-full outline-none"
        />
      </div>

      {error && (
        <p className="mb-3 rounded-[8px] border border-bad/30 bg-bad-bg px-3 py-2 text-[13px] text-bad">
          {error}
        </p>
      )}

      <div className="grid min-h-[520px] flex-1 grid-cols-1 overflow-hidden rounded-[8px] border border-line @3xl:grid-cols-[300px_1fr]">
        {/* ── Conductores ─────────────────────────────────────────── */}
        <div className="flex min-h-0 min-w-0 flex-col border-b border-line bg-surface @3xl:border-b-0 @3xl:border-r">
          <div className="shrink-0 border-b border-line px-3.5 py-2.5 text-[13px] font-bold text-ink">
            {deVehiculos ? "Vehículos" : "Conductores"} <span className="num">{total}</span> de{" "}
            <span className="num">{universo}</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {listadas.map((r) => {
              const est = estadoDe(r, t0);
              const nombre = r.conductor ?? "Sin conductor";
              const abierta = elegida === r.ruta_id;
              return (
                <div key={r.ruta_id} className={`border-b border-line ${abierta ? "bg-amber-050" : ""}`}>
                  <button
                    onClick={() => setElegida(abierta ? null : r.ruta_id)}
                    aria-expanded={abierta}
                    className={`flex w-full items-center gap-3 px-3.5 py-3 text-left transition ${
                      abierta ? "border-l-[3px] border-amber pl-[11px]" : "hover:bg-surface-2"
                    }`}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-live-bg text-[11.5px] font-bold text-live">
                      {iniciales(nombre)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13px] text-ink">{nombre}</b>
                      <span className="num mt-0.5 inline-block rounded-[4px] bg-canvas px-1.5 py-px text-[11.5px] text-ink-2">
                        {r.placa ?? r.vehiculo ?? `R-${String(r.indice + 1).padStart(2, "0")}`}
                      </span>
                    </span>
                    <Estado clave={est.callada ? "callada" : est.clave} texto={est.texto} />
                  </button>
                  {abierta && <FichaRuta ruta={r} paradas={paradas} ahora={t0} />}
                </div>
              );
            })}

            {libres.map((v) => (
              <div key={v.id} className="flex items-center gap-3 border-b border-line px-3.5 py-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-canvas text-[11.5px] font-bold text-ink-2">
                  {iniciales(v.conductor ?? v.nombre)}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13px] text-ink">{v.conductor ?? v.nombre}</b>
                  <span className="num mt-0.5 inline-block rounded-[4px] bg-canvas px-1.5 py-px text-[11.5px] text-ink-2">
                    {v.placa ?? v.nombre}
                  </span>
                </span>
                <Estado
                  clave={v.activo ? "disponible" : "no_disponible"}
                  texto={v.activo ? "Disponible" : "No disponible"}
                />
              </div>
            ))}

            {total === 0 && (
              <p className="px-3.5 py-4 text-[13px] leading-relaxed text-ink-3">
                {deVehiculos
                  ? soloEstado === "disponible"
                    ? "Ningún vehículo activo sin ruta este día."
                    : "Ningún vehículo retirado."
                  : rutas.length === 0
                    ? dia
                      ? "Ese día no tuvo ninguna ruta."
                      : "Hoy no hay ninguna ruta. Cuando guardes un despacho aparecerán aquí."
                    : "Ningún conductor coincide con los filtros."}
              </p>
            )}
          </div>
        </div>

        {/* ── Cifras y mapa ───────────────────────────────────────── */}
        <div className="flex min-h-[420px] min-w-0 flex-col bg-surface">
          {activa ? (
            <ResumenRuta ruta={activa} paradas={paradas} />
          ) : (
            <p className="shrink-0 border-b border-line px-4 py-3.5 text-center text-[13px] text-ink-2">
              Selecciona un conductor para ver las estadísticas de su ruta
            </p>
          )}

          <div className="relative isolate min-h-0 flex-1">
            {activa ? (
              // La `key` ata el mapa a su ruta: Leaflet encuadra al montarse, y
              // sin esto al cambiar de conductor se quedaría con el encuadre
              // del anterior. Se espera a tener las paradas por la misma razón.
              paradas.length > 0 ? (
                <MapaSeguimiento
                  key={`${activa.ruta_id}-${capas.centros}`}
                  paradas={paradas.map((p) => ({
                    id: p.id, orden: p.orden, nombre: p.nombre, lat: p.lat, lon: p.lon,
                    bultos: p.bultos, estado_entrega: p.estado_entrega,
                    hora_entrega: p.hora_entrega, motivo: p.motivo,
                  }))}
                  geometria={cargadas?.ruta === activa.ruta_id ? cargadas.trazo : null}
                  colorRuta={colorDe(activa.indice)}
                  cd={
                    capas.centros && activa.cd_lat != null && activa.cd_lon != null
                      ? { lat: activa.cd_lat, lon: activa.cd_lon }
                      : null
                  }
                  siguienteId={paradas.find((p) => p.estado_entrega === "pendiente")?.id ?? null}
                />
              ) : (
                cargando()
              )
            ) : (
              <MapaFlota
                key={`${dia ?? "hoy"}-${soloEstado}-${grupo}`}
                vehiculos={enMapa}
                centros={centros}
                onElegir={setElegida}
              />
            )}

            {/* «Ver»: qué se pinta en el mapa */}
            <div className="absolute right-3 top-3 z-[800]">
              <button
                onClick={() => setMenuVer((v) => !v)}
                aria-expanded={menuVer}
                className="flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[13px] font-bold text-ink shadow transition hover:bg-canvas"
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Ver
              </button>
              {menuVer && (
                <div className="absolute right-0 mt-1.5 w-[210px] rounded-[8px] border border-line bg-surface p-1.5 shadow-lg">
                  {([
                    ["enRuta", "En ruta"],
                    ["finalizadas", "Rutas finalizadas"],
                    ["centros", "Centro de distribución"],
                  ] as const).map(([k, texto]) => (
                    <label key={k} className="flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-[13px] text-ink hover:bg-canvas">
                      <input
                        type="checkbox"
                        checked={capas[k]}
                        onChange={(e) => setCapas((c) => ({ ...c, [k]: e.target.checked }))}
                        className="h-4 w-4 accent-[var(--color-amber)]"
                      />
                      {texto}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <p className="shrink-0 border-t border-line px-4 py-2 text-[11.5px] text-ink-3">
            No hay rastreo continuo: la posición es la de la última orden que marcó cada conductor.
            Quien aún no ha marcado ninguna aparece en su centro de distribución.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Lo que se abre bajo la fila del conductor elegido. */
function FichaRuta({
  ruta: r, paradas, ahora,
}: {
  ruta: RutaEnCalle;
  paradas: ParadaConDesvio[];
  ahora: number;
}) {
  const cerrada = Boolean(r.fin_real) || (r.asignadas > 0 && r.gestionadas === r.asignadas);
  const enRuta = r.salida_real
    ? (r.fin_real ? new Date(r.fin_real).getTime() : ahora) - new Date(r.salida_real).getTime()
    : null;
  // El silencio solo importa mientras quede algo por entregar: una ruta
  // cerrada lleva callada desde que terminó, y eso no es una incidencia.
  const callado =
    cerrada || !r.salida_real ? null : ahora - new Date(r.ultima_marca ?? r.salida_real).getTime();
  const pct = r.asignadas ? Math.round((r.gestionadas / r.asignadas) * 100) : 0;
  const siguiente = paradas.find((p) => p.estado_entrega === "pendiente")?.id ?? null;

  return (
    <div className="px-3 pb-3">
      {r.conductor_telefono && (
        <a
          href={`tel:${r.conductor_telefono.replace(/[^\d+]/g, "")}`}
          className="num mb-2 flex h-8 items-center justify-center gap-1.5 rounded-full border border-line-strong bg-surface text-[13px] font-bold text-ink transition hover:bg-canvas"
        >
          Llamar · {r.conductor_telefono}
        </a>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Cifra valor={`${r.gestionadas}/${r.asignadas}`} texto="Órdenes gestionadas" />
        <Cifra
          valor={r.km_plan != null ? `${Number(r.km_plan).toFixed(1)} km` : "—"}
          texto="Distancia planificada"
        />
        <Cifra valor={enRuta == null ? "—" : duracion(enRuta)} texto="Tiempo de ruta" />
        <Cifra
          valor={callado == null ? "—" : duracion(callado)}
          texto="Tiempo sin actividad"
          alerta={callado != null && callado / 60000 >= SILENCIO_MIN}
        />
      </div>

      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-amber" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[11.5px] text-ink-2">
        <span className="num">{r.gestionadas}</span> de <span className="num">{r.asignadas}</span> órdenes completadas
      </p>

      <div className="mt-2 rounded-[4px] border-l-[3px] border-amber bg-amber/10 px-2 py-1 text-[11.5px] font-bold text-navy-800">
        {cerrada
          ? `RUTA FINALIZADA${r.fin_real ? `: ${hhmm(r.fin_real)}` : ""}`
          : r.salida_real
            ? `RUTA ACTIVA: ${hhmm(r.salida_real)}`
            : `RUTA PROGRAMADA: ${corta(r.salida_prog)}`}{" "}
        <span className="font-normal">({pct}%)</span>
      </div>

      <ol className="mt-2 space-y-2.5">
        {paradas.map((p) => {
          const hecha = p.estado_entrega !== "pendiente";
          const punto =
            p.estado_entrega === "entregado" ? "border-ok bg-ok"
            : p.estado_entrega === "fallido" ? "border-bad bg-bad"
            : hecha ? "border-warn bg-warn"
            : p.id === siguiente ? "border-amber bg-surface"
            : "border-line-strong bg-surface";
          return (
            <li key={p.id} className="flex gap-2">
              <i className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${punto}`} />
              <span className="min-w-0 flex-1">
                <span className="num block text-[11px] text-ink-3">
                  {p.hora_entrega ? `R: ${hhmm(p.hora_entrega)} - ` : ""}E: {corta(p.eta)}
                </span>
                <Link href={`/paradas/${p.id}`} className="num block truncate text-[12.5px] font-bold text-amber-600 hover:underline">
                  {p.codigo ?? `#${p.orden}`}
                </Link>
                <span className="block truncate text-[12px] text-ink-2">{p.nombre}</span>
              </span>
              <span
                className={`mt-0.5 h-fit shrink-0 rounded-full px-1.5 py-px text-[10.5px] font-semibold ${
                  p.estado_entrega === "entregado" ? "bg-ok-bg text-ok"
                  : p.estado_entrega === "fallido" ? "bg-bad-bg text-bad"
                  : hecha ? "bg-warn-bg text-warn"
                  : "bg-canvas text-ink-2"
                }`}
              >
                {p.estado_entrega === "entregado" ? "Entregada"
                  : p.estado_entrega === "fallido" ? "No entregada"
                  : p.estado_entrega === "parcial" ? "Parcial"
                  : p.estado_entrega === "reprogramado" ? "Reprogramada"
                  : "Pendiente"}
              </span>
            </li>
          );
        })}
        {paradas.length === 0 && <li className="text-[12px] text-ink-3">Cargando órdenes…</li>}
      </ol>
    </div>
  );
}

function Cifra({ valor, texto, alerta = false }: { valor: string; texto: string; alerta?: boolean }) {
  return (
    <div className="rounded-[6px] border border-line bg-surface px-2.5 py-2">
      <div className={`num text-[17px] font-bold leading-tight ${alerta ? "text-bad" : "text-ink"}`}>{valor}</div>
      <div className="mt-0.5 text-[11px] leading-tight text-ink-2">{texto}</div>
    </div>
  );
}

/** La franja de cifras sobre el mapa, con el avance de la ruta elegida. */
function ResumenRuta({ ruta: r, paradas }: { ruta: RutaEnCalle; paradas: ParadaConDesvio[] }) {
  const pendientes = r.asignadas - r.gestionadas;
  const parciales = Math.max(0, r.gestionadas - r.entregadas - r.fallidas);
  // Lo que sigue dentro del vehículo: los bultos de lo que falta por entregar.
  const aBordo = paradas
    .filter((p) => p.estado_entrega === "pendiente")
    .reduce((s, p) => s + p.bultos, 0);
  const pct = (n: number) => (r.gestionadas ? Math.round((n / r.gestionadas) * 100) : 0);
  const avance = r.asignadas ? (r.gestionadas / r.asignadas) * 100 : 0;

  return (
    <div className="shrink-0 border-b border-line px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Total valor={pendientes} texto="Pedidos pendientes" />
        <Total valor={paradas.length ? aBordo : "—"} texto="Bultos en el vehículo" />
        <Total valor={r.asignadas} texto="Pedidos asignados" />
        <Reparto color="bg-ok" pct={pct(r.entregadas)} texto={`Entregadas (${r.entregadas})`} />
        <Reparto color="bg-warn" pct={pct(parciales)} texto={`Parciales (${parciales})`} />
        <Reparto color="bg-bad" pct={pct(r.fallidas)} texto={`No entregadas (${r.fallidas})`} />
        <span className="ml-auto flex gap-2">
          <Link href={`/rutas/${r.ruta_id}`} className={`${BOTON_SECUNDARIO} h-7 text-[12.5px]`}>
            Ver la ruta
          </Link>
          <Link href={`/torre?despacho=${r.despacho_id}`} className={`${BOTON_SECUNDARIO} h-7 text-[12.5px]`}>
            Torre
          </Link>
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11.5px] text-ink-2">
        <span>Progreso de entregas</span>
        <span>
          <b className="num text-ink">{r.gestionadas}</b> gestionadas
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-ok" style={{ width: `${avance}%` }} />
      </div>
    </div>
  );
}

function Total({ valor, texto }: { valor: number | string; texto: string }) {
  return (
    <div className="border-r border-line pr-5 last:border-r-0">
      <div className="num text-[17px] font-bold leading-tight text-ink">{valor}</div>
      <div className="text-[11.5px] text-ink-2">{texto}</div>
    </div>
  );
}

function Reparto({ color, pct, texto }: { color: string; pct: number; texto: string }) {
  return (
    <div className="flex items-start gap-1.5">
      <i className={`mt-1.5 h-2 w-2 rounded-full ${color}`} />
      <div>
        <div className="num text-[13px] font-bold leading-tight text-ink">{pct}%</div>
        <div className="text-[11.5px] text-ink-2">{texto}</div>
      </div>
    </div>
  );
}
