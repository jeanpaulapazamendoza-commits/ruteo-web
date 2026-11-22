"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { borrarBase, guardarBase, type Base } from "@/app/acciones/bases";
import { Tarjeta } from "@/components/ui";

const CAMPO =
  "w-full rounded-[8px] border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-amber";

/** «-12.0931, -77.0465», tal como se copia de un mapa. */
function leerCoordenadas(texto: string): { lat: number; lon: number } | null {
  const m = texto.trim().match(/^(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1].replace(",", "."));
  const lon = Number(m[2].replace(",", "."));
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/**
 * Las bases de la empresa: de dónde sale la flota.
 *
 * Con una sola, sirve para no teclear las coordenadas del centro en cada
 * planificación. Con varias, el planificador deja decir de cuál sale cada
 * tipo de vehículo y reparte los puntos contando con eso.
 */
export default function GestionBases({ lista }: { lista: Base[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<string | "nueva" | null>(null);
  const [nombre, setNombre] = useState("");
  const [coords, setCoords] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const punto = leerCoordenadas(coords);

  function abrir(b: Base | null) {
    setEditando(b ? b.id : "nueva");
    setNombre(b?.nombre ?? "");
    setCoords(b ? `${b.lat}, ${b.lon}` : "");
    setError(null);
  }

  async function guardar() {
    if (!punto || !nombre.trim()) return;
    setOcupado(true);
    setError(null);
    try {
      await guardarBase({
        id: editando === "nueva" ? null : editando,
        nombre,
        lat: punto.lat,
        lon: punto.lon,
      });
      setEditando(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  async function quitar(b: Base) {
    if (!window.confirm(`¿Quitar la base «${b.nombre}»?\n\nLas rutas que ya salieron de ella no cambian.`)) return;
    setOcupado(true);
    setError(null);
    try {
      await borrarBase(b.id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  const formulario = (
    <div className="flex flex-wrap items-end gap-2 border-t border-line bg-surface-2 px-4 py-3">
      <label className="block min-w-[180px] flex-1">
        <span className="mb-1 block text-[11.5px] font-semibold text-ink-2">Nombre</span>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Almacén Norte"
          className={CAMPO}
          autoFocus
        />
      </label>
      <label className="block min-w-[200px] flex-1">
        <span className="mb-1 flex justify-between text-[11.5px] font-semibold text-ink-2">
          Coordenadas (latitud, longitud)
          {coords && !punto && <span className="font-normal text-bad">No se entienden</span>}
        </span>
        <input
          value={coords}
          onChange={(e) => setCoords(e.target.value)}
          placeholder="-12.0464, -77.0428"
          className={`${CAMPO} num`}
        />
      </label>
      <button
        onClick={guardar}
        disabled={ocupado || !punto || !nombre.trim()}
        className="rounded-full border border-amber-600 bg-amber px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
      >
        {ocupado ? "Guardando…" : "Guardar"}
      </button>
      <button
        onClick={() => setEditando(null)}
        className="rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold transition hover:bg-canvas"
      >
        Cancelar
      </button>
    </div>
  );

  return (
    <div className="p-4">
      <Tarjeta className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <p className="min-w-0 flex-1 text-[12.5px] text-ink-2">
            Los centros de los que salen tus vehículos. En el planificador puedes elegir una
            como centro del despacho, o decir de cuál sale cada tipo de vehículo.
          </p>
          {editando === null && (
            <button
              onClick={() => abrir(null)}
              className="rounded-full border border-amber-600 bg-amber px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-amber-600"
            >
              ＋ Nueva base
            </button>
          )}
        </div>

        {editando === "nueva" && formulario}

        {lista.length === 0 && editando !== "nueva" ? (
          <p className="border-t border-line px-4 py-6 text-center text-[13px] text-ink-3">
            Todavía no hay ninguna base guardada.
          </p>
        ) : (
          lista.map((b) => (
            <div key={b.id} className="border-t border-line">
              <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">{b.nombre}</span>
                  <span className="num block text-[11.5px] text-ink-3">
                    {b.lat.toFixed(5)}, {b.lon.toFixed(5)}
                  </span>
                </span>
                <a
                  href={`https://www.google.com/maps?q=${b.lat},${b.lon}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12px] font-semibold text-amber-600 underline underline-offset-2"
                >
                  Ver en el mapa
                </a>
                <button
                  onClick={() => abrir(b)}
                  disabled={ocupado}
                  className="rounded-full border border-line-strong bg-surface px-3 py-1 text-[12px] font-semibold transition hover:bg-canvas"
                >
                  Editar
                </button>
                <button
                  onClick={() => quitar(b)}
                  disabled={ocupado}
                  className="rounded-full border border-line-strong bg-surface px-3 py-1 text-[12px] font-semibold text-bad transition hover:bg-bad-bg"
                >
                  Quitar
                </button>
              </div>
              {editando === b.id && formulario}
            </div>
          ))
        )}

        {error && (
          <p className="border-t border-line bg-bad-bg px-4 py-2 text-[12.5px] text-bad">{error}</p>
        )}
      </Tarjeta>
    </div>
  );
}
