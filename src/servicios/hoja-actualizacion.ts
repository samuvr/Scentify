/**
 * Seccion 9 — La hoja Excel para actualizar concentracion, volumen y
 * valoracion de toda la coleccion de una vez. La logica de que cambia y que
 * no esta en `dominio/hoja-actualizacion.ts`; aqui solo el fichero y la base
 * de datos.
 */
import 'server-only';
import ExcelJS from 'exceljs';
import { and, asc, eq } from 'drizzle-orm';
import { crearDb, schema } from '@/db';
import {
  analizarHoja,
  COLUMNAS_HOJA,
  CONCENTRACIONES,
  filaParaHoja,
  type AnalisisHoja,
  type Celda,
  type FilaHoja,
} from '@/dominio/hoja-actualizacion';
import { cambiarConcentracion } from './perfumes';

async function leerActuales(userId: string): Promise<FilaHoja[]> {
  return crearDb()
    .select({
      id: schema.perfume.id,
      nombre: schema.ficha.nombre,
      marca: schema.ficha.marca,
      concentracion: schema.ficha.concentracion,
      volumenMl: schema.perfume.volumenMl,
      valoracion: schema.perfume.valoracion,
    })
    .from(schema.perfume)
    .innerJoin(schema.ficha, eq(schema.ficha.id, schema.perfume.fichaId))
    .where(eq(schema.perfume.userId, userId))
    .orderBy(asc(schema.ficha.marca), asc(schema.ficha.nombre));
}

/* ------------------------------------------------------------ exportacion */

export async function exportarHojaActualizacion(userId: string): Promise<Buffer> {
  const perfumes = await leerActuales(userId);

  const libro = new ExcelJS.Workbook();
  libro.creator = 'Scentify';
  const hoja = libro.addWorksheet('Colección', { views: [{ state: 'frozen', ySplit: 1 }] });

  hoja.columns = COLUMNAS_HOJA.map((c) => ({
    header: c.titulo,
    key: c.clave,
    width: c.clave === 'id' ? 38 : c.clave === 'nombre' ? 32 : c.clave === 'marca' ? 22 : 18,
    // El ID solo sirve para casar la fila al volver: oculto, nadie lo toca.
    hidden: c.clave === 'id',
  }));
  for (const p of perfumes) hoja.addRow(filaParaHoja(p));

  const ultima = Math.max(perfumes.length + 1, 2);
  COLUMNAS_HOJA.forEach((c, i) => {
    const columna = hoja.getColumn(i + 1);
    if (!c.editable) {
      // Gris para lo que se ignora al importar: que se vea que no se edita.
      columna.font = { color: { argb: 'FF808080' } };
      return;
    }
    const validacion: ExcelJS.DataValidation =
      c.clave === 'concentracion'
        ? {
            type: 'list',
            allowBlank: true,
            formulae: [`"${CONCENTRACIONES.join(',')}"`],
            showErrorMessage: true,
            errorTitle: 'Concentración',
            error: `Elige una de: ${CONCENTRACIONES.join(', ')}.`,
          }
        : c.clave === 'valoracion'
          ? {
              type: 'whole',
              operator: 'between',
              allowBlank: true,
              formulae: [1, 5],
              showErrorMessage: true,
              errorTitle: 'Valoración',
              error: 'Un número entero del 1 al 5.',
            }
          : {
              type: 'whole',
              operator: 'greaterThan',
              allowBlank: true,
              formulae: [0],
              showErrorMessage: true,
              errorTitle: 'Volumen',
              error: 'Los ml del frasco, como número entero.',
            };
    for (let fila = 2; fila <= ultima; fila += 1) {
      hoja.getCell(fila, i + 1).dataValidation = validacion;
    }
  });

  hoja.getRow(1).font = { bold: true };

  return Buffer.from(await libro.xlsx.writeBuffer());
}

/* ------------------------------------------------------------- importacion */

/** El valor que se ve en la celda, sin formulas ni texto enriquecido. */
function valorDeCelda(valor: ExcelJS.CellValue): Celda {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'object' || valor instanceof Date) return valor;
  if ('result' in valor) return valorDeCelda(valor.result as ExcelJS.CellValue);
  if ('richText' in valor) return valor.richText.map((t) => t.text).join('');
  if ('text' in valor) return valor.text;
  return null;
}

export async function leerHoja(fichero: ArrayBuffer): Promise<Celda[][]> {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(fichero);
  } catch {
    throw new Error('No se puede leer el fichero. Tiene que ser un Excel (.xlsx).');
  }
  const hoja = libro.worksheets[0];
  if (!hoja) return [];

  const filas: Celda[][] = [];
  hoja.eachRow({ includeEmpty: true }, (fila, numero) => {
    const celdas: Celda[] = [];
    for (let col = 1; col <= hoja.columnCount; col += 1) {
      celdas.push(valorDeCelda(fila.getCell(col).value));
    }
    filas[numero - 1] = celdas;
  });
  // `eachRow` se salta las filas que nunca existieron: se rellenan para que
  // los numeros de linea de los errores coincidan con los de Excel.
  return Array.from(filas, (f) => f ?? []);
}

export async function previsualizarHoja(userId: string, fichero: ArrayBuffer): Promise<AnalisisHoja> {
  const [filas, actuales] = await Promise.all([leerHoja(fichero), leerActuales(userId)]);
  return analizarHoja(filas, actuales);
}

export interface ResultadoActualizacion {
  actualizados: number;
  errores: string[];
}

/**
 * Vuelve a analizar el fichero contra lo guardado en el momento de aplicar,
 * no contra la previsualizacion: si algo ha cambiado entretanto, manda lo
 * que hay ahora.
 */
export async function aplicarHoja(
  userId: string,
  fichero: ArrayBuffer,
): Promise<ResultadoActualizacion> {
  const { cambios } = await previsualizarHoja(userId, fichero);
  const db = crearDb();
  const resultado: ResultadoActualizacion = { actualizados: 0, errores: [] };

  for (const cambio of cambios) {
    try {
      if (cambio.campos.includes('volumenMl') || cambio.campos.includes('valoracion')) {
        await db
          .update(schema.perfume)
          .set({
            volumenMl: cambio.despues.volumenMl,
            valoracion: cambio.despues.valoracion,
            actualizadoEn: new Date(),
          })
          .where(and(eq(schema.perfume.userId, userId), eq(schema.perfume.id, cambio.id)));
      }
      if (cambio.campos.includes('concentracion')) {
        await cambiarConcentracion(userId, cambio.id, cambio.despues.concentracion);
      }
      resultado.actualizados += 1;
    } catch (error) {
      resultado.errores.push(
        `${cambio.nombre}: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
    }
  }
  return resultado;
}
