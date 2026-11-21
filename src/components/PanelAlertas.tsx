"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { alertas as traerAlertas, atenderAlerta, type Alerta } from "@/app/acciones/datos";
import { hora, hoy } from "@/lib/horas";
import { Pastilla } from "@/components/ui";
import {
  AccionesPagina, BOTON_SECUNDARIO, Paginacion, usePaginas,
} from "@/components/Paginacion";
import { aCSV, descargar } from "@/lib/exportar";

/**
 * Qué es cada aviso y por qué merece interrumpir a alguien.
 *
 * El texto corto va en la pastilla; el largo explica qué hacer, que es lo
 * que de verdad falta cuando una pantalla se llena de avisos rojos.
 */
const TIPOS: Record<
  Alerta["tipo"],
  { corto: string; pestana: string; icono: string; ayuda: string }
> = {
  retraso: {
    corto: "Retraso",
    pestana: "Alertas de retraso en entrega",
    icono: "⏱",
    ayuda: "La hora estimada ya pasó y la parada sigue pendiente.",
  },
  silencio: {
    corto: "Sin marcar",
    pestana: "Alertas de señal",
    icono: "📵",
    ayuda: "La ruta salió pero lleva rato sin registrar ninguna entrega.",
  },
  sin_salir: {
    corto: "Sin salir",
    pestana: "Alertas de salida",
    icono: "🅿",
    ayuda: "Pasó la hora de salida prevista y el vehículo no ha arrancado la ruta.",
  },
  jornada: {
    corto: "Jornada",
    pestana: "Alertas de tiempo extra",
    icono: "🌙",
    ayuda: "Lleva más horas en calle que las planificadas para la jornada.",
  },
  bateria: {
    corto: "Batería",
    pestana: "Alertas de batería",
    icono: "🔋",
    ayuda: "El móvil puede apagarse y dejar de registrar entregas.",
  },
  fallida: {
    corto: "No entregada",
    pestana: "Alertas de no entrega",
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

  const { pagina, setPagina, total, visibles: filas } = usePaginas(visibles, 15);

  function exportar() {
    descargar(
      `alertas-${dia ?? hoy()}.csv`,
      aCSV(
        ["Orden", "Vehículo", "Conductor", "Hora", "Alerta", "Detalle", "Minutos", "Atendida"],
        visibles.map((a) => [
          a.parada ?? "",
          a.placa ?? `R-${String(a.indice + 1).padStart(2, "0")}`,
          a.conductor,
          a.desde ? hhmm(a.desde) : "",
          TIPOS[a.tipo].corto,
          a.detalle,
          a.minutos,
          a.atendida ? "sí" : "no",
        ]),
      ),
    );
  }

  const tipos = Object.keys(TIPOS) as Alerta["tipo"][];

  return (
    <div>
      <AccionesPagina>
        <button onClick={exportar} disabled={!visibles.length} className={BOTON_SECUNDARIO}>
          ⤓ Exportar
        </button>
      </AccionesPagina>

      {/* Pestañas por tipo de alerta, como en la referencia. El número de
          cada una es lo que sigue sin atender. */}
      <div className="mb-3 flex overflow-x-auto rounded-[6px] border border-line">
        <Pestana
          activa={filtro === "todas"}
          onClick={() => setFiltro("todas")}
          texto="Alertas"
          n={pendientes.length}
        />
        {tipos.map((t) => (
          <Pestana
            key={t}
            activa={filtro === t}
            onClick={() => setFiltro(t)}
            texto={TIPOS[t].pestana}
            n={porTipo.get(t) ?? 0}
          />
        ))}
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 gap-2 pb-3 @xl:grid-cols-[1fr_1fr_auto_auto]">
        <input
          type="date"
          value={dia ?? hoy()}
          onChange={(e) =>
            router.push(e.target.value ? `/alertas?fecha=${e.target.value}` : "/alertas")
          }
          className="num w-full outline-none"
        />
        <select
          value={verAtendidas ? "todas" : "pendientes"}
          onChange={(e) => setVerAtendidas(e.target.value === "todas")}
          className="w-full outline-none"
        >
          <option value="pendientes">Estado actual: sin atender</option>
          <option value="todas">Estado actual: todas</option>
        </select>
        {!dia && (
          <label className="flex h-10 cursor-pointer items-center gap-1.5 px-1 text-[13px] text-ink-2">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            cada 45 s
          </label>
        )}
        <button onClick={refrescar} disabled={cargando} className={`${BOTON_SECUNDARIO} h-10 justify-center`}>
          {cargando ? "…" : "↻ Actualizar"}
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-[8px] border border-bad/30 bg-bad-bg px-3 py-2.5 text-[13px] text-bad">
          {error}
        </p>
      )}

      {visibles.length === 0 ? (
        <p className="rounded-[8px] border border-line p-6 text-[14px] text-ink-2">
          {pendientes.length === 0
            ? dia
              ? "Ese día no dejó ninguna alerta pendiente."
              : "Nada que decidir ahora mismo. Si una ruta se retrasa, se queda callada o una entrega falla, aparecerá aquí."
            : "Ninguna alerta de ese tipo."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-[8px] border border-line">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr>
                  <th className="text-left">Orden</th>
                  <th className="text-left">Vehículo</th>
                  <th className="text-left">Fecha</th>
                  <th className="text-left">Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filas.map((a) => (
                  <Fila
                    key={a.clave}
                    alerta={a}
                    ocupada={ocupada === a.clave}
                    onAlternar={() => alternar(a)}
                    dia={dia ?? hoy()}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <Paginacion pagina={pagina} total={total} onCambio={setPagina} />
        </div>
      )}

      <p className="mt-3 text-[12px] text-ink-3">
        Las alertas se calculan al vuelo sobre lo que los conductores van
        marcando, no se guardan. Atender una la calla hasta que vuelva a pasar
        algo en esa ruta: si el conductor marca otra vez y el problema sigue,
        la alerta reaparece.
      </p>
    </div>
  );
}

function Pestana({
  activa,
  onClick,
  texto,
  n,
}: {
  activa: boolean;
  onClick: () => void;
  texto: string;
  n: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-[38px] min-w-[150px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap border-r border-line px-3 text-[13px] transition last:border-r-0 ${
        activa
          ? "bg-surface font-bold text-ink shadow-[inset_0_-2px_0_var(--color-amber)]"
          : "bg-surface-2 text-ink-3 hover:text-ink-2"
      }`}
    >
      {texto}
      {n > 0 && (
        <span className="num rounded-full bg-bad px-1.5 text-[10px] font-bold leading-[16px] text-white">
          {n}
        </span>
      )}
    </button>
  );
}

function Fila({
  alerta: a,
  ocupada,
  onAlternar,
  dia,
}: {
  alerta: Alerta;
  ocupada: boolean;
  onAlternar: () => void;
  dia: string;
}) {
  const t = TIPOS[a.tipo];
  return (
    <tr className={`transition hover:bg-surface-2 ${a.atendida ? "opacity-55" : ""}`}>
      <td className="border-b border-line align-middle">
        {a.parada_id ? (
          <Link href={`/paradas/${a.parada_id}`}>{a.parada ?? "Parada"}</Link>
        ) : (
          <span>{a.parada ?? a.conductor ?? "Ruta"}</span>
        )}
        <div className="text-[12px] text-ink-3">{a.despacho ?? "Despacho"}</div>
      </td>
      <td className="border-b border-line align-middle">
        <span className="num">{a.placa ?? `R-${String(a.indice + 1).padStart(2, "0")}`}</span>
        {a.conductor && <div className="text-[12px] text-ink-3">{a.conductor}</div>}
      </td>
      <td className="num border-b border-line align-middle">
        {a.desde ? hhmm(a.desde) : "—"}
        <div className="font-bold">{dia}</div>
      </td>
      <td className="border-b border-line align-middle">
        <div className="flex flex-wrap items-center gap-2">
          <Pastilla tono={a.severidad === "alta" ? "bad" : "warn"}>{t.corto}</Pastilla>
          {a.atendida && <Pastilla tono="ok">Atendida</Pastilla>}
          <span className="text-[13px]">
            {a.detalle}
            {a.minutos != null && a.tipo !== "bateria" && (
              <> · <span className="num">{duracion(a.minutos)}</span></>
            )}
          </span>
        </div>
      </td>
      <td className="border-b border-line text-right align-middle">
        <div className="flex items-center justify-end gap-1.5">
          <Link
            href={`/torre?despacho=${a.despacho_id}`}
            title="Ver esta ruta en la torre de control"
            className="rounded-full border border-line-strong px-2.5 py-1 text-[12px] font-semibold text-ink-2 transition hover:bg-canvas"
          >
            Ver
          </Link>
          <button
            onClick={onAlternar}
            disabled={ocupada}
            title={t.ayuda}
            className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold transition disabled:opacity-50 ${
              a.atendida
                ? "border-line-strong text-ink-2 hover:bg-canvas"
                : "border-ok text-ok hover:bg-ok-bg"
            }`}
          >
            {ocupada ? "…" : a.atendida ? "Reabrir" : "✓ Atendida"}
          </button>
        </div>
      </td>
    </tr>
  );
}
