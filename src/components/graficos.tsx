"use client";

import type { ReactNode } from "react";
import { Tarjeta } from "@/components/ui";

/**
 * Los cuatro gráficos que hacen falta, dibujados a mano.
 *
 * No hay biblioteca de gráficos y no la va a haber: las cuatro formas que
 * usan estos informes —una rosquilla, barras horizontales, un histograma y un
 * número grande— son cien líneas de SVG. Una biblioteca trae trescientos
 * kilobytes al navegador del planificador, su propia paleta peleando con la
 * de la marca y su propia idea de qué es un tooltip.
 *
 * Todo lo que se pinta lleva su número al lado. Un gráfico sin cifras sirve
 * para una presentación, no para decidir a quién se llama esta tarde.
 */

/** Paleta de los informes. Los estados mandan; el resto es relleno sobrio. */
export const COLORES = {
  entregado: "#0e9f6e",
  parcial: "#c2760b",
  reprogramado: "#7a5af8",
  fallido: "#d64545",
  pendiente: "#9aa5b1",
  a_tiempo: "#0e9f6e",
  adelantado: "#2e7dd1",
  atrasado: "#d64545",
  no_definido: "#9aa5b1",
  base: "#1a55b5",
  acento: "#e09410",
} as const;

/** Serie de barras: una rueda de colores para lo que no es un estado. */
const RUEDA = ["#1a55b5", "#0e8f9e", "#7a5af8", "#e8833a", "#c2439b", "#7c9a1f"];

export function Panel({
  titulo,
  nota,
  acciones,
  children,
  className = "",
}: {
  titulo: string;
  nota?: string;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tarjeta className={`overflow-hidden ${className}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3.5 py-2">
        <h3 className="text-[13px] font-bold">{titulo}</h3>
        {nota && <span className="text-[11px] text-ink-3">{nota}</span>}
        {acciones && <div className="ml-auto">{acciones}</div>}
      </div>
      <div className="p-3.5">{children}</div>
    </Tarjeta>
  );
}

/** Un número grande con su etiqueta. El resumen de una pantalla entera. */
export function Cifra({
  etiqueta,
  valor,
  nota,
  tono,
}: {
  etiqueta: string;
  valor: string | number;
  nota?: string;
  tono?: string;
}) {
  return (
    <div className="min-w-0 rounded-[10px] border border-line bg-surface px-3.5 py-2.5">
      <div className="num text-[22px] font-bold leading-none tracking-tight" style={tono ? { color: tono } : undefined}>
        {valor}
      </div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        {etiqueta}
      </div>
      {nota && <div className="mt-0.5 text-[11px] text-ink-3">{nota}</div>}
    </div>
  );
}

export type Parte = { texto: string; n: number; color: string };

/**
 * Rosquilla con su leyenda.
 *
 * El total va dentro del agujero, que es el sitio donde se mira primero. Con
 * una sola parte se dibuja un círculo entero en vez de un arco: un arco de
 * 360 grados tiene el punto inicial y el final en el mismo sitio y el trazo
 * desaparece.
 */
export function Rosquilla({
  partes,
  total,
  etiquetaTotal,
  tamano = 136,
}: {
  partes: Parte[];
  /** Si falta, se suma. Se pasa cuando el total incluye algo que no se pinta. */
  total?: number;
  etiquetaTotal?: string;
  tamano?: number;
}) {
  const suma = total ?? partes.reduce((a, p) => a + p.n, 0);
  const vivos = partes.filter((p) => p.n > 0);
  const r = 54;
  const circunferencia = 2 * Math.PI * r;

  let acumulado = 0;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg
        viewBox="0 0 140 140"
        width={tamano}
        height={tamano}
        className="shrink-0"
        role="img"
        aria-label={`${suma} en total`}
      >
        <circle cx="70" cy="70" r={r} fill="none" stroke="#eef1f6" strokeWidth="20" />
        {vivos.length === 1 ? (
          <circle cx="70" cy="70" r={r} fill="none" stroke={vivos[0].color} strokeWidth="20" />
        ) : (
          vivos.map((p) => {
            const fraccion = suma > 0 ? p.n / suma : 0;
            const largo = fraccion * circunferencia;
            const desfase = -acumulado * circunferencia;
            acumulado += fraccion;
            return (
              <circle
                key={p.texto}
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth="20"
                strokeDasharray={`${largo} ${circunferencia - largo}`}
                strokeDashoffset={desfase}
                transform="rotate(-90 70 70)"
              />
            );
          })
        )}
        <text
          x="70"
          y="68"
          textAnchor="middle"
          className="num"
          style={{ fontSize: 24, fontWeight: 700, fill: "#101b2b" }}
        >
          {suma.toLocaleString("es-PE")}
        </text>
        {etiquetaTotal && (
          <text
            x="70"
            y="84"
            textAnchor="middle"
            style={{ fontSize: 9, fontWeight: 600, fill: "#7c8798", letterSpacing: 0.5 }}
          >
            {etiquetaTotal.toUpperCase()}
          </text>
        )}
      </svg>

      <ul className="min-w-0 flex-1 space-y-1">
        {partes.map((p) => (
          <li key={p.texto} className="flex items-center gap-2 text-[12px]">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ background: p.color }}
            />
            <span className="min-w-0 flex-1 truncate text-ink-2">{p.texto}</span>
            <span className="num font-semibold">{p.n.toLocaleString("es-PE")}</span>
            <span className="num w-11 text-right text-[11px] text-ink-3">
              {suma > 0 ? ((p.n / suma) * 100).toFixed(1) : "0.0"}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type Dato = { texto: string; n: number; color?: string };

/**
 * Barras horizontales, ordenadas de mayor a menor.
 *
 * Horizontales y no verticales porque lo que va en el eje son nombres —de
 * conductor, de cliente, de artículo— y un nombre de treinta caracteres
 * girado noventa grados no lo lee nadie.
 */
export function BarrasH({
  datos,
  limite = 20,
  color,
  sufijo = "",
}: {
  datos: Dato[];
  /** Cuántas barras como mucho. El resto se resume en una línea. */
  limite?: number;
  color?: string;
  sufijo?: string;
}) {
  const ordenados = [...datos].sort((a, b) => b.n - a.n);
  const visibles = ordenados.slice(0, limite);
  const resto = ordenados.slice(limite);
  const max = Math.max(1, ...visibles.map((d) => d.n));

  if (!datos.length) return <Vacio />;

  return (
    <div className="space-y-1">
      {visibles.map((d, i) => (
        <div key={d.texto + i} className="flex items-center gap-2">
          <span className="w-[42%] shrink-0 truncate text-[11.5px] text-ink-2" title={d.texto}>
            {d.texto}
          </span>
          <div className="h-3.5 min-w-0 flex-1 rounded-[3px] bg-canvas">
            <div
              className="h-full rounded-[3px]"
              style={{
                width: `${Math.max(2, (d.n / max) * 100)}%`,
                background: d.color ?? color ?? RUEDA[i % RUEDA.length],
              }}
            />
          </div>
          <span className="num w-12 shrink-0 text-right text-[11.5px] font-semibold">
            {d.n.toLocaleString("es-PE")}
            {sufijo}
          </span>
        </div>
      ))}
      {resto.length > 0 && (
        <p className="pt-1 text-[11px] text-ink-3">
          y {resto.length} más, con {resto.reduce((a, d) => a + d.n, 0).toLocaleString("es-PE")}
          {sufijo} entre todos.
        </p>
      )}
    </div>
  );
}

/**
 * Histograma por hora del día.
 *
 * Se pintan las 24 horas aunque estén vacías: el hueco de las dos de la tarde
 * es la información, y una barra que no existe no se ve pero un hueco sí.
 */
export function BarrasHora({
  datos,
  color = COLORES.base,
  etiquetaY = "paradas",
}: {
  /** Valor por hora, índice 0 a 23. */
  datos: number[];
  color?: string;
  etiquetaY?: string;
}) {
  const max = Math.max(1, ...datos);
  const total = datos.reduce((a, n) => a + n, 0);

  if (total === 0) return <Vacio />;

  return (
    <div>
      <div className="flex h-[112px] items-end gap-px">
        {datos.map((n, h) => (
          <div
            key={h}
            className="group relative flex h-full min-w-0 flex-1 items-end"
            title={`${String(h).padStart(2, "0")}:00 — ${n} ${etiquetaY}`}
          >
            <div
              className="w-full rounded-t-[2px] transition group-hover:opacity-80"
              style={{
                height: `${(n / max) * 100}%`,
                minHeight: n > 0 ? 2 : 0,
                background: color,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-px border-t border-line pt-1">
        {datos.map((_, h) => (
          <span
            key={h}
            className="num min-w-0 flex-1 text-center text-[8.5px] text-ink-3"
          >
            {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
          </span>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-ink-3">
        Hora del día · {total.toLocaleString("es-PE")} {etiquetaY} en total
      </p>
    </div>
  );
}

export function Vacio({ texto = "Sin datos en este rango." }: { texto?: string }) {
  return <p className="py-4 text-center text-[12px] text-ink-3">{texto}</p>;
}
