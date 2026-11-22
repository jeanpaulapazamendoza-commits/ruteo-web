"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  iniciarRuta, marcarParada, posicionActual, subirFoto,
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
import {
  IconoAbajo, IconoAdelante, IconoMapa, IconoTelefono,
} from "@/components/conductor/iconos";

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
  /** De la ficha del cliente, si la tiene. */
  direccion: string | null;
  telefono: string | null;
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
 * Una sola cosa en primer plano: la parada a la que se va. Su nombre, su
 * dirección, cuántos bultos y a qué hora, en grande; debajo, un botón. El
 * mapa está plegado y lo que viene después es una lista corta, porque al
 * conductor le importa la siguiente parada, no las veinte.
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
  const [verMapa, setVerMapa] = useState(false);
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
    // `localStorage` no existe en el servidor, así que no puede leerse en el
    // estado inicial sin romper la hidratación. El mapa arranca plegado: quien
    // lo quiera lo abre una vez y se queda abierto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (app === "waze" || app === "maps") setAppNav(app);
    setVerMapa(mapa === "1");
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
        subestado: datos.subestado ?? null,
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
  const terminada = total > 0 && resumen.cerradas === total && !activa;
  // Antes de salir la tarjeta habla de la ruta entera, así que la lista
  // tiene que enseñar todas las paradas, también la primera.
  const siguientes = lista.filter(
    (p) => p.estado_entrega === "pendiente" && (!salida || p.id !== activa?.id),
  );
  const hechas = lista.filter((p) => p.estado_entrega !== "pendiente" && p.id !== activa?.id);

  const alternarMapa = () =>
    setVerMapa((v) => {
      localStorage.setItem("ruteo:mapa", v ? "0" : "1");
      return !v;
    });

  /** Elegir una parada la sube a la tarjeta, y la tarjeta está arriba. */
  const elegir = (id: string) => {
    setFijada(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <CabeceraConductor
        variante="ruta"
        etiqueta={`R-${String(indice + 1).padStart(2, "0")}`}
        cerradas={resumen.cerradas}
        total={total}
        cola={cola}
      />

      <div className="flex flex-col gap-3 px-4 pb-[calc(var(--consola)+var(--carril)+env(safe-area-inset-bottom)+16px)] pt-4">
        {/* ── Lo que toca ahora ─────────────────────────────────────── */}
        {!salida ? (
          <section className={TARJETA}>
            <p className={SOBRE}>{despacho} · {diaCorto(fecha)}</p>
            {total === 0 ? (
              <>
                <h1 className={TITULO}>Esta ruta no tiene paradas</h1>
                <p className="mt-1.5 text-[15px] leading-snug text-ink-2">
                  Avisa al planificador antes de salir del centro de distribución.
                </p>
              </>
            ) : (
              <>
                <h1 className={TITULO}>Tu ruta de hoy</h1>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Dato valor={total} texto={total === 1 ? "parada" : "paradas"} />
                  <Dato valor={bultos} texto="bultos" />
                  <Dato valor={km ? Number(km).toFixed(0) : "—"} texto="km" />
                </div>
                {salidaProg && (
                  <p className="mt-4 border-t border-line pt-3 text-[15px] text-ink-2">
                    Sales del centro a las <b className="num text-ink">{hhmm(salidaProg)}</b>
                  </p>
                )}
              </>
            )}
          </section>
        ) : terminada ? (
          <section className={TARJETA}>
            <p className={SOBRE}>{despacho} · {diaCorto(fecha)}</p>
            <h1 className={TITULO}>Ruta terminada</h1>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Dato valor={resumen.conformes} texto="entregadas" />
              <Dato valor={resumen.parciales} texto="parciales" />
              <Dato valor={resumen.fallidas} texto="sin entregar" />
            </div>
          </section>
        ) : activa ? (
          <section className={TARJETA}>
            <div className="flex items-center gap-2">
              <p className={SOBRE}>
                Parada <span className="num">{activa.orden}</span> de <span className="num">{total}</span>
              </p>
              {activa.prioridad > 0 && <Chip tono="bg-amber-050 text-amber-600">Prioritaria</Chip>}
              {fueraDeSecuencia && <Chip tono="bg-warn-bg text-warn">Fuera de orden</Chip>}
              {activa.estado_entrega !== "pendiente" && (
                <Chip tono={`${pinta(activa.estado_entrega).fondo} text-ink`}>
                  {pinta(activa.estado_entrega).texto}
                </Chip>
              )}
            </div>

            <h1 className={TITULO}>{activa.nombre ?? activa.codigo ?? "Parada"}</h1>
            <p className="mt-1 text-[15px] leading-snug text-ink-2">
              {lugar(activa) ?? "Sin dirección registrada"}
            </p>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <Dato valor={activa.bultos} texto={activa.bultos === 1 ? "bulto" : "bultos"} />
              <Dato valor={hhmm(activa.eta) ?? "—"} texto="llegada" />
              <Dato
                valor={
                  hhmm(activa.ventana_ini) && hhmm(activa.ventana_fin)
                    ? `${hhmm(activa.ventana_ini)}–${hhmm(activa.ventana_fin)}`
                    : "Libre"
                }
                texto="horario"
                chico
              />
            </div>

            {activa.estado_entrega !== "pendiente" && resumenEntrega(activa) && (
              <p className="mt-3 rounded-[10px] bg-canvas px-3 py-2 text-[14px] text-ink-2">
                {resumenEntrega(activa)}
              </p>
            )}

            <div className="mt-3 flex items-center gap-1 border-t border-line pt-2">
              {activa.telefono && (
                <a href={`tel:${activa.telefono.replace(/[^\d+]/g, "")}`} className={ENLACE}>
                  <IconoTelefono tam={16} /> Llamar
                </a>
              )}
              <button onClick={() => setFicha(true)} className={ENLACE}>
                Ver detalles
              </button>
              {fueraDeSecuencia && primeraPendiente && (
                <button onClick={() => setFijada(null)} className={`${ENLACE} ml-auto`}>
                  Volver a la <span className="num">{primeraPendiente.orden}</span>
                </button>
              )}
            </div>
          </section>
        ) : null}

        {/* ── Mapa, plegado ─────────────────────────────────────────── */}
        {total > 0 && (
          <section className="overflow-hidden rounded-[16px] border border-line bg-surface">
            <button
              onClick={alternarMapa}
              aria-expanded={verMapa}
              className="flex h-12 w-full items-center gap-2.5 px-4 text-left text-[15px] font-bold text-ink active:bg-canvas"
            >
              <IconoMapa tam={18} className="text-ink-2" />
              Mapa de la ruta
              <IconoAbajo
                tam={18}
                className={`ml-auto text-ink-3 transition-transform ${verMapa ? "rotate-180" : ""}`}
              />
            </button>
            {/* `isolate` no es decorativo: Leaflet pinta sus capas con z-index
                de 400 a 1000 y, sin un contexto de apilamiento propio, esos
                números compiten con los de la app. El mapa atravesaba la hoja
                de resultado (z-50) y tapaba sus primeras opciones. */}
            {verMapa && (
              <div className="relative isolate h-[220px] border-t border-line">
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
                  onClicParada={(id) => setFijada(id)}
                />
                {!cola.enLinea && (
                  <div className="pointer-events-none absolute inset-0 z-[500] grid place-items-center">
                    <span className="rounded-full bg-navy-900/90 px-4 py-2 text-[13px] font-bold text-white">
                      Mapa sin señal · trabaja con la lista
                    </span>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ── Lo que viene después ──────────────────────────────────── */}
        {siguientes.length > 0 && (
          <section>
            <h2 className="mb-1.5 px-1 text-[13px] font-bold text-ink-2">
              {salida ? "Después" : "Paradas"} · <span className="num">{siguientes.length}</span>
            </h2>
            <div className="overflow-hidden rounded-[16px] border border-line bg-surface">
              {siguientes.map((p) => (
                <FilaParada
                  key={p.id}
                  parada={p}
                  enCola={cola.ids.has(p.id)}
                  onSeleccionar={salida ? () => elegir(p.id) : undefined}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Lo hecho, plegado: estorba menos que lo que falta ─────── */}
        {hechas.length > 0 && (
          <section className="overflow-hidden rounded-[16px] border border-line bg-surface">
            <button
              onClick={() => setVerCerradas((v) => !v)}
              aria-expanded={verCerradas}
              className="flex h-12 w-full items-center gap-2.5 px-4 text-left text-[15px] font-bold text-ink active:bg-canvas"
            >
              <span>
                Hechas · <span className="num">{hechas.length}</span>
              </span>
              {resumen.parciales + resumen.fallidas > 0 && (
                <span className="text-[13px] font-semibold text-ink-2">
                  <span className="num">{resumen.parciales + resumen.fallidas}</span> con incidencia
                </span>
              )}
              <IconoAbajo
                tam={18}
                className={`ml-auto text-ink-3 transition-transform ${verCerradas ? "rotate-180" : ""}`}
              />
            </button>
            {verCerradas && (
              <div className="border-t border-line">
                {hechas.map((p) => (
                  <FilaParada key={p.id} parada={p} enCola={cola.ids.has(p.id)} onSeleccionar={() => elegir(p.id)} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <Consola
        cola={cola}
        errorLocal={errorLocal}
        onReintentarLocal={() => setErrorLocal(null)}
        activa={activa}
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
        rutaIniciada={!!salida}
        onConfirmarRuta={confirmarRuta}
        confirmando={confirmando}
        sinParadas={total === 0}
        resumen={resumen}
        cd={cd}
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

const TARJETA = "rounded-[16px] border border-line bg-surface p-4 shadow-[0_2px_10px_rgba(19,32,69,0.05)]";
const SOBRE = "text-[13px] font-bold text-ink-2";
const TITULO = "mt-1 text-[24px] font-bold leading-[1.15] tracking-tight text-ink";
const ENLACE =
  "flex h-10 items-center gap-1.5 rounded-full px-3 text-[14px] font-bold text-amber-600 active:bg-amber-050";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «22 nov»: el día del despacho, sin pasar por zonas horarias. */
function diaCorto(f: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f));
  return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1]}` : String(f);
}

/** Dirección y distrito, sin repetir el distrito si la dirección ya lo trae. */
function lugar(p: { direccion: string | null; distrito: string | null }) {
  const d = p.direccion?.trim() || null;
  if (!d) return p.distrito;
  if (!p.distrito || d.toLowerCase().includes(p.distrito.toLowerCase())) return d;
  return `${d} · ${p.distrito}`;
}

/** Una cifra grande con su nombre debajo. */
function Dato({ valor, texto, chico = false }: { valor: React.ReactNode; texto: string; chico?: boolean }) {
  return (
    <div className="rounded-[12px] bg-canvas px-2 py-2.5 text-center">
      <div className={`num font-bold leading-none text-ink ${chico ? "text-[17px] leading-[26px]" : "text-[26px]"}`}>
        {valor}
      </div>
      <div className="mt-1.5 text-[12.5px] font-medium leading-none text-ink-2">{texto}</div>
    </div>
  );
}

function Chip({ tono, children }: { tono: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${tono}`}>{children}</span>;
}

/**
 * Una parada de la lista.
 *
 * Tocarla **solo la elige**: sube a la tarjeta de arriba y el botón grande
 * pasa a hablar de ella. Nunca escribe nada, para que rozar la pantalla
 * dentro de una furgoneta en marcha no cierre una entrega.
 */
function FilaParada({
  parada, enCola, onSeleccionar,
}: {
  parada: ParadaReparto;
  enCola: boolean;
  /** Sin esto la fila solo informa: antes de salir no hay nada que elegir. */
  onSeleccionar?: () => void;
}) {
  const p = pinta(parada.estado_entrega);
  const cerrada = parada.estado_entrega !== "pendiente";
  const ventana =
    hhmm(parada.ventana_ini) && hhmm(parada.ventana_fin)
      ? `${hhmm(parada.ventana_ini)}–${hhmm(parada.ventana_fin)}`
      : null;
  const segunda =
    resumenEntrega(parada) ??
    [`${parada.bultos} ${parada.bultos === 1 ? "bulto" : "bultos"}`, ventana ?? parada.distrito]
      .filter(Boolean)
      .join(" · ");

  return (
    <button
      id={`parada-${parada.id}`}
      onClick={onSeleccionar}
      disabled={!onSeleccionar}
      className="flex min-h-[64px] w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left last:border-b-0 enabled:active:bg-canvas"
    >
      <span
        className={`num grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-bold ${
          cerrada ? `${p.fondo} text-ink` : "bg-canvas text-ink"
        }`}
      >
        {cerrada ? p.glifo : parada.orden}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-bold text-ink">
          {parada.nombre ?? parada.codigo}
        </span>
        <span className="block truncate text-[13.5px] text-ink-2">{segunda}</span>
      </span>
      {enCola && <span className="shrink-0 text-[12px] font-bold text-warn">sin subir</span>}
      {!cerrada && hhmm(parada.eta) && (
        <span className="num shrink-0 text-[14px] font-semibold text-ink-2">{hhmm(parada.eta)}</span>
      )}
      {onSeleccionar && <IconoAdelante tam={16} className="shrink-0 text-ink-3" />}
    </button>
  );
}
