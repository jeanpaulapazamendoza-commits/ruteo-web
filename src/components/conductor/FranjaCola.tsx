"use client";

import type { EstadoCola } from "@/hooks/useCola";

/**
 * Franja D0: qué queda por subir. Vive dentro de la consola, siempre visible
 * y siempre de 44 px.
 *
 * Antes era un bloque que aparecía y desaparecía en la cabecera, empujando la
 * página entera hacia abajo justo cuando el dedo iba a tocar algo. Ahora
 * ocupa el mismo sitio con o sin aviso.
 *
 * Nunca es ámbar: en esta app el ámbar significa «ahora, esto es lo que
 * toca», y una alarma en ámbar competiría con el botón que el pulgar busca.
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
  const base = "flex h-11 w-full items-center gap-2 px-3 text-left text-[14px] font-bold";

  if (errorLocal) {
    return (
      <button
        onClick={onReintentarLocal}
        className={`${base} border-l-[6px] border-bad bg-bad-bg text-ink`}
      >
        <span className="truncate">No se pudo guardar en el móvil · toca para reintentar</span>
      </button>
    );
  }

  if (sincronizando) {
    return (
      <div className={`${base} bg-navy-900 text-white`}>
        Subiendo{pendientes > 0 ? ` ${pendientes}` : ""}…
      </div>
    );
  }

  if (pendientes === 0) {
    return <div className={`${base} bg-surface-2 text-ink-2`}>✓ Todo subido</div>;
  }

  if (!enLinea) {
    return (
      <div className={`${base} border-l-[6px] border-bad bg-navy-900 text-white`}>
        Sin señal · <span className="num">{pendientes}</span> guardadas en el móvil
      </div>
    );
  }

  return (
    <button onClick={subir} className={`${base} border-l-[6px] border-warn bg-navy-900 text-white`}>
      ↑ <span className="num">{pendientes}</span> sin subir · toca para subirlas
    </button>
  );
}
