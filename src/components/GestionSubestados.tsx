"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  borrarSubestado,
  guardarSubestado,
  type Subestado,
} from "@/app/acciones/datos";
import { Pastilla, Tarjeta } from "@/components/ui";

/** Los estados que admiten motivo, y cómo se llaman de cara al conductor. */
const ESTADOS = [
  { clave: "fallido", texto: "No entregado", tono: "bad" as const,
    ayuda: "Por qué no se pudo entregar. Es el que más falta hace." },
  { clave: "parcial", texto: "Entrega parcial", tono: "warn" as const,
    ayuda: "Por qué faltó parte del pedido." },
  { clave: "reprogramado", texto: "Reprogramado", tono: "warn" as const,
    ayuda: "Por qué se mueve a otro día." },
  { clave: "entregado", texto: "Entregado", tono: "ok" as const,
    ayuda: "Matices de una entrega conforme, si los necesitas." },
];

export default function GestionSubestados({ lista }: { lista: Subestado[] }) {
  const router = useRouter();
  const [nuevo, setNuevo] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function agregar(estado: string) {
    const texto = (nuevo[estado] ?? "").trim();
    if (!texto) return;
    setOcupado(`${estado}-nuevo`);
    setError(null);
    try {
      await guardarSubestado({ estado, texto, orden: lista.filter((s) => s.estado === estado).length });
      setNuevo((n) => ({ ...n, [estado]: "" }));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  async function quitar(s: Subestado) {
    setOcupado(String(s.id));
    setError(null);
    try {
      await borrarSubestado(s.id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  async function reactivar(s: Subestado) {
    setOcupado(String(s.id));
    try {
      await guardarSubestado({ id: s.id, estado: s.estado, texto: s.texto, activo: true });
      router.refresh();
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="space-y-3 p-3">
      <p className="text-[12.5px] text-ink-2">
        Los motivos que el conductor elige de una lista en vez de escribirlos.
        El campo libre sigue existiendo para lo que no quepa en ninguno, pero
        sin lista no se puede contar cuántas entregas fallaron por{" "}
        <i>local cerrado</i>: cada conductor lo escribe distinto y no hay forma
        de sumarlos.
      </p>

      {error && (
        <p className="rounded-[10px] border border-bad/30 bg-bad-bg px-3 py-2 text-[12.5px] text-bad">
          {error}
        </p>
      )}

      <div className="grid gap-3 @3xl:grid-cols-2">
        {ESTADOS.map((e) => {
          const suyos = lista.filter((s) => s.estado === e.clave);
          return (
            <Tarjeta key={e.clave} className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-line px-3.5 py-2">
                <Pastilla tono={e.tono}>{e.texto}</Pastilla>
                <span className="num text-[12px] text-ink-3">
                  {suyos.filter((s) => s.activo).length}
                </span>
              </div>
              <p className="px-3.5 pt-2 text-[11.5px] text-ink-3">{e.ayuda}</p>

              <ul className="mt-1 divide-y divide-line">
                {suyos.map((s) => (
                  <li
                    key={s.id}
                    className={`flex items-center gap-2 px-3.5 py-1.5 text-[12.5px] ${
                      s.activo ? "" : "opacity-55"
                    }`}
                  >
                    <span className={s.activo ? "text-ink-2" : "text-ink-3 line-through"}>
                      {s.texto}
                    </span>
                    <button
                      onClick={() => (s.activo ? quitar(s) : reactivar(s))}
                      disabled={ocupado === String(s.id)}
                      className="ml-auto text-[11.5px] text-ink-3 transition hover:text-bad disabled:opacity-50"
                    >
                      {ocupado === String(s.id) ? "…" : s.activo ? "Retirar" : "Reactivar"}
                    </button>
                  </li>
                ))}
              </ul>

              <form
                onSubmit={(ev) => { ev.preventDefault(); void agregar(e.clave); }}
                className="flex gap-1.5 border-t border-line px-3.5 py-2"
              >
                <input
                  value={nuevo[e.clave] ?? ""}
                  onChange={(ev) => setNuevo((n) => ({ ...n, [e.clave]: ev.target.value }))}
                  maxLength={80}
                  placeholder={
                    e.clave === "fallido"
                      ? "Local cerrado, nadie atiende"
                      : "Escribe un motivo"
                  }
                  className="min-w-0 flex-1 rounded-[8px] border border-line-strong bg-surface px-2.5 py-1 text-[12.5px]"
                />
                <button
                  type="submit"
                  disabled={ocupado === `${e.clave}-nuevo` || !(nuevo[e.clave] ?? "").trim()}
                  className="rounded-[8px] border border-amber-600 bg-amber px-2.5 py-1 text-[12px] font-semibold text-navy-900 transition hover:bg-amber-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Añadir
                </button>
              </form>
            </Tarjeta>
          );
        })}
      </div>

      <p className="text-[11.5px] text-ink-3">
        Retirar un motivo no lo borra: lo deja de ofrecer. Las paradas ya
        marcadas con él lo siguen nombrando, y un informe del mes pasado
        seguiría cuadrando.
      </p>
    </div>
  );
}
