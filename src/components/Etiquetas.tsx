"use client";

import { useState } from "react";
import type { Etiqueta } from "@/app/acciones/etiquetas";

type Formato = "termica" | "a4";

/** El papel de cada formato, tal como lo entiende la impresora. */
const PAPEL: Record<Formato, string> = {
  termica: "@page { size: 100mm 150mm; margin: 0 }",
  a4: "@page { size: A4; margin: 0 }",
};

/**
 * Las etiquetas de unas órdenes, listas para imprimir.
 *
 * Dos papeles: el rollo térmico de 10 × 15 cm —una etiqueta por hoja— y el
 * folio A4 con ocho por hoja, para quien imprime en una impresora de oficina
 * sobre papel adhesivo. Se puede sacar una etiqueta por orden o una por
 * bulto, que es lo que hace falta cuando cada caja viaja suelta.
 *
 * Lo grande es lo que se lee de lejos en el almacén: la ruta, el puesto en
 * el reparto y el código de la orden.
 */
export default function Etiquetas({ etiquetas }: { etiquetas: Etiqueta[] }) {
  const [formato, setFormato] = useState<Formato>("termica");
  const [porBulto, setPorBulto] = useState(false);

  const hojas = etiquetas.flatMap((e) =>
    porBulto && e.bultos > 1
      ? Array.from({ length: e.bultos }, (_, i) => ({ e, bulto: i + 1 }))
      : [{ e, bulto: null as number | null }],
  );

  return (
    <div className="min-h-screen bg-canvas print:bg-white">
      <style>{`${PAPEL[formato]}
        @media print { .no-imprimir { display: none !important } body { background: #fff } }`}</style>

      <div className="no-imprimir sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-line bg-surface px-5 py-3">
        <b className="text-[15px] text-ink">
          <span className="num">{hojas.length}</span> {hojas.length === 1 ? "etiqueta" : "etiquetas"}
        </b>
        <div className="inline-flex rounded-full border border-line bg-canvas p-[3px]">
          {([["termica", "10 × 15 cm"], ["a4", "A4 · 8 por hoja"]] as const).map(([k, t]) => (
            <button
              key={k}
              onClick={() => setFormato(k)}
              aria-pressed={formato === k}
              className={`h-8 rounded-full px-3 text-[13px] font-bold ${
                formato === k ? "bg-surface text-ink shadow-sm" : "text-ink-2"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[13.5px] text-ink-2">
          <input
            type="checkbox"
            checked={porBulto}
            onChange={(e) => setPorBulto(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-amber)]"
          />
          Una etiqueta por bulto
        </label>
        <button
          onClick={() => window.print()}
          disabled={!hojas.length}
          className="ml-auto inline-flex h-9 items-center rounded-full bg-amber px-5 text-[14px] font-bold text-white transition hover:bg-amber-600 disabled:opacity-50"
        >
          Imprimir
        </button>
      </div>

      {hojas.length === 0 ? (
        <p className="no-imprimir p-8 text-[14px] text-ink-2">
          No hay órdenes que imprimir. Vuelve a Rutas u Órdenes y elige cuáles.
        </p>
      ) : (
        <div
          className={
            formato === "a4"
              ? "mx-auto grid w-[210mm] grid-cols-2 bg-white print:w-auto"
              : "mx-auto flex w-[100mm] flex-col gap-3 py-4 print:gap-0 print:py-0"
          }
        >
          {hojas.map(({ e, bulto }, i) => (
            <article
              key={`${e.id}-${bulto ?? 0}`}
              className={`flex flex-col overflow-hidden bg-white text-black ${
                formato === "a4"
                  ? "h-[74.25mm] w-[105mm] border border-dashed border-neutral-300 p-[5mm] print:border-neutral-200"
                  : "h-[150mm] w-[100mm] p-[6mm] shadow print:shadow-none"
              }`}
              style={{
                breakInside: "avoid",
                // En térmica, cada etiqueta en su hoja; en A4, salto cada ocho.
                breakAfter:
                  formato === "termica" ? "page" : (i + 1) % 8 === 0 ? "page" : "auto",
              }}
            >
              <header className="flex items-baseline justify-between gap-2 border-b-2 border-black pb-[1.5mm]">
                <span className="truncate text-[9pt] font-bold uppercase tracking-wide">{e.empresa}</span>
                <span className="num shrink-0 text-[8pt]">{e.fecha}</span>
              </header>

              <div className={`flex items-end justify-between gap-2 ${formato === "a4" ? "pt-[2mm]" : "pt-[4mm]"}`}>
                <div className="min-w-0">
                  <div className="text-[7.5pt] uppercase tracking-wide text-neutral-600">Ruta</div>
                  <div className={`num truncate font-bold leading-none ${formato === "a4" ? "text-[18pt]" : "text-[26pt]"}`}>
                    {e.ruta ?? "—"}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[7.5pt] uppercase tracking-wide text-neutral-600">Parada</div>
                  <div className={`num font-bold leading-none ${formato === "a4" ? "text-[24pt]" : "text-[40pt]"}`}>
                    {e.orden ?? "—"}
                  </div>
                </div>
              </div>

              <div className={`border-y border-black ${formato === "a4" ? "my-[2mm] py-[1.5mm]" : "my-[4mm] py-[3mm]"}`}>
                <div className="text-[7.5pt] uppercase tracking-wide text-neutral-600">Orden</div>
                <div className={`num break-all font-bold leading-tight ${formato === "a4" ? "text-[14pt]" : "text-[22pt]"}`}>
                  {e.codigo ?? e.id.slice(0, 8)}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
                <div className={`font-bold leading-tight ${formato === "a4" ? "text-[10.5pt]" : "text-[15pt]"}`}>
                  {e.nombre ?? "—"}
                </div>
                <div className={`mt-[1mm] leading-snug ${formato === "a4" ? "text-[8.5pt]" : "text-[11pt]"}`}>
                  {/* El distrito solo se añade si la dirección no lo trae ya escrito. */}
                  {(e.direccion && e.distrito && !e.direccion.toLowerCase().includes(e.distrito.toLowerCase())
                    ? `${e.direccion} · ${e.distrito}`
                    : e.direccion || e.distrito) || "Sin dirección registrada"}
                </div>
                {(e.telefono || e.ventana) && (
                  <div className={`num mt-[1mm] ${formato === "a4" ? "text-[8pt]" : "text-[10pt]"}`}>
                    {[e.telefono ? `Tel. ${e.telefono}` : null, e.ventana ? `Horario ${e.ventana}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
              </div>

              <footer className="flex items-end justify-between gap-2 border-t border-black pt-[1.5mm]">
                <span className={`truncate ${formato === "a4" ? "text-[7.5pt]" : "text-[9pt]"}`}>
                  {[e.despacho, e.conductor].filter(Boolean).join(" · ")}
                </span>
                <span className={`num shrink-0 font-bold ${formato === "a4" ? "text-[11pt]" : "text-[16pt]"}`}>
                  {bulto ? `Bulto ${bulto}/${e.bultos}` : `${e.bultos} ${e.bultos === 1 ? "bulto" : "bultos"}`}
                </span>
              </footer>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
