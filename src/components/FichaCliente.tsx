"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  guardarCliente,
  type ClienteFicha,
  type EntregaCliente,
} from "@/app/acciones/clientes";
import { Celda, EstadoVacio, Pastilla, Tabla, Tarjeta } from "@/components/ui";
import { Cifra, COLORES, Panel, Rosquilla } from "@/components/graficos";
import { diaCorto, fecha, hora } from "@/lib/horas";

const MapaEstadisticas = dynamic(() => import("@/components/MapaEstadisticas"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-[12px] text-ink-3">Cargando mapa…</div>
  ),
});

const ESTADO: Record<string, { texto: string; tono: "ok" | "warn" | "bad" | "live" }> = {
  entregado: { texto: "Entregado", tono: "ok" },
  parcial: { texto: "Parcial", tono: "warn" },
  reprogramado: { texto: "Reprogramado", tono: "warn" },
  fallido: { texto: "No entregado", tono: "bad" },
  pendiente: { texto: "Pendiente", tono: "live" },
};

function duracion(min: number | null) {
  if (min === null || min === undefined) return "—";
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.round(Math.abs(min) % 60);
  const signo = min < 0 ? "−" : "+";
  return h > 0 ? `${signo}${h} h ${m} min` : `${signo}${m} min`;
}

/**
 * Todo lo que se sabe de un cliente.
 *
 * Arriba lo que hace falta para llamarle, en medio cómo se le ha respondido
 * y abajo cada vez que se le fue a repartir. Cuando reclama por teléfono, lo
 * que hay que poder decir es «de las nueve veces que fuimos, fallamos dos, y
 * la última fue el martes», no abrir cuatro pantallas.
 */
export default function FichaCliente({
  cliente,
  historial,
  editable,
}: {
  cliente: ClienteFicha;
  historial: EntregaCliente[];
  /** El conductor ve la ficha pero no la cambia. */
  editable: boolean;
}) {
  const pendientes = cliente.ordenes - cliente.entregadas - cliente.fallidas - cliente.parciales;

  return (
    <div className="grid grid-cols-1 gap-3 p-3 @3xl:grid-cols-[360px_1fr]">
      <div className="min-w-0 space-y-3">
        <Datos cliente={cliente} editable={editable} />
        {cliente.lat !== null && cliente.lon !== null && (
          <Tarjeta className="h-[220px] overflow-hidden">
            <MapaEstadisticas
              puntos={[
                {
                  id: cliente.id,
                  nombre: cliente.nombre,
                  lat: cliente.lat,
                  lon: cliente.lon,
                  estado: "entregado",
                  hora: null,
                  conductor: null,
                },
              ]}
              desde={0}
              hasta={24}
            />
          </Tarjeta>
        )}
      </div>

      <div className="min-w-0 space-y-3">
        <div className="grid gap-2 @lg:grid-cols-4">
          <Cifra
            etiqueta="Cumplimiento"
            valor={
              cliente.ordenes ? `${Math.round((cliente.entregadas / cliente.ordenes) * 100)}%` : "—"
            }
            nota={`${cliente.ordenes} paradas`}
            tono={COLORES.entregado}
          />
          <Cifra etiqueta="Entregadas" valor={cliente.entregadas} />
          <Cifra
            etiqueta="Fallidas"
            valor={cliente.fallidas}
            tono={cliente.fallidas > 0 ? COLORES.fallido : undefined}
          />
          <Cifra
            etiqueta="Desvío medio"
            valor={duracion(cliente.desvio_medio)}
            nota="contra la hora estimada"
          />
        </div>

        {cliente.ordenes > 0 && (
          <Panel titulo="Cómo le ha ido">
            <Rosquilla
              etiquetaTotal="paradas"
              total={cliente.ordenes}
              partes={[
                { texto: "Entregadas", n: cliente.entregadas, color: COLORES.entregado },
                { texto: "Parciales", n: cliente.parciales, color: COLORES.parcial },
                { texto: "No entregadas", n: cliente.fallidas, color: COLORES.fallido },
                { texto: "Pendientes", n: Math.max(0, pendientes), color: COLORES.pendiente },
              ]}
            />
          </Panel>
        )}

        <Tarjeta className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-3.5 py-2">
            <h3 className="text-[13px] font-bold">Historial</h3>
            <span className="num text-[12px] text-ink-3">{historial.length}</span>
          </div>

          {historial.length === 0 ? (
            <EstadoVacio
              icono="▤"
              titulo="Todavía no se le ha repartido"
              descripcion="El cliente existe porque vino en un archivo, pero ninguna de sus paradas se ha despachado aún."
            />
          ) : (
            <Tabla
              cabeceras={["Fecha", "Despacho", "Ruta", "Conductor", "Estimada", "Real", "Desvío", "Estado"]}
              anchoMin={820}
            >
              {historial.map((h) => (
                <tr key={h.parada_id} className="hover:bg-canvas">
                  <Celda className="num text-ink-2">{diaCorto(h.fecha)}</Celda>
                  <Celda>
                    <Link
                      href={`/paradas/${h.parada_id}`}
                      className="font-semibold hover:underline"
                    >
                      {h.despacho ?? "Despacho"}
                    </Link>
                  </Celda>
                  <Celda className="num text-ink-2">
                    {h.ruta_indice !== null ? `R-${String(h.ruta_indice + 1).padStart(2, "0")}` : "—"}
                  </Celda>
                  <Celda className="text-ink-2">{h.conductor ?? "—"}</Celda>
                  <Celda className="num">{h.eta ? h.eta.slice(0, 5) : "—"}</Celda>
                  <Celda className="num">{h.hora_entrega ? hora(h.hora_entrega) : "—"}</Celda>
                  <Celda
                    className={`num ${h.desvio_min !== null && h.desvio_min > 15 ? "text-bad" : ""}`}
                  >
                    {duracion(h.desvio_min)}
                  </Celda>
                  <Celda>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pastilla tono={ESTADO[h.estado_entrega]?.tono ?? "live"}>
                        {ESTADO[h.estado_entrega]?.texto ?? h.estado_entrega}
                      </Pastilla>
                      {(h.subestado || h.motivo) && (
                        <span className="text-[11px] text-ink-3">
                          {h.subestado ?? h.motivo}
                        </span>
                      )}
                    </div>
                  </Celda>
                </tr>
              ))}
            </Tabla>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}

/**
 * La ficha editable.
 *
 * El nombre, la dirección y el teléfono los vuelve a escribir cada archivo
 * que se carga, porque de ahí vienen; lo que se escriba aquí a mano en esos
 * campos durará hasta la siguiente carga. El contacto, las notas y la marca
 * de punto fijo solo existen aquí y no los toca ninguna importación.
 */
function Datos({ cliente, editable }: { cliente: ClienteFicha; editable: boolean }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [campos, setCampos] = useState({
    nombre: cliente.nombre,
    direccion: cliente.direccion ?? "",
    telefono: cliente.telefono ?? "",
    email: cliente.email ?? "",
    contacto: cliente.contacto ?? "",
    notas: cliente.notas ?? "",
    recurrente: cliente.recurrente,
  });

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await guardarCliente(cliente.id, campos);
      setEditando(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  if (!editando) {
    return (
      <Tarjeta className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-3.5 py-2">
          <h3 className="text-[13px] font-bold">Detalles</h3>
          {cliente.recurrente && <Pastilla tono="live">punto fijo</Pastilla>}
          {editable && (
            <button
              onClick={() => setEditando(true)}
              className="ml-auto rounded-[8px] border border-line-strong bg-surface px-2.5 py-1 text-[11.5px] font-semibold transition hover:bg-canvas"
            >
              Editar
            </button>
          )}
        </div>
        <dl className="divide-y divide-line">
          <Campo etiqueta="Nombre" valor={cliente.nombre} />
          <Campo etiqueta="Código" valor={cliente.codigo} mono />
          <Campo etiqueta="Teléfono" valor={cliente.telefono} enlace={cliente.telefono ? `tel:${cliente.telefono}` : undefined} />
          <Campo etiqueta="Correo" valor={cliente.email} enlace={cliente.email ? `mailto:${cliente.email}` : undefined} />
          <Campo etiqueta="Contacto" valor={cliente.contacto} />
          <Campo etiqueta="Dirección" valor={cliente.direccion} />
          <Campo etiqueta="Distrito" valor={cliente.distrito} />
          <Campo
            etiqueta="Última entrega"
            valor={cliente.ultima ? fecha(cliente.ultima) : null}
          />
          <Campo etiqueta="Bultos repartidos" valor={String(cliente.bultos)} mono />
          {cliente.notas && <Campo etiqueta="Notas" valor={cliente.notas} />}
        </dl>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta className="overflow-hidden">
      <div className="border-b border-line px-3.5 py-2">
        <h3 className="text-[13px] font-bold">Editar cliente</h3>
      </div>
      <div className="space-y-2.5 px-3.5 py-3">
        <Entrada etiqueta="Nombre" valor={campos.nombre} onCambio={(v) => setCampos({ ...campos, nombre: v })} />
        <Entrada etiqueta="Teléfono" valor={campos.telefono} onCambio={(v) => setCampos({ ...campos, telefono: v })} />
        <Entrada etiqueta="Correo" valor={campos.email} onCambio={(v) => setCampos({ ...campos, email: v })} />
        <Entrada etiqueta="Contacto" valor={campos.contacto} onCambio={(v) => setCampos({ ...campos, contacto: v })} />
        <Entrada etiqueta="Dirección" valor={campos.direccion} onCambio={(v) => setCampos({ ...campos, direccion: v })} />

        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
            Notas
          </span>
          <textarea
            value={campos.notas}
            onChange={(e) => setCampos({ ...campos, notas: e.target.value })}
            rows={3}
            className="mt-1 w-full resize-y rounded-[9px] border border-line-strong bg-surface px-2.5 py-2 text-[12.5px] outline-none transition focus:border-amber-600"
            placeholder="Recibe solo hasta las 11. El portón de atrás es el bueno."
          />
        </div>

        <label className="flex items-center gap-2 text-[12.5px]">
          <input
            type="checkbox"
            checked={campos.recurrente}
            onChange={(e) => setCampos({ ...campos, recurrente: e.target.checked })}
            className="accent-amber-600"
          />
          Punto fijo: se le reparte todas las semanas
        </label>

        {error && <p className="text-[12px] text-bad">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => void guardar()}
            disabled={guardando || !campos.nombre.trim()}
            className="rounded-[8px] border border-amber-600 bg-amber px-3 py-1 text-[12px] font-semibold text-navy-900 transition hover:bg-amber-600 hover:text-white disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          <button
            onClick={() => { setEditando(false); setError(null); }}
            className="rounded-[8px] border border-line-strong bg-surface px-3 py-1 text-[12px] font-semibold transition hover:bg-canvas"
          >
            Cancelar
          </button>
          <span className="ml-auto text-[11px] text-ink-3">
            Nombre, teléfono y dirección los reescribe la siguiente carga.
          </span>
        </div>
      </div>
    </Tarjeta>
  );
}

function Campo({
  etiqueta,
  valor,
  enlace,
  mono,
}: {
  etiqueta: string;
  valor: string | null;
  enlace?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 px-3.5 py-1.5">
      <dt className="w-[108px] shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {etiqueta}
      </dt>
      <dd className={`min-w-0 flex-1 text-[12.5px] ${mono ? "num" : ""}`}>
        {valor ? (
          enlace ? (
            <a href={enlace} className="hover:underline">
              {valor}
            </a>
          ) : (
            valor
          )
        ) : (
          <span className="text-ink-3">—</span>
        )}
      </dd>
    </div>
  );
}

function Entrada({
  etiqueta,
  valor,
  onCambio,
}: {
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {etiqueta}
      </span>
      <input
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        className="mt-1 w-full rounded-[9px] border border-line-strong bg-surface px-2.5 py-1.5 text-[12.5px] outline-none transition focus:border-amber-600"
      />
    </label>
  );
}
