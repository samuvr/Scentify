/**
 * Zona horaria del usuario: de ella salen «hoy» y si ahora es de dia o de
 * noche. Con amigos en otras zonas, fijar Europe/Madrid ponia la fecha de
 * ayer o de mañana en sus registros.
 *
 * El navegador la sabe mejor que nadie (es la del reloj del movil) y la deja
 * en una cookie; sin ella se usa la que Vercel deduce de la IP, y sin esa, la
 * de la app.
 */
export const COOKIE_ZONA = 'scentify_zona';
export const ZONA_POR_DEFECTO = 'Europe/Madrid';

/** La zona si es un nombre IANA que el motor entiende; null si no. */
export function zonaValida(zona: string | null | undefined): string | null {
  if (!zona || zona.length > 64) return null;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zona });
    return zona;
  } catch {
    return null;
  }
}

/** Primera zona valida de la lista, o la de la app. */
export function elegirZona(...candidatas: (string | null | undefined)[]): string {
  for (const candidata of candidatas) {
    const valida = zonaValida(candidata);
    if (valida) return valida;
  }
  return ZONA_POR_DEFECTO;
}

/** Fecha 'YYYY-MM-DD' en una zona. */
export function fechaEnZona(zona: string, ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona }).format(ahora);
}
