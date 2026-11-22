"use client";

import { useEffect, useState } from "react";
import { subestados as traerSubestados } from "@/app/acciones/datos";
import { marcarParada, type EstadoEntrega } from "@/lib/entregas";

/** Lo que hace falta saber de una orden para cambiarle el estado. */
export type ParadaEstado = {
  id: string;
  estado_entrega: string;
  bultos: number;
  bultos_entregados: number | null;
  recibe?: string | null;
};

const ESTADO: Record<string, { texto: string }> = {
  entregado: { texto: "Entregado" },
  parcial: { texto: "Entrega parcial" },
  reprogramado: { texto: "Reprogramado" },
  fallido: { texto: "No entregado" },
};

const ELEGIBLES: EstadoEntrega[] = ["entregado", "parcial", "fallido", "reprogramado"];

/**
 * Cambiar el estado desde la oficina.
 *
 * Pasa por la misma función que usa el conductor: así queda en el historial
 * con quién lo hizo, y valen las mismas reglas —un fallo necesita motivo, una
 * entrega parcial necesita cuántos bultos—.
 */
export default function ModalEstado({
  parada: p,
  onCerrar,
  onHecho,
}: {
  parada: ParadaEstado;
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const [estado, setEstado] = useState<EstadoEntrega>(
    ELEGIBLES.includes(p.estado_entrega as EstadoEntrega) ? (p.estado_entrega as EstadoEntrega) : "entregado",
  );
  const [motivos, setMotivos] = useState<string[]>([]);
  const [subestado, setSubestado] = useState("");
  const [motivo, setMotivo] = useState("");
  const [bultos, setBultos] = useState(String(p.bultos_entregados ?? p.bultos));
  const [recibe, setRecibe] = useState(p.recibe ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    traerSubestados()
      .then((todos) => {
        if (vigente) setMotivos(todos.filter((s) => s.estado === estado).map((s) => s.texto));
      })
      .catch(() => { if (vigente) setMotivos([]); });
    return () => { vigente = false; };
  }, [estado]);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await marcarParada({
        parada_id: p.id,
        estado,
        subestado: subestado || null,
        motivo: motivo.trim() || subestado || null,
        bultos_entregados: estado === "parcial" ? Number(bultos) : null,
        recibe: recibe.trim() || null,
      });
      onHecho();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGuardando(false);
    }
  }

  const entrada =
    "h-10 w-full rounded-[4px] border border-line bg-surface px-3 text-[14px] text-ink outline-none focus:border-amber";

  return (
    <>
      <button aria-label="Cerrar" onClick={onCerrar} className="fixed inset-0 z-40 cursor-default bg-navy-900/40" />
      <div className="fixed left-1/2 top-1/2 z-50 w-[460px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-[8px] bg-surface p-6 shadow-2xl">
        <div className="flex items-center pb-4">
          <b className="text-[18px] text-ink">Modificar estado</b>
          <button onClick={onCerrar} aria-label="Cerrar" className="ml-auto text-[16px] text-ink-2 hover:text-ink">
            ✕
          </button>
        </div>

        <div className="space-y-3 text-[13px] text-ink-2">
          <label className="block">
            Estado
            <select value={estado} onChange={(e) => { setEstado(e.target.value as EstadoEntrega); setSubestado(""); }} className={`mt-1 ${entrada}`}>
              {ELEGIBLES.map((k) => (
                <option key={k} value={k}>{ESTADO[k].texto}</option>
              ))}
            </select>
          </label>

          {motivos.length > 0 && (
            <label className="block">
              Subestado
              <select value={subestado} onChange={(e) => setSubestado(e.target.value)} className={`mt-1 ${entrada}`}>
                <option value=""></option>
                {motivos.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
          )}

          {estado === "parcial" && (
            <label className="block">
              Bultos entregados, de {p.bultos}
              <input
                type="number"
                min={0}
                max={p.bultos}
                value={bultos}
                onChange={(e) => setBultos(e.target.value)}
                className={`num mt-1 ${entrada}`}
              />
            </label>
          )}

          {(estado === "entregado" || estado === "parcial") && (
            <label className="block">
              Quién recibió
              <input value={recibe} onChange={(e) => setRecibe(e.target.value)} className={`mt-1 ${entrada}`} />
            </label>
          )}

          {estado !== "entregado" && (
            <label className="block">
              {estado === "fallido" ? "Motivo" : "Detalle"}
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={subestado ? "Opcional: lo que no cabe en el subestado" : ""}
                className={`mt-1 ${entrada}`}
              />
            </label>
          )}
        </div>

        {error && <p className="pt-3 text-[13px] text-bad">{error}</p>}

        <div className="flex justify-end gap-2 pt-5">
          <button
            onClick={onCerrar}
            className="h-10 rounded-full border border-line-strong bg-surface px-6 text-[14px] font-bold text-ink transition hover:bg-surface-2"
          >
            Cancelar
          </button>
          <button
            onClick={() => void guardar()}
            disabled={guardando}
            className="h-10 rounded-full bg-amber px-6 text-[14px] font-bold text-white transition hover:bg-amber-600 disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </>
  );
}
