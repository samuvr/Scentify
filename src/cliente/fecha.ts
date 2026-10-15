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
