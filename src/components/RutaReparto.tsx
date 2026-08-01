"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ESTADOS_ENTREGA, MOTIVOS_NO_ENTREGA,
  comprimirFoto, enlaceNavegacion, iniciarRuta, marcarParada,
  posicionActual, subirFoto,
  type EstadoEntrega,
} from "@/lib/entregas";
import { encolar, sincronizar } from "@/lib/cola";
import { Pastilla } from "@/components/ui";

export type ParadaReparto = {
  id: string;
  orden: number;
  codigo: string | null;
  nombre: string | null;
  distrito: string | null;
  lat: number;
  lon: number;
  bultos: number;
  prioridad: number;
  eta: string | null;
  ventana_ini: string | null;
  ventana_fin: string | null;
  estado_entrega: EstadoEntrega;
  hora_entrega: string | null;
  motivo: string | null;
  bultos_entregados: number | null;
  observaciones: string | null;
  recibe: string | null;
};

const hhmm = (t: string | null) => (t ? String(t).slice(0, 5) : null);

export default function RutaReparto({
  rutaId, indice, despacho, fecha, cd, salidaProg, salidaReal, km, paradas, orgId,
}: {
  rutaId: string;
  indice: number;
  despacho: string;
  fecha: string;
  cd: { lat: number; lon: number } | null;
  salidaProg: string | null;
  salidaReal: string | null;
  km: number | null;
  paradas: ParadaReparto[];
  orgId: string;
}) {
  const router = useRouter();
  const [lista, setLista] = useState(paradas);
  const [salida, setSalida] = useState<string | null>(salidaReal);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al abrir la ruta se intenta subir lo que quedó pendiente de otra jornada.
  useEffect(() => {
    if (navigator.onLine) sincronizar().catch(() => {});
  }, []);

  const total = lista.length;
  const cerradas = lista.filter((p) => p.estado_entrega !== "pendiente").length;
  const pct = total ? Math.round((cerradas / total) * 100) : 0;
  const bultos = lista.reduce((a, p) => a + p.bultos, 0);
  const siguiente = lista.find((p) => p.estado_entrega === "pendiente");

  async function confirmarRuta() {
    setOcupado(true);
    setError(null);
    try {
      const cuando = await iniciarRuta(rutaId);
      setSalida(cuando);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  /** Guarda el resultado; si no hay señal, lo deja en la cola del móvil. */
  const guardar = useCallback(
    async (parada: ParadaReparto, datos: {
      estado: EstadoEntrega;
      motivo: string | null;
      bultosEntregados: number | null;
      observaciones: string | null;
      recibe: string | null;
      foto: File | null;
    }) => {
      setOcupado(true);
      setError(null);
      try {
        const pos = await posicionActual();
        const entrega = {
          parada_id: parada.id,
          estado: datos.estado,
          motivo: datos.motivo,
          bultos_entregados: datos.bultosEntregados,
          observaciones: datos.observaciones,
          recibe: datos.recibe,
          gps_lat: pos?.lat ?? null,
          gps_lon: pos?.lon ?? null,
          foto_url: null as string | null,
        };

        const comprimida = datos.foto ? await comprimirFoto(datos.foto) : null;

        try {
          if (!navigator.onLine) throw new Error("sin conexión");
          if (comprimida) entrega.foto_url = await subirFoto(orgId, parada.id, comprimida);
          await marcarParada(entrega);
        } catch {
          // Nada se pierde: queda guardado en el móvil y sube al volver la señal.
          await encolar({
            parada_id: parada.id,
            entrega,
            foto: comprimida,
            orgId,
            nombreParada: parada.nombre ?? parada.codigo ?? "Parada",
          });
        }

        // La lista se actualiza igual, haya subido o no: el conductor ya la marcó.
        setLista((prev) =>
          prev.map((p) =>
            p.id === parada.id
              ? {
                  ...p,
                  estado_entrega: datos.estado,
                  motivo: datos.motivo,
                  bultos_entregados:
                    datos.estado === "entregado" ? p.bultos : datos.bultosEntregados,
                  observaciones: datos.observaciones,
                  recibe: datos.recibe,
                  hora_entrega: new Date().toISOString(),
                }
              : p,
          ),
        );
        setAbierta(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setOcupado(false);
      }
    },
    [orgId, router],
  );

  return (
    <>
      {/* Cabecera de la ruta */}
      <div className="rounded-[14px] border border-line bg-surface p-3.5">
        <div className="flex items-center gap-2">
          <span className="rounded-[7px] bg-navy-800 px-2 py-1 text-[12px] font-bold text-white">
            R-{String(indice + 1).padStart(2, "0")}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{despacho}</span>
          <span className="num text-[12px] text-ink-3">{fecha}</span>
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
            <div
              className={`h-full rounded-full ${pct === 100 ? "bg-ok" : "bg-live"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="num text-[13px] font-bold">
            {cerradas}/{total}
          </span>
        </div>

        <div className="mt-1.5 text-[12px] text-ink-2">
          <span className="num">{bultos}</span> bultos
          {km ? <> · <span className="num">{Number(km).toFixed(1)}</span> km</> : null}
          {salidaProg ? <> · salida prevista <span className="num">{hhmm(salidaProg)}</span></> : null}
        </div>

        {!salida ? (
          <>
            <button
              onClick={confirmarRuta}
              disabled={ocupado}
              className="mt-3 w-full rounded-[10px] border border-amber-600 bg-amber px-4 py-3 text-[15px] font-bold text-[#231403] transition active:bg-amber-600 disabled:opacity-60"
            >
              {ocupado ? "Confirmando…" : "✓ Confirmar ruta y salir del CD"}
            </button>
            {cd && (
              <a
                href={enlaceNavegacion(cd.lat, cd.lon)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 block text-center text-[12.5px] font-semibold text-ink-2 underline underline-offset-2"
              >
                Ver el centro de distribución en el mapa
              </a>
            )}
          </>
        ) : (
          <div className="mt-2.5 rounded-[10px] border border-ok/30 bg-ok-bg px-3 py-2 text-[12.5px] text-ok">
            Ruta iniciada a las{" "}
            <b className="num">
              {new Date(salida).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
            </b>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2.5 rounded-[10px] border border-bad/30 bg-bad-bg px-3 py-2.5 text-[13px] text-bad">
          {error}
        </p>
      )}

      {salida && siguiente && (
        <div className="mt-2.5 rounded-[14px] border border-amber-600/40 bg-amber-050 p-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-amber-600">
            Siguiente parada
          </div>
          <div className="mt-0.5 text-[15px] font-bold tracking-tight">
            #{siguiente.orden} · {siguiente.nombre ?? siguiente.codigo}
          </div>
          <div className="mt-2 flex gap-1.5">
            <a
              href={enlaceNavegacion(siguiente.lat, siguiente.lon)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-[9px] border border-navy-800 bg-navy-800 px-3 py-2 text-center text-[13px] font-bold text-white"
            >
              ▶ Cómo llegar
            </a>
            <button
              onClick={() => setAbierta(siguiente.id)}
              className="flex-1 rounded-[9px] border border-line-strong bg-surface px-3 py-2 text-[13px] font-bold text-ink"
            >
              Registrar entrega
            </button>
          </div>
        </div>
      )}

      {/* Paradas */}
      <h2 className="mb-2 mt-4 px-1 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3">
        Todas las paradas
      </h2>
      <div className="flex flex-col gap-1.5">
        {lista.map((p) => {
          const info = ESTADOS_ENTREGA[p.estado_entrega] ?? ESTADOS_ENTREGA.pendiente;
          const hecha = p.estado_entrega !== "pendiente";
          return (
            <div key={p.id} className="rounded-[12px] border border-line bg-surface">
              <button
                onClick={() => setAbierta(abierta === p.id ? null : p.id)}
                className="flex w-full items-center gap-2.5 p-3 text-left"
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold ${
                    hecha ? "bg-canvas text-ink-3" : "bg-navy-800 text-white"
                  }`}
                >
                  {p.orden}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">
                    {p.nombre ?? p.codigo}
                    {p.prioridad > 0 && <span className="ml-1 text-amber-600">⭐</span>}
                  </span>
                  <span className="block truncate text-[12px] text-ink-3">
                    <span className="num">{p.bultos}</span> bultos
                    {p.distrito ? ` · ${p.distrito}` : ""}
                    {hhmm(p.ventana_ini) && hhmm(p.ventana_fin)
                      ? ` · ${hhmm(p.ventana_ini)}–${hhmm(p.ventana_fin)}`
                      : hhmm(p.eta)
                        ? ` · llega ${hhmm(p.eta)}`
                        : ""}
                  </span>
                </span>
                <Pastilla tono={info.tono}>{info.corto}</Pastilla>
              </button>

              {abierta === p.id && (
                <FormularioEntrega
                  parada={p}
                  ocupado={ocupado}
                  onCancelar={() => setAbierta(null)}
                  onGuardar={(datos) => guardar(p, datos)}
                />
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Ficha del cliente y registro del resultado. */
function FormularioEntrega({
  parada, ocupado, onCancelar, onGuardar,
}: {
  parada: ParadaReparto;
  ocupado: boolean;
  onCancelar: () => void;
  onGuardar: (d: {
    estado: EstadoEntrega;
    motivo: string | null;
    bultosEntregados: number | null;
    observaciones: string | null;
    recibe: string | null;
    foto: File | null;
  }) => void;
}) {
  const [estado, setEstado] = useState<EstadoEntrega | null>(null);
  const [recibe, setRecibe] = useState(parada.recibe ?? "");
  const [entregados, setEntregados] = useState<string>("");
  const [falto, setFalto] = useState("");
  const [motivo, setMotivo] = useState<string>(MOTIVOS_NO_ENTREGA[0]);
  const [detalle, setDetalle] = useState("");
  const [observaciones, setObservaciones] = useState(parada.observaciones ?? "");
  const [foto, setFoto] = useState<File | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function enviar() {
    if (!estado) return;
    if (estado === "parcial") {
      const n = Number(entregados);
      if (!Number.isFinite(n) || n <= 0 || n >= parada.bultos) {
        setAviso(`Indica cuántos bultos entregaste: entre 1 y ${parada.bultos - 1}.`);
        return;
      }
    }
    if (estado === "fallido" && motivo === "Otros" && !detalle.trim()) {
      setAviso("Cuenta brevemente qué pasó.");
      return;
    }
    setAviso(null);
    onGuardar({
      estado,
      motivo:
        estado === "fallido"
          ? motivo === "Otros"
            ? `Otros: ${detalle.trim()}`
            : motivo
          : estado === "parcial"
            ? falto.trim() || null
            : null,
      bultosEntregados: estado === "parcial" ? Number(entregados) : null,
      observaciones: observaciones.trim() || null,
      recibe: recibe.trim() || null,
      foto,
    });
  }

  return (
    <div className="border-t border-line p-3">
      {/* Datos del cliente */}
      <div className="mb-3 rounded-[10px] bg-canvas p-2.5 text-[12.5px]">
        <div className="num font-semibold">{parada.codigo}</div>
        {parada.distrito && <div className="text-ink-2">{parada.distrito}</div>}
        <div className="num mt-0.5 text-ink-3">
          {parada.lat.toFixed(5)}, {parada.lon.toFixed(5)}
        </div>
        <div className="mt-2 flex gap-1.5">
          <a
            href={enlaceNavegacion(parada.lat, parada.lon)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-[8px] border border-line-strong bg-surface px-2 py-1.5 text-center text-[12.5px] font-semibold"
          >
            Google Maps
          </a>
          <a
            href={enlaceNavegacion(parada.lat, parada.lon, "waze")}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-[8px] border border-line-strong bg-surface px-2 py-1.5 text-center text-[12.5px] font-semibold"
          >
            Waze
          </a>
        </div>
      </div>

      {parada.estado_entrega !== "pendiente" && !estado && (
        <div className="mb-3 rounded-[10px] border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">
          Ya la marcaste como <b>{ESTADOS_ENTREGA[parada.estado_entrega].texto}</b>
          {parada.motivo ? ` · ${parada.motivo}` : ""}. Puedes corregirlo abajo.
        </div>
      )}

      {/* Estados */}
      <div className="flex flex-col gap-1.5">
        <BotonEstado activo={estado === "entregado"} tono="ok" onClick={() => setEstado("entregado")}>
          ✓ Entregado conforme
        </BotonEstado>
        <BotonEstado activo={estado === "parcial"} tono="warn" onClick={() => setEstado("parcial")}>
          ◑ Entregado parcial
        </BotonEstado>
        <BotonEstado activo={estado === "fallido"} tono="bad" onClick={() => setEstado("fallido")}>
          ✕ No entregado
        </BotonEstado>
      </div>

      {estado && (
        <div className="mt-3 flex flex-col gap-2.5">
          {estado === "entregado" && (
            <Campo etiqueta="¿Quién recibió? (opcional)">
              <input
                value={recibe}
                onChange={(e) => setRecibe(e.target.value)}
                placeholder="Nombre de quien recibe"
                className="w-full rounded-[9px] border border-line-strong bg-surface px-3 py-2.5 text-[15px]"
              />
            </Campo>
          )}

          {estado === "parcial" && (
            <>
              <Campo etiqueta={`¿Cuántos bultos entregaste? (de ${parada.bultos})`}>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={parada.bultos - 1}
                  value={entregados}
                  onChange={(e) => setEntregados(e.target.value)}
                  className="num w-full rounded-[9px] border border-line-strong bg-surface px-3 py-2.5 text-[15px]"
                />
              </Campo>
              <Campo etiqueta="¿Qué faltó? (opcional)">
                <input
                  value={falto}
                  onChange={(e) => setFalto(e.target.value)}
                  placeholder="Ej. faltaron 2 cajas de gaseosa"
                  className="w-full rounded-[9px] border border-line-strong bg-surface px-3 py-2.5 text-[15px]"
                />
              </Campo>
            </>
          )}

          {estado === "fallido" && (
            <>
              <Campo etiqueta="Motivo">
                <select
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="w-full rounded-[9px] border border-line-strong bg-surface px-3 py-2.5 text-[15px]"
                >
                  {MOTIVOS_NO_ENTREGA.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Campo>
              {motivo === "Otros" && (
                <Campo etiqueta="Cuéntanos qué pasó">
                  <input
                    value={detalle}
                    onChange={(e) => setDetalle(e.target.value)}
                    className="w-full rounded-[9px] border border-line-strong bg-surface px-3 py-2.5 text-[15px]"
                  />
                </Campo>
              )}
            </>
          )}

          <Campo etiqueta="Foto (opcional)">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
              className="w-full text-[13px] text-ink-2 file:mr-3 file:rounded-[9px] file:border file:border-line-strong file:bg-surface file:px-3 file:py-2 file:text-[13px] file:font-semibold"
            />
          </Campo>

          <Campo etiqueta="Observación (opcional)">
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={2}
              className="w-full rounded-[9px] border border-line-strong bg-surface px-3 py-2 text-[14px]"
            />
          </Campo>

          {aviso && (
            <p className="rounded-[9px] border border-warn/30 bg-warn-bg px-3 py-2 text-[12.5px] text-warn">
              {aviso}
            </p>
          )}

          <div className="flex gap-1.5">
            <button
              onClick={enviar}
              disabled={ocupado}
              className="flex-1 rounded-[10px] border border-amber-600 bg-amber px-4 py-3 text-[15px] font-bold text-[#231403] disabled:opacity-60"
            >
              {ocupado ? "Guardando…" : "Guardar"}
            </button>
            <button
              onClick={onCancelar}
              className="rounded-[10px] border border-line-strong bg-surface px-4 py-3 text-[14px] font-semibold text-ink-2"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {!estado && (
        <button
          onClick={onCancelar}
          className="mt-2.5 w-full rounded-[10px] border border-line-strong bg-surface px-4 py-2 text-[13px] font-semibold text-ink-2"
        >
          Cerrar
        </button>
      )}
    </div>
  );
}

function BotonEstado({
  children, activo, tono, onClick,
}: {
  children: React.ReactNode;
  activo: boolean;
  tono: "ok" | "warn" | "bad";
  onClick: () => void;
}) {
  const estilos = {
    ok: activo ? "border-ok bg-ok-bg text-ok" : "border-line-strong bg-surface",
    warn: activo ? "border-warn bg-warn-bg text-warn" : "border-line-strong bg-surface",
    bad: activo ? "border-bad bg-bad-bg text-bad" : "border-line-strong bg-surface",
  }[tono];
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-[10px] border-2 px-4 py-3 text-left text-[15px] font-bold transition ${estilos}`}
    >
      {children}
    </button>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-ink-2">{etiqueta}</span>
      {children}
    </label>
  );
}
