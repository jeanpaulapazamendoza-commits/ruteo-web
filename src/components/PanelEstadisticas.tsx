"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  informeArticulos,
  informeEnvios,
  informeRutas,
  type InformeArticulos,
  type InformeEnvios,
  type InformeRutas,
  type PuntoMapa,
} from "@/app/acciones/estadisticas";
import {
  BarrasH, BarrasHora, Cifra, COLORES, Panel, Rosquilla, Seccion, Vacio,
} from "@/components/graficos";
import { Celda, EstadoVacio, Tabla } from "@/components/ui";
import { aCSV, descargar } from "@/lib/exportar";
import { diaCorto, hora, hoy } from "@/lib/horas";

const MapaEstadisticas = dynamic(() => import("@/components/MapaEstadisticas"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-[13px] text-ink-3">
      Cargando mapa…
    </div>
  ),
});

/**
 * Los informes, con la disposición de la referencia.
 *
 * Una barra blanca de pestañas de ancho fijo, con la activa subrayada en
 * turquesa y los filtros a la derecha; debajo, «Estadísticas del día» y el
 * informe. El mapa lleva sus filtros en una columna a la izquierda y el
 * deslizador de horas debajo, con dos tiradores.
 */
type Pestana = "mapa" | "envios" | "rutas" | "articulos";

const PESTANAS: { id: Pestana; texto: string }[] = [
  { id: "mapa", texto: "Mapa" },
  { id: "envios", texto: "Envíos" },
  { id: "rutas", texto: "Rutas" },
  { id: "articulos", texto: "Artículos" },
];

const TEXTO = "#676a6c";
const TURQUESA = "#23c6c8";

const TEXTO_ESTADO: Record<string, string> = {
  entregado: "Entregado",
  parcial: "Entrega parcial",
  reprogramado: "Reprogramado",
  fallido: "No entregado",
  pendiente: "Pendiente",
};

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** Minutos desde medianoche a una hora legible. */
function reloj(min: number | null) {
  if (min === null || min === undefined) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} hrs.`;
}

/** Minutos a horas y minutos. Un número de tres cifras no se lee de un vistazo. */
function duracion(min: number | null) {
  if (min === null || min === undefined) return "—";
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.round(Math.abs(min) % 60);
  const signo = min < 0 ? "−" : "";
  return h > 0 ? `${signo}${h}h ${m} min.` : `${signo}${m} min.`;
}

/** «sábado 21 de noviembre 2026», como lo escribe la referencia. */
function diaEscrito(dia: string) {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(a, m - 1, d)
    .toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    .replace(" de " + a, " " + a);
}

function haceDias(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

export default function PanelEstadisticas() {
  const [pestana, setPestana] = useState<Pestana>("mapa");
  const [desde, setDesde] = useState(hoy());
  const [hasta, setHasta] = useState(hoy());
  const [filtros, setFiltros] = useState(false);

  const [envios, setEnvios] = useState<InformeEnvios | null>(null);
  const [rutas, setRutas] = useState<InformeRutas | null>(null);
  const [articulos, setArticulos] = useState<InformeArticulos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (d: string, h: string) => {
    setCargando(true);
    setError(null);
    try {
      // Los tres a la vez: son tres consultas independientes y encadenarlas
      // triplicaría la espera de la primera pintada.
      const [e, r, a] = await Promise.all([
        informeEnvios(d, h),
        informeRutas(d, h),
        informeArticulos(d, h),
      ]);
      setEnvios(e);
      setRutas(r);
      setArticulos(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar(desde, hasta);
  }, [cargar, desde, hasta]);

  const rango = desde === hasta ? diaCorto(desde) : `${diaCorto(desde)} — ${diaCorto(hasta)}`;
  const rotulo =
    desde === hasta ? (
      <>
        Estadísticas del <b>{diaEscrito(desde)}</b>
      </>
    ) : (
      <>
        Estadísticas del <b>{diaEscrito(desde)}</b> al <b>{diaEscrito(hasta)}</b>
      </>
    );

  const campo =
    "num h-8 rounded-[4px] border border-line bg-surface px-2 text-[13px] text-ink outline-none focus:border-amber";

  return (
    <div className="sin-panel">
      <div className="px-5 pt-4" style={{ color: TEXTO }}>
        <h1 className="pb-4 text-[22px] font-bold leading-[28px] text-ink-2">Estadísticas</h1>

        {/* Barra de pestañas. El rango manda sobre los cuatro informes:
            cambiarlo en uno y que otro siga en otra fecha es la forma más
            rápida de sacar una conclusión equivocada. */}
        <div className="flex h-[37px] items-stretch bg-surface shadow-[0_3px_6px_rgba(0,0,0,0.1)]">
          <div className="flex min-w-0 overflow-x-auto">
            {PESTANAS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPestana(p.id)}
                className="w-[152px] shrink-0 border-b-[3px] px-[35px] text-[14px] transition"
                style={{
                  borderColor: pestana === p.id ? TURQUESA : "transparent",
                  color: pestana === p.id ? TEXTO : "#aaaaaa",
                }}
              >
                {p.texto}
              </button>
            ))}
          </div>
          <button
            onClick={() => setFiltros((v) => !v)}
            aria-expanded={filtros}
            className="ml-auto mr-4 flex items-center gap-2 px-3 text-[14px]"
            style={{ color: TEXTO }}
          >
            Filtros
            <span
              className="num rounded-full px-2 text-[11px] font-bold leading-[17px] text-white"
              style={{ background: TURQUESA }}
            >
              1
            </span>
          </button>
        </div>

        {filtros && (
          <div className="flex flex-wrap items-center gap-2 bg-surface px-[15px] py-3 shadow-[0_3px_6px_rgba(0,0,0,0.1)]">
            <span className="text-[13px]">Rango de fechas</span>
            <input
              type="date"
              value={desde}
              max={hasta}
              onChange={(e) => e.target.value && setDesde(e.target.value)}
              className={campo}
            />
            <span className="text-[12px]">a</span>
            <input
              type="date"
              value={hasta}
              min={desde}
              onChange={(e) => e.target.value && setHasta(e.target.value)}
              className={campo}
            />
            <Atajo texto="Hoy" onClic={() => { setDesde(hoy()); setHasta(hoy()); }} />
            <Atajo texto="7 días" onClic={() => { setDesde(haceDias(6)); setHasta(hoy()); }} />
            <Atajo texto="30 días" onClic={() => { setDesde(haceDias(29)); setHasta(hoy()); }} />
          </div>
        )}

        {error && (
          <p className="mt-3 border border-bad/30 bg-bad-bg px-3 py-2 text-[13px] text-bad">{error}</p>
        )}

        <div className="@container mt-[16px]">
          {cargando ? (
            <p className="bg-surface p-6 text-center text-[13px]">Calculando…</p>
          ) : pestana === "mapa" ? (
            <VistaMapa envios={envios} rotulo={rotulo} />
          ) : pestana === "envios" ? (
            <VistaEnvios datos={envios} rango={rango} rotulo={rotulo} />
          ) : pestana === "rutas" ? (
            <VistaRutas datos={rutas} rango={rango} rotulo={rotulo} />
          ) : (
            <VistaArticulos datos={articulos} rango={rango} rotulo={rotulo} />
          )}
        </div>
      </div>
    </div>
  );
}

function Atajo({ texto, onClic }: { texto: string; onClic: () => void }) {
  return (
    <button
      onClick={onClic}
      className="h-8 rounded-[4px] border border-line-strong bg-surface px-3 text-[13px] text-ink transition hover:bg-surface-2"
    >
      {texto}
    </button>
  );
}

/** «Estadísticas del sábado 21 de noviembre 2026», con el botón de exportar. */
function Encabezado({
  rotulo,
  onExportar,
}: {
  rotulo: React.ReactNode;
  onExportar?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 bg-surface pb-[10px] pl-[15px] pr-[14px] pt-5">
      <span className="text-[18px]">{rotulo}</span>
      {onExportar && (
        <button
          onClick={onExportar}
          className="ml-auto h-9 rounded-[3px] px-4 text-[13px] text-white transition hover:brightness-95"
          style={{ background: "#5bc0de" }}
        >
          Exportar
        </button>
      )}
    </div>
  );
}

function SinDatos({
  rotulo,
  titulo,
  descripcion,
}: {
  rotulo: React.ReactNode;
  titulo: string;
  descripcion: string;
}) {
  return (
    <div className="bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
      <Encabezado rotulo={rotulo} />
      <EstadoVacio icono="◳" titulo={titulo} descripcion={descripcion} />
    </div>
  );
}

/* ── Mapa ─────────────────────────────────────────────────────────── */

const ESTADOS_MAPA = [
  { clave: "entregado", texto: "Entregado" },
  { clave: "fallido", texto: "No entregado" },
  { clave: "parcial", texto: "Entrega parcial" },
];

const PUNTUALIDAD: PuntoMapa["puntual"][] = ["A tiempo", "Adelantado", "Atrasado", "No definido"];

function alternarEn<T>(lista: T[], valor: T) {
  return lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor];
}

function VistaMapa({ envios, rotulo }: { envios: InformeEnvios | null; rotulo: React.ReactNode }) {
  const [desde, setDesde] = useState(0);
  const [hasta, setHasta] = useState(24);
  const [estados, setEstados] = useState<string[]>([]);
  const [puntual, setPuntual] = useState<string[]>([]);
  const [subestado, setSubestado] = useState("");
  const [conductor, setConductor] = useState("");
  const [vehiculo, setVehiculo] = useState("");

  const puntos = useMemo(() => envios?.puntos ?? [], [envios]);

  const opciones = useMemo(() => {
    const unicos = (f: (p: PuntoMapa) => string | null) =>
      [...new Set(puntos.map(f).filter(Boolean) as string[])].sort();
    return {
      subestados: unicos((p) => p.subestado),
      conductores: unicos((p) => p.conductor),
      vehiculos: unicos((p) => p.placa),
    };
  }, [puntos]);

  // Sin ninguna casilla marcada se ve todo, como en la referencia: una lista
  // de casillas vacía que escondiera el mapa entero no la entendería nadie.
  const filtrados = useMemo(
    () =>
      puntos.filter(
        (p) =>
          (estados.length === 0 || estados.includes(p.estado)) &&
          (puntual.length === 0 || puntual.includes(p.puntual)) &&
          (!subestado || p.subestado === subestado) &&
          (!conductor || p.conductor === conductor) &&
          (!vehiculo || p.placa === vehiculo),
      ),
    [puntos, estados, puntual, subestado, conductor, vehiculo],
  );

  if (puntos.length === 0) {
    return (
      <SinDatos
        rotulo={rotulo}
        titulo="Sin paradas en este rango"
        descripcion="No hay nada repartido entre esas fechas. Abre Filtros y prueba con otro rango."
      />
    );
  }

  const selector =
    "h-[38px] w-full rounded-[4px] border border-line bg-surface px-3 text-[14px] text-ink outline-none focus:border-amber";

  return (
    <div>
      <div className="bg-surface">
        <Encabezado rotulo={rotulo} />
        <div className="px-[15px] pb-[14px] text-[16px] font-bold uppercase">Mapa de despachos</div>
      </div>

      <div className="mt-[2px] grid grid-cols-1 gap-4 bg-surface p-5 shadow-[0_1px_3px_rgba(0,0,0,0.1)] @4xl:grid-cols-[430px_1fr]">
        {/* Filtros del mapa */}
        <div className="min-w-0">
          <Grupo titulo="Estado">
            {ESTADOS_MAPA.map((e) => (
              <Casilla
                key={e.clave}
                texto={e.texto}
                marcada={estados.includes(e.clave)}
                onCambio={() => setEstados((l) => alternarEn(l, e.clave))}
              />
            ))}
          </Grupo>

          <Grupo titulo="Subestados">
            <select value={subestado} onChange={(e) => setSubestado(e.target.value)} className={selector}>
              <option value=""></option>
              {opciones.subestados.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Grupo>

          <Grupo titulo="Usuarios móviles">
            <select value={conductor} onChange={(e) => setConductor(e.target.value)} className={selector}>
              <option value=""></option>
              {opciones.conductores.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Grupo>

          <Grupo titulo="Vehículos">
            <select value={vehiculo} onChange={(e) => setVehiculo(e.target.value)} className={selector}>
              <option value=""></option>
              {opciones.vehiculos.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Grupo>

          <Grupo titulo="Cumplimiento">
            {PUNTUALIDAD.map((c) => (
              <Casilla
                key={c}
                texto={c}
                marcada={puntual.includes(c)}
                onCambio={() => setPuntual((l) => alternarEn(l, c))}
              />
            ))}
          </Grupo>

          <p className="pt-2 text-[12px]" style={{ color: "#8a8d8f" }}>
            <b className="num">{filtrados.length}</b> de <span className="num">{puntos.length}</span>{" "}
            paradas en el mapa.
          </p>
        </div>

        {/* Mapa y deslizador */}
        <div className="min-w-0">
          <div className="h-[450px] overflow-hidden">
            <MapaEstadisticas puntos={filtrados} desde={desde} hasta={hasta} />
          </div>
          <DobleRango
            desde={desde}
            hasta={hasta}
            onCambio={(d, h) => { setDesde(d); setHasta(h); }}
          />
        </div>
      </div>
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 border-b pb-3" style={{ borderColor: "#e0e0e0" }}>
      <div className="pb-1.5 text-[14px] font-bold">{titulo}</div>
      {children}
    </div>
  );
}

function Casilla({
  texto,
  marcada,
  onCambio,
}: {
  texto: string;
  marcada: boolean;
  onCambio: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-[5px] text-[14px]">
      <input
        type="checkbox"
        checked={marcada}
        onChange={onCambio}
        className="h-[15px] w-[15px] accent-[#1ab394]"
      />
      {texto}
    </label>
  );
}

/**
 * El deslizador de horas, con dos tiradores sobre una misma pista.
 *
 * Dos y no uno: lo interesante no es «hasta las once» sino «entre las once y
 * la una», que es cuando se para todo. Va de 0 a 24; el 24 se escribe 23:59.
 */
function DobleRango({
  desde,
  hasta,
  onCambio,
}: {
  desde: number;
  hasta: number;
  onCambio: (desde: number, hasta: number) => void;
}) {
  const escribe = (h: number) => (h >= 24 ? "23:59" : `${String(h).padStart(2, "0")}:00`);
  const pos = (h: number) => (h / 24) * 100;
  const VERDE = "#1ab394";

  return (
    <div className="px-[9px] pt-[34px]">
      <div className="doble-rango relative h-[18px]">
        {/* Pista */}
        <div className="absolute inset-x-0 top-[7px] h-[4px] rounded-full" style={{ background: "#d9dde1" }} />
        <div
          className="absolute top-[7px] h-[4px] rounded-full"
          style={{ left: `${pos(desde)}%`, width: `${pos(hasta) - pos(desde)}%`, background: VERDE }}
        />

        {/* Burbujas con la hora de cada tirador */}
        {[desde, hasta].map((h, i) => (
          <span
            key={i}
            className="num absolute -top-[30px] -translate-x-1/2 rounded-[4px] px-1.5 py-[2px] text-[11px] font-bold text-white"
            style={{ left: `${pos(h)}%`, background: VERDE }}
          >
            {escribe(h)}
          </span>
        ))}

        <input
          type="range"
          min={0}
          max={24}
          value={desde}
          aria-label="Hora inicial"
          onChange={(e) => {
            const v = Math.min(Number(e.target.value), 23);
            onCambio(v, Math.max(hasta, v + 1));
          }}
        />
        <input
          type="range"
          min={0}
          max={24}
          value={hasta}
          aria-label="Hora final"
          onChange={(e) => {
            const v = Math.max(Number(e.target.value), 1);
            onCambio(Math.min(desde, v - 1), v);
          }}
        />
      </div>

      <div className="relative mt-1 h-4 text-[11px]">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h} className="num absolute -translate-x-1/2" style={{ left: `${pos(h)}%` }}>
            {escribe(h)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Envíos ───────────────────────────────────────────────────────── */

/** Deja las clases en el orden en que se quieren leer, no en el de la base. */
function ordenar(cuentas: { texto: string; n: number }[], orden: string[]) {
  return orden.map((t) => cuentas.find((c) => c.texto === t) ?? { texto: t, n: 0 });
}

function VistaEnvios({
  datos: d,
  rango,
  rotulo,
}: {
  datos: InformeEnvios | null;
  rango: string;
  rotulo: React.ReactNode;
}) {
  if (!d || d.total === 0) {
    return (
      <SinDatos
        rotulo={rotulo}
        titulo="Sin paradas en este rango"
        descripcion="No hay nada repartido entre esas fechas. Abre Filtros y prueba con otro rango."
      />
    );
  }

  function exportar() {
    if (!d) return;
    descargar(
      `envios-${rango.replace(/\s/g, "")}.csv`,
      aCSV(
        ["Parada", "Código", "Cliente", "Fecha", "Conductor", "Marcada", "Desvío (min)", "Estado"],
        d.ultimas.map((u) => [
          u.parada_id, u.codigo, u.nombre, u.fecha, u.conductor,
          u.hora_entrega ? hora(u.hora_entrega) : "", u.desvio_min,
          TEXTO_ESTADO[u.estado_entrega] ?? u.estado_entrega,
        ]),
      ),
    );
  }

  const colorDe = (t: string) => (t === "Sin motivo" ? COLORES.pendiente : COLORES.fallido);

  return (
    <div className="bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
      <Encabezado rotulo={rotulo} onExportar={exportar} />

      <Seccion
        titulo="Total de despachos"
        nota="Los gráficos a continuación muestran datos de todos los despachos entregados y estimados en el rango de fechas seleccionado"
      />

      <div className="grid grid-cols-1 @3xl:grid-cols-[1fr_2fr]">
        <Panel titulo="Informes de Despacho">
          <Rosquilla
            etiquetaTotal="Total de Despachos"
            partes={ordenar(d.estados, ["pendiente", "entregado", "fallido", "parcial", "reprogramado"])
              .filter((e) => e.n > 0 || e.texto !== "reprogramado")
              .map((e) => ({
                texto: TEXTO_ESTADO[e.texto] ?? e.texto,
                n: e.n,
                color: COLORES[e.texto as keyof typeof COLORES] ?? COLORES.pendiente,
              }))}
          />
        </Panel>

        <Panel titulo="Número de Despachos por Subestado">
          {d.subestados.length ? (
            <BarrasH
              datos={d.subestados.map((s) => ({ ...s, color: colorDe(s.texto) }))}
              limite={12}
              conPorcentaje
            />
          ) : (
            <Vacio texto="Nada quedó sin entregar en este rango." />
          )}
        </Panel>
      </div>

      <Panel titulo="Despachos gestionados por horas">
        <BarrasHora datos={d.por_hora} />
      </Panel>

      <Seccion titulo="Número de despachos por usuarios móviles y vehículo" />
      <div className="grid grid-cols-1 @3xl:grid-cols-2">
        <Panel titulo="Usuarios móviles">
          <BarrasH datos={d.por_conductor} limite={20} />
        </Panel>
        <Panel titulo="Vehículos">
          <BarrasH datos={d.por_vehiculo} limite={20} />
        </Panel>
      </div>

      <Panel titulo="Principales Clientes">
        <BarrasH datos={d.por_cliente} limite={20} />
      </Panel>

      <div className="grid grid-cols-1 @3xl:grid-cols-2">
        <Panel
          titulo="Rendimiento de Entrega"
          nota="Número de despachos agrupados por rendimiento de entrega, con un margen de 15 minutos sobre la hora estimada"
        >
          <Rosquilla
            etiquetaTotal="Despachos"
            partes={ordenar(d.cumplimiento, ["A tiempo", "Adelantado", "Atrasado", "No definido"]).map((c) => ({
              texto: c.texto,
              n: c.n,
              color:
                c.texto === "A tiempo" ? COLORES.a_tiempo
                : c.texto === "Adelantado" ? COLORES.adelantado
                : c.texto === "Atrasado" ? COLORES.atrasado
                : COLORES.no_definido,
            }))}
          />
        </Panel>

        <Panel
          titulo="Entregado en Cliente"
          nota="Número de despachos agrupados por lugar donde se marcaron, en un radio de 500 metros alrededor del punto de entrega"
        >
          <Rosquilla
            etiquetaTotal="Marcados"
            partes={[
              { clave: "En el punto", texto: "Entregado en Cliente", color: COLORES.entregado },
              { clave: "Lejos del punto", texto: "No Entregado en Cliente", color: COLORES.fallido },
              { clave: "Sin GPS", texto: "Entregado sin Información", color: COLORES.pendiente },
            ].map((x) => ({
              texto: x.texto,
              n: d.en_el_punto.find((c) => c.texto === x.clave)?.n ?? 0,
              color: x.color,
            }))}
          />
        </Panel>
      </div>

      <Panel titulo="Número de despachos / Día de la semana en que se realizó la entrega">
        <BarrasH datos={d.por_dia_semana.map((n, i) => ({ texto: DIAS[i], n }))} limite={7} enOrden />
      </Panel>

      <div className="grid grid-cols-1 @2xl:grid-cols-2">
        <Cifra etiqueta="Minutos promedio de desvío contra la hora estimada" valor={d.desvio_medio ?? "—"} />
        <Cifra etiqueta="Minutos en la entrega más desviada" valor={d.desvio_max ?? "—"} />
      </div>

      <Seccion titulo="Tabla resumen, últimas órdenes gestionadas" />
      <div className="p-[15px]">
        <Tabla
          cabeceras={["Orden", "Fecha de entrega", "Usuario móvil asignado", "Hora", "Desvío (minutos)", "Estado"]}
          anchoMin={720}
        >
          {d.ultimas.map((u) => (
            <tr key={u.parada_id} className="hover:bg-surface-2">
              <Celda>
                <Link href={`/paradas/${u.parada_id}`}>{u.nombre ?? u.codigo ?? "Parada"}</Link>
              </Celda>
              <Celda className="num">{u.fecha}</Celda>
              <Celda>{u.conductor ?? "—"}</Celda>
              <Celda className="num">{u.hora_entrega ? hora(u.hora_entrega) : "—"}</Celda>
              <Celda className="num">{u.desvio_min ?? "—"}</Celda>
              <Celda>{TEXTO_ESTADO[u.estado_entrega] ?? u.estado_entrega}</Celda>
            </tr>
          ))}
        </Tabla>
      </div>
    </div>
  );
}

/* ── Rutas ────────────────────────────────────────────────────────── */

function VistaRutas({
  datos: d,
  rango,
  rotulo,
}: {
  datos: InformeRutas | null;
  rango: string;
  rotulo: React.ReactNode;
}) {
  if (!d || d.rutas === 0) {
    return (
      <SinDatos
        rotulo={rotulo}
        titulo="Sin rutas en este rango"
        descripcion="No salió ningún vehículo entre esas fechas. Abre Filtros y prueba con otro rango."
      />
    );
  }

  function exportar() {
    if (!d) return;
    descargar(
      `rutas-${rango.replace(/\s/g, "")}.csv`,
      aCSV(
        ["Fecha", "Ruta", "Conductor", "Vehículo", "Paradas", "Salida", "Fin"],
        d.ultimas.map((u) => [
          u.fecha, `R-${String(u.indice + 1).padStart(2, "0")}`, u.conductor, u.placa,
          u.paradas, u.salida_real ? hora(u.salida_real) : "",
          u.fin_real ? hora(u.fin_real) : "",
        ]),
      ),
    );
  }

  return (
    <div className="bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
      <Encabezado rotulo={rotulo} onExportar={exportar} />

      <Seccion titulo="Total de rutas" />
      <div className="grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-5">
        <Cifra etiqueta="Total de rutas" valor={d.rutas} />
        <Cifra etiqueta="Promedio de despachos por ruta" valor={d.prom_paradas ?? "—"} />
        <Cifra
          etiqueta="Cumplimiento de rutas planificadas"
          valor={`${d.rutas ? Math.round((d.completadas / d.rutas) * 100) : 0}%`}
        />
        <Cifra etiqueta="Mínimo de despachos por ruta" valor={d.min_paradas ?? "—"} />
        <Cifra etiqueta="Máximo de despachos por ruta" valor={d.max_paradas ?? "—"} />
      </div>

      <div className="grid grid-cols-1 @3xl:grid-cols-2">
        <Panel titulo="Número de rutas por usuario móvil">
          <BarrasH datos={d.por_conductor} limite={20} />
        </Panel>
        <Panel titulo="Número de rutas por vehículo">
          <BarrasH datos={d.por_vehiculo} limite={20} />
        </Panel>
      </div>

      <Seccion titulo="Rutas y despachos" />
      <Panel titulo="Horarios de inicio de ruta">
        <BarrasHora datos={d.inicio_por_hora} etiquetaY="Rutas (unidades)" color={COLORES.base} />
      </Panel>

      <div className="grid grid-cols-1 @3xl:grid-cols-2">
        <Panel
          titulo="Puntualidad del inicio de ruta"
          nota="Contra la hora programada de salida, con un margen de 15 minutos. La posición de inicio no se registra"
        >
          <Rosquilla
            etiquetaTotal="Rutas"
            partes={ordenar(d.salida, ["A la hora", "Salió antes", "Salió tarde", "Sin referencia"]).map((c) => ({
              texto: c.texto,
              n: c.n,
              color:
                c.texto === "A la hora" ? COLORES.a_tiempo
                : c.texto === "Salió antes" ? COLORES.adelantado
                : c.texto === "Salió tarde" ? COLORES.atrasado
                : COLORES.no_definido,
            }))}
          />
        </Panel>

        <Panel titulo="Número de rutas / Número de despachos">
          <BarrasH
            datos={d.paradas_por_ruta.map((p) => ({ texto: `${p.texto} despachos`, n: p.n }))}
            limite={20}
            sufijo=" rutas"
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 @xl:grid-cols-3">
        <Cifra etiqueta="Tiempo promedio en ruta" valor={duracion(d.min_en_ruta)} />
        <Cifra
          etiqueta="Kilómetros planificados"
          valor={d.km ?? "—"}
          nota={d.costo !== null ? `S/ ${d.costo}` : undefined}
        />
        <Cifra etiqueta="Despachos en ruta" valor={d.paradas} />
      </div>

      <Seccion titulo="Tiempo de entrega" />
      <div className="grid grid-cols-1 @xl:grid-cols-2">
        <Cifra etiqueta="Promedio de primera entrega" valor={reloj(d.primera_media)} />
        <Cifra etiqueta="Promedio de última entrega" valor={reloj(d.ultima_media)} />
      </div>

      <Seccion titulo="Tabla resumen, últimas rutas ingresadas" />
      <div className="p-[15px]">
        <Tabla
          cabeceras={["Fecha de entrega", "Usuario móvil", "ID de vehículo", "# Órdenes", "Hora de inicio", "Hora de fin"]}
          anchoMin={720}
        >
          {d.ultimas.map((u) => (
            <tr key={u.ruta_id} className="hover:bg-surface-2">
              <Celda className="num">{u.fecha}</Celda>
              <Celda>{u.conductor ?? "Sin conductor"}</Celda>
              <Celda>
                <Link href={`/torre?despacho=${u.despacho_id}`} className="num">
                  {u.placa ?? `R-${String(u.indice + 1).padStart(2, "0")}`}
                </Link>
              </Celda>
              <Celda className="num">{u.paradas}</Celda>
              <Celda className="num">{u.salida_real ? hora(u.salida_real) : "—"}</Celda>
              <Celda className="num">{u.fin_real ? hora(u.fin_real) : "—"}</Celda>
            </tr>
          ))}
        </Tabla>
      </div>
    </div>
  );
}

/* ── Artículos ────────────────────────────────────────────────────── */

function VistaArticulos({
  datos: d,
  rango,
  rotulo,
}: {
  datos: InformeArticulos | null;
  rango: string;
  rotulo: React.ReactNode;
}) {
  if (!d || d.lineas === 0) {
    return (
      <SinDatos
        rotulo={rotulo}
        titulo="Sin artículos en este rango"
        descripcion="Aquí solo aparecen los despachos cuyo archivo traía columnas de artículo: código, descripción y cantidad por línea."
      />
    );
  }

  function exportar() {
    if (!d) return;
    descargar(
      `articulos-${rango.replace(/\s/g, "")}.csv`,
      aCSV(["Artículo", "Unidades"], d.top.map((t) => [t.texto, t.n])),
    );
  }

  return (
    <div className="bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
      <Encabezado rotulo={rotulo} onExportar={exportar} />

      <Seccion
        titulo="Ítems despachados"
        nota="Las estadísticas de ítems no utilizan filtros basados en rendimiento"
      />

      <div className="grid grid-cols-1 @3xl:grid-cols-[1fr_2fr]">
        <Panel titulo="Total de ítems">
          <Rosquilla
            etiquetaTotal="Total de ítems"
            total={d.total}
            partes={[
              { texto: "Aceptado", n: d.entregados, color: COLORES.entregado },
              { texto: "Rechazado", n: d.rechazados, color: COLORES.fallido },
              { texto: "Pendiente", n: d.pendientes, color: COLORES.pendiente },
            ]}
          />
        </Panel>

        <Panel titulo="Top 20 ítems despachados">
          <BarrasH datos={d.top} limite={20} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 @3xl:grid-cols-[1fr_2fr]">
        <div className="grid grid-cols-1">
          <Cifra etiqueta="Líneas de pedido" valor={d.lineas.toLocaleString("es-PE")} />
          <Cifra
            etiqueta="Valor entregado"
            valor={d.valor !== null ? `S/ ${Number(d.valor).toLocaleString("es-PE")}` : "—"}
            nota={d.valor === null ? "el archivo no trae precios" : undefined}
          />
        </div>
        <Panel titulo="Ítems que más se rechazan">
          {d.peores.length ? (
            <BarrasH datos={d.peores} color={COLORES.fallido} limite={10} />
          ) : (
            <Vacio texto="No se quedó nada sin entregar." />
          )}
        </Panel>
      </div>
    </div>
  );
}
