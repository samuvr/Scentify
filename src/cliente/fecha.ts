/**
 * El «hoy» del reloj del movil.
 *
 * Las pantallas se pintan con el `hoy` del servidor, y una PWA abierta desde
 * anoche lo tendria viejo: un registro por la mañana caeria en el dia
 * anterior. Lo que se guarda al pulsar se fecha con esto.
 */
import { elegirZona, fechaEnZona } from '@/dominio/zona';

export function hoySegunElMovil(): string {
  return fechaEnZona(elegirZona(Intl.DateTimeFormat().resolvedOptions().timeZone));
}

/**
 * El momento del dia segun el reloj del movil, con los mismos cortes que el
 * servidor (de noche desde las 18:00 y hasta las 05:00). Una PWA abierta por
 * la mañana y retomada por la tarde se repinta si ya no coincide.
 */
export function momentoSegunElMovil(ahora = new Date()): 'DIA' | 'NOCHE' {
  const hora = ahora.getHours();
  return hora >= 18 || hora < 5 ? 'NOCHE' : 'DIA';
}
