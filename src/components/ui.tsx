import type { ReactNode } from "react";

/**
 * Densidad.
 *
 * Esta es una pantalla de turno: el planificador la tiene abierta ocho horas
 * y necesita ver treinta vehículos sin desplazarse. El aire que se agradece
 * en una web de marketing aquí se paga en filas que no caben, así que las
 * tablas y las cabeceras van apretadas a propósito. El tamaño de letra no
 * baja de 12,5 px: por debajo deja de leerse de un vistazo, que es justo
 * para lo que sirve.
 */
export function BarraSuperior({
  migaja,
  titulo,
  acciones,
}: {
  migaja: ReactNode;
  titulo: string;
  acciones?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2">
      <div>
        <div className="text-[11.5px] font-medium leading-tight text-ink-3">{migaja}</div>
        <h1 className="text-[15px] font-bold leading-tight tracking-tight">{titulo}</h1>
      </div>
      {acciones && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {acciones}
        </div>
      )}
    </header>
  );
}

/**
 * Tabla densa, la misma en todas las pantallas.
 *
 * Antes cada una repetía sus clases de `px-3.5 py-2.5` y ninguna coincidía
 * con la de al lado: la de Equipo respiraba el doble que la de Despachos sin
 * ninguna razón. Esto las iguala y deja un solo sitio donde cambiarlo.
 */
export function Tabla({
  cabeceras,
  anchoMin = 620,
  children,
}: {
  cabeceras: ReactNode[];
  /** Por debajo de este ancho la tabla se desplaza en vez de apretarse. */
  anchoMin?: number;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full border-collapse text-[12.5px]"
        style={{ minWidth: `${anchoMin}px` }}
      >
        <thead>
          <tr>
            {cabeceras.map((c, i) => (
              <th
                key={i}
                className="border-b border-line bg-surface-2 px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Una celda de `Tabla`, con su separador y su respiración. */
export function Celda({
  children,
  className = "",
  ancho,
}: {
  children: ReactNode;
  className?: string;
  ancho?: string;
}) {
  return (
    <td
      className={`border-b border-line px-3 py-1.5 align-middle ${className}`}
      style={ancho ? { width: ancho } : undefined}
    >
      {children}
    </td>
  );
}

export function FranjaKpis({
  items,
}: {
  items: { etiqueta: string; valor: string; nota?: string; icono: string; tinte: string }[];
}) {
  return (
    <div className="grid gap-px border-b border-line bg-line @sm:grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-6">
      {items.map((k) => (
        <div key={k.etiqueta} className="min-w-0 bg-surface px-3.5 py-2">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
            <span
              className="grid h-4 w-4 place-items-center rounded text-[10px]"
              style={{ background: k.tinte }}
            >
              {k.icono}
            </span>
            {k.etiqueta}
          </div>
          <div className="num mt-0.5 text-[19px] font-bold leading-none tracking-tight">
            {k.valor}
          </div>
          {k.nota && (
            <div className="text-[11px] font-semibold text-ink-3">
              {k.nota}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function Tarjeta({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[10px] border border-line bg-surface shadow-[0_1px_2px_rgba(16,27,43,0.05)] ${className}`}
    >
      {children}
    </div>
  );
}

export function EstadoVacio({
  icono,
  titulo,
  descripcion,
  accion,
}: {
  icono: string;
  titulo: string;
  descripcion: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-[12px] bg-amber-050 text-xl">
        {icono}
      </div>
      <h3 className="mt-3 text-[15px] font-bold tracking-tight">{titulo}</h3>
      <p className="mt-1.5 max-w-[50ch] text-[13px] leading-relaxed text-ink-2">
        {descripcion}
      </p>
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}

export function Pastilla({
  tono,
  children,
}: {
  tono: "ok" | "warn" | "bad" | "live" | "plan";
  children: ReactNode;
}) {
  const estilos: Record<string, string> = {
    ok: "bg-ok-bg text-ok",
    warn: "bg-warn-bg text-warn",
    bad: "bg-bad-bg text-bad",
    live: "bg-live-bg text-live",
    plan: "bg-canvas text-ink-2 border border-line",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${estilos[tono]}`}
    >
      {children}
    </span>
  );
}
