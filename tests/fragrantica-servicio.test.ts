/**
 * La consulta de una ficha contra un `fetch` falso: la peticion directa, la
 * que va a traves de ZenRows cuando hay clave, y el respaldo cuando ZenRows
 * falla. Los tests no tocan la red.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consultarFicha } from '@/servicios/fragrantica';

const FICHA = 'https://www.fragrantica.es/perfume/Armaf/Club-De-Nuit-Urban-Elixir-77860.html';
const HTML = readFileSync(new URL('./fixtures/fragrantica-popular.html', import.meta.url), 'utf8');

/** Cada peticion recibe la siguiente respuesta de la lista. */
function responder(...respuestas: (() => Response)[]) {
  const espia = vi.fn<(entrada: string | URL | Request) => Promise<Response>>();
  for (const respuesta of respuestas) espia.mockImplementationOnce(async () => respuesta());
  vi.stubGlobal('fetch', espia);
  return espia;
}

const pagina = () => new Response(HTML, { status: 200 });
const estado = (status: number) => () => new Response('{"code":"X"}', { status });

/** La direccion pedida, para ver a donde ha ido cada peticion. */
const destino = (espia: ReturnType<typeof responder>, n: number) =>
  new URL(String(espia.mock.calls[n]?.[0]));

beforeEach(() => {
  delete process.env.ZENROWS_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ZENROWS_API_KEY;
});

describe('sin clave de ZenRows', () => {
  it('pide la ficha directamente y la lee', async () => {
    const espia = responder(pagina);
    const resultado = await consultarFicha(FICHA);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.ficha.marca).toBe('Armaf');
    expect(espia).toHaveBeenCalledTimes(1);
    expect(destino(espia, 0).href).toBe(FICHA);
  });

  it('el 403 de Cloudflare es «bloqueado»', async () => {
    responder(estado(403));
    expect(await consultarFicha(FICHA)).toEqual({ ok: false, motivo: 'bloqueado' });
  });
});

describe('con clave de ZenRows', () => {
  beforeEach(() => {
    process.env.ZENROWS_API_KEY = 'clave-de-prueba';
  });

  it('pide la ficha a ZenRows, con navegador y proxy residencial, y no va directa', async () => {
    const espia = responder(pagina);
    const resultado = await consultarFicha(FICHA);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.ficha.notas.salida.length).toBeGreaterThan(0);
    expect(espia).toHaveBeenCalledTimes(1);

    const peticion = destino(espia, 0);
    expect(peticion.origin).toBe('https://api.zenrows.com');
    expect(peticion.searchParams.get('apikey')).toBe('clave-de-prueba');
    expect(peticion.searchParams.get('url')).toBe(FICHA);
    expect(peticion.searchParams.get('js_render')).toBe('true');
    expect(peticion.searchParams.get('premium_proxy')).toBe('true');
  });

  it('si ZenRows no la consigue, prueba la directa', async () => {
    const espia = responder(estado(422), pagina);
    const resultado = await consultarFicha(FICHA);

    expect(resultado.ok).toBe(true);
    expect(espia).toHaveBeenCalledTimes(2);
    expect(destino(espia, 1).href).toBe(FICHA);
  });

  it.each([401, 402, 403])(
    'un %i de ZenRows, con la directa bloqueada, se cuenta como problema de la clave',
    async (status) => {
      responder(estado(status), estado(403));
      expect(await consultarFicha(FICHA)).toEqual({ ok: false, motivo: 'lector-rechazado' });
    },
  );

  it('una pagina sin ficha no se da por buena', async () => {
    responder(
      () => new Response('<html><title>Just a moment...</title></html>', { status: 200 }),
      estado(403),
    );
    expect(await consultarFicha(FICHA)).toEqual({ ok: false, motivo: 'sin-datos' });
  });

  it('a ZenRows solo le llegan fichas de Fragrantica', async () => {
    const espia = responder(pagina);
    expect(await consultarFicha('https://ejemplo.com/perfume/A/B-1.html')).toEqual({
      ok: false,
      motivo: 'url-no-valida',
    });
    expect(espia).not.toHaveBeenCalled();
  });
});
