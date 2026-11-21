/**
 * Lo que se sabe de un documento adjunto, sin tocar el servidor.
 *
 * Vive aquí y no junto a las acciones porque un archivo `"use server"` solo
 * puede exportar funciones asíncronas: una constante ahí rompe la compilación.
 */

/** Lo que una empresa de reparto suele adjuntar a un punto. */
export const TIPOS_DOCUMENTO = [
  "Guía de remisión",
  "Acta de conformidad",
  "Factura",
  "Boleta",
  "Nota de crédito",
  "Cargo devuelto",
  "Otro",
] as const;

export type Documento = {
  id: number;
  tipo: string;
  nombre: string;
  peso: number | null;
  autor: string | null;
  creado_en: string;
  /** Si quien pregunta puede retirarlo: lo suyo, o cualquiera si es admin. */
  mio: boolean;
};

/** El peso en lo que lee una persona, no en bytes. */
export function pesa(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
