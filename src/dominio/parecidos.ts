/**
 * «Esta fragancia me recuerda a»: los perfumes que los usuarios de
 * Fragrantica han votado como parecidos, con sus votos a favor y en contra.
 *
 * A diferencia de los votos de estacion y momento (5.3), esto si se guarda:
 * no es una ayuda para marcar casillas, es algo que se enseña en la ficha del
 * perfume. Ninguna logica decide con ello. Se guarda con fecha porque en
 * Fragrantica los votos siguen moviendose.
 *
 * Lo leido lo puede escribir cualquiera (el formulario, una copia subida a
 * mano, un enlace compartido), y la ficha es de todas las cuentas: un objeto
 * mal formado romperia la pagina a quien tenga el perfume. Por eso todo pasa
 * por estos esquemas antes de llegar a la base de datos.
 */
import { z } from 'zod';

/** Cuantos se guardan: los primeros del bloque, en el orden de Fragrantica. */
export const MAXIMO_PARECIDOS = 3;

export const esquemaParecido = z.object({
  nombre: z.string().min(1).max(200),
  /** Null si la ficha no la separa del nombre. */
  marca: z.string().max(200).nullable(),
  positivos: z.number().int().min(0),
  negativos: z.number().int().min(0),
});

export type Parecido = z.infer<typeof esquemaParecido>;

const esquemaParecidosLeidos = z.object({
  leidosEn: z.string().datetime(),
  perfumes: z.array(esquemaParecido).min(1).max(MAXIMO_PARECIDOS),
});

/** Lo que se guarda en `ficha.parecidos`. */
export type ParecidosLeidos = z.infer<typeof esquemaParecidosLeidos>;

/** Null ante cualquier cosa que no sea una lectura bien formada. */
export function parecidosValidos(crudo: unknown): ParecidosLeidos | null {
  const analisis = esquemaParecidosLeidos.safeParse(crudo);
  return analisis.success ? analisis.data : null;
}

/** Porcentaje de votos a favor sobre el total de ese perfume. Null sin votos. */
export function porcentajePositivo(parecido: Pick<Parecido, 'positivos' | 'negativos'>): number | null {
  const total = parecido.positivos + parecido.negativos;
  return total > 0 ? Math.round((100 * parecido.positivos) / total) : null;
}
