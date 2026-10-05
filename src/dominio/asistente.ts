/**
 * Asistente: preguntarle a Claude por la coleccion sin salir de la app.
 *
 * Aqui va lo que no depende ni de la red ni de la base de datos: la forma de
 * la conversacion que manda el navegador, los eventos que vuelven y el texto
 * de las instrucciones. El bucle con la API vive en `servicios/asistente.ts`.
 */
import { z } from 'zod';

/** Lo justo para que una conversacion larga no se coma el presupuesto. */
export const MAXIMO_MENSAJES = 40;
export const MAXIMO_CARACTERES_MENSAJE = 4000;

/**
 * El navegador guarda la conversacion como texto plano y la reenvia entera en
 * cada pregunta. Las llamadas a herramientas de turnos anteriores no viajan:
 * su resultado ya esta contado en la respuesta que se dio entonces.
 */
export const esquemaConversacion = z.object({
  mensajes: z
    .array(
      z.object({
        rol: z.enum(['user', 'assistant']),
        texto: z.string().trim().min(1).max(MAXIMO_CARACTERES_MENSAJE),
      }),
    )
    .min(1)
    .max(MAXIMO_MENSAJES)
    .refine((m) => m[0]?.rol === 'user' && m[m.length - 1]?.rol === 'user', {
      message: 'La conversación empieza y acaba con una pregunta.',
    }),
});

export type MensajeConversacion = z.infer<typeof esquemaConversacion>['mensajes'][number];

/** Lo que el servidor manda al navegador, una linea JSON por evento. */
export type EventoAsistente =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'herramienta'; descripcion: string }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'fin' };

/**
 * Las instrucciones fijas. No llevan nada que cambie entre peticiones (ni la
 * fecha ni la coleccion), para que se puedan cachear tal cual.
 */
export const INSTRUCCIONES = `Eres el asistente de perfumería de Scentify, una app donde la persona lleva su colección de perfumes y un diario de lo que se pone cada día.

Respondes en castellano, con el tono de alguien que sabe de perfumes y conoce bien esta colección. Sé concreto: cuando recomiendes, nombra perfumes de la colección y explica en una frase por qué encajan (notas, familias, cómo los ha valorado, cuándo se los puso por última vez). Si la pregunta es sobre comprar, puedes sugerir perfumes fuera de la colección, pero dilo claramente.

Al final de estas instrucciones tienes la fecha de hoy, la ubicación habitual y la colección en JSON; el campo «acerca_de» explica cada campo. Las estaciones, momentos y contextos son marcas de la propia persona, así que pesan más que la opinión general sobre un perfume.

Tienes dos herramientas:
- prevision_tiempo: temperatura y humedad de un día en un lugar, y qué estaciones de la colección encajan con ese tiempo según los umbrales de la persona. Úsala cuando la pregunta dependa del tiempo («este sábado», «en la boda», «mañana en Madrid»). Resuelve tú las fechas relativas a partir de la fecha de hoy.
- historial_de_usos: lo que se ha puesto día a día en un rango de fechas. Úsala para preguntas sobre hábitos o para no repetir lo de los últimos días.

Si algo no está en los datos, dilo en vez de suponerlo. Usa listas cortas y negritas para los nombres de perfume; nada de tablas largas.`;

/** El bloque que cambia: fecha, ubicacion y coleccion. Va despues de las instrucciones. */
export function contextoDelDia(hoy: string, diaSemana: string, coleccionJson: string): string {
  return `Hoy es ${diaSemana}, ${hoy}.\n\nColección:\n${coleccionJson}`;
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Dia de la semana de una fecha YYYY-MM-DD, sin depender de la zona horaria. */
export function diaDeLaSemana(iso: string): string {
  return DIAS[new Date(`${iso}T12:00:00Z`).getUTCDay()] ?? '';
}

/**
 * La prevision de Open-Meteo llega a 16 dias vista y el archivo cubre el
 * pasado. Fuera de eso no hay dato que dar.
 */
export const DIAS_MAX_PREVISION = 15;

export function fechaConsultable(iso: string, hoy: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(Date.parse(`${iso}T00:00:00Z`))) return false;
  const dias = (Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000;
  return dias <= DIAS_MAX_PREVISION;
}
