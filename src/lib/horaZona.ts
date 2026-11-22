import { ZONA } from "@/lib/horas";

/** «14:11:00» de la base → «14:11». */
export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

/** La hora de ahora en la zona de la operación, «HH:MM». */
export function ahoraEnZona() {
  const partes = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: ZONA,
  }).formatToParts(new Date());
  const de = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "00";
  return `${de("hour")}:${de("minute")}`;
}
