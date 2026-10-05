/**
 * El bucle del asistente contra un servidor falso de la API: comprueba lo que
 * se manda (modelo, fallback, coleccion cacheada en las instrucciones) y que
 * el texto en streaming llega como eventos.
 */
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/servicios/ajustes', () => ({
  leerConfiguracion: async () => ({
    ubicacion: { lat: 40.4, lon: -3.7, etiqueta: 'Madrid' },
    ubicacionDetectada: true,
    umbrales: undefined,
  }),
}));
vi.mock('@/servicios/datos', () => ({
  exportarColeccionIa: async () => ({ coleccion: [{ nombre: 'Khamrah' }] }),
}));
vi.mock('@/db', () => ({ crearDb: () => ({}), schema: {} }));

const peticiones: { cabeceras: IncomingHttpHeaders; cuerpo: Record<string, unknown> }[] = [];

function sse(eventos: object[]): string {
  return eventos.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

const RESPUESTA = sse([
  {
    type: 'message_start',
    message: {
      id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [],
      stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 },
    },
  },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Ponte ' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '**Khamrah**.' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } },
  { type: 'message_stop' },
]);

let servidor: Server;

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (c) => (cuerpo += c));
    req.on('end', () => {
      peticiones.push({ cabeceras: req.headers, cuerpo: JSON.parse(cuerpo) });
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(RESPUESTA);
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, ok));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = 'clave-de-prueba';
});

afterAll(() => {
  servidor.close();
  delete process.env.ANTHROPIC_BASE_URL;
  delete process.env.ANTHROPIC_API_KEY;
});

describe('bucle del asistente', () => {
  it('manda la colección cacheada y devuelve el texto en eventos', async () => {
    const { responder } = await import('@/servicios/asistente');
    const eventos: unknown[] = [];
    await responder('usuario', [{ rol: 'user', texto: '¿Qué me pongo?' }], '2026-10-05', (e) =>
      eventos.push(e),
    );

    expect(eventos).toEqual([
      { tipo: 'texto', texto: 'Ponte ' },
      { tipo: 'texto', texto: '**Khamrah**.' },
    ]);

    expect(peticiones).toHaveLength(1);
    const [{ cabeceras, cuerpo }] = peticiones as [(typeof peticiones)[number]];
    expect(cabeceras['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
    expect(cuerpo).toMatchObject({
      model: 'claude-opus-5-5',
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      stream: true,
      messages: [{ role: 'user', content: '¿Qué me pongo?' }],
    });
    const system = cuerpo.system as { text: string; cache_control?: unknown }[];
    expect(system[1]?.text).toContain('Hoy es lunes, 2026-10-05');
    expect(system[1]?.text).toContain('Khamrah');
    expect(system[1]?.cache_control).toEqual({ type: 'ephemeral' });
    const tools = cuerpo.tools as { name: string; eager_input_streaming?: boolean }[];
    expect(tools.map((t) => t.name)).toEqual(['prevision_tiempo', 'historial_de_usos']);
    expect(tools.every((t) => t.eager_input_streaming)).toBe(true);
  });
});
