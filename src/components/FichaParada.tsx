"use client";

import { useEffect, useState } from "react";
import {
  borrarComentario,
  comentar,
  comentarios as traerComentarios,
  type Comentario,
  type Evento,
  type Item,
  type ParadaFicha,
} from "@/app/acciones/datos";
import { verFoto } from "@/app/acciones/fotos";
import { fechaHora, hora } from "@/lib/horas";
import { Pastilla, Tarjeta } from "@/components/ui";

const ESTADO: Record<string, { texto: string; tono: "ok" | "warn" | "bad" | "live" }> = {
  entregado: { texto: "Entregado", tono: "ok" },
  parcial: { texto: "Entrega parcial", tono: "warn" },
  reprogramado: { texto: "Reprogramado", tono: "warn" },
  fallido: { texto: "No entregado", tono: "bad" },
  pendiente: { texto: "Pendiente", tono: "live" },
};

const PASO: Record<string, string> = {
  ruta_iniciada: "El vehículo salió del centro de distribución",
  ruta_terminada: "El vehículo terminó su ruta",
  entregado: "Entregado",
  parcial: "Entregado en parte",
  fallido: "No se pudo entregar",
  reprogramado: "Reprogramado",
  pendiente: "Devuelto a pendiente",
};

const corta = (t: string | null) => (t ? t.slice(0, 5) : "—");

export default function FichaParada({
  parada: p,
  historial,
  items,
}: {
  parada: ParadaFicha;
  historial: Evento[];
  items: Item[];
}) {
  const estado = ESTADO[p.estado_entrega] ?? { texto: p.estado_entrega, tono: "live" as const };

  return (
    <div className="grid grid-cols-1 gap-3 p-3 @3xl:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-3">
        <Resumen parada={p} estado={estado} />
        {items.length > 0 && <Articulos items={items} />}
        <PruebaDeEntrega parada={p} />
        <Comentarios paradaId={p.id} />
      </div>

      <div className="min-w-0 space-y-3">
        {Object.keys(p.extra).length > 0 && <CamposDelCliente extra={p.extra} />}
        <Historial historial={historial} />
      </div>
    </div>
  );
}

function Resumen({
  parada: p,
  estado,
}: {
  parada: ParadaFicha;
  estado: { texto: string; tono: "ok" | "warn" | "bad" | "live" };
}) {
  return (
    <Tarjeta className="p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[16px] font-bold tracking-tight">{p.nombre ?? "Parada"}</h2>
        <Pastilla tono={estado.tono}>{estado.texto}</Pastilla>
        {p.prioridad > 0 && <Pastilla tono="warn">prioridad {p.prioridad}</Pastilla>}
        {p.intentos > 1 && (
          <Pastilla tono="warn">{p.intentos} intentos</Pastilla>
        )}
      </div>
      <p className="mt-0.5 text-[12px] text-ink-3">
        <span className="num">{p.codigo ?? "—"}</span>
        {p.distrito && <> · {p.distrito}</>}
        {" · parada "}
        <span className="num">{p.orden}</span>
        {" de "}
        <span className="num">R-{String(p.ruta_indice + 1).padStart(2, "0")}</span>
      </p>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
        <Dato
          etiqueta="Bultos"
          valor={
            p.bultos_entregados != null && p.bultos_entregados !== p.bultos
              ? `${p.bultos_entregados}/${p.bultos}`
              : String(p.bultos)
          }
          pie={p.bultos_entregados != null ? "entregados" : "a entregar"}
        />
        <Dato etiqueta="Estimada" valor={corta(p.eta)} pie={
          p.ventana_ini && p.ventana_fin
            ? `ventana ${corta(p.ventana_ini)}–${corta(p.ventana_fin)}`
            : "sin ventana"
        } />
        <Dato
          etiqueta="Real"
          valor={hora(p.hora_entrega)}
          pie={p.hora_entrega ? "cuando se marcó" : "sin marcar"}
        />
        <Dato
          etiqueta="Desvío"
          valor={
            p.desvio_min == null
              ? "—"
              : Math.abs(p.desvio_min) <= 10
                ? "a tiempo"
                : `${p.desvio_min > 0 ? "+" : "−"}${Math.abs(p.desvio_min)} min`
          }
          alerta={p.desvio_min != null && p.desvio_min > 30}
          pie="contra la estimada"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-2.5 text-[11.5px] text-ink-3">
        <span>
          Conductor <b className="text-ink-2">{p.conductor ?? "sin asignar"}</b>
          {p.placa && <> · <span className="num">{p.placa}</span></>}
        </span>
        <span>
          Despacho <b className="text-ink-2">{p.despacho ?? "—"}</b>
          {" · "}
          <span className="num">{p.fecha}</span>
        </span>
        {p.archivo && <span className="num">📄 {p.archivo}</span>}
      </div>
    </Tarjeta>
  );
}

/**
 * Lo que el conductor dejó al marcar.
 *
 * Es la respuesta a «¿de verdad entregaste?»: quién recibió, qué anotó, la
 * foto y dónde estaba el móvil en ese momento. Hoy los campos son fijos; el
 * día que cada empresa defina su propio formulario, esto es lo que se vuelve
 * una lista de respuestas.
 */
function PruebaDeEntrega({ parada: p }: { parada: ParadaFicha }) {
  const [foto, setFoto] = useState<string | null>(null);
  const [pidiendo, setPidiendo] = useState(false);

  const nada =
    !p.recibe && !p.observaciones && !p.motivo && !p.foto_url &&
    p.gps_lat == null && p.estado_entrega === "pendiente";

  async function abrirFoto() {
    if (!p.foto_url || foto) return;
    setPidiendo(true);
    try {
      setFoto(await verFoto(p.foto_url));
    } finally {
      setPidiendo(false);
    }
  }

  return (
    <Tarjeta className="overflow-hidden">
      <div className="border-b border-line px-3.5 py-2">
        <h3 className="text-[13.5px] font-bold">Prueba de entrega</h3>
      </div>

      {nada ? (
        <p className="px-3.5 py-3 text-[12.5px] text-ink-2">
          Todavía sin marcar. Aquí aparecerá lo que registre el conductor.
        </p>
      ) : (
        <div className="space-y-2.5 px-3.5 py-3 text-[12.5px]">
          {p.recibe && <Campo etiqueta="Quién recibió" valor={p.recibe} />}
          {p.motivo && <Campo etiqueta="Motivo" valor={p.motivo} />}
          {p.observaciones && <Campo etiqueta="Observaciones" valor={p.observaciones} />}

          {/* La distancia entre dónde debía estar y dónde estaba el móvil es
              la prueba de que se pisó el sitio, o de que no. */}
          {p.gps_lat != null && p.gps_lon != null && (
            <Campo
              etiqueta="GPS al marcar"
              valor={`${p.gps_lat.toFixed(5)}, ${p.gps_lon.toFixed(5)} · a ${Math.round(
                metros(p.lat, p.lon, p.gps_lat, p.gps_lon),
              )} m del punto`}
            />
          )}

          {p.foto_url && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
                Foto
              </div>
              {foto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={foto}
                  alt="Prueba de entrega"
                  className="mt-1 max-h-[320px] rounded-[9px] border border-line"
                />
              ) : (
                <button
                  onClick={abrirFoto}
                  disabled={pidiendo}
                  className="mt-1 rounded-[8px] border border-line-strong px-2.5 py-1 text-[12px] font-semibold transition hover:bg-canvas disabled:opacity-50"
                >
                  {pidiendo ? "Pidiendo…" : "📷 Ver la foto"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </Tarjeta>
  );
}

/**
 * Los artículos del pedido.
 *
 * Un número de bultos dice cuánto ocupa, no qué es. Cuando el cliente
 * reclama por una cocina que no llegó, la conversación es sobre el artículo,
 * no sobre «cuatro bultos».
 */
function Articulos({ items }: { items: Item[] }) {
  const total = items.reduce((a, i) => a + Number(i.cantidad), 0);
  const hechos = items.reduce(
    (a, i) => a + Number(i.entregados ?? 0),
    0,
  );
  const marcados = items.some((i) => i.entregados != null);
  const valor = items.reduce(
    (a, i) => a + Number(i.precio ?? 0) * Number(i.cantidad),
    0,
  );

  return (
    <Tarjeta className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3.5 py-2">
        <h3 className="text-[13.5px] font-bold">Artículos</h3>
        <span className="num text-[12px] text-ink-3">{items.length}</span>
        {marcados && (
          <Pastilla tono={hechos === total ? "ok" : "warn"}>
            {hechos} de {total} entregados
          </Pastilla>
        )}
        {valor > 0 && (
          <span className="num ml-auto text-[12px] text-ink-3">
            S/ {valor.toFixed(2)}
          </span>
        )}
      </div>
      <table className="w-full border-collapse text-[12.5px]">
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td className="border-b border-line px-3.5 py-1.5">
                <span className="font-semibold text-ink">{i.nombre}</span>
                {i.codigo && (
                  <span className="num block text-[11px] text-ink-3">{i.codigo}</span>
                )}
              </td>
              <td className="num border-b border-line px-3 py-1.5 text-right">
                {i.entregados != null && Number(i.entregados) !== Number(i.cantidad)
                  ? `${Number(i.entregados)}/${Number(i.cantidad)}`
                  : Number(i.cantidad)}
              </td>
              <td className="num border-b border-line px-3 py-1.5 text-right text-ink-3">
                {i.precio != null ? `S/ ${Number(i.precio).toFixed(2)}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Tarjeta>
  );
}

/**
 * Las columnas que trae el archivo del cliente y la aplicación no interpreta.
 *
 * Número de pedido, canal de venta, guía de remisión: cada empresa manda las
 * suyas. Antes se perdían al leer el archivo; ahora se guardan tal cual y se
 * muestran sin que haga falta tocar el esquema por cada cliente nuevo.
 */
function CamposDelCliente({ extra }: { extra: Record<string, string> }) {
  return (
    <Tarjeta className="overflow-hidden">
      <div className="border-b border-line px-3.5 py-2">
        <h3 className="text-[13.5px] font-bold">Datos del archivo</h3>
      </div>
      <dl className="divide-y divide-line">
        {Object.entries(extra).map(([k, v]) => (
          <div key={k} className="px-3.5 py-1.5">
            <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
              {k}
            </dt>
            <dd className="break-words text-[12.5px] text-ink-2">{v}</dd>
          </div>
        ))}
      </dl>
    </Tarjeta>
  );
}

/** Distancia en metros, para comparar el GPS con el punto planificado. */
function metros(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function Historial({ historial }: { historial: Evento[] }) {
  return (
    <Tarjeta className="overflow-hidden">
      <div className="border-b border-line px-3.5 py-2">
        <h3 className="text-[13.5px] font-bold">Historial</h3>
      </div>
      {historial.length === 0 ? (
        <p className="px-3.5 py-3 text-[12.5px] text-ink-2">
          Nada registrado todavía.
        </p>
      ) : (
        <ol className="px-3.5 py-2">
          {historial.map((e, i) => {
            const d = e.datos as {
              desde?: string;
              corregida?: boolean;
              reconstruido?: boolean;
              bultos_entregados?: number;
            };
            return (
              <li key={e.id} className="relative flex gap-3 pb-3 last:pb-1">
                {/* El raíl que une los pasos; el último no lo necesita. */}
                {i < historial.length - 1 && (
                  <span className="absolute left-[5px] top-3 h-full w-px bg-line" />
                )}
                <span className="relative mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-surface bg-ink-3" />
                <div className="min-w-0 text-[12px]">
                  <b className="block text-[12.5px] text-ink">
                    {PASO[e.tipo] ?? e.tipo}
                  </b>
                  <span className="num text-ink-3">{fechaHora(e.ocurrido_en)}</span>
                  {e.autor && <span className="text-ink-3"> · {e.autor}</span>}
                  {d.bultos_entregados != null && (
                    <span className="text-ink-2"> · {d.bultos_entregados} bultos</span>
                  )}
                  {d.corregida && d.desde && (
                    <span className="block text-[11.5px] text-warn">
                      corrigió lo marcado antes como «{d.desde}»
                    </span>
                  )}
                  {d.reconstruido && (
                    <span className="block text-[11px] text-ink-3">
                      reconstruido del dato antiguo
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Tarjeta>
  );
}

function Comentarios({ paradaId }: { paradaId: string }) {
  const [lista, setLista] = useState<Comentario[]>([]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function recargar() {
    try {
      setLista(await traerComentarios(paradaId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { void recargar(); /* eslint-disable-next-line */ }, [paradaId]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setGuardando(true);
    try {
      await comentar(paradaId, texto);
      setTexto("");
      await recargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Tarjeta className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2">
        <h3 className="text-[13.5px] font-bold">Notas del equipo</h3>
        <span className="num text-[12px] text-ink-3">{lista.length}</span>
      </div>

      <form onSubmit={enviar} className="border-b border-line px-3.5 py-2.5">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Llamé al cliente, reprograma para mañana por la tarde…"
          className="w-full resize-y rounded-[9px] border border-line-strong bg-surface px-2.5 py-2 text-[12.5px] outline-none transition focus:border-amber-600"
        />
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[11px] text-ink-3">
            Solo las ve tu equipo. Quedan con tu nombre y la hora.
          </span>
          <button
            type="submit"
            disabled={guardando || !texto.trim()}
            className="ml-auto rounded-[8px] border border-amber-600 bg-amber px-3 py-1 text-[12px] font-semibold text-navy-900 transition hover:bg-amber-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {guardando ? "…" : "Agregar nota"}
          </button>
        </div>
      </form>

      {error && (
        <p className="border-b border-line bg-bad-bg px-3.5 py-2 text-[12px] text-bad">
          {error}
        </p>
      )}

      {cargando ? (
        <p className="px-3.5 py-3 text-[12.5px] text-ink-3">Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="px-3.5 py-3 text-[12.5px] text-ink-2">
          Sin notas. Aquí queda lo que se habló de esta parada, que si no
          acaba perdido en un chat.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {lista.map((c) => (
            <li key={c.id} className="px-3.5 py-2.5">
              <div className="flex items-baseline gap-2 text-[11.5px] text-ink-3">
                <b className="text-ink-2">{c.autor ?? "Alguien"}</b>
                <span className="num">{fechaHora(c.creado_en)}</span>
                {c.mio && (
                  <button
                    onClick={async () => {
                      await borrarComentario(c.id);
                      await recargar();
                    }}
                    className="ml-auto text-[11px] text-ink-3 transition hover:text-bad"
                  >
                    Borrar
                  </button>
                )}
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] text-ink-2">
                {c.texto}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

function Campo({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {etiqueta}
      </div>
      <div className="text-ink-2">{valor}</div>
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  pie,
  alerta = false,
}: {
  etiqueta: string;
  valor: string;
  pie?: string;
  alerta?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {etiqueta}
      </div>
      <div
        className={`num text-[17px] font-bold leading-tight tracking-tight ${
          alerta ? "text-bad" : "text-ink"
        }`}
      >
        {valor}
      </div>
      {pie && <div className="text-[11px] text-ink-3">{pie}</div>}
    </div>
  );
}
