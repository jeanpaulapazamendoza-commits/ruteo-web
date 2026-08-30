import { crearClienteNavegador } from "@/lib/supabase/client";

export type EstadoEntrega = "pendiente" | "entregado" | "parcial" | "fallido" | "reprogramado";

export const ESTADOS_ENTREGA: Record<
  EstadoEntrega,
  { texto: string; corto: string; tono: "ok" | "warn" | "bad" | "plan" | "live" }
> = {
  pendiente: { texto: "Pendiente", corto: "Pendiente", tono: "plan" },
  entregado: { texto: "Entregado conforme", corto: "Entregado", tono: "ok" },
  parcial: { texto: "Entregado parcial", corto: "Parcial", tono: "warn" },
  fallido: { texto: "No entregado", corto: "No entregado", tono: "bad" },
  reprogramado: { texto: "Reprogramado", corto: "Reprogramado", tono: "warn" },
};

/** Motivos habituales de no entrega; «otros» obliga a escribir el detalle. */
export const MOTIVOS_NO_ENTREGA = [
  "Ausencia del cliente",
  "Dirección equivocada",
  "Local cerrado",
  "Cliente rechaza el pedido",
  "Otros",
] as const;

export type Entrega = {
  parada_id: string;
  estado: EstadoEntrega;
  motivo?: string | null;
  bultos_entregados?: number | null;
  observaciones?: string | null;
  recibe?: string | null;
  foto_url?: string | null;
  gps_lat?: number | null;
  gps_lon?: number | null;
};

/**
 * Reduce la foto antes de subirla.
 *
 * Una foto de móvil pesa 3-5 MB; a 1280 px de lado y calidad 0.7 baja a unos
 * 80 KB sin perder legibilidad de lo que importa (el bulto, la firma, la
 * fachada). Con 1500 entregas al día eso es la diferencia entre 5 GB al mes
 * y 100 GB, y sobre todo hace que suba con datos móviles flojos.
 */
export async function comprimirFoto(archivo: File, ladoMax = 1280, calidad = 0.7): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);

  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la foto.");
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    lienzo.toBlob(resolve, "image/jpeg", calidad),
  );
  if (!blob) throw new Error("No se pudo comprimir la foto.");
  return blob;
}

/** Sube la foto de la entrega. La ruta empieza por la empresa: así lo exige el bucket. */
export async function subirFoto(orgId: string, paradaId: string, foto: Blob): Promise<string> {
  const supabase = crearClienteNavegador();
  const ruta = `${orgId}/${paradaId}-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from("pod")
    .upload(ruta, foto, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(error.message);
  return ruta;
}

/** Confirma la ruta y marca la hora real de salida del CD. */
export async function iniciarRuta(rutaId: string): Promise<string> {
  const supabase = crearClienteNavegador();
  const { data, error } = await supabase.rpc("iniciar_ruta", { p_ruta: rutaId });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Registra el resultado de una parada. */
export async function marcarParada(entrega: Entrega) {
  const supabase = crearClienteNavegador();
  const { error } = await supabase.rpc("marcar_parada", {
    p: {
      parada_id: entrega.parada_id,
      estado: entrega.estado,
      motivo: entrega.motivo ?? null,
      bultos_entregados: entrega.bultos_entregados ?? null,
      observaciones: entrega.observaciones ?? null,
      recibe: entrega.recibe ?? null,
      foto_url: entrega.foto_url ?? null,
      gps_lat: entrega.gps_lat ?? null,
      gps_lon: entrega.gps_lon ?? null,
    },
  });
  if (error) throw new Error(error.message);
}

/** Posición actual, si el conductor la concede. Nunca bloquea la entrega. */
export function posicionActual(msMax = 6000): Promise<{ lat: number; lon: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: msMax, maximumAge: 30000 },
    );
  });
}

/** Abre la navegación del móvil (Google Maps, o Waze si lo tiene). */
export function enlaceNavegacion(lat: number, lon: number, app: "maps" | "waze" = "maps") {
  return app === "waze"
    ? `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
}

/**
 * Separa un motivo guardado en su opción de lista y su detalle libre.
 *
 * Al guardar, «Otros» se compone como `Otros: se mudaron`. Para poder
 * corregir una entrega hay que volver a partirlo, o el formulario mostraría
 * el motivo entero como si fuera una opción del desplegable.
 */
export function desglosarMotivo(motivo: string | null): { opcion: string; detalle: string } {
  if (!motivo) return { opcion: "", detalle: "" };
  if (motivo.startsWith("Otros: ")) return { opcion: "Otros", detalle: motivo.slice(7) };
  return MOTIVOS_NO_ENTREGA.includes(motivo as (typeof MOTIVOS_NO_ENTREGA)[number])
    ? { opcion: motivo, detalle: "" }
    : { opcion: "", detalle: motivo };
}
