"use client";

import { useEffect, useRef, useState } from "react";
import {
  ESTADOS_ENTREGA,
  MOTIVOS_NO_ENTREGA,
  comprimirFoto,
  desglosarMotivo,
  type EstadoEntrega,
} from "@/lib/entregas";
import { resumenEntrega } from "@/lib/estadoParada";

export type DatosEntrega = {
  estado: EstadoEntrega;
  motivo: string | null;
  bultosEntregados: number | null;
  observaciones: string | null;
  recibe: string | null;
  foto: Blob | null;
};

export type ParadaHoja = {
  id: string;
  orden: number;
  codigo: string | null;
  nombre: string | null;
  distrito: string | null;
  bultos: number;
  estado_entrega: EstadoEntrega;
  hora_entrega: string | null;
  motivo: string | null;
  bultos_entregados: number | null;
  observaciones: string | null;
  recibe: string | null;
};

/**
 * Hoja de resultado: todo lo que no es «entregado conforme».
 *
 * Dos pasos, y nada sale de aquí hasta que el conductor pulsa GUARDAR. Elegir
 * el motivo o el número de bultos solo lo elige; antes guardaba en el mismo
 * toque y eso le quitaba al conductor la última ocasión de mirar lo que iba a
 * mandar.
 *
 * Ningún campo obligatorio tiene valor por defecto: un motivo preseleccionado
 * se graba solo, y entonces el informe de incidencias dice «Ausencia del
 * cliente» de cosas que no lo fueron.
 *
 * Los bultos se eligen en una rejilla de fichas y no en un `<input
 * type="number">`: no hay zoom de iOS, no hay teclado que tape media pantalla
 * y un valor inválido es imposible por construcción.
 */
export default function HojaResultado({
  parada,
  onCerrar,
  onGuardar,
  guardando,
}: {
  parada: ParadaHoja;
  onCerrar: () => void;
  onGuardar: (d: DatosEntrega) => void;
  guardando: boolean;
}) {
  const corrigiendo = parada.estado_entrega !== "pendiente";
  const anterior = corrigiendo ? desglosarMotivo(parada.motivo) : { opcion: "", detalle: "" };

  const [estado, setEstado] = useState<EstadoEntrega | null>(
    corrigiendo ? parada.estado_entrega : null,
  );
  const [recibe, setRecibe] = useState(parada.recibe ?? "");
  const [falto, setFalto] = useState(corrigiendo && parada.estado_entrega === "parcial" ? (parada.motivo ?? "") : "");
  const [motivo, setMotivo] = useState(anterior.opcion);
  // Los bultos se eligen aquí y se mandan con el botón. Tocar una ficha ya no
  // cierra la parada: el conductor decide cuándo sale la entrega.
  const [bultosElegidos, setBultosElegidos] = useState<number | null>(
    corrigiendo && parada.estado_entrega === "parcial" ? parada.bultos_entregados : null,
  );
  const [detalle, setDetalle] = useState(anterior.detalle);
  const [observaciones, setObservaciones] = useState(parada.observaciones ?? "");
  const [foto, setFoto] = useState<Blob | null>(null);
  const [miniatura, setMiniatura] = useState<string | null>(null);
  const [verObs, setVerObs] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  // El botón atrás de Android cierra la hoja en vez de salir de la ruta.
  useEffect(() => {
    history.pushState({ hoja: true }, "");
    const atras = () => onCerrar();
    window.addEventListener("popstate", atras);
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("popstate", atras);
      document.body.style.overflow = previo;
    };
  }, [onCerrar]);

  useEffect(() => () => { if (miniatura) URL.revokeObjectURL(miniatura); }, [miniatura]);

  async function tomarFoto(f: File | undefined) {
    if (!f) return;
    const blob = await comprimirFoto(f);
    setFoto(blob);
    setMiniatura(URL.createObjectURL(blob));
  }

  const comun = { observaciones: observaciones.trim() || null, foto };

  function guardarConforme() {
    onGuardar({
      ...comun,
      estado: "entregado",
      motivo: null,
      bultosEntregados: null,
      recibe: recibe.trim() || null,
    });
  }

  function guardarParcial(n: number) {
    onGuardar({
      ...comun,
      estado: "parcial",
      motivo: falto.trim() || null,
      bultosEntregados: n,
      recibe: recibe.trim() || null,
    });
  }

  function guardarFallido(opcion: string, texto = "") {
    onGuardar({
      ...comun,
      estado: "fallido",
      motivo: opcion === "Otros" ? `Otros: ${texto.trim()}` : opcion,
      bultosEntregados: null,
      recibe: null,
    });
  }

  const nombre = parada.nombre ?? parada.codigo ?? "Parada";

  return (
    <div className="fixed inset-0 z-50 bg-navy-900/45" onClick={onCerrar}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="hoja absolute inset-x-0 bottom-0 mx-auto flex max-h-[88dvh] w-full max-w-[560px] flex-col rounded-t-[14px] bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line-strong" />

        {/* Cabecera: de qué parada estamos hablando */}
        <div className="shrink-0 px-4 pb-3 pt-3">
          <h2 className="truncate text-[24px] font-extrabold leading-none tracking-tight text-ink">
            #{parada.orden} · {nombre}
          </h2>
          <p className="mt-1.5 text-[14px] font-medium text-ink-2">
            <span className="num">{parada.bultos}</span> bultos
            {parada.distrito ? ` · ${parada.distrito}` : ""}
            {parada.codigo ? ` · ${parada.codigo}` : ""}
          </p>
        </div>

        {corrigiendo && (
          <p className="shrink-0 border-t border-line px-4 py-2.5 text-[14px] text-ink-2">
            Ya la marcaste como <b>{ESTADOS_ENTREGA[parada.estado_entrega].texto}</b>
            {resumenEntrega({ ...parada, bultos: parada.bultos })?.includes("·")
              ? ` · ${parada.motivo ?? ""}`
              : ""}
            . Puedes corregirlo abajo.
          </p>
        )}

        {/* Adjuntos: fijos, siempre a la vista */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-t border-line px-3">
          <button
            onClick={() => archivo.current?.click()}
            className="h-11 rounded-[9px] border-2 border-line-strong bg-surface px-3 text-[14px] font-bold text-ink active:bg-canvas"
          >
            📷 Foto
          </button>
          <button
            onClick={() => setVerObs((v) => !v)}
            className="h-11 rounded-[9px] border-2 border-line-strong bg-surface px-3 text-[14px] font-bold text-ink active:bg-canvas"
          >
            ✎ Observación
          </button>
          {miniatura && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={miniatura} alt="" className="h-11 w-11 rounded-[9px] object-cover" />
          )}
          <button
            onClick={onCerrar}
            className="ml-auto h-11 rounded-[9px] px-3 text-[14px] font-bold text-ink-2"
          >
            Cerrar
          </button>
        </div>

        {verObs && (
          <div className="shrink-0 border-t border-line px-3 py-2.5">
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={2}
              placeholder="Lo que quieras dejar anotado"
              className="w-full rounded-[10px] border-2 border-line-strong bg-surface px-3 py-2 text-[16px]"
            />
          </div>
        )}

        {/* Decisión */}
        <div className="min-h-[280px] flex-1 overflow-y-auto border-t border-line p-3">
          {!estado ? (
            <Paso1 parada={parada} onElegir={setEstado} />
          ) : estado === "entregado" ? (
            <>
              <Etiqueta>¿Quién recibió? (opcional)</Etiqueta>
              <input
                value={recibe}
                onChange={(e) => setRecibe(e.target.value)}
                placeholder="Nombre de quien recibe"
                className="h-14 w-full rounded-[10px] border-2 border-line-strong bg-surface px-3 text-[16px]"
              />
              <BotonGuardar onClick={guardarConforme} guardando={guardando} impedido={null} />
              <Volver onClick={() => setEstado(null)} />
            </>
          ) : estado === "parcial" ? (
            <>
              <Etiqueta>¿Qué faltó? (opcional)</Etiqueta>
              <input
                value={falto}
                onChange={(e) => setFalto(e.target.value)}
                placeholder="Ej. faltaron 2 cajas de gaseosa"
                className="mb-4 h-14 w-full rounded-[10px] border-2 border-line-strong bg-surface px-3 text-[16px]"
              />
              <Etiqueta>¿Cuántos bultos entregaste? (de {parada.bultos})</Etiqueta>
              <RejillaBultos
                max={parada.bultos - 1}
                elegido={bultosElegidos}
                onElegir={setBultosElegidos}
              />
              <BotonGuardar
                onClick={() => guardarParcial(bultosElegidos as number)}
                guardando={guardando}
                impedido={bultosElegidos == null ? "Elige cuántos bultos entregaste." : null}
              />
              <Volver onClick={() => setEstado(null)} />
            </>
          ) : (
            <>
              <Etiqueta>¿Por qué no se entregó?</Etiqueta>
              <div className="flex flex-col gap-2">
                {MOTIVOS_NO_ENTREGA.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMotivo(m)}
                    className={`flex h-16 w-full items-center gap-3 rounded-[12px] border-2 px-4 text-left text-[17px] font-bold text-ink active:bg-canvas ${
                      motivo === m ? "border-bad bg-bad-bg" : "border-line-strong bg-surface"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {motivo === "Otros" && (
                <div className="mt-3">
                  <Etiqueta>Cuéntanos qué pasó</Etiqueta>
                  <input
                    autoFocus
                    value={detalle}
                    onChange={(e) => setDetalle(e.target.value)}
                    className="h-14 w-full rounded-[10px] border-2 border-line-strong bg-surface px-3 text-[16px]"
                  />
                </div>
              )}

              <BotonGuardar
                onClick={() => guardarFallido(motivo, detalle)}
                guardando={guardando}
                impedido={
                  !motivo
                    ? "Elige el motivo de la no entrega."
                    : motivo === "Otros" && !detalle.trim()
                      ? "Escribe qué pasó para poder guardar."
                      : null
                }
              />
              <Volver onClick={() => setEstado(null)} />
            </>
          )}
        </div>

        <input
          ref={archivo}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => tomarFoto(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}

/** Paso 1: qué pasó con la parada. Ninguna opción viene marcada. */
function Paso1({
  parada,
  onElegir,
}: {
  parada: ParadaHoja;
  onElegir: (e: EstadoEntrega) => void;
}) {
  // Con un solo bulto no existe la entrega parcial: la pregunta siguiente
  // sería «¿cuántos entregaste, entre 1 y 0?» y el conductor se atasca.
  const sinParcial = parada.bultos <= 1;
  return (
    <div className="flex flex-col gap-3">
      <Opcion
        glifo="✓"
        disco="bg-ok"
        borde="border-ok bg-ok-bg"
        activo={parada.estado_entrega === "entregado"}
        onClick={() => onElegir("entregado")}
      >
        Entregado conforme
      </Opcion>
      <Opcion
        glifo="◑"
        disco="bg-warn"
        borde="border-warn bg-warn-bg"
        activo={parada.estado_entrega === "parcial"}
        deshabilitado={sinParcial}
        onClick={() => onElegir("parcial")}
      >
        Entregado parcial
      </Opcion>
      {sinParcial && (
        <p className="-mt-1 text-[14px] font-semibold text-ink-2">
          Esta parada trae 1 bulto: es entregado o no entregado.
        </p>
      )}
      <Opcion
        glifo="✕"
        disco="bg-bad"
        borde="border-bad bg-bad-bg"
        activo={parada.estado_entrega === "fallido"}
        onClick={() => onElegir("fallido")}
      >
        No entregado
      </Opcion>
    </div>
  );
}

function Opcion({
  children, glifo, disco, borde, activo, deshabilitado = false, onClick,
}: {
  children: React.ReactNode;
  glifo: string;
  disco: string;
  borde: string;
  activo: boolean;
  deshabilitado?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-[76px] w-full items-center gap-3 rounded-[12px] border-2 px-4 text-left ${
        activo ? borde : "border-line-strong bg-surface"
      } ${deshabilitado ? "pointer-events-none opacity-50" : "active:bg-canvas"}`}
    >
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-[20px] text-white ${disco}`}
      >
        {glifo}
      </span>
      <span className="text-[17px] font-bold text-ink">{children}</span>
    </button>
  );
}

/**
 * Cuántos bultos se entregaron, en fichas.
 *
 * Tocar la ficha guarda: es el último dato obligatorio del camino parcial y
 * no hace falta confirmarlo dos veces. Con más de ocho bultos aparece un
 * teclado acotado al rango válido, para no llenar la pantalla de fichas.
 */
function RejillaBultos({
  max, elegido, onElegir,
}: {
  max: number;
  elegido: number | null;
  onElegir: (n: number) => void;
}) {
  const [teclado, setTeclado] = useState(false);
  const [buffer, setBuffer] = useState("");

  if (teclado) {
    const n = Number(buffer);
    const valido = Number.isFinite(n) && n >= 1 && n <= max && buffer !== "";
    return (
      <div>
        <div className="num mb-2 h-14 rounded-[10px] border-2 border-line-strong bg-surface px-3 text-[24px] font-extrabold leading-[3.25rem] text-ink">
          {buffer || "—"}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "←", "0", "OK"].map((t) => (
            <button
              key={t}
              onClick={() => {
                if (t === "←") setBuffer((b) => b.slice(0, -1));
                else if (t === "OK") { if (valido) { onElegir(n); setTeclado(false); } }
                else setBuffer((b) => (b + t).replace(/^0+/, "").slice(0, 4));
              }}
              className={`num h-16 rounded-[12px] border-2 border-line-strong text-[24px] font-extrabold text-ink active:bg-canvas ${
                t === "OK" && valido ? "border-amber-600 bg-amber text-navy-900" : "bg-surface"
              } ${t === "OK" && !valido ? "opacity-40" : ""}`}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[14px] font-semibold text-ink-2">
          Entre <span className="num">1</span> y <span className="num">{max}</span>.
        </p>
        <button
          onClick={() => setTeclado(false)}
          className="mt-2 h-11 text-[14px] font-bold text-ink-2"
        >
          Volver a las fichas
        </button>
      </div>
    );
  }

  const fichas = Array.from({ length: Math.min(max, 8) }, (_, i) => i + 1);
  return (
    <div className="grid grid-cols-4 gap-2">
      {fichas.map((n) => (
        <button
          key={n}
          onClick={() => onElegir(n)}
          className={`num h-16 rounded-[12px] border-2 text-[24px] font-extrabold text-ink active:border-amber-600 active:bg-amber ${
            elegido === n ? "border-amber-600 bg-amber-050" : "border-line-strong bg-surface"
          }`}
        >
          {n}
        </button>
      ))}
      {max > 8 && (
        <button
          onClick={() => setTeclado(true)}
          className="h-16 rounded-[12px] border-2 border-line-strong bg-surface text-[14px] font-bold text-ink active:bg-canvas"
        >
          Más…
        </button>
      )}
    </div>
  );
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[13px] font-bold uppercase tracking-[0.1em] text-ink-2">{children}</p>
  );
}

/**
 * El botón que manda la entrega.
 *
 * Cuando falta algo no se apaga sin más: dice qué falta. Un botón atenuado y
 * mudo deja al conductor tocándolo en mitad de la calle sin entender por qué
 * no pasa nada.
 */
function BotonGuardar({
  onClick, guardando, impedido,
}: {
  onClick: () => void;
  guardando: boolean;
  impedido: string | null;
}) {
  return (
    <>
      <button
        onClick={onClick}
        disabled={guardando || !!impedido}
        className="mt-3 h-[72px] w-full rounded-[10px] border border-amber-600 bg-amber text-[17px] font-extrabold text-navy-900 active:bg-amber-600 disabled:pointer-events-none disabled:opacity-50"
      >
        {guardando ? "Guardando…" : "GUARDAR"}
      </button>
      {impedido && <p className="mt-2 text-[14px] font-semibold text-ink-2">{impedido}</p>}
    </>
  );
}

function Volver({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mt-2 h-11 w-full text-[14px] font-bold text-ink-2">
      ‹ Elegir otro resultado
    </button>
  );
}
