"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { alertas as traerAlertas, atenderAlerta, type Alerta } from "@/app/acciones/datos";
import { hora, hoy } from "@/lib/horas";
import { Pastilla, Tarjeta } from "@/components/ui";

/**
 * Qué es cada aviso y por qué merece interrumpir a alguien.
 *
 * El texto corto va en la pastilla; el largo explica qué hacer, que es lo
 * que de verdad falta cuando una pantalla se llena de avisos rojos.
 */
const TIPOS: Record<
  Alerta["tipo"],
  { corto: string; icono: string; ayuda: string }
> = {
  retraso: {
    corto: "Retraso",
    icono: "⏱",
    ayuda: "La hora estimada ya pasó y la parada sigue pendiente.",
  },
  silencio: {
    corto: "Sin marcar",
    icono: "📵",
    ayuda: "La ruta salió pero lleva rato sin registrar ninguna entrega.",
  },
  sin_salir: {
    corto: "Sin salir",
    icono: "🅿",
    ayuda: "Pasó la hora de salida prevista y el vehículo no ha arrancado la ruta.",
  },
  jornada: {
    corto: "Jornada",
    icono: "🌙",
    ayuda: "Lleva más horas en calle que las planificadas para la jornada.",
  },
  bateria: {
    corto: "Batería",
    icono: "🔋",
    ayuda: "El móvil puede apagarse y dejar de registrar entregas.",
  },
  fallida: {
    corto: "No entregada",
    icono: "✕",
    ayuda: "Alguien tiene que decidir si se reprograma o se devuelve.",
  },
};

const hhmm = hora;

function duracion(min: number) {
  const h = Math.floor(min / 60);
  return h > 0 ? `${h} h ${min % 60} min` : `${min} min`;
}

export default function PanelAlertas({
  inicial,
  dia = null,
}: {
  inicial: Alerta[];
  dia?: string | null;
}) {
  const router = useRouter();
  const [lista, setLista] = useState(inicial);
  const [filtro, setFiltro] = useState<Alerta["tipo"] | "todas">("todas");
  const [verAtendidas, setVerAtendidas] = useState(false);
  const [auto, setAuto] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const montado = useRef(true);

  useEffect(() => () => { montado.current = false; }, []);
  useEffect(() => setLista(inicial), [inicial]);

  const refrescar = useCallback(async () => {
    setCargando(true);
    try {
      const d = await traerAlertas(dia ?? undefined);
      if (montado.current) { setLista(d); setError(null); }
    } catch (e) {
      if (montado.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (montado.current) setCargando(false);
    }
  }, [dia]);

  // Un día pasado ya no cambia: el sondeo solo tiene sentido sobre hoy.
  useEffect(() => {
    if (!auto || dia) return;
    const t = setInterval(refrescar, 45000);
    return () => clearInterval(t);
  }, [auto, dia, refrescar]);

  async function alternar(a: Alerta) {
    setOcupada(a.clave);
    setError(null);
    try {
      await atenderAlerta(a.clave, a.ruta_id, !a.atendida);
      await refrescar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (montado.current) setOcupada(null);
    }
  }

  const pendientes = useMemo(() => lista.filter((a) => !a.atendida), [lista]);

  const porTipo = useMemo(() => {
    const m = new Map<Alerta["tipo"], number>();
    pendientes.forEach((a) => m.set(a.tipo, (m.get(a.tipo) ?? 0) + 1));
    return m;
  }, [pendientes]);

  const visibles = useMemo(
    () =>
      lista.filter(
        (a) =>
          (verAtendidas || !a.atendida) && (filtro === "todas" || a.tipo === filtro),
      ),
    [lista, filtro, verAtendidas],
  );

  const altas = pendientes.filter((a) => a.severidad === "alta").length;

  return (
    <div className="space-y-3.5 p-4">
      <Tarjeta className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="num text-[40px] font-extrabold leading-none tracking-tight">
            {pendientes.length}
          </div>
          <div className="pb-1 text-[12.5px] text-ink-2">
            avisos sin atender
            {altas > 0 && (
              <>
                <br />
                <b className="text-bad">{altas}</b> de prioridad alta
              </>
            )}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2 pb-1 text-[11.5px] text-ink-3">
            <input
              type="date"
              value={dia ?? hoy()}
              onChange={(e) =>
                router.push(e.target.value ? `/alertas?fecha=${e.target.value}` : "/alertas")
              }
              className="num rounded-[8px] border border-line-strong bg-surface px-2 py-1 text-[11.5px]"
            />
            {!dia && (
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                cada 45 s
              </label>
            )}
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={verAtendidas}
                onChange={(e) => setVerAtendidas(e.target.checked)}
              />
              ver atendidos
            </label>
            <button
              onClick={refrescar}
              disabled={cargando}
              className="rounded-[8px] border border-line-strong px-2 py-1 font-semibold text-ink-2 transition hover:bg-canvas disabled:opacity-50"
            >
              {cargando ? "…" : "↻ Actualizar"}
            </button>
          </div>
        </div>

        {/* Los contadores por tipo hacen de filtro: es el gesto que se espera
            al ver un número al lado de una etiqueta. */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip
            activo={filtro === "todas"}
            onClick={() => setFiltro("todas")}
            texto={`Todos ${pendientes.length}`}
          />
          {(Object.keys(TIPOS) as Alerta["tipo"][])
            .filter((t) => (porTipo.get(t) ?? 0) > 0)
            .map((t) => (
              <Chip
                key={t}
                activo={filtro === t}
                onClick={() => setFiltro(filtro === t ? "todas" : t)}
                texto={`${TIPOS[t].icono} ${TIPOS[t].corto} ${porTipo.get(t)}`}
              />
            ))}
        </div>
      </Tarjeta>

      {error && (
        <p className="rounded-[10px] border border-bad/30 bg-bad-bg px-3 py-2.5 text-[13px] text-bad">
          {error}
        </p>
      )}

      {visibles.length === 0 ? (
        <Tarjeta className="p-6">
          <p className="text-[13.5px] text-ink-2">
            {pendientes.length === 0
              ? dia
                ? "Ese día no dejó ningún aviso pendiente."
                : "Nada que decidir ahora mismo. Si una ruta se retrasa, se queda callada o una entrega falla, aparecerá aquí."
              : "Ningún aviso de ese tipo."}
          </p>
        </Tarjeta>
      ) : (
        <Tarjeta className="overflow-hidden">
          <div className="divide-y divide-line">
            {visibles.map((a) => (
              <Fila
                key={a.clave}
                alerta={a}
                ocupada={ocupada === a.clave}
                onAlternar={() => alternar(a)}
              />
            ))}
          </div>
        </Tarjeta>
      )}

      <p className="text-[11.5px] text-ink-3">
        Los avisos se calculan al vuelo sobre lo que los conductores van
        marcando, no se guardan. Atender uno lo calla hasta que vuelva a pasar
        algo en esa ruta: si el conductor marca otra vez y el problema sigue,
        el aviso reaparece.
      </p>
    </div>
  );
}

function Chip({
  activo,
  onClick,
  texto,
}: {
  activo: boolean;
  onClick: () => void;
  texto: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`num rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition ${
        activo
          ? "border-amber-600 bg-amber text-navy-900"
          : "border-line bg-canvas text-ink-2 hover:bg-surface"
      }`}
    >
      {texto}
    </button>
  );
}

function Fila({
  alerta: a,
  ocupada,
  onAlternar,
}: {
  alerta: Alerta;
  ocupada: boolean;
  onAlternar: () => void;
}) {
  const t = TIPOS[a.tipo];
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2 ${
        a.atendida ? "opacity-55" : ""
      }`}
    >
      <span className="w-5 shrink-0 text-center text-[13px]">{t.icono}</span>

      <div className="min-w-[200px] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-[13.5px]">{a.parada ?? a.conductor ?? "Ruta"}</b>
          <Pastilla tono={a.severidad === "alta" ? "bad" : "warn"}>{t.corto}</Pastilla>
          {a.atendida && <Pastilla tono="ok">atendido</Pastilla>}
        </div>
        <div className="mt-0.5 text-[11.5px] text-ink-3">
          {a.detalle}
          {a.minutos != null && a.tipo !== "bateria" && (
            <> · <span className="num">{duracion(a.minutos)}</span></>
          )}
        </div>
      </div>

      <div className="min-w-[140px] text-[11.5px] text-ink-3">
        <span className="num">R-{String(a.indice + 1).padStart(2, "0")}</span>
        {a.conductor && a.parada && <> · {a.conductor}</>}
        {a.placa && <> · <span className="num">{a.placa}</span></>}
        <br />
        <span className="num">{hhmm(a.desde)}</span> · {a.despacho ?? "Despacho"}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Link
          href={`/torre?despacho=${a.despacho_id}`}
          title="Ver esta ruta en la torre de control"
          className="rounded-[8px] border border-line-strong px-2.5 py-1 text-[12px] font-semibold text-ink-2 transition hover:bg-canvas"
        >
          ◉ Ver
        </Link>
        <button
          onClick={onAlternar}
          disabled={ocupada}
          title={t.ayuda}
          className={`rounded-[8px] border px-2.5 py-1 text-[12px] font-semibold transition disabled:opacity-50 ${
            a.atendida
              ? "border-line-strong text-ink-2 hover:bg-canvas"
              : "border-ok/40 text-ok hover:bg-ok-bg"
          }`}
        >
          {ocupada ? "…" : a.atendida ? "Reabrir" : "✓ Atendido"}
        </button>
      </div>
    </div>
  );
}
