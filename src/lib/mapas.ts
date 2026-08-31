/**
 * Fondos de mapa disponibles.
 *
 * En una aplicación de ruteo el mapa no es el contenido: es el papel sobre el
 * que se dibujan las rutas, las zonas y los pines numerados. Un callejero con
 * las calles en naranja y comercios etiquetados compite con esos colores, y en
 * una pantalla con catorce rutas de catorce colores el conductor —o el
 * planificador— deja de distinguir cuál es cuál.
 *
 * Por eso el fondo por defecto es gris casi blanco. El callejero sigue estando
 * a un toque para cuando hace falta leer nombres de calles, y el satélite es
 * el que resuelve las direcciones que el callejero no tiene: patios, naves,
 * asentamientos sin numeración.
 */
export type Fondo = {
  id: string;
  nombre: string;
  /** Para qué sirve, en una línea, dentro del selector. */
  para: string;
  url: string;
  /** Capa transparente de rótulos, cuando el fondo viene sin ellos. */
  rotulos?: string;
  atribucion: string;
  maxZoom: number;
  /** Fondo oscuro: los trazos claros necesitan otro contraste encima. */
  oscuro?: boolean;
};

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";

export const FONDOS: Fondo[] = [
  {
    id: "gris",
    nombre: "Gris claro",
    para: "Las rutas mandan",
    url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    rotulos: `${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    atribucion: "Teselas &copy; Esri · &copy; OpenStreetMap",
    maxZoom: 16,
  },
  {
    id: "calle",
    nombre: "Callejero",
    para: "Nombres y comercios",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    atribucion: "&copy; OpenStreetMap",
    maxZoom: 19,
  },
  {
    id: "satelite",
    nombre: "Satélite",
    para: "Patios, naves y sin callejero",
    url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    rotulos: `${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    atribucion: "Teselas &copy; Esri · Maxar, Earthstar Geographics",
    maxZoom: 18,
    oscuro: true,
  },
  {
    id: "noche",
    nombre: "Noche",
    para: "Reparto nocturno y poca luz",
    url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    rotulos: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    atribucion: "Teselas &copy; Esri · &copy; OpenStreetMap",
    maxZoom: 16,
    oscuro: true,
  },
];

const CLAVE = "ruteo:fondo";
export const FONDO_POR_DEFECTO = "gris";

export const buscarFondo = (id: string | null) =>
  FONDOS.find((f) => f.id === id) ?? FONDOS[0];

/**
 * El fondo elegido, del navegador de quien mira.
 *
 * Es una preferencia de quien tiene la pantalla delante —el conductor al sol
 * quiere una cosa y el planificador otra—, así que no pinta en la base de
 * datos ni se comparte con el resto de la empresa.
 */
export function leerFondo(): string {
  if (typeof localStorage === "undefined") return FONDO_POR_DEFECTO;
  try {
    return localStorage.getItem(CLAVE) ?? FONDO_POR_DEFECTO;
  } catch {
    return FONDO_POR_DEFECTO;
  }
}

export function guardarFondo(id: string) {
  try {
    localStorage.setItem(CLAVE, id);
  } catch {
    /* modo privado: la elección dura lo que la pestaña */
  }
}
