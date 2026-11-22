import "server-only";
import { comoUsuario } from "@/lib/db";
import { simplificar } from "@/lib/despachos";

/**
 * Trazado de las rutas por calles.
 *
 * El recorrido que se dibuja en el mapa lo calcula el planificador y se guarda
 * con la ruta. Pero hay rutas que llegan sin él: las de un despacho cargado
 * desde archivo y nunca planificado, las que recibieron una parada movida a
 * mano, las calculadas en línea recta. Sin trazado, el mapa une las paradas con
 * rectas que cruzan manzanas y no dicen por dónde va el vehículo.
 *
 * Aquí se completa lo que falte: se pide el recorrido por calles en el orden
 * que ya tienen las paradas y se guarda, así que solo cuesta la primera vez.
 * No cambia el orden ni los kilómetros planificados: solo el dibujo.
 */

const OSRM = (process.env.OSRM_URL || "https://router.project-osrm.org").replace(/\/+$/, "");

// Por consulta. El servidor acepta más, pero la dirección se alarga.
const PUNTOS_POR_TRAMO = 80;
// Lo que puede esperar una pantalla a que se dibujen sus rutas. Lo que no
// entre se completa la próxima vez que se abra.
const PRESUPUESTO_MS = 7000;
const ESPERA_CONSULTA_MS = 4000;

// Si el servidor de calles no responde, no se le vuelve a preguntar en un
// rato: cada pantalla esperaría en vano.
let caidoHasta = 0;

type Punto = [number, number]; // [lat, lon]

async function porCalles(puntos: Punto[], hasta: number): Promise<Punto[] | null> {
  const trazo: Punto[] = [];
  for (let i = 0; i < puntos.length - 1; i += PUNTOS_POR_TRAMO) {
    const tramo = puntos.slice(i, i + PUNTOS_POR_TRAMO + 1);
    const queda = hasta - Date.now();
    if (queda < 500) return null;
    const locs = tramo.map(([lat, lon]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(";");
    const r = await fetch(
      `${OSRM}/route/v1/driving/${locs}?overview=full&geometries=geojson&steps=false`,
      { signal: AbortSignal.timeout(Math.min(ESPERA_CONSULTA_MS, queda)), cache: "no-store" },
    );
    if (!r.ok) throw new Error(`OSRM ${r.status}`);
    const datos = (await r.json()) as {
      code?: string;
      routes?: { geometry: { coordinates: [number, number][] } }[];
    };
    const linea = datos.routes?.[0]?.geometry.coordinates;
    if (datos.code !== "Ok" || !linea?.length) return null;
    for (const [lon, lat] of linea) trazo.push([lat, lon]);
  }
  return trazo.length > 1 ? trazo : null;
}

type Pendiente = {
  id: string;
  cd_lat: number | null;
  cd_lon: number | null;
  cerrado: boolean;
  puntos: Punto[] | null;
};

/**
 * Dibuja por calles las rutas que todavía no tienen trazado.
 *
 * Se llama antes de leer las rutas de una pantalla con mapa. Una ruta cuenta
 * como sin trazado si no guarda ninguno o si el que guarda no tiene más puntos
 * que paradas: eso es una recta de parada a parada, no un recorrido.
 *
 * Nunca rompe la pantalla: si el servidor de calles falla o tarda, las rutas
 * se quedan como estaban y se reintenta más adelante.
 */
export async function asegurarTrazados(
  usuario: string,
  donde: { despacho: string } | { ruta: string },
): Promise<void> {
  if (Date.now() < caidoHasta) return;
  const hasta = Date.now() + PRESUPUESTO_MS;

  try {
    const pendientes = await comoUsuario<Pendiente>(
      usuario,
      `select r.id, d.cd_lat, d.cd_lon,
              (d.parametros->>'cerrado') is distinct from 'false' as cerrado,
              (select json_agg(json_build_array(p.lat, p.lon) order by p.orden)
                 from paradas p
                where p.ruta_id = r.id and p.lat is not null and p.lon is not null) as puntos
         from rutas r
         join despachos d on d.id = r.despacho_id
        where ${"despacho" in donde ? "r.despacho_id" : "r.id"} = $1
          and not r.sin_asignar
          and (r.geometria is null
               or jsonb_typeof(r.geometria) <> 'array'
               or jsonb_array_length(r.geometria) <=
                  (select count(*) from paradas p where p.ruta_id = r.id) + 2)
        order by r.indice`,
      ["despacho" in donde ? donde.despacho : donde.ruta],
    );

    for (const ruta of pendientes) {
      if (hasta - Date.now() < 500) break;

      const recorrido: Punto[] = [...(ruta.puntos ?? [])];
      if (ruta.cd_lat != null && ruta.cd_lon != null && recorrido.length) {
        const centro: Punto = [ruta.cd_lat, ruta.cd_lon];
        recorrido.unshift(centro);
        if (ruta.cerrado) recorrido.push(centro);
      }
      if (recorrido.length < 2) continue;

      const trazo = await porCalles(recorrido, hasta);
      if (!trazo) continue;

      const guardar = simplificar(trazo);
      // Una ruta de una sola cuadra puede quedar en dos puntos tras
      // simplificar, y volvería a contar como sin trazado en cada visita.
      const minimo = (ruta.puntos?.length ?? 0) + 3;
      await comoUsuario(usuario, "update rutas set geometria = $2::jsonb where id = $1", [
        ruta.id,
        JSON.stringify(guardar.length >= minimo ? guardar : trazo),
      ]);
    }
  } catch {
    caidoHasta = Date.now() + 60_000;
  }
}
