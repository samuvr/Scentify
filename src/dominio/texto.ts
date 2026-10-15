/**
 * Normalizacion de texto, compartida por dos sitios que deben coincidir:
 *  - `nota.nombre_normalizado`, que deduplica el vocabulario de notas.
 *  - `ficha.busqueda_normalizada`, que hace la busqueda de la seccion 6.1
 *    insensible a acentos y mayusculas, y es la clave que evita dar de alta
 *    dos veces la misma ficha.
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

/**
 * Las palabras sueltas de una busqueda, ya normalizadas. Cada una tiene que
 * aparecer en la clave, en cualquier orden: «lattafa khamrah» encuentra
 * «Khamrah Lattafa», y «9 pm», «9PM».
 */
export function palabrasDeBusqueda(texto: string): string[] {
  return normalizar(texto).split(' ').filter(Boolean);
}

/** Si una clave de busqueda contiene todas las palabras de la consulta. */
export function coincideBusqueda(clave: string, consulta: string): boolean {
  const palabras = palabrasDeBusqueda(consulta);
  // «9 pm» busca «9» y «pm», pero «9pm» tambien tiene que encontrar «9 PM»:
  // se compara ademas contra la clave sin espacios.
  const compacta = clave.replace(/ /g, '');
  return palabras.length > 0 && palabras.every((p) => clave.includes(p) || compacta.includes(p));
}
