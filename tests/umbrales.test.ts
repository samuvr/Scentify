import { describe, expect, it } from 'vitest';
import { UMBRALES_POR_DEFECTO, validarUmbrales } from '@/dominio/estacion';

const formulario = (cambios: Record<string, string> = {}) => ({
  ...Object.fromEntries(Object.entries(UMBRALES_POR_DEFECTO).map(([k, v]) => [k, String(v)])),
  ...cambios,
});

describe('validación de los umbrales de configuración', () => {
  it('acepta los de partida, también con coma decimal', () => {
    expect(validarUmbrales(formulario())).toEqual({ ok: true, umbrales: UMBRALES_POR_DEFECTO });
    const conComa = validarUmbrales(formulario({ umbralVerano: '28,5' }));
    expect(conComa.ok && conComa.umbrales.umbralVerano).toBe(28.5);
  });

  it('un campo vacío no se guarda como 0', () => {
    expect(validarUmbrales(formulario({ umbralVerano: '' }))).toEqual({ ok: false, error: 'vacio' });
    expect(validarUmbrales(formulario({ umbralVerano: '  ' }))).toEqual({ ok: false, error: 'vacio' });
    const { umbralVerano: _, ...sinCampo } = formulario();
    expect(validarUmbrales(sinCampo)).toEqual({ ok: false, error: 'vacio' });
  });

  it('los cortes tienen que ir de más calor a menos', () => {
    expect(validarUmbrales(formulario({ umbralEntretiempo: '25' }))).toEqual({ ok: false, error: 'orden' });
    expect(validarUmbrales(formulario({ umbralVeranoEntretiempo: '28' }))).toEqual({
      ok: false,
      error: 'orden',
    });
  });

  it('rechaza valores fuera de rango', () => {
    expect(validarUmbrales(formulario({ umbralVerano: '80' }))).toEqual({ ok: false, error: 'rango' });
    expect(validarUmbrales(formulario({ bochornoHumedadPct: '120' }))).toEqual({ ok: false, error: 'humedad' });
    expect(validarUmbrales(formulario({ bochornoIncremento: '-1' }))).toEqual({
      ok: false,
      error: 'incremento',
    });
  });
});
