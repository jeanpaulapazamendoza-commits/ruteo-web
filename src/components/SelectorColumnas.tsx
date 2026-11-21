"use client";

import { useEffect, useState } from "react";

/**
 * Qué columnas se ven en una tabla, elegidas por quien mira.
 *
 * Una tabla de catorce columnas no cabe en ningún portátil, y recortarla a
 * ocho por decreto deja fuera justo la que uno necesita ese día. Esto deja
 * elegir y lo recuerda por navegador, igual que el sistema de referencia.
 *
 * Devuelve siempre al menos una columna: una tabla sin columnas no es una
 * tabla, y es muy fácil desmarcarlas todas sin querer.
 */
export type Columna<T> = {
  clave: string;
  texto: string;
  /** Si es false, no se puede quitar: sin ella la fila no se identifica. */
  opcional?: boolean;
  /** Cómo se pinta en pantalla. */
  pinta: (fila: T) => React.ReactNode;
  /** Cómo se escribe al exportar. Si falta, se exporta lo que se pinta. */
  exporta?: (fila: T) => string | number | null;
  alineacion?: "izquierda" | "derecha";
};

export function useColumnas<T>(clave: string, columnas: Columna<T>[]) {
  const fijas = columnas.filter((c) => !c.opcional).map((c) => c.clave);
  const [elegidas, setElegidas] = useState<string[]>(columnas.map((c) => c.clave));

  useEffect(() => {
    try {
      const g = localStorage.getItem(`columnas:${clave}`);
      const l = g ? (JSON.parse(g) as string[]) : null;
      if (Array.isArray(l) && l.length) {
        // Las que no se pueden quitar vuelven solas aunque el guardado sea
        // de una versión anterior de la tabla.
        const validas = l.filter((k) => columnas.some((c) => c.clave === k));
        setElegidas([...new Set([...fijas, ...validas])]);
      }
    } catch {
      /* almacenamiento bloqueado: se ven todas */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  function alternar(k: string) {
    setElegidas((prev) => {
      if (fijas.includes(k)) return prev;
      const nuevo = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k];
      const final = nuevo.length ? nuevo : prev;
      try {
        localStorage.setItem(`columnas:${clave}`, JSON.stringify(final));
      } catch {
        /* vale solo para esta sesión */
      }
      return final;
    });
  }

  // Se respeta el orden de declaración, no el de marcado: así la tabla no
  // baila cada vez que se vuelve a añadir una columna.
  const visibles = columnas.filter((c) => elegidas.includes(c.clave));
  return { visibles, elegidas, alternar, fijas };
}

export default function SelectorColumnas<T>({
  columnas,
  elegidas,
  alternar,
  fijas,
}: {
  columnas: Columna<T>[];
  elegidas: string[];
  alternar: (k: string) => void;
  fijas: string[];
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="rounded-full border border-line-strong bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-ink-2 transition hover:bg-canvas"
      >
        Columnas{" "}
        <span className="num">
          {elegidas.length}/{columnas.length}
        </span>
      </button>

      {abierto && (
        <>
          <button
            aria-label="Cerrar"
            onClick={() => setAbierto(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-0 top-full z-20 mt-1 max-h-[60vh] w-[220px] overflow-y-auto rounded-[10px] border border-line bg-surface shadow-lg">
            {columnas.map((c) => {
              const fija = fijas.includes(c.clave);
              return (
                <label
                  key={c.clave}
                  title={fija ? "Esta columna no se puede quitar" : ""}
                  className={`flex items-center gap-2 px-3 py-1.5 text-[12.5px] transition ${
                    fija ? "text-ink-3" : "cursor-pointer text-ink-2 hover:bg-canvas"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={elegidas.includes(c.clave)}
                    disabled={fija}
                    onChange={() => alternar(c.clave)}
                  />
                  {c.texto}
                </label>
              );
            })}
            <p className="border-t border-line px-3 py-2 text-[11px] text-ink-3">
              Tu elección se recuerda en este navegador.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
