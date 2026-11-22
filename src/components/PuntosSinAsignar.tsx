"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { prepararInsercion, type PreparacionInsercion } from "@/app/acciones/insertar";
import { aplicarInsercion, moverParadas } from "@/lib/despachos";
import { insertar, type PropuestaInsercion } from "@/lib/motor";
import { Tarjeta } from "@/components/ui";

export type ParadaLibre = {
  id: string;
  codigo: string | null;
  nombre: string | null;
  distrito: string | null;
  bultos: number;
};

export type RutaDestino = { id: string; indice: number; paradas: number; bultos: number };

type Propuesta = { plan: PropuestaInsercion; datos: PreparacionInsercion };

const km = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 1 });

/**
 * Los puntos del archivo que no entraron en ninguna ruta, y las órdenes que
 * llegaron después.
 *
 * Antes se perdían al guardar: un archivo de 54 puntos acababa siendo un
 * despacho de 52 sin decir nada. Ahora quedan aquí y se les puede dar una
 * ruta sin volver a calcularlo todo.
 *
 * Hay dos maneras. «Buscar el mejor hueco» le pregunta al motor a qué ruta
 * va cada una y entre qué dos paradas, contando con dónde está cada vehículo
 * ahora mismo; sirve también con el reparto ya en la calle, y antes de
 * guardar enseña lo que propone. La otra, a mano, la encola al final de la
 * ruta que se elija, y solo vale mientras el despacho no haya salido.
 */
export default function PuntosSinAsignar({
  despachoId,
  paradas,
  rutas,
  editable,
  insertable,
}: {
  despachoId: string;
  paradas: ParadaLibre[];
  rutas: RutaDestino[];
  /** Todavía no salió a reparto: se puede mover a mano. */
  editable: boolean;
  /** Tiene rutas y no está cerrado: el motor puede buscarles hueco. */
  insertable: boolean;
}) {
  const router = useRouter();
  const [elegidas, setElegidas] = useState<Set<string>>(new Set(paradas.map((p) => p.id)));
  const [destino, setDestino] = useState<string>(rutas[0]?.id ?? "nueva");
  const [reordenar, setReordenar] = useState(false);
  const [ocupado, setOcupado] = useState<null | "buscar" | "guardar" | "mover">(null);
  const [error, setError] = useState<string | null>(null);
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null);

  const bultos = paradas
    .filter((p) => elegidas.has(p.id))
    .reduce((a, p) => a + p.bultos, 0);

  function alternar(id: string) {
    setPropuesta(null);
    setElegidas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  async function mover() {
    if (!elegidas.size) return;
    setOcupado("mover");
    setError(null);
    try {
      await moverParadas(despachoId, [...elegidas], destino);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  async function buscar() {
    if (!elegidas.size) return;
    setOcupado("buscar");
    setError(null);
    setPropuesta(null);
    try {
      // El estado de las rutas se lee en el servidor en este momento: lo que
      // hay en pantalla puede tener minutos.
      const datos = await prepararInsercion(despachoId, [...elegidas], reordenar);
      const plan = await insertar(datos.cuerpo);
      setPropuesta({ plan, datos });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  async function confirmar() {
    if (!propuesta?.plan.rutas.length) return;
    setOcupado("guardar");
    setError(null);
    try {
      await aplicarInsercion(despachoId, propuesta.plan.rutas);
      setPropuesta(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  const nombre = (id: string) =>
    propuesta?.datos.nombres[id] ?? paradas.find((p) => p.id === id)?.nombre ?? "Orden";

  return (
    <Tarjeta className="overflow-hidden border-warn/40">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-warn-bg px-4 py-2.5">
        <h3 className="text-[13.5px] font-bold text-warn">
          {paradas.length} punto{paradas.length === 1 ? "" : "s"} sin asignar
        </h3>
        <span className="text-[12px] text-ink-2">
          No están en ninguna ruta. Están guardados, pero nadie los va a repartir.
        </span>
      </div>

      <div className="max-h-[220px] overflow-y-auto">
        {paradas.map((p) => (
          <label
            key={p.id}
            className="flex cursor-pointer items-center gap-2.5 border-b border-line px-4 py-2 last:border-0 hover:bg-canvas"
          >
            <input
              type="checkbox"
              checked={elegidas.has(p.id)}
              onChange={() => alternar(p.id)}
              disabled={!editable && !insertable}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">
                {p.nombre ?? p.codigo}
              </span>
              <span className="num block text-[11.5px] text-ink-3">
                {p.codigo}
                {p.distrito ? ` · ${p.distrito}` : ""}
              </span>
            </span>
            <span className="num shrink-0 text-[12px] text-ink-2">{p.bultos} blt</span>
          </label>
        ))}
      </div>

      {insertable && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-surface-2 px-4 py-2.5">
          <span className="text-[12px] text-ink-2">
            <b className="num">{elegidas.size}</b> elegido(s) ·{" "}
            <b className="num">{bultos}</b> bultos
          </span>
          <button
            onClick={buscar}
            disabled={ocupado !== null || !elegidas.size}
            className="rounded-full border border-amber-600 bg-amber px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-amber-600 hover:text-white disabled:opacity-50"
          >
            {ocupado === "buscar" ? "Buscando…" : "Buscar el mejor hueco"}
          </button>
          <label
            className="flex items-center gap-1.5 text-[12px] text-ink-2"
            title="Si ahorra recorrido, cambia el orden de lo que les queda a las rutas que reciban algo. Las demás no se tocan, y la parada a la que ya va el conductor tampoco."
          >
            <input
              type="checkbox"
              checked={reordenar}
              onChange={(e) => { setReordenar(e.target.checked); setPropuesta(null); }}
            />
            Permitir reordenar las rutas que reciban algo
          </label>
        </div>
      )}

      {propuesta && (
        <div className="border-t border-line px-4 py-3">
          <h4 className="text-[13px] font-bold">
            Propuesta: {propuesta.plan.resumen.colocados} de {propuesta.plan.resumen.pedidos} con hueco
          </h4>

          {Object.entries(propuesta.plan.inserciones).map(([id, i]) => (
            <div key={id} className="mt-2 text-[12.5px]">
              <b>{nombre(id)}</b> → <b className="num">{propuesta.datos.rutas[i.ruta]?.rotulo ?? "Ruta"}</b>
              {", "}
              {i.despues_de ? <>después de «{nombre(i.despues_de)}»</> : "como siguiente parada"}
              {" · llega "}
              <b className="num">{i.eta}</b>
              {" · +"}
              <span className="num">{km(i.km_extra)}</span> km
              {i.sin_comprobar.length > 0 && (
                <span className="mt-0.5 block text-[12px] text-warn">
                  Pide {i.sin_comprobar.map((e) => `«${e}»`).join(", ")}: comprueba que ese
                  vehículo lo tenga, aquí no consta.
                </span>
              )}
            </div>
          ))}

          {propuesta.plan.rutas.length > 0 && (
            <div className="mt-3 border-t border-line pt-2 text-[12px] text-ink-2">
              {propuesta.plan.rutas.map((r) => (
                <div key={r.id} className="mt-0.5">
                  <b className="num text-ink">{propuesta.datos.rutas[r.id]?.rotulo ?? "Ruta"}</b>
                  {": termina "}
                  <b className="num text-ink">{r.fin}</b>
                  {" (antes "}
                  <span className="num">{r.fin_antes}</span>
                  {`), +${Math.round(r.min_extra)} min, +`}
                  <span className="num">{km(r.km_extra)}</span> km
                  {propuesta.datos.rutas[r.id]?.enCalle ? " · ya en la calle" : ""}
                  {r.reordenada ? " · cambia el orden de lo que le queda" : ""}
                </div>
              ))}
            </div>
          )}

          {propuesta.plan.sin_asignar.map((id) => (
            <div key={id} className="mt-2 text-[12.5px] text-bad">
              <b>{nombre(id)}</b>: {propuesta.plan.motivos[id]}
            </div>
          ))}

          {propuesta.plan.resumen.matriz === "recta" && propuesta.plan.rutas.length > 0 && (
            <p className="mt-2 text-[11.5px] text-ink-3">
              No se pudo consultar el servidor de calles: las distancias son estimadas.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {propuesta.plan.rutas.length > 0 && (
              <button
                onClick={confirmar}
                disabled={ocupado !== null}
                className="rounded-full border border-amber-600 bg-amber px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-amber-600 hover:text-white disabled:opacity-50"
              >
                {ocupado === "guardar" ? "Guardando…" : "Confirmar y guardar"}
              </button>
            )}
            <button
              onClick={() => setPropuesta(null)}
              disabled={ocupado !== null}
              className="rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold transition hover:bg-canvas disabled:opacity-50"
            >
              Descartar
            </button>
          </div>
        </div>
      )}

      {editable ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
          <span className="text-[12px] text-ink-2">O a mano, al final de →</span>
          <select
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            className="rounded-[8px] border border-line-strong bg-surface px-2 py-1.5 text-[12.5px]"
          >
            {rutas.map((r) => (
              <option key={r.id} value={r.id}>
                R-{String(r.indice + 1).padStart(2, "0")} · {r.paradas} paradas · {r.bultos} blt
              </option>
            ))}
            <option value="nueva">➕ Una ruta nueva</option>
          </select>
          <button
            onClick={mover}
            disabled={ocupado !== null || !elegidas.size}
            className="rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold transition hover:bg-canvas disabled:opacity-50"
          >
            {ocupado === "mover" ? "Moviendo…" : "Asignar"}
          </button>
        </div>
      ) : (
        !insertable && (
          <p className="border-t border-line px-4 py-2.5 text-[12px] text-ink-2">
            Este despacho ya está cerrado: sus paradas no se pueden mover.
          </p>
        )
      )}

      {error && (
        <p className="border-t border-line bg-bad-bg px-4 py-2 text-[12.5px] text-bad">{error}</p>
      )}

      <p className="border-t border-line px-4 py-2 text-[11px] text-ink-3">
        {insertable
          ? "El hueco se elige contando solo lo que le queda a cada ruta: lo ya entregado no se toca. La posición de cada vehículo es la de su última parada gestionada. Al guardar, el recorrido se vuelve a dibujar por calles."
          : "Al mover, la parada se añade al final de la ruta elegida y el recorrido se vuelve a dibujar por calles en ese orden. Para recalcular el orden, abre el despacho en el planificador."}
      </p>
    </Tarjeta>
  );
}
