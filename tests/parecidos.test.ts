/**
 * «Esta fragancia me recuerda a»: los tres primeros perfumes del bloque, con
 * sus votos a favor y en contra.
 *
 * El bloque se mete en la pagina REAL pegada (`fragrantica-pegado-ruidoso.txt`)
 * justo donde va, encima de «A los usuarios que les gusta…», para que lo que
 * lo rodea —tarjetas con «Comparar», recuentos de la puntuacion, reseñas— sea
 * el de verdad. Las tarjetas en si son sinteticas: ver `fixtures/fragrantica.ts`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { desempaquetarFicha, empaquetarFicha } from '@/dominio/ficha-compartida';
import { leerFichaFragrantica } from '@/dominio/fragrantica';
import { parecidosValidos, porcentajePositivo } from '@/dominio/parecidos';
import {
  FICHA_EN_INGLES,
  PAGINA_SIN_DATOS,
  PARECIDOS_HTML,
  PARECIDOS_TEXTO,
  TEXTO_PEGADO,
} from './fixtures/fragrantica';

const leer = (nombre: string) =>
  readFileSync(new URL(`./fixtures/fragrantica-${nombre}`, import.meta.url), 'utf8');
const paginaReal = leer('pegado-ruidoso.txt');

const VECINO = 'A los usuarios que les gusta esta fragancia, también les gusta:';

/** La pagina real con el bloque donde Fragrantica lo pone. */
const conBloque = (bloque: string) => {
  expect(paginaReal).toContain(VECINO);
  return paginaReal.replace(VECINO, `${bloque}\n${VECINO}`);
};

const parecidosDe = (fuente: string) => leerFichaFragrantica(fuente).parecidos;

const TRES_PRIMEROS = [
  { marca: 'Armaf', nombre: 'Club de Nuit Intense Man', positivos: 1200, negativos: 87 },
  { marca: 'Versace', nombre: 'Eros', positivos: 640, negativos: 112 },
  { marca: 'Rasasi', nombre: 'Hawas for Him', positivos: 95, negativos: 41 },
];

describe('lectura del bloque', () => {
  it('saca los tres primeros con sus votos, en el orden de la ficha', () => {
    expect(parecidosDe(conBloque(PARECIDOS_TEXTO))).toEqual(TRES_PRIMEROS);
  });

  it('lee igual el HTML', () => {
    expect(parecidosDe(PARECIDOS_HTML)).toEqual(TRES_PRIMEROS);
  });

  it('con menos de tres, para en el bloque siguiente y no se inventa más', () => {
    // Detras vienen «A los usuarios que les gusta…», la puntuacion con sus
    // recuentos y las reseñas: nada de eso es un parecido.
    const bloque = 'Esta fragancia me recuerda a\nVersace\nEros\n640\n112';
    expect(parecidosDe(conBloque(bloque))).toEqual([TRES_PRIMEROS[1]]);
  });

  it('un perfume que se llama con un número no se confunde con los votos', () => {
    const bloque = [
      'Esta fragancia me recuerda a',
      'Carolina Herrera',
      '212',
      '54',
      '9',
      'Daniel Josier',
      '28',
      '3',
      '1',
    ].join('\n');
    expect(parecidosDe(conBloque(bloque))).toEqual([
      { marca: 'Carolina Herrera', nombre: '212', positivos: 54, negativos: 9 },
      { marca: 'Daniel Josier', nombre: '28', positivos: 3, negativos: 1 },
    ]);
  });

  it('acepta los dos recuentos en la misma línea y salta iconos, porcentajes y botones', () => {
    const bloque = [
      'Esta fragancia me recuerda a',
      'Versace',
      'Eros',
      '👍 640 👎 112',
      '85%',
      'Comparar',
      'Rasasi',
      'Hawas for Him',
      '👍',
      '95',
      '👎',
      '41',
    ].join('\n');
    expect(parecidosDe(conBloque(bloque))).toEqual(TRES_PRIMEROS.slice(1));
  });

  it('si la tarjeta no separa marca y nombre, el nombre va entero', () => {
    const bloque = 'Esta fragancia me recuerda a\nEros Versace\n640\n112';
    expect(parecidosDe(conBloque(bloque))).toEqual([
      { marca: null, nombre: 'Eros Versace', positivos: 640, negativos: 112 },
    ]);
  });

  it('un rótulo suelto antes de la primera tarjeta no se pega a la marca ni al nombre', () => {
    const bloque = [
      'Esta fragancia me recuerda a',
      'Vota las que se le parecen',
      'Armaf',
      'Club de Nuit Intense Man',
      '1.2k',
      '87',
    ].join('\n');
    expect(parecidosDe(conBloque(bloque))).toEqual([TRES_PRIMEROS[0]]);
  });

  it('lo leído siempre pasa la validación, aunque el bloque traiga líneas largas', () => {
    // Si no la pasara, guardar el perfume fallaria por culpa de Fragrantica.
    const larga = 'x'.repeat(79);
    const bloque = ['Esta fragancia me recuerda a', larga, larga, larga, larga, larga, '10', '2'];
    const parecidos = parecidosDe(conBloque(bloque.join('\n')));
    expect(parecidos).toHaveLength(1);
    expect(parecidosValidos({ leidosEn: new Date().toISOString(), perfumes: parecidos })).not.toBeNull();
  });

  it('si el rótulo sale antes sin tarjetas (un índice), vale el bloque de verdad', () => {
    const pagina = conBloque(PARECIDOS_TEXTO).replace(
      'Composición de la fragancia',
      'Esta fragancia me recuerda a\nComposición de la fragancia',
    );
    expect(parecidosDe(pagina)).toEqual(TRES_PRIMEROS);
  });

  it('lee el rótulo de la ficha en inglés', () => {
    const bloque = PARECIDOS_TEXTO.replace('Esta fragancia me recuerda a:', 'This perfume reminds me of');
    expect(parecidosDe(`${bloque}\nPeople who like this also like:\nVersace\nEros`)).toEqual(
      TRES_PRIMEROS,
    );
  });

  it('sin el bloque no hay parecidos, también en las fichas reales', () => {
    // El HTML del servidor no lo trae: Fragrantica lo pinta en el navegador.
    for (const fuente of [
      paginaReal,
      leer('popular.html'),
      leer('nicho.html'),
      FICHA_EN_INGLES,
      TEXTO_PEGADO,
      PAGINA_SIN_DATOS,
    ]) {
      expect(parecidosDe(fuente)).toEqual([]);
    }
  });

  it('el bloque no cambia nada de lo demás que se lee', () => {
    const sin = leerFichaFragrantica(paginaReal);
    const con = leerFichaFragrantica(conBloque(PARECIDOS_TEXTO));
    expect({ ...con, parecidos: [] }).toEqual(sin);
  });
});

describe('porcentaje a favor', () => {
  it.each([
    [1200, 87, 93],
    [1, 2, 33],
    [5, 0, 100],
    [0, 5, 0],
  ])('%i a favor y %i en contra: %i %%', (positivos, negativos, pct) => {
    expect(porcentajePositivo({ positivos, negativos })).toBe(pct);
  });

  it('sin votos no hay porcentaje', () => {
    expect(porcentajePositivo({ positivos: 0, negativos: 0 })).toBeNull();
  });
});

describe('lo guardado se valida antes de usarlo', () => {
  const bueno = { leidosEn: '2026-10-16T20:00:00.000Z', perfumes: TRES_PRIMEROS };

  it('una lectura bien formada pasa tal cual', () => {
    expect(parecidosValidos(bueno)).toEqual(bueno);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['sin fecha', { perfumes: TRES_PRIMEROS }],
    ['fecha que no es fecha', { ...bueno, leidosEn: 'ayer' }],
    ['lista vacía', { ...bueno, perfumes: [] }],
    ['más de tres', { ...bueno, perfumes: [...TRES_PRIMEROS, TRES_PRIMEROS[0]] }],
    ['votos negativos', { ...bueno, perfumes: [{ ...TRES_PRIMEROS[0], negativos: -1 }] }],
    ['votos con decimales', { ...bueno, perfumes: [{ ...TRES_PRIMEROS[0], positivos: 1.5 }] }],
    ['nombre vacío', { ...bueno, perfumes: [{ ...TRES_PRIMEROS[0], nombre: '' }] }],
    ['perfumes que no son una lista', { ...bueno, perfumes: 'Eros' }],
  ])('devuelve null: %s', (_etiqueta, crudo) => {
    expect(parecidosValidos(crudo)).toBeNull();
  });
});

describe('viaje en la ficha compartida', () => {
  it('los parecidos llegan al formulario', () => {
    const ficha = leerFichaFragrantica(conBloque(PARECIDOS_TEXTO));
    expect(desempaquetarFicha(empaquetarFicha(ficha))?.parecidos).toEqual(TRES_PRIMEROS);
  });

  it('un enlace empaquetado antes de leerlos sigue valiendo, sin parecidos', () => {
    const { parecidos: _, ...antigua } = leerFichaFragrantica(paginaReal);
    const empaquetada = Buffer.from(JSON.stringify(antigua)).toString('base64url');
    expect(desempaquetarFicha(empaquetada)?.parecidos).toEqual([]);
  });

  it('unos parecidos mal formados invalidan el paquete', () => {
    const ficha = {
      ...leerFichaFragrantica(paginaReal),
      parecidos: [{ nombre: 'Eros', marca: null, positivos: '640', negativos: 112 }],
    };
    const empaquetada = Buffer.from(JSON.stringify(ficha)).toString('base64url');
    expect(desempaquetarFicha(empaquetada)).toBeNull();
  });
});
