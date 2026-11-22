"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  estadoFlota,
  eventosDelDia,
  paradasDeRuta,
  type Evento,
  type ParadaConDesvio,
  type RutaEnCalle,
} from "@/app/acciones/datos";
import { escalaDe, type Escala } from "@/components/FranjaHoraria";
import { aCSV, descargar } from "@/lib/exportar";
import { hora, hoy } from "@/lib/horas";

const MapaSeguimiento = dynamic(() => import("@/components/MapaSeguimiento"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-[13px] text-ink-3">Cargando mapa…</div>
  ),
});

/**
 * Actividad, en su diseño nuevo.
 *
 * En la referencia conviven dos pantallas de actividad: la de siempre y esta,
 * que llaman «Nueva Actividad». Los datos son los mismos —las rutas del día
 * y lo que va pasando en ellas—; cambia la forma: indicadores en tarjetas con
 * su anillo, cada vehículo como una fila de ocho celdas con su barra y un
 * punto por parada, y al desplegar, la línea del día, la lista de paradas y
 * el mapa de la ruta.
 *
 * Las medidas están tomadas de allí: tarjetas de indicador de 105 px, campos
 * de 56 px, celdas de 64 px, barra de 10 px, botones de cabecera de 40 px.
 */
const C = {
  azul: "#4b82fa",
  azulTexto: "#1f60ed",
  verde: "#1ab394",
  naranja: "#f8ac59",
  rojo: "#ed5565",
  gris: "#c4c9cf",
  pista: "#d4d9dd",
  valor: "#67768d",
  rotulo: "#666666",
  borde: "#c5d2e7",
} as const;

type ClaveIndicador =
  | "en_ruta" | "cumplimiento" | "entregado" | "parcial" | "fallido" | "pendiente" | "sin_salir";

/** Cómo se rotula cada indicador. Los de resultado llevan etiqueta de color. */
const INDICADORES: Record<
  ClaveIndicador,
  { texto: string; color: string; etiqueta?: { fondo: string; tinta: string } }
> = {
  en_ruta: { texto: "Veh. en ruta", color: C.azul },
  cumplimiento: { texto: "Cumpl. total", color: C.azul },
  entregado: { texto: "Entregado", color: C.verde, etiqueta: { fondo: "#e3fcef", tinta: "#00875a" } },
  parcial: { texto: "Parcial", color: C.naranja, etiqueta: { fondo: "#fff4e0", tinta: "#d97706" } },
  fallido: { texto: "Fallido", color: C.rojo, etiqueta: { fondo: "#ffe9e6", tinta: "#de350b" } },
  pendiente: { texto: "Pendiente", color: C.gris },
  sin_salir: { texto: "Sin salir", color: C.gris },
};

const TODOS = Object.keys(INDICADORES) as ClaveIndicador[];
const POR_DEFECTO: ClaveIndicador[] = ["en_ruta", "cumplimiento", "entregado", "parcial", "fallido"];

type Orden = "" | "placa" | "avance" | "desvio" | "silencio";

const SILENCIO_MIN = 90;

function estadoDe(r: RutaEnCalle, ahora: number) {
  const cerrada = Boolean(r.fin_real) || (r.asignadas > 0 && r.gestionadas === r.asignadas);
  if (cerrada) return "Ruta finalizada";
  if (!r.salida_real) return "Ruta no iniciada";
  const desde = r.ultima_marca ?? r.salida_real;
  if ((ahora - new Date(desde).getTime()) / 60000 >= SILENCIO_MIN) return "Sin señal";
  return "En progreso";
}

export default function PanelActividadNueva({
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
  const [vehiculo, setVehiculo] = useState("");
  const [orden, setOrden] = useState<Orden>("");
  const [compacto, setCompacto] = useState(false);
  const [elegidos, setElegidos] = useState<ClaveIndicador[]>(POR_DEFECTO);
  const [menu, setMenu] = useState(false);
  const [cajon, setCajon] = useState(false);
  const [soloEstado, setSoloEstado] = useState("");
  const [cargando, setCargando] = useState(false);
  const [actualizado, setActualizado] = useState<number | null>(null);
  const [ahora, setAhora] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Las rutas fijadas con la chincheta: se quedan arriba, se ordene como se
  // ordene. Se guardan en el navegador: es una preferencia de quien mira.
  const [fijadas, setFijadas] = useState<string[]>([]);

  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem("actividad:fijadas") ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(g)) setFijadas(g.filter((x) => typeof x === "string"));
    } catch {
      /* almacenamiento bloqueado: vale solo para esta sesión */
    }
  }, []);

  function fijar(id: string) {
    setFijadas((prev) => {
      const nuevo = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        // Solo las últimas cincuenta: las rutas de hace un mes ya no vuelven.
        localStorage.setItem("actividad:fijadas", JSON.stringify(nuevo.slice(-50)));
      } catch {
        /* sin almacenamiento */
      }
      return nuevo;
    });
  }
  const montado = useRef(true);

  useEffect(() => () => { montado.current = false; }, []);

  useEffect(() => {
    setRutas(inicial);
    setEventos(eventosIniciales);
    setActualizado(Date.now());
    setAhora(Date.now());
  }, [inicial, eventosIniciales]);

  // Lo que cada uno elige ver es suyo, no del día: se recuerda por navegador.
  useEffect(() => {
    try {
      setCompacto(localStorage.getItem("actividad-nueva:compacto") === "1");
      const g = localStorage.getItem("indicadores:actividad-nueva");
      const l = g ? (JSON.parse(g) as ClaveIndicador[]) : null;
      if (Array.isArray(l) && l.length) setElegidos(l.filter((k) => TODOS.includes(k)));
    } catch {
      /* almacenamiento bloqueado: se usa lo de por defecto */
    }
  }, []);

  function recordar(clave: string, valor: string) {
    try { localStorage.setItem(clave, valor); } catch { /* vale solo para esta sesión */ }
  }

  function alternarIndicador(k: ClaveIndicador) {
    setElegidos((prev) => {
      const nuevo = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k];
      // Se guarda en el orden de declaración: así las tarjetas no bailan.
      const ordenado = TODOS.filter((x) => nuevo.includes(x));
      recordar("indicadores:actividad-nueva", JSON.stringify(ordenado));
      return ordenado;
    });
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
      setActualizado(Date.now());
      setAhora(Date.now());
      setError(null);
    } catch (err) {
      if (montado.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (montado.current) setCargando(false);
    }
  }, [dia]);

  // Un día pasado ya no cambia: el sondeo solo tiene sentido sobre hoy.
  useEffect(() => {
    if (dia) return;
    const t = setInterval(refrescar, 30000);
    return () => clearInterval(t);
  }, [dia, refrescar]);

  // El reloj de «hace un momento» avanza solo, sin volver a pedir datos.
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);

  const t0 = ahora ?? 0;

  const totales = useMemo(() => {
    const asignadas = rutas.reduce((a, r) => a + r.asignadas, 0);
    const gestionadas = rutas.reduce((a, r) => a + r.gestionadas, 0);
    const entregadas = rutas.reduce((a, r) => a + r.entregadas, 0);
    const fallidas = rutas.reduce((a, r) => a + r.fallidas, 0);
    const enRuta = rutas.filter(
      (r) => r.salida_real && !r.fin_real && r.gestionadas < r.asignadas,
    ).length;
    return {
      en_ruta: { n: enRuta, de: rutas.length },
      cumplimiento: { n: gestionadas, de: asignadas },
      entregado: { n: entregadas, de: asignadas },
      parcial: { n: Math.max(0, gestionadas - entregadas - fallidas), de: asignadas },
      fallido: { n: fallidas, de: asignadas },
      pendiente: { n: asignadas - gestionadas, de: asignadas },
      sin_salir: { n: rutas.filter((r) => !r.salida_real).length, de: rutas.length },
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

  const placas = useMemo(
    () => [...new Set(rutas.map((r) => r.placa).filter(Boolean) as string[])].sort(),
    [rutas],
  );

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = rutas.filter((r) => {
      if (vehiculo && r.placa !== vehiculo) return false;
      if (soloEstado && estadoDe(r, t0) !== soloEstado) return false;
      if (!q) return true;
      return `${r.conductor ?? ""} ${r.placa ?? ""} ${r.vehiculo ?? ""} ${r.despacho ?? ""}`
        .toLowerCase()
        .includes(q);
    });

    const silencio = (r: RutaEnCalle) =>
      r.ultima_marca ? t0 - new Date(r.ultima_marca).getTime() : -1;

    const ordenadas = !orden
      ? lista
      : [...lista].sort((a, b) => {
          if (orden === "placa") return (a.placa ?? a.conductor ?? "").localeCompare(b.placa ?? b.conductor ?? "");
          if (orden === "desvio") return (b.desvio_min ?? -9999) - (a.desvio_min ?? -9999);
          if (orden === "silencio") return silencio(b) - silencio(a);
          const pa = a.asignadas ? a.gestionadas / a.asignadas : 1;
          const pb = b.asignadas ? b.gestionadas / b.asignadas : 1;
          return pa - pb;
        });
    // Las fijadas, primero, sin alterar el orden dentro de cada grupo.
    if (!fijadas.length) return ordenadas;
    return [
      ...ordenadas.filter((r) => fijadas.includes(r.ruta_id)),
      ...ordenadas.filter((r) => !fijadas.includes(r.ruta_id)),
    ];
  }, [rutas, busca, vehiculo, soloEstado, orden, t0, fijadas]);

  function exportar() {
    descargar(
      `actividad-${dia ?? hoy()}.csv`,
      aCSV(
        ["Vehículo", "Conductor", "Estado de ruta", "Asignadas", "Gestionadas", "Exitoso", "Fallido", "Parcial", "Cumplimiento %"],
        visibles.map((r) => [
          r.placa ?? `R-${String(r.indice + 1).padStart(2, "0")}`,
          r.conductor,
          estadoDe(r, t0),
          r.asignadas,
          r.gestionadas,
          r.entregadas,
          r.fallidas,
          Math.max(0, r.gestionadas - r.entregadas - r.fallidas),
          r.asignadas ? Math.round((r.gestionadas / r.asignadas) * 1000) / 10 : 0,
        ]),
      ),
    );
  }

  const hace = (() => {
    if (!actualizado || !ahora) return "";
    const min = Math.floor((ahora - actualizado) / 60000);
    return min < 1 ? "hace unos segundos" : min === 1 ? "hace un minuto" : `hace ${min} minutos`;
  })();

  const filtrosActivos = Boolean(soloEstado) || Boolean(dia);

  return (
    <div className="sin-panel">
    <div className="px-5 pt-3">
      {/* Cabecera */}
      <div className="flex min-h-[56px] flex-wrap items-center gap-2 pb-2">
        <h1 className="text-[22px] font-bold leading-[28px] text-ink-2">Actividad</h1>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {hace && (
            <span className="flex items-center gap-1.5 text-[12px] text-[#8b8b8b]">
              Última actualización {hace}
              <button
                onClick={refrescar}
                disabled={cargando}
                title="Actualizar"
                aria-label="Actualizar"
                className={`text-[14px] text-ink-2 transition hover:text-amber disabled:opacity-50 ${
                  cargando ? "animate-spin" : ""
                }`}
              >
                ↻
              </button>
            </span>
          )}

          <div className="relative">
            <button
              onClick={() => setMenu((v) => !v)}
              aria-expanded={menu}
              className="flex h-10 items-center gap-2 rounded-full border bg-surface px-6 text-[16px] transition hover:bg-amber-050"
              style={{ borderColor: C.azulTexto, color: C.azul }}
            >
              Indicadores
              <span className="num rounded-full bg-amber px-1.5 text-[11px] font-bold leading-[17px] text-white">
                {elegidos.length}/{TODOS.length}
              </span>
              <span className="text-[10px]">▾</span>
            </button>

            {menu && (
              <>
                <button
                  aria-label="Cerrar"
                  onClick={() => setMenu(false)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div className="absolute right-0 top-full z-20 mt-1 w-[230px] overflow-hidden rounded-[8px] border border-line bg-surface py-1 shadow-lg">
                  {TODOS.map((k) => (
                    <label
                      key={k}
                      className="flex cursor-pointer items-center gap-2.5 px-3.5 py-2 text-[14px] text-ink transition hover:bg-surface-2"
                    >
                      <input
                        type="checkbox"
                        checked={elegidos.includes(k)}
                        onChange={() => alternarIndicador(k)}
                        className="accent-amber"
                      />
                      {INDICADORES[k].texto}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            onClick={exportar}
            disabled={!visibles.length}
            className="flex h-10 items-center gap-2 rounded-full bg-amber pl-4 pr-6 text-[16px] text-white transition hover:bg-amber-600 disabled:opacity-50"
          >
            ⤓ Exportar a Excel
          </button>
        </div>
      </div>

      {/* Indicadores */}
      {elegidos.length > 0 && (
        <div className="grid grid-cols-1 gap-2 pb-2 @md:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-5">
          {elegidos.map((k) => (
            <TarjetaIndicador
              key={k}
              clave={k}
              n={totales[k].n}
              de={totales[k].de}
              onQuitar={() => alternarIndicador(k)}
            />
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <Campo rotulo="Buscar" className="min-w-[220px] flex-[1.2]">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-full w-full bg-transparent pb-[8px] pl-[14px] pr-[40px] pt-[24px] text-[16px] text-ink outline-none"
          />
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[15px] text-ink-3">
            ⌕
          </span>
        </Campo>

        <Campo rotulo="Vehículos" className="min-w-[180px] flex-1">
          <select
            value={vehiculo}
            onChange={(e) => setVehiculo(e.target.value)}
            className="h-full w-full cursor-pointer appearance-none bg-transparent pb-[8px] pl-[14px] pr-[36px] pt-[24px] text-[16px] text-ink outline-none"
          >
            <option value=""></option>
            {placas.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <Flecha />
        </Campo>

        <Campo rotulo="Ordenar por" className="min-w-[180px] flex-1">
          <select
            value={orden}
            onChange={(e) => setOrden(e.target.value as Orden)}
            className="h-full w-full cursor-pointer appearance-none bg-transparent pb-[8px] pl-[14px] pr-[36px] pt-[24px] text-[16px] text-ink outline-none"
          >
            <option value=""></option>
            <option value="avance">Avance</option>
            <option value="desvio">Retraso</option>
            <option value="silencio">Tiempo sin señal</option>
            <option value="placa">Vehículo</option>
          </select>
          <Flecha />
        </Campo>

        <label className="flex h-[56px] cursor-pointer items-center gap-2 px-3 text-[16px] text-ink">
          <Interruptor
            activo={compacto}
            onCambio={(v) => {
              setCompacto(v);
              recordar("actividad-nueva:compacto", v ? "1" : "0");
            }}
          />
          Modo comprimido
        </label>

        <button
          onClick={() => setCajon(true)}
          className="flex h-10 items-center gap-2 rounded-[4px] border bg-surface px-4 text-[16px] text-ink transition hover:bg-surface-2"
          style={{ borderColor: C.borde }}
        >
          <span className="text-[12px]">▼</span> Filtros
          {filtrosActivos && <span className="h-2 w-2 rounded-full bg-amber" />}
        </button>
      </div>

      {error && (
        <p className="mb-2 rounded-[8px] border border-bad/30 bg-bad-bg px-3 py-2 text-[13px] text-bad">
          {error}
        </p>
      )}

      {visibles.length === 0 ? (
        <div className="rounded-[8px] bg-surface p-6 text-[14px] text-ink-2">
          {rutas.length === 0
            ? dia
              ? "Ese día no tuvo ninguna ruta asignada."
              : "Hoy todavía no hay rutas. Carga un archivo en el planificador y asígnale conductor."
            : "Ningún vehículo coincide con los filtros."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visibles.map((r) => (
            <TarjetaVehiculo
              key={r.ruta_id}
              ruta={r}
              eventos={porRuta.get(r.ruta_id) ?? []}
              escala={escala}
              compacto={compacto}
              ahora={t0}
              esHoy={!dia}
              fijada={fijadas.includes(r.ruta_id)}
              onFijar={() => fijar(r.ruta_id)}
            />
          ))}
        </div>
      )}

      {/* Cajón de filtros, a la derecha */}
      {cajon && (
        <>
          <button
            aria-label="Cerrar filtros"
            onClick={() => setCajon(false)}
            className="fixed inset-0 z-40 cursor-default bg-navy-900/30"
          />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-[440px] max-w-full flex-col bg-canvas px-6 py-4 shadow-2xl">
            <div className="flex items-center border-b border-line-strong pb-3">
              <b className="text-[16px] text-ink">Filtros</b>
              <button
                onClick={() => setCajon(false)}
                aria-label="Cerrar"
                className="ml-auto text-[18px] text-ink-2 transition hover:text-ink"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto py-4">
              <div>
                <div className="pb-1 text-[12px] text-ink-2">Rango de fechas</div>
                <Campo rotulo="Día" className="w-full">
                  <input
                    type="date"
                    value={dia ?? hoy()}
                    onChange={(e) =>
                      router.push(
                        e.target.value ? `/actividad-nueva?fecha=${e.target.value}` : "/actividad-nueva",
                      )
                    }
                    className="num h-full w-full bg-transparent pb-[8px] pl-[14px] pr-[14px] pt-[24px] text-[16px] text-ink outline-none"
                  />
                </Campo>
              </div>

              <div>
                <div className="pb-1 text-[12px] text-ink-2">Filtro de ruta</div>
                <Campo rotulo="Estado de ruta" className="w-full">
                  <select
                    value={soloEstado}
                    onChange={(e) => setSoloEstado(e.target.value)}
                    className="h-full w-full cursor-pointer appearance-none bg-transparent pb-[8px] pl-[14px] pr-[36px] pt-[24px] text-[16px] text-ink outline-none"
                  >
                    <option value=""></option>
                    <option>En progreso</option>
                    <option>Ruta no iniciada</option>
                    <option>Ruta finalizada</option>
                    <option>Sin señal</option>
                  </select>
                  <Flecha />
                </Campo>
              </div>
            </div>

            <div className="flex justify-center gap-2 border-t border-line-strong pt-4">
              <button
                onClick={() => {
                  setSoloEstado("");
                  if (dia) router.push("/actividad-nueva");
                }}
                className="h-10 rounded-full border border-line-strong bg-surface px-6 text-[16px] text-ink transition hover:bg-surface-2"
              >
                Limpiar
              </button>
              <button
                onClick={() => setCajon(false)}
                className="h-10 rounded-full bg-amber px-6 text-[16px] text-white transition hover:bg-amber-600"
              >
                Aplicar filtros
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
    </div>
  );
}

/** Campo de 56 px con el rótulo dentro, arriba, como en la referencia. */
function Campo({
  rotulo,
  className = "",
  children,
}: {
  rotulo: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`relative h-[56px] rounded-[4px] border border-line bg-surface transition focus-within:border-amber ${className}`}
    >
      <span className="pointer-events-none absolute left-[14px] top-[7px] text-[12px] text-ink-3">
        {rotulo}
      </span>
      {children}
    </div>
  );
}

function Flecha() {
  return (
    <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-3">
      ▼
    </span>
  );
}

function Interruptor({ activo, onCambio }: { activo: boolean; onCambio: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={() => onCambio(!activo)}
      className="relative h-5 w-9 rounded-full transition"
      style={{ background: activo ? C.azul : "#aab4c3" }}
    >
      <span
        className="absolute top-[2px] h-4 w-4 rounded-full bg-white shadow transition-all"
        style={{ left: activo ? 18 : 2 }}
      />
    </button>
  );
}

/** Anillo de avance: la parte hecha en color, el resto en gris. */
function Anillo({ pct, color, lado = 44 }: { pct: number; color: string; lado?: number }) {
  const r = 15;
  const largo = 2 * Math.PI * r;
  const hecho = Math.max(0, Math.min(100, pct)) / 100;
  return (
    <svg viewBox="0 0 40 40" width={lado} height={lado} aria-hidden="true">
      <circle cx="20" cy="20" r={r} fill="none" stroke="#dfe3e8" strokeWidth="7" />
      {hecho > 0 && (
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeDasharray={`${hecho * largo} ${largo}`}
          transform="rotate(-90 20 20)"
        />
      )}
    </svg>
  );
}

function TarjetaIndicador({
  clave,
  n,
  de,
  onQuitar,
}: {
  clave: ClaveIndicador;
  n: number;
  de: number;
  onQuitar: () => void;
}) {
  const info = INDICADORES[clave];
  const pct = de ? (n / de) * 100 : 0;

  return (
    <div
      className="relative flex h-[105px] items-center gap-3 rounded-[8px] border bg-surface px-4 py-3"
      style={{ borderColor: C.borde }}
    >
      <button
        onClick={onQuitar}
        title="Quitar este indicador"
        aria-label={`Quitar ${info.texto}`}
        className="absolute right-2 top-1 text-[11px] text-ink-3 transition hover:text-ink"
      >
        ×
      </button>

      <div className="min-w-0 flex-1">
        {info.etiqueta ? (
          <span
            className="inline-block rounded-[4px] px-1.5 py-[2px] text-[14px] font-medium leading-[16px]"
            style={{ background: info.etiqueta.fondo, color: info.etiqueta.tinta }}
          >
            {info.texto}
          </span>
        ) : (
          <span className="block truncate text-[14px] font-medium leading-[16px]" style={{ color: C.rotulo }}>
            {info.texto}
          </span>
        )}
        <div className="num mt-2 text-[12px] font-black leading-[16px] text-[#676a6c]">
          {n}/{de}
        </div>
        <div className="num text-[24px] font-bold leading-[31px]" style={{ color: C.valor }}>
          {pct.toFixed(1)}%
        </div>
      </div>

      <Anillo pct={pct} color={info.color} lado={56} />
    </div>
  );
}

/**
 * Un vehículo: una fila de ocho celdas, debajo su barra y un punto por
 * parada, y al desplegar, el día, las paradas y el mapa.
 */
function TarjetaVehiculo({
  ruta: r,
  eventos,
  escala,
  compacto,
  ahora,
  esHoy,
  fijada,
  onFijar,
}: {
  ruta: RutaEnCalle;
  eventos: Evento[];
  escala: Escala | null;
  compacto: boolean;
  ahora: number;
  esHoy: boolean;
  /** Fijada arriba con la chincheta. */
  fijada: boolean;
  onFijar: () => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const [paradas, setParadas] = useState<ParadaConDesvio[] | null>(null);

  // Las paradas se piden al desplegar, no antes: traer las de todas las
  // rutas sería mover cientos de filas que nadie está mirando.
  useEffect(() => {
    if (!abierta) return;
    let vigente = true;
    paradasDeRuta(r.ruta_id)
      .then((d) => { if (vigente) setParadas(d); })
      .catch(() => { if (vigente) setParadas([]); });
    return () => { vigente = false; };
  }, [abierta, r.ruta_id, r.gestionadas]);

  const pct = r.asignadas ? (r.gestionadas / r.asignadas) * 100 : 0;
  const parciales = Math.max(0, r.gestionadas - r.entregadas - r.fallidas);
  const pendientes = Math.max(0, r.asignadas - r.gestionadas);
  const estado = estadoDe(r, ahora);

  // Un punto por parada. Con la tarjeta plegada solo se saben los recuentos,
  // así que van agrupados por resultado; al desplegar, en el orden de la ruta.
  const puntos: string[] = paradas
    ? paradas.map((p) => p.estado_entrega)
    : [
        ...Array(r.entregadas).fill("entregado"),
        ...Array(parciales).fill("parcial"),
        ...Array(r.fallidas).fill("fallido"),
        ...Array(pendientes).fill("pendiente"),
      ];

  return (
    <div className="overflow-hidden rounded-[8px] bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <div className="grid grid-cols-2 divide-x divide-line @2xl:grid-cols-4 @5xl:grid-cols-8">
        <Celda
          rotulo={
            <span className="flex items-center gap-1">
              <button
                onClick={onFijar}
                aria-pressed={fijada}
                aria-label={fijada ? "Dejar de fijar esta ruta arriba" : "Fijar esta ruta arriba"}
                title={fijada ? "Fijada arriba · toca para soltarla" : "Fijar arriba"}
                className="grid h-[21px] w-[21px] place-items-center rounded-full transition hover:bg-black/5"
                style={{ color: fijada ? C.azul : C.rotulo, opacity: fijada ? 1 : 0.6 }}
              >
                <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
                  <path d="M10.2 1.2 14.8 5.8l-1.1 1.1-.9-.2-2.6 2.6.3 2.7-1.2 1.2-2.9-2.9-3.9 3.9-.9-.9 3.9-3.9-2.9-2.9L3.8 5.3l2.7.3 2.6-2.6-.2-.9z" />
                </svg>
              </button>
              Vehículo
            </span>
          }
        >
          <Link
            href={`/torre?despacho=${r.despacho_id}`}
            className="num block truncate pl-[25px] text-[16px] font-bold"
            style={{ color: C.azul }}
          >
            {r.placa ?? `R-${String(r.indice + 1).padStart(2, "0")}`}
          </Link>
        </Celda>
        <Celda rotulo="Conductor">
          <span className="block truncate">{r.conductor ?? ""}</span>
        </Celda>
        <Celda rotulo="Estado de ruta">
          <span
            className="inline-block rounded-[29px] px-3 py-1 text-[12px] font-normal leading-[16px]"
            style={
              estado === "Sin señal"
                ? { background: "#ffe9e6", color: "#de350b" }
                : { background: "#edf5ff", color: C.azulTexto }
            }
          >
            {estado}
          </span>
        </Celda>
        <Celda rotulo="Asignadas">{r.asignadas}</Celda>
        <Celda rotulo="Gestionadas">
          {r.gestionadas}/{r.asignadas}
        </Celda>
        <Celda rotulo="Exitoso">{r.entregadas}</Celda>
        <Celda rotulo="Fallido">{r.fallidas}</Celda>
        <Celda rotulo="Parcial">{parciales}</Celda>
      </div>

      {(!compacto || abierta) && (
        <div className="flex items-center gap-3 border-t border-line px-[9px] py-[10px]">
          <div className="flex w-[150px] shrink-0 items-center gap-2.5">
            <div className="h-[10px] flex-1 overflow-hidden rounded-full" style={{ background: C.pista }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: C.azul }} />
            </div>
            <span className="num w-[46px] text-right text-[14px] text-[#2f3030]">
              {pct.toFixed(1)}%
            </span>
          </div>

          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-[2px]">
            {puntos.map((e, i) => (
              <span
                key={i}
                title={ROTULO[e] ?? e}
                className="h-[15px] w-[15px] rounded-full"
                style={{ background: TONO[e] ?? C.gris }}
              />
            ))}
          </div>

          <button
            onClick={() => setAbierta((v) => !v)}
            aria-expanded={abierta}
            title={abierta ? "Plegar" : "Desplegar"}
            className="grid h-6 w-8 shrink-0 place-items-center text-[13px] transition hover:bg-surface-2"
            style={{ color: C.azul }}
          >
            <svg
              viewBox="0 0 16 16"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={`transition-transform ${abierta ? "rotate-180" : ""}`}
            >
              <path d="M3.5 6l4.5 4.5L12.5 6" />
            </svg>
          </button>
        </div>
      )}

      {compacto && !abierta && (
        <button
          onClick={() => setAbierta(true)}
          className="block w-full border-t border-line py-0.5 text-center text-[11px] transition hover:bg-surface-2"
          style={{ color: C.azul }}
        >
          ⌄
        </button>
      )}

      {abierta && (
        <div className="border-t border-line">
          <div className="flex h-[36px] items-center justify-end gap-1 px-3 text-[12px] text-ink">
            <Senal texto="Señal" valor={r.red ? r.red.toUpperCase() : null} alerta={estado === "Sin señal"} />
            <Senal texto="Batería" valor={r.bateria != null ? `${r.bateria}%` : null} alerta={r.bateria != null && r.bateria <= 20} />
            <Senal
              texto="Desvío"
              valor={r.desvio_min != null ? `${r.desvio_min > 0 ? "+" : ""}${r.desvio_min} min` : null}
              alerta={r.desvio_min != null && r.desvio_min > 15}
            />
            <Senal texto="Última marca" valor={r.ultima_marca ? hora(r.ultima_marca) : null} />
          </div>

          {escala ? (
            <LineaDia eventos={eventos} escala={escala} ahora={esHoy ? ahora : null} />
          ) : (
            <p className="px-4 pb-3 text-[13px] text-ink-3">Sin actividad todavía.</p>
          )}

          <div className="grid grid-cols-1 gap-3 border-t border-line p-3 @3xl:grid-cols-[360px_1fr]">
            <div className="max-h-[320px] overflow-y-auto pr-1">
              {paradas === null ? (
                <p className="p-3 text-[13px] text-ink-3">Cargando paradas…</p>
              ) : paradas.length === 0 ? (
                <p className="p-3 text-[13px] text-ink-3">Esta ruta no tiene paradas.</p>
              ) : (
                paradas.map((p) => <FilaParada key={p.id} parada={p} total={paradas.length} />)
              )}
            </div>

            <div className="h-[320px] overflow-hidden rounded-[6px] border border-line">
              {paradas && paradas.length > 0 ? (
                <MapaSeguimiento
                  key={r.ruta_id}
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
                  colorRuta={C.azul}
                  cd={r.cd_lat != null && r.cd_lon != null ? { lat: r.cd_lat, lon: r.cd_lon } : null}
                  siguienteId={paradas.find((p) => p.estado_entrega === "pendiente")?.id ?? null}
                />
              ) : (
                <div className="grid h-full place-items-center text-[13px] text-ink-3">
                  {paradas === null ? "Cargando mapa…" : "Sin puntos que mostrar"}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const TONO: Record<string, string> = {
  entregado: C.verde,
  parcial: C.naranja,
  reprogramado: C.naranja,
  fallido: C.rojo,
  pendiente: C.gris,
};

const ROTULO: Record<string, string> = {
  entregado: "Entregado",
  parcial: "Entrega parcial",
  reprogramado: "Reprogramado",
  fallido: "No entregado",
  pendiente: "Pendiente",
};

function Celda({ rotulo, children }: { rotulo: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="h-[64px] min-w-0 p-2">
      <div className="truncate text-[14px] font-medium leading-[21px]" style={{ color: C.rotulo }}>
        {rotulo}
      </div>
      <div className="num truncate text-[16px] font-bold leading-[24px]" style={{ color: C.valor }}>
        {children}
      </div>
    </div>
  );
}

function Senal({ texto, valor, alerta = false }: { texto: string; valor: string | null; alerta?: boolean }) {
  return (
    <span className="flex items-center gap-1 rounded-full px-3 py-1" title={valor ?? "Sin dato"}>
      {texto}
      {alerta && <span className="h-1.5 w-1.5 rounded-full" style={{ background: C.rojo }} />}
      {valor && (
        <b className="num font-semibold" style={{ color: alerta ? C.rojo : C.valor }}>
          {valor}
        </b>
      )}
    </span>
  );
}

/** Una parada en la lista de la tarjeta desplegada. */
function FilaParada({ parada: p, total }: { parada: ParadaConDesvio; total: number }) {
  const tinta =
    p.estado_entrega === "entregado" ? "#00875a"
    : p.estado_entrega === "fallido" ? "#de350b"
    : p.estado_entrega === "pendiente" ? "#5f6b7c"
    : "#d97706";
  const fondo =
    p.estado_entrega === "entregado" ? "#e3fcef"
    : p.estado_entrega === "fallido" ? "#ffe9e6"
    : p.estado_entrega === "pendiente" ? "#eef1f5"
    : "#fff4e0";

  return (
    <div className="relative border-l-2 pb-3 pl-5" style={{ borderColor: C.azul }}>
      <span
        className="absolute -left-[8px] top-[26px] h-[14px] w-[14px] rounded-full border-2 bg-surface"
        style={{ borderColor: p.estado_entrega === "pendiente" ? C.gris : C.azul }}
      />
      <div className="flex items-center justify-between pb-1 text-[11px] text-ink-2">
        <span>
          Hora de llegada: <b className="num">{p.hora_entrega ? hora(p.hora_entrega) : "—"}</b>
        </span>
        <span>
          Hora estimada: <b className="num">{p.eta ? p.eta.slice(0, 5) : "—"}</b>
        </span>
      </div>
      <div className="flex items-start gap-2 rounded-[6px] border border-line px-2.5 py-2">
        <div className="min-w-0 flex-1">
          <span className="num rounded-[4px] bg-amber-050 px-1.5 py-px text-[11px] font-medium" style={{ color: C.azulTexto }}>
            Entrega {p.orden}/{total}
          </span>
          <Link href={`/paradas/${p.id}`} className="mt-1 block truncate text-[13px]" style={{ color: C.azul }}>
            {p.nombre ?? "Parada"}
          </Link>
          <div className="truncate text-[11px] text-ink-3">
            {p.distrito ?? ""}
            {p.motivo ? ` · ${p.motivo}` : ""}
          </div>
          <Link href={`/paradas/${p.id}`} className="text-[11px]" style={{ color: C.azul }}>
            Ver detalle ⌄
          </Link>
        </div>
        <span
          className="shrink-0 rounded-[4px] px-1.5 py-[2px] text-[11px] font-medium"
          style={{ background: fondo, color: tinta }}
        >
          {ROTULO[p.estado_entrega] ?? p.estado_entrega}
        </span>
      </div>
    </div>
  );
}

/** El día de la ruta: un punto por marca sobre un eje de horas compartido. */
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

  const horaMs = 60 * 60 * 1000;
  const horas = Math.max(1, Math.round(ancho / horaMs));
  const paso = [1, 2, 3, 4, 6, 12, 24].find((p) => horas / p <= 8) ?? 24;
  const marcas: number[] = [];
  for (let t = escala.desde; t <= escala.hasta; t += horaMs * paso) marcas.push(t);

  const salida = eventos.find((e) => e.tipo === "ruta_iniciada");
  const puntos = eventos.filter(
    (e) => e.tipo !== "ruta_iniciada" && e.tipo !== "ruta_terminada",
  );

  return (
    <div className="mx-3 mb-2 bg-surface-2 px-6 pb-1 pt-3">
      <div className="relative h-[74px]">
        <div className="absolute inset-x-0 top-[50px] border-t" style={{ borderColor: "#cfd6df" }} />

        {marcas.map((t) => (
          <span
            key={t}
            className="num absolute top-[55px] -translate-x-1/2 text-[10px] text-ink-3"
            style={{ left: `${pos(t)}%` }}
          >
            {hora(new Date(t))}
          </span>
        ))}

        {ahora !== null && ahora >= escala.desde && ahora <= escala.hasta && (
          <span
            className="absolute top-0 h-[50px] w-[2px]"
            style={{ left: `${pos(ahora)}%`, background: C.naranja }}
            title="Ahora"
          />
        )}

        {salida && (
          <span
            title={`Salió del centro a las ${hora(salida.ocurrido_en)}`}
            className="absolute top-[12px] h-[20px] w-[3px] -translate-x-1/2 rounded-sm"
            style={{ left: `${pos(new Date(salida.ocurrido_en).getTime())}%`, background: C.azul }}
          />
        )}

        {puntos.map((e) => (
          <span
            key={e.id}
            title={`${hora(e.ocurrido_en)} · ${e.parada ?? "Parada"}`}
            className="absolute top-[14px] h-[16px] w-[16px] -translate-x-1/2 rounded-full border-2 border-white"
            style={{
              left: `${pos(new Date(e.ocurrido_en).getTime())}%`,
              background: TONO[e.tipo] ?? C.gris,
            }}
          />
        ))}
      </div>
    </div>
  );
}
