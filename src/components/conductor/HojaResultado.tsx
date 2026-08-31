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
  const [teclado, setTeclado] = useState(false);
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

  /**
   * Qué se pregunta en cada paso, y qué falta para poder guardar.
   *
   * La pregunta ocupa el sitio de los datos de la parada en la cabecera en vez
   * de una fila propia dentro del cuerpo: en una pantalla de móvil ese renglón
   * era la diferencia entre ver las cinco opciones o dejar la primera fuera.
   */
  const paso = !estado
    ? { pregunta: null, guardar: null, impedido: null }
    : estado === "entregado"
      ? { pregunta: "¿Quién recibió? (opcional)", guardar: guardarConforme, impedido: null }
      : estado === "parcial"
        ? {
            pregunta: `¿Cuántos bultos entregaste? (de ${parada.bultos})`,
            guardar: () => guardarParcial(bultosElegidos as number),
            impedido: bultosElegidos == null ? "Elige cuántos bultos entregaste." : null,
          }
        : {
            pregunta: "¿Por qué no se entregó?",
            guardar: () => guardarFallido(motivo, detalle),
            impedido: !motivo
              ? "Elige el motivo de la no entrega."
              : motivo === "Otros" && !detalle.trim()
                ? "Escribe qué pasó para poder guardar."
                : null,
          };

  return (
    <div className="fixed inset-0 z-50 bg-navy-900/45" onClick={onCerrar}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="hoja absolute inset-x-0 bottom-0 mx-auto flex max-h-[94dvh] w-full max-w-[560px] flex-col rounded-t-[14px] bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong" />

        {/* Cabecera: de qué parada hablamos, y qué se está preguntando */}
        <div className="flex shrink-0 items-start gap-1 px-2 pb-2.5 pt-2">
          {estado && (
            <button
              onClick={() => setEstado(null)}
              aria-label="Elegir otro resultado"
              className="-ml-1 grid h-11 w-9 shrink-0 place-items-center text-[20px] text-ink-2 active:bg-canvas"
            >
              ‹
            </button>
          )}
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 className="truncate text-[22px] font-extrabold leading-none tracking-tight text-ink">
              #{parada.orden} · {nombre}
            </h2>
            <p className="mt-1 truncate text-[14px] font-semibold text-ink-2">
              {paso.pregunta ?? (
                <>
                  <span className="num">{parada.bultos}</span> bultos
                  {parada.distrito ? ` · ${parada.distrito}` : ""}
                  {parada.codigo ? ` · ${parada.codigo}` : ""}
                </>
              )}
            </p>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-[18px] text-ink-2 active:bg-canvas"
          >
            ✕
          </button>
        </div>

        {corrigiendo && (
          <p className="shrink-0 border-t border-line px-3 py-2 text-[14px] text-ink-2">
            Ya la marcaste como <b>{ESTADOS_ENTREGA[parada.estado_entrega].texto}</b>
            {resumenEntrega({ ...parada, bultos: parada.bultos })?.includes("·")
              ? ` · ${parada.motivo ?? ""}`
              : ""}
            . Puedes corregirlo abajo.
          </p>
        )}

        {/* Adjuntos: fijos, siempre a la vista */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-t border-line px-3">
          <button
            onClick={() => archivo.current?.click()}
            className="h-10 rounded-[9px] border-2 border-line-strong bg-surface px-3 text-[14px] font-bold text-ink active:bg-canvas"
          >
            📷 Foto
          </button>
          <button
            onClick={() => setVerObs((v) => !v)}
            className="h-10 rounded-[9px] border-2 border-line-strong bg-surface px-3 text-[14px] font-bold text-ink active:bg-canvas"
          >
            ✎ Observación
          </button>
          {miniatura && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={miniatura} alt="" className="ml-auto h-10 w-10 rounded-[9px] object-cover" />
          )}
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

        {/* Decisión. `min-h-0` es lo que permite que esta zona ceda y haga
            scroll en vez de empujar el botón de guardar fuera de la pantalla. */}
        <div className="sombras-scroll min-h-0 flex-1 overflow-y-auto border-t border-line p-3">
          {!estado ? (
            <Paso1 parada={parada} onElegir={setEstado} />
          ) : estado === "entregado" ? (
            <input
              value={recibe}
              onChange={(e) => setRecibe(e.target.value)}
              placeholder="Nombre de quien recibe"
              className="h-14 w-full rounded-[10px] border-2 border-line-strong bg-surface px-3 text-[16px]"
            />
          ) : estado === "parcial" ? (
            <>
              {/* Con el teclado abierto este campo opcional se retira: es lo
                  que empujaba la última fila de teclas fuera de la pantalla. */}
              {!teclado && (
                <input
                  value={falto}
                  onChange={(e) => setFalto(e.target.value)}
                  placeholder="¿Qué faltó? (opcional)"
                  className="mb-3 h-14 w-full rounded-[10px] border-2 border-line-strong bg-surface px-3 text-[16px]"
                />
              )}
              <RejillaBultos
                max={parada.bultos - 1}
                elegido={bultosElegidos}
                teclado={teclado}
                onTeclado={setTeclado}
                onElegir={setBultosElegidos}
              />
            </>
          ) : (
            <>
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
                <input
                  autoFocus
                  value={detalle}
                  onChange={(e) => setDetalle(e.target.value)}
                  placeholder="Cuéntanos qué pasó"
                  className="mt-3 h-14 w-full rounded-[10px] border-2 border-line-strong bg-surface px-3 text-[16px]"
                />
              )}
            </>
          )}
        </div>

        {/* Guardar, anclado. Vivía dentro de la zona que hace scroll y en un
            móvil quedaba por debajo del borde: el conductor no lo veía. */}
        {paso.guardar && (
          <div className="shrink-0 border-t border-line px-3 pb-3 pt-2.5">
            {paso.impedido && (
              <p className="mb-2 text-[14px] font-semibold text-ink-2">{paso.impedido}</p>
            )}
            <button
              onClick={paso.guardar}
              disabled={guardando || !!paso.impedido}
              className="h-[72px] w-full rounded-[10px] border border-amber-600 bg-amber text-[17px] font-extrabold text-navy-900 active:bg-amber-600 disabled:pointer-events-none disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "GUARDAR"}
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
 * Con más de ocho bultos aparece un teclado acotado al rango válido, para no
 * llenar la pantalla de fichas.
 *
 * El teclado no tiene tecla «OK»: cada dígito fija ya el número, y confirmar
 * es GUARDAR, que está anclado al pie. La tenía, y era la cuarta fila del
 * teclado —la primera que se cae por debajo del borde en un móvil—, así que
 * el conductor tecleaba la cantidad, la veía en el visor y no encontraba la
 * tecla que la validaba, con GUARDAR apagado sin explicación.
 */
function RejillaBultos({
  max, elegido, teclado, onTeclado, onElegir,
}: {
  max: number;
  elegido: number | null;
  teclado: boolean;
  onTeclado: (v: boolean) => void;
  onElegir: (n: number | null) => void;
}) {
  const [buffer, setBuffer] = useState(elegido ? String(elegido) : "");
  // Lo tecleado vive además en una referencia: dos toques rápidos ocurren
  // antes de que React vuelva a pintar, y leyendo el estado el segundo dígito
  // se comía al primero.
  const tecleado = useRef(buffer);

  if (teclado) {
    const leer = (b: string) => {
      const n = Number(b);
      return b !== "" && Number.isFinite(n) && n >= 1 && n <= max ? n : null;
    };
    const escribir = (t: string) => {
      const b =
        t === "←"
          ? tecleado.current.slice(0, -1)
          : (tecleado.current + t).replace(/^0+/, "").slice(0, 4);
      tecleado.current = b;
      setBuffer(b);
      onElegir(leer(b));
    };
    const n = leer(buffer);

    return (
      <div>
        <div
          className={`num mb-2 flex h-12 items-center rounded-[10px] border-2 px-3 text-[24px] font-extrabold ${
            n ? "border-amber-600 bg-amber-050 text-ink" : "border-line-strong bg-surface text-ink-2"
          }`}
        >
          {buffer || "—"}
          <span className="ml-auto text-[14px] font-semibold text-ink-2">
            de <span className="num">{max + 1}</span>
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "←"].map((t, i) =>
            t === "" ? (
              <span key={`hueco-${i}`} />
            ) : (
              <button
                key={t}
                onClick={() => escribir(t)}
                className="num h-14 rounded-[12px] border-2 border-line-strong bg-surface text-[24px] font-extrabold text-ink active:bg-canvas"
              >
                {t}
              </button>
            ),
          )}
        </div>
        <p className="mt-2 text-[14px] font-semibold text-ink-2">
          Entre <span className="num">1</span> y <span className="num">{max}</span>.
        </p>
        <button
          onClick={() => onTeclado(false)}
          className="mt-1 h-11 text-[14px] font-bold text-ink-2"
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
          onClick={() => onTeclado(true)}
          className="h-16 rounded-[12px] border-2 border-line-strong bg-surface text-[14px] font-bold text-ink active:bg-canvas"
        >
          Más…
        </button>
      )}
    </div>
  );
}



