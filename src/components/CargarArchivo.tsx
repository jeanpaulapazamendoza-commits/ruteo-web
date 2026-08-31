"use client";

import { useRef, useState } from "react";
import {
  leerArchivo,
  aPuntos,
  plantillaCSV,
  COLUMNAS_PLANTILLA,
  type ResultadoLectura,
  type PuntoPlan,
} from "@/lib/plantilla";

function descargar(nombre: string, contenido: string, tipo: string) {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Lector del archivo del día. No toca la base de datos: entrega los puntos al
 * planificador y ahí se quedan hasta que se guarde el despacho.
 */
export default function CargarArchivo({
  hayPuntos,
  onListo,
  onCerrar,
}: {
  hayPuntos: boolean;
  onListo: (
    puntos: PuntoPlan[],
    nombreArchivo: string,
    modo: "reemplazar" | "anadir",
    alias: string,
  ) => void;
  onCerrar?: () => void;
}) {
  const inputArchivo = useRef<HTMLInputElement>(null);
  const [analizando, setAnalizando] = useState(false);
  const [lectura, setLectura] = useState<ResultadoLectura | null>(null);
  const [nombre, setNombre] = useState("");
  const [alias, setAlias] = useState("");
  const [fallo, setFallo] = useState<string | null>(null);

  async function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setFallo(null);
    setLectura(null);
    setNombre(archivo.name);
    // Un nombre por defecto que ya sirve: la fecha de hoy. Se puede cambiar,
    // pero nunca queda un ruteo sin forma de identificarlo.
    setAlias((a) => a || `Reparto ${new Date().toLocaleDateString("es-PE")}`);
    setAnalizando(true);
    try {
      setLectura(await leerArchivo(archivo));
    } catch (err) {
      setFallo(`No pude leer el archivo: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAnalizando(false);
    }
  }

  function usar(modo: "reemplazar" | "anadir") {
    if (!lectura?.filas.length) return;
    onListo(aPuntos(lectura.filas), nombre || "archivo.csv", modo, alias.trim());
    setLectura(null);
    setNombre("");
    setAlias("");
    if (inputArchivo.current) inputArchivo.current.value = "";
  }

  return (
    <div className="rounded-[14px] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start gap-3 border-b border-line pb-3.5">
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-bold tracking-tight">
            {hayPuntos ? "Cargar otro archivo" : "Sube el archivo del día"}
          </h3>
          <p className="mt-1 text-[12.5px] text-ink-2">
            Excel o CSV. Solo <b>latitud</b> y <b>longitud</b> son obligatorias.
            Si ya tienes el archivo que usas en Streamlit, súbelo tal cual:
            reconozco esos mismos encabezados.
          </p>
        </div>
        <button
          onClick={() => descargar("plantilla_tiendas.csv", plantillaCSV(), "text/csv;charset=utf-8")}
          className="rounded-[9px] border border-line-strong bg-surface px-3 py-2 text-[12.5px] font-semibold transition hover:bg-canvas"
        >
          ⤓ Plantilla CSV
        </button>
      </div>

      <details className="border-b border-line py-2.5">
        <summary className="cursor-pointer text-[12.5px] font-semibold text-ink-2">
          Ver columnas admitidas
        </summary>
        <div className="mt-2.5 overflow-x-auto">
          <table className="w-full min-w-[420px] text-[12.5px]">
            <tbody>
              {COLUMNAS_PLANTILLA.map((c) => (
                <tr key={c.nombre} className="border-b border-line/60">
                  <td className="num py-1.5 pr-3 font-semibold">{c.nombre}</td>
                  <td className="py-1.5 pr-3">
                    {c.obligatoria ? (
                      <span className="rounded-full bg-amber-050 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-600">
                        obligatoria
                      </span>
                    ) : (
                      <span className="text-[11px] text-ink-3">opcional</span>
                    )}
                  </td>
                  <td className="py-1.5 text-ink-2">{c.descripcion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="pt-3.5">
        <input
          ref={inputArchivo}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv"
          onChange={alElegirArchivo}
          className="block w-full text-[13px] text-ink-2 file:mr-3 file:cursor-pointer file:rounded-[9px] file:border file:border-line-strong file:bg-surface file:px-3 file:py-2 file:text-[12.5px] file:font-semibold file:text-ink hover:file:bg-canvas"
        />
        {analizando && <p className="mt-2 text-[13px] text-ink-3">Leyendo {nombre}…</p>}
      </div>

      {lectura && (
        <div className="mt-3.5 rounded-[10px] border border-line bg-surface-2 p-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
            <span>
              <b className="num text-[15px]">{lectura.filas.length}</b> puntos válidos
            </span>
            <span className="text-ink-3">
              de <span className="num">{lectura.totalLeidas}</span> filas leídas
            </span>
            {lectura.errores.length > 0 && (
              <span className="text-warn">
                <b className="num">{lectura.errores.length}</b> con problemas
              </span>
            )}
          </div>

          {Object.keys(lectura.columnasDetectadas).length > 0 && (
            <p className="mt-2 text-[12px] text-ink-3">
              Columnas reconocidas:{" "}
              {Object.entries(lectura.columnasDetectadas)
                .map(([campo, col]) => `${col} → ${campo}`)
                .join(" · ")}
            </p>
          )}

          {lectura.errores.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[12.5px] font-semibold text-warn">
                Ver filas con problemas
              </summary>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-[12px] text-ink-2">
                {lectura.errores.slice(0, 50).map((e, i) => (
                  <li key={i}>
                    <span className="num font-semibold">Fila {e.fila}:</span> {e.motivo}
                  </li>
                ))}
                {lectura.errores.length > 50 && (
                  <li className="text-ink-3">…y {lectura.errores.length - 50} más</li>
                )}
              </ul>
            </details>
          )}

          {lectura.filas.length > 0 && (
            <label className="mt-3 block">
              <span className="mb-1 block text-[11.5px] font-semibold text-ink-2">
                Nombre del ruteo
              </span>
              <input
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="Ej. Reparto Norte lunes"
                className="w-full rounded-[9px] border border-line-strong bg-surface px-2.5 py-2 text-[13.5px]"
              />
              <span className="mt-1 block text-[11px] text-ink-3">
                Con este nombre lo encontrarás luego en Despachos y en la torre.
              </span>
            </label>
          )}

          {lectura.filas.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => usar("reemplazar")}
                className="rounded-[9px] border border-amber-600 bg-amber px-4 py-2 text-[13px] font-semibold text-navy-900 transition hover:bg-amber-600 hover:text-white"
              >
                {hayPuntos
                  ? `Reemplazar por estos ${lectura.filas.length}`
                  : `Planificar estos ${lectura.filas.length} puntos`}
              </button>
              {hayPuntos && (
                <button
                  onClick={() => usar("anadir")}
                  className="rounded-[9px] border border-line-strong bg-surface px-4 py-2 text-[13px] font-semibold transition hover:bg-canvas"
                >
                  + Añadir a los actuales
                </button>
              )}
              {onCerrar && (
                <button
                  onClick={onCerrar}
                  className="rounded-[9px] border border-line-strong bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink-2 transition hover:bg-canvas"
                >
                  Cancelar
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {fallo && (
        <p className="mt-3 rounded-[10px] border border-bad/30 bg-bad-bg px-3 py-2.5 text-[13px] text-bad">
          {fallo}
        </p>
      )}

      <p className="mt-3 text-[11.5px] text-ink-3">
        Nada se guarda todavía: los puntos viven en esta pantalla hasta que
        pulses <b>Guardar despacho</b>.
      </p>
    </div>
  );
}
