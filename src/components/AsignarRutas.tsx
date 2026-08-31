"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { asignarRutas } from "@/lib/despachos";

export type RutaAsignable = {
  id: string;
  indice: number;
  paradas: number;
  bultos: number;
  km: number | null;
  conductor_id: string | null;
  vehiculo_id: string | null;
};

export type Conductor = { id: string; nombre: string | null };
export type Vehiculo = { id: string; nombre: string; placa: string | null };

/**
 * Reparte las rutas entre los conductores. Cuando ninguna se queda sin
 * conductor, el despacho pasa a «Asignado» y ya puede salir a reparto.
 */
export default function AsignarRutas({
  despachoId,
  rutas,
  conductores,
  vehiculos,
}: {
  despachoId: string;
  rutas: RutaAsignable[];
  conductores: Conductor[];
  vehiculos: Vehiculo[];
}) {
  const router = useRouter();
  const [valores, setValores] = useState<Record<string, { conductor: string; vehiculo: string }>>(
    Object.fromEntries(
      rutas.map((r) => [r.id, { conductor: r.conductor_id ?? "", vehiculo: r.vehiculo_id ?? "" }]),
    ),
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);

  const sinConductor = rutas.filter((r) => !valores[r.id]?.conductor).length;

  function cambiar(rutaId: string, campo: "conductor" | "vehiculo", valor: string) {
    setValores((v) => ({ ...v, [rutaId]: { ...v[rutaId], [campo]: valor } }));
    setListo(null);
  }

  /** Reparte los conductores libres por orden de ruta. */
  function repartir() {
    const usados = new Set<string>();
    const siguiente = () => conductores.find((c) => !usados.has(c.id));
    setValores((v) => {
      const copia = { ...v };
      for (const r of rutas) {
        const actual = copia[r.id]?.conductor;
        if (actual) {
          usados.add(actual);
          continue;
        }
        const libre = siguiente();
        if (!libre) break;
        usados.add(libre.id);
        copia[r.id] = { ...copia[r.id], conductor: libre.id };
      }
      return copia;
    });
    setListo(null);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const estadoFinal = await asignarRutas(
        despachoId,
        rutas.map((r) => ({
          ruta_id: r.id,
          conductor_id: valores[r.id]?.conductor || null,
          vehiculo_id: valores[r.id]?.vehiculo || null,
        })),
      );
      setListo(
        estadoFinal === "asignado"
          ? "Despacho asignado: cada ruta tiene conductor."
          : "Asignaciones guardadas. Faltan rutas por asignar.",
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  if (!conductores.length) {
    return (
      <p className="rounded-[10px] border border-warn/30 bg-warn-bg px-3 py-2.5 text-[12.5px] text-warn">
        Todavía no hay conductores en tu equipo. Créalos en{" "}
        <b>Administración → Equipo</b> con el rol «Conductor» y podrás asignarles
        estas rutas.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <p className="text-[12.5px] text-ink-2">
          {sinConductor === 0 ? (
            <span className="font-semibold text-ok">Todas las rutas tienen conductor.</span>
          ) : (
            <>
              <b className="num">{sinConductor}</b> de{" "}
              <b className="num">{rutas.length}</b> rutas sin conductor.
            </>
          )}
        </p>
        <button
          onClick={repartir}
          className="ml-auto rounded-[8px] border border-line-strong bg-surface px-2.5 py-1 text-[12px] font-semibold text-ink-2 transition hover:bg-canvas"
        >
          Repartir disponibles
        </button>
        <button
          onClick={guardar}
          disabled={guardando}
          className="rounded-[9px] border border-amber-600 bg-amber px-3.5 py-1.5 text-[12.5px] font-semibold text-navy-900 transition hover:bg-amber-600 hover:text-white disabled:opacity-60"
        >
          {guardando ? "Guardando…" : "Guardar asignación"}
        </button>
      </div>

      {error && (
        <p className="mb-2.5 rounded-[10px] border border-bad/30 bg-bad-bg px-3 py-2 text-[12.5px] text-bad">
          {error}
        </p>
      )}
      {listo && (
        <p className="mb-2.5 rounded-[10px] border border-ok/30 bg-ok-bg px-3 py-2 text-[12.5px] text-ok">
          ✓ {listo}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-[13px]">
          <thead>
            <tr>
              {["Ruta", "Carga", "Conductor", ...(vehiculos.length ? ["Vehículo"] : [])].map((h) => (
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
            {rutas.map((r) => (
              <tr key={r.id}>
                <td className="border-b border-line px-3 py-2 font-semibold">
                  R-{String(r.indice + 1).padStart(2, "0")}
                </td>
                <td className="num border-b border-line px-3 py-2 text-[12.5px] text-ink-2">
                  {r.paradas} paradas · {r.bultos} bultos
                  {r.km ? ` · ${Number(r.km).toFixed(1)} km` : ""}
                </td>
                <td className="border-b border-line px-3 py-2">
                  <select
                    value={valores[r.id]?.conductor ?? ""}
                    onChange={(e) => cambiar(r.id, "conductor", e.target.value)}
                    className="w-full rounded-[8px] border border-line-strong bg-surface px-2 py-1 text-[12.5px]"
                  >
                    <option value="">— sin asignar —</option>
                    {conductores.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre ?? "Conductor"}
                      </option>
                    ))}
                  </select>
                </td>
                {vehiculos.length > 0 && (
                  <td className="border-b border-line px-3 py-2">
                    <select
                      value={valores[r.id]?.vehiculo ?? ""}
                      onChange={(e) => cambiar(r.id, "vehiculo", e.target.value)}
                      className="w-full rounded-[8px] border border-line-strong bg-surface px-2 py-1 text-[12.5px]"
                    >
                      <option value="">— sin vehículo —</option>
                      {vehiculos.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.nombre}
                          {v.placa ? ` (${v.placa})` : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
