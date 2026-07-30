"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  agrupar, rutear, tiendasEnSector,
  type ConfigAgrupar, type ConfigRutear,
  type Grupo, type Ruta, type TiendaMapa,
} from "@/lib/motor";
import { guardarDespacho, type ResumenGuardado } from "@/lib/despachos";
import { Pastilla } from "@/components/ui";

// Leaflet necesita `window`: solo en el navegador.
const MapaRutas = dynamic(() => import("@/components/MapaRutas"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-[13px] text-ink-3">
      Cargando mapa…
    </div>
  ),
});

const COLORES = [
  "#E8833A", "#2E7DD1", "#0E8F9E", "#7A5AF8", "#C2439B", "#7C9A1F",
  "#D9534F", "#2F855A", "#B7791F", "#5A67D8", "#D53F8C", "#319795",
];
const color = (i: number) => COLORES[i % COLORES.length];

type Modo = "capacidad" | "clasico" | "manual";

export default function Planificador({
  tiendas,
  despachos = [],
  idDespacho = null,
  gruposIniciales = null,
}: {
  tiendas: TiendaMapa[];
  despachos?: { id: string; nombre: string | null; fecha: string }[];
  idDespacho?: string | null;
  gruposIniciales?: string[][] | null;
}) {
  const router = useRouter();
  // Si venimos de un despacho guardado, arrancamos en manual con sus grupos.
  const [modo, setModo] = useState<Modo>(gruposIniciales ? "manual" : "capacidad");

  const [cfgA, setCfgA] = useState<Omit<ConfigAgrupar, "modo">>({
    criterio: "tiendas",
    capacidad: 25,
    k: 8,
    flota: [
      { cantidad: 10, capacidad: 300, max_tiendas: 0 },
      { cantidad: 10, capacidad: 250, max_tiendas: 0 },
    ],
    vueltas: 1,
    uso_flota: "compacto",
  });

  const [cfgR, setCfgR] = useState<ConfigRutear>({
    cd_lat: -12.046374, cd_lon: -77.042793,
    motor: "osrm", cerrado: true, tiempo_tsp: 2,
    hora_salida: "08:00", servicio_min: 10, servicio_min_bulto: 0,
    jornada_h: 8, costo_fijo: 0, costo_km: 0,
  });

  // Resultado automático
  const [gruposAuto, setGruposAuto] = useState<Grupo[]>([]);
  const [sinAsignarAuto, setSinAsignarAuto] = useState<string[]>([]);

  // Selección manual
  const [gruposManual, setGruposManual] = useState<string[][]>(
    gruposIniciales?.length ? gruposIniciales : [[]],
  );
  const [grupoActivo, setGrupoActivo] = useState(0);
  const [dibujando, setDibujando] = useState(false);
  const [puntosDibujo, setPuntosDibujo] = useState<[number, number][]>([]);
  const [accionSector, setAccionSector] = useState<"agregar" | "quitar">("agregar");

  const [rutas, setRutas] = useState<Ruta[]>([]);
  const [totales, setTotales] = useState<{ km: number; duracion_min: number; costo: number; rutas: number } | null>(null);
  const [cargando, setCargando] = useState<null | "agrupar" | "rutear" | "sector" | "guardar">(null);
  const [error, setError] = useState<string | null>(null);
  const [resaltado, setResaltado] = useState<number | null>(null);
  const [guardado, setGuardado] = useState<ResumenGuardado | null>(null);

  const [verZonas, setVerZonas] = useState(true);
  const [verTrazos, setVerTrazos] = useState(true);
  const [verNumeros, setVerNumeros] = useState(true);

  const porId = useMemo(() => new Map(tiendas.map((t) => [t.id, t])), [tiendas]);

  /** En modo manual los grupos se calculan al vuelo: contador en tiempo real. */
  const gruposManualCalculados: Grupo[] = useMemo(() => {
    return gruposManual
      .map((ids, i) => ({ ids, i }))
      .filter((g) => g.ids.length > 0)
      .map(({ ids }, indice) => {
        const ts = ids.map((id) => porId.get(id)).filter(Boolean) as TiendaMapa[];
        return {
          indice,
          tiendas: ids,
          n_tiendas: ts.length,
          bultos: ts.reduce((a, t) => a + t.bultos, 0),
          prioritarias: ts.filter((t) => t.prioridad > 0).length,
          capacidad_vehiculo: null,
          max_tiendas_vehiculo: null,
          vuelta: 1,
          centro: {
            lat: ts.reduce((a, t) => a + t.lat, 0) / (ts.length || 1),
            lon: ts.reduce((a, t) => a + t.lon, 0) / (ts.length || 1),
          },
        };
      });
  }, [gruposManual, porId]);

  const esManual = modo === "manual";
  const grupos = esManual ? gruposManualCalculados : gruposAuto;

  const asignadasManual = useMemo(
    () => new Set(gruposManual.flat()),
    [gruposManual],
  );
  const sinAsignar = esManual
    ? tiendas.filter((t) => !asignadasManual.has(t.id)).map((t) => t.id)
    : sinAsignarAuto;

  const totalBultos = useMemo(() => tiendas.reduce((a, t) => a + t.bultos, 0), [tiendas]);
  const capFlota = useMemo(
    () => cfgA.flota.reduce((a, f) => a + f.cantidad * f.capacidad, 0),
    [cfgA.flota],
  );

  // Contadores en vivo del grupo activo
  const activo = gruposManual[grupoActivo] ?? [];
  const activoTiendas = activo.length;
  const activoBultos = activo.reduce((a, id) => a + (porId.get(id)?.bultos ?? 0), 0);

  /** Borra grupos y rutas para empezar de nuevo. */
  const limpiarTodo = useCallback(() => {
    setGruposAuto([]);
    setSinAsignarAuto([]);
    setGruposManual([[]]);
    setGrupoActivo(0);
    setRutas([]);
    setTotales(null);
    setResaltado(null);
    setPuntosDibujo([]);
    setDibujando(false);
    setError(null);
  }, []);

  function cambiarModo(m: Modo) {
    setModo(m);
    limpiarTodo();
  }

  async function hacerAgrupar() {
    setCargando("agrupar");
    setError(null);
    try {
      const r = await agrupar(tiendas, { ...cfgA, modo: modo === "clasico" ? "clasico" : "capacidad" });
      setGruposAuto(r.grupos);
      setSinAsignarAuto(r.sin_asignar);
      setRutas([]);
      setTotales(null);
      setResaltado(null);
      if (r.sobrecupo)
        setError("Los bultos no encajaron exactamente; algún grupo quedó al límite.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(null);
    }
  }

  async function hacerGuardar() {
    if (!rutas.length) return;
    setCargando("guardar");
    setError(null);
    try {
      const res = await guardarDespacho({
        nombre: `Despacho ${new Date().toLocaleDateString("es-PE")}`,
        rutas,
        cfg: cfgR,
        // Guardar la configuración permite reabrir el despacho tal cual se hizo
        parametros: { modo, ...cfgA, ...cfgR },
      });
      setGuardado(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(null);
    }
  }

  async function hacerRutear() {
    if (!grupos.length) return;
    setCargando("rutear");
    setError(null);
    setGuardado(null);
    try {
      const r = await rutear(tiendas, grupos.map((g) => g.tiendas), cfgR);
      setRutas(r.rutas);
      setTotales(r.totales);
      const fallidas = r.rutas.filter((x) => x.error);
      if (fallidas.length)
        setError(`${fallidas.length} ruta(s) no se calcularon: ${fallidas[0].error}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(null);
    }
  }

  /** Cierra el polígono y asigna (o libera) las tiendas de dentro. */
  async function cerrarSector() {
    if (puntosDibujo.length < 3) {
      setPuntosDibujo([]);
      setDibujando(false);
      return;
    }
    setCargando("sector");
    setError(null);
    try {
      const poligono = puntosDibujo.map(([lat, lon]) => [lon, lat]);
      const { ids } = await tiendasEnSector(tiendas, poligono);
      aplicarSeleccion(ids, accionSector);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPuntosDibujo([]);
      setDibujando(false);
      setCargando(null);
    }
  }

  function aplicarSeleccion(ids: string[], accion: "agregar" | "quitar") {
    setGruposManual((prev) => {
      const copia = prev.map((g) => [...g]);
      while (copia.length <= grupoActivo) copia.push([]);
      const conjunto = new Set(ids);
      if (accion === "quitar") {
        copia[grupoActivo] = copia[grupoActivo].filter((id) => !conjunto.has(id));
      } else {
        // sacarlas de cualquier otro grupo antes de añadirlas al activo
        for (let i = 0; i < copia.length; i++) {
          if (i !== grupoActivo) copia[i] = copia[i].filter((id) => !conjunto.has(id));
        }
        const yaEstan = new Set(copia[grupoActivo]);
        copia[grupoActivo] = [...copia[grupoActivo], ...ids.filter((id) => !yaEstan.has(id))];
      }
      return copia;
    });
    setRutas([]);
    setTotales(null);
  }

  /**
   * Reparte los puntos libres entre los grupos que ya existen, cada uno al
   * más cercano por distancia al centro del grupo. Es lo que hace falta al
   * añadir tiendas nuevas sobre un despacho ya ruteado: no queremos grupos
   * nuevos, queremos encajarlas en las rutas que ya salen.
   */
  function asignarAGruposCercanos() {
    const libres = sinAsignar;
    if (!libres.length || !grupos.length) return;

    const centros = grupos.map((g) => g.centro);
    setGruposManual((prev) => {
      const copia = prev.map((g) => [...g]);
      // `grupos` está compactado (sin vacíos); mapeamos su índice al real.
      const realDe: number[] = [];
      prev.forEach((g, i) => { if (g.length) realDe.push(i); });

      libres.forEach((id) => {
        const t = porId.get(id);
        if (!t) return;
        let mejor = 0;
        let mejorD = Infinity;
        centros.forEach((c, i) => {
          const d = (c.lat - t.lat) ** 2 + (c.lon - t.lon) ** 2;
          if (d < mejorD) { mejorD = d; mejor = i; }
        });
        const destino = realDe[mejor] ?? 0;
        copia[destino].push(id);
      });
      return copia;
    });
    setRutas([]);
    setTotales(null);
  }

  /** Clic en una tienda: la mete o la saca del grupo activo. */
  const alClicTienda = useCallback(
    (id: string) => {
      if (!esManual) return;
      setGruposManual((prev) => {
        const copia = prev.map((g) => [...g]);
        while (copia.length <= grupoActivo) copia.push([]);
        if (copia[grupoActivo].includes(id)) {
          copia[grupoActivo] = copia[grupoActivo].filter((x) => x !== id);
        } else {
          for (let i = 0; i < copia.length; i++) copia[i] = copia[i].filter((x) => x !== id);
          copia[grupoActivo].push(id);
        }
        return copia;
      });
      setRutas([]);
      setTotales(null);
    },
    [esManual, grupoActivo],
  );

  const avisos = rutas.filter((r) => r.aviso).map((r) => `Ruta ${r.indice + 1}: ${r.aviso}`);
  const hayResultado = grupos.length > 0 || rutas.length > 0;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[320px_1fr_340px]">
      {/* ---------------- Configuración ---------------- */}
      <aside className="min-w-0 overflow-y-auto border-r border-line bg-surface p-4">
        <Seccion titulo="Origen de los puntos">
          <Campo etiqueta="Trabajar sobre">
            <select
              value={idDespacho ?? ""}
              onChange={(e) =>
                router.push(
                  e.target.value ? `/planificador?despacho=${e.target.value}` : "/planificador",
                )
              }
              className="w-full rounded-[9px] border border-line-strong bg-surface px-2 py-1.5 text-[13px]"
            >
              <option value="">Tiendas activas ({tiendas.length})</option>
              {despachos.map((d) => (
                <option key={d.id} value={d.id}>
                  Despacho {d.fecha} — {d.nombre ?? "sin nombre"}
                </option>
              ))}
            </select>
          </Campo>

          {idDespacho && (
            <div className="rounded-[10px] border border-line bg-canvas p-2.5 text-[12px] text-ink-2">
              Cargué las rutas de ese despacho como grupos. Las tiendas que{" "}
              <b>no estaban en él aparecen grises</b> en el mapa: son tus puntos
              nuevos. Añádelos a un grupo con el sector, con un clic o con
              «🤖 Auto-asignar», y vuelve a calcular las rutas.
              {sinAsignar.length > 0 && (
                <div className="mt-1.5">
                  <b className="num text-[15px] text-ink">{sinAsignar.length}</b> puntos
                  nuevos por asignar
                </div>
              )}
            </div>
          )}
        </Seccion>

        <Seccion titulo="Agrupamiento">
          <Campo etiqueta="Modo">
            <Selector
              valor={modo}
              onChange={(v) => cambiarModo(v as Modo)}
              opciones={[
                ["capacidad", "Balanceado por capacidad"],
                ["manual", "Selección manual en el mapa"],
                ["clasico", "K-Means clásico"],
              ]}
            />
          </Campo>

          {modo === "manual" && (
            <>
              <div className="mb-2.5 rounded-[10px] border border-line bg-canvas p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] font-semibold text-ink-2">
                    Grupo activo
                  </span>
                  <span
                    className="num rounded px-1.5 py-0.5 text-[10.5px] font-bold text-white"
                    style={{ background: color(grupoActivo) }}
                  >
                    G-{String(grupoActivo + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className="mt-2 flex gap-4">
                  <div>
                    <div className="num text-[20px] font-bold leading-none">
                      {activoTiendas}
                    </div>
                    <div className="text-[10.5px] text-ink-3">tiendas</div>
                  </div>
                  <div>
                    <div className="num text-[20px] font-bold leading-none">
                      {activoBultos}
                    </div>
                    <div className="text-[10.5px] text-ink-3">bultos</div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="num text-[20px] font-bold leading-none text-ink-3">
                      {sinAsignar.length}
                    </div>
                    <div className="text-[10.5px] text-ink-3">libres</div>
                  </div>
                </div>
                <select
                  value={grupoActivo}
                  onChange={(e) => setGrupoActivo(Number(e.target.value))}
                  className="mt-2 w-full rounded-[9px] border border-line-strong bg-surface px-2 py-1.5 text-[12.5px]"
                >
                  {gruposManual.map((g, i) => (
                    <option key={i} value={i}>
                      Grupo {i + 1} — {g.length} tiendas
                    </option>
                  ))}
                </select>
              </div>

              <Campo etiqueta="Qué hace el sector que dibujes">
                <Selector
                  valor={accionSector}
                  onChange={(v) => setAccionSector(v as "agregar" | "quitar")}
                  opciones={[
                    ["agregar", "➕ Añadir al grupo activo"],
                    ["quitar", "➖ Quitar del grupo activo"],
                  ]}
                />
              </Campo>

              {!dibujando ? (
                <button
                  onClick={() => { setPuntosDibujo([]); setDibujando(true); }}
                  className="mb-2 w-full rounded-[9px] border border-amber-600 bg-amber px-3 py-2 text-[13px] font-semibold text-[#231403] transition hover:bg-amber-600 hover:text-white"
                >
                  ✏️ Dibujar sector en el mapa
                </button>
              ) : (
                <div className="mb-2 rounded-[10px] border border-amber bg-amber-050 p-2.5">
                  <p className="text-[12px] text-ink-2">
                    Haz clic en el mapa para marcar las esquinas del área.
                    <b> Doble clic</b> para cerrarla.
                  </p>
                  <p className="num mt-1 text-[11.5px] text-ink-3">
                    {puntosDibujo.length} punto(s)
                  </p>
                  <div className="mt-2 flex gap-1.5">
                    <button
                      onClick={cerrarSector}
                      disabled={puntosDibujo.length < 3 || cargando === "sector"}
                      className="flex-1 rounded-[8px] border border-amber-600 bg-amber px-2 py-1.5 text-[12px] font-semibold text-[#231403] disabled:opacity-50"
                    >
                      {cargando === "sector" ? "Buscando…" : "Cerrar y aplicar"}
                    </button>
                    <button
                      onClick={() => { setPuntosDibujo([]); setDibujando(false); }}
                      className="rounded-[8px] border border-line-strong px-2 py-1.5 text-[12px] font-semibold"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <div className="mb-2 grid grid-cols-2 gap-1.5">
                <BotonChico
                  onClick={() => {
                    setGruposManual([...gruposManual, []]);
                    setGrupoActivo(gruposManual.length);
                  }}
                >
                  ➕ Nuevo grupo
                </BotonChico>
                <BotonChico
                  onClick={() => {
                    const c = gruposManual.map((g, i) => (i === grupoActivo ? [] : g));
                    setGruposManual(c);
                    setRutas([]); setTotales(null);
                  }}
                >
                  🧹 Vaciar grupo
                </BotonChico>
                <BotonChico
                  disabled={gruposManual.length <= 1}
                  onClick={() => {
                    const c = gruposManual.filter((_, i) => i !== grupoActivo);
                    setGruposManual(c.length ? c : [[]]);
                    setGrupoActivo(0);
                    setRutas([]); setTotales(null);
                  }}
                >
                  🗑️ Eliminar grupo
                </BotonChico>
                <BotonChico onClick={limpiarTodo}>♻️ Limpiar todo</BotonChico>
              </div>

              {sinAsignar.length > 0 && grupos.length > 0 && (
                <button
                  onClick={asignarAGruposCercanos}
                  className="mb-2 w-full rounded-[9px] border border-line-strong bg-surface px-3 py-2 text-[12.5px] font-semibold text-ink-2 transition hover:bg-canvas"
                >
                  🤖 Auto-asignar {sinAsignar.length} libres al grupo más cercano
                </button>
              )}

              <p className="mb-2 text-[11.5px] text-ink-3">
                También puedes hacer clic en una tienda del mapa para meterla o
                sacarla del grupo activo.
              </p>
            </>
          )}

          {modo === "capacidad" && (
            <>
              <Campo etiqueta="Limitar cada ruta por">
                <Selector
                  valor={cfgA.criterio}
                  onChange={(v) => setCfgA({ ...cfgA, criterio: v as ConfigAgrupar["criterio"] })}
                  opciones={[
                    ["tiendas", "Nº de tiendas"],
                    ["bultos", "Nº de bultos"],
                    ["flota", "Flota personalizada"],
                  ]}
                />
              </Campo>

              {cfgA.criterio !== "flota" && (
                <Campo etiqueta={cfgA.criterio === "bultos" ? "Máx. bultos por ruta" : "Máx. tiendas por ruta"}>
                  <Numero valor={cfgA.capacidad} min={1}
                    onChange={(v) => setCfgA({ ...cfgA, capacidad: v })} />
                </Campo>
              )}

              {cfgA.criterio === "flota" && (
                <>
                  <p className="mb-2 text-[11.5px] text-ink-3">
                    Tipos de vehículo. Máx. tiendas 0 = sin límite.
                  </p>
                  {cfgA.flota.map((f, i) => (
                    <div key={i} className="mb-2 grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5">
                      <Numero valor={f.cantidad} min={1} etiquetaCorta="uds"
                        onChange={(v) => { const n = [...cfgA.flota]; n[i] = { ...f, cantidad: v }; setCfgA({ ...cfgA, flota: n }); }} />
                      <Numero valor={f.capacidad} min={1} etiquetaCorta="blt"
                        onChange={(v) => { const n = [...cfgA.flota]; n[i] = { ...f, capacidad: v }; setCfgA({ ...cfgA, flota: n }); }} />
                      <Numero valor={f.max_tiendas} min={0} etiquetaCorta="máx"
                        onChange={(v) => { const n = [...cfgA.flota]; n[i] = { ...f, max_tiendas: v }; setCfgA({ ...cfgA, flota: n }); }} />
                      <button
                        onClick={() => setCfgA({ ...cfgA, flota: cfgA.flota.filter((_, j) => j !== i) })}
                        className="rounded-md px-1.5 text-ink-3 hover:bg-canvas hover:text-bad"
                        title="Quitar"
                      >✕</button>
                    </div>
                  ))}
                  <button
                    onClick={() => setCfgA({ ...cfgA, flota: [...cfgA.flota, { cantidad: 1, capacidad: 200, max_tiendas: 0 }] })}
                    className="mb-2 w-full rounded-[9px] border border-dashed border-line-strong py-1.5 text-[12px] font-semibold text-ink-2 hover:bg-canvas"
                  >+ Agregar tipo</button>

                  <div className="mb-2 rounded-[9px] bg-canvas px-2.5 py-2 text-[11.5px] text-ink-2">
                    Capacidad: <b className="num">{capFlota.toLocaleString("es-PE")}</b> bultos/vuelta ·
                    Demanda: <b className="num">{totalBultos.toLocaleString("es-PE")}</b>
                    {capFlota * cfgA.vueltas < totalBultos && (
                      <span className="mt-1 block text-warn">
                        La flota no cubre la demanda; quedarán tiendas sin asignar.
                      </span>
                    )}
                  </div>

                  <Campo etiqueta="Vueltas máximas">
                    <Numero valor={cfgA.vueltas} min={1} max={3}
                      onChange={(v) => setCfgA({ ...cfgA, vueltas: v })} />
                  </Campo>
                  <Campo etiqueta="Uso de la flota">
                    <Selector
                      valor={cfgA.uso_flota}
                      onChange={(v) => setCfgA({ ...cfgA, uso_flota: v as "compacto" | "minimo" })}
                      opciones={[
                        ["compacto", "Zonas compactas (+30% veh.)"],
                        ["minimo", "Mínimo de vehículos"],
                      ]}
                    />
                  </Campo>
                </>
              )}
            </>
          )}

          {modo === "clasico" && (
            <Campo etiqueta="Número de grupos (K)">
              <Numero valor={cfgA.k} min={2} onChange={(v) => setCfgA({ ...cfgA, k: v })} />
            </Campo>
          )}

          {!esManual && (
            <div className="mt-1 flex gap-1.5">
              <button
                onClick={hacerAgrupar}
                disabled={cargando !== null || !tiendas.length}
                className="flex-1 rounded-[9px] border border-navy-800 bg-navy-800 px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-navy-700 disabled:opacity-50"
              >
                {cargando === "agrupar" ? "Agrupando…" : "◈ Agrupar tiendas"}
              </button>
              {hayResultado && (
                <button
                  onClick={limpiarTodo}
                  title="Limpiar y elegir otra opción"
                  className="rounded-[9px] border border-line-strong px-2.5 py-2 text-[13px] font-semibold text-ink-2 transition hover:bg-canvas"
                >
                  ♻️
                </button>
              )}
            </div>
          )}
        </Seccion>

        <Seccion titulo="Centro de distribución">
          <div className="grid grid-cols-2 gap-2">
            <Campo etiqueta="Latitud">
              <Numero valor={cfgR.cd_lat} decimal onChange={(v) => setCfgR({ ...cfgR, cd_lat: v })} />
            </Campo>
            <Campo etiqueta="Longitud">
              <Numero valor={cfgR.cd_lon} decimal onChange={(v) => setCfgR({ ...cfgR, cd_lon: v })} />
            </Campo>
          </div>
        </Seccion>

        <Seccion titulo="Ruteo">
          <Campo etiqueta="Motor de distancias">
            <Selector
              valor={cfgR.motor}
              onChange={(v) => setCfgR({ ...cfgR, motor: v as "osrm" | "haversine" })}
              opciones={[
                ["osrm", "Calles reales (OSRM, gratis)"],
                ["haversine", "Línea recta (instantáneo)"],
              ]}
            />
          </Campo>
          <Campo etiqueta="Tipo de recorrido">
            <Selector
              valor={cfgR.cerrado ? "cerrado" : "abierto"}
              onChange={(v) => setCfgR({ ...cfgR, cerrado: v === "cerrado" })}
              opciones={[
                ["cerrado", "Cerrado (vuelve al CD)"],
                ["abierto", "Abierto (termina en la última)"],
              ]}
            />
          </Campo>
          <div className="grid grid-cols-2 gap-2">
            <Campo etiqueta="Hora de salida">
              <input type="time" value={cfgR.hora_salida}
                onChange={(e) => setCfgR({ ...cfgR, hora_salida: e.target.value })}
                className="w-full rounded-[9px] border border-line-strong px-2 py-1.5 text-[13px]" />
            </Campo>
            <Campo etiqueta="Jornada máx. (h)">
              <Numero valor={cfgR.jornada_h} min={0} decimal
                onChange={(v) => setCfgR({ ...cfgR, jornada_h: v })} />
            </Campo>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Campo etiqueta="Min. por parada">
              <Numero valor={cfgR.servicio_min} min={0} decimal
                onChange={(v) => setCfgR({ ...cfgR, servicio_min: v })} />
            </Campo>
            <Campo etiqueta="Min. por bulto">
              <Numero valor={cfgR.servicio_min_bulto} min={0} decimal
                onChange={(v) => setCfgR({ ...cfgR, servicio_min_bulto: v })} />
            </Campo>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Campo etiqueta="Costo fijo/ruta">
              <Numero valor={cfgR.costo_fijo} min={0} decimal
                onChange={(v) => setCfgR({ ...cfgR, costo_fijo: v })} />
            </Campo>
            <Campo etiqueta="Costo por km">
              <Numero valor={cfgR.costo_km} min={0} decimal
                onChange={(v) => setCfgR({ ...cfgR, costo_km: v })} />
            </Campo>
          </div>
          <Campo etiqueta="Segundos de optimización por ruta">
            <Numero valor={cfgR.tiempo_tsp} min={1} max={15}
              onChange={(v) => setCfgR({ ...cfgR, tiempo_tsp: v })} />
          </Campo>

          <button
            onClick={hacerRutear}
            disabled={cargando !== null || !grupos.length}
            className="mt-1 w-full rounded-[9px] border border-amber-600 bg-amber px-3 py-2 text-[13px] font-semibold text-[#231403] transition hover:bg-amber-600 hover:text-white disabled:opacity-50"
          >
            {cargando === "rutear" ? "Optimizando…" : "▸ Calcular rutas óptimas"}
          </button>
          {!grupos.length && (
            <p className="mt-1.5 text-[11.5px] text-ink-3">
              {esManual ? "Arma al menos un grupo." : "Primero agrupa las tiendas."}
            </p>
          )}
        </Seccion>
      </aside>

      {/* ---------------- Mapa ---------------- */}
      <section className="relative min-h-[420px] min-w-0">
        <MapaRutas
          tiendas={tiendas}
          grupos={grupos}
          rutas={rutas}
          cd={{ lat: cfgR.cd_lat, lon: cfgR.cd_lon }}
          sinAsignar={sinAsignar}
          mostrarZonas={verZonas}
          mostrarTrazos={verTrazos}
          mostrarNumeros={verNumeros && rutas.length > 0}
          grupoResaltado={resaltado}
          onClicTienda={esManual ? alClicTienda : undefined}
          dibujando={dibujando}
          puntosDibujo={puntosDibujo}
          onPuntoDibujo={(p) => setPuntosDibujo((prev) => [...prev, p])}
          onCerrarDibujo={cerrarSector}
          colorDibujo={color(grupoActivo)}
        />

        {dibujando && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded-full border border-amber bg-surface/95 px-3 py-1.5 text-[12px] font-semibold shadow">
            Dibujando sector · clic para marcar, doble clic para cerrar
          </div>
        )}

        <div className="absolute right-3 top-3 z-[500] flex flex-col gap-1 rounded-[10px] border border-line bg-surface/95 p-2 text-[12px] shadow">
          <Check marcado={verZonas} onChange={setVerZonas} texto="Zonas" />
          <Check marcado={verTrazos} onChange={setVerTrazos} texto="Trazos" />
          <Check marcado={verNumeros} onChange={setVerNumeros} texto="Orden" />
        </div>

        {resaltado !== null && (
          <button
            onClick={() => setResaltado(null)}
            className="absolute bottom-3 left-3 z-[500] rounded-[9px] border border-line bg-surface px-3 py-1.5 text-[12px] font-semibold shadow"
          >
            Ver todas las rutas
          </button>
        )}
      </section>

      {/* ---------------- Resultados ---------------- */}
      <aside className="min-w-0 overflow-y-auto border-l border-line bg-surface p-4">
        {error && (
          <p className="mb-3 rounded-[10px] border border-bad/30 bg-bad-bg px-3 py-2 text-[12.5px] text-bad">
            {error}
          </p>
        )}
        {avisos.length > 0 && (
          <details className="mb-3 rounded-[10px] border border-warn/30 bg-warn-bg px-3 py-2 text-[12.5px] text-warn">
            <summary className="cursor-pointer font-semibold">
              {avisos.length} aviso(s) del optimizador
            </summary>
            <ul className="mt-1.5 space-y-1">{avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </details>
        )}

        {totales && (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <Dato etiqueta="Rutas" valor={String(totales.rutas)} />
              <Dato etiqueta="Distancia" valor={`${totales.km.toFixed(1)} km`} />
              <Dato etiqueta="Tiempo" valor={`${(totales.duracion_min / 60).toFixed(1)} h`} />
              <Dato etiqueta="Costo" valor={totales.costo ? `S/ ${totales.costo.toFixed(2)}` : "—"} />
            </div>

            {guardado ? (
              <div className="mb-3 rounded-[10px] border border-ok/30 bg-ok-bg px-3 py-2.5 text-[12.5px] text-ok">
                <b>✓ Despacho guardado.</b>
                <div className="mt-1 text-ink-2">
                  {guardado.rutas} rutas y {guardado.paradas} paradas quedaron en tu
                  histórico. Trazado comprimido de{" "}
                  <span className="num">{guardado.puntosOriginales.toLocaleString("es-PE")}</span> a{" "}
                  <span className="num">{guardado.puntosGuardados.toLocaleString("es-PE")}</span> puntos.
                </div>
              </div>
            ) : (
              <button
                onClick={hacerGuardar}
                disabled={cargando !== null}
                className="mb-3 w-full rounded-[9px] border border-navy-800 bg-navy-800 px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-navy-700 disabled:opacity-50"
              >
                {cargando === "guardar" ? "Guardando…" : "💾 Guardar despacho"}
              </button>
            )}
          </>
        )}

        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-[13px] font-bold">
            {rutas.length ? "Rutas" : "Grupos"}{" "}
            <span className="num text-ink-3">{rutas.length || grupos.length || ""}</span>
          </h3>
          {hayResultado && (
            <button
              onClick={limpiarTodo}
              className="ml-auto rounded-[8px] border border-line-strong px-2 py-1 text-[11.5px] font-semibold text-ink-2 transition hover:bg-canvas"
            >
              ♻️ Limpiar selección
            </button>
          )}
        </div>

        {!grupos.length && (
          <p className="text-[13px] text-ink-2">
            {esManual
              ? "Dibuja un sector en el mapa o haz clic en tiendas para armar tu primer grupo."
              : "Configura el agrupamiento y pulsa Agrupar tiendas."}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {grupos.map((g) => {
            const r = rutas.find((x) => x.indice === g.indice);
            const uso = g.capacidad_vehiculo
              ? Math.round((g.bultos / g.capacidad_vehiculo) * 100)
              : null;
            return (
              <button
                key={g.indice}
                onClick={() => setResaltado(resaltado === g.indice ? null : g.indice)}
                style={{ ["--c" as string]: color(g.indice) }}
                className={`relative rounded-[10px] border p-2.5 text-left transition ${
                  resaltado === g.indice
                    ? "border-[var(--c)] shadow-[0_0_0_1px_var(--c)]"
                    : "border-line hover:border-line-strong"
                }`}
              >
                <span className="absolute inset-y-0 left-0 w-[3px] rounded-l-[10px] bg-[var(--c)]" />
                <div className="flex items-center gap-2">
                  <span className="num rounded px-1.5 py-0.5 text-[10.5px] font-bold text-white"
                    style={{ background: color(g.indice) }}>
                    R-{String(g.indice + 1).padStart(2, "0")}
                  </span>
                  {g.capacidad_vehiculo && (
                    <span className="text-[11.5px] text-ink-3">
                      veh. {g.capacidad_vehiculo} · vuelta {g.vuelta}
                    </span>
                  )}
                  {g.prioritarias > 0 && (
                    <span className="ml-auto text-[11px] text-amber-600">⭐ {g.prioritarias}</span>
                  )}
                </div>
                <div className="mt-1.5 flex gap-3 text-[11px] text-ink-3">
                  <span><b className="num text-[13px] text-ink">{g.n_tiendas}</b> tiendas</span>
                  <span><b className="num text-[13px] text-ink">{g.bultos}</b> bultos</span>
                  {r && <span><b className="num text-[13px] text-ink">{r.km.toFixed(1)}</b> km</span>}
                </div>
                {r && (
                  <div className="mt-1 text-[11.5px] text-ink-2">
                    <span className="num">{r.salida}</span> → <span className="num">{r.fin}</span>
                    {r.costo > 0 && <> · <span className="num">S/ {r.costo.toFixed(2)}</span></>}
                  </div>
                )}
                {uso !== null && (
                  <div className="mt-1.5">
                    <div className="h-[5px] overflow-hidden rounded-full border border-line bg-canvas">
                      <div className="h-full rounded-full"
                        style={{ width: `${Math.min(uso, 100)}%`, background: color(g.indice) }} />
                    </div>
                    <div className="mt-0.5 text-right text-[10.5px] text-ink-3">
                      <span className="num">{uso}%</span> de ocupación
                    </div>
                  </div>
                )}
                {r?.links_maps?.[0] && (
                  <a href={r.links_maps[0]} target="_blank" rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1.5 inline-block text-[11.5px] font-semibold text-amber-600 underline underline-offset-2">
                    Abrir en Google Maps
                  </a>
                )}
              </button>
            );
          })}
        </div>

        {sinAsignar.length > 0 && (
          <div className="mt-3 rounded-[10px] border border-line bg-canvas p-2.5">
            <Pastilla tono={esManual ? "plan" : "warn"}>
              {sinAsignar.length} sin asignar
            </Pastilla>
            <p className="mt-1.5 text-[12px] text-ink-2">
              {esManual
                ? "Tiendas libres (grises en el mapa). Selecciónalas con un sector o haciendo clic."
                : "No entraron en la flota. Sube las vueltas, agrega vehículos o reduce la carga."}
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

/* ---------------- piezas de formulario ---------------- */
function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 border-b border-line pb-4 last:border-0">
      <h3 className="mb-2.5 text-[10.5px] font-bold uppercase tracking-[0.11em] text-ink-3">
        {titulo}
      </h3>
      {children}
    </div>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="mb-2.5 block">
      <span className="mb-1 block text-[11.5px] font-semibold text-ink-2">{etiqueta}</span>
      {children}
    </label>
  );
}

function Selector({
  valor, onChange, opciones,
}: { valor: string; onChange: (v: string) => void; opciones: [string, string][] }) {
  return (
    <select value={valor} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-[9px] border border-line-strong bg-surface px-2 py-1.5 text-[13px]">
      {opciones.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
    </select>
  );
}

function Numero({
  valor, onChange, min, max, decimal, etiquetaCorta,
}: {
  valor: number; onChange: (v: number) => void;
  min?: number; max?: number; decimal?: boolean; etiquetaCorta?: string;
}) {
  return (
    <span className="relative block">
      <input
        type="number" value={valor} min={min} max={max} step={decimal ? "any" : 1}
        onChange={(e) => {
          const n = decimal ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
          if (!Number.isNaN(n)) onChange(n);
        }}
        className="num w-full rounded-[9px] border border-line-strong bg-surface px-2 py-1.5 text-[13px]"
      />
      {etiquetaCorta && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ink-3">
          {etiquetaCorta}
        </span>
      )}
    </span>
  );
}

function BotonChico({
  children, onClick, disabled,
}: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="rounded-[9px] border border-line-strong bg-surface px-2 py-1.5 text-[12px] font-semibold text-ink-2 transition hover:bg-canvas disabled:opacity-40">
      {children}
    </button>
  );
}

function Check({
  marcado, onChange, texto,
}: { marcado: boolean; onChange: (v: boolean) => void; texto: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5">
      <input type="checkbox" checked={marcado} onChange={(e) => onChange(e.target.checked)} />
      {texto}
    </label>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-[10px] border border-line bg-surface-2 px-2.5 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wide text-ink-3">{etiqueta}</div>
      <div className="num text-[16px] font-bold">{valor}</div>
    </div>
  );
}
