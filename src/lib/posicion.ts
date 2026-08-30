"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Posición del móvil, disponible al instante.
 *
 * Antes cada entrega llamaba a `getCurrentPosition` y esperaba su respuesta
 * antes de guardar: en un sótano o entre edificios eso son hasta ocho segundos
 * con la pantalla congelada, veinticinco veces al día. La coordenada es un
 * dato de respaldo de la entrega, no un requisito para registrarla.
 *
 * Así que se mantiene una posición de fondo y la entrega usa la última
 * conocida sin esperar a nadie. Se pide con precisión baja y aceptando
 * lecturas de hasta un minuto: para saber en qué manzana se hizo la entrega
 * sobra, y una vigilancia de alta precisión durante ocho horas se lleva por
 * delante la batería de un teléfono viejo — y con ella la cola de entregas
 * pendientes de subir.
 */
export function usePosicion() {
  const ultima = useRef<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const id = navigator.geolocation.watchPosition(
      (p) => {
        ultima.current = { lat: p.coords.latitude, lon: p.coords.longitude };
      },
      () => {
        // Permiso denegado o sin señal: la entrega se guarda igual, sin GPS.
      },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 30000 },
    );

    return () => navigator.geolocation.clearWatch(id);
  }, []);

  /** La última posición conocida. Nunca espera; puede devolver null. */
  return useCallback(() => ultima.current, []);
}
