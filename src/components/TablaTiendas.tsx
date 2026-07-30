"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { Pastilla } from "@/components/ui";

export type TiendaFila = {
  id: string;
  codigo: string;
  nombre: string;
  distrito: string | null;
  lat: number;
  lon: number;
  bultos_default: number;
  prioridad: number;
  ventana_ini: string | null;
  ventana_fin: string | null;
  activo: boolean;
};

const hhmm = (h: string | null) => (h ? h.slice(0, 5) : null);

export default function TablaTiendas({
  tiendas,
  total,
  /** Carga a la que pertenecen, para poder borrarla entera. */
  cargaId,
  esSinArchivo = false,
  nombreCarga,
}: {
  tiendas: TiendaFila[];
  total: number;
  cargaId?: string | null;
  esSinArchivo?: boolean;
  nombreCarga?: string;
}) {
  const router = useRouter();
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmarTodo, setConfirmarTodo] = useState(false);

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return tiendas;
    return tiendas.filter(
      (t) =>
        t.codigo.toLowerCase().includes(q) ||
        t.nombre.toLowerCase().includes(q) ||
        (t.distrito ?? "").toLowerCase().includes(q),
    );
  }, [tiendas, filtro]);

  const todasVisiblesMarcadas =
    visibles.length > 0 && visibles.every((t) => seleccion.has(t.id));

  function alternar(id: string) {
    setSeleccion((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function alternarTodas() {
    setSeleccion((prev) => {
      const s = new Set(prev);
      if (todasVisiblesMarcadas) visibles.forEach((t) => s.delete(t.id));
      else visibles.forEach((t) => s.add(t.id));
      return s;
    });
  }

  async function borrarSeleccionadas() {
    if (seleccion.size === 0) return;
    setBorrando(true);
    setError(null);
    try {
      const supabase = crearClienteNavegador();
      const { error } = await supabase.rpc("eliminar_tiendas", {
        p_ids: [...seleccion],
      });
      if (error) throw error;
      setSeleccion(new Set());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBorrando(false);
    }
  }

  async function borrarTodo() {
    setBorrando(true);
    setError(null);
    try {
      const supabase = crearClienteNavegador();
      if (esSinArchivo) {
        const { error } = await supabase.rpc("eliminar_tiendas_sin_archivo");
        if (error) throw error;
        router.refresh();
      } else if (cargaId) {
        const { error } = await supabase.rpc("eliminar_carga", { p_id: cargaId });
        if (error) throw error;
        router.push("/tiendas");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBorrando(false);
    }
  }

  const puedeBorrarTodo = Boolean(cargaId) || esSinArchivo;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar por código, tienda o distrito…"
          className="w-full max-w-[300px] rounded-[9px] border border-line-strong bg-surface px-3 py-1.5 text-[13px] outline-none focus:border-amber"
        />

        {seleccion.size > 0 ? (
          <>
            <span className="num text-[12.5px] font-semibold text-ink-2">
              {seleccion.size} seleccionada{seleccion.size > 1 ? "s" : ""}
            </span>
            <button
              onClick={borrarSeleccionadas}
              disabled={borrando}
              className="rounded-[9px] border border-bad bg-bad px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {borrando ? "Eliminando…" : `Eliminar ${seleccion.size}`}
            </button>
            <button
              onClick={() => setSeleccion(new Set())}
              className="rounded-[9px] border border-line-strong px-3 py-1.5 text-[12.5px] font-semibold text-ink-2 transition hover:bg-canvas"
            >
              Quitar selección
            </button>
          </>
        ) : (
          puedeBorrarTodo && (
            <button
              onClick={() => setConfirmarTodo(true)}
              className="ml-auto rounded-[9px] border border-line-strong px-3 py-1.5 text-[12.5px] font-semibold text-bad transition hover:bg-bad-bg"
            >
              🗑️ Eliminar {esSinArchivo ? "estas tiendas" : "esta carga"}
            </button>
          )
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-[10px] border border-bad/30 bg-bad-bg px-3 py-2 text-[12.5px] text-bad">
          No se pudo eliminar: {error}
        </p>
      )}

      {confirmarTodo && (
        <div className="mb-3 rounded-[12px] border border-bad/40 bg-bad-bg p-3.5">
          <h4 className="text-[14px] font-bold text-bad">
            ¿Eliminar {esSinArchivo ? "las tiendas sin archivo" : `la carga «${nombreCarga}»`}?
          </h4>
          <p className="mt-1.5 text-[13px] text-ink-2">
            Se borrarán <b className="num">{total.toLocaleString("es-PE")}</b> tiendas
            {esSinArchivo ? "" : " y el registro del archivo"}. Esta acción no se
            puede deshacer.
          </p>
          <p className="mt-1.5 text-[12.5px] text-ink-2">
            <b>Tus despachos no se tocan</b>: las rutas ya guardadas conservan el
            nombre y las coordenadas de cada parada.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={borrarTodo}
              disabled={borrando}
              className="rounded-[9px] border border-bad bg-bad px-3.5 py-2 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {borrando ? "Eliminando…" : "Sí, eliminar"}
            </button>
            <button
              onClick={() => setConfirmarTodo(false)}
              className="rounded-[9px] border border-line-strong bg-surface px-3.5 py-2 text-[13px] font-semibold transition hover:bg-canvas"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className="w-9 border-b border-line bg-surface-2 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={todasVisiblesMarcadas}
                  onChange={alternarTodas}
                  aria-label="Seleccionar todas las visibles"
                />
              </th>
              {["Código", "Tienda", "Distrito", "Bultos", "Ventana", "Coordenadas", "Estado"].map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap border-b border-line bg-surface-2 px-3 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((t) => {
              const marcada = seleccion.has(t.id);
              return (
                <tr key={t.id} className={marcada ? "bg-amber-050" : "hover:bg-surface-2"}>
                  <td className="border-b border-line px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={() => alternar(t.id)}
                      aria-label={`Seleccionar ${t.nombre}`}
                    />
                  </td>
                  <td className="num border-b border-line px-3 py-2.5 font-semibold">{t.codigo}</td>
                  <td className="border-b border-line px-3 py-2.5 font-semibold text-ink">
                    {t.nombre}
                    {t.prioridad > 0 && <span className="ml-2 text-amber-600">⭐ P{t.prioridad}</span>}
                  </td>
                  <td className="border-b border-line px-3 py-2.5 text-ink-2">{t.distrito ?? "—"}</td>
                  <td className="num border-b border-line px-3 py-2.5 text-ink-2">{t.bultos_default}</td>
                  <td className="num border-b border-line px-3 py-2.5 text-ink-2">
                    {hhmm(t.ventana_ini) && hhmm(t.ventana_fin)
                      ? `${hhmm(t.ventana_ini)}–${hhmm(t.ventana_fin)}`
                      : "—"}
                  </td>
                  <td className="num border-b border-line px-3 py-2.5 text-ink-3">
                    {t.lat.toFixed(5)}, {t.lon.toFixed(5)}
                  </td>
                  <td className="border-b border-line px-3 py-2.5">
                    <Pastilla tono={t.activo ? "ok" : "plan"}>
                      {t.activo ? "Activa" : "Inactiva"}
                    </Pastilla>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {visibles.length === 0 && (
        <p className="px-3 py-6 text-center text-[13px] text-ink-2">
          Ninguna tienda coincide con «{filtro}».
        </p>
      )}
    </>
  );
}
