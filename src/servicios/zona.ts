/** La zona horaria de la peticion en curso (ver `src/dominio/zona.ts`). */
import 'server-only';
import { cookies, headers } from 'next/headers';
import { COOKIE_ZONA, elegirZona, ZONA_POR_DEFECTO } from '@/dominio/zona';

export async function zonaDelUsuario(): Promise<string> {
  try {
    const [galletas, cabeceras] = await Promise.all([cookies(), headers()]);
    return elegirZona(galletas.get(COOKIE_ZONA)?.value, cabeceras.get('x-vercel-ip-timezone'));
  } catch {
    // Fuera de una peticion (scripts, tests) no hay cookies ni cabeceras.
    return ZONA_POR_DEFECTO;
  }
}
