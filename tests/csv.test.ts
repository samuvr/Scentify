/** Seccion 9 — Lectura y escritura de CSV. */
import { describe, expect, it } from 'vitest';
import {
  analizarCsvColeccion,
  CABECERAS_COLECCION,
  parsearCsv,
  serializarCsv,
} from '@/dominio/csv';

describe('parseo de CSV', () => {
  it('lee un fichero sencillo', () => {
    expect(parsearCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('respeta las comas dentro de un campo entrecomillado', () => {
    expect(parsearCsv('nombre,notas\n"Khamrah","canela, dátil, vainilla"')).toEqual([
      ['nombre', 'notas'],
      ['Khamrah', 'canela, dátil, vainilla'],
    ]);
  });

  it('entiende las comillas escapadas duplicándolas', () => {
    expect(parsearCsv('a\n"dice ""hola"" y se va"')).toEqual([['a'], ['dice "hola" y se va']]);
  });

  it('admite saltos de línea dentro de un campo', () => {
    expect(parsearCsv('a,b\n"linea 1\nlinea 2",x')).toEqual([
      ['a', 'b'],
      ['linea 1\nlinea 2', 'x'],
    ]);
  });

  it('acepta CRLF igual que LF', () => {
    expect(parsearCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('se come el BOM que mete Excel', () => {
    expect(parsearCsv('﻿nombre,marca\nA,B')[0]).toEqual(['nombre', 'marca']);
  });

  it('ignora las líneas en blanco entre registros', () => {
    expect(parsearCsv('a\n1\n\n2\n')).toEqual([['a'], ['1'], ['2']]);
  });

  it('conserva los campos vacíos de en medio', () => {
    expect(parsearCsv('a,b,c\n1,,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });
});

describe('serialización', () => {
  it('entrecomilla solo cuando hace falta', () => {
    expect(serializarCsv([['simple', 'con, coma', 'con "comillas"']])).toBe(
      'simple,"con, coma","con ""comillas"""',
    );
  });

  it('ida y vuelta sin pérdida', () => {
    const original = [
      ['nombre', 'notas'],
      ['Khamrah', 'canela, dátil\ny vainilla'],
      ['Asad', 'dice "fuerte"'],
    ];
    expect(parsearCsv(serializarCsv(original))).toEqual(original);
  });
});

describe('importación de colección', () => {
  const cabecera = CABECERAS_COLECCION.join(',');

  it('lee una fila completa', () => {
    const csv = `${cabecera}\nKhamrah,Lattafa,EDP,2022,100,2024-03-15,LO_TENGO,5,Canela;Nuez moscada,Dátil;Praliné,Vainilla;Haba tonka,Oriental;Gourmand,Oficina;Amigos,OTONO;INVIERNO,NOCHE,https://x.test/p/1,Mi favorito`;
    const resultado = analizarCsvColeccion(csv);

    expect(resultado.errores).toEqual([]);
    expect(resultado.filas).toHaveLength(1);
    expect(resultado.filas[0]).toMatchObject({
      nombre: 'Khamrah',
      marca: 'Lattafa',
      concentracion: 'EDP',
      anioLanzamiento: 2022,
      volumenMl: 100,
      estado: 'LO_TENGO',
      valoracion: 5,
      notasSalida: ['Canela', 'Nuez moscada'],
      notasFondo: ['Vainilla', 'Haba tonka'],
      contextos: ['Oficina', 'Amigos'],
      estaciones: ['OTONO', 'INVIERNO'],
      momentos: ['NOCHE'],
    });
  });

  it('solo exige nombre y marca', () => {
    const resultado = analizarCsvColeccion('nombre,marca\nAsad,Lattafa');
    expect(resultado.errores).toEqual([]);
    expect(resultado.filas[0]).toMatchObject({ nombre: 'Asad', estado: 'LO_TENGO' });
  });

  it('avisa fila a fila sin descartar el resto del fichero', () => {
    const csv = `nombre,marca,valoracion\nBueno,Marca,4\n,Sin nombre,3\nOtro,Marca,9`;
    const resultado = analizarCsvColeccion(csv);

    expect(resultado.filas.map((f) => f.nombre)).toEqual(['Bueno']);
    expect(resultado.errores).toEqual([
      { linea: 3, motivo: 'Nombre y marca son obligatorios.' },
      { linea: 4, motivo: 'La valoración va de 1 a 5.' },
    ]);
  });

  it('rechaza valores de enum que no existen, diciendo cuál', () => {
    const resultado = analizarCsvColeccion(
      'nombre,marca,estaciones\nX,Y,VERANO;PRIMEVERA',
    );
    expect(resultado.errores[0]?.motivo).toContain('PRIMEVERA');
  });

  it('exige la fecha en AAAA-MM-DD', () => {
    const resultado = analizarCsvColeccion('nombre,marca,fecha_compra\nX,Y,15/03/2024');
    expect(resultado.errores[0]?.motivo).toContain('AAAA-MM-DD');
  });

  it('no distingue mayúsculas en los enums ni en las cabeceras', () => {
    const resultado = analizarCsvColeccion('Nombre,Marca,Estado\nX,Y,lo_tuve');
    expect(resultado.errores).toEqual([]);
    expect(resultado.filas[0]?.estado).toBe('LO_TUVE');
  });

  it('ignora columnas que no conoce, pero las nombra', () => {
    const resultado = analizarCsvColeccion('nombre,marca,precio_pagado\nX,Y,42');
    expect(resultado.errores).toEqual([]);
    expect(resultado.cabecerasDesconocidas).toEqual(['precio_pagado']);
  });

  it('un fichero sin nombre ni marca no se importa a medias', () => {
    const resultado = analizarCsvColeccion('titulo,fabricante\nX,Y');
    expect(resultado.filas).toEqual([]);
    expect(resultado.errores[0]?.motivo).toContain('obligatorias');
  });

  it('un fichero vacío no revienta', () => {
    expect(analizarCsvColeccion('').errores[0]?.motivo).toContain('vacío');
  });
});
