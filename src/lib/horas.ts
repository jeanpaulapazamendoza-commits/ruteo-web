/**
 * Todas las horas de la aplicación se pintan en la zona de la operación.
 *
 * Sin fijarla, un `timestamptz` se formatea con la zona de quien lo pinta: el
 * servidor de Vercel corre en UTC, así que la misma entrega salía a las 12:42
 * en el portátil del planificador y a las 17:42 en producción. Y no es solo
 * cosmético: con el desfase, una entrega de las nueve de la noche aparece en
 * el día siguiente.
 *
 * Es la misma decisión que `private.zona()` en la base. Si algún día hay
 * clientes en otro huso, los dos sitios pasan a leerla de la organización.
 */
export const ZONA = "America/Lima";

/** Reloj de 24 horas: «14:00» ocupa la mitad que «02:00 p. m.». */
export function hora(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA,
  });
}

/** Día y hora, para registros: «21 nov., 17:42». */
export function fechaHora(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA,
  });
}

/** Solo el día: «21 nov. 2026». */
export function fecha(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: ZONA,
  });
}

/** El día entero con su nombre: «sábado, 21 de noviembre de 2026». */
export function fechaLarga(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: ZONA,
  });
}

/**
 * Hoy en la operación, como «2026-11-21».
 *
 * Para los selectores de fecha y los nombres por defecto. Es el equivalente
 * en el navegador de `private.hoy()`: a las ocho de la noche en Lima, el
 * reloj del servidor ya dice mañana.
 */
export function hoy(): string {
  // `en-CA` da el formato ISO que esperan los `input type="date"`.
  return new Date().toLocaleDateString("en-CA", { timeZone: ZONA });
}

/**
 * Un día suelto («2026-11-21») escrito con letras.
 *
 * Estas fechas no llevan zona: son el día del despacho, no un instante. Se
 * parten a mano porque `new Date("2026-11-21")` se interpreta como medianoche
 * UTC y en Lima se pintaría como el día anterior.
 */
export function diaLargo(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-PE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** El mismo día suelto, corto: «21 nov.». */
export function diaCorto(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
  });
}
