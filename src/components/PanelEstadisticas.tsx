"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  informeArticulos,
  informeEnvios,
  informeRutas,
  type InformeArticulos,
  type InformeEnvios,
  type InformeRutas,
} from "@/app/acciones/estadisticas";
import { BarrasH, BarrasHora, Cifra, COLORES, Panel, Rosquilla, Vacio } from "@/components/graficos";
import { Celda, EstadoVacio, Tabla, Tarjeta } from "@/components/ui";
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

type Pestana = "mapa" | "envios" | "rutas" | "articulos";

const PESTANAS: { id: Pestana; texto: string }[] = [
  { id: "mapa", texto: "Mapa" },
  { id: "envios", texto: "Envíos" },
  { id: "rutas", texto: "Rutas" },
  { id: "articulos", texto: "Artículos" },
];

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
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Minutos a horas y minutos. Un número de tres cifras no se lee de un vistazo. */
function duracion(min: number | null) {
  if (min === null || min === undefined) return "—";
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.round(Math.abs(min) % 60);
  const signo = min < 0 ? "−" : "";
  return h > 0 ? `${signo}${h} h ${m} min` : `${signo}${m} min`;
}

export default function PanelEstadisticas() {
  const [pestana, setPestana] = useState<Pestana>("envios");
  const [desde, setDesde] = useState(hoy());
  const [hasta, setHasta] = useState(hoy());

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

  const rango =
    desde === hasta
      ? diaCorto(desde)
      : `${diaCorto(desde)} — ${diaCorto(hasta)}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* La barra de pestañas y el rango. El rango manda sobre los cuatro
          informes: cambiarlo en uno y que otro siga en otra fecha es la
          forma más rápida de sacar una conclusión equivocada. */}
      <div className="raya flex flex-wrap items-center gap-1 border-b border-line bg-surface">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPestana(p.id)}
            className={`border-b-2 px-3 py-2 text-[13px] font-semibold transition ${
              pestana === p.id
                ? "border-amber text-ink"
                : "border-transparent text-ink-3 hover:text-ink-2"
            }`}
          >
            {p.texto}
          </button>
        ))}

        <div className="ml-auto flex flex-wrap items-center gap-1.5 py-1.5">
          <Atajo texto="Hoy" onClic={() => { setDesde(hoy()); setHasta(hoy()); }} />
          <Atajo texto="7 días" onClic={() => { setDesde(haceDias(6)); setHasta(hoy()); }} />
          <Atajo texto="30 días" onClic={() => { setDesde(haceDias(29)); setHasta(hoy()); }} />
          <input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => setDesde(e.target.value)}
            className="num rounded-[4px] border border-line-strong bg-surface px-2 py-1 text-[12px] outline-none transition focus:border-amber-600"
          />
          <span className="text-[11px] text-ink-3">a</span>
          <input
            type="date"
            value={hasta}
            min={desde}
            onChange={(e) => setHasta(e.target.value)}
            className="num rounded-[4px] border border-line-strong bg-surface px-2 py-1 text-[12px] outline-none transition focus:border-amber-600"
          />
        </div>
      </div>

      {error && (
        <p className="border-b border-line bg-bad-bg px-3.5 py-2 text-[12px] text-bad">{error}</p>
      )}

      <div className="min-h-0 flex-1 overflow-auto @container">
        {cargando ? (
          <p className="p-6 text-center text-[12.5px] text-ink-3">Calculando…</p>
        ) : pestana === "mapa" ? (
          <VistaMapa envios={envios} rango={rango} />
        ) : pestana === "envios" ? (
          <VistaEnvios datos={envios} rango={rango} />
        ) : pestana === "rutas" ? (
          <VistaRutas datos={rutas} rango={rango} />
        ) : (
          <VistaArticulos datos={articulos} rango={rango} />
        )}
      </div>
    </div>
  );
}

function Atajo({ texto, onClic }: { texto: string; onClic: () => void }) {
  return (
    <button
      onClick={onClic}
      className="rounded-full border border-line-strong bg-surface px-2 py-1 text-[11.5px] font-semibold text-ink-2 transition hover:bg-canvas"
    >
      {texto}
    </button>
  );
}

function haceDias(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

function Encabezado({
  titulo,
  rango,
  onExportar,
}: {
  titulo: string;
  rango: string;
  onExportar?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
      <h2 className="text-[14px] font-bold tracking-tight">
        {titulo} <span className="font-semibold text-ink-3">· {rango}</span>
      </h2>
      {onExportar && (
        <button
          onClick={onExportar}
          className="ml-auto rounded-full border border-line-strong bg-surface px-2.5 py-1 text-[11.5px] font-semibold transition hover:bg-canvas"
        >
          ⤓ Exportar
        </button>
      )}
    </div>
  );
}

/* ── Mapa ─────────────────────────────────────────────────────────── */

function VistaMapa({ envios, rango }: { envios: InformeEnvios | null; rango: string }) {
  const [desde, setDesde] = useState(0);
  const [hasta, setHasta] = useState(24);

  if (!envios || envios.puntos.length === 0) {
    return <EstadoVacio icono="◳" titulo="Sin paradas en este rango" descripcion="No hay nada repartido entre esas fechas. Prueba con otro rango." />;
  }

  return (
    <div className="flex h-full min-h-[520px] flex-col">
      <Encabezado titulo="Mapa de despachos" rango={rango} />

      <div className="flex flex-wrap items-center gap-3 px-3 py-2">
        {Object.entries(TEXTO_ESTADO).map(([clave, texto]) => (
          <span key={clave} className="flex items-center gap-1.5 text-[11.5px] text-ink-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: COLORES[clave as keyof typeof COLORES] }}
            />
            {texto}
          </span>
        ))}
      </div>

      <div className="min-h-[360px] flex-1 overflow-hidden border-y border-line">
        <MapaEstadisticas puntos={envios.puntos} desde={desde} hasta={hasta} />
      </div>

      {/* Dos deslizadores y no uno: lo interesante no es «hasta las once»
          sino «entre las once y la una», que es cuando se para todo. */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
        <span className="num w-[86px] text-[12px] font-bold">
          {String(desde).padStart(2, "0")}:00 – {String(hasta).padStart(2, "0")}:00
        </span>
        <input
          type="range"
          min={0}
          max={23}
          value={desde}
          onChange={(e) => {
            const v = Number(e.target.value);
            setDesde(v);
            if (v >= hasta) setHasta(v + 1);
          }}
          className="min-w-[120px] flex-1 accent-amber-600"
          aria-label="Hora inicial"
        />
        <input
          type="range"
          min={1}
          max={24}
          value={hasta}
          onChange={(e) => {
            const v = Number(e.target.value);
            setHasta(v);
            if (v <= desde) setDesde(v - 1);
          }}
          className="min-w-[120px] flex-1 accent-amber-600"
          aria-label="Hora final"
        />
        <button
          onClick={() => { setDesde(0); setHasta(24); }}
          className="rounded-full border border-line-strong bg-surface px-2 py-1 text-[11.5px] font-semibold transition hover:bg-canvas"
        >
          Todo el día
        </button>
      </div>
    </div>
  );
}

/* ── Envíos ───────────────────────────────────────────────────────── */

function VistaEnvios({ datos: d, rango }: { datos: InformeEnvios | null; rango: string }) {
  if (!d || d.total === 0) {
    return <EstadoVacio icono="◳" titulo="Sin paradas en este rango" descripcion="No hay nada repartido entre esas fechas. Prueba con otro rango." />;
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

  return (
    <div className="pb-4">
      <Encabezado titulo="Envíos" rango={rango} onExportar={exportar} />

      <div className="grid gap-2 px-3 pt-2 @lg:grid-cols-2 @3xl:grid-cols-4">
        <Cifra etiqueta="Paradas" valor={d.total.toLocaleString("es-PE")} />
        <Cifra
          etiqueta="Cumplimiento"
          valor={`${d.total ? Math.round((d.entregadas / d.total) * 100) : 0}%`}
          nota={`${d.entregadas} entregadas`}
          tono={COLORES.entregado}
        />
        <Cifra etiqueta="Bultos" valor={d.bultos.toLocaleString("es-PE")} />
        <Cifra
          etiqueta="Desvío medio"
          valor={duracion(d.desvio_medio)}
          nota={d.desvio_max !== null ? `peor: ${duracion(d.desvio_max)}` : undefined}
          tono={d.desvio_medio && d.desvio_medio > 15 ? COLORES.atrasado : undefined}
        />
      </div>

      <div className="grid gap-2 p-3 @3xl:grid-cols-2">
        <Panel titulo="Estado de las paradas">
          <Rosquilla
            etiquetaTotal="paradas"
            partes={d.estados.map((e) => ({
              texto: TEXTO_ESTADO[e.texto] ?? e.texto,
              n: e.n,
              color: COLORES[e.texto as keyof typeof COLORES] ?? COLORES.pendiente,
            }))}
          />
        </Panel>

        <Panel
          titulo="Puntualidad"
          nota="margen de 15 min sobre la hora estimada"
        >
          <Rosquilla
            etiquetaTotal="paradas"
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
          titulo="Dónde se marcó"
          nota="radio de 500 m alrededor del punto planificado"
        >
          <Rosquilla
            etiquetaTotal="marcadas"
            partes={ordenar(d.en_el_punto, ["En el punto", "Lejos del punto", "Sin GPS"]).map((c) => ({
              texto: c.texto,
              n: c.n,
              color:
                c.texto === "En el punto" ? COLORES.entregado
                : c.texto === "Lejos del punto" ? COLORES.atrasado
                : COLORES.no_definido,
            }))}
          />
        </Panel>

        <Panel titulo="Motivo de lo no entregado">
          {d.subestados.length ? (
            <BarrasH datos={d.subestados} color={COLORES.fallido} limite={12} />
          ) : (
            <Vacio texto="Nada quedó sin entregar en este rango." />
          )}
        </Panel>

        <Panel titulo="Paradas marcadas por hora" className="@3xl:col-span-2">
          <BarrasHora datos={d.por_hora} />
        </Panel>

        <Panel titulo="Por conductor">
          <BarrasH datos={d.por_conductor} limite={15} />
        </Panel>

        <Panel titulo="Por vehículo">
          <BarrasH datos={d.por_vehiculo} limite={15} />
        </Panel>

        <Panel titulo="Clientes con más paradas">
          <BarrasH datos={d.por_cliente} limite={15} />
        </Panel>

        <Panel titulo="Por día de la semana">
          <BarrasH
            datos={d.por_dia_semana.map((n, i) => ({ texto: DIAS[i], n }))}
            limite={7}
            color={COLORES.base}
          />
        </Panel>

        <Tarjeta className="overflow-hidden @3xl:col-span-2">
          <div className="border-b border-line px-3.5 py-2">
            <h3 className="text-[13px] font-bold">Últimas paradas marcadas</h3>
          </div>
          <Tabla
            cabeceras={["Cliente", "Fecha", "Conductor", "Marcada", "Desvío", "Estado"]}
            anchoMin={680}
          >
            {d.ultimas.map((u) => (
              <tr key={u.parada_id} className="hover:bg-canvas">
                <Celda>
                  <Link href={`/paradas/${u.parada_id}`} className="font-semibold hover:underline">
                    {u.nombre ?? u.codigo ?? "Parada"}
                  </Link>
                </Celda>
                <Celda className="num text-ink-2">{diaCorto(u.fecha)}</Celda>
                <Celda className="text-ink-2">{u.conductor ?? "—"}</Celda>
                <Celda className="num">{u.hora_entrega ? hora(u.hora_entrega) : "—"}</Celda>
                <Celda className="num">{duracion(u.desvio_min)}</Celda>
                <Celda>{TEXTO_ESTADO[u.estado_entrega] ?? u.estado_entrega}</Celda>
              </tr>
            ))}
          </Tabla>
        </Tarjeta>
      </div>
    </div>
  );
}

/** Deja las clases en el orden que se quiere leer, no en el que las devuelve la base. */
function ordenar(cuentas: { texto: string; n: number }[], orden: string[]) {
  return orden
    .map((t) => cuentas.find((c) => c.texto === t) ?? { texto: t, n: 0 })
    .filter((c) => c.n > 0 || orden.indexOf(c.texto) < 2);
}

/* ── Rutas ────────────────────────────────────────────────────────── */

function VistaRutas({ datos: d, rango }: { datos: InformeRutas | null; rango: string }) {
  if (!d || d.rutas === 0) {
    return <EstadoVacio icono="◳" titulo="Sin rutas en este rango" descripcion="No salió ningún vehículo entre esas fechas. Prueba con otro rango." />;
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
    <div className="pb-4">
      <Encabezado titulo="Rutas" rango={rango} onExportar={exportar} />

      <div className="grid gap-2 px-3 pt-2 @lg:grid-cols-2 @3xl:grid-cols-5">
        <Cifra etiqueta="Rutas" valor={d.rutas} />
        <Cifra
          etiqueta="Paradas por ruta"
          valor={d.prom_paradas ?? "—"}
          nota={`de ${d.min_paradas ?? 0} a ${d.max_paradas ?? 0}`}
        />
        <Cifra
          etiqueta="Rutas completadas"
          valor={`${d.rutas ? Math.round((d.completadas / d.rutas) * 100) : 0}%`}
          nota={`${d.completadas} de ${d.rutas}`}
        />
        <Cifra etiqueta="Tiempo en ruta" valor={duracion(d.min_en_ruta)} nota="promedio" />
        <Cifra
          etiqueta="Kilómetros"
          valor={d.km ?? "—"}
          nota={d.costo !== null ? `S/ ${d.costo}` : undefined}
        />
      </div>

      <div className="grid gap-2 p-3 @3xl:grid-cols-2">
        <Panel
          titulo="Salida del centro"
          nota="contra la hora programada, margen de 15 min"
        >
          <Rosquilla
            etiquetaTotal="rutas"
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

        <Panel titulo="Hora de salida" nota="cuándo arrancó cada ruta">
          <BarrasHora datos={d.inicio_por_hora} etiquetaY="rutas" color={COLORES.acento} />
        </Panel>

        <Panel titulo="Por conductor">
          <BarrasH datos={d.por_conductor} limite={15} sufijo=" rutas" />
        </Panel>

        <Panel titulo="Por vehículo">
          <BarrasH datos={d.por_vehiculo} limite={15} sufijo=" rutas" />
        </Panel>

        <Panel titulo="Tamaño de las rutas" nota="cuántas rutas de cada número de paradas">
          <BarrasH
            datos={d.paradas_por_ruta.map((p) => ({ texto: `${p.texto} paradas`, n: p.n }))}
            limite={20}
            color={COLORES.base}
            sufijo=" rutas"
          />
        </Panel>

        <Panel titulo="Franja de trabajo">
          <div className="grid grid-cols-2 gap-2">
            <Cifra etiqueta="Primera entrega" valor={reloj(d.primera_media)} nota="promedio" />
            <Cifra etiqueta="Última entrega" valor={reloj(d.ultima_media)} nota="promedio" />
          </div>
          <p className="mt-2 text-[11px] text-ink-3">
            Entre las dos está la jornada real del reparto. Si la primera
            entrega se va a las diez, el problema está en el centro, no en la
            calle.
          </p>
        </Panel>

        <Tarjeta className="overflow-hidden @3xl:col-span-2">
          <div className="border-b border-line px-3.5 py-2">
            <h3 className="text-[13px] font-bold">Últimas rutas</h3>
          </div>
          <Tabla
            cabeceras={["Fecha", "Ruta", "Conductor", "Vehículo", "Paradas", "Salida", "Fin"]}
            anchoMin={680}
          >
            {d.ultimas.map((u) => (
              <tr key={u.ruta_id} className="hover:bg-canvas">
                <Celda className="num text-ink-2">{diaCorto(u.fecha)}</Celda>
                <Celda>
                  <Link
                    href={`/torre?despacho=${u.despacho_id}`}
                    className="num font-semibold hover:underline"
                  >
                    R-{String(u.indice + 1).padStart(2, "0")}
                  </Link>
                </Celda>
                <Celda className="text-ink-2">{u.conductor ?? "Sin conductor"}</Celda>
                <Celda className="num text-ink-2">{u.placa ?? "—"}</Celda>
                <Celda className="num">{u.paradas}</Celda>
                <Celda className="num">{u.salida_real ? hora(u.salida_real) : "—"}</Celda>
                <Celda className="num">{u.fin_real ? hora(u.fin_real) : "—"}</Celda>
              </tr>
            ))}
          </Tabla>
        </Tarjeta>
      </div>
    </div>
  );
}

/* ── Artículos ────────────────────────────────────────────────────── */

function VistaArticulos({ datos: d, rango }: { datos: InformeArticulos | null; rango: string }) {
  if (!d || d.lineas === 0) {
    return (
      <EstadoVacio
        icono="▥"
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
    <div className="pb-4">
      <Encabezado titulo="Artículos" rango={rango} onExportar={exportar} />

      <div className="grid gap-2 px-3 pt-2 @lg:grid-cols-2 @3xl:grid-cols-4">
        <Cifra etiqueta="Unidades" valor={d.total.toLocaleString("es-PE")} />
        <Cifra etiqueta="Líneas de pedido" valor={d.lineas.toLocaleString("es-PE")} />
        <Cifra
          etiqueta="Entregadas"
          valor={d.entregados.toLocaleString("es-PE")}
          tono={COLORES.entregado}
        />
        <Cifra
          etiqueta="Valor entregado"
          valor={d.valor !== null ? `S/ ${Number(d.valor).toLocaleString("es-PE")}` : "—"}
          nota={d.valor === null ? "el archivo no trae precios" : undefined}
        />
      </div>

      <div className="grid gap-2 p-3 @3xl:grid-cols-2">
        <Panel titulo="Qué pasó con las unidades">
          <Rosquilla
            etiquetaTotal="unidades"
            total={d.total}
            partes={[
              { texto: "Entregadas", n: d.entregados, color: COLORES.entregado },
              { texto: "No entregadas", n: d.rechazados, color: COLORES.fallido },
              { texto: "Pendientes", n: d.pendientes, color: COLORES.pendiente },
            ]}
          />
        </Panel>

        <Panel titulo="Lo que más se queda" nota="unidades que salieron y no se entregaron">
          {d.peores.length ? (
            <BarrasH datos={d.peores} color={COLORES.fallido} limite={10} />
          ) : (
            <Vacio texto="No se quedó nada sin entregar." />
          )}
        </Panel>

        <Panel titulo="Los 20 artículos más despachados" className="@3xl:col-span-2">
          <BarrasH datos={d.top} limite={20} />
        </Panel>
      </div>
    </div>
  );
}
