"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  cerrarRuta, eliminarRuta, type ResumenRutas, type RutaFila,
} from "@/app/acciones/rutas";
import MenuFila, { type AccionFila } from "@/components/MenuFila";
import {
  AccionesPagina, BOTON_PRIMARIO, BOTON_SECUNDARIO, Contador, Paginacion, usePaginas,
} from "@/components/Paginacion";
import SelectorColumnas, { useColumnas, type Columna } from "@/components/SelectorColumnas";
import { EstadoVacio } from "@/components/ui";
import { aCSV, descargar } from "@/lib/exportar";
import { fechaHora, hora } from "@/lib/horas";

/**
 * Las rutas, una por fila.
 *
 * Es el módulo «Rutas» de la referencia: cuatro cifras del mes arriba y,
 * debajo, cada vehículo con su salida, su conductor y su huella. El despacho
 * es el documento que las agrupa y sigue teniendo su propia pantalla; aquí se
 * mira ruta a ruta, que es como se asigna y como se cobra.
 */
const corta = (t: string | null) => (t ? t.slice(0, 5) : "—");

export default function PanelRutas({
  rutas,
  resumen,
  desde,
  hasta,
  rol = "planificador",
}: {
  rutas: RutaFila[];
  resumen: ResumenRutas | null;
  desde: string;
  hasta: string;
  rol?: "admin" | "planificador" | "conductor";
}) {
  const router = useRouter();
  const [vehiculo, setVehiculo] = useState("");
  const [conductor, setConductor] = useState("");
  const [error, setError] = useState<string | null>(null);

  const nombreDe = (r: RutaFila) => r.placa ?? `R-${String(r.indice + 1).padStart(2, "0")}`;

  async function hacer(f: () => Promise<unknown>) {
    setError(null);
    try {
      await f();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Lo que se puede hacer con una ruta desde su fila.
   *
   * Cerrar es dar la ruta por terminada: sus órdenes quedan bloqueadas,
   * tengan el estado que tengan. Eliminar solo vale antes de salir, y no
   * borra las órdenes: vuelven a la bandeja del despacho.
   */
  function acciones(r: RutaFila): AccionFila[] {
    const cerrada = r.estado === "completada";
    const conHistoria = Boolean(r.salida_real) || r.gestionadas > 0;
    return [
      { texto: "Mostrar", href: `/rutas/${r.id}` },
      { texto: "Seguir en la torre", href: `/torre?despacho=${r.despacho_id}` },
      { texto: "Ver la planificación", href: `/despachos/${r.despacho_id}` },
      cerrada
        ? {
            texto: "Abrir ruta",
            noPorque: rol === "admin" ? null : "Solo un administrador puede abrirla",
            onClick: () => {
              if (window.confirm(`¿Volver a abrir la ruta ${nombreDe(r)}?\n\nSus órdenes se desbloquean y se pueden volver a marcar.`)) {
                void hacer(() => cerrarRuta(r.id, false));
              }
            },
          }
        : {
            texto: "Cerrar ruta",
            noPorque: rol === "conductor" ? "No tienes permiso" : null,
            onClick: () => {
              const pendientes = r.paradas - r.gestionadas;
              const aviso = pendientes > 0
                ? `Tiene ${pendientes} orden(es) sin gestionar, que se quedarán así. `
                : "";
              if (window.confirm(`¿Cerrar la ruta ${nombreDe(r)}?\n\n${aviso}Sus órdenes quedan bloqueadas: nadie las puede marcar hasta que un administrador abra la ruta.`)) {
                void hacer(() => cerrarRuta(r.id, true));
              }
            },
          },
      {
        texto: "Eliminar",
        peligro: true,
        noPorque:
          rol === "conductor"
            ? "No tienes permiso"
            : conHistoria
              ? "Ya salió o tiene órdenes gestionadas"
              : null,
        onClick: () => {
          if (window.confirm(`¿Eliminar la ruta ${nombreDe(r)}?\n\nSus ${r.paradas} orden(es) no se borran: vuelven a la bandeja del despacho, sin asignar.`)) {
            void hacer(() => eliminarRuta(r.id));
          }
        },
      },
    ];
  }

  const vehiculos = useMemo(
    () => [...new Set(rutas.map((r) => r.placa).filter(Boolean) as string[])].sort(),
    [rutas],
  );
  const conductores = useMemo(
    () => [...new Set(rutas.map((r) => r.conductor).filter(Boolean) as string[])].sort(),
    [rutas],
  );

  const filtradas = useMemo(
    () =>
      rutas.filter(
        (r) =>
          (!vehiculo || r.placa === vehiculo) && (!conductor || r.conductor === conductor),
      ),
    [rutas, vehiculo, conductor],
  );

  const columnas: Columna<RutaFila>[] = useMemo(
    () => [
      {
        clave: "vehiculo",
        texto: "Vehículo",
        pinta: (r) => (
          <Link href={`/rutas/${r.id}`} className="num underline">
            {r.placa ?? `R-${String(r.indice + 1).padStart(2, "0")}`}
          </Link>
        ),
        exporta: (r) => r.placa ?? `R-${String(r.indice + 1).padStart(2, "0")}`,
      },
      {
        clave: "conductor",
        texto: "Usuario móvil",
        pinta: (r) => r.conductor ?? "",
        exporta: (r) => r.conductor,
      },
      {
        clave: "paradas",
        texto: "Despachos",
        alineacion: "derecha",
        pinta: (r) => <span className="num">{r.paradas}</span>,
        exporta: (r) => r.paradas,
      },
      {
        clave: "fecha",
        texto: "Fecha de entrega",
        pinta: (r) => <span className="num">{r.fecha}</span>,
        exporta: (r) => r.fecha,
      },
      {
        clave: "inicio",
        texto: "Hora de inicio",
        pinta: (r) => (
          <span className="num">
            {r.salida_real ? hora(r.salida_real) : corta(r.salida_prog)}
          </span>
        ),
        exporta: (r) => (r.salida_real ? hora(r.salida_real) : corta(r.salida_prog)),
      },
      {
        clave: "creado",
        texto: "Creado en",
        opcional: true,
        pinta: (r) => <span className="num">{fechaHora(r.creado_en)}</span>,
        exporta: (r) => fechaHora(r.creado_en),
      },
      {
        clave: "despacho",
        texto: "Documento",
        opcional: true,
        pinta: (r) => (
          <Link href={`/despachos/${r.despacho_id}`}>{r.despacho ?? "Despacho"}</Link>
        ),
        exporta: (r) => r.despacho,
      },
      {
        clave: "avance",
        texto: "Avance",
        opcional: true,
        alineacion: "derecha",
        pinta: (r) => (
          <span className="num">
            {r.gestionadas}/{r.paradas}
          </span>
        ),
        exporta: (r) => `${r.gestionadas}/${r.paradas}`,
      },
      {
        clave: "km",
        texto: "Km",
        opcional: true,
        alineacion: "derecha",
        pinta: (r) => <span className="num">{r.km ?? "—"}</span>,
        exporta: (r) => r.km,
      },
      {
        clave: "co2",
        texto: "CO2 (kg)",
        alineacion: "derecha",
        pinta: (r) => <span className="num">{r.co2 ?? "—"}</span>,
        exporta: (r) => r.co2,
      },
    ],
    [],
  );

  const { visibles, elegidas, alternar, fijas } = useColumnas("rutas", columnas);
  const { pagina, setPagina, total, visibles: filas } = usePaginas(filtradas, 15);

  function exportar() {
    descargar(
      `rutas-${desde}_${hasta}.csv`,
      aCSV(
        visibles.map((c) => c.texto),
        filtradas.map((r) => visibles.map((c) => (c.exporta ? c.exporta(r) : ""))),
      ),
    );
  }

  const ir = (d: string, h: string) => router.push(`/rutas?desde=${d}&hasta=${h}`);

  const pctATiempo =
    resumen && resumen.marcadas ? (resumen.a_tiempo / resumen.marcadas) * 100 : 0;
  const pctReordenadas =
    resumen && resumen.rutas ? (resumen.reordenadas / resumen.rutas) * 100 : 0;

  return (
    <div>
      <AccionesPagina>
        <Link href="/planificador" className={BOTON_SECUNDARIO}>
          ⤒ Importar Archivo
        </Link>
        <Link href="/despachos" className={BOTON_SECUNDARIO}>
          ⇄ Asignar Ruta
        </Link>
        <button onClick={exportar} disabled={!filtradas.length} className={BOTON_SECUNDARIO}>
          ⤓ Exportar
        </button>
        <Link href="/planificador" className={BOTON_PRIMARIO}>
          + Nueva Ruta
        </Link>
      </AccionesPagina>

      {/* Filtros */}
      <div className="grid grid-cols-1 gap-2 pb-4 @xl:grid-cols-2 @4xl:grid-cols-4">
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            title="Desde"
            value={desde}
            max={hasta}
            onChange={(e) => e.target.value && ir(e.target.value, hasta)}
            className="num w-full min-w-0 outline-none"
          />
          <input
            type="date"
            title="Hasta"
            value={hasta}
            min={desde}
            onChange={(e) => e.target.value && ir(desde, e.target.value)}
            className="num w-full min-w-0 outline-none"
          />
        </div>
        <select value={vehiculo} onChange={(e) => setVehiculo(e.target.value)} className="w-full outline-none">
          <option value="">Vehículo</option>
          {vehiculos.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <select value={conductor} onChange={(e) => setConductor(e.target.value)} className="w-full outline-none">
          <option value="">Usuarios móviles</option>
          {conductores.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button
          onClick={() => { setVehiculo(""); setConductor(""); }}
          disabled={!vehiculo && !conductor}
          className={`${BOTON_SECUNDARIO} h-10 justify-center`}
        >
          Quitar filtros
        </button>
      </div>

      {/* Las cuatro cifras del mes */}
      <div className="pb-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">
        Este mes
      </div>
      <div className="grid grid-cols-1 gap-2 pb-4 @xl:grid-cols-2 @4xl:grid-cols-4">
        <Cifra
          titulo="CO2 emitido"
          valor={resumen?.co2 != null ? `${resumen.co2.toLocaleString("es-PE")} kg` : "—"}
          nota={
            resumen?.km != null
              ? `estimado · ${resumen.km.toLocaleString("es-PE")} km planificados`
              : "sin kilómetros planificados"
          }
        />
        <Cifra
          titulo="A tiempo"
          valor={`${pctATiempo.toFixed(1).replace(".", ",")}%`}
          nota={`${resumen?.a_tiempo ?? 0} / ${resumen?.marcadas ?? 0} entregas`}
        />
        <Cifra
          titulo="Tiempo prom. por parada"
          valor={
            resumen?.min_por_parada != null
              ? `${String(resumen.min_por_parada).replace(".", ",")} min`
              : "—"
          }
          nota={`Sobre ${resumen?.marcadas ?? 0} paradas`}
        />
        <Cifra
          titulo="Desviación de ruta"
          valor={`${pctReordenadas.toFixed(1).replace(".", ",")}%`}
          nota={`${resumen?.reordenadas ?? 0} de ${resumen?.rutas ?? 0} rutas reordenadas a mano`}
        />
      </div>

      <Contador n={filtradas.length} texto="rutas">
        <SelectorColumnas
          columnas={columnas}
          elegidas={elegidas}
          alternar={alternar}
          fijas={fijas}
        />
      </Contador>

      {error && (
        <p className="mb-3 rounded-[8px] border border-bad/30 bg-bad-bg px-3 py-2 text-[13px] text-bad">
          {error}
        </p>
      )}

      {filtradas.length === 0 ? (
        <EstadoVacio
          icono="◈"
          titulo="Sin rutas en este rango"
          descripcion="Amplía las fechas, o crea una ruta nueva cargando el archivo del día."
        />
      ) : (
        <div className="overflow-hidden rounded-[8px] border border-line">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {visibles.map((c) => (
                    <th
                      key={c.clave}
                      className={c.alineacion === "derecha" ? "text-right" : "text-center"}
                    >
                      {c.texto}
                    </th>
                  ))}
                  <th className="w-[56px]" aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {filas.map((r) => (
                  <tr key={r.id} className="transition hover:bg-surface-2">
                    {visibles.map((c) => (
                      <td
                        key={c.clave}
                        className={`border-b border-line align-middle ${
                          c.alineacion === "derecha" ? "text-right" : "text-center"
                        }`}
                      >
                        {c.pinta(r)}
                      </td>
                    ))}
                    <td className="border-b border-line text-center align-middle" style={{ padding: "0 6px" }}>
                      <MenuFila rotulo={`Acciones de la ruta ${nombreDe(r)}`} acciones={acciones(r)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacion pagina={pagina} total={total} onCambio={setPagina} />
        </div>
      )}
    </div>
  );
}

function Cifra({ titulo, valor, nota }: { titulo: string; valor: string; nota: string }) {
  return (
    <div className="rounded-[8px] border border-line px-3.5 py-2.5">
      <div className="text-[13px] text-ink-2">{titulo}</div>
      <div className="num text-[22px] font-bold leading-[30px] text-ink">{valor}</div>
      <div className="text-[11.5px] text-ink-3">{nota}</div>
    </div>
  );
}
