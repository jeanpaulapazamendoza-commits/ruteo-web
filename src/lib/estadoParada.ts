import type { EstadoEntrega } from "@/lib/entregas";

/**
 * Cómo se ve cada estado de parada en la app del conductor.
 *
 * Una sola fuente para el raíl de la lista, el glifo, el fondo y el color del
 * pin del mapa. Antes el verde del mapa y el verde de la pastilla eran dos
 * verdes distintos, y el conductor tenía que traducir de uno a otro.
 *
 * El estado nunca se comunica solo con color: van juntos raíl sólido, fondo
 * pálido, glifo y texto en tinta normal. A las dos de la tarde, al sol y con
 * guantes, el color por sí solo no se ve; y uno de cada doce conductores no
 * distingue el rojo del verde.
 */
export type PintaEstado = {
  rail: string;
  fondo: string;
  glifo: string;
  texto: string;
  hex: string;
};

export const PINTA: Record<EstadoEntrega, PintaEstado> = {
  pendiente: { rail: "bg-line-strong", fondo: "bg-surface", glifo: "·", texto: "Pendiente", hex: "#cbd3e0" },
  entregado: { rail: "bg-ok", fondo: "bg-ok-bg", glifo: "✓", texto: "Entregado", hex: "#0e9f6e" },
  parcial: { rail: "bg-warn", fondo: "bg-warn-bg", glifo: "◑", texto: "Parcial", hex: "#c2760b" },
  fallido: { rail: "bg-bad", fondo: "bg-bad-bg", glifo: "✕", texto: "No entregado", hex: "#d64545" },
  reprogramado: { rail: "bg-warn", fondo: "bg-warn-bg", glifo: "↻", texto: "Reprogramado", hex: "#c2760b" },
};

export const pinta = (e: EstadoEntrega) => PINTA[e] ?? PINTA.pendiente;

/** Colores de pin que el conductor pasa al mapa para que coincida con la lista. */
export const COLORES_MAPA = Object.fromEntries(
  Object.entries(PINTA).map(([k, v]) => [k, v.hex]),
) as Record<string, string>;

/** Qué le pasó a una parada, en una línea, para la segunda fila de su fila. */
export function resumenEntrega(p: {
  estado_entrega: EstadoEntrega;
  hora_entrega: string | null;
  motivo: string | null;
  bultos: number;
  bultos_entregados: number | null;
  recibe: string | null;
}): string | null {
  const hora = p.hora_entrega
    ? new Date(p.hora_entrega).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })
    : null;

  if (p.estado_entrega === "entregado") {
    return ["Entregado", hora, p.recibe ? `recibió ${p.recibe}` : null].filter(Boolean).join(" · ");
  }
  if (p.estado_entrega === "parcial") {
    const n = p.bultos_entregados;
    return [n != null ? `Parcial ${n} de ${p.bultos}` : "Parcial", p.motivo].filter(Boolean).join(" · ");
  }
  if (p.estado_entrega === "fallido") {
    return ["No entregado", p.motivo].filter(Boolean).join(" · ");
  }
  if (p.estado_entrega === "reprogramado") {
    return ["Reprogramado", p.motivo].filter(Boolean).join(" · ");
  }
  return null;
}
