/**
 * Recordatorio de copias. La unica copia de la cuenta es la que se descarga a
 * mano desde Datos, y nada decia cuando fue la ultima.
 */

/** Pasado esto sin copia, Más avisa. */
export const DIAS_PARA_AVISAR = 30;

/** Dias enteros desde la ultima copia (null si nunca se ha hecho). */
export function diasDesdeCopia(ultima: string | null, ahora = new Date()): number | null {
  if (!ultima) return null;
  const t = Date.parse(ultima);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((ahora.getTime() - t) / 86_400_000));
}

export function textoUltimaCopia(dias: number | null): string {
  if (dias === null) return 'Todavía no has descargado ninguna copia completa.';
  if (dias === 0) return 'Última copia completa: hoy.';
  if (dias === 1) return 'Última copia completa: ayer.';
  return `Última copia completa: hace ${dias} días.`;
}

export function tocaCopia(dias: number | null): boolean {
  return dias === null || dias >= DIAS_PARA_AVISAR;
}
