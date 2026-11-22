/**
 * Los colores de las rutas, los mismos en el mapa, en las listas y en el
 * editor. Viven aparte del mapa porque Leaflet no se puede cargar en el
 * servidor, y una lista que solo quiere el color no tiene por qué traerlo.
 */
export const COLORES_RUTA = [
  "#E8833A", "#2E7DD1", "#0E8F9E", "#7A5AF8", "#C2439B", "#7C9A1F",
  "#D9534F", "#2F855A", "#B7791F", "#5A67D8", "#D53F8C", "#319795",
];

export function colorDe(i: number) {
  return COLORES_RUTA[i % COLORES_RUTA.length];
}
