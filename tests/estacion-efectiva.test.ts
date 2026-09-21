/**
 * Seccion 7.1 — Estacion efectiva por temperatura.
 *
 *   entretiempo = PRIMAVERA si mes 1..6, OTONO si mes 7..12
 *   t = maxima                si momento = DIA
 *   t = (maxima + minima) / 2 si momento = NOCHE
 *   si humedad > 70% y t >= 24: t = t + 2
 *
 *   t >= 28        -> {VERANO}
 *   24 <= t < 28   -> {VERANO, entretiempo}
 *   18 <= t < 24   -> {entretiempo}
 *   13 <= t < 18   -> {entretiempo, INVIERNO}
 *   t < 13         -> {INVIERNO}
 *
 * Los umbrales son configurables (tabla `ajustes`), asi que tambien se prueba
 * que moverlos mueve las bandas.
 */
import { describe, expect, it } from 'vitest';
import {
  UMBRALES_POR_DEFECTO,
  calcularEstacionEfectiva,
  entretiempoDeFecha,
  estacionPorCalendario,
} from '@/dominio/estacion';
import type { UmbralesEstacion } from '@/dominio/estacion';

const EL_CAMPELLO = 'El Campello';

/** Un dia de noviembre: entretiempo = OTONO. */
const NOVIEMBRE = new Date('2026-11-15T09:00:00Z');
/** Un dia de marzo: entretiempo = PRIMAVERA. */
const MARZO = new Date('2026-03-15T09:00:00Z');

/** Atajo: calcula de dia con una maxima dada, sin humedad relevante. */
function deDia(temperaturaMax: number, fecha = NOVIEMBRE, humedadMedia: number | null = 50) {
  return calcularEstacionEfectiva({
    fecha,
    momento: 'DIA',
    clima: { temperaturaMax, temperaturaMin: temperaturaMax - 8, humedadMedia },
    etiquetaUbicacion: EL_CAMPELLO,
  });
}

describe('entretiempo: primavera de enero a junio, otoño de julio a diciembre', () => {
  it.each([
    [1, 'PRIMAVERA'],
    [3, 'PRIMAVERA'],
    [6, 'PRIMAVERA'],
    [7, 'OTONO'],
    [9, 'OTONO'],
    [12, 'OTONO'],
  ])('mes %i -> %s', (mes, esperado) => {
    const fecha = new Date(Date.UTC(2026, mes - 1, 15, 9));
    expect(entretiempoDeFecha(fecha)).toBe(esperado);
  });
});

describe('bordes de cada umbral, uno por uno', () => {
  it.each([
    // temperatura, estaciones esperadas (ordenadas de mas calida a mas fria)
    [40, ['VERANO']],
    [28.1, ['VERANO']],
    [28, ['VERANO']], // borde inferior de la banda de verano: inclusivo
    [27.9, ['VERANO', 'OTONO']],
    [26, ['VERANO', 'OTONO']],
    [24, ['VERANO', 'OTONO']], // borde inclusivo
    [23.9, ['OTONO']],
    [20, ['OTONO']],
    [18, ['OTONO']], // borde inclusivo
    [17.9, ['OTONO', 'INVIERNO']],
    [15, ['OTONO', 'INVIERNO']],
    [13, ['OTONO', 'INVIERNO']], // borde inclusivo
    [12.9, ['INVIERNO']],
    [2, ['INVIERNO']],
  ])('%s grados en noviembre -> %j', (temperatura, esperado) => {
    expect(deDia(temperatura as number).estaciones).toEqual(esperado);
  });

  it('en marzo las mismas bandas usan primavera como entretiempo', () => {
    expect(deDia(26, MARZO).estaciones).toEqual(['VERANO', 'PRIMAVERA']);
    expect(deDia(20, MARZO).estaciones).toEqual(['PRIMAVERA']);
    expect(deDia(15, MARZO).estaciones).toEqual(['PRIMAVERA', 'INVIERNO']);
  });
});

describe('la temperatura usada depende del momento', () => {
  const clima = { temperaturaMax: 26, temperaturaMin: 14, humedadMedia: 50 };

  it('de dia usa la maxima', () => {
    const resultado = calcularEstacionEfectiva({
      fecha: NOVIEMBRE,
      momento: 'DIA',
      clima,
      etiquetaUbicacion: EL_CAMPELLO,
    });
    expect(resultado.temperaturaUsada).toBe(26);
    expect(resultado.estaciones).toEqual(['VERANO', 'OTONO']);
  });

  it('de noche usa la media entre maxima y minima', () => {
    const resultado = calcularEstacionEfectiva({
      fecha: NOVIEMBRE,
      momento: 'NOCHE',
      clima,
      etiquetaUbicacion: EL_CAMPELLO,
    });
    expect(resultado.temperaturaUsada).toBe(20); // (26 + 14) / 2
    expect(resultado.estaciones).toEqual(['OTONO']);
  });
});

describe('ajuste por bochorno costero: humedad > 70% y t >= 24 suman 2 grados', () => {
  it('no se aplica con humedad justo en el umbral (70 no es > 70)', () => {
    const resultado = deDia(26, NOVIEMBRE, 70);
    expect(resultado.ajusteBochorno).toBe(false);
    expect(resultado.temperaturaUsada).toBe(26);
  });

  it('no se aplica por debajo de 24 grados por mucha humedad que haya', () => {
    const resultado = deDia(23, NOVIEMBRE, 95);
    expect(resultado.ajusteBochorno).toBe(false);
    expect(resultado.temperaturaUsada).toBe(23);
    expect(resultado.estaciones).toEqual(['OTONO']);
  });

  it('se aplica justo en 24 grados con humedad por encima de 70', () => {
    const resultado = deDia(24, NOVIEMBRE, 71);
    expect(resultado.ajusteBochorno).toBe(true);
    expect(resultado.temperaturaUsada).toBe(26);
  });

  it('puede empujar un dia de la banda mixta a verano puro', () => {
    const sinBochorno = deDia(26.5, NOVIEMBRE, 60);
    expect(sinBochorno.estaciones).toEqual(['VERANO', 'OTONO']);

    const conBochorno = deDia(26.5, NOVIEMBRE, 85);
    expect(conBochorno.temperaturaUsada).toBe(28.5);
    expect(conBochorno.estaciones).toEqual(['VERANO']);
  });

  it('sin dato de humedad no se aplica el ajuste', () => {
    const resultado = deDia(26, NOVIEMBRE, null);
    expect(resultado.ajusteBochorno).toBe(false);
    expect(resultado.temperaturaUsada).toBe(26);
  });
});

describe('la estacion dominante es la mas calida del conjunto', () => {
  it.each([
    [30, 'VERANO'],
    [26, 'VERANO'],
    [20, 'OTONO'],
    [15, 'OTONO'],
    [5, 'INVIERNO'],
  ])('%s grados -> dominante %s', (temperatura, dominante) => {
    const resultado = deDia(temperatura as number);
    expect(resultado.dominante).toBe(dominante);
    // La dominante siempre pertenece al conjunto: es lo que exige el CHECK de la tabla.
    expect(resultado.estaciones).toContain(resultado.dominante);
    expect(resultado.estaciones[0]).toBe(resultado.dominante);
  });
});

describe('umbrales configurables desde la tabla ajustes', () => {
  it('subir el umbral de verano mueve la banda', () => {
    const umbrales: UmbralesEstacion = { ...UMBRALES_POR_DEFECTO, umbralVerano: 32 };
    const resultado = calcularEstacionEfectiva({
      fecha: NOVIEMBRE,
      momento: 'DIA',
      clima: { temperaturaMax: 29, temperaturaMin: 20, humedadMedia: 50 },
      umbrales,
      etiquetaUbicacion: EL_CAMPELLO,
    });
    // Con el umbral por defecto (28) serian 29 -> {VERANO}; con 32, banda mixta.
    expect(resultado.estaciones).toEqual(['VERANO', 'OTONO']);
  });

  it('cambiar el incremento por bochorno cambia la temperatura resultante', () => {
    const umbrales: UmbralesEstacion = { ...UMBRALES_POR_DEFECTO, bochornoIncremento: 5 };
    const resultado = calcularEstacionEfectiva({
      fecha: NOVIEMBRE,
      momento: 'DIA',
      clima: { temperaturaMax: 24, temperaturaMin: 18, humedadMedia: 80 },
      umbrales,
      etiquetaUbicacion: EL_CAMPELLO,
    });
    expect(resultado.temperaturaUsada).toBe(29);
    expect(resultado.estaciones).toEqual(['VERANO']);
  });
});

describe('fallback sin conexion: se cae al calendario y se dice', () => {
  it('sin clima usa el calendario y lo marca en el origen', () => {
    const resultado = calcularEstacionEfectiva({
      fecha: new Date('2026-10-20T09:00:00Z'),
      momento: 'DIA',
      clima: null,
      etiquetaUbicacion: EL_CAMPELLO,
    });
    expect(resultado.origen).toBe('CALENDARIO');
    expect(resultado.estaciones).toEqual(['OTONO']);
    expect(resultado.temperaturaUsada).toBeNull();
    expect(resultado.explicacion).toBe('Sin datos de tiempo, usando otoño por fecha.');
  });

  it('el calendario usa la estacion real del mes, no la regla de entretiempo', () => {
    // Julio es verano de calendario, aunque su entretiempo sea OTONO.
    // Caer a "otoño" un 15 de julio seria absurdo.
    const julio = new Date('2026-07-15T09:00:00Z');
    expect(entretiempoDeFecha(julio)).toBe('OTONO');
    expect(estacionPorCalendario(julio)).toBe('VERANO');
    expect(calcularEstacionEfectiva({ fecha: julio, momento: 'DIA', clima: null }).estaciones).toEqual(
      ['VERANO'],
    );
  });

  it.each([
    ['2026-01-15', 'INVIERNO'],
    ['2026-02-15', 'INVIERNO'],
    ['2026-03-15', 'PRIMAVERA'],
    ['2026-05-15', 'PRIMAVERA'],
    ['2026-06-15', 'VERANO'],
    ['2026-08-15', 'VERANO'],
    ['2026-09-15', 'OTONO'],
    ['2026-11-15', 'OTONO'],
    ['2026-12-15', 'INVIERNO'],
  ])('el %s cae a %s por calendario', (iso, esperada) => {
    expect(estacionPorCalendario(new Date(`${iso}T09:00:00Z`))).toBe(esperada);
  });

  it('el fallback devuelve siempre una sola estacion, nunca una banda mixta', () => {
    const resultado = calcularEstacionEfectiva({
      fecha: NOVIEMBRE,
      momento: 'NOCHE',
      clima: null,
    });
    expect(resultado.estaciones).toHaveLength(1);
    expect(resultado.dominante).toBe(resultado.estaciones[0]);
  });
});

describe('explicacion visible y sobrescribible', () => {
  it('explica la banda mixta con la temperatura y el sitio (criterio 6)', () => {
    const resultado = deDia(26);
    expect(resultado.explicacion).toBe('26° hoy en El Campello → otoño y verano compatibles.');
  });

  it('explica la banda simple', () => {
    expect(deDia(20).explicacion).toBe('20° hoy en El Campello → otoño.');
  });

  it('usa «e» y no «y» delante de invierno', () => {
    expect(deDia(15).explicacion).toBe('15° hoy en El Campello → otoño e invierno compatibles.');
  });

  it('lista el entretiempo primero, como en el ejemplo de la especificacion', () => {
    // El conjunto se ordena de mas calido a mas frio para que la dominante sea
    // la primera, pero el texto lee mejor empezando por la estacion de calendario.
    const resultado = deDia(26);
    expect(resultado.estaciones).toEqual(['VERANO', 'OTONO']);
    expect(resultado.explicacion).toContain('otoño y verano');
  });

  it('formatea los decimales con coma', () => {
    expect(deDia(26.5, NOVIEMBRE, 85).explicacion).toContain('28,5°');
  });

  it('avisa cuando ha aplicado el ajuste por bochorno', () => {
    const resultado = deDia(25, NOVIEMBRE, 85);
    expect(resultado.explicacion).toContain('bochorno');
  });

  it('sin etiqueta de ubicacion la explicacion sigue teniendo sentido', () => {
    const resultado = calcularEstacionEfectiva({
      fecha: NOVIEMBRE,
      momento: 'DIA',
      clima: { temperaturaMax: 20, temperaturaMin: 12, humedadMedia: 50 },
    });
    expect(resultado.explicacion).toBe('20° hoy → otoño.');
  });
});

describe('los dos escenarios del criterio de aceptacion 6', () => {
  it('27 grados en noviembre propone verano y otoño', () => {
    const resultado = calcularEstacionEfectiva({
      fecha: new Date('2026-11-12T09:00:00Z'),
      momento: 'DIA',
      clima: { temperaturaMax: 27, temperaturaMin: 17, humedadMedia: 60 },
      etiquetaUbicacion: EL_CAMPELLO,
    });
    expect(resultado.estaciones).toEqual(['VERANO', 'OTONO']);
    expect(resultado.origen).toBe('TEMPERATURA');
  });

  it('15 grados en septiembre propone otoño e invierno', () => {
    const resultado = calcularEstacionEfectiva({
      fecha: new Date('2026-09-25T09:00:00Z'),
      momento: 'DIA',
      clima: { temperaturaMax: 15, temperaturaMin: 9, humedadMedia: 60 },
      etiquetaUbicacion: EL_CAMPELLO,
    });
    expect(resultado.estaciones).toEqual(['OTONO', 'INVIERNO']);
  });
});
