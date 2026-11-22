"use client";

import { useMemo, useState, type ReactNode } from "react";

/**
 * La selección de filas de una tabla.
 *
 * En la referencia cada fila de Rutas y de Órdenes lleva su casilla, y con
 * varias marcadas se hace de una vez lo que el menú de la fila hace de una en
 * una: cerrar, imprimir etiquetas, eliminar.
 *
 * Solo cuenta lo que sigue en la lista: si un filtro saca una fila marcada,
 * deja de estar seleccionada. Actuar sobre algo que ya no se ve es la forma
 * más fácil de borrar lo que no se quería.
 */
export function useSeleccion<T extends { id: string }>(lista: T[]) {
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());

  const elegidas = useMemo(() => lista.filter((f) => marcadas.has(f.id)), [lista, marcadas]);

  return {
    elegidas,
    tiene: (id: string) => marcadas.has(id),
    alternar: (id: string) =>
      setMarcadas((prev) => {
        const s = new Set(prev);
        if (s.has(id)) s.delete(id);
        else s.add(id);
        return s;
      }),
    /** Marca o desmarca un grupo de filas: las de la página que se ve. */
    marcar: (ids: string[], si: boolean) =>
      setMarcadas((prev) => {
        const s = new Set(prev);
        for (const id of ids) {
          if (si) s.add(id);
          else s.delete(id);
        }
        return s;
      }),
    limpiar: () => setMarcadas(new Set()),
  };
}

export function Casilla({
  marcada,
  parcial = false,
  onCambio,
  rotulo,
}: {
  marcada: boolean;
  /** Algunas sí y otras no: la casilla de la cabecera a medias. */
  parcial?: boolean;
  onCambio: (si: boolean) => void;
  rotulo: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={rotulo}
      checked={marcada}
      ref={(el) => {
        if (el) el.indeterminate = parcial && !marcada;
      }}
      onChange={(e) => onCambio(e.target.checked)}
      className="h-4 w-4 cursor-pointer align-middle accent-[var(--color-amber)]"
    />
  );
}

/** Lo que se puede hacer con lo marcado. Solo aparece si hay algo marcado. */
export function BarraSeleccion({
  n,
  texto,
  onLimpiar,
  children,
}: {
  n: number;
  /** «rutas», «órdenes». */
  texto: string;
  onLimpiar: () => void;
  children: ReactNode;
}) {
  if (!n) return null;
  return (
    <div
      role="region"
      aria-label="Acciones sobre la selección"
      className="mb-3 flex flex-wrap items-center gap-2 rounded-[8px] border border-amber/40 bg-amber-050 px-3 py-2"
    >
      <b className="mr-1 text-[13.5px] text-ink">
        <span className="num">{n}</span> {texto}
      </b>
      {children}
      <button
        onClick={onLimpiar}
        className="ml-auto h-8 rounded-full px-3 text-[13px] font-bold text-ink-2 transition hover:bg-surface"
      >
        Quitar selección
      </button>
    </div>
  );
}

/** Botón de la barra de selección. */
export const BOTON_LOTE =
  "inline-flex h-8 items-center rounded-full border border-line-strong bg-surface px-3 text-[13px] font-bold text-ink transition hover:bg-canvas disabled:opacity-50";
export const BOTON_LOTE_PELIGRO =
  "inline-flex h-8 items-center rounded-full border border-bad/40 bg-surface px-3 text-[13px] font-bold text-bad transition hover:bg-bad-bg disabled:opacity-50";
