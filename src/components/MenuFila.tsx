"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export type AccionFila = {
  texto: string;
  /** Un enlace, o… */
  href?: string;
  /** …una acción. */
  onClick?: () => void;
  /** Borrar y parecidos: va en rojo y separada de las demás. */
  peligro?: boolean;
  /** Por qué no se puede ahora. Deja la acción a la vista, apagada. */
  noPorque?: string | null;
};

/**
 * El menú de tres puntos de una fila.
 *
 * En la referencia cada fila de Rutas y de Órdenes lleva el suyo, con lo que
 * se puede hacer sobre esa fila sin tener que entrar en ella. Las acciones
 * que no proceden no se esconden: se apagan y dicen por qué, que es la
 * diferencia entre «no se puede» y «¿dónde estaba el botón?».
 *
 * Se abre en posición fija para que no lo recorte el contenedor de la tabla,
 * que tiene desbordamiento oculto.
 */
export default function MenuFila({
  rotulo,
  acciones,
}: {
  /** Para lectores de pantalla: «Acciones de la orden T004». */
  rotulo: string;
  acciones: AccionFila[];
}) {
  const [pos, setPos] = useState<{ x: number; y: number; arriba: boolean } | null>(null);
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pos) return;
    const cerrar = () => setPos(null);
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setPos(null);
    window.addEventListener("click", cerrar);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("click", cerrar);
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
      window.removeEventListener("keydown", tecla);
    };
  }, [pos]);

  const normales = acciones.filter((a) => !a.peligro);
  const peligrosas = acciones.filter((a) => a.peligro);

  const item = (a: AccionFila) => {
    const clase = `block w-full px-3.5 py-2 text-left transition ${
      a.peligro ? "text-bad hover:bg-bad-bg" : "hover:bg-canvas"
    }`;
    if (a.noPorque) {
      return (
        <span
          key={a.texto}
          role="menuitem"
          aria-disabled="true"
          title={a.noPorque}
          className="block cursor-not-allowed px-3.5 py-2 text-ink-3"
        >
          {a.texto}
          <span className="block text-[11.5px] leading-snug">{a.noPorque}</span>
        </span>
      );
    }
    if (a.href) {
      return (
        // El color va en línea: dentro de una tabla del panel los enlaces son
        // azules por una regla sin capa, y aquí tienen que verse como el resto.
        <Link
          key={a.texto}
          role="menuitem"
          href={a.href}
          className={clase}
          style={{ color: "inherit", textDecoration: "none" }}
        >
          {a.texto}
        </Link>
      );
    }
    return (
      <button
        key={a.texto}
        role="menuitem"
        onClick={() => { setPos(null); a.onClick?.(); }}
        className={clase}
      >
        {a.texto}
      </button>
    );
  };

  return (
    <>
      <button
        ref={boton}
        aria-label={rotulo}
        aria-haspopup="menu"
        aria-expanded={pos !== null}
        onClick={(e) => {
          e.stopPropagation();
          if (pos) { setPos(null); return; }
          const r = e.currentTarget.getBoundingClientRect();
          // Cerca del borde inferior se abre hacia arriba.
          const arriba = window.innerHeight - r.bottom < 60 + acciones.length * 40;
          setPos({ x: r.right, y: arriba ? r.top - 2 : r.bottom + 2, arriba });
        }}
        className="grid h-9 w-9 place-items-center rounded-full text-[#39414d] transition hover:bg-canvas"
      >
        <svg width="4" height="16" viewBox="0 0 4 16" fill="currentColor" aria-hidden>
          <circle cx="2" cy="2" r="1.6" /><circle cx="2" cy="8" r="1.6" /><circle cx="2" cy="14" r="1.6" />
        </svg>
      </button>

      {pos && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 min-w-[210px] max-w-[280px] rounded-[4px] border border-line bg-surface py-1 text-left text-[14px] text-ink shadow-[0_4px_12px_rgba(0,0,0,0.18)]"
          style={{
            left: pos.x,
            top: pos.y,
            transform: `translateX(-100%)${pos.arriba ? " translateY(-100%)" : ""}`,
          }}
        >
          {normales.map(item)}
          {peligrosas.length > 0 && normales.length > 0 && (
            <div className="my-1 border-t border-line" />
          )}
          {peligrosas.map(item)}
        </div>
      )}
    </>
  );
}
