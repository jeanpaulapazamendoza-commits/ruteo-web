"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  guardarEdicion, prepararCalculo,
  type DatosEditor, type OrdenEditor, type RutaEditor,
} from "@/app/acciones/editor";
import { AccionesPagina, BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/components/Paginacion";
import MenuFila, { type AccionFila } from "@/components/MenuFila";
import type { PuntoEditor, TrazoEditor } from "@/components/MapaEditor";
import { colorDe } from "@/lib/coloresRuta";
import { reordenar } from "@/lib/motor";

const MapaEditor = dynamic(() => import("@/components/MapaEditor"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-[13px] text-ink-3">Cargando mapa…</div>,
});

const BANDEJA = "bandeja";

type Columnas = Record<string, string[]>;

/** La cuenta del motor para un orden concreto de una ruta. */
type Calculo = {
  /** El orden para el que vale. Si la columna cambió, ya no sirve. */
  clave: string;
  etas: Record<string, string>;
  /** Lo que se guarda. En la calle no se toca: lo recorrido ya no se recalcula. */
  km: number | null;
  duracion: number | null;
  fin: string | null;
  /** Lo que se enseña: lo que queda por recorrer. */
  kmVista: number | null;
  tarde: string[];
  recta: boolean;
};

const clave = (ids: string[]) => ids.join(",");

function minutosEntre(desde: string, hasta: string) {
  const [h, m] = desde.split(":").map(Number);
  const [fh, fm] = hasta.split(":").map(Number);
  const d = fh * 60 + fm - (h * 60 + m);
  return d < 0 ? d + 24 * 60 : d;
}

/** Distancia a ojo entre dos puntos: sirve para comparar, no para medir. */
function lejos(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const x = (a.lon - b.lon) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot(a.lat - b.lat, x);
}

/** Le pide al motor las horas y los kilómetros del orden que hay en pantalla. */
async function calcular(despachoId: string, ids: string[], foto: Columnas) {
  const prep = await prepararCalculo(despachoId, ids.map((id) => ({ id, orden: foto[id] })));
  const res: Record<string, Calculo> = {};
  // De una en una: el motor atiende en fila y así no se le amontonan.
  for (const p of prep) {
    const k = clave(foto[p.id]);
    if (!p.cuerpo) {
      res[p.id] = {
        clave: k, etas: {}, km: p.enCalle ? null : 0, duracion: p.enCalle ? null : 0,
        fin: null, kmVista: 0, tarde: [], recta: false,
      };
      continue;
    }
    const plan = await reordenar(p.cuerpo);
    const d = plan.despues;
    res[p.id] = {
      clave: k, etas: d.etas, km: p.enCalle ? null : d.km,
      duracion: p.enCalle ? null : minutosEntre(p.salida, d.fin),
      fin: d.fin, kmVista: d.km, tarde: d.tarde, recta: plan.matriz === "recta",
    };
  }
  return res;
}

function estadoInicial(datos: DatosEditor) {
  const cols: Columnas = { [BANDEJA]: datos.bandeja.map((o) => o.id) };
  const fijas = new Set<string>();
  for (const r of datos.rutas) {
    cols[r.id] = r.pendientes.map((o) => o.id);
    for (const o of r.pendientes) if (o.fija) fijas.add(o.id);
  }
  return { cols, fijas };
}

/** La chincheta de «anclada». */
function Ancla() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
      <path d="M10.2 1.2 14.8 5.8l-1.1 1.1-.9-.2-2.6 2.6.3 2.7-1.2 1.2-2.9-2.9-3.9 3.9-.9-.9 3.9-3.9-2.9-2.9L3.8 5.3l2.7.3 2.6-2.6-.2-.9z" />
    </svg>
  );
}

const nombreRuta = (r: RutaEditor) => r.placa ?? `R-${String(r.indice + 1).padStart(2, "0")}`;

/**
 * El editor de rutas: el reparto del despacho en columnas, una por ruta.
 *
 * Las órdenes pendientes se arrastran dentro de su ruta —orden a mano—, a
 * otra ruta o a la bandeja. Cada ruta se puede volver a rutear con
 * «Optimizar», que respeta las órdenes ancladas. Nada se guarda hasta
 * «Guardar cambios»: mientras tanto el motor solo hace la cuenta de cómo
 * quedarían las horas y los kilómetros.
 *
 * Avisa, no prohíbe: si una ruta se pasa de carga o termina tarde lo dice en
 * rojo, pero quien decide es quien planifica.
 */
export default function EditorRutas({ datos }: { datos: DatosEditor }) {
  const router = useRouter();
  const despachoId = datos.despacho.id;

  const [origen, setOrigen] = useState(datos);
  const [inicial, setInicial] = useState(() => estadoInicial(datos));
  const [cols, setCols] = useState<Columnas>(inicial.cols);
  const [fijas, setFijas] = useState<Set<string>>(inicial.fijas);
  const [aMano, setAMano] = useState<Record<string, boolean>>({});
  const [calc, setCalc] = useState<Record<string, Calculo>>({});
  /** La clave del orden que el motor no pudo calcular, para no insistir. */
  const [fallo, setFallo] = useState<Record<string, string>>({});
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tono: "ok" | "bad"; texto: string } | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  const [conMapa, setConMapa] = useState(true);
  const [arrastrada, setArrastrada] = useState<string | null>(null);
  const [senal, setSenal] = useState<{ col: string; indice: number } | null>(null);
  const tablero = useRef<HTMLDivElement>(null);

  // Tras guardar la página se vuelve a leer: lo guardado pasa a ser el punto
  // de partida y el editor queda limpio.
  if (origen !== datos) {
    const nuevo = estadoInicial(datos);
    setOrigen(datos);
    setInicial(nuevo);
    setCols(nuevo.cols);
    setFijas(nuevo.fijas);
    setAMano({});
    setCalc({});
    setFallo({});
  }

  const ordenes = useMemo(() => {
    const m = new Map<string, OrdenEditor>();
    for (const o of datos.bandeja) m.set(o.id, o);
    for (const r of datos.rutas) for (const o of r.pendientes) m.set(o.id, o);
    return m;
  }, [datos]);

  const rutaDe = useMemo(() => new Map(datos.rutas.map((r) => [r.id, r])), [datos]);

  // La primera pendiente de una ruta en la calle: el conductor ya va hacia
  // ella y no se le cambia.
  const trabadas = useMemo(
    () => new Set(datos.rutas.filter((r) => r.en_calle && r.pendientes.length).map((r) => r.pendientes[0].id)),
    [datos],
  );

  const soloLectura = ["cerrado", "anulado"].includes(datos.despacho.estado);
  const abierta = (col: string) =>
    !soloLectura && (col === BANDEJA || !rutaDe.get(col)?.cerrada) && ocupada !== col && !guardando;

  const columnaDe = (id: string) => Object.keys(cols).find((k) => cols[k].includes(id));
  const ordenCambiado = (ruta: string) => clave(cols[ruta]) !== clave(inicial.cols[ruta]);
  const anclasCambiadas = (ruta: string) =>
    cols[ruta].some((id) => fijas.has(id) !== inicial.fijas.has(id));

  const tocadas = datos.rutas.filter((r) => ordenCambiado(r.id) || anclasCambiadas(r.id));
  const aBandeja = cols[BANDEJA].filter((id) => !inicial.cols[BANDEJA].includes(id));
  const movidas = [...ordenes.keys()].filter(
    (id) => !inicial.cols[columnaDe(id) ?? BANDEJA]?.includes(id),
  ).length;
  const hayCambios = tocadas.length > 0 || aBandeja.length > 0;

  // Las rutas con el orden cambiado y sin cuenta vigente: se calculan solas,
  // un momento después del último movimiento.
  const faltan = useMemo(
    () =>
      datos.rutas
        .filter((r) => {
          const k = clave(cols[r.id]);
          return !r.cerrada && k !== clave(inicial.cols[r.id]) && calc[r.id]?.clave !== k && fallo[r.id] !== k;
        })
        .map((r) => r.id),
    [datos, cols, inicial, calc, fallo],
  );

  useEffect(() => {
    if (!faltan.length || guardando) return;
    const t = setTimeout(async () => {
      try {
        const nuevo = await calcular(despachoId, faltan, cols);
        setCalc((c) => ({ ...c, ...nuevo }));
      } catch (e) {
        setFallo((f) => ({ ...f, ...Object.fromEntries(faltan.map((id) => [id, clave(cols[id])])) }));
        setAviso({ tono: "bad", texto: e instanceof Error ? e.message : String(e) });
      }
    }, 700);
    return () => clearTimeout(t);
  }, [faltan, cols, despachoId, guardando]);

  // Cerrar la pestaña con cambios sin guardar pide confirmación.
  useEffect(() => {
    if (!hayCambios) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [hayCambios]);

  /** El puesto donde una orden estorba menos en una columna, a ojo. */
  function mejorPuesto(col: string, id: string) {
    const lista = cols[col].filter((x) => x !== id);
    if (col === BANDEJA || !lista.length) return lista.length;
    const o = ordenes.get(id)!;
    const r = rutaDe.get(col)!;
    const base = r.base_lat != null && r.base_lon != null ? { lat: r.base_lat, lon: r.base_lon } : null;
    const pts = lista.map((x) => ordenes.get(x)!);
    const min = trabadas.has(lista[0]) ? 1 : 0;
    let mejor = lista.length;
    let costo = Infinity;
    for (let i = min; i <= lista.length; i++) {
      const antes = i === 0 ? base : pts[i - 1];
      const despues = i === lista.length ? base : pts[i];
      const c =
        (antes ? lejos(antes, o) : 0) + (despues ? lejos(o, despues) : 0) -
        (antes && despues ? lejos(antes, despues) : 0);
      if (c < costo) { costo = c; mejor = i; }
    }
    return mejor;
  }

  /** Mueve una orden a una columna y un puesto. Sin puesto, donde menos estorbe. */
  function mover(id: string, a: string, indice?: number) {
    const de = columnaDe(id);
    if (!de || trabadas.has(id) || !abierta(de) || !abierta(a)) return;
    const sinElla = cols[de].filter((x) => x !== id);
    const destino = de === a ? sinElla : [...cols[a]];
    let i = indice ?? mejorPuesto(a, id);
    // Al quitarla de su sitio, lo que venía detrás sube un puesto.
    if (indice != null && de === a && cols[de].indexOf(id) < indice) i -= 1;
    const min = destino.length && trabadas.has(destino[0]) ? 1 : 0;
    i = Math.max(min, Math.min(i, destino.length));
    destino.splice(i, 0, id);
    if (de === a && clave(destino) === clave(cols[de])) return;
    setCols({ ...cols, [de]: sinElla, [a]: destino });
    setAMano({ ...aMano, [de]: true, [a]: true });
    if (a === BANDEJA && fijas.has(id)) {
      const f = new Set(fijas);
      f.delete(id);
      setFijas(f);
    }
    setElegida(id);
    setAviso(null);
  }

  function anclar(id: string) {
    const f = new Set(fijas);
    if (f.has(id)) f.delete(id);
    else f.add(id);
    setFijas(f);
  }

  async function optimizar(r: RutaEditor) {
    const orden = cols[r.id];
    setOcupada(r.id);
    setAviso(null);
    try {
      const [p] = await prepararCalculo(despachoId, [{ id: r.id, orden }], {
        optimizar: true,
        ancladas: orden.filter((id) => fijas.has(id)),
      });
      if (!p?.cuerpo) return;
      const plan = await reordenar(p.cuerpo);
      const d = plan.despues;
      setCols((c) => ({ ...c, [r.id]: d.orden }));
      setCalc((c) => ({
        ...c,
        [r.id]: {
          clave: clave(d.orden), etas: d.etas, km: p.enCalle ? null : d.km,
          duracion: p.enCalle ? null : minutosEntre(p.salida, d.fin),
          fin: d.fin, kmVista: d.km, tarde: d.tarde, recta: plan.matriz === "recta",
        },
      }));
      setAMano((m) => ({ ...m, [r.id]: false }));
      setAviso({
        tono: "ok",
        texto: plan.cambio
          ? `${nombreRuta(r)}: de ${plan.antes.km.toFixed(1)} a ${d.km.toFixed(1)} km. Guarda para aplicarlo.`
          : `${nombreRuta(r)}: el orden que tenía ya era el mejor.`,
      });
    } catch (e) {
      setAviso({ tono: "bad", texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setOcupada(null);
    }
  }

  function descartar() {
    setCols(inicial.cols);
    setFijas(inicial.fijas);
    setAMano({});
    setAviso(null);
  }

  async function guardar() {
    setGuardando(true);
    setAviso(null);
    try {
      const sinCuenta = tocadas
        .filter((r) => ordenCambiado(r.id) && calc[r.id]?.clave !== clave(cols[r.id]))
        .map((r) => r.id);
      const c = sinCuenta.length ? { ...calc, ...(await calcular(despachoId, sinCuenta, cols)) } : calc;
      const n = await guardarEdicion({
        despacho_id: despachoId,
        rutas: tocadas.map((r) => {
          const k = ordenCambiado(r.id) ? c[r.id] : null;
          return {
            ruta_id: r.id,
            orden: cols[r.id],
            etas: k?.etas ?? {},
            km: k?.km ?? null,
            duracion_min: k?.duracion ?? null,
            fin: k?.fin ?? null,
            personalizada: k ? (aMano[r.id] ?? true) : null,
          };
        }),
        bandeja: aBandeja,
        fijas: [...fijas].filter((id) => columnaDe(id) !== BANDEJA),
      });
      setAviso({
        tono: "ok",
        texto: n > 0
          ? `Guardado. ${n} ${n === 1 ? "orden cambió" : "órdenes cambiaron"} de ruta.`
          : "Guardado.",
      });
      router.refresh();
    } catch (e) {
      setAviso({ tono: "bad", texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setGuardando(false);
    }
  }

  // Elegir en el mapa lleva la tarjeta a la vista.
  function elegirDesdeMapa(id: string) {
    setElegida(id);
    tablero.current?.querySelector(`[data-orden="${id}"]`)?.scrollIntoView({
      behavior: "smooth", block: "center", inline: "center",
    });
  }

  const rotulo = (o: OrdenEditor) => `${o.codigo ?? ""} ${o.nombre ?? ""}`.trim() || "Orden";

  const trazos: TrazoEditor[] = datos.rutas.map((r) => ({
    id: r.id,
    nombre: nombreRuta(r),
    color: colorDe(r.indice),
    base: r.base_lat != null && r.base_lon != null && !r.en_calle ? [r.base_lat, r.base_lon] : null,
    puntos: cols[r.id].map((id, i): PuntoEditor => {
      const o = ordenes.get(id)!;
      return { id, n: r.gestionadas + i + 1, lat: o.lat, lon: o.lon, rotulo: rotulo(o) };
    }),
  }));
  const puntosBandeja: PuntoEditor[] = cols[BANDEJA].map((id) => {
    const o = ordenes.get(id)!;
    return { id, n: null, lat: o.lat, lon: o.lon, rotulo: rotulo(o) };
  });

  const destinos = datos.rutas.filter((r) => !r.cerrada);

  function accionesDe(id: string, col: string, i: number): AccionFila[] {
    const lista = cols[col];
    const min = lista.length && trabadas.has(lista[0]) ? 1 : 0;
    const enRuta = col !== BANDEJA;
    return [
      ...(enRuta
        ? [
            { texto: fijas.has(id) ? "Quitar ancla" : "Anclar en este puesto", onClick: () => anclar(id) },
            { texto: "Subir", onClick: () => mover(id, col, i - 1), noPorque: i <= min ? "Ya es la primera que se puede mover" : null },
            { texto: "Bajar", onClick: () => mover(id, col, i + 2), noPorque: i >= lista.length - 1 ? "Ya es la última" : null },
            { texto: "Poner primera", onClick: () => mover(id, col, min), noPorque: i <= min ? "Ya es la primera que se puede mover" : null },
            { texto: "Poner última", onClick: () => mover(id, col, lista.length), noPorque: i >= lista.length - 1 ? "Ya es la última" : null },
          ]
        : []),
      ...destinos
        .filter((r) => r.id !== col)
        .map((r) => ({ texto: `Pasar a ${nombreRuta(r)}`, onClick: () => mover(id, r.id) })),
      ...(enRuta ? [{ texto: "Devolver a la bandeja", onClick: () => mover(id, BANDEJA), peligro: true }] : []),
    ];
  }

  // Tarjetas y columnas se pintan con funciones, no con componentes: un
  // componente declarado aquí dentro se volvería a montar en cada repintado,
  // y el navegador corta el arrastre si le quitan el nodo que se arrastra.
  function tarjeta(id: string, col: string, i: number, n: number | null) {
    const o = ordenes.get(id)!;
    const r = rutaDe.get(col);
    const trabada = trabadas.has(id);
    const movible = !trabada && abierta(col);
    const cambiada = r ? ordenCambiado(col) : false;
    const cuenta = r && calc[col]?.clave === clave(cols[col]) ? calc[col] : null;
    const eta = !r ? null : cambiada ? (cuenta?.etas[id] ?? null) : o.eta;
    const tarde = cuenta
      ? cuenta.tarde.includes(id)
      : Boolean(eta && o.ventana_fin && eta > o.ventana_fin);
    const llegada = !inicial.cols[col]?.includes(id);
    return (
      <Fragment key={id}>
        {senal?.col === col && senal.indice === i && <div className="h-[3px] shrink-0 rounded-full bg-amber" />}
        <div
          data-orden={id}
          draggable={movible}
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", id);
            e.dataTransfer.effectAllowed = "move";
            setArrastrada(id);
          }}
          onDragEnd={() => { setArrastrada(null); setSenal(null); }}
          onDragOver={(e) => {
            if (!arrastrada || !abierta(col)) return;
            e.preventDefault();
            e.stopPropagation();
            const caja = e.currentTarget.getBoundingClientRect();
            const indice = e.clientY < caja.top + caja.height / 2 ? i : i + 1;
            if (senal?.col !== col || senal.indice !== indice) setSenal({ col, indice });
          }}
          onClick={() => setElegida(id)}
          className={`flex shrink-0 items-start gap-2 rounded-[8px] border bg-surface px-2.5 py-2 text-[12.5px] leading-snug transition ${
            id === elegida ? "border-amber ring-2 ring-amber/30" : "border-line"
          } ${arrastrada === id ? "opacity-40" : ""} ${movible ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
        >
          <span
            className="num mt-px grid h-[22px] min-w-[22px] shrink-0 place-items-center rounded-full px-1 text-[11px] font-bold text-white"
            style={{ background: r ? colorDe(r.indice) : "#8A94A0" }}
          >
            {n ?? "·"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 font-bold text-ink" title={rotulo(o)}>{rotulo(o)}</div>
            <div className="truncate text-ink-3">
              {[o.distrito, `${o.bultos} ${o.bultos === 1 ? "bulto" : "bultos"}`,
                o.ventana_ini ? `${o.ventana_ini}–${o.ventana_fin}` : null]
                .filter(Boolean).join(" · ")}
            </div>
            {(r || llegada) && (
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px]">
                {r && (
                  <span className={`num ${tarde ? "font-bold text-bad" : "text-ink-2"}`}>
                    {eta ? `Llega ${eta}` : cambiada ? "Calculando…" : "Sin hora"}
                    {tarde && " · fuera de ventana"}
                  </span>
                )}
                {trabada && <span className="text-ink-3">en camino</span>}
                {llegada && <span className="font-bold text-amber">movida</span>}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {r && !trabada && (
              <button
                onClick={(e) => { e.stopPropagation(); if (abierta(col)) anclar(id); }}
                aria-pressed={fijas.has(id)}
                aria-label={fijas.has(id) ? `Quitar ancla de ${rotulo(o)}` : `Anclar ${rotulo(o)}`}
                title={fijas.has(id) ? "Anclada: conserva su puesto al optimizar" : "Anclar en este puesto"}
                className={`grid h-6 w-6 place-items-center rounded-full text-[12px] transition ${
                  fijas.has(id) ? "bg-amber text-white" : "text-ink-3 hover:bg-canvas hover:text-ink"
                }`}
              >
                <Ancla />
              </button>
            )}
            {movible && <MenuFila rotulo={`Acciones de ${rotulo(o)}`} acciones={accionesDe(id, col, i)} />}
          </div>
        </div>
      </Fragment>
    );
  }

  function columna(col: string, r?: RutaEditor) {
    const lista = cols[col];
    const bultos = lista.reduce((s, id) => s + (ordenes.get(id)?.bultos ?? 0), 0);
    const paradas = (r?.gestionadas ?? 0) + lista.length;
    const cambiada = r ? ordenCambiado(col) : false;
    const cuenta = r && calc[col]?.clave === clave(lista) ? calc[col] : null;
    const fin = !r ? null : cambiada ? (cuenta?.fin ?? null) : r.fin;
    const km = !r ? null : cambiada ? (cuenta?.kmVista ?? null) : r.km;
    const tardias = r
      ? lista.filter((id) => {
          if (cuenta) return cuenta.tarde.includes(id);
          const o = ordenes.get(id)!;
          return !cambiada && Boolean(o.eta && o.ventana_fin && o.eta > o.ventana_fin);
        }).length
      : 0;
    const pasaCarga = r?.capacidad != null && bultos > r.capacidad;
    const pasaParadas = r?.max_paradas != null && paradas > r.max_paradas;
    const pasaJornada = Boolean(fin && datos.despacho.fin_jornada && fin > datos.despacho.fin_jornada);
    const sinCuenta = cambiada && !cuenta;
    const libres = lista.filter((id) => !trabadas.has(id) && !fijas.has(id)).length;

    return (
      <section
        key={col}
        aria-label={r ? `Ruta ${nombreRuta(r)}` : "Sin asignar"}
        onDragOver={(e) => {
          if (!arrastrada || !abierta(col)) return;
          e.preventDefault();
          if (senal?.col !== col || senal.indice !== lista.length) setSenal({ col, indice: lista.length });
        }}
        onDrop={(e) => {
          e.preventDefault();
          const id = e.dataTransfer.getData("text/plain") || arrastrada;
          const s = senal;
          setArrastrada(null);
          setSenal(null);
          if (id && ordenes.has(id)) mover(id, col, s?.col === col ? s.indice : lista.length);
        }}
        className={`flex shrink-0 flex-col overflow-hidden rounded-[10px] border bg-canvas transition ${
          // La bandeja vacía solo es un sitio donde soltar: no necesita el
          // ancho de una ruta.
          !r && !lista.length ? "w-[168px]" : "w-[276px]"
        } ${
          senal?.col === col ? "border-amber" : "border-line"
        } ${ocupada === col ? "opacity-60" : ""}`}
      >
        <div
          className="shrink-0 bg-surface px-3 py-2.5"
          style={{ borderTop: `3px solid ${r ? colorDe(r.indice) : "#8A94A0"}` }}
        >
          <div className="flex items-center gap-2">
            <b className="truncate text-[14px] text-ink">{r ? nombreRuta(r) : "Sin asignar"}</b>
            {r && !r.cerrada && !soloLectura && (
              <button
                onClick={() => optimizar(r)}
                disabled={libres < 2 || ocupada !== null || guardando}
                title={libres < 2 ? "No hay órdenes que reordenar" : "Vuelve a rutear esta ruta. Las ancladas conservan su puesto."}
                className="ml-auto h-7 shrink-0 rounded-full border border-line-strong bg-surface px-2.5 text-[12px] font-bold text-ink transition hover:bg-canvas disabled:opacity-40"
              >
                {ocupada === col ? "Ruteando…" : "Optimizar"}
              </button>
            )}
          </div>
          {r ? (
            <>
              {/* Las etiquetas van en su línea: junto al nombre no caben con
                  una placa larga y el nombre es lo que no se puede cortar. */}
              {(r.cerrada || r.en_calle || cambiada) && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {r.cerrada && <span className="rounded-full bg-canvas px-2 text-[11.5px] font-bold text-ink-3">Cerrada</span>}
                  {r.en_calle && !r.cerrada && <span className="rounded-full bg-ok-bg px-2 text-[11.5px] font-bold text-ok">En ruta</span>}
                  {cambiada && <span className="rounded-full bg-amber/10 px-2 text-[11.5px] font-bold text-amber">Cambiada</span>}
                </div>
              )}
              <div className="mt-1 truncate text-[12px] text-ink-3">
                {[r.conductor ?? "Sin conductor", r.base_nombre, r.salida ? `sale ${r.salida}` : null]
                  .filter(Boolean).join(" · ")}
              </div>
              <div className="num mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-ink-2">
                <span className={pasaParadas ? "font-bold text-bad" : ""}>
                  {paradas}{r.max_paradas != null ? `/${r.max_paradas}` : ""} paradas
                </span>
                <span className={pasaCarga ? "font-bold text-bad" : ""}>
                  {bultos}{r.capacidad != null ? `/${r.capacidad}` : ""} bultos
                </span>
                <span>{sinCuenta ? "… km" : km != null ? `${km.toFixed(1)} km` : "— km"}</span>
                <span className={pasaJornada ? "font-bold text-bad" : ""}>
                  {sinCuenta ? "fin …" : fin ? `fin ${fin}` : "fin —"}
                </span>
              </div>
              {(pasaCarga || pasaParadas || pasaJornada || tardias > 0 || cuenta?.recta || fallo[col] === clave(lista)) && (
                <ul className="mt-1.5 space-y-0.5 text-[12px] font-medium text-bad">
                  {pasaCarga && <li>Lleva {bultos - r.capacidad!} bultos más de los que le caben.</li>}
                  {pasaParadas && <li>Pasa el máximo de paradas del vehículo.</li>}
                  {pasaJornada && <li>Termina después de la jornada ({datos.despacho.fin_jornada}).</li>}
                  {tardias > 0 && <li>{tardias} {tardias === 1 ? "orden llega" : "órdenes llegan"} fuera de su ventana.</li>}
                  {cuenta?.recta && <li className="text-warn">Calculado en línea recta: el servidor de calles no respondió.</li>}
                  {fallo[col] === clave(lista) && (
                    <li>
                      No se pudo calcular.{" "}
                      <button
                        className="font-bold underline"
                        onClick={() => setFallo((f) => { const g = { ...f }; delete g[col]; return g; })}
                      >
                        Reintentar
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </>
          ) : (
            <div className="mt-0.5 text-[12px] text-ink-3">
              {lista.length
                ? `${lista.length} ${lista.length === 1 ? "orden" : "órdenes"} · ${bultos} bultos. Arrástralas a una ruta.`
                : "Suelta aquí lo que salga de una ruta."}
            </div>
          )}
        </div>

        <div className="flex min-h-[120px] flex-1 flex-col gap-1.5 overflow-y-auto p-2">
          {r && r.gestionadas > 0 && (
            <div className="shrink-0 rounded-[8px] border border-dashed border-line px-2.5 py-1.5 text-[12px] text-ink-3">
              {r.gestionadas} {r.gestionadas === 1 ? "orden ya gestionada" : "órdenes ya gestionadas"}: no se mueven.
            </div>
          )}
          {lista.map((id, i) => tarjeta(id, col, i, r ? r.gestionadas + i + 1 : null))}
          {senal?.col === col && senal.indice === lista.length && (
            <div className="h-[3px] shrink-0 rounded-full bg-amber" />
          )}
          {!lista.length && (
            <div className="grid flex-1 place-items-center px-3 text-center text-[12.5px] text-ink-3">
              {r ? "Sin órdenes pendientes. Suelta aquí las que quieras darle." : "Vacía"}
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <AccionesPagina>
        <button onClick={() => setConMapa((v) => !v)} className={BOTON_SECUNDARIO} aria-pressed={conMapa}>
          {conMapa ? "Ocultar mapa" : "Ver mapa"}
        </button>
        {!soloLectura && (
          <>
            <button onClick={descartar} disabled={!hayCambios || guardando} className={BOTON_SECUNDARIO}>
              Descartar
            </button>
            <button onClick={guardar} disabled={!hayCambios || guardando || ocupada !== null} className={BOTON_PRIMARIO}>
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
          </>
        )}
      </AccionesPagina>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
        {soloLectura ? (
          <span>Este despacho está cerrado: sus rutas ya no se pueden cambiar.</span>
        ) : hayCambios ? (
          <span>
            <b className="text-ink">Cambios sin guardar:</b>{" "}
            {[
              movidas > 0 ? `${movidas} ${movidas === 1 ? "orden movida" : "órdenes movidas"}` : null,
              `${tocadas.length} ${tocadas.length === 1 ? "ruta cambiada" : "rutas cambiadas"}`,
            ].filter(Boolean).join(" · ")}
          </span>
        ) : (
          <span>
            Arrastra una orden para cambiarla de puesto o de ruta. <b className="text-ink">Optimizar</b> vuelve
            a rutear una ruta; las órdenes ancladas conservan su puesto.
          </span>
        )}
        {aviso && (
          <span role="status" className={`font-bold ${aviso.tono === "ok" ? "text-ok" : "text-bad"}`}>
            {aviso.texto}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div
          ref={tablero}
          className="flex h-[calc(100vh-230px)] min-h-[420px] min-w-0 flex-1 items-stretch gap-3 overflow-x-auto pb-2"
        >
          {columna(BANDEJA)}
          {datos.rutas.map((r) => columna(r.id, r))}
        </div>
        {conMapa && (
          <div className="h-[320px] shrink-0 overflow-hidden rounded-[10px] border border-line lg:h-[calc(100vh-230px)] lg:min-h-[420px] lg:w-[36%]">
            <MapaEditor trazos={trazos} bandeja={puntosBandeja} elegida={elegida} onElegir={elegirDesdeMapa} />
          </div>
        )}
      </div>
    </div>
  );
}
