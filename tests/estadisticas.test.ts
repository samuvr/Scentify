/** Seccion 8 — Aritmetica de periodos, indicadores y comparativa. */
import { describe, expect, it } from 'vitest';
import {
  compararIndicadores,
  diasDelRango,
  indiceRotacion,
  periodoAnterior,
  rangoDePeriodo,
  rejillaHeatmap,
  tasaAcierto,
} from '@/dominio/estadisticas';

const HOY = '2026-09-21';

describe('rangos de periodo', () => {
  it('30 días incluye hoy y los 29 anteriores', () => {
    const rango = rangoDePeriodo('30d', HOY);
    expect(rango).toEqual({ desde: '2026-08-23', hasta: '2026-09-21' });
    expect(diasDelRango(rango)).toBe(30);
  });

  it('90 días y 365 días cuentan igual', () => {
    expect(diasDelRango(rangoDePeriodo('90d', HOY))).toBe(90);
    expect(diasDelRango(rangoDePeriodo('365d', HOY))).toBe(365);
  });

  it('el año en curso arranca el 1 de enero', () => {
    expect(rangoDePeriodo('anio-en-curso', HOY)).toEqual({
      desde: '2026-01-01',
      hasta: '2026-09-21',
    });
  });

  it('el personalizado respeta lo que se le pase', () => {
    expect(
      rangoDePeriodo('personalizado', HOY, { desde: '2026-03-01', hasta: '2026-03-31' }),
    ).toEqual({ desde: '2026-03-01', hasta: '2026-03-31' });
  });

  it('cruza el cambio de año sin despeinarse', () => {
    const rango = rangoDePeriodo('30d', '2026-01-10');
    expect(rango.desde).toBe('2025-12-12');
    expect(diasDelRango(rango)).toBe(30);
  });
});

describe('periodo anterior equivalente', () => {
  it('tiene la misma duración y termina justo antes', () => {
    const actual = rangoDePeriodo('30d', HOY);
    const anterior = periodoAnterior(actual);
    expect(anterior).toEqual({ desde: '2026-07-24', hasta: '2026-08-22' });
    expect(diasDelRango(anterior)).toBe(diasDelRango(actual));
  });

  it('para el año en curso da los mismos días terminando en diciembre', () => {
    const actual = rangoDePeriodo('anio-en-curso', HOY); // 264 días
    const anterior = periodoAnterior(actual);
    expect(anterior.hasta).toBe('2025-12-31');
    expect(diasDelRango(anterior)).toBe(diasDelRango(actual));
  });

  it('no se solapa nunca con el periodo actual', () => {
    const actual = rangoDePeriodo('90d', HOY);
    expect(periodoAnterior(actual).hasta < actual.desde).toBe(true);
  });
});

describe('índice de rotación', () => {
  it('es perfumes distintos usados sobre el total en colección', () => {
    expect(indiceRotacion(12, 40)).toBe(0.3);
    expect(indiceRotacion(40, 40)).toBe(1);
  });

  it('una colección vacía da cero en vez de dividir por cero', () => {
    expect(indiceRotacion(0, 0)).toBe(0);
  });
});

describe('tasa de acierto', () => {
  it('es el porcentaje de registros con idoneidad 100', () => {
    expect(tasaAcierto([100, 100, 67, 33])).toBe(50);
    expect(tasaAcierto([100, 100, 100])).toBe(100);
    expect(tasaAcierto([67, 33, 0])).toBe(0);
  });

  it('sin registros da cero, no NaN', () => {
    expect(tasaAcierto([])).toBe(0);
  });
});

describe('comparativa contra el periodo anterior', () => {
  const actual = { usos: 30, perfumesDistintos: 12, rotacion: 0.3, tasaAcierto: 70 };
  const anterior = { usos: 24, perfumesDistintos: 10, rotacion: 0.25, tasaAcierto: 80 };

  it('da diferencia y variación porcentual', () => {
    const comparacion = compararIndicadores(actual, anterior);
    expect(comparacion.usos).toEqual({
      actual: 30,
      anterior: 24,
      diferencia: 6,
      variacionPct: 25,
    });
    expect(comparacion.tasaAcierto.diferencia).toBe(-10);
    expect(comparacion.tasaAcierto.variacionPct).toBe(-13);
  });

  it('si el periodo anterior era cero no inventa un porcentaje', () => {
    const comparacion = compararIndicadores(actual, {
      usos: 0,
      perfumesDistintos: 0,
      rotacion: 0,
      tasaAcierto: 0,
    });
    expect(comparacion.usos.variacionPct).toBeNull();
    expect(comparacion.usos.diferencia).toBe(30);
  });
});

describe('rejilla del heatmap', () => {
  it('empieza en lunes aunque el rango empiece a media semana', () => {
    // El 2026-09-21 es lunes; el 2026-09-23, miércoles.
    const semanas = rejillaHeatmap({ desde: '2026-09-23', hasta: '2026-09-27' }, new Map());
    expect(semanas[0]?.[0]?.fecha).toBe('2026-09-21');
  });

  it('todas las semanas tienen siete días, sin huecos', () => {
    const semanas = rejillaHeatmap({ desde: '2026-01-01', hasta: '2026-12-31' }, new Map());
    for (const semana of semanas) expect(semana).toHaveLength(7);
  });

  it('coloca los registros en su día', () => {
    const semanas = rejillaHeatmap(
      { desde: '2026-09-21', hasta: '2026-09-27' },
      new Map([
        ['2026-09-21', 2],
        ['2026-09-24', 1],
      ]),
    );
    expect(semanas[0]?.[0]).toEqual({ fecha: '2026-09-21', registros: 2 });
    expect(semanas[0]?.[3]).toEqual({ fecha: '2026-09-24', registros: 1 });
    expect(semanas[0]?.[1]?.registros).toBe(0);
  });
});
