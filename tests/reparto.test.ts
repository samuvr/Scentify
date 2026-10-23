import { describe, expect, it } from 'vitest';
import { nivelDe, repartoPorContexto } from '@/dominio/reparto';
import type { PerfumeCandidato } from '@/dominio/recomendacion';

const OFICINA = 'ctx-oficina';
const GIMNASIO = 'ctx-gimnasio';

function perfume(nombre: string, parcial: Partial<PerfumeCandidato> = {}): PerfumeCandidato {
  return {
    id: `id-${nombre}`,
    nombre,
    marca: 'Lattafa',
    estado: 'LO_TENGO',
    archivado: false,
    momentos: ['DIA'],
    contextos: [OFICINA],
    estaciones: ['VERANO'],
    ultimoUso: null,
    vecesUsado: 0,
    ...parcial,
  };
}

const CONTEXTOS = [
  { id: OFICINA, atemporal: false },
  { id: GIMNASIO, atemporal: true },
];

describe('reparto por contexto, momento y estación', () => {
  it('cuenta cada momento y estación por separado y el atemporal en una sola casilla', () => {
    const { casillas } = repartoPorContexto(
      [
        perfume('a'),
        perfume('b', { momentos: ['DIA', 'NOCHE'], estaciones: ['VERANO', 'OTONO'] }),
        perfume('c', { contextos: [GIMNASIO], momentos: ['NOCHE'], estaciones: ['INVIERNO'] }),
      ],
      CONTEXTOS,
    );
    // 2 momentos x 4 estaciones + 1 del gimnasio
    expect(casillas).toHaveLength(9);
    const cuantos = (momento: string | null, estacion: string | null, contextoId = OFICINA) =>
      casillas.find(
        (c) => c.contextoId === contextoId && c.momento === momento && c.estacion === estacion,
      )?.cuantos;
    expect(cuantos('DIA', 'VERANO')).toBe(2);
    expect(cuantos('DIA', 'OTONO')).toBe(1);
    expect(cuantos('NOCHE', 'VERANO')).toBe(1);
    expect(cuantos('DIA', 'INVIERNO')).toBe(0);
    expect(cuantos(null, null, GIMNASIO)).toBe(1);
  });

  it('no cuenta lo archivado ni lo que ya no tengo', () => {
    const { casillas } = repartoPorContexto(
      [perfume('a', { archivado: true }), perfume('b', { estado: 'LO_TUVE' })],
      CONTEXTOS,
    );
    expect(casillas.every((c) => c.cuantos === 0 && c.nivel === 'vacia')).toBe(true);
  });

  it('separa el verano sobrecargado del otoño vacío en el mismo contexto', () => {
    const veraniegos = Array.from({ length: 8 }, (_, i) => perfume(`v${i}`));
    const { casillas, media } = repartoPorContexto(veraniegos, [{ id: OFICINA, atemporal: false }]);
    expect(media).toBe(1);
    const nivel = (estacion: string) =>
      casillas.find((c) => c.momento === 'DIA' && c.estacion === estacion)?.nivel;
    expect(nivel('VERANO')).toBe('sobrecargada');
    expect(nivel('OTONO')).toBe('vacia');
  });

  it('con una media baja, uno o dos más no es sobrecargar', () => {
    expect(nivelDe(3, 2)).toBe('normal');
    expect(nivelDe(4, 2)).toBe('sobrecargada');
    expect(nivelDe(1, 0.5)).toBe('escasa');
    expect(nivelDe(2, 6)).toBe('escasa');
    expect(nivelDe(3, 6)).toBe('normal');
  });
});
