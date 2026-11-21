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
import FranjaHoraria, { escalaDe, ReglaHoraria } from "@/components/FranjaHoraria";
import { hora, hoy } from "@/lib/horas";
import TiraIndicadores from "@/components/TiraIndicadores";
import { Pastilla, Tarjeta } from "@/components/ui";

const COLORES = [
  "#E8833A", "#2E7DD1", "#0E8F9E", "#7A5AF8", "#C2439B", "#7C9A1F",
  "#D9534F", "#2F855A", "#B7791F", "#5A67D8", "#D53F8C", "#319795",
];
const color = (i: number) => COLORES[i % COLORES.length];

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

  return (
    <>
      <div className="sticky top-0 z-20 bg-surface">
        <TiraIndicadores
          items={(Object.keys(INDICADORES) as ClaveIndicador[]).map((k) => ({
            clave: k,
            texto: INDICADORES[k].texto,
            ayuda: INDICADORES[k].ayuda,
            n: totales[k].n,
            de: totales[k].de,
            tono: k === "fallido" && totales[k].n > 0 ? "bad" : undefined,
          }))}
          clave="actividad"
          porDefecto={POR_DEFECTO}
        />

        {/* Barra de herramientas */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2 text-[11.5px] text-ink-3">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar placa, conductor o despacho"
            className="w-[220px] rounded-[8px] border border-line-strong bg-surface px-2.5 py-1 text-[12px]"
          />
          <select
            value={orden}
            onChange={(e) => setOrden(e.target.value as Orden)}
            className="rounded-[8px] border border-line-strong bg-surface px-2 py-1 text-[11.5px]"
          >
            <option value="avance">Ordenar por avance</option>
            <option value="desvio">Ordenar por retraso</option>
            <option value="silencio">Ordenar por silencio</option>
            <option value="placa">Ordenar por placa</option>
          </select>
          <input
            type="date"
            value={dia ?? hoy()}
            onChange={(e) =>
              router.push(e.target.value ? `/actividad?fecha=${e.target.value}` : "/actividad")
            }
            className="num rounded-[8px] border border-line-strong bg-surface px-2 py-1 text-[11.5px]"
          />
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={compacto}
              onChange={(e) => {
                setCompacto(e.target.checked);
                guardar("actividad:compacto", e.target.checked ? "1" : "0");
              }}
            />
            Modo comprimido
          </label>
          {!dia && (
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              cada 30 s
            </label>
          )}
          <span className="ml-auto flex items-center gap-2">
            {actualizado && <span className="num">Actualizado {hora(actualizado)}</span>}
            <button
              onClick={refrescar}
              disabled={cargando}
              className="rounded-[8px] border border-line-strong px-2 py-1 font-semibold text-ink-2 transition hover:bg-canvas disabled:opacity-50"
            >
              {cargando ? "…" : "↻ Actualizar"}
            </button>
          </span>
        </div>
      </div>

      <div className="p-3">
        {error && (
          <p className="mb-3 rounded-[10px] border border-bad/30 bg-bad-bg px-3 py-2 text-[12.5px] text-bad">
            {error}
          </p>
        )}

        {visibles.length === 0 ? (
          <Tarjeta className="p-6 text-[13.5px] text-ink-2">
            {rutas.length === 0
              ? dia
                ? "Ese día no tuvo ninguna ruta asignada."
                : "Hoy todavía no hay rutas. Guarda un despacho en el planificador y asígnale conductor."
              : "Ningún vehículo coincide con la búsqueda."}
          </Tarjeta>
        ) : (
          <div className="flex flex-col gap-2">
            {visibles.map((r) => (
              <TarjetaVehiculo
                key={r.ruta_id}
                ruta={r}
                eventos={porRuta.get(r.ruta_id) ?? []}
                escala={escala}
                compacto={compacto}
                ahora={ahora}
              />
            ))}
            {escala && (
              <div className="px-1 pt-1">
                <ReglaHoraria escala={escala} />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

const SILENCIO_MIN = 90;

function TarjetaVehiculo({
  ruta: r,
  eventos,
  escala,
  compacto,
  ahora,
}: {
  ruta: RutaEnCalle;
  eventos: Evento[];
  escala: ReturnType<typeof escalaDe>;
  compacto: boolean;
  ahora: number;
}) {
  const pct = r.asignadas ? Math.round((r.gestionadas / r.asignadas) * 100) : 0;
  const cerrada = Boolean(r.fin_real) || (r.asignadas > 0 && r.gestionadas === r.asignadas);
  const callado = r.ultima_marca ? (ahora - new Date(r.ultima_marca).getTime()) / 60000 : null;

  const estado = cerrada
    ? { texto: "Ruta finalizada", tono: "ok" as const }
    : !r.salida_real
      ? { texto: "Ruta no iniciada", tono: "plan" as const }
      : callado != null && callado >= SILENCIO_MIN
        ? { texto: "Sin dar señales", tono: "bad" as const }
        : { texto: "En progreso", tono: "live" as const };

  return (
    <Tarjeta className={compacto ? "px-3 py-2" : "p-3"}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Identidad */}
        <div className="min-w-[180px]">
          <div className="flex items-center gap-2">
            <span
              className="num rounded px-1.5 py-0.5 text-[10.5px] font-bold text-white"
              style={{ background: color(r.indice) }}
            >
              {r.placa ?? `R-${String(r.indice + 1).padStart(2, "0")}`}
            </span>
            <Pastilla tono={estado.tono}>{estado.texto}</Pastilla>
          </div>
          <div className="mt-0.5 truncate text-[12.5px] font-semibold">
            {r.conductor ?? "Sin conductor"}
          </div>
          {!compacto && (
            <div className="truncate text-[11px] text-ink-3">
              {r.despacho ?? "Despacho"}
            </div>
          )}
        </div>

        {/* Números */}
        <div className="flex shrink-0 gap-4 text-[10px] uppercase tracking-wide text-ink-3">
          <Cifra n={r.asignadas} texto="asignadas" />
          <Cifra n={r.gestionadas} texto="gestionadas" />
          <Cifra n={r.entregadas} texto="exitosas" tono={r.entregadas > 0 ? "ok" : undefined} />
          <Cifra n={r.fallidas} texto="fallidas" tono={r.fallidas > 0 ? "bad" : undefined} />
        </div>

        {/* Cumplimiento */}
        <div className="w-[110px] shrink-0">
          <div className="flex items-baseline justify-between text-[11px] text-ink-3">
            <span>Cumplimiento</span>
            <b className="num text-[13px] text-ink">{pct}%</b>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas">
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, background: pct === 100 ? "var(--color-ok)" : color(r.indice) }}
            />
          </div>
        </div>

        {/* El día de esta ruta */}
        <div className="min-w-[200px] flex-1">
          {escala ? (
            <FranjaHoraria
              eventos={eventos}
              escala={escala}
              color={color(r.indice)}
              compacta={compacto}
            />
          ) : (
            <span className="text-[11.5px] text-ink-3">Sin actividad todavía</span>
          )}
        </div>

        {/* Señales del móvil y acceso */}
        <div className="flex shrink-0 items-center gap-2 text-[11px] text-ink-3">
          {r.bateria != null && (
            <span
              className={`num ${r.bateria <= 20 ? "font-bold text-bad" : ""}`}
              title="Batería del móvil en su última marca"
            >
              🔋{r.bateria}%
            </span>
          )}
          {r.red && <span className="num uppercase" title="Tipo de red">{r.red}</span>}
          {r.ultima_marca && <span className="num">{hora(r.ultima_marca)}</span>}
          <Link
            href={`/torre?despacho=${r.despacho_id}`}
            title="Seguir este despacho en la torre"
            className="rounded-[8px] border border-line-strong px-2 py-1 text-[11.5px] font-semibold text-ink-2 transition hover:bg-canvas"
          >
            ◉
          </Link>
        </div>
      </div>
    </Tarjeta>
  );
}

function Cifra({ n, texto, tono }: { n: number; texto: string; tono?: "ok" | "bad" }) {
  return (
    <div>
      <div
        className={`num text-[15px] font-bold normal-case leading-none tracking-tight ${
          tono === "ok" ? "text-ok" : tono === "bad" ? "text-bad" : "text-ink"
        }`}
      >
        {n}
      </div>
      {texto}
    </div>
  );
}
