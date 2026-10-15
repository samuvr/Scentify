/** Asistente: forma de la conversación y fechas consultables. */
import { describe, expect, it } from 'vitest';
import {
  diaDeLaSemana,
  esquemaConversacion,
  fechaConsultable,
  MAXIMO_CARACTERES_MENSAJE,
  MAXIMO_MENSAJES,
  ventanaDeConversacion,
} from '@/dominio/asistente';

describe('conversación del asistente', () => {
  it('acepta una pregunta suelta y una conversación que acaba en pregunta', () => {
    expect(esquemaConversacion.safeParse({ mensajes: [{ rol: 'user', texto: 'Hola' }] }).success).toBe(true);
    expect(
      esquemaConversacion.safeParse({
        mensajes: [
          { rol: 'user', texto: '¿Qué me pongo?' },
          { rol: 'assistant', texto: 'Khamrah.' },
          { rol: 'user', texto: '¿Y otro?' },
        ],
      }).success,
    ).toBe(true);
  });

  it('rechaza conversaciones que no acaban en pregunta o vacías', () => {
    const acabaEnRespuesta = [
      { rol: 'user', texto: 'Hola' },
      { rol: 'assistant', texto: 'Hola' },
    ];
    expect(esquemaConversacion.safeParse({ mensajes: acabaEnRespuesta }).success).toBe(false);
    expect(esquemaConversacion.safeParse({ mensajes: [] }).success).toBe(false);
    expect(esquemaConversacion.safeParse({ mensajes: [{ rol: 'user', texto: '   ' }] }).success).toBe(false);
  });

  it('una respuesta larga o muchas preguntas ya no bloquean la conversación', () => {
    // Antes, tras una respuesta de más de 4000 caracteres o 20 preguntas,
    // cualquier repregunta se rechazaba y el chat culpaba a la conexión.
    const larga = [
      ...Array.from({ length: MAXIMO_MENSAJES + 1 }, (_, i) => ({
        rol: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant',
        texto: i === 1 ? 'x'.repeat(MAXIMO_CARACTERES_MENSAJE + 1000) : `mensaje ${i}`,
      })),
    ];
    expect(larga.at(-1)?.rol).toBe('user');
    expect(esquemaConversacion.safeParse({ mensajes: larga }).success).toBe(true);
  });

  it('a Claude solo le llegan los últimos mensajes, empezando por una pregunta y recortados', () => {
    const mensajes = Array.from({ length: MAXIMO_MENSAJES + 3 }, (_, i) => ({
      rol: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant',
      texto: i === MAXIMO_MENSAJES + 1 ? 'y'.repeat(MAXIMO_CARACTERES_MENSAJE + 10) : `m${i}`,
    }));
    const ventana = ventanaDeConversacion(mensajes);
    expect(ventana.length).toBeLessThanOrEqual(MAXIMO_MENSAJES);
    expect(ventana[0]?.rol).toBe('user');
    expect(ventana.at(-1)).toEqual(mensajes.at(-1));
    expect(Math.max(...ventana.map((m) => m.texto.length))).toBeLessThanOrEqual(
      MAXIMO_CARACTERES_MENSAJE + 1,
    );
    expect(esquemaConversacion.safeParse({ mensajes: ventana }).success).toBe(true);
  });

  it('no deja colar otros roles', () => {
    expect(esquemaConversacion.safeParse({ mensajes: [{ rol: 'system', texto: 'x' }] }).success).toBe(false);
  });
});

describe('fechas', () => {
  it('sabe qué día de la semana es', () => {
    expect(diaDeLaSemana('2026-10-05')).toBe('lunes');
    expect(diaDeLaSemana('2026-10-10')).toBe('sábado');
  });

  it('solo consulta la previsión hasta 15 días vista', () => {
    expect(fechaConsultable('2026-10-10', '2026-10-05')).toBe(true);
    expect(fechaConsultable('2026-10-20', '2026-10-05')).toBe(true);
    expect(fechaConsultable('2026-10-21', '2026-10-05')).toBe(false);
    expect(fechaConsultable('2026-09-01', '2026-10-05')).toBe(true);
    expect(fechaConsultable('el sábado', '2026-10-05')).toBe(false);
  });
});
