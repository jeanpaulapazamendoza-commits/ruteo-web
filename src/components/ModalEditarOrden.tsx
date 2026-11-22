"use client";

import { useEffect, useState } from "react";
import { editarParada, fichaParada } from "@/app/acciones/datos";

const ENTRADA =
  "h-10 w-full rounded-[4px] border border-line bg-surface px-3 text-[14px] text-ink outline-none focus:border-amber";

/**
 * Editar los datos de una orden que todavía no se ha gestionado.
 *
 * Lo que se puede cambiar es lo que afecta al reparto de hoy: a quién se
 * entrega, cuántos bultos, si es prioritaria y en qué horario. Las
 * coordenadas no: mover el punto es otra orden, y cambiaría el recorrido.
 *
 * Los valores se leen de la base al abrir, no de la fila de la tabla: la
 * tabla no trae la ventana horaria ni la prioridad, y puede tener minutos.
 */
export default function ModalEditarOrden({
  paradaId,
  onCerrar,
  onHecho,
}: {
  paradaId: string;
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const [cargado, setCargado] = useState(false);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [distrito, setDistrito] = useState("");
  const [bultos, setBultos] = useState("1");
  const [prioritaria, setPrioritaria] = useState(false);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fichaParada(paradaId)
      .then((f) => {
        if (!vivo) return;
        if (!f) { setError("Esa orden ya no existe."); return; }
        setCodigo(f.codigo);
        setNombre(f.nombre ?? "");
        setDistrito(f.distrito ?? "");
        setBultos(String(f.bultos));
        setPrioritaria(f.prioridad > 0);
        setDesde(f.ventana_ini ? f.ventana_ini.slice(0, 5) : "");
        setHasta(f.ventana_fin ? f.ventana_fin.slice(0, 5) : "");
        setCargado(true);
      })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : String(e)));
    return () => { vivo = false; };
  }, [paradaId]);

  const ventanaMal = Boolean(desde) !== Boolean(hasta) || Boolean(desde && hasta && hasta <= desde);
  const lista = cargado && nombre.trim() !== "" && !ventanaMal && Number(bultos) >= 0;

  async function guardar() {
    if (!lista) return;
    setGuardando(true);
    setError(null);
    try {
      await editarParada({
        parada_id: paradaId,
        nombre: nombre.trim(),
        distrito: distrito.trim() || null,
        bultos: Math.max(0, Math.round(Number(bultos) || 0)),
        prioridad: prioritaria ? 1 : 0,
        ventana_ini: desde || null,
        ventana_fin: hasta || null,
      });
      onHecho();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGuardando(false);
    }
  }

  return (
    <>
      <button aria-label="Cerrar" onClick={onCerrar} className="fixed inset-0 z-40 cursor-default bg-navy-900/40" />
      <div className="fixed left-1/2 top-1/2 z-50 w-[460px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-[8px] bg-surface p-6 shadow-2xl">
        <div className="flex items-center pb-4">
          <b className="text-[18px] text-ink">
            Editar información{codigo ? <span className="num font-normal text-ink-3"> · {codigo}</span> : null}
          </b>
          <button onClick={onCerrar} aria-label="Cerrar" className="ml-auto text-[16px] text-ink-2 hover:text-ink">
            ✕
          </button>
        </div>

        {!cargado && !error ? (
          <p className="py-6 text-[14px] text-ink-3">Cargando…</p>
        ) : (
          <div className="space-y-3 text-[13px] text-ink-2">
            <label className="block">
              Nombre
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={`mt-1 ${ENTRADA}`} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                Distrito
                <input value={distrito} onChange={(e) => setDistrito(e.target.value)} className={`mt-1 ${ENTRADA}`} />
              </label>
              <label className="block">
                Bultos
                <input
                  type="number" min={0} value={bultos}
                  onChange={(e) => setBultos(e.target.value)}
                  className={`num mt-1 ${ENTRADA}`}
                />
              </label>
            </div>
            <div className="block">
              <span className="flex justify-between">
                Ventana horaria
                {ventanaMal && <span className="text-bad">Pon las dos horas, y la segunda después</span>}
              </span>
              <span className="mt-1 flex items-center gap-2">
                <input type="time" value={desde} onChange={(e) => setDesde(e.target.value)} className={`num ${ENTRADA}`} />
                <span className="text-ink-3">–</span>
                <input type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} className={`num ${ENTRADA}`} />
              </span>
            </div>
            <label className="flex items-center gap-2 pt-1 text-[14px] text-ink">
              <input type="checkbox" checked={prioritaria} onChange={(e) => setPrioritaria(e.target.checked)} />
              Es prioritaria
            </label>
          </div>
        )}

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
            disabled={!lista || guardando}
            className="h-10 rounded-full bg-amber px-6 text-[14px] font-bold text-white transition hover:bg-amber-600 disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </>
  );
}
