"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  estadoFlota,
  paradasDeRuta,
  type ParadaConDesvio,
  type RutaEnCalle,
} from "@/app/acciones/datos";
import { Pastilla, Tarjeta } from "@/components/ui";

const MapaSeguimiento = dynamic(() => import("@/components/MapaSeguimiento"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-[13px] text-ink-3">Cargando mapa…</div>
  ),
});

const COLORES = [
  "#E8833A", "#2E7DD1", "#0E8F9E", "#7A5AF8", "#C2439B", "#7C9A1F",
  "#D9534F", "#2F855A", "#B7791F", "#5A67D8", "#D53F8C", "#319795",
];
const color = (i: number) => COLORES[i % COLORES.length];

const hhmm = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("es-PE", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "—";

/** Una hora planificada llega como «08:22:00»: sobra el resto. */
const corta = (t: string | null) => (t ? t.slice(0, 5) : "—");

/** Hoy en el calendario de quien mira, que es el que ve en el selector. */
function hoy() {
  const d = new Date();
  const dosCifras = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}`;
}

/** «2 h 15 min» a partir de milisegundos. Lo que se lee de un vistazo. */
function duracion(ms: number) {
  const min = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(min / 60);
  return h > 0 ? `${h} h ${min % 60} min` : `${min} min`;
}

/** El desvío contra la hora estimada, con su signo y su color. */
function Desvio({ min }: { min: number | null }) {
  if (min == null) return <span className="text-ink-3">—</span>;
  if (Math.abs(min) <= 10) {
    return <span className="num font-semibold text-ok">a tiempo</span>;
  }
  const tarde = min > 0;
  return (
    <span className={`num font-semibold ${tarde ? "text-bad" : "text-live"}`}>
      {tarde ? "+" : "−"}
      {Math.abs(min)} min
    </span>
  );
}

/**
 * El estado de una ruta leído del reloj, no de una columna.
 *
 * Una ruta «en curso» que lleva dos horas sin una sola marca no está en
 * curso: está parada, y es lo único que el planificador necesita ver para
 * levantar el teléfono.
 */
const SILENCIO_MIN = 90;

function estadoDe(r: RutaEnCalle, ahora: number) {
  if (r.fin_real || (r.asignadas > 0 && r.gestionadas === r.asignadas)) {
    return { texto: "Finalizada", tono: "ok" as const };
  }
  if (!r.salida_real) return { texto: "Sin iniciar", tono: "plan" as const };

  const desde = r.ultima_marca ?? r.salida_real;
  const callado = (ahora - new Date(desde).getTime()) / 60000;
  if (callado >= SILENCIO_MIN) {
    return { texto: `Sin marcar ${duracion(ahora - new Date(desde).getTime())}`, tono: "bad" as const };
  }
  return { texto: "En ruta", tono: "live" as const };
}

export default function PanelFlota({
  inicial,
  dia = null,
}: {
  inicial: RutaEnCalle[];
  /** El día que se está mirando. Null es hoy. */
  dia?: string | null;
}) {
  const router = useRouter();
  const [rutas, setRutas] = useState(inicial);
  const [elegida, setElegida] = useState<string | null>(inicial[0]?.ruta_id ?? null);
  const [paradas, setParadas] = useState<ParadaConDesvio[]>([]);
  const [auto, setAuto] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La hora se guarda en estado y no se lee en cada pintado: así el servidor
  // y el navegador coinciden en el primer render y React no se queja.
  const [ahora, setAhora] = useState<number | null>(null);
  const montado = useRef(true);

  useEffect(() => () => { montado.current = false; }, []);
  useEffect(() => setAhora(Date.now()), [rutas]);

  // Al cambiar de día, el servidor vuelve a cargar la página con esa fecha.
  useEffect(() => { setRutas(inicial); setElegida(inicial[0]?.ruta_id ?? null); }, [inicial]);

  const refrescar = useCallback(async () => {
    setCargando(true);
    try {
      const datos = await estadoFlota(dia ?? undefined);
      if (!montado.current) return;
      setRutas(datos);
      setError(null);
    } catch (e) {
      if (montado.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (montado.current) setCargando(false);
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
    if (!elegida) { setParadas([]); return; }
    let vigente = true;
    paradasDeRuta(elegida)
      .then((d) => { if (vigente) setParadas(d); })
      .catch(() => { if (vigente) setParadas([]); });
    return () => { vigente = false; };
  }, [elegida, rutas]);

  const activa = useMemo(
    () => rutas.find((r) => r.ruta_id === elegida) ?? null,
    [rutas, elegida],
  );

  const totales = useMemo(() => {
    const t = ahora ?? Date.now();
    const enCalle = rutas.filter(
      (r) => r.salida_real && !r.fin_real && r.gestionadas < r.asignadas,
    );
    const calladas = enCalle.filter((r) => {
      const desde = r.ultima_marca ?? r.salida_real!;
      return (t - new Date(desde).getTime()) / 60000 >= SILENCIO_MIN;
    });
    return {
      rutas: rutas.length,
      enCalle: enCalle.length,
      calladas: calladas.length,
      sinIniciar: rutas.filter((r) => !r.salida_real).length,
      asignadas: rutas.reduce((a, r) => a + r.asignadas, 0),
      gestionadas: rutas.reduce((a, r) => a + r.gestionadas, 0),
    };
  }, [rutas, ahora]);

  if (!rutas.length) {
    return (
      <div className="p-4">
        <Tarjeta className="p-6">
          <p className="text-[13.5px] text-ink-2">
            {dia
              ? "Ese día no tuvo ninguna ruta asignada."
              : "Hoy no hay ninguna ruta asignada. En cuanto guardes un despacho y le pongas conductor, aparecerá aquí con su avance en vivo."}
          </p>
          <input
            type="date"
            value={dia ?? hoy()}
            onChange={(e) =>
              router.push(e.target.value ? `/flota?fecha=${e.target.value}` : "/flota")
            }
            className="num mt-3 rounded-[8px] border border-line-strong bg-surface px-2.5 py-1.5 text-[12.5px]"
          />
        </Tarjeta>
      </div>
    );
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 @3xl:grid-cols-[360px_1fr]">
      {/* Columna de conductores */}
      <div className="min-w-0 overflow-y-auto border-r border-line bg-surface">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2.5 text-[11.5px] text-ink-3">
          <span>
            <b className="num text-[15px] text-ink">{totales.enCalle}</b> en calle
          </span>
          <span>
            <b className="num text-ink">{totales.gestionadas}</b>/{totales.asignadas} paradas
          </span>
          {totales.calladas > 0 && (
            <Pastilla tono="bad">{totales.calladas} sin marcar</Pastilla>
          )}
          {totales.sinIniciar > 0 && (
            <Pastilla tono="plan">{totales.sinIniciar} sin salir</Pastilla>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 text-[11.5px] text-ink-3">
          <input
            type="date"
            value={dia ?? hoy()}
            onChange={(e) =>
              router.push(e.target.value ? `/flota?fecha=${e.target.value}` : "/flota")
            }
            className="num rounded-[8px] border border-line-strong bg-surface px-2 py-1 text-[11.5px]"
          />
          {!dia && (
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              cada 30 s
            </label>
          )}
          <button
            onClick={refrescar}
            disabled={cargando}
            className="ml-auto rounded-[8px] border border-line-strong px-2 py-1 font-semibold text-ink-2 transition hover:bg-canvas disabled:opacity-50"
          >
            {cargando ? "…" : "↻ Actualizar"}
          </button>
        </div>

        {error && (
          <p className="m-3 rounded-[10px] border border-bad/30 bg-bad-bg px-3 py-2 text-[12.5px] text-bad">
            {error}
          </p>
        )}

        <div className="divide-y divide-line">
          {rutas.map((r) => {
            const est = estadoDe(r, ahora ?? Date.now());
            const pct = r.asignadas ? Math.round((r.gestionadas / r.asignadas) * 100) : 0;
            return (
              <button
                key={r.ruta_id}
                onClick={() => setElegida(r.ruta_id)}
                className={`flex w-full flex-col gap-1.5 px-4 py-2.5 text-left transition hover:bg-canvas ${
                  elegida === r.ruta_id ? "bg-canvas" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="num rounded px-1.5 py-0.5 text-[10.5px] font-bold text-white"
                    style={{ background: color(r.indice) }}
                  >
                    R-{String(r.indice + 1).padStart(2, "0")}
                  </span>
                  <b className="min-w-0 flex-1 truncate text-[13px]">
                    {r.conductor ?? "Sin conductor"}
                  </b>
                  <Pastilla tono={est.tono}>{est.texto}</Pastilla>
                </div>

                <div className="flex items-center gap-2 text-[11.5px] text-ink-3">
                  {r.vehiculo || r.placa ? (
                    <span className="num">{r.placa ?? r.vehiculo}</span>
                  ) : (
                    <span>Sin vehículo</span>
                  )}
                  <span className="num">{r.gestionadas}/{r.asignadas}</span>
                  <Desvio min={r.desvio_min} />
                  {r.bateria != null && (
                    <span
                      className={`num ml-auto ${r.bateria <= 20 ? "font-semibold text-bad" : ""}`}
                      title="Batería del móvil en la última marca"
                    >
                      🔋{r.bateria}%
                    </span>
                  )}
                </div>

                <div className="h-1.5 overflow-hidden rounded-full border border-line bg-canvas">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: pct === 100 ? "var(--color-ok)" : color(r.indice),
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detalle de la ruta elegida */}
      <div className="min-w-0 overflow-y-auto bg-surface-2">
        {activa ? (
          <DetalleConductor
            ruta={activa}
            paradas={paradas}
            ahora={ahora ?? Date.now()}
          />
        ) : (
          <p className="p-6 text-[13.5px] text-ink-2">
            Elige un conductor para ver su ruta y sus horas.
          </p>
        )}
      </div>
    </div>
  );
}

function DetalleConductor({
  ruta,
  paradas,
  ahora,
}: {
  ruta: RutaEnCalle;
  paradas: ParadaConDesvio[];
  ahora: number;
}) {
  const enRuta = ruta.salida_real
    ? (ruta.fin_real ? new Date(ruta.fin_real).getTime() : ahora) -
      new Date(ruta.salida_real).getTime()
    : null;

  // El silencio solo importa mientras quede algo por entregar: una ruta
  // cerrada lleva callada desde que terminó, y eso no es una incidencia.
  const cerrada = Boolean(ruta.fin_real) || (ruta.asignadas > 0 && ruta.gestionadas === ruta.asignadas);
  const callado = cerrada
    ? null
    : ruta.ultima_marca
      ? ahora - new Date(ruta.ultima_marca).getTime()
      : ruta.salida_real
        ? ahora - new Date(ruta.salida_real).getTime()
        : null;

  const siguiente = paradas.find((p) => p.estado_entrega === "pendiente");

  return (
    <div className="space-y-3.5 p-4">
      <Tarjeta className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[16px] font-bold tracking-tight">
            {ruta.conductor ?? "Sin conductor"}
          </h2>
          {ruta.placa && <Pastilla tono="plan">{ruta.placa}</Pastilla>}
          <Link
            href={`/torre?despacho=${ruta.despacho_id}`}
            className="ml-auto rounded-[9px] border border-line-strong bg-surface px-3 py-1.5 text-[12.5px] font-semibold transition hover:bg-canvas"
          >
            ◉ Ver en la torre
          </Link>
        </div>
        <p className="mt-0.5 text-[12px] text-ink-3">
          {ruta.despacho ?? "Despacho"} · R-{String(ruta.indice + 1).padStart(2, "0")}
        </p>

        <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Dato
            etiqueta="Avance"
            valor={`${ruta.gestionadas}/${ruta.asignadas}`}
            pie={`${ruta.entregadas} entregadas · ${ruta.fallidas} fallidas`}
          />
          <Dato
            etiqueta="En ruta"
            valor={enRuta == null ? "—" : duracion(enRuta)}
            pie={ruta.salida_real ? `salió ${hhmm(ruta.salida_real)}` : "no ha salido"}
          />
          <Dato
            etiqueta={cerrada ? "Terminó" : "Sin marcar"}
            valor={cerrada ? hhmm(ruta.fin_real ?? ruta.ultima_marca) : callado == null ? "—" : duracion(callado)}
            pie={ruta.ultima_marca ? `última marca ${hhmm(ruta.ultima_marca)}` : "ninguna marca"}
            alerta={callado != null && callado / 60000 >= SILENCIO_MIN}
          />
          <Dato
            etiqueta="Contra la ETA"
            valor={
              ruta.desvio_min == null
                ? "—"
                : Math.abs(ruta.desvio_min) <= 10
                  ? "a tiempo"
                  : `${ruta.desvio_min > 0 ? "+" : "−"}${Math.abs(ruta.desvio_min)} min`
            }
            pie={ruta.km_plan != null ? `${Number(ruta.km_plan).toFixed(1)} km planificados` : "—"}
            alerta={ruta.desvio_min != null && ruta.desvio_min > 30}
          />
        </div>

        {(ruta.bateria != null || ruta.red) && (
          <p className="mt-3 text-[11.5px] text-ink-3">
            En su última marca el móvil tenía
            {ruta.bateria != null && (
              <b className={ruta.bateria <= 20 ? " text-bad" : " text-ink-2"}>
                {" "}{ruta.bateria}% de batería
              </b>
            )}
            {ruta.bateria != null && ruta.red && " y"}
            {ruta.red && <b className="text-ink-2"> red {ruta.red}</b>}.
          </p>
        )}
      </Tarjeta>

      <Tarjeta className="overflow-hidden">
        <div className="h-[320px]">
          {/* La `key` ata el mapa a su ruta: Leaflet encuadra al montarse, y
              sin esto al cambiar de conductor se quedaría con el encuadre del
              anterior. Se espera a tener las paradas por la misma razón. */}
          {paradas.length > 0 ? (
            <MapaSeguimiento
              key={ruta.ruta_id}
              paradas={paradas.map((p) => ({
                id: p.id,
                orden: p.orden,
                nombre: p.nombre,
                lat: p.lat,
                lon: p.lon,
                bultos: p.bultos,
                estado_entrega: p.estado_entrega,
                hora_entrega: p.hora_entrega,
                motivo: p.motivo,
              }))}
              geometria={null}
              colorRuta={color(ruta.indice)}
              cd={
                ruta.cd_lat != null && ruta.cd_lon != null
                  ? { lat: ruta.cd_lat, lon: ruta.cd_lon }
                  : null
              }
              siguienteId={siguiente?.id ?? null}
            />
          ) : (
            <div className="grid h-full place-items-center text-[13px] text-ink-3">
              Cargando paradas…
            </div>
          )}
        </div>
        <p className="border-t border-line px-4 py-2 text-[11.5px] text-ink-3">
          Los puntos verdes son las paradas que ya marcó; el resaltado es la
          siguiente. No hay rastreo continuo: la posición del móvil solo se
          captura al registrar una parada
          {ruta.ultima_marca && (
            <>
              , la última a las <span className="num">{hhmm(ruta.ultima_marca)}</span>
            </>
          )}
          .
        </p>
      </Tarjeta>

      {/* Hora real contra hora estimada, parada por parada */}
      <Tarjeta className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <h3 className="text-[13.5px] font-bold">Hora real contra estimada</h3>
          <span className="ml-auto text-[11.5px] text-ink-3">
            R = cuándo marcó · E = cuándo tocaba
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] border-collapse text-[12.5px]">
            <thead>
              <tr>
                {["#", "Parada", "R", "E", "Desvío", "Estado"].map((h) => (
                  <th
                    key={h}
                    className="border-b border-line bg-surface-2 px-3 py-2 text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paradas.map((p) => (
                <tr key={p.id} className={p.estado_entrega === "pendiente" ? "opacity-70" : ""}>
                  <td className="num border-b border-line px-3 py-2 text-ink-3">{p.orden}</td>
                  <td className="border-b border-line px-3 py-2">
                    <b className="text-ink">{p.nombre}</b>
                    {p.distrito && (
                      <span className="block text-[11.5px] text-ink-3">{p.distrito}</span>
                    )}
                  </td>
                  <td className="num border-b border-line px-3 py-2">{hhmm(p.hora_entrega)}</td>
                  <td className="num border-b border-line px-3 py-2 text-ink-3">{corta(p.eta)}</td>
                  <td className="border-b border-line px-3 py-2">
                    <Desvio min={p.hora_entrega ? p.desvio_min : null} />
                  </td>
                  <td className="border-b border-line px-3 py-2 text-[11.5px] text-ink-2">
                    {p.estado_entrega === "pendiente" ? "pendiente" : (p.motivo ?? p.estado_entrega)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  pie,
  alerta = false,
}: {
  etiqueta: string;
  valor: string;
  pie?: string;
  alerta?: boolean;
}) {
  return (
    <div>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {etiqueta}
      </div>
      <div
        className={`num text-[19px] font-bold leading-tight tracking-tight ${
          alerta ? "text-bad" : "text-ink"
        }`}
      >
        {valor}
      </div>
      {pie && <div className="text-[11px] text-ink-3">{pie}</div>}
    </div>
  );
}
