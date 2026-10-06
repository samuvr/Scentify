/** Seccion 9 — Actualizar concentracion, volumen y valoracion desde Excel. */
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  analizarHoja,
  COLUMNAS_HOJA,
  filaParaHoja,
  type FilaHoja,
} from '@/dominio/hoja-actualizacion';
import { leerHoja } from '@/servicios/hoja-actualizacion';

const ACTUALES: FilaHoja[] = [
  { id: 'a', nombre: 'Khamrah', marca: 'Lattafa', concentracion: 'EDP', volumenMl: 100, valoracion: 4 },
  { id: 'b', nombre: 'Terre', marca: 'Hermès', concentracion: null, volumenMl: null, valoracion: null },
];

const CABECERA = COLUMNAS_HOJA.map((c) => c.titulo);
const hoja = (...filas: (string | number | null)[][]) => [CABECERA, ...filas];

describe('hoja de actualización', () => {
  it('la hoja exportada sin tocar no cambia nada', () => {
    const r = analizarHoja(hoja(...ACTUALES.map(filaParaHoja)), ACTUALES);
    expect(r.cambios).toEqual([]);
    expect(r.errores).toEqual([]);
    expect(r.sinCambios).toBe(2);
  });

  it('devuelve solo los campos que cambian, con el antes y el después', () => {
    const r = analizarHoja(
      hoja(['a', 'Khamrah', 'Lattafa', 'EDP', 100, 5], ['b', 'Terre', 'Hermès', 'edt', '50 ml', 3]),
      ACTUALES,
    );
    expect(r.cambios).toHaveLength(2);
    expect(r.cambios[0]).toMatchObject({ id: 'a', campos: ['valoracion'] });
    expect(r.cambios[1]).toMatchObject({
      id: 'b',
      campos: ['concentracion', 'volumenMl', 'valoracion'],
      despues: { concentracion: 'EDT', volumenMl: 50, valoracion: 3 },
    });
  });

  it('una celda vacía borra el dato', () => {
    const r = analizarHoja(hoja(['a', 'Khamrah', 'Lattafa', '', null, 4]), ACTUALES);
    expect(r.cambios[0]).toMatchObject({
      campos: ['concentracion', 'volumenMl'],
      despues: { concentracion: null, volumenMl: null, valoracion: 4 },
    });
  });

  it('ignora nombre y marca: lo que casa la fila es el ID', () => {
    const r = analizarHoja(hoja(['a', 'Otro nombre', 'Otra marca', 'EDP', 100, 4]), ACTUALES);
    expect(r.cambios).toEqual([]);
    expect(r.sinCambios).toBe(1);
  });

  it('acepta el nombre largo de la concentración', () => {
    const r = analizarHoja(hoja(['b', '', '', 'Eau de Parfum', null, null]), ACTUALES);
    expect(r.cambios[0]?.despues.concentracion).toBe('EDP');
  });

  it('señala cada fila que no entra, con su número', () => {
    const r = analizarHoja(
      hoja(
        ['a', '', '', 'EDX', 100, 4],
        ['b', '', '', null, -5, 9],
        ['zzz', '', '', 'EDP', 100, 4],
        [null, 'Sin id', '', 'EDP', 100, 4],
        [null, null, null, null, null, null],
      ),
      ACTUALES,
    );
    expect(r.cambios).toEqual([]);
    expect(r.errores.map((e) => e.linea)).toEqual([2, 3, 4, 5]);
    expect(r.errores[0]?.motivo).toContain('Concentración desconocida');
    expect(r.errores[1]?.motivo).toContain('Volumen no válido');
    expect(r.errores[1]?.motivo).toContain('Valoración no válida');
    expect(r.errores[2]?.motivo).toContain('no es de ningún perfume');
    expect(r.errores[3]?.motivo).toContain('sin ID');
  });

  it('no aplica dos veces el mismo perfume', () => {
    const r = analizarHoja(
      hoja(['a', '', '', 'EDP', 100, 5], ['a', '', '', 'EDP', 100, 1]),
      ACTUALES,
    );
    expect(r.cambios).toHaveLength(1);
    expect(r.errores[0]).toMatchObject({ linea: 3, motivo: expect.stringContaining('más de una vez') });
  });

  it('si falta una columna editable, ese campo no se toca', () => {
    const r = analizarHoja([['ID', 'Valoración'], ['a', 2]], ACTUALES);
    expect(r.columnasAusentes).toEqual(['concentracion', 'volumenMl']);
    expect(r.cambios[0]).toMatchObject({
      campos: ['valoracion'],
      despues: { concentracion: 'EDP', volumenMl: 100, valoracion: 2 },
    });
  });

  it('sin columna ID no hace nada', () => {
    const r = analizarHoja([['Nombre', 'Valoración'], ['Khamrah', 2]], ACTUALES);
    expect(r.cambios).toEqual([]);
    expect(r.errores[0]?.motivo).toContain('«ID»');
  });
});

describe('lectura del .xlsx', () => {
  it('lee lo que escribe Excel, incluidas fórmulas, con los números de fila de la hoja', async () => {
    const libro = new ExcelJS.Workbook();
    const h = libro.addWorksheet('Colección');
    h.addRow(CABECERA);
    h.addRow(['a', 'Khamrah', 'Lattafa', 'EDT', 75, { formula: '2+3', result: 5 }]);
    h.getRow(4).values = ['b', 'Terre', 'Hermès', 'EDP', 100, 3];
    const fichero = await libro.xlsx.writeBuffer();

    const filas = await leerHoja(fichero as ArrayBuffer);
    const r = analizarHoja(filas, ACTUALES);
    expect(r.errores).toEqual([]);
    expect(r.cambios.map((c) => c.despues)).toEqual([
      { concentracion: 'EDT', volumenMl: 75, valoracion: 5 },
      { concentracion: 'EDP', volumenMl: 100, valoracion: 3 },
    ]);
  });

  it('rechaza lo que no es un Excel', async () => {
    await expect(leerHoja(new TextEncoder().encode('nombre,marca').buffer)).rejects.toThrow(
      'Excel',
    );
  });
});
