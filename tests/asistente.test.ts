/** Asistente: forma de la conversación y fechas consultables. */
import { describe, expect, it } from 'vitest';
import {
  diaDeLaSemana,
  esquemaConversacion,
  fechaConsultable,
  MAXIMO_MENSAJES,
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

  it('rechaza conversaciones que no acaban en pregunta, vacías o demasiado largas', () => {
    const acabaEnRespuesta = [
      { rol: 'user', texto: 'Hola' },
      { rol: 'assistant', texto: 'Hola' },
    ];
    expect(esquemaConversacion.safeParse({ mensajes: acabaEnRespuesta }).success).toBe(false);
    expect(esquemaConversacion.safeParse({ mensajes: [] }).success).toBe(false);
    expect(esquemaConversacion.safeParse({ mensajes: [{ rol: 'user', texto: '   ' }] }).success).toBe(false);
    const larga = Array.from({ length: MAXIMO_MENSAJES + 1 }, (_, i) => ({
      rol: i % 2 ? 'assistant' : 'user',
      texto: 'x',
    }));
    expect(esquemaConversacion.safeParse({ mensajes: larga }).success).toBe(false);
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
