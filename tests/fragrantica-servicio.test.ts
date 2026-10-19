/**
 * La consulta de una ficha contra un `fetch` falso: la peticion directa, la
 * que va a traves de ZenRows cuando hay clave, el respaldo cuando ZenRows
 * falla, y que el aviso diga cual de las dos cosas ha fallado. Los tests no
 * tocan la red.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consultarFicha, mensajeDeFallo, type ResultadoConsulta } from '@/servicios/fragrantica';

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
/** Un error de ZenRows, con su codigo en el cuerpo como lo manda su API. */
const error = (status: number, code = 'X001') => () =>
  new Response(JSON.stringify({ code, status, title: 'Error' }), { status });

/** La direccion pedida, para ver a donde ha ido cada peticion. */
const destino = (espia: ReturnType<typeof responder>, n: number) =>
  new URL(String(espia.mock.calls[n]?.[0]));

/** El aviso que vera el usuario para un fallo. */
function aviso(resultado: ResultadoConsulta): string {
  if (resultado.ok) throw new Error('se esperaba un fallo');
  return mensajeDeFallo(resultado);
}

let avisosDelLog: ReturnType<typeof vi.spyOn>;
let trazasDelLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  delete process.env.ZENROWS_API_KEY;
  avisosDelLog = vi.spyOn(console, 'warn').mockImplementation(() => {});
  trazasDelLog = vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

  it('el 403 de Cloudflare es «bloqueado», y el aviso dice que falta la clave', async () => {
    responder(() => new Response('', { status: 403 }));
    const resultado = await consultarFicha(FICHA);

    expect(resultado).toMatchObject({ ok: false, motivo: 'bloqueado', conLector: false });
    expect(aviso(resultado)).toContain('ZENROWS_API_KEY');
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

  it('espera a que Vue pinte los votos, sin el wait_for de primer nivel que tira la pagina', async () => {
    const espia = responder(pagina);
    await consultarFicha(FICHA);

    const peticion = destino(espia, 0);
    expect(peticion.searchParams.has('wait_for')).toBe(false);
    expect(peticion.searchParams.has('wait')).toBe(false);
    expect(JSON.parse(peticion.searchParams.get('js_instructions') ?? 'null')).toEqual([
      { wait_for: 'div[index] span.tabular-nums' },
      { wait: 1000 },
    ]);
  });

  it('si ZenRows rechaza la espera con un 400, repite sin ella antes de rendirse', async () => {
    const espia = responder(error(400, 'REQS004'), pagina);
    const resultado = await consultarFicha(FICHA);

    expect(resultado.ok).toBe(true);
    expect(espia).toHaveBeenCalledTimes(2);
    const segunda = destino(espia, 1);
    expect(segunda.origin).toBe('https://api.zenrows.com');
    expect(segunda.searchParams.has('js_instructions')).toBe(false);
    expect(segunda.searchParams.get('wait')).toBe('2000');
  });

  it('deja en el log una linea por lectura, con lo que ha sacado y sin la clave', async () => {
    responder(pagina);
    await consultarFicha(FICHA);

    const linea = trazasDelLog.mock.calls.flat().join(' ');
    expect(linea).toContain(FICHA);
    expect(linea).not.toContain('clave-de-prueba');
    const datos = JSON.parse(String(trazasDelLog.mock.calls[0]?.at(-1)));
    expect(datos).toMatchObject({ votosSinPintar: false, items: 6, recuentos: 6, acordes: 10 });
    expect(datos.estaciones).toContain('INVIERNO:2300');
  });

  it('si ZenRows no la consigue, prueba la directa', async () => {
    const espia = responder(error(422, 'RESP001'), pagina);
    const resultado = await consultarFicha(FICHA);

    expect(resultado.ok).toBe(true);
    expect(espia).toHaveBeenCalledTimes(2);
    expect(destino(espia, 1).href).toBe(FICHA);
  });

  it('si fallan las dos, el aviso cuenta lo que ha dicho ZenRows, no que falta la clave', async () => {
    responder(error(422, 'RESP001'), () => new Response('', { status: 403 }));
    const resultado = await consultarFicha(FICHA);

    expect(resultado).toMatchObject({
      ok: false,
      motivo: 'bloqueado',
      conLector: true,
      detalle: 'ZenRows 422 RESP001',
    });
    expect(aviso(resultado)).toContain('Ni a través de ZenRows');
    expect(aviso(resultado)).toContain('(ZenRows 422 RESP001)');
    expect(aviso(resultado)).not.toContain('ZENROWS_API_KEY');
  });

  it('un 403 BLK0001 es un bloqueo pasajero de ZenRows, no la clave', async () => {
    responder(error(403, 'BLK0001'), () => new Response('', { status: 403 }));
    const resultado = await consultarFicha(FICHA);

    expect(resultado).toMatchObject({ motivo: 'sin-respuesta', detalle: 'ZenRows 403 BLK0001' });
    expect(aviso(resultado)).not.toContain('revisa la clave');
  });

  it.each([401, 402, 403])('un %i de ZenRows se cuenta como problema de la clave', async (status) => {
    responder(error(status, 'AUTH001'), () => new Response('', { status: 403 }));
    const resultado = await consultarFicha(FICHA);

    expect(resultado).toMatchObject({
      ok: false,
      motivo: 'lector-rechazado',
      detalle: `ZenRows ${status} AUTH001`,
    });
    expect(aviso(resultado)).toContain('revisa la clave');
  });

  it('se agota el tiempo: lo dice el detalle, y no se gasta lo que queda en la directa', async () => {
    const agotado = new DOMException('The operation timed out.', 'TimeoutError');
    const espia = vi.fn().mockRejectedValueOnce(agotado);
    vi.stubGlobal('fetch', espia);

    const resultado = await consultarFicha(FICHA);
    expect(resultado).toMatchObject({ motivo: 'sin-respuesta', detalle: 'ZenRows, sin respuesta en 100 s' });
    expect(espia).toHaveBeenCalledTimes(1);
  });

  it('si la conexion se corta leyendo la pagina, es un fallo previsto y no una excepcion', async () => {
    const cortada = new Response(
      new ReadableStream({
        start(control) {
          control.error(new TypeError('terminated'));
        },
      }),
      { status: 200 },
    );
    responder(() => cortada, () => new Response('', { status: 403 }));

    await expect(consultarFicha(FICHA)).resolves.toMatchObject({ ok: false, motivo: 'sin-respuesta' });
  });

  it('un cuerpo de error sin codigo, o con algo raro, no se cuela en el aviso', async () => {
    responder(() => new Response('<html>Bad gateway</html>', { status: 502 }), () => new Response('', { status: 403 }));
    expect(await consultarFicha(FICHA)).toMatchObject({ motivo: 'sin-respuesta', detalle: 'ZenRows 502' });

    responder(error(422, '<script>alert(1)</script>'), () => new Response('', { status: 403 }));
    expect(await consultarFicha(FICHA)).toMatchObject({ detalle: 'ZenRows 422' });
  });

  it('una pagina sin ficha no se da por buena, y el detalle trae su titulo', async () => {
    responder(
      () => new Response('<html><title>Just a moment...</title></html>', { status: 200 }),
      () => new Response('', { status: 403 }),
    );
    const resultado = await consultarFicha(FICHA);

    expect(resultado).toMatchObject({ motivo: 'sin-datos', detalle: 'página «Just a moment...»' });
    expect(aviso(resultado)).toContain('no traía la ficha');
  });

  it('el fallo queda en el log del servidor, sin la clave', async () => {
    responder(error(422, 'RESP001'), () => new Response('', { status: 403 }));
    await consultarFicha(FICHA);

    const log = avisosDelLog.mock.calls.flat().join(' ');
    expect(log).toContain('ZenRows 422 RESP001');
    expect(log).not.toContain('clave-de-prueba');
  });

  it('a ZenRows solo le llegan fichas de Fragrantica', async () => {
    const espia = responder(pagina);
    const resultado = await consultarFicha('https://ejemplo.com/perfume/A/B-1.html');

    expect(resultado).toMatchObject({ ok: false, motivo: 'url-no-valida' });
    expect(aviso(resultado)).toBe('Esa URL no parece una ficha de Fragrantica.');
    expect(espia).not.toHaveBeenCalled();
  });
});
