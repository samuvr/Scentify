/**
 * Sugerencia de contextos al dar de alta un perfume.
 *
 * Claude mira las notas y busca en internet que dice la gente del perfume, y
 * propone en cuales de MIS contextos encaja. Es una propuesta, como los votos
 * de Fragrantica: se ve marcada y se cambia a mano; no se guarda nada aparte.
 *
 * Aqui va lo que no depende de la red: lo que manda el navegador, el texto de
 * las instrucciones, el esquema de la respuesta y como se traduce a ids. La
 * llamada a la API vive en `servicios/sugerencia-contextos.ts`.
 */
import { z } from 'zod';

export const esquemaPeticionSugerencia = z.object({
  nombre: z.string().trim().min(1).max(200),
  marca: z.string().trim().min(1).max(200),
  concentracion: z.string().trim().max(20).optional(),
  notas: z
    .array(z.object({ nombre: z.string().trim().min(1).max(100), nivel: z.enum(['SALIDA', 'CORAZON', 'FONDO']) }))
    .max(80)
    .default([]),
  familias: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
});

export type PeticionSugerencia = z.infer<typeof esquemaPeticionSugerencia>;

export interface ContextoSugerible {
  id: string;
  slug: string;
  nombre: string;
}

export interface SugerenciaContextos {
  contextos: { id: string; nombre: string; motivo: string }[];
  resumen: string;
}

/** Nombre de la herramienta con la que Claude entrega la propuesta. */
export const HERRAMIENTA_PROPUESTA = 'proponer_contextos';

export const INSTRUCCIONES_SUGERENCIA = `Eres un experto en perfumería que ayuda a clasificar perfumes en una colección personal.

Te dan un perfume (nombre, marca, notas y familias) y la lista de contextos de uso que tiene definidos la persona. Tu trabajo es decidir en cuáles de esos contextos encaja el perfume.

Antes de decidir, busca en internet opiniones de la gente sobre ese perfume concreto (Fragrantica, Parfumo, Basenotes, Reddit, reseñas en vídeo o blogs): proyección, estela, duración, si se considera seguro para la oficina, si cansa en espacios cerrados, si es de cita, si funciona con calor o haciendo deporte. Con dos o tres búsquedas basta. Si no encuentras nada fiable, decide solo por las notas y dilo en el resumen.

Criterios:
- Los contextos describen entorno social y formalidad, no la hora del día ni la estación: no los uses para decir «de noche» o «de verano».
- Sé selectivo: marca solo los contextos donde el perfume encaja de verdad, normalmente entre uno y tres. Un perfume muy intenso o dulce rara vez es de oficina o gimnasio; uno fresco y discreto rara vez es de gala.
- Usa solo los contextos de la lista, por su clave.

Cuando termines, llama a la herramienta ${HERRAMIENTA_PROPUESTA} con tu propuesta. Escribe los motivos y el resumen en castellano, cada motivo en una frase corta que mencione notas u opiniones concretas.`;

const NIVELES: Record<PeticionSugerencia['notas'][number]['nivel'], string> = {
  SALIDA: 'salida',
  CORAZON: 'corazón',
  FONDO: 'fondo',
};

/** El mensaje con el perfume y los contextos de la persona. */
export function mensajeSugerencia(perfume: PeticionSugerencia, contextos: ContextoSugerible[]): string {
  const lineasNotas = (['SALIDA', 'CORAZON', 'FONDO'] as const)
    .map((nivel) => {
      const notas = perfume.notas.filter((n) => n.nivel === nivel).map((n) => n.nombre);
      return notas.length > 0 ? `- ${NIVELES[nivel]}: ${notas.join(', ')}` : null;
    })
    .filter(Boolean);

  return [
    `Perfume: ${perfume.nombre} de ${perfume.marca}${perfume.concentracion ? ` (${perfume.concentracion})` : ''}`,
    lineasNotas.length > 0 ? `Notas:\n${lineasNotas.join('\n')}` : 'Notas: sin indicar; búscalas.',
    perfume.familias.length > 0 ? `Familias: ${perfume.familias.join(', ')}` : null,
    '',
    'Contextos de la persona (clave: nombre):',
    ...contextos.map((c) => `- ${c.slug}: ${c.nombre}`),
  ]
    .filter((linea) => linea !== null)
    .join('\n');
}

/**
 * Esquema de la herramienta. Las claves van en un enum para que la API no
 * pueda devolver un contexto que no existe.
 */
export function esquemaPropuesta(contextos: ContextoSugerible[]) {
  return {
    type: 'object' as const,
    properties: {
      contextos: {
        type: 'array',
        description: 'Los contextos donde encaja, del más claro al menos claro.',
        items: {
          type: 'object',
          properties: {
            clave: { type: 'string', enum: contextos.map((c) => c.slug) },
            motivo: { type: 'string', description: 'Una frase: por qué encaja.' },
          },
          required: ['clave', 'motivo'],
          additionalProperties: false,
        },
      },
      resumen: {
        type: 'string',
        description: 'Dos frases como mucho: carácter del perfume y qué dice la gente.',
      },
    },
    required: ['contextos', 'resumen'],
    additionalProperties: false,
  };
}

const esquemaEntrada = z.object({
  contextos: z.array(z.object({ clave: z.string(), motivo: z.string() })),
  resumen: z.string(),
});

/**
 * Traduce la entrada de la herramienta a ids. Descarta claves desconocidas y
 * repetidas en vez de fallar: lo que quede sigue siendo una propuesta valida.
 */
export function interpretarPropuesta(
  entrada: unknown,
  contextos: ContextoSugerible[],
): SugerenciaContextos | null {
  const analisis = esquemaEntrada.safeParse(entrada);
  if (!analisis.success) return null;

  const porSlug = new Map(contextos.map((c) => [c.slug, c]));
  const vistos = new Set<string>();
  const elegidos: SugerenciaContextos['contextos'] = [];
  for (const { clave, motivo } of analisis.data.contextos) {
    const contexto = porSlug.get(clave);
    if (!contexto || vistos.has(contexto.id)) continue;
    vistos.add(contexto.id);
    elegidos.push({ id: contexto.id, nombre: contexto.nombre, motivo: motivo.trim() });
  }
  return { contextos: elegidos, resumen: analisis.data.resumen.trim() };
}
