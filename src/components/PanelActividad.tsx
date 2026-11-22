"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  estadoFlota,
  eventosDelDia,
  type Evento,
  type RutaEnCalle,
} from "@/app/acciones/datos";
import { escalaDe, type Escala } from "@/components/FranjaHoraria";
import { aCSV, descargar } from "@/lib/exportar";
import { hora, hoy } from "@/lib/horas";

/**
 * Los colores de esta pantalla, que son los de la de referencia.
 *
 * Actividad conserva allí su diseño anterior —Roboto a 13 px, verde y
 * turquesa, tarjetas de esquina recta— y aquí se sigue igual, aunque el
 * resto de pantallas vaya en azul y DM Sans. Lo que se quiere es que cada
 * pantalla se parezca a la suya.
 */
const C = {
  texto: "#676a6c",
  tenue: "#a8a8a8",
  verde: "#1ab394",
  turquesa: "#23c6c8",
  naranja: "#f8ac59",
  rojo: "#ed5565",
  gris: "#b5b8bb",
  borde: "#dddddd",
} as const;

/** El color del cumplimiento: verde si va bien, naranja a medias, gris sin empezar. */
const tonoDe = (pct: number) => (pct >= 75 ? C.verde : pct > 0 ? C.naranja : C.texto);

/** Los indicadores que se pueden poner arriba, y cómo se calcula cada uno. */
type ClaveIndicador =
  | "en_ruta" | "cumplimiento" | "entregado" | "fallido" | "pendiente" | "sin_salir";

const INDICADORES: Record<ClaveIndicador, { texto: string; ayuda: string }> = {
  en_ruta: { texto: "Veh. en ruta", ayuda: "Han salido y les queda trabajo" },
  cumplimiento: { texto: "Cumplimiento", ayuda: "Paradas cerradas sobre asignadas" },
  entregado: { texto: "Entregado", ayuda: "Paradas entregadas sobre asignadas" },
  fallido: { texto: "Fallido", ayuda: "Paradas no entregadas sobre asignadas" },
  pendiente: { texto: "Pendiente", ayuda: "Paradas que siguen sin marcar" },
  sin_salir: { texto: "Sin salir", ayuda: "Rutas asignadas que no han arrancado" },
};

const POR_DEFECTO: ClaveIndicador[] = [
  "en_ruta", "cumplimiento", "entregado", "fallido", "pendiente",
];

type Orden = "placa" | "avance" | "desvio" | "silencio";

export default function PanelActividad({
  rutas: inicial,
  eventos: eventosIniciales,
  dia = null,
}: {
  rutas: RutaEnCalle[];
  eventos: Evento[];
  dia?: string | null;
}) {
  const router = useRouter();
  const [rutas, setRutas] = useState(inicial);
  const [eventos, setEventos] = useState(eventosIniciales);
  const [busca, setBusca] = useState("");
  const [orden, setOrden] = useState<Orden>("avance");
  const [compacto, setCompacto] = useState(false);
  const [auto, setAuto] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [actualizado, setActualizado] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const montado = useRef(true);

  useEffect(() => () => { montado.current = false; }, []);
  useEffect(() => { setRutas(inicial); setEventos(eventosIniciales); },
    [inicial, eventosIniciales]);

  // La elección de indicadores y la densidad son de quien mira, no del día.
  useEffect(() => {
    try {
      setCompacto(localStorage.getItem("actividad:compacto") === "1");
    } catch {
      /* almacenamiento bloqueado: se usa lo de por defecto */
    }
  }, []);

  function guardar(clave: string, valor: string) {
    try { localStorage.setItem(clave, valor); } catch { /* da igual */ }
  }

  const refrescar = useCallback(async () => {
    setCargando(true);
    try {
      const [r, e] = await Promise.all([
        estadoFlota(dia ?? undefined),
        eventosDelDia(dia ?? undefined),
      ]);
      if (!montado.current) return;
      setRutas(r);
      setEventos(e);
      setActualizado(new Date());
      setError(null);
    } catch (err) {
      if (montado.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (montado.current) setCargando(false);
    }
  }, [dia]);

  useEffect(() => {
    if (!auto || dia) return;
    const t = setInterval(refrescar, 30000);
    return () => clearInterval(t);
  }, [auto, dia, refrescar]);

  const ahora = Date.now();

  const totales = useMemo(() => {
    const asignadas = rutas.reduce((a, r) => a + r.asignadas, 0) || 1;
    const gestionadas = rutas.reduce((a, r) => a + r.gestionadas, 0);
    const entregadas = rutas.reduce((a, r) => a + r.entregadas, 0);
    const fallidas = rutas.reduce((a, r) => a + r.fallidas, 0);
    const enRuta = rutas.filter(
      (r) => r.salida_real && !r.fin_real && r.gestionadas < r.asignadas,
    ).length;
    const sinSalir = rutas.filter((r) => !r.salida_real).length;
    return {
      en_ruta: { n: enRuta, de: rutas.length },
      cumplimiento: { n: gestionadas, de: asignadas },
      entregado: { n: entregadas, de: asignadas },
      fallido: { n: fallidas, de: asignadas },
      pendiente: { n: asignadas - gestionadas, de: asignadas },
      sin_salir: { n: sinSalir, de: rutas.length },
    } as Record<ClaveIndicador, { n: number; de: number }>;
  }, [rutas]);

  const escala = useMemo(() => escalaDe(eventos), [eventos]);

  const porRuta = useMemo(() => {
    const m = new Map<string, Evento[]>();
    (eventos as (Evento & { ruta_id?: string })[]).forEach((e) => {
      const k = e.ruta_id ?? "";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    });
    return m;
  }, [eventos]);

  const visibles = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const lista = t
      ? rutas.filter((r) =>
          `${r.conductor ?? ""} ${r.placa ?? ""} ${r.vehiculo ?? ""} ${r.despacho ?? ""}`
            .toLowerCase()
            .includes(t),
        )
      : [...rutas];

    const silencio = (r: RutaEnCalle) =>
      r.ultima_marca ? ahora - new Date(r.ultima_marca).getTime() : -1;

    return lista.sort((a, b) => {
      if (orden === "placa") return (a.placa ?? a.conductor ?? "").localeCompare(b.placa ?? b.conductor ?? "");
      if (orden === "desvio") return (b.desvio_min ?? -9999) - (a.desvio_min ?? -9999);
      if (orden === "silencio") return silencio(b) - silencio(a);
      // Por avance: lo que va peor, primero. Es lo que hay que mirar.
      const pa = a.asignadas ? a.gestionadas / a.asignadas : 1;
      const pb = b.asignadas ? b.gestionadas / b.asignadas : 1;
      return pa - pb;
    });
  }, [rutas, busca, orden, ahora]);

  const pctTotal = (k: ClaveIndicador) =>
    totales[k].de ? Math.round((totales[k].n / totales[k].de) * 1000) / 10 : 0;

  function exportar() {
    descargar(
      `actividad-${dia ?? hoy()}.csv`,
      aCSV(
        ["Vehículo", "Conductor", "Despacho", "Asignadas", "Entregas", "Gestionadas", "No entregadas", "Cumplimiento %", "Última marca"],
        visibles.map((r) => [
          r.placa ?? `R-${String(r.indice + 1).padStart(2, "0")}`,
          r.conductor,
          r.despacho,
          r.asignadas,
          r.entregadas,
          r.gestionadas,
          r.fallidas,
          r.asignadas ? Math.round((r.gestionadas / r.asignadas) * 100) : 0,
          r.ultima_marca ? hora(r.ultima_marca) : "",
        ]),
      ),
    );
  }

  return (
    <div
      className="sin-panel pb-5 font-[family-name:var(--font-roboto)] text-[13px]"
      style={{ color: C.texto }}
    >
      {/* Título y acciones */}
      <div className="flex min-h-[46px] flex-wrap items-center gap-2 px-[18px] pt-1">
        <span className="text-[18px]" style={{ color: "rgba(52,70,96,0.6)" }}>
          <b className="font-bold">{rutas.length}</b> Vehículos en ruta
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          {actualizado && (
            <span className="num mr-1 text-[11px]" style={{ color: C.tenue }}>
              Actualizado {hora(actualizado)}
            </span>
          )}
          <input
            type="date"
            value={dia ?? hoy()}
            onChange={(e) =>
              router.push(e.target.value ? `/actividad?fecha=${e.target.value}` : "/actividad")
            }
            className="num h-9 rounded-[3px] border bg-white px-2 text-[13px] outline-none"
            style={{ borderColor: C.borde, color: C.texto }}
          />
          <button
            onClick={refrescar}
            disabled={cargando}
            className="h-9 rounded-[3px] px-3 text-[13px] text-white transition hover:brightness-95 disabled:opacity-60"
            style={{ background: "#70a2c7" }}
          >
            {cargando ? "…" : "↻ Actualizar"}
          </button>
          <button
            onClick={exportar}
            disabled={!visibles.length}
            className="h-9 rounded-[3px] px-3 text-[13px] text-white transition hover:brightness-95 disabled:opacity-60"
            style={{ background: C.turquesa }}
          >
            ⤓ Exportar a excel
          </button>
        </div>
      </div>

      {/* Tira de indicadores, buscador y filtros */}
      <div className="flex min-h-[41px] flex-wrap items-center gap-y-1 px-[3px] py-[3px]">
        <Indicador valor={`${pctTotal("cumplimiento")}%`} texto="Cumplimiento total" />
        <Indicador valor={totales.cumplimiento.de} texto="Asignadas" />
        <Indicador valor={totales.cumplimiento.n} texto="Gestionadas" />
        <Indicador valor={`${pctTotal("entregado")}%`} texto="Entregadas" />
        <Indicador valor={`${pctTotal("fallido")}%`} texto="No Entregadas" />
        <Indicador valor={totales.en_ruta.n} texto="En ruta" />
        <Indicador valor={totales.sin_salir.n} texto="Sin salir" />

        <div className="ml-auto flex flex-wrap items-center gap-2 pr-[10px]">
          <label className="relative block">
            <span className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2 text-[13px]" style={{ color: C.turquesa }}>
              ⌕
            </span>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar"
              className="h-[34px] w-[183px] border-0 bg-white pl-[35px] pr-[5px] text-[13px] outline-none"
              style={{ color: C.texto }}
            />
          </label>
          <select
            value={orden}
            onChange={(e) => setOrden(e.target.value as Orden)}
            title="Filtros"
            className="h-[34px] border-0 bg-transparent text-[13px] outline-none"
            style={{ color: C.texto }}
          >
            <option value="avance">☰ Por avance</option>
            <option value="desvio">☰ Por retraso</option>
            <option value="silencio">☰ Por silencio</option>
            <option value="placa">☰ Por placa</option>
          </select>
          <label className="flex cursor-pointer items-center gap-1 text-[12px]">
            <input
              type="checkbox"
              checked={compacto}
              onChange={(e) => {
                setCompacto(e.target.checked);
                guardar("actividad:compacto", e.target.checked ? "1" : "0");
              }}
            />
            Comprimido
          </label>
          {!dia && (
            <label className="flex cursor-pointer items-center gap-1 text-[12px]">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              30 s
            </label>
          )}
        </div>
      </div>

      <div className="px-[13px] pt-[2px]">
        {error && (
          <p className="mb-2 border px-3 py-2 text-[13px]" style={{ borderColor: C.rojo, color: C.rojo, background: "#fff" }}>
            {error}
          </p>
        )}

        {visibles.length === 0 ? (
          <div className="border bg-white p-6 text-[13px]" style={{ borderColor: C.borde }}>
            {rutas.length === 0
              ? dia
                ? "Ese día no tuvo ninguna ruta asignada."
                : "Hoy todavía no hay rutas. Guarda un despacho en Nueva Actividad y asígnale conductor."
              : "Ningún vehículo coincide con la búsqueda."}
          </div>
        ) : (
          <div className="flex flex-col gap-[10px]">
            {visibles.map((r) => (
              <TarjetaVehiculo
                key={r.ruta_id}
                ruta={r}
                eventos={porRuta.get(r.ruta_id) ?? []}
                escala={escala}
                compacto={compacto}
                ahora={ahora}
                esHoy={!dia}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Un indicador de la tira: flechas, cifra en negrita y su nombre en gris. */
function Indicador({ valor, texto }: { valor: string | number; texto: string }) {
  return (
    <span className="flex h-[35px] items-center gap-[5px] px-[6px]">
      <span className="text-[11px] leading-none" style={{ color: C.turquesa }}>
        ⬍
      </span>
      <b className="num text-[16px] font-bold">{valor}</b>
      <span className="text-[12px] font-bold" style={{ color: C.tenue }}>
        {texto}
      </span>
    </span>
  );
}

const SILENCIO_MIN = 90;

/**
 * La tarjeta de un vehículo, con la disposición de la referencia.
 *
 * Arriba, sobre gris claro: la placa con su punto de conexión, tres cifras
 * —asignadas, entregas, gestionadas— y el cumplimiento con su barra. Abajo,
 * al desplegar: el reparto de resultados a la izquierda y el día dibujado a
 * la derecha, con las señales del móvil encima.
 */
function TarjetaVehiculo({
  ruta: r,
  eventos,
  escala,
  compacto,
  ahora,
  esHoy,
}: {
  ruta: RutaEnCalle;
  eventos: Evento[];
  escala: Escala | null;
  compacto: boolean;
  ahora: number;
  esHoy: boolean;
}) {
  const [abierta, setAbierta] = useState<boolean | null>(null);
  // El modo comprimido pliega todas; el botón de cada una manda sobre él.
  const desplegada = abierta ?? !compacto;

  // Zoom de la línea del día. 0 es la escala común a todas las tarjetas;
  // cada paso hacia dentro la reduce a la mitad alrededor de lo que hizo
  // esta ruta, y hacia fuera la duplica.
  const [zoom, setZoom] = useState(0);
  // Con zoom, la línea se arrastra para ver lo que quedó fuera.
  const [despl, setDespl] = useState(0);
  const arrastre = useRef<{ x: number; despl: number; ancho: number } | null>(null);
  const ventana = useMemo<Escala | null>(() => {
    if (!escala || (zoom === 0 && despl === 0)) return escala;
    const ancho = (escala.hasta - escala.desde) / 2 ** zoom;
    const horas = eventos.map((e) => new Date(e.ocurrido_en).getTime());
    let centro = (escala.desde + escala.hasta) / 2;
    if (zoom > 0 && horas.length) {
      const ini = Math.min(...horas);
      const fin = Math.max(...horas);
      // Si todo lo que hizo cabe, se centra; si no, se empieza por el
      // principio, que es mejor que abrir sobre un tramo vacío.
      centro = fin - ini <= ancho * 0.9 ? (ini + fin) / 2 : ini + ancho * 0.45;
    }
    centro += despl;
    return { ...escala, desde: centro - ancho / 2, hasta: centro + ancho / 2 };
  }, [escala, zoom, despl, eventos]);

  const pct = r.asignadas ? Math.round((r.gestionadas / r.asignadas) * 100) : 0;
  const cerrada = Boolean(r.fin_real) || (r.asignadas > 0 && r.gestionadas === r.asignadas);
  const callado = r.ultima_marca ? (ahora - new Date(r.ultima_marca).getTime()) / 60000 : null;
  const enSilencio = !cerrada && r.salida_real && callado != null && callado >= SILENCIO_MIN;
  const conectado = Boolean(r.salida_real) && !cerrada && !enSilencio;

  const parciales = Math.max(0, r.gestionadas - r.entregadas - r.fallidas);
  const sobre = (n: number) => (r.gestionadas ? Math.round((n / r.gestionadas) * 100) : 0);
  const tono = tonoDe(pct);

  const estado = cerrada
    ? "Ruta finalizada"
    : !r.salida_real
      ? "Ruta no iniciada"
      : enSilencio
        ? "Sin dar señales"
        : null;

  return (
    <div
      className="border bg-white"
      style={{ borderColor: C.borde, boxShadow: "0 2px 1px rgba(0,0,0,0.1)" }}
    >
      {/* Franja superior */}
      <div className="flex min-h-[67px] flex-wrap items-stretch" style={{ background: "#f9f9f9" }}>
        <div className="flex w-[270px] shrink-0 items-start gap-[10px] px-[10px] pt-[6px]">
          <span
            className="mt-[6px] h-[9px] w-[9px] shrink-0 rounded-full"
            style={{ background: conectado ? C.turquesa : "transparent" }}
            title={conectado ? "En ruta y dando señales" : undefined}
          />
          <div className="min-w-0 flex-1">
            <h3 className="num truncate text-[16px] font-bold leading-[18px]">
              {r.placa ?? `R-${String(r.indice + 1).padStart(2, "0")}`}
            </h3>
            <div className="truncate text-[11px] font-medium">{r.conductor ?? "Sin conductor"}</div>
            <div className="truncate text-[11px]" style={{ color: C.tenue }}>
              {r.despacho ?? "Despacho"}
            </div>
          </div>
          <Link
            href={`/torre?despacho=${r.despacho_id}`}
            title="Seguir este despacho en la torre"
            className="mt-[2px] grid h-[18px] w-[24px] shrink-0 place-items-center rounded-full border text-[10px]"
            style={{ borderColor: C.turquesa, color: C.turquesa }}
          >
            ◉
          </Link>
        </div>

        <Numero n={r.asignadas} texto="Asignadas" />
        <Numero n={r.entregadas} texto="Entregas" />
        <Numero n={r.gestionadas} texto="Gestionadas" />

        <div className="ml-auto flex min-w-[260px] max-w-[400px] flex-1 items-center gap-3 border-l px-[14px]" style={{ borderColor: "#ececec" }}>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-bold" style={{ color: tono }}>
              Cumplimiento
            </div>
            <div className="mt-[3px] flex items-center gap-2">
              <div className="h-[2px] flex-1" style={{ background: "#dfe2e5" }}>
                <div className="h-full" style={{ width: `${pct}%`, background: tono }} />
              </div>
              <span className="num w-[42px] text-right text-[16px] font-bold" style={{ color: tono }}>
                {pct}%
              </span>
            </div>
          </div>
          <button
            onClick={() => setAbierta(!desplegada)}
            aria-expanded={desplegada}
            title={desplegada ? "Plegar" : "Desplegar"}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] text-white transition hover:brightness-95"
            style={{ background: C.turquesa }}
          >
            <span className={`transition-transform ${desplegada ? "" : "-rotate-90"}`}>▾</span>
          </button>
        </div>
      </div>

      {/* Franja inferior */}
      {desplegada && (
        <div className="flex flex-wrap">
          <div className="w-[270px] shrink-0 px-[10px] pb-[10px] pt-[30px]">
            {estado && (
              <div
                className="-mt-[22px] mb-[6px] text-[11px] font-bold"
                style={{ color: enSilencio ? C.rojo : C.verde }}
              >
                {estado}
              </div>
            )}
            <Reparto n={r.entregadas} texto="Entregadas" pct={sobre(r.entregadas)} color={C.verde} />
            <Reparto n={parciales} texto="Parciales" pct={sobre(parciales)} color={C.naranja} />
            <Reparto n={r.fallidas} texto="No Entregadas" pct={sobre(r.fallidas)} color={C.rojo} />
          </div>

          <div className="min-w-[320px] flex-1 px-[10px]">
            <div className="flex h-[31px] items-center gap-0 text-[11px] font-bold" style={{ color: "#a2a2a2" }}>
              {escala && (
                <div className="mr-auto flex items-center gap-[10px]" style={{ color: "#39414d" }}>
                  <BotonZoom titulo="Alejar" onClick={() => setZoom((z) => Math.max(-2, z - 1))} desactivado={zoom <= -2}>
                    <path d="M3 5.6h5v1H3z" fill="currentColor" stroke="none" />
                  </BotonZoom>
                  <BotonZoom titulo="Acercar" onClick={() => setZoom((z) => Math.min(5, z + 1))} desactivado={zoom >= 5}>
                    <path d="M3 5.6h5v1H3zM5 3.6h1v5H5z" fill="currentColor" stroke="none" />
                  </BotonZoom>
                  <BotonZoom
                    titulo="Restablecer"
                    onClick={() => { setZoom(0); setDespl(0); }}
                    desactivado={zoom === 0 && despl === 0}
                    sinLupa
                  >
                    <path d="M2.2 6.4a4.6 4.6 0 1 1 1.5 3.4M2 2.6v3.9h3.9" />
                  </BotonZoom>
                </div>
              )}
              <Senal texto="Desvío" valor={r.desvio_min != null ? `${r.desvio_min > 0 ? "+" : ""}${r.desvio_min} min` : null} alerta={r.desvio_min != null && r.desvio_min > 15} />
              <Senal texto="Señal" valor={r.red ? r.red.toUpperCase() : null} alerta={Boolean(enSilencio)} />
              <Senal texto="Batería" valor={r.bateria != null ? `${r.bateria}%` : null} alerta={r.bateria != null && r.bateria <= 20} />
              <Senal texto="Última" valor={r.ultima_marca ? hora(r.ultima_marca) : null} />
            </div>
            {ventana ? (
              <div
                className={zoom !== 0 ? "cursor-grab touch-none select-none active:cursor-grabbing" : undefined}
                title={zoom !== 0 ? "Arrastra para moverte por el día" : undefined}
                onPointerDown={(e) => {
                  if (zoom === 0) return;
                  arrastre.current = { x: e.clientX, despl, ancho: e.currentTarget.clientWidth || 1 };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  const a = arrastre.current;
                  if (!a) return;
                  const tramo = ventana.hasta - ventana.desde;
                  setDespl(a.despl - ((e.clientX - a.x) / a.ancho) * tramo);
                }}
                onPointerUp={() => { arrastre.current = null; }}
                onPointerCancel={() => { arrastre.current = null; }}
              >
                <LineaDia eventos={eventos} escala={ventana} ahora={esHoy ? ahora : null} />
              </div>
            ) : (
              <div className="pb-4 text-[11px]" style={{ color: C.tenue }}>
                Sin actividad todavía
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Numero({ n, texto }: { n: number; texto: string }) {
  return (
    <div className="flex w-[78px] shrink-0 flex-col items-center justify-center border-l" style={{ borderColor: "#ececec" }}>
      <span className="num text-[16px] font-bold leading-[23px]">{n}</span>
      <span className="text-[11px]" style={{ color: C.tenue }}>
        {texto}
      </span>
    </div>
  );
}

function Reparto({ n, texto, pct, color }: { n: number; texto: string; pct: number; color: string }) {
  return (
    <div className="mb-[9px]">
      <div className="flex items-baseline justify-between text-[10px] font-bold">
        <span>
          <span className="num">{n}</span> {texto}
        </span>
        <span className="num">{pct}%</span>
      </div>
      <div className="mt-[2px] h-[2px]" style={{ background: "#dfe2e5" }}>
        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function BotonZoom({
  titulo, onClick, desactivado, sinLupa = false, children,
}: {
  titulo: string;
  onClick: () => void;
  desactivado: boolean;
  sinLupa?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      onClick={onClick}
      disabled={desactivado}
      className="grid h-[21px] w-[14px] place-items-center transition hover:text-black disabled:opacity-35"
    >
      <svg width="14" height="15" viewBox="0 0 14 15" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {!sinLupa && (
          <>
            <circle cx="5.5" cy="6.1" r="5" />
            <path d="M9.3 9.9 13.2 13.8" />
          </>
        )}
        {children}
      </svg>
    </button>
  );
}

function Senal({ texto, valor, alerta = false }: { texto: string; valor: string | null; alerta?: boolean }) {
  return (
    <span className="px-[14px] py-[3px]" title={valor ?? "Sin dato"}>
      {texto}
      {alerta && <span style={{ color: C.rojo }}> ●</span>}
      {valor && (
        <span className="num ml-1 font-normal" style={{ color: alerta ? C.rojo : C.texto }}>
          {valor}
        </span>
      )}
    </span>
  );
}

const TONO_EVENTO: Record<string, string> = {
  entregado: C.verde,
  parcial: C.naranja,
  reprogramado: C.naranja,
  fallido: C.rojo,
  pendiente: C.gris,
};

/**
 * El día de la ruta: un punto por parada marcada, sobre un eje de horas.
 *
 * Todas las tarjetas comparten la misma escala, para poder comparar una ruta
 * con la de al lado de un vistazo. La raya naranja es la hora actual.
 */
function LineaDia({
  eventos,
  escala,
  ahora,
}: {
  eventos: Evento[];
  escala: Escala;
  ahora: number | null;
}) {
  const ancho = escala.hasta - escala.desde || 1;
  const pos = (t: number) => ((t - escala.desde) / ancho) * 100;
  const dentro = (t: number) => t >= escala.desde && t <= escala.hasta;

  // Marcas del eje: el paso más fino que no pase de ocho, para que con el
  // zoom aparezcan las medias horas y los cuartos.
  const minuto = 60 * 1000;
  const paso =
    [5, 10, 15, 30, 60, 120, 180, 240, 360, 720, 1440].find((p) => ancho / (p * minuto) <= 8) ?? 1440;
  const marcas: number[] = [];
  for (
    let t = Math.ceil(escala.desde / (paso * minuto)) * paso * minuto;
    t <= escala.hasta;
    t += paso * minuto
  ) {
    marcas.push(t);
  }

  const salida = eventos.find((e) => e.tipo === "ruta_iniciada");
  const marcasParada = eventos.filter(
    (e) =>
      e.tipo !== "ruta_iniciada" &&
      e.tipo !== "ruta_terminada" &&
      dentro(new Date(e.ocurrido_en).getTime()),
  );
  const tSalida = salida ? new Date(salida.ocurrido_en).getTime() : null;

  return (
    <div className="relative mx-[14px] h-[100px]">
      {/* Eje punteado */}
      <div className="absolute inset-x-0 top-[78px] border-t border-dashed" style={{ borderColor: "#cfd3d7" }} />

      {marcas.map((t) => (
        <span
          key={t}
          className="num absolute top-[82px] -translate-x-1/2 text-[10px]"
          style={{ left: `${pos(t)}%`, color: C.tenue }}
        >
          {hora(new Date(t))}
        </span>
      ))}

      {ahora !== null && dentro(ahora) && (
        <span
          className="absolute top-0 h-[78px] w-[2px]"
          style={{ left: `${pos(ahora)}%`, background: C.naranja }}
          title="Ahora"
        />
      )}

      {tSalida !== null && dentro(tSalida) && (
        <span
          title={`Salió del centro a las ${hora(salida!.ocurrido_en)}`}
          className="absolute top-[8px] h-[20px] w-[3px] -translate-x-1/2"
          style={{ left: `${pos(tSalida)}%`, background: C.turquesa }}
        />
      )}

      {/* Dos alturas, como en la referencia: arriba lo entregado, abajo lo
          que no salió bien, para que un fallo no se pierda entre los verdes. */}
      {marcasParada.map((e) => (
        <span
          key={e.id}
          title={`${hora(e.ocurrido_en)} · ${e.parada ?? "Parada"}`}
          className="absolute h-[16px] w-[16px] -translate-x-1/2 rounded-full"
          style={{
            top: e.tipo === "entregado" ? 10 : 50,
            left: `${pos(new Date(e.ocurrido_en).getTime())}%`,
            background: TONO_EVENTO[e.tipo] ?? C.gris,
          }}
        />
      ))}
    </div>
  );
}
