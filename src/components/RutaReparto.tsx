"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  enlaceNavegacion, iniciarRuta, marcarParada, posicionActual, subirFoto,
  type Entrega, type EstadoEntrega,
} from "@/lib/entregas";
import { usePosicion } from "@/lib/posicion";
import {
  completarPendiente, encolar, parchearPosicion, subirUna, type Resultado,
} from "@/lib/cola";
import { pinta, resumenEntrega } from "@/lib/estadoParada";
import { useCola } from "@/hooks/useCola";
import CabeceraConductor from "@/components/conductor/CabeceraConductor";
import Consola from "@/components/conductor/Consola";
import BarraGuardada from "@/components/conductor/BarraGuardada";
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

/** Bloqueo del botón primario tras cerrar una parada: mata el doble toque. */
const MS_BLOQUEO = 3000;

/** Lo último que se guardó, para poder añadirle una foto o un nombre después. */
type UltimaEntrega = {
  paradaId: string;
  orden: number;
  entrega: Entrega;
  resultado: Resultado;
  texto: string;
  etiqueta: string;
};

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
  // Cuando la cola consigue subir algo, la página tiene datos viejos: una
  // parada ya cerrada en el servidor se seguiría enseñando como pendiente.
  const cola = useCola(useCallback(() => router.refresh(), [router]));
  const leerPosicion = usePosicion();

  const [lista, setLista] = useState(paradas);
  const [salida, setSalida] = useState<string | null>(salidaReal);
  const [fijada, setFijada] = useState<string | null>(null);
  const [hoja, setHoja] = useState(false);
  const [ficha, setFicha] = useState(false);
  const [ultima, setUltima] = useState<UltimaEntrega | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
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
   * Lo que este móvil ha guardado y el servidor todavía no ha devuelto.
   *
   * Subir una entrega no actualiza la página: los datos del servidor llegaron
   * al abrir la ruta y siguen diciendo «pendiente» hasta el siguiente refresco.
   * Sin esta memoria, la parada que el conductor acaba de cerrar volvía a
   * pintarse pendiente en cuanto salía de la cola.
   */
  const esperado = useRef(new Map<string, EstadoEntrega>());

  /**
   * Fusiona lo que llega del servidor con lo que el conductor acaba de marcar.
   *
   * Lo local manda mientras la entrega siga en la cola —no ha subido— o
   * mientras el servidor no haya devuelto todavía lo que guardamos. Antes la
   * regla miraba el estado, y eso tiraba las correcciones: cambiar una entrega
   * que el servidor ya tenía cerrada hacía que la pantalla volviera al valor
   * viejo con la corrección aún esperando a subir.
   */
  const enCola = cola.ids;
  useEffect(() => {
    for (const p of paradas) {
      if (esperado.current.get(p.id) === p.estado_entrega) esperado.current.delete(p.id);
    }
     
    setLista((prev) =>
      paradas.map((p) => {
        const local = prev.find((x) => x.id === p.id);
        if (!local) return p;
        return esperado.current.has(p.id) || enCola.has(p.id) ? local : p;
      }),
    );
  }, [paradas, enCola]);

  // Al abrir la ruta se reintenta lo que quedó de otra jornada. Va por el hook
  // para que la lista se entere de lo que suba: si no, una parada que acaba de
  // cerrarse en el servidor se seguiría enseñando pendiente.
  const subirCola = cola.subir;
  useEffect(() => {
    if (navigator.onLine) subirCola().catch(() => {});
  }, [subirCola]);

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
    async (parada: ParadaReparto, datos: DatosEntrega) => {
      setErrorLocal(null);

      const pos = leerPosicion();
      const entrega = {
        parada_id: parada.id,
        estado: datos.estado,
        motivo: datos.motivo,
        bultos_entregados: datos.bultosEntregados,
        observaciones: datos.observaciones,
        recibe: datos.recibe,
        // La hora del toque, no la de la subida. Sin esto el servidor sella la
        // entrega cuando la recibe, y una parada hecha sin cobertura aparece
        // en la torre a una hora que no ocurrió.
        marcada_en: new Date().toISOString(),
        gps_lat: pos?.lat ?? null,
        gps_lon: pos?.lon ?? null,
        foto_url: null as string | null,
      };

      // 1) La pantalla responde en el mismo frame del toque, y se recuerda que
      //    el servidor todavía no ha devuelto este resultado.
      esperado.current.set(parada.id, datos.estado);
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
                hora_entrega: entrega.marcada_en,
              }
            : p,
        ),
      );
      setHoja(false);
      setFijada(null);
      setGuardando(parada.id);
      setBloqueado(true);
      programar(() => setBloqueado(false), MS_BLOQUEO);

      // 2) Y se manda ahora mismo. Antes esperaba ocho segundos a un
      //    temporizador; si el conductor cerraba la app en ese hueco, la
      //    entrega no salía nunca y el móvil la daba por buena igual.
      const datosParada = {
        parada_id: parada.id,
        entrega,
        foto: datos.foto,
        orgId,
        nombreParada: parada.nombre ?? parada.codigo ?? "Parada",
      };

      let resultado: Resultado;
      try {
        await encolar(datosParada);
        resultado = await subirUna(parada.id);
      } catch {
        // Sin sitio en el móvil, o en modo privado: no hay red de seguridad,
        // así que se intenta directo. Si tampoco, la fila vuelve a pendiente:
        // dar por buena una entrega que no está en ninguna parte es el único
        // fallo que no se puede permitir.
        try {
          await marcarParada(entrega);
          resultado = { estado: "subida" };
        } catch (e) {
          setLista((prev) => prev.map((p) => (p.id === parada.id ? parada : p)));
          setGuardando(null);
          setErrorLocal(e instanceof Error ? e.message : String(e));
          return;
        }
      }

      setGuardando(null);
      setUltima({
        paradaId: parada.id,
        orden: parada.orden,
        entrega,
        resultado,
        texto:
          datos.estado === "entregado"
            ? `#${parada.orden} entregada`
            : datos.estado === "parcial"
              ? `#${parada.orden} parcial ${datos.bultosEntregados} de ${parada.bultos}`
              : `#${parada.orden} no entregada`,
        etiqueta: datos.estado === "entregado" ? "¿Quién recibió?" : "Observación",
      });

      // 3) El GPS de respaldo llega cuando llegue. Si la entrega ya subió no
      //    se hace nada: no vale la pena mandarla otra vez por una coordenada.
      if (!pos) {
        void posicionActual(6000).then((p) => {
          if (p) parchearPosicion(parada.id, p.lat, p.lon).catch(() => {});
        });
      }
    },
    [leerPosicion, orgId, programar],
  );

  /**
   * Adjunta después lo que no cabía en el momento del toque: la foto o el
   * nombre de quien recibió.
   *
   * Si la entrega sigue en la cola basta con completar su fila. Si ya subió,
   * hay que volver a mandarla entera —`marcar_parada` sobreescribe `recibe` y
   * `observaciones` con lo que le llegue, así que mandar solo el añadido
   * borraría el resto—. Antes esto se hacía a ciegas y, cuando la entrega ya
   * había subido, la foto se perdía sin decir nada.
   */
  const adjuntar = useCallback(
    async (extra: { foto?: Blob | null; recibe?: string | null; observaciones?: string | null }) => {
      if (!ultima) return;
      const { paradaId, entrega } = ultima;

      const completa = {
        ...entrega,
        recibe: extra.recibe !== undefined ? extra.recibe : entrega.recibe,
        observaciones:
          extra.observaciones !== undefined ? extra.observaciones : entrega.observaciones,
      };

      setLista((prev) =>
        prev.map((p) =>
          p.id === paradaId
            ? {
                ...p,
                recibe: completa.recibe ?? null,
                observaciones: completa.observaciones ?? null,
              }
            : p,
        ),
      );
      setUltima((u) => (u && u.paradaId === paradaId ? { ...u, entrega: completa } : u));

      try {
        const seguiaEnCola = await completarPendiente(paradaId, extra);
        if (seguiaEnCola) {
          const r = await subirUna(paradaId);
          setUltima((u) => (u && u.paradaId === paradaId ? { ...u, resultado: r } : u));
          return;
        }
        // Ya estaba en el servidor: se manda otra vez, con foto si la hay.
        const fotoUrl = extra.foto ? await subirFoto(orgId, paradaId, extra.foto) : null;
        await marcarParada({ ...completa, foto_url: fotoUrl });
        setUltima((u) =>
          u && u.paradaId === paradaId ? { ...u, resultado: { estado: "subida" } } : u,
        );
      } catch (e) {
        setErrorLocal(
          "No se pudo añadir eso a la entrega: " + (e instanceof Error ? e.message : String(e)),
        );
      }
    },
    [orgId, ultima],
  );

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
                enCola={cola.ids.has(p.id)}
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
        guardando={!!guardando}
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

      {ultima && (
        <BarraGuardada
          texto={ultima.texto}
          etiquetaTexto={ultima.etiqueta}
          subida={ultima.resultado.estado === "subida"}
          onFoto={(foto) => void adjuntar({ foto })}
          onTexto={(valor) =>
            void adjuntar(
              ultima.etiqueta.startsWith("¿Quién")
                ? { recibe: valor || null }
                : { observaciones: valor || null },
            )
          }
          onCorregir={() => {
            setFijada(ultima.paradaId);
            setHoja(true);
          }}
          onCerrar={() => setUltima(null)}
        />
      )}

      {paradaHoja && (
        <HojaResultado
          parada={paradaHoja}
          guardando={guardando === paradaHoja.id}
          onCerrar={() => setHoja(false)}
          onGuardar={(d) => void guardar(paradaHoja, d)}
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
