"use client";

import { useEffect, useRef, useState } from "react";
import { comprimirFoto } from "@/lib/entregas";
import { IconoCamara, IconoCerrar, IconoCheck, IconoLapiz } from "@/components/conductor/iconos";

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
const CAJA =
  "rounded-[16px] border border-line bg-surface px-2.5 py-2 shadow-[0_6px_20px_rgba(19,32,69,0.14)]";
const ACCION =
  "flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-3 text-[14px] font-bold text-ink active:bg-canvas disabled:opacity-50";

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
    <div className="carril fixed inset-x-0 bottom-[calc(var(--consola)+env(safe-area-inset-bottom)+8px)] z-40 mx-auto w-full max-w-[560px] px-4">
      {escribiendo ? (
        <div className={CAJA}>
          <label className="mb-1.5 block px-1 text-[13px] font-bold text-ink-2">{etiquetaTexto}</label>
          <div className="flex gap-2">
            <input
              autoFocus
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="h-11 min-w-0 flex-1 rounded-full border border-line-strong bg-surface px-4 text-[16px] text-ink"
            />
            <button
              onClick={() => {
                if (valor.trim()) onTexto(valor.trim());
                setEscribiendo(false);
              }}
              className="h-11 shrink-0 rounded-full bg-amber px-5 text-[14px] font-bold text-white active:bg-amber-600"
            >
              Listo
            </button>
          </div>
        </div>
      ) : (
        <div className={CAJA}>
          {/* Arriba, qué se guardó, entero. Antes compartía fila con cuatro
              botones y en un móvil se leía «#2 no entreg…». */}
          <div className="flex h-9 items-center gap-2 pl-1">
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                subida ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn"
              }`}
            >
              <IconoCheck tam={13} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">{texto}</span>
            {miniatura && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={miniatura} alt="" className="h-8 w-8 shrink-0 rounded-[8px] object-cover" />
            )}
            <button
              onClick={onCerrar}
              aria-label="Ocultar este aviso"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-3 active:bg-canvas"
            >
              <IconoCerrar tam={16} />
            </button>
          </div>

          {/* Debajo, lo que todavía se le puede añadir, con su nombre. */}
          <div className="mt-1 flex items-center gap-1.5">
            <button
              onClick={() => archivo.current?.click()}
              disabled={comprimiendo}
              className={ACCION}
            >
              <IconoCamara tam={16} /> {comprimiendo ? "…" : "Foto"}
            </button>
            <button onClick={() => setEscribiendo(true)} className={`${ACCION} min-w-0`}>
              <IconoLapiz tam={16} />
              <span className="truncate">{etiquetaTexto.replace(/[¿?]/g, "")}</span>
            </button>
            <button
              onClick={onCorregir}
              className="ml-auto h-9 shrink-0 rounded-full px-3 text-[14px] font-bold text-amber-600 active:bg-amber-050"
            >
              Corregir
            </button>
          </div>

          {!subida && (
            <p className="mt-1.5 px-1 text-[13px] font-medium text-ink-2">
              Guardada en el móvil · sube sola al recuperar señal
            </p>
          )}
          {aviso && <p className="mt-1.5 px-1 text-[13px] font-bold text-bad">{aviso}</p>}
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
