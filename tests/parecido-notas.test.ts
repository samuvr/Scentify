import { describe, expect, it } from 'vitest';
import {
  compararPiramides,
  parecidosPorNotas,
  type NotaConNivel,
  type PerfumeConNotas,
} from '@/dominio/parecido-notas';

const n = (nivel: NotaConNivel['nivel'], ...nombres: string[]): NotaConNivel[] =>
  nombres.map((nombre) => ({ nombre, nivel }));

const perfume = (nombre: string, notas: NotaConNivel[]): PerfumeConNotas => ({
  id: `id-${nombre}`,
  nombre,
  marca: 'Marca',
  notas,
});

describe('compararPiramides', () => {
  it('suma uno por nota en el mismo nivel y medio si cambia de nivel', () => {
    const c = compararPiramides(
      [...n('SALIDA', 'Bergamota', 'Pimienta rosa'), ...n('CORAZON', 'Lavanda'), ...n('FONDO', 'Ámbar')],
      perfume('X', [...n('SALIDA', 'bergamota'), ...n('CORAZON', 'Pimienta Rosa', 'Lavanda'), ...n('FONDO', 'Cuero')]),
    );
    expect(c.puntos).toBe(2.5);
    expect(c.comunes).toEqual({ SALIDA: ['bergamota', 'Pimienta Rosa'], CORAZON: ['Lavanda'], FONDO: [] });
    // 2,5 sobre las 4 notas del mas corto.
    expect(c.proporcion).toBe(0.63);
  });

  it('una nota repetida en el perfume cuenta una vez', () => {
    const c = compararPiramides(
      n('SALIDA', 'Limón'),
      perfume('X', [...n('SALIDA', 'Limón'), ...n('FONDO', 'limon')]),
    );
    expect(c.puntos).toBe(1);
  });
});

describe('parecidosPorNotas', () => {
  const candidato = [
    ...n('SALIDA', 'Bergamota', 'Pimienta rosa', 'Cardamomo'),
    ...n('CORAZON', 'Lavanda', 'Iris'),
    ...n('FONDO', 'Ámbar', 'Cuero'),
  ];

  it('es parecido si coincide en salida y corazon aunque el fondo cambie', () => {
    const lista = parecidosPorNotas(candidato, [
      perfume('Gemelo de salida', [
        ...n('SALIDA', 'Bergamota', 'Pimienta rosa', 'Cardamomo'),
        ...n('CORAZON', 'Lavanda'),
        ...n('FONDO', 'Vainilla', 'Haba tonka'),
      ]),
    ]);
    expect(lista.map((p) => p.nombre)).toEqual(['Gemelo de salida']);
  });

  it('tres notas comunes cuentan segun lo larga que sea la piramide mas corta', () => {
    const largo = perfume('Largo', [
      ...n('SALIDA', 'Bergamota', 'Limón', 'Mandarina', 'Neroli', 'Pomelo'),
      ...n('CORAZON', 'Lavanda', 'Rosa', 'Jazmín', 'Geranio'),
      ...n('FONDO', 'Ámbar', 'Almizcle', 'Pachulí', 'Vetiver', 'Musgo'),
    ]);
    // Bergamota, lavanda y ambar: 3 puntos sobre las 7 notas del candidato.
    expect(parecidosPorNotas(candidato, [largo]).map((p) => p.nombre)).toEqual(['Largo']);
    const otroLargo = [
      ...candidato,
      ...n('SALIDA', 'Elemí', 'Jengibre', 'Enebro'),
      ...n('CORAZON', 'Salvia', 'Canela'),
    ];
    // Las mismas tres, pero sobre 12 notas: 0,25, no llega.
    expect(parecidosPorNotas(otroLargo, [largo])).toEqual([]);
  });

  it('tres notas de fondo comunes siguen bastando, como en la wishlist', () => {
    const muchas = [
      ...n('SALIDA', 'A', 'B', 'C', 'D', 'E', 'F'),
      ...n('CORAZON', 'G', 'H', 'I', 'J'),
      ...n('FONDO', 'Ámbar', 'Vainilla', 'Tabaco'),
    ];
    const otro = perfume('Fondo igual', [
      ...n('SALIDA', 'K', 'L', 'M', 'N', 'O', 'P'),
      ...n('CORAZON', 'Q', 'R', 'S', 'T'),
      ...n('FONDO', 'ambar', 'Vainilla', 'Tabaco'),
    ]);
    expect(parecidosPorNotas(muchas, [otro]).map((p) => p.nombre)).toEqual(['Fondo igual']);
  });

  it('sin notas no hay parecidos', () => {
    expect(parecidosPorNotas([], [perfume('X', n('SALIDA', 'Limón'))])).toEqual([]);
  });
});
