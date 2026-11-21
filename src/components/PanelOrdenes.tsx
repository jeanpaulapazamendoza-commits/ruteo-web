"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ordenes as traerOrdenes, type FiltroOrdenes, type Orden } from "@/app/acciones/datos";
import SelectorColumnas, { useColumnas, type Columna } from "@/components/SelectorColumnas";
import { aCSV, descargar, nombreArchivo } from "@/lib/exportar";
import { hora, hoy } from "@/lib/horas";
import { Pastilla, Tarjeta } from "@/components/ui";

const ESTADO: Record<string, { texto: string; tono: "ok" | "warn" | "bad" | "live" }> = {
  entregado: { texto: "Entregado", tono: "ok" },
  parcial: { texto: "Parcial", tono: "warn" },
  reprogramado: { texto: "Reprogramado", tono: "warn" },
  fallido: { texto: "No entregado", tono: "bad" },
  pendiente: { texto: "Pendiente", tono: "live" },
};

const corta = (t: string | null) => (t ? t.slice(0, 5) : "—");

function desvioTexto(m: number | null) {
  if (m == null) return "—";
  if (Math.abs(m) <= 10) return "a tiempo";
  return `${m > 0 ? "+" : "−"}${Math.abs(m)} min`;
}

export default function PanelOrdenes({
  inicial,
  conductores,
  filtro: filtroInicial,
}: {
  inicial: Orden[];
  conductores: string[];
  filtro: FiltroOrdenes;
}) {
  const [lista, setLista] = useState(inicial);
  const [filtro, setFiltro] = useState<FiltroOrdenes>(filtroInicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const montado = useRef(true);

  useEffect(() => () => { montado.current = false; }, []);
  useEffect(() => setLista(inicial), [inicial]);

  const buscar = useCallback(async (f: FiltroOrdenes) => {
    setCargando(true);
    try {
      const d = await traerOrdenes(f);
      if (montado.current) { setLista(d); setError(null); }
    } catch (e) {
      if (montado.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (montado.current) setCargando(false);
    }
  }, []);

  // El texto se busca al dejar de escribir, no en cada tecla: cada búsqueda
  // es un viaje a la base y con quinientas filas no hace falta ir tan rápido.
  useEffect(() => {
    const t = setTimeout(() => void buscar(filtro), 350);
    return () => clearTimeout(t);
  }, [filtro, buscar]);

  const columnas: Columna<Orden>[] = [
    {
      clave: "codigo",
      texto: "Orden",
      pinta: (o) => (
        <Link href={`/paradas/${o.id}`} className="num font-semibold transition hover:underline">
          {o.codigo ?? o.id.slice(0, 8)}
        </Link>
      ),
      exporta: (o) => o.codigo ?? o.id,
    },
    {
      clave: "nombre",
      texto: "Destino",
      pinta: (o) => (
        <>
          <span className="font-semibold text-ink">{o.nombre ?? "—"}</span>
          {o.distrito && <span className="block text-[11px] text-ink-3">{o.distrito}</span>}
        </>
      ),
      exporta: (o) => o.nombre,
    },
    {
      clave: "estado",
      texto: "Estado",
      pinta: (o) => {
        const e = ESTADO[o.estado_entrega] ?? { texto: o.estado_entrega, tono: "live" as const };
        return (
          <span className="flex flex-wrap items-center gap-1">
            <Pastilla tono={e.tono}>{e.texto}</Pastilla>
            {o.en_bandeja && <Pastilla tono="plan">sin asignar</Pastilla>}
          </span>
        );
      },
      exporta: (o) => (ESTADO[o.estado_entrega]?.texto ?? o.estado_entrega),
    },
    {
      clave: "motivo",
      texto: "Motivo",
      opcional: true,
      pinta: (o) => <span className="text-ink-2">{o.motivo ?? "—"}</span>,
      exporta: (o) => o.motivo,
    },
    {
      clave: "bultos",
      texto: "Bultos",
      opcional: true,
      alineacion: "derecha",
      pinta: (o) => (
        <span className="num">
          {o.bultos_entregados != null && o.bultos_entregados !== o.bultos
            ? `${o.bultos_entregados}/${o.bultos}`
            : o.bultos}
        </span>
      ),
      exporta: (o) => o.bultos,
    },
    {
      clave: "ruta",
      texto: "Ruta",
      opcional: true,
      pinta: (o) => (
        <span className="num text-ink-2">
          {o.ruta_indice != null ? `R-${String(o.ruta_indice + 1).padStart(2, "0")}` : "—"}
        </span>
      ),
      exporta: (o) => (o.ruta_indice != null ? `R-${String(o.ruta_indice + 1).padStart(2, "0")}` : ""),
    },
    {
      clave: "conductor",
      texto: "Conductor",
      opcional: true,
      pinta: (o) => <span className="text-ink-2">{o.conductor ?? "—"}</span>,
      exporta: (o) => o.conductor,
    },
    {
      clave: "placa",
      texto: "Vehículo",
      opcional: true,
      pinta: (o) => <span className="num text-ink-2">{o.placa ?? "—"}</span>,
      exporta: (o) => o.placa,
    },
    {
      clave: "eta",
      texto: "Estimada",
      opcional: true,
      pinta: (o) => <span className="num text-ink-3">{corta(o.eta)}</span>,
      exporta: (o) => corta(o.eta),
    },
    {
      clave: "real",
      texto: "Real",
      opcional: true,
      pinta: (o) => <span className="num">{hora(o.hora_entrega)}</span>,
      exporta: (o) => hora(o.hora_entrega),
    },
    {
      clave: "desvio",
      texto: "Desvío",
      opcional: true,
      pinta: (o) => (
        <span
          className={`num font-semibold ${
            o.desvio_min == null || Math.abs(o.desvio_min) <= 10
              ? "text-ok"
              : o.desvio_min > 0
                ? "text-bad"
                : "text-live"
          }`}
        >
          {o.hora_entrega ? desvioTexto(o.desvio_min) : "—"}
        </span>
      ),
      exporta: (o) => (o.hora_entrega ? o.desvio_min : null),
    },
    {
      clave: "intentos",
      texto: "Intentos",
      opcional: true,
      alineacion: "derecha",
      pinta: (o) => (
        <span className={`num ${o.intentos > 1 ? "font-bold text-warn" : "text-ink-3"}`}>
          {o.intentos}
        </span>
      ),
      exporta: (o) => o.intentos,
    },
    {
      clave: "despacho",
      texto: "Despacho",
      opcional: true,
      pinta: (o) => (
        <Link href={`/despachos/${o.despacho_id}`} className="text-ink-2 transition hover:underline">
          {o.despacho ?? "—"}
        </Link>
      ),
      exporta: (o) => o.despacho,
    },
    {
      clave: "fecha",
      texto: "Fecha",
      opcional: true,
      pinta: (o) => <span className="num text-ink-3">{o.fecha}</span>,
      exporta: (o) => o.fecha,
    },
  ];

  const { visibles, elegidas, alternar, fijas } = useColumnas("ordenes", columnas);

  function exportar() {
    // Se exporta lo que se está viendo, filtros y columnas incluidos: un
    // archivo que no coincide con la pantalla es una fuente de discusiones.
    const csv = aCSV(
      visibles.map((c) => c.texto),
      lista.map((o) =>
        visibles.map((c) => (c.exporta ? c.exporta(o) : String(c.pinta(o) ?? ""))),
      ),
    );
    descargar(nombreArchivo("ordenes", filtro.hasta ?? hoy()), csv);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2 text-[11.5px] text-ink-3">
        <input
          value={filtro.texto ?? ""}
          onChange={(e) => setFiltro((f) => ({ ...f, texto: e.target.value }))}
          placeholder="Código, destino, distrito, placa o despacho"
          className="w-[260px] rounded-[8px] border border-line-strong bg-surface px-2.5 py-1 text-[12px]"
        />
        <select
          value={filtro.estado ?? ""}
          onChange={(e) => setFiltro((f) => ({ ...f, estado: e.target.value || undefined }))}
          className="rounded-[8px] border border-line-strong bg-surface px-2 py-1 text-[11.5px]"
        >
          <option value="">Cualquier estado</option>
          {Object.entries(ESTADO).map(([k, v]) => (
            <option key={k} value={k}>{v.texto}</option>
          ))}
        </select>
        <select
          value={filtro.conductor ?? ""}
          onChange={(e) => setFiltro((f) => ({ ...f, conductor: e.target.value || undefined }))}
          className="rounded-[8px] border border-line-strong bg-surface px-2 py-1 text-[11.5px]"
        >
          <option value="">Cualquier conductor</option>
          {conductores.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <label className="flex items-center gap-1">
          Del
          <input
            type="date"
            value={filtro.desde ?? ""}
            onChange={(e) => setFiltro((f) => ({ ...f, desde: e.target.value || undefined }))}
            className="num rounded-[8px] border border-line-strong bg-surface px-2 py-1 text-[11.5px]"
          />
          al
          <input
            type="date"
            value={filtro.hasta ?? ""}
            onChange={(e) => setFiltro((f) => ({ ...f, hasta: e.target.value || undefined }))}
            className="num rounded-[8px] border border-line-strong bg-surface px-2 py-1 text-[11.5px]"
          />
        </label>

        <span className="ml-auto flex items-center gap-2">
          <span className="num">
            {cargando ? "buscando…" : `${lista.length} órdenes`}
          </span>
          <SelectorColumnas
            columnas={columnas}
            elegidas={elegidas}
            alternar={alternar}
            fijas={fijas}
          />
          <button
            onClick={exportar}
            disabled={!lista.length}
            className="rounded-[8px] border border-line-strong bg-surface px-2.5 py-1 font-semibold text-ink-2 transition hover:bg-canvas disabled:opacity-50"
          >
            ⤓ Exportar a Excel
          </button>
        </span>
      </div>

      <div className="p-3">
        {error && (
          <p className="mb-3 rounded-[10px] border border-bad/30 bg-bad-bg px-3 py-2 text-[12.5px] text-bad">
            {error}
          </p>
        )}

        {lista.length === 0 ? (
          <Tarjeta className="p-6 text-[13.5px] text-ink-2">
            Ninguna orden coincide. Prueba a ampliar el rango de fechas: por
            defecto se miran los últimos ocho días.
          </Tarjeta>
        ) : (
          <Tarjeta className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr>
                    {visibles.map((c) => (
                      <th
                        key={c.clave}
                        className={`whitespace-nowrap border-b border-line bg-surface-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3 ${
                          c.alineacion === "derecha" ? "text-right" : "text-left"
                        }`}
                      >
                        {c.texto}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lista.map((o) => (
                    <tr key={o.id} className="transition hover:bg-canvas">
                      {visibles.map((c) => (
                        <td
                          key={c.clave}
                          className={`border-b border-line px-3 py-1.5 align-middle ${
                            c.alineacion === "derecha" ? "text-right" : ""
                          }`}
                        >
                          {c.pinta(o)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Tarjeta>
        )}

        {lista.length >= 500 && (
          <p className="mt-2 text-[11.5px] text-warn">
            Se muestran las primeras 500. Acota la fecha o el texto para verlo
            todo.
          </p>
        )}
      </div>
    </>
  );
}
