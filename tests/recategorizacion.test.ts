import { describe, expect, it } from 'vitest';
import {
  desajustesDeMarcas,
  explicarPropuesta,
  restarDias,
  type MarcasActuales,
  type UsoParaEvidencia,
} from '@/dominio/recategorizacion';

const HOY = '2026-10-15';
const OFICINA = 'ctx-oficina';
const CITA = 'ctx-cita';
const GIMNASIO = 'ctx-gimnasio';

const marcas: MarcasActuales = {
  contextos: [CITA, GIMNASIO],
  momentos: ['NOCHE'],
  estaciones: ['OTONO', 'INVIERNO'],
};

function uso(diasAtras: number, parcial: Partial<UsoParaEvidencia> = {}): UsoParaEvidencia {
  return {
    fecha: restarDias(HOY, diasAtras),
    momento: 'NOCHE',
    contextoId: CITA,
    estaciones: ['OTONO'],
    origenEstacion: 'TEMPERATURA',
    valoracionDia: null,
    ...parcial,
  };
}

const oficina = (diasAtras: number, valoracionDia: number | null = 4) =>
  uso(diasAtras, { contextoId: OFICINA, valoracionDia });

describe('desajustesDeMarcas: añadir', () => {
  it('propone añadir un contexto con 4 usos bien valorados en 180 días', () => {
    const propuestas = desajustesDeMarcas({
      usos: [oficina(3), oficina(10), oficina(20, 5), oficina(40, 3)],
      marcas,
      hoy: HOY,
    });
    const añadir = propuestas.find((p) => p.eje === 'contexto' && p.accion === 'añadir');
    expect(añadir).toMatchObject({ valor: OFICINA, usos: 4, valoracionMedia: 4, valorados: 4 });
  });

  it('no propone nada con 3 usos', () => {
    const propuestas = desajustesDeMarcas({
      usos: [oficina(3), oficina(10), oficina(20)],
      marcas,
      hoy: HOY,
    });
    expect(propuestas.filter((p) => p.accion === 'añadir')).toEqual([]);
  });

  it('no propone lo que llevaste y no te gustó', () => {
    const propuestas = desajustesDeMarcas({
      usos: [oficina(3, 2), oficina(10, 3), oficina(20, 2), oficina(40, 3)],
      marcas,
      hoy: HOY,
    });
    expect(propuestas.find((p) => p.valor === OFICINA)).toBeUndefined();
  });

  it('sin valorar también cuenta, y lo dice', () => {
    const propuestas = desajustesDeMarcas({
      usos: [oficina(3, null), oficina(10, null), oficina(20, null), oficina(40, null)],
      marcas,
      hoy: HOY,
    });
    const p = propuestas.find((x) => x.valor === OFICINA)!;
    expect(p.valoracionMedia).toBeNull();
    expect(explicarPropuesta(p, 'Oficina')).toBe(
      'Te lo has puesto 4 veces para Oficina (sin valorar) y no lo tienes marcado.',
    );
  });

  it('los usos de hace más de 180 días no cuentan', () => {
    const propuestas = desajustesDeMarcas({
      usos: [oficina(3), oficina(10), oficina(200), oficina(250)],
      marcas,
      hoy: HOY,
    });
    expect(propuestas.find((p) => p.valor === OFICINA)).toBeUndefined();
  });

  it('en la estación ignora los usos por calendario', () => {
    const verano = (d: number, origenEstacion: UsoParaEvidencia['origenEstacion']) =>
      uso(d, { estaciones: ['VERANO'], origenEstacion });
    const porCalendario = desajustesDeMarcas({
      usos: [1, 2, 3, 4, 5].map((d) => verano(d, 'CALENDARIO')),
      marcas,
      hoy: HOY,
    });
    expect(porCalendario.find((p) => p.eje === 'estacion')).toBeUndefined();

    const porTemperatura = desajustesDeMarcas({
      usos: [1, 2, 3, 4].map((d) => verano(d, 'TEMPERATURA')),
      marcas,
      hoy: HOY,
    });
    expect(porTemperatura.find((p) => p.eje === 'estacion')).toMatchObject({
      valor: 'VERANO',
      accion: 'añadir',
    });
  });

  it('un uso de entretiempo con una estación ya marcada no es evidencia', () => {
    const propuestas = desajustesDeMarcas({
      usos: [1, 2, 3, 4].map((d) => uso(d, { estaciones: ['VERANO', 'OTONO'] })),
      marcas,
      hoy: HOY,
    });
    expect(propuestas.find((p) => p.eje === 'estacion')).toBeUndefined();
  });

  it('propone el momento: de día', () => {
    const propuestas = desajustesDeMarcas({
      usos: [1, 2, 3, 4].map((d) => uso(d, { momento: 'DIA', valoracionDia: 4 })),
      marcas,
      hoy: HOY,
    });
    const p = propuestas.find((x) => x.eje === 'momento')!;
    expect(p).toMatchObject({ valor: 'DIA', accion: 'añadir' });
    expect(explicarPropuesta(p, 'Día')).toBe(
      'Te lo has puesto 4 veces de día (4,0/5) y no lo tienes marcado.',
    );
  });
});

describe('desajustesDeMarcas: quitar', () => {
  // Un año largo de uso, siempre de Cita en otoño-invierno, nunca al gimnasio.
  const año = [10, 60, 100, 150, 200, 250, 300, 340].map((d, i) =>
    uso(d, { estaciones: [i % 2 ? 'OTONO' : 'INVIERNO'] }),
  );

  it('propone quitar un contexto sin ningún uso en el último año', () => {
    const propuestas = desajustesDeMarcas({ usos: año, marcas, hoy: HOY });
    const p = propuestas.find((x) => x.accion === 'quitar' && x.eje === 'contexto')!;
    expect(p).toMatchObject({ valor: GIMNASIO, motivo: 'sin-uso' });
    expect(explicarPropuesta(p, 'Gimnasio')).toBe(
      'Marcado para Gimnasio y sin ponértelo ni una vez así en el último año.',
    );
  });

  it('nunca deja un eje vacío', () => {
    const propuestas = desajustesDeMarcas({
      usos: año,
      marcas: { ...marcas, contextos: [GIMNASIO] },
      hoy: HOY,
    });
    expect(propuestas.find((x) => x.accion === 'quitar' && x.eje === 'contexto')).toBeUndefined();
  });

  it('con poco historial no propone quitar', () => {
    const corto = [5, 10, 20, 30, 40, 50].map((d) => uso(d));
    const propuestas = desajustesDeMarcas({ usos: corto, marcas, hoy: HOY });
    expect(propuestas.filter((x) => x.accion === 'quitar')).toEqual([]);
  });

  it('una estación necesita casi un año de historial', () => {
    const seisMeses = [5, 40, 80, 120, 150, 170].map((d) => uso(d, { estaciones: ['OTONO'] }));
    const propuestas = desajustesDeMarcas({ usos: seisMeses, marcas, hoy: HOY });
    expect(propuestas.find((x) => x.eje === 'estacion')).toBeUndefined();
  });

  it('los «Otro» repetidos para un contexto proponen quitarlo', () => {
    const propuestas = desajustesDeMarcas({
      usos: [uso(5)],
      marcas,
      descartes: [3, 9, 20].map((d) => ({
        fecha: restarDias(HOY, d),
        contextoId: GIMNASIO,
        momento: 'DIA' as const,
      })),
      hoy: HOY,
    });
    const p = propuestas.find((x) => x.motivo === 'descartes')!;
    expect(p).toMatchObject({ eje: 'contexto', valor: GIMNASIO, accion: 'quitar', descartes: 3 });
  });

  it('si te lo pones allí a pesar de descartarlo, no es rechazo', () => {
    const propuestas = desajustesDeMarcas({
      usos: [1, 2, 4, 6].map((d) => uso(d, { contextoId: GIMNASIO })),
      marcas,
      descartes: [3, 9, 20].map((d) => ({ fecha: restarDias(HOY, d), contextoId: GIMNASIO, momento: null })),
      hoy: HOY,
    });
    expect(propuestas.find((x) => x.motivo === 'descartes')).toBeUndefined();
  });
});

describe('desajustesDeMarcas: rechazos y orden', () => {
  const usos = [oficina(3), oficina(10), oficina(20), oficina(40)];

  it('«Fue casualidad» la oculta hasta su fecha', () => {
    const rechazada = { perfumeId: 'p1', eje: 'contexto' as const, valor: OFICINA, hasta: '2026-12-01' };
    expect(
      desajustesDeMarcas({ perfumeId: 'p1', usos, marcas, hoy: HOY, rechazadas: [rechazada] }),
    ).toEqual([]);
    // Pasada la fecha, vuelve.
    expect(
      desajustesDeMarcas({
        perfumeId: 'p1',
        usos,
        marcas,
        hoy: HOY,
        rechazadas: [{ ...rechazada, hasta: '2026-10-01' }],
      }),
    ).toHaveLength(1);
    // El rechazo de otro perfume no cuenta.
    expect(
      desajustesDeMarcas({
        perfumeId: 'p2',
        usos,
        marcas,
        hoy: HOY,
        rechazadas: [rechazada],
      }),
    ).toHaveLength(1);
  });

  it('ordena de más a menos peso', () => {
    const muchos = [...usos, oficina(50), oficina(60), uso(2, { momento: 'DIA' }), uso(4, { momento: 'DIA' }), uso(6, { momento: 'DIA' }), uso(8, { momento: 'DIA' })];
    const propuestas = desajustesDeMarcas({ usos: muchos, marcas, hoy: HOY });
    expect(propuestas[0]!.valor).toBe(OFICINA);
  });
});

describe('huecosQueCierra', () => {
  it('cuenta los huecos que desaparecen al añadir la marca', async () => {
    const { huecosQueCierra } = await import('@/dominio/recategorizacion');
    const perfume = {
      id: 'p1',
      nombre: 'Khamrah',
      marca: 'Lattafa',
      estado: 'LO_TENGO' as const,
      archivado: false,
      momentos: ['DIA' as const],
      contextos: [CITA],
      estaciones: ['OTONO' as const, 'INVIERNO' as const],
      ultimoUso: null,
      vecesUsado: 0,
    };
    // Oficina de día en otoño e invierno: dos huecos menos.
    expect(
      huecosQueCierra([perfume], [CITA, OFICINA], {
        perfumeId: 'p1',
        eje: 'contexto',
        valor: OFICINA,
        accion: 'añadir',
      }),
    ).toBe(2);
    expect(
      huecosQueCierra([perfume], [CITA, OFICINA], {
        perfumeId: 'p1',
        eje: 'contexto',
        valor: CITA,
        accion: 'quitar',
      }),
    ).toBe(0);
  });
});
