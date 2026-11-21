/**
 * Exportar a Excel sin pasar por el servidor.
 *
 * Se genera un CSV, no un .xlsx: el formato binario necesitaría una
 * biblioteca entera para que Excel abra lo mismo que ya abre de un CSV. Lo
 * que sí hay que cuidar son las tres cosas que hacen que Excel lo abra mal:
 *
 * - El BOM, sin el cual las tildes salen como símbolos.
 * - El separador. En un Windows en español el separador de lista es el
 *   punto y coma, y un CSV con comas cae entero en la primera columna. Se
 *   declara con la línea `sep=;`, que Excel entiende y otros programas
 *   ignoran sin romperse.
 * - Las comillas: un texto con punto y coma, comillas o saltos de línea
 *   parte la fila si no va entrecomillado.
 */
function celda(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Un texto que empieza por =, +, - o @ lo interpreta Excel como fórmula.
  // Se le antepone un apóstrofo, que Excel no muestra.
  const seguro = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

export function aCSV(cabeceras: string[], filas: unknown[][]): string {
  const lineas = [
    "sep=;",
    cabeceras.map(celda).join(";"),
    ...filas.map((f) => f.map(celda).join(";")),
  ];
  return "﻿" + lineas.join("\r\n");
}

/** Descarga el contenido como archivo, sin tocar el servidor. */
export function descargar(nombre: string, contenido: string) {
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

/** Nombre con la fecha dentro, para que no se pisen en la carpeta. */
export function nombreArchivo(base: string, dia: string) {
  return `${base}-${dia}.csv`;
}
