/**
 * Sugerencia de contextos al dar de alta un perfume.
 *
 * Claude mira las notas y busca en internet que dice la gente del perfume, y
 * opina de CADA uno de mis contextos: si encaja o no, y por que. Es una
 * propuesta, como los votos de Fragrantica: lo que encaja se ve marcado y se
 * cambia a mano; no se guarda nada aparte.
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

export interface ValoracionContexto {
  id: string;
  nombre: string;
  encaja: boolean;
  motivo: string;
}

export interface SugerenciaContextos {
  /** Una por contexto, en el orden de los contextos de la persona. */
  valoraciones: ValoracionContexto[];
  resumen: string;
}

/** Los contextos que la propuesta marcaria. */
export function contextosQueEncajan(sugerencia: SugerenciaContextos): string[] {
  return sugerencia.valoraciones.filter((v) => v.encaja).map((v) => v.id);
}

/** Nombre de la herramienta con la que Claude entrega la propuesta. */
export const HERRAMIENTA_PROPUESTA = 'proponer_contextos';

export const INSTRUCCIONES_SUGERENCIA = `Eres un experto en perfumería que ayuda a clasificar perfumes en una colección personal.

Te dan un perfume (nombre, marca, notas y familias) y la lista de contextos de uso que tiene definidos la persona. Tu trabajo es opinar de cada uno de esos contextos: si el perfume encaja o no, y por qué.

Antes de decidir, busca en internet opiniones de la gente sobre ese perfume concreto (Fragrantica, Parfumo, Basenotes, Reddit, reseñas en vídeo o blogs): proyección, estela, duración, si se considera seguro para la oficina, si cansa en espacios cerrados, si es de cita, si funciona con calor o haciendo deporte. Con dos o tres búsquedas basta. Si no encuentras nada fiable, decide solo por las notas y dilo en el resumen.

Criterios:
- Los contextos describen entorno social y formalidad, no la hora del día ni la estación: no los uses para decir «de noche» o «de verano».
- Valora todos los contextos de la lista, una vez cada uno y por su clave, también los que no recomiendas: la persona quiere saber por qué no.
- Sé selectivo con los que encajan: normalmente entre uno y tres. Un perfume muy intenso o dulce rara vez es de oficina o gimnasio; uno fresco y discreto rara vez es de gala.

Cuando termines, llama a la herramienta ${HERRAMIENTA_PROPUESTA} con tu valoración. Escribe los motivos y el resumen en castellano, cada motivo en una frase corta que mencione notas u opiniones concretas.`;

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
      valoraciones: {
        type: 'array',
        description: 'Una valoración por cada contexto de la lista, encaje o no.',
        items: {
          type: 'object',
          properties: {
            clave: { type: 'string', enum: contextos.map((c) => c.slug) },
            encaja: { type: 'boolean', description: 'Si lo recomiendas para este contexto.' },
            motivo: { type: 'string', description: 'Una frase: por qué encaja o por qué no.' },
          },
          required: ['clave', 'encaja', 'motivo'],
          additionalProperties: false,
        },
      },
      resumen: {
        type: 'string',
        description: 'Dos frases como mucho: carácter del perfume y qué dice la gente.',
      },
    },
    required: ['valoraciones', 'resumen'],
    additionalProperties: false,
  };
}

const esquemaEntrada = z.object({
  valoraciones: z.array(z.object({ clave: z.string(), encaja: z.boolean(), motivo: z.string() })),
  resumen: z.string(),
});

/**
 * Traduce la entrada de la herramienta a ids, en el orden de los contextos.
 * Descarta claves desconocidas y se queda con la primera de las repetidas en
 * vez de fallar; un contexto sin valorar simplemente no aparece.
 */
export function interpretarPropuesta(
  entrada: unknown,
  contextos: ContextoSugerible[],
): SugerenciaContextos | null {
  const analisis = esquemaEntrada.safeParse(entrada);
  if (!analisis.success) return null;

  const porClave = new Map<string, { encaja: boolean; motivo: string }>();
  for (const { clave, encaja, motivo } of analisis.data.valoraciones) {
    if (!porClave.has(clave)) porClave.set(clave, { encaja, motivo: motivo.trim() });
  }
  const valoraciones = contextos.flatMap((c) => {
    const valoracion = porClave.get(c.slug);
    return valoracion ? [{ id: c.id, nombre: c.nombre, ...valoracion }] : [];
  });
  return { valoraciones, resumen: analisis.data.resumen.trim() };
}
