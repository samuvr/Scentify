import { describe, expect, it } from 'vitest';
import {
  describirRotacion,
  nivelDe,
  repartoPorContexto,
  type ContextoReparto,
} from '@/dominio/reparto';
import type { PerfumeCandidato } from '@/dominio/recomendacion';

const OFICINA = 'ctx-oficina';
const GIMNASIO = 'ctx-gimnasio';
const CITA = 'ctx-cita';
const AMIGOS = 'ctx-amigos';
const ELEGANTE = 'ctx-elegante';
const CASA = 'ctx-casa';

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

const TODO_EL_AÑO = ['PRIMAVERA', 'VERANO', 'OTONO', 'INVIERNO'] as const;

function contexto(id: string, parcial: Partial<ContextoReparto> = {}): ContextoReparto {
  return {
    id,
    atemporal: false,
    momentos: ['DIA', 'NOCHE'],
    usosSemana: 1,
    pctNoche: 50,
    ...parcial,
  };
}

/** Las frecuencias del usuario: oficina y gimnasio 5, amigos 3, cita 1, elegante 0,5. */
const MIS_CONTEXTOS: ContextoReparto[] = [
  contexto(OFICINA, { momentos: ['DIA'], usosSemana: 5, pctNoche: 0 }),
  contexto(GIMNASIO, { atemporal: true, usosSemana: 5 }),
  contexto(CITA, { usosSemana: 1, pctNoche: 80 }),
  contexto(AMIGOS, { usosSemana: 3, pctNoche: 50 }),
  contexto(ELEGANTE, { usosSemana: 0.5, pctNoche: 80 }),
];

const casillaDe = (
  casillas: ReturnType<typeof repartoPorContexto>['casillas'],
  contextoId: string,
  momento: string | null,
  estacion: string | null,
) =>
  casillas.find(
    (c) => c.contextoId === contextoId && c.momento === momento && c.estacion === estacion,
  )!;

describe('reparto por contexto, momento y estación', () => {
  it('cuenta cada momento y estación por separado y el atemporal en una sola casilla', () => {
    const { casillas } = repartoPorContexto(
      [
        perfume('a'),
        perfume('b', { momentos: ['DIA', 'NOCHE'], estaciones: ['VERANO', 'OTONO'] }),
        perfume('c', { contextos: [GIMNASIO], momentos: ['NOCHE'], estaciones: ['INVIERNO'] }),
      ],
      [contexto(OFICINA), contexto(GIMNASIO, { atemporal: true })],
    );
    // 2 momentos x 4 estaciones + 1 del gimnasio
    expect(casillas).toHaveLength(9);
    const cuantos = (momento: string | null, estacion: string | null, contextoId = OFICINA) =>
      casillaDe(casillas, contextoId, momento, estacion).cuantos;
    expect(cuantos('DIA', 'VERANO')).toBe(2);
    expect(cuantos('DIA', 'OTONO')).toBe(1);
    expect(cuantos('NOCHE', 'VERANO')).toBe(1);
    expect(cuantos('DIA', 'INVIERNO')).toBe(0);
    expect(cuantos(null, null, GIMNASIO)).toBe(1);
  });

  it('un contexto que solo existe de día no tiene casillas de noche', () => {
    const { casillas } = repartoPorContexto(
      [perfume('a', { momentos: ['DIA', 'NOCHE'] })],
      MIS_CONTEXTOS,
    );
    const deOficina = casillas.filter((c) => c.contextoId === OFICINA);
    expect(deOficina).toHaveLength(4);
    expect(deOficina.every((c) => c.momento === 'DIA')).toBe(true);
  });

  it('no cuenta lo archivado ni lo que ya no tengo', () => {
    const { casillas, frascos } = repartoPorContexto(
      [perfume('a', { archivado: true }), perfume('b', { estado: 'LO_TUVE' })],
      MIS_CONTEXTOS,
    );
    expect(frascos).toBe(0);
    expect(casillas.every((c) => c.cuantos === 0 && c.nivel === 'vacia')).toBe(true);
  });

  // Dos contextos sencillos: la oficina de dia 4 veces por semana (pesa 2) y
  // la cita de noche 1 vez (pesa 1).
  const SENCILLOS: ContextoReparto[] = [
    contexto(OFICINA, { momentos: ['DIA'], usosSemana: 4 }),
    contexto(CITA, { momentos: ['NOCHE'], usosSemana: 1 }),
  ];
  const coleccionDe = (oficina: number, cita: number, citaInvierno = cita) => [
    ...Array.from({ length: oficina }, (_, i) =>
      perfume(`o${i}`, { estaciones: [...TODO_EL_AÑO] }),
    ),
    ...Array.from({ length: cita }, (_, i) =>
      perfume(`c${i}`, {
        contextos: [CITA],
        momentos: ['NOCHE'],
        estaciones: i < citaInvierno ? [...TODO_EL_AÑO] : ['PRIMAVERA', 'VERANO', 'OTONO'],
      }),
    ),
  ];

  it('una colección grande y bien repartida no sale de sobra en ninguna parte', () => {
    // 40 y 20 frascos para 4 y 1 usos por semana: cada uno sale cada ~2 meses
    // o mas, pero en proporcion a lo que pide cada contexto.
    const { casillas } = repartoPorContexto(coleccionDe(40, 20), SENCILLOS);
    expect(casillas.every((c) => c.nivel === 'normal')).toBe(true);
    expect(casillas.every((c) => c.cobertura === 1)).toBe(true);
    expect(casillaDe(casillas, CITA, 'NOCHE', 'VERANO').diasEntreUsos).toBe(140);
  });

  it('señala la casilla que va coja respecto al resto', () => {
    // Igual, pero para la cita de invierno solo quedan 4.
    const { casillas } = repartoPorContexto(coleccionDe(40, 20, 4), SENCILLOS);
    const coja = casillaDe(casillas, CITA, 'NOCHE', 'INVIERNO');
    expect(coja.nivel).toBe('escasa');
    expect(coja.cobertura!).toBeLessThan(0.5);
    const cojas = casillas.filter((c) => c.nivel === 'escasa' || c.nivel === 'vacia');
    expect(cojas).toEqual([coja]);
  });

  it('crecer por igual en todas partes no cambia el reparto', () => {
    // La oficina va por detras de la cita; triplicarlo todo no lo cambia.
    const coberturas = (oficina: number, cita: number) =>
      repartoPorContexto(coleccionDe(oficina, cita), SENCILLOS).casillas.map((c) => c.cobertura);
    expect(coberturas(6, 6)).toEqual(coberturas(2, 2));
    expect(coberturas(2, 2)[0]!).toBeLessThan(1);
  });

  it('con el mismo número, el contexto más usado va más cojo', () => {
    const deOficina = Array.from({ length: 6 }, (_, i) =>
      perfume(`o${i}`, { estaciones: [...TODO_EL_AÑO] }),
    );
    const elegantes = Array.from({ length: 6 }, (_, i) =>
      perfume(`e${i}`, {
        contextos: [ELEGANTE],
        momentos: ['NOCHE'],
        estaciones: [...TODO_EL_AÑO],
      }),
    );
    const { casillas } = repartoPorContexto(
      [...deOficina, ...elegantes],
      [
        contexto(OFICINA, { momentos: ['DIA'], usosSemana: 5 }),
        contexto(ELEGANTE, { momentos: ['NOCHE'], usosSemana: 0.5 }),
      ],
    );
    const oficina = casillaDe(casillas, OFICINA, 'DIA', 'INVIERNO');
    const elegante = casillaDe(casillas, ELEGANTE, 'NOCHE', 'INVIERNO');
    expect(oficina.cobertura!).toBeLessThan(1);
    expect(elegante.cobertura!).toBeGreaterThan(1);
    expect(oficina.esperado!).toBeGreaterThan(elegante.esperado!);
  });

  it('si casi todo está vacío, lo poco que hay no sale holgado', () => {
    const { casillas } = repartoPorContexto(
      [perfume('a', { contextos: [AMIGOS], momentos: ['DIA'], estaciones: ['VERANO'] })],
      MIS_CONTEXTOS,
    );
    expect(casillas.some((c) => c.nivel === 'holgada')).toBe(false);
    expect(casillaDe(casillas, AMIGOS, 'DIA', 'VERANO').nivel).toBe('normal');
    expect(casillaDe(casillas, OFICINA, 'DIA', 'VERANO').nivel).toBe('vacia');
  });

  it('el gimnasio es una casilla con el peso de todo su uso', () => {
    const { casillas } = repartoPorContexto(
      Array.from({ length: 10 }, (_, i) => perfume(`g${i}`, { contextos: [GIMNASIO] })),
      [contexto(GIMNASIO, { atemporal: true, usosSemana: 5 })],
    );
    expect(casillas).toHaveLength(1);
    expect(casillas[0]!.esperado).toBe(10);
    expect(casillas[0]!.nivel).toBe('normal');
    expect(casillas[0]!.diasEntreUsos).toBe(14);
  });

  it('sin frecuencia no se juzga, y no entra en el cálculo de los demás', () => {
    const { casillas, frascos } = repartoPorContexto(
      [perfume('casa', { contextos: [CASA] }), perfume('ofi', { estaciones: [...TODO_EL_AÑO] })],
      [
        contexto(OFICINA, { momentos: ['DIA'], usosSemana: 5 }),
        contexto(CASA, { usosSemana: null }),
      ],
    );
    expect(frascos).toBe(1);
    const deCasa = casillas.filter((c) => c.contextoId === CASA);
    expect(deCasa.every((c) => c.nivel === 'sin-frecuencia' && c.esperado === null)).toBe(true);
    expect(casillaDe(casillas, CASA, 'DIA', 'VERANO').cuantos).toBe(1);
  });

  it('un momento sin uso (0 % de noche) no se juzga', () => {
    const { casillas } = repartoPorContexto(
      [perfume('a', { contextos: [AMIGOS], momentos: ['NOCHE'] })],
      [contexto(AMIGOS, { usosSemana: 3, pctNoche: 0 })],
    );
    const noche = casillaDe(casillas, AMIGOS, 'NOCHE', 'VERANO');
    expect(noche.nivel).toBe('sin-uso');
    expect(noche.diasEntreUsos).toBeNull();
  });
});

describe('nivel de una casilla frente a lo esperado', () => {
  it('con pocos esperados, uno o dos más no es ir holgado', () => {
    expect(nivelDe(3, 2)).toBe('normal');
    expect(nivelDe(4, 2)).toBe('holgada');
    expect(nivelDe(2, 6)).toBe('escasa');
    expect(nivelDe(3, 6)).toBe('normal');
  });

  it('uno solo es escaso si se esperan dos o más, no si se espera uno', () => {
    expect(nivelDe(1, 1)).toBe('normal');
    expect(nivelDe(1, 1.4)).toBe('normal');
    expect(nivelDe(1, 2)).toBe('escasa');
    expect(nivelDe(0, 1)).toBe('vacia');
  });
});

describe('rotación legible', () => {
  it('días, semanas o meses según lo que tarde', () => {
    expect(describirRotacion(1)).toBe('cada día');
    expect(describirRotacion(7)).toBe('cada 7 días');
    expect(describirRotacion(21)).toBe('cada ~3 semanas');
    expect(describirRotacion(88)).toBe('cada ~3 meses');
  });
});
