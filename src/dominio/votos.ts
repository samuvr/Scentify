/**
 * «Marcar según Fragrantica»: una propuesta de casillas a partir de los votos.
 *
 * Es solo un atajo para no marcar a mano lo que los votos ya dicen claro. Se
 * aplica con un boton, el usuario lo ve marcado y lo cambia si no esta de
 * acuerdo: la decision sigue siendo suya y los votos siguen sin guardarse
 * (5.3).
 *
 * Entran las opciones que se acercan a la mas votada, no las que pasan de un
 * porcentaje fijo: en las estaciones los votos se reparten entre cuatro y un
 * 35 % puede ser lo que mas destaca, mientras que en dia/noche un 35 % es
 * claramente la minoria.
 */
import type { VotoEje } from './fragrantica';

/** Una opcion entra si tiene al menos esta parte de los votos de la primera. */
export const PROPORCION_DE_LA_PRIMERA = 0.6;

export function masVotadas<C extends string>(eje: Record<C, VotoEje> | null | undefined): C[] {
  if (!eje) return [];
  const entradas = Object.entries(eje) as [C, VotoEje][];
  const maximo = Math.max(0, ...entradas.map(([, voto]) => voto.pct));
  if (maximo <= 0) return [];
  return entradas
    .filter(([, voto]) => voto.pct >= maximo * PROPORCION_DE_LA_PRIMERA)
    .map(([clave]) => clave);
}
