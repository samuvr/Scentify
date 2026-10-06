/**
 * La llamada de la sugerencia contra un servidor falso de la API: lo que se
 * manda (busqueda web, herramienta estricta, fallback) y que se reanuda un
 * turno pausado por la busqueda.
 */
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const peticiones: { cabeceras: IncomingHttpHeaders; cuerpo: Record<string, unknown> }[] = [];

function mensaje(content: object[], stop_reason: string) {
  return {
    id: `msg_${peticiones.length}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5',
    content, stop_reason, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 },
  };
}

const RESPUESTAS = [
  mensaje(
    [{ type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'Khamrah review office' } }],
    'pause_turn',
  ),
  mensaje(
    [
      { type: 'text', text: 'Listo.' },
      {
        type: 'tool_use', id: 'toolu_1', name: 'proponer_contextos',
        input: {
          valoraciones: [
            { clave: 'oficina', encaja: false, motivo: 'Proyecta demasiado.' },
            { clave: 'cita', encaja: true, motivo: 'Dulce y con mucha estela.' },
          ],
          resumen: 'Gourmand potente.',
        },
      },
    ],
    'tool_use',
  ),
];

let servidor: Server;

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (c) => (cuerpo += c));
    req.on('end', () => {
      const respuesta = RESPUESTAS[peticiones.length];
      peticiones.push({ cabeceras: req.headers, cuerpo: JSON.parse(cuerpo) });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(respuesta));
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

describe('sugerencia de contextos con Claude', () => {
  it('busca en la web, reanuda la pausa y devuelve la propuesta con ids', async () => {
    const { sugerirContextos } = await import('@/servicios/sugerencia-contextos');
    const sugerencia = await sugerirContextos(
      { nombre: 'Khamrah', marca: 'Lattafa', notas: [], familias: [] },
      [
        { id: 'id-oficina', slug: 'oficina', nombre: 'Oficina' },
        { id: 'id-cita', slug: 'cita', nombre: 'Cita' },
      ],
    );

    expect(sugerencia).toEqual({
      valoraciones: [
        { id: 'id-oficina', nombre: 'Oficina', encaja: false, motivo: 'Proyecta demasiado.' },
        { id: 'id-cita', nombre: 'Cita', encaja: true, motivo: 'Dulce y con mucha estela.' },
      ],
      resumen: 'Gourmand potente.',
    });

    expect(peticiones).toHaveLength(2);
    const [primera, segunda] = peticiones as [(typeof peticiones)[number], (typeof peticiones)[number]];
    expect(primera.cabeceras['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
    expect(primera.cuerpo).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default' });
    const tools = primera.cuerpo.tools as { name: string; type?: string; strict?: boolean }[];
    expect(tools.map((t) => t.name)).toEqual(['web_search', 'proponer_contextos']);
    expect(tools[0]?.type).toBe('web_search_20260209');
    expect(tools[1]?.strict).toBe(true);

    // La reanudacion reenvia el turno pausado tal cual, sin un «continua».
    const mensajes = segunda.cuerpo.messages as { role: string }[];
    expect(mensajes.map((m) => m.role)).toEqual(['user', 'assistant']);
  });
});
