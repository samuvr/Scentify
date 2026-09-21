/**
 * Normalizacion de texto, compartida por dos sitios que deben coincidir:
 *  - `nota.nombre_normalizado`, que deduplica el vocabulario de notas.
 *  - `perfume.busqueda_normalizada`, que hace la busqueda de la seccion 6.1
 *    insensible a acentos y mayusculas.
 */

/** Minusculas, sin acentos, sin espacios de sobra. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clave de busqueda de un perfume: nombre y marca juntos, ya normalizados. */
export function claveBusqueda(nombre: string, marca: string): string {
  return normalizar(`${nombre} ${marca}`);
}

/** La busqueda no arranca hasta el tercer caracter (seccion 6.1). */
export const MINIMO_CARACTERES_BUSQUEDA = 3;
