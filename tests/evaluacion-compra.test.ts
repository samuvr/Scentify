import { describe, expect, it } from 'vitest';
import {
  bajarUnEscalon,
  evaluarCompra,
  parecidosEnLaColeccion,
  veredictoDeNota,
  type CandidatoCompra,
} from '@/dominio/evaluacion-compra';
import type { ContextoReparto } from '@/dominio/reparto';
import type { PerfumeCandidato } from '@/dominio/recomendacion';

const OFICINA = 'ctx-oficina';
const CITA = 'ctx-cita';
const GIMNASIO = 'ctx-gimnasio';
const CASA = 'ctx-casa';
const AMIGOS = 'ctx-amigos';

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

const contexto = (id: string, parcial: Partial<ContextoReparto> = {}): ContextoReparto => ({
  id,
  atemporal: false,
  momentos: ['DIA', 'NOCHE'],
  usosSemana: 1,
  pctNoche: 50,
  ...parcial,
});

const CONTEXTOS: ContextoReparto[] = [
  contexto(OFICINA, { momentos: ['DIA'], usosSemana: 5, pctNoche: 0 }),
  contexto(CITA, { usosSemana: 1, pctNoche: 80 }),
  contexto(GIMNASIO, { atemporal: true, usosSemana: 3 }),
  contexto(CASA, { usosSemana: null }),
  contexto(AMIGOS, { usosSemana: 3, pctNoche: 50 }),
];

const TODAS = ['PRIMAVERA', 'VERANO', 'OTONO', 'INVIERNO'] as const;

/** Oficina de dia muy servida en todas las estaciones; cita de noche, nada. */
const COLECCION: PerfumeCandidato[] = [
  ...Array.from({ length: 6 }, (_, i) =>
    perfume(`Oficina ${i}`, { estaciones: [...TODAS] }),
  ),
  perfume('Gym', { contextos: [GIMNASIO], estaciones: [...TODAS] }),
  perfume('Cita dia', { contextos: [CITA], momentos: ['DIA'], estaciones: [...TODAS] }),
  // Lo normal en esta coleccion: uno por casilla.
  perfume('Amigos', { contextos: [AMIGOS], momentos: ['DIA', 'NOCHE'], estaciones: [...TODAS] }),
];

const candidato = (parcial: Partial<CandidatoCompra>): CandidatoCompra => ({
  nombre: 'Nuevo',
  marca: 'Marca',
  contextos: [CITA],
  momentos: ['NOCHE'],
  estaciones: ['INVIERNO'],
  ...parcial,
});

describe('veredictoDeNota', () => {
  it('pone los cortes en 0,6 y 0,3', () => {
    expect(veredictoDeNota(null)).toBe('sin-datos');
    expect(veredictoDeNota(0.6)).toBe('merece');
    expect(veredictoDeNota(0.59)).toBe('aporta');
    expect(veredictoDeNota(0.3)).toBe('aporta');
    expect(veredictoDeNota(0.29)).toBe('prescindible');
  });

  it('el parecido baja un escalon, sin pasar de prescindible', () => {
    expect(bajarUnEscalon('merece')).toBe('aporta');
    expect(bajarUnEscalon('aporta')).toBe('prescindible');
    expect(bajarUnEscalon('prescindible')).toBe('prescindible');
    expect(bajarUnEscalon('sin-datos')).toBe('sin-datos');
  });
});

describe('evaluarCompra', () => {
  it('merece la pena si llena casillas vacias', () => {
    const ev = evaluarCompra({ candidato: candidato({}), coleccion: COLECCION, contextos: CONTEXTOS });
    expect(ev.veredicto).toBe('merece');
    expect(ev.nota).toBe(1);
    expect(ev.casillas).toHaveLength(1);
    const [casilla] = ev.casillas;
    expect(casilla).toMatchObject({ contextoId: CITA, momento: 'NOCHE', estacion: 'INVIERNO' });
    expect(casilla!.antes.nivel).toBe('vacia');
    expect(casilla!.antes.cuantos).toBe(0);
    expect(casilla!.despues.cuantos).toBe(1);
    expect(casilla!.competidores).toEqual([]);
  });

  it('es prescindible si solo cae donde ya vas holgado, y dice con quien compite', () => {
    const ev = evaluarCompra({
      candidato: candidato({ contextos: [OFICINA], momentos: ['DIA'], estaciones: ['VERANO'] }),
      coleccion: COLECCION,
      contextos: CONTEXTOS,
    });
    expect(ev.casillas[0]!.antes.nivel).toBe('holgada');
    expect(ev.veredicto).toBe('prescindible');
    expect(ev.casillas[0]!.competidores.map((c) => c.nombre)).toHaveLength(6);
  });

  it('no cuenta la noche en un contexto que solo existe de dia', () => {
    const ev = evaluarCompra({
      candidato: candidato({ contextos: [OFICINA], momentos: ['NOCHE'] }),
      coleccion: COLECCION,
      contextos: CONTEXTOS,
    });
    expect(ev.casillas).toEqual([]);
    expect(ev.veredicto).toBe('sin-datos');
    expect(ev.contextosSinJuzgar).toEqual([OFICINA]);
  });

  it('un contexto sin frecuencia no se juzga', () => {
    const ev = evaluarCompra({
      candidato: candidato({ contextos: [CASA, CITA] }),
      coleccion: COLECCION,
      contextos: CONTEXTOS,
    });
    expect(ev.contextosSinJuzgar).toEqual([CASA]);
    expect(ev.casillas.every((c) => c.contextoId === CITA)).toBe(true);
  });

  it('un contexto atemporal es una casilla sola', () => {
    const ev = evaluarCompra({
      candidato: candidato({ contextos: [GIMNASIO], momentos: ['DIA'], estaciones: ['VERANO'] }),
      coleccion: COLECCION,
      contextos: CONTEXTOS,
    });
    expect(ev.casillas).toHaveLength(1);
    expect(ev.casillas[0]).toMatchObject({ contextoId: GIMNASIO, momento: null, estacion: null });
    expect(ev.casillas[0]!.competidores.map((c) => c.nombre)).toEqual(['Gym']);
  });

  it('mezcla: las casillas pesan segun cuanto se usa su contexto', () => {
    const ev = evaluarCompra({
      candidato: candidato({
        contextos: [OFICINA, CITA],
        momentos: ['DIA', 'NOCHE'],
        estaciones: ['INVIERNO'],
      }),
      coleccion: COLECCION,
      contextos: CONTEXTOS,
    });
    // Cita · Noche vacia primero; Oficina · Dia holgada al final.
    expect(ev.casillas[0]!.antes.nivel).toBe('vacia');
    expect(ev.casillas.at(-1)!.antes.nivel).toBe('holgada');
    expect(ev.nota).not.toBeNull();
    expect(ev.nota!).toBeGreaterThan(0);
    expect(ev.nota!).toBeLessThan(1);
  });

  it('no cuenta lo archivado ni lo que tuve como competidor', () => {
    const ev = evaluarCompra({
      candidato: candidato({}),
      coleccion: [
        ...COLECCION,
        perfume('Viejo', { contextos: [CITA], momentos: ['NOCHE'], estaciones: ['INVIERNO'], estado: 'LO_TUVE' }),
        perfume('Guardado', { contextos: [CITA], momentos: ['NOCHE'], estaciones: ['INVIERNO'], archivado: true }),
      ],
      contextos: CONTEXTOS,
    });
    expect(ev.casillas[0]!.competidores).toEqual([]);
    expect(ev.veredicto).toBe('merece');
  });

  it('si se parece a uno que tengo, baja un escalon', () => {
    const ev = evaluarCompra({
      candidato: candidato({}),
      coleccion: COLECCION,
      contextos: CONTEXTOS,
      parecidos: [
        { perfumeId: 'id-Gym', nombre: 'Gym', marca: 'Lattafa', comunes: ['Ámbar'], segunFragrantica: true },
      ],
    });
    expect(ev.veredictoPorCasillas).toBe('merece');
    expect(ev.veredicto).toBe('aporta');
  });
});

describe('parecidosEnLaColeccion', () => {
  const coleccion = [
    perfume('Khamrah', { marca: 'Lattafa' }),
    perfume('Asad', { marca: 'Lattafa' }),
    perfume('Antiguo', { marca: 'Lattafa', estado: 'LO_TUVE' }),
  ];

  it('junta notas comunes y «me recuerda a» en el mismo perfume', () => {
    const lista = parecidosEnLaColeccion(
      [{ perfumeId: 'id-Asad', nombre: 'Asad', marca: 'Lattafa', comunes: ['Ámbar', 'Vainilla', 'Tabaco'] }],
      [
        { nombre: 'khamrah', marca: 'LATTAFA' },
        { nombre: 'Asad', marca: null },
        { nombre: 'Antiguo', marca: 'Lattafa' },
        { nombre: 'Khamrah', marca: 'Otra' },
      ],
      coleccion,
    );
    expect(lista).toEqual([
      { perfumeId: 'id-Asad', nombre: 'Asad', marca: 'Lattafa', comunes: ['Ámbar', 'Vainilla', 'Tabaco'], segunFragrantica: true },
      { perfumeId: 'id-Khamrah', nombre: 'Khamrah', marca: 'Lattafa', comunes: [], segunFragrantica: true },
    ]);
  });
});

describe('resumenEvaluacion', () => {
  it('dice que llena y donde ya vas servido', async () => {
    const { resumenEvaluacion } = await import('@/componentes/ResultadoEvaluacion');
    const ev = evaluarCompra({
      candidato: candidato({ contextos: [OFICINA, CITA], momentos: ['DIA', 'NOCHE'], estaciones: ['INVIERNO'] }),
      coleccion: COLECCION,
      contextos: CONTEXTOS,
    });
    const texto = resumenEvaluacion(ev);
    expect(texto).toMatch(/^Llena 1 casilla vacía/);
    expect(texto).toContain('holgada');
  });

  it('avisa cuando baja por parecerse', async () => {
    const { resumenEvaluacion } = await import('@/componentes/ResultadoEvaluacion');
    const ev = evaluarCompra({
      candidato: candidato({}),
      coleccion: COLECCION,
      contextos: CONTEXTOS,
      parecidos: [{ perfumeId: 'id-Gym', nombre: 'Gym', marca: 'Lattafa', comunes: [], segunFragrantica: true }],
    });
    expect(resumenEvaluacion(ev)).toContain('sería «Merece la pena», pero se parece');
  });
});
