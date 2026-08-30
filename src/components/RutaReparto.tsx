"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ESTADOS_ENTREGA, MOTIVOS_NO_ENTREGA,
  comprimirFoto, enlaceNavegacion, iniciarRuta, marcarParada, subirFoto,
  type EstadoEntrega,
} from "@/lib/entregas";
import { usePosicion } from "@/lib/posicion";
import { encolar, sincronizar } from "@/lib/cola";
import { Pastilla } from "@/components/ui";

// Leaflet necesita `window`: solo en el navegador.
const MapaSeguimiento = dynamic(() => import("@/components/MapaSeguimiento"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-[12.5px] text-ink-2">Cargando mapa…</div>
  ),
});

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
  rutaId, indice, despacho, fecha, cd, salidaProg, salidaReal, km, geometria = null,
  paradas, orgId,
}: {
  rutaId: string;
  indice: number;
  despacho: string;
  fecha: string;
  cd: { lat: number; lon: number } | null;
  salidaProg: string | null;
  salidaReal: string | null;
  km: number | null;
  geometria?: number[][] | null;
  paradas: ParadaReparto[];
  orgId: string;
}) {
  const router = useRouter();
  const [lista, setLista] = useState(paradas);
  const [salida, setSalida] = useState<string | null>(salidaReal);
  const [abierta, setAbierta] = useState<string | null>(null);
  // El mapa se puede ocultar: gasta datos y batería, y hay conductores que
  // prefieren la lista a secas.
  const [verMapa, setVerMapa] = useState(true);
  // El GPS se mantiene de fondo para que registrar una entrega no lo espere.
  const posicionActual = usePosicion();
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

  /**
   * Registra el resultado de una parada.
   *
   * La lista se pinta de inmediato y el viaje a la red va detrás, sin que
   * nadie lo espere: el conductor ya decidió, y hacerle mirar una pantalla
   * congelada mientras se resuelve el GPS o sube una foto es tiempo suyo
   * multiplicado por veinticinco paradas. Si el envío falla, la entrega cae
   * en la cola del móvil y el aviso de la cabecera lo dice.
   */
  const guardar = useCallback(
    (parada: ParadaReparto, datos: {
      estado: EstadoEntrega;
      motivo: string | null;
      bultosEntregados: number | null;
      observaciones: string | null;
      recibe: string | null;
      foto: File | null;
    }) => {
      setError(null);

      const pos = posicionActual();
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

      // 1) La pantalla responde ya.
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

      // 2) Y el envío ocurre detrás.
      void (async () => {
        try {
          const comprimida = datos.foto ? await comprimirFoto(datos.foto) : null;
          try {
            if (!navigator.onLine) throw new Error("sin conexión");
            if (comprimida) entrega.foto_url = await subirFoto(orgId, parada.id, comprimida);
            await marcarParada(entrega);
          } catch {
            await encolar({
              parada_id: parada.id,
              entrega,
              foto: comprimida,
              orgId,
              nombreParada: parada.nombre ?? parada.codigo ?? "Parada",
            });
          }
        } catch (e) {
          // Solo llega aquí si ni siquiera se pudo encolar (p. ej. sin espacio).
          setError(
            "No se pudo guardar «" +
              (parada.nombre ?? parada.codigo ?? "la parada") +
              "»: " +
              (e instanceof Error ? e.message : String(e)),
          );
        }
      })();
    },
    [orgId, posicionActual],
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
          <span className="num text-[12px] text-ink-2">{fecha}</span>
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

      {/* Mapa de su ruta: dónde ha estado y qué le queda */}
      {salida && (
        <div className="mt-2.5 overflow-hidden rounded-[14px] border border-line bg-surface">
          <button
            onClick={() => setVerMapa((v) => !v)}
            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
          >
            <span className="text-[13px] font-bold">Mapa de la ruta</span>
            <span className="flex items-center gap-2 text-[11px] text-ink-2">
              <Punto color="#2F855A" /> hechas
              <Punto color="#9AA5B1" /> pendientes
            </span>
            <span className="ml-auto text-[12px] text-ink-2">{verMapa ? "Ocultar" : "Ver"}</span>
          </button>
          {verMapa && (
            <div className="h-[280px] border-t border-line">
              <MapaSeguimiento
                paradas={lista.map((p) => ({
                  id: p.id,
                  orden: p.orden,
                  nombre: p.nombre,
                  lat: p.lat,
                  lon: p.lon,
                  bultos: p.bultos,
                  estado_entrega: p.estado_entrega,
                  hora_entrega: p.hora_entrega,
                  motivo: p.motivo,
                }))}
                geometria={geometria}
                colorRuta="#2E7DD1"
                cd={cd}
                siguienteId={siguiente?.id ?? null}
                onClicParada={(id) => {
                  setAbierta(id);
                  document.getElementById(`parada-${id}`)?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  });
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Paradas */}
      <h2 className="mb-2 mt-4 px-1 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-2">
        Todas las paradas
      </h2>
      <div className="flex flex-col gap-1.5">
        {lista.map((p) => {
          const info = ESTADOS_ENTREGA[p.estado_entrega] ?? ESTADOS_ENTREGA.pendiente;
          const hecha = p.estado_entrega !== "pendiente";
          return (
            <div
              key={p.id}
              id={`parada-${p.id}`}
              className="scroll-mt-24 rounded-[12px] border border-line bg-surface"
            >
              <button
                onClick={() => setAbierta(abierta === p.id ? null : p.id)}
                className="flex w-full items-center gap-2.5 p-3 text-left"
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold ${
                    hecha ? "bg-canvas text-ink-2" : "bg-navy-800 text-white"
                  }`}
                >
                  {p.orden}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">
                    {p.nombre ?? p.codigo}
                    {p.prioridad > 0 && <span className="ml-1 text-amber-600">⭐</span>}
                  </span>
                  <span className="block truncate text-[12px] text-ink-2">
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
  parada, onCancelar, onGuardar,
}: {
  parada: ParadaReparto;
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
  // Sin valor por defecto: un motivo preseleccionado se graba solo, y entonces
  // el informe de incidencias dice "Ausencia del cliente" de cosas que no lo
  // fueron. El motivo tiene que haber sido tocado por alguien.
  const [motivo, setMotivo] = useState<string>("");
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
    if (estado === "fallido" && !motivo) {
      setAviso("Elige el motivo de la no entrega.");
      return;
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
        <div className="num mt-0.5 text-ink-2">
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
        {/* Con un solo bulto no hay parcial posible: la validación pediría
            "entre 1 y 0" y el conductor se quedaría atascado. */}
        <BotonEstado
          activo={estado === "parcial"}
          tono="warn"
          deshabilitado={parada.bultos <= 1}
          onClick={() => setEstado("parcial")}
        >
          ◑ Entregado parcial
          {parada.bultos <= 1 && (
            <span className="mt-0.5 block text-[13px] font-medium">
              Esta parada lleva un solo bulto
            </span>
          )}
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
                className="w-full rounded-[9px] border border-line-strong bg-surface px-3 py-2.5 text-[16px]"
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
                  className="num w-full rounded-[9px] border border-line-strong bg-surface px-3 py-2.5 text-[16px]"
                />
              </Campo>
              <Campo etiqueta="¿Qué faltó? (opcional)">
                <input
                  value={falto}
                  onChange={(e) => setFalto(e.target.value)}
                  placeholder="Ej. faltaron 2 cajas de gaseosa"
                  className="w-full rounded-[9px] border border-line-strong bg-surface px-3 py-2.5 text-[16px]"
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
                  className="w-full rounded-[9px] border border-line-strong bg-surface px-3 py-2.5 text-[16px]"
                >
                  <option value="">— elige el motivo —</option>
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
                    className="w-full rounded-[9px] border border-line-strong bg-surface px-3 py-2.5 text-[16px]"
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
              className="w-full rounded-[9px] border border-line-strong bg-surface px-3 py-2 text-[16px]"
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
              className="flex-1 rounded-[10px] border border-amber-600 bg-amber px-4 py-3 text-[15px] font-bold text-[#231403]"
            >
              Guardar
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
  children, activo, tono, onClick, deshabilitado = false,
}: {
  children: React.ReactNode;
  activo: boolean;
  tono: "ok" | "warn" | "bad";
  onClick: () => void;
  deshabilitado?: boolean;
}) {
  const estilos = {
    ok: activo ? "border-ok bg-ok-bg text-ok" : "border-line-strong bg-surface",
    warn: activo ? "border-warn bg-warn-bg text-warn" : "border-line-strong bg-surface",
    bad: activo ? "border-bad bg-bad-bg text-bad" : "border-line-strong bg-surface",
  }[tono];
  return (
    <button
      onClick={onClick}
      disabled={deshabilitado}
      className={`w-full rounded-[10px] border-2 px-4 py-3 text-left text-[15px] font-bold transition ${estilos} disabled:cursor-not-allowed disabled:opacity-45`}
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

/** Punto de color de la leyenda del mapa. */
function Punto({ color }: { color: string }) {
  return (
    <i
      className="inline-block h-2 w-2 rounded-full not-italic"
      style={{ background: color }}
    />
  );
}
