import type { Worksheet } from "exceljs";

/**
 * Cómo se ven los informes en Excel.
 * ---------------------------------------------------------------------------
 * Un único sitio con los colores, los anchos y la forma de las tablas, para
 * que las dos hojas (tiempos y fichajes) salgan iguales y no haya que repetir
 * el formato en cada una. Los colores son los de la marca, en ARGB, que es lo
 * que entiende Excel.
 */
export const TINTA = {
  verde: "FF146C6B",
  verdeSuave: "FFDCEAE9",
  barra: "FF7FB3B1",
  ambar: "FFC98A2E",
  ambarSuave: "FFF6E9D2",
  rojo: "FFB14A3A",
  texto: "FF1C1B19",
  gris: "FF8A867E",
  linea: "FFE3E0DA",
  banda: "FFF7F6F3",
  papel: "FFFFFFFF",
} as const;

export type Columna = {
  titulo: string;
  ancho?: number;
  /** Formato de número de Excel, p. ej. '0.00" h"' o '0.0%'. */
  formato?: string;
  alinear?: "left" | "center" | "right";
  /** Pinta una barra dentro de la celda proporcional al valor. */
  barra?: boolean;
};

export type Valor = string | number | null;

const BORDE_FINO = {
  top: { style: "thin" as const, color: { argb: TINTA.linea } },
  left: { style: "thin" as const, color: { argb: TINTA.linea } },
  bottom: { style: "thin" as const, color: { argb: TINTA.linea } },
  right: { style: "thin" as const, color: { argb: TINTA.linea } },
};

/** Letra de columna de Excel: 1 -> A, 27 -> AA. */
export function letra(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Cabecera de la hoja: nombre del informe, periodo y de dónde sale. */
export function portada(
  ws: Worksheet,
  { titulo, periodo, pie }: { titulo: string; periodo: string; pie: string },
): number {
  ws.getCell("A1").value = "21days agency";
  ws.getCell("A1").font = { name: "Calibri", size: 10, bold: true, color: { argb: TINTA.verde } };

  ws.getCell("A2").value = titulo;
  ws.getCell("A2").font = { name: "Calibri", size: 18, bold: true, color: { argb: TINTA.texto } };

  ws.getCell("A3").value = periodo;
  ws.getCell("A3").font = { name: "Calibri", size: 11, color: { argb: TINTA.gris } };

  ws.getCell("A4").value = pie;
  ws.getCell("A4").font = { name: "Calibri", size: 9, italic: true, color: { argb: TINTA.gris } };

  ws.getRow(2).height = 24;
  return 6;
}

/** Fila de cifras grandes: el titular del informe. */
export function kpis(
  ws: Worksheet,
  fila: number,
  datos: { etiqueta: string; valor: string | number; formato?: string }[],
): number {
  datos.forEach((d, i) => {
    const col = 1 + i * 2;
    // Las etiquetas son largas: sin un ancho mínimo se cortan.
    for (const c of [col, col + 1]) {
      const columna = ws.getColumn(c);
      if (!columna.width || columna.width < 13) columna.width = 13;
    }
    const rango = `${letra(col)}${fila}:${letra(col + 1)}${fila}`;
    ws.mergeCells(rango);
    const celda = ws.getCell(fila, col);
    celda.value = d.valor;
    if (d.formato) celda.numFmt = d.formato;
    celda.font = { name: "Calibri", size: 16, bold: true, color: { argb: TINTA.verde } };
    celda.alignment = { horizontal: "left", vertical: "middle" };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TINTA.verdeSuave } };

    const abajo = `${letra(col)}${fila + 1}:${letra(col + 1)}${fila + 1}`;
    ws.mergeCells(abajo);
    const pie = ws.getCell(fila + 1, col);
    pie.value = d.etiqueta;
    pie.font = { name: "Calibri", size: 9, color: { argb: TINTA.gris } };
    pie.alignment = { horizontal: "left", vertical: "top" };
    pie.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TINTA.verdeSuave } };
  });
  ws.getRow(fila).height = 26;
  ws.getRow(fila + 1).height = 15;
  return fila + 3;
}

/**
 * Una tabla con su título, su cabecera verde, filas alternas y, si se pide,
 * barras dentro de la celda. Devuelve la primera fila libre de debajo.
 */
export function tabla(
  ws: Worksheet,
  fila: number,
  opciones: {
    titulo?: string;
    columnas: Columna[];
    filas: Valor[][];
    /** Fila de totales, en negrita y con línea encima. */
    totales?: Valor[];
    /** Congela la cabecera de esta tabla (solo tiene sentido en la primera). */
    congelar?: boolean;
    /** Añade los filtros de Excel a la cabecera. */
    filtros?: boolean;
  },
): number {
  const { titulo, columnas, filas, totales, congelar, filtros } = opciones;
  let f = fila;

  if (titulo) {
    const celda = ws.getCell(f, 1);
    celda.value = titulo;
    celda.font = { name: "Calibri", size: 12, bold: true, color: { argb: TINTA.texto } };
    f += 1;
  }

  const filaCabecera = f;
  columnas.forEach((c, i) => {
    const celda = ws.getCell(f, i + 1);
    celda.value = c.titulo;
    celda.font = { name: "Calibri", size: 10, bold: true, color: { argb: TINTA.papel } };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TINTA.verde } };
    celda.alignment = { horizontal: c.alinear ?? "left", vertical: "middle", wrapText: true };
    celda.border = BORDE_FINO;
    const columna = ws.getColumn(i + 1);
    const ancho = c.ancho ?? Math.max(11, Math.min(38, c.titulo.length + 4));
    if (!columna.width || columna.width < ancho) columna.width = ancho;
  });
  ws.getRow(f).height = 20;
  f += 1;

  const primeraFila = f;
  filas.forEach((datos, indice) => {
    columnas.forEach((c, i) => {
      const celda = ws.getCell(f, i + 1);
      celda.value = datos[i] ?? null;
      if (c.formato) celda.numFmt = c.formato;
      celda.font = { name: "Calibri", size: 10, color: { argb: TINTA.texto } };
      celda.alignment = { horizontal: c.alinear ?? "left", vertical: "middle" };
      celda.border = BORDE_FINO;
      if (indice % 2 === 1) {
        celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TINTA.banda } };
      }
    });
    f += 1;
  });
  const ultimaFila = f - 1;

  if (totales) {
    columnas.forEach((c, i) => {
      const celda = ws.getCell(f, i + 1);
      celda.value = totales[i] ?? null;
      if (c.formato) celda.numFmt = c.formato;
      celda.font = { name: "Calibri", size: 10, bold: true, color: { argb: TINTA.texto } };
      celda.alignment = { horizontal: c.alinear ?? "left", vertical: "middle" };
      celda.border = {
        ...BORDE_FINO,
        top: { style: "medium", color: { argb: TINTA.verde } },
      };
      celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TINTA.verdeSuave } };
    });
    f += 1;
  }

  // Las barras dentro de la celda son lo que hace legible la tabla de un
  // vistazo: se ve quién carga más sin tener que comparar cifras.
  if (filas.length > 0) {
    columnas.forEach((c, i) => {
      if (!c.barra) return;
      const ref = `${letra(i + 1)}${primeraFila}:${letra(i + 1)}${ultimaFila}`;
      ws.addConditionalFormatting({
        ref,
        rules: [
          {
            type: "dataBar",
            priority: 1,
            gradient: true,
            cfvo: [{ type: "num", value: 0 }, { type: "max" }],
            // `color` existe en el formato de Excel aunque falte en los tipos.
            color: { argb: TINTA.barra },
          } as never,
        ],
      });
    });
  }

  if (filtros && filas.length > 0) {
    ws.autoFilter = {
      from: { row: filaCabecera, column: 1 },
      to: { row: ultimaFila, column: columnas.length },
    };
  }

  if (congelar) {
    ws.views = [{ state: "frozen", ySplit: filaCabecera }];
  }

  return f + 1;
}

/** Descarga el libro con el nombre que se le pase. */
export async function descargar(libro: import("exceljs").Workbook, nombre: string) {
  const datos = await libro.xlsx.writeBuffer();
  const blob = new Blob([datos], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
