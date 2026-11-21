"use client";

import { useEffect, useState } from "react";

/**
 * La tira de números que encabeza cada módulo.
 *
 * Es lo primero que se mira al entrar y lo que se vigila de reojo el resto
 * del día, así que va fija arriba, en una sola línea, con el mismo formato
 * en todas las pantallas: el planificador aprende a leerla una vez.
 *
 * Un indicador con denominador se cuenta además en porcentaje, porque «15
 * fallidas» no dice nada sin saber de cuántas.
 */
export type Indicador = {
  clave: string;
  texto: string;
  ayuda: string;
  n: number;
  /** Si lo hay, se pinta «n/de» y su porcentaje. */
  de?: number;
  /** Color del número cuando conviene que salte a la vista. */
  tono?: "ok" | "bad" | "warn" | "live";
};

const TINTA: Record<string, string> = {
  ok: "text-ok",
  bad: "text-bad",
  warn: "text-warn",
  live: "text-live",
};

export default function TiraIndicadores({
  items,
  clave,
  porDefecto,
  derecha,
}: {
  items: Indicador[];
  /**
   * Si se pasa, aparece el selector y la elección se recuerda con esta clave.
   * Sin ella se muestran todos: una pantalla de un solo despacho no necesita
   * que nadie elija.
   */
  clave?: string;
  porDefecto?: string[];
  /** Controles del módulo, alineados a la derecha de la misma línea. */
  derecha?: React.ReactNode;
}) {
  const [elegidos, setElegidos] = useState<string[] | null>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!clave) return;
    try {
      const g = localStorage.getItem(`indicadores:${clave}`);
      const l = g ? (JSON.parse(g) as string[]) : null;
      setElegidos(Array.isArray(l) && l.length ? l : (porDefecto ?? null));
    } catch {
      setElegidos(porDefecto ?? null);
    }
    // `porDefecto` es un literal nuevo en cada render; solo importa la clave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  function alternar(k: string) {
    setElegidos((prev) => {
      const base = prev ?? porDefecto ?? items.map((i) => i.clave);
      const nuevo = base.includes(k) ? base.filter((x) => x !== k) : [...base, k];
      try {
        localStorage.setItem(`indicadores:${clave}`, JSON.stringify(nuevo));
      } catch {
        /* almacenamiento bloqueado: vale solo para esta sesión */
      }
      return nuevo;
    });
  }

  const activos = clave
    ? items.filter((i) => (elegidos ?? porDefecto ?? items.map((x) => x.clave)).includes(i.clave))
    : items;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-surface px-4 py-2">
      {activos.map((i) => {
        const pct = i.de ? Math.round((i.n / i.de) * 1000) / 10 : null;
        return (
          <div key={i.clave} title={i.ayuda}>
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
              {i.texto}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span
                className={`num text-[18px] font-extrabold leading-none tracking-tight ${
                  i.tono ? TINTA[i.tono] : ""
                }`}
              >
                {i.n.toLocaleString("es-PE")}
                {i.de != null && (
                  <span className="text-[12px] font-bold text-ink-3">
                    /{i.de.toLocaleString("es-PE")}
                  </span>
                )}
              </span>
              {pct != null && (
                <span className="num text-[11.5px] font-semibold text-ink-2">{pct}%</span>
              )}
            </div>
          </div>
        );
      })}

      <div className="ml-auto flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
        {derecha}
        {clave && (
          <div className="relative">
            <button
              onClick={() => setAbierto((v) => !v)}
              className="rounded-full border border-line-strong bg-surface px-2.5 py-1 font-semibold text-ink-2 transition hover:bg-canvas"
            >
              Indicadores{" "}
              <span className="num">
                {activos.length}/{items.length}
              </span>
            </button>
            {abierto && (
              <>
                <button
                  aria-label="Cerrar"
                  onClick={() => setAbierto(false)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div className="absolute right-0 top-full z-20 mt-1 w-[232px] overflow-hidden rounded-[10px] border border-line bg-surface shadow-lg">
                  {items.map((i) => (
                    <label
                      key={i.clave}
                      className="flex cursor-pointer items-start gap-2 px-3 py-2 text-[12.5px] transition hover:bg-canvas"
                    >
                      <input
                        type="checkbox"
                        checked={activos.some((a) => a.clave === i.clave)}
                        onChange={() => alternar(i.clave)}
                        className="mt-0.5"
                      />
                      <span>
                        <b className="text-ink">{i.texto}</b>
                        <span className="block text-[11px] text-ink-3">{i.ayuda}</span>
                      </span>
                    </label>
                  ))}
                  <p className="border-t border-line px-3 py-2 text-[11px] text-ink-3">
                    Tu elección se recuerda en este navegador.
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
