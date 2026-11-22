"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  eliminarParada, ordenes as traerOrdenes, type FiltroOrdenes, type Orden,
} from "@/app/acciones/datos";
import MenuFila, { type AccionFila } from "@/components/MenuFila";
import ModalEditarOrden from "@/components/ModalEditarOrden";
import ModalEstado from "@/components/ModalEstado";
import {
  AccionesPagina, BOTON_PRIMARIO, BOTON_SECUNDARIO, Contador, Paginacion, usePaginas,
} from "@/components/Paginacion";
import SelectorColumnas, { useColumnas, type Columna } from "@/components/SelectorColumnas";
import {
  BarraSeleccion, BOTON_LOTE, BOTON_LOTE_PELIGRO, Casilla, useSeleccion,
} from "@/components/Seleccion";
import { aCSV, descargar, nombreArchivo } from "@/lib/exportar";
import { hora, hoy } from "@/lib/horas";
import { Pastilla } from "@/components/ui";

const ESTADO: Record<string, { texto: string; tono: "ok" | "warn" | "bad" | "live" }> = {
  entregado: { texto: "Entregado", tono: "ok" },
  parcial: { texto: "Parcial", tono: "warn" },
  reprogramado: { texto: "Reprogramado", tono: "warn" },
  fallido: { texto: "No entregado", tono: "bad" },
  pendiente: { texto: "Pendiente", tono: "live" },
};

const corta = (t: string | null) => (t ? t.slice(0, 5) : "—");

function desvioTexto(m: number | null) {
  if (m == null) return "—";
  if (Math.abs(m) <= 10) return "a tiempo";
  return `${m > 0 ? "+" : "−"}${Math.abs(m)} min`;
}

export default function PanelOrdenes({
  inicial,
  conductores,
  vehiculos = [],
  filtro: filtroInicial,
  rol = "planificador",
}: {
  inicial: Orden[];
  conductores: string[];
  /** Las placas de la flota, para filtrar por vehículo. */
  vehiculos?: string[];
  filtro: FiltroOrdenes;
  rol?: "admin" | "planificador" | "conductor";
}) {
  // Lo que se abre desde el menú de una fila.
  const [cambiando, setCambiando] = useState<Orden | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [lista, setLista] = useState(inicial);
  const [filtro, setFiltro] = useState<FiltroOrdenes>(filtroInicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [otros, setOtros] = useState(false);
  const montado = useRef(true);

  useEffect(() => () => { montado.current = false; }, []);
  useEffect(() => setLista(inicial), [inicial]);

  const buscar = useCallback(async (f: FiltroOrdenes) => {
    setCargando(true);
    try {
      const d = await traerOrdenes(f);
      if (montado.current) { setLista(d); setError(null); }
    } catch (e) {
      if (montado.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (montado.current) setCargando(false);
    }
  }, []);

  // El texto se busca al dejar de escribir, no en cada tecla: cada búsqueda
  // es un viaje a la base y con quinientas filas no hace falta ir tan rápido.
  useEffect(() => {
    const t = setTimeout(() => void buscar(filtro), 350);
    return () => clearTimeout(t);
  }, [filtro, buscar]);

  const columnas: Columna<Orden>[] = [
    {
      clave: "codigo",
      texto: "Orden",
      pinta: (o) => (
        <Link href={`/paradas/${o.id}`} className="num font-semibold transition hover:underline">
          {o.codigo ?? o.id.slice(0, 8)}
        </Link>
      ),
      exporta: (o) => o.codigo ?? o.id,
    },
    {
      clave: "nombre",
      texto: "Destino",
      pinta: (o) => (
        <>
          <span className="font-semibold text-ink">{o.nombre ?? "—"}</span>
          {o.distrito && <span className="block text-[11px] text-ink-3">{o.distrito}</span>}
        </>
      ),
      exporta: (o) => o.nombre,
    },
    {
      clave: "estado",
      texto: "Estado",
      pinta: (o) => {
        const e = ESTADO[o.estado_entrega] ?? { texto: o.estado_entrega, tono: "live" as const };
        return (
          <span className="flex flex-wrap items-center gap-1">
            <Pastilla tono={e.tono}>{e.texto}</Pastilla>
            {o.en_bandeja && <Pastilla tono="plan">sin asignar</Pastilla>}
          </span>
        );
      },
      exporta: (o) => (ESTADO[o.estado_entrega]?.texto ?? o.estado_entrega),
    },
    {
      clave: "motivo",
      texto: "Motivo",
      opcional: true,
      pinta: (o) => <span className="text-ink-2">{o.motivo ?? "—"}</span>,
      exporta: (o) => o.motivo,
    },
    {
      clave: "bultos",
      texto: "Bultos",
      opcional: true,
      alineacion: "derecha",
      pinta: (o) => (
        <span className="num">
          {o.bultos_entregados != null && o.bultos_entregados !== o.bultos
            ? `${o.bultos_entregados}/${o.bultos}`
            : o.bultos}
        </span>
      ),
      exporta: (o) => o.bultos,
    },
    {
      clave: "ruta",
      texto: "Ruta",
      opcional: true,
      pinta: (o) => (
        <span className="num text-ink-2">
          {o.ruta_indice != null ? `R-${String(o.ruta_indice + 1).padStart(2, "0")}` : "—"}
        </span>
      ),
      exporta: (o) => (o.ruta_indice != null ? `R-${String(o.ruta_indice + 1).padStart(2, "0")}` : ""),
    },
    {
      clave: "conductor",
      texto: "Conductor",
      opcional: true,
      pinta: (o) => <span className="text-ink-2">{o.conductor ?? "—"}</span>,
      exporta: (o) => o.conductor,
    },
    {
      clave: "placa",
      texto: "Vehículo",
      opcional: true,
      pinta: (o) => <span className="num text-ink-2">{o.placa ?? "—"}</span>,
      exporta: (o) => o.placa,
    },
    {
      clave: "eta",
      texto: "Estimada",
      opcional: true,
      pinta: (o) => <span className="num text-ink-3">{corta(o.eta)}</span>,
      exporta: (o) => corta(o.eta),
    },
    {
      clave: "real",
      texto: "Real",
      opcional: true,
      pinta: (o) => <span className="num">{hora(o.hora_entrega)}</span>,
      exporta: (o) => hora(o.hora_entrega),
    },
    {
      clave: "desvio",
      texto: "Desvío",
      opcional: true,
      pinta: (o) => (
        <span
          className={`num font-semibold ${
            o.desvio_min == null || Math.abs(o.desvio_min) <= 10
              ? "text-ok"
              : o.desvio_min > 0
                ? "text-bad"
                : "text-live"
          }`}
        >
          {o.hora_entrega ? desvioTexto(o.desvio_min) : "—"}
        </span>
      ),
      exporta: (o) => (o.hora_entrega ? o.desvio_min : null),
    },
    {
      clave: "intentos",
      texto: "Intentos",
      opcional: true,
      alineacion: "derecha",
      pinta: (o) => (
        <span className={`num ${o.intentos > 1 ? "font-bold text-warn" : "text-ink-3"}`}>
          {o.intentos}
        </span>
      ),
      exporta: (o) => o.intentos,
    },
    {
      clave: "despacho",
      texto: "Despacho",
      opcional: true,
      pinta: (o) => (
        <Link href={`/despachos/${o.despacho_id}`} className="text-ink-2 transition hover:underline">
          {o.despacho ?? "—"}
        </Link>
      ),
      exporta: (o) => o.despacho,
    },
    {
      clave: "fecha",
      texto: "Fecha",
      opcional: true,
      pinta: (o) => <span className="num text-ink-3">{o.fecha}</span>,
      exporta: (o) => o.fecha,
    },
  ];

  const { visibles, elegidas, alternar, fijas } = useColumnas("ordenes", columnas);

  async function borrar(o: Orden) {
    const ok = window.confirm(
      `¿Eliminar la orden ${o.codigo ?? ""} «${o.nombre ?? ""}»?\n\n` +
        "Se borra del despacho y no se puede recuperar.",
    );
    if (!ok) return;
    try {
      await eliminarParada(o.id);
      // Un filtro nuevo, igual al anterior, vuelve a lanzar la búsqueda.
      setFiltro((f) => ({ ...f }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Lo que se puede hacer con una orden desde su fila.
   *
   * Lo que no procede se queda a la vista, apagado y con el porqué: una orden
   * ya entregada no se edita ni se borra, y una sin ruta no tiene estado que
   * cambiar.
   */
  function acciones(o: Orden): AccionFila[] {
    const pendiente = o.estado_entrega === "pendiente";
    const cerrada = o.bloqueada ? "Está bloqueada: la abre un administrador" : null;
    const lista: AccionFila[] = [
      { texto: "Ver la orden", href: `/paradas/${o.id}` },
      { texto: "Etiquetas de impresión", onClick: () => imprimir([o]) },
      {
        texto: "Modificar estado",
        onClick: () => setCambiando(o),
        noPorque: cerrada ?? (o.en_bandeja ? "Aún no está en ninguna ruta" : null),
      },
      {
        texto: "Editar información",
        onClick: () => setEditando(o.id),
        noPorque: cerrada ?? (pendiente ? null : "Ya se gestionó"),
      },
      { texto: "Documentos y fotos", href: `/paradas/${o.id}` },
    ];
    if (!o.en_bandeja) lista.push({ texto: "Ver en la torre", href: `/torre?despacho=${o.despacho_id}` });
    lista.push({
      texto: "Eliminar",
      peligro: true,
      onClick: () => void borrar(o),
      noPorque:
        rol === "conductor"
          ? "No tienes permiso"
          : (cerrada ?? (pendiente ? null : "Ya se gestionó: es prueba de entrega")),
    });
    return lista;
  }

  /** Con órdenes marcadas se exportan esas; sin ninguna, todo lo filtrado. */
  function exportar(solo?: Orden[]) {
    // Se exporta lo que se está viendo, filtros y columnas incluidos: un
    // archivo que no coincide con la pantalla es una fuente de discusiones.
    const csv = aCSV(
      visibles.map((c) => c.texto),
      (solo ?? lista).map((o) =>
        visibles.map((c) => (c.exporta ? c.exporta(o) : String(c.pinta(o) ?? ""))),
      ),
    );
    descargar(nombreArchivo("ordenes", filtro.hasta ?? hoy()), csv);
  }

  const sel = useSeleccion(lista);
  const borrables = sel.elegidas.filter((o) => o.estado_entrega === "pendiente" && !o.bloqueada);

  /** La dirección de la página de etiquetas admite hasta cien órdenes. */
  const MAX_ETIQUETAS = 100;
  function imprimir(cuales: Orden[]) {
    window.open(
      `/etiquetas?paradas=${cuales.slice(0, MAX_ETIQUETAS).map((o) => o.id).join(",")}`,
      "_blank",
      "noopener",
    );
  }

  async function borrarMarcadas() {
    const resto = sel.elegidas.length - borrables.length;
    const ok = window.confirm(
      `¿Eliminar ${borrables.length} orden(es)?\n\nSe borran de su despacho y no se pueden recuperar.` +
        (resto ? `\n\n${resto} de las marcadas ya se gestionaron o están bloqueadas y se quedan como están.` : ""),
    );
    if (!ok) return;
    setError(null);
    setOcupado(true);
    let hechas = 0;
    try {
      for (const o of borrables) {
        try {
          await eliminarParada(o.id);
          hechas += 1;
        } catch (e) {
          setError(
            `${o.codigo ?? o.nombre ?? "Orden"}: ${e instanceof Error ? e.message : String(e)}` +
              (hechas ? ` (las ${hechas} anteriores sí se eliminaron)` : ""),
          );
          break;
        }
      }
    } finally {
      setOcupado(false);
      sel.limpiar();
      setFiltro((f) => ({ ...f }));
    }
  }

  const otrosActivos = [filtro.vehiculo, filtro.ultimo, filtro.bandeja].filter(Boolean).length;

  const { pagina, setPagina, total, visibles: filas } = usePaginas(lista, 15);

  return (
    <div>
      <AccionesPagina>
        <Link href="/bitacora" className={BOTON_SECUNDARIO}>
          Bitácora
        </Link>
        <button onClick={() => exportar()} disabled={!lista.length} className={BOTON_SECUNDARIO}>
          ⤓ Exportar a excel
        </button>
        <Link href="/planificador" className={BOTON_PRIMARIO}>
          + Nueva orden
        </Link>
      </AccionesPagina>

      {/* Filtros */}
      <div className="grid grid-cols-1 gap-2 pb-3 @xl:grid-cols-2 @4xl:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <input
          value={filtro.texto ?? ""}
          onChange={(e) => setFiltro((f) => ({ ...f, texto: e.target.value }))}
          placeholder="Código de orden, cliente o dirección"
          className="w-full outline-none"
        />
        <select
          value={filtro.estado ?? ""}
          onChange={(e) => setFiltro((f) => ({ ...f, estado: e.target.value || undefined }))}
          className="w-full outline-none"
        >
          <option value="">Estado</option>
          {Object.entries(ESTADO).map(([k, v]) => (
            <option key={k} value={k}>{v.texto}</option>
          ))}
        </select>
        <select
          value={filtro.conductor ?? ""}
          onChange={(e) => setFiltro((f) => ({ ...f, conductor: e.target.value || undefined }))}
          className="w-full outline-none"
        >
          <option value="">Usuario móvil</option>
          {conductores.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          type="date"
          title="Desde"
          value={filtro.desde ?? ""}
          onChange={(e) => setFiltro((f) => ({ ...f, desde: e.target.value || undefined }))}
          className="num w-full outline-none"
        />
        <input
          type="date"
          title="Hasta"
          value={filtro.hasta ?? ""}
          onChange={(e) => setFiltro((f) => ({ ...f, hasta: e.target.value || undefined }))}
          className="num w-full outline-none"
        />
      </div>

      {/* Otros filtros: los que se usan de vez en cuando, plegados. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-3">
        <button
          onClick={() => setOtros((v) => !v)}
          aria-expanded={otros}
          className={`${BOTON_SECUNDARIO} h-8`}
        >
          Otros filtros{otrosActivos ? ` (${otrosActivos})` : ""}
        </button>
        {(otros || otrosActivos > 0) && (
          <>
            <select
              value={filtro.vehiculo ?? ""}
              onChange={(e) => setFiltro((f) => ({ ...f, vehiculo: e.target.value || undefined }))}
              className="w-[180px] outline-none"
            >
              <option value="">Vehículo</option>
              {vehiculos.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-[13.5px] text-ink-2">
              <input
                type="checkbox"
                checked={Boolean(filtro.ultimo)}
                onChange={(e) => setFiltro((f) => ({ ...f, ultimo: e.target.checked || undefined }))}
                className="h-4 w-4 accent-[var(--color-amber)]"
              />
              Solo el último despacho
            </label>
            <label className="flex items-center gap-2 text-[13.5px] text-ink-2">
              <input
                type="checkbox"
                checked={Boolean(filtro.bandeja)}
                onChange={(e) => setFiltro((f) => ({ ...f, bandeja: e.target.checked || undefined }))}
                className="h-4 w-4 accent-[var(--color-amber)]"
              />
              Sin asignar a una ruta
            </label>
          </>
        )}
        {(filtro.texto || filtro.estado || filtro.conductor || otrosActivos > 0) && (
          <button
            onClick={() => setFiltro((f) => ({ desde: f.desde, hasta: f.hasta }))}
            className="h-8 rounded-full px-3 text-[13px] font-bold text-ink-2 transition hover:bg-canvas"
          >
            Quitar filtros
          </button>
        )}
      </div>

      <Contador n={lista.length} texto={cargando ? "órdenes · buscando…" : "órdenes"}>
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

      <BarraSeleccion
        n={sel.elegidas.length}
        texto={sel.elegidas.length === 1 ? "orden seleccionada" : "órdenes seleccionadas"}
        onLimpiar={sel.limpiar}
      >
        <button
          onClick={() => imprimir(sel.elegidas)}
          title={sel.elegidas.length > MAX_ETIQUETAS ? `Se imprimen las primeras ${MAX_ETIQUETAS}` : undefined}
          className={BOTON_LOTE}
        >
          Etiquetas de impresión
        </button>
        <button onClick={() => exportar(sel.elegidas)} className={BOTON_LOTE}>
          Exportar a excel
        </button>
        {rol !== "conductor" && (
          <button
            disabled={ocupado || !borrables.length}
            title={borrables.length ? undefined : "Las marcadas ya se gestionaron o están bloqueadas"}
            onClick={() => void borrarMarcadas()}
            className={BOTON_LOTE_PELIGRO}
          >
            Eliminar{borrables.length ? ` (${borrables.length})` : ""}
          </button>
        )}
      </BarraSeleccion>

      {lista.length === 0 ? (
        <p className="rounded-[8px] border border-line p-6 text-[14px] text-ink-2">
          Ninguna orden coincide. Prueba a ampliar el rango de fechas: por
          defecto se miran los últimos ocho días.
        </p>
      ) : (
        <div className="overflow-hidden rounded-[8px] border border-line">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="w-[44px]" style={{ padding: "0 0 0 14px" }}>
                    <Casilla
                      rotulo="Seleccionar las órdenes de esta página"
                      marcada={filas.length > 0 && filas.every((o) => sel.tiene(o.id))}
                      parcial={filas.some((o) => sel.tiene(o.id))}
                      onCambio={(si) => sel.marcar(filas.map((o) => o.id), si)}
                    />
                  </th>
                  {visibles.map((c) => (
                    <th
                      key={c.clave}
                      className={c.alineacion === "derecha" ? "text-right" : "text-left"}
                    >
                      {c.texto}
                    </th>
                  ))}
                  <th className="w-[56px]" aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {filas.map((o) => (
                  <tr key={o.id} className={`transition hover:bg-surface-2 ${sel.tiene(o.id) ? "bg-amber-050" : ""}`}>
                    <td className="border-b border-line align-middle" style={{ padding: "0 0 0 14px" }}>
                      <Casilla
                        rotulo={`Seleccionar la orden ${o.codigo ?? o.nombre ?? ""}`}
                        marcada={sel.tiene(o.id)}
                        onCambio={() => sel.alternar(o.id)}
                      />
                    </td>
                    {visibles.map((c) => (
                      <td
                        key={c.clave}
                        className={`border-b border-line align-middle ${
                          c.alineacion === "derecha" ? "text-right" : ""
                        }`}
                      >
                        {c.pinta(o)}
                      </td>
                    ))}
                    <td className="border-b border-line text-center align-middle" style={{ padding: "0 6px" }}>
                      <MenuFila
                        rotulo={`Acciones de la orden ${o.codigo ?? o.nombre ?? ""}`}
                        acciones={acciones(o)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacion pagina={pagina} total={total} onCambio={setPagina} />
        </div>
      )}

      {cambiando && (
        <ModalEstado
          parada={cambiando}
          onCerrar={() => setCambiando(null)}
          onHecho={() => { setCambiando(null); void buscar(filtro); }}
        />
      )}
      {editando && (
        <ModalEditarOrden
          paradaId={editando}
          onCerrar={() => setEditando(null)}
          onHecho={() => { setEditando(null); void buscar(filtro); }}
        />
      )}

      {lista.length >= 500 && (
        <p className="mt-2 text-[12px] text-warn">
          Se muestran las primeras 500. Acota la fecha o el texto para verlo
          todo.
        </p>
      )}
    </div>
  );
}
