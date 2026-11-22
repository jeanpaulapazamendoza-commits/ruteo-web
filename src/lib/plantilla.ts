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

export type ItemFila = {
  codigo: string | null;
  nombre: string;
  cantidad: number;
  precio: number | null;
};

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
  /**
   * La ficha del cliente, si el archivo la trae.
   *
   * No hace falta para rutear —para eso bastan las coordenadas— pero sin
   * teléfono no se puede llamar al que no abre, y es justo lo que se busca
   * cuando el conductor está parado en la puerta. Va al cliente, no a la
   * parada: sigue sirviendo cuando el despacho de hoy esté archivado.
   */
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  contacto: string | null;
  /** Los artículos que lleva el punto, si el archivo los trae. */
  items: ItemFila[];
  /**
   * Las columnas que la aplicación no conoce, tal cual venían.
   *
   * Cada cliente manda las suyas —número de pedido, canal de venta, guía de
   * remisión— y antes se perdían al leer el archivo. Guardarlas sin
   * interpretarlas deja que se vean y se busquen sin que haga falta tocar el
   * esquema cada vez que entra un cliente nuevo.
   */
  extra: Record<string, string>;
};

/**
 * Una coordenada que el archivo da por buena pero que probablemente no lo es.
 *
 * No son errores: la fila entra igual. Son puntos que, de pasar sin mirar,
 * mandan a un conductor al otro lado de la ciudad o al medio del Atlántico.
 * Cuesta mucho menos revisarlos antes de rutear que descubrirlos a las once
 * de la mañana con el camión parado.
 */
export type AvisoCoordenada = {
  fila: number;
  codigo: string;
  tipo: "invertida" | "nula" | "lejos" | "repetida" | "redonda";
  motivo: string;
};

export type ResultadoLectura = {
  filas: FilaTienda[];
  errores: { fila: number; motivo: string }[];
  avisos: AvisoCoordenada[];
  columnasDetectadas: Record<string, string>;
  totalLeidas: number;
};

/**
 * Nombres aceptados para cada campo del punto. `items` y `extra` no están
 * aquí: no son una columna del archivo, se arman con lo que sobra.
 */
const ALIAS: Record<
  Exclude<keyof FilaTienda, "items" | "extra">,
  string[]
> = {
  codigo: ["codigo_sucursal", "codigo", "code", "id", "sku"],
  nombre: ["name_sucursal", "nombre", "tienda", "name", "razon_social"],
  distrito: ["distrito", "zona", "district", "sector"],
  lat: ["latitud", "lat", "latitude", "y"],
  lon: ["longitud", "lon", "lng", "long", "longitude", "x"],
  bultos_default: ["cantidad_bultos", "bultos", "cajas", "unidades", "carga"],
  prioridad: ["prioridad", "priority", "urgencia"],
  ventana_ini: ["hora_inicio", "ventana_ini", "hora_ini", "desde", "apertura"],
  ventana_fin: ["hora_fin", "ventana_fin", "hasta", "cierre"],
  direccion: ["direccion", "address", "domicilio", "calle"],
  telefono: ["telefono", "celular", "phone", "movil", "contacto_telefono"],
  email: ["email", "correo", "correo_electronico", "mail"],
  contacto: ["contacto", "persona_contacto", "receptor", "responsable"],
};

/** Columnas de artículo. Si no están, el archivo es de un punto por fila. */
const ALIAS_ITEM = {
  codigo: ["item_codigo", "sku", "codigo_articulo", "codigo_producto", "cod_item"],
  nombre: ["item_nombre", "articulo", "producto", "descripcion", "item"],
  cantidad: ["item_cantidad", "cantidad", "unidades", "qty"],
  precio: ["item_precio", "precio", "importe", "valor"],
} as const;

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
  const mapa: Partial<Record<keyof typeof ALIAS, number>> = {};
  const detectadas: Record<string, string> = {};

  (Object.keys(ALIAS) as (keyof typeof ALIAS)[]).forEach((campo) => {
    for (const alias of ALIAS[campo]) {
      const i = normalizados.indexOf(normalizar(alias));
      if (i !== -1) {
        mapa[campo] = i;
        detectadas[campo] = encabezados[i];
        return;
      }
    }
  });

  // Las columnas de artículo van en su propio mapa: comparten nombres con
  // las del punto («cantidad» puede ser bultos o unidades del artículo) y
  // mezclarlas haría que una tabla de pedidos se leyera al revés.
  const mapaItem: Partial<Record<keyof typeof ALIAS_ITEM, number>> = {};
  (Object.keys(ALIAS_ITEM) as (keyof typeof ALIAS_ITEM)[]).forEach((campo) => {
    for (const alias of ALIAS_ITEM[campo]) {
      const i = normalizados.indexOf(normalizar(alias));
      if (i !== -1 && !Object.values(mapa).includes(i)) {
        mapaItem[campo] = i;
        return;
      }
    }
  });

  // Todo lo demás es del cliente y se guarda tal cual.
  const usadas = new Set([
    ...Object.values(mapa),
    ...Object.values(mapaItem),
  ]);
  const extras = encabezados
    .map((nombre, i) => ({ nombre: nombre.trim(), i }))
    .filter((c) => c.nombre && !usadas.has(c.i));

  return { mapa, mapaItem, extras, detectadas };
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

/** Distancia en kilómetros entre dos coordenadas. */
function km(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** La mediana aguanta los puntos disparatados; el promedio no. */
function mediana(xs: number[]) {
  if (!xs.length) return 0;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/** Cuántos decimales trae el número, mirando su texto. */
function decimales(n: number) {
  const s = String(n);
  const i = s.indexOf(".");
  return i === -1 ? 0 : s.length - i - 1;
}

/**
 * Revisa las coordenadas ya leídas contra el conjunto, no una por una.
 *
 * Un punto en (-77, -12) es perfectamente válido para Postgres: cae en el
 * Atlántico, frente a África. Solo se sabe que está mal porque las otras
 * doscientas filas están en Lima. Por eso esto va al final y no dentro del
 * bucle que lee cada fila.
 */
export function revisarCoordenadas(
  filas: FilaTienda[],
  numeroDeFila: (codigo: string) => number,
): AvisoCoordenada[] {
  const avisos: AvisoCoordenada[] = [];
  if (!filas.length) return avisos;

  const centroLat = mediana(filas.map((f) => f.lat));
  const centroLon = mediana(filas.map((f) => f.lon));

  // El umbral se saca del propio archivo: un reparto urbano y uno regional
  // no tienen la misma idea de «lejos». Se toma diez veces la distancia
  // típica al centro, con un suelo de 60 km para que un archivo muy
  // compacto no marque media ciudad.
  const distancias = filas.map((f) => km(centroLat, centroLon, f.lat, f.lon));
  const limite = Math.max(60, mediana(distancias) * 10);

  // Coordenadas repetidas al metro: casi siempre es el valor por defecto que
  // alguien dejó en el maestro, no doscientas tiendas en el mismo portal.
  const porPunto = new Map<string, number>();
  filas.forEach((f) =>
    porPunto.set(
      `${f.lat.toFixed(5)},${f.lon.toFixed(5)}`,
      (porPunto.get(`${f.lat.toFixed(5)},${f.lon.toFixed(5)}`) ?? 0) + 1,
    ),
  );

  filas.forEach((f, i) => {
    const fila = numeroDeFila(f.codigo);
    const dist = distancias[i];

    if (Math.abs(f.lat) < 0.5 && Math.abs(f.lon) < 0.5) {
      avisos.push({
        fila, codigo: f.codigo, tipo: "nula",
        motivo: "Coordenada en (0, 0): el punto no llegó a geolocalizarse",
      });
      return;
    }

    // Invertir el par acerca el punto al resto: la causa más común de un
    // punto perdido es que las columnas vinieran cambiadas.
    if (dist > limite) {
      const alReves = km(centroLat, centroLon, f.lon, f.lat);
      if (
        Math.abs(f.lon) <= 90 &&
        alReves < dist / 10 &&
        alReves <= limite
      ) {
        avisos.push({
          fila, codigo: f.codigo, tipo: "invertida",
          motivo: `Parece latitud y longitud cambiadas: al invertirlas cae a ${Math.round(alReves)} km del resto, en vez de ${Math.round(dist)}`,
        });
        return;
      }
      avisos.push({
        fila, codigo: f.codigo, tipo: "lejos",
        motivo: `A ${Math.round(dist)} km del resto de los puntos`,
      });
      return;
    }

    const repetidas = porPunto.get(`${f.lat.toFixed(5)},${f.lon.toFixed(5)}`) ?? 1;
    if (repetidas >= 3) {
      avisos.push({
        fila, codigo: f.codigo, tipo: "repetida",
        motivo: `${repetidas} puntos con exactamente la misma coordenada`,
      });
      return;
    }

    // Dos decimales son algo más de un kilómetro de error: sirve para pintar
    // un mapa, no para mandar a alguien a una puerta.
    if (decimales(f.lat) <= 2 && decimales(f.lon) <= 2) {
      avisos.push({
        fila, codigo: f.codigo, tipo: "redonda",
        motivo: "Coordenada con muy pocos decimales: el punto puede estar a más de un kilómetro",
      });
    }
  });

  return avisos;
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
      avisos: [],
      columnasDetectadas: {},
      totalLeidas: 0,
    };
  }

  const encabezados = (matriz[0] ?? []).map((c) => String(c ?? ""));
  const { mapa, mapaItem, extras, detectadas } = mapearColumnas(encabezados);
  // Con columnas de artículo, varias filas con el mismo código son el mismo
  // punto con varios artículos; sin ellas, un código repetido sigue siendo
   // un error, que es lo que era antes.
  const porArticulos = mapaItem.nombre !== undefined || mapaItem.codigo !== undefined;

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
      avisos: [],
      columnasDetectadas: detectadas,
      totalLeidas: 0,
    };
  }

  const cuerpo = matriz.slice(1);
  const vistos = new Set<string>();
  // Se guarda de qué fila del archivo salió cada código para que el aviso
  // diga «fila 87» y no «el punto T-0412», que no se busca en Excel.
  const filaDe = new Map<string, number>();

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

    const leerItem = (): ItemFila | null => {
      if (!porArticulos) return null;
      const nombreItem =
        mapaItem.nombre !== undefined ? String(fila[mapaItem.nombre] ?? "").trim() : "";
      const codigoItem =
        mapaItem.codigo !== undefined ? String(fila[mapaItem.codigo] ?? "").trim() : "";
      if (!nombreItem && !codigoItem) return null;
      const cant = mapaItem.cantidad !== undefined ? aNumero(fila[mapaItem.cantidad]) : null;
      return {
        codigo: codigoItem || null,
        nombre: nombreItem || codigoItem,
        cantidad: cant !== null && cant > 0 ? cant : 1,
        precio: mapaItem.precio !== undefined ? aNumero(fila[mapaItem.precio]) : null,
      };
    };

    if (vistos.has(codigo)) {
      if (porArticulos) {
        // Otra línea del mismo pedido: suma su artículo y sus bultos.
        const previa = filas.find((f) => f.codigo === codigo);
        const item = leerItem();
        if (previa && item) {
          previa.items.push(item);
          previa.bultos_default += Math.round(item.cantidad);
        }
        return;
      }
      errores.push({ fila: nFila, motivo: `Código repetido: ${codigo}` });
      return;
    }
    vistos.add(codigo);
    filaDe.set(codigo, nFila);

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

    const primerItem = leerItem();

    /** Una columna de texto opcional: vacía es `null`, no cadena vacía. */
    const texto = (i: number | undefined) =>
      i !== undefined ? String(fila[i] ?? "").trim() || null : null;

    filas.push({
      codigo,
      nombre: nombreBruto || `Tienda ${codigo}`,
      distrito:
        mapa.distrito !== undefined
          ? String(fila[mapa.distrito] ?? "").trim() || null
          : null,
      lat,
      lon,
      bultos_default: bultos !== null && bultos >= 0 ? Math.round(bultos) : primerItem
        ? Math.round(primerItem.cantidad)
        : 1,
      prioridad:
        prioridad !== null ? Math.min(9, Math.max(0, Math.round(prioridad))) : 0,
      ventana_ini: vIni,
      ventana_fin: vFin,
      direccion: texto(mapa.direccion),
      telefono: texto(mapa.telefono),
      email: texto(mapa.email),
      contacto: texto(mapa.contacto),
      items: primerItem ? [primerItem] : [],
      extra: Object.fromEntries(
        extras
          .map((c) => [c.nombre, String(fila[c.i] ?? "").trim()])
          .filter(([, v]) => v !== ""),
      ),
    });
  });

  return {
    filas,
    errores,
    avisos: revisarCoordenadas(filas, (c) => filaDe.get(c) ?? 0),
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
    direccion: f.direccion,
    telefono: f.telefono,
    email: f.email,
    contacto: f.contacto,
    items: f.items,
    extra: f.extra,
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
    "codigo_sucursal,name_sucursal,distrito,latitud,longitud,cantidad_bultos,prioridad,hora_inicio,hora_fin,etiquetas";
  const ejemplos = [
    "294,1ro de Mayo VES,Villa El Salvador,-12.197770,-76.966510,12,0,,,",
    "275,24 de Junio VES,Villa El Salvador,-12.205820,-76.940960,8,1,09:00,13:00,refrigerado",
    "2278,Alamos 17 VES,Villa El Salvador,-12.209451,-76.942489,15,0,,,",
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
  { nombre: "etiquetas", obligatoria: false, descripcion: "Lo que exige del vehículo, separado por comas. Ej. refrigerado" },
];
