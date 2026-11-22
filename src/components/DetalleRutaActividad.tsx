"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  fichaParada,
  geometriaDeRuta,
  paradasDeRuta,
  type ParadaConDesvio,
  type ParadaFicha,
  type RutaEnCalle,
} from "@/app/acciones/datos";
import { hora } from "@/lib/horas";

const MapaSeguimiento = dynamic(() => import("@/components/MapaSeguimiento"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-[11px]" style={{ color: "#a8a8a8" }}>
      Cargando mapa…
    </div>
  ),
});

const C = {
  texto: "#676a6c",
  tenue: "#a8a8a8",
  verde: "#1ab394",
  turquesa: "#23c6c8",
  naranja: "#f8ac59",
  rojo: "#ed5565",
  gris: "#b5b8bb",
  fondo: "#f3f3f4",
};

const ESTADO: Record<string, { texto: string; color: string }> = {
  entregado: { texto: "Entregado", color: C.verde },
  parcial: { texto: "Parcial", color: C.naranja },
  reprogramado: { texto: "Reprogramado", color: C.naranja },
  fallido: { texto: "No entregado", color: C.rojo },
  pendiente: { texto: "Pendiente", color: C.gris },
};

const estadoDe = (e: string) => ESTADO[e] ?? { texto: e, color: C.gris };

/** «14:11:00» de la base → «14:11». */
const corta = (t: string | null) => (t ? t.slice(0, 5) : "—");

/**
 * Lo que se abre al desplegar un vehículo en Actividad: sus órdenes en el
 * orden de la ruta, la ficha de la que se elija y el mapa.
 *
 * Es el panel de tres columnas de la pantalla de referencia. Sin él, la
 * tarjeta decía cuántas órdenes iban bien y cuántas mal, pero no cuáles.
 */
export default function DetalleRutaActividad({
  ruta: r,
  elegida,
  onElegir,
}: {
  ruta: RutaEnCalle;
  /** La orden elegida desde fuera: un clic en su círculo de la línea del día. */
  elegida: string | null;
  onElegir: (id: string) => void;
}) {
  const [paradas, setParadas] = useState<ParadaConDesvio[] | null>(null);
  const [geometria, setGeometria] = useState<number[][] | null>(null);
  const [ficha, setFicha] = useState<ParadaFicha | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lista = useRef<HTMLDivElement>(null);

  // `gestionadas` en la clave: cuando el conductor marca otra parada, la
  // lista se vuelve a pedir sin tener que plegar y desplegar.
  useEffect(() => {
    let vivo = true;
    Promise.all([paradasDeRuta(r.ruta_id), geometriaDeRuta(r.ruta_id)])
      .then(([p, g]) => {
        if (!vivo) return;
        setParadas(p);
        setGeometria(g);
        setError(null);
      })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : String(e)));
    return () => { vivo = false; };
  }, [r.ruta_id, r.gestionadas]);

  const activa = elegida ?? paradas?.[0]?.id ?? null;

  useEffect(() => {
    if (!activa) return;
    let vivo = true;
    fichaParada(activa)
      .then((f) => vivo && setFicha(f ?? null))
      .catch(() => vivo && setFicha(null));
    return () => { vivo = false; };
  }, [activa, r.gestionadas]);

  // La elegida desde el mapa o desde la línea del día puede quedar fuera de
  // la vista de la lista.
  useEffect(() => {
    if (!elegida) return;
    lista.current
      ?.querySelector(`[data-parada="${elegida}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [elegida, paradas]);

  if (error) {
    return (
      <p className="border-t px-4 py-3 text-[12px]" style={{ borderColor: C.turquesa, color: C.rojo }}>
        No se pudieron leer las órdenes de esta ruta: {error}
      </p>
    );
  }

  return (
    <div
      className="grid grid-cols-1 gap-[10px] border-t p-[10px] @3xl:grid-cols-[minmax(250px,300px)_minmax(170px,220px)_1fr]"
      style={{ borderColor: C.turquesa, color: C.texto }}
    >
      {/* Las órdenes, en el orden de la ruta */}
      <div ref={lista} className="max-h-[300px] overflow-y-auto pr-[6px]">
        {paradas === null ? (
          <p className="p-3 text-[11px]" style={{ color: C.tenue }}>Cargando órdenes…</p>
        ) : paradas.length === 0 ? (
          <p className="p-3 text-[11px]" style={{ color: C.tenue }}>Esta ruta no tiene órdenes.</p>
        ) : (
          <div className="relative ml-[7px] border-l" style={{ borderColor: C.turquesa }}>
            {paradas.map((p) => {
              const e = estadoDe(p.estado_entrega);
              const es = p.id === activa;
              return (
                <button
                  key={p.id}
                  type="button"
                  data-parada={p.id}
                  onClick={() => onElegir(p.id)}
                  className="relative block w-full pb-[8px] pl-[18px] text-left"
                >
                  <span
                    className="absolute -left-[7px] top-[2px] grid h-[13px] w-[13px] place-items-center rounded-full border bg-white"
                    style={{ borderColor: C.turquesa }}
                  >
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: e.color }} />
                  </span>
                  <span className="flex justify-between gap-2 text-[11px]">
                    <span>
                      <b>Hora de llegada:</b>{" "}
                      <span className="num">{p.hora_entrega ? hora(p.hora_entrega) : "—"}</span>
                    </span>
                    <span>
                      <b>Hora estimada:</b> <span className="num">{corta(p.eta)}</span>
                    </span>
                  </span>
                  <span
                    className="mt-[4px] flex items-start gap-2 border bg-white px-[8px] py-[6px]"
                    style={{
                      borderColor: es ? C.turquesa : "#e7eaec",
                      borderLeftWidth: es ? 3 : 1,
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="num block truncate text-[13px] font-bold" style={{ color: "#3f4347" }}>
                        {p.codigo ?? `Parada ${p.orden}`}
                      </span>
                      <span className="block truncate text-[11px]">{p.nombre ?? "—"}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span
                        className="inline-block rounded-[2px] px-[6px] py-[2px] text-[11px] font-bold text-white"
                        style={{ background: e.color }}
                      >
                        {e.texto}
                      </span>
                      <span className="mt-[2px] block max-w-[110px] truncate text-[11px]" style={{ color: e.color }}>
                        {p.subestado ?? p.motivo ?? (p.estado_entrega === "pendiente" ? "" : e.texto)}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* La ficha de la orden elegida */}
      <div className="max-h-[300px] overflow-y-auto pr-[6px] text-[11px]">
        <div className="mb-[8px] text-[12px] font-bold" style={{ color: "#3f4347" }}>
          DETALLE
        </div>
        {!ficha || ficha.id !== activa ? (
          <p style={{ color: C.tenue }}>{activa ? "Cargando…" : "Elige una orden."}</p>
        ) : (
          <>
            <Dato rotulo="Nombre">
              {ficha.cliente_id ? (
                <Link href={`/clientes/${ficha.cliente_id}`} className="underline" style={{ color: C.naranja }}>
                  {ficha.nombre ?? "—"}
                </Link>
              ) : (
                ficha.nombre ?? "—"
              )}
            </Dato>
            <Dato rotulo="Código">{ficha.codigo}</Dato>
            <Dato rotulo="Teléfono">{ficha.cliente_telefono}</Dato>
            <Dato rotulo="Dirección">{ficha.cliente_direccion}</Dato>
            <Dato rotulo="Distrito">{ficha.distrito}</Dato>
            <Dato rotulo="Bultos">
              {ficha.bultos_entregados != null
                ? `${ficha.bultos_entregados} de ${ficha.bultos}`
                : ficha.bultos}
            </Dato>
            <Dato rotulo="Ventana horaria">
              {ficha.ventana_ini || ficha.ventana_fin
                ? `${corta(ficha.ventana_ini)} – ${corta(ficha.ventana_fin)}`
                : null}
            </Dato>
            <Dato rotulo="Núm. intentos">{ficha.intentos}</Dato>
            <Dato rotulo="Último estado">
              <span style={{ color: estadoDe(ficha.estado_entrega).color }}>
                {estadoDe(ficha.estado_entrega).texto}
                {ficha.subestado ? ` · ${ficha.subestado}` : ""}
              </span>
            </Dato>
            <Dato rotulo="Motivo">{ficha.motivo}</Dato>
            <Dato rotulo="Recibe">{ficha.recibe}</Dato>
            <Dato rotulo="Observaciones">{ficha.observaciones}</Dato>
            {/* Las columnas propias del archivo del cliente, con su nombre. */}
            {Object.entries(ficha.extra ?? {}).map(([k, v]) => (
              <Dato key={k} rotulo={k.toUpperCase()}>{v}</Dato>
            ))}
            <Link
              href={`/paradas/${ficha.id}`}
              className="mt-[4px] inline-block font-bold underline"
              style={{ color: "#337ab7" }}
            >
              Ver detalles →
            </Link>
          </>
        )}
      </div>

      {/* El mapa de la ruta */}
      <div className="h-[300px] overflow-hidden border" style={{ borderColor: "#e7eaec" }}>
        {paradas && paradas.length > 0 ? (
          <MapaSeguimiento
            key={r.ruta_id}
            paradas={paradas.map((p) => ({
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
            colorRuta="#337ab7"
            cd={r.cd_lat != null && r.cd_lon != null ? { lat: r.cd_lat, lon: r.cd_lon } : null}
            siguienteId={paradas.find((p) => p.estado_entrega === "pendiente")?.id ?? null}
            onClicParada={onElegir}
          />
        ) : (
          <div className="grid h-full place-items-center text-[11px]" style={{ color: C.tenue }}>
            {paradas === null ? "Cargando mapa…" : "Sin puntos que mostrar"}
          </div>
        )}
      </div>
    </div>
  );
}

/** Un dato de la ficha. Lo que viene vacío no ocupa sitio. */
function Dato({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="mb-[8px]">
      <div className="font-bold" style={{ color: "#3f4347" }}>{rotulo}</div>
      <div className="break-words">{children}</div>
    </div>
  );
}
