import type { ReactNode } from "react";

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
    <header className="flex flex-wrap items-center gap-3.5 border-b border-line bg-surface px-5 py-3">
      <div>
        <div className="text-[12.5px] font-medium text-ink-3">{migaja}</div>
        <h1 className="text-base font-bold tracking-tight">{titulo}</h1>
      </div>
      {acciones && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {acciones}
        </div>
      )}
    </header>
  );
}

export function FranjaKpis({
  items,
}: {
  items: { etiqueta: string; valor: string; nota?: string; icono: string; tinte: string }[];
}) {
  return (
    <div className="grid gap-px border-b border-line bg-line sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {items.map((k) => (
        <div key={k.etiqueta} className="min-w-0 bg-surface px-4 py-3">
          <div className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
            <span
              className="grid h-5 w-5 place-items-center rounded-md text-[11px]"
              style={{ background: k.tinte }}
            >
              {k.icono}
            </span>
            {k.etiqueta}
          </div>
          <div className="num mt-1 text-[22px] font-bold tracking-tight">
            {k.valor}
          </div>
          {k.nota && (
            <div className="text-[11.5px] font-semibold text-ink-3">
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
      className={`rounded-[14px] border border-line bg-surface shadow-[0_1px_2px_rgba(16,27,43,0.06)] ${className}`}
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
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-[14px] bg-amber-050 text-2xl">
        {icono}
      </div>
      <h3 className="mt-4 text-[17px] font-bold tracking-tight">{titulo}</h3>
      <p className="mt-1.5 max-w-[46ch] text-[14px] leading-relaxed text-ink-2">
        {descripcion}
      </p>
      {accion && <div className="mt-5">{accion}</div>}
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
