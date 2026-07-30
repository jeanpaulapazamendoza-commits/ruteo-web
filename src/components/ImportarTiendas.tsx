"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";
import {
  interpretarFilas,
  plantillaCSV,
  COLUMNAS_PLANTILLA,
  type ResultadoLectura,
} from "@/lib/plantilla";

/** Separa una línea de CSV respetando comillas. */
function partirLinea(linea: string, sep: string) {
  const celdas: string[] = [];
  let actual = "";
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (enComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else enComillas = !enComillas;
    } else if (c === sep && !enComillas) {
      celdas.push(actual);
      actual = "";
    } else actual += c;
  }
  celdas.push(actual);
  return celdas.map((c) => c.trim());
}

function leerCSV(texto: string): unknown[][] {
  const limpio = texto.replace(/^﻿/, ""); // quitar BOM
  const lineas = limpio.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
  if (!lineas.length) return [];
  // Autodetecta el separador: tus exportaciones a veces usan ";"
  const cabecera = lineas[0];
  const sep = [";", ",", "\t"]
    .map((s) => ({ s, n: cabecera.split(s).length }))
    .sort((a, b) => b.n - a.n)[0].s;
  return lineas.map((l) => partirLinea(l, sep));
}

function descargar(nombre: string, contenido: string, tipo: string) {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportarTiendas({ orgId }: { orgId: string | null }) {
  const router = useRouter();
  const inputArchivo = useRef<HTMLInputElement>(null);

  const [abierto, setAbierto] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [lectura, setLectura] = useState<ResultadoLectura | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [fallo, setFallo] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  async function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setFallo(null);
    setExito(null);
    setLectura(null);
    setNombreArchivo(archivo.name);
    setAnalizando(true);

    try {
      let matriz: unknown[][];
      if (/\.xlsx?$/i.test(archivo.name)) {
        // El paquete no tiene entrada raíz: hay que pedir la variante de navegador.
        // Ojo: el export por defecto devuelve la LISTA DE HOJAS; `readSheet`
        // es el que devuelve las filas de la primera hoja.
        const { readSheet } = await import("read-excel-file/browser");
        matriz = (await readSheet(archivo)) as unknown[][];
      } else {
        matriz = leerCSV(await archivo.text());
      }
      setLectura(interpretarFilas(matriz));
    } catch (err) {
      setFallo(
        `No pude leer el archivo: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setAnalizando(false);
    }
  }

  async function guardar() {
    if (!lectura?.filas.length) return;
    if (!orgId) {
      setFallo("No encontré tu empresa. Vuelve a iniciar sesión.");
      return;
    }
    setGuardando(true);
    setFallo(null);

    try {
      const supabase = crearClienteNavegador();
      const registros = lectura.filas.map((f) => ({ ...f, org_id: orgId }));

      // En lotes: 1500 filas en una sola petición puede exceder el límite.
      const TAM = 400;
      let guardadas = 0;
      for (let i = 0; i < registros.length; i += TAM) {
        const lote = registros.slice(i, i + TAM);
        // Reimportar el mismo archivo actualiza en vez de fallar por el
        // índice único (org_id, codigo).
        const { error } = await supabase
          .from("tiendas")
          .upsert(lote, { onConflict: "org_id,codigo" });
        if (error) throw error;
        guardadas += lote.length;
      }

      // Deja constancia del archivo y asocia las tiendas que trajo.
      const { error: errImp } = await supabase.rpc("registrar_importacion", {
        p_nombre: nombreArchivo || "archivo.csv",
        p_filas: guardadas,
        p_codigos: lectura.filas.map((f) => f.codigo),
      });
      if (errImp) throw errImp;

      setExito(`${guardadas.toLocaleString("es-PE")} tiendas guardadas.`);
      setLectura(null);
      setNombreArchivo("");
      if (inputArchivo.current) inputArchivo.current.value = "";
      router.refresh();
    } catch (err) {
      setFallo(
        `No se pudieron guardar: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setAbierto((v) => !v)}
        className="rounded-[9px] border border-amber-600 bg-amber px-3.5 py-2 text-[13px] font-semibold text-[#231403] transition hover:bg-amber-600 hover:text-white"
      >
        ⇪ Importar Excel o CSV
      </button>

      {abierto && (
        <div className="mt-3 w-full rounded-[14px] border border-line bg-surface p-4">
          {/* Plantilla */}
          <div className="flex flex-wrap items-start gap-3 border-b border-line pb-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-[13.5px] font-bold">1. Usa la plantilla</h3>
              <p className="mt-1 text-[13px] text-ink-2">
                Solo <b>latitud</b> y <b>longitud</b> son obligatorias. Si ya
                tienes el archivo que usas en la app de Streamlit, súbelo tal
                cual: reconozco esos mismos encabezados.
              </p>
            </div>
            <button
              onClick={() =>
                descargar(
                  "plantilla_tiendas.csv",
                  plantillaCSV(),
                  "text/csv;charset=utf-8",
                )
              }
              className="rounded-[9px] border border-line-strong bg-surface px-3 py-2 text-[12.5px] font-semibold transition hover:bg-canvas"
            >
              ⤓ Descargar plantilla CSV
            </button>
          </div>

          <details className="border-b border-line py-3">
            <summary className="cursor-pointer text-[12.5px] font-semibold text-ink-2">
              Ver columnas admitidas
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[460px] text-[12.5px]">
                <tbody>
                  {COLUMNAS_PLANTILLA.map((c) => (
                    <tr key={c.nombre} className="border-b border-line/60">
                      <td className="num py-1.5 pr-3 font-semibold">
                        {c.nombre}
                      </td>
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

          {/* Archivo */}
          <div className="pt-4">
            <h3 className="text-[13.5px] font-bold">2. Sube tu archivo</h3>
            <input
              ref={inputArchivo}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv"
              onChange={alElegirArchivo}
              className="mt-2 block w-full text-[13px] text-ink-2 file:mr-3 file:cursor-pointer file:rounded-[9px] file:border file:border-line-strong file:bg-surface file:px-3 file:py-2 file:text-[12.5px] file:font-semibold file:text-ink hover:file:bg-canvas"
            />
            {analizando && (
              <p className="mt-2 text-[13px] text-ink-3">Leyendo {nombreArchivo}…</p>
            )}
          </div>

          {/* Resultado del análisis */}
          {lectura && (
            <div className="mt-4 rounded-[10px] border border-line bg-surface-2 p-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
                <span>
                  <b className="num text-[15px]">{lectura.filas.length}</b> tiendas
                  válidas
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
                        <span className="num font-semibold">Fila {e.fila}:</span>{" "}
                        {e.motivo}
                      </li>
                    ))}
                    {lectura.errores.length > 50 && (
                      <li className="text-ink-3">
                        …y {lectura.errores.length - 50} más
                      </li>
                    )}
                  </ul>
                </details>
              )}

              {lectura.filas.length > 0 && (
                <>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-[12px]">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wide text-ink-3">
                          <th className="py-1 pr-3">Código</th>
                          <th className="py-1 pr-3">Tienda</th>
                          <th className="py-1 pr-3">Distrito</th>
                          <th className="py-1 pr-3">Bultos</th>
                          <th className="py-1 pr-3">Ventana</th>
                          <th className="py-1">Coordenadas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lectura.filas.slice(0, 5).map((f) => (
                          <tr key={f.codigo} className="border-t border-line/60">
                            <td className="num py-1.5 pr-3">{f.codigo}</td>
                            <td className="py-1.5 pr-3">{f.nombre}</td>
                            <td className="py-1.5 pr-3 text-ink-2">
                              {f.distrito ?? "—"}
                            </td>
                            <td className="num py-1.5 pr-3">{f.bultos_default}</td>
                            <td className="num py-1.5 pr-3 text-ink-2">
                              {f.ventana_ini && f.ventana_fin
                                ? `${f.ventana_ini}–${f.ventana_fin}`
                                : "—"}
                            </td>
                            <td className="num py-1.5 text-ink-3">
                              {f.lat.toFixed(5)}, {f.lon.toFixed(5)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {lectura.filas.length > 5 && (
                    <p className="mt-1 text-[11.5px] text-ink-3">
                      Vista previa de las primeras 5 de {lectura.filas.length}.
                    </p>
                  )}

                  <button
                    onClick={guardar}
                    disabled={guardando}
                    className="mt-3 rounded-[9px] border border-amber-600 bg-amber px-4 py-2 text-[13px] font-semibold text-[#231403] transition hover:bg-amber-600 hover:text-white disabled:opacity-60"
                  >
                    {guardando
                      ? "Guardando…"
                      : `Guardar ${lectura.filas.length} tiendas`}
                  </button>
                </>
              )}
            </div>
          )}

          {fallo && (
            <p className="mt-3 rounded-[10px] border border-bad/30 bg-bad-bg px-3 py-2.5 text-[13px] text-bad">
              {fallo}
            </p>
          )}
          {exito && (
            <p className="mt-3 rounded-[10px] border border-ok/30 bg-ok-bg px-3 py-2.5 text-[13px] text-ok">
              ✓ {exito}
            </p>
          )}
        </div>
      )}
    </>
  );
}
