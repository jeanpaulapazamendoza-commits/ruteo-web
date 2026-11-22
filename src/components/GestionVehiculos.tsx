"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  activarVehiculo, borrarVehiculo, guardarVehiculo, type VehiculoFila,
} from "@/app/acciones/vehiculos";
import { Pastilla, Tarjeta } from "@/components/ui";

const CAMPO =
  "w-full rounded-[8px] border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-amber";

type Borrador = {
  id: string | null;
  nombre: string;
  placa: string;
  capacidad: string;
  max: string;
  conductor: string;
};

const VACIO: Borrador = { id: null, nombre: "", placa: "", capacidad: "200", max: "0", conductor: "" };

/**
 * Los vehículos de la empresa: la placa que sale a la calle con cada ruta.
 *
 * Se asignan a las rutas en la ficha de cada despacho, junto al conductor.
 * El conductor habitual es una ayuda: al elegir el vehículo se propone su
 * conductor, y al revés.
 */
export default function GestionVehiculos({
  lista,
  conductores,
  puedeEditar,
}: {
  lista: VehiculoFila[];
  conductores: { id: string; nombre: string | null }[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [b, setB] = useState<Borrador | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valido = b !== null && b.nombre.trim() !== "" && Number(b.capacidad) > 0 && Number(b.max) >= 0;

  async function hacer(f: () => Promise<unknown>) {
    setOcupado(true);
    setError(null);
    try {
      await f();
      setB(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  const guardar = () =>
    b && valido &&
    hacer(() =>
      guardarVehiculo({
        id: b.id,
        nombre: b.nombre,
        placa: b.placa || null,
        capacidad_bultos: Number(b.capacidad),
        max_tiendas: Number(b.max),
        conductor_id: b.conductor || null,
      }),
    );

  const formulario = b && (
    <div className="border-t border-line bg-surface-2 px-5 py-4">
      <div className="@container">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 @xl:grid-cols-2 @4xl:grid-cols-5">
          <Campo rotulo="Nombre *">
            <input
              value={b.nombre}
              onChange={(e) => setB({ ...b, nombre: e.target.value })}
              placeholder="Furgón 3"
              className={CAMPO}
              autoFocus
            />
          </Campo>
          <Campo rotulo="Placa">
            <input
              value={b.placa}
              onChange={(e) => setB({ ...b, placa: e.target.value })}
              placeholder="ABC-123"
              className={`${CAMPO} num uppercase`}
            />
          </Campo>
          <Campo rotulo="Capacidad (bultos) *">
            <input
              type="number" min={1} value={b.capacidad}
              onChange={(e) => setB({ ...b, capacidad: e.target.value })}
              className={`${CAMPO} num`}
            />
          </Campo>
          <Campo rotulo="Máx. paradas (0 = sin límite)">
            <input
              type="number" min={0} value={b.max}
              onChange={(e) => setB({ ...b, max: e.target.value })}
              className={`${CAMPO} num`}
            />
          </Campo>
          <Campo rotulo="Conductor habitual">
            <select
              value={b.conductor}
              onChange={(e) => setB({ ...b, conductor: e.target.value })}
              className={CAMPO}
            >
              <option value="">— ninguno —</option>
              {conductores.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre ?? "Conductor"}</option>
              ))}
            </select>
          </Campo>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void guardar()}
          disabled={ocupado || !valido}
          className="rounded-full border border-amber-600 bg-amber px-4 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
        >
          {ocupado ? "Guardando…" : "Guardar"}
        </button>
        <button
          onClick={() => setB(null)}
          className="rounded-full border border-line-strong bg-surface px-4 py-1.5 text-[12.5px] font-semibold transition hover:bg-canvas"
        >
          Cancelar
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-5">
      <Tarjeta className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-ink-2">
            La flota con la que repartes. Cada ruta recibe su vehículo y su conductor en la
            ficha del despacho, en «Asignación de conductores y vehículos». Los conductores se
            crean en{" "}
            <Link href="/equipo" className="font-semibold text-amber-600 underline underline-offset-2">
              Usuarios
            </Link>{" "}
            con el rol «Conductor».
          </p>
          {puedeEditar && b === null && (
            <button
              onClick={() => { setB(VACIO); setError(null); }}
              className="rounded-full border border-amber-600 bg-amber px-4 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-amber-600"
            >
              ＋ Nuevo vehículo
            </button>
          )}
        </div>

        {b && b.id === null && formulario}

        {lista.length === 0 && b === null ? (
          <p className="border-t border-line px-5 py-8 text-center text-[13px] text-ink-3">
            Todavía no hay ningún vehículo. Crea el primero para poder asignarlo a una ruta.
          </p>
        ) : (
          lista.map((v) => (
            <div key={v.id} className="border-t border-line">
              <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3 ${v.activo ? "" : "opacity-60"}`}>
                <span className="min-w-[160px] flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">
                    {v.nombre}
                    {v.placa && <span className="num ml-2 font-normal text-ink-2">{v.placa}</span>}
                  </span>
                  <span className="block text-[11.5px] text-ink-3">
                    {v.conductor ? `Conductor habitual: ${v.conductor}` : "Sin conductor habitual"}
                  </span>
                </span>
                <span className="num text-[12.5px] text-ink-2">
                  <b className="text-ink">{v.capacidad_bultos}</b> bultos
                  {v.max_tiendas > 0 && <> · máx. <b className="text-ink">{v.max_tiendas}</b> paradas</>}
                </span>
                <span className="num text-[12px] text-ink-3">
                  {v.rutas} ruta{v.rutas === 1 ? "" : "s"}
                </span>
                <Pastilla tono={v.activo ? "ok" : "plan"}>{v.activo ? "Activo" : "Retirado"}</Pastilla>
                {puedeEditar && (
                  <span className="flex gap-2">
                    <button
                      onClick={() => {
                        setError(null);
                        setB({
                          id: v.id, nombre: v.nombre, placa: v.placa ?? "",
                          capacidad: String(v.capacidad_bultos), max: String(v.max_tiendas),
                          conductor: v.conductor_id ?? "",
                        });
                      }}
                      disabled={ocupado}
                      className="rounded-full border border-line-strong bg-surface px-3 py-1 text-[12px] font-semibold transition hover:bg-canvas"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => void hacer(() => activarVehiculo(v.id, !v.activo))}
                      disabled={ocupado}
                      className="rounded-full border border-line-strong bg-surface px-3 py-1 text-[12px] font-semibold transition hover:bg-canvas"
                    >
                      {v.activo ? "Retirar" : "Reactivar"}
                    </button>
                    {v.rutas === 0 && (
                      <button
                        onClick={() => {
                          if (window.confirm(`¿Borrar el vehículo «${v.nombre}»?`)) {
                            void hacer(() => borrarVehiculo(v.id));
                          }
                        }}
                        disabled={ocupado}
                        className="rounded-full border border-line-strong bg-surface px-3 py-1 text-[12px] font-semibold text-bad transition hover:bg-bad-bg"
                      >
                        Borrar
                      </button>
                    )}
                  </span>
                )}
              </div>
              {b && b.id === v.id && formulario}
            </div>
          ))
        )}

        {error && (
          <p className="border-t border-line bg-bad-bg px-5 py-2.5 text-[12.5px] text-bad">{error}</p>
        )}
      </Tarjeta>
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-semibold text-ink-2">{rotulo}</span>
      {children}
    </label>
  );
}
