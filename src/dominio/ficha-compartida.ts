/**
 * Empaquetado de la ficha que viaja de «Compartir → Scentify» al formulario.
 *
 * Al compartir el texto de la pagina, el servidor ya la ha leido; lo que pasa
 * al formulario es el resultado, no los 17 kB de texto. Viaja en la
 * redireccion, asi que llega por la URL y lo puede escribir cualquiera: se
 * valida la forma antes de usarla. No es un dato sensible —solo rellena
 * campos que el usuario ve y confirma— pero un objeto de forma inesperada
 * romperia el formulario en tiempo de ejecucion, y eso si importa.
 */
import { z } from 'zod';
import type { FichaFragrantica } from './fragrantica';

const voto = z.object({
  votos: z.number().nullable(),
  anchura: z.number().nullable(),
  pct: z.number(),
});

const esquema = z.object({
  estaciones: z
    .object({
      PRIMAVERA: voto,
      VERANO: voto,
      OTONO: voto,
      INVIERNO: voto,
    })
    .nullable(),
  momentos: z.object({ DIA: voto, NOCHE: voto }).nullable(),
  notas: z.object({
    salida: z.array(z.string()),
    corazon: z.array(z.string()),
    fondo: z.array(z.string()),
  }),
  marca: z.string().nullable(),
  anio: z.number().nullable(),
  acordes: z.array(z.string()),
});

export function empaquetarFicha(ficha: FichaFragrantica): string {
  return Buffer.from(JSON.stringify(ficha), 'utf8').toString('base64url');
}

/** Devuelve null ante cualquier cosa que no sea una ficha bien formada. */
export function desempaquetarFicha(empaquetada: string | undefined): FichaFragrantica | null {
  if (!empaquetada) return null;
  try {
    const crudo: unknown = JSON.parse(Buffer.from(empaquetada, 'base64url').toString('utf8'));
    const resultado = esquema.safeParse(crudo);
    return resultado.success ? (resultado.data as FichaFragrantica) : null;
  } catch {
    return null;
  }
}
