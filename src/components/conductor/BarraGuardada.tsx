"use client";

import { useEffect, useRef, useState } from "react";
import { comprimirFoto } from "@/lib/entregas";

/**
 * Lo que pasó con la última entrega, y qué se le puede añadir todavía.
 *
 * Sustituye al carril de deshacer, que duraba ocho segundos. Aquel plazo se
 * dimensionó para cancelar un toque, pero también era el único sitio desde el
 * que adjuntar la foto o el nombre de quien recibió — y hacer una foto o
 * teclear un nombre en la calle nunca baja de diez segundos. Al vencer, la
 * barra se desmontaba llevándose el campo de texto a medio escribir y el
 * `<input>` al que la cámara iba a escribir: los dos datos se perdían enteros,
 * sin aviso.
 *
 * Ahora no vence. Se queda hasta que el conductor cierra la parada siguiente o
 * la descarta él mismo, así que la cámara puede tardar lo que haga falta.
 */
export default function BarraGuardada({
  texto,
  etiquetaTexto,
  subida,
  onFoto,
  onTexto,
  onCorregir,
  onCerrar,
}: {
  texto: string;
  /** «¿Quién recibió?» en una entrega conforme; «Observación» en el resto. */
  etiquetaTexto: string;
  /** Si llegó al servidor. En falso, sigue solo en el móvil. */
  subida: boolean;
  onFoto: (foto: Blob) => void;
  onTexto: (valor: string) => void;
  onCorregir: () => void;
  onCerrar: () => void;
}) {
  const [escribiendo, setEscribiendo] = useState(false);
  const [valor, setValor] = useState("");
  const [miniatura, setMiniatura] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [comprimiendo, setComprimiendo] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  // Cada foto de la jornada dejaría su blob retenido en memoria.
  useEffect(() => () => { if (miniatura) URL.revokeObjectURL(miniatura); }, [miniatura]);

  async function tomarFoto(f: File | undefined) {
    if (!f) return;
    setAviso(null);
    setComprimiendo(true);
    try {
      // Se reduce aquí, nada más volver de la cámara: en el móvil no se guarda
      // nunca un archivo de cuatro megas.
      const blob = await comprimirFoto(f);
      setMiniatura(URL.createObjectURL(blob));
      onFoto(blob);
    } catch {
      // Formatos que el navegador no sabe decodificar (HEIC de iPhone en
      // Android), o memoria justa. La entrega ya está guardada; lo único que
      // falla es la foto, y hay que decirlo en vez de dejar creer que se
      // adjuntó.
      setAviso("No se pudo procesar la foto. Vuelve a intentarlo.");
    } finally {
      setComprimiendo(false);
    }
  }

  return (
    /* z-40, el mismo nivel que la consola y por debajo de las hojas (z-50).
       Estando también en z-50 ganaba por ir después en el DOM: se pintaba
       encima del aviso «Tienes N entregas sin subir» al cerrar sesión —justo
       el aviso que evita perderlas— y seguía respondiendo a los toques por
       encima de un diálogo que debería bloquear la pantalla. */
    <div className="carril fixed inset-x-0 bottom-[calc(var(--consola)+env(safe-area-inset-bottom))] z-40 mx-auto w-full max-w-[560px] px-3">
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
                if (valor.trim()) onTexto(valor.trim());
                setEscribiendo(false);
              }}
              className="h-11 w-[92px] shrink-0 rounded-[9px] bg-white text-[14px] font-bold text-navy-900"
            >
              Listo
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-[10px] border border-navy-700 bg-navy-800 px-2.5 py-2">
          <div className="flex h-11 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-white">
              {subida ? "✓ " : "↑ "}
              {texto}
            </span>
            {miniatura && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={miniatura} alt="" className="h-11 w-11 shrink-0 rounded-[9px] object-cover" />
            )}
            <button
              onClick={() => archivo.current?.click()}
              disabled={comprimiendo}
              aria-label="Añadir una foto"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-[9px] border border-white/40 text-[17px] text-white disabled:opacity-50"
            >
              {comprimiendo ? "…" : "📷"}
            </button>
            <button
              onClick={() => setEscribiendo(true)}
              aria-label={etiquetaTexto}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-[9px] border border-white/40 text-[17px] text-white"
            >
              ✎
            </button>
            <button
              onClick={onCorregir}
              className="h-11 shrink-0 rounded-[9px] bg-white px-3 text-[14px] font-bold text-navy-900"
            >
              Corregir
            </button>
            <button
              onClick={onCerrar}
              aria-label="Ocultar este aviso"
              className="grid h-11 w-8 shrink-0 place-items-center text-[17px] text-white/70"
            >
              ✕
            </button>
          </div>

          {!subida && (
            <p className="mt-1 text-[13px] font-semibold text-white/80">
              Guardada en el móvil · sube sola al recuperar señal
            </p>
          )}
          {aviso && <p className="mt-1 text-[13px] font-bold text-white">{aviso}</p>}
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
