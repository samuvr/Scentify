/**
 * Asistente — el bucle con la API de Claude.
 *
 * La coleccion va en las instrucciones, no detras de una herramienta: casi
 * todas las preguntas la necesitan y asi se ahorra una vuelta. Va cacheada,
 * de modo que las preguntas siguientes de la misma conversacion la leen de la
 * cache. El tiempo y el historial si son herramientas, porque solo hacen falta
 * a veces y dependen de lo que se pregunte.
 */
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod/v4';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { crearDb, schema } from '@/db';
import {
  contextoDelDia,
  diaDeLaSemana,
  fechaConsultable,
  INSTRUCCIONES,
  type EventoAsistente,
  type MensajeConversacion,
} from '@/dominio/asistente';
import { calcularEstacionEfectiva } from '@/dominio/estacion';
import { leerConfiguracion } from './ajustes';
import { claudeDisponible, MODELO, opcionesFallback } from './claude';
import { geocodificar, previsionSinCache } from './clima';
import { exportarColeccionIa } from './datos';

/** Tope de vueltas por pregunta: con dos herramientas no deberia hacer falta mas. */
const MAXIMO_ITERACIONES = 8;

export const asistenteDisponible = claudeDisponible;

const MOMENTOS = { dia: 'DIA', noche: 'NOCHE' } as const;

function herramientas(userId: string, hoy: string, emitir: (e: EventoAsistente) => void) {
  const previsionTiempo = betaZodTool({
    name: 'prevision_tiempo',
    description:
      'Temperatura máxima y mínima y humedad media de un día, y las estaciones de la colección que encajan con ese tiempo. Sin lugar, usa la ubicación habitual. Hasta 15 días vista.',
    inputSchema: z.object({
      fecha: z.string().describe('Día en formato YYYY-MM-DD'),
      lugar: z.string().optional().describe('Ciudad, si no es la ubicación habitual'),
      momento: z.enum(['dia', 'noche']).optional().describe('Si será de día o de noche; por defecto, día'),
    }),
    run: async ({ fecha, lugar, momento }) => {
      if (!fechaConsultable(fecha, hoy)) {
        return JSON.stringify({ error: 'Solo hay previsión hasta 15 días vista.' });
      }
      emitir({ tipo: 'herramienta', descripcion: `Mirando el tiempo${lugar ? ` en ${lugar}` : ''}…` });

      const { ubicacion: habitual, umbrales } = await leerConfiguracion(userId);
      const ubicacion = lugar ? await geocodificar(lugar) : habitual;
      if (!ubicacion) return JSON.stringify({ error: `No encuentro «${lugar}».` });

      const clima = await previsionSinCache(ubicacion, fecha);
      if (!clima) return JSON.stringify({ error: 'El servicio del tiempo no responde.' });

      const estacion = calcularEstacionEfectiva({
        fecha,
        momento: MOMENTOS[momento ?? 'dia'],
        clima,
        umbrales,
        etiquetaUbicacion: ubicacion.etiqueta,
      });
      return JSON.stringify({
        lugar: ubicacion.etiqueta,
        fecha,
        temperatura_max: clima.temperaturaMax,
        temperatura_min: clima.temperaturaMin,
        humedad_media: clima.humedadMedia ?? null,
        estaciones_que_encajan: estacion.estaciones.map((e) => e.toLowerCase()),
        explicacion: estacion.explicacion,
      });
    },
  });

  const historialDeUsos = betaZodTool({
    name: 'historial_de_usos',
    description:
      'Lo que se ha puesto cada día entre dos fechas (incluidas): perfume, momento, contexto, nota del día y comentario. Máximo 100 registros, los más recientes.',
    inputSchema: z.object({
      desde: z.string().describe('YYYY-MM-DD'),
      hasta: z.string().describe('YYYY-MM-DD'),
    }),
    run: async ({ desde, hasta }) => {
      emitir({ tipo: 'herramienta', descripcion: 'Repasando tu historial…' });
      const u = schema.uso;
      const filas = await crearDb()
        .select({
          fecha: u.fecha,
          perfume: schema.ficha.nombre,
          marca: schema.ficha.marca,
          momento: u.momento,
          contexto: schema.contexto.nombre,
          valoracion_dia: u.valoracionDia,
          comentario: u.comentario,
        })
        .from(u)
        .innerJoin(schema.perfume, eq(schema.perfume.id, u.perfumeId))
        .innerJoin(schema.ficha, eq(schema.ficha.id, schema.perfume.fichaId))
        .innerJoin(schema.contexto, eq(schema.contexto.id, u.contextoId))
        .where(and(eq(u.userId, userId), gte(u.fecha, desde), lte(u.fecha, hasta)))
        .orderBy(asc(u.fecha));
      return JSON.stringify(filas.slice(-100));
    },
  });

  // Las entradas son minimas, pero con streaming se piden sin buffer: el
  // runner las valida contra el esquema antes de llamar a `run`.
  return [previsionTiempo, historialDeUsos].map((h) => ({ ...h, eager_input_streaming: true }));
}

/**
 * Responde a la ultima pregunta de la conversacion. Llama a `emitir` con cada
 * trozo de texto y cada herramienta que usa, en el orden en que pasan.
 */
export async function responder(
  userId: string,
  mensajes: MensajeConversacion[],
  hoy: string,
  emitir: (e: EventoAsistente) => void,
): Promise<void> {
  const client = new Anthropic();
  const configuracion = await leerConfiguracion(userId);
  const coleccion = await exportarColeccionIa(
    userId,
    configuracion.ubicacionDetectada ? configuracion.ubicacion.etiqueta : null,
    hoy,
  );

  let runner = client.beta.messages.toolRunner({
    model: MODELO,
    max_tokens: 16000,
    output_config: { effort: 'medium' },
    ...opcionesFallback(),
    system: [
      { type: 'text', text: INSTRUCCIONES },
      {
        type: 'text',
        text: contextoDelDia(hoy, diaDeLaSemana(hoy), JSON.stringify(coleccion)),
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: herramientas(userId, hoy, emitir),
    messages: mensajes.map((m) => ({ role: m.rol, content: m.texto })),
    max_iterations: MAXIMO_ITERACIONES,
    stream: true,
  });

  // Una entrada de herramienta que no se pueda ni parsear rechaza la vuelta.
  // Se reintenta desde `runner.params`, que tiene la conversacion hasta la
  // ultima vuelta completa, asi que no se repite ninguna herramienta.
  class EntradaTruncada extends Error {}
  for (let intento = 0; ; intento++) {
    try {
      for await (const vuelta of runner) {
        for await (const evento of vuelta) {
          if (evento.type === 'content_block_delta' && evento.delta.type === 'text_delta') {
            emitir({ tipo: 'texto', texto: evento.delta.text });
          }
        }
        const mensaje = await vuelta.finalMessage();
        intento = 0;
        const pideHerramienta = mensaje.content.some((b) => b.type === 'tool_use');
        if (mensaje.stop_reason === 'max_tokens' && pideHerramienta) {
          throw new EntradaTruncada('Entrada de herramienta cortada por max_tokens');
        }
        if (mensaje.stop_reason === 'refusal') {
          emitir({ tipo: 'error', mensaje: 'Esa pregunta no la puedo responder.' });
          break;
        }
      }
      break;
    } catch (error) {
      if (error instanceof Anthropic.APIError || error instanceof EntradaTruncada || intento >= 2) {
        throw error;
      }
      runner = client.beta.messages.toolRunner({ ...runner.params });
    }
  }
}
