/**
 * La ficha viaja del destino de compartir al formulario por la URL, asi que
 * la escribe quien quiera. Estos casos son los que romperian el formulario en
 * tiempo de ejecucion si se aceptaran.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { desempaquetarFicha, empaquetarFicha } from '@/dominio/ficha-compartida';
import { leerFichaFragrantica } from '@/dominio/fragrantica';

const paginaReal = readFileSync(
  new URL('./fixtures/fragrantica-pegado-ruidoso.txt', import.meta.url),
  'utf8',
);

describe('ida y vuelta de la ficha compartida', () => {
  it('una ficha real sobrevive al viaje sin perder nada', () => {
    const original = leerFichaFragrantica(paginaReal);
    const vuelta = desempaquetarFicha(empaquetarFicha(original));
    expect(vuelta).toEqual(original);
  });

  it('cabe de sobra en una URL', () => {
    const empaquetada = empaquetarFicha(leerFichaFragrantica(paginaReal));
    expect(empaquetada.length).toBeLessThan(4000);
  });
});

describe('no se acepta cualquier cosa', () => {
  it.each([
    ['vacío', ''],
    ['no es base64', '!!!!'],
    ['base64 que no es JSON', Buffer.from('hola').toString('base64url')],
    ['JSON que no es una ficha', Buffer.from('{"a":1}').toString('base64url')],
    ['null', Buffer.from('null').toString('base64url')],
    ['una lista', Buffer.from('[]').toString('base64url')],
    [
      'ficha a la que le falta un nivel de la pirámide',
      Buffer.from(
        JSON.stringify({
          estaciones: null,
          momentos: null,
          notas: { salida: [], corazon: [] },
          marca: null,
          anio: null,
          acordes: [],
        }),
      ).toString('base64url'),
    ],
    [
      'notas que no son textos',
      Buffer.from(
        JSON.stringify({
          estaciones: null,
          momentos: null,
          notas: { salida: [{ malicioso: true }], corazon: [], fondo: [] },
          marca: null,
          anio: null,
          acordes: [],
        }),
      ).toString('base64url'),
    ],
  ])('devuelve null: %s', (_etiqueta, entrada) => {
    expect(desempaquetarFicha(entrada)).toBeNull();
  });

  it('devuelve null si no llega nada', () => {
    expect(desempaquetarFicha(undefined)).toBeNull();
  });
});
