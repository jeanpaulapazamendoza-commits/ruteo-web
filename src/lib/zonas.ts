import type { TiendaMapa } from "@/lib/motor";

/** Vértice de un polígono, en el orden de Leaflet: [lat, lon]. */
export type Vertice = [number, number];

export type Zona = {
  id: string;
  nombre: string;
  color: string;
  poligono: Vertice[];
};

export const COLORES_ZONA = [
  "#2E7DD1", "#E8833A", "#0E8F9E", "#7A5AF8", "#C2439B",
  "#7C9A1F", "#D9534F", "#2F855A", "#B7791F", "#5A67D8",
];

/**
 * ¿El punto cae dentro del polígono? (algoritmo del rayo)
 *
 * Se traza un rayo horizontal hacia la derecha y se cuentan los lados que
 * cruza: impar es dentro, par es fuera. Va en el navegador y no en el motor
 * porque son operaciones sueltas sobre datos que ya están en pantalla —
 * repartir 1500 puntos entre 10 zonas son 15.000 comprobaciones, inmediatas,
 * y así el reparto por zonas funciona aunque el motor esté dormido.
 */
export function dentroDe(lat: number, lon: number, poligono: Vertice[]) {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [latI, lonI] = poligono[i];
    const [latJ, lonJ] = poligono[j];
    // El lado cruza la horizontal del punto…
    const cruza = latI > lat !== latJ > lat;
    if (!cruza) continue;
    // …y lo hace a la derecha del punto.
    const lonCorte = lonI + ((lat - latI) / (latJ - latI)) * (lonJ - lonI);
    if (lon < lonCorte) dentro = !dentro;
  }
  return dentro;
}

export type RepartoPorZonas = {
  /** Un grupo por zona, en el mismo orden que `zonas`. */
  grupos: string[][];
  /** Puntos que no cayeron en ninguna zona. */
  fuera: string[];
  /** Cuántos puntos recogió cada zona. */
  porZona: { zona: Zona; n: number; bultos: number }[];
};

/**
 * Reparte los puntos entre las zonas guardadas.
 *
 * Si un punto cae en varias zonas solapadas gana la primera de la lista: hace
 * falta un criterio estable, y el orden que ve el planificador es el suyo.
 */
export function repartirPorZonas(puntos: TiendaMapa[], zonas: Zona[]): RepartoPorZonas {
  const grupos: string[][] = zonas.map(() => []);
  const fuera: string[] = [];
  const bultos = zonas.map(() => 0);

  for (const p of puntos) {
    const i = zonas.findIndex((z) => dentroDe(p.lat, p.lon, z.poligono));
    if (i === -1) {
      fuera.push(p.id);
    } else {
      grupos[i].push(p.id);
      bultos[i] += p.bultos;
    }
  }

  return {
    grupos,
    fuera,
    porZona: zonas.map((zona, i) => ({ zona, n: grupos[i].length, bultos: bultos[i] })),
  };
}

/** Centro aproximado de un polígono, para colocar su etiqueta. */
export function centroDe(poligono: Vertice[]): Vertice {
  const n = poligono.length || 1;
  return [
    poligono.reduce((a, p) => a + p[0], 0) / n,
    poligono.reduce((a, p) => a + p[1], 0) / n,
  ];
}
