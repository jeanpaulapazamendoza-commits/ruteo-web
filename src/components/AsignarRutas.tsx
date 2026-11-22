"use client";

import { useState } from "react";
import Link from "next/link";
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
  /** De qué base sale, si no es el centro del despacho. */
  base?: string | null;
};

export type Conductor = { id: string; nombre: string | null };
export type Vehiculo = {
  id: string;
  nombre: string;
  placa: string | null;
  capacidad_bultos?: number;
  /** Su conductor habitual: se propone al elegir el vehículo, y al revés. */
  conductor_id?: string | null;
};

const SELECTOR =
  "h-9 w-full rounded-[8px] border border-line-strong bg-surface px-2.5 text-[13px] outline-none focus:border-amber";

/**
 * Quién lleva cada ruta: conductor y vehículo.
 *
 * Cuando ninguna ruta se queda sin conductor, el despacho pasa a «Asignado»
 * y ya puede salir a reparto. El vehículo no es obligatorio, pero sin él no
 * se sabe qué placa hizo el reparto ni cuánto le cabe.
 *
 * Las dos columnas están siempre a la vista. Antes la del vehículo solo
 * aparecía cuando ya existía alguno, y como no había dónde crearlos, no
 * aparecía nunca: nadie sabía que una ruta podía llevar transporte.
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
  const sinVehiculo = rutas.filter((r) => !valores[r.id]?.vehiculo).length;

  /**
   * Al elegir uno de los dos, se propone su pareja habitual si el otro hueco
   * está vacío. Nunca pisa lo que ya se eligió a mano.
   */
  function cambiar(rutaId: string, campo: "conductor" | "vehiculo", valor: string) {
    setValores((v) => {
      const fila = { ...v[rutaId], [campo]: valor };
      if (valor && campo === "vehiculo" && !fila.conductor) {
        const suyo = vehiculos.find((x) => x.id === valor)?.conductor_id;
        if (suyo && conductores.some((c) => c.id === suyo)) fila.conductor = suyo;
      }
      if (valor && campo === "conductor" && !fila.vehiculo) {
        const suyo = vehiculos.find((x) => x.conductor_id === valor);
        if (suyo) fila.vehiculo = suyo.id;
      }
      return { ...v, [rutaId]: fila };
    });
    setListo(null);
  }

  /**
   * Reparte lo que está libre, por orden de ruta.
   *
   * Primero los vehículos —el más grande para la ruta con más bultos—, cada
   * uno con su conductor habitual; después, los conductores que sobren para
   * las rutas que sigan sin uno.
   */
  function repartir() {
    setValores((v) => {
      const copia = Object.fromEntries(Object.entries(v).map(([k, f]) => [k, { ...f }]));
      const vehUsados = new Set(Object.values(copia).map((f) => f.vehiculo).filter(Boolean));
      const condUsados = new Set(Object.values(copia).map((f) => f.conductor).filter(Boolean));

      const libres = vehiculos
        .filter((x) => !vehUsados.has(x.id))
        .sort((a, b) => (b.capacidad_bultos ?? 0) - (a.capacidad_bultos ?? 0));
      const porCarga = [...rutas].sort((a, b) => b.bultos - a.bultos);
      for (const r of porCarga) {
        const fila = copia[r.id];
        if (fila.vehiculo) continue;
        // El primero al que le quepa la ruta; si a ninguno, el más grande.
        const i = libres.findIndex((x) => (x.capacidad_bultos ?? Infinity) >= r.bultos);
        const veh = libres.splice(i >= 0 ? i : 0, 1)[0];
        if (!veh) break;
        fila.vehiculo = veh.id;
        if (!fila.conductor && veh.conductor_id && !condUsados.has(veh.conductor_id)
            && conductores.some((c) => c.id === veh.conductor_id)) {
          fila.conductor = veh.conductor_id;
          condUsados.add(veh.conductor_id);
        }
      }
      for (const r of rutas) {
        const fila = copia[r.id];
        if (fila.conductor) continue;
        const libre = conductores.find((c) => !condUsados.has(c.id));
        if (!libre) break;
        fila.conductor = libre.id;
        condUsados.add(libre.id);
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

  // Un vehículo que ya lleva otra ruta de este despacho, o que se queda corto.
  const aviso = (r: RutaAsignable) => {
    const id = valores[r.id]?.vehiculo;
    if (!id) return null;
    const veh = vehiculos.find((x) => x.id === id);
    if (rutas.some((o) => o.id !== r.id && valores[o.id]?.vehiculo === id)) {
      return "Este vehículo ya lleva otra ruta de este despacho.";
    }
    if (veh?.capacidad_bultos != null && veh.capacidad_bultos < r.bultos) {
      return `Le caben ${veh.capacidad_bultos} bultos y la ruta lleva ${r.bultos}.`;
    }
    return null;
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-[13px] text-ink-2">
          {sinConductor === 0 ? (
            <span className="font-semibold text-ok">Todas las rutas tienen conductor.</span>
          ) : (
            <>
              <b className="num text-ink">{sinConductor}</b> de{" "}
              <b className="num text-ink">{rutas.length}</b> rutas sin conductor.
            </>
          )}
          {vehiculos.length > 0 && sinVehiculo > 0 && (
            <span className="text-ink-3"> · {sinVehiculo} sin vehículo</span>
          )}
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            onClick={repartir}
            disabled={!conductores.length && !vehiculos.length}
            className="rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-2 transition hover:bg-canvas disabled:opacity-50"
          >
            Repartir disponibles
          </button>
          <button
            onClick={guardar}
            disabled={guardando}
            className="rounded-full border border-amber-600 bg-amber px-4 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-amber-600 hover:text-white disabled:opacity-60"
          >
            {guardando ? "Guardando…" : "Guardar asignación"}
          </button>
        </div>
      </div>

      {(conductores.length === 0 || vehiculos.length === 0) && (
        <p className="mb-4 rounded-[10px] border border-warn/30 bg-warn-bg px-3.5 py-2.5 text-[12.5px] leading-relaxed text-warn">
          {conductores.length === 0 && (
            <>
              Todavía no hay conductores. Créalos en{" "}
              <Link href="/equipo" className="font-bold underline underline-offset-2">
                Ajustes → Usuarios
              </Link>{" "}
              con el rol «Conductor».{" "}
            </>
          )}
          {vehiculos.length === 0 && (
            <>
              Todavía no hay vehículos. Créalos en{" "}
              <Link href="/vehiculos" className="font-bold underline underline-offset-2">
                Ajustes → Vehículos
              </Link>
              .
            </>
          )}
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-[10px] border border-bad/30 bg-bad-bg px-3.5 py-2.5 text-[12.5px] text-bad">
          {error}
        </p>
      )}
      {listo && (
        <p className="mb-4 rounded-[10px] border border-ok/30 bg-ok-bg px-3.5 py-2.5 text-[12.5px] text-ok">
          ✓ {listo}
        </p>
      )}

      <div className="overflow-hidden rounded-[8px] border border-line">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr>
                <th className="w-[90px] text-left">Ruta</th>
                <th className="text-left">Carga</th>
                <th className="w-[28%] text-left">Conductor</th>
                <th className="w-[28%] text-left">Vehículo</th>
              </tr>
            </thead>
            <tbody>
              {rutas.map((r) => {
                const nota = aviso(r);
                return (
                  <tr key={r.id}>
                    <td className="border-b border-line align-middle font-semibold text-ink">
                      R-{String(r.indice + 1).padStart(2, "0")}
                    </td>
                    <td className="num border-b border-line align-middle">
                      {r.paradas} paradas · {r.bultos} bultos
                      {r.km ? ` · ${Number(r.km).toFixed(1)} km` : ""}
                      {r.base && <span className="block text-[11.5px] text-ink-3">Sale de {r.base}</span>}
                    </td>
                    <td className="border-b border-line align-middle">
                      <select
                        value={valores[r.id]?.conductor ?? ""}
                        onChange={(e) => cambiar(r.id, "conductor", e.target.value)}
                        disabled={!conductores.length}
                        aria-label={`Conductor de la ruta ${r.indice + 1}`}
                        className={SELECTOR}
                      >
                        <option value="">— sin asignar —</option>
                        {conductores.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre ?? "Conductor"}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border-b border-line align-middle">
                      <select
                        value={valores[r.id]?.vehiculo ?? ""}
                        onChange={(e) => cambiar(r.id, "vehiculo", e.target.value)}
                        disabled={!vehiculos.length}
                        aria-label={`Vehículo de la ruta ${r.indice + 1}`}
                        className={SELECTOR}
                      >
                        <option value="">
                          {vehiculos.length ? "— sin vehículo —" : "— no hay vehículos —"}
                        </option>
                        {vehiculos.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.placa ? `${v.placa} · ` : ""}
                            {v.nombre}
                            {v.capacidad_bultos != null ? ` (${v.capacidad_bultos} blt)` : ""}
                          </option>
                        ))}
                      </select>
                      {nota && <span className="mt-1 block text-[11.5px] text-warn">{nota}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
