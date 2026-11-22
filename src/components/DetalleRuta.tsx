"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { prepararInsercion } from "@/app/acciones/insertar";
import {
  editarRuta, guardarOrden, prepararOrden,
  type ParadaDeRuta, type PreparacionOrden, type RutaDetalle,
} from "@/app/acciones/rutas";
import MenuFila from "@/components/MenuFila";
import ModalEditarOrden from "@/components/ModalEditarOrden";
import NuevaOrden from "@/components/NuevaOrden";
import { AccionesPagina, BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/components/Paginacion";
import { Pastilla } from "@/components/ui";
import { aplicarInsercion } from "@/lib/despachos";
import { aCSV, descargar } from "@/lib/exportar";
import { hora } from "@/lib/horas";
import { insertar, reordenar, type PropuestaOrden } from "@/lib/motor";

const MapaSeguimiento = dynamic(() => import("@/components/MapaSeguimiento"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-[13px] text-ink-3">Cargando mapa…</div>
  ),
});

const ESTADO: Record<string, { texto: string; tono: "ok" | "warn" | "bad" | "live" }> = {
  entregado: { texto: "Entregado", tono: "ok" },
  parcial: { texto: "Parcial", tono: "warn" },
  reprogramado: { texto: "Reprogramado", tono: "warn" },
  fallido: { texto: "No entregado", tono: "bad" },
  pendiente: { texto: "Pendiente", tono: "live" },
};

const corta = (t: string | null) => (t ? t.slice(0, 5) : "");
const ENTRADA =
  "h-10 w-full rounded-[4px] border border-line bg-surface px-3 text-[14px] text-ink outline-none focus:border-amber";

export type Persona = { id: string; nombre: string | null };
export type Transporte = { id: string; nombre: string; placa: string | null; conductor_id?: string | null };

/**
 * El detalle de una ruta, como en la referencia.
 *
 * Arriba, quién la lleva, cuándo sale y cuánto lleva gestionado. Dos
 * pestañas: «Despachos», la tabla de órdenes en su orden, y «Mapa», la misma
 * lista junto al recorrido. Y las acciones que antes obligaban a volver al
 * planificador: reordenar lo que queda, editar la ruta y asociarle un pedido.
 */
export default function DetalleRuta({
  ruta: r,
  conductores,
  vehiculos,
  rol,
}: {
  ruta: RutaDetalle;
  conductores: Persona[];
  vehiculos: Transporte[];
  rol: "admin" | "planificador" | "conductor";
}) {
  const router = useRouter();
  const [pestana, setPestana] = useState<"despachos" | "mapa">("despachos");
  const [elegida, setElegida] = useState<string | null>(null);
  // Los filtros se escriben y se aplican con «Filtrar», como en la referencia.
  const [borrador, setBorrador] = useState({ estado: "", texto: "" });
  const [filtro, setFiltro] = useState({ estado: "", texto: "" });
  const [dialogo, setDialogo] = useState<null | "reordenar" | "editar" | "asociar">(null);
  const [editando, setEditando] = useState<string | null>(null);

  const nombre = r.placa ?? `R-${String(r.indice + 1).padStart(2, "0")}`;
  const gestionadas = r.paradas.filter((p) => p.estado_entrega !== "pendiente").length;
  const cerrada = r.estado === "completada" || r.estado === "cancelada";
  const puedeCambiar = rol !== "conductor" && !cerrada;

  const visibles = useMemo(() => {
    const t = filtro.texto.trim().toLowerCase();
    return r.paradas.filter(
      (p) =>
        (!filtro.estado || p.estado_entrega === filtro.estado) &&
        (!t || `${p.codigo ?? ""} ${p.nombre ?? ""}`.toLowerCase().includes(t)),
    );
  }, [r.paradas, filtro]);

  const hayBorrador = borrador.estado !== filtro.estado || borrador.texto !== filtro.texto;
  const filtrando = Boolean(filtro.estado || filtro.texto);

  function exportar() {
    const csv = aCSV(
      ["#", "Pedido", "Nombre", "Estado", "Subestado", "Teléfono", "Hora estimada", "Hora real",
       "Ventana", "Dirección", "Distrito", "Bultos", "Artículos"],
      visibles.map((p) => [
        p.orden, p.codigo, p.nombre, ESTADO[p.estado_entrega]?.texto ?? p.estado_entrega,
        p.subestado ?? p.motivo, p.telefono, corta(p.eta),
        p.hora_entrega ? hora(p.hora_entrega) : "",
        p.ventana_ini ? `${corta(p.ventana_ini)}-${corta(p.ventana_fin)}` : "",
        p.direccion, p.distrito, p.bultos, p.items,
      ]),
    );
    descargar(`ruta-${nombre}-${r.fecha}.csv`, csv);
  }

  const verEnMapa = (id: string) => { setElegida(id); setPestana("mapa"); };

  return (
    <div className="flex flex-col gap-4">
      <AccionesPagina>
        <Link href={`/rutas/${r.id}/historial`} className={BOTON_SECUNDARIO}>
          Historial de ruta
        </Link>
        {puedeCambiar && (
          <>
            <Link href={`/despachos/${r.despacho_id}/editar`} className={BOTON_SECUNDARIO}>
              Mover órdenes
            </Link>
            <button onClick={() => setDialogo("editar")} className={BOTON_SECUNDARIO}>
              Editar ruta
            </button>
            <button onClick={() => setDialogo("asociar")} className={BOTON_PRIMARIO}>
              Asociar pedido
            </button>
          </>
        )}
      </AccionesPagina>

      {/* Pestañas, datos de la ruta y acciones sobre la lista */}
      <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
        <div className="inline-flex rounded-full border border-[#d9d9d9] bg-[#f0f0f0] p-[3px]">
          {(["despachos", "mapa"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setPestana(k)}
              aria-pressed={pestana === k}
              className={`h-8 min-w-[92px] rounded-full px-4 text-[14px] transition ${
                pestana === k ? "bg-surface font-semibold text-ink shadow-sm" : "text-[#aaa] hover:text-ink-2"
              }`}
            >
              {k === "despachos" ? "Despachos" : "Mapa"}
            </button>
          ))}
        </div>

        <Dato rotulo="Conductor">{r.conductor ?? "Sin conductor"}</Dato>
        <Dato rotulo="Inicio de ruta">
          <span className="num">
            {r.fecha} {r.salida_real ? hora(r.salida_real) : corta(r.salida_prog) || "—"}
          </span>
          {!r.salida_real && <span className="text-ink-3"> · prevista</span>}
        </Dato>
        <Dato rotulo="Fin de ruta">
          <span className="num">
            {r.fin_real ? hora(r.fin_real) : corta(r.fin_estimado) || "—"}
          </span>
          {!r.fin_real && r.fin_estimado && <span className="text-ink-3"> · estimado</span>}
        </Dato>
        <span className="text-[14px] text-ink-2">
          Pedidos: <b className="num text-ink">{r.paradas.length}</b>
        </span>
        <span className="text-[14px] text-ink-2">
          Gestionados: <b className="num text-ink">{gestionadas}</b>
        </span>
        {cerrada && <Pastilla tono="ok">Ruta cerrada</Pastilla>}

        <span className="ml-auto flex flex-wrap gap-2">
          <button onClick={exportar} disabled={!visibles.length} className={BOTON_SECUNDARIO}>
            Exportar
          </button>
          {puedeCambiar && (
            <button
              onClick={() => setDialogo("reordenar")}
              disabled={r.paradas.length - gestionadas < 2}
              title={r.paradas.length - gestionadas < 2 ? "No hay nada que ordenar" : undefined}
              className={BOTON_SECUNDARIO}
            >
              Reordenar ruta
            </button>
          )}
        </span>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={borrador.estado}
          onChange={(e) => setBorrador((b) => ({ ...b, estado: e.target.value }))}
          aria-label="Estado"
          className="w-[220px] outline-none"
        >
          <option value="">Estado</option>
          {Object.entries(ESTADO).map(([k, v]) => (
            <option key={k} value={k}>{v.texto}</option>
          ))}
        </select>
        <input
          value={borrador.texto}
          onChange={(e) => setBorrador((b) => ({ ...b, texto: e.target.value }))}
          onKeyDown={(e) => { if (e.key === "Enter") setFiltro(borrador); }}
          placeholder="Número de pedido"
          className="min-w-[200px] flex-1 outline-none"
        />
        <button
          onClick={() => setFiltro(borrador)}
          disabled={!hayBorrador}
          className="inline-flex h-10 items-center rounded-full px-5 text-[14px] font-bold transition disabled:bg-line disabled:text-[#8fa0ba] enabled:bg-amber enabled:text-white enabled:hover:bg-amber-600"
        >
          Filtrar
        </button>
        {filtrando && (
          <button
            onClick={() => { setFiltro({ estado: "", texto: "" }); setBorrador({ estado: "", texto: "" }); }}
            className="inline-flex h-10 items-center rounded-full border border-line-strong bg-surface px-4 text-[14px] font-bold text-ink transition hover:bg-canvas"
          >
            Quitar filtros
          </button>
        )}
      </div>

      {r.paradas.length === 0 ? (
        <p className="rounded-[8px] border border-line p-6 text-[14px] text-ink-2">
          Esta ruta no tiene órdenes. Usa «Asociar pedido» para darle alguna.
        </p>
      ) : pestana === "despachos" ? (
        <div className="overflow-hidden rounded-[8px] border border-line">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] border-collapse">
              <thead>
                <tr>
                  <th className="w-[56px] text-left">#</th>
                  <th className="text-left">Pedido</th>
                  <th className="text-left">Estado</th>
                  <th className="text-left">Contacto</th>
                  <th className="text-left">Hora estimada</th>
                  <th className="text-left">Hora real</th>
                  <th className="text-left">Ventana comprometida</th>
                  <th className="text-left">Dirección</th>
                  <th className="text-right">Artículos</th>
                  <th className="w-[56px]" aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => (
                  <FilaDespacho
                    key={p.id}
                    parada={p}
                    fecha={r.fecha}
                    onMapa={() => verEnMapa(p.id)}
                    onEditar={puedeCambiar ? () => setEditando(p.id) : null}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {visibles.length === 0 && (
            <p className="p-6 text-center text-[14px] text-ink-2">Ninguna orden coincide con el filtro.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-[minmax(300px,420px)_1fr]">
          <div className="max-h-[620px] overflow-y-auto rounded-[8px] border border-line">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="w-[56px] text-left">#</th>
                  <th className="text-left">Pedido</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setElegida(p.id)}
                    className={`cursor-pointer transition hover:bg-surface-2 ${
                      elegida === p.id ? "bg-amber-050" : ""
                    }`}
                  >
                    <td className="num border-b border-line align-middle">{p.orden}</td>
                    <td className="border-b border-line align-middle">
                      <Link href={`/paradas/${p.id}`} className="num font-semibold" onClick={(e) => e.stopPropagation()}>
                        {p.codigo ?? p.id.slice(0, 8)}
                      </Link>
                      <span className="block truncate text-[12px] text-ink-3">{p.nombre}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="h-[620px] overflow-hidden rounded-[8px] border border-line">
            <MapaSeguimiento
              key={r.id}
              paradas={visibles.map((p) => ({
                id: p.id, orden: p.orden, nombre: p.nombre, lat: p.lat, lon: p.lon,
                bultos: p.bultos, estado_entrega: p.estado_entrega,
                hora_entrega: p.hora_entrega, motivo: p.motivo,
              }))}
              geometria={r.geometria}
              colorRuta="#337ab7"
              cd={r.cd_lat != null && r.cd_lon != null ? { lat: r.cd_lat, lon: r.cd_lon } : null}
              nombreCd={r.base_nombre}
              siguienteId={elegida ?? r.paradas.find((p) => p.estado_entrega === "pendiente")?.id ?? null}
              onClicParada={setElegida}
            />
          </div>
        </div>
      )}

      <p className="text-[11.5px] leading-relaxed text-ink-3">
        Despacho{" "}
        <Link href={`/despachos/${r.despacho_id}`} className="font-semibold text-amber-600 underline underline-offset-2">
          {r.despacho ?? "sin nombre"}
        </Link>
        {r.base_nombre ? ` · sale de ${r.base_nombre}` : ""}
        {r.km != null ? ` · ${Number(r.km).toFixed(1)} km planificados` : ""}
        {r.personalizada ? " · orden puesto a mano" : ""}
        {" · "}
        <Link href={`/torre?despacho=${r.despacho_id}`} className="font-semibold text-amber-600 underline underline-offset-2">
          seguir en la torre
        </Link>
      </p>

      {dialogo === "reordenar" && (
        <DialogoReordenar
          ruta={r}
          onCerrar={() => setDialogo(null)}
          onHecho={() => { setDialogo(null); router.refresh(); }}
        />
      )}
      {dialogo === "editar" && (
        <DialogoEditar
          ruta={r}
          conductores={conductores}
          vehiculos={vehiculos}
          onCerrar={() => setDialogo(null)}
          onHecho={() => { setDialogo(null); router.refresh(); }}
        />
      )}
      {dialogo === "asociar" && (
        <DialogoAsociar
          ruta={r}
          onCerrar={() => setDialogo(null)}
          onHecho={() => { setDialogo(null); router.refresh(); }}
        />
      )}
      {editando && (
        <ModalEditarOrden
          paradaId={editando}
          onCerrar={() => setEditando(null)}
          onHecho={() => { setEditando(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function Dato({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <span className="text-[14px] leading-tight text-ink">
      <span className="block text-[11.5px] text-ink-3">{rotulo}</span>
      {children}
    </span>
  );
}

function FilaDespacho({
  parada: p, fecha, onMapa, onEditar,
}: {
  parada: ParadaDeRuta;
  fecha: string;
  onMapa: () => void;
  onEditar: (() => void) | null;
}) {
  const e = ESTADO[p.estado_entrega] ?? { texto: p.estado_entrega, tono: "live" as const };
  const pendiente = p.estado_entrega === "pendiente";
  return (
    <tr className="transition hover:bg-surface-2">
      <td className="num border-b border-line align-middle">{p.orden}</td>
      <td className="border-b border-line align-middle">
        <span className="flex items-center gap-1.5">
          <Link href={`/paradas/${p.id}`} className="num font-semibold">
            {p.codigo ?? p.id.slice(0, 8)}
          </Link>
          <button
            onClick={onMapa}
            title="Ver en el mapa"
            aria-label={`Ver ${p.codigo ?? "la orden"} en el mapa`}
            className="grid h-6 w-6 place-items-center rounded-full text-[#0792e0] transition hover:bg-canvas"
          >
            <svg width="13" height="16" viewBox="0 0 13 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
              <path d="M6.5 15s5-4.6 5-8.6a5 5 0 1 0-10 0c0 4 5 8.6 5 8.6Z" />
              <circle cx="6.5" cy="6.3" r="1.8" />
            </svg>
          </button>
        </span>
      </td>
      <td className="border-b border-line align-middle">
        <Pastilla tono={e.tono}>{e.texto}</Pastilla>
        {(p.subestado ?? p.motivo) && (
          <span className="mt-0.5 block max-w-[180px] truncate text-[12px] text-ink-3">
            {p.subestado ?? p.motivo}
          </span>
        )}
      </td>
      <td className="border-b border-line align-middle text-ink">
        {p.nombre ?? "—"}
        {p.telefono && (
          <a href={`tel:${p.telefono}`} className="num block text-[12.5px]">{p.telefono}</a>
        )}
      </td>
      <td className="num border-b border-line align-middle">
        {corta(p.eta) || "—"}
        <span className="block text-[11.5px] text-ink-3">{fecha}</span>
      </td>
      <td className="num border-b border-line align-middle">
        {p.hora_entrega ? hora(p.hora_entrega) : ""}
      </td>
      <td className="num border-b border-line align-middle">
        {p.ventana_ini ? `${corta(p.ventana_ini)} – ${corta(p.ventana_fin)}` : ""}
      </td>
      <td className="border-b border-line align-middle">
        {p.direccion ?? p.distrito ?? "—"}
        {p.direccion && p.distrito && (
          <span className="block text-[11.5px] text-ink-3">{p.distrito}</span>
        )}
      </td>
      <td className="num border-b border-line text-right align-middle">{p.items || "—"}</td>
      <td className="border-b border-line text-center align-middle" style={{ padding: "0 6px" }}>
        <MenuFila
          rotulo={`Acciones de la orden ${p.codigo ?? ""}`}
          acciones={[
            { texto: "Ver orden", href: `/paradas/${p.id}` },
            {
              texto: "Editar",
              onClick: () => onEditar?.(),
              noPorque: !onEditar
                ? "La ruta está cerrada"
                : p.bloqueada
                  ? "Está bloqueada"
                  : pendiente ? null : "Ya se gestionó",
            },
          ]}
        />
      </td>
    </tr>
  );
}

/* ── Marco común de los diálogos ───────────────────────────────────── */

function Dialogo({
  titulo, ancho = 500, onCerrar, children,
}: {
  titulo: string;
  ancho?: number;
  onCerrar: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <button aria-label="Cerrar" onClick={onCerrar} className="fixed inset-0 z-40 cursor-default bg-navy-900/40" />
      <div
        role="dialog"
        aria-label={titulo}
        className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-40px)] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[8px] bg-surface p-6 shadow-2xl"
        style={{ width: ancho }}
      >
        <div className="flex items-center pb-4">
          <b className="text-[18px] text-ink">{titulo}</b>
          <button onClick={onCerrar} aria-label="Cerrar" className="ml-auto text-[16px] text-ink-2 hover:text-ink">
            ✕
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

const BOTON_CANCELAR =
  "h-10 rounded-full border border-line-strong bg-surface px-6 text-[14px] font-bold text-ink transition hover:bg-surface-2";
const BOTON_ACEPTAR =
  "h-10 rounded-full bg-amber px-6 text-[14px] font-bold text-white transition hover:bg-amber-600 disabled:opacity-50";

/* ── Reordenar ruta ────────────────────────────────────────────────── */

/**
 * Vuelve a ordenar lo que le queda a la ruta.
 *
 * Como en la referencia, se elige dónde termina: de vuelta en el centro, en
 * una orden concreta o donde convenga. De dónde parte no se elige: es el
 * centro, o donde esté el vehículo si ya salió. Antes de guardar se ve la
 * diferencia; si el orden que había ya era el mejor, se dice y no se toca.
 */
function DialogoReordenar({
  ruta: r, onCerrar, onHecho,
}: {
  ruta: RutaDetalle;
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const pendientes = r.paradas.filter((p) => p.estado_entrega === "pendiente");
  const enCalle = Boolean(r.salida_real) || pendientes.length < r.paradas.length;
  const [final, setFinal] = useState("centro");
  const [ocupado, setOcupado] = useState<null | "calcular" | "guardar">(null);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<{ plan: PropuestaOrden; datos: PreparacionOrden } | null>(null);

  const nombreDe = (id: string) => {
    const p = r.paradas.find((x) => x.id === id);
    return p ? `${p.codigo ?? ""} ${p.nombre ?? ""}`.trim() : "Orden";
  };

  async function calcular() {
    setOcupado("calcular");
    setError(null);
    setRes(null);
    try {
      const datos = await prepararOrden(r.id, {
        final: final === "centro" || final === "libre" ? final : "parada",
        finalId: final === "centro" || final === "libre" ? null : final,
        optimizar: true,
      });
      const plan = await reordenar(datos.cuerpo);
      setRes({ plan, datos });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  async function guardar() {
    if (!res?.plan.cambio) return;
    setOcupado("guardar");
    setError(null);
    try {
      await guardarOrden(r.id, res.plan.despues, {
        enCalle: res.datos.enCalle, salida: res.datos.salida, aMano: false,
      });
      onHecho();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setOcupado(null);
    }
  }

  const a = res?.plan.antes;
  const d = res?.plan.despues;

  return (
    <Dialogo titulo="Reordenar ruta" ancho={540} onCerrar={onCerrar}>
      <p className="text-[13.5px] leading-relaxed text-ink-2">
        Elige dónde termina la ruta. Las <b className="num text-ink">{pendientes.length}</b> órdenes
        pendientes se reordenan entre el punto de inicio y ese final, dando prioridad a las
        ventanas horarias.
      </p>

      <div className="mt-4 space-y-3 text-[13px] text-ink-2">
        <label className="block">
          Punto de inicio
          <input
            readOnly
            value={
              enCalle
                ? "Donde está el vehículo ahora (su última orden gestionada)"
                : (r.base_nombre ? `Base ${r.base_nombre}` : "Centro de distribución")
            }
            className={`mt-1 ${ENTRADA} bg-surface-2 text-ink-2`}
          />
        </label>
        <label className="block">
          Punto final
          <select
            value={final}
            onChange={(e) => { setFinal(e.target.value); setRes(null); }}
            className={`mt-1 ${ENTRADA}`}
          >
            <option value="centro">
              Vuelve {r.base_nombre ? `a la base ${r.base_nombre}` : "al centro de distribución"}
            </option>
            <option value="libre">Termina donde convenga (no vuelve)</option>
            {pendientes.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.orden} · {p.codigo ?? ""} · {p.nombre ?? ""}
              </option>
            ))}
          </select>
        </label>
        {enCalle && (
          <p className="text-[12px] text-ink-3">
            La ruta ya está en la calle: la siguiente orden pendiente no se mueve, porque el
            conductor ya va hacia ella.
          </p>
        )}
      </div>

      {res && a && d && (
        <div className="mt-4 rounded-[8px] border border-line px-4 py-3 text-[13px] text-ink-2">
          {res.plan.cambio ? (
            <>
              <div className="font-bold text-ink">Orden propuesto</div>
              <div className="mt-1.5">
                Recorrido: <b className="num text-ink">{d.km.toFixed(1)} km</b>{" "}
                <span className="num text-ink-3">(antes {a.km.toFixed(1)})</span>
              </div>
              <div>
                Termina: <b className="num text-ink">{d.fin}</b>{" "}
                <span className="num text-ink-3">(antes {a.fin})</span>
              </div>
              <div>
                Fuera de su ventana:{" "}
                <b className={`num ${d.tarde.length ? "text-bad" : "text-ok"}`}>{d.tarde.length}</b>{" "}
                <span className="num text-ink-3">(antes {a.tarde.length})</span>
              </div>
              <div className="mt-2 text-[12px] leading-relaxed text-ink-3">
                {d.orden.slice(0, 6).map(nombreDe).join(" → ")}
                {d.orden.length > 6 ? ` → … (${d.orden.length - 6} más)` : ""}
              </div>
              {d.tarde.length > 0 && (
                <div className="mt-2 text-[12px] text-bad">
                  Llegan tarde: {d.tarde.map(nombreDe).join(", ")}.
                </div>
              )}
            </>
          ) : (
            <span>
              El orden actual ya es el mejor para ese final:{" "}
              <b className="num text-ink">{a.km.toFixed(1)} km</b>, termina a las{" "}
              <b className="num text-ink">{a.fin}</b>. No hay nada que cambiar.
            </span>
          )}
          {res.plan.matriz === "recta" && (
            <div className="mt-2 text-[11.5px] text-ink-3">
              No se pudo consultar el servidor de calles: las distancias son estimadas.
            </div>
          )}
        </div>
      )}

      {error && <p className="pt-3 text-[13px] text-bad">{error}</p>}

      <div className="flex justify-end gap-2 pt-5">
        <button onClick={onCerrar} className={BOTON_CANCELAR}>Cancelar</button>
        {res?.plan.cambio ? (
          <button onClick={() => void guardar()} disabled={ocupado !== null} className={BOTON_ACEPTAR}>
            {ocupado === "guardar" ? "Guardando…" : "Guardar este orden"}
          </button>
        ) : (
          <button onClick={() => void calcular()} disabled={ocupado !== null} className={BOTON_ACEPTAR}>
            {ocupado === "calcular" ? "Calculando…" : "Reordenar ruta"}
          </button>
        )}
      </div>
    </Dialogo>
  );
}

/* ── Editar ruta ───────────────────────────────────────────────────── */

function DialogoEditar({
  ruta: r, conductores, vehiculos, onCerrar, onHecho,
}: {
  ruta: RutaDetalle;
  conductores: Persona[];
  vehiculos: Transporte[];
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const [conductor, setConductor] = useState(r.conductor_id ?? "");
  const [vehiculo, setVehiculo] = useState(r.vehiculo_id ?? "");
  const [salida, setSalida] = useState(corta(r.salida_prog));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const yaSalio = Boolean(r.salida_real);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await editarRuta({
        ruta_id: r.id,
        conductor_id: conductor || null,
        vehiculo_id: vehiculo || null,
        salida: yaSalio ? null : (salida || null),
      });
      onHecho();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGuardando(false);
    }
  }

  return (
    <Dialogo titulo="Editar ruta" onCerrar={onCerrar}>
      <div className="space-y-3 text-[13px] text-ink-2">
        <label className="block">
          Usuario móvil (conductor)
          <select
            value={conductor}
            onChange={(e) => {
              setConductor(e.target.value);
              // Su vehículo habitual, si aún no se eligió ninguno.
              const suyo = vehiculos.find((v) => v.conductor_id === e.target.value);
              if (e.target.value && !vehiculo && suyo) setVehiculo(suyo.id);
            }}
            className={`mt-1 ${ENTRADA}`}
          >
            <option value="">— sin asignar —</option>
            {conductores.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre ?? "Conductor"}</option>
            ))}
          </select>
        </label>
        <label className="block">
          Vehículo
          <select value={vehiculo} onChange={(e) => setVehiculo(e.target.value)} className={`mt-1 ${ENTRADA}`}>
            <option value="">{vehiculos.length ? "— sin vehículo —" : "— no hay vehículos —"}</option>
            {vehiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.placa ? `${v.placa} · ` : ""}{v.nombre}
              </option>
            ))}
          </select>
        </label>
        {vehiculos.length === 0 && (
          <p className="text-[12px] text-warn">
            Todavía no hay vehículos. Créalos en{" "}
            <Link href="/vehiculos" className="font-bold underline underline-offset-2">Ajustes → Vehículos</Link>.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            Fecha de despacho
            <input readOnly value={r.fecha} className={`num mt-1 ${ENTRADA} bg-surface-2 text-ink-2`} />
          </label>
          <label className="block">
            Hora de inicio
            <input
              type="time"
              value={salida}
              onChange={(e) => setSalida(e.target.value)}
              disabled={yaSalio}
              className={`num mt-1 ${ENTRADA} disabled:bg-surface-2 disabled:text-ink-3`}
            />
          </label>
        </div>
        <p className="text-[12px] leading-relaxed text-ink-3">
          {yaSalio
            ? "La ruta ya salió: su hora de inicio no se puede cambiar."
            : "Al cambiar la hora de inicio, las horas estimadas de sus órdenes se mueven lo mismo."}{" "}
          La fecha es la del despacho.
        </p>
      </div>

      {error && <p className="pt-3 text-[13px] text-bad">{error}</p>}

      <div className="flex justify-end gap-2 pt-5">
        <button onClick={onCerrar} className={BOTON_CANCELAR}>Cancelar</button>
        <button onClick={() => void guardar()} disabled={guardando} className={BOTON_ACEPTAR}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </Dialogo>
  );
}

/* ── Asociar pedido ────────────────────────────────────────────────── */

/**
 * Le da a esta ruta órdenes que están sin asignar, o una nueva.
 *
 * No las pone al final: le pregunta al motor entre qué dos paradas conviene
 * cada una, contando con lo que le queda a la ruta. Si alguna no encuentra
 * hueco —por carga, por ventana, por jornada— se queda en la bandeja y se
 * dice por qué.
 */
function DialogoAsociar({
  ruta: r, onCerrar, onHecho,
}: {
  ruta: RutaDetalle;
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fuera, setFuera] = useState<{ nombre: string; motivo: string }[] | null>(null);

  function alternar(id: string) {
    setElegidas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  async function asociar() {
    if (!elegidas.size) return;
    setOcupado(true);
    setError(null);
    setFuera(null);
    try {
      const datos = await prepararInsercion(r.despacho_id, [...elegidas], false, r.id);
      const plan = await insertar(datos.cuerpo);
      if (plan.rutas.length) await aplicarInsercion(r.despacho_id, plan.rutas, datos.rutas);
      if (plan.sin_asignar.length) {
        // Lo que entró ya está guardado; se queda abierto para decir lo que no.
        setFuera(plan.sin_asignar.map((id) => ({
          nombre: datos.nombres[id] ?? "Orden", motivo: plan.motivos[id],
        })));
        setElegidas(new Set());
        setOcupado(false);
        return;
      }
      onHecho();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setOcupado(false);
    }
  }

  return (
    <Dialogo titulo="Asociar pedido" ancho={720} onCerrar={fuera ? onHecho : onCerrar}>
      <p className="text-[13.5px] leading-relaxed text-ink-2">
        Órdenes del despacho que no están en ninguna ruta. Las que elijas entran en esta ruta,
        cada una en el hueco que menos rodeo cuesta.
      </p>

      {r.bandeja.length === 0 ? (
        <p className="mt-3 rounded-[8px] border border-line px-4 py-3 text-[13px] text-ink-2">
          No hay órdenes sin asignar en este despacho. Crea una abajo y aparecerá aquí.
        </p>
      ) : (
        <div className="mt-3 max-h-[220px] overflow-y-auto rounded-[8px] border border-line">
          {r.bandeja.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2.5 border-b border-line px-4 py-2 last:border-0 hover:bg-canvas"
            >
              <input type="checkbox" checked={elegidas.has(p.id)} onChange={() => alternar(p.id)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-ink">{p.nombre ?? p.codigo}</span>
                <span className="num block text-[11.5px] text-ink-3">
                  {p.codigo}{p.distrito ? ` · ${p.distrito}` : ""}
                </span>
              </span>
              <span className="num shrink-0 text-[12px] text-ink-2">{p.bultos} blt</span>
            </label>
          ))}
        </div>
      )}

      {fuera && (
        <div className="mt-3 rounded-[8px] border border-bad/30 bg-bad-bg px-4 py-3 text-[13px] text-bad">
          <b>No encontraron hueco en esta ruta y siguen sin asignar:</b>
          {fuera.map((f, i) => (
            <div key={i} className="mt-1"><b>{f.nombre}</b>: {f.motivo}</div>
          ))}
        </div>
      )}
      {error && <p className="pt-3 text-[13px] text-bad">{error}</p>}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-4">
        <button onClick={fuera ? onHecho : onCerrar} className={BOTON_CANCELAR}>
          {fuera ? "Cerrar" : "Cancelar"}
        </button>
        <button onClick={() => void asociar()} disabled={ocupado || !elegidas.size} className={BOTON_ACEPTAR}>
          {ocupado ? "Buscando hueco…" : `Asociar${elegidas.size ? ` (${elegidas.size})` : ""}`}
        </button>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <NuevaOrden despachoId={r.despacho_id} />
      </div>
    </Dialogo>
  );
}
