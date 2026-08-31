"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { COLORES_ZONA, type Vertice, type Zona } from "@/lib/zonas";
import { Pastilla } from "@/components/ui";

const MapaRutas = dynamic(() => import("@/components/MapaRutas"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-[13px] text-ink-3">Cargando mapa…</div>
  ),
});

const CD = { lat: -12.046374, lon: -77.042793 };

/**
 * Dibuja y mantiene las zonas fijas de reparto.
 *
 * La idea es hacerlo una vez: después, cada archivo del día se reparte entre
 * estas zonas de un botón, sin volver a seleccionar clientes en el mapa.
 */
export default function EditorZonas({
  zonas,
  orgId,
  miId,
}: {
  zonas: Zona[];
  orgId: string | null;
  miId: string | null;
}) {
  const router = useRouter();

  const [dibujando, setDibujando] = useState(false);
  const [vertices, setVertices] = useState<Vertice[]>([]);
  const [nombre, setNombre] = useState("");
  const [color, setColor] = useState(COLORES_ZONA[zonas.length % COLORES_ZONA.length]);
  const [editando, setEditando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function empezar() {
    setDibujando(true);
    setVertices([]);
    setError(null);
  }

  function cancelar() {
    setDibujando(false);
    setVertices([]);
    setEditando(null);
    setNombre("");
  }

  async function guardar() {
    if (vertices.length < 3) {
      setError("Marca al menos tres puntos para cerrar la zona.");
      return;
    }
    if (!nombre.trim()) {
      setError("Ponle un nombre a la zona (ej. «Villa El Salvador»).");
      return;
    }
    if (!orgId) {
      setError("No encontré tu empresa. Vuelve a iniciar sesión.");
      return;
    }
    setOcupado(true);
    setError(null);
    try {
      const supabase = crearClienteNavegador();
      const fila = { nombre: nombre.trim(), color, poligono: vertices, org_id: orgId };
      const { error: fallo } = editando
        ? await supabase
            .from("zonas")
            .update({ ...fila, actualizado_en: new Date().toISOString() })
            .eq("id", editando)
        : await supabase.from("zonas").insert({ ...fila, creado_por: miId });
      if (fallo) throw fallo;
      cancelar();
      setColor(COLORES_ZONA[(zonas.length + 1) % COLORES_ZONA.length]);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  function redibujar(z: Zona) {
    setEditando(z.id);
    setNombre(z.nombre);
    setColor(z.color);
    setVertices([]);
    setDibujando(true);
    setError(null);
  }

  async function renombrar(z: Zona) {
    const nuevo = window.prompt("Nuevo nombre de la zona", z.nombre);
    if (!nuevo?.trim() || nuevo.trim() === z.nombre) return;
    setOcupado(true);
    try {
      const supabase = crearClienteNavegador();
      const { error: fallo } = await supabase
        .from("zonas")
        .update({ nombre: nuevo.trim(), actualizado_en: new Date().toISOString() })
        .eq("id", z.id);
      if (fallo) throw fallo;
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  async function borrar(z: Zona) {
    if (!window.confirm(`¿Borrar la zona «${z.nombre}»? Los despachos ya hechos no cambian.`)) return;
    setOcupado(true);
    try {
      const supabase = crearClienteNavegador();
      const { error: fallo } = await supabase.from("zonas").delete().eq("id", z.id);
      if (fallo) throw fallo;
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  // Mientras se dibuja, la zona en curso se oculta para ver bien el trazo.
  const deFondo = editando ? zonas.filter((z) => z.id !== editando) : zonas;

  // El panel sigue abierto después del doble clic que cierra el polígono:
  // ahí es justo cuando hay que ponerle nombre y guardarla.
  const editandoTrazo = dibujando || vertices.length > 0;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 @3xl:grid-cols-[300px_1fr] @5xl:grid-cols-[340px_1fr]">
      <aside className="min-w-0 overflow-y-auto border-r border-line bg-surface p-4">
        {!editandoTrazo ? (
          <>
            <button
              onClick={empezar}
              className="w-full rounded-[9px] border border-amber-600 bg-amber px-3.5 py-2.5 text-[13.5px] font-semibold text-[#231403] transition hover:bg-amber-600 hover:text-white"
            >
              ✏️ Dibujar una zona nueva
            </button>
            <p className="mt-2 text-[12px] text-ink-3">
              Marca el contorno con clics y cierra con doble clic.
            </p>
          </>
        ) : (
          <div className="rounded-[12px] border border-amber-600/40 bg-amber-050 p-3">
            <h3 className="text-[13.5px] font-bold">
              {editando ? "Volver a dibujar la zona" : "Nueva zona"}
            </h3>
            <p className="mt-1 text-[12.5px] text-ink-2">
              {dibujando ? (
                <>
                  Haz clic en el mapa para marcar el contorno y <b>doble clic</b>{" "}
                  para cerrarlo.
                </>
              ) : (
                <>Contorno cerrado. Ponle nombre y guárdala.</>
              )}
            </p>

            <div className="mt-2 flex items-center gap-2 text-[12.5px]">
              <span>
                <b className="num">{vertices.length}</b> puntos marcados
                {vertices.length > 0 && vertices.length < 3 && (
                  <span className="text-warn"> · faltan {3 - vertices.length}</span>
                )}
              </span>
              {!dibujando && (
                <button
                  onClick={() => setDibujando(true)}
                  className="ml-auto rounded-[7px] border border-line-strong bg-surface px-2 py-0.5 text-[11.5px] font-semibold text-ink-2 transition hover:bg-canvas"
                >
                  Seguir marcando
                </button>
              )}
            </div>

            <label className="mt-2.5 block">
              <span className="mb-1 block text-[11.5px] font-semibold text-ink-2">Nombre</span>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Villa El Salvador"
                className="w-full rounded-[9px] border border-line-strong bg-surface px-2.5 py-1.5 text-[13px]"
              />
            </label>

            <div className="mt-2.5">
              <span className="mb-1 block text-[11.5px] font-semibold text-ink-2">Color</span>
              <div className="flex flex-wrap gap-1.5">
                {COLORES_ZONA.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    aria-label={`Color ${c}`}
                    className={`h-6 w-6 rounded-full border-2 transition ${
                      color === c ? "border-ink scale-110" : "border-transparent"
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                onClick={guardar}
                disabled={ocupado || vertices.length < 3}
                className="rounded-[9px] border border-amber-600 bg-amber px-3.5 py-1.5 text-[12.5px] font-semibold text-[#231403] transition hover:bg-amber-600 hover:text-white disabled:opacity-50"
              >
                {ocupado ? "Guardando…" : "Guardar zona"}
              </button>
              <button
                onClick={() => setVertices([])}
                className="rounded-[9px] border border-line-strong bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-ink-2 transition hover:bg-canvas"
              >
                Reiniciar trazo
              </button>
              <button
                onClick={cancelar}
                className="rounded-[9px] border border-line-strong bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-ink-2 transition hover:bg-canvas"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-[10px] border border-bad/30 bg-bad-bg px-3 py-2 text-[12.5px] text-bad">
            {error}
          </p>
        )}

        <h3 className="mt-5 mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3">
          Zonas guardadas <span className="num">{zonas.length}</span>
        </h3>

        {zonas.length === 0 ? (
          <p className="text-[12.5px] text-ink-3">
            Todavía no hay zonas. Dibuja las que usas siempre (por distrito, por
            transportista…) y el planificador podrá repartir cada archivo entre
            ellas de un botón.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {zonas.map((z) => (
              <div
                key={z.id}
                className="rounded-[10px] border border-line bg-canvas p-2.5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-[4px]"
                    style={{ background: z.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                    {z.nombre}
                  </span>
                  <Pastilla tono="plan">{z.poligono.length} pts</Pastilla>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <Boton onClick={() => renombrar(z)} disabled={ocupado}>Renombrar</Boton>
                  <Boton onClick={() => redibujar(z)} disabled={ocupado}>Redibujar</Boton>
                  <Boton onClick={() => borrar(z)} disabled={ocupado} peligro>Borrar</Boton>
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>

      <div className="relative min-h-[420px]">
        <MapaRutas
          tiendas={[]}
          grupos={[]}
          rutas={[]}
          cd={CD}
          sinAsignar={[]}
          mostrarZonas={false}
          mostrarTrazos={false}
          mostrarNumeros={false}
          grupoResaltado={null}
          zonasFijas={deFondo}
          dibujando={dibujando}
          puntosDibujo={vertices}
          colorDibujo={color}
          onPuntoDibujo={(p) => setVertices((v) => [...v, p])}
          onCerrarDibujo={() => setDibujando(false)}
        />
      </div>
    </div>
  );
}

function Boton({
  children,
  onClick,
  disabled,
  peligro,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  peligro?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-[7px] border px-2 py-0.5 text-[11.5px] font-semibold transition disabled:opacity-50 ${
        peligro
          ? "border-line-strong text-bad hover:bg-bad-bg"
          : "border-line-strong bg-surface text-ink-2 hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}
