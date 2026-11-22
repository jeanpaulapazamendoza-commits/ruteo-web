"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { alertas as traerAlertas, atenderAlerta, type Alerta } from "@/app/acciones/datos";
import { hora, hoy } from "@/lib/horas";
import {
  AccionesPagina, BOTON_PRIMARIO, BOTON_SECUNDARIO, Paginacion, usePaginas,
} from "@/components/Paginacion";
import { aCSV, descargar } from "@/lib/exportar";

/**
 * Qué es cada aviso y por qué merece interrumpir a alguien.
 *
 * El texto corto va en la columna de estado; el largo explica qué hacer, que
 * es lo que de verdad falta cuando una pantalla se llena de avisos.
 */
const TIPOS: Record<Alerta["tipo"], { corto: string; pestana: string; ayuda: string }> = {
  retraso: {
    corto: "Retraso",
    pestana: "Alertas de retraso en entrega",
    ayuda: "La hora estimada ya pasó y la parada sigue pendiente.",
  },
  silencio: {
    corto: "Sin marcar",
    pestana: "Alertas de señal",
    ayuda: "La ruta salió pero lleva rato sin registrar ninguna entrega.",
  },
  sin_salir: {
    corto: "Sin salir",
    pestana: "Alertas de salida",
    ayuda: "Pasó la hora de salida prevista y el vehículo no ha arrancado la ruta.",
  },
  jornada: {
    corto: "Jornada",
    pestana: "Alertas de tiempo extra",
    ayuda: "Lleva más horas en calle que las planificadas para la jornada.",
  },
  bateria: {
    corto: "Batería",
    pestana: "Alertas de batería",
    ayuda: "El móvil puede apagarse y dejar de registrar entregas.",
  },
  fallida: {
    corto: "No entregada",
    pestana: "Alertas de no entrega",
    ayuda: "Alguien tiene que decidir si se reprograma o se devuelve.",
  },
};

function duracion(min: number) {
  const h = Math.floor(min / 60);
  return h > 0 ? `${h} h ${min % 60} min` : `${min} min`;
}

const vehiculoDe = (a: Alerta) => a.placa ?? `R-${String(a.indice + 1).padStart(2, "0")}`;

type Filtros = {
  fecha: string;
  vehiculo: string;
  gestion: "pendientes" | "atendidas" | "todas";
  severidad: "" | Alerta["severidad"];
  conductor: string;
};

const sinFiltros = (fecha: string): Filtros => ({
  fecha, vehiculo: "", gestion: "pendientes", severidad: "", conductor: "",
});

const iguales = (a: Filtros, b: Filtros) =>
  a.fecha === b.fecha && a.vehiculo === b.vehiculo && a.gestion === b.gestion &&
  a.severidad === b.severidad && a.conductor === b.conductor;

export default function PanelAlertas({
  inicial,
  dia = null,
}: {
  inicial: Alerta[];
  dia?: string | null;
}) {
  const router = useRouter();
  const fechaVista = dia ?? hoy();

  const [lista, setLista] = useState(inicial);
  const [pestana, setPestana] = useState<Alerta["tipo"] | "todas">("todas");
  // Los filtros se eligen primero y se aplican con «Filtrar», como en la
  // referencia: `borrador` es lo que hay en los campos, `aplicados` lo que manda.
  const [aplicados, setAplicados] = useState<Filtros>(() => sinFiltros(fechaVista));
  const [borrador, setBorrador] = useState<Filtros>(() => sinFiltros(fechaVista));
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ clave: string; x: number; y: number } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const montado = useRef(true);

  useEffect(() => () => { montado.current = false; }, []);
  useEffect(() => setLista(inicial), [inicial]);
  // Al cambiar de día (por el filtro o con el botón de atrás) los campos
  // siguen a la fecha que se está viendo. Se ajusta durante el render, que es
  // lo que React pide para un estado que depende de una propiedad.
  const [fechaAnterior, setFechaAnterior] = useState(fechaVista);
  if (fechaAnterior !== fechaVista) {
    setFechaAnterior(fechaVista);
    setAplicados((f) => ({ ...f, fecha: fechaVista }));
    setBorrador((f) => ({ ...f, fecha: fechaVista }));
    setMarcadas(new Set());
  }

  const refrescar = useCallback(async () => {
    setCargando(true);
    try {
      const d = await traerAlertas(dia ?? undefined);
      if (montado.current) { setLista(d); setError(null); }
    } catch (e) {
      if (montado.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (montado.current) setCargando(false);
    }
  }, [dia]);

  // Un día pasado ya no cambia: el sondeo solo tiene sentido sobre hoy.
  useEffect(() => {
    if (dia) return;
    const t = setInterval(refrescar, 45000);
    return () => clearInterval(t);
  }, [dia, refrescar]);

  // El menú de una fila se cierra al tocar fuera, al desplazar o con Escape.
  useEffect(() => {
    if (!menu) return;
    const cerrar = () => setMenu(null);
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("click", cerrar);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("click", cerrar);
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("keydown", tecla);
    };
  }, [menu]);

  async function atender(quienes: Alerta[], valor: boolean) {
    if (!quienes.length) return;
    setOcupado(true);
    setError(null);
    try {
      for (const a of quienes) await atenderAlerta(a.clave, a.ruta_id, valor);
      await refrescar();
      if (montado.current) setMarcadas(new Set());
    } catch (e) {
      if (montado.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (montado.current) setOcupado(false);
    }
  }

  function filtrar() {
    setAplicados(borrador);
    setMarcadas(new Set());
    if (borrador.fecha && borrador.fecha !== fechaVista) {
      router.push(borrador.fecha === hoy() ? "/alertas" : `/alertas?fecha=${borrador.fecha}`);
    }
  }

  function limpiar() {
    const limpio = sinFiltros(hoy());
    setBorrador(limpio);
    setAplicados(limpio);
    setMarcadas(new Set());
    if (dia) router.push("/alertas");
  }

  const pendientes = useMemo(() => lista.filter((a) => !a.atendida), [lista]);

  const porTipo = useMemo(() => {
    const m = new Map<Alerta["tipo"], number>();
    pendientes.forEach((a) => m.set(a.tipo, (m.get(a.tipo) ?? 0) + 1));
    return m;
  }, [pendientes]);

  const vehiculos = useMemo(() => [...new Set(lista.map(vehiculoDe))].sort(), [lista]);
  const conductores = useMemo(
    () => [...new Set(lista.map((a) => a.conductor).filter((c): c is string => Boolean(c)))].sort(),
    [lista],
  );

  const visibles = useMemo(
    () =>
      lista.filter(
        (a) =>
          (pestana === "todas" || a.tipo === pestana) &&
          (aplicados.gestion === "todas" ||
            (aplicados.gestion === "atendidas" ? a.atendida : !a.atendida)) &&
          (!aplicados.vehiculo || vehiculoDe(a) === aplicados.vehiculo) &&
          (!aplicados.severidad || a.severidad === aplicados.severidad) &&
          (!aplicados.conductor || a.conductor === aplicados.conductor),
      ),
    [lista, pestana, aplicados],
  );

  const { pagina, setPagina, total, visibles: filas } = usePaginas(visibles, 15);

  const hayCambios = !iguales(borrador, aplicados);
  const hayFiltros = !iguales(aplicados, sinFiltros(hoy()));
  const elegidas = visibles.filter((a) => marcadas.has(a.clave));
  const porAtender = elegidas.filter((a) => !a.atendida);
  const paginaEntera = filas.length > 0 && filas.every((a) => marcadas.has(a.clave));

  function marcar(claves: string[], valor: boolean) {
    setMarcadas((antes) => {
      const s = new Set(antes);
      claves.forEach((c) => (valor ? s.add(c) : s.delete(c)));
      return s;
    });
  }

  function exportar() {
    descargar(
      `alertas-${fechaVista}.csv`,
      aCSV(
        ["Orden", "Vehículo", "Conductor", "Hora", "Alerta", "Detalle", "Minutos", "Atendida"],
        visibles.map((a) => [
          a.parada ?? "",
          vehiculoDe(a),
          a.conductor,
          a.desde ? hora(a.desde) : "",
          TIPOS[a.tipo].corto,
          a.detalle,
          a.minutos,
          a.atendida ? "sí" : "no",
        ]),
      ),
    );
  }

  const tipos = Object.keys(TIPOS) as Alerta["tipo"][];
  const delMenu = menu ? lista.find((a) => a.clave === menu.clave) : null;
  const campo = <K extends keyof Filtros>(k: K, v: Filtros[K]) =>
    setBorrador((f) => ({ ...f, [k]: v }));

  return (
    <div>
      <AccionesPagina>
        {porAtender.length > 0 && (
          <button onClick={() => atender(porAtender, true)} disabled={ocupado} className={BOTON_PRIMARIO}>
            {ocupado ? "…" : `Marcar atendidas (${porAtender.length})`}
          </button>
        )}
        <button onClick={exportar} disabled={!visibles.length} className={BOTON_SECUNDARIO}>
          <IconoDescarga /> Exportar
        </button>
      </AccionesPagina>

      {/* Pestañas: una tira gris con la activa en blanco. */}
      <div className="mb-4 inline-flex max-w-full overflow-x-auto [scrollbar-width:thin] rounded-[4px] border border-[#d9d9d9] bg-[#f0f0f0] shadow-[0_1px_2px_rgba(0,0,0,0.15)]">
        <Pestana activa={pestana === "todas"} onClick={() => setPestana("todas")} texto="Alertas" n={pendientes.length} />
        {tipos.map((t) => (
          <Pestana
            key={t}
            activa={pestana === t}
            onClick={() => setPestana(t)}
            texto={TIPOS[t].pestana}
            n={porTipo.get(t) ?? 0}
          />
        ))}
      </div>

      {/* Filtros: cinco campos iguales, «Filtrar» y dos botones cuadrados. */}
      <div className="flex flex-wrap items-center gap-2 pb-4">
        <div className="grid min-w-[280px] flex-1 grid-cols-2 gap-2 @3xl:grid-cols-5">
          <input
            type="date"
            aria-label="Fecha"
            value={borrador.fecha}
            onChange={(e) => campo("fecha", e.target.value || hoy())}
            className="num w-full min-w-0 outline-none"
          />
          <select
            aria-label="Vehículos"
            value={borrador.vehiculo}
            onChange={(e) => campo("vehiculo", e.target.value)}
            className="w-full min-w-0 outline-none"
          >
            <option value="">Vehículos</option>
            {vehiculos.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select
            aria-label="Gestión"
            value={borrador.gestion}
            onChange={(e) => campo("gestion", e.target.value as Filtros["gestion"])}
            className="w-full min-w-0 outline-none"
          >
            <option value="pendientes">Gestión: sin atender</option>
            <option value="atendidas">Gestión: atendidas</option>
            <option value="todas">Gestión: todas</option>
          </select>
          <select
            aria-label="Severidad"
            value={borrador.severidad}
            onChange={(e) => campo("severidad", e.target.value as Filtros["severidad"])}
            className="w-full min-w-0 outline-none"
          >
            <option value="">Severidad</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
          </select>
          <select
            aria-label="Conductor"
            value={borrador.conductor}
            onChange={(e) => campo("conductor", e.target.value)}
            className="w-full min-w-0 outline-none"
          >
            <option value="">Conductor</option>
            {conductores.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <button
          onClick={filtrar}
          disabled={!hayCambios}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-amber pl-4 pr-6 text-[16px] text-white transition hover:bg-amber-600 disabled:bg-[#e1e6ed] disabled:text-[#8fa0ba]"
        >
          <IconoEmbudo /> Filtrar
        </button>
        <button
          onClick={refrescar}
          disabled={cargando}
          title="Actualizar"
          aria-label="Actualizar"
          className="grid h-10 w-10 place-items-center rounded-[4px] border border-amber bg-surface text-amber transition hover:bg-amber-050 disabled:opacity-60"
        >
          <span className={cargando ? "animate-spin" : ""}><IconoRecargar /></span>
        </button>
        <button
          onClick={limpiar}
          disabled={!hayFiltros && !hayCambios}
          title="Quitar filtros"
          aria-label="Quitar filtros"
          className="grid h-10 w-10 place-items-center rounded-[4px] border border-bad bg-surface text-bad transition hover:bg-bad-bg disabled:border-transparent disabled:bg-[#e1e6ed] disabled:text-[#8fa0ba]"
        >
          <IconoEmbudoTachado />
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-[4px] border border-bad/30 bg-bad-bg px-3 py-2.5 text-[13px] text-bad">
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] table-fixed border-collapse">
          <colgroup>
            <col style={{ width: 66 }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "14%" }} />
            <col />
            <col style={{ width: 66 }} />
          </colgroup>
          <thead>
            <tr>
              <th className="border-r-2 border-white">
                <input
                  type="checkbox"
                  aria-label="Elegir todas las de esta página"
                  checked={paginaEntera}
                  onChange={(e) => marcar(filas.map((a) => a.clave), e.target.checked)}
                  className="h-[18px] w-[18px] cursor-pointer align-middle accent-amber"
                />
              </th>
              <th className="border-r-2 border-white text-left">Orden</th>
              <th className="border-r-2 border-white text-left">Vehículo</th>
              <th className="border-r-2 border-white text-left">Fecha</th>
              <th className="border-r-2 border-white text-left">Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filas.map((a) => (
              <Fila
                key={a.clave}
                alerta={a}
                dia={fechaVista}
                marcada={marcadas.has(a.clave)}
                onMarcar={(v) => marcar([a.clave], v)}
                onMenu={(x, y) => setMenu(menu?.clave === a.clave ? null : { clave: a.clave, x, y })}
              />
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={6} className="border-b border-line text-center" style={{ height: 90 }}>
                  {pendientes.length === 0 && aplicados.gestion === "pendientes"
                    ? dia
                      ? "Ese día no dejó ninguna alerta pendiente."
                      : "Sin alertas pendientes."
                    : "Ninguna alerta con esos filtros."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Paginacion pagina={pagina} total={total} onCambio={setPagina} />

      {menu && delMenu && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 min-w-[190px] rounded-[4px] border border-line bg-surface py-1 text-[14px] text-ink shadow-[0_4px_12px_rgba(0,0,0,0.18)]"
          style={{ left: menu.x, top: menu.y, transform: "translateX(-100%)" }}
        >
          <Link
            role="menuitem"
            href={`/torre?despacho=${delMenu.despacho_id}`}
            className="block px-3 py-2 hover:bg-canvas"
          >
            Ver en la torre
          </Link>
          {delMenu.parada_id && (
            <Link role="menuitem" href={`/paradas/${delMenu.parada_id}`} className="block px-3 py-2 hover:bg-canvas">
              Ver la orden
            </Link>
          )}
          <button
            role="menuitem"
            disabled={ocupado}
            onClick={() => { setMenu(null); atender([delMenu], !delMenu.atendida); }}
            className="block w-full px-3 py-2 text-left hover:bg-canvas disabled:opacity-50"
          >
            {delMenu.atendida ? "Reabrir" : "Marcar atendida"}
          </button>
        </div>
      )}
    </div>
  );
}

function Pestana({
  activa, onClick, texto, n,
}: {
  activa: boolean;
  onClick: () => void;
  texto: string;
  n: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-10 min-w-[120px] flex-none items-center justify-center gap-1.5 whitespace-nowrap px-[14px] text-[14px] transition ${
        activa
          ? "rounded-[4px] border-r border-[#d9d9d9] bg-surface text-[#2d2926]"
          : "text-[#aaaaaa] hover:text-[#707070]"
      }`}
    >
      {texto}
      {n > 0 && (
        <span className="num rounded-full bg-bad px-1.5 text-[11px] font-bold leading-[17px] text-white">
          {n}
        </span>
      )}
    </button>
  );
}

const CELDA = { height: 45, padding: "0 13px" } as const;

function Fila({
  alerta: a, dia, marcada, onMarcar, onMenu,
}: {
  alerta: Alerta;
  dia: string;
  marcada: boolean;
  onMarcar: (v: boolean) => void;
  onMenu: (x: number, y: number) => void;
}) {
  const t = TIPOS[a.tipo];
  const orden = a.parada ?? a.conductor ?? "Ruta";
  return (
    <tr className={marcada ? "bg-amber-050" : "bg-surface"}>
      <td className="border-b border-line text-center" style={CELDA}>
        <input
          type="checkbox"
          aria-label={`Elegir ${orden}`}
          checked={marcada}
          onChange={(e) => onMarcar(e.target.checked)}
          className="h-[18px] w-[18px] cursor-pointer align-middle accent-amber"
        />
      </td>
      <td className="truncate border-b border-line" style={CELDA} title={a.despacho ?? undefined}>
        {a.parada_id ? (
          <Link href={`/paradas/${a.parada_id}`} style={{ color: "inherit" }}>{orden}</Link>
        ) : (
          orden
        )}
      </td>
      <td className="num truncate border-b border-line" style={CELDA} title={a.conductor ?? undefined}>
        {vehiculoDe(a)}
      </td>
      <td className="num border-b border-line leading-[18px]" style={CELDA}>
        {a.desde ? hora(a.desde) : "—"}
        <div className="font-bold">{dia}</div>
      </td>
      <td className="border-b border-line" style={CELDA}>
        <div className="flex items-center whitespace-nowrap" title={t.ayuda}>
          <span
            className={`rounded-[3px] px-2 py-[2px] font-medium ${
              a.severidad === "alta" ? "text-bad" : "text-warn"
            }`}
          >
            {t.corto}
          </span>
          <span className="px-1 text-[#9aa0a6]">→</span>
          {a.atendida ? (
            <span className="rounded-[3px] px-2 py-[2px] font-medium text-ok">Atendida</span>
          ) : (
            <span className="truncate px-2">
              {a.detalle}
              {a.minutos != null && a.tipo !== "bateria" && (
                <> · <span className="num">{duracion(a.minutos)}</span></>
              )}
            </span>
          )}
        </div>
      </td>
      <td className="border-b border-line text-center" style={{ ...CELDA, padding: 0 }}>
        <button
          aria-label={`Acciones de ${orden}`}
          aria-haspopup="menu"
          onClick={(e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            onMenu(r.right, r.bottom + 2);
          }}
          className="grid h-9 w-9 place-items-center rounded-full text-[#39414d] transition hover:bg-canvas"
        >
          <svg width="4" height="16" viewBox="0 0 4 16" fill="currentColor" aria-hidden>
            <circle cx="2" cy="2" r="1.6" /><circle cx="2" cy="8" r="1.6" /><circle cx="2" cy="14" r="1.6" />
          </svg>
        </button>
      </td>
    </tr>
  );
}

function IconoDescarga() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 11 3.5 6.5h3V1h3v5.5h3L8 11ZM2 13h12v2H2v-2Z" />
    </svg>
  );
}

function IconoEmbudo() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M1 2h14l-5.5 6.5V14l-3-1.5v-4L1 2Z" />
    </svg>
  );
}

function IconoEmbudoTachado() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M2 3h14l-5.5 6.5V15l-3-1.5v-4L2 3Z" fill="currentColor" />
      <path d="M3 16 16 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconoRecargar() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 9a6 6 0 1 1-1.8-4.3" />
      <path d="M15 3v3.2h-3.2" />
    </svg>
  );
}
