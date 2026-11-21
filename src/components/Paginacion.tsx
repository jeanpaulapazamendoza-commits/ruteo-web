"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Lo que comparten las pantallas de tabla y solo vive en el navegador: la
 * paginación, el contador y las acciones que suben a la cabecera.
 *
 * Va aparte de `ui.tsx` porque aquello lo usan también las páginas de
 * servidor, y esto tiene estado.
 */

/** Parte una lista en páginas. Vuelve a la primera cuando la lista cambia. */
export function usePaginas<T>(filas: T[], porPagina = 15) {
  const [pagina, setPagina] = useState(1);
  const total = Math.max(1, Math.ceil(filas.length / porPagina));

  // Al filtrar, la página 7 de la lista vieja puede no existir en la nueva.
  const actual = Math.min(pagina, total);

  const visibles = useMemo(
    () => filas.slice((actual - 1) * porPagina, actual * porPagina),
    [filas, actual, porPagina],
  );

  return { pagina: actual, setPagina, total, visibles };
}

/**
 * La paginación de la referencia: números a la derecha, el actual en un
 * círculo azul, y puntos suspensivos cuando hay más páginas de las que caben.
 */
export function Paginacion({
  pagina,
  total,
  onCambio,
}: {
  pagina: number;
  total: number;
  onCambio: (p: number) => void;
}) {
  if (total <= 1) return null;

  const numeros: (number | "…")[] = [];
  if (total <= 7) {
    for (let i = 1; i <= total; i++) numeros.push(i);
  } else {
    const desde = Math.max(2, Math.min(pagina - 2, total - 5));
    const hasta = Math.min(total - 1, desde + 4);
    numeros.push(1);
    if (desde > 2) numeros.push("…");
    for (let i = desde; i <= hasta; i++) numeros.push(i);
    if (hasta < total - 1) numeros.push("…");
    numeros.push(total);
  }

  const paso = "grid h-[22px] min-w-[22px] place-items-center rounded-full px-1 text-[14px] transition";

  return (
    <div className="flex h-[43px] items-center justify-end gap-2.5 px-6">
      <button
        onClick={() => onCambio(pagina - 1)}
        disabled={pagina === 1}
        aria-label="Página anterior"
        className={`${paso} text-ink-3 hover:text-amber disabled:opacity-30`}
      >
        ‹
      </button>
      {numeros.map((n, i) =>
        n === "…" ? (
          <span key={`p${i}`} className="text-[14px] text-amber">
            …
          </span>
        ) : (
          <button
            key={n}
            onClick={() => onCambio(n)}
            aria-current={n === pagina ? "page" : undefined}
            className={`${paso} num ${
              n === pagina ? "bg-amber font-bold text-white" : "text-amber hover:bg-amber-050"
            }`}
          >
            {n}
          </button>
        ),
      )}
      <button
        onClick={() => onCambio(pagina + 1)}
        disabled={pagina === total}
        aria-label="Página siguiente"
        className={`${paso} text-ink-3 hover:text-amber disabled:opacity-30`}
      >
        ›
      </button>
    </div>
  );
}

/**
 * El contador sobre la tabla: «1333 órdenes» a la izquierda y, a la derecha,
 * lo que la pantalla quiera poner —normalmente el selector de columnas—.
 */
export function Contador({
  n,
  texto,
  children,
}: {
  n: number;
  /** El nombre de lo contado, en plural: «órdenes», «clientes». */
  texto: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-[32px] flex-wrap items-center gap-2 pb-3 pt-1">
      <span className="text-[16px] text-ink-2">
        <strong className="num font-bold">{n.toLocaleString("es-PE")}</strong> {texto}
      </span>
      {children && <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/**
 * Sube botones a la cabecera de la página.
 *
 * El título lo pinta la página, en el servidor, y los botones que actúan
 * sobre la tabla —exportar lo que se está viendo— viven en el panel, en el
 * navegador. En la referencia van juntos, arriba a la derecha; esto los lleva
 * allí sin convertir cada página en un componente de cliente.
 */
export function AccionesPagina({ children }: { children: ReactNode }) {
  const [destino, setDestino] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDestino(document.getElementById("acciones-pagina"));
  }, []);

  return destino ? createPortal(children, destino) : null;
}

/** Botón en píldora azul: la acción principal de la pantalla. */
export const BOTON_PRIMARIO =
  "inline-flex h-8 items-center gap-1.5 rounded-full bg-amber px-3 text-[14px] font-bold text-white transition hover:bg-amber-600 disabled:opacity-50";

/** Botón en píldora blanca con borde: las acciones secundarias. */
export const BOTON_SECUNDARIO =
  "inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-[14px] font-bold text-ink transition hover:bg-canvas disabled:opacity-50";
