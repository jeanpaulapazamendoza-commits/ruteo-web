"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  enlaceNavegacion, iniciarRuta, marcarParada, posicionActual,
  type EstadoEntrega,
} from "@/lib/entregas";
import { usePosicion } from "@/lib/posicion";
import {
  completarPendiente, deshacerPendiente, encolar, parchearPosicion, sincronizar,
} from "@/lib/cola";
import { pinta, resumenEntrega } from "@/lib/estadoParada";
import { useCola } from "@/hooks/useCola";
import CabeceraConductor from "@/components/conductor/CabeceraConductor";
import Consola from "@/components/conductor/Consola";
import CarrilDeshacer from "@/components/conductor/CarrilDeshacer";
import HojaResultado, { type DatosEntrega } from "@/components/conductor/HojaResultado";
import HojaFicha from "@/components/conductor/HojaFicha";

// Leaflet necesita `window`: solo en el navegador.
const MapaSeguimiento = dynamic(() => import("@/components/MapaSeguimiento"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-[14px] text-ink-2">Cargando mapa…</div>
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

/** Ventana en la que una entrega recién marcada aún puede deshacerse. */
const MS_DESHACER = 8000;
/** Bloqueo del botón primario tras cerrar una parada: mata el doble toque. */
const MS_BLOQUEO = 3000;

/**
 * La pantalla de una ruta.
 *
 * Es un orquestador: la cabecera, la consola, el carril y las hojas son
 * componentes propios, y aquí solo vive el estado que comparten. La parada
 * activa **se deriva** —la fijada por el conductor, o si no la primera
 * pendiente— en vez de guardarse: así no puede quedarse rancia ni avanzar
 * sola a una parada que el conductor no ha elegido.
 */
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
  const cola = useCola();
  const leerPosicion = usePosicion();

  const [lista, setLista] = useState(paradas);
  const [salida, setSalida] = useState<string | null>(salidaReal);
  const [fijada, setFijada] = useState<string | null>(null);
  const [hoja, setHoja] = useState(false);
  const [ficha, setFicha] = useState(false);
  const [carril, setCarril] = useState<{
    paradaId: string;
    texto: string;
    etiqueta: string;
    previa: ParadaReparto;
  } | null>(null);
  const [bloqueado, setBloqueado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [verMapa, setVerMapa] = useState(true);
  const [verCerradas, setVerCerradas] = useState(false);
  const [appNav, setAppNav] = useState<"maps" | "waze">("maps");

  const temporizadores = useRef<ReturnType<typeof setTimeout>[]>([]);
  const programar = useCallback((fn: () => void, ms: number) => {
    temporizadores.current.push(setTimeout(fn, ms));
  }, []);
  useEffect(() => {
    const pendientes = temporizadores.current;
    return () => pendientes.forEach(clearTimeout);
  }, []);

  // Preferencias que sobreviven a volver de Waze o a recargar.
  useEffect(() => {
    const app = localStorage.getItem("ruteo:navegador");
    const mapa = localStorage.getItem("ruteo:mapa");
    // `localStorage` y el alto de la ventana no existen en el servidor, así
    // que no pueden leerse en el estado inicial sin romper la hidratación.
    // En pantallas cortas el mapa arranca plegado: así siempre se ven al menos
    // tres paradas sin hacer scroll.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (app === "waze" || app === "maps") setAppNav(app);
    setVerMapa(mapa === null ? window.innerHeight >= 700 : mapa === "1");
  }, []);

  /**
   * Fusiona lo que llega del servidor con lo que el conductor acaba de marcar.
   *
   * Sustituir sin más perdería una entrega recién guardada que todavía está en
   * la cola: el servidor aún la da por pendiente y la pantalla volvería atrás
   * delante del conductor.
   */
  useEffect(() => {
    // Es exactamente el caso que la regla permite: sincronizar el estado con
    // un dato de fuera de React —lo que el servidor acaba de devolver— sin
    // perder lo que el conductor marcó hace un segundo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLista((prev) =>
      paradas.map((p) => {
        const local = prev.find((x) => x.id === p.id);
        return local && local.estado_entrega !== "pendiente" && p.estado_entrega === "pendiente"
          ? local
          : p;
      }),
    );
  }, [paradas]);

  // Al abrir la ruta se intenta subir lo que quedó de otra jornada.
  useEffect(() => {
    if (navigator.onLine) sincronizar().catch(() => {});
  }, []);

  const total = lista.length;
  const cerradas = lista.filter((p) => p.estado_entrega !== "pendiente");
  const resumen = {
    total,
    cerradas: cerradas.length,
    conformes: cerradas.filter((p) => p.estado_entrega === "entregado").length,
    parciales: cerradas.filter((p) => p.estado_entrega === "parcial").length,
    fallidas: cerradas.filter((p) => p.estado_entrega === "fallido").length,
  };
  const bultos = lista.reduce((a, p) => a + p.bultos, 0);

  const primeraPendiente = lista.find((p) => p.estado_entrega === "pendiente") ?? null;
  const activa =
    (fijada ? (lista.find((p) => p.id === fijada) ?? null) : null) ?? primeraPendiente;
  const fueraDeSecuencia =
    !!activa &&
    !!primeraPendiente &&
    activa.id !== primeraPendiente.id &&
    activa.estado_entrega === "pendiente";

  async function confirmarRuta() {
    setConfirmando(true);
    setErrorLocal(null);
    try {
      setSalida(await iniciarRuta(rutaId));
      router.refresh();
    } catch (e) {
      setErrorLocal(
        "No se pudo confirmar la ruta · " + (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      setConfirmando(false);
    }
  }

  /**
   * Registra el resultado de una parada.
   *
   * El orden importa: primero se pinta, y todo lo demás va detrás. El
   * conductor ya decidió; hacerle mirar una pantalla congelada mientras se
   * resuelve el GPS o sube una foto es tiempo suyo multiplicado por
   * veinticinco paradas.
   *
   * La entrega entra en la cola con ocho segundos de retención y nunca se
   * envía directamente: mientras se puede deshacer, no puede haber salido del
   * móvil. Ese único camino de subida es además idempotente, así que volver a
   * marcar la misma parada corrige la fila en vez de duplicarla.
   */
  const guardar = useCallback(
    (parada: ParadaReparto, datos: DatosEntrega) => {
      setErrorLocal(null);

      const pos = leerPosicion();
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
      setHoja(false);
      setFijada(null);

      // 2) Ocho segundos para arreglarlo, tres para no repetirlo sin querer.
      const etiqueta = `#${parada.orden}`;
      setCarril({
        paradaId: parada.id,
        previa: parada,
        texto:
          datos.estado === "entregado"
            ? `✓ ${etiqueta} entregada`
            : datos.estado === "parcial"
              ? `◑ ${etiqueta} parcial ${datos.bultosEntregados} de ${parada.bultos}`
              : `✕ ${etiqueta} no entregada`,
        etiqueta: datos.estado === "entregado" ? "¿Quién recibió?" : "Observación",
      });
      setBloqueado(true);
      programar(() => setBloqueado(false), MS_BLOQUEO);
      programar(() => setCarril((c) => (c?.paradaId === parada.id ? null : c)), MS_DESHACER);

      // 3) Y el viaje a la red va detrás, sin que nadie lo espere.
      void (async () => {
        try {
          await encolar({
            parada_id: parada.id,
            entrega,
            foto: datos.foto,
            orgId,
            nombreParada: parada.nombre ?? parada.codigo ?? "Parada",
            retenerHasta: Date.now() + MS_DESHACER,
          });
          programar(() => void cola.subir(), MS_DESHACER + 200);
        } catch {
          // Sin sitio en el móvil o en modo privado: se intenta directo, y si
          // tampoco, la fila vuelve a pendiente. Dar por buena una entrega que
          // no está en ninguna parte es el único fallo que no se puede
          // permitir.
          try {
            await marcarParada(entrega);
          } catch (e2) {
            setLista((prev) => prev.map((p) => (p.id === parada.id ? parada : p)));
            setCarril((c) => (c?.paradaId === parada.id ? null : c));
            setErrorLocal(e2 instanceof Error ? e2.message : String(e2));
          }
        }
      })();

      // 4) El GPS de respaldo llega cuando llegue, y se añade a la fila si
      //    todavía no ha subido.
      if (!pos) {
        void posicionActual(6000).then((p) => {
          if (p) parchearPosicion(parada.id, p.lat, p.lon).catch(() => {});
        });
      }
    },
    [cola, leerPosicion, orgId, programar],
  );

  /** Deshacer: la entrega nunca salió del móvil, así que basta con sacarla. */
  async function deshacer() {
    if (!carril) return;
    const ok = await deshacerPendiente(carril.paradaId);
    if (ok) setLista((prev) => prev.map((p) => (p.id === carril.paradaId ? carril.previa : p)));
    setCarril(null);
    setBloqueado(false);
  }

  const paradaHoja = hoja && activa ? activa : null;

  return (
    <>
      <CabeceraConductor
        variante="ruta"
        etiqueta={`R-${String(indice + 1).padStart(2, "0")}`}
        cerradas={resumen.cerradas}
        total={total}
        mapaVisible={verMapa}
        onPlegarMapa={() =>
          setVerMapa((v) => {
            localStorage.setItem("ruteo:mapa", v ? "0" : "1");
            return !v;
          })
        }
        cola={cola}
      />

      <div className="px-3 pb-[calc(var(--consola)+var(--carril)+env(safe-area-inset-bottom)+12px)] pt-3">
        <div className="mb-2.5 flex items-center gap-2 px-1 text-[14px] font-semibold text-ink-2">
          <span className="min-w-0 flex-1 truncate">{despacho}</span>
          <span className="num shrink-0">{fecha}</span>
        </div>

        {!salida && (
          <div className="mb-2.5 rounded-[12px] border border-line bg-surface p-3 text-[14px] text-ink-2">
            {total === 0 ? (
              <>
                <b className="text-ink">Esta ruta no tiene paradas.</b>
                <br />
                Avisa al planificador antes de salir del centro de distribución.
              </>
            ) : (
              <>
                <span className="num text-[17px] font-bold text-ink">{total}</span> paradas ·{" "}
                <span className="num text-[17px] font-bold text-ink">{bultos}</span> bultos
                {km ? (
                  <>
                    {" "}
                    · <span className="num text-[17px] font-bold text-ink">{Number(km).toFixed(0)}</span>{" "}
                    km
                  </>
                ) : null}
              </>
            )}
          </div>
        )}

        {/* Mapa: dónde ha estado y qué le queda */}
        {salida && total > 0 && (
          <div className="mb-2.5 overflow-hidden rounded-[14px] border border-line bg-surface">
            <button
              onClick={() =>
                setVerMapa((v) => {
                  localStorage.setItem("ruteo:mapa", v ? "0" : "1");
                  return !v;
                })
              }
              className="flex h-11 w-full items-center gap-2 px-3 text-left"
            >
              <span className="text-[14px] font-bold text-ink">Mapa de la ruta</span>
              <span className="ml-auto flex items-center gap-1.5">
                <Punto clase="bg-ok" />
                <Punto clase="bg-warn" />
                <Punto clase="bg-bad" />
                <Punto clase="bg-line-strong" />
                <span className="ml-1 text-[14px] font-semibold text-ink-2">
                  {verMapa ? "Ocultar" : "Ver"}
                </span>
              </span>
            </button>
            {verMapa && (
              <div className="relative h-[200px] border-t border-line">
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
                  siguienteId={activa?.id ?? null}
                  onClicParada={(id) => {
                    setFijada(id);
                    document
                      .getElementById(`parada-${id}`)
                      ?.scrollIntoView({ block: "center", behavior: "auto" });
                  }}
                />
                {!cola.enLinea && (
                  <div className="pointer-events-none absolute inset-0 z-[500] grid place-items-center">
                    <span className="rounded-[10px] bg-navy-900/90 px-3 py-2 text-[14px] font-bold text-white">
                      Mapa sin señal · trabaja con la lista
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Cerradas, plegadas: lo hecho estorba menos que lo que falta */}
        {resumen.cerradas > 0 && (
          <button
            onClick={() => setVerCerradas((v) => !v)}
            className="mb-2 flex h-12 w-full items-center gap-2 rounded-[12px] border border-line bg-surface px-3 text-left"
          >
            <span className="text-[17px] text-ink-2">{verCerradas ? "▾" : "▸"}</span>
            <span className="flex-1 text-[14px] font-bold text-ink">
              <span className="num">{resumen.cerradas}</span> cerradas ·{" "}
              <span className="num">{resumen.conformes}</span> conformes ·{" "}
              <span className="num">{resumen.parciales + resumen.fallidas}</span> con incidencia
            </span>
          </button>
        )}

        <div className="flex flex-col gap-2">
          {lista
            .filter((p) => verCerradas || p.estado_entrega === "pendiente" || p.id === activa?.id)
            .map((p) => (
              <FilaParada
                key={p.id}
                parada={p}
                activa={p.id === activa?.id}
                enCola={false}
                appNav={appNav}
                onSeleccionar={() => setFijada(p.id)}
              />
            ))}
        </div>
      </div>

      <Consola
        cola={cola}
        errorLocal={errorLocal}
        onReintentarLocal={() => setErrorLocal(null)}
        activa={activa}
        fueraDeSecuencia={fueraDeSecuencia}
        appNav={appNav}
        bloqueado={bloqueado}
        onPrimario={() => {
          // Con la jornada cerrada y nada elegido, el botón enseña lo hecho:
          // la lista de cerradas es el resumen del día, parada por parada.
          if (!activa) {
            setVerCerradas(true);
            return;
          }
          // Una parada ya marcada no se vuelve a cerrar de un toque: se
          // corrige, y corregir siempre pasa por la hoja.
          if (activa.estado_entrega !== "pendiente") setHoja(true);
          else
            guardar(activa, {
              estado: "entregado",
              motivo: null,
              bultosEntregados: null,
              observaciones: null,
              recibe: null,
              foto: null,
            });
        }}
        onOtro={() => setHoja(true)}
        onFicha={() => setFicha(true)}
        rutaIniciada={!!salida}
        onConfirmarRuta={confirmarRuta}
        confirmando={confirmando}
        sinParadas={total === 0}
        resumen={resumen}
        cd={cd}
        salidaProg={salidaProg}
      />

      {carril && (
        <CarrilDeshacer
          texto={carril.texto}
          etiquetaTexto={carril.etiqueta}
          onDeshacer={deshacer}
          onFoto={(foto) => {
            // Mientras el conductor está en la cámara la entrega no puede
            // subir sin la foto: se alarga la retención dos minutos.
            void completarPendiente(carril.paradaId, { foto }, 120000);
          }}
          onTexto={(valor) => {
            const esRecibe = carril.etiqueta.startsWith("¿Quién");
            void completarPendiente(
              carril.paradaId,
              esRecibe ? { recibe: valor || null } : { observaciones: valor || null },
            );
            setLista((prev) =>
              prev.map((p) =>
                p.id === carril.paradaId
                  ? esRecibe
                    ? { ...p, recibe: valor || null }
                    : { ...p, observaciones: valor || null }
                  : p,
              ),
            );
          }}
        />
      )}

      {paradaHoja && (
        <HojaResultado
          parada={paradaHoja}
          onCerrar={() => setHoja(false)}
          onGuardar={(d) => guardar(paradaHoja, d)}
        />
      )}

      {ficha && activa && (
        <HojaFicha
          parada={activa}
          app={appNav}
          onApp={(a) => {
            setAppNav(a);
            localStorage.setItem("ruteo:navegador", a);
          }}
          onCerrar={() => setFicha(false)}
        />
      )}
    </>
  );
}

/**
 * Una parada de la lista.
 *
 * Tocarla **solo la selecciona**: la consola pasa a apuntar a ella y el botón
 * grande cambia de nombre. Nunca escribe nada, para que rozar la pantalla
 * dentro de una furgoneta en marcha no cierre una entrega.
 */
function FilaParada({
  parada, activa, enCola, appNav, onSeleccionar,
}: {
  parada: ParadaReparto;
  activa: boolean;
  enCola: boolean;
  appNav: "maps" | "waze";
  onSeleccionar: () => void;
}) {
  const p = pinta(parada.estado_entrega);
  const cerrada = parada.estado_entrega !== "pendiente";
  const segunda =
    resumenEntrega(parada) ??
    [
      `${parada.bultos} bultos`,
      parada.distrito,
      hhmm(parada.ventana_ini) && hhmm(parada.ventana_fin)
        ? `${hhmm(parada.ventana_ini)}–${hhmm(parada.ventana_fin)}`
        : hhmm(parada.eta)
          ? `llega ${hhmm(parada.eta)}`
          : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div
      id={`parada-${parada.id}`}
      className={`flex h-[76px] scroll-mt-[76px] items-stretch overflow-hidden rounded-[12px] border-2 ${
        activa ? "border-amber-600" : "border-line"
      }`}
    >
      <i className={`w-1.5 shrink-0 ${p.rail}`} />
      <button
        onClick={onSeleccionar}
        className={`flex min-w-0 flex-1 items-center gap-2.5 px-3 text-left ${
          activa ? "bg-amber-050" : p.fondo
        }`}
      >
        <span
          className={`num grid h-9 w-9 shrink-0 place-items-center rounded-full text-[17px] font-bold ${
            activa
              ? "bg-amber text-navy-900"
              : cerrada
                ? "border border-line-strong bg-surface text-ink-2"
                : "bg-canvas text-ink"
          }`}
        >
          {parada.orden}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-bold text-ink">
            {parada.nombre ?? parada.codigo}
            {parada.prioridad > 0 && <span className="ml-1 text-amber-600">⭐</span>}
          </span>
          <span className="block truncate text-[14px] font-medium text-ink-2">{segunda}</span>
        </span>
        {enCola && <span className="shrink-0 text-[17px] text-ink-2">↑</span>}
        <span className="shrink-0 text-[17px] text-ink">{p.glifo}</span>
      </button>
      <a
        href={enlaceNavegacion(parada.lat, parada.lon, appNav)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Navegar a ${parada.nombre ?? parada.codigo}`}
        className="grid w-11 shrink-0 place-items-center border-l border-line bg-surface text-[17px] text-navy-800"
      >
        ▶
      </a>
    </div>
  );
}

/** Punto de color de la leyenda del mapa. */
function Punto({ clase }: { clase: string }) {
  return <i className={`inline-block h-2 w-2 rounded-full not-italic ${clase}`} />;
}
