"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  lineaTiempoDespacho,
  paradasDeDespacho,
  type Evento,
} from "@/app/acciones/datos";
import { verFoto } from "@/app/acciones/fotos";
import FranjaHoraria, { escalaDe, ReglaHoraria } from "@/components/FranjaHoraria";
import TiraIndicadores from "@/components/TiraIndicadores";
import { hora } from "@/lib/horas";
import { Pastilla, Tarjeta } from "@/components/ui";

// Leaflet necesita `window`: solo en el navegador.
const MapaSeguimiento = dynamic(() => import("@/components/MapaSeguimiento"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-[13px] text-ink-3">Cargando mapa…</div>
  ),
});

export type ParadaSeguimiento = {
  id: string;
  orden: number;
  codigo: string | null;
  nombre: string | null;
  distrito: string | null;
  lat: number;
  lon: number;
  bultos: number;
  prioridad: number;
  eta: string | null;
  estado_entrega: "pendiente" | "entregado" | "parcial" | "fallido" | "reprogramado";
  hora_entrega: string | null;
  bultos_entregados: number | null;
  motivo: string | null;
  foto_url: string | null;
  observaciones: string | null;
  recibe: string | null;
  ruta_indice: number;
};

export type RutaSeguida = {
  indice: number;
  geometria: number[][] | null;
  salida_real: string | null;
  conductor: string | null;
  /** La base de la que sale. Vacío = el centro del despacho. */
  base_nombre?: string | null;
  base_lat?: number | null;
  base_lon?: number | null;
};

/** El centro del despacho, en la lista de bases. */
const CENTRO = "Centro del despacho";

/** De dónde sale una ruta: su base, o el centro del despacho. */
const origenDe = (r: RutaSeguida | undefined) =>
  r?.base_lat != null && r?.base_lon != null ? (r.base_nombre ?? "Base") : CENTRO;

const ESTADO_TONO = {
  entregado: "ok",
  parcial: "warn",
  fallido: "bad",
  reprogramado: "warn",
  pendiente: "plan",
} as const;

/** El conductor marca «no entregado»; en la base eso es «fallido». */
const ESTADO_TEXTO: Record<string, string> = {
  entregado: "entregado",
  parcial: "parcial",
  fallido: "no entregado",
  reprogramado: "reprogramado",
  pendiente: "pendiente",
};

const COLORES = [
  "#E8833A", "#2E7DD1", "#0E8F9E", "#7A5AF8", "#C2439B", "#7C9A1F",
  "#D9534F", "#2F855A", "#B7791F", "#5A67D8", "#D53F8C", "#319795",
];
const color = (i: number) => COLORES[i % COLORES.length];

/**
 * Qué pasó en esta parada, en una frase.
 *
 * El campo `motivo` de una entrega parcial guarda lo que el conductor escribió
 * en «¿qué faltó?», que suelto no dice nada: un «1» a secas no es un motivo.
 * Lo que importa es cuánto entregó de cuánto, y eso vive en otra columna.
 */
function queLePaso(p: ParadaSeguimiento): string {
  const partes: string[] = [];

  if (p.estado_entrega === "parcial") {
    partes.push(
      p.bultos_entregados != null
        ? `Entregó ${p.bultos_entregados} de ${p.bultos} bultos`
        : "Entrega incompleta",
    );
    if (p.motivo) partes.push(`faltó: ${p.motivo}`);
  } else if (p.motivo) {
    partes.push(p.motivo);
  }

  if (p.observaciones && p.observaciones !== p.motivo) partes.push(p.observaciones);
  if (!partes.length) partes.push("Sin detalle");
  return partes.join(" · ");
}

const horaDe = hora;

export default function TorreControl({
  despachoId,
  inicial,
  rutas = [],
  cd = null,
}: {
  despachoId: string;
  inicial: ParadaSeguimiento[];
  rutas?: RutaSeguida[];
  cd?: { lat: number; lon: number } | null;
}) {
  const [paradas, setParadas] = useState(inicial);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [actualizado, setActualizado] = useState<Date>(new Date());
  const [auto, setAuto] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<number | null>(null);
  const [compacto, setCompacto] = useState(false);
  // Con la flota repartida entre varias bases, cada jefe de base mira las
  // suyas. Vacío = todas.
  const [soloBase, setSoloBase] = useState("");
  const montado = useRef(true);

  // La preferencia de densidad es de quien mira, no del despacho: se queda en
  // su navegador. Si el almacenamiento está bloqueado, se sigue sin ella.
  useEffect(() => {
    try {
      setCompacto(localStorage.getItem("torre:compacto") === "1");
    } catch {
      /* navegación privada o almacenamiento bloqueado */
    }
  }, []);

  function cambiarDensidad(v: boolean) {
    setCompacto(v);
    if (v) setAbierta(null);
    try {
      localStorage.setItem("torre:compacto", v ? "1" : "0");
    } catch {
      /* no pasa nada: solo no se recuerda */
    }
  }

  const infoRuta = useMemo(
    () => new Map(rutas.map((r) => [r.indice, r])),
    [rutas],
  );

  useEffect(() => () => { montado.current = false; }, []);

  const refrescar = useCallback(async () => {
    setCargando(true);
    try {
      // Las dos lecturas van juntas: si la franja horaria llegara un sondeo
      // más tarde que las paradas, se vería un punto marcado sin su marca en
      // la línea, que parece un fallo.
      const [datos, historia] = await Promise.all([
        paradasDeDespacho(despachoId),
        lineaTiempoDespacho(despachoId),
      ]);
      if (!montado.current) return;
      setParadas(datos as unknown as ParadaSeguimiento[]);
      setEventos(historia);
      setActualizado(new Date());
      setError(null);
    } catch (e) {
      if (montado.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (montado.current) setCargando(false);
    }
  }, [despachoId]);

  // La primera carga trae las paradas desde el servidor, pero no la historia.
  useEffect(() => {
    void refrescar();
  }, [refrescar]);

  // Sondeo periódico: el chofer marca desde su móvil y aquí se ve solo.
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(refrescar, 20000);
    return () => clearInterval(t);
  }, [auto, refrescar]);

  const resumen = useMemo(() => {
    const total = paradas.length || 1;
    const cuenta = (e: string) => paradas.filter((p) => p.estado_entrega === e).length;
    const entregado = cuenta("entregado");
    const parcial = cuenta("parcial");
    const fallido = cuenta("fallido");
    const reprogramado = cuenta("reprogramado");
    const pendiente = paradas.length - entregado - parcial - fallido - reprogramado;
    const cerradas = entregado + parcial + fallido + reprogramado;
    return {
      total: paradas.length,
      entregado, parcial, fallido, reprogramado, pendiente,
      avance: Math.round((cerradas / total) * 100),
      pct: (n: number) => (n / total) * 100,
      bultosEntregados: paradas
        .filter((p) => p.estado_entrega === "entregado" || p.estado_entrega === "parcial")
        .reduce((a, p) => a + p.bultos, 0),
    };
  }, [paradas]);

  const porRuta = useMemo(() => {
    const m = new Map<number, ParadaSeguimiento[]>();
    paradas.forEach((p) => {
      const i = p.ruta_indice ?? 0;
      if (!m.has(i)) m.set(i, []);
      m.get(i)!.push(p);
    });
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [paradas]);

  /**
   * El avance de cada base, cuando las rutas salen de más de una.
   *
   * Con una sola —lo habitual— la lista queda vacía y la torre se ve como
   * siempre: ni selector ni resumen por base.
   */
  const bases = useMemo(() => {
    const m = new Map<string, { rutas: number; paradas: number; cerradas: number; fallidas: number }>();
    porRuta.forEach(([indice, ps]) => {
      const nombre = origenDe(infoRuta.get(indice));
      const b = m.get(nombre) ?? { rutas: 0, paradas: 0, cerradas: 0, fallidas: 0 };
      b.rutas += 1;
      b.paradas += ps.length;
      b.cerradas += ps.filter((p) => p.estado_entrega !== "pendiente").length;
      b.fallidas += ps.filter((p) => p.estado_entrega === "fallido").length;
      m.set(nombre, b);
    });
    if (m.size < 2) return [];
    // El centro del despacho, si alguna ruta sale de él, va el último.
    return [...m.entries()]
      .map(([nombre, b]) => ({ nombre, ...b }))
      .sort((a, b) =>
        a.nombre === CENTRO ? 1 : b.nombre === CENTRO ? -1 : a.nombre.localeCompare(b.nombre));
  }, [porRuta, infoRuta]);

  const rutasVisibles = useMemo(
    () =>
      soloBase && bases.some((b) => b.nombre === soloBase)
        ? porRuta.filter(([indice]) => origenDe(infoRuta.get(indice)) === soloBase)
        : porRuta,
    [porRuta, infoRuta, soloBase, bases],
  );

  /** La escala horaria es común a todas las rutas: solo así se comparan. */
  const escala = useMemo(() => escalaDe(eventos), [eventos]);

  const eventosPorRuta = useMemo(() => {
    const m = new Map<number, Evento[]>();
    eventos.forEach((e) => {
      if (!m.has(e.ruta_indice)) m.set(e.ruta_indice, []);
      m.get(e.ruta_indice)!.push(e);
    });
    return m;
  }, [eventos]);

  const incidencias = useMemo(
    () =>
      paradas.filter(
        (p) =>
          p.estado_entrega === "fallido" ||
          p.estado_entrega === "parcial" ||
          p.estado_entrega === "reprogramado",
      ),
    [paradas],
  );

  /**
   * Lo último que pasó, leído del registro y no de las paradas.
   *
   * Antes esto salía de `hora_entrega`, así que solo mostraba el estado final
   * de cada punto: una corrección pisaba a la marca anterior y la salida del
   * centro no aparecía nunca. El registro las conserva todas.
   */
  const ultimas = useMemo(
    () => [...eventos].reverse().slice(0, 12),
    [eventos],
  );

  const cerradas =
    resumen.entregado + resumen.parcial + resumen.fallido + resumen.reprogramado;

  return (
    // Un solo bloque: el panel convierte cada hijo directo en una franja sin
    // relleno vertical, y con dos franjas —indicadores y cuerpo— quedaban
    // pegadas entre sí y al borde. Aquí dentro los espacios son los normales.
    <div className="flex flex-col gap-5">
      {/* La misma tira que encabeza Actividad y Flota, aquí referida a un
          solo despacho: el planificador aprende a leerla una vez. */}
      <TiraIndicadores
        items={[
          { clave: "cumplimiento", texto: "Cumplimiento", ayuda: "Paradas cerradas sobre el total",
            n: cerradas, de: resumen.total },
          { clave: "entregado", texto: "Entregado", ayuda: "Entregas conformes",
            n: resumen.entregado, de: resumen.total, tono: "ok" },
          { clave: "parcial", texto: "Parcial", ayuda: "Se entrego una parte de los bultos",
            n: resumen.parcial, de: resumen.total,
            tono: resumen.parcial > 0 ? "warn" : undefined },
          { clave: "fallido", texto: "Fallido", ayuda: "No se pudo entregar",
            n: resumen.fallido, de: resumen.total,
            tono: resumen.fallido > 0 ? "bad" : undefined },
          { clave: "pendiente", texto: "Pendiente", ayuda: "Siguen sin marcar",
            n: resumen.pendiente, de: resumen.total },
          { clave: "bultos", texto: "Bultos", ayuda: "Bultos entregados",
            n: resumen.bultosEntregados },
        ]}
        clave="torre"
        porDefecto={["cumplimiento", "entregado", "parcial", "fallido", "pendiente"]}
        derecha={
          <>
            <span className="num">Actualizado {horaDe(actualizado.toISOString())}</span>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              cada 20 s
            </label>
            <button
              onClick={refrescar}
              disabled={cargando}
              className="rounded-full border border-line-strong px-2 py-1 font-semibold text-ink-2 transition hover:bg-canvas disabled:opacity-50"
            >
              {cargando ? "…" : "↻ Actualizar"}
            </button>
          </>
        }
      />

    <div className="grid min-h-0 flex-1 grid-cols-1 items-start gap-5 @3xl:grid-cols-[1fr_320px] @5xl:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-5">
        {error && (
          <p className="rounded-[10px] border border-bad/30 bg-bad-bg px-3 py-2 text-[12.5px] text-bad">
            {error}
          </p>
        )}

        {/* El reparto de la jornada, de un vistazo */}
        <Tarjeta className="p-5">
          <div className="flex h-3 overflow-hidden rounded-full border border-line bg-canvas">
            <span style={{ width: `${resumen.pct(resumen.entregado)}%`, background: "var(--color-ok)" }} />
            <span style={{ width: `${resumen.pct(resumen.parcial + resumen.reprogramado)}%`, background: "var(--color-warn)" }} />
            <span style={{ width: `${resumen.pct(resumen.fallido)}%`, background: "var(--color-bad)" }} />
            <span style={{ width: `${resumen.pct(resumen.pendiente)}%`, background: "var(--color-live)" }} />
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] font-semibold text-ink-2">
            <Leyenda color="var(--color-ok)" texto={`Entregado ${resumen.entregado}`} />
            <Leyenda color="var(--color-warn)" texto={`Parcial ${resumen.parcial}`} />
            <Leyenda color="var(--color-warn)" texto={`Reprogramado ${resumen.reprogramado}`} />
            <Leyenda color="var(--color-bad)" texto={`Fallido ${resumen.fallido}`} />
            <Leyenda color="var(--color-live)" texto={`Pendiente ${resumen.pendiente}`} />
            <span className="num ml-auto text-ink-3">
              {resumen.bultosEntregados} bultos entregados
            </span>
          </div>

          {/* El mismo avance, base por base. Tocar una filtra las rutas. */}
          {bases.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
              {bases.map((b) => {
                const activa = soloBase === b.nombre;
                return (
                  <button
                    key={b.nombre}
                    onClick={() => setSoloBase(activa ? "" : b.nombre)}
                    aria-pressed={activa}
                    title={activa ? "Ver todas las bases" : `Ver solo las rutas de ${b.nombre}`}
                    className={`rounded-full border px-2.5 py-1 text-[11.5px] transition ${
                      activa
                        ? "border-amber bg-amber text-white"
                        : "border-line-strong bg-surface text-ink-2 hover:bg-canvas"
                    }`}
                  >
                    <b>{b.nombre}</b>
                    <span className="num">
                      {" · "}
                      {b.rutas} ruta{b.rutas === 1 ? "" : "s"}
                      {" · "}
                      {b.cerradas}/{b.paradas}
                      {b.fallidas > 0 ? ` · ${b.fallidas} fallida${b.fallidas === 1 ? "" : "s"}` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Tarjeta>

        {/* Rutas activas */}
        <Tarjeta>
          <div className="flex items-center gap-2 border-b border-line px-3.5 py-2">
            <h3 className="text-[13.5px] font-bold">Rutas</h3>
            <span className="num text-[12px] text-ink-3">
              {rutasVisibles.length}
              {rutasVisibles.length !== porRuta.length && ` de ${porRuta.length}`}
            </span>
            {bases.length > 0 && (
              <select
                value={soloBase}
                onChange={(e) => setSoloBase(e.target.value)}
                aria-label="Filtrar las rutas por base"
                className="rounded-[8px] border border-line-strong bg-surface px-2 py-1 text-[12px]"
              >
                <option value="">Todas las bases</option>
                {bases.map((b) => (
                  <option key={b.nombre} value={b.nombre}>{b.nombre}</option>
                ))}
              </select>
            )}
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11.5px] text-ink-3">
              <input
                type="checkbox"
                checked={compacto}
                onChange={(e) => cambiarDensidad(e.target.checked)}
              />
              Modo comprimido
            </label>
            {!compacto && (
              <span className="hidden text-[11.5px] text-ink-3 lg:block">
                Toca una ruta para ver su mapa y sus entregas
              </span>
            )}
          </div>
          <div className="divide-y divide-line">
            {rutasVisibles.map(([indice, ps]) => {
              const cerradas = ps.filter((p) => p.estado_entrega !== "pendiente").length;
              const pct = Math.round((cerradas / (ps.length || 1)) * 100);
              const fallidas = ps.filter((p) => p.estado_entrega === "fallido").length;
              const siguiente = ps.find((p) => p.estado_entrega === "pendiente");
              const info = infoRuta.get(indice);
              const desplegada = abierta === indice;
              const suyos = eventosPorRuta.get(indice) ?? [];
              // Sin iniciar / en progreso / finalizada, dicho en la fila en
              // vez de deducirlo del porcentaje: una ruta al 0% porque nadie
              // ha salido no es lo mismo que una al 0% con el chofer en calle.
              const arranco = Boolean(info?.salida_real) ||
                suyos.some((e) => e.tipo === "ruta_iniciada");
              const estadoRuta = pct === 100
                ? { texto: "Finalizada", tono: "ok" as const }
                : arranco
                  ? { texto: "En progreso", tono: "live" as const }
                  : { texto: "Sin iniciar", tono: "plan" as const };
              return (
                <div key={indice}>
                  <button
                    onClick={() => setAbierta(desplegada ? null : indice)}
                    aria-expanded={desplegada}
                    className={`flex w-full flex-wrap items-center gap-3 px-4 text-left transition hover:bg-canvas ${
                      compacto ? "py-1.5" : "py-2.5"
                    }`}
                  >
                    <span className="w-3 shrink-0 text-[10px] text-ink-3">
                      {desplegada ? "▾" : "▸"}
                    </span>
                    <span
                      className="num rounded px-1.5 py-0.5 text-[10.5px] font-bold text-white"
                      style={{ background: color(indice) }}
                    >
                      R-{String(indice + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-[130px] flex-1">
                      <div className="h-1.5 overflow-hidden rounded-full border border-line bg-canvas">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: pct === 100 ? "var(--color-ok)" : color(indice),
                          }}
                        />
                      </div>
                    </div>
                    <span className="num text-[12px] font-semibold text-ink-2">
                      {cerradas}/{ps.length}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">
                      {siguiente ? `Siguiente: ${siguiente.nombre}` : "Ruta completada"}
                    </span>
                    {bases.length > 0 && (
                      <span className="hidden truncate text-[11.5px] font-semibold text-ink-2 sm:block">
                        {origenDe(info)}
                      </span>
                    )}
                    {info?.conductor && (
                      <span className="hidden truncate text-[11.5px] text-ink-3 sm:block">
                        {info.conductor}
                      </span>
                    )}
                    {fallidas > 0 && <Pastilla tono="bad">{fallidas} fallidas</Pastilla>}
                    <Pastilla tono={estadoRuta.tono}>{estadoRuta.texto}</Pastilla>
                  </button>

                  {/* La ruta a lo largo del día. Fuera del botón: cada punto
                      tiene su propio aviso al pasar el ratón. */}
                  {/* También para la ruta sin eventos: una pista vacía deja
                      las filas alineadas y la comparación entre rutas es
                      justamente de lo que trata esta franja. */}
                  {escala && (
                    <div className={`px-4 ${compacto ? "pb-1.5" : "pb-2.5"}`}>
                      <FranjaHoraria
                        eventos={suyos}
                        escala={escala}
                        color={color(indice)}
                        compacta={compacto}
                      />
                    </div>
                  )}

                  {desplegada && (
                    <DetalleRuta
                      paradas={ps}
                      geometria={info?.geometria ?? null}
                      color={color(indice)}
                      cd={
                        info?.base_lat != null && info?.base_lon != null
                          ? { lat: info.base_lat, lon: info.base_lon }
                          : cd
                      }
                      base={
                        info?.base_lat != null && info?.base_lon != null
                          ? (info.base_nombre ?? "Base")
                          : null
                      }
                      conductor={info?.conductor ?? null}
                      salida={info?.salida_real ?? null}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {escala && (
            <div className="border-t border-line px-4 pb-2 pt-2">
              <ReglaHoraria escala={escala} />
              <p className="mt-1 text-[11px] text-ink-3">
                Cada punto es una parada cerrada, a la hora en que se marcó. La
                barra de color es la salida del centro de distribución.
              </p>
            </div>
          )}
        </Tarjeta>

        {/* Incidencias */}
        <Tarjeta>
          <div className="flex items-center gap-2 border-b border-line px-3.5 py-2">
            <h3 className="text-[13.5px] font-bold">Incidencias que requieren decisión</h3>
            {incidencias.length > 0 ? (
              <Pastilla tono="bad">{incidencias.length}</Pastilla>
            ) : (
              <Pastilla tono="ok">ninguna</Pastilla>
            )}
          </div>
          {incidencias.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-ink-2">
              Sin entregas fallidas ni reprogramadas por ahora.
            </p>
          ) : (
            <div className="overflow-x-auto">
              {/* El ancho mínimo cómodo son 520 px, pero con la ventana
                  estrecha la columna mide 464 y la tabla se iba en scroll
                  horizontal: cinco datos cortos no merecen que haya que
                  arrastrar para ver el estado de una incidencia. */}
              <table className="w-full min-w-[430px] border-collapse text-[12.5px] @5xl:min-w-[520px]">
                <thead>
                  <tr>
                    {["Tienda", "Ruta", "Motivo", "Hora", "Estado"].map((h) => (
                      <th key={h} className="border-b border-line bg-surface-2 px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {incidencias.map((p) => (
                    <tr key={p.id}>
                      <td className="border-b border-line px-3 py-1.5">
                        <Link
                          href={`/paradas/${p.id}`}
                          className="font-bold text-ink transition hover:underline"
                        >
                          {p.nombre}
                        </Link>
                        <br />
                        <span className="text-[11.5px] text-ink-3">{p.distrito ?? "—"}</span>
                      </td>
                      <td className="num border-b border-line px-3 py-2">
                        R-{String((p.ruta_indice ?? 0) + 1).padStart(2, "0")}
                      </td>
                      <td className="border-b border-line px-3 py-1.5 text-ink-2">
                        {queLePaso(p)}
                      </td>
                      <td className="num border-b border-line px-3 py-1.5 text-ink-2">
                        {horaDe(p.hora_entrega)}
                      </td>
                      <td className="border-b border-line px-3 py-2">
                        <Pastilla tono={ESTADO_TONO[p.estado_entrega]}>
                          {ESTADO_TEXTO[p.estado_entrega] ?? p.estado_entrega}
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

      {/* Actividad reciente */}
      <aside className="min-w-0 rounded-[10px] border border-line p-5">
        <h3 className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.11em] text-ink-3">
          Actividad reciente
        </h3>
        {ultimas.length === 0 ? (
          <p className="text-[13px] text-ink-2">
            Todavía no hay entregas registradas. Cuando los conductores marquen
            desde su móvil, aparecerán aquí.
          </p>
        ) : (
          <div className="flex flex-col">
            {ultimas.map((e) => (
              <LineaActividad key={e.id} evento={e} />
            ))}
          </div>
        )}
      </aside>
    </div>
    </div>
  );
}

/** Un paso del registro, contado en una línea. */
function LineaActividad({ evento }: { evento: Evento }) {
  const ruta = `R-${String(evento.ruta_indice + 1).padStart(2, "0")}`;
  const d = evento.datos as {
    desde?: string;
    motivo?: string;
    bultos_entregados?: number;
    recibe?: string;
    corregida?: boolean;
    reconstruido?: boolean;
  };

  // «plan» no tiene color propio en el tema: es el gris del lienzo, así que
  // aquí se escribe a mano en vez de componer un nombre de variable que no
  // existe y dejar el cuadrito transparente.
  const marca =
    evento.tipo === "ruta_iniciada" ? { icono: "▶", fondo: "var(--color-live-bg)", tinta: "var(--color-live)" }
    : evento.tipo === "ruta_terminada" ? { icono: "⏹", fondo: "var(--color-ok-bg)", tinta: "var(--color-ok)" }
    : evento.tipo === "entregado" ? { icono: "✓", fondo: "var(--color-ok-bg)", tinta: "var(--color-ok)" }
    : evento.tipo === "fallido" ? { icono: "✕", fondo: "var(--color-bad-bg)", tinta: "var(--color-bad)" }
    : evento.tipo === "pendiente" ? { icono: "↺", fondo: "var(--color-canvas)", tinta: "var(--color-ink-2)" }
    : { icono: "!", fondo: "var(--color-warn-bg)", tinta: "var(--color-warn)" };

  const titulo =
    evento.tipo === "ruta_iniciada" ? `${ruta} salió del CD`
    : evento.tipo === "ruta_terminada" ? `${ruta} terminó su ruta`
    : (evento.parada ?? "Parada");

  const detalle: string[] = [];
  if (evento.tipo === "entregado" && d.bultos_entregados != null) {
    detalle.push(`${d.bultos_entregados} bultos`);
  }
  if (evento.tipo === "parcial" && d.bultos_entregados != null) {
    detalle.push(`entregó ${d.bultos_entregados}`);
  }
  if (d.recibe) detalle.push(`recibe ${d.recibe}`);
  if (d.motivo) detalle.push(d.motivo);
  // Una marca que pisa a otra es información: alguien se equivocó y corrigió.
  if (d.corregida && d.desde) detalle.push(`corregida desde «${ESTADO_TEXTO[d.desde] ?? d.desde}»`);
  if (evento.autor) detalle.push(evento.autor);
  if (d.reconstruido) detalle.push("reconstruido");

  return (
    <div className="flex gap-2.5 border-b border-dashed border-line py-2 last:border-0">
      <span className="num shrink-0 pt-0.5 text-[11px] text-ink-3">
        {horaDe(evento.ocurrido_en)}
      </span>
      <span
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px]"
        style={{ background: marca.fondo, color: marca.tinta }}
      >
        {marca.icono}
      </span>
      <div className="min-w-0 text-[12px] text-ink-2">
        <b className="block text-[12.5px] text-ink">{titulo}</b>
        {detalle.length > 0 && detalle.join(" · ")}
      </div>
    </div>
  );
}

/**
 * Lo que hay detrás de una ruta: su mapa con cada parada pintada según cómo
 * terminó, y la lista en orden de visita con la hora y el motivo.
 */
function DetalleRuta({
  paradas, geometria, color, cd, base, conductor, salida,
}: {
  paradas: ParadaSeguimiento[];
  geometria: number[][] | null;
  color: string;
  /** De dónde sale esta ruta: su base, o el centro del despacho. */
  cd: { lat: number; lon: number } | null;
  /** El nombre de la base, si sale de una. */
  base: string | null;
  conductor: string | null;
  salida: string | null;
}) {
  const ordenadas = useMemo(
    () => [...paradas].sort((a, b) => a.orden - b.orden),
    [paradas],
  );

  return (
    <div className="border-t border-line bg-surface-2 p-3">
      <div className="mb-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-2">
        {conductor && (
          <span>
            Conductor <b className="text-ink">{conductor}</b>
          </span>
        )}
        <span>
          {base ? `Salió de ${base}:` : "Salió del CD:"}{" "}
          <b className="num text-ink">{salida ? horaDe(salida) : "aún no"}</b>
        </span>
        <span className="ml-auto flex flex-wrap gap-3">
          <Leyenda color="#2F855A" texto="Entregado" />
          <Leyenda color="#B7791F" texto="Parcial" />
          <Leyenda color="#D9534F" texto="No entregado" />
          <Leyenda color="#9AA5B1" texto="Pendiente" />
        </span>
      </div>

      <div className="grid gap-3 @2xl:grid-cols-[1fr_1fr]">
        <div className="h-[300px] overflow-hidden rounded-[10px] border border-line">
          <MapaSeguimiento
            paradas={ordenadas.map((p) => ({
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
            geometria={geometria}
            colorRuta={color}
            cd={cd}
            nombreCd={base}
          />
        </div>

        <div className="max-h-[300px] overflow-y-auto rounded-[10px] border border-line bg-surface">
          {ordenadas.map((p) => {
            const tono = ESTADO_TONO[p.estado_entrega];
            return (
              <div
                key={p.id}
                className="flex gap-2.5 border-b border-line px-3 py-1.5 last:border-0"
              >
                <span
                  className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10.5px] font-bold text-white"
                  style={{ background: COLOR_PUNTO[p.estado_entrega] ?? COLOR_PUNTO.pendiente }}
                >
                  {p.orden}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
                      {p.nombre ?? p.codigo}
                    </span>
                    <Pastilla tono={tono}>{ESTADO_TEXTO[p.estado_entrega]}</Pastilla>
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-ink-3">
                    <span className="num">{p.bultos}</span> bultos
                    {p.distrito ? ` · ${p.distrito}` : ""}
                    {p.hora_entrega ? ` · ${horaDe(p.hora_entrega)}` : ""}
                  </div>
                  {(p.motivo || p.recibe || p.observaciones || p.estado_entrega === "parcial") && (
                    <div className="mt-0.5 text-[11.5px] text-ink-2">
                      {p.recibe && <>Recibió <b>{p.recibe}</b>. </>}
                      {p.estado_entrega !== "entregado" && queLePaso(p)}
                    </div>
                  )}
                  {p.foto_url && (
                    <FotoEntrega ruta={p.foto_url} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Mismos colores que el mapa, para que la lista y los puntos se lean igual. */
const COLOR_PUNTO: Record<string, string> = {
  entregado: "#2F855A",
  parcial: "#B7791F",
  reprogramado: "#B7791F",
  fallido: "#D9534F",
  pendiente: "#9AA5B1",
};

/**
 * El bucket de fotos es privado, así que la imagen se pide con un enlace
 * firmado que caduca; no se puede enlazar la ruta a pelo.
 */
function FotoEntrega({ ruta }: { ruta: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);

  async function abrir() {
    try {
      const firmada = await verFoto(ruta);
      if (!firmada) throw new Error("sin acceso");
      setUrl(firmada);
    } catch {
      setFallo(true);
    }
  }

  if (fallo) return <span className="text-[11.5px] text-ink-3">Foto no disponible</span>;

  if (!url) {
    return (
      <button
        onClick={abrir}
        className="mt-1 text-[11.5px] font-semibold text-amber-600 underline underline-offset-2"
      >
        Ver foto de entrega
      </button>
    );
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-1 block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Prueba de entrega"
        className="max-h-32 rounded-[8px] border border-line"
      />
    </a>
  );
}

function Leyenda({ color, texto }: { color: string; texto: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <i className="h-2.5 w-2.5 rounded-sm not-italic" style={{ background: color }} />
      {texto}
    </span>
  );
}
