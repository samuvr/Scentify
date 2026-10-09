import { describe, expect, it } from 'vitest';
import {
  desplazarMes,
  diasDelMes,
  esMesIso,
  fechaLarga,
  limitesDelMes,
  nombreMes,
  semanasDelMes,
} from '@/dominio/calendario';

describe('navegacion entre meses', () => {
  it.each([
    ['2026-10', 1, '2026-11'],
    ['2026-12', 1, '2027-01'],
    ['2026-01', -1, '2025-12'],
    ['2026-10', -12, '2025-10'],
    ['2026-10', 12, '2027-10'],
    ['2026-03', -27, '2023-12'],
  ])('%s %+d meses es %s', (mes, n, esperado) => {
    expect(desplazarMes(mes, n)).toBe(esperado);
  });

  it('valida los meses que llegan por la URL', () => {
    expect(esMesIso('2026-10')).toBe(true);
    expect(esMesIso('2026-13')).toBe(false);
    expect(esMesIso('2026-00')).toBe(false);
    expect(esMesIso('2026-1')).toBe(false);
    expect(esMesIso(undefined)).toBe(false);
  });
});

describe('dias del mes', () => {
  it('cuenta bien febrero bisiesto y no bisiesto', () => {
    expect(diasDelMes('2024-02')).toBe(29);
    expect(diasDelMes('2026-02')).toBe(28);
    expect(diasDelMes('2026-10')).toBe(31);
    expect(limitesDelMes('2026-04')).toEqual({ desde: '2026-04-01', hasta: '2026-04-30' });
  });

  it('pone nombre al mes y a la fecha', () => {
    expect(nombreMes('2026-10')).toBe('Octubre 2026');
    expect(fechaLarga('2026-10-09')).toBe('viernes, 9 de octubre de 2026');
  });
});

describe('cuadricula del mes', () => {
  it('empieza en lunes y rellena con huecos', () => {
    // El 1 de octubre de 2026 es jueves.
    const semanas = semanasDelMes('2026-10', new Map(), '2026-10-09');
    expect(semanas[0]!.slice(0, 3)).toEqual([null, null, null]);
    expect(semanas[0]![3]?.fecha).toBe('2026-10-01');
    expect(semanas.every((s) => s.length === 7)).toBe(true);
    expect(semanas.flat().filter(Boolean)).toHaveLength(31);
  });

  it('distingue registrados, sin registro y futuros', () => {
    const usos = new Map([
      ['2026-10-02', 2],
      ['2026-10-20', 1],
    ]);
    const dias = semanasDelMes('2026-10', usos, '2026-10-09').flat();
    const de = (fecha: string) => dias.find((d) => d?.fecha === fecha)!;
    expect(de('2026-10-02')).toMatchObject({ estado: 'REGISTRADO', usos: 2 });
    expect(de('2026-10-03')).toMatchObject({ estado: 'SIN_REGISTRO', usos: 0 });
    expect(de('2026-10-09')).toMatchObject({ estado: 'SIN_REGISTRO', esHoy: true });
    expect(de('2026-10-10').estado).toBe('FUTURO');
    // Un registro adelantado (para mañana) cuenta como registrado.
    expect(de('2026-10-20').estado).toBe('REGISTRADO');
  });
});
