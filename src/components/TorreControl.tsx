"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { Pastilla, Tarjeta } from "@/components/ui";

export type ParadaSeguimiento = {
  id: string;
  orden: number;
  codigo: string | null;
  nombre: string | null;
  distrito: string | null;
  bultos: number;
  prioridad: number;
  eta: string | null;
  estado_entrega: "pendiente" | "entregado" | "fallido" | "reprogramado";
  hora_entrega: string | null;
  motivo: string | null;
  foto_url: string | null;
  observaciones: string | null;
  recibe: string | null;
  rutas: { indice: number; despacho_id: string } | null;
};

const ESTADO_TONO = {
  entregado: "ok",
  fallido: "bad",
  reprogramado: "warn",
  pendiente: "plan",
} as const;

const COLORES = [
  "#E8833A", "#2E7DD1", "#0E8F9E", "#7A5AF8", "#C2439B", "#7C9A1F",
  "#D9534F", "#2F855A", "#B7791F", "#5A67D8", "#D53F8C", "#319795",
];
const color = (i: number) => COLORES[i % COLORES.length];

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "—");
const horaDe = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })
    : "—";

export default function TorreControl({
  despachoId,
  inicial,
}: {
  despachoId: string;
  inicial: ParadaSeguimiento[];
}) {
  const [paradas, setParadas] = useState(inicial);
  const [actualizado, setActualizado] = useState<Date>(new Date());
  const [auto, setAuto] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const montado = useRef(true);

  useEffect(() => () => { montado.current = false; }, []);

  const refrescar = useCallback(async () => {
    setCargando(true);
    try {
      const supabase = crearClienteNavegador();
      const { data, error } = await supabase
        .from("paradas")
        .select(
          `id, orden, codigo, nombre, distrito, bultos, prioridad, eta,
           estado_entrega, hora_entrega, motivo, foto_url, observaciones, recibe,
           rutas!inner(indice, despacho_id)`,
        )
        .eq("rutas.despacho_id", despachoId)
        .order("orden");
      if (error) throw error;
      if (!montado.current) return;
      setParadas((data ?? []) as unknown as ParadaSeguimiento[]);
      setActualizado(new Date());
      setError(null);
    } catch (e) {
      if (montado.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (montado.current) setCargando(false);
    }
  }, [despachoId]);

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
    const fallido = cuenta("fallido");
    const reprogramado = cuenta("reprogramado");
    const pendiente = paradas.length - entregado - fallido - reprogramado;
    const cerradas = entregado + fallido + reprogramado;
    return {
      total: paradas.length,
      entregado, fallido, reprogramado, pendiente,
      avance: Math.round((cerradas / total) * 100),
      pct: (n: number) => (n / total) * 100,
      bultosEntregados: paradas
        .filter((p) => p.estado_entrega === "entregado")
        .reduce((a, p) => a + p.bultos, 0),
    };
  }, [paradas]);

  const porRuta = useMemo(() => {
    const m = new Map<number, ParadaSeguimiento[]>();
    paradas.forEach((p) => {
      const i = p.rutas?.indice ?? 0;
      if (!m.has(i)) m.set(i, []);
      m.get(i)!.push(p);
    });
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [paradas]);

  const incidencias = useMemo(
    () => paradas.filter((p) => p.estado_entrega === "fallido" || p.estado_entrega === "reprogramado"),
    [paradas],
  );

  const ultimas = useMemo(
    () =>
      paradas
        .filter((p) => p.hora_entrega)
        .sort((a, b) => (b.hora_entrega! > a.hora_entrega! ? 1 : -1))
        .slice(0, 8),
    [paradas],
  );

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-3.5 overflow-y-auto p-4">
        {error && (
          <p className="rounded-[10px] border border-bad/30 bg-bad-bg px-3 py-2 text-[12.5px] text-bad">
            {error}
          </p>
        )}

        {/* Avance general */}
        <Tarjeta className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="num text-[40px] font-extrabold leading-none tracking-tight">
              {resumen.avance}
              <span className="text-[20px]">%</span>
            </div>
            <div className="pb-1 text-[12.5px] text-ink-2">
              del despacho completado
              <br />
              <span className="num">
                {resumen.entregado + resumen.fallido + resumen.reprogramado}
              </span>{" "}
              de <span className="num">{resumen.total}</span> paradas cerradas
            </div>
            <div className="ml-auto flex flex-wrap gap-3.5 pb-1 text-[11.5px] font-semibold text-ink-2">
              <Leyenda color="var(--color-ok)" texto={`Entregado ${resumen.entregado}`} />
              <Leyenda color="var(--color-live)" texto={`Pendiente ${resumen.pendiente}`} />
              <Leyenda color="var(--color-warn)" texto={`Reprogramado ${resumen.reprogramado}`} />
              <Leyenda color="var(--color-bad)" texto={`Fallido ${resumen.fallido}`} />
            </div>
          </div>

          <div className="mt-3 flex h-3 overflow-hidden rounded-full border border-line bg-canvas">
            <span style={{ width: `${resumen.pct(resumen.entregado)}%`, background: "var(--color-ok)" }} />
            <span style={{ width: `${resumen.pct(resumen.reprogramado)}%`, background: "var(--color-warn)" }} />
            <span style={{ width: `${resumen.pct(resumen.fallido)}%`, background: "var(--color-bad)" }} />
            <span style={{ width: `${resumen.pct(resumen.pendiente)}%`, background: "var(--color-live)" }} />
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11.5px] text-ink-3">
            <span className="num">{resumen.bultosEntregados} bultos entregados</span>
            <span className="ml-auto flex items-center gap-2">
              Actualizado <span className="num">{horaDe(actualizado.toISOString())}</span>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                cada 20 s
              </label>
              <button
                onClick={refrescar}
                disabled={cargando}
                className="rounded-[8px] border border-line-strong px-2 py-1 font-semibold text-ink-2 transition hover:bg-canvas disabled:opacity-50"
              >
                {cargando ? "…" : "↻ Actualizar"}
              </button>
            </span>
          </div>
        </Tarjeta>

        {/* Rutas activas */}
        <Tarjeta>
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <h3 className="text-[13.5px] font-bold">Rutas</h3>
            <span className="num text-[12px] text-ink-3">{porRuta.length}</span>
          </div>
          <div className="divide-y divide-line">
            {porRuta.map(([indice, ps]) => {
              const cerradas = ps.filter((p) => p.estado_entrega !== "pendiente").length;
              const pct = Math.round((cerradas / (ps.length || 1)) * 100);
              const fallidas = ps.filter((p) => p.estado_entrega === "fallido").length;
              const siguiente = ps.find((p) => p.estado_entrega === "pendiente");
              return (
                <div key={indice} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
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
                  {fallidas > 0 && <Pastilla tono="bad">{fallidas} fallidas</Pastilla>}
                  {pct === 100 && fallidas === 0 && <Pastilla tono="ok">Completada</Pastilla>}
                </div>
              );
            })}
          </div>
        </Tarjeta>

        {/* Incidencias */}
        <Tarjeta>
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
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
              <table className="w-full min-w-[520px] border-collapse text-[12.5px]">
                <thead>
                  <tr>
                    {["Tienda", "Ruta", "Motivo", "Hora", "Estado"].map((h) => (
                      <th key={h} className="border-b border-line bg-surface-2 px-3 py-2 text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {incidencias.map((p) => (
                    <tr key={p.id}>
                      <td className="border-b border-line px-3 py-2">
                        <b className="text-ink">{p.nombre}</b>
                        <br />
                        <span className="text-[11.5px] text-ink-3">{p.distrito ?? "—"}</span>
                      </td>
                      <td className="num border-b border-line px-3 py-2">
                        R-{String((p.rutas?.indice ?? 0) + 1).padStart(2, "0")}
                      </td>
                      <td className="border-b border-line px-3 py-2 text-ink-2">
                        {p.motivo ?? p.observaciones ?? "Sin detalle"}
                      </td>
                      <td className="num border-b border-line px-3 py-2 text-ink-2">
                        {horaDe(p.hora_entrega)}
                      </td>
                      <td className="border-b border-line px-3 py-2">
                        <Pastilla tono={ESTADO_TONO[p.estado_entrega]}>
                          {p.estado_entrega}
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
      <aside className="min-w-0 overflow-y-auto border-l border-line bg-surface p-4">
        <h3 className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.11em] text-ink-3">
          Actividad reciente
        </h3>
        {ultimas.length === 0 ? (
          <p className="text-[13px] text-ink-2">
            Todavía no hay entregas registradas. Cuando los conductores marquen
            desde su móvil, aparecerán aquí.
          </p>
        ) : (
          <div className="flex flex-col">
            {ultimas.map((p) => (
              <div key={p.id} className="flex gap-2.5 border-b border-dashed border-line py-2 last:border-0">
                <span className="num shrink-0 pt-0.5 text-[11px] text-ink-3">
                  {horaDe(p.hora_entrega)}
                </span>
                <span
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px]"
                  style={{
                    background:
                      p.estado_entrega === "entregado" ? "var(--color-ok-bg)"
                      : p.estado_entrega === "fallido" ? "var(--color-bad-bg)"
                      : "var(--color-warn-bg)",
                    color:
                      p.estado_entrega === "entregado" ? "var(--color-ok)"
                      : p.estado_entrega === "fallido" ? "var(--color-bad)"
                      : "var(--color-warn)",
                  }}
                >
                  {p.estado_entrega === "entregado" ? "✓" : p.estado_entrega === "fallido" ? "✕" : "!"}
                </span>
                <div className="min-w-0 text-[12px] text-ink-2">
                  <b className="block text-[12.5px] text-ink">{p.nombre}</b>
                  {p.estado_entrega === "entregado"
                    ? `${p.bultos} bultos${p.recibe ? ` · recibe ${p.recibe}` : ""}`
                    : (p.motivo ?? p.observaciones ?? p.estado_entrega)}
                  {p.foto_url && (
                    <a
                      href={p.foto_url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-1.5 font-semibold text-amber-600 underline underline-offset-2"
                    >
                      ver foto
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
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
