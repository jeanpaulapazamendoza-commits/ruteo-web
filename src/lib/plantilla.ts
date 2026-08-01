/**
 * Lectura de la plantilla de tiendas.
 *
 * Acepta tal cual los archivos que ya usas en la app de Streamlit
 * (codigo_sucursal, name_sucursal, latitud, longitud, ...) y también
 * variantes comunes, sin distinguir mayúsculas ni tildes.
 */

import type { TiendaMapa } from "@/lib/motor";

/** Un punto tal como lo maneja el planificador (venga de archivo o de la base). */
export type PuntoPlan = TiendaMapa;

export type FilaTienda = {
  codigo: string;
  nombre: string;
  distrito: string | null;
  lat: number;
  lon: number;
  bultos_default: number;
  prioridad: number;
  ventana_ini: string | null;
  ventana_fin: string | null;
};

export type ResultadoLectura = {
  filas: FilaTienda[];
  errores: { fila: number; motivo: string }[];
  columnasDetectadas: Record<string, string>;
  totalLeidas: number;
};

/** Nombres aceptados para cada campo (el primero es el de la plantilla). */
const ALIAS: Record<keyof FilaTienda, string[]> = {
  codigo: ["codigo_sucursal", "codigo", "code", "id", "sku"],
  nombre: ["name_sucursal", "nombre", "tienda", "name", "razon_social"],
  distrito: ["distrito", "zona", "district", "sector"],
  lat: ["latitud", "lat", "latitude", "y"],
  lon: ["longitud", "lon", "lng", "long", "longitude", "x"],
  bultos_default: ["cantidad_bultos", "bultos", "cajas", "unidades", "carga"],
  prioridad: ["prioridad", "priority", "urgencia"],
  ventana_ini: ["hora_inicio", "ventana_ini", "hora_ini", "desde", "apertura"],
  ventana_fin: ["hora_fin", "ventana_fin", "hasta", "cierre"],
};

/** Quita tildes, espacios y signos para comparar encabezados. */
function normalizar(texto: string) {
  return texto
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marcas de acento combinantes
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Empareja los encabezados del archivo con los campos conocidos. */
export function mapearColumnas(encabezados: string[]) {
  const normalizados = encabezados.map(normalizar);
  const mapa: Partial<Record<keyof FilaTienda, number>> = {};
  const detectadas: Record<string, string> = {};

  (Object.keys(ALIAS) as (keyof FilaTienda)[]).forEach((campo) => {
    for (const alias of ALIAS[campo]) {
      const i = normalizados.indexOf(normalizar(alias));
      if (i !== -1) {
        mapa[campo] = i;
        detectadas[campo] = encabezados[i];
        return;
      }
    }
  });

  return { mapa, detectadas };
}

function aNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  // Acepta coma decimal ("-12,04") además de punto
  const n = Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Convierte "9:00", "09:00:00", 0.375 (Excel) o un Date a "HH:MM". */
export function aHora(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;

  if (v instanceof Date) {
    return `${String(v.getUTCHours()).padStart(2, "0")}:${String(
      v.getUTCMinutes(),
    ).padStart(2, "0")}`;
  }

  const s = String(v).trim();
  if (!s) return null;

  // Solo ":" y "h" separan hora de minutos. El "." NO: rompería las
  // fracciones de día de Excel ("0.375" es 09:00, no 00:37).
  const m = s.match(/^(\d{1,2})[:h](\d{2})/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h >= 0 && h <= 24 && min >= 0 && min < 60) {
      return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }
    return null;
  }

  const num = Number(s.replace(",", "."));
  if (Number.isFinite(num)) {
    // fracción de día (formato interno de Excel) u hora decimal
    const horas = num > 0 && num < 1 ? num * 24 : num;
    if (horas >= 0 && horas <= 24) {
      const h = Math.floor(horas);
      const min = Math.round((horas - h) * 60);
      return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }
  }
  return null;
}

/**
 * Convierte las filas crudas del archivo en tiendas listas para guardar.
 * `matriz[0]` debe ser la fila de encabezados.
 */
export function interpretarFilas(matriz: unknown[][]): ResultadoLectura {
  const errores: { fila: number; motivo: string }[] = [];
  const filas: FilaTienda[] = [];

  if (!matriz.length) {
    return {
      filas,
      errores: [{ fila: 0, motivo: "El archivo está vacío." }],
      columnasDetectadas: {},
      totalLeidas: 0,
    };
  }

  const encabezados = (matriz[0] ?? []).map((c) => String(c ?? ""));
  const { mapa, detectadas } = mapearColumnas(encabezados);

  if (mapa.lat === undefined || mapa.lon === undefined) {
    return {
      filas,
      errores: [
        {
          fila: 1,
          motivo:
            "No encontré las columnas de latitud y longitud. Revisa que el archivo tenga encabezados como 'latitud' y 'longitud'.",
        },
      ],
      columnasDetectadas: detectadas,
      totalLeidas: 0,
    };
  }

  const cuerpo = matriz.slice(1);
  const vistos = new Set<string>();

  cuerpo.forEach((fila, i) => {
    const nFila = i + 2; // +1 por encabezado, +1 porque Excel empieza en 1
    const vacia = fila.every((c) => c === null || c === undefined || c === "");
    if (vacia) return;

    const lat = aNumero(fila[mapa.lat!]);
    const lon = aNumero(fila[mapa.lon!]);

    if (lat === null || lon === null) {
      errores.push({ fila: nFila, motivo: "Latitud o longitud vacía o no numérica" });
      return;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      errores.push({
        fila: nFila,
        motivo: `Coordenada fuera de rango (${lat}, ${lon}). ¿Están invertidas?`,
      });
      return;
    }

    const codigoBruto =
      mapa.codigo !== undefined ? String(fila[mapa.codigo] ?? "").trim() : "";
    const codigo = codigoBruto || `T-${nFila - 1}`;

    if (vistos.has(codigo)) {
      errores.push({ fila: nFila, motivo: `Código repetido: ${codigo}` });
      return;
    }
    vistos.add(codigo);

    const nombreBruto =
      mapa.nombre !== undefined ? String(fila[mapa.nombre] ?? "").trim() : "";

    const bultos =
      mapa.bultos_default !== undefined
        ? aNumero(fila[mapa.bultos_default])
        : null;
    const prioridad =
      mapa.prioridad !== undefined ? aNumero(fila[mapa.prioridad]) : null;

    let vIni = mapa.ventana_ini !== undefined ? aHora(fila[mapa.ventana_ini]) : null;
    let vFin = mapa.ventana_fin !== undefined ? aHora(fila[mapa.ventana_fin]) : null;
    // Una ventana a medias no sirve: se descarta el par
    if (vIni && vFin && vFin <= vIni) {
      errores.push({
        fila: nFila,
        motivo: `Ventana horaria inválida (${vIni}–${vFin}); se guardó sin ventana`,
      });
      vIni = null;
      vFin = null;
    }

    filas.push({
      codigo,
      nombre: nombreBruto || `Tienda ${codigo}`,
      distrito:
        mapa.distrito !== undefined
          ? String(fila[mapa.distrito] ?? "").trim() || null
          : null,
      lat,
      lon,
      bultos_default: bultos !== null && bultos >= 0 ? Math.round(bultos) : 1,
      prioridad:
        prioridad !== null ? Math.min(9, Math.max(0, Math.round(prioridad))) : 0,
      ventana_ini: vIni,
      ventana_fin: vFin,
    });
  });

  return {
    filas,
    errores,
    columnasDetectadas: detectadas,
    totalLeidas: cuerpo.length,
  };
}

/** Separa una línea de CSV respetando comillas. */
function partirLinea(linea: string, sep: string) {
  const celdas: string[] = [];
  let actual = "";
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (enComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else enComillas = !enComillas;
    } else if (c === sep && !enComillas) {
      celdas.push(actual);
      actual = "";
    } else actual += c;
  }
  celdas.push(actual);
  return celdas.map((c) => c.trim());
}

function leerCSV(texto: string): unknown[][] {
  const limpio = texto.replace(/^﻿/, ""); // quitar BOM
  const lineas = limpio.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
  if (!lineas.length) return [];
  // Autodetecta el separador: tus exportaciones a veces usan ";"
  const cabecera = lineas[0];
  const sep = [";", ",", "\t"]
    .map((s) => ({ s, n: cabecera.split(s).length }))
    .sort((a, b) => b.n - a.n)[0].s;
  return lineas.map((l) => partirLinea(l, sep));
}

/** Lee un Excel o CSV del navegador y lo interpreta. Solo cliente. */
export async function leerArchivo(archivo: File): Promise<ResultadoLectura> {
  let matriz: unknown[][];
  if (/\.xlsx?$/i.test(archivo.name)) {
    // El paquete no tiene entrada raíz: hay que pedir la variante de navegador.
    // Ojo: el export por defecto devuelve la LISTA DE HOJAS; `readSheet`
    // es el que devuelve las filas de la primera hoja.
    const { readSheet } = await import("read-excel-file/browser");
    matriz = (await readSheet(archivo)) as unknown[][];
  } else {
    matriz = leerCSV(await archivo.text());
  }
  return interpretarFilas(matriz);
}

/**
 * Convierte las filas leídas en puntos de trabajo del planificador.
 *
 * Estos puntos viven **solo en el navegador** hasta que se guarda el despacho:
 * por eso su `id` es el propio código del archivo y no un identificador de la
 * base de datos. Al guardar, el despacho se queda con una copia completa de
 * cada parada, así que no hace falta que existan antes en ninguna tabla.
 */
export function aPuntos(filas: FilaTienda[]): PuntoPlan[] {
  return filas.map((f) => ({
    id: f.codigo,
    codigo: f.codigo,
    nombre: f.nombre,
    distrito: f.distrito,
    lat: f.lat,
    lon: f.lon,
    bultos: f.bultos_default,
    prioridad: f.prioridad,
    ventana_ini: f.ventana_ini,
    ventana_fin: f.ventana_fin,
  }));
}

/** Une dos conjuntos de puntos sin repetir códigos (gana el más reciente). */
export function fusionarPuntos(base: PuntoPlan[], nuevos: PuntoPlan[]) {
  const porCodigo = new Map(base.map((p) => [p.codigo, p]));
  let añadidos = 0;
  let actualizados = 0;
  for (const p of nuevos) {
    if (porCodigo.has(p.codigo)) actualizados++;
    else añadidos++;
    porCodigo.set(p.codigo, p);
  }
  return { puntos: [...porCodigo.values()], añadidos, actualizados };
}

/** CSV de ejemplo. Lleva BOM para que Excel muestre bien las tildes. */
export function plantillaCSV() {
  const cabecera =
    "codigo_sucursal,name_sucursal,distrito,latitud,longitud,cantidad_bultos,prioridad,hora_inicio,hora_fin";
  const ejemplos = [
    "294,1ro de Mayo VES,Villa El Salvador,-12.197770,-76.966510,12,0,,",
    "275,24 de Junio VES,Villa El Salvador,-12.205820,-76.940960,8,1,09:00,13:00",
    "2278,Alamos 17 VES,Villa El Salvador,-12.209451,-76.942489,15,0,,",
  ];
  return "﻿" + [cabecera, ...ejemplos].join("\r\n") + "\r\n";
}

export const COLUMNAS_PLANTILLA = [
  { nombre: "codigo_sucursal", obligatoria: false, descripcion: "Código interno. Si falta se genera uno." },
  { nombre: "name_sucursal", obligatoria: false, descripcion: "Nombre de la tienda." },
  { nombre: "distrito", obligatoria: false, descripcion: "Distrito o zona." },
  { nombre: "latitud", obligatoria: true, descripcion: "Ej. -12.197770" },
  { nombre: "longitud", obligatoria: true, descripcion: "Ej. -76.966510" },
  { nombre: "cantidad_bultos", obligatoria: false, descripcion: "Pedido habitual. Por defecto 1." },
  { nombre: "prioridad", obligatoria: false, descripcion: "0 normal · 1 se visita primero · 2…" },
  { nombre: "hora_inicio", obligatoria: false, descripcion: "Inicio de ventana, ej. 09:00" },
  { nombre: "hora_fin", obligatoria: false, descripcion: "Fin de ventana, ej. 13:00" },
];
