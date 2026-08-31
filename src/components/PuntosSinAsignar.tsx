"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { moverParadas } from "@/lib/despachos";
import { Tarjeta } from "@/components/ui";

export type ParadaLibre = {
  id: string;
  codigo: string | null;
  nombre: string | null;
  distrito: string | null;
  bultos: number;
};

export type RutaDestino = { id: string; indice: number; paradas: number; bultos: number };

/**
 * Los puntos del archivo que no entraron en ninguna ruta.
 *
 * Antes se perdían al guardar: un archivo de 54 puntos acababa siendo un
 * despacho de 52 sin decir nada. Ahora quedan aquí y se les puede dar una
 * ruta —una existente o una nueva— sin volver a calcularlo todo.
 */
export default function PuntosSinAsignar({
  despachoId,
  paradas,
  rutas,
  editable,
}: {
  despachoId: string;
  paradas: ParadaLibre[];
  rutas: RutaDestino[];
  editable: boolean;
}) {
  const router = useRouter();
  const [elegidas, setElegidas] = useState<Set<string>>(new Set(paradas.map((p) => p.id)));
  const [destino, setDestino] = useState<string>(rutas[0]?.id ?? "nueva");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bultos = paradas
    .filter((p) => elegidas.has(p.id))
    .reduce((a, p) => a + p.bultos, 0);

  function alternar(id: string) {
    setElegidas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  async function mover() {
    if (!elegidas.size) return;
    setOcupado(true);
    setError(null);
    try {
      await moverParadas(despachoId, [...elegidas], destino);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Tarjeta className="overflow-hidden border-warn/40">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-warn-bg px-4 py-2.5">
        <h3 className="text-[13.5px] font-bold text-warn">
          {paradas.length} punto{paradas.length === 1 ? "" : "s"} sin asignar
        </h3>
        <span className="text-[12px] text-ink-2">
          No entraron en ninguna ruta. Están guardados, pero nadie los va a repartir.
        </span>
      </div>

      <div className="max-h-[220px] overflow-y-auto">
        {paradas.map((p) => (
          <label
            key={p.id}
            className="flex cursor-pointer items-center gap-2.5 border-b border-line px-4 py-2 last:border-0 hover:bg-canvas"
          >
            <input
              type="checkbox"
              checked={elegidas.has(p.id)}
              onChange={() => alternar(p.id)}
              disabled={!editable}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">
                {p.nombre ?? p.codigo}
              </span>
              <span className="num block text-[11.5px] text-ink-3">
                {p.codigo}
                {p.distrito ? ` · ${p.distrito}` : ""}
              </span>
            </span>
            <span className="num shrink-0 text-[12px] text-ink-2">{p.bultos} blt</span>
          </label>
        ))}
      </div>

      {editable ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2 px-4 py-2.5">
          <span className="text-[12px] text-ink-2">
            <b className="num">{elegidas.size}</b> elegido(s) ·{" "}
            <b className="num">{bultos}</b> bultos →
          </span>
          <select
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            className="rounded-[8px] border border-line-strong bg-surface px-2 py-1.5 text-[12.5px]"
          >
            {rutas.map((r) => (
              <option key={r.id} value={r.id}>
                R-{String(r.indice + 1).padStart(2, "0")} · {r.paradas} paradas · {r.bultos} blt
              </option>
            ))}
            <option value="nueva">➕ Una ruta nueva</option>
          </select>
          <button
            onClick={mover}
            disabled={ocupado || !elegidas.size}
            className="rounded-[9px] border border-amber-600 bg-amber px-3.5 py-1.5 text-[12.5px] font-semibold text-navy-900 transition hover:bg-amber-600 hover:text-white disabled:opacity-50"
          >
            {ocupado ? "Moviendo…" : "Asignar"}
          </button>
        </div>
      ) : (
        <p className="border-t border-line px-4 py-2.5 text-[12px] text-ink-2">
          Este despacho ya salió a reparto: sus paradas no se pueden mover.
        </p>
      )}

      {error && (
        <p className="border-t border-line bg-bad-bg px-4 py-2 text-[12.5px] text-bad">{error}</p>
      )}

      <p className="border-t border-line px-4 py-2 text-[11px] text-ink-3">
        Al mover, la parada se añade al final de la ruta elegida y su trazado
        queda sin dibujar. Para recalcular el recorrido, abre el despacho en el
        planificador.
      </p>
    </Tarjeta>
  );
}
