"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanFila } from "@/app/acciones/planes";
import { restaurarPlan } from "@/lib/despachos";
import { fechaHora } from "@/lib/horas";

const n = (v: number | undefined, dec = 0) =>
  v == null ? "—" : v.toLocaleString("es-PE", { maximumFractionDigits: dec, minimumFractionDigits: dec });

/** Diferencia contra el plan actual: verde si mejora, rojo si empeora. */
function Delta({ valor, actual, dec = 1 }: { valor?: number; actual?: number; dec?: number }) {
  if (valor == null || actual == null) return null;
  const d = valor - actual;
  if (Math.abs(d) < 0.05) return null;
  return (
    <span className={`num ml-1 text-[11px] ${d < 0 ? "text-ok" : "text-bad"}`}>
      {d > 0 ? "+" : "−"}
      {n(Math.abs(d), dec)}
    </span>
  );
}

/**
 * Los planes que ha tenido este despacho.
 *
 * Volver a rutear reemplazaba las rutas y el plan anterior se perdía: no
 * había forma de saber si el nuevo era mejor, ni de volver atrás. Aquí están
 * los diez últimos, con sus cifras al lado de las del plan actual, y cada
 * uno se puede volver a poner mientras el despacho no haya salido a reparto.
 */
export default function HistorialPlanes({
  planes,
  restaurable,
}: {
  planes: PlanFila[];
  /** El despacho aún no salió a reparto: se puede volver a un plan anterior. */
  restaurable: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!planes.length) return null;
  const actual = planes[0];

  async function restaurar(p: PlanFila) {
    const ok = window.confirm(
      `¿Volver al plan #${p.id}, del ${fechaHora(p.creado_en)}?\n\n` +
        "Las rutas actuales se reemplazan por las de ese plan y se pierde la " +
        "asignación de conductores. El plan actual sigue en el historial.",
    );
    if (!ok) return;
    setOcupado(p.id);
    setError(null);
    try {
      await restaurarPlan(p.id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <details className="border-b border-line bg-surface px-5 py-2.5">
      <summary className="cursor-pointer text-[12.5px] font-semibold text-ink-2">
        Historial de planes ({planes.length})
      </summary>

      <div className="mt-2.5 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-[12.5px]">
          <thead className="text-[11.5px] text-ink-3">
            <tr>
              <th className="py-1.5 pr-3 font-semibold">Plan</th>
              <th className="py-1.5 pr-3 font-semibold">Guardado</th>
              <th className="py-1.5 pr-3 font-semibold">Cómo</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Rutas</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Paradas</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Sin asignar</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Km</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Horas</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Costo</th>
              <th className="py-1.5" />
            </tr>
          </thead>
          <tbody>
            {planes.map((p) => {
              const es = p.id === actual.id;
              const r = p.resumen ?? {};
              const a = actual.resumen ?? {};
              return (
                <tr key={p.id} className="border-t border-line">
                  <td className="num py-1.5 pr-3 font-semibold">
                    #{p.id}
                    {es && (
                      <span className="ml-1.5 rounded-full bg-ok-bg px-1.5 py-0.5 text-[10.5px] font-bold text-ok">
                        Actual
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3">
                    <span className="num">{fechaHora(p.creado_en)}</span>
                    {p.autor && <span className="text-ink-3"> · {p.autor}</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-ink-2">
                    {p.restaurado_de ? `Vuelta al #${p.restaurado_de}` : (p.metodo ?? "—")}
                  </td>
                  <td className="num py-1.5 pr-3 text-right">
                    {n(r.rutas)}
                    {!es && <Delta valor={r.rutas} actual={a.rutas} dec={0} />}
                  </td>
                  <td className="num py-1.5 pr-3 text-right">{n(r.paradas)}</td>
                  <td className={`num py-1.5 pr-3 text-right ${r.sin_asignar ? "font-semibold text-warn" : ""}`}>
                    {n(r.sin_asignar ?? 0)}
                  </td>
                  <td className="num py-1.5 pr-3 text-right">
                    {n(r.km, 1)}
                    {!es && <Delta valor={r.km} actual={a.km} />}
                  </td>
                  <td className="num py-1.5 pr-3 text-right">
                    {r.duracion_min != null ? n(r.duracion_min / 60, 1) : "—"}
                    {!es && (
                      <Delta
                        valor={r.duracion_min != null ? r.duracion_min / 60 : undefined}
                        actual={a.duracion_min != null ? a.duracion_min / 60 : undefined}
                      />
                    )}
                  </td>
                  <td className="num py-1.5 pr-3 text-right">
                    {r.costo ? `S/ ${n(r.costo, 2)}` : "—"}
                  </td>
                  <td className="py-1.5 text-right">
                    {!es && restaurable && (
                      <button
                        onClick={() => restaurar(p)}
                        disabled={ocupado !== null}
                        className="rounded-full border border-line-strong bg-surface px-3 py-1 text-[12px] font-semibold transition hover:bg-canvas disabled:opacity-50"
                      >
                        {ocupado === p.id ? "Restaurando…" : "Restaurar"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-ink-3">
        Las diferencias son contra el plan actual: verde es menos, rojo es más. Se guardan los
        diez últimos.{" "}
        {restaurable
          ? ""
          : "Este despacho ya salió a reparto: los planes anteriores quedan solo para consulta."}
      </p>

      {error && <p className="mt-2 rounded-[8px] bg-bad-bg px-3 py-2 text-[12.5px] text-bad">{error}</p>}
    </details>
  );
}
