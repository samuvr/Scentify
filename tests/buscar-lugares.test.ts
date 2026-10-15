/** Modo viaje: el destino se busca por su nombre en vez de pedir coordenadas. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buscarLugares, geocodificar } from '@/servicios/clima';

const responder = (cuerpo: unknown, ok = true) =>
  vi.fn(async () => ({ ok, json: async () => cuerpo }) as Response);

afterEach(() => vi.unstubAllGlobals());

describe('buscar destino por nombre', () => {
  it('devuelve varios lugares con su etiqueta, para que elija el usuario', async () => {
    vi.stubGlobal(
      'fetch',
      responder({
        results: [
          { name: 'Valencia', latitude: 39.47, longitude: -0.38, admin1: 'Comunidad Valenciana', country: 'España' },
          { name: 'Valencia', latitude: 10.16, longitude: -68, admin1: 'Carabobo', country: 'Venezuela' },
        ],
      }),
    );
    expect(await buscarLugares('Valencia')).toEqual([
      { lat: 39.47, lon: -0.38, etiqueta: 'Valencia, Comunidad Valenciana, España' },
      { lat: 10.16, lon: -68, etiqueta: 'Valencia, Carabobo, Venezuela' },
    ]);
  });

  it('distingue «no existe» (lista vacía) de «no se ha podido buscar» (null)', async () => {
    vi.stubGlobal('fetch', responder({}));
    expect(await buscarLugares('Xyzzy')).toEqual([]);

    vi.stubGlobal('fetch', responder({}, false));
    expect(await buscarLugares('Sevilla')).toBeNull();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    expect(await buscarLugares('Sevilla')).toBeNull();
    expect(await geocodificar('Sevilla')).toBeNull();
  });
});
