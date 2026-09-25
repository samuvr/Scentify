/**
 * Seccion 7.1 — Ubicacion por usuario: fija o automatica por IP.
 */
import { describe, expect, it } from 'vitest';
import { interpretarAjusteUbicacion, ubicacionDesdeCabeceras } from '@/dominio/ubicacion';

const cabeceras = (valores: Record<string, string>) => (nombre: string) => valores[nombre] ?? null;

describe('interpretarAjusteUbicacion', () => {
  it('lee el modo automatico', () => {
    expect(interpretarAjusteUbicacion({ modo: 'auto' })).toEqual({ modo: 'auto' });
  });

  it('lee una ubicacion sin modo (filas antiguas) como fija', () => {
    expect(
      interpretarAjusteUbicacion({ lat: 38.4257, lon: -0.4009, etiqueta: 'El Campello, Alicante' }),
    ).toEqual({ modo: 'fija', lat: 38.4257, lon: -0.4009, etiqueta: 'El Campello, Alicante' });
  });

  it('descarta valores sin coordenadas', () => {
    expect(interpretarAjusteUbicacion(null)).toBeNull();
    expect(interpretarAjusteUbicacion({ etiqueta: 'Madrid' })).toBeNull();
    expect(interpretarAjusteUbicacion('Madrid')).toBeNull();
  });
});

describe('ubicacionDesdeCabeceras', () => {
  it('saca coordenadas, ciudad y pais de las cabeceras de Vercel', () => {
    expect(
      ubicacionDesdeCabeceras(
        cabeceras({
          'x-vercel-ip-latitude': '40.4165',
          'x-vercel-ip-longitude': '-3.7026',
          'x-vercel-ip-city': 'Alcal%C3%A1%20de%20Henares',
          'x-vercel-ip-country': 'ES',
        }),
      ),
    ).toEqual({ lat: 40.4165, lon: -3.7026, etiqueta: 'Alcalá de Henares, España' });
  });

  it('sin ciudad ni pais, una etiqueta generica', () => {
    const u = ubicacionDesdeCabeceras(
      cabeceras({ 'x-vercel-ip-latitude': '0', 'x-vercel-ip-longitude': '0' }),
    );
    expect(u).toEqual({ lat: 0, lon: 0, etiqueta: 'Tu ubicación' });
  });

  it('null fuera de Vercel o con coordenadas invalidas', () => {
    expect(ubicacionDesdeCabeceras(cabeceras({}))).toBeNull();
    expect(
      ubicacionDesdeCabeceras(
        cabeceras({ 'x-vercel-ip-latitude': 'abc', 'x-vercel-ip-longitude': '1' }),
      ),
    ).toBeNull();
    expect(
      ubicacionDesdeCabeceras(
        cabeceras({ 'x-vercel-ip-latitude': '95', 'x-vercel-ip-longitude': '1' }),
      ),
    ).toBeNull();
  });
});
