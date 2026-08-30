"use client";

import { useEffect, useRef, useState } from "react";
import { comprimirFoto } from "@/lib/entregas";

/**
 * Carril de deshacer: ocho segundos para arreglar un toque.
 *
 * Cerrar una parada cuesta un solo toque, así que tiene que costar un solo
 * toque desharlo. Y como la entrega se retiene dentro de la cola durante esos
 * ocho segundos, deshacer no le pide nada al servidor: nunca llegó a salir.
 *
 * Aquí viven además los dos datos que el camino de un toque se dejaba por el
 * camino —la foto y quién recibió—, a un toque de distancia y sin obligar a
 * nadie a pasar por un formulario cuando no hacen falta.
 *
 * El carril no ocupa altura de maquetación: es `fixed` y la lista ya reserva
 * su hueco, así que aparecer y desaparecer no mueve nada de sitio ni tapa los
 * botones de la consola.
 */
export default function CarrilDeshacer({
  texto,
  etiquetaTexto,
  onDeshacer,
  onFoto,
  onTexto,
}: {
  texto: string;
  /** «¿Quién recibió?» en una entrega conforme; «Observación» en el resto. */
  etiquetaTexto: string;
  onDeshacer: () => void;
  onFoto: (foto: Blob) => void;
  onTexto: (valor: string) => void;
}) {
  const [escribiendo, setEscribiendo] = useState(false);
  const [valor, setValor] = useState("");
  const [miniatura, setMiniatura] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  // La miniatura es una URL de objeto: sin revocarla, cada foto de la jornada
  // deja su blob retenido en memoria.
  useEffect(() => () => { if (miniatura) URL.revokeObjectURL(miniatura); }, [miniatura]);

  async function tomarFoto(f: File | undefined) {
    if (!f) return;
    // Se comprime aquí, nada más volver de la cámara: en IndexedDB no entra
    // nunca un archivo de cuatro megas.
    const blob = await comprimirFoto(f);
    setMiniatura(URL.createObjectURL(blob));
    onFoto(blob);
  }

  return (
    <div className="carril fixed inset-x-0 bottom-[calc(var(--consola)+env(safe-area-inset-bottom))] z-50 mx-auto w-full max-w-[560px] px-3">
      {escribiendo ? (
        <div className="rounded-[10px] border border-navy-700 bg-navy-800 p-2.5">
          <label className="mb-1.5 block text-[13px] font-bold uppercase tracking-[0.1em] text-white/70">
            {etiquetaTexto}
          </label>
          <div className="flex gap-2">
            <input
              autoFocus
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="h-11 min-w-0 flex-1 rounded-[9px] border border-line-strong bg-surface px-3 text-[16px] text-ink"
            />
            <button
              onClick={() => {
                onTexto(valor.trim());
                setEscribiendo(false);
              }}
              className="h-11 w-[92px] shrink-0 rounded-[9px] bg-white text-[14px] font-bold text-navy-900"
            >
              Listo
            </button>
          </div>
        </div>
      ) : (
        <div className="flex h-14 items-center gap-2 rounded-[10px] border border-navy-700 bg-navy-800 px-2.5">
          <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-white">{texto}</span>
          {miniatura && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={miniatura}
              alt=""
              className="h-11 w-11 shrink-0 rounded-[9px] object-cover"
            />
          )}
          <button
            onClick={onDeshacer}
            className="h-11 w-[92px] shrink-0 rounded-[9px] bg-white text-[14px] font-bold text-navy-900"
          >
            Deshacer
          </button>
          <button
            onClick={() => archivo.current?.click()}
            aria-label="Añadir una foto"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[9px] border border-white/40 text-[17px] text-white"
          >
            📷
          </button>
          <button
            onClick={() => setEscribiendo(true)}
            aria-label={etiquetaTexto}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[9px] border border-white/40 text-[17px] text-white"
          >
            ✎
          </button>
        </div>
      )}

      <input
        ref={archivo}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => tomarFoto(e.target.files?.[0])}
      />
    </div>
  );
}
