"use client";

import { useMemo } from "react";
import type { Evento } from "@/app/acciones/datos";
import { hora } from "@/lib/horas";

/**
 * La ruta a lo largo del día, en una línea.
 *
 * Un punto por entrega, puesto en la hora en que se marcó, sobre una franja
 * que va de la primera a la última actividad del despacho. Las barras de
 * avance dicen *cuánto* se lleva hecho; esto dice *cuándo* se hizo, que es lo
 * que delata la ruta que salió tarde, la que estuvo dos horas sin marcar y la
 * que acumuló sus fallos al final.
 *
 * Todas las rutas comparten la misma escala horaria —la calcula la torre y la
 * pasa igual a todas— porque el valor está en comparar una con otra.
 */
const TONO: Record<string, string> = {
  entregado: "var(--color-ok)",
  parcial: "var(--color-warn)",
  reprogramado: "var(--color-warn)",
  fallido: "var(--color-bad)",
  pendiente: "var(--color-ink-3)",
};

const NOMBRE: Record<string, string> = {
  entregado: "entregada",
  parcial: "parcial",
  fallido: "no entregada",
  reprogramado: "reprogramada",
  pendiente: "devuelta a pendiente",
  ruta_iniciada: "salida del CD",
  ruta_terminada: "ruta terminada",
};

export type Escala = { desde: number; hasta: number };

/** La escala común: de la primera actividad a la última, redondeada a horas. */
export function escalaDe(eventos: Evento[]): Escala | null {
  if (!eventos.length) return null;

  const tiempos = eventos.map((e) => new Date(e.ocurrido_en).getTime());
  const hora = 60 * 60 * 1000;
  const desde = Math.floor(Math.min(...tiempos) / hora) * hora;
  const hasta = Math.ceil(Math.max(...tiempos) / hora) * hora;

  // Un despacho que acaba de empezar cabría en cero minutos y todos los
  // puntos se apilarían en el borde: se le da una hora de aire.
  return { desde, hasta: hasta > desde ? hasta : desde + hora };
}

const hhmm = (t: number) => hora(new Date(t));

/**
 * Las horas de referencia, una sola vez para todas las franjas.
 *
 * Se eligen para que nunca salgan más de ocho: una por hora en una jornada
 * corta, y de dos en dos, de tres en tres o de seis en seis según se alargue.
 * Un despacho que se arrastra hasta la madrugada no debe llenar la regla de
 * etiquetas superpuestas.
 */
const MAX_MARCAS = 8;

function horasDe(escala: Escala) {
  const hora = 60 * 60 * 1000;
  const horas = Math.max(1, Math.round((escala.hasta - escala.desde) / hora));
  const paso = [1, 2, 3, 4, 6, 12, 24].find((p) => horas / p <= MAX_MARCAS) ?? 24;

  const salida: number[] = [];
  for (let t = escala.desde; t <= escala.hasta; t += hora * paso) salida.push(t);
  return salida;
}

/**
 * La regla de horas que comparten todas las rutas.
 *
 * Va una sola vez debajo de la lista, no bajo cada franja: la escala es la
 * misma para todas y repetirla por fila sería ruido.
 */
export function ReglaHoraria({ escala }: { escala: Escala }) {
  const ancho = escala.hasta - escala.desde || 1;
  return (
    <div className="relative h-4">
      {horasDe(escala).map((t) => (
        <span
          key={t}
          className="num absolute -translate-x-1/2 text-[10px] text-ink-3"
          style={{ left: `${((t - escala.desde) / ancho) * 100}%` }}
        >
          {hhmm(t)}
        </span>
      ))}
    </div>
  );
}

export default function FranjaHoraria({
  eventos,
  escala,
  color,
  compacta = false,
}: {
  eventos: Evento[];
  escala: Escala;
  /** El color de la ruta, para la marca de salida. */
  color: string;
  compacta?: boolean;
}) {
  const ancho = escala.hasta - escala.desde || 1;
  const posicion = (iso: string) =>
    ((new Date(iso).getTime() - escala.desde) / ancho) * 100;

  const marcas = useMemo(() => horasDe(escala), [escala]);

  const salida = eventos.find((e) => e.tipo === "ruta_iniciada");
  const entregas = eventos.filter(
    (e) => e.tipo !== "ruta_iniciada" && e.tipo !== "ruta_terminada",
  );

  return (
    <div className="w-full">
      <div
        className={`relative w-full rounded-full bg-canvas ${compacta ? "h-2" : "h-3"}`}
      >
        {/* Separadores de hora, por debajo de los puntos */}
        {marcas.map((t) => (
          <span
            key={t}
            className="absolute top-0 h-full w-px bg-line"
            style={{ left: `${((t - escala.desde) / ancho) * 100}%` }}
          />
        ))}

        {/* La salida del centro de distribución */}
        {salida && (
          <span
            title={`Salió del CD a las ${hhmm(new Date(salida.ocurrido_en).getTime())}`}
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm ${
              compacta ? "h-3 w-[3px]" : "h-4 w-[3px]"
            }`}
            style={{ left: `${posicion(salida.ocurrido_en)}%`, background: color }}
          />
        )}

        {entregas.map((e) => (
          <span
            key={e.id}
            title={`${hhmm(new Date(e.ocurrido_en).getTime())} · ${
              e.parada ?? "Parada"
            } · ${NOMBRE[e.tipo] ?? e.tipo}`}
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-surface ${
              compacta ? "h-2 w-2" : "h-2.5 w-2.5"
            }`}
            style={{
              left: `${posicion(e.ocurrido_en)}%`,
              background: TONO[e.tipo] ?? "var(--color-ink-3)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
