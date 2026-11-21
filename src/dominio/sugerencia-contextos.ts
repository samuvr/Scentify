/**
 * Sugerencia de contextos al dar de alta un perfume.
 *
 * No llama a ninguna API: arma un prompt con todo lo que hace falta (el
 * perfume, sus notas y familias, y mis contextos) para copiarlo y pegarlo en
 * una conversacion de la app de Claude. Asi la opinion sale de la suscripcion
 * y no gasta tokens de la API. Lo que conteste se lee alli y los contextos se
 * marcan a mano aqui.
 *
 * Funcion pura: lo que se escribe en el formulario entra por parametro.
 */

export type NivelNota = 'SALIDA' | 'CORAZON' | 'FONDO';

export interface PerfumeParaSugerencia {
  nombre: string;
  marca: string;
  concentracion?: string;
  anio?: string;
  notas: { nombre: string; nivel: NivelNota }[];
  familias: string[];
  /** Si se tiene, la ficha de Fragrantica: le ahorra buscar la pagina. */
  fragranticaUrl?: string;
}

const NIVELES: Record<NivelNota, string> = {
  SALIDA: 'salida',
  CORAZON: 'corazón',
  FONDO: 'fondo',
};

export const INSTRUCCIONES_SUGERENCIA = `Eres un experto en perfumería y me ayudas a clasificar los perfumes de mi colección personal.

Te doy un perfume (nombre, marca, notas y familias) y la lista de contextos de uso que tengo definidos. Quiero tu opinión sobre cada uno de esos contextos: si el perfume encaja o no, y por qué.

Antes de decidir, busca en internet opiniones de la gente sobre ese perfume concreto (Fragrantica, Parfumo, Basenotes, Reddit, reseñas en vídeo o blogs): proyección, estela, duración, si se considera seguro para la oficina, si cansa en espacios cerrados, si es de cita, si funciona con calor o haciendo deporte. Si no encuentras nada fiable, decide solo por las notas y dilo.

Criterios:
- Los contextos describen entorno social y formalidad, no la hora del día ni la estación: no los uses para decir «de noche» o «de verano».
- Valora todos los contextos de la lista, una vez cada uno, también los que no recomiendas: quiero saber por qué no.
- Sé selectivo con los que encajan: normalmente entre uno y tres. Un perfume muy intenso o dulce rara vez es de oficina o gimnasio; uno fresco y discreto rara vez es de gala.`;

const FORMATO_RESPUESTA = `Responde en castellano con este formato:

Resumen: dos frases como mucho sobre el carácter del perfume y lo que dice la gente.

✓ Lo recomiendo para:
- <contexto>: <motivo en una frase, con notas u opiniones concretas>

✗ No lo recomiendo para:
- <contexto>: <motivo en una frase>

Contextos a marcar: <los que recomiendas, separados por comas, escritos tal cual aparecen en mi lista>`;

/** El prompt entero, listo para pegar en una conversacion nueva. */
export function promptSugerencia(perfume: PerfumeParaSugerencia, contextos: string[]): string {
  const lineasNotas = (['SALIDA', 'CORAZON', 'FONDO'] as const)
    .map((nivel) => {
      const notas = perfume.notas.filter((n) => n.nivel === nivel).map((n) => n.nombre.trim());
      return notas.length > 0 ? `- ${NIVELES[nivel]}: ${notas.join(', ')}` : null;
    })
    .filter(Boolean);

  const concentracion = perfume.concentracion?.trim();
  const anio = perfume.anio?.trim();
  const detalles = [concentracion, anio].filter(Boolean).join(', ');
  const url = perfume.fragranticaUrl?.trim();

  return [
    INSTRUCCIONES_SUGERENCIA,
    '',
    '## El perfume',
    `${perfume.nombre.trim()} de ${perfume.marca.trim()}${detalles ? ` (${detalles})` : ''}`,
    url ? `Ficha de Fragrantica: ${url}` : null,
    lineasNotas.length > 0 ? `Notas:\n${lineasNotas.join('\n')}` : 'Notas: no las tengo; búscalas.',
    perfume.familias.length > 0 ? `Familias: ${perfume.familias.join(', ')}` : null,
    '',
    '## Mis contextos',
    ...contextos.map((c) => `- ${c}`),
    '',
    FORMATO_RESPUESTA,
  ]
    .filter((linea) => linea !== null)
    .join('\n');
}
