"use client";

import type { EstadoCola } from "@/hooks/useCola";

/**
 * Qué queda por subir, en una línea.
 *
 * Vive dentro de la consola y ocupa siempre el mismo alto, haya aviso o no:
 * un bloque que aparece y desaparece empuja los botones justo cuando el dedo
 * va a tocarlos.
 *
 * Cuando todo va bien casi no se ve —texto gris, pequeño—, porque es lo que
 * pasa el noventa por ciento del día. Solo levanta la voz cuando hay algo que
 * el conductor tiene que saber: sin señal, entregas sin subir o un fallo al
 * guardar. Nunca es azul: en esta app el azul es «esto es lo que toca».
 */
export default function FranjaCola({
  cola,
  errorLocal = null,
  onReintentarLocal,
}: {
  cola: EstadoCola;
  /** Ni siquiera se pudo guardar en el móvil: memoria llena, modo privado. */
  errorLocal?: string | null;
  onReintentarLocal?: () => void;
}) {
  const { pendientes, enLinea, sincronizando, subir } = cola;
  const base = "flex h-7 w-full items-center justify-center gap-1.5 text-center text-[12.5px]";
  const pastilla = "rounded-full px-3 py-1 font-bold";

  if (errorLocal) {
    return (
      <button onClick={onReintentarLocal} className={base}>
        <span className={`${pastilla} truncate bg-bad-bg text-bad`}>
          No se pudo guardar en el móvil · toca para reintentar
        </span>
      </button>
    );
  }

  if (sincronizando) {
    return (
      <div className={`${base} font-semibold text-ink-2`}>
        Subiendo{pendientes > 0 ? ` ${pendientes}` : ""}…
      </div>
    );
  }

  if (pendientes === 0) {
    return <div className={`${base} font-medium text-ink-3`}>Todo subido</div>;
  }

  if (!enLinea) {
    return (
      <div className={base}>
        <span className={`${pastilla} bg-warn-bg text-warn`}>
          Sin señal · <span className="num">{pendientes}</span>{" "}
          {pendientes === 1 ? "guardada" : "guardadas"} en el móvil
        </span>
      </div>
    );
  }

  return (
    <button onClick={subir} className={base}>
      <span className={`${pastilla} bg-warn-bg text-warn`}>
        <span className="num">{pendientes}</span> sin subir · toca para subirlas
      </span>
    </button>
  );
}
