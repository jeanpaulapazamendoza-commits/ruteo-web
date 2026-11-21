"use client";

import type { ReactNode } from "react";

/**
 * Los gráficos de los informes, dibujados a mano.
 *
 * No hay biblioteca de gráficos y no la va a haber: las formas que usan estos
 * informes —una rosquilla, barras horizontales, un histograma y un número
 * grande— son cien líneas de SVG. Una biblioteca trae trescientos kilobytes
 * al navegador del planificador y su propia idea de qué es un tooltip.
 *
 * El aspecto sigue el de los informes de la referencia: paneles planos con
 * la cabecera en negrita, rosquilla grande con la leyenda debajo, barras con
 * la cifra dentro del rótulo —«Entregado: 149 (54,2%)»— y sus colores.
 *
 * Todo lo que se pinta lleva su número al lado. Un gráfico sin cifras sirve
 * para una presentación, no para decidir a quién se llama esta tarde.
 */

/** Paleta de los informes, la de la referencia. */
export const COLORES = {
  entregado: "#1ab394",
  parcial: "#f8ac59",
  reprogramado: "#f8ac59",
  fallido: "#ed5565",
  pendiente: "#c4c4c4",
  a_tiempo: "#1ab394",
  adelantado: "#337ab7",
  atrasado: "#ed5565",
  no_definido: "#c4c4c4",
  base: "#337ab7",
  acento: "#f8ac59",
} as const;

const TEXTO = "#676a6c";
const RAYA = "#e7eaec";

/** La franja gris que abre cada bloque de un informe. */
export function Seccion({ titulo, nota }: { titulo: string; nota?: string }) {
  return (
    <>
      <div
        className="px-[15px] py-3 text-[15px] font-bold uppercase"
        style={{ background: "#f3f3f4", color: TEXTO }}
      >
        {titulo}
      </div>
      {nota && (
        <p className="px-[15px] py-2 text-[12px] italic" style={{ color: "#8a8d8f" }}>
          * {nota}
        </p>
      )}
    </>
  );
}

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
    <div
      className={`min-w-0 border bg-surface ${className}`}
      style={{ borderColor: RAYA, color: TEXTO }}
    >
      <div
        className="flex flex-wrap items-center gap-2 border-b px-[15px] py-[13px]"
        style={{ borderColor: RAYA, background: "#fafafa" }}
      >
        <h3 className="text-[15px] font-bold leading-[18px]">{titulo}</h3>
        {acciones && <div className="ml-auto">{acciones}</div>}
      </div>
      <div className="p-[15px]">{children}</div>
      {nota && (
        <p className="px-[15px] pb-3 text-[12px] italic" style={{ color: "#8a8d8f" }}>
          * {nota}
        </p>
      )}
    </div>
  );
}

/** Un número grande con su rótulo debajo, centrado. */
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
    <div className="min-w-0 border bg-surface px-3 py-4 text-center" style={{ borderColor: RAYA }}>
      <div
        className="num text-[30px] font-bold leading-[36px]"
        style={{ color: tono ?? TEXTO }}
      >
        {valor}
      </div>
      <div className="mt-1 text-[14px]" style={{ color: TEXTO }}>
        {etiqueta}
      </div>
      {nota && (
        <div className="mt-0.5 text-[12px]" style={{ color: "#8a8d8f" }}>
          {nota}
        </div>
      )}
    </div>
  );
}

export type Parte = { texto: string; n: number; color: string };

const pct = (n: number, total: number) =>
  total > 0 ? ((n / total) * 100).toFixed(1) : "0";

/**
 * Rosquilla con el total dentro y la leyenda debajo.
 *
 * Con una sola parte se dibuja un círculo entero en vez de un arco: un arco
 * de 360 grados tiene el punto inicial y el final en el mismo sitio y el
 * trazo desaparece.
 */
export function Rosquilla({
  partes,
  total,
  etiquetaTotal,
  tamano = 190,
}: {
  partes: Parte[];
  /** Si falta, se suma. Se pasa cuando el total incluye algo que no se pinta. */
  total?: number;
  etiquetaTotal?: string;
  tamano?: number;
}) {
  const suma = total ?? partes.reduce((a, p) => a + p.n, 0);
  const vivos = partes.filter((p) => p.n > 0);
  const r = 52;
  const circunferencia = 2 * Math.PI * r;

  let acumulado = 0;

  return (
    <div style={{ color: TEXTO }}>
      <svg
        viewBox="0 0 140 140"
        width={tamano}
        height={tamano}
        className="mx-auto block"
        role="img"
        aria-label={`${suma} en total`}
      >
        <circle cx="70" cy="70" r={r} fill="none" stroke="#eef0f2" strokeWidth="17" />
        {vivos.length === 1 ? (
          <circle cx="70" cy="70" r={r} fill="none" stroke={vivos[0].color} strokeWidth="17" />
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
                strokeWidth="17"
                strokeDasharray={`${largo} ${circunferencia - largo}`}
                strokeDashoffset={desfase}
                transform="rotate(-90 70 70)"
              />
            );
          })
        )}
        <text
          x="70"
          y="72"
          textAnchor="middle"
          className="num"
          style={{ fontSize: 24, fontWeight: 700, fill: "#484b4d" }}
        >
          {suma.toLocaleString("es-PE")}
        </text>
        {etiquetaTotal && (
          <text x="70" y="86" textAnchor="middle" style={{ fontSize: 8.5, fill: TEXTO }}>
            {etiquetaTotal}
          </text>
        )}
      </svg>

      <ul className="mt-3 space-y-[5px]">
        {partes.map((p) => (
          <li key={p.texto} className="flex items-center gap-2 text-[12px]">
            <span className="h-[11px] w-[11px] shrink-0" style={{ background: p.color }} />
            <span className="num">
              {p.texto}: {p.n.toLocaleString("es-PE")} ({pct(p.n, suma)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type Dato = { texto: string; n: number; color?: string };

/**
 * Barras horizontales, de mayor a menor, con la cifra dentro del rótulo.
 *
 * Horizontales y no verticales porque lo que va en el eje son nombres —de
 * conductor, de cliente, de artículo— y un nombre de treinta caracteres
 * girado noventa grados no lo lee nadie.
 */
export function BarrasH({
  datos,
  limite = 20,
  color = COLORES.base,
  sufijo = "",
  conPorcentaje = false,
  enOrden = false,
}: {
  /** Respeta el orden recibido. Para lo que ya tiene el suyo: los días. */
  enOrden?: boolean;
  datos: Dato[];
  /** Cuántas barras como mucho. El resto se resume en una línea. */
  limite?: number;
  color?: string;
  sufijo?: string;
  /** «Entregado: 149 (54,2%)» en vez de «Entregado (149)». */
  conPorcentaje?: boolean;
}) {
  const ordenados = enOrden ? datos : [...datos].sort((a, b) => b.n - a.n);
  const visibles = ordenados.slice(0, limite);
  const resto = ordenados.slice(limite);
  const max = Math.max(1, ...visibles.map((d) => d.n));
  const total = datos.reduce((a, d) => a + d.n, 0);

  if (!datos.length) return <Vacio />;

  return (
    <div className="space-y-[7px]" style={{ color: TEXTO }}>
      {visibles.map((d, i) => (
        <div key={d.texto + i} className="flex items-center gap-3">
          <span className="num w-[40%] shrink-0 truncate text-[12px]" title={d.texto}>
            {conPorcentaje
              ? `${d.texto}: ${d.n.toLocaleString("es-PE")}${sufijo} (${pct(d.n, total)}%)`
              : `${d.texto} (${d.n.toLocaleString("es-PE")}${sufijo})`}
          </span>
          <div className="h-[16px] min-w-0 flex-1">
            <div
              className="h-full"
              style={{
                // Un cero no pinta barra: un filo de un píxel se lee como «algo».
                width: d.n > 0 ? `${Math.max(1, (d.n / max) * 100)}%` : 0,
                background: d.color ?? color,
              }}
            />
          </div>
        </div>
      ))}
      {resto.length > 0 && (
        <p className="pt-1 text-[12px]" style={{ color: "#8a8d8f" }}>
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
  color = COLORES.acento,
  etiquetaY = "Despachos (unidades)",
}: {
  /** Valor por hora, índice 0 a 23. */
  datos: number[];
  color?: string;
  etiquetaY?: string;
}) {
  const max = Math.max(1, ...datos);
  const total = datos.reduce((a, n) => a + n, 0);

  if (total === 0) return <Vacio />;

  // Tres marcas en el eje vertical bastan para leer la altura de una barra.
  const marcas = [max, Math.round(max / 2), 0];

  return (
    <div className="flex gap-2" style={{ color: TEXTO }}>
      <div
        className="shrink-0 text-center text-[11px]"
        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
      >
        {etiquetaY}
      </div>
      <div className="flex h-[150px] shrink-0 flex-col justify-between pb-[18px] text-right text-[10px]">
        {marcas.map((m, i) => (
          <span key={i} className="num">{m}</span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex h-[132px] items-end gap-[6px] border-b border-l" style={{ borderColor: "#cfd2d4" }}>
          {datos.map((n, h) => (
            <div
              key={h}
              className="flex h-full min-w-0 flex-1 items-end"
              title={`${String(h).padStart(2, "0")}:00 — ${n}`}
            >
              <div
                className="w-full"
                style={{ height: `${(n / max) * 100}%`, minHeight: n > 0 ? 2 : 0, background: color }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-[6px]">
          {datos.map((_, h) => (
            <span key={h} className="num min-w-0 flex-1 text-center text-[9px]">
              {String(h).padStart(2, "0")}
            </span>
          ))}
        </div>
        <div className="mt-1 text-center text-[11px]">Horas</div>
      </div>
    </div>
  );
}

export function Vacio({ texto = "Sin datos en este rango." }: { texto?: string }) {
  return (
    <p className="py-4 text-center text-[12px]" style={{ color: "#8a8d8f" }}>
      {texto}
    </p>
  );
}
